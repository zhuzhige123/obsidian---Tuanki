import { logger } from "../../utils/logger";
/**
 * Anki导入适配器
 *
 * 负责将Anki数据结构转换为Weave数据结构
 * 隔离Anki复杂性，保持Weave数据结构的纯净性
 *
 * @module services/ankiconnect
 */

import { getMediaFolder } from "../../config/paths"; // 使用可配置的媒体文件夹路径
import type { Card } from "../../data/types";
import { CardBuilder } from "../../domain/apkg/builder/CardBuilder";
import { ContentConverter } from "../../domain/apkg/converter/ContentConverter";
import { FieldSideResolver } from "../../domain/apkg/converter/FieldSideResolver";
import type { AnkiModel, AnkiNote } from "../../domain/apkg/types";
import { DEFAULT_CONVERSION_CONFIG } from "../../domain/apkg/types";
import type { ConversionConfig } from "../../domain/apkg/types";
import type { WeavePlugin } from "../../main";
import type { AnkiModelInfo, AnkiNoteInfo } from "../../types/ankiconnect-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { readAnkiConnectFieldValue } from "../../utils/anki-connect-field";
import { isCallable, readUnknownProperty } from "../../utils/dynamic-access";
import { generateCardUUID } from "../identifier/WeaveIDGenerator"; // 统一 ID 系统
import {
	buildAnkiConnectDeckMediaFolderSegment,
	sanitizeMediaFilename,
} from "../../utils/sync-safe-filename";
import type { AnkiConnectClient } from "./AnkiConnectClient";
import { ImportMappingManager } from "./ImportMappingManager";

/**
 * Anki导入适配器
 */
export class AnkiImportAdapter {
	private cardBuilder: CardBuilder;
	private fieldResolver: FieldSideResolver;
	private contentConverter: ContentConverter;
	private mappingManager: ImportMappingManager;
	private client: AnkiConnectClient;
	private plugin: WeavePlugin;

	constructor(
		mappingManager: ImportMappingManager,
		client: AnkiConnectClient,
		plugin: WeavePlugin
	) {
		this.cardBuilder = new CardBuilder();
		this.fieldResolver = new FieldSideResolver();
		this.contentConverter = new ContentConverter();
		this.mappingManager = mappingManager;
		this.client = client;
		this.plugin = plugin;
	}

	getMappingManager(): ImportMappingManager {
		return this.mappingManager;
	}

	/**
	 * 适配Anki Note为Weave Card
	 *
	 * 核心转换流程：
	 * 1. 将AnkiNoteInfo适配为APKG系统的AnkiNote格式
	 * 2. 使用FieldSideResolver解析字段显示面
	 * 3. 使用CardBuilder构建卡片（包含HTML到Markdown转换）
	 * 4. 提取和隔离Anki原始数据
	 * 5. 生成或复用UUID
	 * 6. 标记卡片来源
	 */
	async adaptAnkiNote(
		ankiNote: AnkiNoteInfo,
		template: ParseTemplate,
		modelInfo: AnkiModelInfo,
		targetDeckId: string,
		sharedMediaPathMap?: Map<string, string>,
		conversionConfig?: ConversionConfig
	): Promise<Card> {
		try {
			// 1. 数据格式适配
			const adaptedNote = this.adaptAnkiNoteInfo(ankiNote);
			const adaptedModel = this.adaptAnkiModelInfo(modelInfo);
			adaptedNote.mid = adaptedModel.id;

			// 2. 解析字段显示面
			const fieldSideMap = this.fieldResolver.resolveSingle(adaptedModel);
			// 字段显示面解析完成（已优化：移除详细日志）

			// 3. 处理媒体文件
			const mediaPathMap = sharedMediaPathMap
				? sharedMediaPathMap
				: await this.downloadMediaFiles(
						this.extractMediaFilenames(ankiNote.fields),
						modelInfo.name // 使用模型名作为牌组名
				  );

			// 媒体处理统计：检测到 ${mediaFilenames.length} 个，下载成功 ${mediaPathMap.size} 个

			// 4. 使用CardBuilder构建基础卡片
			const buildResult = this.cardBuilder.build({
				note: adaptedNote,
				model: adaptedModel,
				deckId: targetDeckId,
				templateId: template.id,
				fieldSideMap: fieldSideMap,
				mediaPathMap: mediaPathMap, //  有媒体映射
				conversionConfig: conversionConfig || DEFAULT_CONVERSION_CONFIG,
			});

			if (!buildResult.success || !buildResult.card) {
				throw new Error(`卡片构建失败: ${buildResult.warnings.join(", ")}`);
			}

			const card: Card = buildResult.card;

			// 4. 生成或复用UUID
			const existingMapping = this.mappingManager.findByAnkiNoteId(ankiNote.noteId);
			card.uuid = existingMapping?.uuid || generateCardUUID();

			// 5. 标记卡片来源
			card.source = "anki";

			// 不再填充 card.fields
			// 所有内容已合并到 card.content 中
			// 需要时通过 Parser 动态解析

			// 6.  简化 customFields，移除冗余追溯数据
			card.customFields = {
				...card.customFields,
				//  只保留必要的导入信息
				importedFrom: "ankiconnect",
				importedAt: new Date().toISOString(),
				//  移除 ankiOriginal - 冗余的 Anki 原始数据
				//  移除 weaveFields - 冗余的字段映射
			};

			// 7.  简化 metadata，移除冗余模型信息
			// 不再需要字段映射和模型结构
			// 所有内容已在 card.content 中

			// 8. 设置标签
			card.tags = ankiNote.tags || [];

			// 卡片转换完成（已优化：移除详细日志）

			return card;
		} catch (error: unknown) {
			logger.error("[AnkiImportAdapter] 转换失败:", error);
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`适配Anki Note失败: ${message}`);
		}
	}

	/**
	 * 将AnkiNoteInfo适配为APKG系统的AnkiNote格式
	 */
	private adaptAnkiNoteInfo(noteInfo: AnkiNoteInfo): AnkiNote {
		// 提取字段值（处理AnkiConnect的对象形式字段）
		const fieldValues = Object.values(noteInfo.fields).map((field) =>
			readAnkiConnectFieldValue(field)
		);

		return {
			id: noteInfo.noteId,
			guid: "", // AnkiConnect不提供GUID
			mid: 0, // 将在后续设置
			mod: Math.floor(noteInfo.mod / 1000),
			tags: (noteInfo.tags || []).join(" "),
			flds: fieldValues.join("\x1f"), // Anki字段分隔符
			sfld: fieldValues[0] || "",
		};
	}

	/**
	 * 将AnkiModelInfo适配为APKG系统的AnkiModel格式
	 */
	private adaptAnkiModelInfo(modelInfo: AnkiModelInfo): AnkiModel {
		return {
			id: modelInfo.id,
			name: modelInfo.name,
			type: 0, // 默认为普通卡片
			flds: modelInfo.fields.map((fieldName, index) => ({
				name: fieldName,
				ord: index,
				sticky: false,
				rtl: false,
				font: "Arial",
				size: 20,
			})),
			tmpls: (modelInfo.templates || []).map((tmpl, index) => ({
				name: tmpl.Name,
				ord: index,
				qfmt: tmpl.Front || "",
				afmt: tmpl.Back || "",
				bqfmt: "",
				bafmt: "",
			})),
			css: modelInfo.css || "",
		};
	}

	/**
	 * 提取Anki原始字段（纯净内容）
	 * Compatibility note: original fields no longer need to be preserved when content is the source of truth
	 */
	private extractAnkiOriginalFields(noteInfo: AnkiNoteInfo): Record<string, string> {
		const fields: Record<string, string> = {};

		for (const [fieldName, fieldValue] of Object.entries(noteInfo.fields)) {
			const value = readAnkiConnectFieldValue(fieldValue);
			if (value.trim()) {
				fields[fieldName] = value;
			}
		}

		return fields;
	}

	/**
	 * 从content中提取Weave标准字段（去除字段名前缀）
	 * Compatibility note: weaveFields no longer need to be preserved when content is the source of truth
	 *
	 * 与 CardBuilder 逻辑保持一致
	 * 1. 只保留标准字段 front 和 back
	 * 2. 移除重复的 question 和 answer
	 * 3. 增强分隔符处理，即使分隔符位置异常也能正确提取
	 */
	private extractWeaveFieldsFromContent(content: string): Record<string, string> {
		const weaveFields: Record<string, string> = {};

		// 分隔符检测（与 CardBuilder 一致）
		const dividerIndex = content.indexOf("---div---");

		if (dividerIndex === -1) {
			// 没有分隔符，全部内容视为正面
			const cleanContent = this.stripFieldNamePrefix(content.trim());
			if (cleanContent) {
				weaveFields.front = cleanContent;
			}
		} else if (dividerIndex === 0) {
			// 分隔符在开头（异常情况），后面的内容应该是正面
			const afterDivider = content.substring("---div---".length).trim();
			const cleanContent = this.stripFieldNamePrefix(afterDivider);
			if (cleanContent) {
				weaveFields.front = cleanContent;
			}
		} else {
			// 正常情况：正面 ---div--- 背面
			const beforeDivider = content.substring(0, dividerIndex).trim();
			const afterDivider = content.substring(dividerIndex + "---div---".length).trim();

			const frontContent = this.stripFieldNamePrefix(beforeDivider);
			if (frontContent) {
				weaveFields.front = frontContent;
			}

			const backContent = this.stripFieldNamePrefix(afterDivider);
			if (backContent) {
				weaveFields.back = backContent;
			}
		}

		return weaveFields;
	}

	/**
	 * 去除字段名前缀
	 *
	 * 将 "**FieldName**: content" 格式转换为纯净的 "content"
	 */
	private stripFieldNamePrefix(text: string): string {
		if (!text || !text.trim()) {
			return "";
		}

		// 匹配模式：**字段名**: 内容
		const fieldPrefixPattern = /^\*\*([^*]+)\*\*:\s*/;

		// 按段落分割（双换行符）
		const paragraphs = text.split(/\n\n+/);

		// 处理每个段落，去除字段名前缀
		const cleanedParagraphs = paragraphs
			.map((_paragraph) => {
				const trimmed = _paragraph.trim();
				if (!trimmed) return "";

				// 去除字段名前缀
				const cleaned = trimmed.replace(fieldPrefixPattern, "");
				return cleaned;
			})
			.filter((p) => p.length > 0);

		return cleanedParagraphs.join("\n\n");
	}

	/**
	 * 生成UUID（ 重构版）
	 * 使用统一 ID 系统生成新格式 UUID
	 */
	private createCardUuid(): string {
		return generateCardUUID(); // 使用新格式：tk-{12位}
	}

	// ==================== 媒体处理方法 ====================

	/**
	 * 从 Anki 字段中提取媒体文件名
	 */
	extractMediaFilenames(fields: Record<string, unknown>): string[] {
		const filenames = new Set<string>();

		for (const fieldValue of Object.values(fields)) {
			const value = readAnkiConnectFieldValue(fieldValue);
			if (!value) continue;

			// 提取图片：<img src="...">
			const imgMatches = value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
			for (const match of imgMatches) {
				const filename = match[1].trim();
				if (filename && !filename.startsWith("http://") && !filename.startsWith("https://")) {
					filenames.add(filename);
				}
			}

			// 提取音频：[sound:filename]
			const soundMatches = value.matchAll(/\[sound:([^\]]+)\]/gi);
			for (const match of soundMatches) {
				filenames.add(match[1].trim());
			}

			// 提取视频：<video src="...">
			const videoMatches = value.matchAll(/<video[^>]+src=["']([^"']+)["']/gi);
			for (const match of videoMatches) {
				const filename = match[1].trim();
				if (filename && !filename.startsWith("http://") && !filename.startsWith("https://")) {
					filenames.add(filename);
				}
			}
		}

		return Array.from(filenames);
	}

	/**
	 * 批量下载媒体文件到 Obsidian
	 */
	async downloadMediaFiles(filenames: string[], deckName: string): Promise<Map<string, string>> {
		const mediaPathMap = new Map<string, string>();

		if (filenames.length === 0) {
			// 无媒体文件需要下载
			return mediaPathMap;
		}

		try {
			// 使用统一的媒体文件夹路径
			const mediaFolderBase = getMediaFolder(this.plugin.settings?.weaveParentFolder);
			const mediaFolder = `${mediaFolderBase}/${buildAnkiConnectDeckMediaFolderSegment(deckName)}`;
			await this.ensureFolder(mediaFolder);

			// 开始下载 ${filenames.length} 个媒体文件到 ${mediaFolder}

			const concurrencyLimit = 5;
			for (let i = 0; i < filenames.length; i += concurrencyLimit) {
				const batch = filenames.slice(i, i + concurrencyLimit);
				const downloadPromises = batch.map(async (filename) => {
					try {
						const filePath = `${mediaFolder}/${sanitizeMediaFilename(filename)}`;
						const exists = await this.plugin.app.vault.adapter.exists(filePath);
						if (exists) {
							mediaPathMap.set(filename, filePath);
							return;
						}

						const base64Data = await this.client.retrieveMediaFile(filename);

						if (!base64Data) {
							return;
						}

						const arrayBuffer = this.base64ToArrayBuffer(base64Data);
						await this.plugin.app.vault.adapter.writeBinary(filePath, arrayBuffer);
						mediaPathMap.set(filename, filePath);
					} catch (error) {
						logger.error(`媒体文件下载失败: ${filename}`, error);
					}
				});

				await Promise.allSettled(downloadPromises);
			}

			logger.debug(`媒体下载完成: ${mediaPathMap.size}/${filenames.length}`);
		} catch (error) {
			logger.error("媒体处理失败:", error);
		}

		return mediaPathMap;
	}

	/**
	 * 确保文件夹存在
	 */
	private async ensureFolder(path: string): Promise<void> {
		const exists = await this.plugin.app.vault.adapter.exists(path);
		if (!exists) {
			await this.plugin.app.vault.createFolder(path);
			// 文件夹创建成功
		}
	}

	/**
	 * Base64 转 ArrayBuffer
	 */
	private base64ToArrayBuffer(base64: string): ArrayBuffer {
		try {
			const maybeBuffer = readUnknownProperty(window, "Buffer");
			const fromBuffer = readUnknownProperty(maybeBuffer, "from");
			if (isCallable(fromBuffer)) {
				const buf = Reflect.apply(fromBuffer, maybeBuffer, [base64, "base64"]) as Uint8Array;
				const copy = new Uint8Array(buf.byteLength);
				copy.set(buf);
				return copy.buffer;
			}
		} catch {
			// ignore and fallback
		}

		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	/**
	 * 计算内容哈希
	 */
	calculateContentHash(content: string): string {
		return ImportMappingManager.calculateContentHash(content);
	}
}
