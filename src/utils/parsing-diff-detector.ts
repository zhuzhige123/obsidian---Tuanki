/**
 * 解析差异检测器
 * 用于检测正则解析过程中是否存在内容遗漏
 * 
 * 核心功能：
 * - 对比原文与解析结果
 * - 检测内容损失
 * - 生成详细的差异报告
 * 
 * 注意：当前阶段为预留实现，待正则解析功能启用后完善
 */

/**
 * 差异检测结果接口
 */
export interface ParsingDiffResult {
  lossDetected: boolean;      // 是否检测到内容损失
  confidence: number;         // 检测置信度 0-1
  lossDetails: string[];      // 具体损失的内容
  statistics: {
    originalLength: number;   // 原文长度
    parsedLength: number;     // 解析后长度
    lossPercentage: number;   // 损失百分比
    missingKeywords: string[]; // 缺失的关键词
  };
}

/**
 * 检测解析过程中的内容损失
 * 
 * @param originalText 原始输入文本
 * @param parsedFields 解析后的字段集合
 * @returns 差异检测结果
 * 
 * @example
 * ```typescript
 * const result = detectParsingLoss(
 *   "这是一个复杂的问题，包含代码块：```js\nconst x = 1;\n```",
 *   { question: "这是一个复杂的问题", answer: "包含代码块" }
 * );
 * 
 * if (result.lossDetected) {
 *   console.log('检测到内容损失:', result.lossDetails);
 * }
 * ```
 */
export function detectParsingLoss(
  originalText: string,
  parsedFields: Record<string, string>
): ParsingDiffResult {
  // 基础统计
  const originalLength = originalText.trim().length;
  const parsedContent = Object.values(parsedFields).join(' ');
  const parsedLength = parsedContent.trim().length;
  
  // 计算损失百分比
  const lossPercentage = originalLength > 0 
    ? ((originalLength - parsedLength) / originalLength) * 100
    : 0;
  
  // 提取关键词（简单实现：长度>2的中文词或英文单词）
  const originalKeywords = extractKeywords(originalText);
  const parsedKeywords = extractKeywords(parsedContent);
  
  // 找出缺失的关键词
  const missingKeywords = originalKeywords.filter(
    keyword => !parsedKeywords.includes(keyword)
  );
  
  // 检测特殊格式（代码块、链接、图片等）
  const specialFormats = detectSpecialFormats(originalText);
  const preservedFormats = detectSpecialFormats(parsedContent);
  const lossDetails: string[] = [];
  
  // 检测代码块损失
  if (specialFormats.codeBlocks > preservedFormats.codeBlocks) {
    lossDetails.push(`代码块损失: ${specialFormats.codeBlocks - preservedFormats.codeBlocks} 个`);
  }
  
  // 检测链接损失
  if (specialFormats.links > preservedFormats.links) {
    lossDetails.push(`链接损失: ${specialFormats.links - preservedFormats.links} 个`);
  }
  
  // 检测图片损失
  if (specialFormats.images > preservedFormats.images) {
    lossDetails.push(`图片损失: ${specialFormats.images - preservedFormats.images} 个`);
  }
  
  // 检测关键词损失
  if (missingKeywords.length > 0) {
    lossDetails.push(`缺失关键词: ${missingKeywords.slice(0, 5).join(', ')}${missingKeywords.length > 5 ? '...' : ''}`);
  }
  
  // 判断是否存在显著损失
  // 阈值：长度损失>20% 或 关键词缺失>5个 或 特殊格式损失>0
  const lossDetected = 
    lossPercentage > 20 || 
    missingKeywords.length > 5 || 
    lossDetails.length > 0;
  
  // 计算置信度（基于多个因素的综合评估）
  let confidence = 1.0;
  
  if (lossPercentage > 0) {
    confidence -= lossPercentage / 100 * 0.3;
  }
  
  if (missingKeywords.length > 0) {
    confidence -= Math.min(missingKeywords.length / 10, 0.3);
  }
  
  if (specialFormats.total !== preservedFormats.total) {
    confidence -= 0.2;
  }
  
  confidence = Math.max(0, Math.min(1, confidence));
  
  return {
    lossDetected,
    confidence,
    lossDetails,
    statistics: {
      originalLength,
      parsedLength,
      lossPercentage: Math.round(lossPercentage * 10) / 10,
      missingKeywords
    }
  };
}

/**
 * 提取文本中的关键词
 * @param text 输入文本
 * @returns 关键词数组
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  
  // 提取中文词（2个字符以上的连续中文）
  const chineseWords = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  keywords.push(...chineseWords);
  
  // 提取英文单词（3个字符以上）
  const englishWords = text.match(/[a-zA-Z]{3,}/g) || [];
  keywords.push(...englishWords.map(w => w.toLowerCase()));
  
  // 去重
  return Array.from(new Set(keywords));
}

/**
 * 检测文本中的特殊格式
 * @param text 输入文本
 * @returns 特殊格式统计
 */
function detectSpecialFormats(text: string): {
  codeBlocks: number;
  links: number;
  images: number;
  total: number;
} {
  // 代码块（```...```）
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []).length;
  
  // Markdown链接（[text](url)）
  const markdownLinks = (text.match(/\[.*?\]\(.*?\)/g) || []).length;
  
  // Wiki链接（[[link]]）
  const wikiLinks = (text.match(/\[\[.*?\]\]/g) || []).length;
  
  // 图片（![alt](url)）
  const images = (text.match(/!\[.*?\]\(.*?\)/g) || []).length;
  
  const links = markdownLinks + wikiLinks;
  const total = codeBlocks + links + images;
  
  return {
    codeBlocks,
    links,
    images,
    total
  };
}

/**
 * 生成人类可读的差异报告
 * @param result 差异检测结果
 * @returns 格式化的报告字符串
 */
export function generateDiffReport(result: ParsingDiffResult): string {
  const lines: string[] = [];
  
  lines.push('=== 解析差异检测报告 ===');
  lines.push('');
  
  if (result.lossDetected) {
    lines.push('⚠️  检测到内容损失');
  } else {
    lines.push('✅  未检测到显著内容损失');
  }
  
  lines.push('');
  lines.push('统计信息:');
  lines.push(`  - 原文长度: ${result.statistics.originalLength} 字符`);
  lines.push(`  - 解析后长度: ${result.statistics.parsedLength} 字符`);
  lines.push(`  - 损失比例: ${result.statistics.lossPercentage.toFixed(1)}%`);
  lines.push(`  - 检测置信度: ${(result.confidence * 100).toFixed(1)}%`);
  
  if (result.lossDetails.length > 0) {
    lines.push('');
    lines.push('损失详情:');
    result.lossDetails.forEach(detail => {
      lines.push(`  - ${detail}`);
    });
  }
  
  if (result.statistics.missingKeywords.length > 0) {
    lines.push('');
    lines.push('缺失关键词（部分）:');
    const preview = result.statistics.missingKeywords.slice(0, 10).join(', ');
    lines.push(`  ${preview}`);
    if (result.statistics.missingKeywords.length > 10) {
      lines.push(`  （还有 ${result.statistics.missingKeywords.length - 10} 个）`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 快速检测：仅判断是否需要保存原文
 * @param originalText 原始文本
 * @param parsedFields 解析后的字段
 * @returns 是否需要保存原文
 */
export function shouldPreserveOriginalText(
  originalText: string,
  parsedFields: Record<string, string>
): boolean {
  const result = detectParsingLoss(originalText, parsedFields);
  return result.lossDetected;
}


