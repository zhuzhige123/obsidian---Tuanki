/**
 * 多语言解析支持模块
 * 为SimplifiedCardParser提供多语言内容识别和解析能力
 */

export interface LanguagePatterns {
  questionMarkers: string[];
  answerMarkers: string[];
  separators: string[];
  questionWords: string[];
  punctuation: string[];
}

export interface MultilingualConfig {
  primaryLanguage: 'zh' | 'en' | 'auto';
  enableAutoDetection: boolean;
  supportedLanguages: string[];
  fallbackToEnglish: boolean;
}

/**
 * 多语言模式识别器
 */
export class MultilingualPatternRecognizer {
  private patterns: Map<string, LanguagePatterns> = new Map();
  private config: MultilingualConfig;

  constructor(config: Partial<MultilingualConfig> = {}) {
    this.config = {
      primaryLanguage: 'auto',
      enableAutoDetection: true,
      supportedLanguages: ['zh', 'en', 'ja', 'ko'],
      fallbackToEnglish: true,
      ...config
    };

    this.initializePatterns();
  }

  /**
   * 初始化语言模式
   */
  private initializePatterns(): void {
    // 中文模式
    this.patterns.set('zh', {
      questionMarkers: [
        '问题[:：]', '题目[:：]', 'Q[:：]', '问[:：]',
        '什么', '如何', '为什么', '怎么', '哪个', '哪些',
        '是否', '能否', '可以', '应该'
      ],
      answerMarkers: [
        '答案[:：]', '解答[:：]', 'A[:：]', '答[:：]',
        '回答[:：]', '解释[:：]', '说明[:：]'
      ],
      separators: [
        '---', '===', '***', '———', '——',
        '答案', '解答', '回答'
      ],
      questionWords: [
        '什么', '如何', '为什么', '怎么', '哪个', '哪些',
        '谁', '何时', '何地', '多少', '几个'
      ],
      punctuation: ['？', '。', '！', '：', '；', '，']
    });

    // 英文模式
    this.patterns.set('en', {
      questionMarkers: [
        'Question:', 'Q:', 'Ask:', 'Problem:',
        'What', 'How', 'Why', 'When', 'Where', 'Who', 'Which'
      ],
      answerMarkers: [
        'Answer:', 'A:', 'Solution:', 'Response:',
        'Reply:', 'Explanation:'
      ],
      separators: [
        '---', '===', '***', 'Answer', 'Solution'
      ],
      questionWords: [
        'what', 'how', 'why', 'when', 'where', 'who',
        'which', 'whose', 'whom', 'can', 'could', 'should',
        'would', 'will', 'do', 'does', 'did', 'is', 'are'
      ],
      punctuation: ['?', '.', '!', ':', ';', ',']
    });

    // 日文模式
    this.patterns.set('ja', {
      questionMarkers: [
        '質問:', '問題:', 'Q:', '問:',
        '何', 'どう', 'なぜ', 'いつ', 'どこ', '誰'
      ],
      answerMarkers: [
        '答え:', '回答:', 'A:', '解答:',
        '説明:', '解釈:'
      ],
      separators: [
        '---', '===', '***', '答え', '回答'
      ],
      questionWords: [
        '何', 'どう', 'なぜ', 'いつ', 'どこ', '誰',
        'どの', 'どれ', 'いくつ'
      ],
      punctuation: ['？', '。', '！', '：', '；', '、']
    });

    // 韩文模式
    this.patterns.set('ko', {
      questionMarkers: [
        '질문:', '문제:', 'Q:', '물음:',
        '무엇', '어떻게', '왜', '언제', '어디', '누구'
      ],
      answerMarkers: [
        '답:', '답변:', 'A:', '해답:',
        '설명:', '해석:'
      ],
      separators: [
        '---', '===', '***', '답', '답변'
      ],
      questionWords: [
        '무엇', '어떻게', '왜', '언제', '어디', '누구',
        '어느', '몇', '얼마'
      ],
      punctuation: ['?', '.', '!', ':', ';', ',']
    });
  }

  /**
   * 检测内容的主要语言
   */
  detectLanguage(content: string): string {
    if (!this.config.enableAutoDetection) {
      return this.config.primaryLanguage === 'auto' ? 'en' : this.config.primaryLanguage;
    }

    const scores = new Map<string, number>();
    
    for (const [lang, patterns] of this.patterns) {
      let score = 0;
      
      // 检查问题标记
      for (const marker of patterns.questionMarkers) {
        const regex = new RegExp(marker, 'gi');
        const matches = content.match(regex);
        if (matches) score += matches.length * 2;
      }
      
      // 检查问题词汇
      for (const word of patterns.questionWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = content.match(regex);
        if (matches) score += matches.length;
      }
      
      // 检查标点符号
      for (const punct of patterns.punctuation) {
        const count = (content.match(new RegExp(`\\${punct}`, 'g')) || []).length;
        score += count * 0.5;
      }
      
      scores.set(lang, score);
    }

    // 返回得分最高的语言
    let maxScore = 0;
    let detectedLang = 'en';
    
    for (const [lang, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    return detectedLang;
  }

  /**
   * 获取指定语言的模式
   */
  getPatterns(language?: string): LanguagePatterns {
    const lang = language || this.detectLanguage('');
    return this.patterns.get(lang) || this.patterns.get('en')!;
  }

  /**
   * 检查文本是否像问题
   */
  looksLikeQuestion(text: string, language?: string): boolean {
    const patterns = this.getPatterns(language);
    
    // 检查问题标记
    for (const marker of patterns.questionMarkers) {
      if (new RegExp(marker, 'i').test(text)) {
        return true;
      }
    }
    
    // 检查问题词汇
    for (const word of patterns.questionWords) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
        return true;
      }
    }
    
    // 检查问号
    return text.includes('?') || text.includes('？');
  }

  /**
   * 查找分隔符
   */
  findSeparators(content: string, language?: string): Array<{index: number, separator: string}> {
    const patterns = this.getPatterns(language);
    const separators: Array<{index: number, separator: string}> = [];
    
    for (const sep of patterns.separators) {
      const regex = new RegExp(sep, 'gi');
      let match;
      while ((match = regex.exec(content)) !== null) {
        separators.push({
          index: match.index,
          separator: match[0]
        });
      }
    }
    
    return separators.sort((a, b) => a.index - b.index);
  }

  /**
   * 智能分割问答内容
   */
  smartSplit(content: string): {question: string, answer: string, confidence: number, language: string} {
    const language = this.detectLanguage(content);
    const patterns = this.getPatterns(language);
    
    // 查找分隔符
    const separators = this.findSeparators(content, language);
    
    if (separators.length > 0) {
      const firstSep = separators[0];
      const question = content.substring(0, firstSep.index).trim();
      const answer = content.substring(firstSep.index + firstSep.separator.length).trim();
      
      return {
        question,
        answer,
        confidence: 0.8,
        language
      };
    }
    
    // 按行分割并查找问题行
    const lines = content.split('\n').filter(line => line.trim());
    
    for (let i = 0; i < lines.length; i++) {
      if (this.looksLikeQuestion(lines[i], language)) {
        const question = lines.slice(0, i + 1).join('\n');
        const answer = lines.slice(i + 1).join('\n');
        
        return {
          question,
          answer,
          confidence: 0.6,
          language
        };
      }
    }
    
    // 默认分割：第一行为问题
    if (lines.length >= 2) {
      return {
        question: lines[0],
        answer: lines.slice(1).join('\n'),
        confidence: 0.4,
        language
      };
    }
    
    return {
      question: content,
      answer: '',
      confidence: 0.2,
      language
    };
  }
}

/**
 * 便捷函数：创建默认的多语言识别器
 */
export function createMultilingualRecognizer(config?: Partial<MultilingualConfig>): MultilingualPatternRecognizer {
  return new MultilingualPatternRecognizer(config);
}
