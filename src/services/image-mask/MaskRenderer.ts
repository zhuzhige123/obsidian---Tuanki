/**
 * 遮罩渲染器
 * 
 * 功能：
 * - 在学习复习时渲染遮罩到图片上
 * - 支持 SVG 遮罩层（轻量级，支持百分比坐标）
 * - 支持遮罩显示/隐藏动画
 * - 支持多种遮罩样式（纯色、模糊）
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import type { MaskData, Mask, MaskRenderOptions } from '../../types/image-mask-types';
import { MASK_CONSTANTS } from '../../types/image-mask-types';
import { parseRGBAColor } from './mask-operations';

export class MaskRenderer {
  /**
   * 在图片元素上渲染遮罩
   * 
   * @param imgElement 图片 DOM 元素
   * @param maskData 遮罩数据
   * @param options 渲染选项
   */
  renderMasksOnImage(
    imgElement: HTMLImageElement,
    maskData: MaskData,
    options: MaskRenderOptions = { visible: true }
  ): void {
    if (!maskData || !maskData.masks || maskData.masks.length === 0) {
      return;
    }

    // 创建遮罩容器
    const container = this.createMaskContainer(imgElement);
    
    // 渲染每个遮罩
    maskData.masks.forEach(mask => {
      const maskElement = this.createMaskElement(mask, imgElement, options);
      if (maskElement) {
        container.appendChild(maskElement);
      }
    });
  }

  /**
   * 显示遮罩（动画）
   * 
   * @param container 遮罩容器元素
   * @param duration 动画持续时间（毫秒）
   */
  showMasks(
    container: HTMLElement | null,
    duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
  ): void {
    if (!container) return;

    container.style.display = '';
    container.style.opacity = '1';
    container.style.transition = `opacity ${duration}ms ease-in`;
  }

  /**
   * 隐藏遮罩（动画）- 用于显示答案时
   * 
   * @param container 遮罩容器元素
   * @param duration 动画持续时间（毫秒）
   */
  hideMasks(
    container: HTMLElement | null,
    duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
  ): void {
    if (!container) return;

    container.style.opacity = '0';
    container.style.transition = `opacity ${duration}ms ease-out`;
    
    // 动画结束后隐藏元素
    setTimeout(() => {
      container.style.display = 'none';
    }, duration);
  }

  /**
   * 查找图片对应的遮罩容器
   * 
   * @param imgElement 图片元素
   * @returns 遮罩容器或 null
   */
  findMaskContainer(imgElement: HTMLImageElement): HTMLElement | null {
    const wrapper = imgElement.parentElement;
    if (!wrapper || !wrapper.classList.contains('tuanki-image-with-masks')) {
      return null;
    }

    return wrapper.querySelector('.tuanki-mask-overlay') as HTMLElement;
  }

  // ===== 私有方法 =====

  /**
   * 创建遮罩容器
   */
  private createMaskContainer(imgElement: HTMLImageElement): SVGElement {
    // 检查是否已存在包装器
    let wrapper = imgElement.parentElement;
    if (!wrapper || !wrapper.classList.contains('tuanki-image-with-masks')) {
      // 创建包装器
      wrapper = document.createElement('div');
      wrapper.className = 'tuanki-image-with-masks';
      
      // 替换图片位置
      const parent = imgElement.parentElement;
      if (parent) {
        parent.insertBefore(wrapper, imgElement);
        wrapper.appendChild(imgElement);
      }
    }

    // 移除旧的遮罩层（如果存在）
    const oldOverlay = wrapper.querySelector('.tuanki-mask-overlay');
    if (oldOverlay) {
      oldOverlay.remove();
    }

    // 创建 SVG 遮罩层
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tuanki-mask-overlay');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none'; // 允许点击穿透到图片

    wrapper.appendChild(svg);

    return svg;
  }

  /**
   * 创建单个遮罩元素
   */
  private createMaskElement(
    mask: Mask,
    imgElement: HTMLImageElement,
    options: MaskRenderOptions
  ): SVGElement | null {
    let element: SVGElement;

    if (mask.type === 'rect') {
      element = this.createRectMask(mask);
    } else if (mask.type === 'circle') {
      element = this.createCircleMask(mask);
    } else {
      console.warn('[MaskRenderer] 不支持的遮罩类型:', mask.type);
      return null;
    }

    // 应用样式
    this.applyMaskStyle(element, mask);

    // 应用可见性
    if (!options.visible) {
      element.style.display = 'none';
    }

    return element;
  }

  /**
   * 创建矩形遮罩
   */
  private createRectMask(mask: Mask): SVGRectElement {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    
    // 使用百分比坐标
    rect.setAttribute('x', `${mask.x * 100}%`);
    rect.setAttribute('y', `${mask.y * 100}%`);
    rect.setAttribute('width', `${mask.width! * 100}%`);
    rect.setAttribute('height', `${mask.height! * 100}%`);
    rect.setAttribute('data-mask-id', mask.id);
    
    // 设置颜色
    const fill = mask.fill || MASK_CONSTANTS.DEFAULT_FILL;
    const { rgb, opacity } = parseRGBAColor(fill);
    rect.setAttribute('fill', rgb);
    rect.setAttribute('fill-opacity', opacity.toString());

    return rect;
  }

  /**
   * 创建圆形遮罩
   */
  private createCircleMask(mask: Mask): SVGCircleElement {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    
    // 使用百分比坐标
    circle.setAttribute('cx', `${mask.x * 100}%`);
    circle.setAttribute('cy', `${mask.y * 100}%`);
    circle.setAttribute('r', `${mask.radius! * 100}%`);
    circle.setAttribute('data-mask-id', mask.id);
    
    // 设置颜色
    const fill = mask.fill || MASK_CONSTANTS.DEFAULT_FILL;
    const { rgb, opacity } = parseRGBAColor(fill);
    circle.setAttribute('fill', rgb);
    circle.setAttribute('fill-opacity', opacity.toString());

    return circle;
  }

  /**
   * 应用遮罩样式
   */
  private applyMaskStyle(element: SVGElement, mask: Mask): void {
    const fill = mask.fill || MASK_CONSTANTS.DEFAULT_FILL;
    const { rgb, opacity } = parseRGBAColor(fill);
    
    element.setAttribute('fill', rgb);
    element.setAttribute('fill-opacity', opacity.toString());

    // 应用特殊样式
    if (mask.style === 'blur') {
      // SVG 模糊滤镜
      const filterId = `blur-${mask.id}`;
      const filter = this.createBlurFilter(
        filterId,
        mask.blurRadius || MASK_CONSTANTS.DEFAULT_BLUR_RADIUS
      );
      
      // 添加滤镜到 SVG
      const svg = element.parentElement as unknown as SVGElement;
      if (svg) {
        let defs = svg.querySelector('defs');
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          svg.insertBefore(defs, svg.firstChild);
        }
        defs.appendChild(filter);
        
        element.setAttribute('filter', `url(#${filterId})`);
      }
    }

    // 添加类名用于 CSS 控制
    element.classList.add('tuanki-mask');
    element.classList.add(`tuanki-mask-${mask.style}`);
  }

  /**
   * 创建模糊滤镜
   */
  private createBlurFilter(id: string, radius: number): SVGFilterElement {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', id);
    
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', `${radius}`);
    
    filter.appendChild(blur);
    
    return filter;
  }
}

/**
 * 在容器中查找所有带遮罩的图片
 * 
 * @param container 容器元素
 * @returns 带遮罩的图片包装器数组
 */
export function findMaskedImages(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll('.tuanki-image-with-masks')
  ) as HTMLElement[];
}

/**
 * 批量显示所有遮罩
 * 
 * @param container 容器元素
 * @param duration 动画持续时间
 */
export function revealAllMasks(
  container: HTMLElement,
  duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
): void {
  const renderer = new MaskRenderer();
  const maskedImages = findMaskedImages(container);
  
  maskedImages.forEach((wrapper) => {
    const overlay = wrapper.querySelector('.tuanki-mask-overlay') as HTMLElement;
    renderer.hideMasks(overlay, duration);
  });
}

/**
 * 批量隐藏所有遮罩
 * 
 * @param container 容器元素
 * @param duration 动画持续时间
 */
export function hideAllMasks(
  container: HTMLElement,
  duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
): void {
  const renderer = new MaskRenderer();
  const maskedImages = findMaskedImages(container);
  
  maskedImages.forEach((wrapper) => {
    const overlay = wrapper.querySelector('.tuanki-mask-overlay') as HTMLElement;
    renderer.showMasks(overlay, duration);
  });
}

