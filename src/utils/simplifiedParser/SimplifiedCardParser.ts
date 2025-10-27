/**
 * 简化卡片解析器
 * 完全替代旧的三位一体模板系统
 */

import type {
  ICardParser,
  ParseConfig,
  ParseResult,
  ParsedCard,
  SingleCardParseConfig,
  BatchParseConfig,
  ParseTemplate,
  TemplateValidationResult,
  SymbolValidationResult,
  SimplifiedParsingSettings,
  CardType,
  ParseError,
  ParseStats
} from '../../types/newCardParsingTypes';
import { MultilingualPatternRecognizer, createMultilingualRecognizer } from '../multilingual-parser-support';
import { globalPerformanceMonitor } from '../parsing-performance-monitor';
import { BatchDocumentWriter } from '../../services/BatchDocumentWriter';
import { TagExtractor } from '../tag-extractor';

export class SimplifiedCardParser implements ICardParser {
  private settings: SimplifiedParsingSettings;
  private parseCache: Map<string, ParsedCard> = new Map();
  private templateCache: Map<string, ParseTemplate> = new Map();
  private multilingualRecognizer: MultilingualPatternRecognizer;
  private documentWriter?: BatchDocumentWriter;
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟

  constructor(settings: SimplifiedParsingSettings, app?: any) {
    this.settings = settings;
    
    // 初始化文档写入器
    if (app) {
      this.documentWriter = new BatchDocumentWriter(app);
    }

    // 初始化多语言识别器
    this.multilingualRecognizer = createMultilingualRecognizer({
      primaryLanguage: 'auto',
      enableAutoDetection: true,
      supportedLanguages: ['zh', 'en', 'ja', 'ko']
    });

    // 定期清理缓存
    setInterval(() => this.cleanupCache(), this.CACHE_TTL);
  }

  /**
   * 缓存管理方法
   */
  private generateCacheKey(content: string, config: any): string {
    const contentHash = this.simpleHash(content);
    const configHash = this.simpleHash(JSON.stringify(config));
    return `${contentHash}-${configHash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  private cleanupCache(): void {
    if (this.parseCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.parseCache.entries());
      const toDelete = entries.slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.3));
      toDelete.forEach(([key]) => this.parseCache.delete(key));
    }
  }

  /**
   * 解析内容 - 主入口（带缓存优化）
   */
  async parseContent(content: string, config: ParseConfig): Promise<ParseResult> {
    const startTime = Date.now();
    const result: ParseResult = {
      success: false,
      cards: [],
      errors: [],
      stats: {
        totalCards: 0,
        successfulCards: 0,
        failedCards: 0,
        cardTypes: { qa: 0, mcq: 0, cloze: 0 },
        templatesUsed: {},
        processingTime: 0
      }
    };

    try {
      // 检查标签触发
      if (!this.checkTagTrigger(content)) {
        result.errors.push({
          type: 'validation',
          message: `内容不包含触发标签: ${this.settings.triggerTag}`
        });
        return result;
      }

      // 根据场景选择解析方式
      if (config.scenario === 'batch') {
        result.cards = await this.parseBatchCards(content, config as BatchParseConfig);
      } else {
        const card = await this.parseSingleCard(content, config as SingleCardParseConfig);
        if (card) {
          result.cards = [card];
        }
      }

      result.success = result.cards.length > 0;
      result.stats = this.calculateStats(result.cards, startTime);

    } catch (error) {
      result.errors.push({
        type: 'syntax',
        message: error instanceof Error ? error.message : '解析过程中发生未知错误'
      });
    }

    return result;
  }

  /**
   * 解析单张卡片（带缓存优化和性能监控）
   */
  async parseSingleCard(content: string, config: SingleCardParseConfig): Promise<ParsedCard | null> {
    const startTime = Date.now();

    // 检查缓存
    const cacheKey = this.generateCacheKey(content, config);
    const cached = this.parseCache.get(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      globalPerformanceMonitor.recordOperation('parseSingleCard', duration, true, cached.metadata?.confidence, true);
      return { ...cached }; // 返回副本避免修改缓存
    }

    try {
      // 检查标签触发
      if (!this.checkTagTrigger(content)) {
        return null;
      }

      // 清理内容
      const cleanContent = this.preprocessContent(content);

      // 检测卡片类型
      const cardType = this.detectCardType(cleanContent);

      // 解析卡片
      const card: ParsedCard = {
        type: cardType,
        front: '',
        back: '',
        tags: this.extractTags(cleanContent),
        metadata: {
          sourceContent: content,
          parseMethod: 'symbol'
        }
      };

      // 应用模板解析（如果启用）
      if (this.settings.enableTemplateSystem && config.templateId) {
        const template = this.findTemplate(config.templateId, config.scenario);
        if (template) {
          const result = this.applyTemplate(cleanContent, template, card);
          if (result) {
            this.parseCache.set(cacheKey, result);
          }
          return result;
        }
      }

      // 使用符号解析
      const result = this.parseWithSymbols(cleanContent, card);
      if (result) {
        this.parseCache.set(cacheKey, result);
      }

      // 记录性能数据
      const duration = Date.now() - startTime;
      const success = result !== null;
      const confidence = result?.metadata?.confidence;
      globalPerformanceMonitor.recordOperation('parseSingleCard', duration, success, confidence, false);

      return result;

    } catch (error) {
      console.error('单卡解析错误:', error);

      // 记录错误性能数据
      const duration = Date.now() - startTime;
      globalPerformanceMonitor.recordOperation('parseSingleCard', duration, false, 0, false);

      return null;
    }
  }

  /**
   * 解析批量卡片
   */
  async parseBatchCards(content: string, config: BatchParseConfig): Promise<ParsedCard[]> {
    const cards: ParsedCard[] = [];

    try {
      // 1. 提取批量范围
      const batchContent = this.extractBatchRange(content);
      if (!batchContent) {
        console.warn('未找到批量解析范围标记');
        return cards;
      }

      // 2. 分割卡片
      const cardContents = this.splitCards(batchContent);
      console.log(`批量解析：找到 ${cardContents.length} 张卡片`);

      // 3. 解析每张卡片
      for (let i = 0; i < cardContents.length; i++) {
        const originalCardContent = cardContents[i].trim();
        if (!originalCardContent) continue;

        try {
          // 3.1 生成块ID（如果启用）
          let blockId: string | undefined;
          let contentToSave = originalCardContent;
          
          if (this.settings.batchParsing.autoCreateBlockLinks) {
            // 检查是否已有块ID
            if (!this.hasExistingBlockId(originalCardContent)) {
              blockId = this.generateBlockId(i);
              contentToSave = this.appendBlockId(originalCardContent, blockId);
              console.log(`卡片 ${i + 1} 生成块ID: ^${blockId}`);
            } else {
              console.log(`卡片 ${i + 1} 已存在块ID，跳过生成`);
            }
          }

          // 3.2 解析卡片内容
          const card = await this.parseSingleCard(contentToSave, {
            ...config,
            allowEmpty: false
          });

          if (card) {
            // 3.3 设置卡片ID
            card.id = `batch_${i + 1}`;
            
            // 3.4 设置源文件信息
            if (this.settings.batchParsing.autoSetSourceFile && config.sourceFile) {
              card.sourceFile = config.sourceFile;
            }
            
            // 3.5 设置块链接信息
            if (blockId) {
              card.sourceBlock = `^${blockId}`;
              
              // 存储到 metadata 供后续使用
              if (!card.metadata) {
                card.metadata = {};
              }
              card.metadata.blockId = blockId;
              card.metadata.originalCardContent = originalCardContent;
              card.metadata.contentWithBlockId = contentToSave;
            }
            
            cards.push(card);
          }

          // 3.6 进度回调
          if (config.progressCallback) {
            config.progressCallback(
              ((i + 1) / cardContents.length) * 100,
              i + 1,
              cardContents.length
            );
          }

          // 3.7 检查最大卡片数限制
          if (config.maxCards && cards.length >= config.maxCards) {
            console.log(`达到最大卡片数限制: ${config.maxCards}`);
            break;
          }

        } catch (error) {
          if (!config.skipErrors) {
            throw error;
          }
          console.warn(`跳过卡片 ${i + 1}:`, error);
        }
      }

      // 4. 批量写入块链接到源文档（如果启用且有块ID）
      if (this.settings.batchParsing.autoCreateBlockLinks && 
          config.sourceContent && 
          config.sourceFile &&
          this.documentWriter &&
          cards.some(c => c.metadata?.blockId)) {
        
        console.log('开始批量写入块链接到源文档...');
        
        const updatedContent = await this.insertBlockLinksToContent(
          config.sourceContent,
          cards
        );
        
        if (updatedContent) {
          // 写入文件
          const writeResult = await this.documentWriter.writeContent(
            config.sourceFile,
            updatedContent
          );
          
          if (!writeResult.success) {
            console.error('文档写入失败:', writeResult.error);
            // 不影响卡片创建，只是块链接未写入
          } else {
            console.log(`✅ 成功写入 ${writeResult.blocksInserted} 个块链接`);
          }
          
          // 同时通过回调返回更新后的内容（如果提供了回调）
          if (config.onContentUpdated) {
            await config.onContentUpdated(updatedContent);
          }
        }
      }

    } catch (error) {
      console.error('批量解析错误:', error);
    }

    return cards;
  }

  /**
   * 检查标签触发
   */
  private checkTagTrigger(content: string): boolean {
    if (!this.settings.enableTagTrigger) {
      return true;
    }
    return content.includes(this.settings.triggerTag);
  }

  /**
   * 预处理内容
   */
  private preprocessContent(content: string): string {
    // 移除YAML frontmatter
    const yamlRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
    return content.replace(yamlRegex, '').trim();
  }

  /**
   * 检测卡片类型
   */
  private detectCardType(content: string): CardType {
    // 检测挖空题 - 支持 Obsidian 高亮和 Anki 语法
    const clozePattern = new RegExp(`${this.escapeRegex(this.settings.symbols.clozeMarker)}[^${this.escapeRegex(this.settings.symbols.clozeMarker)}]+${this.escapeRegex(this.settings.symbols.clozeMarker)}`, 'g');
    const ankiClozePattern = /\{\{c\d+::.+?\}\}/g;
    if (clozePattern.test(content) || ankiClozePattern.test(content)) {
      return 'cloze';
    }

    // 检测选择题 - 支持复选框和 A./B./C./D. 格式
    if (/^- \[[ x]\]/m.test(content)) {
      return 'mcq';
    }
    const labeledOptions = content.match(/^[A-E][\.\)]\s.+$/gmi);
    if (labeledOptions && labeledOptions.length >= 2) {
      return 'mcq';
    }

    // 默认问答题
    return 'qa';
  }

  /**
   * 提取标签（使用统一的TagExtractor工具）
   */
  private extractTags(content: string): string[] {
    // 🆕 使用统一的TagExtractor工具，自动排除代码块
    return TagExtractor.extractTagsExcludingCode(content);
  }

  /**
   * 使用符号解析
   */
  private parseWithSymbols(content: string, card: ParsedCard): ParsedCard {
    const { faceDelimiter } = this.settings.symbols;

    let frontContent: string;
    let backContent: string;
    
    if (content.includes(faceDelimiter)) {
      // 有分隔符，分割正反面
      const parts = content.split(faceDelimiter);
      frontContent = this.cleanContent(parts[0]);
      backContent = this.cleanContent(parts.slice(1).join(faceDelimiter));
    } else {
      // 🔥 无分隔符，整个内容作为正面，确保字段完整
      frontContent = this.cleanContent(content);
      backContent = ''; // 背面为空
    }

    // 🔥 确保fields对象包含所有必要字段，防止内容丢失
    card.fields = {
      ...card.fields,
      front: frontContent,
      back: backContent,
      question: frontContent, // 问题字段映射到正面
      answer: backContent,    // 答案字段映射到背面
      notes: content        // 保留原始内容
    };

    return card;
  }

  /**
   * 应用模板解析
   */
  private applyTemplate(content: string, template: ParseTemplate, card: ParsedCard): ParsedCard {
    if (template.type === 'single-field' && template.fields) {
      // 单字段解析
      const fields: Record<string, string> = {};

      for (const field of template.fields) {
        try {
          // 🔥 修复：使用 field.pattern 而非 field.regex，尊重 isRegex 标志
          const pattern = field.isRegex ? field.pattern : this.escapeRegex(field.pattern);
          const regex = new RegExp(pattern, field.flags || '');
          const match = content.match(regex);

          if (match) {
            // 优先使用第1个分组，无分组时回退到完整匹配
            fields[field.name] = match[1] ?? match[0] ?? '';
          } else if (field.required) {
            console.warn(`必需字段 ${field.name} 未找到匹配`);
          }
        } catch (error) {
          console.error(`字段 ${field.name} 正则错误:`, error);
        }
      }

      // 🔥 字段别名映射（兼容旧字段名）
      fields.question        ||= fields.Question;
      fields.options         ||= fields.Options || fields.OptionsAlt;
      fields.correct_answer  ||= fields.CorrectAnswer || fields.Answer;
      fields.explanation     ||= fields.Explanation;
      fields.tags            ||= fields.Tags;

      // 映射到卡片字段 - 统一使用fields结构
      card.fields = {
        ...card.fields,
        ...fields,
        front: fields.Front || card.fields?.front || '',
        back: fields.Back || card.fields?.back || '',
        question: fields.Front || card.fields?.question || card.fields?.front || '',
        answer: fields.Back || card.fields?.answer || card.fields?.back || ''
      };

    } else if (template.type === 'complete-regex' && template.regex) {
      // 完整正则解析
      try {
        const regex = new RegExp(template.regex, template.flags);
        const match = content.match(regex);

        if (match && match.groups) {
          card.fields = {
            ...card.fields,
            ...match.groups,
            front: match.groups.front || card.fields?.front || '',
            back: match.groups.back || card.fields?.back || '',
            question: match.groups.front || card.fields?.question || card.fields?.front || '',
            answer: match.groups.back || card.fields?.answer || card.fields?.back || ''
          };
        }
      } catch (error) {
        console.error('完整正则解析错误:', error);
      }
    }

    card.template = template.id;
    card.metadata!.parseMethod = 'template';
    return card;
  }

  /**
   * 提取批量范围
   * 🔥 为性能与准确性，仅在范围内扫描；未设置范围不扫描
   */
  private extractBatchRange(content: string): string | null {
    const { rangeStart, rangeEnd } = this.settings.symbols;
    const startIndex = content.indexOf(rangeStart);
    const endIndex = content.indexOf(rangeEnd);

    // 必须同时匹配 rangeStart 和 rangeEnd，否则不进行批量解析
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      return null;
    }

    return content.substring(startIndex + rangeStart.length, endIndex).trim();
  }

  /**
   * 分割卡片
   */
  private splitCards(content: string): string[] {
    const { cardDelimiter } = this.settings.symbols;
    return content.split(cardDelimiter).filter(card => card.trim());
  }

  /**
   * 将块链接批量插入到内容中
   * @param originalContent 原始文档内容
   * @param cards 解析后的卡片列表
   * @returns 更新后的文档内容，如果失败返回 null
   */
  private async insertBlockLinksToContent(
    originalContent: string,
    cards: ParsedCard[]
  ): Promise<string | null> {
    try {
      let updatedContent = originalContent;
      
      // 提取批量范围
      const { rangeStart, rangeEnd } = this.settings.symbols;
      const startIndex = updatedContent.indexOf(rangeStart);
      const endIndex = updatedContent.indexOf(rangeEnd);
      
      if (startIndex === -1 || endIndex === -1) {
        console.warn('无法定位批量范围标记');
        return null;
      }
      
      // 提取范围前、范围内、范围后的内容
      const beforeRange = updatedContent.substring(0, startIndex + rangeStart.length);
      const rangeContent = updatedContent.substring(startIndex + rangeStart.length, endIndex);
      const afterRange = updatedContent.substring(endIndex);
      
      // 逐个替换卡片内容，添加块ID
      let modifiedRangeContent = rangeContent;
      
      for (const card of cards) {
        if (!card.metadata?.blockId || !card.metadata?.originalCardContent) {
          continue;
        }
        
        const originalCardContent = card.metadata.originalCardContent;
        const contentWithBlockId = card.metadata.contentWithBlockId;
        
        // 查找并替换
        const cardIndex = modifiedRangeContent.indexOf(originalCardContent);
        if (cardIndex !== -1) {
          modifiedRangeContent = 
            modifiedRangeContent.substring(0, cardIndex) +
            contentWithBlockId +
            modifiedRangeContent.substring(cardIndex + originalCardContent.length);
          
          console.log(`✅ 已插入块链接: ^${card.metadata.blockId}`);
        } else {
          console.warn(`⚠️ 无法定位卡片内容，跳过块ID插入`);
        }
      }
      
      // 重新组合内容
      updatedContent = beforeRange + modifiedRangeContent + afterRange;
      
      return updatedContent;
      
    } catch (error) {
      console.error('插入块链接失败:', error);
      return null;
    }
  }

  /**
   * 查找模板
   */
  private findTemplate(templateId: string, scenario: string): ParseTemplate | null {
    return this.settings.templates.find(t => 
      t.id === templateId && t.scenarios.includes(scenario as any)
    ) || null;
  }

  /**
   * 清理内容
   */
  private cleanContent(content: string): string {
    // 移除标签
    return content.replace(/#[\w\u4e00-\u9fa5]+/g, '').trim();
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 生成唯一块ID
   * @param index 卡片索引
   * @returns 块ID（不含^前缀）
   */
  private generateBlockId(index: number): string {
    const prefix = this.settings.batchParsing.blockIdPrefix;
    const timestamp = Date.now().toString(36); // 36进制时间戳
    const random = Math.random().toString(36).substring(2, 6); // 4位随机字符
    return `${prefix}-${timestamp}-${index}-${random}`;
  }

  /**
   * 检查内容中是否已存在块ID
   * @param content 内容
   * @returns 是否存在块ID
   */
  private hasExistingBlockId(content: string): boolean {
    return /\^[\w-]+\s*$/.test(content.trim());
  }

  /**
   * 在内容末尾添加块ID
   * @param content 原始内容
   * @param blockId 块ID（不含^）
   * @returns 包含块ID的内容
   */
  private appendBlockId(content: string, blockId: string): string {
    const trimmedContent = content.trim();
    
    // 如果已经有块ID，不重复添加
    if (this.hasExistingBlockId(trimmedContent)) {
      return content;
    }
    
    // 添加块ID（确保换行格式正确）
    return `${trimmedContent}\n\n^${blockId}`;
  }

  /**
   * 计算统计信息
   */
  private calculateStats(cards: ParsedCard[], startTime: number): ParseStats {
    const stats: ParseStats = {
      totalCards: cards.length,
      successfulCards: cards.length,
      failedCards: 0,
      cardTypes: { qa: 0, mcq: 0, cloze: 0 },
      templatesUsed: {},
      processingTime: Date.now() - startTime
    };

    cards.forEach(card => {
      stats.cardTypes[card.type]++;
      if (card.template) {
        stats.templatesUsed[card.template] = (stats.templatesUsed[card.template] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * 验证模板
   */
  validateTemplate(template: ParseTemplate): TemplateValidationResult {
    const result: TemplateValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    // 基础验证
    if (!template.name.trim()) {
      result.errors.push('模板名称不能为空');
    }

    if (!template.scenarios.length) {
      result.errors.push('至少需要选择一个应用场景');
    }

    // 类型特定验证
    if (template.type === 'single-field') {
      if (!template.fields || template.fields.length === 0) {
        result.errors.push('单字段模板至少需要一个字段');
      } else {
        template.fields.forEach((field, index) => {
          if (!field.name.trim()) {
            result.errors.push(`字段 ${index + 1} 名称不能为空`);
          }
          if (!field.pattern.trim()) {
            result.errors.push(`字段 ${index + 1} 正则表达式不能为空`);
          } else {
            try {
              new RegExp(field.pattern, field.flags);
            } catch (error) {
              result.errors.push(`字段 ${index + 1} 正则表达式语法错误: ${error}`);
            }
          }
        });
      }
    } else if (template.type === 'complete-regex') {
      if (!template.regex?.trim()) {
        result.errors.push('完整正则模板的正则表达式不能为空');
      } else {
        try {
          new RegExp(template.regex, template.flags);
        } catch (error) {
          result.errors.push(`正则表达式语法错误: ${error}`);
        }
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * 验证符号配置
   */
  validateSymbols(symbols: SimplifiedParsingSettings['symbols']): SymbolValidationResult {
    const result: SymbolValidationResult = {
      isValid: true,
      conflicts: [],
      suggestions: []
    };

    const symbolValues = Object.values(symbols);
    const duplicates = symbolValues.filter((value, index) => 
      symbolValues.indexOf(value) !== index
    );

    if (duplicates.length > 0) {
      result.conflicts.push(`重复的符号: ${duplicates.join(', ')}`);
    }

    // 检查空值
    Object.entries(symbols).forEach(([key, value]) => {
      if (!value.trim()) {
        result.conflicts.push(`${key} 不能为空`);
      }
    });

    result.isValid = result.conflicts.length === 0;
    return result;
  }
}
