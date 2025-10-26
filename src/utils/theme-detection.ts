/**
 * 统一的主题检测和管理工具
 * 确保所有组件使用一致的主题检测逻辑
 *
 * 修复问题：
 * 1. 统一主题检测优先级
 * 2. 解决不同检测方式的冲突
 * 3. 提供更可靠的主题状态管理
 */

// 导入Svelte 5的响应式原语
import { untrack } from 'svelte';

/**
 * 主题类型定义
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

/**
 * 主题检测结果
 */
export interface ThemeDetectionResult {
  mode: ThemeMode;
  isDark: boolean;
  source: 'obsidian-class' | 'system-preference' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 统一主题管理器
 * 单例模式，确保全局一致的主题状态
 */
export class UnifiedThemeManager {
  private static instance: UnifiedThemeManager;
  private currentTheme: ThemeDetectionResult;
  private listeners: Array<(result: ThemeDetectionResult) => void> = [];
  private mediaQuery: MediaQueryList;
  private domObserver: MutationObserver;
  private isInitialized = false;

  private constructor() {
    this.currentTheme = this.detectTheme();
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.domObserver = new MutationObserver(() => this.handleThemeChange());
    this.initialize();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): UnifiedThemeManager {
    if (!UnifiedThemeManager.instance) {
      UnifiedThemeManager.instance = new UnifiedThemeManager();
    }
    return UnifiedThemeManager.instance;
  }

  /**
   * 初始化主题管理器
   */
  private initialize(): void {
    if (this.isInitialized) return;

    // 监听系统主题变化
    this.mediaQuery.addEventListener('change', () => this.handleThemeChange());

    // 监听 DOM 类变化（Obsidian 主题切换）
    this.domObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    this.domObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    this.isInitialized = true;
  }

  /**
   * 检测当前主题
   * 改进的检测逻辑，提供更详细的检测结果
   */
  private detectTheme(): ThemeDetectionResult {
    // 优先级1: 检查 document.documentElement 的 Obsidian 主题类
    if (document.documentElement.classList.contains('theme-dark')) {
      return {
        mode: 'dark',
        isDark: true,
        source: 'obsidian-class',
        confidence: 'high'
      };
    }

    if (document.documentElement.classList.contains('theme-light')) {
      return {
        mode: 'light',
        isDark: false,
        source: 'obsidian-class',
        confidence: 'high'
      };
    }

    // 优先级2: 检查 document.body 的 Obsidian 主题类
    if (document.body.classList.contains('theme-dark')) {
      return {
        mode: 'dark',
        isDark: true,
        source: 'obsidian-class',
        confidence: 'medium'
      };
    }

    if (document.body.classList.contains('theme-light')) {
      return {
        mode: 'light',
        isDark: false,
        source: 'obsidian-class',
        confidence: 'medium'
      };
    }

    // 优先级3: 系统偏好设置
    const systemPrefersDark = this.mediaQuery.matches;
    return {
      mode: 'auto',
      isDark: systemPrefersDark,
      source: 'system-preference',
      confidence: 'medium'
    };
  }

  /**
   * 处理主题变化
   */
  private handleThemeChange(): void {
    const newTheme = this.detectTheme();

    // 只有在主题真正发生变化时才通知监听器
    if (this.hasThemeChanged(this.currentTheme, newTheme)) {
      const oldTheme = this.currentTheme;
      this.currentTheme = newTheme;

      console.debug('[ThemeManager] 主题变化:', {
        from: oldTheme,
        to: newTheme
      });

      // 通知所有监听器
      this.listeners.forEach(listener => {
        try {
          listener(newTheme);
        } catch (error) {
          console.error('[ThemeManager] 监听器执行失败:', error);
        }
      });
    }
  }

  /**
   * 检查主题是否发生变化
   */
  private hasThemeChanged(oldTheme: ThemeDetectionResult, newTheme: ThemeDetectionResult): boolean {
    return oldTheme.isDark !== newTheme.isDark ||
           oldTheme.mode !== newTheme.mode ||
           oldTheme.source !== newTheme.source;
  }

  /**
   * 获取当前主题状态
   */
  getCurrentTheme(): ThemeDetectionResult {
    return { ...this.currentTheme };
  }

  /**
   * 检测当前是否为深色模式（向后兼容）
   */
  isDarkMode(): boolean {
    return this.currentTheme.isDark;
  }

  /**
   * 添加主题变化监听器
   */
  addListener(callback: (result: ThemeDetectionResult) => void): () => void {
    this.listeners.push(callback);

    // 立即调用一次，确保监听器获得当前状态
    try {
      callback(this.currentTheme);
    } catch (error) {
      console.error('[ThemeManager] 初始监听器调用失败:', error);
    }

    // 返回清理函数
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * 销毁主题管理器（用于测试或特殊情况）
   */
  destroy(): void {
    this.mediaQuery.removeEventListener('change', () => this.handleThemeChange());
    this.domObserver.disconnect();
    this.listeners.length = 0;
    this.isInitialized = false;
  }
}

/**
 * 检测当前是否为深色模式（向后兼容函数）
 * @deprecated 建议使用 UnifiedThemeManager.getInstance().isDarkMode()
 */
export function isDarkMode(): boolean {
  return UnifiedThemeManager.getInstance().isDarkMode();
}

/**
 * 创建主题变化监听器（向后兼容函数）
 * @deprecated 建议使用 UnifiedThemeManager.getInstance().addListener()
 */
export function createThemeListener(callback: (isDark: boolean) => void): () => void {
  const themeManager = UnifiedThemeManager.getInstance();

  return themeManager.addListener((result) => {
    callback(result.isDark);
  });
}

/**
 * 响应式主题状态
 * 创建一个可以在组件中使用的响应式主题状态对象
 * 改进版本，使用新的主题管理器
 */
export function createReactiveThemeState() {
  const themeManager = UnifiedThemeManager.getInstance();
  let currentResult = themeManager.getCurrentTheme();
  let themeVersion = 0;
  let cleanup: (() => void) | null = null;

  // 初始化监听器
  const initListener = () => {
    if (cleanup) cleanup(); // 清理之前的监听器

    cleanup = themeManager.addListener((newResult) => {
      currentResult = newResult;
      themeVersion++;
    });
  };

  // 立即初始化
  initListener();

  return {
    get isDark() { return currentResult.isDark; },
    get mode() { return currentResult.mode; },
    get source() { return currentResult.source; },
    get confidence() { return currentResult.confidence; },
    get version() { return themeVersion; },
    get result() { return { ...currentResult }; },

    // 提供手动清理方法
    destroy() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },

    // 提供手动重新初始化方法
    reinit() {
      initListener();
    }
  };
}

/**
 * 获取主题相关的 CSS 类名
 * 改进版本，使用新的主题管理器
 */
export function getThemeClasses(): string[] {
  const themeManager = UnifiedThemeManager.getInstance();
  const result = themeManager.getCurrentTheme();
  const classes: string[] = [];

  if (result.isDark) {
    classes.push('theme-dark');
  } else {
    classes.push('theme-light');
  }

  // 添加主题来源信息（用于调试）
  classes.push(`theme-source-${result.source}`);
  classes.push(`theme-confidence-${result.confidence}`);

  return classes;
}

/**
 * 为组件添加主题类
 * 改进版本，支持动态主题更新
 */
export function addThemeClasses(element: HTMLElement): () => void {
  const themeManager = UnifiedThemeManager.getInstance();

  // 立即应用当前主题类
  const updateClasses = () => {
    // 先移除旧的主题类
    removeThemeClasses(element);

    // 添加新的主题类
    const classes = getThemeClasses();
    element.classList.add(...classes);
  };

  updateClasses();

  // 监听主题变化并自动更新类
  const cleanup = themeManager.addListener(() => {
    updateClasses();
  });

  return cleanup;
}

/**
 * 移除组件的主题类
 * 改进版本，移除所有相关的主题类
 */
export function removeThemeClasses(element: HTMLElement): void {
  // 移除基础主题类
  element.classList.remove('theme-dark', 'theme-light');

  // 移除主题来源类
  element.classList.remove(
    'theme-source-obsidian-class',
    'theme-source-system-preference',
    'theme-source-fallback'
  );

  // 移除置信度类
  element.classList.remove(
    'theme-confidence-high',
    'theme-confidence-medium',
    'theme-confidence-low'
  );
}

/**
 * 获取主题特定的CSS变量值
 */
export function getThemeVariables(): Record<string, string> {
  const themeManager = UnifiedThemeManager.getInstance();
  const result = themeManager.getCurrentTheme();

  const baseVariables = {
    '--editor-font-family': 'var(--font-text, "Inter", sans-serif)',
    '--editor-font-size': '14px',
    '--editor-line-height': '1.6',
  };

  const themeVariables = result.isDark ? {
    '--editor-bg': '#1a1a1a',
    '--editor-text': '#e1e4e8',
    '--editor-border': 'rgba(255, 255, 255, 0.15)',
    '--editor-cursor': '#8b5cf6',
    '--editor-selection': 'rgba(139, 92, 246, 0.25)',
    '--editor-active-line': 'rgba(255, 255, 255, 0.05)',
  } : {
    '--editor-bg': '#ffffff',
    '--editor-text': '#24292e',
    '--editor-border': 'rgba(17, 24, 39, 0.15)',
    '--editor-cursor': '#8b5cf6',
    '--editor-selection': 'rgba(139, 92, 246, 0.2)',
    '--editor-active-line': 'rgba(17, 24, 39, 0.03)',
  };

  return { ...baseVariables, ...themeVariables };
}

/**
 * 应用主题变量到元素
 */
export function applyThemeVariables(element: HTMLElement): () => void {
  const themeManager = UnifiedThemeManager.getInstance();

  const updateVariables = () => {
    const variables = getThemeVariables();
    Object.entries(variables).forEach(([property, value]) => {
      element.style.setProperty(property, value);
    });
  };

  updateVariables();

  // 监听主题变化并自动更新变量
  const cleanup = themeManager.addListener(() => {
    updateVariables();
  });

  return cleanup;
}
