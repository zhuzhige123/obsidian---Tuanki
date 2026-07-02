/**
 * 牌组看板视图类型定义
 *
 * 用于牌组学习界面的看板分组功能
 */

import type { Deck } from "../data/types";

/**
 * 牌组标签组
 */
export interface DeckTagGroup {
	id: string; // 唯一标识
	name: string; // 标签组名称（如"循环系统"）
	tags: string[]; // 包含的标签列表
	icon?: string; // 图标（可选）
	color?: string; // 主题色（可选）
	description?: string; // 描述（可选）
}

export const DECK_TAG_EMPTY_GROUP_KEY = "__weave_internal__no-tag";
export const DECK_TAG_GROUP_OTHER_KEY = "__weave_internal__other-tag-group";

const DECK_TAG_COLUMN_KEY_PREFIX = "__weave_tag__:";

export function normalizeDeckTagName(tag: string): string {
	return tag.trim();
}

export function normalizeDeckTagGroupTags(tags: readonly string[]): string[] {
	const normalized: string[] = [];
	const seen = new Set<string>();

	for (const rawTag of tags) {
		if (typeof rawTag !== "string") continue;
		const tag = normalizeDeckTagName(rawTag);
		if (!tag || seen.has(tag)) continue;
		seen.add(tag);
		normalized.push(tag);
	}

	return normalized;
}

export function normalizeDeckTagGroup(tagGroup: DeckTagGroup): DeckTagGroup {
	return {
		...tagGroup,
		name: tagGroup.name.trim(),
		tags: normalizeDeckTagGroupTags(tagGroup.tags),
	};
}

export function findMatchingTagInDeckTagGroup(
	tags: readonly string[] | undefined,
	tagGroup: DeckTagGroup
): string | null {
	if (!tags || tags.length === 0) {
		return null;
	}

	const normalizedTagSet = new Set(tags.map((tag) => normalizeDeckTagName(tag)).filter(Boolean));
	if (normalizedTagSet.size === 0) {
		return null;
	}

	for (const tag of normalizeDeckTagGroupTags(tagGroup.tags)) {
		if (normalizedTagSet.has(tag)) {
			return tag;
		}
	}

	return null;
}

export function createDeckTagColumnKey(tag: string): string {
	return `${DECK_TAG_COLUMN_KEY_PREFIX}${normalizeDeckTagName(tag)}`;
}

export function getDeckTagLabelFromColumnKey(key: string): string | null {
	if (!key.startsWith(DECK_TAG_COLUMN_KEY_PREFIX)) {
		return null;
	}

	const label = key.slice(DECK_TAG_COLUMN_KEY_PREFIX.length).trim();
	return label || null;
}

/**
 * 牌组分组类型
 */
export type DeckGroupByType =
	| "completion" // 完成情况（默认）
	| "timeRange" // 时间范围
	| "priority" // 优先级
	| "accuracy" // 正确率（考试题组）
	| "tag" // 标签分组（所有标签）
	| "tagGroup"; // 标签组分组（选定的标签组）

/**
 * 看板列定义
 */
export interface DeckKanbanColumn {
	key: string; // 列的唯一标识
	label: string; // 列的显示名称
	color: string; // 列的主题颜色
	icon: string; // 列的图标名称
	decks: Deck[]; // 该列包含的牌组
}

/**
 * 牌组聚合结果
 */
export interface DeckAggregationResult {
	groupBy: DeckGroupByType;
	columns: DeckKanbanColumn[];
	totalDecks: number;
}

/**
 * 分组配置
 */
export interface GroupConfig {
	title: string; // 分组方式的名称
	icon: string; // 分组方式的图标
	groups: GroupDefinition[];
}

/**
 * 分组定义
 */
export interface GroupDefinition {
	key: string; // 分组key
	label: string; // 分组显示名称
	color: string; // 分组颜色
	icon: string; // 分组图标
}

/**
 * 分组配置常量（结构定义：key / color / icon）。
 * 显示文案由 localizeDeckGroupConfig() 通过 i18n 注入，勿直接使用 title / label。
 */
export const DECK_GROUP_CONFIGS: Record<DeckGroupByType, GroupConfig> = {
		completion: {
		title: "",
		icon: "check-circle",
		groups: [
			{ key: "new", label: "", color: "#10b981", icon: "circle" },
			{ key: "learning", label: "", color: "#f59e0b", icon: "book-open" },
			{ key: "review", label: "", color: "#3b82f6", icon: "refresh-cw" },
			{ key: "completed", label: "", color: "#6b7280", icon: "check-circle" },
		],
	},
	timeRange: {
		title: "",
		icon: "clock",
		groups: [
			{ key: "urgent", label: "", color: "#ef4444", icon: "alert-circle" },
			{ key: "today", label: "", color: "#f59e0b", icon: "sun" },
			{ key: "thisWeek", label: "", color: "#3b82f6", icon: "calendar" },
			{ key: "future", label: "", color: "#6b7280", icon: "clock" },
		],
	},
	priority: {
		title: "",
		icon: "flag",
		groups: [
			{ key: "high", label: "", color: "#ef4444", icon: "alert-triangle" },
			{ key: "medium", label: "", color: "#f59e0b", icon: "flag" },
			{ key: "low", label: "", color: "#10b981", icon: "minus-circle" },
			{ key: "none", label: "", color: "#6b7280", icon: "circle" },
		],
	},
	accuracy: {
		title: "",
		icon: "percent",
		groups: [
			{ key: "untested", label: "", color: "#6b7280", icon: "circle-dashed" },
			{ key: "excellent", label: "", color: "#10b981", icon: "award" },
			{ key: "good", label: "", color: "#3b82f6", icon: "trending-up" },
			{ key: "poor", label: "", color: "#ef4444", icon: "alert-circle" },
		],
	},
	tag: {
		title: "",
		icon: "tag",
		groups: [
			{ key: "noTag", label: "", color: "#6b7280", icon: "circle" },
		],
	},
	tagGroup: {
		title: "",
		icon: "tags",
		groups: [
			{ key: "__other__", label: "", color: "#6b7280", icon: "circle" },
		],
	},
};
