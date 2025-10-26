/**
 * 全局数据同步服务
 * 统一管理所有数据变更通知，替代旧的 CustomEvent 机制
 * 提供类型安全的订阅-发布模式
 */

export type DataChangeType = 'cards' | 'decks' | 'sessions' | 'settings';
export type DataChangeAction = 'create' | 'update' | 'delete' | 'batch';

/**
 * 数据变更事件
 */
export interface DataChangeEvent {
  /** 数据类型 */
  type: DataChangeType;
  
  /** 操作类型 */
  action: DataChangeAction;
  
  /** 受影响的数据ID列表 */
  ids?: string[];
  
  /** 附加元数据 */
  metadata?: Record<string, any>;
  
  /** 时间戳 */
  timestamp: number;
}

/**
 * 订阅选项
 */
export interface SubscriptionOptions {
  /** 防抖延迟（毫秒） */
  debounce?: number;
  
  /** 事件过滤器 */
  filter?: (event: DataChangeEvent) => boolean;
}

/**
 * 订阅回调函数
 */
export type SubscriptionCallback = (event: DataChangeEvent) => void | Promise<void>;

/**
 * 订阅信息
 */
interface Subscription {
  id: string;
  callback: SubscriptionCallback;
  options: SubscriptionOptions;
  debounceTimer?: number;
}

/**
 * 全局数据同步服务
 */
export class DataSyncService {
  private subscriptions: Map<DataChangeType, Subscription[]> = new Map();
  private subscriptionIdCounter = 0;
  private debugMode = true; // 开发阶段启用详细日志

  constructor() {
    this.initializeSubscriptionMaps();
    if (this.debugMode) {
      console.log('[DataSyncService] 服务已初始化');
    }
  }

  /**
   * 初始化订阅映射
   */
  private initializeSubscriptionMaps(): void {
    const types: DataChangeType[] = ['cards', 'decks', 'sessions', 'settings'];
    types.forEach(type => {
      this.subscriptions.set(type, []);
    });
  }

  /**
   * 订阅数据变更通知
   * @param type 数据类型
   * @param callback 回调函数
   * @param options 订阅选项
   * @returns 取消订阅函数
   */
  subscribe(
    type: DataChangeType,
    callback: SubscriptionCallback,
    options: SubscriptionOptions = {}
  ): () => void {
    const subscriptionId = `sub_${++this.subscriptionIdCounter}`;
    
    const subscription: Subscription = {
      id: subscriptionId,
      callback,
      options
    };

    const subs = this.subscriptions.get(type);
    if (subs) {
      subs.push(subscription);
    }

    if (this.debugMode) {
      console.log(`[DataSyncService] 新订阅: ${type} (${subscriptionId})`);
    }

    // 返回取消订阅函数
    return () => this.unsubscribe(type, subscriptionId);
  }

  /**
   * 取消订阅
   * @param type 数据类型
   * @param subscriptionId 订阅ID
   */
  private unsubscribe(type: DataChangeType, subscriptionId: string): void {
    const subs = this.subscriptions.get(type);
    if (!subs) return;

    const index = subs.findIndex(sub => sub.id === subscriptionId);
    if (index !== -1) {
      // 清理防抖定时器
      const subscription = subs[index];
      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
      }
      
      subs.splice(index, 1);
      
      if (this.debugMode) {
        console.log(`[DataSyncService] 取消订阅: ${type} (${subscriptionId})`);
      }
    }
  }

  /**
   * 通知数据变更
   * @param event 数据变更事件
   */
  async notifyChange(event: Omit<DataChangeEvent, 'timestamp'>): Promise<void> {
    const fullEvent: DataChangeEvent = {
      ...event,
      timestamp: Date.now()
    };

    if (this.debugMode) {
      console.log('[DataSyncService] 数据变更通知:', {
        type: fullEvent.type,
        action: fullEvent.action,
        ids: fullEvent.ids?.length || 0,
        metadata: fullEvent.metadata
      });
    }

    const subs = this.subscriptions.get(fullEvent.type);
    if (!subs || subs.length === 0) {
      if (this.debugMode) {
        console.log(`[DataSyncService] 无订阅者: ${fullEvent.type}`);
      }
      return;
    }

    // 并行通知所有订阅者
    await Promise.all(
      subs.map(sub => this.notifySubscription(sub, fullEvent))
    );
  }

  /**
   * 通知单个订阅
   * @param subscription 订阅信息
   * @param event 数据变更事件
   */
  private async notifySubscription(
    subscription: Subscription,
    event: DataChangeEvent
  ): Promise<void> {
    // 应用过滤器
    if (subscription.options.filter && !subscription.options.filter(event)) {
      return;
    }

    // 应用防抖
    if (subscription.options.debounce) {
      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
      }

      subscription.debounceTimer = window.setTimeout(async () => {
        await this.executeCallback(subscription, event);
        subscription.debounceTimer = undefined;
      }, subscription.options.debounce);
    } else {
      // 立即执行
      await this.executeCallback(subscription, event);
    }
  }

  /**
   * 执行回调函数
   * @param subscription 订阅信息
   * @param event 数据变更事件
   */
  private async executeCallback(
    subscription: Subscription,
    event: DataChangeEvent
  ): Promise<void> {
    try {
      await subscription.callback(event);
    } catch (error) {
      console.error('[DataSyncService] 订阅回调执行失败:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.subscriptions.forEach((subs, type) => {
      stats[type] = subs.length;
    });
    return stats;
  }

  /**
   * 清理所有订阅
   */
  destroy(): void {
    // 清理所有防抖定时器
    this.subscriptions.forEach(subs => {
      subs.forEach(sub => {
        if (sub.debounceTimer) {
          clearTimeout(sub.debounceTimer);
        }
      });
    });

    // 清空订阅
    this.subscriptions.clear();
    this.initializeSubscriptionMaps();

    if (this.debugMode) {
      console.log('[DataSyncService] 服务已销毁');
    }
  }

  /**
   * 设置调试模式
   * @param enabled 是否启用
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
}


