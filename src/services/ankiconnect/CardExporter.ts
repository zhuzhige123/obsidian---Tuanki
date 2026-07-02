import { logger } from "../../utils/logger";
import { createErrorMessage } from "../../utils/helpers";
/**
 * 卡片导出器
 * 负责将 Weave 卡片导出到 Anki
 */

import type { DeckSyncMapping } from "../../components/settings/types/settings-types";
import { MAIN_SEPARATOR } from "../../constants/markdown-delimiters";
import { getOfficialTemplateById, getOfficialTemplates } from "../../constants/official-templates";
import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { ClozeCardParser } from "../../parsers/card-type-parsers/ClozeCardParser";
import type {
	AnkiModelInfo,
	AnkiNoteInfo,
	ExportError,
	ExportResult,
	ExportSummary,
	SyncFailureReason,
	SyncItemResult,
	SyncItemWarning,
} from "../../types/ankiconnect-types";
import type { ObsidianToAnkiOptions } from "../../types/ankiconnect-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { extractErrorMessage } from "../../types/utility-types";
import { getCardFields } from "../../utils/card-field-helper";
import { resolveAnkiExportCardType, resolveOfficialTemplateId } from "../../utils/card-type-utils";
import { extractBodyContent, parseSourceInfo } from "../../utils/yaml-utils";
import { AnkiConnectClient } from "./AnkiConnectClient";
import type { IncrementalSyncTracker } from "./IncrementalSyncTracker";
import { ObsidianToAnkiConverter } from "./ObsidianToAnkiConverter";
import { WeaveTemplateExporter } from "./WeaveTemplateExporter";
import {
	type ResolvedCardExportRoute,
	inferStandardFieldKeyFromModelField,
	resolveCardExportRoute,
} from "./card-type-template-mapping";
import { buildObsidianBacklinkMarkup } from "./utils/backlinkMarkup";

/**
 * 字段别名映射表
 * 用于智能匹配卡片字段名与模板字段名
 */
const FIELD_ALIASES: Record<string, string[]> = {
	front: ["question", "Front", "Q", "问题", "题目", "Question"],
	back: [
		"answer",
		"Back",
		"A",
		"答案",
		"解答",
		"Answer",
		"correctAnswers",
		"correctanswers",
		"correct_answer",
	],
	// 兼容旧模型的字段名
	question: ["front", "Front", "question", "Question", "Q", "问题", "题目"],
	answer: ["back", "Back", "answer", "Answer", "A", "答案", "解答"],
	correct_answer: [
		"correctAnswers",
		"correctanswers",
		"back",
		"Back",
		"answer",
		"Answer",
		"A",
		"答案",
		"解答",
	],
	correctanswers: ["correct_answer", "back", "Back", "answer", "Answer", "A", "答案", "解答"],
	options: ["choices", "Choices", "Options", "选项"],
	correctAnswers: ["correctanswers", "CorrectAnswers", "正确答案"],
	text: ["content", "Content", "Text", "内容"],
	cloze: ["Cloze", "挖空"],
	hint: ["Hint", "hint", "提示"],
	extra: ["explanation", "Explanation", "解析"],
	explanation: ["Explanation", "解析", "extra", "Extra"],
};

const TRACKING_FIELD_NAMES = new Set(["weave_template_id", "weave_card_id", "source", "tags"]);
const OPTIONAL_ANKI_FIELDS = new Set(["tags", "hint", "explanation", "extra", "source"]);

function getActualFieldName(
	fieldNameMap: Map<string, string>,
	canonicalFieldName: string
): string | undefined {
	return fieldNameMap.get(canonicalFieldName.toLowerCase());
}

function getTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeChoiceLabel(label: string): string {
	return label
		.trim()
		.toUpperCase()
		.replace(/[.．、\s:：]+$/g, "");
}

function parseChoiceOptionsForExport(optionsText: string): Array<{ label: string; text: string }> {
	const options: Array<{ label: string; text: string }> = [];
	const lines = optionsText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const match = line.match(/^([A-Z])\s*[.．、]\s*([\s\S]+)$/i);
		if (!match) {
			continue;
		}

		const label = normalizeChoiceLabel(match[1]).replace(/[.．、：:]+$/g, "");
		const text = match[2].replace(/\{(?:✓|✔|√|correct|\*)\}/gi, "").trim();
		if (!label || !text) {
			continue;
		}

		options.push({
			label,
			text,
		});
	}

	if (options.length === 0) {
		for (const line of lines) {
			const fallbackMatch = line.match(/^([A-Z])\s*[.．、]\s*(.+)$/i);
			if (!fallbackMatch) {
				continue;
			}

			const label = fallbackMatch[1].trim().toUpperCase();
			const text = fallbackMatch[2].replace(/\{(?:correct|\*)\}/gi, "").trim();
			if (!label || !text) {
				continue;
			}

			options.push({ label, text });
		}
	}

	return options;
}

function parseChoiceAnswerLabels(correctAnswersText: string): string[] {
	return correctAnswersText
		.split(/[,，;\n]/)
		.map((entry) => normalizeChoiceLabel(entry).replace(/[.．、：:]+$/g, ""))
		.map((entry) => entry.match(/[A-Z]/i)?.[0]?.toUpperCase() || entry)
		.filter(Boolean);
}

function buildChoiceOptionsPlainText(optionsText: string): string {
	const options = parseChoiceOptionsForExport(optionsText);
	if (options.length > 0) {
		return options
			.map((option) => `${option.label}. ${option.text}`)
			.join("\n")
			.trim();
	}

	return optionsText
		.split("\n")
		.map((line) => line.replace(/\{(?:鉁搢鉁攟鈭殀correct|\*)\}/gi, "").trim())
		.filter(Boolean)
		.join("\n")
		.trim();
}

function extractChoiceOptionsFromBody(content: string): string {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /^[A-Z]\s*[.．、]\s*\S+/i.test(line))
		.join("\n")
		.trim();
}

function buildChoiceAnswerDisplaySafe(optionsText: string, correctAnswersText: string): string {
	const answerLabels = correctAnswersText
		.split(/[,，;\n]/)
		.map((entry) => entry.match(/[A-Z]/i)?.[0]?.toUpperCase() || "")
		.filter(Boolean);

	if (answerLabels.length === 0) {
		return correctAnswersText.trim();
	}

	const optionTextByLabel = new Map<string, string>();
	const normalizedOptionsText = extractChoiceOptionsFromBody(optionsText || "") || optionsText;
	for (const line of normalizedOptionsText
		.split("\n")
		.map((entry) => entry.trim())
		.filter(Boolean)) {
		const match = line.match(/^([A-Z])\s*[.．、]\s*(.+)$/i);
		if (!match) {
			continue;
		}

		optionTextByLabel.set(
			match[1].trim().toUpperCase(),
			match[2].replace(/\{(?:✓|✔|√|correct|\*)\}/gi, "").trim()
		);
	}

	return answerLabels
		.map((_label) => {
			const optionText = optionTextByLabel.get(_label);
			return optionText ? `${_label}. ${optionText}` : _label;
		})
		.join("\n")
		.trim();
}

function hasExportableContent(fields: Record<string, string>): boolean {
	return Object.entries(fields).some(([key, value]) => {
		if (TRACKING_FIELD_NAMES.has(key.toLowerCase())) {
			return false;
		}

		return typeof value === "string" && value.trim() !== "";
	});
}

function resolveNativeCardType(card: Card | undefined, templateId: string): string {
	const templateBasedType = resolveAnkiExportCardType(templateId);
	if (!card) {
		return templateBasedType;
	}

	const cardBasedType = resolveAnkiExportCardType(card);
	if (cardBasedType === "basic" && templateBasedType !== "basic") {
		return templateBasedType;
	}

	return cardBasedType;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitCardBodySections(content: string): { main: string; extra: string } {
	const normalizedBody = extractBodyContent(content || "").trim();
	if (!normalizedBody) {
		return { main: "", extra: "" };
	}

	const separatorPattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(MAIN_SEPARATOR)}\\s*(?:\\n|$)`);
	const separatorMatch = separatorPattern.exec(normalizedBody);

	if (!separatorMatch || separatorMatch.index === undefined) {
		return {
			main: normalizedBody,
			extra: "",
		};
	}

	return {
		main: normalizedBody.slice(0, separatorMatch.index).trim(),
		extra: normalizedBody.slice(separatorMatch.index + separatorMatch[0].length).trim(),
	};
}

interface ExistingNoteEntry {
	noteId: number;
	noteInfo: AnkiNoteInfo;
}

class CardExportValidationError extends Error {
	constructor(public reason: SyncFailureReason, message: string) {
		super(message);
		this.name = "CardExportValidationError";
	}
}

function normalizeTextValue(value: unknown): string {
	if (typeof value === "string") {
		return value.replace(/\r\n/g, "\n");
	}

	if (value && typeof value === "object" && "value" in value) {
		const fieldValue = (value as { value?: unknown }).value;
		return typeof fieldValue === "string" ? fieldValue.replace(/\r\n/g, "\n") : "";
	}

	return "";
}

function normalizeTags(tags: string[] | undefined): string[] {
	return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort((left, right) =>
		left.localeCompare(right)
	);
}

function computeStableHash(value: string): string {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return `${value.length}:${(hash >>> 0).toString(16)}`;
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
	if (items.length === 0) {
		return [];
	}

	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += chunkSize) {
		chunks.push(items.slice(index, index + chunkSize));
	}

	return chunks;
}

function createCardPreview(card: Card): string {
	const parsedFields = getCardFields(card);
	const preview =
		getTrimmedString(parsedFields.front) ||
		getTrimmedString(parsedFields.question) ||
		getTrimmedString(parsedFields.text) ||
		getTrimmedString(parsedFields.back) ||
		getTrimmedString(parsedFields.answer) ||
		extractBodyContent(card.content || "").trim();

	return (preview || card.uuid).replace(/\s+/g, " ").slice(0, 80);
}

export class CardExporter {
	private plugin: WeavePlugin;
	private ankiConnect: AnkiConnectClient;
	private templateExporter: WeaveTemplateExporter;
	private converter: ObsidianToAnkiConverter;
	private syncTracker: IncrementalSyncTracker | null;

	constructor(
		plugin: WeavePlugin,
		ankiConnect: AnkiConnectClient,
		templateExporter: WeaveTemplateExporter,
		syncTracker?: IncrementalSyncTracker | null
	) {
		this.plugin = plugin;
		this.ankiConnect = ankiConnect;
		this.templateExporter = templateExporter;
		this.converter = new ObsidianToAnkiConverter(plugin.app, ankiConnect);
		this.syncTracker = syncTracker ?? null;
	}

	async exportDeck(
		weaveDeckId: string,
		ankiDeckName: string,
		onProgress?: (current: number, total: number, status: string) => void
	): Promise<ExportResult> {
		return this.exportDeckIncremental(weaveDeckId, ankiDeckName, onProgress);
	}

	/**
	 * 导出整个牌组
	 */
	/**
	 * 转换并上传单张卡片
	 */
	private async convertAndUploadCard(
		card: Card,
		template: ParseTemplate,
		modelInfo: AnkiModelInfo,
		deckName: string
	): Promise<void> {
		// 转换为 Anki Note
		const ankiNote = await this.convertCardToAnkiNote(card, template, modelInfo);

		// 上传到 Anki
		await this.uploadNoteToAnki(ankiNote, deckName);
	}

	private createConversionOptions(): ObsidianToAnkiOptions {
		const mediaSyncEnabled = this.plugin.settings?.ankiConnect?.mediaSync?.enabled ?? true;

		return {
			vaultName: this.plugin.app.vault.getName(),
			uploadMedia: mediaSyncEnabled,
			generateBacklinks: true,
			backlinkPosition: "append",
			mediaPosition: "inline",
			formatConversion: {
				enabled: true,
				mathConversion: {
					enabled: true,
					targetFormat: "latex-parens",
					detectCurrencySymbol: true,
				},
				wikiLinkConversion: {
					enabled: true,
					mode: "obsidian-link",
				},
				calloutConversion: {
					enabled: true,
					injectStyles: false,
				},
				highlightConversion: {
					enabled: true,
				},
			},
		};
	}

	private buildSourceFieldValue(card: Card, warnings: SyncItemWarning[] = []): string {
		const sourceInfo = parseSourceInfo(card.content);
		const sourceFile =
			sourceInfo.sourceFile || card.sourceFile || (card.customFields?.sourceFile as string);
		const sourceBlock = sourceInfo.sourceBlock || card.sourceBlock;

		if (!sourceFile) {
			warnings.push({
				reason: "missing_source_file",
				message: `Card ${card.uuid} is missing sourceFile, backlink skipped during export.`,
			});
			return "";
		}

		const vaultName = this.plugin.app.vault.getName();
		const encodedVault = encodeURIComponent(vaultName);

		let url: string;
		let title = "Open source note in Obsidian";

		if (sourceBlock) {
			const cleanBlockId = sourceBlock.replace(/^\^/, "");
			const fileWithAnchor = `${sourceFile}#^${cleanBlockId}`;
			url = `obsidian://open?vault=${encodedVault}&file=${encodeURIComponent(fileWithAnchor)}`;
			title = `Open source block ^${cleanBlockId} in Obsidian`;
		} else {
			url = `obsidian://open?vault=${encodedVault}&file=${encodeURIComponent(sourceFile)}`;
		}

		return buildObsidianBacklinkMarkup(url, { title });
	}

	private async convertMappedFieldValue(
		fieldValue: string,
		card: Card,
		standardFieldKey: string
	): Promise<string> {
		if (!fieldValue.trim() || standardFieldKey === "tags" || standardFieldKey === "source") {
			return fieldValue;
		}

		const conversionResult = await this.converter.convertContent(fieldValue, card, {
			...this.createConversionOptions(),
			generateBacklinks: false,
		});

		return conversionResult.convertedContent;
	}

	private buildMappedStandardFields(
		card: Card,
		route: ResolvedCardExportRoute,
		warnings: SyncItemWarning[]
	): Record<string, string> {
		const parsedFields = getCardFields(card);
		const hintText = getTrimmedString(card.parsedMetadata?.hint);
		const { main: primaryBody, extra: secondaryBody } = splitCardBodySections(card.content || "");
		const effectiveBody = primaryBody || secondaryBody;
		const rawOptions =
			getTrimmedString((parsedFields as Record<string, unknown>).options) ||
			extractChoiceOptionsFromBody(primaryBody || card.content || "");
		const correctAnswerLabels = parseChoiceAnswerLabels(
			getTrimmedString((parsedFields as Record<string, unknown>).correctAnswers)
		).join(", ");
		const choiceAnswerDisplay = buildChoiceAnswerDisplaySafe(
			rawOptions,
			getTrimmedString((parsedFields as Record<string, unknown>).correctAnswers)
		);
		const sourceFieldValue = this.buildSourceFieldValue(card, warnings);
		const tagsFieldValue = (card.tags || []).join(" ");

		if (route.cardType === "cloze-deletion") {
			return {
				text: ClozeCardParser.convertObsidianToAnkiStyle(
					primaryBody || getTrimmedString(parsedFields.text) || effectiveBody
				),
				hint: hintText,
				explanation: secondaryBody || getTrimmedString(card.parsedMetadata?.explanation),
				source: sourceFieldValue,
				tags: tagsFieldValue,
			};
		}

		if (route.cardType === "single-choice" || route.cardType === "multiple-choice") {
			return {
				question:
					getTrimmedString(parsedFields.front) ||
					getTrimmedString(parsedFields.question) ||
					primaryBody,
				options: buildChoiceOptionsPlainText(rawOptions),
				answer:
					choiceAnswerDisplay ||
					getTrimmedString(parsedFields.answer) ||
					getTrimmedString(parsedFields.back),
				correctAnswers: correctAnswerLabels,
				hint: hintText,
				explanation:
					getTrimmedString(parsedFields.back) ||
					secondaryBody ||
					getTrimmedString(card.parsedMetadata?.explanation),
				source: sourceFieldValue,
				tags: tagsFieldValue,
			};
		}

		return {
			question:
				getTrimmedString(parsedFields.front) ||
				getTrimmedString(parsedFields.question) ||
				primaryBody,
			answer:
				getTrimmedString(parsedFields.back) ||
				getTrimmedString(parsedFields.answer) ||
				secondaryBody,
			hint: hintText,
			explanation: getTrimmedString(card.parsedMetadata?.explanation) || secondaryBody,
			source: sourceFieldValue,
			tags: tagsFieldValue,
		};
	}

	private async convertCardToMappedNote(
		card: Card,
		modelInfo: AnkiModelInfo,
		route: ResolvedCardExportRoute,
		warnings: SyncItemWarning[]
	): Promise<Partial<AnkiNoteInfo>> {
		const fields: Record<string, string> = {};
		const standardFields = this.buildMappedStandardFields(card, route, warnings);

		for (const actualFieldName of modelInfo.fields) {
			const mappedFieldEntry = Object.entries(route.mapping?.fieldMappings ?? {}).find(
				([, targetFieldName]) => targetFieldName === actualFieldName
			);
			const standardFieldKey =
				mappedFieldEntry?.[0] ??
				inferStandardFieldKeyFromModelField(actualFieldName, route.cardType);
			const normalizedFieldName = actualFieldName.toLowerCase();

			let fieldValue = standardFieldKey ? standardFields[standardFieldKey] ?? "" : "";
			if (normalizedFieldName === "weave_template_id") {
				fieldValue = route.templateId;
			} else if (normalizedFieldName === "weave_card_id") {
				fieldValue = card.uuid;
			} else if (normalizedFieldName === "tags" && !fieldValue) {
				fieldValue = standardFields.tags ?? "";
			}

			fields[actualFieldName] = standardFieldKey
				? await this.convertMappedFieldValue(fieldValue, card, standardFieldKey)
				: fieldValue;
		}

		const primaryFieldName = modelInfo.fields[0];
		if (primaryFieldName && !getTrimmedString(fields[primaryFieldName])) {
			throw new CardExportValidationError(
				"missing_primary_field",
				`卡片缺少必填主字段 "${primaryFieldName}"，无法导出到 Anki`
			);
		}

		if (!hasExportableContent(fields)) {
			throw new CardExportValidationError("empty_content", "卡片内容为空，已跳过导出");
		}

		return {
			modelName: modelInfo.name,
			fields,
			tags: card.tags || [],
		};
	}

	/**
	 * 转换 Weave Card 为 Anki Note
	 */
	async convertCardToAnkiNote(
		card: Card,
		template: ParseTemplate,
		modelInfo: AnkiModelInfo,
		warnings: SyncItemWarning[] = [],
		route?: ResolvedCardExportRoute
	): Promise<Partial<AnkiNoteInfo>> {
		if (route?.targetKind === "mapped" && route.mapping) {
			return this.convertCardToMappedNote(card, modelInfo, route, warnings);
		}

		logger.debug("🔍 转换卡片", card.uuid, "使用模板", template.name);

		// 准备转换选项
		const mediaSyncEnabled = this.plugin.settings?.ankiConnect?.mediaSync?.enabled ?? true;
		const conversionOptions: ObsidianToAnkiOptions = {
			vaultName: this.plugin.app.vault.getName(),
			uploadMedia: mediaSyncEnabled,
			generateBacklinks: true,
			backlinkPosition: "append", // 追加到字段末尾
			mediaPosition: "inline",
			formatConversion: {
				enabled: true,
				mathConversion: {
					enabled: true,
					targetFormat: "latex-parens", // 转换为 \(...\) 格式
					detectCurrencySymbol: true,
				},
				wikiLinkConversion: {
					enabled: true,
					mode: "obsidian-link", // 转换为 Obsidian 协议链接
				},
				calloutConversion: {
					enabled: true,
					injectStyles: false, // 使用内联样式，无需注入
				},
				highlightConversion: {
					enabled: true,
				},
			},
		};

		const fields: Record<string, string> = {};
		const ankiFieldNameMap = new Map(
			modelInfo.fields.map((fieldName) => [fieldName.toLowerCase(), fieldName])
		);
		const ankiFieldNames = Array.from(ankiFieldNameMap.keys());
		const parsedFields = getCardFields(card);
		const hintText = getTrimmedString(card.parsedMetadata?.hint);
		const cardType = resolveNativeCardType(card, template.id).toLowerCase();
		const isChoiceCard =
			cardType.includes("choice") || cardType === "multiple" || cardType === "single";
		const isClozeCard = cardType.includes("cloze");
		const { main: primaryBody, extra: secondaryBody } = splitCardBodySections(card.content || "");
		const effectiveBody = primaryBody || secondaryBody;
		const clozeTextValue = isClozeCard
			? ClozeCardParser.convertObsidianToAnkiStyle(
					primaryBody || getTrimmedString(parsedFields.text)
			  )
			: "";
		const explanationFallback =
			(isChoiceCard ? getTrimmedString(parsedFields.back) : "") ||
			(isClozeCard ? secondaryBody : "") ||
			getTrimmedString(card.parsedMetadata?.explanation);

		logger.debug("  📋 Anki 模型字段:", modelInfo.fields.join(", "));

		// 填充字段
		const templateFields = template.fields || [];

		for (const templateField of templateFields) {
			//  使用模板字段名（小写）
			const templateFieldName = templateField.name.toLowerCase();

			// 查找 Anki 模型中对应的字段名
			let ankiFieldName = templateFieldName;

			// 如果模板字段名不在 Anki 模型中，尝试使用别名查找
			if (!ankiFieldNames.includes(templateFieldName)) {
				const aliases = FIELD_ALIASES[templateFieldName] || [];
				for (const alias of aliases) {
					if (ankiFieldNames.includes(alias.toLowerCase())) {
						ankiFieldName = alias.toLowerCase();
						logger.debug(`  🔄 字段映射: "${templateFieldName}" → "${ankiFieldName}"`);
						break;
					}
				}
			}

			const actualFieldName = getActualFieldName(ankiFieldNameMap, ankiFieldName);
			if (!actualFieldName) {
				logger.debug(`  ↷ 跳过非 Anki 模型字段: "${templateField.name}"`);
				continue;
			}

			let fieldValue = "";
			let matchedKey = "";

			// 生成可能的字段名列表（用于从 parsedFields 中匹配）
			const possibleKeys: string[] = [];

			// 1. 添加基本字段名（各种大小写变体）
			if (templateField.name) {
				possibleKeys.push(templateField.name);
				possibleKeys.push(templateField.name.toLowerCase());
				const capitalized =
					templateField.name.charAt(0).toUpperCase() + templateField.name.slice(1);
				possibleKeys.push(capitalized);
			}

			// 2. 添加别名（使用小写键查找）
			const aliasKey = templateField.name.toLowerCase();
			if (FIELD_ALIASES[aliasKey]) {
				possibleKeys.push(...FIELD_ALIASES[aliasKey]);
			}

			// 去重
			const uniqueKeys = [...new Set(possibleKeys)];

			if (isClozeCard && ankiFieldName === "text" && clozeTextValue) {
				fieldValue = clozeTextValue;
				matchedKey = "cloze-text";
				logger.debug(
					`  ✓ 字段补充: "text" ← clozeText = "${fieldValue.slice(0, 30)}${
						fieldValue.length > 30 ? "..." : ""
					}"`
				);
			}

			for (const key of uniqueKeys) {
				if (fieldValue) {
					break;
				}

				if (parsedFields[key] && parsedFields[key].trim() !== "") {
					fieldValue = parsedFields[key];
					matchedKey = key;
					logger.debug(
						`  ✓ 字段匹配: "${ankiFieldName}" ← "${matchedKey}" = "${fieldValue.slice(0, 30)}${
							fieldValue.length > 30 ? "..." : ""
						}"`
					);
					break;
				}
			}

			// 特殊处理：tags 字段从 card.tags 获取
			if (!fieldValue && ankiFieldName === "tags" && card.tags && card.tags.length > 0) {
				fieldValue = card.tags.join(" ");
				logger.debug(`  ✓ 字段匹配: "tags" ← card.tags = "${fieldValue}"`);
			}

			if (!fieldValue && ankiFieldName === "hint") {
				const fallbackHint = hintText || getTrimmedString(card.parsedMetadata?.hint);
				if (fallbackHint) {
					fieldValue = fallbackHint;
					logger.debug(
						`  ✓ 字段补充: "hint" ← metadata = "${fieldValue.slice(0, 30)}${
							fieldValue.length > 30 ? "..." : ""
						}"`
					);
				}
			}

			if (ankiFieldName === "back" && isChoiceCard) {
				const choiceAnswerLabels = getTrimmedString(
					(parsedFields as Record<string, unknown>).correctAnswers
				);
				const choiceOptions =
					getTrimmedString((parsedFields as Record<string, unknown>).options) ||
					extractChoiceOptionsFromBody(primaryBody || card.content || "");
				const choiceAnswerDisplay = buildChoiceAnswerDisplaySafe(choiceOptions, choiceAnswerLabels);
				if (choiceAnswerDisplay) {
					fieldValue = choiceAnswerDisplay;
					logger.debug(`  ✓ 字段补充: "back" ← choiceAnswerDisplay = "${fieldValue}"`);
				}
			}

			if (!fieldValue && ankiFieldName === "explanation") {
				if (explanationFallback) {
					fieldValue = explanationFallback;
					logger.debug(
						`  ✓ 字段补充: "explanation" ← metadata/back = "${fieldValue.slice(0, 30)}${
							fieldValue.length > 30 ? "..." : ""
						}"`
					);
				}
			}

			if (!fieldValue) {
				let structuralFallback = "";

				if (ankiFieldName === "front" || ankiFieldName === "question") {
					structuralFallback = primaryBody;
				} else if ((ankiFieldName === "back" || ankiFieldName === "answer") && !isChoiceCard) {
					structuralFallback = secondaryBody;
				} else if (ankiFieldName === "text" || ankiFieldName === "cloze") {
					structuralFallback = clozeTextValue || primaryBody || effectiveBody;
				} else if (ankiFieldName === "extra") {
					structuralFallback = secondaryBody;
				}

				if (structuralFallback) {
					fieldValue = structuralFallback;
					logger.debug(
						`  ✓ 结构回退: "${ankiFieldName}" ← bodySplit = "${fieldValue.slice(0, 30)}${
							fieldValue.length > 30 ? "..." : ""
						}"`
					);
				}
			}

			// 如果未找到匹配，输出调试信息（区分"字段为空"和"字段不存在"）
			if (!fieldValue) {
				const shouldWarnMissingField =
					templateField.required !== false &&
					!OPTIONAL_ANKI_FIELDS.has(ankiFieldName) &&
					!TRACKING_FIELD_NAMES.has(ankiFieldName);

				// 检查字段是否存在但为空
				let fieldExistsButEmpty = false;
				for (const key of uniqueKeys) {
					if (key in parsedFields) {
						fieldExistsButEmpty = true;
						if (shouldWarnMissingField) {
							logger.warn(`  ⚠️ 字段为空: "${ankiFieldName}" (存在于 parsedFields 但值为空)`);
						} else {
							logger.debug(`  ↷ 可选字段为空: "${ankiFieldName}"`);
						}
						break;
					}
				}

				if (!fieldExistsButEmpty && shouldWarnMissingField) {
					logger.warn(`  ⚠️ 字段未匹配: "${ankiFieldName}"`);
					logger.warn(`     尝试了: ${uniqueKeys.join(", ")}`);
					logger.warn(`     可用字段: ${Object.keys(parsedFields).join(", ")}`);
				} else if (!fieldExistsButEmpty) {
					logger.debug(`  ↷ 未填充可选字段: "${ankiFieldName}"`);
				}
			}

			// 转换内容（媒体文件 + 回链）
			if (fieldValue?.trim() && ankiFieldName !== "tags") {
				try {
					//  特殊处理：options字段转换为HTML
					if (templateField.name === "options") {
						fieldValue = this.formatOptionsToHTML(fieldValue);
					} else {
						//  关闭字段内回链（使用独立的 source 字段代替）
						const fieldConversionOptions = {
							...conversionOptions,
							generateBacklinks: false, // 不在字段内生成回链，使用 source 字段
						};

						const conversionResult = await this.converter.convertContent(
							fieldValue,
							card,
							fieldConversionOptions
						);

						fieldValue = conversionResult.convertedContent;

						// 输出转换信息
						if (conversionResult.mediaFiles.length > 0 || conversionResult.backlinks.length > 0) {
							logger.debug(`  🔄 转换字段 "${ankiFieldName}":`, {
								媒体文件: conversionResult.mediaFiles.length,
								回链: conversionResult.backlinks.length,
								警告: conversionResult.warnings.length,
							});
						}
					}
				} catch (error) {
					logger.error(`  ❌ 转换字段失败 "${ankiFieldName}":`, error);
					// 转换失败时保留原始内容
				}
			}

			// 使用 Anki 模型的实际字段名填充
			fields[actualFieldName] = fieldValue;
		}

		// 填充追踪字段
		const weaveTemplateField = getActualFieldName(ankiFieldNameMap, "weave_template_id");
		if (weaveTemplateField) {
			fields[weaveTemplateField] = template.id;
		}
		const weaveCardField = getActualFieldName(ankiFieldNameMap, "weave_card_id");
		if (weaveCardField) {
			fields[weaveCardField] = card.uuid; // 使用UUID值
		}

		const hintField = getActualFieldName(ankiFieldNameMap, "hint");
		if (hintField && !getTrimmedString(fields[hintField])) {
			fields[hintField] = hintText || getTrimmedString(card.parsedMetadata?.hint);
		}

		const explanationField = getActualFieldName(ankiFieldNameMap, "explanation");
		if (explanationField && !getTrimmedString(fields[explanationField]) && explanationFallback) {
			fields[explanationField] = explanationFallback;
		}

		// 填充来源文档字段（Obsidian URI 回链）
		const sourceField = getActualFieldName(ankiFieldNameMap, "source");
		if (sourceField) {
			const sourceInfo = parseSourceInfo(card.content);
			const sourceFile =
				sourceInfo.sourceFile || card.sourceFile || (card.customFields?.sourceFile as string);
			const sourceBlock = sourceInfo.sourceBlock || card.sourceBlock;

			if (sourceFile) {
				const vaultName = this.plugin.app.vault.getName();
				const encodedVault = encodeURIComponent(vaultName);

				let url: string;
				let title = "Open source note in Obsidian";

				if (sourceBlock) {
					const cleanBlockId = sourceBlock.replace(/^\^/, "");
					const fileWithAnchor = `${sourceFile}#^${cleanBlockId}`;
					url = `obsidian://open?vault=${encodedVault}&file=${encodeURIComponent(fileWithAnchor)}`;
					title = `Open source block ^${cleanBlockId} in Obsidian`;
				} else {
					url = `obsidian://open?vault=${encodedVault}&file=${encodeURIComponent(sourceFile)}`;
				}

				fields[sourceField] = buildObsidianBacklinkMarkup(url, { title });

				logger.debug(
					`  source backlink generated: ${sourceFile}${sourceBlock ? `#^${sourceBlock}` : ""}`
				);
			} else {
				logger.warn(`  card ${card.uuid} is missing sourceFile, backlink skipped`);
			}
		}

		const primaryFieldName = modelInfo.fields[0];
		if (primaryFieldName && !getTrimmedString(fields[primaryFieldName])) {
			const validationErrorMessage = `\u5361\u7247\u7f3a\u5c11\u5fc5\u586b\u4e3b\u5b57\u6bb5 "${primaryFieldName}"\uff0c\u65e0\u6cd5\u5bfc\u51fa\u5230 Anki`;
			logger.error("[CardExporter] Missing primary field during export", {
				cardId: card.uuid,
				modelName: modelInfo.name,
				primaryFieldName,
				availableParsedFields: Object.keys(parsedFields),
				effectiveBodyPreview: effectiveBody.slice(0, 80),
				reason: "missing_primary_field",
			});
			throw new CardExportValidationError("missing_primary_field", validationErrorMessage);
		}

		if (!hasExportableContent(fields)) {
			const validationErrorMessage =
				"\u5361\u7247\u5185\u5bb9\u4e3a\u7a7a\uff0c\u5df2\u8df3\u8fc7\u5bfc\u51fa";
			logger.error("[CardExporter] Empty export payload detected", {
				cardId: card.uuid,
				modelName: modelInfo.name,
				cardType,
				availableParsedFields: Object.keys(parsedFields),
				hintLength: hintText.length,
				effectiveBodyPreview: effectiveBody.slice(0, 80),
				reason: "empty_content",
			});
			throw new CardExportValidationError("empty_content", validationErrorMessage);
		}

		return {
			modelName: modelInfo.name,
			fields: fields,
			tags: card.tags || [],
		};
	}

	/**
	 * 上传 Note 到 Anki
	 */
	async uploadNoteToAnki(note: Partial<AnkiNoteInfo>, deckName: string): Promise<number> {
		try {
			const ankiNote = {
				deckName: deckName,
				modelName: note.modelName || "",
				fields: note.fields || {},
				tags: note.tags || [],
				options: {
					allowDuplicate: false,
					duplicateScope: "deck",
				},
			};

			const noteId = await this.ankiConnect.addNote(ankiNote);

			return noteId;
		} catch (error: unknown) {
			const errorMessage = extractErrorMessage(error);
			// 检查是否是重复卡片错误
			if (errorMessage.includes("duplicate")) {
				logger.warn("⚠️ 卡片已存在于 Anki，跳过重复卡片:", {
					modelName: note.modelName,
					fields: note.fields,
					tags: note.tags,
				});
				return -1; // 返回特殊值表示跳过
			}

			// 其他错误需要详细记录
			logger.error("❌ 上传卡片到 Anki 失败:", {
				error: errorMessage,
				modelName: note.modelName,
				fields: note.fields,
			});
			throw error;
		}
	}

	/**
	 * 获取 Weave 牌组的所有卡片
	 */
	private createEmptyExportResult(): ExportResult {
		return {
			success: true,
			totalCards: 0,
			exportedCards: 0,
			createdModels: 0,
			createdCards: 0,
			updatedCards: 0,
			unchangedCards: 0,
			duplicateCards: 0,
			skippedCards: 0,
			failedCards: 0,
			warningCards: 0,
			errors: [],
			items: [],
			summary: {
				totalCards: 0,
				exportedCards: 0,
				skippedCards: 0,
				createdCards: 0,
				updatedCards: 0,
				unchangedCards: 0,
				duplicateCards: 0,
				failedCards: 0,
				warningCards: 0,
				failureReasons: {},
				warningReasons: {},
			},
		};
	}

	async exportDeckIncremental(
		weaveDeckId: string,
		ankiDeckName: string,
		onProgress?: (current: number, total: number, status: string) => void
	): Promise<ExportResult> {
		logger.debug("📤 开始增量导出牌组:", weaveDeckId, "→", ankiDeckName);
		onProgress?.(0, 100, "正在读取 Weave 牌组...");
		const cards = await this.getWeaveDeckCards(weaveDeckId);
		return this.exportCardsIncremental(cards, ankiDeckName, onProgress, weaveDeckId);
	}

	async exportCardsIncremental(
		cards: Card[],
		ankiDeckName: string,
		onProgress?: (current: number, total: number, status: string) => void,
		weaveDeckId?: string
	): Promise<ExportResult> {
		logger.debug("📤 开始增量导出卡片集:", cards.length, "张 →", ankiDeckName);

		const result = this.createEmptyExportResult();
		result.totalCards = cards.length;

		try {
			if (cards.length === 0) {
				result.summary = this.buildExportSummary(result);
				onProgress?.(100, 100, "没有需要同步的卡片");
				return result;
			}

			onProgress?.(10, 100, `找到 ${cards.length} 张卡片`);

			const deckMapping = weaveDeckId
				? this.getDeckSyncMapping(weaveDeckId, ankiDeckName)
				: undefined;
			const routes = Array.from(
				new Map(
					cards.map((_card) => {
						const route = resolveCardExportRoute(_card, deckMapping);
						return [route.key, route] as const;
					})
				).values()
			);
			const templates = routes;
			const templateModelMap = new Map<string, AnkiModelInfo>();

			onProgress?.(20, 100, "正在准备 Anki 模型...");
			for (let index = 0; index < routes.length; index++) {
				const route = routes[index];
				const templateId = route.templateId;
				const template = this.getTemplateById(templateId);

				if (!template) {
					result.errors.push({
						type: "model_creation",
						message: `找不到模板 ID: ${templateId}`,
						templateId,
						reason: "template_not_found",
					});
					continue;
				}

				try {
					const modelInfo =
						route.targetKind === "mapped" && route.targetModelName
							? await this.ankiConnect.getModelInfo(route.targetModelName)
							: await this.templateExporter.ensureNativeModelByCardType(route.nativeModelType);
					templateModelMap.set(route.key, modelInfo);

					onProgress?.(
						20 + ((index + 1) / Math.max(routes.length, 1)) * 20,
						100,
						`已准备模型 ${index + 1}/${templates.length}`
					);
				} catch (error: unknown) {
					result.errors.push({
						type: "model_creation",
						message: `创建/获取模型失败: ${createErrorMessage(error)}`,
						templateId,
						reason: route.targetKind === "mapped" ? "model_unavailable" : "model_creation_failed",
					});
				}
			}

			onProgress?.(40, 100, "正在建立同步索引...");
			const existingNoteIndex = await this.buildExistingNoteIndex(
				ankiDeckName,
				cards.map((card) => card.uuid)
			);

			onProgress?.(45, 100, "正在同步卡片...");
			for (let index = 0; index < cards.length; index++) {
				const item = await this.syncCardIncrementally(
					cards[index],
					ankiDeckName,
					templateModelMap,
					existingNoteIndex,
					deckMapping
				);

				result.items.push(item);
				this.mergeItemIntoResult(result, item);

				if ((index + 1) % 10 === 0 || index === cards.length - 1) {
					onProgress?.(
						45 + ((index + 1) / cards.length) * 55,
						100,
						`已处理 ${index + 1}/${cards.length} 张卡片`
					);
				}
			}

			result.summary = this.buildExportSummary(result);
			onProgress?.(100, 100, "同步完成");
			return result;
		} catch (error: unknown) {
			logger.error("增量导出卡片集失败:", error);
			result.success = false;
			result.errors.push({
				type: "upload",
				message: `导出失败: ${createErrorMessage(error)}`,
				reason: "unknown",
			});
			result.summary = this.buildExportSummary(result);
			return result;
		}
	}

	private mergeItemIntoResult(result: ExportResult, item: SyncItemResult): void {
		if (item.outcome === "created") {
			result.createdCards++;
			result.exportedCards++;
		} else if (item.outcome === "updated") {
			result.updatedCards++;
			result.exportedCards++;
		} else if (item.outcome === "unchanged") {
			result.unchangedCards++;
			result.skippedCards++;
		} else if (item.outcome === "duplicate") {
			result.duplicateCards++;
			result.skippedCards++;
		} else if (item.outcome === "failed") {
			result.failedCards++;
			result.errors.push(this.createExportErrorFromItem(item));
		}

		if ((item.warnings?.length ?? 0) > 0) {
			result.warningCards++;
		}
	}

	private buildExportSummary(result: ExportResult): ExportSummary {
		const failureReasons: ExportSummary["failureReasons"] = {};
		const warningReasons: ExportSummary["warningReasons"] = {};

		for (const item of result.items) {
			if (item.outcome === "failed" && item.reason) {
				failureReasons[item.reason] = (failureReasons[item.reason] ?? 0) + 1;
			}

			for (const warning of item.warnings ?? []) {
				warningReasons[warning.reason] = (warningReasons[warning.reason] ?? 0) + 1;
			}
		}

		return {
			totalCards: result.totalCards,
			exportedCards: result.exportedCards,
			skippedCards: result.skippedCards,
			createdCards: result.createdCards,
			updatedCards: result.updatedCards,
			unchangedCards: result.unchangedCards,
			duplicateCards: result.duplicateCards,
			failedCards: result.failedCards,
			warningCards: result.warningCards,
			failureReasons,
			warningReasons,
		};
	}

	private createExportErrorFromItem(item: SyncItemResult): ExportError {
		let type: ExportError["type"] = "upload";

		if (item.reason === "template_not_found") {
			type = "template_not_found";
		} else if (item.reason === "model_creation_failed") {
			type = "model_creation";
		} else if (item.reason === "lookup_failed") {
			type = "lookup";
		} else if (item.reason === "model_mismatch") {
			type = "model_mismatch";
		} else if (item.reason === "model_unavailable") {
			type = "note_creation";
		}

		return {
			type,
			message: item.message ?? "同步失败",
			cardId: item.cardId,
			noteId: item.noteId,
			reason: item.reason,
		};
	}

	private classifyFailureReason(error: unknown): SyncFailureReason {
		if (error instanceof CardExportValidationError) {
			return error.reason;
		}

		const message = extractErrorMessage(error);
		const normalizedMessage = message.toLowerCase();

		if (!message) {
			return "unknown";
		}

		if (normalizedMessage.includes("duplicate")) {
			return "duplicate_content";
		}

		if (message.includes("主字段") || message.includes("必填")) {
			return "missing_primary_field";
		}

		if (message.includes("内容为空")) {
			return "empty_content";
		}

		if (message.includes("模板")) {
			return "template_not_found";
		}

		return "upload_failed";
	}

	private async buildExistingNoteIndex(
		ankiDeckName: string,
		cardIds: string[]
	): Promise<Map<string, ExistingNoteEntry>> {
		const noteIndex = new Map<string, ExistingNoteEntry>();
		const trackedNoteIds = this.syncTracker ? this.syncTracker.getTrackedNoteIds(cardIds) : [];
		const targetCardIds = new Set(cardIds);

		const indexNotes = (notes: AnkiNoteInfo[]) => {
			for (const noteInfo of notes) {
				const cardId = this.extractWeaveCardId(noteInfo);
				if (!cardId || !targetCardIds.has(cardId)) {
					continue;
				}

				noteIndex.set(cardId, {
					noteId: noteInfo.noteId,
					noteInfo,
				});
			}
		};

		for (const chunk of chunkItems([...new Set(trackedNoteIds)], 100)) {
			if (chunk.length === 0) {
				continue;
			}

			try {
				indexNotes(await this.ankiConnect.getNotesInfo(chunk));
			} catch (error) {
				logger.warn("读取增量同步记录对应的 Anki notes 失败，将回退为牌组扫描", error);
			}
		}

		if (noteIndex.size === cardIds.length) {
			return noteIndex;
		}

		try {
			const deckNoteIds = await this.ankiConnect.findNotesByDeck(ankiDeckName);
			for (const chunk of chunkItems(deckNoteIds, 100)) {
				if (chunk.length === 0) {
					continue;
				}

				indexNotes(await this.ankiConnect.getNotesInfo(chunk));
			}
		} catch (error) {
			logger.warn("按牌组建立 Anki note 索引失败", error);
		}

		return noteIndex;
	}

	private extractWeaveCardId(noteInfo: AnkiNoteInfo): string {
		for (const [fieldName, fieldValue] of Object.entries(noteInfo.fields ?? {})) {
			if (fieldName.toLowerCase() === "weave_card_id") {
				return normalizeTextValue(fieldValue).trim();
			}
		}

		return "";
	}

	private createComparableFields(
		noteInfo: AnkiNoteInfo,
		targetFieldNames: string[]
	): Record<string, string> {
		const comparableFields: Record<string, string> = {};

		for (const fieldName of targetFieldNames) {
			comparableFields[fieldName] = normalizeTextValue(noteInfo.fields?.[fieldName]);
		}

		return comparableFields;
	}

	private createExportHash(note: {
		modelName: string;
		fields: Record<string, string>;
		tags: string[];
	}): string {
		const normalizedFields: Record<string, string> = {};
		for (const [fieldName, fieldValue] of Object.entries(note.fields)) {
			normalizedFields[fieldName] = normalizeTextValue(fieldValue);
		}

		const hashPayload = JSON.stringify({
			modelName: note.modelName,
			fields: normalizedFields,
			tags: normalizeTags(note.tags),
		});

		return computeStableHash(hashPayload);
	}

	private haveTagsChanged(previous: string[] | undefined, next: string[]): boolean {
		return normalizeTags(previous).join("\u0000") !== normalizeTags(next).join("\u0000");
	}

	private async syncCardIncrementally(
		card: Card,
		ankiDeckName: string,
		templateModelMap: Map<string, AnkiModelInfo>,
		existingNoteIndex: Map<string, ExistingNoteEntry>,
		deckMapping?: DeckSyncMapping
	): Promise<SyncItemResult> {
		const preview = createCardPreview(card);
		const route = resolveCardExportRoute(card, deckMapping);
		const warnings: SyncItemWarning[] = [];

		const template = this.getTemplateById(route.templateId);
		if (!template) {
			return {
				cardId: card.uuid,
				preview,
				deckName: ankiDeckName,
				outcome: "failed",
				reason: "template_not_found",
				message: `未找到模板: ${route.templateId}`,
			};
		}

		const modelInfo = templateModelMap.get(route.key);
		if (!modelInfo) {
			return {
				cardId: card.uuid,
				preview,
				deckName: ankiDeckName,
				outcome: "failed",
				reason: "model_unavailable",
				message: `卡片 ${card.uuid} 的 Anki 模型不可用`,
			};
		}

		try {
			const note = await this.convertCardToAnkiNote(card, template, modelInfo, warnings, route);
			const payload = {
				modelName: note.modelName || modelInfo.name,
				fields: note.fields || {},
				tags: normalizeTags(note.tags || []),
			};
			const sourceFieldName = modelInfo.fields.find(
				(fieldName) => fieldName.toLowerCase() === "source"
			);
			if (sourceFieldName) {
				const sourceInfo = parseSourceInfo(card.content);
				const sourceFile =
					sourceInfo.sourceFile || card.sourceFile || (card.customFields?.sourceFile as string);

				if (!sourceFile) {
					payload.fields[sourceFieldName] = "";
					warnings.push({
						reason: "missing_source_file",
						message: `卡片 ${card.uuid} 缺少来源文件，无法生成源文档回链`,
					});
				}
			}
			const exportHash = this.createExportHash(payload);
			const existingEntry = existingNoteIndex.get(card.uuid);

			if (existingEntry) {
				if (existingEntry.noteInfo.modelName !== payload.modelName) {
					return {
						cardId: card.uuid,
						preview,
						deckName: ankiDeckName,
						noteId: existingEntry.noteId,
						modelName: payload.modelName,
						existingModelName: existingEntry.noteInfo.modelName,
						targetModelName: payload.modelName,
						outcome: "failed",
						reason: "model_mismatch",
						message: `Anki 中已存在不同模型的同步记录：${existingEntry.noteInfo.modelName} → ${payload.modelName}`,
						warnings,
					};
				}

				const existingHash = this.createExportHash({
					modelName: existingEntry.noteInfo.modelName,
					fields: this.createComparableFields(existingEntry.noteInfo, Object.keys(payload.fields)),
					tags: existingEntry.noteInfo.tags || [],
				});

				if (existingHash === exportHash) {
					this.syncTracker?.recordExportResult(card.uuid, {
						outcome: "unchanged",
						ankiNoteId: existingEntry.noteId,
						exportHash,
						ankiDeckName,
						modelName: payload.modelName,
					});

					return {
						cardId: card.uuid,
						preview,
						deckName: ankiDeckName,
						noteId: existingEntry.noteId,
						modelName: payload.modelName,
						outcome: "unchanged",
						warnings,
					};
				}

				await this.ankiConnect.updateNoteFields(existingEntry.noteId, payload.fields);
				if (this.haveTagsChanged(existingEntry.noteInfo.tags, payload.tags)) {
					await this.ankiConnect.updateNoteTags(existingEntry.noteId, payload.tags);
				}

				existingNoteIndex.set(card.uuid, {
					noteId: existingEntry.noteId,
					noteInfo: {
						...existingEntry.noteInfo,
						modelName: payload.modelName,
						tags: payload.tags,
						fields: payload.fields,
						mod: Math.floor(Date.now() / 1000),
					},
				});

				this.syncTracker?.recordExportResult(card.uuid, {
					outcome: "updated",
					ankiNoteId: existingEntry.noteId,
					exportHash,
					ankiDeckName,
					modelName: payload.modelName,
				});

				return {
					cardId: card.uuid,
					preview,
					deckName: ankiDeckName,
					noteId: existingEntry.noteId,
					modelName: payload.modelName,
					outcome: "updated",
					warnings,
				};
			}

			const noteId = await this.uploadNoteToAnki(payload, ankiDeckName);
			if (noteId === -1) {
				this.syncTracker?.recordExportResult(card.uuid, {
					outcome: "duplicate",
					ankiDeckName,
					modelName: payload.modelName,
					error: "duplicate",
				});

				return {
					cardId: card.uuid,
					preview,
					deckName: ankiDeckName,
					modelName: payload.modelName,
					outcome: "duplicate",
					reason: "duplicate_content",
					message: "Anki 中已存在相同内容的卡片，已跳过",
					warnings,
				};
			}

			existingNoteIndex.set(card.uuid, {
				noteId,
				noteInfo: {
					noteId,
					modelName: payload.modelName,
					tags: payload.tags,
					fields: payload.fields,
					cards: [],
					mod: Math.floor(Date.now() / 1000),
				},
			});

			this.syncTracker?.recordExportResult(card.uuid, {
				outcome: "created",
				ankiNoteId: noteId,
				exportHash,
				ankiDeckName,
				modelName: payload.modelName,
			});

			return {
				cardId: card.uuid,
				preview,
				deckName: ankiDeckName,
				noteId,
				modelName: payload.modelName,
				outcome: "created",
				warnings,
			};
		} catch (error: unknown) {
			const reason = this.classifyFailureReason(error);
			const errorMessage = extractErrorMessage(error);

			this.syncTracker?.recordExportResult(card.uuid, {
				outcome: "failed",
				ankiDeckName,
				modelName: modelInfo.name,
				error: errorMessage,
			});

			return {
				cardId: card.uuid,
				preview,
				deckName: ankiDeckName,
				modelName: modelInfo.name,
				outcome: "failed",
				reason,
				message: errorMessage,
				warnings,
			};
		}
	}

	private getDeckSyncMapping(
		weaveDeckId: string,
		ankiDeckName: string
	): DeckSyncMapping | undefined {
		return Object.values(this.plugin.settings?.ankiConnect?.deckMappings ?? {}).find(
			(mapping) => mapping.weaveDeckId === weaveDeckId && mapping.ankiDeckName === ankiDeckName
		);
	}

	private async getWeaveDeckCards(deckId: string): Promise<Card[]> {
		const dataStorage = this.plugin.dataStorage;
		if (!dataStorage) {
			throw new Error("DataStorage 未初始化");
		}

		return await dataStorage.getCardsByDeck(deckId);
	}

	/**
	 * 按模板分组卡片
	 */
	private groupCardsByTemplate(cards: Card[]): Map<string, Card[]> {
		const groups = new Map<string, Card[]>();

		for (const card of cards) {
			// 使用 getTemplateIdForExport 获取有效的 templateId
			// 不再使用 'default' 作为降级值，因为 'default' 模板不存在
			const templateId = this.getTemplateIdForExport(card);
			if (!groups.has(templateId)) {
				groups.set(templateId, []);
			}
			groups.get(templateId)?.push(card);
		}

		return groups;
	}

	/**
	 * 将options字段格式化为HTML（用于Anki显示）
	 */
	private formatOptionsToHTML(optionsText: string): string {
		const options = parseChoiceOptionsForExport(optionsText);
		if (options.length === 0) {
			return optionsText
				.split("\n")
				.filter((line) => line.trim())
				.map(
					(line) =>
						`<div class="choice-option"><div class="choice-option-text">${line
							.replace(/\{(?:✓|✔|√|correct|\*)\}/gi, "")
							.trim()}</div></div>`
				)
				.join("\n");
		}

		return options
			.map((_option) => {
				const label = `${_option.label}.`;
				return `<div class="choice-option"><span class="choice-option-label">${label}</span><span class="choice-option-text">${_option.text}</span></div>`;
			})
			.join("\n");
	}

	/**
	 * 获取导出时使用的 templateId
	 * 如果卡片有 templateId，使用原有的
	 * 否则根据 type 动态生成
	 */
	private getTemplateIdForExport(card: Card): string {
		const templateId = resolveOfficialTemplateId(card);
		if (!card.templateId && templateId === "official-qa") {
			const detectedCardType = resolveAnkiExportCardType(card);
			if (detectedCardType === "basic" && getTrimmedString(card.type)) {
				logger.warn(`⚠️ 未知卡片类型: ${card.type}，降级使用 official-qa`);
			}
		}

		return templateId;
	}

	/**
	 * 根据 ID 获取模板
	 * 先在官方模板中查找，再在用户模板中查找
	 * 如果找不到，使用降级机制返回默认问答题模板
	 */
	private getTemplateById(templateId: string): ParseTemplate | null {
		logger.debug("🔍 查找模板:", templateId);

		// 参数验证：如果模板ID为空，使用默认问答题模板
		if (!templateId || templateId.trim() === "") {
			logger.warn("⚠️ 模板ID为空，降级使用官方问答题模板");
			const defaultTemplate = getOfficialTemplateById("official-qa");
			return defaultTemplate ? { ...defaultTemplate } : null;
		}

		// 1. 先在官方模板中查找
		const officialTemplate = getOfficialTemplateById(templateId);
		if (officialTemplate) {
			logger.debug("✓ 找到官方模板:", officialTemplate.name, `(${officialTemplate.id})`);
			// 返回深拷贝，避免修改原始定义
			return { ...officialTemplate };
		}

		// 2. 再在用户模板中查找（外部导入的模板）
		const settings = this.plugin.settings.simplifiedParsing;
		if (settings) {
			const userTemplate = settings.templates.find((t) => t.id === templateId);
			if (userTemplate) {
				logger.debug("✓ 找到用户模板:", userTemplate.name, `(${userTemplate.id})`);
				return userTemplate;
			}
		}

		// 3. 降级机制：找不到时使用官方问答题模板
		const availableOfficial = getOfficialTemplates().map((t) => t.id);
		const availableUser = settings?.templates.map((t) => t.id) || [];

		logger.warn("⚠️ 模板不存在:", templateId);
		logger.warn("   可用的官方模板:", availableOfficial.join(", "));
		if (availableUser.length > 0) {
			logger.warn("   可用的用户模板:", availableUser.join(", "));
		}
		logger.warn("   降级使用官方问答题模板 (official-qa)");

		// 返回默认问答题模板
		const defaultTemplate = getOfficialTemplateById("official-qa");
		return defaultTemplate ? { ...defaultTemplate } : null;
	}
}
