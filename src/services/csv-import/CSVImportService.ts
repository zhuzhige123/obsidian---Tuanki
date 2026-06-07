/**
 * CSV导入服务
 *
 * 职责：
 * - CSV/TSV文件解析（编码检测、分隔符嗅探、表头检测）
 * - 列映射与卡片类型推断
 * - 批量卡片生成
 */

import { omitKey } from "../../utils/object-utils";
import { parseYAMLFromContent } from "../../utils/yaml-utils";

// ============================================================================
// 类型定义
// ============================================================================

/** 分隔符类型 */
export type Separator = "," | "\t" | ";" | "|";

/** 导入目标卡片类型 */
export type ImportCardType = "basic-qa" | "single-choice" | "cloze" | "free-content";

/** 内置列映射目标字段 */
export type BuiltinTargetField =
	| "question"
	| "answer"
	| "hint"
	| "explanation"
	| "optionA"
	| "optionB"
	| "optionC"
	| "optionD"
	| "optionE"
	| "optionF"
	| "correct_answer"
	| "difficulty"
	| "content"
	| "tags"
	| "source"
	| "author"
	| "page"
	| "_skip";

/** 列映射目标字段（内置 + yaml:自定义属性） */
export type TargetField = BuiltinTargetField | `yaml:${string}`;

/** 判断是否为自定义YAML属性字段 */
export function isYamlCustomField(field: TargetField): field is `yaml:${string}` {
	return field.startsWith("yaml:");
}

/** 提取自定义YAML属性名 */
export function getYamlPropertyName(field: TargetField): string {
	return field.replace(/^yaml:/, "");
}

/** 列映射条目 */
export interface ColumnMapping {
	csvColumn: string;
	csvIndex: number;
	targetField: TargetField;
}

/** CSV解析配置 */
export interface CSVParseConfig {
	separator: Separator;
	hasHeader: boolean;
	encoding: string;
}

/** CSV解析结果 */
export interface CSVParseResult {
	headers: string[];
	rows: string[][];
	totalRows: number;
	config: CSVParseConfig;
}

/** 分隔符嗅探结果 */
export interface SeparatorDetectionResult {
	separator: Separator;
	confidence: number;
	hasHeader: boolean;
}

/** 列映射建议 */
export interface MappingSuggestion {
	mappings: ColumnMapping[];
	suggestedCardType: ImportCardType;
	confidence: number;
}

/** 导入预览卡片 */
export interface PreviewCard {
	index: number;
	content: string;
	cardType: ImportCardType;
	fields: Record<string, string>;
	warnings?: string[];
}

/** 导入统计 */
export interface ImportStats {
	totalRows: number;
	validCards: number;
	skippedRows: number;
	warnings: string[];
}

/** 生成的卡片数据（不含uuid等，由调用方填充） */
export interface GeneratedCardData {
	content: string;
	cardType: string;
	tags: string[];
	extraFields: Record<string, string>;
}

// ============================================================================
// 分隔符与列名常量
// ============================================================================

const SEPARATOR_LABELS: Record<Separator, string> = {
	",": "逗号 (,)",
	"\t": "Tab",
	";": "分号 (;)",
	"|": "竖线 (|)",
};

/** 各字段的可能列名（小写匹配） */
const FIELD_ALIASES: Record<BuiltinTargetField, string[]> = {
	question: [
		"question",
		"q",
		"front",
		"term",
		"word",
		"prompt",
		"问题",
		"正面",
		"题目",
		"术语",
		"词汇",
		"题干",
	],
	answer: [
		"answer",
		"a",
		"back",
		"definition",
		"meaning",
		"response",
		"答案",
		"背面",
		"答复",
		"释义",
		"定义",
		"解释",
	],
	hint: ["hint", "clue", "note", "提示", "线索"],
	explanation: [
		"explanation",
		"explain",
		"analysis",
		"detail",
		"solution",
		"解析",
		"详解",
		"解答",
		"分析",
	],
	optionA: ["optiona", "option_a", "a", "选项a", "choicea", "choice_a"],
	optionB: ["optionb", "option_b", "b", "选项b", "choiceb", "choice_b"],
	optionC: ["optionc", "option_c", "c", "选项c", "choicec", "choice_c"],
	optionD: ["optiond", "option_d", "d", "选项d", "choiced", "choice_d"],
	optionE: ["optione", "option_e", "e", "选项e", "choicee", "choice_e"],
	optionF: ["optionf", "option_f", "f", "选项f", "choicef", "choice_f"],
	correct_answer: [
		"correct",
		"correct_answer",
		"answer_key",
		"key",
		"正确答案",
		"答案键",
		"正确选项",
	],
	difficulty: ["difficulty", "level", "diff", "难度", "难度等级"],
	content: ["content", "text", "body", "note", "内容", "正文", "笔记"],
	tags: ["tags", "tag", "category", "subject", "标签", "分类", "科目"],
	source: ["source", "reference", "ref", "url", "link", "来源", "参考", "链接", "title"],
	author: ["author", "creator", "writer", "作者"],
	page: ["page", "location", "position", "页码", "位置"],
	_skip: [],
};

// ============================================================================
// 核心解析函数
// ============================================================================

/**
 * 解析CSV行（状态机，正确处理引号内逗号和换行）
 */
export function parseCSVLine(line: string, separator: Separator = ","): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
				current += '"';
				i += 2;
			} else {
				inQuotes = !inQuotes;
				i++;
			}
		} else if (char === separator && !inQuotes) {
			result.push(current.trim());
			current = "";
			i++;
		} else {
			current += char;
			i++;
		}
	}

	result.push(current.trim());
	return result;
}

/**
 * 完整CSV文本解析（处理引号内换行）
 * 仅负责按行分割，保留原始文本交给 parseCSVLine 处理字段
 */
export function parseCSVText(text: string, separator: Separator = ","): string[][] {
	const rows: string[][] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (char === '"') {
			// 跟踪引号状态（用于判断换行符是否在引号内）
			if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
				// 转义引号 "" → 保留原样，由 parseCSVLine 处理
				current += '""';
				i++;
				continue;
			} else {
				inQuotes = !inQuotes;
			}
			current += char;
			continue;
		}

		if ((char === "\n" || char === "\r") && !inQuotes) {
			// 跳过 \r\n 的 \n
			if (char === "\r" && i + 1 < text.length && text[i + 1] === "\n") {
				i++;
			}
			if (current.trim().length > 0) {
				rows.push(parseCSVLine(current, separator));
			}
			current = "";
			continue;
		}

		current += char;
	}

	// 最后一行
	if (current.trim().length > 0) {
		rows.push(parseCSVLine(current, separator));
	}

	return rows;
}

/**
 * 去除BOM标记
 */
export function stripBOM(text: string): string {
	if (text.charCodeAt(0) === 0xfeff) {
		return text.slice(1);
	}
	return text;
}

/**
 * 尝试解码文件内容（处理GBK等中文编码）
 */
export async function decodeFileContent(file: File): Promise<{ text: string; encoding: string }> {
	// 先尝试 UTF-8
	const utf8Text = await file.text();
	const stripped = stripBOM(utf8Text);

	// 检测是否有乱码特征（常见 GBK 误读为 UTF-8 的特征）
	const hasGarbage =
		/\ufffd/.test(stripped) || // replacement character
		(/[\u00c0-\u00ff]{3,}/.test(stripped) && /[\u4e00-\u9fff]/.test(stripped) === false);

	if (!hasGarbage) {
		return { text: stripped, encoding: "UTF-8" };
	}

	// 尝试 GBK 解码
	try {
		const buffer = await file.arrayBuffer();
		const decoder = new TextDecoder("gbk");
		const gbkText = stripBOM(decoder.decode(buffer));

		// 如果 GBK 解码后包含中文，优先使用
		if (/[\u4e00-\u9fff]/.test(gbkText)) {
			return { text: gbkText, encoding: "GBK" };
		}
	} catch {
		// GBK decoder 不可用，继续使用 UTF-8
	}

	return { text: stripped, encoding: "UTF-8" };
}

// ============================================================================
// 分隔符嗅探
// ============================================================================

/**
 * 自动检测CSV分隔符
 */
export function detectSeparator(text: string): SeparatorDetectionResult {
	const lines = text
		.split(/\r?\n/)
		.filter((l) => l.trim().length > 0)
		.slice(0, 10);

	if (lines.length === 0) {
		return { separator: ",", confidence: 0, hasHeader: false };
	}

	const candidates: Separator[] = [",", "\t", ";", "|"];
	let bestSep: Separator = ",";
	let bestScore = -1;
	let bestConsistency = 0;

	for (const sep of candidates) {
		const counts = lines.map((_line) => {
			// 简单计数（不在引号内的分隔符）
			let count = 0;
			let inQ = false;
			for (const ch of _line) {
				if (ch === '"') inQ = !inQ;
				else if (ch === sep && !inQ) count++;
			}
			return count;
		});

		if (counts[0] === 0) continue;

		// 一致性：所有行的列数是否相同
		const firstCount = counts[0];
		const consistent = counts.filter((_c) => _c === firstCount).length;
		const consistency = consistent / counts.length;

		// 得分 = 列数 * 一致性
		const score = firstCount * consistency;

		if (score > bestScore || (score === bestScore && consistency > bestConsistency)) {
			bestScore = score;
			bestSep = sep;
			bestConsistency = consistency;
		}
	}

	// 表头检测：如果第一行的字段看起来像表头（非纯数字、有字母）
	const firstRow = parseCSVLine(lines[0], bestSep);
	const hasHeader =
		firstRow.every((_cell) => {
			const trimmed = _cell.trim();
			if (!trimmed) return true;
			// 如果全是数字或看起来像数据行，可能不是表头
			return Number.isNaN(Number(trimmed)) || /[a-zA-Z\u4e00-\u9fff]/.test(trimmed);
		}) && firstRow.some((cell) => /[a-zA-Z\u4e00-\u9fff]/.test(cell.trim()));

	const confidence = bestConsistency > 0.8 ? (bestScore > 2 ? 0.95 : 0.8) : 0.5;

	return { separator: bestSep, confidence, hasHeader };
}

// ============================================================================
// 列映射智能建议
// ============================================================================

/**
 * 根据表头自动推荐列映射
 */
export function suggestMappings(headers: string[]): MappingSuggestion {
	const mappings: ColumnMapping[] = [];
	const usedFields = new Set<TargetField>();

	// 第一遍：精确匹配
	for (let i = 0; i < headers.length; i++) {
		const headerLower = headers[i].toLowerCase().trim();
		let matched = false;

		for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [TargetField, string[]][]) {
			if (field === "_skip") continue;
			if (usedFields.has(field)) continue;

			if (aliases.includes(headerLower)) {
				mappings.push({ csvColumn: headers[i], csvIndex: i, targetField: field });
				usedFields.add(field);
				matched = true;
				break;
			}
		}

		if (!matched) {
			mappings.push({ csvColumn: headers[i], csvIndex: i, targetField: "_skip" });
		}
	}

	// 推断卡片类型
	const hasQuestion = usedFields.has("question");
	const hasAnswer = usedFields.has("answer");
	const hasOptions = usedFields.has("optionA") || usedFields.has("optionB");
	const hasCorrect = usedFields.has("correct_answer");
	const hasContent = usedFields.has("content");

	let suggestedCardType: ImportCardType = "basic-qa";
	let confidence = 0.5;

	if (hasOptions && hasCorrect && hasQuestion) {
		suggestedCardType = "single-choice";
		confidence = 0.95;
	} else if (hasQuestion && hasAnswer) {
		suggestedCardType = "basic-qa";
		confidence = 0.9;
	} else if (hasContent) {
		// 检查content中是否有挖空标记
		suggestedCardType = "free-content";
		confidence = 0.7;
	} else if (headers.length === 2) {
		// 两列CSV，默认当作 question/answer
		if (!hasQuestion) {
			mappings[0].targetField = "question";
			usedFields.add("question");
		}
		if (!hasAnswer && mappings.length > 1) {
			mappings[1].targetField = "answer";
			usedFields.add("answer");
		}
		suggestedCardType = "basic-qa";
		confidence = 0.7;
	} else if (headers.length === 1) {
		if (!hasContent) {
			mappings[0].targetField = "content";
		}
		suggestedCardType = "free-content";
		confidence = 0.6;
	}

	return { mappings, suggestedCardType, confidence };
}

// ============================================================================
// 卡片生成
// ============================================================================

/**
 * 从映射数据生成卡片内容
 */
export function generateCardContent(
	row: string[],
	mappings: ColumnMapping[],
	cardType: ImportCardType
): GeneratedCardData | null {
	let fields: Record<string, string> = {};

	for (const m of mappings) {
		if (m.targetField === "_skip") continue;
		const value = row[m.csvIndex]?.trim() || "";
		if (value) {
			fields[m.targetField] = value;
		}
	}

	// 提取tags
	const tags: string[] = [];
	if (fields.tags) {
		tags.push(
			...fields.tags
				.split(/[,;，；]/)
				.map((t) => t.trim())
				.filter(Boolean)
		);
		fields = omitKey(fields, "tags");
	}

	// 额外字段（source, author, page等）
	const extraFields: Record<string, string> = {};
	for (const key of ["source", "author", "page", "difficulty"] as const) {
		if (fields[key]) {
			extraFields[key] = fields[key];
			delete fields[key];
		}
	}

	// 收集 yaml: 前缀的自定义YAML属性
	const yamlCustomFields: Record<string, string> = {};
	for (const key of Object.keys(fields)) {
		if (key.startsWith("yaml:")) {
			const propName = key.replace(/^yaml:/, "");
			yamlCustomFields[propName] = fields[key];
			delete fields[key];
		}
	}
	// 将自定义YAML属性合入extraFields（使用 yaml: 前缀标识）
	for (const [propName, value] of Object.entries(yamlCustomFields)) {
		extraFields[`yaml:${propName}`] = value;
	}

	let content = "";

	switch (cardType) {
		case "basic-qa": {
			const q = fields.question || "";
			const a = fields.answer || "";
			if (!q) return null;

			if (a) {
				content = `${q}\n---div---\n${a}`;
			} else {
				content = q;
			}
			if (fields.explanation) content += `\n\nExplanation: ${fields.explanation}`;
			break;
		}

		case "single-choice": {
			const q = fields.question || "";
			if (!q) return null;

			const options: string[] = [];
			for (const key of [
				"optionA",
				"optionB",
				"optionC",
				"optionD",
				"optionE",
				"optionF",
			] as const) {
				if (fields[key]) {
					const letter = key.replace("option", "");
					options.push(`${letter}. ${fields[key]}`);
				}
			}

			if (options.length < 2) return null;

			// 解析正确答案
			const correctRaw = fields.correct_answer || "";
			const correctLetters = parseCorrectAnswer(correctRaw, fields);

			// 构建标准选择题格式：Q: 问题(答案) + A./B./C./D. + ---div--- + 解析
			const answerSuffix = correctLetters.length > 0 ? `(${correctLetters.join(",")})` : "";
			let choiceContent = `Q: ${q}${answerSuffix}\n\n${options.join("\n")}`;

			if (fields.explanation) {
				choiceContent += `\n\n---div---\n\n${fields.explanation}`;
			}

			content = choiceContent;
			break;
		}

		case "cloze": {
			const text = fields.content || fields.question || "";
			if (!text) return null;
			content = text;
			break;
		}

		case "free-content": {
			const text = fields.content || fields.question || "";
			if (!text) return null;
			// 如果有answer，拼接为QA格式
			if (fields.answer) {
				content = `${text}\n---div---\n${fields.answer}`;
			} else {
				content = text;
			}
			break;
		}

		default:
			return null;
	}

	if (!content.trim()) return null;
	const hintText = (fields.hint || "").trim();
	if (hintText) {
		content = `${content.trim()}\n\n${hintText}`;
	}

	// 将CardType映射到data/types的CardType值
	let dataCardType = "basic";
	if (cardType === "single-choice") dataCardType = "multiple";
	else if (cardType === "cloze") dataCardType = "cloze";

	return {
		content,
		cardType: dataCardType,
		tags,
		extraFields,
	};
}

/**
 * 解析正确答案字段的多种格式
 * 支持: "A", "AB", "A,C", "1", "选项A", 完整文本匹配
 */
function parseCorrectAnswer(raw: string, fields: Record<string, string>): string[] {
	if (!raw) return [];

	const trimmed = raw.trim().toUpperCase();

	// 纯字母格式: "A", "AB", "A,C", "A;B"
	const letterMatch = trimmed.match(/^[A-F]([,;\s]*[A-F])*$/);
	if (letterMatch) {
		return trimmed.replace(/[,;\s]+/g, "").split("");
	}

	// 数字格式: "1" -> "A", "1,3" -> "A,C"
	const numberMatch = trimmed.match(/^\d([,;\s]*\d)*$/);
	if (numberMatch) {
		return trimmed
			.replace(/[,;\s]+/g, "")
			.split("")
			.map((_n) => {
				const idx = parseInt(_n) - 1;
				return String.fromCharCode(65 + idx);
			})
			.filter((_l) => _l >= "A" && _l <= "F");
	}

	// 完整文本匹配：与选项内容对比
	const optionKeys = ["optionA", "optionB", "optionC", "optionD", "optionE", "optionF"] as const;
	for (const key of optionKeys) {
		if (fields[key] && fields[key].trim().toLowerCase() === raw.trim().toLowerCase()) {
			return [key.replace("option", "")];
		}
	}

	return [];
}

/**
 * 批量生成预览卡片
 */
export function generatePreviewCards(
	rows: string[][],
	mappings: ColumnMapping[],
	cardType: ImportCardType,
	maxCount = 5
): { previews: PreviewCard[]; stats: ImportStats } {
	const previews: PreviewCard[] = [];
	const warnings: string[] = [];
	let validCards = 0;
	let skippedRows = 0;

	for (let i = 0; i < rows.length; i++) {
		const result = generateCardContent(rows[i], mappings, cardType);
		if (result) {
			validCards++;
			if (previews.length < maxCount) {
				const fields: Record<string, string> = {};
				for (const m of mappings) {
					if (m.targetField !== "_skip") {
						fields[m.targetField] = rows[i][m.csvIndex]?.trim() || "";
					}
				}
				previews.push({
					index: i,
					content: result.content,
					cardType,
					fields,
				});
			}
		} else {
			skippedRows++;
			if (skippedRows <= 3) {
				warnings.push(`第 ${i + 1} 行数据不完整，已跳过`);
			}
		}
	}

	if (skippedRows > 3) {
		warnings.push(`...共 ${skippedRows} 行被跳过`);
	}

	return {
		previews,
		stats: {
			totalRows: rows.length,
			validCards,
			skippedRows,
			warnings,
		},
	};
}

// ============================================================================
// 导出常量
// ============================================================================

export { SEPARATOR_LABELS, FIELD_ALIASES };

/** 卡片类型选项（供UI使用） */
export const CARD_TYPE_OPTIONS: { value: ImportCardType; label: string; description: string }[] = [
	{ value: "basic-qa", label: "问答卡片", description: "问题 + 答案，适合术语、概念记忆" },
	{ value: "single-choice", label: "选择题", description: "题目 + 选项 + 正确答案" },
	{ value: "cloze", label: "挖空题", description: "包含 {{c1::}} 标记的挖空内容" },
	{ value: "free-content", label: "自由内容", description: "单列内容，自动检测格式" },
];

/** 各卡片类型的必需/可选字段 */
export const CARD_TYPE_FIELDS: Record<
	ImportCardType,
	{ required: BuiltinTargetField[]; optional: BuiltinTargetField[] }
> = {
	"basic-qa": {
		required: ["question"],
		optional: ["answer", "hint", "explanation", "tags", "source", "author", "page", "difficulty"],
	},
	"single-choice": {
		required: ["question", "optionA", "optionB", "correct_answer"],
		optional: [
			"optionC",
			"optionD",
			"optionE",
			"optionF",
			"hint",
			"explanation",
			"difficulty",
			"tags",
		],
	},
	cloze: {
		required: ["content"],
		optional: ["hint", "tags", "source"],
	},
	"free-content": {
		required: ["content"],
		optional: ["answer", "hint", "tags", "source", "author", "page"],
	},
};

// ============================================================================
// 用户YAML属性扫描
// ============================================================================

/** 插件内置的we_前缀属性和常见系统属性（不在自定义列表中显示） */
const BUILTIN_YAML_KEYS = new Set([
	"we_source",
	"we_block",
	"we_refs",
	"we_decks",
	"we_priority",
	"we_type",
	"we_difficulty",
	"created",
	"we_created",
	"tags",
]);

/**
 * 从卡片内容数组中收集所有用户自定义YAML属性键
 * 排除插件内置的 we_* 属性和 tags
 */
export function collectUserYamlProperties(cardContents: string[]): string[] {
	const propertySet = new Set<string>();

	for (const content of cardContents) {
		if (!content) continue;
		try {
			const yaml = parseYAMLFromContent(content);
			for (const key of Object.keys(yaml)) {
				if (!BUILTIN_YAML_KEYS.has(key)) {
					propertySet.add(key);
				}
			}
		} catch {
			// 忽略解析失败的卡片
		}
	}

	return Array.from(propertySet).sort();
}
