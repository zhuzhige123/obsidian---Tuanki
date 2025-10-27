import type { Card } from '../../../data/types';
import type { PreviewData, PreviewOptions, PreviewSection } from '../ContentPreviewEngine';
import type AnkiPlugin from '../../../main';

/**
 * 问答渲染选项接口
 */
export interface QARenderOptions {
  showAnswer: boolean;
  enableTransitions: boolean;
  highlightKeywords: boolean;
  maxQuestionLength?: number;
  maxAnswerLength?: number;
}

/**
 * 问答渲染结果接口
 */
export interface QARenderResult {
  questionElement: HTMLElement;
  answerElement: HTMLElement;
  hasOverflow: boolean;
  keywordCount: number;
}

/**
 * 基础问答预览器
 * 专门处理基础问答题型的预览渲染
 */
export class BasicQAPreview {
  private plugin: AnkiPlugin;
  private static readonly KEYWORD_PATTERNS = [
    // 中文关键词模式
    /(?:什么|为什么|怎么|如何|哪个|哪些|何时|何地|谁|多少)/g,
    // 英文关键词模式
    /(?:what|why|how|which|when|where|who|how many|how much)/gi,
    // 学术关键词
    /(?:定义|概念|原理|方法|步骤|特点|优缺点|区别|联系)/g
  ];

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
  }

  /**
   * 渲染问题内容
   */
  renderQuestion(content: string, options: QARenderOptions): HTMLElement {
    const container = document.createElement('div');
    container.className = 'tuanki-qa-question';
    
    // 处理内容长度
    const processedContent = this.processContentLength(content, options.maxQuestionLength);
    
    // 创建问题标题
    const titleElement = document.createElement('div');
    titleElement.className = 'tuanki-qa-question-title';
    titleElement.innerHTML = '<span class="tuanki-qa-label">问题</span>';
    container.appendChild(titleElement);
    
    // 创建问题内容
    const contentElement = document.createElement('div');
    contentElement.className = 'tuanki-qa-question-content';
    
    if (options.highlightKeywords) {
      contentElement.innerHTML = this.highlightKeywords(processedContent);
    } else {
      contentElement.textContent = processedContent;
    }
    
    container.appendChild(contentElement);
    
    // 添加溢出指示器
    if (processedContent.length < content.length) {
      const overflowIndicator = document.createElement('div');
      overflowIndicator.className = 'tuanki-qa-overflow-indicator';
      overflowIndicator.textContent = '...';
      container.appendChild(overflowIndicator);
    }
    
    // 应用过渡效果
    if (options.enableTransitions) {
      this.applyQuestionTransitions(container);
    }
    
    return container;
  }

  /**
   * 渲染答案内容
   */
  renderAnswer(content: string, options: QARenderOptions): HTMLElement {
    const container = document.createElement('div');
    container.className = 'tuanki-qa-answer';
    
    if (!options.showAnswer) {
      container.classList.add('tuanki-qa-answer--hidden');
      return container;
    }
    
    // 处理内容长度
    const processedContent = this.processContentLength(content, options.maxAnswerLength);
    
    // 创建答案标题
    const titleElement = document.createElement('div');
    titleElement.className = 'tuanki-qa-answer-title';
    titleElement.innerHTML = '<span class="tuanki-qa-label">答案</span>';
    container.appendChild(titleElement);
    
    // 创建答案内容
    const contentElement = document.createElement('div');
    contentElement.className = 'tuanki-qa-answer-content';
    
    // 处理答案格式（支持列表、段落等）
    const formattedContent = this.formatAnswerContent(processedContent);
    contentElement.innerHTML = formattedContent;
    
    container.appendChild(contentElement);
    
    // 添加溢出指示器
    if (processedContent.length < content.length) {
      const overflowIndicator = document.createElement('div');
      overflowIndicator.className = 'tuanki-qa-overflow-indicator';
      overflowIndicator.textContent = '...';
      container.appendChild(overflowIndicator);
    }
    
    // 应用过渡效果
    if (options.enableTransitions) {
      this.applyAnswerTransitions(container);
    }
    
    return container;
  }

  /**
   * 应用过渡效果
   */
  applyTransitions(element: HTMLElement, transitionType: 'question' | 'answer' | 'reveal'): void {
    switch (transitionType) {
      case 'question':
        this.applyQuestionTransitions(element);
        break;
      case 'answer':
        this.applyAnswerTransitions(element);
        break;
      case 'reveal':
        this.applyRevealTransition(element);
        break;
    }
  }

  /**
   * 渲染完整的问答卡片
   */
  renderQACard(card: Card, options: QARenderOptions): QARenderResult {
    const questionContent = card.fields.question || card.fields.front || '';
    const answerContent = card.fields.answer || card.fields.back || '';
    
    const questionElement = this.renderQuestion(questionContent, options);
    const answerElement = this.renderAnswer(answerContent, options);
    
    // 检测内容溢出
    const hasOverflow = this.detectContentOverflow(questionContent, answerContent, options);
    
    // 计算关键词数量
    const keywordCount = this.countKeywords(questionContent);
    
    return {
      questionElement,
      answerElement,
      hasOverflow,
      keywordCount
    };
  }

  /**
   * 切换答案显示状态
   */
  toggleAnswerVisibility(answerElement: HTMLElement, show: boolean, animated: boolean = true): void {
    if (show) {
      answerElement.classList.remove('tuanki-qa-answer--hidden');
      if (animated) {
        this.applyRevealTransition(answerElement);
      }
    } else {
      answerElement.classList.add('tuanki-qa-answer--hidden');
    }
  }

  // ===== 私有方法 =====

  /**
   * 处理内容长度
   */
  private processContentLength(content: string, maxLength?: number): string {
    if (!maxLength || content.length <= maxLength) {
      return content;
    }
    
    // 智能截断，尽量在句子边界截断
    const truncated = content.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }
    
    return truncated;
  }

  /**
   * 高亮关键词
   */
  private highlightKeywords(content: string): string {
    let highlightedContent = content;
    
    for (const pattern of BasicQAPreview.KEYWORD_PATTERNS) {
      highlightedContent = highlightedContent.replace(pattern, (match) => {
        return `<span class="tuanki-qa-keyword">${match}</span>`;
      });
    }
    
    return highlightedContent;
  }

  /**
   * 格式化答案内容
   */
  private formatAnswerContent(content: string): string {
    let formattedContent = content;
    
    // 处理列表格式
    formattedContent = formattedContent.replace(/^[-*+]\s+(.+)$/gm, '<li>$1</li>');
    if (formattedContent.includes('<li>')) {
      formattedContent = `<ul>${formattedContent}</ul>`;
    }
    
    // 处理数字列表
    formattedContent = formattedContent.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    if (formattedContent.includes('<li>') && !formattedContent.includes('<ul>')) {
      formattedContent = `<ol>${formattedContent}</ol>`;
    }
    
    // 处理段落
    if (!formattedContent.includes('<li>')) {
      const paragraphs = formattedContent.split('\n\n').filter(p => p.trim());
      if (paragraphs.length > 1) {
        formattedContent = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');
      }
    }
    
    return formattedContent;
  }

  /**
   * 应用问题过渡效果
   */
  private applyQuestionTransitions(element: HTMLElement): void {
    element.style.opacity = '0';
    element.style.transform = 'translateY(-10px)';
    
    // 使用requestAnimationFrame确保样式已应用
    requestAnimationFrame(() => {
      element.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });
  }

  /**
   * 应用答案过渡效果
   */
  private applyAnswerTransitions(element: HTMLElement): void {
    element.style.opacity = '0';
    element.style.transform = 'translateY(10px)';
    
    requestAnimationFrame(() => {
      element.style.transition = 'opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s';
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });
  }

  /**
   * 应用揭示过渡效果
   */
  private applyRevealTransition(element: HTMLElement): void {
    element.style.opacity = '0';
    element.style.transform = 'scale(0.95)';
    
    requestAnimationFrame(() => {
      element.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
      element.style.opacity = '1';
      element.style.transform = 'scale(1)';
    });
  }

  /**
   * 检测内容溢出
   */
  private detectContentOverflow(questionContent: string, answerContent: string, options: QARenderOptions): boolean {
    const questionOverflow = options.maxQuestionLength && questionContent.length > options.maxQuestionLength;
    const answerOverflow = options.maxAnswerLength && answerContent.length > options.maxAnswerLength;
    
    return !!(questionOverflow || answerOverflow);
  }

  /**
   * 计算关键词数量
   */
  private countKeywords(content: string): number {
    let count = 0;
    
    for (const pattern of BasicQAPreview.KEYWORD_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
    
    return count;
  }
}
