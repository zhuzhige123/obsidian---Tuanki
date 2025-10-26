/**
 * 格式转换工具函数
 * 提供正则表达式常量和辅助函数
 */

/**
 * 正则表达式常量
 */
export const CONVERSION_REGEX = {
  // ==================== 公式相关 ====================
  /** 行内公式：$...$（非贪婪匹配） */
  INLINE_MATH: /\$([^\$\n]+?)\$/g,
  
  /** 块级公式：$$...$$（支持多行） */
  BLOCK_MATH: /\$\$\s*\n?([\s\S]+?)\n?\s*\$\$/g,
  
  /** LaTeX 行内公式：\(...\) */
  LATEX_INLINE: /\\\(([^)]+?)\\\)/g,
  
  /** LaTeX 块级公式：\[...\] */
  LATEX_BLOCK: /\\\[([\s\S]+?)\\\]/g,
  
  /** 货币符号检测（避免误转换）*/
  CURRENCY_PATTERN: /\$\s*\d+(?:\.\d{1,2})?(?:\s|$|[,，])/g,
  
  // ==================== 双链相关 ====================
  /** 基础双链：[[link]] */
  WIKILINK_BASIC: /\[\[([^\]|#]+)\]\]/g,
  
  /** 带显示文本：[[link|text]] */
  WIKILINK_WITH_TEXT: /\[\[([^\]|#]+)\|([^\]]+)\]\]/g,
  
  /** 带标题锚点：[[link#heading]] */
  WIKILINK_WITH_HEADING: /\[\[([^\]|]+)#([^\]|]+)\]\]/g,
  
  /** 带标题和文本：[[link#heading|text]] */
  WIKILINK_FULL: /\[\[([^\]|]+)#([^\]|]+)\|([^\]]+)\]\]/g,
  
  /** 媒体嵌入（已处理，用于排除）：![[...]] */
  MEDIA_EMBED: /!\[\[([^\]]+)\]\]/g,
  
  // ==================== Callout 相关 ====================
  /** Callout 块：> [!type] title */
  CALLOUT_BLOCK: /^>\s*\[!(\w+)\]([^\n]*)\n((?:>.*(?:\n|$))*)/gm,
  
  /** Callout 行：> content */
  CALLOUT_LINE: /^>\s*(.*)$/,
  
  // ==================== 高亮和样式 ====================
  /** 高亮：==text== */
  HIGHLIGHT: /==([^=]+)==/g,
  
  /** 删除线：~~text~~ */
  STRIKETHROUGH: /~~([^~]+)~~/g,
  
  /** 上标：^text^ */
  SUPERSCRIPT: /\^([^^]+)\^/g,
  
  /** 下标：~text~ */
  SUBSCRIPT: /~([^~]+)~/g,
  
  // ==================== 代码相关 ====================
  /** 行内代码：`code` */
  INLINE_CODE: /`([^`]+)`/g,
  
  /** 代码块：```lang\ncode\n``` */
  CODE_BLOCK: /```(\w*)\n([\s\S]+?)\n```/g,
} as const;

/**
 * Callout 类型配置
 */
export const CALLOUT_TYPES = {
  note: { icon: '📘', color: '#4A9EFF', label: '笔记' },
  info: { icon: 'ℹ️', color: '#4A9EFF', label: '信息' },
  tip: { icon: '💡', color: '#10B981', label: '提示' },
  success: { icon: '✅', color: '#10B981', label: '成功' },
  warning: { icon: '⚠️', color: '#F59E0B', label: '警告' },
  danger: { icon: '❌', color: '#EF4444', label: '危险' },
  error: { icon: '❗', color: '#EF4444', label: '错误' },
  question: { icon: '❓', color: '#8B5CF6', label: '问题' },
  quote: { icon: '💬', color: '#6B7280', label: '引用' },
  abstract: { icon: '📋', color: '#06B6D4', label: '摘要' },
  summary: { icon: '📝', color: '#06B6D4', label: '总结' },
} as const;

/**
 * 字符串工具函数
 */
export class StringUtils {
  /**
   * 转义正则表达式特殊字符
   */
  static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 转义 HTML 特殊字符
   */
  static escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, char => htmlEscapes[char]);
  }

  /**
   * 移除字符串首尾空白
   */
  static trimLines(str: string): string {
    return str.split('\n').map(line => line.trim()).join('\n');
  }

  /**
   * 检查字符串是否为空或仅包含空白
   */
  static isBlank(str: string): boolean {
    return !str || /^\s*$/.test(str);
  }
}

/**
 * 边界检测工具
 */
export class BoundaryDetector {
  /**
   * 检查位置是否在代码块内
   */
  static isInCodeBlock(content: string, position: number): boolean {
    const beforeContent = content.substring(0, position);
    const codeBlockStarts = (beforeContent.match(/```/g) || []).length;
    return codeBlockStarts % 2 === 1;
  }

  /**
   * 检查位置是否在行内代码内
   */
  static isInInlineCode(content: string, position: number): boolean {
    const beforeContent = content.substring(0, position);
    const lastLineBreak = beforeContent.lastIndexOf('\n');
    const currentLine = beforeContent.substring(lastLineBreak + 1);
    const backticks = (currentLine.match(/`/g) || []).length;
    return backticks % 2 === 1;
  }

  /**
   * 检查匹配是否应该被跳过（在代码块或行内代码中）
   */
  static shouldSkipMatch(content: string, matchIndex: number): boolean {
    return (
      this.isInCodeBlock(content, matchIndex) ||
      this.isInInlineCode(content, matchIndex)
    );
  }

  /**
   * 检查字符串是否可能是货币金额
   * 例如：$100, $99.99, $ 50
   */
  static isCurrencyAmount(match: string, context: string): boolean {
    // 检查 $ 后面是否紧跟数字
    const dollarMatch = /\$\s*(\d+(?:\.\d{1,2})?)/;
    if (dollarMatch.test(match)) {
      // 进一步检查上下文
      const afterMatch = context.substring(context.indexOf(match) + match.length);
      // 如果后面是空格、逗号、句号或行尾，更可能是货币
      if (/^[\s,，。.)]|$/.test(afterMatch)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * URL 编码工具
 */
export class UrlEncoder {
  /**
   * 生成 Obsidian 协议 URL
   */
  static createObsidianUrl(vaultName: string, filePath: string, heading?: string): string {
    const encodedVault = encodeURIComponent(vaultName);
    const encodedFile = encodeURIComponent(filePath);
    let url = `obsidian://open?vault=${encodedVault}&file=${encodedFile}`;
    
    if (heading) {
      const encodedHeading = encodeURIComponent(heading);
      url += `#${encodedHeading}`;
    }
    
    return url;
  }

  /**
   * 解析 Obsidian 内部链接路径
   */
  static parseWikiLink(wikiLink: string): { path: string; heading?: string; text?: string } {
    // 移除 [[ ]]
    let content = wikiLink.replace(/^\[\[|\]\]$/g, '');
    
    let text: string | undefined;
    let path: string;
    let heading: string | undefined;
    
    // 处理显示文本：path|text
    if (content.includes('|')) {
      const parts = content.split('|');
      content = parts[0];
      text = parts[1];
    }
    
    // 处理标题锚点：path#heading
    if (content.includes('#')) {
      const parts = content.split('#');
      path = parts[0];
      heading = parts[1];
    } else {
      path = content;
    }
    
    return { path, heading, text };
  }
}

/**
 * HTML 生成工具
 */
export class HtmlGenerator {
  /**
   * 生成链接标签
   */
  static createLink(href: string, text: string, styles?: Record<string, string>): string {
    const styleStr = styles
      ? ` style="${Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';')}"`
      : '';
    return `<a href="${href}"${styleStr}>${text}</a>`;
  }

  /**
   * 生成 div 容器
   */
  static createDiv(content: string, className?: string, styles?: Record<string, string>): string {
    const classStr = className ? ` class="${className}"` : '';
    const styleStr = styles
      ? ` style="${Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';')}"`
      : '';
    return `<div${classStr}${styleStr}>${content}</div>`;
  }

  /**
   * 生成内联样式字符串
   */
  static createInlineStyles(styles: Record<string, string>): string {
    return Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';');
  }
}


