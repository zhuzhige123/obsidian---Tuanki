import type { Card } from '../../data/types';

import { isMultipleChoiceCard, parseChoiceOptions } from '../../utils/multiple-choice-parser';
import { ExtensiblePreviewManager } from './types/ExtensiblePreview';
import { ClozePreview } from './types/ClozePreview';
import { ContentExtractor } from '../../services/ContentExtractor';
import type AnkiPlugin from '../../main';
import {
  UnifiedCardType,
  CardTypeDetectionResult,
  getCardTypeMetadata,
  convertCardType
} from '../../types/unified-card-types';
import { 
  parseChoiceQuestion, 
  isChoiceQuestion,
  type ChoiceQuestion 
} from '../../parsing/choice-question-parser';
import type {
  UnifiedPreviewSection,
  UnifiedPreviewData,
  PreviewSectionType,
  DEFAULT_ANIMATION_CONFIG,
  DEFAULT_INTERACTIVITY_CONFIG
} from '../../types/preview-types';

// 临时类型定义
type TriadTemplate = any;

/**
 * @deprecated 使用 UnifiedCardType 替代
 * 保留用于向后兼容
 */
export enum CardType {
  BASIC_QA = 'basic-qa',
  CLOZE_DELETION = 'cloze-deletion',
  MULTIPLE_CHOICE = 'multiple-choice',
  EXTENSIBLE = 'extensible'
}

// 向后兼容的类型映射
const LEGACY_TYPE_MAPPING: Record<CardType, UnifiedCardType> = {
  [CardType.BASIC_QA]: UnifiedCardType.BASIC_QA,
  [CardType.CLOZE_DELETION]: UnifiedCardType.CLOZE_DELETION,
  [CardType.MULTIPLE_CHOICE]: UnifiedCardType.MULTIPLE_CHOICE,
  [CardType.EXTENSIBLE]: UnifiedCardType.EXTENSIBLE
};

/**
 * 预览节接口
 * @deprecated 使用 UnifiedPreviewSection 替代
 * 保留用于向后兼容
 */
export interface PreviewSection {
  id: string;
  type: 'front' | 'back' | 'options' | 'explanation';
  content: string;
  renderMode: 'markdown' | 'html' | 'mixed';
  animations: AnimationConfig[];
  interactivity: InteractivityConfig;
  metadata?: Record<string, any>; // 用于存储节特定的元数据
}

/**
 * 使用统一的预览节类型
 */
export type PreviewSectionUnified = UnifiedPreviewSection;

/**
 * 动效配置接口
 */
export interface AnimationConfig {
  type: 'fadeIn' | 'slideIn' | 'scaleIn' | 'clozeReveal';
  duration: number;
  delay: number;
  easing: string;
}

/**
 * 交互配置接口
 */
export interface InteractivityConfig {
  clickable: boolean;
  hoverable: boolean;
  selectable: boolean;
  customHandlers: Record<string, Function>;
}

/**
 * 预览元数据接口
 */
export interface PreviewMetadata {
  cardId: string;
  templateId: string;
  cardType: UnifiedCardType;
  confidence: number;
  generatedAt: number;
  renderingHints: RenderingHints;
}

/**
 * 渲染提示接口
 */
export interface RenderingHints {
  preferredHeight: number;
  hasInteractiveElements: boolean;
  requiresObsidianRenderer: boolean;
  cacheKey: string;
}

/**
 * 预览数据接口
 */
export interface PreviewData {
  cardType: UnifiedCardType;
  sections: PreviewSection[];
  metadata: PreviewMetadata;
  renderingHints: RenderingHints;
}

/**
 * @deprecated 使用 PreviewData 替代
 * 保留用于向后兼容
 */
export interface LegacyPreviewData {
  cardType: CardType;
  sections: PreviewSection[];
  metadata: PreviewMetadata;
  renderingHints: RenderingHints;
}

/**
 * 预览选项接口
 */
export interface PreviewOptions {
  showAnswer: boolean;
  enableAnimations: boolean;
  themeMode: 'auto' | 'light' | 'dark';
  renderingMode: 'performance' | 'quality';
  enableAnswerControls?: boolean;
}

/**
 * 预览结果接口
 */
export interface PreviewResult {
  success: boolean;
  previewData?: PreviewData;
  error?: string;
  renderTime: number;
}

/**
 * 内容预览引擎
 * 负责解析卡片内容并生成预览数据
 */
export class ContentPreviewEngine {
  private plugin: AnkiPlugin;
  // 🚧 暂时禁用：卡片解析引擎
  // private cardParsingEngine: CardParsingEngine;
  private previewCache: Map<string, PreviewData> = new Map();
  private extensibleManager: ExtensiblePreviewManager;
  private contentExtractor: ContentExtractor;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;

    // 🚧 暂时禁用：初始化卡片解析引擎
    // const presetManager = new PresetManager();
    // const settings = presetManager.getDefaultSettings();
    // this.cardParsingEngine = new CardParsingEngine(settings);

    // 初始化可扩展预览管理器
    this.extensibleManager = new ExtensiblePreviewManager(plugin);

    // 初始化内容提取器
    this.contentExtractor = ContentExtractor.getInstance();
  }

  /**
   * 预处理卡片数据，将Markdown内容转换为结构化字段
   */
  private preprocessCardForRendering(card: Card): Card {
    // 检查是否需要预处理
    if (!card || !card.fields) {
      console.warn('[ContentPreviewEngine] 卡片或字段为空，跳过预处理');
      return card;
    }
    
    const frontContent = card.fields.front || card.fields.Front || '';
    if (!frontContent) {
      return card;
    }

    // 尝试解析选择题内容
    const choiceResult = this.contentExtractor.parseChoiceContent(frontContent);
    if (choiceResult.success) {
      console.log(`[ContentPreviewEngine] 检测到选择题格式，进行预处理: ${card.id}`);

      return {
        ...card,
        fields: {
          ...card.fields,
          // 添加结构化字段
          question: choiceResult.question,
          options: choiceResult.options,
          correct_answer: choiceResult.correctAnswer || '',
          explanation: choiceResult.explanation || '',
          tags: choiceResult.tags || '',
          // 保留原始内容
          _original_front: frontContent,
          _preprocessed: 'true',
          _format: choiceResult.format,
          _confidence: choiceResult.confidence.toString()
        }
      };
    }

    // 如果不是选择题，返回原始卡片
    return card;
  }

  /**
   * 解析卡片内容并生成预览数据
   */
  async parseCardContent(card: Card, template?: TriadTemplate): Promise<PreviewData> {
    const startTime = performance.now();

    // 🔥 关键修复：预处理卡片数据
    const preprocessedCard = this.preprocessCardForRendering(card);

    // 生成缓存键（使用预处理后的卡片）
    const cacheKey = this.generateCacheKey(preprocessedCard, template);

    // 检查缓存
    if (this.previewCache.has(cacheKey)) {
      const cached = this.previewCache.get(cacheKey)!;
      console.log(`[ContentPreviewEngine] 使用缓存预览数据: ${preprocessedCard.id}`);
      return cached;
    }

    console.log(`[ContentPreviewEngine] 开始解析卡片内容: ${preprocessedCard.id}`);

    // 检测卡片题型（使用预处理后的卡片）
    const cardType = await this.detectCardType(preprocessedCard);

    // 获取模板
    const effectiveTemplate = template || this.getEffectiveTemplate(preprocessedCard);

    // 生成预览节（使用预处理后的卡片）
    const sections = this.generatePreviewSections(preprocessedCard, cardType, effectiveTemplate);

    // 生成元数据
    const metadata: PreviewMetadata = {
      cardId: preprocessedCard.id,
      templateId: effectiveTemplate?.id || 'unknown',
      cardType,
      confidence: this.calculateConfidence(card, cardType),
      generatedAt: Date.now(),
      renderingHints: this.generateRenderingHints(sections, cardType)
    };

    // 如果是选择题，添加options到metadata
    if (cardType === UnifiedCardType.MULTIPLE_CHOICE) {
      try {
        const optionsText = preprocessedCard.fields?.options || preprocessedCard.fields?.choices || '';
        const choiceOptions = parseChoiceOptions(optionsText);
        if (choiceOptions && Array.isArray(choiceOptions.options) && choiceOptions.options.length > 0) {
          (metadata as any).options = choiceOptions.options;
          (metadata as any).sourcePath = (preprocessedCard as any).sourcePath || '';
        }
      } catch (error) {
        console.warn('[ContentPreviewEngine] parseChoiceOptions failed:', error);
      }
    }

    const previewData: PreviewData = {
      cardType,
      sections,
      metadata,
      renderingHints: metadata.renderingHints
    };

    // 缓存结果
    this.previewCache.set(cacheKey, previewData);

    const endTime = performance.now();
    console.log(`[ContentPreviewEngine] 预览数据生成完成: ${card.id}, 耗时: ${endTime - startTime}ms`);

    return previewData;
  }

  /**
   * 检测卡片题型 - 返回统一题型
   */
  async detectCardType(card: Card): Promise<UnifiedCardType> {
    // 1. 尝试扩展题型检测
    const extensibleResult = await this.extensibleManager.detectCardType(card);
    if (extensibleResult && extensibleResult.matches) {
      // 转换扩展题型ID到统一题型
      const legacyType = extensibleResult.cardTypeId as CardType;
      return this.convertLegacyType(legacyType);
    }

    // 2. 检测选择题（使用新的解析器）
    const cardContent = this.getCardContent(card);
    if (isChoiceQuestion(cardContent)) {
      const choiceQuestion = parseChoiceQuestion(cardContent);
      if (choiceQuestion) {
        console.log('[ContentPreviewEngine] 检测到选择题格式:', card.id, '类型:', choiceQuestion.isMultipleChoice ? '多选' : '单选');
        // 根据是否多选返回不同的题型
        return choiceQuestion.isMultipleChoice 
          ? UnifiedCardType.MULTIPLE_CHOICE 
          : UnifiedCardType.SINGLE_CHOICE;
      }
    }

    // 3. 检测挖空题
    if (this.isClozeCard(card)) {
      return UnifiedCardType.CLOZE_DELETION;
    }

    // 4. 默认为基础问答题
    return UnifiedCardType.BASIC_QA;
  }

  /**
   * 获取卡片内容用于题型检测
   * ✅ 遵循卡片数据结构规范 v1.0：优先使用 card.content（权威数据源）
   */
  private getCardContent(card: Card): string {
    // ✅ 步骤1：优先使用 card.content（权威数据源）
    if (card.content && card.content.trim()) {
      return card.content.trim();
    }
    
    // ✅ 步骤2：降级策略 - 从 fields 重建内容
    if (!card.fields) return '';
    
    // ✅ 挖空题：优先读取 fields.text
    const clozeText = card.fields.text || card.fields.Text;
    if (clozeText && (clozeText.includes('==') || clozeText.includes('{{c'))) {
      return clozeText;
    }
    
    // ✅ 选择题：需要重建完整的Markdown格式（包含选项）
    const options = card.fields.options || card.fields.Options;
    const correctAnswers = card.fields.correctAnswers || card.fields.CorrectAnswers;
    
    if (options && correctAnswers) {
      // 从 fields 重建选择题格式
      const front = card.fields.front || card.fields.Front || card.fields.question || '';
      const back = card.fields.back || card.fields.Back || card.fields.answer || '';
      
      let markdown = '';
      
      // 添加问题（如果没有 Q: 前缀则添加）
      if (front && !front.trim().startsWith('Q:')) {
        markdown += `Q: ${front}\n\n`;
      } else {
        markdown += `${front}\n\n`;
      }
      
      // 添加选项
      markdown += `${options}\n\n`;
      
      // 添加解析（如果有）
      if (back) {
        markdown += `---div---\n\n${back}`;
      }
      
      return markdown.trim();
    }
    
    // ✅ 基础问答题：拼接 front 和 back
    const front = card.fields.front || card.fields.Front || card.fields.question || '';
    const back = card.fields.back || card.fields.Back || card.fields.answer || '';
    
    if (front && back) {
      return `${front}\n\n---div---\n\n${back}`;
    }
    
    return front || back;
  }

  /**
   * @deprecated 使用 detectCardType 替代
   * 保留用于向后兼容
   */
  async detectCardTypeLegacy(card: Card): Promise<CardType> {
    const unifiedType = await this.detectCardType(card);
    return this.convertUnifiedToLegacy(unifiedType);
  }

  /**
   * 转换旧题型到统一题型
   */
  private convertLegacyType(legacyType: CardType): UnifiedCardType {
    return LEGACY_TYPE_MAPPING[legacyType] || UnifiedCardType.BASIC_QA;
  }

  /**
   * 转换统一题型到旧题型
   */
  private convertUnifiedToLegacy(unifiedType: UnifiedCardType): CardType {
    const mapping = Object.entries(LEGACY_TYPE_MAPPING).find(([, unified]) => unified === unifiedType);
    return mapping ? (mapping[0] as CardType) : CardType.BASIC_QA;
  }

  /**
   * 生成预览内容
   */
  async generatePreview(previewData: PreviewData, options: PreviewOptions): Promise<PreviewResult> {
    const startTime = performance.now();
    
    try {
      // 根据题型生成特定预览
      switch (previewData.cardType) {
        case UnifiedCardType.BASIC_QA:
          await this.generateBasicQAPreview(previewData, options);
          break;
        case UnifiedCardType.CLOZE_DELETION:
          await this.generateClozePreview(previewData, options);
          break;
        case UnifiedCardType.MULTIPLE_CHOICE:
          // 选择题预览由MultipleChoiceCard组件直接处理
          break;
        default:
          await this.generateExtensiblePreview(previewData, options);
      }

      const endTime = performance.now();
      
      return {
        success: true,
        previewData,
        renderTime: endTime - startTime
      };
    } catch (error) {
      console.error('[ContentPreviewEngine] 预览生成失败:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
        renderTime: performance.now() - startTime
      };
    }
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.previewCache.clear();
    this.extensibleManager.cleanup();
    console.log('[ContentPreviewEngine] 预览缓存已清理');
  }

  /**
   * 获取扩展管理器
   */
  getExtensibleManager(): ExtensiblePreviewManager {
    return this.extensibleManager;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.previewCache.size,
      keys: Array.from(this.previewCache.keys())
    };
  }

  // ===== 私有方法 =====

  /**
   * 检测是否为挖空卡片
   * ✅ 遵循卡片数据结构规范 v1.0：优先使用 card.content
   */
  private isClozeCard(card: Card): boolean {
    // 优先使用 card.content
    let contentToCheck = '';
    
    if (card.content && card.content.trim()) {
      contentToCheck = card.content;
    } else if (card.fields?.text) {
      contentToCheck = card.fields.text;
    } else if (card.fields) {
      contentToCheck = Object.values(card.fields).join(' ');
    }
    
    if (!contentToCheck) return false;

    // 检测 Obsidian 高亮语法 ==text==
    const obsidianClozeRegex = /==(.*?)==/g;
    if (obsidianClozeRegex.test(contentToCheck)) {
      return true;
    }

    // 🔥 增强：检测 Anki 带提示的挖空语法 {{c1::答案::提示}}
    const ankiClozeHintRegex = /\{\{c(\d+)::(.*?)::(.*?)\}\}/g;
    if (ankiClozeHintRegex.test(contentToCheck)) {
      return true;
    }

    // 检测 Anki 基础挖空语法 {{c1::text}}
    const ankiClozeRegex = /\{\{c(\d+)::(.*?)\}\}/g;
    if (ankiClozeRegex.test(contentToCheck)) {
      return true;
    }

    return false;
  }

  /**
   * 获取有效模板
   */
  private getEffectiveTemplate(card: Card): TriadTemplate | null {
    try {
      // 使用新模板系统
      // 这里将来集成新的模板获取逻辑
      return null; // 暂时返回null，等待新系统集成
    } catch (error) {
      console.warn('[ContentPreviewEngine] 获取模板失败:', error);
      return null;
    }
  }

  /**
   * 生成预览节
   */
  private generatePreviewSections(card: Card, cardType: UnifiedCardType, template: TriadTemplate | null): PreviewSection[] {
    const sections: PreviewSection[] = [];

    switch (cardType) {
      case UnifiedCardType.BASIC_QA:
        // ✅ 修复：遵循卡片数据结构规范 v1.0
        // 优先使用 card.content 解析，降级使用 fields
        let qaFullContent = '';
        
        if (card.content && card.content.trim()) {
          qaFullContent = card.content.trim();
        }
        
        if (qaFullContent) {
          // 从 content 拆分 front 和 back
          const qaDividerIndex = qaFullContent.indexOf('\n---div---\n');
          let qaFront = '';
          let qaBack = '';
          
          if (qaDividerIndex >= 0) {
            qaFront = qaFullContent.substring(0, qaDividerIndex).trim();
            qaBack = qaFullContent.substring(qaDividerIndex + 11).trim();
          } else {
            qaFront = qaFullContent;
          }
          
          sections.push(
            this.createPreviewSection('front', qaFront, 'markdown'),
            this.createPreviewSection('back', qaBack, 'markdown')
          );
        } else {
          // 降级：使用 fields
          sections.push(
            this.createPreviewSection('front', card.fields?.front || '', 'markdown'),
            this.createPreviewSection('back', card.fields?.back || '', 'markdown')
          );
        }
        break;
        
      case UnifiedCardType.CLOZE_DELETION:
        // ✅ 修复：遵循卡片数据结构规范 v1.0
        // 优先使用 card.content（权威数据源）
        // 降级使用 card.fields.text（ClozeCardParser 的标准字段）
        let clozeFullContent = '';
        
        if (card.content && card.content.trim()) {
          // 从 card.content 获取完整内容
          clozeFullContent = card.content.trim();
        } else if (card.fields?.text) {
          // 降级：从 fields.text 获取
          clozeFullContent = card.fields.text;
        } else if (card.fields?.front) {
          // 兼容旧数据
          clozeFullContent = card.fields.front;
        }
        
        // 拆分挖空内容和背面内容（通过 ---div--- 分隔符）
        const dividerIndex = clozeFullContent.indexOf('\n---div---\n');
        let clozeContent = '';
        let backContent = '';
        
        if (dividerIndex >= 0) {
          // 有分隔符：前面是挖空内容，后面是背面内容
          clozeContent = clozeFullContent.substring(0, dividerIndex).trim();
          backContent = clozeFullContent.substring(dividerIndex + 11).trim(); // 11 = '\n---div---\n'.length
        } else {
          // 无分隔符：全部作为挖空内容
          clozeContent = clozeFullContent;
        }
        
        // 添加挖空section
        if (clozeContent) {
          sections.push(
            this.createPreviewSection('front', clozeContent, 'mixed')
          );
        }
        
        // 如果存在back内容，添加back section
        if (backContent) {
          sections.push(
            this.createPreviewSection('back', backContent, 'markdown')
          );
        }
        break;

      case UnifiedCardType.MULTIPLE_CHOICE:
      case UnifiedCardType.SINGLE_CHOICE:
        // ✅ 修复：遵循卡片数据结构规范 v1.0
        // 优先使用 card.content，降级使用 fields
        let choiceFullContent = '';
        
        if (card.content && card.content.trim()) {
          choiceFullContent = card.content.trim();
        }
        
        if (choiceFullContent) {
          // 从 content 拆分问题和解析
          const choiceDividerIndex = choiceFullContent.indexOf('\n---div---\n');
          let questionContent = '';
          let explanationContent = '';
          
          if (choiceDividerIndex >= 0) {
            questionContent = choiceFullContent.substring(0, choiceDividerIndex).trim();
            explanationContent = choiceFullContent.substring(choiceDividerIndex + 11).trim();
          } else {
            questionContent = choiceFullContent;
          }
          
          sections.push(
            this.createPreviewSection('front', questionContent, 'markdown')
          );
          
          if (explanationContent) {
            sections.push(
              this.createPreviewSection('back', explanationContent, 'markdown')
            );
          }
        } else {
          // 降级：使用 fields
          const questionContent = card.fields?.front || '';
          const explanationContent = card.fields?.back || '';
          
          sections.push(
            this.createPreviewSection('front', questionContent, 'markdown')
          );
          
          if (explanationContent) {
            sections.push(
              this.createPreviewSection('back', explanationContent, 'markdown')
            );
          }
        }
        break;
    }

    return sections;
  }

  /**
   * 创建预览节
   */
  private createPreviewSection(
    type: PreviewSection['type'], 
    content: string, 
    renderMode: PreviewSection['renderMode']
  ): PreviewSection {
    return {
      id: `section-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      renderMode,
      animations: this.getDefaultAnimations(type),
      interactivity: this.getDefaultInteractivity(type)
    };
  }

  /**
   * 获取默认动效配置
   */
  private getDefaultAnimations(type: PreviewSection['type']): AnimationConfig[] {
    const baseAnimation: AnimationConfig = {
      type: 'fadeIn',
      duration: 300,
      delay: 0,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    };

    switch (type) {
      case 'front':
        return [{ ...baseAnimation, delay: 0 }];
      case 'back':
        return [{ ...baseAnimation, delay: 100 }];
      case 'options':
        return [{ ...baseAnimation, type: 'slideIn', delay: 150 }];
      case 'explanation':
        return [{ ...baseAnimation, delay: 200 }];
      default:
        return [baseAnimation];
    }
  }

  /**
   * 获取默认交互配置
   */
  private getDefaultInteractivity(type: PreviewSection['type']): InteractivityConfig {
    return {
      clickable: type === 'options',
      hoverable: true,
      selectable: false,
      customHandlers: {}
    };
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(card: Card, template?: TriadTemplate): string {
    const templateId = template?.id || card.templateId || 'default';
    const fieldsHash = this.hashFields(card.fields || {});
    return `${card.id}-${templateId}-${fieldsHash}`;
  }

  /**
   * 计算字段哈希
   */
  private hashFields(fields: Record<string, string>): string {
    // 输入验证：处理空值和undefined情况
    if (!fields || typeof fields !== 'object') {
      console.warn('[ContentPreviewEngine] hashFields: 无效的fields参数，使用空对象');
      fields = {};
    }
    
    const fieldsStr = JSON.stringify(fields);
    let hash = 0;
    for (let i = 0; i < fieldsStr.length; i++) {
      const char = fieldsStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(card: Card, cardType: UnifiedCardType): number {
    let confidence = 0.8; // 基础置信度

    // 根据字段完整性调整
    if (card.fields) {
      const fieldCount = Object.keys(card.fields).length;
      const nonEmptyFields = Object.values(card.fields).filter(v => v && v.trim()).length;
      confidence += (nonEmptyFields / fieldCount) * 0.2;
    }

    // 根据题型特征调整
    switch (cardType) {
      case UnifiedCardType.MULTIPLE_CHOICE:
        if (card.fields && isMultipleChoiceCard(card.fields)) {
          confidence += 0.1;
        }
        break;
      case UnifiedCardType.CLOZE_DELETION:
        if (this.isClozeCard(card)) {
          confidence += 0.1;
        }
        break;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成渲染提示
   */
  private generateRenderingHints(sections: PreviewSection[], cardType: UnifiedCardType): RenderingHints {
    const totalContent = sections.reduce((acc, section) => acc + section.content.length, 0);

    return {
      preferredHeight: Math.max(200, Math.min(600, totalContent / 10)),
      hasInteractiveElements: sections.some(s => s.interactivity.clickable),
      requiresObsidianRenderer: sections.some(s =>
        s.content.includes('[[') || s.content.includes('![[') || s.content.includes('#')
      ),
      cacheKey: `render-${cardType}-${Date.now()}`
    };
  }

  // ===== 题型特定预览生成方法 =====

  /**
   * 生成基础问答预览
   */
  private async generateBasicQAPreview(previewData: PreviewData, options: PreviewOptions): Promise<void> {
    // 基础问答预览逻辑将在后续实现
    console.log('[ContentPreviewEngine] 生成基础问答预览');
  }

  /**
   * 生成挖空题预览
   */
  private async generateClozePreview(previewData: PreviewData, options: PreviewOptions): Promise<void> {
    console.log('[ContentPreviewEngine] 🎯 开始生成挖空题预览');
    
    // 1. 创建ClozePreview实例
    const clozePreview = new ClozePreview(this.plugin);
    
    // 2. 遍历所有sections，解析挖空内容
    for (const section of previewData.sections) {
      if (section.content) {
        // 3. 调用parseClozeContent解析挖空
        const clozeDataList = clozePreview.parseClozeContent(section.content);
        
        // 4. 将解析结果添加到section.metadata
        if (clozeDataList.length > 0) {
          section.metadata = section.metadata || {};
          section.metadata.clozeItems = clozeDataList.map((item, index) => ({
            id: item.id,
            content: item.content,
            answer: item.content,
            hint: item.hint || item.placeholder,
            group: item.groupId,
            index
          }));
          
          console.log(`[ContentPreviewEngine] ✅ 解析到 ${clozeDataList.length} 个挖空`);
        }
      }
    }
    
    console.log('[ContentPreviewEngine] ✅ 挖空题预览生成完成');
  }

  // 选择题预览生成功能已移除

  /**
   * 生成可扩展预览
   */
  private async generateExtensiblePreview(previewData: PreviewData, options: PreviewOptions): Promise<void> {
    // 可扩展预览逻辑将在后续实现
    console.log('[ContentPreviewEngine] 生成可扩展预览');
  }
}

