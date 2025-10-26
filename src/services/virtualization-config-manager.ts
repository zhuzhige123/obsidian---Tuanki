/**
 * 虚拟化配置管理器
 * 
 * 提供虚拟化配置的获取、存储和策略选择功能
 * 
 * @module virtualization-config-manager
 */

import type {
  VirtualizationConfig,
  KanbanVirtualizationConfig,
  TableVirtualizationConfig,
  RenderStrategy
} from '../types/virtualization-types';

/**
 * LocalStorage 键名
 */
const STORAGE_KEY = 'tuanki-virtualization-config';

/**
 * 看板视图默认配置
 */
const DEFAULT_KANBAN_CONFIG: KanbanVirtualizationConfig = {
  enabled: true,
  strategy: 'virtual',
  estimatedItemSize: 200,
  overscan: 5,
  measurementCache: true,
  autoTriggerThreshold: 200,
  initialCardsPerColumn: 30,
  batchSize: 20,
  enableColumnVirtualization: true,
  releaseThreshold: 1000,
  columnScrollBehavior: 'independent'
};

/**
 * 表格视图默认配置
 */
const DEFAULT_TABLE_CONFIG: TableVirtualizationConfig = {
  enabled: false, // 默认保持分页
  strategy: 'none',
  estimatedItemSize: 60,
  overscan: 5,
  measurementCache: true,
  autoTriggerThreshold: 200,
  rowHeight: 'dynamic',
  enableVirtualScroll: false,
  fallbackToPagination: true,
  paginationThreshold: 500
};

/**
 * 虚拟化配置管理器类
 * 
 * 提供静态方法管理虚拟化配置
 */
export class VirtualizationConfigManager {
  /**
   * 获取看板视图配置
   * 
   * @returns 看板虚拟化配置
   */
  static getKanbanConfig(): KanbanVirtualizationConfig {
    const stored = this.loadFromStorage();
    
    if (stored && stored.kanban) {
      // 合并存储的配置和默认配置（确保新增字段有默认值）
      return {
        ...DEFAULT_KANBAN_CONFIG,
        ...stored.kanban
      };
    }
    
    return { ...DEFAULT_KANBAN_CONFIG };
  }
  
  /**
   * 获取表格视图配置
   * 
   * @returns 表格虚拟化配置
   */
  static getTableConfig(): TableVirtualizationConfig {
    const stored = this.loadFromStorage();
    
    if (stored && stored.table) {
      // 合并存储的配置和默认配置
      return {
        ...DEFAULT_TABLE_CONFIG,
        ...stored.table
      };
    }
    
    return { ...DEFAULT_TABLE_CONFIG };
  }
  
  /**
   * 判断是否应启用虚拟化
   * 
   * @param itemCount - 项目数量
   * @param viewType - 视图类型
   * @returns 是否启用虚拟化
   * 
   * @remarks
   * 判断逻辑：
   * - 看板视图：> 200 张卡片启用
   * - 表格视图：> 500 张卡片启用
   */
  static shouldEnableVirtualization(
    itemCount: number,
    viewType: 'table' | 'kanban' | 'grid'
  ): boolean {
    // 获取对应视图的配置
    const config = viewType === 'kanban'
      ? this.getKanbanConfig()
      : this.getTableConfig();
    
    // 检查配置是否全局禁用
    if (!config.enabled) {
      return false;
    }
    
    // 根据视图类型和数据量判断
    switch (viewType) {
      case 'kanban':
        return itemCount > 200;
      
      case 'table':
        return itemCount > 500;
      
      case 'grid':
        return itemCount > 300;
      
      default:
        return false;
    }
  }
  
  /**
   * 获取最优渲染策略
   * 
   * @param itemCount - 项目数量
   * @returns 渲染策略
   * 
   * @remarks
   * 策略选择逻辑：
   * - < 100 项：'none'（直接渲染）
   * - 100-500 项：'progressive'（渐进加载）
   * - > 500 项：'virtual'（虚拟滚动）
   */
  static getOptimalStrategy(itemCount: number): RenderStrategy {
    if (itemCount < 100) {
      return 'none';
    } else if (itemCount < 500) {
      return 'progressive';
    } else {
      return 'virtual';
    }
  }
  
  /**
   * 更新看板视图配置
   * 
   * @param config - 部分配置（将合并到现有配置）
   */
  static updateKanbanConfig(config: Partial<KanbanVirtualizationConfig>): void {
    const current = this.getKanbanConfig();
    const updated = { ...current, ...config };
    
    const allConfigs = this.loadFromStorage() || {};
    allConfigs.kanban = updated;
    
    this.saveToStorage(allConfigs);
  }
  
  /**
   * 更新表格视图配置
   * 
   * @param config - 部分配置（将合并到现有配置）
   */
  static updateTableConfig(config: Partial<TableVirtualizationConfig>): void {
    const current = this.getTableConfig();
    const updated = { ...current, ...config };
    
    const allConfigs = this.loadFromStorage() || {};
    allConfigs.table = updated;
    
    this.saveToStorage(allConfigs);
  }
  
  /**
   * 重置所有配置为默认值
   */
  static resetToDefaults(): void {
    const defaultConfigs = {
      kanban: DEFAULT_KANBAN_CONFIG,
      table: DEFAULT_TABLE_CONFIG
    };
    
    this.saveToStorage(defaultConfigs);
  }
  
  /**
   * 从 LocalStorage 加载配置
   * 
   * @private
   * @returns 配置对象或 null
   */
  private static loadFromStorage(): any | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[VirtualizationConfigManager] 加载配置失败:', error);
    }
    return null;
  }
  
  /**
   * 保存配置到 LocalStorage
   * 
   * @private
   * @param config - 配置对象
   */
  private static saveToStorage(config: any): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      console.log('[VirtualizationConfigManager] 配置已保存');
    } catch (error) {
      console.error('[VirtualizationConfigManager] 保存配置失败:', error);
    }
  }
  
  /**
   * 获取所有配置（用于调试）
   * 
   * @returns 所有视图的配置
   */
  static getAllConfigs() {
    return {
      kanban: this.getKanbanConfig(),
      table: this.getTableConfig()
    };
  }
  
  /**
   * 计算推荐的 overscan 值
   * 
   * @param itemCount - 项目数量
   * @param viewportHeight - 视口高度（像素）
   * @param estimatedItemSize - 估算项目高度（像素）
   * @returns 推荐的 overscan 值
   */
  static calculateRecommendedOverscan(
    itemCount: number,
    viewportHeight: number,
    estimatedItemSize: number
  ): number {
    // 计算视口内可见项目数
    const visibleCount = Math.ceil(viewportHeight / estimatedItemSize);
    
    // overscan 为可见数量的 50%，但不少于 3，不超过 10
    const overscan = Math.max(3, Math.min(10, Math.ceil(visibleCount * 0.5)));
    
    return overscan;
  }
  
  /**
   * 验证配置有效性
   * 
   * @param config - 待验证的配置
   * @returns 是否有效
   */
  static validateConfig(config: VirtualizationConfig): boolean {
    // 检查必需字段
    if (typeof config.enabled !== 'boolean') return false;
    if (!['none', 'progressive', 'virtual'].includes(config.strategy)) return false;
    if (typeof config.estimatedItemSize !== 'number' || config.estimatedItemSize <= 0) return false;
    if (typeof config.overscan !== 'number' || config.overscan < 0) return false;
    
    return true;
  }
}

/**
 * 导出默认配置（用于测试和参考）
 */
export const DEFAULT_CONFIGS = {
  kanban: DEFAULT_KANBAN_CONFIG,
  table: DEFAULT_TABLE_CONFIG
};



