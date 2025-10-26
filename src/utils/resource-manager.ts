/**
 * 资源管理器
 * 统一管理编辑器相关资源，防止内存泄漏
 */

export interface ResourceCleanup {
  (): void;
}

export interface TimerResource {
  id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
  type: 'timeout' | 'interval';
  description?: string;
}

export interface EventListenerResource {
  target: EventTarget;
  type: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
  description?: string;
}

export interface PromiseResource {
  promise: Promise<any>;
  controller?: AbortController;
  description?: string;
}

export interface ComponentResource {
  component: any;
  cleanup: ResourceCleanup;
  description?: string;
}

/**
 * 编辑器资源管理器
 * 跟踪和管理编辑器实例的所有资源
 */
export class EditorResourceManager {
  private editorId: string;
  private timers = new Map<string, TimerResource>();
  private eventListeners = new Map<string, EventListenerResource>();
  private promises = new Map<string, PromiseResource>();
  private components = new Map<string, ComponentResource>();
  private customCleanups = new Map<string, ResourceCleanup>();
  private isDestroyed = false;

  constructor(editorId: string) {
    this.editorId = editorId;
    console.debug(`[ResourceManager] 创建资源管理器: ${editorId}`);
  }

  /**
   * 注册定时器资源
   */
  registerTimer(
    id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>,
    type: 'timeout' | 'interval',
    description?: string
  ): string {
    if (this.isDestroyed) {
      console.warn(`[ResourceManager] 编辑器已销毁，无法注册定时器: ${this.editorId}`);
      return '';
    }

    const resourceId = `timer-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.timers.set(resourceId, { id, type, description });
    
    console.debug(`[ResourceManager] 注册定时器 [${this.editorId}]: ${resourceId} (${description || 'unknown'})`);
    return resourceId;
  }

  /**
   * 注册事件监听器资源
   */
  registerEventListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
    description?: string
  ): string {
    if (this.isDestroyed) {
      console.warn(`[ResourceManager] 编辑器已销毁，无法注册事件监听器: ${this.editorId}`);
      return '';
    }

    const resourceId = `event-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.eventListeners.set(resourceId, { target, type, listener, options, description });
    
    // 实际添加事件监听器
    target.addEventListener(type, listener, options);
    
    console.debug(`[ResourceManager] 注册事件监听器 [${this.editorId}]: ${resourceId} (${type} - ${description || 'unknown'})`);
    return resourceId;
  }

  /**
   * 注册Promise资源
   */
  registerPromise(
    promise: Promise<any>,
    controller?: AbortController,
    description?: string
  ): string {
    if (this.isDestroyed) {
      console.warn(`[ResourceManager] 编辑器已销毁，无法注册Promise: ${this.editorId}`);
      return '';
    }

    const resourceId = `promise-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.promises.set(resourceId, { promise, controller, description });
    
    // 自动清理已完成的Promise
    promise.finally(() => {
      if (!this.isDestroyed) {
        this.promises.delete(resourceId);
        console.debug(`[ResourceManager] Promise自动清理 [${this.editorId}]: ${resourceId}`);
      }
    });
    
    console.debug(`[ResourceManager] 注册Promise [${this.editorId}]: ${resourceId} (${description || 'unknown'})`);
    return resourceId;
  }

  /**
   * 注册组件资源
   */
  registerComponent(
    component: any,
    cleanup: ResourceCleanup,
    description?: string
  ): string {
    if (this.isDestroyed) {
      console.warn(`[ResourceManager] 编辑器已销毁，无法注册组件: ${this.editorId}`);
      return '';
    }

    const resourceId = `component-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.components.set(resourceId, { component, cleanup, description });
    
    console.debug(`[ResourceManager] 注册组件 [${this.editorId}]: ${resourceId} (${description || 'unknown'})`);
    return resourceId;
  }

  /**
   * 注册自定义清理函数
   */
  registerCustomCleanup(cleanup: ResourceCleanup, description?: string): string {
    if (this.isDestroyed) {
      console.warn(`[ResourceManager] 编辑器已销毁，无法注册清理函数: ${this.editorId}`);
      return '';
    }

    const resourceId = `cleanup-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.customCleanups.set(resourceId, cleanup);
    
    console.debug(`[ResourceManager] 注册清理函数 [${this.editorId}]: ${resourceId} (${description || 'unknown'})`);
    return resourceId;
  }

  /**
   * 移除特定资源
   */
  unregisterResource(resourceId: string): boolean {
    if (this.isDestroyed) {
      return false;
    }

    // 检查并清理定时器
    if (this.timers.has(resourceId)) {
      const timer = this.timers.get(resourceId)!;
      if (timer.type === 'timeout') {
        clearTimeout(timer.id);
      } else {
        clearInterval(timer.id);
      }
      this.timers.delete(resourceId);
      console.debug(`[ResourceManager] 移除定时器 [${this.editorId}]: ${resourceId}`);
      return true;
    }

    // 检查并清理事件监听器
    if (this.eventListeners.has(resourceId)) {
      const listener = this.eventListeners.get(resourceId)!;
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
      this.eventListeners.delete(resourceId);
      console.debug(`[ResourceManager] 移除事件监听器 [${this.editorId}]: ${resourceId}`);
      return true;
    }

    // 检查并清理Promise
    if (this.promises.has(resourceId)) {
      const promiseResource = this.promises.get(resourceId)!;
      if (promiseResource.controller) {
        promiseResource.controller.abort();
      }
      this.promises.delete(resourceId);
      console.debug(`[ResourceManager] 移除Promise [${this.editorId}]: ${resourceId}`);
      return true;
    }

    // 检查并清理组件
    if (this.components.has(resourceId)) {
      const component = this.components.get(resourceId)!;
      try {
        component.cleanup();
      } catch (error) {
        console.error(`[ResourceManager] 组件清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
      this.components.delete(resourceId);
      console.debug(`[ResourceManager] 移除组件 [${this.editorId}]: ${resourceId}`);
      return true;
    }

    // 检查并清理自定义清理函数
    if (this.customCleanups.has(resourceId)) {
      const cleanup = this.customCleanups.get(resourceId)!;
      try {
        cleanup();
      } catch (error) {
        console.error(`[ResourceManager] 自定义清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
      this.customCleanups.delete(resourceId);
      console.debug(`[ResourceManager] 执行自定义清理 [${this.editorId}]: ${resourceId}`);
      return true;
    }

    return false;
  }

  /**
   * 获取资源统计信息
   */
  getResourceStats(): {
    timers: number;
    eventListeners: number;
    promises: number;
    components: number;
    customCleanups: number;
    total: number;
  } {
    return {
      timers: this.timers.size,
      eventListeners: this.eventListeners.size,
      promises: this.promises.size,
      components: this.components.size,
      customCleanups: this.customCleanups.size,
      total: this.timers.size + this.eventListeners.size + this.promises.size + 
             this.components.size + this.customCleanups.size
    };
  }

  /**
   * 检查是否有资源泄漏
   */
  checkForLeaks(): string[] {
    const leaks: string[] = [];
    const stats = this.getResourceStats();

    if (stats.timers > 10) {
      leaks.push(`定时器过多: ${stats.timers}`);
    }

    if (stats.eventListeners > 20) {
      leaks.push(`事件监听器过多: ${stats.eventListeners}`);
    }

    if (stats.promises > 5) {
      leaks.push(`未完成的Promise过多: ${stats.promises}`);
    }

    if (stats.components > 10) {
      leaks.push(`组件过多: ${stats.components}`);
    }

    return leaks;
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    if (this.isDestroyed) {
      console.warn(`[ResourceManager] 资源管理器已销毁: ${this.editorId}`);
      return;
    }

    console.log(`[ResourceManager] 开始销毁资源 [${this.editorId}]`);
    
    const stats = this.getResourceStats();
    console.debug(`[ResourceManager] 销毁前资源统计 [${this.editorId}]:`, stats);

    // 清理定时器
    for (const [resourceId, timer] of this.timers) {
      try {
        if (timer.type === 'timeout') {
          clearTimeout(timer.id);
        } else {
          clearInterval(timer.id);
        }
        console.debug(`[ResourceManager] 清理定时器 [${this.editorId}]: ${resourceId} (${timer.description || 'unknown'})`);
      } catch (error) {
        console.error(`[ResourceManager] 定时器清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
    }
    this.timers.clear();

    // 清理事件监听器
    for (const [resourceId, listener] of this.eventListeners) {
      try {
        listener.target.removeEventListener(listener.type, listener.listener, listener.options);
        console.debug(`[ResourceManager] 清理事件监听器 [${this.editorId}]: ${resourceId} (${listener.type} - ${listener.description || 'unknown'})`);
      } catch (error) {
        console.error(`[ResourceManager] 事件监听器清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
    }
    this.eventListeners.clear();

    // 清理Promise
    for (const [resourceId, promiseResource] of this.promises) {
      try {
        if (promiseResource.controller) {
          promiseResource.controller.abort();
        }
        console.debug(`[ResourceManager] 清理Promise [${this.editorId}]: ${resourceId} (${promiseResource.description || 'unknown'})`);
      } catch (error) {
        console.error(`[ResourceManager] Promise清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
    }
    this.promises.clear();

    // 清理组件
    for (const [resourceId, component] of this.components) {
      try {
        component.cleanup();
        console.debug(`[ResourceManager] 清理组件 [${this.editorId}]: ${resourceId} (${component.description || 'unknown'})`);
      } catch (error) {
        console.error(`[ResourceManager] 组件清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
    }
    this.components.clear();

    // 执行自定义清理
    for (const [resourceId, cleanup] of this.customCleanups) {
      try {
        cleanup();
        console.debug(`[ResourceManager] 执行自定义清理 [${this.editorId}]: ${resourceId}`);
      } catch (error) {
        console.error(`[ResourceManager] 自定义清理失败 [${this.editorId}]: ${resourceId}`, error);
      }
    }
    this.customCleanups.clear();

    this.isDestroyed = true;
    console.log(`[ResourceManager] 资源销毁完成 [${this.editorId}]`);
  }

  /**
   * 检查是否已销毁
   */
  isDestroyed_(): boolean {
    return this.isDestroyed;
  }
}

/**
 * 全局资源管理器
 * 管理所有编辑器实例的资源管理器
 */
export class GlobalResourceManager {
  private static instance: GlobalResourceManager;
  private editorManagers = new Map<string, EditorResourceManager>();

  private constructor() {}

  static getInstance(): GlobalResourceManager {
    if (!GlobalResourceManager.instance) {
      GlobalResourceManager.instance = new GlobalResourceManager();
    }
    return GlobalResourceManager.instance;
  }

  /**
   * 获取或创建编辑器资源管理器
   */
  getEditorManager(editorId: string): EditorResourceManager {
    if (!this.editorManagers.has(editorId)) {
      this.editorManagers.set(editorId, new EditorResourceManager(editorId));
    }
    return this.editorManagers.get(editorId)!;
  }

  /**
   * 销毁编辑器资源管理器
   */
  destroyEditorManager(editorId: string): void {
    const manager = this.editorManagers.get(editorId);
    if (manager) {
      manager.destroy();
      this.editorManagers.delete(editorId);
    }
  }

  /**
   * 获取全局资源统计
   */
  getGlobalStats(): { [editorId: string]: ReturnType<EditorResourceManager['getResourceStats']> } {
    const stats: { [editorId: string]: ReturnType<EditorResourceManager['getResourceStats']> } = {};
    
    for (const [editorId, manager] of this.editorManagers) {
      stats[editorId] = manager.getResourceStats();
    }
    
    return stats;
  }

  /**
   * 检查全局资源泄漏
   */
  checkGlobalLeaks(): { [editorId: string]: string[] } {
    const leaks: { [editorId: string]: string[] } = {};
    
    for (const [editorId, manager] of this.editorManagers) {
      const editorLeaks = manager.checkForLeaks();
      if (editorLeaks.length > 0) {
        leaks[editorId] = editorLeaks;
      }
    }
    
    return leaks;
  }

  /**
   * 清理所有资源
   */
  cleanup(): void {
    console.log('[GlobalResourceManager] 开始全局资源清理');
    
    for (const [editorId, manager] of this.editorManagers) {
      manager.destroy();
    }
    
    this.editorManagers.clear();
    console.log('[GlobalResourceManager] 全局资源清理完成');
  }
}

/**
 * 获取全局资源管理器实例
 */
export function getGlobalResourceManager(): GlobalResourceManager {
  return GlobalResourceManager.getInstance();
}
