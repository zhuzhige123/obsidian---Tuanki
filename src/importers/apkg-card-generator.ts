/**
 * APKG 卡片生成器
 * 将 Anki 字段数据转换为 Tuanki Markdown 格式卡片
 * 
 * 主要功能：
 * 1. HTML → Markdown 转换
 * 2. 字段内容组合（按显示面配置）
 * 3. 自动插入 Tuanki 问答题分割线 (---div---)
 * 4. 媒体引用转换
 */

/**
 * 字段显示面配置
 * key: 字段名称
 * value: 显示面 ('front' | 'back' | 'both')
 */
export interface FieldSideConfiguration {
  [fieldName: string]: 'front' | 'back' | 'both';
}

/**
 * Tuanki 卡片生成器类
 */
export class TuankiCardGenerator {
  /**
   * 生成问答题格式的 Markdown 内容
   * 
   * @param fields - 卡片字段（key-value）
   * @param fieldConfig - 字段显示面配置
   * @returns Markdown 格式的卡片内容
   */
  generateQACard(
    fields: Record<string, string>,
    fieldConfig: FieldSideConfiguration
  ): string {
    const frontFields: string[] = [];
    const backFields: string[] = [];
    const bothFields: string[] = [];
    
    // 按配置分类字段
    for (const [fieldName, content] of Object.entries(fields)) {
      if (!content || content.trim() === '') {
        continue; // 跳过空字段
      }
      
      const side = fieldConfig[fieldName] || 'both';
      const cleanContent = this.convertHTMLtoMarkdown(content);
      const formattedField = `**${fieldName}**: ${cleanContent}`;
      
      if (side === 'front') {
        frontFields.push(formattedField);
      } else if (side === 'back') {
        backFields.push(formattedField);
      } else {
        bothFields.push(formattedField);
      }
    }
    
    // 生成 Markdown 结构
    let markdown = '';
    
    // 正面内容
    if (frontFields.length > 0) {
      markdown += frontFields.join('\n\n') + '\n\n';
    }
    if (bothFields.length > 0 && frontFields.length > 0) {
      markdown += bothFields.join('\n\n') + '\n\n';
    }
    
    // ✅ 插入 Tuanki 问答题分割线
    markdown += '---div---\n\n';
    
    // 背面内容
    if (backFields.length > 0) {
      markdown += backFields.join('\n\n') + '\n\n';
    }
    // 如果正面没有显示 both 字段，在背面显示
    if (bothFields.length > 0 && (backFields.length > 0 || frontFields.length === 0)) {
      markdown += bothFields.join('\n\n');
    }
    
    return markdown.trim();
  }
  
  /**
   * 将 Anki HTML 内容转换为 Obsidian Markdown
   * 
   * @param html - Anki HTML 内容
   * @returns Markdown 内容
   */
  convertHTMLtoMarkdown(html: string): string {
    if (!html) return '';
    
    let markdown = html;
    
    // ✅ 清理 Anki 特殊标记
    // 挖空语法转换: {{c1::text}} → ==text==
    markdown = markdown.replace(/\{\{c\d+::(.*?)\}\}/g, '==$1==');
    
    // ✅ HTML 标签转换
    // 换行
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    // 段落
    markdown = markdown.replace(/<p>(.*?)<\/p>/gis, '$1\n\n');
    
    // 粗体
    markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    
    // 斜体
    markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    
    // 下划线（保留 HTML，Markdown 原生不支持）
    markdown = markdown.replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>');
    
    // 删除线
    markdown = markdown.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');
    markdown = markdown.replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~');
    markdown = markdown.replace(/<del>(.*?)<\/del>/gi, '~~$1~~');
    
    // 代码
    markdown = markdown.replace(/<code>(.*?)<\/code>/gi, '`$1`');
    
    // ✅ 列表转换
    // 无序列表
    markdown = markdown.replace(/<ul>(.*?)<\/ul>/gis, (match, content) => {
      const items = content.match(/<li>(.*?)<\/li>/gis) || [];
      return items.map((item: string) => 
        '- ' + item.replace(/<\/?li>/gi, '').trim()
      ).join('\n') + '\n';
    });
    
    // 有序列表
    markdown = markdown.replace(/<ol>(.*?)<\/ol>/gis, (match, content) => {
      const items = content.match(/<li>(.*?)<\/li>/gis) || [];
      return items.map((item: string, index: number) => 
        `${index + 1}. ` + item.replace(/<\/?li>/gi, '').trim()
      ).join('\n') + '\n';
    });
    
    // ✅ 链接转换
    markdown = markdown.replace(/<a\s+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    
    // ✅ 标题转换
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n');
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n');
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n');
    markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n');
    markdown = markdown.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n');
    markdown = markdown.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n');
    
    // ✅ 引用块
    markdown = markdown.replace(/<blockquote>(.*?)<\/blockquote>/gis, (match, content) => {
      const lines = content.trim().split('\n');
      return lines.map((line: string) => `> ${line.trim()}`).join('\n') + '\n';
    });
    
    // ✅ 水平线
    markdown = markdown.replace(/<hr\s*\/?>/gi, '\n---\n');
    
    // ✅ 代码块
    markdown = markdown.replace(/<pre><code>(.*?)<\/code><\/pre>/gis, (match, content) => {
      return '```\n' + content.trim() + '\n```\n';
    });
    markdown = markdown.replace(/<pre>(.*?)<\/pre>/gis, (match, content) => {
      return '```\n' + content.trim() + '\n```\n';
    });
    
    // ✅ 清理 div 和 span（保留内容）
    markdown = markdown.replace(/<div[^>]*>(.*?)<\/div>/gis, '$1\n');
    markdown = markdown.replace(/<span[^>]*>(.*?)<\/span>/gis, '$1');
    
    // ✅ 清理剩余 HTML 标签（保守策略：保留未识别的标签，避免丢失内容）
    // 只移除空标签和常见的格式标签
    markdown = markdown.replace(/<\/(p|div|span)>/gi, '');
    markdown = markdown.replace(/<(p|div|span)[^>]*>/gi, '');
    
    // ✅ 清理 HTML 实体
    markdown = markdown.replace(/&nbsp;/g, ' ');
    markdown = markdown.replace(/&lt;/g, '<');
    markdown = markdown.replace(/&gt;/g, '>');
    markdown = markdown.replace(/&amp;/g, '&');
    markdown = markdown.replace(/&quot;/g, '"');
    markdown = markdown.replace(/&#39;/g, "'");
    
    // ✅ 清理多余空行（最多保留一个空行）
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    
    // ✅ 清理行首行尾空白
    markdown = markdown.trim();
    
    return markdown;
  }
  
  /**
   * 生成预览内容（用于配置界面实时预览）
   * 
   * @param fields - 卡片字段
   * @param fieldConfig - 字段配置
   * @returns 格式化的预览内容（带标记的 Markdown）
   */
  generatePreview(
    fields: Record<string, string>,
    fieldConfig: FieldSideConfiguration
  ): string {
    const markdown = this.generateQACard(fields, fieldConfig);
    
    // 添加可视化标记
    const lines = markdown.split('\n');
    const dividerIndex = lines.findIndex(line => line.trim() === '---div---');
    
    if (dividerIndex === -1) {
      return markdown;
    }
    
    // 添加正面/背面标记
    const frontLines = lines.slice(0, dividerIndex);
    const backLines = lines.slice(dividerIndex + 1);
    
    let preview = '【正面 / Front】\n';
    preview += frontLines.join('\n');
    preview += '\n\n';
    preview += '【分割线 / Divider】\n';
    preview += '---div---';
    preview += '\n\n';
    preview += '【背面 / Back】\n';
    preview += backLines.join('\n');
    
    return preview;
  }
  
  /**
   * 验证字段配置（确保至少有一个正面字段）
   * 
   * @param fieldConfig - 字段配置
   * @returns 验证结果
   */
  validateFieldConfig(fieldConfig: FieldSideConfiguration): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    const hasFrontField = Object.values(fieldConfig).some(
      side => side === 'front' || side === 'both'
    );
    
    if (!hasFrontField) {
      errors.push('至少需要一个字段显示在正面（front 或 both）');
    }
    
    const hasBackField = Object.values(fieldConfig).some(
      side => side === 'back' || side === 'both'
    );
    
    if (!hasBackField) {
      errors.push('至少需要一个字段显示在背面（back 或 both）');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * 工具函数：创建默认字段配置
 * 
 * @param fieldNames - 字段名称数组
 * @returns 默认配置（第一个字段正面，第二个字段背面，其余两面）
 */
export function createDefaultFieldConfig(fieldNames: string[]): FieldSideConfiguration {
  const config: FieldSideConfiguration = {};
  
  fieldNames.forEach((name, index) => {
    if (index === 0) {
      config[name] = 'front';
    } else if (index === 1) {
      config[name] = 'back';
    } else {
      config[name] = 'both';
    }
  });
  
  return config;
}

/**
 * 工具函数：推断字段显示面（智能推断）
 * 
 * @param fieldName - 字段名称
 * @param fieldIndex - 字段索引
 * @param totalFields - 总字段数
 * @returns 推断的显示面
 */
export function inferFieldSide(
  fieldName: string,
  fieldIndex: number,
  totalFields: number
): 'front' | 'back' | 'both' {
  const lowerName = fieldName.toLowerCase();
  
  // 明确的正面字段
  const frontKeywords = [
    'front', 'question', 'q', 'prompt', 'word', 'expression', 'term',
    '问题', '题目', '正面', '单词', '词语', '术语', '表达'
  ];
  if (frontKeywords.some(kw => lowerName.includes(kw))) {
    return 'front';
  }
  
  // 明确的背面字段
  const backKeywords = [
    'back', 'answer', 'a', 'solution', 'definition', 'meaning', 'translation',
    '答案', '解答', '背面', '定义', '释义', '翻译', '意思'
  ];
  if (backKeywords.some(kw => lowerName.includes(kw))) {
    return 'back';
  }
  
  // 两面都显示的字段
  const bothKeywords = [
    'extra', 'note', 'remark', 'hint', 'tip', 'example', 'usage',
    '备注', '说明', '提示', '例句', '用法', '注释'
  ];
  if (bothKeywords.some(kw => lowerName.includes(kw))) {
    return 'both';
  }
  
  // 位置推断：第一个字段通常是正面，第二个是背面
  if (fieldIndex === 0) {
    return 'front';
  } else if (fieldIndex === 1) {
    return 'back';
  }
  
  // 其他字段默认显示在两面
  return 'both';
}


