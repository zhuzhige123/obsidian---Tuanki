/**
 * 动态扩展管理器
 * 支持CodeMirror 6扩展的热插拔、按需加载和动态配置
 * 
 * 功能：
 * 1. 扩展的动态加载和卸载
 * 2. 扩展依赖管理
 * 3. 扩展状态监控
 * 4. 性能优化的按需加载
 */

import { Compartment, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * 扩展状态枚举
 */
export enum ExtensionStatus {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  ACTIVE = 'active',
  ERROR = 'error',
  DISABLED = 'disabled'
}

/**
 * 扩展配置接口
 */
export interface ExtensionConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  dependencies?: string[];
  lazy?: boolean;
  priority?: number;
  enabled?: boolean;
  config?: Record<string, any>;
}

/**
 * 扩展实例接口
 */
export interface ExtensionInstance {
  config: ExtensionConfig;
  extension: Extension | null;
  compartment: Compartment;
  status: ExtensionStatus;
  loadTime?: number;
  error?: Error;
  dependencies: Set<string>;
  dependents: Set<string>;
}

/**
 * 扩展加载器接口
 */
export interface ExtensionLoader {
  load(config: ExtensionConfig): Promise<Extension>;
  unload?(extensionId: string): Promise<void>;
  configure?(config: ExtensionConfig): Promise<Extension>;
}

/**
 * 扩展事件接口
 */
export interface ExtensionEvent {
  type: 'loaded' | 'unloaded' | 'activated' | 'deactivated' | 'error' | 'configured';
  extensionId: string;
  timestamp: number;
  data?: any;
}

/**
 * 动态扩展管理器
 * 管理CodeMirror编辑器的扩展生命周期
 */
export class DynamicExtensionManager {
  private extensions = new Map<string, ExtensionInstance>();
  private loaders = new Map<string, ExtensionLoader>();
  private editorViews = new Map<string, EditorView>();
  private eventListeners: Array<(event: ExtensionEvent) => void> = [];
  private loadingPromises = new Map<string, Promise<Extension>>();

  /**
   * 注册扩展加载器
   */
  registerLoader(extensionType: string, loader: ExtensionLoader): void {
    this.loaders.set(extensionType, loader);
    console.debug(`[ExtensionManager] 注册加载器: ${extensionType}`);
  }

  /**
   * 注册编辑器视图
   */
  registerEditorView(editorId: string, view: EditorView): void {
    this.editorViews.set(editorId, view);
    console.debug(`[ExtensionManager] 注册编辑器: ${editorId}`);
  }

  /**
   * 注销编辑器视图
   */
  unregisterEditorView(editorId: string): void {
    this.editorViews.delete(editorId);
    console.debug(`[ExtensionManager] 注销编辑器: ${editorId}`);
  }

  /**
   * 加载扩展
   */
  async loadExtension(config: ExtensionConfig): Promise<void> {
    const { id } = config;

    // 检查是否已存在
    if (this.extensions.has(id)) {
      console.debug(`[ExtensionManager] 扩展已存在，跳过加载: ${id}`);
      return;
    }

    // 检查是否正在加载
    if (this.loadingPromises.has(id)) {
      await this.loadingPromises.get(id);
      return;
    }

    // 创建扩展实例
    const instance: ExtensionInstance = {
      config,
      extension: null,
      compartment: new Compartment(),
      status: ExtensionStatus.UNLOADED,
      dependencies: new Set(config.dependencies || []),
      dependents: new Set()
    };

    this.extensions.set(id, instance);

    try {
      // 更新状态
      this.updateExtensionStatus(id, ExtensionStatus.LOADING);

      // 检查依赖
      await this.loadDependencies(config);

      // 获取加载器
      const loader = this.getLoader(config);
      if (!loader) {
        throw new Error(`No loader found for extension type: ${config.id}`);
      }

      // 创建加载Promise
      const loadPromise = this.performLoad(loader, config);
      this.loadingPromises.set(id, loadPromise);

      // 执行加载
      const extension = await loadPromise;
      instance.extension = extension;
      instance.loadTime = Date.now();

      // 更新状态
      this.updateExtensionStatus(id, ExtensionStatus.LOADED);

      // 如果启用，则激活扩展
      if (config.enabled !== false) {
        await this.activateExtension(id);
      }

      // 触发事件
      this.emitEvent({
        type: 'loaded',
        extensionId: id,
        timestamp: Date.now()
      });

      console.info(`[ExtensionManager] 扩展加载成功: ${id}`);

    } catch (error) {
      console.error(`[ExtensionManager] 扩展加载失败: ${id}`, error);
      
      instance.error = error as Error;
      this.updateExtensionStatus(id, ExtensionStatus.ERROR);

      // 触发错误事件
      this.emitEvent({
        type: 'error',
        extensionId: id,
        timestamp: Date.now(),
        data: error
      });

      throw error;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  /**
   * 卸载扩展
   */
  async unloadExtension(extensionId: string): Promise<void> {
    const instance = this.extensions.get(extensionId);
    if (!instance) {
      console.warn(`[ExtensionManager] 扩展不存在: ${extensionId}`);
      return;
    }

    try {
      // 先停用扩展
      if (instance.status === ExtensionStatus.ACTIVE) {
        await this.deactivateExtension(extensionId);
      }

      // 检查依赖关系
      if (instance.dependents.size > 0) {
        const dependents = Array.from(instance.dependents);
        console.warn(`[ExtensionManager] 扩展被其他扩展依赖，无法卸载: ${extensionId}`, dependents);
        throw new Error(`Extension has dependents: ${dependents.join(', ')}`);
      }

      // 调用加载器的卸载方法
      const loader = this.getLoader(instance.config);
      if (loader?.unload) {
        await loader.unload(extensionId);
      }

      // 清理依赖关系
      for (const depId of instance.dependencies) {
        const depInstance = this.extensions.get(depId);
        if (depInstance) {
          depInstance.dependents.delete(extensionId);
        }
      }

      // 移除扩展
      this.extensions.delete(extensionId);

      // 触发事件
      this.emitEvent({
        type: 'unloaded',
        extensionId,
        timestamp: Date.now()
      });

      console.info(`[ExtensionManager] 扩展卸载成功: ${extensionId}`);

    } catch (error) {
      console.error(`[ExtensionManager] 扩展卸载失败: ${extensionId}`, error);
      throw error;
    }
  }

  /**
   * 激活扩展
   */
  async activateExtension(extensionId: string): Promise<void> {
    const instance = this.extensions.get(extensionId);
    if (!instance) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    if (instance.status === ExtensionStatus.ACTIVE) {
      return;
    }

    if (instance.status !== ExtensionStatus.LOADED) {
      throw new Error(`Extension not loaded: ${extensionId}`);
    }

    if (!instance.extension) {
      throw new Error(`Extension instance is null: ${extensionId}`);
    }

    try {
      // 应用扩展到所有编辑器
      for (const [editorId, view] of this.editorViews) {
        view.dispatch({
          effects: instance.compartment.reconfigure(instance.extension)
        });
      }

      // 更新状态
      this.updateExtensionStatus(extensionId, ExtensionStatus.ACTIVE);

      // 触发事件
      this.emitEvent({
        type: 'activated',
        extensionId,
        timestamp: Date.now()
      });

      console.info(`[ExtensionManager] 扩展激活成功: ${extensionId}`);

    } catch (error) {
      console.error(`[ExtensionManager] 扩展激活失败: ${extensionId}`, error);
      throw error;
    }
  }

  /**
   * 停用扩展
   */
  async deactivateExtension(extensionId: string): Promise<void> {
    const instance = this.extensions.get(extensionId);
    if (!instance) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    if (instance.status !== ExtensionStatus.ACTIVE) {
      return;
    }

    try {
      // 从所有编辑器中移除扩展
      for (const [editorId, view] of this.editorViews) {
        view.dispatch({
          effects: instance.compartment.reconfigure([])
        });
      }

      // 更新状态
      this.updateExtensionStatus(extensionId, ExtensionStatus.LOADED);

      // 触发事件
      this.emitEvent({
        type: 'deactivated',
        extensionId,
        timestamp: Date.now()
      });

      console.info(`[ExtensionManager] 扩展停用成功: ${extensionId}`);

    } catch (error) {
      console.error(`[ExtensionManager] 扩展停用失败: ${extensionId}`, error);
      throw error;
    }
  }

  /**
   * 重新配置扩展
   */
  async reconfigureExtension(extensionId: string, newConfig: Partial<ExtensionConfig>): Promise<void> {
    const instance = this.extensions.get(extensionId);
    if (!instance) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    try {
      // 合并配置
      const updatedConfig = { ...instance.config, ...newConfig };
      instance.config = updatedConfig;

      // 如果扩展处于活动状态，需要重新加载
      if (instance.status === ExtensionStatus.ACTIVE) {
        const loader = this.getLoader(updatedConfig);
        if (loader?.configure) {
          const newExtension = await loader.configure(updatedConfig);
          instance.extension = newExtension;

          // 重新应用到编辑器
          for (const [editorId, view] of this.editorViews) {
            view.dispatch({
              effects: instance.compartment.reconfigure(newExtension)
            });
          }
        }
      }

      // 触发事件
      this.emitEvent({
        type: 'configured',
        extensionId,
        timestamp: Date.now(),
        data: newConfig
      });

      console.info(`[ExtensionManager] 扩展重新配置成功: ${extensionId}`);

    } catch (error) {
      console.error(`[ExtensionManager] 扩展重新配置失败: ${extensionId}`, error);
      throw error;
    }
  }

  /**
   * 获取扩展状态
   */
  getExtensionStatus(extensionId: string): ExtensionStatus | null {
    const instance = this.extensions.get(extensionId);
    return instance ? instance.status : null;
  }

  /**
   * 获取所有扩展信息
   */
  getAllExtensions(): Array<{
    id: string;
    name: string;
    status: ExtensionStatus;
    config: ExtensionConfig;
    loadTime?: number;
    error?: string;
  }> {
    return Array.from(this.extensions.values()).map(instance => ({
      id: instance.config.id,
      name: instance.config.name,
      status: instance.status,
      config: instance.config,
      loadTime: instance.loadTime,
      error: instance.error?.message
    }));
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: (event: ExtensionEvent) => void): () => void {
    this.eventListeners.push(listener);
    
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index > -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * 加载依赖
   */
  private async loadDependencies(config: ExtensionConfig): Promise<void> {
    if (!config.dependencies || config.dependencies.length === 0) {
      return;
    }

    for (const depId of config.dependencies) {
      if (!this.extensions.has(depId)) {
        throw new Error(`Dependency not found: ${depId}`);
      }

      const depInstance = this.extensions.get(depId)!;
      if (depInstance.status === ExtensionStatus.ERROR) {
        throw new Error(`Dependency in error state: ${depId}`);
      }

      // 添加依赖关系
      depInstance.dependents.add(config.id);
    }
  }

  /**
   * 获取加载器
   */
  private getLoader(config: ExtensionConfig): ExtensionLoader | null {
    // 根据扩展ID或类型查找加载器
    const extensionType = this.getExtensionType(config.id);
    return this.loaders.get(extensionType) || null;
  }

  /**
   * 获取扩展类型
   */
  private getExtensionType(extensionId: string): string {
    // 根据扩展ID推断类型
    if (extensionId.includes('latex') || extensionId.includes('math')) {
      return 'latex';
    }
    if (extensionId.includes('mermaid')) {
      return 'mermaid';
    }
    if (extensionId.includes('highlight') || extensionId.includes('syntax')) {
      return 'syntax-highlight';
    }
    if (extensionId.includes('accessibility') || extensionId.includes('a11y')) {
      return 'accessibility';
    }
    
    return 'default';
  }

  /**
   * 执行加载
   */
  private async performLoad(loader: ExtensionLoader, config: ExtensionConfig): Promise<Extension> {
    const startTime = Date.now();
    
    try {
      const extension = await loader.load(config);
      const loadTime = Date.now() - startTime;
      
      console.debug(`[ExtensionManager] 扩展加载耗时: ${config.id} - ${loadTime}ms`);
      
      return extension;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      console.error(`[ExtensionManager] 扩展加载失败: ${config.id} - ${loadTime}ms`, error);
      throw error;
    }
  }

  /**
   * 更新扩展状态
   */
  private updateExtensionStatus(extensionId: string, status: ExtensionStatus): void {
    const instance = this.extensions.get(extensionId);
    if (instance) {
      instance.status = status;
      console.debug(`[ExtensionManager] 扩展状态更新: ${extensionId} -> ${status}`);
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: ExtensionEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[ExtensionManager] 事件监听器执行失败:', error);
      }
    }
  }

  /**
   * 清理所有扩展
   */
  async cleanup(): Promise<void> {
    const extensionIds = Array.from(this.extensions.keys());

    for (const id of extensionIds) {
      try {
        await this.unloadExtension(id);
      } catch (error) {
        console.error(`[ExtensionManager] 清理扩展失败: ${id}`, error);
      }
    }

    this.extensions.clear();
    this.loaders.clear();
    this.editorViews.clear();
    this.eventListeners.length = 0;
    this.loadingPromises.clear();

    console.info('[ExtensionManager] 扩展管理器已清理');
  }
}

/**
 * 扩展注册器
 * 负责注册所有可用的扩展加载器
 */
export class ExtensionRegistry {
  private static instance: ExtensionRegistry;
  private extensionManager: DynamicExtensionManager;
  private defaultExtensionsLoaded = false;

  private constructor() {
    this.extensionManager = new DynamicExtensionManager();
    this.registerDefaultLoaders();
  }

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  /**
   * 获取扩展管理器
   */
  getExtensionManager(): DynamicExtensionManager {
    return this.extensionManager;
  }

  /**
   * 注册默认加载器
   */
  private async registerDefaultLoaders(): Promise<void> {
    try {
      // 动态导入扩展加载器以避免循环依赖
      const { LatexExtensionLoader } = await import('../extensions/latex-math-extension');

      // 注册加载器
      this.extensionManager.registerLoader('latex', new LatexExtensionLoader());

      console.info('[ExtensionRegistry] 默认扩展加载器已注册');
    } catch (error) {
      console.error('[ExtensionRegistry] 注册默认加载器失败:', error);
    }
  }

  /**
   * 加载默认扩展配置
   */
  async loadDefaultExtensions(): Promise<void> {
    // 如果默认扩展已经加载过，直接返回
    if (this.defaultExtensionsLoaded) {
      console.debug('[ExtensionRegistry] 默认扩展已加载，跳过重复加载');
      return;
    }

    try {
      console.info('[ExtensionRegistry] 开始加载默认扩展...');

      // 动态导入默认配置
      const { defaultLatexConfig } = await import('../extensions/latex-math-extension');

      const defaultConfigs = [
        defaultLatexConfig
      ];

      // 加载所有默认扩展
      for (const config of defaultConfigs) {
        try {
          await this.extensionManager.loadExtension(config);
        } catch (error) {
          console.error(`[ExtensionRegistry] 加载默认扩展失败: ${config.id}`, error);
        }
      }

      // 标记为已加载
      this.defaultExtensionsLoaded = true;
      console.info('[ExtensionRegistry] 默认扩展已加载');
    } catch (error) {
      console.error('[ExtensionRegistry] 加载默认扩展失败:', error);
    }
  }

  /**
   * 注册编辑器
   */
  registerEditor(editorId: string, view: EditorView): void {
    this.extensionManager.registerEditorView(editorId, view);
  }

  /**
   * 注销编辑器
   */
  unregisterEditor(editorId: string): void {
    this.extensionManager.unregisterEditorView(editorId);
  }

  /**
   * 重置默认扩展加载状态
   */
  resetDefaultExtensionsState(): void {
    this.defaultExtensionsLoaded = false;
    console.debug('[ExtensionRegistry] 默认扩展加载状态已重置');
  }

  /**
   * 检查默认扩展是否已加载
   */
  areDefaultExtensionsLoaded(): boolean {
    return this.defaultExtensionsLoaded;
  }

  /**
   * 清理
   */
  async cleanup(): Promise<void> {
    await this.extensionManager.cleanup();
    this.defaultExtensionsLoaded = false;
  }
}
