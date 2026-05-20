/**
 * 卡片关系工具函数
 * 用于处理父子卡片关系、时间线构建等
 */

import type { Card } from "../data/types";
import { DerivationMethod } from "../services/relation/types";
import { getCardFront } from "./card-field-helper";

// ============================================================================
// 类型定义
// ============================================================================

export type CardHistoryEventType = "created" | "split" | "modified" | "merged" | "deleted";

export interface CardHistoryEvent {
	timestamp: string;
	type: CardHistoryEventType;
	description: string;
	actor?: "user" | "ai" | "system";
	relatedCardIds?: string[];
	splitMethod?: DerivationMethod;
	metadata?: Record<string, unknown>;
}

export type TimelineDisplayMode = "simple" | "compact" | "full";

const derivationMethodTranslationKeys: Record<string, string> = {
	[DerivationMethod.AI_SPLIT]: "cards.relationMethods.aiSplit",
	[DerivationMethod.MANUAL]: "cards.relationMethods.manual",
	[DerivationMethod.INCREMENTAL]: "cards.relationMethods.incremental",
	[DerivationMethod.IMPORT]: "cards.relationMethods.import",
};

const derivationMethodFallbackNames: Record<string, string> = {
	[DerivationMethod.AI_SPLIT]: "AI Split",
	[DerivationMethod.MANUAL]: "Manual Split",
	[DerivationMethod.INCREMENTAL]: "Incremental Reading",
	[DerivationMethod.IMPORT]: "Imported",
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 移除HTML标签，返回纯文本
 */
export function stripHtml(html: string): string {
	if (!html) return "";
	return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * 获取卡片预览文本
 * 优先使用 content 作为预览文本来源
 * 回退顺序：content > 统一字段解析 > UUID
 */
export function getCardPreview(card: Card, maxLength = 100): string {
	// 优先使用 content 作为权威文本来源
	if (card.content) {
		const text = stripHtml(card.content);
		if (text.length > 0) {
			return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
		}
	}

	// 优先级2: 统一字段解析（内部仍保留兼容回退）
	const frontText = getCardFront(card);
	if (frontText) {
		const text = stripHtml(frontText);
		return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
	}

	// 优先级3: UUID
	return `卡片 ${card.uuid.substring(0, 16)}...`;
}

/**
 * 获取派生方法的显示名称
 */
export function getDerivationMethodTranslationKey(method: DerivationMethod | string): string | null {
	return derivationMethodTranslationKeys[method] ?? null;
}

export function getDerivationMethodName(
	method: DerivationMethod | string,
	translate?: (key: string) => string
): string {
	const translationKey = getDerivationMethodTranslationKey(method);
	if (translationKey && translate) {
		return translate(translationKey);
	}

	return derivationMethodFallbackNames[method] || method;
}

/**
 * 格式化时间线时间戳
 * 格式：YYYY/MM/DD HH:mm
 */
export function formatTimelineTimestamp(timestamp: string): string {
	try {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		return `${year}/${month}/${day} ${hours}:${minutes}`;
	} catch {
		return timestamp;
	}
}

/**
 * 构建虚拟时间线
 * 基于现有数据构建事件列表
 */
export function buildVirtualTimeline(card: Card): CardHistoryEvent[] {
	const events: CardHistoryEvent[] = [];

	// 事件1: 创建事件
	if (card.created) {
		events.push({
			timestamp: card.created,
			type: "created",
			description: card.parentCardId ? "从父卡片拆分而来" : "卡片创建",
			actor: card.parentCardId ? "ai" : "user",
		});
	}

	// 事件2: 拆分事件（如果是子卡片）
	if (card.relationMetadata?.derivationMetadata) {
		const derivation = card.relationMetadata.derivationMetadata;
		events.push({
			timestamp: derivation.splitTimestamp,
			type: "split",
			description: `${getDerivationMethodName(derivation.method)}生成`,
			actor: derivation.method === DerivationMethod.AI_SPLIT ? "ai" : "user",
			splitMethod: derivation.method,
			relatedCardIds: card.parentCardId ? [card.parentCardId] : undefined,
		});
	}

	// 事件3: 修改事件
	if (card.modified && card.modified !== card.created) {
		events.push({
			timestamp: card.modified,
			type: "modified",
			description: "内容修改",
			actor: "user",
		});
	}

	// 按时间排序
	return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/**
 * 决定时间线显示模式
 * - simple: 1-2个事件，极简显示
 * - compact: 3-5个事件，紧凑显示
 * - full: >5个事件或复杂关系，完整显示
 */
export function getTimelineDisplayMode(
	card: Card,
	eventCount: number,
	siblingCount: number
): TimelineDisplayMode {
	// 复杂关系：有父卡片且有多个兄弟卡片
	const hasComplexRelation = card.parentCardId && siblingCount > 5;

	// 事件很多
	const hasManyEvents = eventCount > 5;

	if (hasComplexRelation || hasManyEvents) {
		return "full";
	} else if (eventCount >= 3 && eventCount <= 5) {
		return "compact";
	} else {
		return "simple";
	}
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return `${text.substring(0, maxLength)}...`;
}
