/**
 * LaTeX数学公式渲染扩展
 * 为CodeMirror 6提供LaTeX数学公式的语法高亮和实时渲染支持
 * 修复导入问题后的版本
 * 
 * 功能：
 * 1. 行内数学公式 ($...$) 和块级数学公式 ($$...$$) 的语法高亮
 * 2. 实时预览渲染
 * 3. 错误处理和验证
 * 4. 可访问性支持
 */

import { RangeSetBuilder, type Extension, RangeSet } from "@codemirror/state";
import { EditorView, Decoration, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { ExtensionConfig, ExtensionLoader } from "../utils/dynamic-extension-manager";

/**
 * LaTeX数学公式配置接口
 */
export interface LatexMathConfig {
  enableInlineMath?: boolean;
  enableBlockMath?: boolean;
  enablePreview?: boolean;
  enableSyntaxHighlight?: boolean;
  inlineDelimiters?: [string, string];
  blockDelimiters?: [string, string];
  renderDelay?: number;
  maxFormulaLength?: number;
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * 数学公式匹配结果
 */
interface MathMatch {
  from: number;
  to: number;
  content: string;
  type: 'inline' | 'block';
  valid: boolean;
  error?: string;
}

/**
 * LaTeX数学公式渲染小部件
 */
class MathWidget extends WidgetType {
  constructor(
    private content: string,
    private type: 'inline' | 'block',
    private config: LatexMathConfig,
    private isValid: boolean = true,
    private error?: string
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const container = document.createElement(this.type === 'inline' ? 'span' : 'div');
    container.className = `cm-math-widget cm-math-${this.type}`;
    
    if (!this.isValid) {
      container.className += ' cm-math-error';
      container.textContent = this.content;
      container.title = this.error || 'Invalid LaTeX formula';
      return container;
    }

    if (this.config.enablePreview) {
      this.renderMath(container);
    } else {
      container.textContent = this.content;
      container.className += ' cm-math-source';
    }

    // 添加可访问性属性
    container.setAttribute('role', 'math');
    container.setAttribute('aria-label', `LaTeX formula: ${this.content}`);
    
    return container;
  }

  /**
   * 渲染数学公式
   */
  private renderMath(container: HTMLElement): void {
    try {
      // 这里需要集成实际的LaTeX渲染库，如KaTeX或MathJax
      // 为了演示，我们创建一个简单的占位符
      const mathElement = document.createElement('span');
      mathElement.className = 'cm-math-rendered';
      mathElement.textContent = `[Math: ${this.content}]`;
      
      // 实际实现中会使用KaTeX或MathJax进行渲染
      // 例如：katex.render(this.content, mathElement, { throwOnError: false });
      
      container.appendChild(mathElement);
      
      // 添加源码显示功能
      const sourceElement = document.createElement('span');
      sourceElement.className = 'cm-math-source';
      sourceElement.textContent = this.content;
      sourceElement.style.display = 'none';
      container.appendChild(sourceElement);
      
      // 添加切换功能
      container.addEventListener('click', (e) => {
        if (e.altKey) {
          const isShowingSource = sourceElement.style.display !== 'none';
          mathElement.style.display = isShowingSource ? 'inline' : 'none';
          sourceElement.style.display = isShowingSource ? 'none' : 'inline';
        }
      });
      
    } catch (error) {
      console.error('[LatexMath] 渲染失败:', error);
      container.textContent = this.content;
      container.className += ' cm-math-error';
      container.title = `Render error: ${error}`;
    }
  }

  eq(other: MathWidget): boolean {
    return other.content === this.content && 
           other.type === this.type && 
           other.isValid === this.isValid;
  }

  updateDOM(dom: HTMLElement): boolean {
    return false; // 总是重新创建
  }
}

/**
 * LaTeX数学公式视图插件
 */
class LatexMathViewPlugin {
  decorations: RangeSet<Decoration>;
  private config: LatexMathConfig;

  constructor(view: EditorView, config: LatexMathConfig) {
    this.config = config;
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  /**
   * 构建装饰
   */
  private buildDecorations(view: EditorView): RangeSet<Decoration> {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    const text = doc.toString();

    // 查找数学公式
    const matches = this.findMathFormulas(text);

    for (const match of matches) {
      if (match.from >= view.viewport.from && match.to <= view.viewport.to) {
        const widget = new MathWidget(
          match.content,
          match.type,
          this.config,
          match.valid,
          match.error
        );

        const decoration = Decoration.replace({
          widget,
          inclusive: false,
          block: match.type === 'block'
        });

        builder.add(match.from, match.to, decoration);
      }
    }

    return builder.finish();
  }

  /**
   * 查找数学公式
   */
  private findMathFormulas(text: string): MathMatch[] {
    const matches: MathMatch[] = [];

    if (this.config.enableBlockMath) {
      const blockMatches = this.findBlockMath(text);
      matches.push(...blockMatches);
    }

    if (this.config.enableInlineMath) {
      const inlineMatches = this.findInlineMath(text);
      matches.push(...inlineMatches);
    }

    // 按位置排序
    matches.sort((a, b) => a.from - b.from);

    return matches;
  }

  /**
   * 查找块级数学公式
   */
  private findBlockMath(text: string): MathMatch[] {
    const matches: MathMatch[] = [];
    const [startDelim, endDelim] = this.config.blockDelimiters || ['$$', '$$'];
    const regex = new RegExp(`\\${startDelim}([\\s\\S]*?)\\${endDelim}`, 'g');
    
    let match;
    while ((match = regex.exec(text)) !== null) {
      const content = match[1].trim();
      const validation = this.validateLatex(content);
      
      matches.push({
        from: match.index,
        to: match.index + match[0].length,
        content,
        type: 'block',
        valid: validation.valid,
        error: validation.error
      });
    }

    return matches;
  }

  /**
   * 查找行内数学公式
   */
  private findInlineMath(text: string): MathMatch[] {
    const matches: MathMatch[] = [];
    const [startDelim, endDelim] = this.config.inlineDelimiters || ['$', '$'];
    
    // 避免与块级公式冲突
    const cleanText = text.replace(/\$\$[\s\S]*?\$\$/g, (match) => ' '.repeat(match.length));
    
    const regex = new RegExp(`\\${startDelim}([^\\${startDelim}\\n]+?)\\${endDelim}`, 'g');
    
    let match;
    while ((match = regex.exec(cleanText)) !== null) {
      const content = match[1].trim();
      
      // 跳过空内容
      if (!content) continue;
      
      const validation = this.validateLatex(content);
      
      matches.push({
        from: match.index,
        to: match.index + match[0].length,
        content,
        type: 'inline',
        valid: validation.valid,
        error: validation.error
      });
    }

    return matches;
  }

  /**
   * 验证LaTeX语法
   */
  private validateLatex(content: string): { valid: boolean; error?: string } {
    // 基本验证
    if (!content.trim()) {
      return { valid: false, error: 'Empty formula' };
    }

    if (this.config.maxFormulaLength && content.length > this.config.maxFormulaLength) {
      return { valid: false, error: 'Formula too long' };
    }

    // 检查括号匹配
    const brackets = ['{', '}', '[', ']', '(', ')'];
    const stack: string[] = [];
    
    for (const char of content) {
      if (brackets.includes(char)) {
        if (char === '{' || char === '[' || char === '(') {
          stack.push(char);
        } else {
          const last = stack.pop();
          const pairs = { '}': '{', ']': '[', ')': '(' };
          if (!last || pairs[char as keyof typeof pairs] !== last) {
            return { valid: false, error: 'Mismatched brackets' };
          }
        }
      }
    }

    if (stack.length > 0) {
      return { valid: false, error: 'Unclosed brackets' };
    }

    // 检查常见的LaTeX命令
    const invalidCommands = content.match(/\\[a-zA-Z]+/g);
    if (invalidCommands) {
      // 这里可以添加更严格的命令验证
      // 目前只做基本检查
    }

    return { valid: true };
  }
}

/**
 * LaTeX语法高亮样式
 */
const latexHighlightStyle = HighlightStyle.define([
  { tag: tags.special(tags.string), color: '#d73a49', fontWeight: 'bold' }, // 分隔符
  { tag: tags.string, color: '#032f62' }, // 公式内容
  { tag: tags.keyword, color: '#6f42c1' }, // LaTeX命令
  { tag: tags.operator, color: '#d73a49' }, // 操作符
  { tag: tags.number, color: '#005cc5' }, // 数字
  { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' }, // 注释
]);

/**
 * 创建LaTeX数学公式扩展
 */
export function createLatexMathExtension(config: LatexMathConfig = {}): Extension {
  const finalConfig: LatexMathConfig = {
    enableInlineMath: true,
    enableBlockMath: true,
    enablePreview: true,
    enableSyntaxHighlight: true,
    inlineDelimiters: ['$', '$'],
    blockDelimiters: ['$$', '$$'],
    renderDelay: 300,
    maxFormulaLength: 1000,
    theme: 'auto',
    ...config
  };

  const extensions: Extension[] = [];

  // 添加语法高亮
  if (finalConfig.enableSyntaxHighlight) {
    extensions.push(syntaxHighlighting(latexHighlightStyle));
  }

  // 添加视图插件
  extensions.push(
    ViewPlugin.fromClass(
      class extends LatexMathViewPlugin {
        constructor(view: EditorView) {
          super(view, finalConfig);
        }
      },
      {
        decorations: (v) => v.decorations
      }
    )
  );

  // 添加主题样式
  extensions.push(
    EditorView.theme({
      '.cm-math-widget': {
        display: 'inline-block',
        margin: '2px',
        padding: '2px 4px',
        borderRadius: '3px',
        backgroundColor: 'var(--cm-editor-active-line)',
        border: '1px solid var(--cm-editor-border)',
      },
      '.cm-math-block': {
        display: 'block',
        margin: '8px 0',
        padding: '8px 12px',
        textAlign: 'center',
      },
      '.cm-math-inline': {
        display: 'inline',
        margin: '0 2px',
        padding: '1px 3px',
      },
      '.cm-math-error': {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        color: 'var(--text-error)',
      },
      '.cm-math-rendered': {
        fontFamily: 'KaTeX_Main, "Times New Roman", serif',
      },
      '.cm-math-source': {
        fontFamily: 'var(--font-monospace)',
        fontSize: '0.9em',
        color: 'var(--cm-syntax-string)',
      },
      // 高对比度模式支持
      '@media (prefers-contrast: high)': {
        '.cm-math-widget': {
          borderWidth: '2px',
        },
        '.cm-math-error': {
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          borderColor: 'rgba(239, 68, 68, 0.6)',
        }
      }
    })
  );

  return extensions;
}

/**
 * LaTeX扩展加载器
 */
export class LatexExtensionLoader implements ExtensionLoader {
  async load(config: ExtensionConfig): Promise<Extension> {
    const latexConfig = config.config as LatexMathConfig || {};
    return createLatexMathExtension(latexConfig);
  }

  async configure(config: ExtensionConfig): Promise<Extension> {
    return this.load(config);
  }

  async unload(extensionId: string): Promise<void> {
    // LaTeX扩展的清理逻辑
    console.log(`[LatexExtension] 卸载扩展: ${extensionId}`);
  }
}

/**
 * 默认LaTeX扩展配置
 */
export const defaultLatexConfig: ExtensionConfig = {
  id: 'latex-math',
  name: 'LaTeX Math Formulas',
  description: 'LaTeX数学公式渲染支持',
  version: '1.0.0',
  enabled: true,
  config: {
    enableInlineMath: true,
    enableBlockMath: true,
    enablePreview: true,
    enableSyntaxHighlight: true,
    renderDelay: 300,
    maxFormulaLength: 1000,
    theme: 'auto'
  } as LatexMathConfig
};
