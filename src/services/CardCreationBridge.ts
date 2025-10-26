/**
 * Tuanki卡片创建桥接器
 * 负责集成现有卡片创建流程，支持牌组和模板的自动匹配
 */

import { TuankiAnnotation, DeckTemplateInfo, AnnotationError, AnnotationErrorType } from '../types/annotation-types';
import { Card, Deck, CardType } from '../data/types';
import { ContentExtractor, ContentType } from './ContentExtractor';
import { MetadataGenerator } from './MetadataGenerator';
// 🚫 已弃用：旧的三位一体模板服务已被简化解析系统替代
import type { TriadTemplate } from '../data/template-types';

import { DocumentModifier } from './DocumentModifier';
import { AnnotationFileWatcher } from './AnnotationFileWatcher';
import { showNotification } from '../utils/notifications'; // 🆕 通知工具

/**
 * 卡片创建选项
 */
export interface CardCreationOptions {
  /** 是否自动创建不存在的牌组 */
  autoCreateDeck?: boolean;
  /** 默认牌组ID */
  defaultDeckId?: string;
  /** 默认模板ID */
  defaultTemplateId?: string;
  /** 是否跳过重复检查 */
  skipDuplicateCheck?: boolean;
  /** 自定义字段映射 */
  customFieldMapping?: Record<string, string>;
}

/**
 * 卡片创建结果
 */
export interface CardCreationResult {
  /** 是否成功 */
  success: boolean;
  /** 创建的卡片 */
  card?: Card;
  /** 错误信息 */
  error?: AnnotationError;
  /** 警告信息 */
  warnings?: string[];
  /** 是否创建了新牌组 */
  createdNewDeck?: boolean;
  /** 使用的模板ID */
  usedTemplateId?: string;
}

/**
 * 牌组匹配结果
 */
interface DeckMatchResult {
  deckId: string;
  deckName: string;
  isNewDeck: boolean;
  confidence: number;
}

/**
 * 模板匹配结果
 */
interface TemplateMatchResult {
  templateId: string;
  templateName: string;
  confidence: number;
  contentType: ContentType;
}

/**
 * 卡片创建桥接器类
 */
export class CardCreationBridge {
  private static instance: CardCreationBridge;

  private contentExtractor: ContentExtractor;
  private metadataGenerator: MetadataGenerator;

  // 依赖的服务（需要从主插件注入）
  private dataStorage: any;
  private deckService: any;
  private templateService: any;
  private fsrs: any;
  private plugin: any; // 添加插件实例引用

  private constructor() {
    this.contentExtractor = ContentExtractor.getInstance();
    this.metadataGenerator = MetadataGenerator.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): CardCreationBridge {
    if (!CardCreationBridge.instance) {
      CardCreationBridge.instance = new CardCreationBridge();
    }
    return CardCreationBridge.instance;
  }

  /**
   * 注入依赖服务
   */
  public injectServices(services: {
    dataStorage: any;
    deckService: any;
    templateService: any;
    fsrs: any;
    plugin: any; // 添加插件实例
  }): void {
    this.dataStorage = services.dataStorage;
    this.deckService = services.deckService;
    this.templateService = services.templateService;
    this.fsrs = services.fsrs;
    this.plugin = services.plugin;
  }

  /**
   * 从标注创建卡片
   */
  public async createCardFromAnnotation(
    annotation: TuankiAnnotation,
    options: CardCreationOptions = {}
  ): Promise<CardCreationResult> {
    console.log(`🎯 [CardCreationBridge] 开始创建卡片: ${annotation.id}`);

    try {
      // 1. 检查是否已经处理过
      if (annotation.isProcessed && !options.skipDuplicateCheck) {
        return {
          success: false,
          error: {
            type: AnnotationErrorType.DUPLICATE_UUID,
            message: '该标注已经处理过，存在对应的卡片',
            timestamp: new Date().toISOString(),
            annotationId: annotation.id,
            recoverable: false
          }
        };
      }

      // 2. 提取和解析内容
      const extractionResult = this.contentExtractor.extractContent(annotation);
      if (!extractionResult.success) {
        return {
          success: false,
          error: {
            type: AnnotationErrorType.PARSE_ERROR,
            message: extractionResult.error || '内容提取失败',
            timestamp: new Date().toISOString(),
            annotationId: annotation.id,
            recoverable: true
          }
        };
      }

      // 3. 匹配牌组
      const deckMatch = await this.matchDeck(annotation.deckTemplate, options);
      if (!deckMatch) {
        return {
          success: false,
          error: {
            type: AnnotationErrorType.DECK_NOT_FOUND,
            message: '无法找到或创建合适的牌组',
            timestamp: new Date().toISOString(),
            annotationId: annotation.id,
            recoverable: true
          }
        };
      }

      // 4. 匹配模板
      const templateMatch = await this.matchTemplate(annotation.deckTemplate, extractionResult.content || '', options);
      if (!templateMatch) {
        return {
          success: false,
          error: {
            type: AnnotationErrorType.TEMPLATE_NOT_FOUND,
            message: '无法找到合适的模板',
            timestamp: new Date().toISOString(),
            annotationId: annotation.id,
            recoverable: true
          }
        };
      }

      // 5. 生成元数据
      const metadataResult = this.metadataGenerator.generateMetadata(annotation, {
        updateModifiedTime: true
      });

      // 6. 构建卡片数据
      const cardData = await this.buildCardData(
        annotation,
        extractionResult.content || '',
        deckMatch,
        templateMatch,
        metadataResult.metadata,
        options
      );

      // 7.1 一次性将 uuid/^blockId 元数据写回源文档末尾，便于后续定位（不写入时间/版本）
      try {
        const filePath = annotation.position.filePath;
        if (filePath && metadataResult.metadata) {
          // 🆕 SimpleSyncEngine会自动判断是否需要更新，无需抑制modify事件
          await DocumentModifier.getInstance().insertMetadata(annotation, metadataResult.metadata, {
            createBackup: false,
            validateResult: true,
            preserveFormatting: true,
            forceOverwrite: false
          });
          
          console.log('✅ [CardCreationBridge] UUID已写回文档');
        }
      } catch (e) {
        console.warn('⚠️ 一次性写回 uuid/^blockId 失败（已忽略，不影响卡片创建）', e);
      }

      // 7. 创建卡片
      const createdCard = await this.createCard(cardData);

      console.log(`✅ [CardCreationBridge] 卡片创建成功: ${createdCard.id}`);

      // 🆕 显示创建成功通知
      const preview = (createdCard.content || '').substring(0, 30).replace(/\n/g, ' ');
      showNotification(`✅ 卡片已创建${preview ? '：' + preview + '...' : ''}`, 'success');

      return {
        success: true,
        card: createdCard,
        createdNewDeck: deckMatch.isNewDeck,
        usedTemplateId: templateMatch.templateId,
        warnings: extractionResult.warnings
      };

    } catch (error) {
      console.error(`❌ [CardCreationBridge] 卡片创建失败:`, error);

      return {
        success: false,
        error: {
          type: AnnotationErrorType.CARD_CREATION_ERROR,
          message: `卡片创建失败: ${error.message}`,
          timestamp: new Date().toISOString(),
          annotationId: annotation.id,
          stack: error.stack,
          recoverable: true
        }
      };
    }
  }

  /**
   * 匹配牌组
   */
  private async matchDeck(deckTemplate: DeckTemplateInfo, options: CardCreationOptions): Promise<DeckMatchResult | null> {
    try {
      // 如果指定了牌组名称，尝试匹配
      if (deckTemplate.deckName) {
        const existingDeck = await this.findDeckByName(deckTemplate.deckName);
        if (existingDeck) {
          return {
            deckId: existingDeck.id,
            deckName: existingDeck.name,
            isNewDeck: false,
            confidence: 1.0
          };
        }

        // 如果允许自动创建牌组
        if (options.autoCreateDeck) {
          const newDeck = await this.createDeck(deckTemplate.deckName);
          return {
            deckId: newDeck.id,
            deckName: newDeck.name,
            isNewDeck: true,
            confidence: 1.0
          };
        }
      }

      // 使用默认牌组
      if (options.defaultDeckId) {
        const defaultDeck = await this.getDeckById(options.defaultDeckId);
        if (defaultDeck) {
          return {
            deckId: defaultDeck.id,
            deckName: defaultDeck.name,
            isNewDeck: false,
            confidence: 0.5
          };
        }
      }

      // 获取第一个可用牌组
      const allDecks = await this.getAllDecks();
      if (allDecks.length > 0) {
        const firstDeck = allDecks[0];
        return {
          deckId: firstDeck.id,
          deckName: firstDeck.name,
          isNewDeck: false,
          confidence: 0.3
        };
      }

      return null;
    } catch (error) {
      console.error('牌组匹配失败:', error);
      return null;
    }
  }

  /**
   * 匹配模板
   */
  private async matchTemplate(
    deckTemplate: DeckTemplateInfo,
    content: string,
    options: CardCreationOptions
  ): Promise<TemplateMatchResult | null> {
    try {
      // 根据内容类型自动匹配模板（移除手动指定模板名的逻辑）
      const contentType = this.detectContentType(content);
      const templateByType = await this.findTemplateByContentType(contentType);
      if (templateByType) {
        return {
          templateId: templateByType.id,
          templateName: templateByType.name,
          confidence: 0.8,
          contentType
        };
      }

      // 使用默认模板
      if (options.defaultTemplateId) {
        const defaultTemplate = await this.getTemplateById(options.defaultTemplateId);
        if (defaultTemplate) {
          return {
            templateId: defaultTemplate.id,
            templateName: defaultTemplate.name,
            confidence: 0.5,
            contentType
          };
        }
      }

      // 获取基础模板
      const basicTemplate = await this.getBasicTemplate();
      if (basicTemplate) {
        return {
          templateId: basicTemplate.id,
          templateName: basicTemplate.name,
          confidence: 0.3,
          contentType
        };
      }

      return null;
    } catch (error) {
      console.error('模板匹配失败:', error);
      return null;
    }
  }

  /**
   * 检测内容类型
   */
  private detectContentType(content: string): ContentType {
    // 检测挖空卡片
    if (content.includes('{{c') || content.includes('==')) {
      return ContentType.CLOZE;
    }

    // 检测代码卡片
    if (content.includes('```')) {
      return ContentType.CODE;
    }

    // 检测问答卡片
    if (content.includes('?') || content.includes('？') ||
        content.includes('问题') || content.includes('答案')) {
      return ContentType.QUESTION_ANSWER;
    }

    return ContentType.BASIC;
  }

  /**
   * 构建卡片数据 - 遵循卡片数据结构规范 v1.0
   */
  private async buildCardData(
    annotation: TuankiAnnotation,
    content: string,
    deckMatch: DeckMatchResult,
    templateMatch: TemplateMatchResult,
    metadata: any,
    options: CardCreationOptions
  ): Promise<Partial<Card>> {
    const now = new Date().toISOString();

    // ✅ 使用解析器从content生成fields
    const cardType = this.mapContentTypeToCardType(templateMatch.contentType);
    const parser = this.getParserForCardType(cardType);
    const parseResult = parser.parseMarkdownToFields(content, cardType);
    
    if (!parseResult.success) {
      console.warn('[CardCreationBridge] 解析失败，使用降级策略:', parseResult.error);
      // 降级：使用空fields
      parseResult.fields = { front: content, back: '' };
    }

    console.log(`[CardCreationBridge] 使用解析器生成fields:`, Object.keys(parseResult.fields || {}));

    return {
      id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      uuid: metadata.uuid,
      deckId: deckMatch.deckId,
      templateId: templateMatch.templateId,
      
      // ✅ 核心：content是权威数据源
      content: content,
      
      // ✅ fields是派生数据，由解析器生成
      fields: parseResult.fields,
      
      // ✅ 元数据使用专用字段（不混入fields）
      sourceFile: annotation.position.filePath,
      sourceBlock: metadata.blockId ? `^${metadata.blockId}` : undefined,
      
      type: cardType,
      tags: this.extractTags(content),
      created: metadata.created || now,
      modified: metadata.modified || now,
      fsrs: this.fsrs?.createCard() || this.createDefaultFSRSData()
    };
  }
  
  /**
   * 根据卡片类型获取对应的解析器
   */
  private getParserForCardType(cardType: CardType): any {
    // 动态导入解析器
    const { QACardParser } = require('../parsers/card-type-parsers/QACardParser');
    const { ChoiceCardParser } = require('../parsers/card-type-parsers/ChoiceCardParser');
    const { ClozeCardParser } = require('../parsers/card-type-parsers/ClozeCardParser');
    
    switch (cardType) {
      case CardType.Basic:
        return new QACardParser();
      case CardType.Multiple:
        return new ChoiceCardParser();
      case CardType.Cloze:
        return new ClozeCardParser();
      default:
        return new QACardParser();
    }
  }


  /**
   * 提取标签
   */
  private extractTags(content: string): string[] {
    const tagRegex = /#([a-zA-Z0-9\u4e00-\u9fff/_-]+)/g;
    const tags: string[] = [];
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      const tag = match[1];
      if (!tag.includes('/')) { // 排除牌组/模板格式
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * 映射内容类型到卡片类型
   */
  private mapContentTypeToCardType(contentType: ContentType): CardType {
    switch (contentType) {
      case ContentType.CLOZE:
        return CardType.Cloze;
      case ContentType.CODE:
        return CardType.Code;
      case ContentType.MULTI_CHOICE:
        return CardType.Multiple;
      default:
        return CardType.Basic;
    }
  }

  /**
   * 创建默认FSRS数据
   */
  private createDefaultFSRSData(): any {
    const now = new Date();
    return {
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null
    };
  }

  // 以下方法需要根据实际的数据服务实现
  private async findDeckByName(name: string): Promise<Deck | null> {
    try {
      const decks: Deck[] = await (this.dataStorage?.getAllDecks?.() ?? Promise.resolve([]));
      return decks.find(d => d.name === name) ?? null;
    } catch {
      return null;
    }
  }

  private async createDeck(name: string): Promise<Deck> {
    // 实现牌组创建逻辑
    throw new Error('创建牌组功能需要实现');
  }

  private async getDeckById(id: string): Promise<Deck | null> {
    try {
      if (this.dataStorage?.getDeck) return await this.dataStorage.getDeck(id);
      const decks: Deck[] = await (this.dataStorage?.getAllDecks?.() ?? Promise.resolve([]));
      return decks.find(d => d.id === id) ?? null;
    } catch {
      return null;
    }
  }

  private async getAllDecks(): Promise<Deck[]> {
    try {
      return await (this.dataStorage?.getAllDecks?.() ?? Promise.resolve([]));
    } catch {
      return [];
    }
  }

  private async findTemplateByName(name: string): Promise<any> {
    try {
      return await (this.templateService?.getTemplateByName?.(name) ?? Promise.resolve(null));
    } catch {
      return null;
    }
  }

  private async findTemplateByContentType(contentType: ContentType): Promise<any> {
    try {
      // 🔧 修复模板ID：统一使用连字符格式
      const map: Record<ContentType, string> = {
        [ContentType.QUESTION_ANSWER]: 'official-qa',
        [ContentType.CLOZE]: 'official-cloze',
        [ContentType.CODE]: 'official-qa',      // 使用问答题作为fallback
        [ContentType.MULTI_CHOICE]: 'official-choice',
        [ContentType.BASIC]: 'official-qa'
      } as const;
      const fallbackId = 'official-qa';
      const id = map[contentType] || fallbackId;
      return await (this.templateService?.getTemplateById?.(id) ?? Promise.resolve({ id: fallbackId, name: '通用问答题' }));
    } catch {
      return { id: 'official-qa', name: '通用问答题' };
    }
  }

  private async getTemplateById(id: string): Promise<any> {
    try {
      return await (this.templateService?.getTemplateById?.(id) ?? Promise.resolve(null));
    } catch {
      return null;
    }
  }

  private async getBasicTemplate(): Promise<any> {
    try {
      // 🔧 修复模板ID：使用正确的连字符格式
      const fallback = { id: 'official-qa', name: '通用问答题' };
      const tpl = await (this.templateService?.getTemplateById?.(fallback.id) ?? Promise.resolve(null));
      return tpl ?? fallback;
    } catch {
      return { id: 'official-qa', name: '通用问答题' };
    }
  }


  private async createCard(cardData: Partial<Card>): Promise<Card> {
    // 实现卡片创建逻辑
    if (this.dataStorage && this.dataStorage.saveCard) {
      return await this.dataStorage.saveCard(cardData);
    }
    throw new Error('卡片创建服务未初始化');
  }
}
