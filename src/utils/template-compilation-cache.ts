/**
 * 模板编译缓存系统
 * 缓存模板编译结果，避免重复编译，提升系统响应速度
 */

import type { RegexParseTemplate } from '../data/template-types';

export interface CompiledTemplate {
  id: string;
  template: RegexParseTemplate;
  compiledRegex: RegExp;
  compilationTime: number;
  lastUsed: number;
  useCount: number;
  hash: string;
}

export interface CacheStatistics {
  totalTemplates: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  totalCompilationTime: number;
  averageCompilationTime: number;
  cacheSize: number;
  memoryUsage: number;
}

export interface CacheConfiguration {
  maxSize: number;
  maxAge: number; // 毫秒
  cleanupInterval: number; // 毫秒
  enableStatistics: boolean;
  enablePersistence: boolean;
  persistenceKey: string;
}

/**
 * 模板编译缓存管理器
 * 提供高效的模板编译结果缓存和管理功能
 */
export class TemplateCompilationCache {
  private cache: Map<string, CompiledTemplate> = new Map();
  private statistics: CacheStatistics;
  private config: CacheConfiguration;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<CacheConfiguration>) {
    this.config = {
      maxSize: 100,
      maxAge: 30 * 60 * 1000, // 30分钟
      cleanupInterval: 5 * 60 * 1000, // 5分钟
      enableStatistics: true,
      enablePersistence: false,
      persistenceKey: 'tuanki_template_cache',
      ...config
    };

    this.statistics = {
      totalTemplates: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      totalCompilationTime: 0,
      averageCompilationTime: 0,
      cacheSize: 0,
      memoryUsage: 0
    };

    this.startCleanupTimer();
    this.loadFromPersistence();

    console.log(`🗄️ [TemplateCache] 缓存系统已初始化，最大容量: ${this.config.maxSize}`);
  }

  /**
   * 获取编译后的模板
   */
  getCompiledTemplate(template: RegexParseTemplate): CompiledTemplate {
    const templateHash = this.generateTemplateHash(template);
    const cached = this.cache.get(templateHash);

    if (cached && this.isValidCacheEntry(cached)) {
      // 缓存命中
      cached.lastUsed = Date.now();
      cached.useCount++;
      
      if (this.config.enableStatistics) {
        this.statistics.hitCount++;
        this.updateHitRate();
      }

      console.log(`✅ [TemplateCache] 缓存命中: ${template.name} (使用次数: ${cached.useCount})`);
      return cached;
    }

    // 缓存未命中，编译模板
    const compiledTemplate = this.compileTemplate(template, templateHash);
    this.cache.set(templateHash, compiledTemplate);

    if (this.config.enableStatistics) {
      this.statistics.missCount++;
      this.statistics.totalTemplates++;
      this.updateHitRate();
      this.updateStatistics();
    }

    // 检查缓存大小限制
    this.enforceMaxSize();

    // 持久化缓存
    this.saveToPersistence();

    console.log(`📝 [TemplateCache] 模板已编译并缓存: ${template.name}`);
    return compiledTemplate;
  }

  /**
   * 预编译模板
   */
  precompileTemplate(template: RegexParseTemplate): void {
    const templateHash = this.generateTemplateHash(template);
    
    if (!this.cache.has(templateHash)) {
      const compiledTemplate = this.compileTemplate(template, templateHash);
      this.cache.set(templateHash, compiledTemplate);
      
      console.log(`🚀 [TemplateCache] 预编译完成: ${template.name}`);
    }
  }

  /**
   * 批量预编译模板
   */
  async precompileTemplates(templates: RegexParseTemplate[]): Promise<void> {
    console.log(`🚀 [TemplateCache] 开始批量预编译 ${templates.length} 个模板`);
    
    const startTime = Date.now();
    let compiledCount = 0;

    for (const template of templates) {
      try {
        this.precompileTemplate(template);
        compiledCount++;
      } catch (error) {
        console.error(`❌ [TemplateCache] 预编译失败: ${template.name}`, error);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ [TemplateCache] 批量预编译完成: ${compiledCount}/${templates.length} (${totalTime}ms)`);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    const oldSize = this.cache.size;
    this.cache.clear();
    
    if (this.config.enableStatistics) {
      this.resetStatistics();
    }

    this.saveToPersistence();
    console.log(`🗑️ [TemplateCache] 缓存已清除，释放了 ${oldSize} 个条目`);
  }

  /**
   * 清除过期缓存
   */
  clearExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [hash, compiled] of this.cache.entries()) {
      if (now - compiled.lastUsed > this.config.maxAge) {
        this.cache.delete(hash);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.updateStatistics();
      this.saveToPersistence();
      console.log(`🧹 [TemplateCache] 清除了 ${removedCount} 个过期缓存条目`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStatistics(): CacheStatistics {
    if (this.config.enableStatistics) {
      this.updateStatistics();
    }
    return { ...this.statistics };
  }

  /**
   * 获取缓存详情
   */
  getCacheDetails(): Array<{
    id: string;
    templateName: string;
    hash: string;
    compilationTime: number;
    lastUsed: string;
    useCount: number;
    age: number;
  }> {
    const now = Date.now();
    return Array.from(this.cache.values()).map(compiled => ({
      id: compiled.id,
      templateName: compiled.template.name,
      hash: compiled.hash,
      compilationTime: compiled.compilationTime,
      lastUsed: new Date(compiled.lastUsed).toLocaleString('zh-CN'),
      useCount: compiled.useCount,
      age: now - compiled.lastUsed
    }));
  }

  /**
   * 销毁缓存系统
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.saveToPersistence();
    this.cache.clear();
    
    console.log('🗄️ [TemplateCache] 缓存系统已销毁');
  }

  // 私有方法

  private compileTemplate(template: RegexParseTemplate, hash: string): CompiledTemplate {
    const startTime = performance.now();
    
    try {
      // 构建正则表达式标志
      const flags = this.buildRegexFlags(template.parseOptions);
      
      // 编译正则表达式
      const compiledRegex = new RegExp(template.regex, flags);
      
      const compilationTime = performance.now() - startTime;
      
      const compiled: CompiledTemplate = {
        id: this.generateId(),
        template: { ...template }, // 深拷贝模板
        compiledRegex,
        compilationTime,
        lastUsed: Date.now(),
        useCount: 1,
        hash
      };

      if (this.config.enableStatistics) {
        this.statistics.totalCompilationTime += compilationTime;
      }

      return compiled;
    } catch (error) {
      console.error(`❌ [TemplateCache] 模板编译失败: ${template.name}`, error);
      throw new Error(`模板编译失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateTemplateHash(template: RegexParseTemplate): string {
    // 生成模板的唯一哈希值
    const content = JSON.stringify({
      name: template.name,
      regex: template.regex,
      parseOptions: template.parseOptions,
      fieldMappings: template.fieldMappings
    });

    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }

    return hash.toString(16);
  }

  private buildRegexFlags(options?: RegexParseTemplate['parseOptions']): string {
    let flags = '';
    if (options?.global) flags += 'g';
    if (options?.multiline) flags += 'm';
    if (options?.ignoreCase) flags += 'i';
    return flags || 'gm';
  }

  private isValidCacheEntry(compiled: CompiledTemplate): boolean {
    const now = Date.now();
    return (now - compiled.lastUsed) <= this.config.maxAge;
  }

  private enforceMaxSize(): void {
    if (this.cache.size <= this.config.maxSize) {
      return;
    }

    // 按最后使用时间排序，删除最旧的条目
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

    const toRemove = this.cache.size - this.config.maxSize;
    for (let i = 0; i < toRemove; i++) {
      const [hash] = entries[i];
      this.cache.delete(hash);
    }

    console.log(`📏 [TemplateCache] 缓存大小限制，删除了 ${toRemove} 个最旧的条目`);
  }

  private updateHitRate(): void {
    const total = this.statistics.hitCount + this.statistics.missCount;
    this.statistics.hitRate = total > 0 ? (this.statistics.hitCount / total) * 100 : 0;
  }

  private updateStatistics(): void {
    this.statistics.cacheSize = this.cache.size;
    this.statistics.averageCompilationTime = 
      this.statistics.totalTemplates > 0 
        ? this.statistics.totalCompilationTime / this.statistics.totalTemplates 
        : 0;
    
    // 估算内存使用（简单估算）
    this.statistics.memoryUsage = this.cache.size * 1024; // 假设每个条目1KB
  }

  private resetStatistics(): void {
    this.statistics = {
      totalTemplates: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      totalCompilationTime: 0,
      averageCompilationTime: 0,
      cacheSize: 0,
      memoryUsage: 0
    };
  }

  private startCleanupTimer(): void {
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.clearExpiredCache();
      }, this.config.cleanupInterval);
    }
  }

  private generateId(): string {
    return `compiled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadFromPersistence(): void {
    if (!this.config.enablePersistence) return;

    try {
      const stored = localStorage.getItem(this.config.persistenceKey);
      if (stored) {
        const data = JSON.parse(stored);
        // 这里可以实现缓存的持久化加载逻辑
        console.log(`💾 [TemplateCache] 从持久化存储加载缓存`);
      }
    } catch (error) {
      console.warn(`⚠️ [TemplateCache] 加载持久化缓存失败:`, error);
    }
  }

  private saveToPersistence(): void {
    if (!this.config.enablePersistence) return;

    try {
      // 这里可以实现缓存的持久化保存逻辑
      // 注意：RegExp对象不能直接序列化，需要特殊处理
      console.log(`💾 [TemplateCache] 保存缓存到持久化存储`);
    } catch (error) {
      console.warn(`⚠️ [TemplateCache] 保存持久化缓存失败:`, error);
    }
  }
}

/**
 * 全局缓存实例
 */
let globalCache: TemplateCompilationCache | null = null;

/**
 * 获取全局缓存实例
 */
export function getGlobalTemplateCache(config?: Partial<CacheConfiguration>): TemplateCompilationCache {
  if (!globalCache) {
    globalCache = new TemplateCompilationCache(config);
  }
  return globalCache;
}

/**
 * 销毁全局缓存实例
 */
export function destroyGlobalTemplateCache(): void {
  if (globalCache) {
    globalCache.destroy();
    globalCache = null;
  }
}

/**
 * 缓存装饰器
 * 用于自动缓存模板编译结果
 */
export function withTemplateCache(cache?: TemplateCompilationCache) {
  const cacheInstance = cache || getGlobalTemplateCache();
  
  return function<T extends (...args: any[]) => any>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const method = descriptor.value!;
    
    descriptor.value = function(this: any, template: RegexParseTemplate, ...args: any[]) {
      // 获取缓存的编译结果
      const compiled = cacheInstance.getCompiledTemplate(template);
      
      // 调用原方法，传入编译后的正则表达式
      return method.call(this, compiled, ...args);
    } as T;
    
    return descriptor;
  };
}
