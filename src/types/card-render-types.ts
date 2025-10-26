/**
 * 卡片渲染状态类型定义
 * 
 * 用于管理卡片的渲染状态和骨架屏配置
 * 
 * @module card-render-types
 */

/**
 * 卡片渲染模式类型
 */
export type CardRenderMode = 'full' | 'skeleton' | 'placeholder';

/**
 * 卡片渲染状态接口
 * 
 * 记录单个卡片的渲染状态和高度信息
 */
export interface CardRenderState {
  /** 卡片唯一标识 */
  cardId: string;
  
  /** 当前渲染模式 */
  renderMode: CardRenderMode;
  
  /** 测量的实际高度（像素，null 表示未测量） */
  measuredHeight: number | null;
  
  /** 卡片是否在可视区域内 */
  isVisible: boolean;
  
  /** 最后一次渲染的时间戳（用于缓存管理） */
  lastRenderedAt: number;
  
  /** 是否正在测量高度 */
  isMeasuring?: boolean;
  
  /** 渲染错误（如果有） */
  renderError?: string;
}

/**
 * 骨架屏配置接口
 * 
 * 控制骨架屏的显示元素和动画
 */
export interface SkeletonConfig {
  /** 是否显示头像/图标骨架 */
  showAvatar: boolean;
  
  /** 是否显示标题骨架 */
  showTitle: boolean;
  
  /** 是否显示内容骨架 */
  showContent: boolean;
  
  /** 是否显示页脚骨架 */
  showFooter: boolean;
  
  /** 动画持续时间（毫秒） */
  animationDuration: number;
  
  /** 骨架屏行数（用于内容区域） */
  contentLines?: number;
  
  /** 是否启用闪烁动画 */
  enableShimmer?: boolean;
}

/**
 * 默认骨架屏配置
 */
export const DEFAULT_SKELETON_CONFIG: SkeletonConfig = {
  showAvatar: false,
  showTitle: true,
  showContent: true,
  showFooter: true,
  animationDuration: 1500,
  contentLines: 3,
  enableShimmer: true
};



