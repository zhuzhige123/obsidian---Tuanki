/**
 * 模板切换优化工具
 * 优化模板切换性能，改善用户体验
 */

import type { TriadTemplate, FieldTemplate } from '../data/template-types';
import type AnkiPlugin from '../main';

export interface TemplateSwitchOptions {
  /** 是否启用预加载 */
  enablePreload: boolean;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 是否启用平滑过渡 */
  enableSmoothTransition: boolean;
  /** 切换延迟（毫秒） */
  switchDelay: number;
  /** 缓存大小限制 */
  cacheLimit: number;
}

export interface TemplateSwitchResult {
  success: boolean;
  switchTime: number;
  fromTemplate?: string;
  toTemplate: string;
  cacheHit: boolean;
  message?: string;
}

export interface TemplateCache {
  template: TriadTemplate;
  lastUsed: number;
  useCount: number;
  preloaded: boolean;
}

export class TemplateSwitchOptimizer {
  private plugin: AnkiPlugin;
  private templateCache = new Map<string, TemplateCache>();
  private preloadQueue: string[] = [];
  private switchHistory: string[] = [];
  private options: TemplateSwitchOptions;

  constructor(plugin: AnkiPlugin, options?: Partial<TemplateSwitchOptions>) {
    this.plugin = plugin;
    this.options = {
      enablePreload: true,
      enableCache: true,
      enableSmoothTransition: true,
      switchDelay: 50,
      cacheLimit: 10,
      ...options
    };

    // 启动预加载和缓存清理
    this.startBackgroundTasks();
  }

  /**
   * 优化的模板切换
   */
  async switchTemplate(
    fromTemplateId: string | null,
    toTemplateId: string,
    template: TriadTemplate
  ): Promise<TemplateSwitchResult> {
    const startTime = performance.now();
    
    try {
      console.log('🔄 [TemplateSwitchOptimizer] 开始模板切换:', {
        from: fromTemplateId,
        to: toTemplateId
      });

      // 检查缓存
      const cacheHit = this.options.enableCache && this.templateCache.has(toTemplateId);
      
      if (cacheHit) {
        console.log('✅ [TemplateSwitchOptimizer] 缓存命中:', toTemplateId);
        this.updateCacheUsage(toTemplateId);
      } else if (this.options.enableCache) {
        console.log('📦 [TemplateSwitchOptimizer] 添加到缓存:', toTemplateId);
        this.addToCache(toTemplateId, template);
      }

      // 平滑过渡
      if (this.options.enableSmoothTransition && fromTemplateId) {
        await this.performSmoothTransition(fromTemplateId, toTemplateId);
      }

      // 更新切换历史
      this.updateSwitchHistory(toTemplateId);

      // 预加载相关模板
      if (this.options.enablePreload) {
        this.schedulePreload(toTemplateId);
      }

      const switchTime = performance.now() - startTime;
      
      console.log('✅ [TemplateSwitchOptimizer] 模板切换完成:', {
        switchTime: `${switchTime.toFixed(2)}ms`,
        cacheHit
      });

      return {
        success: true,
        switchTime,
        fromTemplate: fromTemplateId || undefined,
        toTemplate: toTemplateId,
        cacheHit,
        message: `模板切换完成 (${switchTime.toFixed(2)}ms)`
      };

    } catch (error) {
      const switchTime = performance.now() - startTime;
      console.error('❌ [TemplateSwitchOptimizer] 模板切换失败:', error);
      
      return {
        success: false,
        switchTime,
        fromTemplate: fromTemplateId || undefined,
        toTemplate: toTemplateId,
        cacheHit: false,
        message: `模板切换失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 预加载模板
   */
  async preloadTemplate(templateId: string, template: TriadTemplate): Promise<void> {
    if (!this.options.enablePreload || this.templateCache.has(templateId)) {
      return;
    }

    try {
      console.log('🔄 [TemplateSwitchOptimizer] 预加载模板:', templateId);
      
      // 模拟预加载过程（解析模板、准备数据等）
      await this.prepareTemplate(template);
      
      // 添加到缓存并标记为预加载
      this.addToCache(templateId, template, true);
      
      console.log('✅ [TemplateSwitchOptimizer] 模板预加载完成:', templateId);
    } catch (error) {
      console.error('❌ [TemplateSwitchOptimizer] 模板预加载失败:', templateId, error);
    }
  }

  /**
   * 获取推荐的下一个模板
   */
  getRecommendedTemplates(currentTemplateId: string, limit: number = 3): string[] {
    // 基于使用历史和频率推荐
    const recommendations: string[] = [];
    
    // 1. 最近使用的模板
    const recentTemplates = this.switchHistory
      .slice(-10)
      .filter(id => id !== currentTemplateId)
      .reverse();
    
    // 2. 使用频率高的模板
    const frequentTemplates = Array.from(this.templateCache.entries())
      .filter(([id]) => id !== currentTemplateId)
      .sort(([, a], [, b]) => b.useCount - a.useCount)
      .map(([id]) => id);
    
    // 合并推荐列表
    const combined = [...new Set([...recentTemplates, ...frequentTemplates])];
    
    return combined.slice(0, limit);
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    size: number;
    limit: number;
    hitRate: number;
    mostUsed: Array<{ id: string; useCount: number; lastUsed: number }>;
  } {
    const cacheEntries = Array.from(this.templateCache.entries());
    const totalRequests = cacheEntries.reduce((sum, [, cache]) => sum + cache.useCount, 0);
    const cacheHits = cacheEntries.length > 0 ? totalRequests : 0;
    
    return {
      size: this.templateCache.size,
      limit: this.options.cacheLimit,
      hitRate: totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0,
      mostUsed: cacheEntries
        .map(([id, cache]) => ({
          id,
          useCount: cache.useCount,
          lastUsed: cache.lastUsed
        }))
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 5)
    };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    console.log('🧹 [TemplateSwitchOptimizer] 清理模板缓存');
    this.templateCache.clear();
    this.preloadQueue = [];
    this.switchHistory = [];
  }

  /**
   * 更新优化选项
   */
  updateOptions(newOptions: Partial<TemplateSwitchOptions>): void {
    this.options = { ...this.options, ...newOptions };
    console.log('⚙️ [TemplateSwitchOptimizer] 更新优化选项:', this.options);
  }

  /**
   * 添加模板到缓存
   */
  private addToCache(templateId: string, template: TriadTemplate, preloaded: boolean = false): void {
    // 检查缓存大小限制
    if (this.templateCache.size >= this.options.cacheLimit) {
      this.evictLeastUsed();
    }

    this.templateCache.set(templateId, {
      template,
      lastUsed: Date.now(),
      useCount: preloaded ? 0 : 1,
      preloaded
    });
  }

  /**
   * 更新缓存使用情况
   */
  private updateCacheUsage(templateId: string): void {
    const cache = this.templateCache.get(templateId);
    if (cache) {
      cache.lastUsed = Date.now();
      cache.useCount++;
      cache.preloaded = false; // 标记为实际使用
    }
  }

  /**
   * 驱逐最少使用的缓存项
   */
  private evictLeastUsed(): void {
    let leastUsedId: string | null = null;
    let leastUsedTime = Date.now();
    let leastUseCount = Infinity;

    for (const [id, cache] of this.templateCache.entries()) {
      if (cache.useCount < leastUseCount || 
          (cache.useCount === leastUseCount && cache.lastUsed < leastUsedTime)) {
        leastUsedId = id;
        leastUsedTime = cache.lastUsed;
        leastUseCount = cache.useCount;
      }
    }

    if (leastUsedId) {
      console.log('🗑️ [TemplateSwitchOptimizer] 驱逐缓存项:', leastUsedId);
      this.templateCache.delete(leastUsedId);
    }
  }

  /**
   * 执行平滑过渡
   */
  private async performSmoothTransition(fromTemplateId: string, toTemplateId: string): Promise<void> {
    if (this.options.switchDelay > 0) {
      console.log('🎭 [TemplateSwitchOptimizer] 执行平滑过渡:', {
        from: fromTemplateId,
        to: toTemplateId,
        delay: this.options.switchDelay
      });
      
      await new Promise(resolve => setTimeout(resolve, this.options.switchDelay));
    }
  }

  /**
   * 更新切换历史
   */
  private updateSwitchHistory(templateId: string): void {
    this.switchHistory.push(templateId);
    
    // 保持历史记录在合理范围内
    if (this.switchHistory.length > 50) {
      this.switchHistory = this.switchHistory.slice(-30);
    }
  }

  /**
   * 调度预加载
   */
  private schedulePreload(currentTemplateId: string): void {
    const recommendations = this.getRecommendedTemplates(currentTemplateId, 2);
    
    recommendations.forEach(templateId => {
      if (!this.templateCache.has(templateId) && !this.preloadQueue.includes(templateId)) {
        this.preloadQueue.push(templateId);
      }
    });
  }

  /**
   * 准备模板（模拟预处理）
   */
  private async prepareTemplate(template: TriadTemplate): Promise<void> {
    // 模拟模板预处理时间
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 这里可以添加实际的模板预处理逻辑
    // 例如：解析字段、编译正则表达式、准备Markdown渲染等
  }

  /**
   * 启动后台任务
   */
  private startBackgroundTasks(): void {
    // 定期清理过期缓存
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 60000); // 每分钟清理一次

    // 处理预加载队列
    setInterval(() => {
      this.processPreloadQueue();
    }, 5000); // 每5秒处理预加载队列
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30分钟

    for (const [id, cache] of this.templateCache.entries()) {
      if (now - cache.lastUsed > maxAge && cache.useCount === 0) {
        console.log('🧹 [TemplateSwitchOptimizer] 清理过期缓存:', id);
        this.templateCache.delete(id);
      }
    }
  }

  /**
   * 处理预加载队列
   */
  private async processPreloadQueue(): Promise<void> {
    if (this.preloadQueue.length === 0) return;

    const templateId = this.preloadQueue.shift();
    if (!templateId) return;

    try {
      // 这里需要从服务中获取模板
      // 由于这是一个优化工具，实际的模板获取应该由调用方处理
      console.log('📋 [TemplateSwitchOptimizer] 预加载队列中的模板:', templateId);
    } catch (error) {
      console.error('❌ [TemplateSwitchOptimizer] 预加载队列处理失败:', error);
    }
  }
}
