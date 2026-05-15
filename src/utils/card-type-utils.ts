/**
 * 卡片题型识别工具函数
 * 提供统一的题型识别和元数据获取功能
 */

import { getOfficialTemplateById } from "../constants/official-templates";
import type { Card } from "../data/types";
import type { CardType as ParserCardType } from "../parsers/MarkdownFieldsConverter";
import {
	CARD_TYPE_MAPPINGS,
	CARD_TYPE_METADATA,
	UnifiedCardType,
	getCardTypeIcon,
	getCardTypeName,
} from "../types/unified-card-types";
import { hasAnyClozeSyntax } from "./cloze-syntax";
import { getCardProperty } from "./yaml-utils";

type CardTypeResolutionInput = Pick<Card, "content" | "templateId" | "type">;

function normalizeTypeToken(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function detectFallbackCardTypeFromContent(content?: string): "basic" | "cloze" | "multiple" {
	if (!content || !content.trim()) {
		return "basic";
	}

	if (hasAnyClozeSyntax(content)) {
		return "cloze";
	}

	if (content.includes("---choice---") || /^[A-D][.)．、）]\s*/m.test(content)) {
		return "multiple";
	}

	return "basic";
}

export function resolveStoredCardType(card: Pick<Card, "content" | "type"> | undefined): string {
	const explicitType = normalizeTypeToken(card?.type);
	if (explicitType) {
		return explicitType;
	}

	const yamlType = normalizeTypeToken(
		card?.content ? getCardProperty<string>(card.content, "we_type") : ""
	);
	if (yamlType) {
		return yamlType;
	}

	return detectFallbackCardTypeFromContent(card?.content);
}

export function resolveParserCardType(
	card: Pick<Card, "content" | "type"> | undefined
): ParserCardType {
	const resolvedType = resolveStoredCardType(card);

	if (resolvedType.includes("cloze") || resolvedType.startsWith("progressive")) {
		return "cloze-deletion";
	}

	if (resolvedType === "single" || resolvedType.includes("single-choice")) {
		return "single-choice";
	}

	if (
		resolvedType === "multiple" ||
		resolvedType === "choice" ||
		resolvedType === "mcq" ||
		resolvedType.includes("multiple-choice") ||
		resolvedType.includes("choice")
	) {
		return "multiple-choice";
	}

	return "basic-qa";
}

export function resolveAnkiExportCardType(
	input: CardTypeResolutionInput | string | undefined
): "basic" | "multiple" | "cloze" {
	const resolvedType =
		typeof input === "string" ? normalizeTypeToken(input) : resolveStoredCardType(input);

	if (resolvedType.includes("cloze") || resolvedType.startsWith("progressive")) {
		return "cloze";
	}

	if (
		resolvedType === "multiple" ||
		resolvedType === "single" ||
		resolvedType === "choice" ||
		resolvedType === "mcq" ||
		resolvedType.includes("choice")
	) {
		return "multiple";
	}

	return "basic";
}

export function resolveOfficialTemplateId(card: CardTypeResolutionInput): string {
	const normalizedTemplateId = normalizeTypeToken(card.templateId);
	if (normalizedTemplateId) {
		return normalizedTemplateId;
	}

	switch (resolveAnkiExportCardType(card)) {
		case "cloze":
			return "official-cloze";
		case "multiple":
			return "official-choice";
		default:
			return "official-qa";
	}
}

/**
 * 智能识别卡片的题型
 *
 * 识别策略：
 * 1. 优先从官方模板映射
 * 2. 从 templateId 字符串模式推断
 * 3. 使用映射表转换 card.type
 * 4. 默认返回基础问答题型
 *
 * @param card - 卡片对象
 * @returns 统一的题型枚举
 */
export function detectCardQuestionType(card: Card): UnifiedCardType {
	if (!card) {
		return UnifiedCardType.BASIC_QA;
	}

	// 策略1: 从官方模板查找
	if (card.templateId) {
		const officialTemplate = getOfficialTemplateById(card.templateId);
		if (officialTemplate) {
			// 官方模板可能有 cardType 字段指示题型
			const cardType = (officialTemplate as any).cardType;
			if (cardType) {
				const mapping = CARD_TYPE_MAPPINGS.find((m) => m.from === cardType);
				if (mapping) {
					return mapping.to;
				}
			}
		}

		// 策略2: 从 templateId 字符串模式推断
		const templateId = card.templateId.toLowerCase();

		if (
			templateId.includes("choice") ||
			templateId.includes("mcq") ||
			templateId.includes("multiple")
		) {
			if (templateId.includes("single")) {
				return UnifiedCardType.SINGLE_CHOICE;
			}
			if (templateId.includes("multiple")) {
				return UnifiedCardType.MULTIPLE_CHOICE;
			}
			// 默认单选
			return UnifiedCardType.SINGLE_CHOICE;
		}

		if (templateId.includes("cloze") || templateId.includes("挖空")) {
			return UnifiedCardType.CLOZE_DELETION;
		}

		if (
			templateId.includes("fill") ||
			templateId.includes("blank") ||
			templateId.includes("填空")
		) {
			return UnifiedCardType.FILL_IN_BLANK;
		}

		if (templateId.includes("sequence") || templateId.includes("顺序")) {
			return UnifiedCardType.SEQUENCE;
		}
	}

	// 策略3: 使用归一化后的题型映射（兼容 YAML we_type 和内容回退）
	const resolvedType = resolveStoredCardType(card);
	const mapping = CARD_TYPE_MAPPINGS.find((m) => m.from === resolvedType);
	if (mapping) {
		return mapping.to;
	}

	// 策略4: 默认基础问答
	return UnifiedCardType.BASIC_QA;
}

/**
 * 获取题型的图标名称
 * @param cardType - 题型枚举
 * @returns 图标名称字符串
 */
export function getQuestionTypeIcon(cardType: UnifiedCardType): string {
	// 使用 unified-card-types 中的图标映射
	return getCardTypeIcon(cardType);
}

/**
 * 获取题型的显示名称
 * @param cardType - 题型枚举
 * @returns 中文显示名称
 */
export function getQuestionTypeName(cardType: UnifiedCardType): string {
	return getCardTypeName(cardType);
}

/**
 * 获取题型的元数据
 * @param cardType - 题型枚举
 * @returns 题型完整元数据
 */
export function getQuestionTypeMetadata(cardType: UnifiedCardType) {
	return CARD_TYPE_METADATA[cardType];
}

/**
 * 批量统计卡片的题型分布
 * @param cards - 卡片数组
 * @returns 题型分布统计对象 { [题型]: 数量 }
 */
export function getQuestionTypeDistribution(cards: Card[]): Record<string, number> {
	const distribution: Record<string, number> = {};

	for (const card of cards) {
		const questionType = detectCardQuestionType(card);
		distribution[questionType] = (distribution[questionType] || 0) + 1;
	}

	return distribution;
}
