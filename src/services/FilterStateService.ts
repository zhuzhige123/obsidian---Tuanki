/**
 * 全局筛选状态服务
 * 管理跨视图的筛选状态同步
 */

import type { CardType } from '../types/newCardParsingTypes';
import type { TimeFilterType } from '../types/time-filter-types';
import type AnkiPlugin from '../main';

export interface FilterState {
  selectedDeckId: string | null;
  selectedCardTypes: Set<CardType>;
  selectedPriority: number | null;
  selectedTags: Set<string>;
  selectedTimeFilter: TimeFilterType;  // 🆕 时间筛选
  activeDocumentFilter: string | null;
}

export class FilterStateService {
  private state: FilterState;
  private listeners: Set<(state: FilterState) => void> = new Set();
  private plugin: AnkiPlugin;
  private isUpdating = false; // 防止循环更新

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    
    // 初始化默认状态
    this.state = {
      selectedDeckId: null,
      selectedCardTypes: new Set(),
      selectedPriority: null,
      selectedTags: new Set(),
      selectedTimeFilter: null,  // 🆕 时间筛选默认为null（全部）
      activeDocumentFilter: null
    };
    
    // 从LocalStorage加载状态
    this.loadFromStorage();
  }

  /**
   * 获取当前筛选状态
   */
  getState(): FilterState {
    return {
      ...this.state,
      // 返回Set的副本，避免外部修改
      selectedCardTypes: new Set(this.state.selectedCardTypes),
      selectedTags: new Set(this.state.selectedTags)
    };
  }

  /**
   * 更新筛选状态（支持部分更新）
   */
  updateFilter(updates: Partial<FilterState>): void {
    if (this.isUpdating) {
      return; // 防止循环更新
    }
    
    this.isUpdating = true;
    
    // 合并更新
    this.state = {
      ...this.state,
      ...updates,
      // 确保Set类型正确复制
      selectedCardTypes: updates.selectedCardTypes 
        ? new Set(updates.selectedCardTypes) 
        : this.state.selectedCardTypes,
      selectedTags: updates.selectedTags 
        ? new Set(updates.selectedTags) 
        : this.state.selectedTags
    };
    
    // 持久化到LocalStorage
    this.saveToStorage();
    
    // 通知所有订阅者
    this.notifyListeners();
    
    this.isUpdating = false;
  }

  /**
   * 订阅状态变化
   * @returns 取消订阅的函数
   */
  subscribe(listener: (state: FilterState) => void): () => void {
    this.listeners.add(listener);
    
    // 立即调用一次，同步当前状态
    listener(this.getState());
    
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 清除所有筛选
   */
  clearAll(): void {
    this.updateFilter({
      selectedDeckId: null,
      selectedCardTypes: new Set(),
      selectedPriority: null,
      selectedTags: new Set(),
      selectedTimeFilter: null,  // 🆕 清除时间筛选
      activeDocumentFilter: null
    });
  }

  /**
   * 通知所有订阅者
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('[FilterStateService] Listener error:', error);
      }
    });
  }

  /**
   * 保存状态到LocalStorage
   */
  private saveToStorage(): void {
    try {
      const serialized = {
        selectedDeckId: this.state.selectedDeckId,
        selectedCardTypes: Array.from(this.state.selectedCardTypes),
        selectedPriority: this.state.selectedPriority,
        selectedTags: Array.from(this.state.selectedTags),
        selectedTimeFilter: this.state.selectedTimeFilter,  // 🆕 保存时间筛选
        activeDocumentFilter: this.state.activeDocumentFilter
      };
      
      localStorage.setItem('tuanki-global-filter-state', JSON.stringify(serialized));
    } catch (error) {
      console.error('[FilterStateService] Failed to save state:', error);
    }
  }

  /**
   * 从LocalStorage加载状态
   */
  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('tuanki-global-filter-state');
      if (!saved) return;
      
      const parsed = JSON.parse(saved);
      
      this.state = {
        selectedDeckId: parsed.selectedDeckId || null,
        selectedCardTypes: new Set(parsed.selectedCardTypes || []),
        selectedPriority: parsed.selectedPriority ?? null,
        selectedTags: new Set(parsed.selectedTags || []),
        selectedTimeFilter: parsed.selectedTimeFilter || null,  // 🆕 加载时间筛选
        activeDocumentFilter: parsed.activeDocumentFilter || null
      };
      
      console.log('[FilterStateService] State loaded from storage');
    } catch (error) {
      console.error('[FilterStateService] Failed to load state:', error);
    }
  }

  /**
   * 获取筛选摘要（用于显示）
   */
  getFilterSummary(): string {
    const parts: string[] = [];
    
    if (this.state.selectedDeckId) {
      parts.push('牌组');
    }
    
    if (this.state.selectedCardTypes.size > 0) {
      parts.push(`${this.state.selectedCardTypes.size}种题型`);
    }
    
    if (this.state.selectedPriority !== null) {
      parts.push('优先级');
    }
    
    if (this.state.selectedTags.size > 0) {
      parts.push(`${this.state.selectedTags.size}个标签`);
    }
    
    if (this.state.activeDocumentFilter) {
      parts.push('文档');
    }
    
    return parts.length > 0 ? parts.join(' · ') : '无筛选';
  }

  /**
   * 检查是否有任何激活的筛选
   */
  hasActiveFilters(): boolean {
    return !!(
      this.state.selectedDeckId ||
      this.state.selectedCardTypes.size > 0 ||
      this.state.selectedPriority !== null ||
      this.state.selectedTags.size > 0 ||
      this.state.activeDocumentFilter
    );
  }
}

