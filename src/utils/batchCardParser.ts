/**
 * 批量卡片解析器 - 重构版本，使用新的卡片解析引擎
 * 支持可配置的分隔符和挖空标记系统
 */

import type { RegexParseTemplate } from '../data/template-types';
import type { ParsedCardData } from './parsing';
import { parseTextWithTemplate, parseTextWithBestTemplate, getAvailableParseTemplates, getBatchImportParseTemplates } from './parsing';
import type { FileInfo } from './fileScanner';
import type AnkiPlugin from '../main';
import { BaseParser, type BaseParseOptions, type BaseParseResult } from './base-parser';
import { CardParsingEngine } from './cardParser/CardParsingEngine';
import { PresetManager } from './cardParser/PresetManager';
import type { CardParsingSettings, ParsedCard, ParseResult } from '../types/cardParsingTypes';

export interface BatchParseOptions extends BaseParseOptions {
  /** 是否跳过解析失败的卡片 */
  skipFailedCards?: boolean;
  /** 最大卡片数量限制 */
  maxCards?: number;
  /** 是否包含源文件信息 */
  includeSourceInfo?: boolean;
}

export interface ParsedCard extends ParsedCardData {
  /** 卡片在源文件中的索引 */
  index: number;
  /** 源文件路径 */
  sourcePath?: string;
  /** 源文件名 */
  sourceFileName?: string;
  /** 区间索引（如果来自区间解析） */
  regionIndex?: number;
  /** 原始文本内容 */
  rawContent: string;
  /** 使用的模板信息 */
  usedTemplate?: {
    id: string;
    name: string;
  };
  /** 解析置信度（0-1） */
  confidence?: number;
}

export interface BatchParseResult {
  /** 成功解析的卡片 */
  cards: ParsedCard[];
  /** 解析统计 */
  stats: {
    totalInput: number;
    successCount: number;
    failedCount: number;
    parseTime: number;
    templatesUsed: Map<string, number>;
  };
  /** 失败的解析项 */
  failures: Array<{
    index: number;
    content: string;
    error: string;
    sourcePath?: string;
  }>;
  /** 警告信息 */
  warnings: string[];
}

export class BatchCardParser extends BaseParser {
  private cardParsingEngine: CardParsingEngine | null = null;
  private presetManager: PresetManager;

  constructor(triadTemplatesJson?: string, plugin?: AnkiPlugin) {
    console.log('🔥 [BatchCardParser] 开始构造，triadTemplatesJson长度:', triadTemplatesJson?.length || 0);
    super(
      'BatchCardParser',
      getBatchImportParseTemplates,
      triadTemplatesJson,
      plugin
    );

    // 初始化新的解析系统
    this.presetManager = new PresetManager();
    this.initializeCardParsingEngine();

    console.log('🔥 [BatchCardParser] 构造完成，可用模板数量:', this.getTemplateCount());
  }

  /**
   * 初始化卡片解析引擎
   */
  private initializeCardParsingEngine(): void {
    try {
      const settings = this.getCardParsingSettings();
      this.cardParsingEngine = new CardParsingEngine(settings);
      console.log('✅ [BatchCardParser] 卡片解析引擎初始化成功');
    } catch (error) {
      console.error('❌ [BatchCardParser] 卡片解析引擎初始化失败:', error);
    }
  }

  /**
   * 获取卡片解析设置
   */
  private getCardParsingSettings(): CardParsingSettings {
    // 从插件设置中获取，如果没有则使用默认设置
    const pluginSettings = this.plugin?.settings?.cardParsing;
    return pluginSettings || this.presetManager.getDefaultSettings();
  }

  /**
   * 获取主要模板配置JSON
   */
  protected getPrimaryTemplatesJson(): string | undefined {
    // 使用三位一体模板系统
    return this.plugin?.settings?.triadTemplatesJson;
  }

  /**
   * 使用新解析引擎解析内容
   */
  async parseWithNewEngine(content: string): Promise<ParseResult | null> {
    if (!this.cardParsingEngine) {
      console.warn('⚠️ [BatchCardParser] 卡片解析引擎未初始化');
      return null;
    }

    try {
      console.log('🚀 [BatchCardParser] 使用新解析引擎解析内容，长度:', content.length);
      const result = this.cardParsingEngine.parseContent(content);

      console.log(`✅ [BatchCardParser] 新引擎解析完成: ${result.cards.length} 张卡片, ${result.errors.length} 个错误`);
      return result;
    } catch (error) {
      console.error('❌ [BatchCardParser] 新引擎解析失败:', error);
      return {
        success: false,
        cards: [],
        errors: [{ type: 'rule_error', message: `解析失败: ${error}` }],
        warnings: [],
        stats: {
          totalRules: 0,
          appliedRules: 0,
          totalMatches: 0,
          parseTime: 0,
          cardsGenerated: 0,
          clozeCount: 0
        }
      };
    }
  }

  /**
   * 更新卡片解析设置
   */
  updateCardParsingSettings(settings: CardParsingSettings): void {
    if (this.cardParsingEngine) {
      this.cardParsingEngine.updateSettings(settings);
      console.log('✅ [BatchCardParser] 卡片解析设置已更新');
    }
  }

  /**
   * 使用新解析引擎解析内容（推荐方法）
   */
  async parseWithNewEngineFromContent(
    content: string,
    sourceInfo?: { sourcePath: string; sourceFileName: string }
  ): Promise<BatchParseResult> {
    const startTime = Date.now();
    const result: BatchParseResult = {
      cards: [],
      stats: {
        totalInput: 1,
        successCount: 0,
        failedCount: 0,
        parseTime: 0,
        templatesUsed: new Map()
      },
      failures: [],
      warnings: []
    };

    try {
      console.log('🚀 [BatchCardParser] 使用新引擎解析内容，长度:', content.length);

      const parseResult = await this.parseWithNewEngine(content);

      if (!parseResult) {
        result.failures.push({
          content,
          error: '解析引擎未初始化',
          templateId: undefined,
          sourcePath: sourceInfo?.sourcePath,
          sourceFileName: sourceInfo?.sourceFileName
        });
        result.stats.failedCount++;
        return result;
      }

      if (!parseResult.success) {
        result.failures.push({
          content,
          error: parseResult.errors.map(e => e.message).join('; '),
          templateId: undefined,
          sourcePath: sourceInfo?.sourcePath,
          sourceFileName: sourceInfo?.sourceFileName
        });
        result.stats.failedCount++;
        result.warnings.push(...parseResult.warnings);
        return result;
      }

      // 转换解析结果为 BatchParseResult 格式
      parseResult.cards.forEach((parsedCard, index) => {
        const card: ParsedCard = {
          front: parsedCard.front.segments.map(s => s.content).join(''),
          back: parsedCard.back?.segments.map(s => s.content).join('') || '',
          templateId: 'new-engine', // 标识使用新引擎
          index,
          rawContent: content,
          sourcePath: sourceInfo?.sourcePath,
          sourceFileName: sourceInfo?.sourceFileName,
          // 保存原始解析数据以供后续使用
          metadata: {
            parsedCard,
            parseStats: parseResult.stats
          }
        };

        result.cards.push(card);
      });

      result.stats.successCount = result.cards.length;
      result.warnings.push(...parseResult.warnings);

      // 更新模板使用统计
      if (result.cards.length > 0) {
        result.stats.templatesUsed.set('new-engine', result.cards.length);
      }

      console.log(`✅ [BatchCardParser] 新引擎解析完成: ${result.cards.length} 张卡片`);

    } catch (error) {
      console.error('❌ [BatchCardParser] 新引擎解析失败:', error);
      result.failures.push({
        content,
        error: error instanceof Error ? error.message : '未知错误',
        templateId: undefined,
        sourcePath: sourceInfo?.sourcePath,
        sourceFileName: sourceInfo?.sourceFileName
      });
      result.stats.failedCount++;
    }

    result.stats.parseTime = Date.now() - startTime;
    return result;
  }

  /**
   * 从文件信息批量解析卡片
   */
  async parseFromFiles(files: FileInfo[], options: BatchParseOptions = {}): Promise<BatchParseResult> {
    console.log('🚀 [BatchCardParser] 开始批量解析，文件数量:', files.length);
    console.log('🔧 [BatchCardParser] 解析选项:', options);

    const startTime = Date.now();
    const result: BatchParseResult = {
      cards: [],
      stats: {
        totalInput: 0,
        successCount: 0,
        failedCount: 0,
        parseTime: 0,
        templatesUsed: new Map()
      },
      failures: [],
      warnings: []
    };

    for (const fileInfo of files) {
      console.log(`📁 [BatchCardParser] 处理文件: ${fileInfo.path}`);
      console.log(`📊 [BatchCardParser] 文件信息:`, {
        size: fileInfo.size,
        hasContent: !!fileInfo.content,
        contentLength: fileInfo.content?.length || 0
      });

      if (!fileInfo.content) {
        console.warn(`⚠️ [BatchCardParser] 文件 ${fileInfo.path} 没有内容，跳过解析`);
        result.warnings.push(`文件 ${fileInfo.path} 没有内容，跳过解析`);
        continue;
      }

      try {
        const fileResult = await this.parseFromContent(
          fileInfo.content,
          {
            ...options,
            includeSourceInfo: true
          },
          {
            sourcePath: fileInfo.path,
            sourceFileName: fileInfo.name
          }
        );

        // 合并结果
        result.cards.push(...fileResult.cards);
        result.failures.push(...fileResult.failures);
        result.warnings.push(...fileResult.warnings);

        // 更新统计
        result.stats.totalInput += fileResult.stats.totalInput;
        result.stats.successCount += fileResult.stats.successCount;
        result.stats.failedCount += fileResult.stats.failedCount;

        // 合并模板使用统计
        for (const [templateId, count] of fileResult.stats.templatesUsed) {
          const currentCount = result.stats.templatesUsed.get(templateId) || 0;
          result.stats.templatesUsed.set(templateId, currentCount + count);
        }

      } catch (error) {
        result.failures.push({
          index: -1,
          content: fileInfo.content.substring(0, 100) + '...',
          error: `解析文件失败: ${error}`,
          sourcePath: fileInfo.path
        });
        result.stats.failedCount++;
      }
    }

    result.stats.parseTime = Date.now() - startTime;
    return result;
  }


  /**
   * 从纯文本内容批量解析卡片
   */
  async parseFromContent(
    content: string,
    options: BatchParseOptions = {},
    sourceInfo?: { sourcePath: string; sourceFileName: string }
  ): Promise<BatchParseResult> {
    const startTime = Date.now();
    const result: BatchParseResult = {
      cards: [],
      stats: {
        totalInput: 1,
        successCount: 0,
        failedCount: 0,
        parseTime: 0,
        templatesUsed: new Map()
      },
      failures: [],
      warnings: []
    };

    try {
      console.log('🚀 [BatchCardParser] 开始解析内容，长度:', content.length);
      console.log('📝 [BatchCardParser] 内容预览:', content.substring(0, 200) + '...');
      console.log('🔧 [BatchCardParser] 可用模板数量:', this.templates.length);

      // 尝试多卡片分割解析
      const multiCardResult = this.parseMultipleCards(content, options, sourceInfo);
      if (multiCardResult.cards.length > 0) {
        console.log(`✅ [BatchCardParser] 多卡片解析成功，找到 ${multiCardResult.cards.length} 张卡片`);
        return multiCardResult;
      }

      // 回退到单卡片解析
      console.log('🔄 [BatchCardParser] 多卡片解析失败，回退到单卡片解析...');
      const parsedData = this.parseCardContent(content, options);

      if (parsedData) {
        console.log('✅ [BatchCardParser] 单卡片解析成功:', {
          front: parsedData.front.substring(0, 50) + '...',
          back: parsedData.back.substring(0, 50) + '...',
          templateId: parsedData.templateId
        });

        const card: ParsedCard = {
          ...parsedData,
          index: 0,
          rawContent: content,
          sourcePath: sourceInfo?.sourcePath,
          sourceFileName: sourceInfo?.sourceFileName
        };

        result.cards.push(card);
        result.stats.successCount++;

        // 更新模板使用统计
        if (parsedData.templateId) {
          result.stats.templatesUsed.set(parsedData.templateId, 1);
        }
      } else {
        console.log('❌ [BatchCardParser] 单卡片解析也失败 - 没有模板能够解析此内容');
        console.log('📝 [BatchCardParser] 内容样本:', content.substring(0, 300) + '...');

        result.failures.push({
          index: 0,
          content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          error: '没有模板能够解析此内容',
          sourcePath: sourceInfo?.sourcePath
        });
        result.stats.failedCount++;
      }
    } catch (error) {
      result.failures.push({
        index: 0,
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        error: `解析错误: ${error}`,
        sourcePath: sourceInfo?.sourcePath
      });
      result.stats.failedCount++;
    }

    result.stats.parseTime = Date.now() - startTime;
    return result;
  }

  /**
   * 多卡片分割解析
   */
  private parseMultipleCards(
    content: string,
    options: BatchParseOptions,
    sourceInfo?: { sourcePath: string; sourceFileName: string }
  ): BatchParseResult {
    console.log('🔍 [BatchCardParser] 开始多卡片分割解析...');

    const result: BatchParseResult = {
      cards: [],
      stats: {
        totalInput: 0,
        successCount: 0,
        failedCount: 0,
        parseTime: 0,
        templatesUsed: new Map()
      },
      failures: [],
      warnings: []
    };

    // ⚠️ 注意：此类为遗留兼容层，批量解析功能已迁移到 SimplifiedCardParser
    // 区间标记扫描功能已移除，请使用 SimplifiedCardParser 进行批量解析
    const cleanContent = content;

    // 方法1：按新格式字段分割 - 🔥 内测阶段：只支持新格式
    const newFormatCards = this.splitByNewFormatHeaders(cleanContent);
    if (newFormatCards.length > 1) {
      console.log(`📊 [BatchCardParser] 按新格式字段分割找到 ${newFormatCards.length} 个部分`);
      return this.parseCardSections(newFormatCards, options, sourceInfo);
    }

    // 方法2：按分隔符分割
    const separatorCards = this.splitBySeparators(cleanContent);
    if (separatorCards.length > 1) {
      console.log(`📊 [BatchCardParser] 按分隔符分割找到 ${separatorCards.length} 个部分`);
      return this.parseCardSections(separatorCards, options, sourceInfo);
    }

    console.log('❌ [BatchCardParser] 未找到多卡片分割模式');
    return result;
  }

  /**
   * 按新格式字段分割内容 - 🚫 已弃用：旧的"!字段名"格式已被简化解析系统替代
   */
  private splitByNewFormatHeaders(content: string): string[] {
    console.warn('[BatchCardParser] 旧的"!字段名"分割已弃用，请使用简化解析系统');

    // 🚫 旧逻辑已禁用 - 不再支持 !字段名 格式
    return [];
  }

  /**
   * 按分隔符分割内容
   */
  private splitBySeparators(content: string): string[] {
    console.log('🔍 [BatchCardParser] 尝试按分隔符分割...');

    // ⚠️ 使用固定分隔符，新的批量解析功能请使用 SimplifiedCardParser
    const separators = ['---cd---', '---', '***', '___'];

    for (const separator of separators) {
      console.log(`🧪 [BatchCardParser] 尝试分隔符: "${separator}"`);
      const regex = new RegExp(`^${separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm');
      const parts = content.split(regex);

      console.log(`📊 [BatchCardParser] 分割结果: ${parts.length} 个部分`);

      if (parts.length > 1) {
        const validParts = parts
          .map(part => part.trim())
          .filter(part => part.length > 0 && part.includes('##'));

        console.log(`📊 [BatchCardParser] 有效部分: ${validParts.length} 个`);

        if (validParts.length > 1) {
          console.log(`✅ [BatchCardParser] 使用分隔符 "${separator}" 找到 ${validParts.length} 个有效部分`);
          validParts.forEach((part, index) => {
            console.log(`📄 [BatchCardParser] 分隔部分 ${index + 1}: ${part.substring(0, 100)}...`);
          });
          return validParts;
        }
      }
    }

    console.log('❌ [BatchCardParser] 未找到有效的分隔符分割');
    return [];
  }

  /**
   * 解析卡片部分
   */
  private parseCardSections(
    sections: string[],
    options: BatchParseOptions,
    sourceInfo?: { sourcePath: string; sourceFileName: string }
  ): BatchParseResult {
    console.log(`🔄 [BatchCardParser] 开始解析 ${sections.length} 个卡片部分...`);

    const result: BatchParseResult = {
      cards: [],
      stats: {
        totalInput: sections.length,
        successCount: 0,
        failedCount: 0,
        parseTime: 0,
        templatesUsed: new Map()
      },
      failures: [],
      warnings: []
    };

    const startTime = Date.now();

    sections.forEach((section, index) => {
      console.log(`🔄 [BatchCardParser] 解析第 ${index + 1}/${sections.length} 个部分...`);

      try {
        const parsedData = this.parseCardContent(section, options);

        if (parsedData) {
          console.log(`✅ [BatchCardParser] 部分 ${index + 1} 解析成功:`, {
            front: parsedData.front.substring(0, 50) + '...',
            back: parsedData.back.substring(0, 50) + '...',
            templateId: parsedData.templateId
          });

          const card: ParsedCard = {
            ...parsedData,
            index,
            rawContent: section,
            sourcePath: sourceInfo?.sourcePath,
            sourceFileName: sourceInfo?.sourceFileName
          };

          result.cards.push(card);
          result.stats.successCount++;

          // 更新模板使用统计
          if (parsedData.templateId) {
            const count = result.stats.templatesUsed.get(parsedData.templateId) || 0;
            result.stats.templatesUsed.set(parsedData.templateId, count + 1);
          }
        } else {
          console.log(`❌ [BatchCardParser] 部分 ${index + 1} 解析失败`);
          result.failures.push({
            index,
            content: section.substring(0, 200) + (section.length > 200 ? '...' : ''),
            error: '没有模板能够解析此内容',
            sourcePath: sourceInfo?.sourcePath
          });
          result.stats.failedCount++;
        }
      } catch (error) {
        console.error(`❌ [BatchCardParser] 部分 ${index + 1} 解析出错:`, error);
        result.failures.push({
          index,
          content: section.substring(0, 200) + (section.length > 200 ? '...' : ''),
          error: `解析错误: ${error}`,
          sourcePath: sourceInfo?.sourcePath
        });
        result.stats.failedCount++;
      }
    });

    result.stats.parseTime = Date.now() - startTime;
    console.log(`📊 [BatchCardParser] 多卡片解析完成: 成功 ${result.stats.successCount}/${result.stats.totalInput}`);

    return result;
  }

  /**
   * 解析单个卡片内容
   */
  private parseCardContent(content: string, options: BatchParseOptions): ParsedCardData | null {
    const result = this.parseContent(content, options);
    return result.success ? result.data || null : null;
  }

  // updateTemplates 和 getAvailableTemplates 方法继承自 BaseParser

  // previewParse 方法继承自 BaseParser
}
