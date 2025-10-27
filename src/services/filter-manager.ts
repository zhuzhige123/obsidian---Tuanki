/**
 * 筛选器管理服务
 * 负责保存、加载、应用筛选器
 */

import type { 
  SavedFilter, 
  FilterConfig, 
  FilterStorage,
  FilterGroup,
  FilterCondition,
  FilterField
} from '../types/filter-types';
import type { Card, FieldTemplate } from '../data/types';
import { getCardContentBySide } from '../utils/helpers';

export class FilterManager {
  private storage: FilterStorage;
  private storageKey = 'tuanki-saved-filters';
  
  constructor() {
    this.storage = this.loadStorage();
    this.initializeBuiltInFilters();
  }
  
  /**
   * 初始化内置筛选器
   */
  private initializeBuiltInFilters(): void {
    const builtInFilters: SavedFilter[] = [
      {
        id: 'builtin-new-cards',
        name: '新卡片',
        description: '所有新创建的卡片',
        icon: 'plus-circle',
        color: '#3b82f6',
        config: {
          groups: [{
            id: 'g1',
            logic: 'AND',
            conditions: [{
              id: 'c1',
              field: 'status',
              operator: 'equals',
              value: 'new',
              enabled: true
            }]
          }],
          globalLogic: 'AND'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        useCount: 0,
        isPinned: true,
        isBuiltIn: true
      },
      {
        id: 'builtin-learning',
        name: '学习中',
        description: '正在学习的卡片',
        icon: 'book-open',
        color: '#f59e0b',
        config: {
          groups: [{
            id: 'g1',
            logic: 'AND',
            conditions: [{
              id: 'c1',
              field: 'status',
              operator: 'equals',
              value: 'learning',
              enabled: true
            }]
          }],
          globalLogic: 'AND'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        useCount: 0,
        isPinned: true,
        isBuiltIn: true
      },
      {
        id: 'builtin-review',
        name: '复习中',
        description: '正在复习的卡片',
        icon: 'repeat',
        color: 'var(--interactive-accent)',
        config: {
          groups: [{
            id: 'g1',
            logic: 'AND',
            conditions: [{
              id: 'c1',
              field: 'status',
              operator: 'equals',
              value: 'review',
              enabled: true
            }]
          }],
          globalLogic: 'AND'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        useCount: 0,
        isPinned: true,
        isBuiltIn: true
      },
      {
        id: 'builtin-due-soon',
        name: '即将到期',
        description: '未来1天内需要复习的卡片',
        icon: 'clock',
        color: '#ef4444',
        config: {
          groups: [{
            id: 'g1',
            logic: 'AND',
            conditions: [
              {
                id: 'c1',
                field: 'status',
                operator: 'not_equals',
                value: 'new',
                enabled: true
              },
              {
                id: 'c2',
                field: 'due',
                operator: 'in_last',
                value: 1,
                enabled: true
              }
            ]
          }],
          globalLogic: 'AND'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        useCount: 0,
        isPinned: true,
        isBuiltIn: true
      },
      {
        id: 'builtin-recent',
        name: '最近创建',
        description: '最近7天创建的卡片',
        icon: 'calendar-plus',
        color: '#10b981',
        config: {
          groups: [{
            id: 'g1',
            logic: 'AND',
            conditions: [{
              id: 'c1',
              field: 'created',
              operator: 'in_last',
              value: 7,
              enabled: true
            }]
          }],
          globalLogic: 'AND'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        useCount: 0,
        isPinned: false,
        isBuiltIn: true
      }
    ];
    
    // 仅添加不存在的内置筛选器
    builtInFilters.forEach(filter => {
      if (!this.storage.savedFilters.find(f => f.id === filter.id)) {
        this.storage.savedFilters.push(filter);
      }
    });
    
    this.saveStorage();
  }
  
  /**
   * 保存筛选器
   */
  saveFilter(filter: Omit<SavedFilter, 'id' | 'createdAt' | 'updatedAt' | 'useCount' | 'isBuiltIn'>): SavedFilter {
    const newFilter: SavedFilter = {
      ...filter,
      id: `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      useCount: 0,
      isBuiltIn: false
    };
    
    this.storage.savedFilters.push(newFilter);
    this.saveStorage();
    
    console.log('[FilterManager] 筛选器已保存:', newFilter.name);
    
    return newFilter;
  }
  
  /**
   * 更新筛选器
   */
  updateFilter(id: string, updates: Partial<SavedFilter>): SavedFilter | null {
    const index = this.storage.savedFilters.findIndex(f => f.id === id);
    if (index === -1) {
      console.warn('[FilterManager] 筛选器不存在:', id);
      return null;
    }
    
    const filter = this.storage.savedFilters[index];
    if (filter.isBuiltIn && updates.config) {
      console.error('[FilterManager] 无法修改内置筛选器的配置');
      throw new Error('Cannot modify built-in filter configuration');
    }
    
    this.storage.savedFilters[index] = {
      ...filter,
      ...updates,
      id: filter.id, // 确保ID不被修改
      isBuiltIn: filter.isBuiltIn, // 确保内置标记不被修改
      updatedAt: new Date().toISOString()
    };
    
    this.saveStorage();
    console.log('[FilterManager] 筛选器已更新:', id);
    
    return this.storage.savedFilters[index];
  }
  
  /**
   * 删除筛选器
   */
  deleteFilter(id: string): boolean {
    const filter = this.storage.savedFilters.find(f => f.id === id);
    if (!filter) {
      console.warn('[FilterManager] 筛选器不存在:', id);
      return false;
    }
    
    if (filter.isBuiltIn) {
      console.error('[FilterManager] 无法删除内置筛选器');
      return false;
    }
    
    this.storage.savedFilters = this.storage.savedFilters.filter(f => f.id !== id);
    this.storage.recentFilterIds = this.storage.recentFilterIds.filter(fid => fid !== id);
    
    if (this.storage.defaultFilterId === id) {
      this.storage.defaultFilterId = undefined;
    }
    
    this.saveStorage();
    console.log('[FilterManager] 筛选器已删除:', id);
    
    return true;
  }
  
  /**
   * 获取筛选器
   */
  getFilter(id: string): SavedFilter | null {
    return this.storage.savedFilters.find(f => f.id === id) || null;
  }
  
  /**
   * 获取所有筛选器
   */
  getAllFilters(): SavedFilter[] {
    return [...this.storage.savedFilters];
  }
  
  /**
   * 获取固定筛选器
   */
  getPinnedFilters(): SavedFilter[] {
    return this.storage.savedFilters.filter(f => f.isPinned)
      .sort((a, b) => b.useCount - a.useCount); // 按使用次数排序
  }
  
  /**
   * 获取最近使用的筛选器
   */
  getRecentFilters(limit: number = 5): SavedFilter[] {
    const recentFilters = this.storage.recentFilterIds
      .map(id => this.storage.savedFilters.find(f => f.id === id))
      .filter((f): f is SavedFilter => f !== undefined)
      .slice(0, limit);
    
    return recentFilters;
  }
  
  /**
   * 切换筛选器固定状态
   */
  togglePinned(id: string): boolean {
    const filter = this.storage.savedFilters.find(f => f.id === id);
    if (!filter) return false;
    
    filter.isPinned = !filter.isPinned;
    this.saveStorage();
    
    console.log('[FilterManager] 筛选器固定状态已切换:', id, filter.isPinned);
    
    return filter.isPinned;
  }
  
  /**
   * 记录筛选器使用
   */
  recordFilterUsage(id: string): void {
    const filter = this.storage.savedFilters.find(f => f.id === id);
    if (!filter) return;
    
    filter.useCount++;
    filter.lastUsed = new Date().toISOString();
    
    // 更新最近使用列表
    this.storage.recentFilterIds = [
      id,
      ...this.storage.recentFilterIds.filter(fid => fid !== id)
    ].slice(0, 5);
    
    this.saveStorage();
  }
  
  /**
   * 设置默认筛选器
   */
  setDefaultFilter(id: string | undefined): void {
    this.storage.defaultFilterId = id;
    this.saveStorage();
    console.log('[FilterManager] 默认筛选器已设置:', id);
  }
  
  /**
   * 获取默认筛选器
   */
  getDefaultFilter(): SavedFilter | null {
    if (!this.storage.defaultFilterId) return null;
    return this.getFilter(this.storage.defaultFilterId);
  }
  
  /**
   * 应用筛选器到卡片列表
   */
  applyFilter(
    cards: Card[], 
    config: FilterConfig,
    allFieldTemplates: FieldTemplate[]
  ): Card[] {
    if (!config.groups || config.groups.length === 0) {
      return cards;
    }
    
    return cards.filter(card => 
      this.evaluateFilterConfig(card, config, allFieldTemplates)
    );
  }
  
  /**
   * 评估筛选配置
   */
  private evaluateFilterConfig(
    card: Card, 
    config: FilterConfig,
    allFieldTemplates: FieldTemplate[]
  ): boolean {
    if (config.groups.length === 0) return true;
    
    const groupResults = config.groups.map(group => 
      this.evaluateFilterGroup(card, group, allFieldTemplates)
    );
    
    return config.globalLogic === 'AND' 
      ? groupResults.every(r => r)
      : groupResults.some(r => r);
  }
  
  /**
   * 评估筛选组
   */
  private evaluateFilterGroup(
    card: Card, 
    group: FilterGroup,
    allFieldTemplates: FieldTemplate[]
  ): boolean {
    const enabledConditions = group.conditions.filter(c => c.enabled);
    if (enabledConditions.length === 0) return true;
    
    const conditionResults = enabledConditions.map(c => 
      this.evaluateCondition(card, c, allFieldTemplates)
    );
    
    return group.logic === 'AND'
      ? conditionResults.every(r => r)
      : conditionResults.some(r => r);
  }
  
  /**
   * 评估单个条件
   */
  private evaluateCondition(
    card: Card, 
    condition: FilterCondition,
    allFieldTemplates: FieldTemplate[]
  ): boolean {
    const fieldValue = this.getFieldValue(card, condition.field, allFieldTemplates);
    const targetValue = condition.value;
    
    switch (condition.operator) {
      case 'equals':
        return fieldValue === targetValue;
        
      case 'not_equals':
        return fieldValue !== targetValue;
        
      case 'contains':
        if (Array.isArray(fieldValue)) {
          return fieldValue.some(v => 
            String(v).toLowerCase().includes(String(targetValue).toLowerCase())
          );
        }
        return String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());
        
      case 'not_contains':
        if (Array.isArray(fieldValue)) {
          return !fieldValue.some(v => 
            String(v).toLowerCase().includes(String(targetValue).toLowerCase())
          );
        }
        return !String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());
        
      case 'starts_with':
        return String(fieldValue).toLowerCase().startsWith(String(targetValue).toLowerCase());
        
      case 'ends_with':
        return String(fieldValue).toLowerCase().endsWith(String(targetValue).toLowerCase());
        
      case 'greater_than':
        return Number(fieldValue) > Number(targetValue);
        
      case 'less_than':
        return Number(fieldValue) < Number(targetValue);
        
      case 'greater_equal':
        return Number(fieldValue) >= Number(targetValue);
        
      case 'less_equal':
        return Number(fieldValue) <= Number(targetValue);
        
      case 'is_empty':
        if (Array.isArray(fieldValue)) return fieldValue.length === 0;
        return !fieldValue || fieldValue === '';
        
      case 'is_not_empty':
        if (Array.isArray(fieldValue)) return fieldValue.length > 0;
        return !!fieldValue && fieldValue !== '';
        
      case 'in_last':
        return this.isInLastDays(fieldValue as Date, Number(targetValue));
        
      case 'not_in_last':
        return !this.isInLastDays(fieldValue as Date, Number(targetValue));
        
      default:
        console.warn('[FilterManager] 未知操作符:', condition.operator);
        return false;
    }
  }
  
  /**
   * 获取卡片字段值
   */
  private getFieldValue(
    card: Card, 
    field: FilterField,
    allFieldTemplates: FieldTemplate[]
  ): any {
    switch (field) {
      case 'status':
        return this.getStatusString(card.fsrs?.state ?? 0);
        
      case 'deck':
        return card.deckId;
        
      case 'tags':
        return card.tags || [];
        
      case 'created':
        return new Date(card.created);
        
      case 'modified':
        return new Date(card.modified);
        
      case 'due':
        return card.fsrs?.due ? new Date(card.fsrs.due) : new Date();
        
      case 'difficulty':
        return card.fsrs?.difficulty ?? 0;
        
      case 'stability':
        return card.fsrs?.stability ?? 0;
        
      case 'source_document':
        return card.fields?.source_document || '';
        
      case 'front':
        return getCardContentBySide(card, 'front', allFieldTemplates);
        
      case 'back':
        return getCardContentBySide(card, 'back', allFieldTemplates);
        
      default:
        return '';
    }
  }
  
  /**
   * 获取状态字符串
   */
  private getStatusString(state: number): string {
    switch (state) {
      case 0: return 'new';
      case 1: return 'learning';
      case 2: return 'review';
      case 3: return 'mastered';
      default: return 'unknown';
    }
  }
  
  /**
   * 检查日期是否在最近N天内
   */
  private isInLastDays(date: Date, days: number): boolean {
    if (!date || isNaN(date.getTime())) return false;
    
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    
    return diffDays >= 0 && diffDays <= days;
  }
  
  /**
   * 加载存储
   */
  private loadStorage(): FilterStorage {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('[FilterManager] 已加载筛选器存储:', parsed.savedFilters.length, '个筛选器');
        return parsed;
      }
    } catch (error) {
      console.error('[FilterManager] 加载筛选器存储失败:', error);
    }
    
    console.log('[FilterManager] 初始化新的筛选器存储');
    return {
      version: '1.0',
      savedFilters: [],
      recentFilterIds: []
    };
  }
  
  /**
   * 保存存储
   */
  private saveStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.storage));
    } catch (error) {
      console.error('[FilterManager] 保存筛选器存储失败:', error);
    }
  }
  
  /**
   * 导出筛选器配置
   */
  exportFilters(): string {
    return JSON.stringify(this.storage, null, 2);
  }
  
  /**
   * 导入筛选器配置
   */
  importFilters(jsonString: string): { success: boolean; imported: number; error?: string } {
    try {
      const imported = JSON.parse(jsonString) as FilterStorage;
      
      if (!imported.savedFilters || !Array.isArray(imported.savedFilters)) {
        return { success: false, imported: 0, error: '无效的筛选器数据格式' };
      }
      
      // 合并导入的筛选器（排除内置筛选器）
      const nonBuiltInFilters = imported.savedFilters.filter(f => !f.isBuiltIn);
      
      nonBuiltInFilters.forEach(filter => {
        // 生成新ID避免冲突
        filter.id = `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        filter.createdAt = new Date().toISOString();
        filter.updatedAt = new Date().toISOString();
        this.storage.savedFilters.push(filter);
      });
      
      this.saveStorage();
      
      console.log('[FilterManager] 已导入筛选器:', nonBuiltInFilters.length, '个');
      
      return { success: true, imported: nonBuiltInFilters.length };
    } catch (error) {
      console.error('[FilterManager] 导入筛选器失败:', error);
      return { 
        success: false, 
        imported: 0, 
        error: error instanceof Error ? error.message : '未知错误' 
      };
    }
  }
}

// 导出单例实例
export const filterManager = new FilterManager();

