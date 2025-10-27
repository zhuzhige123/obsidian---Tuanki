/**
 * 高性能预览管理器
 * 优化Markdown预览渲染性能，实现智能缓存和防抖机制
 */

import { MarkdownRenderer, Component } from 'obsidian';
import type AnkiPlugin from '../main';
import type { EditorResourceManager } from './resource-manager';

export interface PreviewOptions {
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
  /** 最大缓存大小 */
  maxCacheSize?: number;
  /** 渲染超时时间（毫秒） */
  renderTimeout?: number;
  /** 是否启用增量渲染 */
  enableIncrementalRender?: boolean;
  /** 是否启用内容缓存 */
  enableContentCache?: boolean;
}

export interface PreviewRenderResult {
  success: boolean;
  renderTime: number;
  contentHash: string;
  fromCache: boolean;
  error?: string;
}

interface CachedPreview {
  contentHash: string;
  renderedHTML: string;
  timestamp: number;
  renderTime: number;
}

/**
 * 高性能预览管理器
 */
export class PreviewManager {
  private editorId: string;
  private plugin: AnkiPlugin;
  private resourceManager: EditorResourceManager;
  private options: Required<PreviewOptions>;
  
  // 渲染状态
  private isRendering = false;
  private renderQueue: Array<{ content: string; resolve: Function; reject: Function }> = [];
  private currentComponent: Component | null = null;
  private abortController: AbortController | null = null;
  
  // 防抖和缓存
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private contentCache = new Map<string, CachedPreview>();
  private lastContentHash = '';
  
  // 性能监控
  private renderStats = {
    totalRenders: 0,
    cacheHits: 0,
    averageRenderTime: 0,
    lastRenderTime: 0
  };

  constructor(
    editorId: string,
    plugin: AnkiPlugin,
    resourceManager: EditorResourceManager,
    options: PreviewOptions = {}
  ) {
    this.editorId = editorId;
    this.plugin = plugin;
    this.resourceManager = resourceManager;
    this.options = {
      debounceDelay: 300,
      maxCacheSize: 50,
      renderTimeout: 5000,
      enableIncrementalRender: true,
      enableContentCache: true,
      ...options
    };

    console.debug(`[PreviewManager] 创建预览管理器: ${editorId}`);
  }

  /**
   * 渲染预览（带防抖和缓存）
   */
  async renderPreview(
    content: string,
    container: HTMLElement
  ): Promise<PreviewRenderResult> {
    const contentHash = this.generateContentHash(content);
    
    // 检查缓存
    if (this.options.enableContentCache && this.contentCache.has(contentHash)) {
      const cached = this.contentCache.get(contentHash)!;
      container.innerHTML = cached.renderedHTML;
      
      this.renderStats.cacheHits++;
      console.debug(`[PreviewManager] 缓存命中: ${this.editorId}`);
      
      return {
        success: true,
        renderTime: 0,
        contentHash,
        fromCache: true
      };
    }

    // 防抖处理
    return new Promise((resolve, reject) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(async () => {
        try {
          const result = await this.performRender(content, container, contentHash);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, this.options.debounceDelay);

      // 注册定时器到资源管理器
      if (this.debounceTimer) {
        this.resourceManager.registerTimer(
          this.debounceTimer,
          'timeout',
          '预览防抖定时器'
        );
      }
    });
  }

  /**
   * 执行实际渲染
   */
  private async performRender(
    content: string,
    container: HTMLElement,
    contentHash: string
  ): Promise<PreviewRenderResult> {
    if (this.isRendering) {
      // 如果正在渲染，加入队列
      return new Promise((resolve, reject) => {
        this.renderQueue.push({ content, resolve, reject });
      });
    }

    this.isRendering = true;
    const startTime = performance.now();

    try {
      // 中止之前的渲染
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      // 清理之前的组件
      this.cleanup();

      // 空内容处理
      if (!content || content.trim() === '') {
        container.innerHTML = '<div class="unified-preview-empty">预览内容为空</div>';
        return this.createSuccessResult(performance.now() - startTime, contentHash, false);
      }

      // 创建新组件
      this.currentComponent = new Component();
      
      // 注册组件到资源管理器
      this.resourceManager.registerComponent(
        this.currentComponent,
        () => this.cleanup(),
        'Markdown预览组件'
      );

      // 渲染超时保护
      const renderPromise = this.renderWithTimeout(content, container);
      const result = await renderPromise;

      // 缓存渲染结果
      if (this.options.enableContentCache) {
        this.cacheRenderResult(contentHash, container.innerHTML, performance.now() - startTime);
      }

      // 更新统计
      this.updateRenderStats(performance.now() - startTime);

      return this.createSuccessResult(performance.now() - startTime, contentHash, false);

    } catch (error) {
      console.error(`[PreviewManager] 渲染失败 [${this.editorId}]:`, error);
      
      // 显示错误信息
      container.innerHTML = `
        <div class="unified-preview-error">
          <div class="error-title">预览渲染失败</div>
          <div class="error-message">${error instanceof Error ? error.message : '未知错误'}</div>
          <div class="error-actions">
            <button onclick="this.parentElement.parentElement.style.display='none'">隐藏错误</button>
          </div>
        </div>
      `;

      return {
        success: false,
        renderTime: performance.now() - startTime,
        contentHash,
        fromCache: false,
        error: error instanceof Error ? error.message : String(error)
      };

    } finally {
      this.isRendering = false;
      this.processRenderQueue();
    }
  }

  /**
   * 带超时的渲染
   */
  private async renderWithTimeout(content: string, container: HTMLElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`渲染超时 (${this.options.renderTimeout}ms)`));
      }, this.options.renderTimeout);

      // 执行实际渲染
      MarkdownRenderer.render(
        this.plugin.app,
        content,
        container,
        '',
        this.currentComponent!
      ).then(() => {
        clearTimeout(timeoutId);
        resolve();
      }).catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * 处理渲染队列
   */
  private async processRenderQueue(): Promise<void> {
    if (this.renderQueue.length === 0) return;

    const { content, resolve, reject } = this.renderQueue.shift()!;
    
    try {
      const contentHash = this.generateContentHash(content);
      // 这里需要容器，但队列中没有，所以暂时跳过队列处理
      // 实际实现中需要重新设计队列结构
      resolve({ success: false, error: '队列处理暂未实现' });
    } catch (error) {
      reject(error);
    }
  }

  /**
   * 生成内容哈希
   */
  private generateContentHash(content: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 缓存渲染结果
   */
  private cacheRenderResult(contentHash: string, html: string, renderTime: number): void {
    // 清理过期缓存
    if (this.contentCache.size >= this.options.maxCacheSize) {
      const oldestKey = Array.from(this.contentCache.keys())[0];
      this.contentCache.delete(oldestKey);
    }

    this.contentCache.set(contentHash, {
      contentHash,
      renderedHTML: html,
      timestamp: Date.now(),
      renderTime
    });

    console.debug(`[PreviewManager] 缓存渲染结果: ${this.editorId} (${contentHash})`);
  }

  /**
   * 更新渲染统计
   */
  private updateRenderStats(renderTime: number): void {
    this.renderStats.totalRenders++;
    this.renderStats.lastRenderTime = renderTime;
    this.renderStats.averageRenderTime = 
      (this.renderStats.averageRenderTime * (this.renderStats.totalRenders - 1) + renderTime) / 
      this.renderStats.totalRenders;
  }

  /**
   * 创建成功结果
   */
  private createSuccessResult(
    renderTime: number,
    contentHash: string,
    fromCache: boolean
  ): PreviewRenderResult {
    return {
      success: true,
      renderTime,
      contentHash,
      fromCache
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.currentComponent) {
      try {
        this.currentComponent.unload();
      } catch (error) {
        console.error(`[PreviewManager] 组件清理失败:`, error);
      }
      this.currentComponent = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    return {
      ...this.renderStats,
      cacheSize: this.contentCache.size,
      cacheHitRate: this.renderStats.totalRenders > 0 
        ? (this.renderStats.cacheHits / this.renderStats.totalRenders * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.contentCache.clear();
    console.debug(`[PreviewManager] 缓存已清理: ${this.editorId}`);
  }

  /**
   * 销毁预览管理器
   */
  destroy(): void {
    this.cleanup();
    this.clearCache();
    this.renderQueue.length = 0;
    console.debug(`[PreviewManager] 预览管理器已销毁: ${this.editorId}`);
  }
}
