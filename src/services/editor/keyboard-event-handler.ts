/**
 * 键盘事件处理器
 * 
 * 负责管理编辑器的键盘事件，确保：
 * 1. Obsidian原生快捷键正常工作
 * 2. 自定义快捷键（Ctrl+Enter, Escape）正常工作
 * 3. 事件正确传播，不干扰CodeMirror
 */

import type { KeyboardEventHandlerOptions, KeyboardEventContext } from '../../types/editor-types';

export class KeyboardEventHandler {
  private options: KeyboardEventHandlerOptions;
  private editorElement: HTMLElement | null = null;
  private boundHandler: ((event: KeyboardEvent) => void) | null = null;
  
  // Obsidian原生快捷键列表（参考）
  private readonly OBSIDIAN_SHORTCUTS = new Set([
    'b', 'i', 'k', 'e', 'd', 'h',  // 格式化快捷键
    '[', ']',  // 缩进
    'z', 'y',  // 撤销/重做
    'f', 'g',  // 查找/跳转
    'p', 'o',  // 命令面板/快速切换
    'n', 't',  // 新建/标签
    'w', 'q',  // 关闭
    's',       // 保存
    'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',  // 导航
    'PageUp', 'PageDown',
    'Tab', 'Enter', 'Backspace', 'Delete'
  ]);

  constructor(options: KeyboardEventHandlerOptions) {
    this.options = options;
    this.log('KeyboardEventHandler initialized', { options });
  }

  /**
   * 附加到编辑器元素
   */
  public attach(editorElement: HTMLElement): void {
    if (this.editorElement) {
      this.log('Warning: Already attached, detaching first');
      this.detach();
    }

    this.editorElement = editorElement;
    this.boundHandler = this.handleKeydown.bind(this);
    
    // 使用 capture: false 确保 CodeMirror 的监听器优先
    editorElement.addEventListener('keydown', this.boundHandler, { 
      capture: false,
      passive: false  // 需要能够 preventDefault
    });
    
    this.log('Attached to editor element');
  }

  /**
   * 从编辑器元素分离
   */
  public detach(): void {
    if (this.editorElement && this.boundHandler) {
      this.editorElement.removeEventListener('keydown', this.boundHandler);
      this.log('Detached from editor element');
    }
    
    this.editorElement = null;
    this.boundHandler = null;
  }

  /**
   * 键盘事件处理函数
   */
  private handleKeydown(event: KeyboardEvent): void {
    const context = this.getEventContext(event);
    
    // 记录事件用于调试
    this.log('Keydown event', {
      key: event.key,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
      context
    });

    // 检查是否应该处理此事件
    if (!this.shouldHandleEvent(event, context)) {
      this.log('Event ignored - should not handle');
      return;
    }

    // 检查自定义快捷键
    if (this.handleCustomShortcut(event)) {
      this.log('Custom shortcut handled');
      return;
    }

    // 处理内置快捷键
    if (this.handleBuiltinShortcut(event)) {
      this.log('Builtin shortcut handled');
      return;
    }

    // 检查是否是Obsidian快捷键
    if (this.isObsidianShortcut(event)) {
      this.log('Obsidian shortcut detected - letting it pass through');
      // 完全放行，让CodeMirror和Obsidian处理
      return;
    }

    // 其他所有键也放行
    this.log('Regular key - letting it pass through');
  }

  /**
   * 处理自定义快捷键
   */
  private handleCustomShortcut(event: KeyboardEvent): boolean {
    if (!this.options.customShortcuts) {
      return false;
    }

    const shortcutKey = this.buildShortcutKey(event);
    const handler = this.options.customShortcuts.get(shortcutKey);
    
    if (handler) {
      event.preventDefault();
      // 不调用 stopPropagation()，让其他监听器也能处理
      const shouldStopPropagation = handler();
      
      if (shouldStopPropagation === false) {
        event.stopPropagation();
      }
      
      return true;
    }

    return false;
  }

  /**
   * 处理内置快捷键（Ctrl+Enter保存，Escape取消）
   */
  private handleBuiltinShortcut(event: KeyboardEvent): boolean {
    // Ctrl/Cmd + Enter: 保存
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      // ✅ 关键：不调用 stopPropagation()，让事件继续传播
      this.log('Save shortcut triggered');
      this.options.onSave();
      return true;
    }

    // Escape: 取消
    if (event.key === 'Escape') {
      event.preventDefault();
      // ✅ 关键：不调用 stopPropagation()，让事件继续传播
      this.log('Cancel shortcut triggered');
      this.options.onCancel();
      return true;
    }

    return false;
  }

  /**
   * 判断是否是Obsidian快捷键
   */
  private isObsidianShortcut(event: KeyboardEvent): boolean {
    // 如果有自定义的允许列表，使用它
    if (this.options.allowedObsidianShortcuts) {
      const key = event.key.toLowerCase();
      return this.options.allowedObsidianShortcuts.has(key);
    }

    // 否则使用默认列表
    const key = event.key.toLowerCase();
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
    
    // Ctrl/Cmd + key 的组合
    if (hasModifier && this.OBSIDIAN_SHORTCUTS.has(key)) {
      return true;
    }

    // 导航键
    if (this.OBSIDIAN_SHORTCUTS.has(event.key)) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否应该处理此事件
   */
  private shouldHandleEvent(event: KeyboardEvent, context: KeyboardEventContext): boolean {
    // 如果事件不在编辑器内，不处理
    if (!context.isInEditor) {
      return false;
    }

    // 如果焦点在特殊元素上（如输入框、下拉框），不处理
    const target = event.target as HTMLElement;
    if (target) {
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' && target !== this.editorElement) {
        // 如果是编辑器外的input，不处理
        return false;
      }
      if (tagName === 'select' || tagName === 'textarea') {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取事件上下文信息
   */
  private getEventContext(event: KeyboardEvent): KeyboardEventContext {
    const target = event.target as HTMLElement;
    const activeElement = document.activeElement as HTMLElement;
    
    // 检查事件是否发生在编辑器内
    const isInEditor = this.editorElement 
      ? this.editorElement.contains(target)
      : false;
    
    // 检查编辑器是否获得焦点
    const isFocused = this.editorElement
      ? this.editorElement.contains(activeElement) || this.editorElement === activeElement
      : false;

    return {
      isInEditor,
      isFocused,
      activeElement,
      target
    };
  }

  /**
   * 构建快捷键标识符
   */
  private buildShortcutKey(event: KeyboardEvent): string {
    const parts: string[] = [];
    
    if (event.ctrlKey || event.metaKey) parts.push('Mod');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    parts.push(event.key);
    
    return parts.join('+').toLowerCase();
  }

  /**
   * 调试日志
   */
  private log(message: string, data?: any): void {
    if (this.options.debug) {
      console.log(`[KeyboardEventHandler] ${message}`, data || '');
    }
  }
}







