/**
 * APKG导入服务
 *
 * 应用层服务，编排整个导入流程
 *
 * @module application/services/apkg
 */

import type { Card, Deck, DeckSettings, DeckStats } from "../../../data/types";
import type {
  ConversionConfig,
  ImportConfig,
  ImportExecutionOptions,
  ImportError,
  ImportProgress,
  ImportResult,
  ImportStats,
  ProgressCallback,
} from "../../../domain/apkg/types";
import { isImportAbortError, throwIfImportAborted } from "../../../domain/apkg/ImportTaskControl";
import type { IDataStorageAdapter } from "../../../infrastructure/adapters/DataStorageAdapter";
import type { IMediaStorageAdapter } from "../../../infrastructure/adapters/MediaStorageAdapter";
import type { WeavePlugin } from "../../../main";
import {
  DEFAULT_SIMPLIFIED_PARSING_SETTINGS,
  type ParseTemplate,
  type SimplifiedParsingSettings,
} from "../../../types/newCardParsingTypes";

import { CardBuilder } from "../../../domain/apkg/builder/CardBuilder";
import { FieldSideResolver } from "../../../domain/apkg/converter/FieldSideResolver";
import {
  MediaProcessor,
  type MediaProcessingProgress,
} from "../../../domain/apkg/converter/MediaProcessor";
import {
  APKGParser,
  type APKGParserProgress,
} from "../../../domain/apkg/parser/APKGParser";
import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import { generateId } from "../../../utils/helpers";
import { AnkiTemplateConverter } from "./AnkiTemplateConverter";

interface APKGImportServiceOptions {
  wasmUrl?: string;
}

const UI_YIELD_BATCH_SIZE = 20;

type ImportStorageProgressCallback = (current: number, total: number, detail: string) => void;

/**
 * APKG导入服务
 */
export class APKGImportService {
  private logger: APKGLogger;
  private parser: APKGParser;
  private fieldResolver: FieldSideResolver;
  private mediaProcessor: MediaProcessor;
  private cardBuilder: CardBuilder;
  private templateConverter: AnkiTemplateConverter;
  private dataStorage: IDataStorageAdapter;
  private progressCallback?: ProgressCallback;

  static readonly STANDARD_OBSIDIAN_CONVERSION_CONFIG: ConversionConfig = {
    preserveComplexTables: true,
    convertSimpleTables: true,
    mediaFormat: "wikilink",
    clozeFormat: "==",
    preserveStyles: false,
    preserveCardContentHtml: false,
    tableComplexityThreshold: {
      maxColumns: 10,
      maxRows: 20,
      allowMergedCells: false,
    },
  };

  static createStandardImportConfig(file: File, targetDeckName?: string): ImportConfig {
    return {
      file,
      conversion: {
        ...APKGImportService.STANDARD_OBSIDIAN_CONVERSION_CONFIG,
        tableComplexityThreshold: {
          ...APKGImportService.STANDARD_OBSIDIAN_CONVERSION_CONFIG.tableComplexityThreshold,
        },
      },
      skipExisting: false,
      createDeckIfNotExist: true,
      targetDeckName,
    };
  }

  constructor(
    dataStorage: IDataStorageAdapter,
    mediaStorage: IMediaStorageAdapter,
    options?: APKGImportServiceOptions
  ) {
    this.logger = new APKGLogger({ prefix: "[APKGImportService]" });
    this.parser = new APKGParser(options?.wasmUrl);
    this.fieldResolver = new FieldSideResolver();
    this.mediaProcessor = new MediaProcessor(mediaStorage);
    this.cardBuilder = new CardBuilder();
    this.templateConverter = new AnkiTemplateConverter();
    this.dataStorage = dataStorage;
  }

  private async yieldToUI(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
        return;
      }

      setTimeout(resolve, 0);
    });
  }

  private async updateProgressAndYield(
    stage: ImportProgress["stage"],
    progress: number,
    message: string,
    extra?: { totalItems?: number; completedItems?: number; currentItem?: string }
  ): Promise<void> {
    this.updateProgress(stage, progress, message, extra);
    await this.yieldToUI();
  }

  private async maybeYieldDuringLoop(index: number, total: number): Promise<void> {
    if (index <= 0 || index >= total) {
      return;
    }

    if (index % UI_YIELD_BATCH_SIZE === 0) {
      await this.yieldToUI();
    }
  }

  private async saveCardsWithProgress(cards: Card[], signal?: AbortSignal): Promise<void> {
    throwIfImportAborted(signal);
    const callback: ImportStorageProgressCallback = (current, total, detail) => {
      const safeTotal = Math.max(1, total);
      const normalizedCurrent = Math.min(current, safeTotal);
      const progress = 90 + (normalizedCurrent / safeTotal) * 9;
      this.updateProgress("saving", progress, detail, {
        totalItems: safeTotal,
        completedItems: normalizedCurrent,
      });
    };

    await this.dataStorage.createCards(cards, callback);
    throwIfImportAborted(signal);
    await this.yieldToUI();
  }

  private async createDefaultDeckSettings(): Promise<DeckSettings> {
    return this.dataStorage.getDefaultDeckSettings({
      newCardsPerDay: 20,
      maxReviewsPerDay: 100,
      enableAutoAdvance: true,
      showAnswerTime: 0,
    });
  }

  private createEmptyDeckStats(): DeckStats {
    return {
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
  }

  private mapRelativeProgress(relativeProgress: number, start: number, end: number): number {
    const clamped = Math.max(0, Math.min(relativeProgress, 100));
    return start + ((end - start) * clamped) / 100;
  }

  private forwardParserProgress(progress: APKGParserProgress): void {
    if (progress.stage === "archive") {
      this.updateProgress(
        "parsing",
        this.mapRelativeProgress(progress.progress, 10, 20),
        progress.message,
        {
          totalItems: progress.totalItems,
          completedItems: progress.completedItems,
          currentItem: progress.currentItem,
        }
      );
      return;
    }

    if (progress.stage === "database") {
      this.updateProgress(
        "parsing",
        this.mapRelativeProgress(progress.progress, 20, 30),
        progress.message,
        {
          totalItems: progress.totalItems,
          completedItems: progress.completedItems,
          currentItem: progress.currentItem,
        }
      );
      return;
    }

    this.updateProgress(
      "media",
      this.mapRelativeProgress(progress.progress, 45, 52),
      progress.message,
      {
        totalItems: progress.totalItems,
        completedItems: progress.completedItems,
        currentItem: progress.currentItem,
      }
    );
  }

  private forwardMediaProcessingProgress(progress: MediaProcessingProgress): void {
    this.updateProgress(
      "media",
      this.mapRelativeProgress(progress.progress, 52, 60),
      progress.message,
      {
        totalItems: progress.totalItems,
        completedItems: progress.completedItems,
        currentItem: progress.currentItem,
      }
    );
  }

  /**
   * 导入APKG文件
   *
   * @param config - 导入配置
   * @param plugin - 插件实例（用于保存模板）
   * @param onProgress - 进度回调
   * @param executionOptions - 执行选项
   * @returns 导入结果
   */
  async import(
    config: ImportConfig,
    plugin: WeavePlugin,
    onProgress?: ProgressCallback,
    executionOptions?: ImportExecutionOptions
  ): Promise<ImportResult> {
    const startTime = Date.now();
    this.progressCallback = onProgress;
    const signal = executionOptions?.signal;

    let currentStage: ImportProgress["stage"] = "parsing";

    const errors: ImportError[] = [];
    const warnings: string[] = [];

    const stats: ImportStats = {
      totalCards: 0,
      importedCards: 0,
      skippedCards: 0,
      failedCards: 0,
      mediaFiles: 0,
      mediaTotalSize: 0,
    };

    const previousDataChangeContext = (plugin as any).__weaveDataChangeContext;
    (plugin as any).__weaveDataChangeContext = {
      source: "apkg_import",
      suppressDeckNotifications: true,
      deckIds: [],
    };

    try {
      this.logger.info(`开始导入APKG: ${config.file.name}`);
      throwIfImportAborted(signal);

      currentStage = "parsing";
      await this.updateProgressAndYield("parsing", 10, "正在解析 APKG 导入包...");
      const archive = await this.parser.prepareArchive(
        config.file,
        (progress) => {
          this.forwardParserProgress(progress);
        },
        { signal }
      );
      const parsedData = await this.parser.parseDatabase(
        archive,
        (progress) => {
          this.forwardParserProgress(progress);
        },
        { signal }
      );
      stats.totalCards = parsedData.notes.length;

      currentStage = "analyzing";
      await this.updateProgressAndYield("analyzing", 30, "正在分析 Anki 字段结构...");
      throwIfImportAborted(signal);
      const fieldSideMap = this.fieldResolver.resolve(parsedData.models);

      currentStage = "analyzing";
      await this.updateProgressAndYield("analyzing", 40, "正在转换模板映射...");
      const importedTemplates = await this.createTemplates(parsedData.models, fieldSideMap, plugin, signal);

      currentStage = "media";
      await this.updateProgressAndYield("media", 45, "正在提取媒体资源...");
      const mediaMap = await this.parser.extractMedia(
        archive,
        (progress) => {
          this.forwardParserProgress(progress);
        },
        { signal }
      );
      const deckName = config.targetDeckName || parsedData.decks[0]?.name || "导入牌组";
      await this.updateProgressAndYield("media", 52, "正在迁移媒体到 Obsidian 附件...");
      const mediaResult = await this.mediaProcessor.process(
        mediaMap,
        deckName,
        (progress) => {
          this.forwardMediaProcessingProgress(progress);
        },
        { signal }
      );

      this.logger.info(
        `APKG源数据准备完成: ${parsedData.notes.length} 个笔记, ${mediaMap.size} 个媒体文件`
      );

      stats.mediaFiles = mediaResult.stats.savedFiles;
      stats.mediaTotalSize = mediaResult.stats.totalSize;

      if (mediaResult.errors.length > 0) {
        warnings.push(...mediaResult.errors.map((e) => e.error));
      }

      currentStage = "building";
      await this.updateProgressAndYield("building", 60, "正在准备 Weave 牌组...");
      throwIfImportAborted(signal);
      const deck = await this.getOrCreateDeck(deckName);
      (plugin as any).__weaveDataChangeContext = {
        ...(plugin as any).__weaveDataChangeContext,
        source: "apkg_import",
        suppressDeckNotifications: true,
        deckIds: [deck.id],
      };

      currentStage = "converting";
      await this.updateProgressAndYield("converting", 65, "正在标准化卡片内容...", {
        totalItems: parsedData.notes.length,
        completedItems: 0,
      });

      const modelMap = new Map(parsedData.models.map((model) => [model.id, model]));
      const cards: Card[] = [];

      for (let i = 0; i < parsedData.notes.length; i++) {
        throwIfImportAborted(signal);
        const note = parsedData.notes[i];
        const model = modelMap.get(note.mid);

        if (!model) {
          errors.push({
            noteId: note.id,
            stage: "building",
            message: `未找到模型: ${note.mid}`,
            code: "MODEL_NOT_FOUND",
          });
          stats.failedCards++;
          continue;
        }

        const template = importedTemplates.get(model.id);
        const result = await this.cardBuilder.buildAsync(
          {
            note,
            model,
            deckId: deck.id,
            deckName: deck.name,
            templateId: template?.id,
            fieldSideMap: fieldSideMap[model.id],
            mediaPathMap: mediaResult.savedFiles,
            conversionConfig: config.conversion,
          },
          {
            signal,
          }
        );

        if (result.success && result.card) {
          cards.push(result.card as Card);
          stats.importedCards++;
        } else {
          stats.failedCards++;
          errors.push({
            noteId: note.id,
            stage: "building",
            message: result.warnings.join("; "),
            code: "BUILD_FAILED",
          });
        }

        if (i % 10 === 0) {
          this.updateProgress(
            "converting",
            65 + ((i + 1) / Math.max(1, parsedData.notes.length)) * 24,
            "正在标准化卡片内容...",
            {
              totalItems: parsedData.notes.length,
              completedItems: i + 1,
            }
          );
        }

        await this.maybeYieldDuringLoop(i + 1, parsedData.notes.length);
      }

      currentStage = "saving";
      await this.updateProgressAndYield("saving", 90, "正在写入 Weave 卡片数据...");
      await this.saveCardsWithProgress(cards, signal);
      await this.dataStorage.saveAll();

      await this.updateProgressAndYield("saving", 100, "导入完成");
      const duration = Date.now() - startTime;
      this.logger.info(`导入完成: ${stats.importedCards}/${stats.totalCards} 张卡片, 耗时 ${duration}ms`);

      return {
        success: errors.length === 0,
        deckId: deck.id,
        deckName: deck.name,
        stats,
        errors,
        warnings,
        duration,
      };
    } catch (error) {
      this.logger.error("导入失败", error);
      errors.push({
        stage: currentStage,
        message: error instanceof Error ? error.message : String(error),
        code: isImportAbortError(error) ? "IMPORT_ABORTED" : "IMPORT_FAILED",
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        stats,
        errors,
        warnings,
        duration: Date.now() - startTime,
      };
    } finally {
      (plugin as any).__weaveDataChangeContext = previousDataChangeContext;
    }
  }

  /**
   * 获取或创建牌组
   */
  private async getOrCreateDeck(name: string): Promise<Deck> {
    let deck = await this.dataStorage.getDeckByName(name);

    if (!deck) {
      const now = new Date().toISOString();
      deck = {
        id: generateId(),
        name,
        description: "从 APKG文件导入的牌组",
        category: "",
        path: name,
        level: 0,
        order: 0,
        inheritSettings: false,
        settings: await this.createDefaultDeckSettings(),
        stats: this.createEmptyDeckStats(),
        includeSubdecks: false,
        created: now,
        modified: now,
        tags: [],
        metadata: {
          source: "apkg_import",
          importedAt: now,
        },
      };

      await this.dataStorage.createDeck(deck);
      this.logger.info(`创建新牌组: ${deck.name} (${deck.id})`);
    } else {
      this.logger.info(`使用已存在牌组: ${deck.name} (${deck.id})`);
    }

    return deck;
  }

  /**
   * 更新进度
   */
  private updateProgress(
    stage: ImportProgress["stage"],
    progress: number,
    message: string,
    extra?: { totalItems?: number; completedItems?: number; currentItem?: string }
  ): void {
    if (this.progressCallback) {
      this.progressCallback({
        stage,
        progress,
        message,
        detail: extra?.currentItem,
        totalItems: extra?.totalItems,
        completedItems: extra?.completedItems,
      });
    }
  }

  /**
   * 创建或复用模板
   *
   * @param models - Anki模型列表
   * @param fieldSideMap - 字段显示面映射
   * @param plugin - 插件实例
   * @returns 模板ID到模板的映射
   */
  private async createTemplates(
    models: import("../../../domain/apkg/types").AnkiModel[],
    fieldSideMap: import("../../../domain/apkg/types").FieldSideMap,
    plugin: WeavePlugin,
    signal?: AbortSignal
  ): Promise<Map<number, ParseTemplate>> {
    const templateMap = new Map<number, ParseTemplate>();
    let hasNewTemplates = false;

    let simplifiedParsing: SimplifiedParsingSettings;
    if (plugin.settings.simplifiedParsing) {
      simplifiedParsing = {
        ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS,
        ...plugin.settings.simplifiedParsing,
        symbols: {
          ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS.symbols,
          ...plugin.settings.simplifiedParsing.symbols,
        },
        batchParsing: {
          ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS.batchParsing,
          ...plugin.settings.simplifiedParsing.batchParsing,
        },
      };
    } else {
      simplifiedParsing = { ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS };
    }

    if (!Array.isArray(simplifiedParsing.templates)) {
      simplifiedParsing.templates = [];
    }

    plugin.settings.simplifiedParsing = simplifiedParsing;
    const settings = simplifiedParsing;

    this.logger.info(`开始为 ${models.length} 个Anki模型创建模板`);

    for (let index = 0; index < models.length; index++) {
      throwIfImportAborted(signal);
      const model = models[index];
      this.updateProgress("analyzing", 40 + ((index + 1) / Math.max(1, models.length)) * 8, "正在创建模板...", {
        totalItems: models.length,
        completedItems: index + 1,
        currentItem: model.name,
      });

      const existing = this.templateConverter.findExistingTemplate(model.id, settings.templates);
      if (existing) {
        this.logger.info(`复用已存在模板: ${existing.name} (Model ID: ${model.id})`);
        templateMap.set(model.id, existing);
        await this.maybeYieldDuringLoop(index + 1, models.length);
        continue;
      }

      const newTemplate = this.templateConverter.convertModelToTemplate(model, fieldSideMap[model.id]);
      settings.templates.push(newTemplate);
      hasNewTemplates = true;

      this.logger.info(`创建新模板: ${newTemplate.name} (Model ID: ${model.id})`);
      templateMap.set(model.id, newTemplate);
      await this.maybeYieldDuringLoop(index + 1, models.length);
    }

    if (hasNewTemplates) {
      throwIfImportAborted(signal);
      await plugin.saveSettings();
    }

    this.logger.info(`模板创建完成: ${templateMap.size} 个模板`);
    return templateMap;
  }
}
