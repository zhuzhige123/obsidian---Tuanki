/**
 * 动效控制器 - 管理预览系统的动画效果
 */

export interface AnimationConfig {
  duration: number;
  easing: string;
  delay: number;
}

export interface AnimationOptions {
  enableAnimations: boolean;
  reducedMotion: boolean;
  performanceMode: 'performance' | 'quality';
}

export class AnimationController {
  private animationQueue: Animation[] = [];
  private options: AnimationOptions;

  constructor(options: AnimationOptions = {
    enableAnimations: true,
    reducedMotion: false,
    performanceMode: 'quality'
  }) {
    this.options = options;
    this.detectReducedMotion();
  }

  /**
   * 检测用户的动画偏好
   */
  private detectReducedMotion(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.options.reducedMotion = mediaQuery.matches;
      
      // 监听偏好变化
      mediaQuery.addEventListener('change', (e) => {
        this.options.reducedMotion = e.matches;
      });
    }
  }

  /**
   * 内容显示动画
   */
  animateContentReveal(element: HTMLElement | null, config?: Partial<AnimationConfig>): Promise<void> {
    if (!this.shouldAnimate() || !element) {
      return Promise.resolve();
    }

    const animationConfig = {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      delay: 0,
      ...config
    };

    return this.createAnimation(element, [
      {
        opacity: 0,
        transform: 'translateY(10px) scale(0.98)'
      },
      {
        opacity: 1,
        transform: 'translateY(0) scale(1)'
      }
    ], animationConfig);
  }

  /**
   * 题型切换动画
   */
  animateTypeTransition(element: HTMLElement | null, config?: Partial<AnimationConfig>): Promise<void> {
    if (!this.shouldAnimate() || !element) {
      return Promise.resolve();
    }

    const animationConfig = {
      duration: 400,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      delay: 100,
      ...config
    };

    return this.createAnimation(element, [
      {
        opacity: 0.7,
        transform: 'scale(0.95)',
        filter: 'blur(2px)'
      },
      { 
        opacity: 1, 
        transform: 'scale(1)',
        filter: 'blur(0px)'
      }
    ], animationConfig);
  }

  /**
   * 挖空显示动画
   */
  animateClozeReveal(element: HTMLElement | HTMLElement[] | null, config?: Partial<AnimationConfig>): Promise<void> {
    if (!this.shouldAnimate() || !element) {
      return Promise.resolve();
    }

    // 处理数组情况
    if (Array.isArray(element)) {
      const promises = element.map(el => this.animateClozeReveal(el, config));
      return Promise.all(promises).then(() => {});
    }

    const animationConfig = {
      duration: 250,
      easing: 'ease-out',
      delay: 50,
      ...config
    };

    return this.createAnimation(element, [
      {
        opacity: 0,
        transform: 'scale(0.9)',
        backgroundColor: 'var(--tuanki-warning-light, rgba(245, 158, 11, 0.2))'
      },
      {
        opacity: 0.5,
        transform: 'scale(1.05)',
        backgroundColor: 'var(--tuanki-warning-light, rgba(245, 158, 11, 0.2))'
      },
      {
        opacity: 1,
        transform: 'scale(1)',
        backgroundColor: 'var(--tuanki-secondary-light, rgba(139, 92, 246, 0.15))'
      }
    ], animationConfig);
  }

  /**
   * 选项选择动画
   */
  animateOptionSelection(element: HTMLElement | null, config?: Partial<AnimationConfig>): Promise<void> {
    if (!this.shouldAnimate() || !element) {
      return Promise.resolve();
    }

    const animationConfig = {
      duration: 150,
      easing: 'ease-out',
      delay: 0,
      ...config
    };

    return this.createAnimation(element, [
      { transform: 'scale(1)' },
      { transform: 'scale(1.02)' },
      { transform: 'scale(1)' }
    ], animationConfig);
  }

  /**
   * 悬停效果动画
   */
  animateHover(element: HTMLElement | null, isEntering: boolean): Promise<void> {
    if (!this.shouldAnimate() || !element) {
      return Promise.resolve();
    }

    const keyframes = isEntering
      ? [
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-2px) scale(1.01)' }
        ]
      : [
          { transform: 'translateY(-2px) scale(1.01)' },
          { transform: 'translateY(0) scale(1)' }
        ];

    return this.createAnimation(element, keyframes, {
      duration: 200,
      easing: 'ease-out',
      delay: 0
    });
  }

  /**
   * 错误状态动画
   */
  animateError(element: HTMLElement | null): Promise<void> {
    if (!this.shouldAnimate() || !element) {
      return Promise.resolve();
    }

    return this.createAnimation(element, [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' }
    ], {
      duration: 400,
      easing: 'ease-in-out',
      delay: 0
    });
  }

  /**
   * 加载状态动画
   */
  animateLoading(element: HTMLElement): Animation | null {
    if (!this.shouldAnimate()) {
      return null;
    }

    const animation = element.animate([
      { opacity: 0.6 },
      { opacity: 1 },
      { opacity: 0.6 }
    ], {
      duration: 1500,
      easing: 'ease-in-out',
      iterations: Infinity
    });

    this.animationQueue.push(animation);
    return animation;
  }

  /**
   * 创建动画
   */
  private createAnimation(
    element: HTMLElement | null,
    keyframes: Keyframe[],
    config: AnimationConfig
  ): Promise<void> {
    return new Promise((resolve) => {
      // 检查元素是否有效
      if (!element || typeof element.animate !== 'function') {
        console.warn('[AnimationController] Invalid element or animate not supported');
        resolve();
        return;
      }

      try {
        const animation = element.animate(keyframes, {
          duration: config.duration,
          easing: config.easing,
          delay: config.delay,
          fill: 'forwards'
        });

        this.animationQueue.push(animation);

        animation.addEventListener('finish', () => {
          this.removeFromQueue(animation);
          resolve();
        });

        animation.addEventListener('cancel', () => {
          this.removeFromQueue(animation);
          resolve();
        });
      } catch (error) {
        console.warn('[AnimationController] Animation failed:', error);
        resolve();
      }
    });
  }

  /**
   * 判断是否应该执行动画
   */
  private shouldAnimate(): boolean {
    if (!this.options.enableAnimations) return false;
    if (this.options.reducedMotion) return false;
    if (this.options.performanceMode === 'performance' && this.animationQueue.length > 5) return false;
    
    return true;
  }

  /**
   * 从队列中移除动画
   */
  private removeFromQueue(animation: Animation): void {
    const index = this.animationQueue.indexOf(animation);
    if (index > -1) {
      this.animationQueue.splice(index, 1);
    }
  }

  /**
   * 取消所有动画
   */
  cancelAllAnimations(): void {
    this.animationQueue.forEach(animation => {
      animation.cancel();
    });
    this.animationQueue = [];
  }

  /**
   * 更新动画选项
   */
  updateOptions(options: Partial<AnimationOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 获取当前动画队列状态
   */
  getAnimationStats(): {
    activeAnimations: number;
    totalAnimations: number;
    reducedMotion: boolean;
    enableAnimations: boolean;
  } {
    return {
      activeAnimations: this.animationQueue.length,
      totalAnimations: this.animationQueue.length,
      reducedMotion: this.options.reducedMotion,
      enableAnimations: this.options.enableAnimations
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.cancelAllAnimations();
  }
}
