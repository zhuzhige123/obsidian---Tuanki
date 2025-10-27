/**
 * 智能边界识别算法
 * 解决正则解析中的内容截断问题，确保完整捕获答案内容
 */

export interface ContentSection {
  type: 'heading' | 'content' | 'separator';
  level?: number; // 标题级别 (1-6)
  content: string;
  startIndex: number;
  endIndex: number;
  raw: string;
}

export interface ParsedContent {
  question: string;
  answer: string;
  sections: ContentSection[];
  confidence: number;
  warnings: string[];
}

export interface BoundaryDetectionOptions {
  questionPatterns: string[]; // 问题识别模式
  answerBoundaryRules: string[]; // 答案边界规则
  preserveFormatting: boolean; // 是否保留格式
  greedyMatching: boolean; // 是否使用贪婪匹配
}

/**
 * 智能边界识别器
 * 基于内容结构分析而非简单正则匹配
 */
export class IntelligentBoundaryDetector {
  private options: BoundaryDetectionOptions;

  constructor(options: Partial<BoundaryDetectionOptions> = {}) {
    this.options = {
      questionPatterns: [
        '^## (.+)', // 二级标题
        '^### (.+)', // 三级标题
        '^# (.+)', // 一级标题
        '\\*\\*(.+?)\\*\\*:', // 粗体标题
        'Q:\\s*(.+)', // Q: 格式
        '问题[:：]\\s*(.+)', // 中文问题标记
      ],
      answerBoundaryRules: [
        'same-level-heading', // 同级标题作为边界
        'higher-level-heading', // 更高级标题作为边界
        'separator-line', // 分隔线作为边界
        'document-end', // 文档结束作为边界
      ],
      preserveFormatting: true,
      greedyMatching: true,
      ...options
    };
  }

  /**
   * 解析Markdown内容，智能识别问题和答案边界
   */
  parseContent(content: string): ParsedContent {
    // 1. 分析内容结构
    const sections = this.analyzeContentStructure(content);
    
    // 2. 识别问题部分
    const questionSection = this.identifyQuestionSection(sections);
    
    if (!questionSection) {
      return {
        question: '',
        answer: content.trim(),
        sections,
        confidence: 0.1,
        warnings: ['无法识别问题部分，将整个内容作为答案']
      };
    }

    // 3. 智能确定答案边界
    const answerBoundary = this.determineAnswerBoundary(sections, questionSection);
    
    // 4. 提取问题和答案内容
    const question = this.extractQuestionContent(questionSection);
    const answer = this.extractAnswerContent(sections, questionSection, answerBoundary);
    
    // 5. 计算置信度
    const confidence = this.calculateConfidence(question, answer, sections);
    
    // 6. 生成警告信息
    const warnings = this.generateWarnings(question, answer, sections);

    return {
      question: question.trim(),
      answer: answer.trim(),
      sections,
      confidence,
      warnings
    };
  }

  /**
   * 分析内容结构，识别标题、内容块、分隔符等
   */
  private analyzeContentStructure(content: string): ContentSection[] {
    const sections: ContentSection[] = [];
    const lines = content.split('\n');
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const startIndex = currentIndex;
      const endIndex = currentIndex + line.length;

      // 识别标题
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        sections.push({
          type: 'heading',
          level: headingMatch[1].length,
          content: headingMatch[2].trim(),
          startIndex,
          endIndex,
          raw: line
        });
      }
      // 识别分隔符
      else if (line.match(/^[-=]{3,}$/)) {
        sections.push({
          type: 'separator',
          content: '',
          startIndex,
          endIndex,
          raw: line
        });
      }
      // 普通内容
      else if (line.trim()) {
        sections.push({
          type: 'content',
          content: line,
          startIndex,
          endIndex,
          raw: line
        });
      }

      currentIndex = endIndex + 1; // +1 for newline
    }

    return sections;
  }

  /**
   * 识别问题部分
   */
  private identifyQuestionSection(sections: ContentSection[]): ContentSection | null {
    // 优先查找标题类型的问题
    for (const section of sections) {
      if (section.type === 'heading') {
        return section;
      }
    }

    // 查找符合问题模式的内容
    for (const section of sections) {
      if (section.type === 'content') {
        for (const pattern of this.options.questionPatterns) {
          if (new RegExp(pattern, 'i').test(section.content)) {
            return section;
          }
        }
      }
    }

    return null;
  }

  /**
   * 智能确定答案边界
   */
  private determineAnswerBoundary(
    sections: ContentSection[], 
    questionSection: ContentSection
  ): number {
    const questionIndex = sections.indexOf(questionSection);
    
    // 从问题后面开始查找边界
    for (let i = questionIndex + 1; i < sections.length; i++) {
      const section = sections[i];
      
      // 规则1: 同级或更高级标题作为边界
      if (section.type === 'heading' && questionSection.type === 'heading') {
        if (section.level! <= questionSection.level!) {
          return i;
        }
      }
      
      // 规则2: 分隔符作为边界
      if (section.type === 'separator') {
        return i;
      }
      
      // 规则3: 新的问题模式作为边界
      if (section.type === 'content') {
        for (const pattern of this.options.questionPatterns) {
          if (new RegExp(pattern, 'i').test(section.content)) {
            return i;
          }
        }
      }
    }

    // 如果没有找到明确边界，使用文档结束
    return sections.length;
  }

  /**
   * 提取问题内容
   */
  private extractQuestionContent(questionSection: ContentSection): string {
    if (questionSection.type === 'heading') {
      return questionSection.content;
    }

    // 对于内容类型，尝试提取问题部分
    for (const pattern of this.options.questionPatterns) {
      const match = questionSection.content.match(new RegExp(pattern, 'i'));
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return questionSection.content;
  }

  /**
   * 提取答案内容（贪婪匹配，确保完整性）
   */
  private extractAnswerContent(
    sections: ContentSection[], 
    questionSection: ContentSection, 
    answerBoundary: number
  ): string {
    const questionIndex = sections.indexOf(questionSection);
    const answerSections = sections.slice(questionIndex + 1, answerBoundary);
    
    if (answerSections.length === 0) {
      return '';
    }

    // 贪婪匹配：包含所有内容直到边界
    const answerLines: string[] = [];
    
    for (const section of answerSections) {
      if (section.type === 'content') {
        answerLines.push(section.raw);
      } else if (section.type === 'heading' && this.options.preserveFormatting) {
        // 保留子标题格式
        answerLines.push(section.raw);
      }
    }

    return answerLines.join('\n');
  }

  /**
   * 计算解析置信度（增强版）
   */
  private calculateConfidence(
    question: string,
    answer: string,
    sections: ContentSection[]
  ): number {
    let confidence = 0.3; // 降低基础分数，更严格评估

    // 问题质量评分（权重增加）
    if (question.length > 5) confidence += 0.15;
    if (question.length > 15) confidence += 0.1; // 更长的问题通常更完整
    if (question.includes('?') || question.includes('？')) confidence += 0.15;
    if (question.match(/^(什么|如何|为什么|怎么|哪个|哪些|What|How|Why|Which|Where|When)/i)) confidence += 0.15;

    // 检查问题的完整性
    if (question.match(/[。！？.!?]$/)) confidence += 0.1; // 以标点结尾
    if (question.includes('：') || question.includes(':')) confidence += 0.05; // 包含冒号

    // 答案质量评分（更细致）
    if (answer.length > 10) confidence += 0.1;
    if (answer.length > 50) confidence += 0.1;
    if (answer.length > 200) confidence += 0.05; // 详细答案

    // 检查答案的结构性
    if (answer.includes('\n')) confidence += 0.05; // 多行答案
    if (answer.match(/[1-9]\./g)) confidence += 0.05; // 包含列表
    if (answer.includes('**') || answer.includes('*')) confidence += 0.03; // 包含格式化

    // 结构清晰度评分（增强）
    const hasHeadings = sections.some(s => s.type === 'heading');
    if (hasHeadings) confidence += 0.15;

    const hasSeparators = sections.some(s => s.type === 'separator');
    if (hasSeparators) confidence += 0.1;

    // 内容比例检查
    const totalLength = question.length + answer.length;
    if (totalLength > 0) {
      const questionRatio = question.length / totalLength;
      const answerRatio = answer.length / totalLength;

      // 理想的问答比例：问题占20-40%，答案占60-80%
      if (questionRatio >= 0.1 && questionRatio <= 0.5) confidence += 0.05;
      if (answerRatio >= 0.5 && answerRatio <= 0.9) confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(
    question: string, 
    answer: string, 
    sections: ContentSection[]
  ): string[] {
    const warnings: string[] = [];

    if (question.length < 5) {
      warnings.push('问题内容过短，可能识别不准确');
    }

    if (answer.length < 10) {
      warnings.push('答案内容过短，可能存在截断');
    }

    if (answer.length > 5000) {
      warnings.push('答案内容过长，建议检查边界识别是否正确');
    }

    const headingCount = sections.filter(s => s.type === 'heading').length;
    if (headingCount > 5) {
      warnings.push('内容包含多个标题，边界识别可能需要调整');
    }

    return warnings;
  }

  /**
   * 验证解析结果的完整性
   */
  validateCompleteness(originalContent: string, parsedResult: ParsedContent): {
    isComplete: boolean;
    missingCharacters: number;
    coverage: number;
  } {
    const reconstructed = `${parsedResult.question}\n\n${parsedResult.answer}`;
    const originalLength = originalContent.replace(/\s+/g, '').length;
    const reconstructedLength = reconstructed.replace(/\s+/g, '').length;
    
    const coverage = reconstructedLength / originalLength;
    const missingCharacters = Math.max(0, originalLength - reconstructedLength);
    
    return {
      isComplete: coverage > 0.9,
      missingCharacters,
      coverage
    };
  }
}

/**
 * 便捷函数：使用默认配置解析二级标题问答内容
 */
export function parseH2QuestionAnswer(content: string): ParsedContent {
  const detector = new IntelligentBoundaryDetector({
    questionPatterns: ['^## (.+)'],
    greedyMatching: true,
    preserveFormatting: true
  });
  
  return detector.parseContent(content);
}

/**
 * 便捷函数：验证解析结果并提供修复建议
 */
export function validateAndSuggestFix(
  originalContent: string, 
  parsedResult: ParsedContent
): {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const detector = new IntelligentBoundaryDetector();
  const completeness = detector.validateCompleteness(originalContent, parsedResult);
  
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  if (!completeness.isComplete) {
    issues.push(`内容完整性不足，覆盖率仅${(completeness.coverage * 100).toFixed(1)}%`);
    suggestions.push('建议检查边界识别算法的配置');
  }
  
  if (parsedResult.confidence < 0.7) {
    issues.push(`解析置信度较低 (${(parsedResult.confidence * 100).toFixed(1)}%)`);
    suggestions.push('建议手动检查问题和答案的识别是否正确');
  }
  
  if (parsedResult.warnings.length > 0) {
    issues.push(...parsedResult.warnings);
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  };
}
