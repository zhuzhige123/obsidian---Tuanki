/**
 * 嵌入式编辑器管理器
 * 
 * 负责管理嵌入式Obsidian编辑器的完整生命周期：
 * 1. 创建隐藏的Leaf和编辑器实例
 * 2. 提取编辑器DOM并嵌入到自定义容器
 * 3. 管理键盘事件和布局
 * 4. 修复z-index和右键菜单问题
 * 5. 清理资源
 */

import { TFile, WorkspaceLeaf } from 'obsidian';
import type AnkiPlugin from '../../main';
import type { EditorOptions, EditorResult } from '../../types/editor-types';
import { KeyboardEventHandler } from './keyboard-event-handler';
import { EditorLayoutManager } from './editor-layout-manager';

export class EmbeddedEditorManager {
  private plugin: AnkiPlugin;
  private leaf: WorkspaceLeaf | null = null;
  private editor: any | null = null;
  private editorElement: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private keyboardHandler: KeyboardEventHandler | null = null;
  private layoutManager: EditorLayoutManager | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private menuObserver: MutationObserver | null = null;
  private debug: boolean = false;

  constructor(plugin: AnkiPlugin, debug: boolean = false) {
    this.plugin = plugin;
    this.debug = debug;
    this.log('EmbeddedEditorManager created');
  }

  /**
   * 创建嵌入式编辑器
   */
  public async create(
    container: HTMLElement,
    file: TFile,
    options: EditorOptions
  ): Promise<EditorResult> {
    try {
      this.log('Creating embedded editor', { file: file.path, options });
      this.container = container;
      this.debug = options.debug || false;

      // 1. 创建Leaf
      this.leaf = await this.createLeaf(file);
      
      // 2. 提取编辑器DOM
      this.editorElement = this.extractEditorDOM(this.leaf);
      if (!this.editorElement) {
        throw new Error('Failed to extract editor DOM');
      }

      // 3. 设置编辑器
      await this.setupEditor(this.editorElement, options);

      // 4. 返回结果
      return {
        success: true,
        cleanup: this.destroy.bind(this),
        getContent: this.getContent.bind(this),
        setContent: this.setContent.bind(this),
        focus: this.focusEditor.bind(this)
      };

    } catch (error) {
      this.log('Error creating embedded editor', error);
      
      // 清理已创建的资源
      this.destroy();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cleanup: () => {},
        getContent: () => '',
        setContent: () => {},
        focus: () => {}
      };
    }
  }

  /**
   * 创建Leaf
   */
  private async createLeaf(file: TFile): Promise<WorkspaceLeaf> {
    this.log('Creating leaf for file', { path: file.path });

    // 创建隐藏的leaf
    const leaf = this.plugin.app.workspace.createLeafInParent(
      this.plugin.app.workspace.rootSplit,
      0
    );

    // 打开文件（不激活）
    await leaf.openFile(file, { active: false });

    // 隐藏Leaf的UI
    this.hideLeafUI(leaf);

    this.log('Leaf created and hidden');
    return leaf;
  }

  /**
   * 隐藏Leaf的UI
   */
  private hideLeafUI(leaf: WorkspaceLeaf): void {
    // 隐藏leaf容器
    const leafEl = (leaf as any).containerEl as HTMLElement;
    if (leafEl) {
      leafEl.style.display = 'none';
      leafEl.style.visibility = 'hidden';
      leafEl.style.position = 'absolute';
      leafEl.style.left = '-9999px';
      leafEl.style.top = '-9999px';
      leafEl.style.width = '0';
      leafEl.style.height = '0';
      leafEl.style.overflow = 'hidden';
      this.log('Leaf container hidden');
    }

    // 隐藏标签页标题
    const tabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement;
    if (tabHeaderEl) {
      tabHeaderEl.style.display = 'none';
      this.log('Tab header hidden');
    }

    // 隐藏文件名相关元素
    this.hideFileNameElements(leaf);
  }

  /**
   * 隐藏文件名显示元素
   */
  private hideFileNameElements(leaf: WorkspaceLeaf): void {
    const view = (leaf as any).view;
    if (!view || !view.containerEl) return;

    // ✅ 扩展选择器列表，完全隐藏临时文件名相关元素
    const selectors = [
      '.view-header',
      '.view-header-title',
      '.view-header-breadcrumb',
      '.view-header-title-container',
      '.view-header-title-parent',
      '.view-header-icon',
      '.view-header-nav-buttons',
      '.inline-title',
      '.view-header-title-wrapper',
      '.metadata-container'
    ];

    selectors.forEach(selector => {
      const element = view.containerEl.querySelector(selector);
      if (element) {
        (element as HTMLElement).style.display = 'none';
        (element as HTMLElement).style.height = '0';
        (element as HTMLElement).style.margin = '0';
        (element as HTMLElement).style.padding = '0';
        this.log(`Hidden element: ${selector}`);
      }
    });
  }

  /**
   * 提取编辑器DOM
   */
  private extractEditorDOM(leaf: WorkspaceLeaf): HTMLElement | null {
    this.log('Extracting editor DOM');

    const markdownView = (leaf.view as any);
    if (!markdownView || !markdownView.editor) {
      this.log('Error: MarkdownView or editor not found');
      return null;
    }

    this.editor = markdownView.editor;
    const editorEl = markdownView.contentEl as HTMLElement;
    
    if (!editorEl) {
      this.log('Error: Editor element not found');
      return null;
    }

    // 移动编辑器DOM到容器
    if (this.container) {
      // ✅ 增强清理：确保容器完全清空
      this.log(`Container cleanup - before: ${this.container.childNodes.length} child nodes`);
      
      // 双重保险清理：先移除所有子节点
      while (this.container.firstChild) {
        this.container.removeChild(this.container.firstChild);
      }
      // 再次确保清空
      this.container.innerHTML = '';
      
      this.log(`Container cleanup - after: ${this.container.childNodes.length} child nodes`);
      
      // 添加编辑器元素
      this.container.appendChild(editorEl);
      this.log('Editor DOM moved to container');
    }

    return editorEl;
  }

  /**
   * 设置编辑器
   */
  private async setupEditor(editorElement: HTMLElement, options: EditorOptions): Promise<void> {
    this.log('Setting up editor');

    // 设置基本样式
    this.setupEditorStyles(editorElement);

    // 初始化键盘事件处理器
    if (options.enableKeyboardShortcuts !== false) {
      this.initializeKeyboardHandler(options);
    }

    // 初始化布局管理器
    this.initializeLayoutManager();

    // 修复右键菜单z-index
    if (options.enableContextMenu !== false) {
      this.setupContextMenuFix();
    }

    // ✅ 性能优化：动态检测 DOM 就绪（替代固定延迟100ms）
    await this.waitForEditorReady(editorElement);

    // 聚焦编辑器
    this.focusEditor(options.initialCursorPosition);

    this.log('Editor setup complete');
  }

  /**
   * 等待编辑器 DOM 完全就绪
   * 
   * @param editorElement 编辑器元素
   * @returns Promise
   */
  private async waitForEditorReady(editorElement: HTMLElement): Promise<void> {
    // 检查编辑器是否已经有内容元素
    const contentEl = editorElement.querySelector('.cm-editor, .markdown-source-view');
    if (contentEl && contentEl.clientHeight > 0) {
      this.log('Editor already ready');
      return; // 已就绪，立即返回
    }

    // 使用 MutationObserver 等待内容元素出现
    return new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const contentEl = editorElement.querySelector('.cm-editor, .markdown-source-view');
        if (contentEl && contentEl.clientHeight > 0) {
          observer.disconnect();
          this.log('Editor ready detected via MutationObserver');
          resolve();
        }
      });

      observer.observe(editorElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // 安全超时（防止死锁）
      setTimeout(() => {
        observer.disconnect();
        this.log('Editor ready timeout (200ms), forcing resolve');
        resolve();
      }, 200); // 最多等待 200ms
    });
  }

  /**
   * 设置编辑器样式
   */
  private setupEditorStyles(editorEl: HTMLElement): void {
    // 设置主题适配
    editorEl.style.background = 'var(--background-primary)';
    editorEl.style.color = 'var(--text-normal)';

    // 查找并设置CodeMirror样式
    const cmEditor = editorEl.querySelector('.cm-editor') as HTMLElement;
    if (cmEditor) {
      cmEditor.style.height = '100%';
      cmEditor.style.fontSize = 'var(--font-text-size)';
      cmEditor.style.fontFamily = 'var(--font-text)';
      cmEditor.style.border = 'none';
      cmEditor.style.background = 'transparent';
    }

    const cmScroller = editorEl.querySelector('.cm-scroller') as HTMLElement;
    if (cmScroller) {
      cmScroller.style.fontFamily = 'var(--font-text)';
      cmScroller.style.height = '100%';
      cmScroller.style.overflow = 'auto';
    }

    const cmContent = editorEl.querySelector('.cm-content') as HTMLElement;
    if (cmContent) {
      cmContent.style.padding = '12px';
      cmContent.style.minHeight = 'unset';
      cmContent.style.height = 'auto';
    }

    this.log('Editor styles applied');
  }

  /**
   * 初始化键盘事件处理器
   */
  private initializeKeyboardHandler(options: EditorOptions): void {
    if (!this.editorElement) return;

    this.log('Initializing keyboard handler');

    this.keyboardHandler = new KeyboardEventHandler({
      onSave: () => {
        const content = this.getContent();
        options.onSave(content);
      },
      onCancel: options.onCancel,
      debug: this.debug
    });

    this.keyboardHandler.attach(this.editorElement);
    this.log('Keyboard handler attached');
  }

  /**
   * 初始化布局管理器
   */
  private initializeLayoutManager(): void {
    if (!this.container || !this.editorElement) return;

    this.log('Initializing layout manager');

    this.layoutManager = new EditorLayoutManager(this.container, this.debug);
    this.layoutManager.initialize(this.editorElement);
    this.layoutManager.enableVerticalScroll();

    this.log('Layout manager initialized');
  }

  /**
   * 修复右键菜单z-index
   */
  private setupContextMenuFix(): void {
    if (!this.editorElement) return;

    this.log('Setting up context menu fix');

    // 立即修复现有菜单
    this.fixMenuZIndex(this.editorElement);

    // 监听新添加的菜单
    this.observeMenuElements();

    this.log('Context menu fix applied');
  }

  /**
   * 修复菜单元素的z-index
   * ✅ 需要高于ResizableModal的遮罩层(z-index: 10000000)
   * ✅ 设置为99999999，确保所有菜单和弹出元素始终显示在最上层
   */
  private fixMenuZIndex(root: HTMLElement): void {
    const menuSelectors = [
      '.menu',
      '.suggestion-container',
      '.modal',
      '.popover'
    ];

    menuSelectors.forEach(selector => {
      const elements = root.querySelectorAll(selector);
      elements.forEach(el => {
        // ✅ 设置为99999999，确保高于ResizableModal的遮罩层(z-index: 10000000)
        // 这样右键菜单、建议框、弹出框等都能正确显示在模态窗之上
        (el as HTMLElement).style.zIndex = '99999999';
      });
      
      if (elements.length > 0) {
        this.log(`Fixed z-index for ${elements.length} ${selector} elements to 99999999`);
      }
    });
  }

  /**
   * 监听菜单元素的添加
   */
  private observeMenuElements(): void {
    if (!this.editorElement) return;

    this.menuObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            this.fixMenuZIndex(node);
          }
        });
      }
    });

    this.menuObserver.observe(this.editorElement, {
      childList: true,
      subtree: true
    });

    // 也监听document.body，因为某些菜单可能添加到body
    this.menuObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.log('Menu observer attached');
  }

  /**
   * 聚焦编辑器
   */
  public focusEditor(cursorPosition?: 'start' | 'end'): void {
    if (!this.editor) return;

    this.log('Focusing editor', { cursorPosition });

    setTimeout(() => {
      try {
        this.editor.focus();

        // 设置光标位置
        if (cursorPosition === 'start') {
          this.editor.setCursor({ line: 0, ch: 0 });
        } else if (cursorPosition === 'end') {
          const lastLine = this.editor.lastLine();
          const lastLineLength = this.editor.getLine(lastLine).length;
          this.editor.setCursor({ line: lastLine, ch: lastLineLength });
        }

        this.log('Editor focused');
      } catch (error) {
        this.log('Error focusing editor', error);
      }
    }, 150);
  }

  /**
   * 获取编辑器内容
   */
  public getContent(): string {
    if (!this.editor) {
      this.log('Warning: Cannot get content - editor not initialized');
      return '';
    }

    try {
      const content = this.editor.getValue();
      this.log('Content retrieved', { length: content.length });
      return content;
    } catch (error) {
      this.log('Error getting content', error);
      return '';
    }
  }

  /**
   * 设置编辑器内容
   */
  public setContent(content: string): void {
    if (!this.editor) {
      this.log('Warning: Cannot set content - editor not initialized');
      return;
    }

    try {
      this.editor.setValue(content);
      this.log('Content set', { length: content.length });
    } catch (error) {
      this.log('Error setting content', error);
    }
  }

  /**
   * 销毁编辑器
   */
  public destroy(): void {
    this.log('Destroying embedded editor');

    try {
      // 清理键盘事件处理器
      if (this.keyboardHandler) {
        this.keyboardHandler.detach();
        this.keyboardHandler = null;
        this.log('Keyboard handler detached');
      }

      // 清理布局管理器
      if (this.layoutManager) {
        this.layoutManager.cleanup();
        this.layoutManager = null;
        this.log('Layout manager cleaned up');
      }

      // 断开菜单观察器
      if (this.menuObserver) {
        this.menuObserver.disconnect();
        this.menuObserver = null;
        this.log('Menu observer disconnected');
      }

      // 断开resize观察器
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
        this.log('Resize observer disconnected');
      }

      // 恢复leaf显示（虽然即将关闭）
      if (this.leaf) {
        const leafEl = (this.leaf as any).containerEl as HTMLElement;
        if (leafEl) {
          leafEl.style.display = '';
          leafEl.style.visibility = '';
          leafEl.style.position = '';
          leafEl.style.left = '';
          leafEl.style.top = '';
          leafEl.style.width = '';
          leafEl.style.height = '';
          leafEl.style.overflow = '';
        }

        // 关闭leaf
        this.leaf.detach();
        this.log('Leaf detached');
      }

      // 清空所有引用
      this.leaf = null;
      this.editor = null;
      this.editorElement = null;
      this.container = null;

      this.log('Embedded editor destroyed');
      
    } catch (error) {
      this.log('Error during cleanup', error);
    }
  }

  /**
   * 调试日志
   */
  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[EmbeddedEditorManager] ${message}`, data || '');
    }
  }
}

