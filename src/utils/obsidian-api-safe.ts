/**
 * Obsidian API 安全包装器
 * 解决 Svelte 5 与 Obsidian API 的兼容性问题
 */

import { Notice } from 'obsidian';
import { untrack } from 'svelte';

/**
 * 兼容性错误检测
 */
export function isObsidianCompatibilityError(error: Error): boolean {
  const message = error.message || '';
  const stack = error.stack || '';
  
  const patterns = [
    /isShown is not a function/,
    /hide is not a function/,
    /show is not a function/,
    /Cannot read properties of undefined \(reading 'isShown'\)/,
    /Cannot read properties of undefined \(reading 'hide'\)/,
    /Cannot read properties of undefined \(reading 'show'\)/
  ];
  
  return patterns.some(pattern => 
    pattern.test(message) || pattern.test(stack)
  );
}

/**
 * 安全的 Notice 包装器
 */
export class SafeNotice {
  private notice: Notice | null = null;
  private isDestroyed = false;

  constructor(message: string, timeout?: number) {
    try {
      // 使用 untrack 避免响应式系统干扰
      this.notice = untrack(() => new Notice(message, timeout));
    } catch (error) {
      console.warn('[SafeNotice] 创建 Notice 失败:', error);
      this.notice = null;
    }
  }

  /**
   * 安全隐藏 Notice
   */
  hide(): void {
    if (this.isDestroyed || !this.notice) {
      return;
    }

    try {
      // 检查 hide 方法是否存在且为函数
      if (this.notice && typeof this.notice.hide === 'function') {
        untrack(() => {
          this.notice!.hide();
        });
      } else if (this.notice && 'isShown' in this.notice) {
        // 尝试替代方案：检查 isShown 属性
        const isShown = (this.notice as any).isShown;
        if (typeof isShown === 'boolean' && isShown) {
          // 如果 Notice 仍然显示，尝试通过 DOM 操作隐藏
          this.hideViaDom();
        }
      }
    } catch (error) {
      if (isObsidianCompatibilityError(error as Error)) {
        console.warn('[SafeNotice] 兼容性问题，尝试替代方案:', error);
        this.hideViaDom();
      } else {
        console.error('[SafeNotice] 隐藏失败:', error);
      }
    }
  }

  /**
   * 通过 DOM 操作隐藏 Notice
   */
  private hideViaDom(): void {
    try {
      // 查找并隐藏相关的 Notice DOM 元素
      const noticeElements = document.querySelectorAll('.notice');
      noticeElements.forEach(element => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.style.display !== 'none') {
          htmlElement.style.display = 'none';
        }
      });
    } catch (domError) {
      console.warn('[SafeNotice] DOM 操作失败:', domError);
    }
  }

  /**
   * 检查 Notice 是否仍然显示
   */
  isShown(): boolean {
    if (this.isDestroyed || !this.notice) {
      return false;
    }

    try {
      // 安全检查 isShown 属性/方法
      if ('isShown' in this.notice) {
        const isShown = (this.notice as any).isShown;
        if (typeof isShown === 'function') {
          return untrack(() => isShown.call(this.notice));
        } else if (typeof isShown === 'boolean') {
          return isShown;
        }
      }
      
      // 如果无法确定，假设仍在显示
      return true;
    } catch (error) {
      console.warn('[SafeNotice] 检查显示状态失败:', error);
      return false;
    }
  }

  /**
   * 销毁 Notice
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.hide();
    this.isDestroyed = true;
    this.notice = null;
  }
}

/**
 * 安全创建 Notice
 */
export function createSafeNotice(message: string, timeout?: number): SafeNotice {
  return new SafeNotice(message, timeout);
}

/**
 * 安全的设置页面打开
 */
export function safeOpenSettings(app: any, tabId?: string): void {
  try {
    untrack(() => {
      if (app && app.setting && typeof app.setting.open === 'function') {
        app.setting.open();
        
        if (tabId && typeof app.setting.openTabById === 'function') {
          // 延迟打开特定标签，确保设置页面已加载
          setTimeout(() => {
            try {
              app.setting.openTabById(tabId);
            } catch (tabError) {
              console.warn('[SafeSettings] 打开标签失败:', tabError);
            }
          }, 100);
        }
      } else {
        console.warn('[SafeSettings] 设置 API 不可用');
      }
    });
  } catch (error) {
    console.error('[SafeSettings] 打开设置失败:', error);
  }
}

/**
 * 安全的 DOM 操作包装器
 */
export function safeDomOperation<T>(operation: () => T, fallback?: T): T | undefined {
  try {
    return untrack(() => operation());
  } catch (error) {
    if (isObsidianCompatibilityError(error as Error)) {
      console.warn('[SafeDOM] 兼容性问题，使用回退方案:', error);
      return fallback;
    } else {
      console.error('[SafeDOM] DOM 操作失败:', error);
      throw error;
    }
  }
}

/**
 * 安全的事件处理器包装
 */
export function safeEventHandler<T extends Event>(
  handler: (event: T) => void
): (event: T) => void {
  return (event: T) => {
    try {
      untrack(() => handler(event));
    } catch (error) {
      if (isObsidianCompatibilityError(error as Error)) {
        console.warn('[SafeEvent] 兼容性问题，忽略错误:', error);
      } else {
        console.error('[SafeEvent] 事件处理失败:', error);
        throw error;
      }
    }
  };
}

/**
 * 清理所有可能的兼容性问题
 */
export function cleanupCompatibilityIssues(): void {
  try {
    // 清理可能的错误标记
    const errorElements = document.querySelectorAll('[data-svelte-error]');
    errorElements.forEach(el => el.removeAttribute('data-svelte-error'));
    
    // 清理可能的隐藏 Notice
    const hiddenNotices = document.querySelectorAll('.notice[style*="display: none"]');
    hiddenNotices.forEach(el => el.remove());
    
    // 强制垃圾回收（如果可用）
    if (typeof window !== 'undefined' && (window as any).gc) {
      (window as any).gc();
    }
  } catch (error) {
    console.warn('[Cleanup] 清理过程中出现错误:', error);
  }
}
