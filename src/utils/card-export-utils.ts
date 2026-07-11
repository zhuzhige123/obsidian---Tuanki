/**
 * 卡片导出工具
 * 支持 CSV/MD 格式，按来源/月份/牌组分组导出
 */

import { MAIN_SEPARATOR } from "../constants/markdown-delimiters";
import type { Card, Deck } from "../data/types";
import { getCardContentBySide } from "./helpers";
import { extractBodyContent, parseSourceInfo, parseYAMLFromContent } from "./yaml-utils";

const FRONT_BACK_SPLIT = /(?:^|\n)\s*(?:---div---|---)\s*(?:\n|$)/i;
const OPTION_LINE = /^\s*[A-Z]\s*[.．、]\s/;
const QUESTION_PREFIX = /^(?:Q:|q:|问题：)\s*/;
const ANSWER_PREFIX = /^(?:A:|a:|答案：)\s*/;

function stripLinePrefix(line: string, prefixPattern: RegExp): string {
	const trimmed = line.trimStart();
	if (prefixPattern.test(trimmed)) {
		return trimmed.replace(prefixPattern, "").trimStart();
	}
	return line;
}

function normalizeFrontSection(front: string): string {
	const lines = front.split("\n");
	const normalized: string[] = [];
	let strippedQuestion = false;

	for (const line of lines) {
		if (!strippedQuestion && line.trim() && !OPTION_LINE.test(line)) {
			normalized.push(stripLinePrefix(line, QUESTION_PREFIX));
			strippedQuestion = true;
			continue;
		}
		normalized.push(line);
	}

	return normalized.join("\n").trim();
}

function normalizeBackSection(back: string): string {
	if (!back.trim()) {
		return back;
	}

	const lines = back.split("\n");
	const firstNonEmptyIndex = lines.findIndex((line) => line.trim());
	if (firstNonEmptyIndex < 0) {
		return back.trim();
	}

	lines[firstNonEmptyIndex] = stripLinePrefix(lines[firstNonEmptyIndex], ANSWER_PREFIX);
	return lines.join("\n").trim();
}

/**
 * 将卡片正文格式化为插件通用 Markdown 导出格式：
 * - 保留 ---div--- 正反面分隔符（兼容旧导出误用的 ---）
 * - 去掉可选的 Q:/A: 前缀
 */
export function formatCardBodyForMarkdownExport(content: string): string {
	const body = extractBodyContent(content || "").trim();
	if (!body) {
		return "";
	}

	const splitMatch = body.match(FRONT_BACK_SPLIT);
	if (!splitMatch || splitMatch.index === undefined) {
		return normalizeFrontSection(body);
	}

	const front = body.slice(0, splitMatch.index).trim();
	const back = body.slice(splitMatch.index + splitMatch[0].length).trim();
	if (!back) {
		return normalizeFrontSection(front);
	}
	return `${normalizeFrontSection(front)}\n\n${MAIN_SEPARATOR}\n${normalizeBackSection(back)}`;
}

// ============================================================================
// CSV 生成工具
// ============================================================================

/** 转义 CSV 字段值 */
function escapeCSVField(value: string): string {
	if (!value) return "";
	// 包含逗号、引号、换行符时需要用引号包裹
	if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** 从卡片数组中收集所有唯一的 YAML 属性键（排除内置 we_ 前缀） */
function collectAllYamlKeys(cards: Card[]): string[] {
	const BUILTIN_KEYS = new Set([
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
	const keySet = new Set<string>();
	for (const card of cards) {
		if (!card.content) continue;
		try {
			const yaml = parseYAMLFromContent(card.content);
			for (const key of Object.keys(yaml)) {
				if (!BUILTIN_KEYS.has(key)) {
					keySet.add(key);
				}
			}
		} catch {
			/* ignore */
		}
	}
	return Array.from(keySet).sort();
}

/**
 * 将卡片数组转为 CSV 字符串
 * 自动收集所有 YAML 自定义属性作为额外列
 */
export function cardsToCSV(cards: Card[], allDecks: Deck[]): string {
	if (cards.length === 0) return "";

	const deckMap = new Map(allDecks.map((d) => [d.id, d.name]));
	const customKeys = collectAllYamlKeys(cards);

	// 构建表头
	const baseHeaders = [
		"uuid",
		"front",
		"back",
		"tags",
		"decks",
		"source",
		"type",
		"priority",
		"created",
		"modified",
	];
	const headers = [...baseHeaders, ...customKeys];

	const rows: string[] = [];
	rows.push(headers.map(escapeCSVField).join(","));

	for (const card of cards) {
		const front = getCardContentBySide(card, "front", []);
		const back = getCardContentBySide(card, "back", []);
		const tags = (card.tags || []).join(";");

		// 牌组名称
		let deckNames = "";
		try {
			const yaml = parseYAMLFromContent(card.content || "");
			const weDecks = yaml.we_decks;
			if (Array.isArray(weDecks)) {
				deckNames = weDecks.join(";");
			}
		} catch {
			/* ignore */
		}
		if (!deckNames && card.deckId) {
			deckNames = deckMap.get(card.deckId) || card.deckId;
		}

		// 来源
		const sourceInfo = parseSourceInfo(card.content || "");
		const source = sourceInfo.sourceFile || card.sourceFile || "";

		// 基础字段
		const row: Record<string, string> = {
			uuid: card.uuid || "",
			front,
			back,
			tags,
			decks: deckNames,
			source,
			type: card.type || "",
			priority: String(card.priority || 0),
			created: card.created || "",
			modified: card.modified || "",
		};

		// 自定义 YAML 属性
		if (customKeys.length > 0 && card.content) {
			try {
				const yaml = parseYAMLFromContent(card.content);
				for (const key of customKeys) {
					const val = yaml[key];
					row[key] =
						typeof val === "string"
							? val
							: typeof val === "number" || typeof val === "boolean"
								? String(val)
								: "";
				}
			} catch {
				for (const key of customKeys) {
					row[key] = "";
				}
			}
		}

		rows.push(headers.map((h) => escapeCSVField(row[h] || "")).join(","));
	}

	// 添加 BOM 以便 Excel 正确识别 UTF-8
	return `\uFEFF${rows.join("\n")}`;
}

// ============================================================================
// 分组工具
// ============================================================================

export type ExportGroupMode = "single" | "bySource" | "byMonth" | "byDeck";

/** 按来源文档分组 */
export function groupCardsBySource(cards: Card[]): Map<string, Card[]> {
	const groups = new Map<string, Card[]>();
	for (const card of cards) {
		const sourceInfo = parseSourceInfo(card.content || "");
		const key = sourceInfo.sourceFile || card.sourceFile || "__no_source__";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)?.push(card);
	}
	return groups;
}

/** 按创建月份分组 (YYYY-MM) */
export function groupCardsByMonth(cards: Card[]): Map<string, Card[]> {
	const groups = new Map<string, Card[]>();
	for (const card of cards) {
		let month = "__unknown__";
		if (card.created) {
			try {
				const d = new Date(card.created);
				if (!Number.isNaN(d.getTime())) {
					month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
				}
			} catch {
				/* ignore */
			}
		}
		if (!groups.has(month)) groups.set(month, []);
		groups.get(month)?.push(card);
	}
	return groups;
}

/** 按牌组分组 */
export function groupCardsByDeck(cards: Card[], allDecks: Deck[]): Map<string, Card[]> {
	const groups = new Map<string, Card[]>();
	const deckMap = new Map(allDecks.map((d) => [d.id, d.name]));

	for (const card of cards) {
		let deckName = "__no_deck__";
		try {
			const yaml = parseYAMLFromContent(card.content || "");
			const weDecks = yaml.we_decks;
			if (Array.isArray(weDecks) && weDecks.length > 0) {
				deckName = String(weDecks[0]);
			}
		} catch {
			/* ignore */
		}
		if (deckName === "__no_deck__" && card.deckId) {
			deckName = deckMap.get(card.deckId) || card.deckId;
		}

		if (!groups.has(deckName)) groups.set(deckName, []);
		groups.get(deckName)?.push(card);
	}
	return groups;
}

/** 生成安全的文件名 */
export function sanitizeFileName(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\.md$/, "");
}
