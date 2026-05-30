import { logger } from "../utils/logger";
import { extractBodyContent } from "../utils/yaml-utils";

/**
 * 选择题解析器
 *
 * 标准格式：题干末尾（B）/（AC）、选项 A. B. C.、可选 Answer: 行、---div--- 解析
 */

type ParsedAnswer = {
	answers: string[];
	source: "answer_line" | "stem_parens";
};

function normalizeAnswerList(raw: string): string[] {
	const cleaned = raw
		.trim()
		.replace(/[()（）]/g, "")
		.replace(/\s+/g, "");

	if (!cleaned) return [];

	const parts = cleaned
		.split(/[,，]/)
		.map((p) => p.trim())
		.filter(Boolean);

	if (parts.length > 1) {
		return parts.map((p) => p.toUpperCase()).filter((p) => /^[A-Z]$/.test(p));
	}

	return cleaned
		.toUpperCase()
		.split("")
		.filter((ch) => /^[A-Z]$/.test(ch));
}

function findAnswerLine(markdown: string): ParsedAnswer | null {
	const match = markdown.match(/^\s*Answer\s*:\s*(.+?)\s*$/im);
	if (!match) return null;
	const answers = normalizeAnswerList(match[1]);
	if (answers.length === 0) return null;
	return { answers, source: "answer_line" };
}

function stripAnswerLine(markdown: string): string {
	return markdown
		.split("\n")
		.filter((l) => !/^\s*Answer\s*:/i.test(l))
		.join("\n");
}

function findStemParenAnswer(stem: string): {
	stemWithoutAnswer: string;
	answer: ParsedAnswer | null;
} {
	const m = stem.match(/([\s\S]*?)(?:\(|（)\s*([^\)\）]+?)\s*(?:\)|）)\s*$/);
	if (!m) return { stemWithoutAnswer: stem, answer: null };
	const answers = normalizeAnswerList(m[2]);
	if (answers.length === 0) return { stemWithoutAnswer: stem, answer: null };
	return {
		stemWithoutAnswer: m[1].trimEnd(),
		answer: { answers, source: "stem_parens" },
	};
}

function extractExplanation(front: string, back: string): { front: string; explanation?: string } {
	if (back.trim()) {
		return { front, explanation: stripAnswerLine(back).trim() || undefined };
	}

	const explanationMatch = front.match(/^\s*Explanation\s*:\s*([\s\S]*)$/im);
	if (!explanationMatch) {
		return { front };
	}

	const idx = front.search(/^\s*Explanation\s*:/im);
	const explanationRaw = front.slice(idx).replace(/^\s*Explanation\s*:\s*/im, "");
	const frontWithout = front.slice(0, idx).trimEnd();
	return {
		front: frontWithout,
		explanation: stripAnswerLine(explanationRaw).trim() || undefined,
	};
}

function isOptionStartLine(line: string): { label: string; content: string } | null {
	const match = line.match(/^\s*([A-Z])\s*[\.．、]\s*(.*)$/);
	if (!match) return null;
	return { label: match[1], content: match[2] ?? "" };
}

function stripQuestionPrefix(stem: string): string {
	const trimmed = stem.trimStart();
	if (/^(?:Q:|问题：)\s*/.test(trimmed)) {
		return trimmed.replace(/^(?:Q:|问题：)\s*/m, "").trimStart();
	}
	return stem;
}

export interface ChoiceOption {
	/** 选项标签 (A, B, C, D, ...) */
	label: string;
	/** 选项内容文本 */
	content: string;
	/** 是否为正确答案 */
	isCorrect: boolean;
}

export interface ChoiceQuestion {
	/** 题型标识 */
	type: "choice";
	/** 问题文本 */
	question: string;
	/** 所有选项 */
	options: ChoiceOption[];
	/** 正确答案标签列表 */
	correctAnswers: string[];
	/** 解析说明（可选） */
	explanation?: string;
	/** 是否为多选题 */
	isMultipleChoice: boolean;
}

/**
 * 解析选择题卡片
 *
 * @param markdown - 卡片的Markdown内容
 * @returns 解析后的选择题对象，如果不是选择题则返回null
 */
export function parseChoiceQuestion(markdown: string): ChoiceQuestion | null {
	if (!markdown || typeof markdown !== "string") {
		return null;
	}

	try {
		// 0. 预处理：移除 YAML frontmatter + 清理可能的代码块包裹
		let cleanedMarkdown = extractBodyContent(markdown).trim();

		// 检测并移除外层markdown代码块包裹
		const codeBlockRegex = /^```(?:markdown|md|text|)?\s*\n?([\s\S]*?)\n?```$/;
		const codeBlockMatch = cleanedMarkdown.match(codeBlockRegex);

		if (codeBlockMatch) {
			cleanedMarkdown = codeBlockMatch[1].trim();
			logger.debug("[ChoiceQuestionParser] 检测到代码块包裹，已自动清理");
		}

		// 清理多余的空白行（保留必要的分隔）
		cleanedMarkdown = cleanedMarkdown.replace(/\n{3,}/g, "\n\n");

		// 1. 按 ---div--- 分割正面和背面
		const dividerRegex = /---div---/i;
		const parts = cleanedMarkdown.split(dividerRegex);
		const front = parts[0]?.trim() || "";
		const back = parts[1]?.trim() || "";

		// 2. 解析解析内容 + 移除 front 中的 Explanation/Answer 行
		const explanationResult = extractExplanation(front, back);
		const normalizedFront = explanationResult.front;

		// 3. 解析选项（A. / A、 等，支持多行内容）
		const options: ChoiceOption[] = [];
		const frontLines = normalizedFront.split("\n");
		const stemLines: string[] = [];

		let currentOption: ChoiceOption | null = null;
		let encounteredOption = false;

		for (const rawLine of frontLines) {
			const line = rawLine.replace(/\r$/, "");

			// 忽略 Answer/Explanation 行（已在上方处理，这里是容错）
			if (/^\s*Answer\s*:/i.test(line) || /^\s*Explanation\s*:/i.test(line)) {
				continue;
			}

			const opt = isOptionStartLine(line);
			if (opt) {
				encounteredOption = true;

				if (currentOption) {
					currentOption.content = currentOption.content.trim();
					options.push(currentOption);
				}

				currentOption = {
					label: opt.label,
					content: opt.content.trim(),
					isCorrect: false,
				};

				continue;
			}

			if (!encounteredOption) {
				stemLines.push(line);
			} else if (currentOption) {
				// 选项的多行内容：继续追加
				const appended = currentOption.content ? `${currentOption.content}\n${line}` : line;
				currentOption.content = appended;
			}
		}

		if (currentOption) {
			currentOption.content = currentOption.content.trim();
			options.push(currentOption);
		}

		if (options.length < 2) {
			return null;
		}

		// 4. 构建题干（支持可选 Q: 前缀、题号、以及题干末尾括号答案）
		const stemRaw = stemLines.join("\n").trim();
		if (!stemRaw) {
			return null;
		}

		const stemNoPrefix = stripQuestionPrefix(stemRaw);
		const stemParen = findStemParenAnswer(stemNoPrefix);

		// 5. 提取答案（Answer: 行 > 题干末尾括号）
		const answerLine = findAnswerLine(cleanedMarkdown);

		const answer: ParsedAnswer | null = answerLine || stemParen.answer;

		//  无答案容错：如果满足选择题结构（已解析出选项 + 题干），但没有任何答案表达
		// 仍然按选择题渲染，correctAnswers 置空，由上层 UI 提示“答案缺失”。
		if (!answer || answer.answers.length === 0) {
			for (const option of options) {
				option.isCorrect = false;
			}

			const choiceQuestion: ChoiceQuestion = {
				type: "choice",
				question: stemParen.stemWithoutAnswer.trim(),
				options,
				correctAnswers: [],
				explanation: explanationResult.explanation,
				isMultipleChoice: false,
			};

			return choiceQuestion;
		}

		// 6. 标记正确选项（Answer 会覆盖 option markers）
		const correctAnswerSet = new Set(answer.answers.map((a) => a.toUpperCase()));
		for (const option of options) {
			option.isCorrect = correctAnswerSet.has(option.label.toUpperCase());
		}

		const correctOptions = options.filter((opt) => opt.isCorrect);
		if (correctOptions.length === 0) {
			// 题干/Answer 给了无效标签时也按“无答案”处理，避免整体降级为问答渲染
			for (const option of options) {
				option.isCorrect = false;
			}

			const choiceQuestion: ChoiceQuestion = {
				type: "choice",
				question: stemParen.stemWithoutAnswer.trim(),
				options,
				correctAnswers: [],
				explanation: explanationResult.explanation,
				isMultipleChoice: false,
			};

			return choiceQuestion;
		}

		// 7. 构造选择题对象
		const isMultipleChoice = correctOptions.length > 1;
		const choiceQuestion: ChoiceQuestion = {
			type: "choice",
			question: stemParen.stemWithoutAnswer.trim(),
			options,
			correctAnswers: correctOptions.map((opt) => opt.label),
			explanation: explanationResult.explanation,
			isMultipleChoice,
		};

		return choiceQuestion;
	} catch (error) {
		logger.error("[ChoiceQuestionParser] 解析失败:", error);
		return null;
	}
}

/**
 * 检测内容是否为选择题格式
 *
 * @param markdown - 要检测的Markdown内容
 * @returns 是否为选择题
 */
export function isChoiceQuestion(markdown: string): boolean {
	if (!markdown || typeof markdown !== "string") {
		return false;
	}

	// 快速检测：至少 2 个选项（无答案也算选择题，UI 将提示“答案缺失”）
	const body = extractBodyContent(markdown);
	const hasOptions =
		body.split("\n").filter((l) => /^\s*[A-Z]\s*[\.．、]\s*/.test(l)).length >= 2;
	if (!hasOptions) return false;

	return true;
}

/**
 * 验证选择题对象的有效性
 *
 * @param question - 选择题对象
 * @returns 是否有效
 */
export function validateChoiceQuestion(question: ChoiceQuestion): boolean {
	if (!question || question.type !== "choice") {
		return false;
	}

	// 验证问题文本
	if (!question.question || question.question.trim().length === 0) {
		return false;
	}

	// 验证选项
	if (!Array.isArray(question.options) || question.options.length < 2) {
		return false;
	}

	// 验证每个选项
	for (const option of question.options) {
		if (!option.label || !option.content) {
			return false;
		}
	}

	// 验证正确答案
	if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) {
		return false;
	}

	// 验证正确答案标签是否存在于选项中
	const optionLabels = question.options.map((opt) => opt.label);
	for (const correctLabel of question.correctAnswers) {
		if (!optionLabels.includes(correctLabel)) {
			return false;
		}
	}

	return true;
}
