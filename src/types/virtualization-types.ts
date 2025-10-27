/**
 * 虚拟化类型定义
 * 
 * 定义虚拟滚动相关的配置和类型
 */

/**
 * 基础虚拟化配置
 */
export interface VirtualizationConfig {
  /** 是否启用虚拟化 */
  enabled: boolean;
  /** 渲染策略 */
  strategy: 'none' | 'progressive' | 'virtual';
  /** 预估项目高度 */
  estimatedItemSize: number;
  /** 预渲染项目数量 */
  overscan: number;
  /** 是否启用测量缓存 */
  measurementCache: boolean;
  /** 自动触发虚拟化的阈值 */
  autoTriggerThreshold: number;
}

/**
 * 看板视图虚拟化配置
 */
export interface KanbanVirtualizationConfig extends VirtualizationConfig {
  /** 每列初始卡片数 */
  initialCardsPerColumn: number;
  /** 批量加载大小 */
  batchSize: number;
  /** 是否启用列级虚拟化 */
  enableColumnVirtualization: boolean;
  /** 释放内存的阈值 */
  releaseThreshold: number;
  /** 列滚动行为 */
  columnScrollBehavior: 'independent' | 'synchronized';
}

/**
 * 表格视图虚拟化配置
 */
export interface TableVirtualizationConfig extends VirtualizationConfig {
  /** 行高度设置 */
  rowHeight: number | 'dynamic';
  /** 是否启用虚拟滚动 */
  enableVirtualScroll: boolean;
  /** 是否回退到分页 */
  fallbackToPagination: boolean;
  /** 分页阈值 */
  paginationThreshold: number;
}

/**
 * 虚拟化性能指标
 */
export interface VirtualizationMetrics {
  /** 总项目数 */
  totalItems: number;
  /** 可见项目数 */
  visibleItems: number;
  /** 渲染项目数 */
  renderedItems: number;
  /** 滚动位置 */
  scrollPosition: number;
  /** 虚拟化比率 */
  virtualizedRatio: number;
}

/**
 * 渲染策略类型
 */
export type RenderStrategy = 'immediate' | 'lazy' | 'progressive' | 'virtual';
