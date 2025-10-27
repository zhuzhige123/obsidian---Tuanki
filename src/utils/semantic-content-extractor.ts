/**
 * 智能语义内容提取器
 * 基于语义分析识别问题和答案部分，即使格式不标准
 */

export interface SemanticPattern {
  type: 'question' | 'answer' | 'separator' | 'metadata';
  keywords: string[];
  patterns: RegExp[];
  weight: number;
  context?: string[];
}

export interface ContentSegment {
  type: 'question' | 'answer' | 'separator' | 'metadata' | 'unknown';
  content: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
  features: string[];
}

export interface SemanticExtractionResult {
  question: string;
  answer: string;
  metadata: Record<string, string>;
  segments: ContentSegment[];
  confidence: number;
  method: 'keyword' | 'pattern' | 'context' | 'hybrid';
  warnings: string[];
}

/**
 * 智能语义内容提取器
 * 使用多种语义分析技术识别内容结构
 */
export class SemanticContentExtractor {
  private questionPatterns: SemanticPattern[];
  private answerPatterns: SemanticPattern[];
  private separatorPatterns: SemanticPattern[];
  private metadataPatterns: SemanticPattern[];

  constructor() {
    this.initializePatterns();
  }

  /**
   * 提取内容的语义结构
   */
  extractContent(content: string): SemanticExtractionResult {
    console.log(`🧠 [SemanticExtractor] 开始语义分析 (${content.length} 字符)`);

    // 1. 分割内容为段落
    const segments = this.segmentContent(content);
    
    // 2. 分析每个段落的语义类型
    const analyzedSegments = this.analyzeSegments(segments);
    
    // 3. 识别问题部分
    const questionSegments = analyzedSegments.filter(s => s.type === 'question');
    const question = this.extractQuestion(questionSegments, content);
    
    // 4. 识别答案部分
    const answerSegments = analyzedSegments.filter(s => s.type === 'answer');
    const answer = this.extractAnswer(answerSegments, analyzedSegments, content);
    
    // 5. 提取元数据
    const metadataSegments = analyzedSegments.filter(s => s.type === 'metadata');
    const metadata = this.extractMetadata(metadataSegments);
    
    // 6. 计算整体置信度
    const confidence = this.calculateOverallConfidence(analyzedSegments, question, answer);
    
    // 7. 确定使用的方法
    const method = this.determineExtractionMethod(analyzedSegments);
    
    // 8. 生成警告
    const warnings = this.generateWarnings(analyzedSegments, question, answer);

    console.log(`✅ [SemanticExtractor] 语义分析完成，置信度: ${(confidence * 100).toFixed(1)}%`);

    return {
      question,
      answer,
      metadata,
      segments: analyzedSegments,
      confidence,
      method,
      warnings
    };
  }

  /**
   * 初始化语义模式
   */
  private initializePatterns(): void {
    // 问题识别模式
    this.questionPatterns = [
      {
        type: 'question',
        keywords: ['什么', '如何', '为什么', '怎么', '哪个', '哪些', '何时', '何地', 'what', 'how', 'why', 'when', 'where', 'who', 'which'],
        patterns: [
          /[？?]$/,
          /^(什么|如何|为什么|怎么|哪个|哪些|何时|何地)/i,
          /^(What|How|Why|When|Where|Who|Which)/i,
          /^(请|试|解释|说明|描述|分析|比较|列举)/i
        ],
        weight: 1.0,
        context: ['问题', 'question', 'Q', '题目']
      },
      {
        type: 'question',
        keywords: ['定义', '概念', '原理', '特点', '优缺点', 'definition', 'concept', 'principle'],
        patterns: [
          /(定义|概念|原理|特点|优缺点)/i,
          /(definition|concept|principle|feature)/i
        ],
        weight: 0.8
      }
    ];

    // 答案识别模式
    this.answerPatterns = [
      {
        type: 'answer',
        keywords: ['答案', '解答', '回答', '说明', 'answer', 'solution', 'explanation'],
        patterns: [
          /^(答案?[:：]|解答[:：]|回答[:：])/i,
          /^(Answer[:：]?|Solution[:：]?)/i
        ],
        weight: 1.0,
        context: ['答案', 'answer', 'A', '解答']
      },
      {
        type: 'answer',
        keywords: ['因为', '由于', '所以', '因此', 'because', 'since', 'therefore', 'thus'],
        patterns: [
          /^(因为|由于|所以|因此)/i,
          /^(Because|Since|Therefore|Thus)/i
        ],
        weight: 0.7
      }
    ];

    // 分隔符模式
    this.separatorPatterns = [
      {
        type: 'separator',
        keywords: [],
        patterns: [
          /^[-=]{3,}$/,
          /^[*]{3,}$/,
          /^\s*$/ // 空行
        ],
        weight: 0.5
      }
    ];

    // 元数据模式
    this.metadataPatterns = [
      {
        type: 'metadata',
        keywords: ['标签', '分类', '难度', '来源', 'tags', 'category', 'difficulty', 'source'],
        patterns: [
          /^(标签|分类|难度|来源)[:：]\s*(.+)/i,
          /^(Tags?|Category|Difficulty|Source)[:：]?\s*(.+)/i,
          /^#\s*(.+)/ // 标签格式
        ],
        weight: 0.6
      }
    ];
  }

  /**
   * 将内容分割为段落
   */
  private segmentContent(content: string): string[] {
    // 按段落分割，保留空行信息
    const lines = content.split('\n');
    const segments: string[] = [];
    let currentSegment = '';

    for (const line of lines) {
      if (line.trim() === '') {
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
          currentSegment = '';
        }
      } else {
        currentSegment += (currentSegment ? '\n' : '') + line;
      }
    }

    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }

    return segments;
  }

  /**
   * 分析段落的语义类型
   */
  private analyzeSegments(segments: string[]): ContentSegment[] {
    const analyzedSegments: ContentSegment[] = [];
    let currentIndex = 0;

    for (const segment of segments) {
      const analysis = this.analyzeSegment(segment, currentIndex);
      analyzedSegments.push(analysis);
      currentIndex += segment.length + 1; // +1 for newline
    }

    return analyzedSegments;
  }

  /**
   * 分析单个段落
   */
  private analyzeSegment(segment: string, startIndex: number): ContentSegment {
    const features: string[] = [];
    let maxConfidence = 0;
    let bestType: ContentSegment['type'] = 'unknown';

    // 检查问题模式
    const questionConfidence = this.matchPatterns(segment, this.questionPatterns, features);
    if (questionConfidence > maxConfidence) {
      maxConfidence = questionConfidence;
      bestType = 'question';
    }

    // 检查答案模式
    const answerConfidence = this.matchPatterns(segment, this.answerPatterns, features);
    if (answerConfidence > maxConfidence) {
      maxConfidence = answerConfidence;
      bestType = 'answer';
    }

    // 检查分隔符模式
    const separatorConfidence = this.matchPatterns(segment, this.separatorPatterns, features);
    if (separatorConfidence > maxConfidence) {
      maxConfidence = separatorConfidence;
      bestType = 'separator';
    }

    // 检查元数据模式
    const metadataConfidence = this.matchPatterns(segment, this.metadataPatterns, features);
    if (metadataConfidence > maxConfidence) {
      maxConfidence = metadataConfidence;
      bestType = 'metadata';
    }

    // 如果没有明确匹配，使用启发式规则
    if (maxConfidence < 0.3) {
      const heuristicResult = this.applyHeuristicRules(segment, features);
      if (heuristicResult.confidence > maxConfidence) {
        maxConfidence = heuristicResult.confidence;
        bestType = heuristicResult.type;
        features.push(...heuristicResult.features);
      }
    }

    return {
      type: bestType,
      content: segment,
      confidence: maxConfidence,
      startIndex,
      endIndex: startIndex + segment.length,
      features
    };
  }

  /**
   * 匹配语义模式
   */
  private matchPatterns(segment: string, patterns: SemanticPattern[], features: string[]): number {
    let maxConfidence = 0;

    for (const pattern of patterns) {
      let confidence = 0;

      // 检查关键词
      for (const keyword of pattern.keywords) {
        if (segment.toLowerCase().includes(keyword.toLowerCase())) {
          confidence += 0.3 * pattern.weight;
          features.push(`keyword:${keyword}`);
        }
      }

      // 检查正则模式
      for (const regex of pattern.patterns) {
        if (regex.test(segment)) {
          confidence += 0.7 * pattern.weight;
          features.push(`pattern:${regex.source}`);
        }
      }

      // 检查上下文关键词
      if (pattern.context) {
        for (const contextKeyword of pattern.context) {
          if (segment.toLowerCase().includes(contextKeyword.toLowerCase())) {
            confidence += 0.2 * pattern.weight;
            features.push(`context:${contextKeyword}`);
          }
        }
      }

      maxConfidence = Math.max(maxConfidence, confidence);
    }

    return Math.min(maxConfidence, 1.0);
  }

  /**
   * 应用启发式规则
   */
  private applyHeuristicRules(segment: string, features: string[]): {
    type: ContentSegment['type'];
    confidence: number;
    features: string[];
  } {
    const newFeatures: string[] = [];
    let confidence = 0;
    let type: ContentSegment['type'] = 'unknown';

    // 规则1: 短段落更可能是问题
    if (segment.length < 100) {
      confidence += 0.2;
      type = 'question';
      newFeatures.push('heuristic:short_segment');
    }

    // 规则2: 长段落更可能是答案
    if (segment.length > 200) {
      confidence += 0.3;
      type = 'answer';
      newFeatures.push('heuristic:long_segment');
    }

    // 规则3: 包含代码块的更可能是答案
    if (/```[\s\S]*?```/.test(segment) || /`[^`]+`/.test(segment)) {
      confidence += 0.4;
      type = 'answer';
      newFeatures.push('heuristic:contains_code');
    }

    // 规则4: 包含列表的更可能是答案
    if (/^[-*+]\s+/m.test(segment) || /^\d+\.\s+/m.test(segment)) {
      confidence += 0.3;
      type = 'answer';
      newFeatures.push('heuristic:contains_list');
    }

    // 规则5: 第一个段落更可能是问题
    if (features.includes('position:first')) {
      confidence += 0.2;
      type = 'question';
      newFeatures.push('heuristic:first_segment');
    }

    return { type, confidence, features: newFeatures };
  }

  /**
   * 提取问题内容
   */
  private extractQuestion(questionSegments: ContentSegment[], fullContent: string): string {
    if (questionSegments.length === 0) {
      // 如果没有明确的问题段落，尝试从第一行提取
      const firstLine = fullContent.split('\n')[0];
      if (firstLine && firstLine.length < 200) {
        return firstLine.trim();
      }
      return '';
    }

    // 选择置信度最高的问题段落
    const bestQuestion = questionSegments.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    return this.cleanQuestionText(bestQuestion.content);
  }

  /**
   * 提取答案内容
   */
  private extractAnswer(
    answerSegments: ContentSegment[], 
    allSegments: ContentSegment[], 
    fullContent: string
  ): string {
    if (answerSegments.length === 0) {
      // 如果没有明确的答案段落，使用非问题段落
      const nonQuestionSegments = allSegments.filter(s => 
        s.type !== 'question' && s.type !== 'separator' && s.type !== 'metadata'
      );
      
      if (nonQuestionSegments.length > 0) {
        return nonQuestionSegments.map(s => s.content).join('\n\n');
      }
      
      // 最后的后备方案：除第一行外的所有内容
      const lines = fullContent.split('\n');
      if (lines.length > 1) {
        return lines.slice(1).join('\n').trim();
      }
      
      return '';
    }

    // 合并所有答案段落
    return answerSegments.map(s => s.content).join('\n\n');
  }

  /**
   * 提取元数据
   */
  private extractMetadata(metadataSegments: ContentSegment[]): Record<string, string> {
    const metadata: Record<string, string> = {};

    for (const segment of metadataSegments) {
      // 尝试解析键值对
      const lines = segment.content.split('\n');
      for (const line of lines) {
        const match = line.match(/^([^:：]+)[:：]\s*(.+)$/);
        if (match) {
          const key = match[1].trim().toLowerCase();
          const value = match[2].trim();
          metadata[key] = value;
        }
      }
    }

    return metadata;
  }

  /**
   * 清理问题文本
   */
  private cleanQuestionText(text: string): string {
    return text
      .replace(/^(问题?[:：]|Question[:：]?)\s*/i, '') // 移除问题前缀
      .replace(/^(Q[:：]?)\s*/i, '') // 移除Q:前缀
      .trim();
  }

  /**
   * 计算整体置信度
   */
  private calculateOverallConfidence(
    segments: ContentSegment[], 
    question: string, 
    answer: string
  ): number {
    let confidence = 0;

    // 基于段落分析的置信度
    const avgSegmentConfidence = segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length;
    confidence += avgSegmentConfidence * 0.4;

    // 基于问题质量的置信度
    if (question.length > 5) {
      confidence += 0.2;
      if (this.looksLikeQuestion(question)) {
        confidence += 0.2;
      }
    }

    // 基于答案质量的置信度
    if (answer.length > 10) {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 确定提取方法
   */
  private determineExtractionMethod(segments: ContentSegment[]): SemanticExtractionResult['method'] {
    const hasKeywordMatches = segments.some(s => s.features.some(f => f.startsWith('keyword:')));
    const hasPatternMatches = segments.some(s => s.features.some(f => f.startsWith('pattern:')));
    const hasContextMatches = segments.some(s => s.features.some(f => f.startsWith('context:')));
    const hasHeuristicMatches = segments.some(s => s.features.some(f => f.startsWith('heuristic:')));

    if (hasKeywordMatches && hasPatternMatches) {
      return 'hybrid';
    } else if (hasPatternMatches) {
      return 'pattern';
    } else if (hasKeywordMatches) {
      return 'keyword';
    } else if (hasContextMatches || hasHeuristicMatches) {
      return 'context';
    } else {
      return 'hybrid';
    }
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(
    segments: ContentSegment[], 
    question: string, 
    answer: string
  ): string[] {
    const warnings: string[] = [];

    if (!question) {
      warnings.push('未能识别问题部分');
    } else if (question.length < 5) {
      warnings.push('问题内容过短，可能识别不准确');
    }

    if (!answer) {
      warnings.push('未能识别答案部分');
    } else if (answer.length < 10) {
      warnings.push('答案内容过短，可能识别不完整');
    }

    const unknownSegments = segments.filter(s => s.type === 'unknown');
    if (unknownSegments.length > 0) {
      warnings.push(`有${unknownSegments.length}个段落无法分类`);
    }

    const lowConfidenceSegments = segments.filter(s => s.confidence < 0.3);
    if (lowConfidenceSegments.length > segments.length / 2) {
      warnings.push('大部分内容的语义识别置信度较低');
    }

    return warnings;
  }

  /**
   * 检查文本是否像问题
   */
  private looksLikeQuestion(text: string): boolean {
    const questionIndicators = [
      /[？?]$/, // 以问号结尾
      /^(什么|如何|为什么|怎么|哪个|哪些|何时|何地|Who|What|When|Where|Why|How)/i, // 疑问词开头
      /^(请|试|解释|说明|描述|分析|比较|列举)/i, // 指令性开头
      /(是什么|怎么样|如何|为什么)/i // 包含疑问短语
    ];
    
    return questionIndicators.some(pattern => pattern.test(text.trim()));
  }

  /**
   * 快速语义提取 - 增强版本
   */
  quickExtract(content: string): { question: string; answer: string; confidence: number } {
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return { question: '', answer: '', confidence: 0 };
    }

    if (lines.length === 1) {
      return { question: lines[0], answer: '', confidence: 0.3 };
    }

    // 增强的启发式算法
    let bestQuestion = '';
    let bestAnswer = '';
    let bestConfidence = 0;

    // 策略1: 查找明显的问题标记
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.looksLikeQuestion(line)) {
        const question = line;
        const answer = lines.slice(i + 1).join('\n');
        const confidence = this.calculateQuickConfidence(question, answer);

        if (confidence > bestConfidence) {
          bestQuestion = question;
          bestAnswer = answer;
          bestConfidence = confidence;
        }
      }
    }

    // 策略2: 如果没有找到明显问题，使用第一行
    if (bestConfidence < 0.4) {
      bestQuestion = lines[0];
      bestAnswer = lines.slice(1).join('\n');
      bestConfidence = this.calculateQuickConfidence(bestQuestion, bestAnswer);
    }

    // 策略3: 检查是否有分隔符
    const separatorIndex = lines.findIndex(line =>
      line.includes('---') || line.includes('===') || line.includes('***')
    );

    if (separatorIndex > 0 && separatorIndex < lines.length - 1) {
      const question = lines.slice(0, separatorIndex).join('\n');
      const answer = lines.slice(separatorIndex + 1).join('\n');
      const confidence = this.calculateQuickConfidence(question, answer);

      if (confidence > bestConfidence) {
        bestQuestion = question;
        bestAnswer = answer;
        bestConfidence = confidence;
      }
    }

    return {
      question: bestQuestion.trim(),
      answer: bestAnswer.trim(),
      confidence: Math.min(bestConfidence, 1.0)
    };
  }

  /**
   * 计算快速提取的置信度
   */
  private calculateQuickConfidence(question: string, answer: string): number {
    let confidence = 0.3;

    // 问题质量检查
    if (this.looksLikeQuestion(question)) confidence += 0.3;
    if (question.length > 10) confidence += 0.1;
    if (question.length > 30) confidence += 0.1;

    // 答案质量检查
    if (answer.length > 20) confidence += 0.1;
    if (answer.length > 100) confidence += 0.1;
    if (answer.includes('\n')) confidence += 0.05; // 多行答案

    // 内容比例检查
    const totalLength = question.length + answer.length;
    if (totalLength > 0) {
      const questionRatio = question.length / totalLength;
      if (questionRatio >= 0.1 && questionRatio <= 0.5) confidence += 0.05;
    }

    return confidence;
  }
}
