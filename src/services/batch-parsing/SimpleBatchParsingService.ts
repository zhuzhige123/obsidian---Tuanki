/**
 * 简化批量解析服务
 * 主流程协调器：整合文件选择、牌组映射、UUID管理和卡片解析
 * 
 * 职责：
 * 1. 协调各子服务的工作
 * 2. 执行批量解析主流程
 * 3. 处理解析结果
 * 4. 提供统计和报告
 */

import { TFile, Notice, TFolder, Vault } from 'obsidian';
import { SimpleFileSelectorService, FileSelectorConfig, ScanStats } from './SimpleFileSelectorService';
import { DeckMappingService, DeckMappingConfig, MappingResult } from './DeckMappingService';
import { UUIDManager, UUIDConfig, UUIDDetectionResult } from './UUIDManager';
import { SimplifiedCardParser } from '../../utils/simplifiedParser/SimplifiedCardParser';
import { BatchParseConfig, ParsedCard, SimplifiedParsingSettings } from '../../types/newCardParsingTypes';

/**
 * 文件夹牌组映射（统一配置）
 * 🆕 重构后的核心数据结构，整合了文件选择和牌组映射
 */
export interface FolderDeckMapping {
  /** 唯一ID (使用UUID) */
  id: string;
  
  /** Obsidian文件夹路径 */
  folderPath: string;
  
  /** 目标牌组ID */
  targetDeckId: string;
  
  /** 目标牌组名称（冗余字段，便于显示） */
  targetDeckName: string;
  
  /** 是否递归包含子文件夹 */
  includeSubfolders: boolean;
  
  /** 是否启用该映射 */
  enabled: boolean;
  
  // 可选高级配置
  /** 牌组命名策略 */
  namingStrategy?: 'folder-name' | 'custom' | 'path-based';
  
  /** 自定义牌组名称 */
  customName?: string;
  
  /** 牌组不存在时自动创建 */
  autoCreateDeck?: boolean;
  
  // 运行时统计信息（不持久化）
  /** 检测到的文件数 */
  fileCount?: number;
  
  /** 最后扫描时间 */
  lastScanned?: string;
}

/**
 * 批量解析配置（🔄 重构后）
 */
export interface SimpleBatchParsingConfig {
  // ✅ 新增：统一的文件夹牌组映射列表
  /** 文件夹与牌组的映射关系 */
  folderDeckMappings: FolderDeckMapping[];
  
  /** UUID配置 */
  uuid: UUIDConfig;
  
  /** 解析设置 */
  parsingSettings: SimplifiedParsingSettings;
  
  /** 批处理限制 */
  maxFilesPerBatch: number;
  
  /** 是否显示进度通知 */
  showProgressNotice: boolean;
  
  /** 是否在解析后自动保存文件 */
  autoSaveAfterParsing: boolean;
  
  /** 牌组名称前缀 */
  deckNamePrefix?: string;
  
  /** 路径分隔符（用于层级牌组） */
  hierarchySeparator: string;
  
  // ⚠️ 以下字段已废弃，保留用于向后兼容（将在未来版本移除）
  /** @deprecated 使用 folderDeckMappings 替代 */
  fileSelector?: FileSelectorConfig;
  
  /** @deprecated 使用 folderDeckMappings 替代 */
  deckMapping?: DeckMappingConfig;
}

/**
 * 解析进度信息
 */
export interface ParseProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  successCount: number;
  errorCount: number;
  percentage: number;
}

/**
 * 批量解析结果
 */
export interface BatchParseResult {
  success: boolean;
  totalCards: number;
  successfulCards: number;
  failedCards: number;
  newDecks: string[];
  duplicateUUIDs: string[];
  errors: Array<{
    file: string;
    message: string;
    error?: any;
  }>;
  stats: {
    filesProcessed: number;
    filesWithCards: number;
    filesSkipped: number;
    processingTime: number;
  };
}

/**
 * 卡片保存接口（需要从插件注入）
 */
export interface ICardSaver {
  /** 保存卡片 */
  saveCard(card: ParsedCard): Promise<boolean>;
  
  /** 批量保存卡片 */
  saveCards(cards: ParsedCard[]): Promise<number>;
}

/**
 * 简化批量解析服务（🔄 重构后）
 * 职责：只负责解析文件并返回 ParsedCard[]，不再负责保存
 */
export class SimpleBatchParsingService {
  private config: SimpleBatchParsingConfig;
  private fileSelector: SimpleFileSelectorService;
  private deckMapping: DeckMappingService;
  private uuidManager: UUIDManager;
  private parser: SimplifiedCardParser;
  // ❌ 已移除 cardSaver: ICardSaver - 保存由上层统一处理
  private isRunning: boolean = false;
  private abortController?: AbortController;
  private app: any; // Obsidian App 实例

  constructor(
    config: SimpleBatchParsingConfig,
    fileSelector: SimpleFileSelectorService,
    deckMapping: DeckMappingService,
    uuidManager: UUIDManager,
    parser: SimplifiedCardParser,
    // ❌ 已移除 cardSaver 参数
    app: any
  ) {
    this.config = config;
    this.fileSelector = fileSelector;
    this.deckMapping = deckMapping;
    this.uuidManager = uuidManager;
    this.parser = parser;
    // ❌ 已移除 this.cardSaver = cardSaver;
    this.app = app;
  }

  /**
   * 执行批量解析
   * 🔄 重构后：只负责解析，返回 ParsedCard[]，保存由上层处理
   */
  async executeBatchParsing(
    onProgress?: (progress: ParseProgress) => void
  ): Promise<{
    parsedCards: ParsedCard[];
    result: BatchParseResult;
  }> {
    if (this.isRunning) {
      throw new Error('批量解析正在运行中');
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const startTime = Date.now();
    const parsedCards: ParsedCard[] = []; // ✅ 收集所有解析的卡片
    const result: BatchParseResult = {
      success: false,
      totalCards: 0,
      successfulCards: 0,
      failedCards: 0,
      newDecks: [],
      duplicateUUIDs: [],
      errors: [],
      stats: {
        filesProcessed: 0,
        filesWithCards: 0,
        filesSkipped: 0,
        processingTime: 0
      }
    };

    try {
      // 1. 获取符合条件的文件列表（🔄 使用新的映射逻辑）
      let files: TFile[] = [];
      
      // 优先使用新的 folderDeckMappings
      if (this.config.folderDeckMappings && this.config.folderDeckMappings.length > 0) {
        files = await this.scanMappedFolders();
      } else if (this.config.fileSelector) {
        // 向后兼容：使用旧的 fileSelector
        files = await this.fileSelector.getFilesInScope(this.config.fileSelector);
      }
      
      if (files.length === 0) {
        new Notice('⚠️ 没有找到符合条件的文件，请检查文件夹映射配置');
        result.success = true;
        return result;
      }

      // 限制批处理文件数
      const filesToProcess = files.slice(0, this.config.maxFilesPerBatch);
      
      if (files.length > this.config.maxFilesPerBatch) {
        new Notice(
          `⚠️ 文件数量超过限制，将只处理前 ${this.config.maxFilesPerBatch} 个文件`,
          5000
        );
      }

      if (this.config.showProgressNotice) {
        new Notice(`🔄 开始批量解析：${filesToProcess.length} 个文件`);
      }

      // 2. 处理每个文件
      for (let i = 0; i < filesToProcess.length; i++) {
        if (this.abortController.signal.aborted) {
          new Notice('❌ 批量解析已取消');
          break;
        }

        const file = filesToProcess[i];
        
        // 更新进度
        const progress: ParseProgress = {
          totalFiles: filesToProcess.length,
          processedFiles: i,
          currentFile: file.name,
          successCount: result.successfulCards,
          errorCount: result.failedCards,
          percentage: Math.round((i / filesToProcess.length) * 100)
        };
        
        if (onProgress) {
          onProgress(progress);
        }

        // 处理单个文件
        try {
          const fileResult = await this.processFile(file);
          
          // ✅ 收集解析的卡片
          if (fileResult.parsedCards.length > 0) {
            parsedCards.push(...fileResult.parsedCards);
          }
          
          result.totalCards += fileResult.totalCards;
          result.successfulCards += fileResult.successfulCards;
          result.failedCards += fileResult.failedCards;
          result.newDecks.push(...fileResult.newDecks);
          result.duplicateUUIDs.push(...fileResult.duplicateUUIDs);
          
          result.stats.filesProcessed++;
          if (fileResult.totalCards > 0) {
            result.stats.filesWithCards++;
          }
        } catch (error) {
          result.errors.push({
            file: file.path,
            message: error instanceof Error ? error.message : '未知错误',
            error
          });
          console.error(`[SimpleBatchParsingService] 处理文件失败: ${file.path}`, error);
        }
      }

      // 3. 完成处理
      result.stats.processingTime = Date.now() - startTime;
      result.success = result.errors.length === 0;

      // 显示完成通知
      if (this.config.showProgressNotice) {
        this.showCompletionNotice(result);
      }

    } catch (error) {
      console.error('[SimpleBatchParsingService] 批量解析失败:', error);
      result.errors.push({
        file: 'system',
        message: error instanceof Error ? error.message : '系统错误',
        error
      });
    } finally {
      this.isRunning = false;
      this.abortController = undefined;
    }

    // ✅ 返回解析的卡片和统计结果
    return {
      parsedCards,
      result
    };
  }

  /**
   * 处理单个文件
   * 🔄 重构后：返回解析的卡片，不再保存
   */
  private async processFile(file: TFile): Promise<{
    parsedCards: ParsedCard[]; // ✅ 新增：返回解析的卡片
    totalCards: number;
    successfulCards: number;
    failedCards: number;
    newDecks: string[];
    duplicateUUIDs: string[];
  }> {
    const result = {
      parsedCards: [] as ParsedCard[], // ✅ 新增
      totalCards: 0,
      successfulCards: 0,
      failedCards: 0,
      newDecks: [] as string[],
      duplicateUUIDs: [] as string[]
    };

    // 1. 读取文件内容
    const content = await file.vault.read(file);

    // 2. 检查是否包含批量标记
    const hasMarkers = 
      content.includes(this.config.parsingSettings.symbols.rangeStart) &&
      content.includes(this.config.parsingSettings.symbols.rangeEnd);

    if (!hasMarkers) {
      // 🐛 调试日志：记录跳过原因
      console.log(`[批量解析] 文件 ${file.path} 跳过原因：`);
      console.log(`  - 查找标记 rangeStart: "${this.config.parsingSettings.symbols.rangeStart}"`);
      console.log(`  - 查找标记 rangeEnd: "${this.config.parsingSettings.symbols.rangeEnd}"`);
      console.log(`  - rangeStart 存在: ${content.includes(this.config.parsingSettings.symbols.rangeStart)}`);
      console.log(`  - rangeEnd 存在: ${content.includes(this.config.parsingSettings.symbols.rangeEnd)}`);
      return result; // 跳过没有批量标记的文件
    }

    // 3. 解析牌组（🔄 使用新的映射逻辑）
    let deckId: string;
    let deckName: string;
    
    // 优先使用新的映射逻辑
    if (this.config.folderDeckMappings && this.config.folderDeckMappings.length > 0) {
      const mapping = this.findMatchingMapping(file.path);
      
      if (mapping) {
        deckId = mapping.targetDeckId;
        deckName = mapping.targetDeckName;
      } else {
        // 没有匹配的映射，跳过该文件
        console.warn(`[SimpleBatchParsingService] 文件 ${file.path} 没有匹配的映射规则`);
        return result;
      }
    } else {
      // 向后兼容：使用旧的 deckMapping 服务
      const deckMapping = await this.deckMapping.resolveDeckForFile(file);
      deckId = deckMapping.deckId;
      deckName = deckMapping.deckName;
      
      if (deckMapping.isNewDeck) {
        result.newDecks.push(deckMapping.deckName);
      }
    }

    // 4. 执行卡片解析
    const parseConfig: BatchParseConfig = {
      settings: this.config.parsingSettings,
      scenario: 'batch',
      sourceFile: file.path,
      sourceFileName: file.name,
      sourceContent: content,
      onContentUpdated: async (updatedContent) => {
        if (this.config.autoSaveAfterParsing) {
          await file.vault.modify(file, updatedContent);
        }
      }
    };

    const parseResult = await this.parser.parseBatchCards(content, parseConfig);
    
    if (!parseResult.success || parseResult.cards.length === 0) {
      return result;
    }

    result.totalCards = parseResult.cards.length;

    // 5. 处理UUID（如果启用）
    if (this.config.uuid.enabled) {
      const uuidResult = await this.processUUIDs(file, parseResult.cards, content);
      result.duplicateUUIDs.push(...uuidResult.duplicates);
      
      // 更新文件内容（如果有UUID插入）
      if (uuidResult.contentUpdated && this.config.autoSaveAfterParsing) {
        await file.vault.modify(file, uuidResult.updatedContent);
      }
    }

    // 6. 返回解析的卡片（不再在这里保存）
    // 注意：保存工作由上层 BatchParsingManager 调用统一的保存流程
    result.totalCards = parseResult.cards.length;
    result.successfulCards = parseResult.cards.length;
    
    // 将解析的卡片和牌组信息存储起来（用于上层处理）
    // 这里我们需要将 deckId 和 deckName 信息传递给上层
    // 暂时通过 ParsedCard 的 metadata 传递
    for (const card of parseResult.cards) {
      if (!card.metadata) {
        card.metadata = {};
      }
      card.metadata.targetDeckId = deckId;
      card.metadata.targetDeckName = deckName;
    }
    
    // ✅ 将解析的卡片放入返回结果
    result.parsedCards = parseResult.cards;

    return result;
  }

  /**
   * 处理UUID
   */
  private async processUUIDs(
    file: TFile,
    cards: ParsedCard[],
    content: string
  ): Promise<{
    duplicates: string[];
    contentUpdated: boolean;
    updatedContent: string;
  }> {
    const duplicates: string[] = [];
    let contentUpdated = false;
    let updatedContent = content;

    // 为每张卡片检测或插入UUID
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      
      // 在内容中找到卡片的位置
      // 注意：这里需要更精确的位置定位逻辑
      // 暂时使用简单的搜索方法
      const cardStart = content.indexOf(card.front);
      
      if (cardStart === -1) continue;
      
      const cardEnd = cardStart + card.front.length + card.back.length;

      // 检测UUID
      const detection = await this.uuidManager.detectUUID(
        updatedContent,
        cardStart,
        cardEnd
      );

      if (detection.found && detection.uuid) {
        // 已有UUID
        if (detection.isDuplicate) {
          duplicates.push(detection.uuid);
          
          // 根据策略处理重复
          const action = await this.uuidManager.handleDuplicate(detection.uuid, file);
          
          if (action === 'skip') {
            // 跳过这张卡片
            cards.splice(i, 1);
            i--;
            continue;
          }
        }
        
        // 保存UUID记录
        if (card.id) {
          await this.uuidManager.saveRecord(
            detection.uuid,
            card.id,
            file,
            detection.lineNumber || 0
          );
        }
      } else {
        // 插入新UUID
        const insertResult = await this.uuidManager.insertUUID(
          updatedContent,
          cardStart,
          cardEnd,
          file
        );

        if (insertResult.success) {
          updatedContent = insertResult.updatedContent;
          contentUpdated = true;

          // 保存UUID记录
          if (card.id) {
            await this.uuidManager.saveRecord(
              insertResult.uuid,
              card.id,
              file,
              0
            );
          }
        }
      }
    }

    return {
      duplicates,
      contentUpdated,
      updatedContent
    };
  }

  /**
   * 显示完成通知
   */
  private showCompletionNotice(result: BatchParseResult): void {
    const duration = (result.stats.processingTime / 1000).toFixed(1);
    
    if (result.success) {
      new Notice(
        `✅ 批量解析完成：${result.successfulCards}/${result.totalCards} 张卡片 (${duration}s)`,
        5000
      );
    } else {
      new Notice(
        `⚠️ 批量解析完成（有错误）：${result.successfulCards}/${result.totalCards} 张卡片，${result.errors.length} 个文件失败`,
        7000
      );
    }
  }

  /**
   * 取消批量解析
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * 获取扫描统计
   */
  async getScanStats(): Promise<ScanStats> {
    return await this.fileSelector.getScanStats(this.config.fileSelector);
  }

  /**
   * 检查是否正在运行
   */
  isProcessing(): boolean {
    return this.isRunning;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SimpleBatchParsingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 预览将要处理的文件（🔄 重构后）
   */
  async previewFiles(): Promise<TFile[]> {
    // 使用新的映射结构
    if (this.config.folderDeckMappings && this.config.folderDeckMappings.length > 0) {
      return await this.scanMappedFolders();
    }
    
    // 向后兼容：使用旧的 fileSelector
    if (this.config.fileSelector) {
      return await this.fileSelector.getFilesInScope(this.config.fileSelector);
    }
    
    return [];
  }

  // ===== 🆕 新增方法：使用 folderDeckMappings =====

  /**
   * 扫描映射的文件夹
   */
  private async scanMappedFolders(): Promise<TFile[]> {
    const enabledMappings = (this.config.folderDeckMappings || []).filter(m => m.enabled);
    
    if (enabledMappings.length === 0) {
      return [];
    }

    const allFiles: TFile[] = [];
    
    for (const mapping of enabledMappings) {
      const files = await this.scanFolder(mapping.folderPath, mapping.includeSubfolders);
      allFiles.push(...files);
    }

    // 去重
    return this.deduplicateFiles(allFiles);
  }

  /**
   * 扫描文件夹（新方法）
   */
  private async scanFolder(folderPath: string, includeSubfolders: boolean): Promise<TFile[]> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    
    if (!folder || !(folder instanceof TFolder)) {
      console.warn(`[SimpleBatchParsingService] 文件夹不存在: ${folderPath}`);
      return [];
    }

    const files: TFile[] = [];
    
    if (includeSubfolders) {
      // 递归获取所有文件
      Vault.recurseChildren(folder, (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          files.push(file);
        }
      });
    } else {
      // 仅当前文件夹
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
          files.push(child);
        }
      }
    }
    
    return files;
  }

  /**
   * 去重文件列表
   */
  private deduplicateFiles(files: TFile[]): TFile[] {
    const seen = new Set<string>();
    const unique: TFile[] = [];
    
    for (const file of files) {
      if (!seen.has(file.path)) {
        seen.add(file.path);
        unique.push(file);
      }
    }
    
    return unique;
  }

  /**
   * 扫描单个映射的文件夹并解析卡片
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
    console.log('[SimpleBatchParsingService] 开始扫描单个映射:', {
      folderPath: mapping.folderPath,
      targetDeckId: mapping.targetDeckId,
      includeSubfolders: mapping.includeSubfolders
    });

    // 1. 扫描文件夹获取文件列表
    const files = await this.scanFolder(mapping.folderPath, mapping.includeSubfolders);
    
    if (files.length === 0) {
      console.warn('[SimpleBatchParsingService] 未找到任何文件');
      return { success: 0, failed: 0, files: [], totalCards: 0 };
    }

    console.log(`[SimpleBatchParsingService] 找到 ${files.length} 个文件`);

    // 2. 临时修改配置，设置当前扫描的牌组映射
    const originalConfig = { ...this.config };
    this.config.folderDeckMappings = [mapping];

    const result = {
      parsedCards: [] as ParsedCard[],  // ✅ 新增：收集解析的卡片
      success: 0,
      failed: 0,
      files: [] as string[],
      totalCards: 0
    };

    // 3. 逐个处理文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (onProgress) {
        onProgress(i + 1, files.length, file.path);
      }

      try {
        const fileResult = await this.processFile(file);
        result.totalCards += fileResult.totalCards;
        
        // ✅ 收集解析的卡片
        if (fileResult.parsedCards && fileResult.parsedCards.length > 0) {
          result.parsedCards.push(...fileResult.parsedCards);
          result.success++;
          result.files.push(file.path);
        } else if (fileResult.failedCards > 0) {
          result.failed++;
        }
      } catch (error) {
        console.error(`[SimpleBatchParsingService] 处理文件失败: ${file.path}`, error);
        result.failed++;
      }
    }

    // 4. 恢复原配置
    this.config = originalConfig;

    console.log('[SimpleBatchParsingService] 扫描完成:', {
      totalCards: result.totalCards,
      parsedCardsCount: result.parsedCards.length,
      success: result.success,
      failed: result.failed
    });
    return result;
  }

  /**
   * 统计单个映射中的卡片数量
   * @param mapping 映射配置
   * @returns 卡片数量
   */
  async countCardsInMapping(mapping: FolderDeckMapping): Promise<number> {
    console.log('[SimpleBatchParsingService] 统计映射卡片数:', mapping.folderPath);

    // 扫描文件夹获取文件列表
    const files = await this.scanFolder(mapping.folderPath, mapping.includeSubfolders);
    
    if (files.length === 0) {
      return 0;
    }

    let totalCards = 0;

    // 遍历文件统计卡片数
    for (const file of files) {
      try {
        const content = await file.vault.read(file);
        
        // 检查是否包含批量标记
        const hasMarkers = 
          content.includes(this.config.parsingSettings.symbols.rangeStart) &&
          content.includes(this.config.parsingSettings.symbols.rangeEnd);
        
        if (!hasMarkers) {
          continue;
        }

        // 解析文件获取卡片数
        const parseConfig: BatchParseConfig = {
          settings: this.config.parsingSettings,
          scenario: 'batch',
          sourceFile: file.path,
          sourceFileName: file.name,
          sourceContent: content
        };
        const parseResult = await this.parser.parseBatchCards(content, parseConfig);
        if (parseResult.success) {
          totalCards += parseResult.cards.length;
        }
      } catch (error) {
        console.error(`[SimpleBatchParsingService] 统计文件卡片失败: ${file.path}`, error);
      }
    }

    console.log(`[SimpleBatchParsingService] 统计完成: ${totalCards} 张卡片`);
    return totalCards;
  }

  /**
   * 查找匹配的映射规则
   */
  private findMatchingMapping(filePath: string): FolderDeckMapping | null {
    const mappings = this.config.folderDeckMappings || [];
    const enabledMappings = mappings.filter(m => m.enabled);
    
    if (enabledMappings.length === 0) {
      return null;
    }

    // 按文件夹路径长度降序排序（最具体的匹配优先）
    const sorted = [...enabledMappings].sort((a, b) => 
      b.folderPath.length - a.folderPath.length
    );
    
    for (const mapping of sorted) {
      if (mapping.includeSubfolders) {
        // 递归匹配：文件路径以映射路径开头
        if (filePath.startsWith(mapping.folderPath + '/') || 
            filePath.startsWith(mapping.folderPath)) {
          return mapping;
        }
      } else {
        // 精确匹配：文件必须直接在映射文件夹下
        const fileFolder = filePath.substring(0, filePath.lastIndexOf('/'));
        if (fileFolder === mapping.folderPath) {
          return mapping;
        }
      }
    }
    
    return null;
  }
}



