/**
 * 卡片编辑事件总线
 * 提供类型安全的事件通信机制
 */

import type { Card, Deck } from '../data/types';
import type { FieldTemplate, TriadTemplate } from '../data/template-types';

// 事件类型定义
export interface CardEditEvents {
  // 卡片生命周期事件
  'card:loaded': { card: Card };
  'card:save-requested': { card: Card };
  'card:saved': { card: Card; success: boolean };
  'card:save-failed': { card: Card; error: Error };
  'card:close-requested': { hasUnsavedChanges: boolean };
  'card:closed': void;

  // 内容编辑事件
  'content:changed': { content: string; source: 'markdown' | 'fields' };
  'content:field-changed': { fieldKey: string; value: string };
  'content:tags-changed': { tags: string[] };
  'content:deck-changed': { deckId: string };

  // 模板事件
  'template:field-applied': { template: FieldTemplate };
  'template:triad-applied': { template: TriadTemplate };
  'template:mapping-requested': { 
    from: FieldTemplate | TriadTemplate; 
    to: FieldTemplate | TriadTemplate;
    mode: 'fields' | 'markdown';
  };
  'template:mapping-completed': { 
    mappings: Record<string, string | string[]>;
    stats: { mapped: number; created: number; merged: number };
  };

  // 编辑器事件
  'editor:ready': { editorId: string };
  'editor:focus': { editorId: string };
  'editor:blur': { editorId: string };
  'editor:preview-toggled': { editorId: string; isPreview: boolean };
  'editor:command-executed': { editorId: string; command: string; result: any };

  // UI事件
  'ui:tab-switched': { tab: 'markdown' | 'fields' };
  'ui:panel-toggled': { panel: 'template' | 'metadata'; visible: boolean };
  'ui:fullscreen-toggled': { isFullscreen: boolean };
  'ui:preview-toggled': { isPreview: boolean };

  // 错误事件
  'error:occurred': { error: Error; context: string; recoverable: boolean };
  'error:recovered': { error: Error; strategy: string };
  'error:recovery-failed': { error: Error; attempts: number };

  // 系统事件
  'system:initialized': { sessionId: string };
  'system:cleanup-requested': void;
  'system:performance-warning': { metric: string; value: number; threshold: number };
}

// 事件监听器类型
export type EventListener<T = any> = (data: T) => void | Promise<void>;

// 事件订阅选项
export interface SubscriptionOptions {
  once?: boolean;
  priority?: number;
  filter?: (data: any) => boolean;
}

// 事件订阅信息
interface Subscription {
  listener: EventListener;
  options: SubscriptionOptions;
  id: string;
}

/**
 * 类型安全的事件总线实现
 */
export class CardEditEventBus {
  private listeners = new Map<keyof CardEditEvents, Subscription[]>();
  private subscriptionCounter = 0;
  private isDestroyed = false;

  /**
   * 订阅事件
   */
  on<K extends keyof CardEditEvents>(
    event: K,
    listener: EventListener<CardEditEvents[K]>,
    options: SubscriptionOptions = {}
  ): () => void {
    if (this.isDestroyed) {
      console.warn('[CardEditEventBus] Cannot subscribe to destroyed event bus');
      return () => {};
    }

    const subscription: Subscription = {
      listener,
      options,
      id: `sub_${++this.subscriptionCounter}`
    };

    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const eventListeners = this.listeners.get(event)!;
    
    // 按优先级插入
    const priority = options.priority || 0;
    const insertIndex = eventListeners.findIndex(sub => (sub.options.priority || 0) < priority);
    
    if (insertIndex === -1) {
      eventListeners.push(subscription);
    } else {
      eventListeners.splice(insertIndex, 0, subscription);
    }

    // 返回取消订阅函数
    return () => this.off(event, subscription.id);
  }

  /**
   * 一次性事件订阅
   */
  once<K extends keyof CardEditEvents>(
    event: K,
    listener: EventListener<CardEditEvents[K]>
  ): () => void {
    return this.on(event, listener, { once: true });
  }

  /**
   * 取消事件订阅
   */
  off<K extends keyof CardEditEvents>(event: K, subscriptionId?: string): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    if (subscriptionId) {
      const index = eventListeners.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    } else {
      // 清除所有监听器
      eventListeners.length = 0;
    }

    // 如果没有监听器了，删除事件键
    if (eventListeners.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * 发射事件
   */
  async emit<K extends keyof CardEditEvents>(
    event: K,
    data: CardEditEvents[K]
  ): Promise<void> {
    if (this.isDestroyed) {
      console.warn('[CardEditEventBus] Cannot emit to destroyed event bus');
      return;
    }

    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.length === 0) {
      return;
    }

    // 创建监听器副本，避免在执行过程中修改
    const listenersToExecute = [...eventListeners];

    // 执行监听器
    const promises: Promise<void>[] = [];
    const toRemove: string[] = [];

    for (const subscription of listenersToExecute) {
      try {
        // 应用过滤器
        if (subscription.options.filter && !subscription.options.filter(data)) {
          continue;
        }

        // 执行监听器
        const result = subscription.listener(data);
        if (result instanceof Promise) {
          promises.push(result);
        }

        // 标记一次性监听器待移除
        if (subscription.options.once) {
          toRemove.push(subscription.id);
        }
      } catch (error) {
        console.error(`[CardEditEventBus] Error in event listener for ${event}:`, error);
        
        // 发射错误事件（避免无限递归）
        if (event !== 'error:occurred') {
          this.emit('error:occurred', {
            error: error as Error,
            context: `Event listener for ${event}`,
            recoverable: true
          });
        }
      }
    }

    // 等待所有异步监听器完成
    if (promises.length > 0) {
      try {
        await Promise.all(promises);
      } catch (error) {
        console.error(`[CardEditEventBus] Error in async event listeners for ${event}:`, error);
      }
    }

    // 移除一次性监听器
    for (const subscriptionId of toRemove) {
      this.off(event, subscriptionId);
    }
  }

  /**
   * 同步发射事件（不等待异步监听器）
   */
  emitSync<K extends keyof CardEditEvents>(
    event: K,
    data: CardEditEvents[K]
  ): void {
    // 不等待Promise，立即返回
    this.emit(event, data).catch(error => {
      console.error(`[CardEditEventBus] Error in sync emit for ${event}:`, error);
    });
  }

  /**
   * 获取事件监听器数量
   */
  getListenerCount<K extends keyof CardEditEvents>(event?: K): number {
    if (event) {
      return this.listeners.get(event)?.length || 0;
    }
    
    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.length;
    }
    return total;
  }

  /**
   * 获取所有事件名称
   */
  getEventNames(): (keyof CardEditEvents)[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * 清除所有监听器
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * 销毁事件总线
   */
  destroy(): void {
    this.removeAllListeners();
    this.isDestroyed = true;
  }

  /**
   * 检查是否已销毁
   */
  get destroyed(): boolean {
    return this.isDestroyed;
  }
}

// 全局事件总线实例
export const cardEditEventBus = new CardEditEventBus();

// 便捷的事件发射函数
export const emit = cardEditEventBus.emit.bind(cardEditEventBus);
export const on = cardEditEventBus.on.bind(cardEditEventBus);
export const once = cardEditEventBus.once.bind(cardEditEventBus);
export const off = cardEditEventBus.off.bind(cardEditEventBus);
