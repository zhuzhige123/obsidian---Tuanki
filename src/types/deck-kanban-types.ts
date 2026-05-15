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
 * 分组配置常量
 */
export const DECK_GROUP_CONFIGS: Record<DeckGroupByType, GroupConfig> = {
	completion: {
		title: "完成情况",
		icon: "check-circle",
		groups: [
			{ key: "new", label: "新卡片", color: "#10b981", icon: "circle" },
			{ key: "learning", label: "学习中", color: "#f59e0b", icon: "book-open" },
			{ key: "review", label: "待复习", color: "#3b82f6", icon: "refresh-cw" },
			{ key: "completed", label: "已完成", color: "#6b7280", icon: "check-circle" },
		],
	},
	timeRange: {
		title: "时间范围",
		icon: "clock",
		groups: [
			{ key: "urgent", label: "紧急", color: "#ef4444", icon: "alert-circle" },
			{ key: "today", label: "今日", color: "#f59e0b", icon: "sun" },
			{ key: "thisWeek", label: "本周", color: "#3b82f6", icon: "calendar" },
			{ key: "future", label: "未来", color: "#6b7280", icon: "clock" },
		],
	},
	priority: {
		title: "优先级",
		icon: "flag",
		groups: [
			{ key: "high", label: "高优先级", color: "#ef4444", icon: "alert-triangle" },
			{ key: "medium", label: "中优先级", color: "#f59e0b", icon: "flag" },
			{ key: "low", label: "低优先级", color: "#10b981", icon: "minus-circle" },
			{ key: "none", label: "无优先级", color: "#6b7280", icon: "circle" },
		],
	},
	tag: {
		title: "标签分组",
		icon: "tag",
		groups: [
			// 动态生成，根据牌组的标签
			{ key: "noTag", label: "无标签", color: "#6b7280", icon: "circle" },
		],
	},
	tagGroup: {
		title: "标签组分组",
		icon: "tags",
		groups: [
			// 动态生成，根据选定的标签组
			{ key: "__other__", label: "其他", color: "#6b7280", icon: "circle" },
		],
	},
};

/**
 * 分组方式标签映射
 */
export const DECK_GROUP_BY_LABELS: Record<DeckGroupByType, string> = {
	completion: "完成情况",
	timeRange: "时间范围",
	priority: "优先级",
	tag: "标签分组",
	tagGroup: "标签组分组",
};
