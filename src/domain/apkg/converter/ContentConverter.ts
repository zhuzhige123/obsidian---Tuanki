/**
 * HTML内容转换器
 * 
 * 负责将Anki的HTML内容转换为Obsidian Markdown语法
 * 
 * @module domain/apkg/converter
 */

import { APKGLogger } from '../../../infrastructure/logger/APKGLogger';

/**
 * 媒体引用
 */
export interface MediaRef {
  originalName: string;
  placeholder: string;
  type: 'image' | 'audio' | 'video';
}

/**
 * HTML内容转换器
 */
export class ContentConverter {
  private logger: APKGLogger;
  private mediaCounter: number = 0;

  constructor() {
    this.logger = new APKGLogger({ prefix: '[ContentConverter]' });
  }

  /**
   * 转换HTML为Markdown
   * 
   * @param html - 原始HTML内容
   * @returns 转换结果
   */
  convert(html: string): { markdown: string; mediaRefs: MediaRef[] } {
    const startTime = Date.now();
    this.logger.debug(`开始转换HTML (长度: ${html.length})`);
    this.logger.debug(`原始HTML预览: ${html.substring(0, 200)}...`);

    // 重置媒体计数器
    this.mediaCounter = 0;

    // 步骤1: 提取媒体引用并替换为占位符
    const { html: processedHtml, mediaRefs } = this.extractMediaReferences(html);
    this.logger.debug(`[步骤1] 提取媒体: ${mediaRefs.length} 个媒体文件`);

    // 步骤2: 转换Anki特定语法
    let result = this.convertAnkiSyntax(processedHtml);
    this.logger.debug(`[步骤2] 转换Anki语法完成`);

    // 步骤3: 转换基础HTML标签
    result = this.convertBasicHTML(result);
    this.logger.debug(`[步骤3] 转换基础HTML标签完成`);

    // 步骤4: 转换引用块
    result = this.convertBlockquotes(result);
    this.logger.debug(`[步骤4] 转换引用块完成`);

    // 步骤5: 转换列表
    result = this.convertLists(result);
    this.logger.debug(`[步骤5] 转换列表完成`);

    // 步骤6: 转换表格
    result = this.convertTables(result);
    this.logger.debug(`[步骤6] 转换表格完成`);

    // 步骤7: 转换标题
    result = this.convertHeadings(result);
    this.logger.debug(`[步骤7] 转换标题完成`);

    // 步骤8: 清理和标准化
    result = this.cleanupMarkdown(result);
    this.logger.debug(`[步骤8] 清理完成`);

    const duration = Date.now() - startTime;
    this.logger.debug(`转换完成 (耗时: ${duration}ms)`);
    this.logger.debug(`结果预览: ${result.substring(0, 200)}...`);

    return {
      markdown: result,
      mediaRefs
    };
  }

  /**
   * 替换媒体占位符为实际路径
   * 
   * @param markdown - 包含占位符的Markdown
   * @param mediaRefs - 媒体引用列表
   * @param mediaPathMap - 媒体路径映射 (原始文件名 → Obsidian路径)
   * @returns 替换后的Markdown (媒体已转换为WikiLink格式)
   */
  replaceMediaPlaceholders(
    markdown: string,
    mediaRefs: MediaRef[],
    mediaPathMap: Map<string, string>
  ): string {
    let result = markdown;

    // 遍历媒体引用，将占位符替换为WikiLink格式
    for (const ref of mediaRefs) {
      // 从映射中获取实际保存的路径
      const path = mediaPathMap.get(ref.originalName);
      
      if (path) {
        // 转换为Obsidian WikiLink格式
        const wikilink = `![[${path}]]`;
        
        // 替换占位符（转义特殊字符以避免正则错误）
        const escapedPlaceholder = this.escapeRegExp(ref.placeholder);
        result = result.replace(new RegExp(escapedPlaceholder, 'g'), wikilink);
        
        this.logger.debug(`替换媒体: ${ref.placeholder} → ${wikilink}`);
      } else {
        // 未找到文件映射，记录警告
        this.logger.warn(`未找到媒体文件映射: ${ref.originalName}`);
      }
    }

    return result;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 提取媒体引用并替换为占位符
   */
  private extractMediaReferences(html: string): { html: string; mediaRefs: MediaRef[] } {
    const mediaRefs: MediaRef[] = [];
    let result = html;

    // 提取图片
    result = result.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
      const filename = this.extractFilename(src);
      const placeholder = `__MEDIA_${this.mediaCounter++}__`;
      
      mediaRefs.push({
        originalName: filename,
        placeholder,
        type: 'image'
      });

      return placeholder;
    });

    // 提取音频
    result = result.replace(/\[sound:([^\]]+)\]/gi, (match, filename) => {
      const placeholder = `__MEDIA_${this.mediaCounter++}__`;
      
      mediaRefs.push({
        originalName: filename.trim(),
        placeholder,
        type: 'audio'
      });

      return placeholder;
    });

    // 提取视频
    result = result.replace(/<video[^>]+src=["']([^"']+)["'][^>]*>/gi, (match, src) => {
      const filename = this.extractFilename(src);
      const placeholder = `__MEDIA_${this.mediaCounter++}__`;
      
      mediaRefs.push({
        originalName: filename,
        placeholder,
        type: 'video'
      });

      return placeholder;
    });

    return { html: result, mediaRefs };
  }

  /**
   * 从URL或路径中提取文件名
   */
  private extractFilename(path: string): string {
    // 移除查询参数
    const withoutQuery = path.split('?')[0];
    // 提取最后一个斜杠后的内容
    const parts = withoutQuery.split('/');
    return parts[parts.length - 1];
  }

  /**
   * 转换Anki特定语法
   */
  private convertAnkiSyntax(html: string): string {
    let result = html;

    // 转换挖空语法 {{c1::text}} -> ==text==
    result = result.replace(/\{\{c\d+::([^}]+)\}\}/g, '==$1==');

    // 转换挖空语法带提示 {{c1::text::hint}} -> ==text==
    result = result.replace(/\{\{c\d+::([^:}]+)::[^}]+\}\}/g, '==$1==');

    return result;
  }

  /**
   * 转换基础HTML标签
   */
  private convertBasicHTML(html: string): string {
    let result = html;

    // 粗体
    result = result.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    result = result.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');

    // 斜体
    result = result.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    result = result.replace(/<em>(.*?)<\/em>/gi, '*$1*');

    // 下划线（Obsidian不支持，保留为HTML或转为粗体）
    result = result.replace(/<u>(.*?)<\/u>/gi, '**$1**');

    // 删除线
    result = result.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');
    result = result.replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~');
    result = result.replace(/<del>(.*?)<\/del>/gi, '~~$1~~');

    // 代码（行内）
    result = result.replace(/<code>(.*?)<\/code>/gi, '`$1`');

    // 代码块
    result = result.replace(/<pre[^>]*>(.*?)<\/pre>/gis, (match, content) => {
      // 移除内部的<code>标签
      const cleanContent = content.replace(/<\/?code[^>]*>/gi, '');
      return '\n```\n' + cleanContent.trim() + '\n```\n';
    });

    // 🆕 P0修复：链接（支持无引号href，避免双方括号）
    result = result.replace(/<a\s+href=(["\']?)([^"'\s>]+)\1[^>]*>(.*?)<\/a>/gi, (match, quote, url, text) => {
      // 去掉文本中已有的方括号，避免双重方括号（如 [P77] 不应变成 [[P77]]）
      const cleanText = text.replace(/^\[/, '').replace(/\]$/, '');
      return `[${cleanText}](${url})`;
    });

    // 换行
    result = result.replace(/<br\s*\/?>/gi, '\n');

    // 水平线
    result = result.replace(/<hr\s*\/?>/gi, '\n---\n');

    // 段落（简单移除，Markdown用空行分段）
    result = result.replace(/<p[^>]*>/gi, '\n');
    result = result.replace(/<\/p>/gi, '\n');

    // Div（移除标签保留内容）
    result = result.replace(/<div[^>]*>/gi, '\n');
    result = result.replace(/<\/div>/gi, '\n');

    // Span（移除标签保留内容）
    result = result.replace(/<span[^>]*>/gi, '');
    result = result.replace(/<\/span>/gi, '');

    // 🆕 P1补充：字体标签（移除标签保留内容）
    result = result.replace(/<font[^>]*>(.*?)<\/font>/gi, '$1');

    // 🆕 P1补充：上下标
    result = result.replace(/<sup>(.*?)<\/sup>/gi, '^$1^');
    result = result.replace(/<sub>(.*?)<\/sub>/gi, '~$1~');

    // 🆕 P1补充：高亮标记（转换为 Obsidian 语法）
    result = result.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '==$1==');

    // 🆕 P1补充：居中标签（移除标签保留内容，Obsidian 不支持居中）
    result = result.replace(/<center[^>]*>(.*?)<\/center>/gis, '$1');

    return result;
  }

  /**
   * 转换引用块
   */
  private convertBlockquotes(html: string): string {
    // 🆕 修复：支持带属性的 blockquote 标签
    return html.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
      const lines = content.trim().split('\n');
      return lines.map(line => `> ${line}`).join('\n') + '\n';
    });
  }

  /**
   * 转换列表
   */
  private convertLists(html: string): string {
    let result = html;

    // 有序列表
    result = result.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
      let counter = 1;
      const converted = content.replace(/<li[^>]*>(.*?)<\/li>/gis, (liMatch: string, liContent: string) => {
        return `${counter++}. ${liContent.trim()}\n`;
      });
      return '\n' + converted + '\n';
    });

    // 无序列表
    result = result.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
      const converted = content.replace(/<li[^>]*>(.*?)<\/li>/gis, (liMatch: string, liContent: string) => {
        return `- ${liContent.trim()}\n`;
      });
      return '\n' + converted + '\n';
    });

    // 清理剩余的<li>标签
    result = result.replace(/<\/?li[^>]*>/gi, '');

    return result;
  }

  /**
   * 转换表格
   */
  private convertTables(html: string): string {
    // 简单表格转换（复杂表格保留HTML）
    return html.replace(/<table[^>]*>(.*?)<\/table>/gis, (match, content) => {
      // 检查是否为简单表格（无嵌套、无复杂属性）
      if (content.includes('<table')) {
        // 嵌套表格，保留HTML
        return match;
      }

      try {
        // 提取表头
        const theadMatch = content.match(/<thead[^>]*>(.*?)<\/thead>/is);
        const tbodyMatch = content.match(/<tbody[^>]*>(.*?)<\/tbody>/is);

        let rows: string[][] = [];

        // 解析表头
        if (theadMatch) {
          const headerRow = this.parseTableRow(theadMatch[1]);
          if (headerRow) rows.push(headerRow);
        }

        // 解析表体
        const bodyContent = tbodyMatch ? tbodyMatch[1] : content;
        const rowMatches = bodyContent.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis);
        
        for (const rowMatch of rowMatches) {
          const row = this.parseTableRow(rowMatch[1]);
          if (row) rows.push(row);
        }

        if (rows.length === 0) {
          return match; // 无法解析，保留原HTML
        }

        // 生成Markdown表格
        let markdown = '\n';
        rows.forEach((row, index) => {
          markdown += '| ' + row.join(' | ') + ' |\n';
          if (index === 0) {
            // 添加表头分隔符
            markdown += '| ' + row.map(() => '---').join(' | ') + ' |\n';
          }
        });
        markdown += '\n';

        return markdown;
      } catch (error) {
        this.logger.warn('表格转换失败，保留HTML', error);
        return match;
      }
    });
  }

  /**
   * 解析表格行
   */
  private parseTableRow(rowHtml: string): string[] | null {
    const cells: string[] = [];
    const cellMatches = rowHtml.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gis);

    for (const cellMatch of cellMatches) {
      cells.push(cellMatch[1].trim());
    }

    return cells.length > 0 ? cells : null;
  }

  /**
   * 转换标题
   */
  private convertHeadings(html: string): string {
    let result = html;

    // H1-H6
    for (let level = 6; level >= 1; level--) {
      const hashes = '#'.repeat(level);
      const regex = new RegExp(`<h${level}[^>]*>(.*?)<\/h${level}>`, 'gi');
      result = result.replace(regex, `\n${hashes} $1\n`);
    }

    return result;
  }

  /**
   * 清理和标准化Markdown
   */
  private cleanupMarkdown(markdown: string): string {
    let result = markdown;

    // 移除HTML注释
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // 🆕 P2补充：HTML实体解码
    result = this.decodeHTMLEntities(result);

    // 移除剩余的HTML标签（保留内容）
    result = result.replace(/<[^>]+>/g, '');

    // 规范化空行（最多2个连续空行）
    result = result.replace(/\n{3,}/g, '\n\n');

    // 移除首尾空白
    result = result.trim();

    return result;
  }

  /**
   * 🆕 解码常见HTML实体
   */
  private decodeHTMLEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&times;': '×',
      '&divide;': '÷',
      '&copy;': '©',
      '&reg;': '®',
      '&trade;': '™',
      '&euro;': '€',
      '&pound;': '£',
      '&yen;': '¥',
      '&cent;': '¢',
      '&deg;': '°',
      '&plusmn;': '±',
      '&sup2;': '²',
      '&sup3;': '³',
      '&frac14;': '¼',
      '&frac12;': '½',
      '&frac34;': '¾'
    };

    let result = text;

    // 替换命名实体
    for (const [entity, char] of Object.entries(entities)) {
      result = result.replace(new RegExp(entity, 'g'), char);
    }

    // 解码数字实体 &#NNNN;
    result = result.replace(/&#(\d+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 10));
    });

    // 解码十六进制实体 &#xHHHH;
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });

    return result;
  }
}
