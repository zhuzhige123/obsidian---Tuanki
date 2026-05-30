import { logger } from "../utils/logger";
/**
 * 卡片格式化服务
 * 提供AI驱动的卡片内容格式化功能
 */

import { MAIN_SEPARATOR } from "../constants/markdown-delimiters";
import { parseChoiceQuestion } from "../parsing/choice-question-parser";

export interface FormatResult {
	success: boolean;
	content?: string;
	error?: string;
}

/**
 * 选择题格式化器
 * 识别并规范化为标准选择题 Markdown（A. 选项 + 题干末尾答案括号）
 */
export class ChoiceQuestionFormatter {
	static format(content: string): FormatResult {
		try {
			logger.debug("[ChoiceFormatter] 开始格式化，原始内容长度:", content.length);

			const parsed = parseChoiceQuestion(content);
			if (!parsed) {
				return {
					success: false,
					error: "无法识别选择题结构（需要题干、至少 2 个 A./A、 选项，以及题干括号或 Answer: 答案）",
				};
			}

			const answerSuffix =
				parsed.correctAnswers.length > 0 ? `（${parsed.correctAnswers.join(",")}）` : "";

			let formattedContent = `${parsed.question}${answerSuffix}\n\n`;
			for (const opt of parsed.options) {
				formattedContent += `${opt.label}. ${opt.content}\n`;
			}

			if (parsed.explanation) {
				formattedContent += `\n${MAIN_SEPARATOR}\n\n${parsed.explanation}`;
			}

			return {
				success: true,
				content: formattedContent.trim(),
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "格式化失败",
			};
		}
	}
}

/**
 * 卡片格式化服务
 * 统一管理所有格式化功能
 */
export class CardFormatService {
	static format(content: string, formatType: string): FormatResult {
		switch (formatType) {
			case "choice":
				return ChoiceQuestionFormatter.format(content);
			default:
				return {
					success: false,
					error: `不支持的格式化类型: ${formatType}`,
				};
		}
	}
}
