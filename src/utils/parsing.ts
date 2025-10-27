import type { RegexParseTemplate } from "../data/template-types";

export interface ParsedCardData {
  // 兼容性字段
  front?: string;
  back?: string;
  // 标准字段
  question?: string;
  answer?: string;
  // 通用字段
  tags?: string;
  templateId?: string;
  templateName?: string;
  // 动态字段支持
  [key: string]: any;
}

/**
 * 使用指定的正则表达式模板解析文本。
 * @param text 要解析的文本。
 * @param template 正则表达式解析模板。
 * @returns 解析成功则返回包含卡片数据的对象，否则返回 null。
 */
export function parseTextWithTemplate(
  text: string,
  template: RegexParseTemplate
): ParsedCardData | null {
  try {
    const regex = new RegExp(template.regex, 'm'); // 'm' for multiline matching
    const match = text.match(regex);

    if (!match) {
      console.log(`❌ [parseTextWithTemplate] 正则不匹配: ${template.name}`);
      console.log(`🔍 [parseTextWithTemplate] 正则表达式: ${template.regex}`);
      console.log(`📝 [parseTextWithTemplate] 文本开头: ${text.substring(0, 200)}...`);
      return null;
    }

    console.log(`✅ [parseTextWithTemplate] 正则匹配成功: ${template.name}`);
    console.log(`📊 [parseTextWithTemplate] 捕获组数量: ${match.length}`);
    console.log(`🔍 [parseTextWithTemplate] 捕获组内容:`, match.map((group, index) =>
      `[${index}]: ${group ? group.substring(0, 50) + '...' : 'null'}`
    ));

    // 🔧 修复：支持动态字段映射
    const fieldMappings = template.fieldMappings;
    console.log(`🔍 [parseTextWithTemplate] 字段映射:`, fieldMappings);

    // 动态解析所有字段
    const parsedData: ParsedCardData = {};

    // 遍历所有字段映射
    for (const [fieldKey, groupIndex] of Object.entries(fieldMappings)) {
      if (typeof groupIndex === 'number' && match.length > groupIndex) {
        const fieldValue = match[groupIndex]?.trim() || '';
        (parsedData as any)[fieldKey] = fieldValue;
        console.log(`📝 [parseTextWithTemplate] 字段 ${fieldKey}: ${fieldValue.substring(0, 50)}...`);
      }
    }

    // 兼容性：如果有question/answer字段，也映射到front/back
    if (parsedData.question && !parsedData.front) {
      parsedData.front = parsedData.question;
    }
    if (parsedData.answer && !parsedData.back) {
      parsedData.back = parsedData.answer;
    }

    // 兼容性：如果有front/back字段，也映射到question/answer
    if (parsedData.front && !parsedData.question) {
      parsedData.question = parsedData.front;
    }
    if (parsedData.back && !parsedData.answer) {
      parsedData.answer = parsedData.back;
    }

    // 添加模板信息
    parsedData.templateId = template.id;
    parsedData.templateName = template.name;

    console.log(`🎯 [parseTextWithTemplate] 解析成功:`, {
      front: parsedData.front.substring(0, 50) + '...',
      back: parsedData.back.substring(0, 50) + '...',
      templateId: parsedData.templateId
    });

    return parsedData;
  } catch (error) {
    console.error(`❌ [parseTextWithTemplate] 解析模板 ${template.name} 时出错:`, error);
    return null;
  }
}

/**
 * 智能选择最佳匹配的模板
 * @param text 要解析的文本
 * @param templates 可用的正则表达式模板列表
 * @returns 最佳匹配的解析结果，如果没有匹配则返回null
 */
export function parseTextWithBestTemplate(
  text: string,
  templates: RegexParseTemplate[]
): ParsedCardData | null {
  console.log('🔍 [parseTextWithBestTemplate] 开始智能模板选择');
  console.log('📝 [parseTextWithBestTemplate] 文本长度:', text.length);
  console.log('📝 [parseTextWithBestTemplate] 文本开头:', text.substring(0, 100) + '...');
  console.log('🔧 [parseTextWithBestTemplate] 可用模板数量:', templates.length);

  if (!templates || templates.length === 0) {
    console.log('❌ [parseTextWithBestTemplate] 没有可用模板');
    return null;
  }

  const results: Array<{ template: RegexParseTemplate; data: ParsedCardData; score: number }> = [];

  // 尝试每个模板
  for (const template of templates) {
    console.log(`🧪 [parseTextWithBestTemplate] 测试模板: ${template.name} (${template.id})`);
    console.log(`🔍 [parseTextWithBestTemplate] 正则表达式: ${template.regex}`);

    const parsedData = parseTextWithTemplate(text, template);
    if (parsedData) {
      console.log(`✅ [parseTextWithBestTemplate] 模板匹配成功: ${template.name}`);
      console.log(`📄 [parseTextWithBestTemplate] 解析结果:`, {
        front: parsedData.front.substring(0, 50) + '...',
        back: parsedData.back.substring(0, 50) + '...'
      });

      // 计算匹配质量分数
      const score = calculateMatchScore(text, parsedData, template);
      console.log(`📊 [parseTextWithBestTemplate] 匹配分数: ${score}`);
      results.push({ template, data: parsedData, score });
    } else {
      console.log(`❌ [parseTextWithBestTemplate] 模板不匹配: ${template.name}`);
    }
  }

  // 如果没有任何模板匹配
  if (results.length === 0) {
    console.log('❌ [parseTextWithBestTemplate] 所有模板都不匹配');
    return null;
  }

  // 按分数排序，选择最佳匹配
  results.sort((a, b) => b.score - a.score);
  const bestResult = results[0];

  console.log(`🎯 [parseTextWithBestTemplate] 选择最佳模板: ${bestResult.template.name} (分数: ${bestResult.score})`);

  return {
    ...bestResult.data,
    success: true,
    template: bestResult.template,
    templateName: bestResult.template.name,
    templateId: bestResult.template.id
  };
}

/**
 * 计算模板匹配的质量分数
 * @param originalText 原始文本
 * @param parsedData 解析结果
 * @param template 使用的模板
 * @returns 质量分数（越高越好）
 */
function calculateMatchScore(
  originalText: string,
  parsedData: ParsedCardData,
  template: RegexParseTemplate
): number {
  let score = 0;

  // 基础分数：成功解析
  score += 100;

  // 内容完整性分数
  if (parsedData.front && parsedData.front.trim().length > 0) {
    score += 50;
  }
  if (parsedData.back && parsedData.back.trim().length > 0) {
    score += 50;
  }
  if (parsedData.tags && parsedData.tags.trim().length > 0) {
    score += 20;
  }

  // 内容长度合理性分数
  const frontLength = parsedData.front?.length || 0;
  const backLength = parsedData.back?.length || 0;
  const totalLength = frontLength + backLength;
  const originalLength = originalText.length;

  // 如果解析出的内容占原文的比例合理，加分
  const coverageRatio = totalLength / originalLength;
  if (coverageRatio > 0.5 && coverageRatio < 1.2) {
    score += 30;
  }

  // 内容平衡性分数（正面和背面长度不要相差太大）
  if (frontLength > 0 && backLength > 0) {
    const ratio = Math.min(frontLength, backLength) / Math.max(frontLength, backLength);
    if (ratio > 0.2) {
      score += 20;
    }
  }

  // 模板特异性分数（更复杂的正则表达式通常更精确）
  const regexComplexity = template.regex.length;
  if (regexComplexity > 20) {
    score += 10;
  }

  return score;
}

/**
 * 获取所有可用的解析模板 - 使用新的简化解析系统
 * @returns 解析模板数组
 */
export function getAvailableParseTemplates(): RegexParseTemplate[] {
  console.log('✅ [getAvailableParseTemplates] 使用新的简化解析系统');
  
  // 新系统不使用预定义的正则模板
  return [];
}

/**
 * 获取单张卡片解析模板 - 使用新的简化解析系统
 * @returns 解析模板数组
 */
export function getSingleCardParseTemplates(): RegexParseTemplate[] {
  console.log('✅ [getSingleCardParseTemplates] 使用新的简化解析系统');

  // 新系统不使用预定义的正则模板
  return [];

  // 注释：旧的三位一体模板系统已移除，使用新的简化解析系统
}

/**
 * 获取批量导入解析模板
 * @param templatesJson 模板的JSON字符串
 * @param fallbackTemplatesJson 回退模板（向后兼容）
 * @returns 解析模板数组
 */
export function getBatchImportParseTemplates(
  templatesJson?: string,
  fallbackTemplatesJson?: string
): RegexParseTemplate[] {
  console.log('🔍 [getBatchImportParseTemplates] 获取批量导入解析模板');
  console.log('⚠️ [getBatchImportParseTemplates] 使用新的简化解析系统');
  
  // 新系统不使用预定义的正则模板
  return [];
}

