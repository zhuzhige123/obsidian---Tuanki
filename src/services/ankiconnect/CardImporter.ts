import { logger } from "../../utils/logger";
/**
 * 卡片导入器
 * 负责从 Anki 导入卡片到 Weave
 */

import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type {
	AnkiModelInfo,
	AnkiNoteInfo,
	ImportError,
	ImportResult,
} from "../../types/ankiconnect-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { AnkiConnectClient } from "./AnkiConnectClient";
import { AnkiTemplateConverter } from "./AnkiTemplateConverter";

// Anki 导入适配器
import { AnkiImportAdapter } from "./AnkiImportAdapter";

// 导入映射管理器
import { ImportMappingManager } from "./ImportMappingManager";

import { type ConversionConfig, DEFAULT_CONVERSION_CONFIG } from "../../domain/apkg/types";
// 备份管理组件
import { BackupManager } from "./BackupManager";

export class CardImporter {
	private plugin: WeavePlugin;
	private ankiConnect: AnkiConnectClient;
	private templateConverter: AnkiTemplateConverter;

	// 导入映射管理器
	private mappingManager: ImportMappingManager;

	// Anki 导入适配器
	private importAdapter: AnkiImportAdapter;

	// 备份管理组件
	private backupManager: BackupManager;

	constructor(
		plugin: WeavePlugin,
		ankiConnect: AnkiConnectClient,
		templateConverter: AnkiTemplateConverter
	) {
		this.plugin = plugin;
		this.ankiConnect = ankiConnect;
		this.templateConverter = templateConverter;

		// 初始化导入映射管理器
		this.mappingManager = new ImportMappingManager(plugin);

		// 初始化 Anki 导入适配器
		this.importAdapter = new AnkiImportAdapter(this.mappingManager, this.ankiConnect, this.plugin);

		// 初始化备份管理器
		this.backupManager = new BackupManager(plugin);
	}

	/**
	 * 导入整个牌组
	 */
	async importDeck(
		deckName: string,
		targetWeaveDeckId: string,
		contentConversion?: "standard" | "preserve_style" | "minimal",
		onProgress?: (current: number, total: number, status: string) => void
	): Promise<ImportResult> {
		const errors: ImportError[] = [];
		const importedTemplates: ParseTemplate[] = [];
		const importedCards: Card[] = [];
		const importedNotes: AnkiNoteInfo[] = [];
		let skippedCards = 0;
		let backupId: string | null = null;

		// 获取dataStorage引用（用于整个导入流程）
		const dataStorage = this.plugin.dataStorage;

		try {
			const conversionConfig: ConversionConfig = {
				...DEFAULT_CONVERSION_CONFIG,
				preserveStyles: contentConversion === "preserve_style" || contentConversion === "minimal",
				convertSimpleTables: contentConversion !== "minimal",
			};
			// 0. 导入前备份
			onProgress?.(0, 100, "正在创建备份...");
			if (dataStorage) {
				try {
					// 获取现有牌组和卡片用于备份
					const allDecks = await dataStorage.getAllDecks();
					const existingDeck = allDecks.find((d: unknown) => d.id === targetWeaveDeckId);

					if (existingDeck) {
						const existingCards = await dataStorage.getCardsByDeck(targetWeaveDeckId);
						if (existingCards && existingCards.length > 0) {
							backupId = await this.backupManager.createBackup(
								targetWeaveDeckId,
								existingDeck.name,
								existingCards,
								"import"
							);
							logger.debug(`✓ 已创建导入前备份: ${backupId}，包含 ${existingCards.length} 张卡片`);
						}
					}
				} catch (backupError: unknown) {
					logger.warn("备份失败，但继续导入:", backupError);
					errors.push({
						type: "storage",
						message: `备份失败: ${backupError.message}`,
					});
				}
			}

			// 1. 获取牌组中的所有 Note
			onProgress?.(5, 100, "正在获取 Anki 牌组数据...");
			const noteIds = await this.ankiConnect.findNotesByDeck(deckName);

			if (noteIds.length === 0) {
				return {
					success: true,
					importedCards: 0,
					importedTemplates: 0,
					skippedCards: 0,
					errors: [],
					templates: [],
					cards: [],
				};
			}

			onProgress?.(10, 100, `找到 ${noteIds.length} 张卡片`);

			// 2. 获取 Note 详细信息
			const notes: AnkiNoteInfo[] = [];
			const notesChunkSize = 200;
			for (let i = 0; i < noteIds.length; i += notesChunkSize) {
				const chunk = noteIds.slice(i, i + notesChunkSize);
				const chunkNotes = await this.ankiConnect.getNotesInfo(chunk);
				notes.push(...chunkNotes);

				if (onProgress) {
					const fetched = Math.min(i + notesChunkSize, noteIds.length);
					onProgress(
						10 + (fetched / Math.max(1, noteIds.length)) * 10,
						100,
						`正在获取卡片详情 ${fetched}/${noteIds.length}`
					);
				}
			}

			onProgress?.(20, 100, "正在分析模板...");

			// 3. 获取所有使用的模型（去重）
			const modelNames = [...new Set(notes.map((note) => note.modelName))];
			const templateMap = new Map<string, ParseTemplate>();
			const modelInfoCache = new Map<string, AnkiModelInfo>();
			let hasNewTemplates = false;

			// 4. 转换模板
			for (let i = 0; i < modelNames.length; i++) {
				const modelName = modelNames[i];
				try {
					const modelInfo = await this.ankiConnect.getModelInfo(modelName);
					modelInfoCache.set(modelName, modelInfo);

					// 检查是否已导入
					if (this.templateConverter.isTemplateAlreadyImported(modelInfo.id)) {
						const existingTemplate = this.templateConverter.findImportedTemplate(modelInfo.id);
						if (existingTemplate) {
							templateMap.set(modelName, existingTemplate);
							logger.debug(`模板 ${modelName} 已存在，跳过创建`);
							continue;
						}
					}

					const { template, warnings } = this.templateConverter.convertModelToTemplate(modelInfo);

					// 保存模板到设置
					await this.saveTemplate(template);
					hasNewTemplates = true;
					templateMap.set(modelName, template);
					importedTemplates.push(template);

					if (warnings.length > 0) {
						errors.push({
							type: "template_conversion",
							message: `模板 ${modelName} 转换警告: ${warnings.join(", ")}`,
							templateName: modelName,
						});
					}

					onProgress?.(
						20 + ((i + 1) / modelNames.length) * 20,
						100,
						`已转换模板 ${i + 1}/${modelNames.length}`
					);
				} catch (error: unknown) {
					errors.push({
						type: "template_conversion",
						message: `无法转换模板 ${modelName}: ${error.message}`,
						templateName: modelName,
					});
				}
			}

			onProgress?.(40, 100, "正在转换卡片...");

			// 模板批量落盘（避免每个模板一次写设置）
			try {
				if (hasNewTemplates) {
					await this.plugin.saveSettings();
				}
			} catch (e) {
				logger.warn("模板批量保存失败，但继续导入:", e);
			}

			onProgress?.(40, 100, "正在预处理媒体文件...");
			const sharedMediaPathMap = new Map<string, string>();
			try {
				const mediaFilenamesSet = new Set<string>();
				for (const note of notes) {
					const list = this.importAdapter.extractMediaFilenames(note.fields);
					for (const name of list) {
						if (name) mediaFilenamesSet.add(name);
					}
				}

				const mediaFilenames = Array.from(mediaFilenamesSet);
				if (mediaFilenames.length > 0) {
					const mediaMap = await this.importAdapter.downloadMediaFiles(mediaFilenames, deckName);
					for (const [k, v] of mediaMap.entries()) {
						sharedMediaPathMap.set(k, v);
					}
				}
			} catch (e) {
				logger.warn("媒体预处理失败，将回退到按卡片处理:", e);
			}

			// 5. 转换卡片
			for (let i = 0; i < notes.length; i++) {
				const note = notes[i];
				try {
					const template = templateMap.get(note.modelName);
					if (!template) {
						skippedCards++;
						errors.push({
							type: "card_conversion",
							message: `卡片 ${note.noteId} 的模板不可用`,
							ankiNoteId: note.noteId,
						});
						continue;
					}

					// 获取模型信息
					let modelInfo = modelInfoCache.get(note.modelName);
					if (!modelInfo) {
						modelInfo = await this.ankiConnect.getModelInfo(note.modelName);
						modelInfoCache.set(note.modelName, modelInfo);
					}

					// 使用 AnkiImportAdapter 进行转换
					const card = await this.importAdapter.adaptAnkiNote(
						note,
						template,
						modelInfo,
						targetWeaveDeckId,
						sharedMediaPathMap.size > 0 ? sharedMediaPathMap : undefined,
						conversionConfig
					);

					importedCards.push(card);
					importedNotes.push(note);

					if ((i + 1) % 10 === 0 || i === notes.length - 1) {
						onProgress?.(
							40 + ((i + 1) / notes.length) * 40,
							100,
							`已转换 ${i + 1}/${notes.length} 张卡片`
						);
					}
				} catch (error: unknown) {
					skippedCards++;
					errors.push({
						type: "card_conversion",
						message: `转换卡片失败: ${error.message}`,
						ankiNoteId: note.noteId,
					});
				}
			}

			onProgress?.(80, 100, "正在保存到 Weave...");

			// 6. 批量保存卡片到 Weave
			if (importedCards.length > 0) {
				await this.saveCardsToWeave(importedCards, targetWeaveDeckId);
			}

			// 7. 记录导入映射（防止重复导入的关键步骤）
			onProgress?.(90, 100, "正在记录导入映射...");
			for (let i = 0; i < importedCards.length; i++) {
				const card = importedCards[i];
				const note = importedNotes[i];
				if (card && note) {
					try {
						await this.mappingManager.recordMapping(
							card.uuid,
							note.noteId,
							card.uuid,
							"",
							undefined,
							note.modelName
						);
					} catch (mappingErr) {
						logger.warn(`映射记录失败 (noteId=${note.noteId}):`, mappingErr);
					}
				}
			}

			// 8. 生成并记录导入报告
			const importReport = {
				success: true,
				timestamp: new Date().toISOString(),
				summary: {
					totalCards: notes.length,
					importedCards: importedCards.length,
					skippedCards,
					importedTemplates: importedTemplates.length,
					errorCount: errors.length,
					backupId: backupId || undefined,
				},
				details: {
					deckName,
					targetDeckId: targetWeaveDeckId,
					templates: importedTemplates.map((t) => ({
						id: t.id,
						name: t.name,
						fields: t.fields?.length || 0,
					})),
					errors: errors.map((e) => ({
						type: e.type,
						message: e.message,
						cardId: e.ankiNoteId || e.templateName,
					})),
				},
			};

			onProgress?.(100, 100, "导入完成！");

			logger.debug("📊 导入报告:", importReport);

			return {
				success: true,
				importedCards: importedCards.length,
				importedTemplates: importedTemplates.length,
				skippedCards,
				errors,
				templates: importedTemplates,
				cards: importedCards,
			};
		} catch (error: unknown) {
			logger.error("❌ 导入牌组失败:", error);

			// 导入失败时，尝试回滚到最近的备份
			onProgress?.(0, 100, "导入失败，正在回滚...");
			if (backupId) {
				try {
					const restoredCards = await this.backupManager.restoreBackup(backupId);

					// 恢复卡片到牌组
					if (dataStorage) {
						await dataStorage.saveDeckCards(targetWeaveDeckId, restoredCards);
						logger.debug(`✓ 已回滚到备份: ${backupId}，恢复 ${restoredCards.length} 张卡片`);
					}
				} catch (rollbackError: unknown) {
					logger.error("❌ 回滚失败:", rollbackError);
					errors.push({
						type: "storage",
						message: `回滚失败: ${rollbackError.message}`,
					});
				}
			}

			return {
				success: false,
				importedCards: importedCards.length,
				importedTemplates: importedTemplates.length,
				skippedCards,
				errors: [
					...errors,
					{
						type: "storage",
						message: `导入失败: ${error.message}`,
					},
				],
				templates: importedTemplates,
				cards: importedCards,
			};
		}
	}

	/**
	 * 批量保存卡片到 Weave
	 * 注意：使用逐个保存以支持渐进式挖空自动转换
	 */
	async saveCardsToWeave(cards: Card[], deckId: string): Promise<void> {
		const dataStorage = this.plugin.dataStorage;
		if (!dataStorage) {
			throw new Error("DataStorage 未初始化");
		}

		try {
			//  第一道门：逐个保存以通过 Gateway 处理渐进式挖空
			let totalSaved = 0;
			for (const card of cards) {
				const cardToSave = card.deckId === deckId ? card : { ...card, deckId };
				const result = await dataStorage.saveCard(cardToSave);
				if (result.success) {
					totalSaved++;
					//  渐进式挖空转换由Gateway自动处理
					logger.debug(`✅ 卡片已保存: ${result.data?.uuid}`);
				}
			}
			logger.info(`✅ 成功保存 ${totalSaved}/${cards.length} 张卡片到牌组 ${deckId}`);
		} catch (error) {
			logger.error("❌ 保存卡片失败:", error);
			throw error;
		}
	}

	/**
	 * 保存模板到设置
	 */
	private async saveTemplate(template: ParseTemplate): Promise<void> {
		const settings = this.plugin.settings.simplifiedParsing;
		if (!settings) {
			throw new Error("SimplifiedParsing 设置未初始化");
		}

		// 检查是否已存在
		const existingIndex = settings.templates.findIndex((t) => t.id === template.id);

		if (existingIndex >= 0) {
			// 更新现有模板
			settings.templates[existingIndex] = template;
		} else {
			// 添加新模板
			settings.templates.push(template);
		}
	}
}
