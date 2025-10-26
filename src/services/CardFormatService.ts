/**
 * 卡片格式化服务
 * 提供AI驱动的卡片内容格式化功能
 */

import { CARD_TYPE_MARKERS, MAIN_SEPARATOR } from '../constants/markdown-delimiters';

export interface FormatResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * 选择题格式化器
 * 识别并规范化选择题内容
 */
export class ChoiceQuestionFormatter {
  
  /**
   * 格式化选择题内容
   */
  static format(content: string): FormatResult {
    try {
      console.log('[ChoiceFormatter] 开始格式化，原始内容长度:', content.length);
      console.log('[ChoiceFormatter] 原始内容前200字符:', content.substring(0, 200));
      
      // 1. 分离主内容和元数据
      const { mainContent, metadata } = this.splitContent(content);
      console.log('[ChoiceFormatter] 主内容长度:', mainContent.length);
      console.log('[ChoiceFormatter] 主内容前200字符:', mainContent.substring(0, 200));
      
      // 2. 提取问题
      const question = this.extractQuestion(mainContent);
      console.log('[ChoiceFormatter] 提取的问题:', question);
      
      if (!question) {
        console.error('[ChoiceFormatter] 无法识别问题内容，主内容:', mainContent.substring(0, 300));
        return {
          success: false,
          error: '无法识别问题内容'
        };
      }
      
      // 3. 提取选项
      const options = this.extractOptions(mainContent);
      console.log('[ChoiceFormatter] 提取的选项数量:', options.length);
      
      if (options.length === 0) {
        console.error('[ChoiceFormatter] 无法识别选项内容');
        return {
          success: false,
          error: '无法识别选项内容'
        };
      }
      
      // 4. 提取解析
      const explanation = this.extractExplanation(mainContent);
      
      // 5. 构建标准格式
      let formattedContent = `Q: ${question}\n\n`;
      
      // 添加选项
      options.forEach(opt => {
        formattedContent += `${opt.label}) ${opt.text}${opt.isCorrect ? ' {✓}' : ''}\n`;
      });
      formattedContent += '\n';
      
      // 添加解析（如果有）
      if (explanation) {
        formattedContent += `${MAIN_SEPARATOR}\n\n`;
        formattedContent += `Explanation: ${explanation}`;
      }
      
      // 添加元数据（如果有）
      if (metadata) {
        formattedContent += `\n\n${metadata}`;
      }
      
      return {
        success: true,
        content: formattedContent.trim()
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '格式化失败'
      };
    }
  }
  
  /**
   * 分离主内容和元数据
   */
  private static splitContent(content: string): { mainContent: string; metadata?: string } {
    const metaMatch = content.match(/\n---meta---\n/i);
    if (metaMatch) {
      return {
        mainContent: content.substring(0, metaMatch.index!).trim(),
        metadata: content.substring(metaMatch.index!).trim()
      };
    }
    return { mainContent: content };
  }
  
  /**
   * 提取问题内容
   * 尝试识别多种问题格式
   */
  private static extractQuestion(content: string): string | null {
    // 1. 标准Q:格式（大小写不敏感）
    let match = content.match(/^[Qq]:\s*(.+?)(?=\n[A-H]\)|$)/s);
    if (match) {
      console.log('[extractQuestion] 匹配到Q:格式');
      return match[1].trim();
    }
    
    // 2. 问：格式
    match = content.match(/^问[：:]\s*(.+?)(?=\n[A-H]\)|$)/s);
    if (match) {
      console.log('[extractQuestion] 匹配到问：格式');
      return match[1].trim();
    }
    
    // 3. Question:格式
    match = content.match(/^Question:\s*(.+?)(?=\n[A-H]\)|$)/si);
    if (match) {
      console.log('[extractQuestion] 匹配到Question:格式');
      return match[1].trim();
    }
    
    // 4. 直接以问号结尾的内容
    match = content.match(/^(.+?\?)\s*\n/s);
    if (match) {
      console.log('[extractQuestion] 匹配到问号结尾格式');
      return match[1].trim();
    }
    
    // 5. 尝试提取第一个选项之前的内容
    match = content.match(/^(.+?)(?=\n[A-H]\))/s);
    if (match) {
      const possibleQuestion = match[1].trim();
      console.log('[extractQuestion] 匹配到选项之前的内容:', possibleQuestion.substring(0, 100));
      // 排除分隔符，但允许包含Q:或q:的内容
      if (possibleQuestion && !possibleQuestion.includes('---div---') && !possibleQuestion.includes('---meta---')) {
        // 如果内容以Q:或q:开头，移除前缀
        const cleanedQuestion = possibleQuestion.replace(/^[Qq]:\s*/, '').trim();
        if (cleanedQuestion) {
          return cleanedQuestion;
        }
      }
    }
    
    console.error('[extractQuestion] 所有匹配模式都失败');
    return null;
  }
  
  /**
   * 提取选项
   * 识别A) B) C) D)格式的选项，以及{✓}标记
   */
  private static extractOptions(content: string): Array<{
    label: string;
    text: string;
    isCorrect: boolean;
  }> {
    const options: Array<{label: string; text: string; isCorrect: boolean}> = [];
    
    // 匹配所有A) B) C) D)格式的选项
    const optionPattern = /([A-H])\)\s*(.+?)(?=\n[A-H]\)|---|\n\n|$)/gs;
    const matches = content.matchAll(optionPattern);
    
    for (const match of matches) {
      const label = match[1];
      let text = match[2].trim();
      
      // 检查是否包含正确答案标记
      const hasCorrectMarker = text.includes('{✓}') || 
                               text.includes('{✔}') || 
                               text.includes('✓') || 
                               text.includes('✔') ||
                               text.includes('{correct}');
      
      // 移除标记
      text = text.replace(/\{✓\}|\{✔\}|✓|✔|\{correct\}/g, '').trim();
      
      options.push({
        label,
        text,
        isCorrect: hasCorrectMarker
      });
    }
    
    // 如果没有找到标记的正确答案，尝试其他方式识别
    if (options.length > 0 && !options.some(opt => opt.isCorrect)) {
      // 检查是否有"正确答案："或"答案："标识
      const answerMatch = content.match(/(?:正确)?答案[：:]\s*([A-H])/i);
      if (answerMatch) {
        const correctLabel = answerMatch[1];
        const correctOption = options.find(opt => opt.label === correctLabel);
        if (correctOption) {
          correctOption.isCorrect = true;
        }
      }
    }
    
    return options;
  }
  
  /**
   * 提取解析内容
   */
  private static extractExplanation(content: string): string | null {
    // 1. 查找---分隔符后的内容（包括---div---）
    const separatorMatch = content.match(/\n---(?:div)?---\n\s*(.+?)(?=\n---meta---|$)/s);
    if (separatorMatch) {
      let explanation = separatorMatch[1].trim();
      // 移除"Explanation:"前缀
      explanation = explanation.replace(/^(?:Explanation|解析|答案解析)[：:]\s*/i, '');
      console.log('[extractExplanation] 找到解析（通过分隔符）:', explanation.substring(0, 100));
      return explanation || null;
    }
    
    // 2. 查找"解析："标识
    const explanationMatch = content.match(/(?:解析|答案解析|Explanation)[：:]\s*(.+?)(?=\n---meta---|$)/si);
    if (explanationMatch) {
      console.log('[extractExplanation] 找到解析（通过标识）:', explanationMatch[1].substring(0, 100));
      return explanationMatch[1].trim();
    }
    
    console.log('[extractExplanation] 未找到解析内容');
    return null;
  }
}

/**
 * 卡片格式化服务
 * 统一管理所有格式化功能
 */
export class CardFormatService {
  
  /**
   * 格式化卡片内容
   */
  static format(content: string, formatType: string): FormatResult {
    switch (formatType) {
      case 'choice':
        return ChoiceQuestionFormatter.format(content);
      default:
        return {
          success: false,
          error: `不支持的格式化类型: ${formatType}`
        };
    }
  }
}

