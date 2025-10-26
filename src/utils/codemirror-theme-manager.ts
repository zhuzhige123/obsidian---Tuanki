/**
 * CodeMirror 主题管理器
 * 统一管理CodeMirror编辑器的主题应用和切换
 * 
 * 功能：
 * 1. 自动检测和应用主题
 * 2. 动态更新编辑器主题
 * 3. 提供主题相关的扩展
 * 4. 集成统一主题管理器
 */

import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { UnifiedThemeManager, type ThemeDetectionResult } from "./theme-detection";

/**
 * CodeMirror 主题配置接口
 */
export interface CodeMirrorThemeConfig {
  minHeight?: number;
  maxHeight?: number;
  enableBorder?: boolean;
  enableShadow?: boolean;
  borderRadius?: number;
  fontSize?: number;
  lineHeight?: number;
}

/**
 * CodeMirror 主题管理器
 * 负责管理CodeMirror编辑器的主题应用和动态切换
 */
export class CodeMirrorThemeManager {
  private static instance: CodeMirrorThemeManager;
  private themeCompartment = new Compartment();
  private unifiedThemeManager: UnifiedThemeManager;
  private activeEditors = new Map<string, EditorView>();
  private themeCleanupCallbacks = new Map<string, () => void>();

  private constructor() {
    this.unifiedThemeManager = UnifiedThemeManager.getInstance();
    this.setupGlobalThemeListener();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): CodeMirrorThemeManager {
    if (!CodeMirrorThemeManager.instance) {
      CodeMirrorThemeManager.instance = new CodeMirrorThemeManager();
    }
    return CodeMirrorThemeManager.instance;
  }

  /**
   * 设置全局主题监听器
   */
  private setupGlobalThemeListener(): void {
    this.unifiedThemeManager.addListener((themeResult) => {
      console.debug('[CodeMirrorThemeManager] 全局主题变化:', themeResult);
      this.updateAllEditorsTheme(themeResult);
    });
  }

  /**
   * 创建主题扩展
   */
  createThemeExtension(config: CodeMirrorThemeConfig = {}): Extension {
    const currentTheme = this.unifiedThemeManager.getCurrentTheme();
    const themeExtension = this.buildThemeExtension(currentTheme, config);
    
    return this.themeCompartment.of(themeExtension);
  }

  /**
   * 注册编辑器实例
   */
  registerEditor(editorId: string, editorView: EditorView, config: CodeMirrorThemeConfig = {}): void {
    this.activeEditors.set(editorId, editorView);
    
    // 设置主题监听器
    const cleanup = this.unifiedThemeManager.addListener((themeResult) => {
      this.updateEditorTheme(editorId, themeResult, config);
    });
    
    this.themeCleanupCallbacks.set(editorId, cleanup);
    
    console.debug(`[CodeMirrorThemeManager] 注册编辑器: ${editorId}`);
  }

  /**
   * 注销编辑器实例
   */
  unregisterEditor(editorId: string): void {
    this.activeEditors.delete(editorId);
    
    // 清理主题监听器
    const cleanup = this.themeCleanupCallbacks.get(editorId);
    if (cleanup) {
      cleanup();
      this.themeCleanupCallbacks.delete(editorId);
    }
    
    console.debug(`[CodeMirrorThemeManager] 注销编辑器: ${editorId}`);
  }

  /**
   * 更新特定编辑器的主题
   */
  private updateEditorTheme(
    editorId: string, 
    themeResult: ThemeDetectionResult, 
    config: CodeMirrorThemeConfig
  ): void {
    const editorView = this.activeEditors.get(editorId);
    if (!editorView) {
      console.warn(`[CodeMirrorThemeManager] 编辑器未找到: ${editorId}`);
      return;
    }

    try {
      const themeExtension = this.buildThemeExtension(themeResult, config);
      
      editorView.dispatch({
        effects: this.themeCompartment.reconfigure(themeExtension)
      });
      
      console.debug(`[CodeMirrorThemeManager] 更新编辑器主题: ${editorId}`, {
        isDark: themeResult.isDark,
        source: themeResult.source
      });
    } catch (error) {
      console.error(`[CodeMirrorThemeManager] 更新编辑器主题失败: ${editorId}`, error);
    }
  }

  /**
   * 更新所有编辑器的主题
   */
  private updateAllEditorsTheme(themeResult: ThemeDetectionResult): void {
    for (const [editorId, editorView] of this.activeEditors) {
      try {
        // 使用默认配置更新主题
        const themeExtension = this.buildThemeExtension(themeResult, {});
        
        editorView.dispatch({
          effects: this.themeCompartment.reconfigure(themeExtension)
        });
      } catch (error) {
        console.error(`[CodeMirrorThemeManager] 批量更新编辑器主题失败: ${editorId}`, error);
      }
    }
  }

  /**
   * 构建主题扩展
   */
  private buildThemeExtension(themeResult: ThemeDetectionResult, config: CodeMirrorThemeConfig): Extension {
    const {
      minHeight = 80,
      maxHeight,
      enableBorder = true,
      enableShadow = false,
      borderRadius = 8,
      fontSize = 14,
      lineHeight = 1.6
    } = config;

    // 获取主题特定的颜色
    const colors = this.getThemeColors(themeResult);

    return EditorView.theme({
      '&': {
        fontSize: `${fontSize}px`,
        fontFamily: 'var(--font-text, var(--font-default))',
        backgroundColor: colors.editorBg,
        color: colors.editorText,
        borderRadius: enableBorder ? `${borderRadius}px` : '0',
        border: enableBorder ? `1px solid ${colors.editorBorder}` : 'none',
        boxShadow: enableShadow ? '0 2px 8px rgba(0, 0, 0, 0.1)' : 'none',
      },
      '.cm-content': {
        padding: 'var(--tuanki-space-md, 12px) var(--tuanki-space-lg, 16px)',
        minHeight: `${minHeight}px`,
        maxHeight: maxHeight ? `${maxHeight}px` : 'none',
        lineHeight: `${lineHeight}`,
        caretColor: colors.editorCursor,
      },
      '.cm-focused': {
        outline: 'none',
        borderColor: enableBorder ? colors.focusBorder : 'transparent',
        boxShadow: enableBorder ? `0 0 0 2px ${colors.focusRing}` : 'none',
      },
      '.cm-editor': {
        background: 'transparent',
      },
      '.cm-scroller': {
        fontFamily: 'inherit',
        background: 'transparent',
      },
      '.cm-line': {
        padding: '0 2px',
        lineHeight: 'inherit',
      },
      '.cm-activeLine': {
        backgroundColor: colors.activeLine,
      },
      '.cm-selectionBackground': {
        backgroundColor: `${colors.selection} !important`,
      },
      '.cm-cursor': {
        borderLeftColor: colors.editorCursor,
        borderLeftWidth: '2px',
      },
      // 行号和装订线
      '.cm-gutters': {
        backgroundColor: colors.gutterBg,
        color: colors.gutterText,
        border: 'none',
        borderRight: enableBorder ? `1px solid ${colors.editorBorder}` : 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        color: colors.lineNumber,
        fontSize: 'var(--tuanki-font-size-sm, 12px)',
        minWidth: '3ch',
        textAlign: 'right',
        paddingRight: 'var(--tuanki-space-sm, 8px)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: colors.activeLine,
      },
      '.cm-activeLineGutter .cm-gutterElement': {
        color: colors.lineNumberActive,
        fontWeight: '500',
      },
      // 语法高亮
      '.cm-keyword': { color: colors.syntax.keyword, fontWeight: '500' },
      '.cm-string': { color: colors.syntax.string },
      '.cm-comment': { color: colors.syntax.comment, fontStyle: 'italic' },
      '.cm-number': { color: colors.syntax.number },
      '.cm-operator': { color: colors.syntax.operator },
      '.cm-punctuation': { color: colors.syntax.punctuation },
      '.cm-tag': { color: colors.syntax.tag },
      '.cm-attribute': { color: colors.syntax.attribute },
      '.cm-link': { color: colors.syntax.link, textDecoration: 'underline' },
      // Markdown 特定样式
      '.cm-header': { color: colors.syntax.keyword, fontWeight: 'bold' },
      '.cm-strong': { fontWeight: 'bold', color: colors.editorText },
      '.cm-emphasis': { fontStyle: 'italic', color: colors.editorText },
      '.cm-strikethrough': { textDecoration: 'line-through' },
      '.cm-inlineCode': {
        backgroundColor: colors.activeLine,
        color: colors.syntax.string,
        padding: '2px 4px',
        borderRadius: '3px',
        fontFamily: 'var(--font-monospace)',
        fontSize: '0.9em',
      },
    });
  }

  /**
   * 获取主题特定的颜色配置
   */
  private getThemeColors(themeResult: ThemeDetectionResult) {
    const isDark = themeResult.isDark;

    return {
      // 编辑器基础颜色
      editorBg: isDark ? '#1a1a1a' : '#ffffff',
      editorText: isDark ? '#e1e4e8' : '#24292e',
      editorBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(17, 24, 39, 0.15)',
      editorCursor: '#8b5cf6',
      
      // 交互状态颜色
      focusBorder: '#8b5cf6',
      focusRing: 'rgba(139, 92, 246, 0.1)',
      selection: isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.2)',
      activeLine: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(17, 24, 39, 0.03)',
      
      // 装订线颜色
      gutterBg: isDark ? '#0d1117' : '#f8f9fa',
      gutterText: isDark ? '#7d8590' : '#6b7280',
      lineNumber: isDark ? '#6e7681' : '#9ca3af',
      lineNumberActive: isDark ? '#adbac7' : '#6b7280',
      
      // 语法高亮颜色
      syntax: {
        keyword: isDark ? '#ff7b72' : '#d73a49',
        string: isDark ? '#a5d6ff' : '#032f62',
        comment: isDark ? '#8b949e' : '#6a737d',
        number: isDark ? '#79c0ff' : '#005cc5',
        operator: isDark ? '#ff7b72' : '#d73a49',
        punctuation: isDark ? '#e1e4e8' : '#24292e',
        tag: isDark ? '#7ee787' : '#22863a',
        attribute: isDark ? '#d2a8ff' : '#6f42c1',
        link: isDark ? '#58a6ff' : '#0366d6',
      }
    };
  }

  /**
   * 获取当前主题信息
   */
  getCurrentTheme(): ThemeDetectionResult {
    return this.unifiedThemeManager.getCurrentTheme();
  }

  /**
   * 销毁主题管理器
   */
  destroy(): void {
    // 清理所有编辑器的监听器
    for (const cleanup of this.themeCleanupCallbacks.values()) {
      cleanup();
    }
    
    this.activeEditors.clear();
    this.themeCleanupCallbacks.clear();
    
    console.debug('[CodeMirrorThemeManager] 主题管理器已销毁');
  }
}
