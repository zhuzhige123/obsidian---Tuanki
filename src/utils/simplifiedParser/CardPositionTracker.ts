import { logger } from "../../utils/logger";
import { EnhancedDelimiterDetector } from "./EnhancedDelimiterDetector";
/**
 * 卡片位置跟踪器
 * 用于记录卡片在原文件中的精确位置，支持UUID精确插入
 */

/**
 * 带位置信息的卡片数据
 */
export interface CardWithPosition {
	/** 卡片内容（不含分隔符） */
	content: string;

	/** 起始行号（第一个 <-> 所在行，从0开始） */
	startLine: number;

	/** 结束行号（第二个 <-> 所在行，从0开始） */
	endLine: number;

	/** 起始字节偏移 */
	startOffset: number;

	/** 结束字节偏移 */
	endOffset: number;

	/** 完整原始内容（包含两个分隔符） */
	rawContent: string;

	/** 卡片索引（在所有卡片中的位置） */
	index: number;
}

/**
 * 卡片位置跟踪器
 * 负责分割卡片并记录每张卡片的精确位置
 */
export class CardPositionTracker {
	private delimiter: string;
	private detector: EnhancedDelimiterDetector;

	constructor(delimiter: string) {
		this.delimiter = delimiter;
		this.detector = new EnhancedDelimiterDetector(delimiter);
	}

	/**
	 * 分割卡片并记录位置信息
	 *
	 * 规则：
	 * 1. 分隔符必须独占一行（与 EnhancedDelimiterDetector 一致）
	 * 2. 相邻两个有效分隔符行之间的内容为一张卡片
	 * 3. 首段说明、单独尾部分隔符、行内分隔符文本不会产出卡片
	 * 4. 记录每张卡片的精确位置（行号和字节偏移）
	 */
	splitCardsWithPosition(content: string): CardWithPosition[] {
		const lines = content.split("\n");
		const delimiterLines = this.detector.findValidDelimiterLineIndices(content);
		const cards: CardWithPosition[] = [];

		if (delimiterLines.length < 2) {
			return cards;
		}

		const lineOffsets: number[] = [];
		let globalOffset = 0;
		for (const line of lines) {
			lineOffsets.push(globalOffset);
			globalOffset += line.length + 1;
		}

		for (let i = 0; i < delimiterLines.length - 1; i++) {
			const startDelimLine = delimiterLines[i];
			const endDelimLine = delimiterLines[i + 1];

			const cardContent = lines.slice(startDelimLine + 1, endDelimLine).join("\n");
			const rawContent = lines.slice(startDelimLine, endDelimLine + 1).join("\n");
			const startOffset = lineOffsets[startDelimLine];
			const endOffset = lineOffsets[endDelimLine] + lines[endDelimLine].length;

			cards.push({
				content: cardContent,
				startLine: startDelimLine,
				endLine: endDelimLine,
				startOffset,
				endOffset,
				rawContent,
				index: i,
			});
		}

		if (delimiterLines.length % 2 !== 0) {
			logger.debug(
				"[CardPositionTracker] 末尾存在未配对的分隔符行，已忽略（卡片必须前后各有一个 <->）"
			);
		}

		return cards;
	}

	/**
	 * 验证卡片内容是否有效
	 */
	isValidCardContent(content: string, minLength = 1): boolean {
		const trimmed = content.trim();
		return trimmed.length >= minLength;
	}

	/**
	 * 检查指定行是否为有效分隔符行
	 */
	isDelimiterLine(line: string, lineIndex: number, allLines: string[]): boolean {
		return this.detector.isValidDelimiterLine(line, lineIndex, allLines);
	}
}
