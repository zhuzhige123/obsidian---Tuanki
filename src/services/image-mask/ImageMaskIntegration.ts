/**
 * 图片遮罩集成服务
 * 
 * 功能：
 * - 在学习界面自动检测和渲染遮罩
 * - 处理显示答案时的遮罩揭示动画
 * - 提供统一的遮罩管理接口
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import type { App } from 'obsidian';
import { MaskDataParser } from './MaskDataParser';
import { MaskRenderer, revealAllMasks } from './MaskRenderer';
import type { MaskData } from '../../types/image-mask-types';
import { MASK_CONSTANTS } from '../../types/image-mask-types';

export class ImageMaskIntegration {
  private app: App;
  private parser: MaskDataParser;
  private renderer: MaskRenderer;

  constructor(app: App) {
    this.app = app;
    this.parser = new MaskDataParser(app);
    this.renderer = new MaskRenderer();
  }

  /**
   * 在容器中查找并渲染所有带遮罩的图片
   * 
   * @param container 容器元素
   * @param content Markdown 内容（用于解析遮罩数据）
   */
  applyMasksInContainer(
    container: HTMLElement,
    content: string
  ): void {
    const images = container.querySelectorAll('img');
    
    if (images.length === 0) {
      return;
    }

    // 解析内容，查找遮罩注释
    const maskDataMap = this.parseMaskDataFromContent(content);
    
    if (maskDataMap.size === 0) {
      return;
    }

    // 为每个图片应用遮罩
    images.forEach((img, index) => {
      const imageSrc = img.getAttribute('src') || '';
      const maskData = this.findMaskDataForImage(imageSrc, index, maskDataMap);
      
      if (maskData) {
        // 🔍 调试日志：输出遮罩数据详情
        console.log(`[ImageMaskIntegration] 为图片 ${index} 应用遮罩，数据:`, {
          maskCount: maskData.masks.length,
          masks: maskData.masks.map(m => ({
            id: m.id,
            type: m.type,
            fill: m.fill,
            style: m.style
          }))
        });
        
        this.renderer.renderMasksOnImage(img, maskData, { visible: true });
      }
    });
  }

  /**
   * 显示所有遮罩（用于显示问题时）
   * 
   * @param container 容器元素
   * @param animated 是否启用动画
   */
  showAllMasks(container: HTMLElement, animated: boolean = false): void {
    const maskedImages = container.querySelectorAll('.tuanki-image-with-masks');
    
    maskedImages.forEach((wrapper) => {
      const overlay = wrapper.querySelector('.tuanki-mask-overlay') as HTMLElement;
      if (overlay) {
        if (animated) {
          this.renderer.showMasks(overlay, MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION);
        } else {
          // ✅ 修复：非动画模式也要恢复 display 属性
          overlay.style.display = '';
          overlay.style.opacity = '1';
        }
      }
    });
    
    console.log(`[ImageMaskIntegration] 显示所有遮罩（动画: ${animated}）`);
  }

  /**
   * 揭示所有遮罩（用于显示答案时）
   * 
   * @param container 容器元素
   * @param duration 动画持续时间（毫秒）
   */
  revealAllMasks(
    container: HTMLElement,
    duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
  ): void {
    revealAllMasks(container, duration);
    console.log(`[ImageMaskIntegration] 揭示所有遮罩（动画 ${duration}ms）`);
  }

  /**
   * 移除容器中的所有遮罩
   * 
   * @param container 容器元素
   */
  removeMasksInContainer(container: HTMLElement): void {
    const overlays = container.querySelectorAll('.tuanki-mask-overlay');
    overlays.forEach(overlay => overlay.remove());
    
    const wrappers = container.querySelectorAll('.tuanki-image-with-masks');
    wrappers.forEach(wrapper => {
      const img = wrapper.querySelector('img');
      if (img && wrapper.parentElement) {
        wrapper.parentElement.insertBefore(img, wrapper);
        wrapper.remove();
      }
    });
  }

  // ===== 私有方法 =====

  /**
   * 从内容中解析所有遮罩数据
   * 返回 Map<图片序号, MaskData>
   * 
   * ✅ 修复：按图片在文件中的出现顺序（0, 1, 2...）建立索引，而不是行号
   */
  private parseMaskDataFromContent(content: string): Map<number, MaskData> {
    const maskDataMap = new Map<number, MaskData>();
    const lines = content.split('\n');
    let imageCount = 0; // 图片计数器
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 检查当前行是否为图片
      if (this.parser.hasImageLink(line)) {
        // 检查下一行是否为遮罩注释
        const nextLineIndex = i + 1;
        if (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trim();
          
          if (nextLine.startsWith(MASK_CONSTANTS.COMMENT_PREFIX)) {
            const parseResult = this.parser.parseCommentToMaskData(nextLine);
            
            if (parseResult.success && parseResult.data) {
              // 使用图片序号作为 key（从 0 开始）
              maskDataMap.set(imageCount, parseResult.data);
              console.log(`[ImageMaskIntegration] 找到遮罩数据：图片序号=${imageCount}，遮罩数量=${parseResult.data.masks.length}`);
            }
          }
        }
        
        // 图片计数递增
        imageCount++;
      }
    }
    
    console.log(`[ImageMaskIntegration] 解析完成：共 ${imageCount} 张图片，${maskDataMap.size} 张有遮罩`);
    return maskDataMap;
  }

  /**
   * 查找图片对应的遮罩数据
   */
  private findMaskDataForImage(
    imageSrc: string,
    imageIndex: number,
    maskDataMap: Map<number, MaskData>
  ): MaskData | null {
    // 通过图片序号匹配（修复后的逻辑）
    const maskData = maskDataMap.get(imageIndex);
    
    if (maskData) {
      console.log(`[ImageMaskIntegration] 为图片 #${imageIndex} 找到遮罩数据，包含 ${maskData.masks.length} 个遮罩`);
      return maskData;
    }

    return null;
  }
}

/**
 * 创建图片遮罩集成实例的便捷函数
 */
export function createImageMaskIntegration(app: App): ImageMaskIntegration {
  return new ImageMaskIntegration(app);
}

