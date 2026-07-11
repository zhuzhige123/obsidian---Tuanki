import { logger } from "../../utils/logger";
/**
 * 增强的分隔符检测器
 *
 * 功能：
 * 1. 独占一行验证 - 只有完全独占一行的分隔符才会被识别
 * 2. 上下文排除 - 排除代码块、表格、数学公式块内的分隔符
 * 3. 内容验证 - 确保分隔符前后有有效内容
 *
 * 新分隔符设计：
 * - 卡片分隔符：<-> （必须独占一行）
 * - 范围标记：<!-- Weave:start --> / <!-- Weave:end -->
 */

export class EnhancedDelimiterDetector {
	private delimiter: string;

	constructor(delimiter = "<->") {
		this.delimiter = delimiter;
	}

	/**
	 * 检测一行是否为有效的卡片分隔符
	 *
	 * @param line - 当前行内容
	 * @param lineIndex - 行索引
	 * @param allLines - 所有行
	 * @returns 是否为有效分隔符
	 */
	isValidDelimiterLine(line: string, lineIndex: number, allLines: string[]): boolean {
		// 规则1：必须独占一行（去除首尾空白后完全匹配）
		const trimmed = line.trim();
		if (trimmed !== this.delimiter) {
			return false;
		}

		// 规则2：不在代码块中
		if (this.isInCodeBlock(lineIndex, allLines)) {
			return false;
		}

		// 规则3：不在表格中
		if (this.isInTable(lineIndex, allLines)) {
			return false;
		}

		// 规则4：不在数学公式块中
		if (this.isInMathBlock(lineIndex, allLines)) {
			return false;
		}

		return true;
	}

	/**
	 * 检查是否在代码块中
	 *
	 * @param lineIndex - 当前行索引
	 * @param lines - 所有行
	 * @returns 是否在代码块内
	 */
	private isInCodeBlock(lineIndex: number, lines: string[]): boolean {
		let inCodeBlock = false;

		for (let i = 0; i < lineIndex; i++) {
			const line = lines[i].trim();
			// 检测代码块标记（``` 或 ~~~）
			if (line.startsWith("```") || line.startsWith("~~~")) {
				inCodeBlock = !inCodeBlock;
			}
		}

		return inCodeBlock;
	}

	/**
	 * 检查是否在表格中
	 *
	 * @param lineIndex - 当前行索引
	 * @param lines - 所有行
	 * @returns 是否在表格内
	 */
	private isInTable(lineIndex: number, lines: string[]): boolean {
		// 简单检测：检查前后几行是否有表格标记（|）
		const checkRange = 3; // 检查前后3行
		const startIndex = Math.max(0, lineIndex - checkRange);
		const endIndex = Math.min(lines.length - 1, lineIndex + checkRange);

		for (let i = startIndex; i <= endIndex; i++) {
			const line = lines[i].trim();
			// 表格行包含 | 字符，且不是代码块
			if (line.includes("|") && !line.startsWith("```") && !line.startsWith("~~~")) {
				return true;
			}
		}

		return false;
	}

	/**
	 * 检查是否在数学公式块中
	 *
	 * @param lineIndex - 当前行索引
	 * @param lines - 所有行
	 * @returns 是否在数学公式块内
	 */
	private isInMathBlock(lineIndex: number, lines: string[]): boolean {
		let inMathBlock = false;

		for (let i = 0; i < lineIndex; i++) {
			const line = lines[i].trim();
			// 检测数学公式块标记（$$ 或 \[）
			if (line.startsWith("$$") || line.startsWith("\\[")) {
				inMathBlock = !inMathBlock;
			}
			if (line.endsWith("$$") || line.endsWith("\\]")) {
				inMathBlock = !inMathBlock;
			}
		}

		return inMathBlock;
	}

	/**
	 * 检查分隔符前后是否有有效内容
	 *
	 * @param lineIndex - 当前行索引
	 * @param lines - 所有行
	 * @returns 前后是否有内容
	 */
	private hasContentAround(lineIndex: number, lines: string[]): boolean {
		// 检查前面是否有内容
		let hasContentBefore = false;
		for (let i = lineIndex - 1; i >= 0; i--) {
			const line = lines[i].trim();
			// 跳过空行和分隔符行
			if (line.length > 0 && line !== this.delimiter) {
				hasContentBefore = true;
				break;
			}
		}

		// 检查后面是否有内容（可选，最后一张卡片后可以没有内容）
		// 这里我们只要求前面有内容即可

		return hasContentBefore;
	}

	/**
	 * 查找所有有效分隔符行索引
	 */
	findValidDelimiterLineIndices(content: string): number[] {
		const lines = content.split("\n");
		const indices: number[] = [];
		for (let i = 0; i < lines.length; i++) {
			if (this.isValidDelimiterLine(lines[i], i, lines)) {
				indices.push(i);
			}
		}
		return indices;
	}

	/**
	 * 按相邻分隔符行配对切分卡片（解析模式）
	 *
	 * 规则：只有被两个独占一行的分隔符夹住的内容才算一张卡片。
	 * 首段说明、单独尾部分隔符、行内出现的分隔符文本均不会产出卡片。
	 */
	splitCardsBetweenDelimiterLines(content: string): string[] {
		const lines = content.split("\n");
		const delimiterLines = this.findValidDelimiterLineIndices(content);

		if (delimiterLines.length < 2) {
			logger.debug(
				`[EnhancedDelimiterDetector] ❌ 分隔符不足 2 个（${delimiterLines.length}），无法配对卡片`
			);
			return [];
		}

		const cards: string[] = [];
		for (let i = 0; i < delimiterLines.length - 1; i++) {
			const startLine = delimiterLines[i];
			const endLine = delimiterLines[i + 1];
			const cardContent = lines.slice(startLine + 1, endLine).join("\n");
			cards.push(cardContent);
			logger.debug(
				`[EnhancedDelimiterDetector] ✅ 配对卡片 ${cards.length}（行 ${startLine + 2}-${
					endLine
				}）`
			);
		}

		logger.debug(
			`[EnhancedDelimiterDetector] 📦 配对模式结果：${delimiterLines.length} 个分隔符 → ${cards.length} 张卡片`
		);
		return cards;
	}

	/**
	 * 🆕 分割卡片（Raw模式 - 保留所有块，包括首尾）
	 *
	 * 用于内容操作场景，需要保持原文完整性，避免丢失首尾内容。
	 * 与 splitCardsEnhanced() 的区别：
	 * - splitCardsRaw(): 返回所有块（包括首尾），用于内容重建
	 * - splitCardsEnhanced(): 返回有效卡片（不包括首尾），用于卡片解析
	 *
	 * @param content - 要分割的内容
	 * @returns 所有分割的块（包括首尾块，不应用"完全包围"规则）
	 */
	splitCardsRaw(content: string): string[] {
		logger.debug("[EnhancedDelimiterDetector] 🔍 开始分割卡片（Raw模式 - 保留所有块）");
		logger.debug(`[EnhancedDelimiterDetector] 📄 输入内容长度: ${content.length} 字符`);
		logger.debug(`[EnhancedDelimiterDetector] 🔧 分隔符: "${this.delimiter}"`);

		const lines = content.split("\n");
		const allBlocks: string[] = [];
		let currentBlock = "";
		let delimiterCount = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// 检查是否为有效的分隔符行
			if (this.isValidDelimiterLine(line, i, lines)) {
				delimiterCount++;
				logger.debug(
					`[EnhancedDelimiterDetector] 🔶 发现第 ${delimiterCount} 个分隔符（行 ${i + 1}）`
				);

				//  只在验证时使用trim，保存原始内容
				if (currentBlock.trim().length > 0) {
					// 移除末尾的单个换行符（由累积过程添加的）
					const blockToSave = currentBlock.endsWith("\n")
						? currentBlock.slice(0, -1)
						: currentBlock;
					allBlocks.push(blockToSave);
					logger.debug(
						`[EnhancedDelimiterDetector]   ✅ 保存块 ${allBlocks.length}（${
							blockToSave.length
						} 字符）: ${blockToSave.substring(0, 50).replace(/\n/g, "\\n")}...`
					);
				} else {
					logger.debug("[EnhancedDelimiterDetector]   ⏭️  跳过空块");
				}

				// 重置当前块
				currentBlock = "";
			} else {
				// 累积块内容
				currentBlock += `${line}\n`;
			}
		}

		// 保存最后一个块
		if (currentBlock.trim().length > 0) {
			// 移除末尾的单个换行符
			const blockToSave = currentBlock.endsWith("\n") ? currentBlock.slice(0, -1) : currentBlock;
			allBlocks.push(blockToSave);
			logger.debug(
				`[EnhancedDelimiterDetector] ✅ 保存最后一个块 ${allBlocks.length}（${
					blockToSave.length
				} 字符）: ${blockToSave.substring(0, 50).replace(/\n/g, "\\n")}...`
			);
		}

		logger.debug(
			`[EnhancedDelimiterDetector] 📊 Raw模式统计：发现 ${delimiterCount} 个分隔符，分割成 ${allBlocks.length} 个块（包括首尾）`
		);
		logger.debug(`[EnhancedDelimiterDetector] 📦 Raw模式结果：返回所有 ${allBlocks.length} 个块`);

		return allBlocks;
	}

	/**
	 * 增强的卡片分割方法（重构版 - 复用 splitCardsRaw）
	 *
	 *  保留原始排版，不移除用户的空行和空白字符
	 *  应用"完全包围"规则：只返回被两个 <-> 完全包围的内容块
	 *
	 * @param content - 要分割的内容
	 * @returns 分割后的卡片内容数组（保留原始格式，只包含被完全包围的卡片）
	 */
	splitCardsEnhanced(content: string): string[] {
		logger.debug("[EnhancedDelimiterDetector] 🔍 开始分割卡片（Enhanced模式 - 只返回有效卡片）");
		return this.splitCardsBetweenDelimiterLines(content);
	}

	/**
	 * 块分类方法
	 * 将所有块分类为卡片块和非卡片块
	 *
	 * @param allBlocks - splitCardsRaw()返回的所有块
	 * @returns 分类结果
	 */
	classifyBlocks(allBlocks: string[]): { cards: string[]; nonCards: string[] } {
		const cards: string[] = [];
		const nonCards: string[] = [];

		if (allBlocks.length === 0) {
			return { cards, nonCards };
		}

		// 规则：首块和尾块为非卡片，中间块为卡片
		if (allBlocks.length === 1) {
			// 只有一个块，视为非卡片内容
			nonCards.push(allBlocks[0]);
		} else if (allBlocks.length === 2) {
			// 两个块，都视为非卡片内容（没有被完全包围的卡片）
			nonCards.push(allBlocks[0]);
			nonCards.push(allBlocks[1]);
		} else {
			// 三个或更多块：首块（非卡片）+ 中间块（卡片）+ 尾块（非卡片）
			nonCards.push(allBlocks[0]); // 首块
			for (let i = 1; i < allBlocks.length - 1; i++) {
				cards.push(allBlocks[i]); // 中间块为卡片
			}
			nonCards.push(allBlocks[allBlocks.length - 1]); // 尾块
		}

		logger.debug(
			`[EnhancedDelimiterDetector] 📊 块分类结果：总${allBlocks.length}块 → ${cards.length}张卡片 + ${nonCards.length}个非卡片块`
		);

		return { cards, nonCards };
	}

	/**
	 * 验证卡片内容是否有效
	 *
	 * @param content - 卡片内容
	 * @param minLength - 最小长度（默认10字符）
	 * @returns 是否有效
	 */
	isValidCardContent(content: string, minLength = 10): boolean {
		const trimmed = content.trim();

		// 检查最小长度
		if (trimmed.length < minLength) {
			logger.warn(
				`[EnhancedDelimiterDetector] 卡片内容过短（${trimmed.length}字符），建议至少${minLength}字符`
			);
			return false;
		}

		// 检查是否有有效的非空白内容
		// 要求至少有5个连续的非空白字符
		if (!/\S{5,}/.test(trimmed)) {
			logger.warn("[EnhancedDelimiterDetector] 卡片缺少有效内容（非空白字符不足）");
			return false;
		}

		return true;
	}
}
