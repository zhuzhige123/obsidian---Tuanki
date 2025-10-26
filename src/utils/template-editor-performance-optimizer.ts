/**
 * 模板编辑器性能优化器
 * 提供防抖处理、懒加载、内存优化等性能优化功能
 */

// 防抖函数类型
export type DebouncedFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel(): void;
  flush(): void;
};

// 性能监控数据
export interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  componentCount: number;
  updateCount: number;
  lastUpdate: number;
}

// 懒加载配置
export interface LazyLoadConfig {
  threshold: number; // 触发加载的阈值（像素）
  rootMargin: string; // 根边距
  delay: number; // 延迟加载时间（毫秒）
}

// 内存优化配置
export interface MemoryOptimizationConfig {
  maxCacheSize: number; // 最大缓存大小
  cleanupInterval: number; // 清理间隔（毫秒）
  memoryThreshold: number; // 内存阈值（MB）
}

/**
 * 防抖处理器
 */
export class DebounceManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 创建防抖函数
   */
  debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number,
    key?: string
  ): DebouncedFunction<T> {
    const timerKey = key || func.name || 'default';

    const debouncedFn = (...args: Parameters<T>) => {
      // 清除之前的定时器
      const existingTimer = this.timers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // 设置新的定时器
      const timer = setTimeout(() => {
        func.apply(this, args);
        this.timers.delete(timerKey);
      }, delay);

      this.timers.set(timerKey, timer);
    };

    // 取消防抖
    debouncedFn.cancel = () => {
      const timer = this.timers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(timerKey);
      }
    };

    // 立即执行
    debouncedFn.flush = () => {
      const timer = this.timers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        func.apply(this, []);
        this.timers.delete(timerKey);
      }
    };

    return debouncedFn as DebouncedFunction<T>;
  }

  /**
   * 清理所有防抖定时器
   */
  cleanup(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

/**
 * 懒加载管理器
 */
export class LazyLoadManager {
  private observer: IntersectionObserver | null = null;
  private loadedElements: Set<Element> = new Set();
  private config: LazyLoadConfig;

  constructor(config: Partial<LazyLoadConfig> = {}) {
    this.config = {
      threshold: 0.1,
      rootMargin: '50px',
      delay: 100,
      ...config
    };

    this.initializeObserver();
  }

  /**
   * 初始化交叉观察器
   */
  private initializeObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      console.warn('[LazyLoadManager] IntersectionObserver not supported');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.loadedElements.has(entry.target)) {
            this.loadElement(entry.target);
          }
        });
      },
      {
        threshold: this.config.threshold,
        rootMargin: this.config.rootMargin
      }
    );
  }

  /**
   * 观察元素
   */
  observe(element: Element, loadCallback?: () => void): void {
    if (!this.observer) {
      // 如果不支持IntersectionObserver，立即加载
      if (loadCallback) {
        setTimeout(loadCallback, this.config.delay);
      }
      return;
    }

    // 存储加载回调
    if (loadCallback) {
      (element as any).__lazyLoadCallback = loadCallback;
    }

    this.observer.observe(element);
  }

  /**
   * 停止观察元素
   */
  unobserve(element: Element): void {
    if (this.observer) {
      this.observer.unobserve(element);
    }
    this.loadedElements.delete(element);
  }

  /**
   * 加载元素
   */
  private loadElement(element: Element): void {
    const loadCallback = (element as any).__lazyLoadCallback;
    
    if (loadCallback) {
      setTimeout(() => {
        loadCallback();
        this.loadedElements.add(element);
      }, this.config.delay);
    }
  }

  /**
   * 销毁懒加载管理器
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.loadedElements.clear();
  }
}

/**
 * 内存优化管理器
 */
export class MemoryOptimizer {
  private cache: Map<string, any> = new Map();
  private accessTimes: Map<string, number> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private config: MemoryOptimizationConfig;

  constructor(config: Partial<MemoryOptimizationConfig> = {}) {
    this.config = {
      maxCacheSize: 100,
      cleanupInterval: 30000, // 30秒
      memoryThreshold: 50, // 50MB
      ...config
    };

    this.startCleanupTimer();
  }

  /**
   * 缓存数据
   */
  setCache(key: string, data: any): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, data);
    this.accessTimes.set(key, Date.now());
  }

  /**
   * 获取缓存数据
   */
  getCache(key: string): any {
    const data = this.cache.get(key);
    if (data !== undefined) {
      this.accessTimes.set(key, Date.now());
    }
    return data;
  }

  /**
   * 删除缓存
   */
  removeCache(key: string): void {
    this.cache.delete(key);
    this.accessTimes.delete(key);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.accessTimes.clear();
  }

  /**
   * 驱逐最近最少使用的缓存项
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    this.accessTimes.forEach((time, key) => {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.removeCache(oldestKey);
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 执行清理
   */
  private performCleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分钟

    // 清理过期的缓存项
    this.accessTimes.forEach((time, key) => {
      if (now - time > maxAge) {
        this.removeCache(key);
      }
    });

    // 检查内存使用情况
    this.checkMemoryUsage();
  }

  /**
   * 检查内存使用情况
   */
  private checkMemoryUsage(): void {
    if (typeof performance !== 'undefined' && performance.memory) {
      const memoryUsage = performance.memory.usedJSHeapSize / (1024 * 1024); // MB
      
      if (memoryUsage > this.config.memoryThreshold) {
        console.warn(`[MemoryOptimizer] 内存使用过高: ${memoryUsage.toFixed(2)}MB`);
        
        // 强制清理一半的缓存
        const keysToRemove = Array.from(this.cache.keys()).slice(0, Math.floor(this.cache.size / 2));
        keysToRemove.forEach(key => this.removeCache(key));
      }
    }
  }

  /**
   * 获取内存统计
   */
  getMemoryStats(): any {
    const stats = {
      cacheSize: this.cache.size,
      maxCacheSize: this.config.maxCacheSize,
      memoryUsage: 0,
      memoryThreshold: this.config.memoryThreshold
    };

    if (typeof performance !== 'undefined' && performance.memory) {
      stats.memoryUsage = performance.memory.usedJSHeapSize / (1024 * 1024);
    }

    return stats;
  }

  /**
   * 销毁内存优化器
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clearCache();
  }
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    renderTime: 0,
    memoryUsage: 0,
    componentCount: 0,
    updateCount: 0,
    lastUpdate: Date.now()
  };

  private renderStartTime: number = 0;

  /**
   * 开始渲染计时
   */
  startRender(): void {
    this.renderStartTime = performance.now();
  }

  /**
   * 结束渲染计时
   */
  endRender(): void {
    if (this.renderStartTime > 0) {
      this.metrics.renderTime = performance.now() - this.renderStartTime;
      this.metrics.lastUpdate = Date.now();
      this.renderStartTime = 0;
    }
  }

  /**
   * 更新组件计数
   */
  updateComponentCount(count: number): void {
    this.metrics.componentCount = count;
    this.metrics.updateCount++;
  }

  /**
   * 更新内存使用情况
   */
  updateMemoryUsage(): void {
    if (typeof performance !== 'undefined' && performance.memory) {
      this.metrics.memoryUsage = performance.memory.usedJSHeapSize / (1024 * 1024);
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    this.updateMemoryUsage();
    return { ...this.metrics };
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.metrics = {
      renderTime: 0,
      memoryUsage: 0,
      componentCount: 0,
      updateCount: 0,
      lastUpdate: Date.now()
    };
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport(): string {
    const metrics = this.getMetrics();
    
    return `
性能报告:
- 渲染时间: ${metrics.renderTime.toFixed(2)}ms
- 内存使用: ${metrics.memoryUsage.toFixed(2)}MB
- 组件数量: ${metrics.componentCount}
- 更新次数: ${metrics.updateCount}
- 最后更新: ${new Date(metrics.lastUpdate).toLocaleTimeString()}
    `.trim();
  }
}

/**
 * 模板编辑器性能优化器
 */
export class TemplateEditorPerformanceOptimizer {
  private debounceManager: DebounceManager;
  private lazyLoadManager: LazyLoadManager;
  private memoryOptimizer: MemoryOptimizer;
  private performanceMonitor: PerformanceMonitor;

  constructor(
    lazyLoadConfig?: Partial<LazyLoadConfig>,
    memoryConfig?: Partial<MemoryOptimizationConfig>
  ) {
    this.debounceManager = new DebounceManager();
    this.lazyLoadManager = new LazyLoadManager(lazyLoadConfig);
    this.memoryOptimizer = new MemoryOptimizer(memoryConfig);
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * 获取防抖管理器
   */
  getDebounceManager(): DebounceManager {
    return this.debounceManager;
  }

  /**
   * 获取懒加载管理器
   */
  getLazyLoadManager(): LazyLoadManager {
    return this.lazyLoadManager;
  }

  /**
   * 获取内存优化器
   */
  getMemoryOptimizer(): MemoryOptimizer {
    return this.memoryOptimizer;
  }

  /**
   * 获取性能监控器
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * 创建防抖输入处理器
   */
  createDebouncedInputHandler(
    handler: (value: string) => void,
    delay: number = 300
  ): DebouncedFunction<(value: string) => void> {
    return this.debounceManager.debounce(handler, delay, 'input-handler');
  }

  /**
   * 创建防抖保存处理器
   */
  createDebouncedSaveHandler(
    handler: () => void,
    delay: number = 1000
  ): DebouncedFunction<() => void> {
    return this.debounceManager.debounce(handler, delay, 'save-handler');
  }

  /**
   * 创建防抖验证处理器
   */
  createDebouncedValidationHandler(
    handler: () => void,
    delay: number = 500
  ): DebouncedFunction<() => void> {
    return this.debounceManager.debounce(handler, delay, 'validation-handler');
  }

  /**
   * 优化大列表渲染
   */
  optimizeListRendering(
    items: any[],
    visibleCount: number = 20
  ): { visibleItems: any[]; hasMore: boolean } {
    return {
      visibleItems: items.slice(0, visibleCount),
      hasMore: items.length > visibleCount
    };
  }

  /**
   * 缓存计算结果
   */
  memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T {
    const cache = new Map<string, ReturnType<T>>();

    return ((...args: Parameters<T>): ReturnType<T> => {
      const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);
      
      if (cache.has(key)) {
        return cache.get(key)!;
      }

      const result = fn(...args);
      cache.set(key, result);
      
      // 限制缓存大小
      if (cache.size > 100) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }

      return result;
    }) as T;
  }

  /**
   * 获取综合性能报告
   */
  getPerformanceReport(): any {
    return {
      performance: this.performanceMonitor.getMetrics(),
      memory: this.memoryOptimizer.getMemoryStats(),
      timestamp: Date.now()
    };
  }

  /**
   * 销毁优化器
   */
  destroy(): void {
    this.debounceManager.cleanup();
    this.lazyLoadManager.destroy();
    this.memoryOptimizer.destroy();
    this.performanceMonitor.reset();
  }
}

// 全局性能优化器实例
let globalOptimizer: TemplateEditorPerformanceOptimizer | null = null;

/**
 * 获取全局性能优化器
 */
export function getTemplateEditorOptimizer(): TemplateEditorPerformanceOptimizer {
  if (!globalOptimizer) {
    globalOptimizer = new TemplateEditorPerformanceOptimizer();
  }
  return globalOptimizer;
}

/**
 * 便捷的防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): DebouncedFunction<T> {
  const optimizer = getTemplateEditorOptimizer();
  return optimizer.getDebounceManager().debounce(func, delay);
}
