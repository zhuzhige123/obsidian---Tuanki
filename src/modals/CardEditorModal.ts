/**
 * CardEditorModal - 卡片编辑模态窗
 * 
 * 使用 Obsidian Modal 作为容器，内嵌 InlineCardEditor Svelte 组件
 * 
 * 优势：
 * - 利用 Obsidian 原生的 z-index 管理，彻底解决右键菜单遮挡问题
 * - 自动处理遮罩层、焦点管理、ESC 键等
 * - 完全复用 InlineCardEditor 组件，无需重写
 * 
 * @author Tuanki Team
 * @date 2025-01-05
 */

import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type AnkiPlugin from '../main';
import type { Card } from '../data/types';
import type { CardEditorModalOptions } from '../types/modal-types';
import InlineCardEditor from '../components/editor/InlineCardEditor.svelte';
import { TempFileManager } from '../services/temp-file-manager';

/**
 * 卡片编辑模态窗类
 * 
 * 继承自 Obsidian Modal，封装 InlineCardEditor Svelte 组件
 */
export class CardEditorModal extends Modal {
  /** Svelte 组件实例 */
  private editorComponent: typeof InlineCardEditor | null = null;
  
  /** 临时文件管理器 */
  private tempFileManager: TempFileManager;
  
  /** 模态窗选项 */
  private options: CardEditorModalOptions;
  
  /** 插件实例 */
  private plugin: AnkiPlugin;

  /**
   * 构造函数
   * 
   * @param app Obsidian App 实例
   * @param plugin 插件实例
   * @param options 卡片编辑选项
   */
  constructor(
    app: App,
    plugin: AnkiPlugin,
    options: CardEditorModalOptions
  ) {
    super(app);
    this.plugin = plugin;
    this.options = options;
    this.tempFileManager = new TempFileManager(plugin);
    
    console.log('[CardEditorModal] 初始化模态窗', {
      mode: options.mode,
      isNew: options.isNew,
      cardId: options.card.id
    });
  }

  /**
   * Modal 打开时调用
   * 创建并挂载 InlineCardEditor Svelte 组件
   */
  onOpen(): void {
    console.log('[CardEditorModal] 打开模态窗');
    
    // 设置 Modal 容器样式
    this.modalEl.addClass('tuanki-card-editor-modal');
    
    // 清空内容容器
    this.contentEl.empty();
    
    // 添加容器类名，便于样式控制
    this.contentEl.addClass('tuanki-card-editor-modal-content');
    
    try {
      // 实例化 InlineCardEditor Svelte 组件
      this.editorComponent = new InlineCardEditor({
        target: this.contentEl,
        props: {
          card: this.options.card,
          plugin: this.plugin,
          tempFileManager: this.tempFileManager,
          mode: this.options.mode,
          isNew: this.options.isNew ?? false,
          displayMode: 'inline', // 关键：使用 inline 模式，由 Modal 处理定位
          showHeader: true,
          showFooter: true,
          allowEscape: false, // Modal 自己处理 ESC 键
          onSave: this.handleSave.bind(this),
          onCancel: this.handleCancel.bind(this)
        }
      });
      
      console.log('[CardEditorModal] InlineCardEditor 组件已挂载');
    } catch (error) {
      console.error('[CardEditorModal] 创建编辑器组件失败:', error);
      new Notice('创建卡片编辑器失败');
      this.close();
    }
  }

  /**
   * Modal 关闭时调用
   * 清理资源，销毁 Svelte 组件
   */
  onClose(): void {
    console.log('[CardEditorModal] 关闭模态窗');
    
    // 销毁 Svelte 组件实例
    if (this.editorComponent) {
      try {
        this.editorComponent.$destroy();
        this.editorComponent = null;
        console.log('[CardEditorModal] InlineCardEditor 组件已销毁');
      } catch (error) {
        console.error('[CardEditorModal] 销毁编辑器组件失败:', error);
      }
    }
    
    // 清理临时文件管理器资源
    if (this.tempFileManager && this.options.card) {
      const cardId = this.options.card.id;
      if (this.tempFileManager.isCardEditing(cardId)) {
        this.tempFileManager.cancelEditing(cardId);
        console.log('[CardEditorModal] 已清理临时文件:', cardId);
      }
    }
    
    // 清空内容容器
    this.contentEl.empty();
  }

  /**
   * 处理保存操作
   * 
   * @param updatedCard 更新后的卡片数据
   */
  private async handleSave(updatedCard: Card): Promise<void> {
    console.log('[CardEditorModal] 处理保存操作', {
      mode: this.options.mode,
      cardId: updatedCard.id
    });
    
    try {
      // 如果是新建卡片，执行保存到数据存储
      if (this.options.mode === 'create') {
        // 验证卡片内容
        const hasContent = updatedCard.fields?.front ||
                          updatedCard.fields?.question ||
                          updatedCard.fields?.notes ||
                          Object.values(updatedCard.fields || {}).some(value => value && value.trim());
        
        if (!hasContent) {
          console.warn('[CardEditorModal] 卡片内容为空，拒绝保存');
          new Notice('卡片内容不能为空，请添加内容后再保存');
          return;
        }
        
        // 确保字段完整性，防止内容丢失
        if (!updatedCard.fields?.front && updatedCard.fields?.notes) {
          updatedCard.fields.front = updatedCard.fields.notes;
          updatedCard.fields.question = updatedCard.fields.notes;
        }
        
        // 保存新卡片到数据存储
        await this.plugin.dataStorage.saveCard(updatedCard);
        console.log('[CardEditorModal] 新卡片已保存:', updatedCard);
        
        // 触发卡片创建事件
        this.app.workspace.trigger("tuanki:card-created", updatedCard);
        
        // 🗑️ 已移除旧的 CustomEvent 触发（tuanki:refresh-cards）
        // 现在通过 DataSyncService 在 saveCard 时自动通知
        
        // 显示成功通知
        new Notice('新卡片创建成功');
      }
      
      // 调用用户提供的回调
      if (this.options.onSave) {
        await this.options.onSave(updatedCard);
      }
      
      // 关闭模态窗
      this.close();
      
    } catch (error) {
      console.error('[CardEditorModal] 保存失败:', error);
      const errorMessage = error instanceof Error ? error.message : '保存失败';
      new Notice(`保存卡片失败: ${errorMessage}`);
    }
  }

  /**
   * 处理取消操作
   */
  private handleCancel(): void {
    console.log('[CardEditorModal] 处理取消操作');
    
    // 清理临时文件
    if (this.tempFileManager && this.options.card) {
      const cardId = this.options.card.id;
      if (this.tempFileManager.isCardEditing(cardId)) {
        this.tempFileManager.cancelEditing(cardId);
      }
    }
    
    // 调用用户提供的回调
    if (this.options.onCancel) {
      this.options.onCancel();
    }
    
    // 关闭模态窗
    this.close();
  }
}










