/**
 * 选择题解析器 - 支持Anki兼容标记 {✓}/{correct}/{*}
 * 
 * 格式示例：
 * ```
 * Q: 问题文本
 * 
 * A) 选项1
 * B) 选项2 {✓}
 * C) 选项3
 * 
 * ---div---
 * 
 * 解析内容
 * ```
 */

export interface ChoiceOption {
  /** 选项标签 (A, B, C, D, ...) */
  label: string;
  /** 选项内容文本 */
  content: string;
  /** 是否为正确答案 */
  isCorrect: boolean;
}

export interface ChoiceQuestion {
  /** 题型标识 */
  type: 'choice';
  /** 问题文本 */
  question: string;
  /** 所有选项 */
  options: ChoiceOption[];
  /** 正确答案标签列表 */
  correctAnswers: string[];
  /** 解析说明（可选） */
  explanation?: string;
  /** 是否为多选题 */
  isMultipleChoice: boolean;
}

/**
 * 解析选择题卡片
 * 
 * @param markdown - 卡片的Markdown内容
 * @returns 解析后的选择题对象，如果不是选择题则返回null
 */
export function parseChoiceQuestion(markdown: string): ChoiceQuestion | null {
  if (!markdown || typeof markdown !== 'string') {
    return null;
  }

  try {
    // 0. 预处理：清理可能的代码块包裹
    let cleanedMarkdown = markdown.trim();
    
    // 检测并移除外层markdown代码块包裹
    const codeBlockRegex = /^```(?:markdown|md|text|)?\s*\n?([\s\S]*?)\n?```$/;
    const codeBlockMatch = cleanedMarkdown.match(codeBlockRegex);
    
    if (codeBlockMatch) {
      cleanedMarkdown = codeBlockMatch[1].trim();
      console.log('[ChoiceQuestionParser] 检测到代码块包裹，已自动清理');
    }
    
    // 清理多余的空白行（保留必要的分隔）
    cleanedMarkdown = cleanedMarkdown.replace(/\n{3,}/g, '\n\n');
    
    // 1. 按 ---div--- 分割正面和背面
    const dividerRegex = /---div---/i;
    const parts = cleanedMarkdown.split(dividerRegex);
    const front = parts[0]?.trim() || '';
    const back = parts[1]?.trim() || '';

    // 2. 提取问题（支持 Q: 和 问题：）
    const questionRegex = /^(?:Q:|问题：)\s*(.+?)$/m;
    const questionMatch = front.match(questionRegex);
    
    if (!questionMatch) {
      return null; // 没有问题标记，不是选择题
    }

    const question = questionMatch[1].trim();

    // 3. 提取选项（支持 A)、B)、C)、D) 等格式）
    // 正则匹配：选项标签 + ) + 内容 + 可选的正确标记
    const optionRegex = /^([A-Z])\)\s*(.+?)$/gm;
    const options: ChoiceOption[] = [];
    const correctMarkers = /\{(?:✓|correct|\*)\}/;
    
    let match;
    while ((match = optionRegex.exec(front)) !== null) {
      const fullMatch = match[0];
      const label = match[1];
      let content = match[2].trim();
      
      // 检查是否包含正确答案标记
      const hasCorrectMark = correctMarkers.test(content);
      
      // 移除正确答案标记，保留纯文本内容
      content = content.replace(correctMarkers, '').trim();
      
      options.push({
        label,
        content,
        isCorrect: hasCorrectMark
      });
    }

    // 4. 验证：至少需要2个选项，且至少有1个正确答案
    if (options.length < 2) {
      return null;
    }

    const correctOptions = options.filter(opt => opt.isCorrect);
    if (correctOptions.length === 0) {
      return null; // 没有标记正确答案，不是有效的选择题
    }

    // 5. 提取解析内容（背面）
    const explanation = back || undefined;

    // 6. 判断是单选题还是多选题
    const isMultipleChoice = correctOptions.length > 1;

    // 7. 构造选择题对象
    const choiceQuestion: ChoiceQuestion = {
      type: 'choice',
      question,
      options,
      correctAnswers: correctOptions.map(opt => opt.label),
      explanation,
      isMultipleChoice
    };

    return choiceQuestion;

  } catch (error) {
    console.error('[ChoiceQuestionParser] 解析失败:', error);
    return null;
  }
}

/**
 * 检测内容是否为选择题格式
 * 
 * @param markdown - 要检测的Markdown内容
 * @returns 是否为选择题
 */
export function isChoiceQuestion(markdown: string): boolean {
  if (!markdown || typeof markdown !== 'string') {
    return false;
  }

  // 快速检测：是否包含必要的特征
  const hasQuestion = /^(?:Q:|问题：)/m.test(markdown);
  const hasOptions = /^[A-Z]\)/m.test(markdown);
  const hasCorrectMark = /\{(?:✓|correct|\*)\}/.test(markdown);

  return hasQuestion && hasOptions && hasCorrectMark;
}

/**
 * 验证选择题对象的有效性
 * 
 * @param question - 选择题对象
 * @returns 是否有效
 */
export function validateChoiceQuestion(question: ChoiceQuestion): boolean {
  if (!question || question.type !== 'choice') {
    return false;
  }

  // 验证问题文本
  if (!question.question || question.question.trim().length === 0) {
    return false;
  }

  // 验证选项
  if (!Array.isArray(question.options) || question.options.length < 2) {
    return false;
  }

  // 验证每个选项
  for (const option of question.options) {
    if (!option.label || !option.content) {
      return false;
    }
  }

  // 验证正确答案
  if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) {
    return false;
  }

  // 验证正确答案标签是否存在于选项中
  const optionLabels = question.options.map(opt => opt.label);
  for (const correctLabel of question.correctAnswers) {
    if (!optionLabels.includes(correctLabel)) {
      return false;
    }
  }

  return true;
}


