/**
 * 用户友好的错误处理器
 * 将技术性错误信息转换为用户友好的说明和具体的修复建议
 */

export interface UserFriendlyError {
  id: string;
  type: 'parsing' | 'template' | 'content' | 'system' | 'validation';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  description: string;
  causes: string[];
  solutions: ErrorSolution[];
  examples?: ErrorExample[];
  relatedDocs?: string[];
  timestamp: number;
}

export interface ErrorSolution {
  id: string;
  title: string;
  description: string;
  steps: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  autoFixable: boolean;
  priority: number;
}

export interface ErrorExample {
  title: string;
  before: string;
  after: string;
  explanation: string;
}

export interface ErrorContext {
  content?: string;
  template?: any;
  operation?: string;
  userLevel?: 'beginner' | 'intermediate' | 'advanced';
  previousErrors?: string[];
}

/**
 * 用户友好的错误处理器
 * 提供清晰、可操作的错误信息和解决方案
 */
export class UserFriendlyErrorHandler {
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  private errorHistory: UserFriendlyError[] = [];

  constructor() {
    this.initializeErrorPatterns();
  }

  /**
   * 处理错误并生成用户友好的错误信息
   */
  handleError(
    error: Error | string,
    context: ErrorContext = {}
  ): UserFriendlyError {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.log(`🚨 [UserFriendlyError] 处理错误: ${errorMessage}`);

    // 识别错误类型和模式
    const pattern = this.identifyErrorPattern(errorMessage, errorStack, context);
    
    // 生成用户友好的错误信息
    const friendlyError = this.generateFriendlyError(
      errorMessage,
      pattern,
      context
    );

    // 保存错误历史
    this.errorHistory.push(friendlyError);
    this.cleanupErrorHistory();

    console.log(`✅ [UserFriendlyError] 生成友好错误: ${friendlyError.title}`);

    return friendlyError;
  }

  /**
   * 获取常见问题的快速解决方案
   */
  getQuickSolutions(errorType: string): ErrorSolution[] {
    const pattern = this.errorPatterns.get(errorType);
    if (!pattern) return [];

    return pattern.solutions.filter(s => s.autoFixable || s.difficulty === 'easy');
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(): UserFriendlyError[] {
    return [...this.errorHistory];
  }

  /**
   * 清除错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  // 私有方法

  private initializeErrorPatterns(): void {
    // 解析错误模式
    this.errorPatterns.set('regex_syntax_error', {
      type: 'template',
      keywords: ['invalid regular expression', 'regex', 'syntax error'],
      title: '正则表达式语法错误',
      message: '模板中的正则表达式存在语法错误',
      description: '正则表达式是用来匹配文本模式的特殊语法。当语法不正确时，系统无法理解如何匹配您的内容。',
      causes: [
        '括号不匹配，如缺少闭合括号',
        '特殊字符未正确转义',
        '量词使用错误',
        '字符类定义错误'
      ],
      solutions: [
        {
          id: 'check_brackets',
          title: '检查括号匹配',
          description: '确保所有的圆括号、方括号都有对应的闭合括号',
          steps: [
            '检查正则表达式中的每个 ( 都有对应的 )',
            '检查每个 [ 都有对应的 ]',
            '检查每个 { 都有对应的 }'
          ],
          difficulty: 'easy',
          estimatedTime: '2-3分钟',
          autoFixable: false,
          priority: 1
        },
        {
          id: 'escape_special_chars',
          title: '转义特殊字符',
          description: '在正则表达式中，某些字符有特殊含义，需要用反斜杠转义',
          steps: [
            '在 . * + ? ^ $ { } [ ] \\ | ( ) 前加反斜杠',
            '例如：匹配点号应该写成 \\. 而不是 .',
            '例如：匹配问号应该写成 \\? 而不是 ?'
          ],
          difficulty: 'medium',
          estimatedTime: '5分钟',
          autoFixable: true,
          priority: 2
        }
      ],
      examples: [
        {
          title: '括号不匹配',
          before: '^## (.+\\n([\\s\\S]*?$',
          after: '^## (.+)\\n([\\s\\S]*?)$',
          explanation: '添加了缺失的闭合括号'
        },
        {
          title: '特殊字符转义',
          before: '## (.+?)\\n(.+)',
          after: '## (.+?)\\n(.+)',
          explanation: '问号在这里是量词，不需要转义'
        }
      ]
    });

    this.errorPatterns.set('content_not_match', {
      type: 'content',
      keywords: ['no match', 'not match', 'failed to parse'],
      title: '内容格式不匹配',
      message: '您的内容格式与选择的模板不匹配',
      description: '模板定义了特定的内容格式，但您的内容不符合这个格式要求。',
      causes: [
        '内容缺少必需的标题标记（如 ## ）',
        '标题和内容之间的空行不正确',
        '使用了不同级别的标题',
        '标点符号不匹配'
      ],
      solutions: [
        {
          id: 'add_heading',
          title: '添加标题标记',
          description: '在问题前添加二级标题标记',
          steps: [
            '在问题文本前添加 "## "',
            '确保 ## 后面有一个空格',
            '确保标题后有换行符'
          ],
          difficulty: 'easy',
          estimatedTime: '1分钟',
          autoFixable: true,
          priority: 1
        },
        {
          id: 'fix_spacing',
          title: '调整空行格式',
          description: '确保标题和内容之间有正确的空行',
          steps: [
            '在标题和答案内容之间添加一个空行',
            '移除多余的空行',
            '确保每个段落之间只有一个空行'
          ],
          difficulty: 'easy',
          estimatedTime: '2分钟',
          autoFixable: true,
          priority: 2
        }
      ],
      examples: [
        {
          title: '添加标题标记',
          before: '什么是JavaScript？\nJavaScript是一种编程语言...',
          after: '## 什么是JavaScript？\nJavaScript是一种编程语言...',
          explanation: '在问题前添加了二级标题标记'
        }
      ]
    });

    this.errorPatterns.set('empty_fields', {
      type: 'validation',
      keywords: ['empty field', 'missing content', 'no content'],
      title: '字段内容为空',
      message: '解析后的某些字段没有内容',
      description: '虽然解析成功了，但是一些重要的字段（如问题或答案）没有提取到内容。',
      causes: [
        '内容格式不够清晰',
        '问题和答案没有明确分离',
        '使用了模板不支持的格式',
        '内容太短或结构不完整'
      ],
      solutions: [
        {
          id: 'restructure_content',
          title: '重新组织内容结构',
          description: '将内容重新组织为清晰的问答格式',
          steps: [
            '将问题部分放在标题中',
            '将答案部分放在标题下方',
            '确保问题和答案内容都足够详细',
            '使用空行分隔不同部分'
          ],
          difficulty: 'medium',
          estimatedTime: '3-5分钟',
          autoFixable: false,
          priority: 1
        },
        {
          id: 'add_more_content',
          title: '补充内容详情',
          description: '为空的字段添加更多内容',
          steps: [
            '检查哪些字段为空',
            '为问题字段添加清晰的问题描述',
            '为答案字段添加详细的回答',
            '确保每个字段都有实质性内容'
          ],
          difficulty: 'easy',
          estimatedTime: '5-10分钟',
          autoFixable: false,
          priority: 2
        }
      ]
    });

    this.errorPatterns.set('low_confidence', {
      type: 'parsing',
      keywords: ['low confidence', 'uncertain', 'may not be accurate'],
      title: '解析置信度较低',
      message: '系统对解析结果的准确性不够确信',
      description: '虽然系统尝试解析了您的内容，但对结果的准确性不够确信。建议您检查解析结果。',
      causes: [
        '内容格式不够标准',
        '存在多种可能的解析方式',
        '内容结构比较复杂',
        '使用了不常见的格式'
      ],
      solutions: [
        {
          id: 'review_result',
          title: '检查解析结果',
          description: '仔细检查每个字段的内容是否正确',
          steps: [
            '查看问题字段是否包含完整的问题',
            '查看答案字段是否包含完整的答案',
            '检查是否有内容被分配到错误的字段',
            '如有问题，手动调整字段内容'
          ],
          difficulty: 'easy',
          estimatedTime: '2-3分钟',
          autoFixable: false,
          priority: 1
        },
        {
          id: 'standardize_format',
          title: '标准化内容格式',
          description: '将内容调整为更标准的格式',
          steps: [
            '使用标准的Markdown标题格式',
            '确保问题和答案结构清晰',
            '移除不必要的格式复杂性',
            '使用一致的标点符号'
          ],
          difficulty: 'medium',
          estimatedTime: '5分钟',
          autoFixable: true,
          priority: 2
        }
      ]
    });

    this.errorPatterns.set('system_error', {
      type: 'system',
      keywords: ['system error', 'internal error', 'unexpected error'],
      title: '系统内部错误',
      message: '系统遇到了意外的内部错误',
      description: '这是一个系统级别的错误，通常不是由您的内容或操作直接引起的。',
      causes: [
        '系统资源不足',
        '内部组件故障',
        '数据处理异常',
        '网络连接问题'
      ],
      solutions: [
        {
          id: 'retry_operation',
          title: '重试操作',
          description: '稍等片刻后重新尝试',
          steps: [
            '等待几秒钟',
            '点击重试按钮',
            '如果仍然失败，尝试刷新页面'
          ],
          difficulty: 'easy',
          estimatedTime: '1分钟',
          autoFixable: true,
          priority: 1
        },
        {
          id: 'simplify_content',
          title: '简化内容',
          description: '尝试使用更简单的内容格式',
          steps: [
            '移除复杂的格式',
            '减少内容长度',
            '使用基本的Markdown语法',
            '分批处理大量内容'
          ],
          difficulty: 'medium',
          estimatedTime: '3-5分钟',
          autoFixable: false,
          priority: 2
        }
      ]
    });

    console.log(`📚 [UserFriendlyError] 初始化了${this.errorPatterns.size}个错误模式`);
  }

  private identifyErrorPattern(
    errorMessage: string,
    errorStack: string | undefined,
    context: ErrorContext
  ): ErrorPattern | null {
    const lowerMessage = errorMessage.toLowerCase();
    
    for (const [patternId, pattern] of this.errorPatterns) {
      const matchesKeyword = pattern.keywords.some(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );
      
      if (matchesKeyword) {
        console.log(`🎯 [UserFriendlyError] 识别错误模式: ${patternId}`);
        return pattern;
      }
    }

    // 如果没有匹配的模式，返回通用模式
    return this.createGenericPattern(errorMessage, context);
  }

  private createGenericPattern(errorMessage: string, context: ErrorContext): ErrorPattern {
    return {
      type: 'system',
      keywords: [],
      title: '未知错误',
      message: '遇到了一个未知的错误',
      description: '系统遇到了一个未预期的错误。这可能是由多种原因引起的。',
      causes: [
        '输入内容格式异常',
        '系统配置问题',
        '临时的系统故障',
        '不支持的操作'
      ],
      solutions: [
        {
          id: 'generic_retry',
          title: '重试操作',
          description: '尝试重新执行操作',
          steps: [
            '检查输入内容是否正确',
            '稍等片刻后重试',
            '如果问题持续，尝试简化操作'
          ],
          difficulty: 'easy',
          estimatedTime: '2分钟',
          autoFixable: false,
          priority: 1
        },
        {
          id: 'check_content',
          title: '检查内容格式',
          description: '验证输入内容的格式是否正确',
          steps: [
            '确保内容使用标准的Markdown格式',
            '检查是否有特殊字符或格式',
            '尝试使用更简单的内容进行测试'
          ],
          difficulty: 'medium',
          estimatedTime: '5分钟',
          autoFixable: false,
          priority: 2
        }
      ],
      examples: []
    };
  }

  private generateFriendlyError(
    originalError: string,
    pattern: ErrorPattern,
    context: ErrorContext
  ): UserFriendlyError {
    const errorId = this.generateErrorId();
    
    // 根据用户级别调整解决方案
    const solutions = this.adaptSolutionsToUserLevel(pattern.solutions, context.userLevel);
    
    // 添加上下文相关的信息
    const contextualCauses = this.addContextualCauses(pattern.causes, context);
    
    return {
      id: errorId,
      type: pattern.type,
      severity: this.determineSeverity(pattern.type, originalError),
      title: pattern.title,
      message: pattern.message,
      description: pattern.description,
      causes: contextualCauses,
      solutions,
      examples: pattern.examples,
      relatedDocs: this.getRelatedDocs(pattern.type),
      timestamp: Date.now()
    };
  }

  private adaptSolutionsToUserLevel(
    solutions: ErrorSolution[],
    userLevel: ErrorContext['userLevel'] = 'intermediate'
  ): ErrorSolution[] {
    return solutions.map(solution => {
      if (userLevel === 'beginner') {
        // 为初学者提供更详细的步骤
        return {
          ...solution,
          steps: solution.steps.map(step => `${step}（如需帮助，请查看相关文档）`)
        };
      } else if (userLevel === 'advanced') {
        // 为高级用户提供更简洁的步骤
        return {
          ...solution,
          steps: solution.steps.filter((_, index) => index === 0 || solution.difficulty !== 'easy')
        };
      }
      return solution;
    });
  }

  private addContextualCauses(causes: string[], context: ErrorContext): string[] {
    const contextualCauses = [...causes];
    
    if (context.content) {
      if (context.content.length > 5000) {
        contextualCauses.push('内容过长，可能导致处理超时');
      }
      if (!/^#{1,6}\s+/.test(context.content)) {
        contextualCauses.push('内容缺少标题结构');
      }
    }
    
    if (context.previousErrors && context.previousErrors.length > 0) {
      contextualCauses.push('可能与之前的错误相关');
    }
    
    return contextualCauses;
  }

  private determineSeverity(type: string, errorMessage: string): UserFriendlyError['severity'] {
    if (type === 'system' || errorMessage.includes('critical')) {
      return 'critical';
    } else if (type === 'template' || errorMessage.includes('error')) {
      return 'error';
    } else if (errorMessage.includes('warning') || errorMessage.includes('low confidence')) {
      return 'warning';
    } else {
      return 'info';
    }
  }

  private getRelatedDocs(type: string): string[] {
    const docs: Record<string, string[]> = {
      template: ['正则表达式语法指南', '模板配置文档'],
      content: ['Markdown格式指南', '内容结构最佳实践'],
      parsing: ['解析算法说明', '故障排除指南'],
      validation: ['数据验证规则', '字段要求说明'],
      system: ['系统故障排除', '性能优化建议']
    };
    
    return docs[type] || ['用户手册', '常见问题解答'];
  }

  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupErrorHistory(): void {
    const maxHistory = 50;
    if (this.errorHistory.length > maxHistory) {
      this.errorHistory = this.errorHistory.slice(-maxHistory);
    }
  }
}

interface ErrorPattern {
  type: UserFriendlyError['type'];
  keywords: string[];
  title: string;
  message: string;
  description: string;
  causes: string[];
  solutions: ErrorSolution[];
  examples: ErrorExample[];
}
