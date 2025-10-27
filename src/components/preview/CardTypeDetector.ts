import type { Card } from '../../data/types';
import { isMultipleChoiceCard, parseChoiceOptions } from '../../utils/multiple-choice-parser';
import { UnifiedCardType } from '../../types/unified-card-types';

/**
 * 题型检测结果接口
 */
export interface CardTypeDetectionResult {
  cardType: UnifiedCardType;
  confidence: number;
  features: DetectedFeature[];
  metadata: DetectionMetadata;
}

/**
 * 增强的题型检测结果接口
 */
export interface EnhancedCardTypeDetectionResult extends CardTypeDetectionResult {
  alternativeTypes: Array<{
    cardType: UnifiedCardType;
    confidence: number;
    reason: string;
  }>;
  detectionStrategy: 'pattern' | 'ml' | 'hybrid';
  processingTime: number;
}

/**
 * 检测到的特征接口
 */
export interface DetectedFeature {
  type: 'cloze' | 'options' | 'qa_structure' | 'markdown_syntax';
  pattern: string;
  matches: string[];
  confidence: number;
}

/**
 * 检测元数据接口
 */
export interface DetectionMetadata {
  totalFields: number;
  nonEmptyFields: number;
  contentLength: number;
  hasObsidianSyntax: boolean;
  detectionTime: number;
}

/**
 * 卡片题型检测器
 * 负责智能检测卡片的题型并提供详细的检测结果
 */
export class CardTypeDetector {
  private static readonly CLOZE_PATTERNS = [
    // Obsidian 高亮语法
    { pattern: /==(.*?)==/g, type: 'obsidian_highlight', weight: 0.9 },
    // Anki 挖空语法
    { pattern: /\{\{c\d+::(.*?)\}\}/g, type: 'anki_cloze', weight: 1.0 },
    // 自定义挖空语法
    { pattern: /\[cloze\](.*?)\[\/cloze\]/g, type: 'custom_cloze', weight: 0.8 }
  ];

  private static readonly QA_PATTERNS = [
    // 问答结构模式（需全局匹配，供 matchAll 使用）
    { pattern: /^(问题?|Question|Q)[:：]\s*(.+)/gim, type: 'explicit_question', weight: 0.9 },
    { pattern: /^(答案?|Answer|A)[:：]\s*(.+)/gim, type: 'explicit_answer', weight: 0.9 },
    // Markdown 标题模式（全局匹配）
    { pattern: /^#{1,6}\s+(.+)/gm, type: 'markdown_heading', weight: 0.7 }
  ];

  private static readonly OBSIDIAN_SYNTAX_PATTERNS = [
    // 双链
    { pattern: /\[\[([^\]]+)\]\]/g, type: 'wikilink', weight: 0.8 },
    // 嵌入
    { pattern: /!\[\[([^\]]+)\]\]/g, type: 'embed', weight: 0.9 },
    // 标签
    { pattern: /#[a-zA-Z0-9_\u4e00-\u9fff]+/g, type: 'tag', weight: 0.7 },
    // 块引用
    { pattern: /\^\w+/g, type: 'block_reference', weight: 0.8 }
  ];

  /**
   * 检测卡片题型
   */
  static detectCardType(card: Card): CardTypeDetectionResult {
    const startTime = performance.now();
    
    // 收集所有字段内容
    const allContent = Object.values(card.fields).join('\n');
    const features: DetectedFeature[] = [];
    
    // 1. 检测选择题特征
    const multipleChoiceFeatures = this.detectMultipleChoiceFeatures(card);
    features.push(...multipleChoiceFeatures);
    
    // 2. 检测挖空题特征
    const clozeFeatures = this.detectClozeFeatures(allContent);
    features.push(...clozeFeatures);
    
    // 3. 检测问答题特征
    const qaFeatures = this.detectQAFeatures(allContent);
    features.push(...qaFeatures);
    
    // 4. 检测 Obsidian 语法特征
    const obsidianFeatures = this.detectObsidianFeatures(allContent);
    features.push(...obsidianFeatures);
    
    // 5. 计算最终题型和置信度
    const { cardType, confidence } = this.calculateFinalType(features, card);
    
    // 6. 生成检测元数据
    const metadata: DetectionMetadata = {
      totalFields: Object.keys(card.fields).length,
      nonEmptyFields: Object.values(card.fields).filter(v => v && v.trim()).length,
      contentLength: allContent.length,
      hasObsidianSyntax: obsidianFeatures.length > 0,
      detectionTime: performance.now() - startTime
    };

    return {
      cardType,
      confidence,
      features,
      metadata
    };
  }

  /**
   * 检测选择题特征
   */
  private static detectMultipleChoiceFeatures(card: Card): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    // 使用现有的选择题检测逻辑
    if (isMultipleChoiceCard(card.fields)) {
      // 检测选项格式
      const optionsText = card.fields.options || '';
      const parsedOptions = parseChoiceOptions(optionsText);
      
      if (parsedOptions.hasValidStructure) {
        features.push({
          type: 'options',
          pattern: 'structured_options',
          matches: parsedOptions.options.map(opt => opt.label),
          confidence: 0.95
        });
      }
      
      // 检测正确答案字段
      if (card.fields.correct_answer && card.fields.correct_answer.trim()) {
        features.push({
          type: 'options',
          pattern: 'correct_answer_field',
          matches: [card.fields.correct_answer],
          confidence: 0.9
        });
      }
    }
    
    return features;
  }

  /**
   * 检测挖空题特征
   */
  private static detectClozeFeatures(content: string): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    for (const { pattern, type, weight } of this.CLOZE_PATTERNS) {
      const matches = Array.from(content.matchAll(pattern));
      
      if (matches.length > 0) {
        features.push({
          type: 'cloze',
          pattern: type,
          matches: matches.map(match => match[1] || match[0]),
          confidence: weight * Math.min(1.0, matches.length / 3) // 挖空数量影响置信度
        });
      }
    }
    
    return features;
  }

  /**
   * 检测问答题特征
   */
  private static detectQAFeatures(content: string): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    for (const { pattern, type, weight } of this.QA_PATTERNS) {
      const matches = Array.from(content.matchAll(pattern));
      
      if (matches.length > 0) {
        features.push({
          type: 'qa_structure',
          pattern: type,
          matches: matches.map(match => match[1] || match[0]),
          confidence: weight
        });
      }
    }
    
    return features;
  }

  /**
   * 检测 Obsidian 语法特征
   */
  private static detectObsidianFeatures(content: string): DetectedFeature[] {
    const features: DetectedFeature[] = [];
    
    for (const { pattern, type, weight } of this.OBSIDIAN_SYNTAX_PATTERNS) {
      const matches = Array.from(content.matchAll(pattern));
      
      if (matches.length > 0) {
        features.push({
          type: 'markdown_syntax',
          pattern: type,
          matches: matches.map(match => match[1] || match[0]),
          confidence: weight * Math.min(1.0, matches.length / 5) // 语法数量影响置信度
        });
      }
    }
    
    return features;
  }

  /**
   * 计算最终题型和置信度
   */
  private static calculateFinalType(features: DetectedFeature[], card: Card): { cardType: UnifiedCardType; confidence: number } {
    // 计算各题型的得分
    const scores = {
      [UnifiedCardType.MULTIPLE_CHOICE]: 0,
      [UnifiedCardType.CLOZE_DELETION]: 0,
      [UnifiedCardType.BASIC_QA]: 0.5, // 基础得分，作为默认选项
      [UnifiedCardType.FILL_IN_BLANK]: 0,
      [UnifiedCardType.SEQUENCE]: 0,
      [UnifiedCardType.EXTENSIBLE]: 0
    };

    // 根据特征计算得分
    for (const feature of features) {
      switch (feature.type) {
        case 'options':
          scores[UnifiedCardType.MULTIPLE_CHOICE] += feature.confidence;
          break;
        case 'cloze':
          scores[UnifiedCardType.CLOZE_DELETION] += feature.confidence;
          break;
        case 'qa_structure':
          scores[UnifiedCardType.BASIC_QA] += feature.confidence * 0.8;
          break;
        case 'markdown_syntax':
          // Obsidian 语法对所有题型都有轻微加成
          Object.keys(scores).forEach(type => {
            scores[type as UnifiedCardType] += feature.confidence * 0.1;
          });
          break;
      }
    }

    // 选择题额外检查
    if (isMultipleChoiceCard(card.fields)) {
      scores[UnifiedCardType.MULTIPLE_CHOICE] += 0.5;
    }

    // 检测填空题特征
    const allContent = Object.values(card.fields).join('\n');
    if (this.detectFillInBlankFeatures(allContent)) {
      scores[UnifiedCardType.FILL_IN_BLANK] += 0.7;
    }

    // 找到得分最高的题型
    const maxScore = Math.max(...Object.values(scores));
    const cardType = Object.keys(scores).find(
      type => scores[type as UnifiedCardType] === maxScore
    ) as UnifiedCardType;

    // 计算最终置信度
    const confidence = Math.min(1.0, maxScore);

    console.log(`[CardTypeDetector] 检测结果: ${cardType}, 置信度: ${confidence.toFixed(2)}, 得分:`, scores);

    return { cardType, confidence };
  }

  /**
   * 检测填空题特征
   */
  private static detectFillInBlankFeatures(content: string): boolean {
    // 检测填空题模式：**text** 或 __text__ 或 [blank] 等
    const fillInBlankPatterns = [
      /\*\*(.*?)\*\*/g,  // **填空内容**
      /__(.*?)__/g,      // __填空内容__
      /\[blank\]/gi,     // [blank]
      /\[填空\]/g,       // [填空]
      /\[_+\]/g          // [___]
    ];

    return fillInBlankPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 获取题型描述
   */
  static getCardTypeDescription(cardType: UnifiedCardType): string {
    switch (cardType) {
      case UnifiedCardType.BASIC_QA:
        return '基础问答题';
      case UnifiedCardType.CLOZE_DELETION:
        return '挖空题';
      case UnifiedCardType.MULTIPLE_CHOICE:
        return '选择题';
      case UnifiedCardType.FILL_IN_BLANK:
        return '填空题';
      case UnifiedCardType.SEQUENCE:
        return '顺序题';
      case UnifiedCardType.EXTENSIBLE:
        return '可扩展题型';
      default:
        return '未知题型';
    }
  }

  /**
   * 增强的题型检测方法
   */
  static detectCardTypeWithConfidence(card: Card): EnhancedCardTypeDetectionResult {
    const startTime = performance.now();
    const basicResult = this.detectCardType(card);

    // 计算备选题型
    const allContent = Object.values(card.fields).join('\n');
    const alternativeTypes: Array<{
      cardType: UnifiedCardType;
      confidence: number;
      reason: string;
    }> = [];

    // 检测所有可能的题型
    const typeScores = this.calculateAllTypeScores(card, allContent);

    // 排序并获取前3个备选项
    const sortedTypes = Object.entries(typeScores)
      .sort(([,a], [,b]) => b - a)
      .slice(1, 4); // 跳过最高分（主要类型）

    for (const [type, score] of sortedTypes) {
      if (score > 0.3) { // 只包含有意义的备选项
        alternativeTypes.push({
          cardType: type as UnifiedCardType,
          confidence: score,
          reason: this.getDetectionReason(type as UnifiedCardType, card)
        });
      }
    }

    return {
      ...basicResult,
      alternativeTypes,
      detectionStrategy: 'pattern',
      processingTime: performance.now() - startTime
    };
  }

  /**
   * 计算所有题型得分
   */
  private static calculateAllTypeScores(card: Card, content: string): Record<string, number> {
    const scores: Record<string, number> = {};

    // 基础得分
    scores[UnifiedCardType.BASIC_QA] = 0.5;
    scores[UnifiedCardType.MULTIPLE_CHOICE] = isMultipleChoiceCard(card.fields) ? 0.8 : 0;
    scores[UnifiedCardType.CLOZE_DELETION] = this.detectClozeFeatures(content).length > 0 ? 0.7 : 0;
    scores[UnifiedCardType.FILL_IN_BLANK] = this.detectFillInBlankFeatures(content) ? 0.6 : 0;
    scores[UnifiedCardType.SEQUENCE] = this.detectSequenceFeatures(content) ? 0.5 : 0;
    scores[UnifiedCardType.EXTENSIBLE] = 0.1;

    return scores;
  }

  /**
   * 检测顺序题特征
   */
  private static detectSequenceFeatures(content: string): boolean {
    // 检测顺序相关的关键词和模式
    const sequencePatterns = [
      /第[一二三四五六七八九十\d]+步/g,
      /步骤\s*[：:]\s*\d+/g,
      /\d+\.\s+/g,
      /首先|然后|接着|最后|第一|第二|第三/g
    ];

    return sequencePatterns.some(pattern => pattern.test(content));
  }

  /**
   * 获取检测原因
   */
  private static getDetectionReason(cardType: UnifiedCardType, card: Card): string {
    switch (cardType) {
      case UnifiedCardType.MULTIPLE_CHOICE:
        return '检测到选项结构';
      case UnifiedCardType.CLOZE_DELETION:
        return '检测到挖空语法';
      case UnifiedCardType.FILL_IN_BLANK:
        return '检测到填空标记';
      case UnifiedCardType.SEQUENCE:
        return '检测到顺序关键词';
      default:
        return '基于内容结构判断';
    }
  }

  /**
   * 获取特征描述
   */
  static getFeatureDescription(feature: DetectedFeature): string {
    const typeDescriptions = {
      cloze: '挖空标记',
      options: '选项结构',
      qa_structure: '问答结构',
      markdown_syntax: 'Markdown语法'
    };

    return `${typeDescriptions[feature.type] || feature.type}: ${feature.pattern} (置信度: ${(feature.confidence * 100).toFixed(1)}%)`;
  }
}
