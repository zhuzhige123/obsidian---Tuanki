/**
 * 性能优化配置
 * 提供可调节的性能参数和优化策略
 */

// 防抖和节流配置
export const DEBOUNCE_CONFIG = {
  // 内容编辑防抖延迟（毫秒）
  CONTENT_EDIT: 300,
  
  // 搜索防抖延迟（毫秒）
  SEARCH: 200,
  
  // 自动保存防抖延迟（毫秒）
  AUTO_SAVE: 2000,
  
  // 状态同步防抖延迟（毫秒）
  STATE_SYNC: 100
} as const;

// 缓存配置
export const CACHE_CONFIG = {
  // 模板缓存最大数量
  MAX_TEMPLATE_CACHE: 100,
  
  // 模板缓存过期时间（毫秒）
  TEMPLATE_CACHE_TTL: 5 * 60 * 1000, // 5分钟
  
  // 卡片缓存最大数量
  MAX_CARD_CACHE: 50,
  
  // 卡片缓存过期时间（毫秒）
  CARD_CACHE_TTL: 10 * 60 * 1000, // 10分钟
  
  // 是否启用缓存
  ENABLE_CACHE: true
} as const;

// 渲染优化配置
export const RENDER_CONFIG = {
  // 虚拟滚动阈值
  VIRTUAL_SCROLL_THRESHOLD: 100,
  
  // 批量更新大小
  BATCH_UPDATE_SIZE: 10,
  
  // 渲染帧预算（毫秒）
  FRAME_BUDGET: 16,
  
  // 是否启用虚拟滚动
  ENABLE_VIRTUAL_SCROLL: true,
  
  // 是否启用批量更新
  ENABLE_BATCH_UPDATE: true
} as const;

// 内存管理配置
export const MEMORY_CONFIG = {
  // 最大事件监听器数量
  MAX_EVENT_LISTENERS: 1000,
  
  // 内存清理间隔（毫秒）
  CLEANUP_INTERVAL: 30 * 1000, // 30秒
  
  // 最大状态历史记录数量
  MAX_STATE_HISTORY: 50,
  
  // 是否启用内存监控
  ENABLE_MEMORY_MONITORING: true,
  
  // 内存警告阈值（字节）
  MEMORY_WARNING_THRESHOLD: 50 * 1024 * 1024 // 50MB
} as const;

// 网络请求配置
export const NETWORK_CONFIG = {
  // 请求超时时间（毫秒）
  REQUEST_TIMEOUT: 10 * 1000, // 10秒
  
  // 最大重试次数
  MAX_RETRIES: 3,
  
  // 重试延迟（毫秒）
  RETRY_DELAY: 1000,
  
  // 并发请求限制
  MAX_CONCURRENT_REQUESTS: 5,
  
  // 是否启用请求缓存
  ENABLE_REQUEST_CACHE: true
} as const;

// 编辑器配置
export const EDITOR_CONFIG = {
  // 最大文档大小（字符数）
  MAX_DOCUMENT_SIZE: 1000000, // 1M字符
  
  // 语法高亮延迟（毫秒）
  SYNTAX_HIGHLIGHT_DELAY: 100,
  
  // 自动完成延迟（毫秒）
  AUTOCOMPLETE_DELAY: 200,
  
  // 是否启用语法高亮
  ENABLE_SYNTAX_HIGHLIGHT: true,
  
  // 是否启用自动完成
  ENABLE_AUTOCOMPLETE: true,
  
  // 是否启用实时预览
  ENABLE_LIVE_PREVIEW: true
} as const;

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  private memoryUsage: number[] = [];
  private isMonitoring = false;
  private monitoringInterval: number | null = null;

  /**
   * 开始监控
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // 定期收集内存使用情况
    this.monitoringInterval = window.setInterval(() => {
      this.collectMemoryMetrics();
    }, MEMORY_CONFIG.CLEANUP_INTERVAL);
    
    console.log('[PerformanceMonitor] Monitoring started');
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    console.log('[PerformanceMonitor] Monitoring stopped');
  }

  /**
   * 记录性能指标
   */
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // 保持最近100个值
    if (values.length > 100) {
      values.shift();
    }
  }

  /**
   * 测量函数执行时间
   */
  measure<T>(name: string, fn: () => T): T {
    const startTime = performance.now();
    const result = fn();
    const endTime = performance.now();
    
    this.recordMetric(name, endTime - startTime);
    
    return result;
  }

  /**
   * 异步测量函数执行时间
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    
    this.recordMetric(name, endTime - startTime);
    
    return result;
  }

  /**
   * 获取性能统计
   */
  getStats(name: string): { avg: number; min: number; max: number; count: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { avg, min, max, count: values.length };
  }

  /**
   * 获取所有性能指标
   */
  getAllStats(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const stats: Record<string, any> = {};
    
    for (const [name] of this.metrics) {
      const stat = this.getStats(name);
      if (stat) {
        stats[name] = stat;
      }
    }
    
    return stats;
  }

  /**
   * 收集内存指标
   */
  private collectMemoryMetrics(): void {
    if ((performance as any).memory) {
      const memory = (performance as any).memory;
      const usedMemory = memory.usedJSHeapSize;
      
      this.memoryUsage.push(usedMemory);
      
      // 保持最近100个值
      if (this.memoryUsage.length > 100) {
        this.memoryUsage.shift();
      }
      
      // 检查内存警告
      if (usedMemory > MEMORY_CONFIG.MEMORY_WARNING_THRESHOLD) {
        console.warn('[PerformanceMonitor] High memory usage detected:', usedMemory);
      }
    }
  }

  /**
   * 获取内存使用统计
   */
  getMemoryStats(): { current: number; avg: number; max: number } | null {
    if (this.memoryUsage.length === 0) return null;
    
    const current = this.memoryUsage[this.memoryUsage.length - 1];
    const sum = this.memoryUsage.reduce((a, b) => a + b, 0);
    const avg = sum / this.memoryUsage.length;
    const max = Math.max(...this.memoryUsage);
    
    return { current, avg, max };
  }

  /**
   * 清理旧数据
   */
  cleanup(): void {
    // 清理旧的性能指标
    for (const [name, values] of this.metrics) {
      if (values.length > 50) {
        this.metrics.set(name, values.slice(-50));
      }
    }
    
    // 清理旧的内存数据
    if (this.memoryUsage.length > 50) {
      this.memoryUsage = this.memoryUsage.slice(-50);
    }
  }
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = window.setTimeout(() => {
      func(...args);
    }, delay);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * 批量执行函数
 */
export class BatchProcessor<T> {
  private queue: T[] = [];
  private processor: (items: T[]) => void;
  private batchSize: number;
  private delay: number;
  private timeoutId: number | null = null;

  constructor(
    processor: (items: T[]) => void,
    batchSize: number = RENDER_CONFIG.BATCH_UPDATE_SIZE,
    delay: number = DEBOUNCE_CONFIG.STATE_SYNC
  ) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.delay = delay;
  }

  /**
   * 添加项目到批处理队列
   */
  add(item: T): void {
    this.queue.push(item);
    
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /**
   * 立即处理所有队列项目
   */
  flush(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    if (this.queue.length > 0) {
      const items = this.queue.splice(0);
      this.processor(items);
    }
  }

  /**
   * 调度延迟处理
   */
  private scheduleFlush(): void {
    if (this.timeoutId) return;
    
    this.timeoutId = window.setTimeout(() => {
      this.flush();
    }, this.delay);
  }
}

// 全局性能监控器实例
export const performanceMonitor = new PerformanceMonitor();

// 在开发环境启用性能监控
if (process.env.NODE_ENV === 'development') {
  performanceMonitor.startMonitoring();
}
