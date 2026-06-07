import { logger } from "../../utils/logger";
/**
 * 位置索引构建器
 * 负责构建文件内容的精确位置索引，用于后续的精确修改
 */

import { logDebugWithTag } from "../../utils/logger";
import { EnhancedDelimiterDetector } from "../../utils/simplifiedParser/EnhancedDelimiterDetector";
import type {
	BatchRange,
	CardBlock,
	ContentBlock,
	NonCardBlock,
	PositionIndex,
	UUIDDetectionResult,
} from "./types/sync-types";

export class PositionIndexBuilder {
	private delimiter: string;
	private startMarker: string;
	private endMarker: string;
	private detector: EnhancedDelimiterDetector;

	constructor(
		delimiter = "<->",
		startMarker = "<!-- Weave:start -->",
		endMarker = "<!-- Weave:end -->"
	) {
		this.delimiter = delimiter;
		this.startMarker = startMarker;
		this.endMarker = endMarker;
		this.detector = new EnhancedDelimiterDetector(delimiter);
	}

	/**
	 * 构建完整的位置索引
	 * @param content 文件内容
	 * @returns 位置索引对象
	 */
	buildIndex(content: string): PositionIndex | null {
		logDebugWithTag("PositionIndexBuilder", "开始构建位置索引");

		// 1. 查找批量范围标记
		const batchRange = this.findBatchRange(content);
		if (!batchRange) {
			logger.warn("[PositionIndexBuilder] ❌ 未找到批量范围标记");
			return null;
		}

		// 2. 提取批量范围内容
		const batchContent = content.substring(batchRange.contentStart, batchRange.contentEnd);

		// 3. 使用EnhancedDelimiterDetector分割所有块
		const allBlocks = this.detector.splitCardsRaw(batchContent);

		if (allBlocks.length === 0) {
			logger.warn("[PositionIndexBuilder] ❌ 批量范围内没有内容");
			return null;
		}

		// 4. 构建内容块索引
		const blocks: ContentBlock[] = [];
		const cards: CardBlock[] = [];
		const nonCards: NonCardBlock[] = [];

		let currentPosition = batchRange.contentStart;
		let currentLine = this.getLineNumber(content, batchRange.contentStart);

		for (let i = 0; i < allBlocks.length; i++) {
			const blockContent = allBlocks[i];
			const blockLines = blockContent.split("\n").length;

			// 计算块的位置
			const startPos = currentPosition;
			const endPos = currentPosition + blockContent.length;
			const startLine = currentLine;
			const endLine = currentLine + blockLines - 1;

			// 判断块类型
			const isFirstBlock = i === 0;
			const isLastBlock = i === allBlocks.length - 1;
			const isCardBlock = !isFirstBlock && !isLastBlock;

			if (isCardBlock) {
				// 卡片块
				const uuidResult = this.detectUUIDInBlock(blockContent, startPos);

				const cardBlock: CardBlock = {
					type: "card",
					index: i,
					startPos,
					endPos,
					content: blockContent,
					startLine,
					endLine,
					uuid: uuidResult.uuid,
					blockId: uuidResult.blockId,
					hasUUID: uuidResult.uuid !== null,
					uuidPosition: uuidResult.position,
					precedingDelimiterPos: this.findPrecedingDelimiterPos(content, startPos),
					followingDelimiterPos: this.findFollowingDelimiterPos(
						content,
						endPos,
						batchRange.contentEnd
					),
				};

				blocks.push(cardBlock);
				cards.push(cardBlock);
			} else {
				// 非卡片块
				const nonCardBlock: NonCardBlock = {
					type: "non-card",
					index: i,
					startPos,
					endPos,
					content: blockContent,
					startLine,
					endLine,
					isLeading: isFirstBlock,
					isTrailing: isLastBlock,
				};

				blocks.push(nonCardBlock);
				nonCards.push(nonCardBlock);
			}

			// 更新位置（块内容 + 分隔符 + 换行）
			currentPosition = endPos;
			if (!isLastBlock) {
				// 计算分隔符的长度（\n + delimiter + \n）
				currentPosition += 1 + this.delimiter.length + 1;
			}
			currentLine = endLine + 1;
		}

		const index: PositionIndex = {
			batchRange,
			blocks,
			cards,
			nonCards,
		};

		logDebugWithTag(
			"PositionIndexBuilder",
			`位置索引构建完成: ${blocks.length}个块, ${cards.length}张卡片, ${nonCards.length}个非卡片块`
		);

		return index;
	}

	/**
	 * 查找批量范围标记
	 * @param content 文件内容
	 * @returns 批量范围信息
	 */
	private findBatchRange(content: string): BatchRange | null {
		const startIndex = content.indexOf(this.startMarker);
		const endIndex = content.indexOf(this.endMarker);

		if (startIndex === -1 || endIndex === -1) {
			return null;
		}

		if (endIndex <= startIndex) {
			logger.error("[PositionIndexBuilder] 结束标记位于开始标记之前");
			return null;
		}

		const startMarkerEnd = startIndex + this.startMarker.length;

		// 查找标记后的第一个换行符
		let contentStart = startMarkerEnd;
		if (content[startMarkerEnd] === "\n") {
			contentStart = startMarkerEnd + 1;
		} else if (content[startMarkerEnd] === "\r" && content[startMarkerEnd + 1] === "\n") {
			contentStart = startMarkerEnd + 2;
		}

		const startLine = this.getLineNumber(content, startIndex);
		const endLine = this.getLineNumber(content, endIndex);

		return {
			startMarker: {
				line: startLine,
				char: startIndex,
				length: this.startMarker.length,
			},
			endMarker: {
				line: endLine,
				char: endIndex,
				length: this.endMarker.length,
			},
			contentStart,
			contentEnd: endIndex,
			fullRange: {
				start: startIndex,
				end: endIndex + this.endMarker.length,
			},
		};
	}

	/**
	 * 检测块中的UUID和BlockID
	 * @param blockContent 块内容
	 * @param blockStartPos 块起始位置
	 * @returns UUID检测结果
	 */
	private detectUUIDInBlock(blockContent: string, blockStartPos: number): UUIDDetectionResult {
		// 检测UUID：<!-- tk-xxxxxxxxxxxx -->
		const uuidPattern = /<!--\s*(tk-[23456789abcdefghjkmnpqrstuvwxyz]{12})\s*-->/;
		const uuidMatch = blockContent.match(uuidPattern);

		// 检测BlockID：^blockid
		const blockIdPattern = /\^([a-z0-9]+)/;
		const blockIdMatch = blockContent.match(blockIdPattern);

		let uuid: string | null = null;
		let blockId: string | null = null;
		let position: number | null = null;

		if (uuidMatch) {
			uuid = uuidMatch[1];
			position = blockStartPos + uuidMatch.index!;
		}

		if (blockIdMatch) {
			blockId = blockIdMatch[1];
		}

		return {
			uuid,
			blockId,
			position,
			validated: false, // 数据库验证将在UUIDManager中进行
		};
	}

	/**
	 * 查找前置分隔符位置
	 * @param content 完整内容
	 * @param blockStartPos 块起始位置
	 * @returns 分隔符位置
	 */
	private findPrecedingDelimiterPos(content: string, blockStartPos: number): number {
		// 向前搜索最近的分隔符
		const searchStart = Math.max(0, blockStartPos - 100);
		const searchContent = content.substring(searchStart, blockStartPos);
		const lastDelimiterIndex = searchContent.lastIndexOf(this.delimiter);

		if (lastDelimiterIndex === -1) {
			return searchStart; // 没找到，返回搜索起点
		}

		return searchStart + lastDelimiterIndex;
	}

	/**
	 * 查找后置分隔符位置
	 * @param content 完整内容
	 * @param blockEndPos 块结束位置
	 * @param rangeEnd 批量范围结束位置
	 * @returns 分隔符位置，如果没找到返回null
	 */
	private findFollowingDelimiterPos(
		content: string,
		blockEndPos: number,
		rangeEnd: number
	): number | null {
		// 向后搜索最近的分隔符
		const searchEnd = Math.min(content.length, blockEndPos + 100, rangeEnd);
		const searchContent = content.substring(blockEndPos, searchEnd);
		const delimiterIndex = searchContent.indexOf(this.delimiter);

		if (delimiterIndex === -1) {
			return null; // 最后一个块
		}

		return blockEndPos + delimiterIndex;
	}

	/**
	 * 获取指定位置所在的行号
	 * @param content 内容
	 * @param position 字符位置
	 * @returns 行号（从0开始）
	 */
	private getLineNumber(content: string, position: number): number {
		return content.substring(0, position).split("\n").length - 1;
	}
}
