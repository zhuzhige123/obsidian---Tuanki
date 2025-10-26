/**
 * Tuanki内容提取器
 * 负责从标注中提取和解析复杂的Markdown内容
 */

import { TuankiAnnotation, DeckTemplateInfo, AnnotationMetadata, ContentExtractionResult } from '../types/annotation-types';

/**
 * 内容类型枚举
 */
export enum ContentType {
  QUESTION_ANSWER = 'question_answer',
  CLOZE = 'cloze',
  BASIC = 'basic',
  MULTI_CHOICE = 'multi_choice',
  CODE = 'code'
}

/**
 * 解析后的内容结构
 */
export interface ParsedContent {
  type: ContentType;
  title?: string;
  question?: string;
  answer?: string;
  clozeText?: string;
  choices?: string[];
  code?: string;
  language?: string;
  notes?: string;
  tags?: string[];
}

/**
 * 选择题解析结果
 */
export interface ChoiceParseResult {
  success: boolean;
  question: string;
  options: string;
  correctAnswer?: string;
  explanation?: string;
  tags?: string;
  confidence: number;
  format: 'markdown-h2' | 'markdown-options' | 'anki-style' | 'unknown';
}

/**
 * 问答题解析结果
 */
export interface QAParseResult {
  success: boolean;
  question: string;
  answer: string;
  tags?: string;
  confidence: number;
  format: 'markdown-qa' | 'simple-qa' | 'unknown';
}

/**
 * 挖空题解析结果
 */
export interface ClozeParseResult {
  success: boolean;
  text: string;
  clozeCount: number;
  extra?: string;
  tags?: string;
  confidence: number;
  format: 'anki-cloze' | 'highlight-cloze' | 'unknown';
}

/**
 * 内容提取器类
 */
export class ContentExtractor {
  private static instance: ContentExtractor;

  // 正则表达式模式
  private readonly HEADING_REGEX = /^#{1,6}\s+(.+)$/gm;
  private readonly CLOZE_REGEX = /\{\{c\d+::([^}]+)\}\}/g;
  private readonly HIGHLIGHT_CLOZE_REGEX = /==(.*?)==/g;
  private readonly CODE_BLOCK_REGEX = /```(\w+)?\n([\s\S]*?)```/g;
  private readonly INLINE_CODE_REGEX = /`([^`]+)`/g;
  private readonly LINK_REGEX = /\[\[([^\]]+)\]\]/g;
  private readonly TAG_REGEX = /#([a-zA-Z0-9\u4e00-\u9fff/_-]+)/g;
  private readonly DECK_REGEX = /#deck\/([^\s#]+)/g;
  private readonly LIST_ITEM_REGEX = /^[\s]*[-*+]\s+(.+)$/gm;
  private readonly NUMBERED_LIST_REGEX = /^[\s]*\d+\.\s+(.+)$/gm;
  private readonly BLOCKQUOTE_REGEX = /^>\s+(.+)$/gm;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ContentExtractor {
    if (!ContentExtractor.instance) {
      ContentExtractor.instance = new ContentExtractor();
    }
    return ContentExtractor.instance;
  }

  /**
   * 提取标注内容
   */
  public extractContent(annotation: TuankiAnnotation): ContentExtractionResult {
    try {
      console.log(`🔍 [ContentExtractor] 开始提取内容: ${annotation.id}`);
      
      // ✅ 验证rawContent
      if (!annotation.rawContent || typeof annotation.rawContent !== 'string') {
        console.warn(`⚠️ [ContentExtractor] rawContent为空或无效`);
        return {
          success: false,
          error: '标注内容为空'
        };
      }
      
      // 获取纯净的内容
      const cleanContent = this.cleanRawContent(annotation.rawContent);
      
      // ✅ 验证清理后的内容
      if (!cleanContent || !cleanContent.trim()) {
        console.warn(`⚠️ [ContentExtractor] 清理后内容为空`);
        return {
          success: false,
          error: '标注内容为空'
        };
      }
      
      // 解析内容结构
      const parsedContent = this.parseContentStructure(cleanContent);
      
      // 提取牌组和模板信息
      const deckTemplate = this.extractDeckTemplateInfo(cleanContent);
      
      // 提取元数据
      const metadata = this.extractMetadata(cleanContent);
      
      // 生成最终的卡片内容
      const cardContent = this.generateCardContent(parsedContent);

      console.log(`✅ [ContentExtractor] 内容提取完成: 类型=${parsedContent.type}`);

      return {
        success: true,
        content: cardContent,
        deckTemplate,
        existingMetadata: metadata
      };
    } catch (error) {
      console.error(`❌ [ContentExtractor] 内容提取失败:`, error);
      return {
        success: false,
        error: `内容提取失败: ${error.message}`
      };
    }
  }

  /**
   * 清理原始内容
   */
  private cleanRawContent(rawContent: string): string {
    // ✅ 安全检查
    if (!rawContent || typeof rawContent !== 'string') {
      return '';
    }
    
    let content = rawContent;
    
    // 移除引用符号
    content = content.replace(/^>\s?/gm, '');
    
    // 移除第一行的 [!tuanki] 标记
    content = content.replace(/^\[!tuanki\].*?\n?/, '');
    
    // 移除元数据行（但保留用于后续提取）
    const metadataLines = content.match(/^(uuid|created|modified|version|blockId):\s*.+$/gm) || [];
    const blockIdLines = content.match(/\^[a-zA-Z0-9-_]+$/gm) || [];
    
    // 暂时保存元数据，稍后会单独提取
    const allMetadataLines = [...metadataLines, ...blockIdLines];
    
    // 移除元数据行
    allMetadataLines.forEach(line => {
      content = content.replace(line, '');
    });
    
    // 清理多余的空行
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
    
    return content;
  }

  /**
   * 解析内容结构
   */
  private parseContentStructure(content: string): ParsedContent {
    // 检测内容类型
    const contentType = this.detectContentType(content);
    
    const parsed: ParsedContent = {
      type: contentType,
      notes: content
    };

    // 根据类型解析不同的结构
    switch (contentType) {
      case ContentType.QUESTION_ANSWER:
        this.parseQuestionAnswer(content, parsed);
        break;
      case ContentType.CLOZE:
        this.parseClozeContent(content, parsed);
        break;
      case ContentType.CODE:
        this.parseCodeContent(content, parsed);
        break;
      case ContentType.MULTI_CHOICE:
        this.parseMultiChoiceContent(content, parsed);
        break;
      default:
        this.parseBasicContent(content, parsed);
        break;
    }

    // 提取通用元素
    this.extractCommonElements(content, parsed);

    return parsed;
  }

  /**
   * 检测内容类型
   */
  private detectContentType(content: string): ContentType {
    // 检测挖空卡片
    if (this.CLOZE_REGEX.test(content) || this.HIGHLIGHT_CLOZE_REGEX.test(content)) {
      return ContentType.CLOZE;
    }
    
    // 检测代码卡片
    if (this.CODE_BLOCK_REGEX.test(content)) {
      return ContentType.CODE;
    }
    
    // 检测多选题
    const listItems = content.match(this.LIST_ITEM_REGEX);
    if (listItems && listItems.length >= 3) {
      return ContentType.MULTI_CHOICE;
    }
    
    // 检测问答卡片（包含明显的问题标识）
    if (content.includes('?') || content.includes('？') || 
        content.match(/^#{1,6}\s+.*[?？]/m) ||
        content.includes('问题') || content.includes('答案')) {
      return ContentType.QUESTION_ANSWER;
    }
    
    return ContentType.BASIC;
  }

  /**
   * 解析问答内容
   */
  private parseQuestionAnswer(content: string, parsed: ParsedContent): void {
    const lines = content.split('\n');
    let questionLines: string[] = [];
    let answerLines: string[] = [];
    let isAnswerSection = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 检测答案部分的开始
      if (trimmedLine.includes('答案') || trimmedLine.includes('Answer') || 
          trimmedLine.includes('解答') || trimmedLine.includes('Solution')) {
        isAnswerSection = true;
        continue;
      }
      
      if (isAnswerSection) {
        if (trimmedLine) {
          answerLines.push(line);
        }
      } else {
        if (trimmedLine) {
          questionLines.push(line);
        }
      }
    }
    
    parsed.question = questionLines.join('\n').trim();
    parsed.answer = answerLines.join('\n').trim();
    
    // 如果没有明确的答案部分，尝试其他方式分割
    if (!parsed.answer && parsed.question) {
      const parts = content.split(/\n\s*\n/);
      if (parts.length >= 2) {
        parsed.question = parts[0].trim();
        parsed.answer = parts.slice(1).join('\n\n').trim();
      }
    }
  }

  /**
   * 解析挖空内容
   */
  private parseClozeContent(content: string, parsed: ParsedContent): void {
    parsed.clozeText = content;
    
    // 提取挖空部分作为标题
    const clozeMatches = content.match(this.CLOZE_REGEX) || content.match(this.HIGHLIGHT_CLOZE_REGEX);
    if (clozeMatches && clozeMatches.length > 0) {
      parsed.title = `挖空练习 (${clozeMatches.length}个空)`;
    }
  }

  /**
   * 解析代码内容
   */
  private parseCodeContent(content: string, parsed: ParsedContent): void {
    const codeMatch = content.match(this.CODE_BLOCK_REGEX);
    if (codeMatch) {
      parsed.language = codeMatch[1] || 'text';
      parsed.code = codeMatch[2].trim();
      
      // 提取代码块之外的内容作为问题
      const questionContent = content.replace(this.CODE_BLOCK_REGEX, '').trim();
      if (questionContent) {
        parsed.question = questionContent;
      }
    }
  }

  /**
   * 解析多选题内容
   */
  private parseMultiChoiceContent(content: string, parsed: ParsedContent): void {
    // ✅ 安全检查
    if (!content || typeof content !== 'string') {
      parsed.question = '';
      parsed.choices = [];
      return;
    }
    
    const lines = content.split('\n');
    let questionLines: string[] = [];
    let choices: string[] = [];
    
    for (const line of lines) {
      const listMatch = line.match(this.LIST_ITEM_REGEX);
      if (listMatch && listMatch[1]) {  // ✅ 验证listMatch[1]存在
        choices.push(listMatch[1].trim());
      } else if (line.trim()) {
        questionLines.push(line);
      }
    }
    
    parsed.question = questionLines.join('\n').trim();
    parsed.choices = choices;
  }

  /**
   * 解析基础内容
   */
  private parseBasicContent(content: string, parsed: ParsedContent): void {
    // 提取标题
    const headingMatch = content.match(this.HEADING_REGEX);
    if (headingMatch) {
      parsed.title = headingMatch[1];
    }
    
    // 基础内容直接使用原始内容
    parsed.notes = content;
  }

  /**
   * 提取通用元素
   */
  private extractCommonElements(content: string, parsed: ParsedContent): void {
    // 提取标签
    const tags = this.extractTags(content);
    parsed.tags = tags;

    // 如果没有标题，尝试从第一行提取
    if (!parsed.title) {
      const firstLine = content.split('\n')[0]?.trim();
      if (firstLine && firstLine.length < 100) {
        parsed.title = firstLine;
      }
    }
  }

  /**
   * 提取标签
   */
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    let match;

    // 重置正则表达式
    this.TAG_REGEX.lastIndex = 0;
    while ((match = this.TAG_REGEX.exec(content)) !== null) {
      const tag = match[1];
      // 排除牌组/模板格式的标签
      if (!tag.includes('/')) {
        tags.push(tag);
      }
    }

    return tags;
  }

  /**
   * 提取牌组和模板信息
   */
  private extractDeckTemplateInfo(content: string): DeckTemplateInfo {
    const deckTemplate: DeckTemplateInfo = {};
    
    // 重置正则表达式
    this.DECK_REGEX.lastIndex = 0;
    
    const match = this.DECK_REGEX.exec(content);
    if (match) {
      deckTemplate.deckName = match[1].trim();
      console.log(`🔍 [ContentExtractor] 提取到牌组标签: "${deckTemplate.deckName}"`);
    } else {
      console.log(`⚠️ [ContentExtractor] 未找到牌组标签，内容预览: ${content.substring(0, 50)}...`);
    }
    
    return deckTemplate;
  }

  /**
   * 提取元数据
   */
  private extractMetadata(rawContent: string): AnnotationMetadata {
    const metadata: AnnotationMetadata = {};
    
    // 提取各种元数据
    const metadataRegex = /^(uuid|created|modified|version|blockId):\s*(.+)$/gm;
    let match;
    
    while ((match = metadataRegex.exec(rawContent)) !== null) {
      const key = match[1];
      const value = match[2].trim();
      
      switch (key) {
        case 'uuid':
          metadata.uuid = value;
          break;
        case 'created':
          metadata.created = value;
          break;
        case 'modified':
          metadata.modified = value;
          break;
        case 'version':
          metadata.version = parseInt(value, 10);
          break;
        case 'blockId':
          metadata.blockId = value;
          break;
      }
    }
    
    // 提取块链接ID
    const blockIdMatch = rawContent.match(/\^([a-zA-Z0-9-_]+)$/m);
    if (blockIdMatch) {
      metadata.blockId = blockIdMatch[1];
    }
    
    return metadata;
  }

  /**
   * 生成卡片内容
   */
  private generateCardContent(parsed: ParsedContent): string {
    const parts: string[] = [];
    
    // 添加标题
    if (parsed.title) {
      parts.push(`# ${parsed.title}`);
    }
    
    // 根据类型生成不同的内容
    switch (parsed.type) {
      case ContentType.QUESTION_ANSWER:
        if (parsed.question) parts.push(`**问题**: ${parsed.question}`);
        if (parsed.answer) parts.push(`**答案**: ${parsed.answer}`);
        break;
        
      case ContentType.CLOZE:
        if (parsed.clozeText) parts.push(parsed.clozeText);
        break;
        
      case ContentType.CODE:
        if (parsed.question) parts.push(parsed.question);
        if (parsed.code) {
          parts.push(`\`\`\`${parsed.language || ''}\n${parsed.code}\n\`\`\``);
        }
        break;
        
      case ContentType.MULTI_CHOICE:
        if (parsed.question) parts.push(parsed.question);
        if (parsed.choices && parsed.choices.length > 0) {
          parts.push('**选项**:');
          parsed.choices.forEach((choice, index) => {
            parts.push(`${String.fromCharCode(65 + index)}. ${choice}`);
          });
        }
        break;
        
      default:
        if (parsed.notes) parts.push(parsed.notes);
        break;
    }
    
    // 添加标签
    if (parsed.tags && parsed.tags.length > 0) {
      parts.push(`\n**标签**: ${parsed.tags.map(tag => `#${tag}`).join(' ')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * 验证内容完整性
   */
  public validateContent(content: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!content || content.trim().length === 0) {
      issues.push('内容为空');
    }
    
    if (content.length < 10) {
      issues.push('内容过短，可能不是有效的学习卡片');
    }
    
    if (content.length > 10000) {
      issues.push('内容过长，建议分割为多个卡片');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * 解析选择题内容
   * 支持多种Markdown格式
   */
  parseChoiceContent(content: string): ChoiceParseResult {
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        question: '',
        options: '',
        confidence: 0,
        format: 'unknown'
      };
    }

    console.log('[ContentExtractor] 开始解析选择题内容:', content.substring(0, 200));

    // 格式1: ## 题目\n题目描述\n\nA. 选项1\nB. 选项2\n---div---\n答案和解析
    const h2WithDescPattern = /^##\s*(.+?)\n([\s\S]*?)\n\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
    const h2WithDescMatch = content.match(h2WithDescPattern);

    if (h2WithDescMatch) {
      const [, title, description, options, backContent] = h2WithDescMatch;
      const question = `${title.trim()}\n${description.trim()}`;
      const result = this.parseBackContent(backContent || '');

      console.log('[ContentExtractor] 匹配格式1 - H2标题+描述+选项:', {
        title: title.trim(),
        description: description.trim(),
        options: options.trim(),
        backContent: backContent?.substring(0, 100)
      });

      return {
        success: true,
        question: question.trim(),
        options: options.trim(),
        correctAnswer: result.answer,
        explanation: result.explanation,
        tags: result.tags,
        confidence: 0.95,
        format: 'markdown-h2-desc'
      };
    }

    // 格式2: ## 题目\n**选项**:\nA. 选项1\nB. 选项2\n---div---\n答案和解析
    const h2OptionsPattern = /^##\s*(.+?)\n\*\*选项\*\*:\s*\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
    const h2Match = content.match(h2OptionsPattern);

    if (h2Match) {
      const [, question, options, backContent] = h2Match;
      const result = this.parseBackContent(backContent || '');

      console.log('[ContentExtractor] 匹配格式2 - H2标题+选项标记:', {
        question: question.trim(),
        options: options.trim()
      });

      return {
        success: true,
        question: question.trim(),
        options: options.trim(),
        correctAnswer: result.answer,
        explanation: result.explanation,
        tags: result.tags,
        confidence: 0.95,
        format: 'markdown-h2'
      };
    }

    // 格式3: 题目\nA. 选项1\nB. 选项2\n---div---\n答案
    const directOptionsPattern = /^(.+?)\n((?:[A-E]\..*?\n?)+)(?:---div---\s*\n([\s\S]*))?$/m;
    const directMatch = content.match(directOptionsPattern);

    if (directMatch) {
      const [, question, options, backContent] = directMatch;

      // 验证选项格式
      const optionLines = options.trim().split('\n').filter(line => line.trim());
      const hasValidOptions = optionLines.length >= 2 &&
        optionLines.every(line => /^[A-E]\./.test(line.trim()));

      if (hasValidOptions) {
        const result = this.parseBackContent(backContent || '');

        console.log('[ContentExtractor] 匹配格式3 - 直接选项:', {
          question: question.trim(),
          options: options.trim()
        });

        return {
          success: true,
          question: question.trim(),
          options: options.trim(),
          correctAnswer: result.answer,
          explanation: result.explanation,
          tags: result.tags,
          confidence: 0.90,
          format: 'markdown-options'
        };
      }
    }

    console.log('[ContentExtractor] 所有格式都不匹配，解析失败');
    return {
      success: false,
      question: '',
      options: '',
      confidence: 0,
      format: 'unknown'
    };
  }

  /**
   * 解析问答题内容
   */
  parseQAContent(content: string): QAParseResult {
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        question: '',
        answer: '',
        confidence: 0,
        format: 'unknown'
      };
    }

    // 格式1: 问题\n---div---\n答案
    const qaPattern = /^(.+?)\n---div---\s*\n([\s\S]*)$/m;
    const qaMatch = content.match(qaPattern);

    if (qaMatch) {
      const [, question, answer] = qaMatch;
      const tags = this.extractTags(content);

      return {
        success: true,
        question: question.trim(),
        answer: answer.trim(),
        tags: tags.length > 0 ? tags.join(',') : undefined,
        confidence: 0.90,
        format: 'markdown-qa'
      };
    }

    return {
      success: false,
      question: '',
      answer: '',
      confidence: 0,
      format: 'unknown'
    };
  }

  /**
   * 解析挖空题内容（新增方法）
   */
  parseClozeContentNew(content: string): ClozeParseResult {
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        text: '',
        clozeCount: 0,
        confidence: 0,
        format: 'unknown'
      };
    }

    // 检测Anki格式挖空 {{c1::内容}}
    const ankiClozeMatches = content.match(this.CLOZE_REGEX);
    if (ankiClozeMatches && ankiClozeMatches.length > 0) {
      const tags = this.extractTags(content);

      return {
        success: true,
        text: content,
        clozeCount: ankiClozeMatches.length,
        tags: tags.length > 0 ? tags.join(',') : undefined,
        confidence: 0.95,
        format: 'anki-cloze'
      };
    }

    // 检测高亮格式挖空 ==内容==
    const highlightClozeMatches = content.match(this.HIGHLIGHT_CLOZE_REGEX);
    if (highlightClozeMatches && highlightClozeMatches.length > 0) {
      const tags = this.extractTags(content);

      return {
        success: true,
        text: content,
        clozeCount: highlightClozeMatches.length,
        tags: tags.length > 0 ? tags.join(',') : undefined,
        confidence: 0.85,
        format: 'highlight-cloze'
      };
    }

    return {
      success: false,
      text: '',
      clozeCount: 0,
      confidence: 0,
      format: 'unknown'
    };
  }

  /**
   * 检测内容类型（新增方法）
   */
  detectContentTypeNew(content: string): 'choice' | 'qa' | 'cloze' | 'unknown' {
    if (!content) return 'unknown';

    // 检测选择题模式
    const optionPattern = /[A-E]\.\s*.+/g;
    const optionMatches = content.match(optionPattern);
    if (optionMatches && optionMatches.length >= 2) {
      return 'choice';
    }

    // 检测挖空题模式
    if (this.CLOZE_REGEX.test(content) || this.HIGHLIGHT_CLOZE_REGEX.test(content)) {
      return 'cloze';
    }

    // 检测问答题模式
    if (content.includes('---div---')) {
      return 'qa';
    }

    return 'unknown';
  }

  /**
   * 解析后端内容（答案和解析）
   */
  private parseBackContent(backContent: string): { answer?: string; explanation?: string; tags?: string } {
    if (!backContent) return {};

    const lines = backContent.trim().split('\n');
    let answer = '';
    let explanation = '';
    let tags = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('**解析**:') || trimmedLine.startsWith('解析:')) {
        explanation = trimmedLine.replace(/^\*\*解析\*\*:\s*|^解析:\s*/, '');
      } else if (trimmedLine.startsWith('**标签**:') || trimmedLine.startsWith('标签:')) {
        tags = trimmedLine.replace(/^\*\*标签\*\*:\s*|^标签:\s*/, '');
      } else if (trimmedLine.startsWith('**') && trimmedLine.includes('**:')) {
        // 其他格式化内容，可能是答案
        if (!answer) {
          answer = trimmedLine;
        }
      } else if (trimmedLine && !answer) {
        // 第一行非空内容作为答案
        answer = trimmedLine;
      } else if (trimmedLine && !explanation) {
        // 后续内容作为解析
        explanation = trimmedLine;
      }
    }

    return { answer, explanation, tags };
  }
}
