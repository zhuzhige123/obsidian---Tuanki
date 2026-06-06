import { logger } from "../utils/logger";
/**
 * Card 字段辅助工具
 *
 * Content-Only 架构下，从 card.content 动态解析字段的便捷工具
 *
 * 使用示例：
 * ```typescript
 * import { getCardField, getCardFields } from './utils/card-field-helper';
 *
 * // 获取单个字段
 * const front = getCardField(card, 'front');
 *
 * // 获取所有字段
 * const { front, back } = getCardFields(card);
 * ```
 *
 * @module utils/card-field-helper
 */

import type { Card } from "../data/types";
import type { CardType, MarkdownFieldsConverter } from "../parsers/MarkdownFieldsConverter";
import { ChoiceCardParser } from "../parsers/card-type-parsers/ChoiceCardParser";
import { ClozeCardParser } from "../parsers/card-type-parsers/ClozeCardParser";
import { QACardParser } from "../parsers/card-type-parsers/QACardParser";
import type { ParseResult } from "../types/metadata-types";
import { resolveParserCardType } from "./card-type-utils";

/**
 * Parser 缓存（避免重复创建）
 */
const parserCache = new Map<CardType, MarkdownFieldsConverter>();

/**
 * 获取对应卡片类型的 Parser
 */
function getParser(type: CardType): MarkdownFieldsConverter {
	if (!parserCache.has(type)) {
		switch (type) {
			case "basic-qa":
				parserCache.set(type, new QACardParser());
				break;
			case "single-choice":
			case "multiple-choice":
				parserCache.set(type, new ChoiceCardParser());
				break;
			case "cloze-deletion":
				parserCache.set(type, new ClozeCardParser());
				break;
			default:
				parserCache.set(type, new QACardParser()); // 默认使用 QA Parser
		}
	}
	const parser = parserCache.get(type);
	if (parser) {
		return parser;
	}
	const fallbackParser = new QACardParser();
	parserCache.set(type, fallbackParser);
	return fallbackParser;
}

function parseFieldsFromContent(
	parser: MarkdownFieldsConverter,
	content: string,
	cardType: CardType
): Record<string, string> | null {
	try {
		const result: ParseResult = parser.parseMarkdownToFields(content, cardType);
		if (result.success && result.fields) {
			return result.fields;
		}
	} catch (error) {
		logger.warn("[CardFieldHelper] 解析 content 失败:", error);
	}
	return null;
}

/**
 * 从卡片获取单个字段
 *
 * @param card 卡片对象
 * @param fieldName 字段名（如 'front', 'back', 'text'）
 * @returns 字段值，如果不存在返回空字符串
 *
 * @example
 * ```typescript
 * const front = getCardField(card, 'front');
 * const back = getCardField(card, 'back');
 * ```
 */
export function getCardField(card: Card, fieldName: string): string {
	// 1. 优先使用 content（权威数据源）
	if (card.content?.trim()) {
		const cardType = resolveParserCardType(card);
		const fields = parseFieldsFromContent(getParser(cardType), card.content, cardType);
		if (fields) {
			return fields[fieldName] || "";
		}
	}

	// 2. 降级：如果 content 解析失败，尝试从 fields 读取（向后兼容）
	if (card.fields?.[fieldName]) {
		return card.fields[fieldName];
	}

	return "";
}

export function getCardFieldContent(card: Card, fieldName: string): string {
	return getCardField(card, fieldName);
}

/**
 * 从卡片获取所有解析字段
 *
 * @param card 卡片对象
 * @returns 解析后的字段对象
 *
 * @example
 * ```typescript
 * const { front, back } = getCardFields(card);
 * ```
 */
export function getCardFields(card: Card): Record<string, string> {
	// 1. 优先使用 content（权威数据源）
	if (card.content?.trim()) {
		const cardType = resolveParserCardType(card);
		const fields = parseFieldsFromContent(getParser(cardType), card.content, cardType);
		if (fields) {
			return fields;
		}
	}

	// 2. 降级：如果 content 解析失败，返回 fields（向后兼容）
	if (card.fields) {
		return card.fields;
	}

	return {};
}

export function getCardFieldsByType(card: Card, type: CardType): Record<string, string> {
	if (card.content?.trim()) {
		const fields = parseFieldsFromContent(getParser(type), card.content, type);
		if (fields) {
			return fields;
		}
	}

	if (card.fields) {
		return card.fields;
	}

	return {};
}

/**
 * 获取卡片的正面内容
 * 自动处理不同字段名的兼容性
 *
 * @param card 卡片对象
 * @returns 正面内容
 */
export function getCardFront(card: Card): string {
	const fields = getCardFields(card);
	return fields.front || fields.question || fields.text || "";
}

/**
 * 获取卡片的背面内容
 * 自动处理不同字段名的兼容性
 *
 * @param card 卡片对象
 * @returns 背面内容
 */
export function getCardBack(card: Card): string {
	const fields = getCardFields(card);
	return fields.back || fields.answer || "";
}

/**
 * 检查卡片内容是否有效
 *
 * @param card 卡片对象
 * @returns 是否有有效内容
 */
export function hasValidContent(card: Card): boolean {
	if (card.content?.trim()) {
		return true;
	}

	if (card.fields && Object.keys(card.fields).length > 0) {
		return true;
	}

	return false;
}

/**
 * 缓存解析结果的 WeakMap（避免重复解析）
 * 使用 WeakMap 确保卡片对象被GC时，缓存也会被清理
 */
const parseResultCache = new WeakMap<
	Card,
	{
		fields: Record<string, string>;
		timestamp: number;
	}
>();

/**
 * 获取卡片字段（带缓存）
 *
 * 在渲染大量卡片时使用，可显著提升性能
 * 注意：如果卡片内容被修改，需要清除缓存
 *
 * @param card 卡片对象
 * @param maxCacheAge 最大缓存时长（毫秒），默认 60 秒
 * @returns 解析后的字段对象
 *
 * @example
 * ```typescript
 * // 在网格视图中渲染大量卡片
 * cards.forEach(card => {
 *   const { front } = getCardFieldsCached(card);
 *   render(front);
 * });
 * ```
 */
export function getCardFieldsCached(card: Card, maxCacheAge = 60000): Record<string, string> {
	const cached = parseResultCache.get(card);
	const now = Date.now();

	// 检查缓存是否有效
	if (cached && now - cached.timestamp < maxCacheAge) {
		return cached.fields;
	}

	// 重新解析
	const fields = getCardFields(card);

	// 缓存结果
	parseResultCache.set(card, {
		fields,
		timestamp: now,
	});

	return fields;
}

/**
 * 清除单个卡片的解析缓存
 * 在卡片内容被修改后调用
 *
 * @param card 卡片对象
 */
export function clearCardFieldCache(card: Card): void {
	parseResultCache.delete(card);
}

/**
 * 批量获取多个卡片的字段
 * 性能优化：并行解析
 *
 * @param cards 卡片数组
 * @returns 字段映射 Map，key 为 card.uuid
 */
export function batchGetCardFields(cards: Card[]): Map<string, Record<string, string>> {
	const result = new Map<string, Record<string, string>>();

	for (const card of cards) {
		try {
			const fields = getCardFieldsCached(card);
			result.set(card.uuid, fields);
		} catch (error) {
			logger.warn(`[CardFieldHelper] 批量解析失败: ${card.uuid}`, error);
			result.set(card.uuid, {});
		}
	}

	return result;
}
