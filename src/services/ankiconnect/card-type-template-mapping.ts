import type {
	AnkiSyncCardType,
	CardTypeTemplateMapping,
	DeckSyncMapping,
} from "../../components/settings/types/settings-types";
import type { Card } from "../../data/types";
import { resolveOfficialTemplateId, resolveParserCardType } from "../../utils/card-type-utils";

export interface CardTypeFieldDefinition {
	key: string;
	label: string;
	required?: boolean;
	description?: string;
	aliases?: string[];
}

export interface CardTypeTemplateMappingConfig {
	label: string;
	description: string;
	nativeModelType: "basic" | "multiple" | "cloze";
	standardFields: CardTypeFieldDefinition[];
}

const COMMON_OPTIONAL_FIELDS: CardTypeFieldDefinition[] = [
	{
		key: "hint",
		label: "提示",
		description: "卡片中的提示块",
	},
	{
		key: "explanation",
		label: "解析",
		description: "正文分隔线后的补充说明",
		aliases: ["extra", "backextra"],
	},
	{
		key: "source",
		label: "Obsidian回链",
		description: "用于跳回原文的链接字段",
		aliases: ["backlink", "obsidianbacklink", "obsidianlink"],
	},
	{
		key: "tags",
		label: "标签",
		description: "卡片标签，会同时写入 Anki tags",
	},
];

const BASIC_QA_FIELDS: CardTypeFieldDefinition[] = [
	{
		key: "question",
		label: "问题",
		required: true,
		description: "问答题题面",
		aliases: ["front", "prompt"],
	},
	{
		key: "answer",
		label: "答案",
		required: true,
		description: "问答题答案",
		aliases: ["back", "response"],
	},
	...COMMON_OPTIONAL_FIELDS,
];

const CHOICE_FIELDS: CardTypeFieldDefinition[] = [
	{
		key: "question",
		label: "问题",
		required: true,
		description: "选择题题面",
		aliases: ["front", "prompt"],
	},
	{
		key: "options",
		label: "选项",
		required: true,
		description: "规范化后的选项列表",
		aliases: ["choices"],
	},
	{
		key: "answer",
		label: "答案",
		description: "带选项文本的答案展示",
		aliases: ["back", "correctanswerdisplay"],
	},
	{
		key: "correctAnswers",
		label: "正确选项",
		description: "仅保留答案标签，如 A,B",
		aliases: ["correctanswer", "correct_answer", "answerkey"],
	},
	...COMMON_OPTIONAL_FIELDS,
];

const CLOZE_FIELDS: CardTypeFieldDefinition[] = [
	{
		key: "text",
		label: "文本",
		required: true,
		description: "已转换为 Anki 挖空语法的正文",
		aliases: ["content", "cloze"],
	},
	...COMMON_OPTIONAL_FIELDS,
];

export const CARD_TYPE_TEMPLATE_MAPPING_ORDER: AnkiSyncCardType[] = [
	"basic-qa",
	"single-choice",
	"multiple-choice",
	"cloze-deletion",
];

export const CARD_TYPE_TEMPLATE_MAPPING_CONFIG: Record<
	AnkiSyncCardType,
	CardTypeTemplateMappingConfig
> = {
	"basic-qa": {
		label: "问答题",
		description: "适用于正反面问答、概念题、简答题",
		nativeModelType: "basic",
		standardFields: BASIC_QA_FIELDS,
	},
	"single-choice": {
		label: "单选题",
		description: "先识别为单选题，再选择目标 Anki 模板",
		nativeModelType: "multiple",
		standardFields: CHOICE_FIELDS,
	},
	"multiple-choice": {
		label: "多选题",
		description: "先识别为多选题，再选择目标 Anki 模板",
		nativeModelType: "multiple",
		standardFields: CHOICE_FIELDS,
	},
	"cloze-deletion": {
		label: "挖空题",
		description: "适用于 Anki Cloze 或自定义挖空模板",
		nativeModelType: "cloze",
		standardFields: CLOZE_FIELDS,
	},
};

function normalizeFieldIdentifier(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[\s_\-:]/g, "");
}

export function resolveMappingCardType(card: Card): AnkiSyncCardType {
	return resolveParserCardType(card);
}

export function getCardTypeFieldDefinitions(cardType: AnkiSyncCardType): CardTypeFieldDefinition[] {
	return CARD_TYPE_TEMPLATE_MAPPING_CONFIG[cardType].standardFields;
}

export function inferStandardFieldKeyFromModelField(
	fieldName: string,
	cardType: AnkiSyncCardType
): string | null {
	const normalizedFieldName = normalizeFieldIdentifier(fieldName);
	const fieldDefinitions = getCardTypeFieldDefinitions(cardType);

	for (const definition of fieldDefinitions) {
		const candidateNames = [definition.key, ...(definition.aliases ?? [])];
		if (
			candidateNames.some(
				(candidate) => normalizeFieldIdentifier(candidate) === normalizedFieldName
			)
		) {
			return definition.key;
		}
	}

	return null;
}

export function getDeckCardTypeMapping(
	deckMapping: DeckSyncMapping | undefined,
	cardType: AnkiSyncCardType
): CardTypeTemplateMapping | null {
	const mapping = deckMapping?.cardTypeMappings?.[cardType];
	if (!mapping?.enabled || !mapping.ankiModelName.trim()) {
		return null;
	}

	return mapping;
}

export interface ResolvedCardExportRoute {
	key: string;
	cardType: AnkiSyncCardType;
	templateId: string;
	targetKind: "native" | "mapped";
	nativeModelType: "basic" | "multiple" | "cloze";
	targetModelName: string | null;
	mapping: CardTypeTemplateMapping | null;
}

export function resolveCardExportRoute(
	card: Card,
	deckMapping?: DeckSyncMapping
): ResolvedCardExportRoute {
	const cardType = resolveMappingCardType(card);
	const mapping = getDeckCardTypeMapping(deckMapping, cardType);
	const templateId = resolveOfficialTemplateId(card);
	const nativeModelType = CARD_TYPE_TEMPLATE_MAPPING_CONFIG[cardType].nativeModelType;

	if (mapping) {
		return {
			key: `mapped:${cardType}:${mapping.ankiModelName}`,
			cardType,
			templateId,
			targetKind: "mapped",
			nativeModelType,
			targetModelName: mapping.ankiModelName,
			mapping,
		};
	}

	return {
		key: `native:${templateId}`,
		cardType,
		templateId,
		targetKind: "native",
		nativeModelType,
		targetModelName: null,
		mapping: null,
	};
}
