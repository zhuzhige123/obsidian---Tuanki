/**
 * 批量解析文件监听器
 * 负责监听文件变更并自动触发批量解析
 */

import { TFile, Vault, EventRef, Notice } from 'obsidian';
import type AnkiPlugin from '../main';
import { SimplifiedCardParser } from '../utils/simplifiedParser/SimplifiedCardParser';
import { BatchParseConfig } from '../types/newCardParsingTypes';

/**
 * 批量解析文件监听器选项
 */
export interface BatchParsingWatcherOptions {
  /** 防抖延迟（毫秒） */
  debounceDelay: number;
  /** 是否仅监听活动文件 */
  onlyActiveFile: boolean;
  /** 是否启用自动触发 */
  autoTrigger: boolean;
  /** 包含的文件夹路径 */
  includeFolders: string[];
  /** 排除的文件夹路径 */
  excludeFolders: string[];
}

/**
 * 批量解析文件监听器
 * 
 * 功能：
 * 1. 监听 Markdown 文件的修改事件
 * 2. 检测文件是否包含批量解析范围标记
 * 3. 防抖处理，避免频繁触发
 * 4. 支持文件夹包含/排除过滤
 * 5. 自动调用解析器并创建卡片
 */
export class BatchParsingFileWatcher {
  private plugin: AnkiPlugin;
  private parser: SimplifiedCardParser;
  private options: BatchParsingWatcherOptions;
  private eventRefs: EventRef[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private isProcessing: Map<string, boolean> = new Map();

  constructor(
    plugin: AnkiPlugin,
    parser: SimplifiedCardParser,
    options: BatchParsingWatcherOptions
  ) {
    this.plugin = plugin;
    this.parser = parser;
    this.options = options;
  }

  /**
   * 初始化监听器
   */
  async initialize(): Promise<void> {
    if (!this.options.autoTrigger) {
      console.log('[BatchParsingWatcher] 自动触发已禁用');
      return;
    }

    // 监听文件修改事件
    this.eventRefs.push(
      this.plugin.app.vault.on('modify', (file: TFile) => {
        this.handleFileModify(file);
      })
    );

    console.log('[BatchParsingWatcher] ✅ 监听器已初始化');
  }

  /**
   * 处理文件修改事件
   */
  private handleFileModify(file: TFile): void {
    // 1. 检查是否为 Markdown 文件
    if (file.extension !== 'md') {
      return;
    }

    // 2. 检查是否为活动文件（如果启用了该选项）
    if (this.options.onlyActiveFile) {
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (!activeFile || file.path !== activeFile.path) {
        return;
      }
    }

    // 3. 检查文件路径是否在扫描范围内
    if (!this.shouldProcessFile(file.path)) {
      return;
    }

    // 4. 防抖处理
    this.debounceFileChange(file);
  }

  /**
   * 防抖处理文件变更
   */
  private debounceFileChange(file: TFile): void {
    // 清除之前的定时器
    if (this.debounceTimers.has(file.path)) {
      clearTimeout(this.debounceTimers.get(file.path)!);
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      this.processFile(file);
      this.debounceTimers.delete(file.path);
    }, this.options.debounceDelay);

    this.debounceTimers.set(file.path, timer);
  }

  /**
   * 处理单个文件
   */
  private async processFile(file: TFile): Promise<void> {
    // 防止重复处理
    if (this.isProcessing.get(file.path)) {
      console.log(`[BatchParsingWatcher] 跳过重复处理: ${file.path}`);
      return;
    }

    this.isProcessing.set(file.path, true);

    try {
      // 1. 读取文件内容
      const content = await this.plugin.app.vault.read(file);

      // 2. 检测是否包含批量解析范围
      if (!this.hasBatchParsingRange(content)) {
        return;
      }

      // 3. 调用解析器
      await this.triggerBatchParsing(file, content);

    } catch (error) {
      console.error('[BatchParsingWatcher] 处理文件失败:', error);
      new Notice(`❌ 批量解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      this.isProcessing.set(file.path, false);
    }
  }

  /**
   * 检测是否包含批量解析范围
   */
  private hasBatchParsingRange(content: string): boolean {
    const settings = this.plugin.settings.simplifiedParsing;
    if (!settings) {
      return false;
    }

    const { rangeStart, rangeEnd } = settings.symbols;
    return content.includes(rangeStart) && content.includes(rangeEnd);
  }

  /**
   * 触发批量解析
   */
  private async triggerBatchParsing(file: TFile, content: string): Promise<void> {
    console.log(`[BatchParsingWatcher] 🔄 开始自动解析: ${file.path}`);

    const config: BatchParseConfig = {
      settings: this.plugin.settings.simplifiedParsing!,
      scenario: 'batch',
      sourceFile: file.path,
      sourceFileName: file.name,
      sourceContent: content,
      onContentUpdated: async (updatedContent) => {
        // 块链接写入后的回调（如果启用了块链接功能）
        console.log(`[BatchParsingWatcher] 📝 文档已更新: ${file.path}`);
      }
    };

    try {
      const cards = await this.parser.parseBatchCards(content, config);

      if (cards.length > 0) {
        // 将卡片添加到数据库
        console.log(`[BatchParsingWatcher] ✅ 解析完成: ${cards.length} 张卡片`);
        
        // 调用插件的 addCardsToDB 方法
        if (typeof (this.plugin as any).addCardsToDB === 'function') {
          await (this.plugin as any).addCardsToDB(cards);
        } else {
          console.warn('[BatchParsingWatcher] addCardsToDB 方法不存在，卡片未保存');
          new Notice(`⚠️ 解析完成但未保存: ${file.name} → ${cards.length} 张卡片`, 3000);
        }
      } else {
        console.log(`[BatchParsingWatcher] ⚠️ 未找到可解析的卡片`);
      }
    } catch (error) {
      console.error('[BatchParsingWatcher] 解析失败:', error);
      throw error;
    }
  }

  /**
   * 检查文件路径是否应该被处理
   */
  private shouldProcessFile(filePath: string): boolean {
    // 检查排除列表
    if (this.options.excludeFolders.length > 0) {
      for (const excludeFolder of this.options.excludeFolders) {
        if (filePath.startsWith(excludeFolder)) {
          return false;
        }
      }
    }

    // 检查包含列表（如果指定了）
    if (this.options.includeFolders.length > 0) {
      let isIncluded = false;
      for (const includeFolder of this.options.includeFolders) {
        if (filePath.startsWith(includeFolder)) {
          isIncluded = true;
          break;
        }
      }
      if (!isIncluded) {
        return false;
      }
    }

    return true;
  }

  /**
   * 销毁监听器
   */
  destroy(): void {
    // 清除所有事件监听
    for (const eventRef of this.eventRefs) {
      this.plugin.app.vault.offref(eventRef);
    }
    this.eventRefs = [];

    // 清除所有防抖定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // 清除处理状态
    this.isProcessing.clear();

    console.log('[BatchParsingWatcher] 🔴 监听器已销毁');
  }

  /**
   * 更新选项
   */
  updateOptions(options: Partial<BatchParsingWatcherOptions>): void {
    this.options = { ...this.options, ...options };
    console.log('[BatchParsingWatcher] 🔄 选项已更新:', this.options);
  }

  /**
   * 获取当前选项
   */
  getOptions(): BatchParsingWatcherOptions {
    return { ...this.options };
  }

  /**
   * 检查是否正在运行
   */
  isRunning(): boolean {
    return this.eventRefs.length > 0;
  }
}

