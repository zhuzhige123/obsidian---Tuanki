/**
 * 🎯 统一预览类型定义
 * 
 * 为Tuanki插件的预览系统提供统一的类型定义，确保所有组件使用一致的数据结构。
 * 
 * @version 1.0.0
 * @author Tuanki Team
 */

import { CardType } from '../types/card-types';

/**
 * 预览节类型枚举
 * 统一定义所有可能的预览节类型
 */
export type PreviewSectionType = 'front' | 'back' | 'options' | 'explanation';

/**
 * 动画配置接口
 */
export interface AnimationConfig {
  /** 动画类型 */
  type: 'fade-in' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'none';
  /** 动画持续时间（毫秒） */
  duration: number;
  /** 动画延迟（毫秒） */
  delay: number;
  /** 缓动函数 */
  easing?: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear';
}

/**
 * 交互性配置接口
 */
export interface InteractivityConfig {
  /** 是否可点击 */
  clickable: boolean;
  /** 是否可悬停 */
  hoverable: boolean;
  /** 是否可聚焦 */
  focusable: boolean;
  /** 自定义事件处理器 */
  customHandlers?: Record<string, (event: Event) => void>;
}

/**
 * 预览节元数据接口
 */
export interface PreviewSectionMetadata {
  /** 字段名称 */
  fieldName: string;
  /** 是否必需 */
  isRequired?: boolean;
  /** 渲染优先级 */
  priority?: number;
  /** 自定义属性 */
  customAttributes?: Record<string, any>;
}

/**
 * 统一预览节接口
 * 
 * 这是所有预览节的标准数据结构，确保类型一致性
 */
export interface UnifiedPreviewSection {
  /** 唯一标识符 */
  id: string;
  /** 节类型 - 使用统一的类型枚举 */
  type: PreviewSectionType;
  /** 节内容（HTML格式） */
  content: string;
  /** 渲染模式 */
  renderMode: 'markdown' | 'html' | 'mixed';
  /** 动画配置 */
  animationConfig: AnimationConfig;
  /** 交互性配置 */
  interactivityConfig: InteractivityConfig;
  /** 元数据 */
  metadata: PreviewSectionMetadata;
  /** 可见性状态 */
  isVisible?: boolean;
  /** 是否已渲染 */
  isRendered?: boolean;
}

/**
 * 预览数据接口
 * 
 * 包含完整的卡片预览信息
 */
export interface UnifiedPreviewData {
  /** 卡片类型 */
  cardType: CardType;
  /** 预览节列表 */
  sections: UnifiedPreviewSection[];
  /** 预览元数据 */
  metadata: {
    /** 卡片ID */
    cardId: string;
    /** 创建时间 */
    createdAt: Date;
    /** 最后更新时间 */
    updatedAt: Date;
    /** 预览版本 */
    version: string;
    /** 自定义元数据 */
    custom?: Record<string, any>;
  };
  /** 渲染选项 */
  renderOptions?: {
    /** 主题模式 */
    theme?: 'light' | 'dark' | 'auto';
    /** 是否启用动画 */
    enableAnimations?: boolean;
    /** 是否启用交互 */
    enableInteractivity?: boolean;
    /** 自定义CSS类 */
    customClasses?: string[];
  };
}

/**
 * 预览节过滤器类型
 */
export type PreviewSectionFilter = (section: UnifiedPreviewSection) => boolean;

/**
 * 预览节转换器类型
 */
export type PreviewSectionTransformer = (section: UnifiedPreviewSection) => UnifiedPreviewSection;

/**
 * 预览渲染选项接口
 */
export interface PreviewRenderOptions {
  /** 是否显示答案 */
  showAnswer?: boolean;
  /** 是否启用答案控制 */
  enableAnswerControls?: boolean;
  /** 问题布局模式 */
  questionLayout?: 'vertical' | 'horizontal' | 'grid';
  /** 自定义样式 */
  customStyles?: Record<string, string>;
  /** 事件处理器 */
  eventHandlers?: Record<string, (event: Event) => void>;
}

/**
 * 预览节工厂函数类型
 */
export type PreviewSectionFactory = (
  type: PreviewSectionType,
  content: string,
  metadata: Partial<PreviewSectionMetadata>
) => UnifiedPreviewSection;

/**
 * 预览数据验证器接口
 */
export interface PreviewDataValidator {
  /** 验证预览数据 */
  validate(data: UnifiedPreviewData): ValidationResult;
  /** 验证预览节 */
  validateSection(section: UnifiedPreviewSection): ValidationResult;
}

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
  /** 建议信息 */
  suggestions: string[];
}

/**
 * 预览节构建器接口
 */
export interface PreviewSectionBuilder {
  /** 设置类型 */
  setType(type: PreviewSectionType): PreviewSectionBuilder;
  /** 设置内容 */
  setContent(content: string): PreviewSectionBuilder;
  /** 设置动画 */
  setAnimation(config: AnimationConfig): PreviewSectionBuilder;
  /** 设置交互性 */
  setInteractivity(config: InteractivityConfig): PreviewSectionBuilder;
  /** 设置元数据 */
  setMetadata(metadata: PreviewSectionMetadata): PreviewSectionBuilder;
  /** 构建预览节 */
  build(): UnifiedPreviewSection;
}

/**
 * 预览系统事件类型
 */
export type PreviewSystemEvent = 
  | 'section-rendered'
  | 'section-updated'
  | 'section-removed'
  | 'preview-loaded'
  | 'preview-updated'
  | 'animation-started'
  | 'animation-completed'
  | 'interaction-triggered';

/**
 * 预览系统事件数据接口
 */
export interface PreviewSystemEventData {
  /** 事件类型 */
  type: PreviewSystemEvent;
  /** 相关预览节ID */
  sectionId?: string;
  /** 相关预览数据ID */
  previewId?: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 事件数据 */
  data?: any;
}

/**
 * 预览系统事件监听器类型
 */
export type PreviewSystemEventListener = (eventData: PreviewSystemEventData) => void;

/**
 * 预览系统配置接口
 */
export interface PreviewSystemConfig {
  /** 默认动画配置 */
  defaultAnimation: AnimationConfig;
  /** 默认交互性配置 */
  defaultInteractivity: InteractivityConfig;
  /** 性能配置 */
  performance: {
    /** 最大并发渲染数 */
    maxConcurrentRenders: number;
    /** 渲染超时时间（毫秒） */
    renderTimeout: number;
    /** 是否启用缓存 */
    enableCaching: boolean;
  };
  /** 调试配置 */
  debug: {
    /** 是否启用调试模式 */
    enabled: boolean;
    /** 日志级别 */
    logLevel: 'error' | 'warn' | 'info' | 'debug';
  };
}

/**
 * 导出常用的类型别名
 */
export type PreviewSection = UnifiedPreviewSection;
export type PreviewData = UnifiedPreviewData;

/**
 * 默认配置常量
 */
export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  type: 'fade-in',
  duration: 300,
  delay: 0,
  easing: 'ease-out'
};

export const DEFAULT_INTERACTIVITY_CONFIG: InteractivityConfig = {
  clickable: false,
  hoverable: true,
  focusable: false
};

export const DEFAULT_PREVIEW_SYSTEM_CONFIG: PreviewSystemConfig = {
  defaultAnimation: DEFAULT_ANIMATION_CONFIG,
  defaultInteractivity: DEFAULT_INTERACTIVITY_CONFIG,
  performance: {
    maxConcurrentRenders: 5,
    renderTimeout: 5000,
    enableCaching: true
  },
  debug: {
    enabled: false,
    logLevel: 'warn'
  }
};
