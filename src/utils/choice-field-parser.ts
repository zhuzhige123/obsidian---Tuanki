/**
 * 选择题字段解析器
 * 专门处理！选项字段的行级拆分和正确答案解析
 */

export interface ChoiceOption {
  id: string;
  label: string;
  content: string;
  isCorrect: boolean;
}

export interface ChoiceParseResult {
  success: boolean;
  options: ChoiceOption[];
  correctAnswers: string[];
  error?: string;
  warnings?: string[];
}

export interface CorrectAnswerParseResult {
  success: boolean;
  correctIds: string[];
  isMultiple: boolean;
  error?: string;
}

export class ChoiceFieldParser {
  // 支持的选项标记格式
  private static readonly OPTION_PATTERNS = [
    /^([A-Z])\s*[\.\．\、]\s*(.+)$/,  // A. 内容 或 A． 内容 或 A、 内容
    /^([A-Z])\s*[\)\）]\s*(.+)$/,    // A) 内容 或 A） 内容
    /^([A-Z])\s*[:：]\s*(.+)$/,      // A: 内容 或 A： 内容
    /^([A-Z])\s+(.+)$/,              // A 内容（空格分隔）
    /^([0-9]+)\s*[\.\．\、]\s*(.+)$/, // 1. 内容 或 1． 内容 或 1、 内容
    /^([0-9]+)\s*[\)\）]\s*(.+)$/,   // 1) 内容 或 1） 内容
  ];

  // 正确答案格式
  private static readonly ANSWER_PATTERNS = [
    /^([A-Z])$/,                     // 单个字母：A
    /^([A-Z])\s*[\.\．\、]?$/,       // 字母+标点：A. 或 A． 或 A、
    /^([A-Z])\s*[\)\）]?$/,          // 字母+括号：A) 或 A）
    /^([A-Z])\s*[:：]?$/,            // 字母+冒号：A: 或 A：
    /^([0-9]+)$/,                    // 数字：1
    /^([0-9]+)\s*[\.\．\、]?$/,      // 数字+标点：1. 或 1． 或 1、
  ];

  /**
   * 解析选项字段内容
   * @param optionsContent 选项字段的原始内容
   * @returns 解析结果
   */
  static parseOptions(optionsContent: string): ChoiceParseResult {
    if (!optionsContent || !optionsContent.trim()) {
      return {
        success: false,
        options: [],
        correctAnswers: [],
        error: '选项内容为空'
      };
    }

    const lines = optionsContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return {
        success: false,
        options: [],
        correctAnswers: [],
        error: '没有找到有效的选项行'
      };
    }

    const options: ChoiceOption[] = [];
    const warnings: string[] = [];
    let hasValidOptions = false;

    for (const line of lines) {
      const parseResult = this.parseOptionLine(line);
      
      if (parseResult.success && parseResult.option) {
        options.push(parseResult.option);
        hasValidOptions = true;
      } else if (parseResult.warning) {
        warnings.push(parseResult.warning);
      }
    }

    if (!hasValidOptions) {
      return {
        success: false,
        options: [],
        correctAnswers: [],
        error: '没有找到符合格式的选项',
        warnings
      };
    }

    // 验证选项标签的连续性
    const validationResult = this.validateOptionSequence(options);
    if (!validationResult.isValid) {
      warnings.push(...validationResult.warnings);
    }

    return {
      success: true,
      options,
      correctAnswers: options.map(opt => opt.id),
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * 解析单行选项
   */
  private static parseOptionLine(line: string): {
    success: boolean;
    option?: ChoiceOption;
    warning?: string;
  } {
    for (const pattern of this.OPTION_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const [, label, content] = match;
        
        if (!content || !content.trim()) {
          return {
            success: false,
            warning: `选项 ${label} 的内容为空`
          };
        }

        return {
          success: true,
          option: {
            id: label.toUpperCase(),
            label: label.toUpperCase(),
            content: content.trim(),
            isCorrect: false // 默认不正确，需要后续设置
          }
        };
      }
    }

    return {
      success: false,
      warning: `无法解析选项行: "${line}"`
    };
  }

  /**
   * 验证选项序列的连续性
   */
  private static validateOptionSequence(options: ChoiceOption[]): {
    isValid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    
    if (options.length === 0) {
      return { isValid: false, warnings: ['没有选项'] };
    }

    // 检查是否为字母序列
    const isLetterSequence = options.every(opt => /^[A-Z]$/.test(opt.id));
    const isNumberSequence = options.every(opt => /^[0-9]+$/.test(opt.id));

    if (isLetterSequence) {
      // 验证字母连续性 (A, B, C, ...)
      const expectedSequence = Array.from({ length: options.length }, (_, i) => 
        String.fromCharCode(65 + i) // A=65, B=66, ...
      );
      const actualSequence = options.map(opt => opt.id).sort();
      
      if (JSON.stringify(expectedSequence) !== JSON.stringify(actualSequence)) {
        warnings.push(`选项标签不连续，期望: ${expectedSequence.join(', ')}，实际: ${actualSequence.join(', ')}`);
      }
    } else if (isNumberSequence) {
      // 验证数字连续性 (1, 2, 3, ...)
      const numbers = options.map(opt => parseInt(opt.id)).sort((a, b) => a - b);
      const expectedStart = Math.min(...numbers);
      const expectedSequence = Array.from({ length: options.length }, (_, i) => expectedStart + i);
      
      if (JSON.stringify(expectedSequence) !== JSON.stringify(numbers)) {
        warnings.push(`选项编号不连续，期望: ${expectedSequence.join(', ')}，实际: ${numbers.join(', ')}`);
      }
    } else {
      warnings.push('选项标签格式不一致，建议使用统一的字母(A,B,C...)或数字(1,2,3...)格式');
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  }

  /**
   * 解析正确答案
   * @param correctAnswerContent 正确答案字段内容
   * @param availableOptions 可用的选项列表
   * @returns 解析结果
   */
  static parseCorrectAnswer(
    correctAnswerContent: string, 
    availableOptions: ChoiceOption[]
  ): CorrectAnswerParseResult {
    if (!correctAnswerContent || !correctAnswerContent.trim()) {
      return {
        success: false,
        correctIds: [],
        isMultiple: false,
        error: '正确答案内容为空'
      };
    }

    const content = correctAnswerContent.trim();
    const availableIds = availableOptions.map(opt => opt.id);

    // 检查是否为多选（包含逗号、分号或空格分隔）
    const separators = [',', '，', ';', '；', ' ', '\n'];
    const isMultiple = separators.some(sep => content.includes(sep));

    if (isMultiple) {
      // 多选答案解析
      const parts = content.split(/[,，;；\s\n]+/)
        .map(part => part.trim())
        .filter(part => part.length > 0);

      const correctIds: string[] = [];
      const errors: string[] = [];

      for (const part of parts) {
        const parseResult = this.parseAnswerPart(part);
        if (parseResult.success && parseResult.id) {
          if (availableIds.includes(parseResult.id)) {
            if (!correctIds.includes(parseResult.id)) {
              correctIds.push(parseResult.id);
            }
          } else {
            errors.push(`选项 ${parseResult.id} 不存在于可用选项中`);
          }
        } else {
          errors.push(`无法解析答案部分: "${part}"`);
        }
      }

      if (correctIds.length === 0) {
        return {
          success: false,
          correctIds: [],
          isMultiple: true,
          error: `没有找到有效的正确答案。错误: ${errors.join('; ')}`
        };
      }

      return {
        success: true,
        correctIds,
        isMultiple: true
      };
    } else {
      // 单选答案解析
      const parseResult = this.parseAnswerPart(content);
      
      if (!parseResult.success || !parseResult.id) {
        return {
          success: false,
          correctIds: [],
          isMultiple: false,
          error: `无法解析正确答案: "${content}"`
        };
      }

      if (!availableIds.includes(parseResult.id)) {
        return {
          success: false,
          correctIds: [],
          isMultiple: false,
          error: `选项 ${parseResult.id} 不存在于可用选项中`
        };
      }

      return {
        success: true,
        correctIds: [parseResult.id],
        isMultiple: false
      };
    }
  }

  /**
   * 解析单个答案部分
   */
  private static parseAnswerPart(part: string): {
    success: boolean;
    id?: string;
  } {
    for (const pattern of this.ANSWER_PATTERNS) {
      const match = part.match(pattern);
      if (match) {
        return {
          success: true,
          id: match[1].toUpperCase()
        };
      }
    }

    return { success: false };
  }

  /**
   * 标记正确答案
   * @param options 选项列表
   * @param correctIds 正确答案ID列表
   * @returns 更新后的选项列表
   */
  static markCorrectAnswers(options: ChoiceOption[], correctIds: string[]): ChoiceOption[] {
    return options.map(option => ({
      ...option,
      isCorrect: correctIds.includes(option.id)
    }));
  }

  /**
   * 完整的选择题解析
   * @param optionsContent 选项字段内容
   * @param correctAnswerContent 正确答案字段内容
   * @returns 完整的解析结果
   */
  static parseChoiceQuestion(
    optionsContent: string, 
    correctAnswerContent: string
  ): ChoiceParseResult {
    // 解析选项
    const optionsResult = this.parseOptions(optionsContent);
    if (!optionsResult.success) {
      return optionsResult;
    }

    // 解析正确答案
    const correctResult = this.parseCorrectAnswer(correctAnswerContent, optionsResult.options);
    if (!correctResult.success) {
      return {
        success: false,
        options: optionsResult.options,
        correctAnswers: [],
        error: correctResult.error,
        warnings: optionsResult.warnings
      };
    }

    // 标记正确答案
    const finalOptions = this.markCorrectAnswers(optionsResult.options, correctResult.correctIds);

    return {
      success: true,
      options: finalOptions,
      correctAnswers: correctResult.correctIds,
      warnings: optionsResult.warnings
    };
  }
}
