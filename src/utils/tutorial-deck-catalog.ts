import type { Card } from "../data/types";
import { readUnknownString } from "./dynamic-access";
import { parseYAMLFromContent } from "./yaml-utils";

/** 已废弃的内置教程牌组名称（历史版本自动创建） */
export const TUTORIAL_DECK_NAMES = ["Weave 指南", "weave 指南"] as const;

/** 教程副本常见散落牌组（迁移/渐进式挖空后常见） */
export const TUTORIAL_SCATTER_DECK_NAMES = ["未归组卡片", "未分组卡片"] as const;

/**
 * 内置教程牌组正文特征（摘自 docs/Weave指南牌组-卡片内容.md）。
 * 用于识别散落在「未归组卡片」等牌组中的教程副本。
 */
export const TUTORIAL_CARD_SIGNATURES = [
	"插件如何根据卡片内容自动识别题型",
	"如何编写标准的问答题卡片",
	"插件支持哪两种挖空标记",
	"如何编写标准的选择题卡片",
	"插件使用的核心分隔符有哪些",
	"在插件中如何创建新牌组",
	"如何从选中的文本快速创建卡片",
	"卡片的来源信息如何存储",
	"插件的数据文件存储在哪里",
	"插件使用什么记忆算法",
	"FSRS 算法在卡片上保存哪些状态",
	"卡片 YAML frontmatter 支持哪些元数据字段",
	"什么是 Content-Only 架构",
	"牌组和卡片之间是什么关系",
	"块链接 (Block Link) 是如何工作的",
	"Tuanki 插件的定价方案是什么",
	"什么是批量解析？支持哪些模式",
	"如何配置批量解析的文件夹映射",
	"学习队列是如何生成的",
	"什么是兄弟卡片分散",
	"什么是渐进式挖空（Progressive Cloze）",
	"如何编写渐进式挖空卡片",
	"如何使用图片遮罩功能",
	"图片遮罩数据如何存储",
	"人体最大的器官是{{c1::皮肤}}",
] as const;

const TUTORIAL_DECK_NAME_SET = new Set(
	TUTORIAL_DECK_NAMES.map((name) => normalizeTutorialText(name))
);

const TUTORIAL_SCATTER_DECK_NAME_SET = new Set(
	TUTORIAL_SCATTER_DECK_NAMES.map((name) => normalizeTutorialText(name))
);

function normalizeTutorialText(value: string): string {
	return value.replace(/^---[\s\S]*?---\s*/, "").replace(/\s+/g, " ").trim();
}

function readTutorialDeckNames(card: Card): string[] {
	const names = new Set<string>();

	try {
		const content = card.content || "";
		const match = content.match(/we_decks:\s*\n((?:\s+-\s+.+\n?)+)/);
		if (match) {
			for (const entry of match[1].matchAll(/-\s+(.+)/g)) {
				const name = entry[1].trim().replace(/^["']|["']$/g, "");
				if (name) names.add(name);
			}
		}
	} catch {
		// ignore malformed YAML
	}

	const marker = card.customFields?.wdeck;
	if (marker && typeof marker === "object") {
		const logicalDeckName = (readUnknownString(marker, "logicalDeckName") ?? "").trim();
		if (logicalDeckName) {
			names.add(logicalDeckName);
		}
	}

	return Array.from(names);
}

function cardHasUserSourceLink(card: Card): boolean {
	try {
		const yaml = parseYAMLFromContent(card.content || "");
		return typeof yaml.we_source === "string" && yaml.we_source.trim().length > 0;
	} catch {
		return false;
	}
}

function cardHasFormalWeDecksInContent(card: Card): boolean {
	try {
		const yaml = parseYAMLFromContent(card.content || "");
		return Array.isArray(yaml.we_decks) && yaml.we_decks.length > 0;
	} catch {
		return false;
	}
}

export function cardBelongsToTutorialDeck(card: Card): boolean {
	return readTutorialDeckNames(card).some((name) =>
		TUTORIAL_DECK_NAME_SET.has(normalizeTutorialText(name))
	);
}

export function cardMatchesTutorialSignature(card: Card): boolean {
	const normalizedBody = normalizeTutorialText(card.content || "");
	if (!normalizedBody) {
		return false;
	}

	return TUTORIAL_CARD_SIGNATURES.some((signature) => normalizedBody.includes(signature));
}

/**
 * 判断正文特征匹配的卡片是否像「散落教程副本」，而非用户自定义牌组中的正常卡片。
 */
export function cardLooksLikeScatteredTutorialClone(card: Card): boolean {
	if (cardHasUserSourceLink(card)) {
		return false;
	}

	const deckNames = readTutorialDeckNames(card);
	if (deckNames.some((name) => TUTORIAL_DECK_NAME_SET.has(normalizeTutorialText(name)))) {
		return true;
	}

	if (deckNames.some((name) => TUTORIAL_SCATTER_DECK_NAME_SET.has(normalizeTutorialText(name)))) {
		return true;
	}

	// YAML 尚无 we_decks，但运行时仍注入了牌组归属（常见于迁移残留）
	if (!cardHasFormalWeDecksInContent(card) && (card.deckId || card.referencedByDecks?.length)) {
		return true;
	}

	return false;
}

/** 判断是否为应清理的废弃教程牌组卡片 */
export function isTutorialDeckResidueCard(card: Card): boolean {
	if (!card?.uuid) {
		return false;
	}

	if (cardBelongsToTutorialDeck(card)) {
		return true;
	}

	return cardMatchesTutorialSignature(card) && cardLooksLikeScatteredTutorialClone(card);
}

export function collectTutorialDeckResidueCards(cards: Card[]): Card[] {
	return cards.filter((card) => isTutorialDeckResidueCard(card));
}
