/**
 * 图片遮罩编辑器 Modal
 * 
 * 功能：
 * - 继承 Obsidian Modal 类
 * - 封装 ImageMaskModal Svelte 组件
 * - 处理保存和取消逻辑
 * - 管理组件生命周期
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import { Modal, Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';
import ImageMaskModal from '../components/image-mask/ImageMaskModal.svelte';
import type { MaskData, ImageMaskContext } from '../types/image-mask-types';

export interface ImageMaskEditorModalOptions {
  /** 图片文件 */
  imageFile: TFile;
  
  /** 现有遮罩数据 */
  initialMaskData: MaskData | null;
  
  /** 保存回调 */
  onSave: (maskData: MaskData) => void;
  
  /** 取消回调 */
  onCancel?: () => void;
}

/**
 * 图片遮罩编辑器 Modal
 */
export class ImageMaskEditorModal extends Modal {
  private modalComponent: typeof ImageMaskModal | null = null;
  private options: ImageMaskEditorModalOptions;

  constructor(app: App, options: ImageMaskEditorModalOptions) {
    super(app);
    this.options = options;
    
    console.log('[ImageMaskEditorModal] 初始化', {
      imageFile: options.imageFile.path,
      hasMaskData: !!options.initialMaskData
    });
  }

  /**
   * Modal 打开时调用
   */
  onOpen(): void {
    console.log('[ImageMaskEditorModal] 打开模态窗');
    
    // 设置 Modal 容器样式
    this.modalEl.addClass('tuanki-image-mask-editor-modal');
    
    // 设置宽度和高度
    this.modalEl.style.width = '90vw';
    this.modalEl.style.maxWidth = '1200px';
    this.modalEl.style.height = '80vh';
    
    // 清空内容容器
    this.contentEl.empty();
    this.contentEl.addClass('tuanki-image-mask-editor-content');
    
    try {
      // 实例化 Svelte 组件
      this.modalComponent = new (ImageMaskModal as any)({
        target: this.contentEl,
        props: {
          app: this.app,
          imageFile: this.options.imageFile,
          initialMaskData: this.options.initialMaskData,
          onSave: this.handleSave.bind(this),
          onCancel: this.handleCancel.bind(this)
        }
      });
      
      console.log('[ImageMaskEditorModal] Svelte 组件已挂载');
      
    } catch (error) {
      console.error('[ImageMaskEditorModal] 创建组件失败:', error);
      new Notice('创建图片遮罩编辑器失败');
      this.close();
    }
  }

  /**
   * Modal 关闭时调用
   */
  onClose(): void {
    console.log('[ImageMaskEditorModal] 关闭模态窗');
    
    // 销毁 Svelte 组件
    if (this.modalComponent) {
      try {
        this.modalComponent.$destroy();
        this.modalComponent = null;
        console.log('[ImageMaskEditorModal] Svelte 组件已销毁');
      } catch (error) {
        console.error('[ImageMaskEditorModal] 销毁组件失败:', error);
      }
    }
    
    // 清空内容
    this.contentEl.empty();
  }

  /**
   * 处理保存
   */
  private handleSave(maskData: MaskData): void {
    console.log('[ImageMaskEditorModal] 处理保存', {
      masksCount: maskData.masks.length
    });
    
    try {
      // 调用用户提供的保存回调
      this.options.onSave(maskData);
      
      // 显示成功通知
      new Notice(`✅ 遮罩已保存（${maskData.masks.length} 个遮罩区域）`);
      
      // 关闭模态窗
      this.close();
      
    } catch (error) {
      console.error('[ImageMaskEditorModal] 保存失败:', error);
      new Notice('❌ 保存遮罩失败');
    }
  }

  /**
   * 处理取消
   */
  private handleCancel(): void {
    console.log('[ImageMaskEditorModal] 处理取消');
    
    // 调用用户提供的取消回调
    if (this.options.onCancel) {
      this.options.onCancel();
    }
    
    // 关闭模态窗
    this.close();
  }
}



