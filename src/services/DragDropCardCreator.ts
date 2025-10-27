/**
 * 拖拽创建卡片服务
 * 
 * 功能：
 * - 监听Ctrl+拖拽事件，自动创建卡片
 * - 提取拖拽内容和来源信息
 * - 集成块链接管理器
 * - 显示拖拽指示器反馈
 */

import { Notice } from 'obsidian';
import type AnkiPlugin from '../main';
import { BlockLinkManager } from '../utils/block-link-manager';

interface DragContent {
  text: string;
  sourceFile?: string;
}

export class DragDropCardCreator {
  private isAltPressed = false;
  private plugin: AnkiPlugin;
  private blockLinkManager: BlockLinkManager;
  private pluginContainer: HTMLElement | null = null;
  private dropIndicator: HTMLElement | null = null;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.blockLinkManager = new BlockLinkManager(plugin.app);
    
    console.log('[DragDropCardCreator] 初始化');
  }

  /**
   * 启动拖拽监听
   */
  enable(): void {
    console.log('[DragDropCardCreator] 启动拖拽监听');
    
    // 监听键盘状态
    document.addEventListener('keydown', this.handleKeyDown, { capture: true });
    document.addEventListener('keyup', this.handleKeyUp, { capture: true });
    
    // ✅ 新增：监听 dragstart 和 dragend
    document.addEventListener('dragstart', this.handleDragStart, { capture: true });
    document.addEventListener('dragend', this.handleDragEnd, { capture: true });
    
    // 查找插件容器（尝试多个可能的选择器）
    this.findPluginContainer();
    
    // 如果找到容器，添加拖拽监听
    if (this.pluginContainer) {
      this.pluginContainer.addEventListener('dragover', this.handleDragOver);
      this.pluginContainer.addEventListener('drop', this.handleDrop);
      this.pluginContainer.addEventListener('dragleave', this.handleDragLeave);
      console.log('[DragDropCardCreator] ✓ 已绑定到插件容器');
    } else {
      // 如果没有找到，监听整个文档（但仅在Ctrl按下时响应）
      document.addEventListener('dragover', this.handleDragOver);
      document.addEventListener('drop', this.handleDrop);
      document.addEventListener('dragleave', this.handleDragLeave);
      console.log('[DragDropCardCreator] ⚠️ 未找到插件容器，使用全局监听');
    }
  }

  /**
   * 停止拖拽监听
   */
  disable(): void {
    console.log('[DragDropCardCreator] 停止拖拽监听');
    
    document.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    document.removeEventListener('keyup', this.handleKeyUp, { capture: true });
    
    // ✅ 新增：移除 dragstart 和 dragend 监听
    document.removeEventListener('dragstart', this.handleDragStart, { capture: true });
    document.removeEventListener('dragend', this.handleDragEnd, { capture: true });
    
    if (this.pluginContainer) {
      this.pluginContainer.removeEventListener('dragover', this.handleDragOver);
      this.pluginContainer.removeEventListener('drop', this.handleDrop);
      this.pluginContainer.removeEventListener('dragleave', this.handleDragLeave);
    } else {
      document.removeEventListener('dragover', this.handleDragOver);
      document.removeEventListener('drop', this.handleDrop);
      document.removeEventListener('dragleave', this.handleDragLeave);
    }
    
    // 清理指示器
    if (this.dropIndicator && this.dropIndicator.parentNode) {
      this.dropIndicator.parentNode.removeChild(this.dropIndicator);
      this.dropIndicator = null;
    }
  }

  /**
   * 查找插件容器
   */
  private findPluginContainer(): void {
    // 尝试多个可能的选择器
    const selectors = [
      '.tuanki-app',
      '[data-type="tuanki-view"]',
      '.workspace-leaf-content[data-type="tuanki"]'
    ];
    
    for (const selector of selectors) {
      const container = document.querySelector(selector) as HTMLElement;
      if (container) {
        this.pluginContainer = container;
        console.log('[DragDropCardCreator] 找到插件容器:', selector);
        break;
      }
    }
  }

  /**
   * 处理键盘按下
   */
  private handleKeyDown = (e: KeyboardEvent) => {
    // Alt (Windows/Linux) 或 Option (Mac)
    if (e.altKey) {
      if (!this.isAltPressed) {
        this.isAltPressed = true;
        console.log('[DragDropCardCreator] Alt/Option键按下');
      }
    }
  };

  /**
   * 处理键盘释放
   */
  private handleKeyUp = (e: KeyboardEvent) => {
    // Alt (Windows/Linux) 或 Option (Mac)
    if (!e.altKey) {
      if (this.isAltPressed) {
        this.isAltPressed = false;
        this.hideDropIndicator();
        console.log('[DragDropCardCreator] Alt/Option键释放');
      }
    }
  };

  /**
   * 处理拖拽开始 - 设置拖拽效果
   */
  private handleDragStart = (e: DragEvent) => {
    if (!this.isAltPressed) return;
    
    console.log('[DragDropCardCreator] 拖拽开始');
    
    if (e.dataTransfer) {
      // 设置自定义数据标识
      e.dataTransfer.setData('application/x-tuanki-drag', 'create-card');
      // 明确设置为复制效果
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  /**
   * 处理拖拽结束
   */
  private handleDragEnd = (e: DragEvent) => {
    if (!this.isAltPressed) return;
    
    console.log('[DragDropCardCreator] 拖拽结束');
    this.hideDropIndicator();
  };

  /**
   * 处理拖拽悬停
   */
  private handleDragOver = (e: DragEvent) => {
    if (!this.isAltPressed) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // 设置拖放效果
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    
    // 显示拖拽提示
    this.showDropIndicator(e);
  };

  /**
   * 处理拖拽离开
   */
  private handleDragLeave = (e: DragEvent) => {
    if (!this.isAltPressed) return;
    
    // 检查是否真的离开了容器（不是进入子元素）
    const relatedTarget = e.relatedTarget as Node;
    if (!relatedTarget || !this.pluginContainer?.contains(relatedTarget)) {
      this.hideDropIndicator();
    }
  };

  /**
   * 处理拖拽放下
   */
  private handleDrop = async (e: DragEvent) => {
    if (!this.isAltPressed) return;
    
    // ✅ 检测并忽略看板内部拖拽
    const isKanbanDrag = e.dataTransfer?.types.includes('application/x-tuanki-kanban-card');
    if (isKanbanDrag) {
      console.log('[DragDropCardCreator] 忽略看板内部拖拽');
      return;
    }
    
    // ✅ 强化：阻止所有默认行为，包括文本复制/移动
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // ✅ 新增：清除拖拽数据，防止浏览器处理
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'none';
      e.dataTransfer.effectAllowed = 'none';
    }
    
    console.log('[DragDropCardCreator] 拖放事件触发');
    
    // 隐藏拖拽提示
    this.hideDropIndicator();
    
    // 提取拖拽内容
    const content = this.extractDragContent(e);
    if (!content) {
      new Notice('无法识别拖拽内容，请尝试选择文本后拖拽');
      return;
    }
    
    console.log('[DragDropCardCreator] 提取到内容:', {
      textLength: content.text.length,
      sourceFile: content.sourceFile
    });
    
    // 创建块链接
    let blockLinkInfo;
    try {
      const blockLinkResult = await this.blockLinkManager
        .createBlockLinkForSelection(content.text, content.sourceFile);
      
      blockLinkInfo = blockLinkResult.blockLinkInfo;
      
      if (blockLinkResult.success) {
        console.log('[DragDropCardCreator] 块链接创建成功:', blockLinkInfo?.blockLink);
      } else {
        console.warn('[DragDropCardCreator] 块链接创建失败，但继续创建卡片');
      }
    } catch (error) {
      console.error('[DragDropCardCreator] 创建块链接时出错:', error);
      // 即使出错也继续创建卡片
    }
    
    // 打开新建卡片模态窗
    try {
      await this.plugin.openCreateCardModal({
        initialContent: content.text,
        contentMapping: {
          front: content.text,
          question: content.text,
          notes: content.text,
          sourceBlockLink: blockLinkInfo?.blockLink || '',
          sourceDocument: blockLinkInfo?.sourceDocument || content.sourceFile || '',
          sourceFile: blockLinkInfo?.sourceFile || content.sourceFile || '',
          sourceUniqueId: blockLinkInfo?.uniqueIdentifier || ''
        }
      });
      
      new Notice('已从拖拽内容创建卡片');
    } catch (error) {
      console.error('[DragDropCardCreator] 打开新建卡片模态窗失败:', error);
      new Notice('创建卡片失败，请重试');
    }
    
    // ✅ 清除文本选区，防止编辑器留有选中状态
    try {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    } catch (error) {
      // 忽略清除选区失败
      console.debug('[DragDropCardCreator] 清除选区失败:', error);
    }
  };

  /**
   * 提取拖拽内容
   */
  private extractDragContent(e: DragEvent): DragContent | null {
    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return null;
    
    // 优先获取纯文本
    let text = dataTransfer.getData('text/plain');
    
    // 如果没有纯文本，尝试HTML
    if (!text || text.trim().length === 0) {
      const html = dataTransfer.getData('text/html');
      if (html) {
        // 简单的HTML to text转换
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        text = tempDiv.textContent || tempDiv.innerText || '';
      }
    }
    
    // 尝试获取源文件信息
    let sourceFile: string | undefined;
    
    // Obsidian特有数据
    try {
      const obsidianData = dataTransfer.getData('application/x-obsidian-file');
      if (obsidianData) {
        const data = JSON.parse(obsidianData);
        sourceFile = data.file || data.path;
      }
    } catch (err) {
      // 忽略解析错误
    }
    
    // 如果还是没有，尝试从当前活动文件获取
    if (!sourceFile) {
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (activeFile) {
        sourceFile = activeFile.path;
      }
    }
    
    // 验证文本内容
    if (!text || text.trim().length === 0) {
      return null;
    }
    
    return { 
      text: text.trim(), 
      sourceFile 
    };
  }

  /**
   * 显示拖拽指示器
   */
  private showDropIndicator(e: DragEvent): void {
    if (!this.dropIndicator) {
      this.dropIndicator = this.createDropIndicator();
      document.body.appendChild(this.dropIndicator);
    }
    
    this.dropIndicator.style.display = 'flex';
    
    // 跟随鼠标位置
    const x = e.clientX;
    const y = e.clientY;
    
    this.dropIndicator.style.left = x + 'px';
    this.dropIndicator.style.top = y + 'px';
  }

  /**
   * 隐藏拖拽指示器
   */
  private hideDropIndicator(): void {
    if (this.dropIndicator) {
      this.dropIndicator.style.display = 'none';
    }
  }

  /**
   * 创建拖拽指示器元素
   */
  private createDropIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'tuanki-drop-indicator';
    indicator.innerHTML = `
      <div class="drop-indicator-content">
        <div class="drop-icon">📝</div>
        <p>松开以创建卡片</p>
      </div>
    `;
    return indicator;
  }
}







