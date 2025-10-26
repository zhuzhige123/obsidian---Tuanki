/**
 * 批量解析管理器
 * 集成所有批量解析服务，提供统一接口给主插件
 * 
 * 职责：
 * 1. 初始化所有子服务
 * 2. 提供命令注册接口
 * 3. 管理配置和状态
 * 4. 处理UI交互
 */

import { App, Notice, Modal, Command } from 'obsidian';
import {
  SimpleFileSelectorService,
  DeckMappingService,
  UUIDManager,
  SimpleBatchParsingService,
  SimpleBatchParsingConfig,
  FolderDeckMapping,
  IDeckStorage,
  IUUIDStorage,
  // ❌ 已移除 ICardSaver 导入
  createDefaultBatchConfig,
  BatchConfigMerger,
  ParseProgress,
  BatchParseResult
} from './index';
import { SimplifiedCardParser } from '../../utils/simplifiedParser/SimplifiedCardParser';
import { SimplifiedParsingSettings, ParsedCard } from '../../types/newCardParsingTypes'; // ✅ 添加 ParsedCard 导入

/**
 * 进度回调类型
 */
export type ProgressCallback = (progress: ParseProgress) => void;

/**
 * 批量解析管理器（🔄 重构后）
 * 职责：协调解析和保存，调用插件的统一保存流程
 */
export class BatchParsingManager {
  private app: App;
  private config: SimpleBatchParsingConfig;
  private parser: SimplifiedCardParser;
  private deckStorage: IDeckStorage;
  private uuidStorage: IUUIDStorage;
  // ❌ 已移除 cardSaver: ICardSaver
  private plugin: any; // ✅ 新增：插件实例引用，用于调用统一保存流程

  // 子服务
  private fileSelector: SimpleFileSelectorService;
  private deckMapping: DeckMappingService;
  private uuidManager: UUIDManager;
  private batchService: SimpleBatchParsingService;

  // 状态
  private isInitialized: boolean = false;
  private progressCallback?: ProgressCallback;

  constructor(
    app: App,
    parsingSettings: SimplifiedParsingSettings,
    parser: SimplifiedCardParser,
    deckStorage: IDeckStorage,
    uuidStorage: IUUIDStorage,
    plugin: any // ✅ 替换 cardSaver 为 plugin
  ) {
    this.app = app;
    this.parser = parser;
    this.deckStorage = deckStorage;
    this.uuidStorage = uuidStorage;
    this.plugin = plugin; // ✅ 保存插件引用

    // 创建默认配置
    this.config = createDefaultBatchConfig(parsingSettings);

    // 初始化子服务
    this.fileSelector = new SimpleFileSelectorService(
      app.vault,
      app.metadataCache
    );

    this.deckMapping = new DeckMappingService(
      this.config.deckMapping,
      deckStorage
    );

    this.uuidManager = new UUIDManager(
      this.config.uuid,
      app.vault,
      uuidStorage
    );

    this.batchService = new SimpleBatchParsingService(
      this.config,
      this.fileSelector,
      this.deckMapping,
      this.uuidManager,
      parser,
      // ❌ 已移除 cardSaver 参数
      app  // ✅ 传入 app 实例
    );

    this.isInitialized = true;
  }

  /**
   * 注册命令到插件
   */
  registerCommands(plugin: any): void {
    // 命令1：执行批量解析
    plugin.addCommand({
      id: 'batch-parsing-execute',
      name: '执行批量解析',
      callback: () => {
        this.executeBatchParsing();
      }
    });

    // 命令2：预览扫描范围
    plugin.addCommand({
      id: 'batch-parsing-preview',
      name: '预览批量解析范围',
      callback: () => {
        this.previewScanScope();
      }
    });

    // 命令3：选择文件并解析
    plugin.addCommand({
      id: 'batch-parsing-select-files',
      name: '选择文件进行批量解析',
      callback: () => {
        this.openFileSelector();
      }
    });

    // 命令4：清理UUID记录
    plugin.addCommand({
      id: 'batch-parsing-clean-uuids',
      name: '清理UUID记录',
      callback: () => {
        this.cleanupUUIDs();
      }
    });
  }

  /**
   * 执行批量解析（🔄 重构后）
   * 职责：协调解析和保存，调用插件的统一保存流程
   */
  async executeBatchParsing(): Promise<BatchParseResult | null> {
    if (!this.isInitialized) {
      new Notice('❌ 批量解析服务未初始化');
      return null;
    }

    if (this.batchService.isProcessing()) {
      new Notice('⚠️ 批量解析正在进行中');
      return null;
    }

    // 🐛 调试日志：显示当前使用的分隔符配置
    console.log('[批量解析] 当前使用的分隔符配置：');
    console.log(`  - rangeStart: "${this.config.parsingSettings.symbols.rangeStart}"`);
    console.log(`  - rangeEnd: "${this.config.parsingSettings.symbols.rangeEnd}"`);
    console.log(`  - cardDelimiter: "${this.config.parsingSettings.symbols.cardDelimiter}"`);
    console.log(`  - faceDelimiter: "${this.config.parsingSettings.symbols.faceDelimiter}"`);
    
    // ✅ 配置完整性检查
    const configValidation = this.validateConfig();
    if (!configValidation.valid) {
      new Notice(`❌ 配置错误: ${configValidation.message}`);
      console.error('[BatchParsingManager] 配置验证失败:', configValidation);
      return null;
    }

    try {
      // 显示进度模态窗
      const progressModal = new BatchProgressModal(this.app, () => {
        this.batchService.abort();
      });
      progressModal.open();

      // ✅ 执行解析（获取 ParsedCard[] 和统计结果）
      const { parsedCards, result } = await this.batchService.executeBatchParsing((progress) => {
        progressModal.updateProgress(progress);
        if (this.progressCallback) {
          this.progressCallback(progress);
        }
      });

      progressModal.close();

      console.log(`[BatchParsingManager] 解析完成，获得 ${parsedCards.length} 张卡片`);

      // ✅ 调用插件的统一保存流程
      if (parsedCards.length > 0) {
        new Notice(`🔄 开始保存 ${parsedCards.length} 张卡片...`);
        
        try {
          // 调用插件的 addCardsToDB 方法（统一转换和保存流程）
          await this.plugin.addCardsToDB(parsedCards);
          
          // 更新结果统计（保存成功）
          result.successfulCards = parsedCards.length;
          result.success = true;
          
          console.log(`[BatchParsingManager] ✅ 卡片保存完成`);
        } catch (saveError) {
          console.error('[BatchParsingManager] 保存卡片失败:', saveError);
          result.errors.push({
            file: 'system',
            message: `保存失败: ${saveError instanceof Error ? saveError.message : '未知错误'}`,
            error: saveError
          });
          result.success = false;
        }
      }

      // 显示结果
      this.showResult(result);

      return result;
    } catch (error) {
      console.error('[BatchParsingManager] 批量解析失败:', error);
      new Notice(`❌ 批量解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return null;
    }
  }

  /**
   * 预览扫描范围
   */
  async previewScanScope(): Promise<void> {
    try {
      const stats = await this.batchService.getScanStats();
      const files = await this.batchService.previewFiles();

      new Notice(
        `📊 扫描范围预览：\n` +
        `总文件数: ${stats.totalFiles}\n` +
        `符合条件: ${stats.includedFiles}\n` +
        `排除: ${stats.excludedFiles}\n` +
        `包含标记: ${stats.markedFiles}`,
        10000
      );

      console.log('[BatchParsingManager] 扫描范围预览:', {
        stats,
        files: files.map(f => f.path)
      });
    } catch (error) {
      console.error('[BatchParsingManager] 预览失败:', error);
      new Notice('❌ 预览失败');
    }
  }

  /**
   * 打开文件选择器
   */
  async openFileSelector(): Promise<void> {
    // TODO: 实现文件选择器模态窗集成
    // const modal = new FileSelectorModal(this.app, this.fileSelector, ...);
    // modal.open();
    new Notice('文件选择器功能开发中...');
  }

  /**
   * 清理UUID记录
   */
  async cleanupUUIDs(): Promise<void> {
    // TODO: 实现UUID清理功能
    new Notice('UUID清理功能开发中...');
  }

  /**
   * 更新配置（🔄 重构后）
   */
  updateConfig(updates: Partial<SimpleBatchParsingConfig>): void {
    this.config = { ...this.config, ...updates };

    // 更新子服务配置
    if (updates.deckMapping) {
      this.deckMapping.updateConfig(updates.deckMapping);
    }
    if (updates.uuid) {
      this.uuidManager.updateConfig(updates.uuid);
    }
    this.batchService.updateConfig(this.config);
  }

  /**
   * 🆕 更新文件夹牌组映射列表（便捷方法）
   */
  updateMappings(mappings: FolderDeckMapping[]): void {
    this.updateConfig({ folderDeckMappings: mappings });
  }

  /**
   * 获取当前配置
   */
  getConfig(): SimpleBatchParsingConfig {
    return { ...this.config };
  }

  /**
   * ✅ 验证配置完整性
   */
  private validateConfig(): { valid: boolean; message: string } {
    // 检查是否有文件夹映射配置
    if (!this.config.folderDeckMappings || this.config.folderDeckMappings.length === 0) {
      return {
        valid: false,
        message: '请先配置文件夹与牌组的映射关系'
      };
    }

    // 检查是否有启用的映射
    const enabledMappings = this.config.folderDeckMappings.filter(m => m.enabled);
    if (enabledMappings.length === 0) {
      return {
        valid: false,
        message: '没有启用的文件夹映射，请至少启用一个映射'
      };
    }

    // 检查映射配置的完整性
    for (const mapping of enabledMappings) {
      if (!mapping.folderPath) {
        return {
          valid: false,
          message: '存在未配置文件夹路径的映射'
        };
      }
      if (!mapping.targetDeckId) {
        return {
          valid: false,
          message: `映射 "${mapping.folderPath}" 未配置目标牌组`
        };
      }
    }

    return { valid: true, message: '' };
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * 显示结果
   */
  private showResult(result: BatchParseResult): void {
    const duration = (result.stats.processingTime / 1000).toFixed(1);

    if (result.success) {
      new Notice(
        `✅ 批量解析完成\n` +
        `成功: ${result.successfulCards}/${result.totalCards} 张卡片\n` +
        `处理文件: ${result.stats.filesProcessed} 个\n` +
        `用时: ${duration}秒`,
        8000
      );
    } else {
      new Notice(
        `⚠️ 批量解析完成（有错误）\n` +
        `成功: ${result.successfulCards}/${result.totalCards} 张卡片\n` +
        `错误: ${result.errors.length} 个文件失败\n` +
        `用时: ${duration}秒`,
        10000
      );
    }

    // 记录详细信息
    console.log('[BatchParsingManager] 批量解析结果:', {
      ...result,
      errors: result.errors.map(e => ({
        file: e.file,
        message: e.message
      }))
    });
  }

  /**
   * 扫描单个文件夹映射并解析卡片
   * 🔄 重构：返回解析的卡片，由上层负责保存
   * @param mapping 要扫描的映射配置
   * @param onProgress 进度回调
   * @returns 扫描结果（包含解析的卡片）
   */
  async scanSingleMapping(
    mapping: FolderDeckMapping,
    onProgress?: (current: number, total: number, file: string) => void
  ): Promise<{
    parsedCards: ParsedCard[];  // ✅ 新增：返回解析的卡片
    success: number;
    failed: number;
    files: string[];
    totalCards: number;
  }> {
    if (!this.isInitialized) {
      throw new Error('批量解析服务未初始化');
    }

    return await this.batchService.scanSingleMapping(mapping, onProgress);
  }

  /**
   * 统计单个映射中的卡片数量
   * @param mapping 映射配置
   * @returns 卡片数量
   */
  async countCardsInMapping(mapping: FolderDeckMapping): Promise<number> {
    if (!this.isInitialized) {
      throw new Error('批量解析服务未初始化');
    }

    return await this.batchService.countCardsInMapping(mapping);
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    // 清理资源
    this.deckMapping.clearCache();
    this.isInitialized = false;
  }
}

/**
 * 批量解析进度模态窗
 */
class BatchProgressModal extends Modal {
  private contentEl: HTMLElement;
  private progressBar: HTMLElement;
  private statusText: HTMLElement;
  private detailsText: HTMLElement;
  private onCancel: () => void;

  constructor(app: App, onCancel: () => void) {
    super(app);
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('batch-progress-modal');

    // 标题
    const title = contentEl.createEl('h2', { text: '批量解析进行中' });

    // 进度条
    const progressContainer = contentEl.createDiv('progress-container');
    this.progressBar = progressContainer.createDiv('progress-bar');
    this.progressBar.style.width = '0%';

    // 状态文本
    this.statusText = contentEl.createDiv('status-text');
    this.statusText.setText('正在初始化...');

    // 详细信息
    this.detailsText = contentEl.createDiv('details-text');

    // 取消按钮
    const cancelBtn = contentEl.createEl('button', { text: '取消' });
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    // 添加样式
    this.addStyles();
  }

  updateProgress(progress: ParseProgress) {
    this.progressBar.style.width = `${progress.percentage}%`;
    
    this.statusText.setText(
      `正在处理: ${progress.currentFile} (${progress.processedFiles}/${progress.totalFiles})`
    );

    this.detailsText.setText(
      `成功: ${progress.successCount} | 失败: ${progress.errorCount}`
    );
  }

  private addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .batch-progress-modal {
        padding: 2rem;
        min-width: 500px;
      }
      .batch-progress-modal h2 {
        margin: 0 0 1.5rem 0;
      }
      .progress-container {
        height: 8px;
        background: var(--background-modifier-border);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 1rem;
      }
      .progress-bar {
        height: 100%;
        background: var(--interactive-accent);
        transition: width 0.3s ease;
      }
      .status-text {
        margin-bottom: 0.5rem;
        font-weight: 500;
      }
      .details-text {
        margin-bottom: 1.5rem;
        font-size: 0.9em;
        color: var(--text-muted);
      }
      .batch-progress-modal button {
        padding: 0.5rem 1.5rem;
        background: var(--interactive-normal);
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        cursor: pointer;
      }
      .batch-progress-modal button:hover {
        background: var(--interactive-hover);
      }
    `;
    document.head.appendChild(style);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

