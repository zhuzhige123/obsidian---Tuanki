import { parseYaml } from "obsidian";
import { getColorSchemeForDeck } from "../../config/card-color-schemes";
import type { Deck, DeckStats } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { waitForServiceReady } from "../../utils/service-ready-event";
import { isRecord } from "../../utils/typed-json";

export const WEAVE_DECKS_CODE_BLOCK_LANGUAGE = "weave-decks";

export interface WeaveDeckCodeBlockConfig {
	title?: string;
	deckIds?: string[];
	deckNames?: string[];
	limit?: number;
	sort?: "name" | "due";
	size?: "small" | "medium" | "large";
}

export interface RenderableDeckCard {
	deck: Deck;
	stats: DeckStats;
	colorScheme: ReturnType<typeof getColorSchemeForDeck>;
}

const DEFAULT_DECK_STATS: DeckStats = {
	totalCards: 0,
	newCards: 0,
	learningCards: 0,
	reviewCards: 0,
	todayNew: 0,
	todayReview: 0,
	todayTime: 0,
	totalReviews: 0,
	totalTime: 0,
	memoryRate: 0,
	averageEase: 0,
	forecastDays: {},
};

export function parseWeaveDeckCodeBlockSource(source: string): WeaveDeckCodeBlockConfig {
	const trimmed = source.trim();
	if (!trimmed) {
		return {};
	}

	try {
		const parsedYaml: unknown = parseYaml(trimmed);
		if (isRecord(parsedYaml)) {
			const parsed = parsedYaml;
			const explicitDeckNames = normalizeStringList(parsed.deckNames);
			const fallbackDeckNames = explicitDeckNames ?? normalizeStringList(parsed.deckIds);

			return {
				title: readOptionalString(parsed.title),
				deckIds: normalizeStringList(parsed.deckIds),
				deckNames: fallbackDeckNames,
				limit: readOptionalNumber(parsed.limit),
				sort: parsed.sort === "due" ? "due" : "name",
				size: readCardSize(parsed.size),
			};
		}
	} catch {
		// fall through to plain-text parsing
	}

	const plainLines = trimmed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !line.startsWith("#"));

	if (plainLines.length === 0) {
		return {};
	}

	return {
		deckNames: plainLines,
	};
}

export async function loadRenderableDeckCards(
	plugin: WeavePlugin,
	source: string
): Promise<{ config: WeaveDeckCodeBlockConfig; decks: RenderableDeckCard[] }> {
	const config = parseWeaveDeckCodeBlockSource(source);
	if (!plugin.dataStorage) {
		await waitForServiceReady("dataStorage", 15000).catch(() => undefined);
	}

	if (!plugin.dataStorage) {
		throw new Error("Weave 数据尚未初始化完成，请稍后重试");
	}

	const allDecks = await plugin.dataStorage.getAllDecks();
	let filteredDecks = [...allDecks];

	const requestedDeckNames = new Set((config.deckNames || []).map(normalizeKey));
	const requestedDeckIds = new Set((config.deckIds || []).map(normalizeKey));

	if (requestedDeckIds.size > 0 || requestedDeckNames.size > 0) {
		filteredDecks = filteredDecks.filter((deck) => {
			const id = normalizeKey(deck.id);
			const name = normalizeKey(deck.name);
			const path = normalizeKey(deck.path);
			return (
				requestedDeckIds.has(id) || requestedDeckNames.has(name) || requestedDeckNames.has(path)
			);
		});
	}

	if (config.sort === "due") {
		filteredDecks.sort((a, b) => {
			const aDue = totalDue(a.stats);
			const bDue = totalDue(b.stats);
			if (aDue !== bDue) return bDue - aDue;
			if (a.order !== b.order) return a.order - b.order;
			return a.name.localeCompare(b.name, "zh-Hans-CN");
		});
	} else {
		filteredDecks.sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return a.name.localeCompare(b.name, "zh-Hans-CN");
		});
	}

	if (typeof config.limit === "number" && config.limit > 0) {
		filteredDecks = filteredDecks.slice(0, config.limit);
	}

	return {
		config,
		decks: filteredDecks.map((deck) => ({
			deck,
			stats: normalizeDeckStats(deck.stats),
			colorScheme: getColorSchemeForDeck(deck.id),
		})),
	};
}

function normalizeDeckStats(stats?: Partial<DeckStats> | null): DeckStats {
	if (!stats) {
		return { ...DEFAULT_DECK_STATS };
	}

	return {
		...DEFAULT_DECK_STATS,
		...stats,
		newCards: readNumber(stats.newCards ?? stats.newCount),
		learningCards: readNumber(stats.learningCards),
		reviewCards: readNumber(stats.reviewCards ?? stats.reviewCount),
		totalCards: readNumber(stats.totalCards),
		todayNew: readNumber(stats.todayNew),
		todayReview: readNumber(stats.todayReview),
		todayTime: readNumber(stats.todayTime),
		totalReviews: readNumber(stats.totalReviews),
		totalTime: readNumber(stats.totalTime),
		memoryRate: readNumber(stats.memoryRate),
		averageEase: readNumber(stats.averageEase),
		forecastDays:
			stats.forecastDays && typeof stats.forecastDays === "object" ? stats.forecastDays : {},
	};
}

function normalizeStringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const list = value
		.map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
		.filter(Boolean);
	return list.length > 0 ? list : undefined;
}

function readOptionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed || undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
	if (value === null || value === undefined || value === "") return undefined;
	const num = Number(value);
	return Number.isFinite(num) ? num : undefined;
}

function readCardSize(value: unknown): "small" | "medium" | "large" | undefined {
	if (typeof value !== "string") return undefined;

	const normalized = value.trim().toLocaleLowerCase();
	if (!normalized) return undefined;

	switch (normalized) {
		case "small":
		case "sm":
		case "s":
		case "小":
			return "small";
		case "large":
		case "lg":
		case "l":
		case "大":
			return "large";
		case "medium":
		case "md":
		case "m":
		case "normal":
		case "default":
		case "中":
			return "medium";
		default:
			return undefined;
	}
}

function readNumber(value: unknown): number {
	const num = Number(value ?? 0);
	return Number.isFinite(num) ? num : 0;
}

function totalDue(stats: Partial<DeckStats> | undefined): number {
	return (
		readNumber(stats?.newCards ?? stats?.newCount) +
		readNumber(stats?.learningCards) +
		readNumber(stats?.reviewCards ?? stats?.reviewCount)
	);
}

function normalizeKey(value: string): string {
	return value.trim().toLocaleLowerCase();
}
