/**
 * APKG 文件解析器
 *
 * 负责解析APKG文件，提取所有原始数据
 *
 * @module domain/apkg/parser
 */

import JSZip from "jszip";
import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import { throwIfImportAborted } from "../ImportTaskControl";
import type { APKGData, APKGFormat } from "../types";
import { SQLiteReader } from "./SQLiteReader";

const UI_YIELD_BATCH_SIZE = 20;

export interface APKGPreparedArchive {
  zip: JSZip;
  format: APKGFormat;
}

export interface APKGParserProgress {
  stage: "archive" | "database" | "media";
  progress: number;
  message: string;
  totalItems?: number;
  completedItems?: number;
  currentItem?: string;
}

export type APKGParserProgressCallback = (progress: APKGParserProgress) => void;

/**
 * APKG 解析器
 */
export class APKGParser {
  private logger: APKGLogger;
  private sqlReader: SQLiteReader;

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

  private emitProgress(
    onProgress: APKGParserProgressCallback | undefined,
    stage: APKGParserProgress["stage"],
    progress: number,
    message: string,
    extra?: { totalItems?: number; completedItems?: number; currentItem?: string }
  ): void {
    onProgress?.({
      stage,
      progress,
      message,
      totalItems: extra?.totalItems,
      completedItems: extra?.completedItems,
      currentItem: extra?.currentItem,
    });
  }

  private async emitProgressAndYield(
    onProgress: APKGParserProgressCallback | undefined,
    stage: APKGParserProgress["stage"],
    progress: number,
    message: string,
    extra?: { totalItems?: number; completedItems?: number; currentItem?: string }
  ): Promise<void> {
    this.emitProgress(onProgress, stage, progress, message, extra);
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

  constructor(wasmUrl?: string) {
    this.logger = new APKGLogger({ prefix: "[APKGParser]" });
    this.sqlReader = new SQLiteReader(wasmUrl);
  }

  /**
   * 解析APKG文件
   *
   * @param file - APKG文件
   * @returns 解析后的数据
   */
  async parse(
    file: File,
    onProgress?: APKGParserProgressCallback,
    options?: { signal?: AbortSignal }
  ): Promise<APKGData> {
    try {
      const archive = await this.prepareArchive(file, onProgress, options);
      const parsedData = await this.parseDatabase(archive, onProgress, options);
      const media = await this.extractMedia(archive, onProgress, options);

      this.logger.info(`解析完成: ${parsedData.notes.length} 个笔记, ${media.size} 个媒体文件`);

      return {
        ...parsedData,
        media,
      };
    } catch (error) {
      this.logger.error("APKG解析失败", error);
      throw error;
    }
  }

  async prepareArchive(
    file: File,
    onProgress?: APKGParserProgressCallback,
    options?: { signal?: AbortSignal }
  ): Promise<APKGPreparedArchive> {
    this.logger.info(`开始解析APKG文件: ${file.name}`);
    throwIfImportAborted(options?.signal);
    await this.emitProgressAndYield(onProgress, "archive", 5, "正在解压APKG文件...");

    const zip = await this.extractZip(file);
    throwIfImportAborted(options?.signal);
    this.emitProgress(onProgress, "archive", 80, "正在识别APKG格式...");

    const format = this.detectFormat(zip);
    this.logger.info(`检测到APKG格式: ${format.description}`);

    if (!format.supported) {
      throw new Error(`不支持的APKG格式: ${format.description}`);
    }

    await this.emitProgressAndYield(onProgress, "archive", 100, `已识别APKG格式: ${format.description}`);

    return { zip, format };
  }

  async parseDatabase(
    archive: APKGPreparedArchive,
    onProgress?: APKGParserProgressCallback,
    options?: { signal?: AbortSignal }
  ): Promise<Omit<APKGData, "media">> {
    throwIfImportAborted(options?.signal);
    await this.emitProgressAndYield(onProgress, "database", 5, "正在读取数据库...");

    const dbData = await archive.zip.file(archive.format.dbFileName)?.async("uint8array");
    if (!dbData) {
      throw new Error(`未找到数据库文件: ${archive.format.dbFileName}`);
    }

    this.emitProgress(onProgress, "database", 35, "正在解析数据库...");
    const { models, decks, notes, metadata } = await this.sqlReader.read(dbData, archive.format, {
      signal: options?.signal,
      onProgress: (progress) => {
        this.emitProgress(onProgress, "database", progress.progress, progress.message, {
          totalItems: progress.totalItems,
          completedItems: progress.completedItems,
        });
      },
    });
    await this.emitProgressAndYield(
      onProgress,
      "database",
      100,
      `数据库读取完成: ${notes.length} 个笔记`
    );

    return {
      models,
      decks,
      notes,
      metadata,
    };
  }

  /**
   * 解压ZIP文件
   */
  private async extractZip(file: File): Promise<JSZip> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      this.logger.debug(`ZIP解压成功，包含 ${Object.keys(zip.files).length} 个文件`);
      return zip;
    } catch (error) {
      throw new Error(`ZIP解压失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 检测APKG格式
   */
  private detectFormat(zip: JSZip): APKGFormat {
    // 检查最新格式 (Anki 2.1.50+)
    if (zip.file("collection.anki21b")) {
      return {
        version: "anki21b",
        dbFileName: "collection.anki21b",
        supported: false, // 新版格式已弃用
        description: "Anki 2.1.50+ 最新格式 (已弃用，请使用旧版格式)",
        mediaFormat: "protobuf",
        compression: "zstd",
      };
    }

    // 检查Legacy 2格式 (Anki 2.1.x)
    if (zip.file("collection.anki21")) {
      return {
        version: "anki21",
        dbFileName: "collection.anki21",
        supported: true,
        description: "Anki 2.1.x Legacy 2 格式 (deflate压缩 + JSON)",
        mediaFormat: "json",
        compression: "deflate",
      };
    }

    // 检查Legacy 1格式 (Anki 2.0.x)
    if (zip.file("collection.anki2")) {
      return {
        version: "anki2",
        dbFileName: "collection.anki2",
        supported: true,
        description: "Anki 2.0.x Legacy 1 格式 (deflate压缩 + JSON)",
        mediaFormat: "json",
        compression: "deflate",
      };
    }

    throw new Error("无法识别的APKG格式：未找到有效的数据库文件");
  }

  /**
   * 提取媒体文件
   */
  async extractMedia(
    archive: APKGPreparedArchive,
    onProgress?: APKGParserProgressCallback,
    options?: { signal?: AbortSignal }
  ): Promise<Map<string, Uint8Array>> {
    const media = new Map<string, Uint8Array>();

    throwIfImportAborted(options?.signal);
    const mediaFile = archive.zip.file("media");
    if (!mediaFile) {
      this.logger.warn("未找到媒体映射文件");
      await this.emitProgressAndYield(onProgress, "media", 100, "未找到媒体映射文件");
      return media;
    }

    await this.emitProgressAndYield(onProgress, "media", 5, "正在读取媒体映射...");
    const mediaJsonText = await mediaFile.async("text");
    throwIfImportAborted(options?.signal);
    const mediaMapping: Record<string, string> = JSON.parse(mediaJsonText);
    const mediaEntries = Object.entries(mediaMapping);

    if (mediaEntries.length === 0) {
      await this.emitProgressAndYield(onProgress, "media", 100, "未检测到媒体文件");
      return media;
    }

    for (let entryIndex = 0; entryIndex < mediaEntries.length; entryIndex++) {
      throwIfImportAborted(options?.signal);
      const [index, filename] = mediaEntries[entryIndex];
      const file = archive.zip.file(index);
      if (file) {
        const data = await file.async("uint8array");
        throwIfImportAborted(options?.signal);
        media.set(filename, data);
        this.logger.debug(`提取媒体文件: ${filename} (${data.length} bytes)`);
      } else {
        this.logger.warn(`媒体文件缺失: ${filename} (索引: ${index})`);
      }

      this.emitProgress(onProgress, "media", 10 + ((entryIndex + 1) / mediaEntries.length) * 90, "正在提取媒体文件...", {
        totalItems: mediaEntries.length,
        completedItems: entryIndex + 1,
        currentItem: filename,
      });
      await this.maybeYieldDuringLoop(entryIndex + 1, mediaEntries.length);
    }

    return media;
  }
}
