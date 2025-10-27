/**
 * 格式标准化预处理器
 * 统一处理中英文标点符号、空格、换行等格式差异
 */

export interface PreprocessingOptions {
  normalizeHeadings: boolean;          // 标准化标题格式
  normalizePunctuation: boolean;       // 标准化标点符号
  normalizeWhitespace: boolean;        // 标准化空白字符
  normalizeLineBreaks: boolean;        // 标准化换行符
  removeExtraSpaces: boolean;          // 移除多余空格
  standardizeQuotes: boolean;          // 标准化引号
  preserveCodeBlocks: boolean;         // 保护代码块不被处理
  preserveLinks: boolean;              // 保护链接不被处理
}

export interface PreprocessingResult {
  processedContent: string;
  originalContent: string;
  appliedTransformations: string[];
  preservedBlocks: PreservedBlock[];
  statistics: PreprocessingStatistics;
}

export interface PreservedBlock {
  type: 'code' | 'link' | 'image' | 'math';
  originalContent: string;
  placeholder: string;
  startIndex: number;
  endIndex: number;
}

export interface PreprocessingStatistics {
  originalLength: number;
  processedLength: number;
  transformationCount: number;
  preservedBlockCount: number;
  changedCharacters: number;
}

/**
 * 格式标准化预处理器
 * 为解析提供标准化的输入内容
 */
export class FormatPreprocessor {
  private readonly defaultOptions: PreprocessingOptions = {
    normalizeHeadings: true,
    normalizePunctuation: true,
    normalizeWhitespace: true,
    normalizeLineBreaks: true,
    removeExtraSpaces: true,
    standardizeQuotes: true,
    preserveCodeBlocks: true,
    preserveLinks: true
  };

  private preservedBlocks: PreservedBlock[] = [];
  private placeholderCounter = 0;

  /**
   * 预处理Markdown内容，标准化格式
   */
  preprocess(content: string, options?: Partial<PreprocessingOptions>): PreprocessingResult {
    const opts = { ...this.defaultOptions, ...options };
    const originalContent = content;
    let processedContent = content;
    const appliedTransformations: string[] = [];
    
    // 重置状态
    this.preservedBlocks = [];
    this.placeholderCounter = 0;

    console.log(`🔧 [FormatPreprocessor] 开始预处理内容 (${content.length} 字符)`);

    // 1. 保护特殊块（代码块、链接等）
    if (opts.preserveCodeBlocks || opts.preserveLinks) {
      processedContent = this.preserveSpecialBlocks(processedContent, opts);
      if (this.preservedBlocks.length > 0) {
        appliedTransformations.push(`保护了${this.preservedBlocks.length}个特殊块`);
      }
    }

    // 2. 标准化标题格式
    if (opts.normalizeHeadings) {
      const result = this.normalizeHeadings(processedContent);
      processedContent = result.content;
      if (result.changed) {
        appliedTransformations.push('标准化标题格式');
      }
    }

    // 3. 标准化标点符号
    if (opts.normalizePunctuation) {
      const result = this.normalizePunctuation(processedContent);
      processedContent = result.content;
      if (result.changed) {
        appliedTransformations.push('标准化标点符号');
      }
    }

    // 4. 标准化引号
    if (opts.standardizeQuotes) {
      const result = this.standardizeQuotes(processedContent);
      processedContent = result.content;
      if (result.changed) {
        appliedTransformations.push('标准化引号');
      }
    }

    // 5. 标准化空白字符
    if (opts.normalizeWhitespace) {
      const result = this.normalizeWhitespace(processedContent);
      processedContent = result.content;
      if (result.changed) {
        appliedTransformations.push('标准化空白字符');
      }
    }

    // 6. 标准化换行符
    if (opts.normalizeLineBreaks) {
      const result = this.normalizeLineBreaks(processedContent);
      processedContent = result.content;
      if (result.changed) {
        appliedTransformations.push('标准化换行符');
      }
    }

    // 7. 移除多余空格
    if (opts.removeExtraSpaces) {
      const result = this.removeExtraSpaces(processedContent);
      processedContent = result.content;
      if (result.changed) {
        appliedTransformations.push('移除多余空格');
      }
    }

    // 8. 恢复保护的特殊块
    processedContent = this.restoreSpecialBlocks(processedContent);

    // 计算统计信息
    const statistics = this.calculateStatistics(originalContent, processedContent, appliedTransformations);

    console.log(`✅ [FormatPreprocessor] 预处理完成，应用了${appliedTransformations.length}个转换`);

    return {
      processedContent,
      originalContent,
      appliedTransformations,
      preservedBlocks: [...this.preservedBlocks],
      statistics
    };
  }

  /**
   * 保护特殊块（代码块、链接等）不被处理
   */
  private preserveSpecialBlocks(content: string, options: PreprocessingOptions): string {
    let processedContent = content;

    // 保护代码块
    if (options.preserveCodeBlocks) {
      // 保护围栏代码块 ```
      processedContent = this.preservePattern(
        processedContent,
        /```[\s\S]*?```/g,
        'code'
      );

      // 保护行内代码 `
      processedContent = this.preservePattern(
        processedContent,
        /`[^`\n]+`/g,
        'code'
      );
    }

    // 保护链接和图片
    if (options.preserveLinks) {
      // 保护图片 ![alt](url)
      processedContent = this.preservePattern(
        processedContent,
        /!\[.*?\]\([^)]+\)/g,
        'image'
      );

      // 保护链接 [text](url)
      processedContent = this.preservePattern(
        processedContent,
        /\[.*?\]\([^)]+\)/g,
        'link'
      );

      // 保护自动链接 <url>
      processedContent = this.preservePattern(
        processedContent,
        /<https?:\/\/[^>]+>/g,
        'link'
      );
    }

    // 保护数学公式
    processedContent = this.preservePattern(
      processedContent,
      /\$\$[\s\S]*?\$\$/g,
      'math'
    );

    processedContent = this.preservePattern(
      processedContent,
      /\$[^$\n]+\$/g,
      'math'
    );

    return processedContent;
  }

  /**
   * 保护匹配模式的内容
   */
  private preservePattern(content: string, pattern: RegExp, type: PreservedBlock['type']): string {
    return content.replace(pattern, (match, offset) => {
      const placeholder = `__PRESERVED_${type.toUpperCase()}_${this.placeholderCounter++}__`;
      
      this.preservedBlocks.push({
        type,
        originalContent: match,
        placeholder,
        startIndex: offset,
        endIndex: offset + match.length
      });

      return placeholder;
    });
  }

  /**
   * 恢复保护的特殊块
   */
  private restoreSpecialBlocks(content: string): string {
    let restoredContent = content;

    for (const block of this.preservedBlocks) {
      restoredContent = restoredContent.replace(block.placeholder, block.originalContent);
    }

    return restoredContent;
  }

  /**
   * 标准化标题格式
   */
  private normalizeHeadings(content: string): { content: string; changed: boolean } {
    let changed = false;
    
    // 标准化标题：确保#后有空格，移除多余空格
    const normalizedContent = content.replace(
      /^(#{1,6})\s*(.+?)\s*$/gm,
      (match, hashes, title) => {
        const normalized = `${hashes} ${title.trim()}`;
        if (normalized !== match) {
          changed = true;
        }
        return normalized;
      }
    );

    return { content: normalizedContent, changed };
  }

  /**
   * 标准化标点符号
   */
  private normalizePunctuation(content: string): { content: string; changed: boolean } {
    let processedContent = content;
    let changed = false;

    const punctuationMappings = [
      // 中英文冒号统一
      { pattern: /：/g, replacement: ':' },
      // 中英文分号统一  
      { pattern: /；/g, replacement: ';' },
      // 中英文逗号统一
      { pattern: /，/g, replacement: ',' },
      // 中英文句号统一
      { pattern: /。/g, replacement: '.' },
      // 中英文问号统一
      { pattern: /？/g, replacement: '?' },
      // 中英文感叹号统一
      { pattern: /！/g, replacement: '!' },
      // 中文括号转英文
      { pattern: /（/g, replacement: '(' },
      { pattern: /）/g, replacement: ')' },
      // 全角数字转半角
      { pattern: /[０-９]/g, replacement: (match) => String.fromCharCode(match.charCodeAt(0) - 0xFEE0) }
    ];

    for (const mapping of punctuationMappings) {
      const beforeReplace = processedContent;
      processedContent = processedContent.replace(mapping.pattern, mapping.replacement as string);
      if (processedContent !== beforeReplace) {
        changed = true;
      }
    }

    return { content: processedContent, changed };
  }

  /**
   * 标准化引号
   */
  private standardizeQuotes(content: string): { content: string; changed: boolean } {
    let processedContent = content;
    let changed = false;

    const quoteMappings = [
      // 中文引号转英文
      { pattern: /"/g, replacement: '"' },
      { pattern: /"/g, replacement: '"' },
      { pattern: /'/g, replacement: "'" },
      { pattern: /'/g, replacement: "'" },
      // 其他引号变体
      { pattern: /„/g, replacement: '"' },
      { pattern: /"/g, replacement: '"' },
      { pattern: /‚/g, replacement: "'" },
      { pattern: /'/g, replacement: "'" }
    ];

    for (const mapping of quoteMappings) {
      const beforeReplace = processedContent;
      processedContent = processedContent.replace(mapping.pattern, mapping.replacement);
      if (processedContent !== beforeReplace) {
        changed = true;
      }
    }

    return { content: processedContent, changed };
  }

  /**
   * 标准化空白字符
   */
  private normalizeWhitespace(content: string): { content: string; changed: boolean } {
    const originalContent = content;
    
    // 将各种空白字符统一为普通空格
    let processedContent = content
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ') // 各种空格字符
      .replace(/\t/g, '    '); // 制表符转4个空格

    return { content: processedContent, changed: processedContent !== originalContent };
  }

  /**
   * 标准化换行符
   */
  private normalizeLineBreaks(content: string): { content: string; changed: boolean } {
    const originalContent = content;
    
    // 统一换行符为 \n
    let processedContent = content
      .replace(/\r\n/g, '\n')  // Windows换行符
      .replace(/\r/g, '\n');   // Mac换行符

    // 限制连续空行不超过2个
    processedContent = processedContent.replace(/\n{4,}/g, '\n\n\n');

    return { content: processedContent, changed: processedContent !== originalContent };
  }

  /**
   * 移除多余空格
   */
  private removeExtraSpaces(content: string): { content: string; changed: boolean } {
    const originalContent = content;
    
    let processedContent = content
      // 移除行首行尾空格
      .replace(/^[ \t]+|[ \t]+$/gm, '')
      // 将多个连续空格合并为一个
      .replace(/[ \t]{2,}/g, ' ')
      // 移除空行中的空格
      .replace(/^\s+$/gm, '');

    return { content: processedContent, changed: processedContent !== originalContent };
  }

  /**
   * 计算预处理统计信息
   */
  private calculateStatistics(
    original: string,
    processed: string,
    transformations: string[]
  ): PreprocessingStatistics {
    const originalLength = original.length;
    const processedLength = processed.length;
    
    // 计算变更字符数
    let changedCharacters = 0;
    const minLength = Math.min(originalLength, processedLength);
    
    for (let i = 0; i < minLength; i++) {
      if (original[i] !== processed[i]) {
        changedCharacters++;
      }
    }
    
    // 加上长度差异
    changedCharacters += Math.abs(originalLength - processedLength);

    return {
      originalLength,
      processedLength,
      transformationCount: transformations.length,
      preservedBlockCount: this.preservedBlocks.length,
      changedCharacters
    };
  }

  /**
   * 快速预处理 - 只应用最基本的标准化
   */
  quickPreprocess(content: string): string {
    return this.preprocess(content, {
      normalizeHeadings: true,
      normalizePunctuation: true,
      normalizeWhitespace: false,
      normalizeLineBreaks: false,
      removeExtraSpaces: true,
      standardizeQuotes: false,
      preserveCodeBlocks: true,
      preserveLinks: true
    }).processedContent;
  }

  /**
   * 检查内容是否需要预处理
   */
  needsPreprocessing(content: string): {
    needsProcessing: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 检查标题格式
    if (/^#{1,6}[^\s]/.test(content)) {
      issues.push('标题缺少空格');
      recommendations.push('标准化标题格式');
    }

    // 检查中文标点
    if (/[：；，。？！（）]/.test(content)) {
      issues.push('包含中文标点符号');
      recommendations.push('标准化标点符号');
    }

    // 检查多余空格
    if (/  +/.test(content)) {
      issues.push('包含多余空格');
      recommendations.push('清理多余空格');
    }

    // 检查换行符
    if (/\r/.test(content)) {
      issues.push('包含非标准换行符');
      recommendations.push('标准化换行符');
    }

    return {
      needsProcessing: issues.length > 0,
      issues,
      recommendations
    };
  }
}
