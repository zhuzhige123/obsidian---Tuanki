/**
 * 依赖注入容器
 * 解决根本问题：依赖关系复杂、服务耦合、难以测试
 */

import { ArchitectureLayer, ComponentType } from './layered-architecture';

// ============================================================================
// 依赖注入核心接口
// ============================================================================

/**
 * 服务生命周期
 */
export enum ServiceLifetime {
  SINGLETON = 'singleton',     // 单例：整个应用生命周期内只有一个实例
  TRANSIENT = 'transient',     // 瞬态：每次请求都创建新实例
  SCOPED = 'scoped'            // 作用域：在特定作用域内是单例
}

/**
 * 服务描述符
 */
export interface ServiceDescriptor<T = any> {
  token: ServiceToken<T>;
  implementation?: new (...args: any[]) => T;
  factory?: (container: Container) => T;
  instance?: T;
  lifetime: ServiceLifetime;
  dependencies?: ServiceToken<any>[];
  layer?: ArchitectureLayer;
  type?: ComponentType;
}

/**
 * 服务令牌
 */
export interface ServiceToken<T = any> {
  name: string;
  description?: string;
}

/**
 * 容器接口
 */
export interface Container {
  register<T>(descriptor: ServiceDescriptor<T>): void;
  resolve<T>(token: ServiceToken<T>): T;
  resolveOptional<T>(token: ServiceToken<T>): T | undefined;
  createScope(): Container;
  dispose(): void;
}

// ============================================================================
// 依赖注入容器实现
// ============================================================================

/**
 * 依赖注入容器
 */
export class DIContainer implements Container {
  private services = new Map<string, ServiceDescriptor>();
  private instances = new Map<string, any>();
  private scopes = new Set<DIContainer>();
  private parent?: DIContainer;
  private isDisposed = false;

  constructor(parent?: DIContainer) {
    this.parent = parent;
  }

  /**
   * 注册服务
   */
  register<T>(descriptor: ServiceDescriptor<T>): void {
    if (this.isDisposed) {
      throw new Error('容器已被释放，无法注册服务');
    }

    this.validateServiceDescriptor(descriptor);
    this.services.set(descriptor.token.name, descriptor);
    
    console.log(`✅ 服务已注册: ${descriptor.token.name} (${descriptor.lifetime})`);
  }

  /**
   * 解析服务
   */
  resolve<T>(token: ServiceToken<T>): T {
    if (this.isDisposed) {
      throw new Error('容器已被释放，无法解析服务');
    }

    const instance = this.resolveInternal(token);
    if (instance === undefined) {
      throw new Error(`服务未注册: ${token.name}`);
    }
    return instance;
  }

  /**
   * 可选解析服务
   */
  resolveOptional<T>(token: ServiceToken<T>): T | undefined {
    if (this.isDisposed) {
      return undefined;
    }

    return this.resolveInternal(token);
  }

  /**
   * 创建作用域
   */
  createScope(): Container {
    if (this.isDisposed) {
      throw new Error('容器已被释放，无法创建作用域');
    }

    const scope = new DIContainer(this);
    this.scopes.add(scope);
    return scope;
  }

  /**
   * 释放容器
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    // 释放所有作用域
    for (const scope of this.scopes) {
      scope.dispose();
    }
    this.scopes.clear();

    // 释放所有实例
    for (const [token, instance] of this.instances) {
      if (instance && typeof instance.dispose === 'function') {
        try {
          instance.dispose();
        } catch (error) {
          console.error(`释放服务实例失败: ${token}`, error);
        }
      }
    }
    this.instances.clear();

    // 从父容器中移除
    if (this.parent) {
      this.parent.scopes.delete(this);
    }

    this.isDisposed = true;
    console.log('🗑️ 依赖注入容器已释放');
  }

  /**
   * 内部解析逻辑
   */
  private resolveInternal<T>(token: ServiceToken<T>): T | undefined {
    const tokenName = token.name;

    // 检查当前容器的实例缓存
    if (this.instances.has(tokenName)) {
      return this.instances.get(tokenName);
    }

    // 检查当前容器的服务注册
    const descriptor = this.services.get(tokenName);
    if (descriptor) {
      return this.createInstance(descriptor);
    }

    // 检查父容器
    if (this.parent) {
      return this.parent.resolveInternal(token);
    }

    return undefined;
  }

  /**
   * 创建服务实例
   */
  private createInstance<T>(descriptor: ServiceDescriptor<T>): T {
    const tokenName = descriptor.token.name;

    try {
      let instance: T;

      if (descriptor.instance) {
        // 使用预定义实例
        instance = descriptor.instance;
      } else if (descriptor.factory) {
        // 使用工厂函数
        instance = descriptor.factory(this);
      } else if (descriptor.implementation) {
        // 使用构造函数
        const dependencies = this.resolveDependencies(descriptor.dependencies || []);
        instance = new descriptor.implementation(...dependencies);
      } else {
        throw new Error(`服务描述符无效: ${tokenName}`);
      }

      // 根据生命周期缓存实例
      if (descriptor.lifetime === ServiceLifetime.SINGLETON) {
        this.instances.set(tokenName, instance);
      } else if (descriptor.lifetime === ServiceLifetime.SCOPED) {
        this.instances.set(tokenName, instance);
      }
      // TRANSIENT 不缓存

      return instance;
    } catch (error) {
      throw new Error(`创建服务实例失败: ${tokenName} - ${error.message}`);
    }
  }

  /**
   * 解析依赖项
   */
  private resolveDependencies(dependencies: ServiceToken<any>[]): any[] {
    return dependencies.map(token => this.resolve(token));
  }

  /**
   * 验证服务描述符
   */
  private validateServiceDescriptor<T>(descriptor: ServiceDescriptor<T>): void {
    if (!descriptor.token || !descriptor.token.name) {
      throw new Error('服务令牌无效');
    }

    if (!descriptor.implementation && !descriptor.factory && !descriptor.instance) {
      throw new Error('必须提供实现、工厂函数或实例');
    }

    if (this.services.has(descriptor.token.name)) {
      console.warn(`⚠️ 服务已存在，将被覆盖: ${descriptor.token.name}`);
    }
  }

  /**
   * 获取容器状态
   */
  getContainerInfo(): ContainerInfo {
    return {
      servicesCount: this.services.size,
      instancesCount: this.instances.size,
      scopesCount: this.scopes.size,
      isDisposed: this.isDisposed,
      services: Array.from(this.services.values()).map(s => ({
        name: s.token.name,
        lifetime: s.lifetime,
        hasInstance: this.instances.has(s.token.name),
        layer: s.layer,
        type: s.type
      }))
    };
  }
}

// ============================================================================
// 服务令牌定义
// ============================================================================

/**
 * 创建服务令牌
 */
export function createServiceToken<T>(name: string, description?: string): ServiceToken<T> {
  return { name, description };
}

// 核心服务令牌
export const SERVICE_TOKENS = {
  // 数据层服务
  DATA_STORAGE: createServiceToken<any>('DataStorage', '数据存储服务'),
  ANALYTICS_SERVICE: createServiceToken<any>('AnalyticsService', '分析服务'),
  
  // 算法层服务
  FSRS_SERVICE: createServiceToken<any>('FSRSService', 'FSRS算法服务'),
  ENHANCED_FSRS: createServiceToken<any>('EnhancedFSRS', '增强FSRS服务'),
  
  // 应用层服务
  CARD_SERVICE: createServiceToken<any>('CardService', '卡片服务'),
  DECK_SERVICE: createServiceToken<any>('DeckService', '牌组服务'),
  TEMPLATE_SERVICE: createServiceToken<any>('TemplateService', '模板服务'),
  SYNC_SERVICE: createServiceToken<any>('SyncService', '同步服务'),
  DATA_MANAGEMENT_SERVICE: createServiceToken<any>('DataManagementService', '数据管理服务'),
  BACKUP_MANAGEMENT_SERVICE: createServiceToken<any>('BackupManagementService', '备份管理服务'),
  
  // 基础设施服务
  ERROR_HANDLER: createServiceToken<any>('ErrorHandler', '错误处理器'),
  PERFORMANCE_MONITOR: createServiceToken<any>('PerformanceMonitor', '性能监控器'),
  LICENSE_MANAGER: createServiceToken<any>('LicenseManager', '许可证管理器'),
  
  // 状态管理
  STATE_MANAGER: createServiceToken<any>('StateManager', '状态管理器'),
  
  // UI服务
  NOTIFICATION_SERVICE: createServiceToken<any>('NotificationService', '通知服务'),
  MODAL_SERVICE: createServiceToken<any>('ModalService', '模态框服务')
} as const;

// ============================================================================
// 装饰器和工具
// ============================================================================

/**
 * 可注入装饰器
 */
export function Injectable(options?: {
  lifetime?: ServiceLifetime;
  layer?: ArchitectureLayer;
  type?: ComponentType;
}) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    // 在构造函数上添加元数据
    (constructor as any).__injectable__ = {
      lifetime: options?.lifetime || ServiceLifetime.TRANSIENT,
      layer: options?.layer,
      type: options?.type
    };
    
    return constructor;
  };
}

/**
 * 注入装饰器
 */
export function Inject(token: ServiceToken) {
  return function(target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    const existingTokens = Reflect.getMetadata('inject:tokens', target) || [];
    existingTokens[parameterIndex] = token;
    Reflect.defineMetadata('inject:tokens', existingTokens, target);
  };
}

// ============================================================================
// 全局容器管理
// ============================================================================

/**
 * 全局容器管理器
 */
export class GlobalContainer {
  private static instance: DIContainer;

  static getInstance(): DIContainer {
    if (!GlobalContainer.instance) {
      GlobalContainer.instance = new DIContainer();
    }
    return GlobalContainer.instance;
  }

  static reset(): void {
    if (GlobalContainer.instance) {
      GlobalContainer.instance.dispose();
    }
    GlobalContainer.instance = new DIContainer();
  }

  static dispose(): void {
    if (GlobalContainer.instance) {
      GlobalContainer.instance.dispose();
      GlobalContainer.instance = undefined as any;
    }
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 注册服务
 */
export function registerService<T>(descriptor: ServiceDescriptor<T>): void {
  GlobalContainer.getInstance().register(descriptor);
}

/**
 * 解析服务
 */
export function resolveService<T>(token: ServiceToken<T>): T {
  return GlobalContainer.getInstance().resolve(token);
}

/**
 * 可选解析服务
 */
export function resolveServiceOptional<T>(token: ServiceToken<T>): T | undefined {
  return GlobalContainer.getInstance().resolveOptional(token);
}

/**
 * 创建作用域
 */
export function createScope(): Container {
  return GlobalContainer.getInstance().createScope();
}

// ============================================================================
// 类型定义
// ============================================================================

export interface ContainerInfo {
  servicesCount: number;
  instancesCount: number;
  scopesCount: number;
  isDisposed: boolean;
  services: ServiceInfo[];
}

export interface ServiceInfo {
  name: string;
  lifetime: ServiceLifetime;
  hasInstance: boolean;
  layer?: ArchitectureLayer;
  type?: ComponentType;
}
