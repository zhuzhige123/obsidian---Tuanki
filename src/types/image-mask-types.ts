/**
 * 图片遮罩功能类型定义
 * 
 * 功能说明：
 * - 支持在图片上绘制遮罩区域，用于医学图谱等场景的记忆学习
 * - 遮罩数据以 HTML 注释形式存储在图片语法下方
 * - 使用相对坐标（0-1范围）适配图片尺寸变化
 * 
 * @author Tuanki Team
 * @date 2025-10-22
 */

import type { Editor, TFile } from 'obsidian';

/**
 * 遮罩数据容器
 */
export interface MaskData {
  /** 数据格式版本 */
  version: '1.0';
  
  /** 遮罩数组 */
  masks: Mask[];
}

/**
 * 单个遮罩定义
 */
export interface Mask {
  /** 唯一标识符 */
  id: string;
  
  /** 遮罩类型 */
  type: 'rect' | 'circle';
  
  /** 相对坐标 X (0-1) - 相对于图片宽度 */
  x: number;
  
  /** 相对坐标 Y (0-1) - 相对于图片高度 */
  y: number;
  
  /** 矩形：相对宽度 (0-1) */
  width?: number;
  
  /** 矩形：相对高度 (0-1) */
  height?: number;
  
  /** 圆形：相对半径 (0-1) - 相对于图片较短边 */
  radius?: number;
  
  /** 遮罩样式 */
  style: MaskStyle;
  
  /** 填充颜色（RGBA 字符串） */
  fill?: string;
  
  /** 模糊半径（像素） */
  blurRadius?: number;
}

/**
 * 遮罩样式枚举
 */
export type MaskStyle = 'solid' | 'blur';

/**
 * 图片遮罩编辑上下文
 * 用于在编辑器和模态窗之间传递数据
 */
export interface ImageMaskContext {
  /** 图片路径（Obsidian 内部路径） */
  imagePath: string;
  
  /** 图片文件对象 */
  imageFile: TFile;
  
  /** 现有遮罩数据（如果存在） */
  maskData: MaskData | null;
  
  /** 源编辑器实例 */
  sourceEditor: Editor;
  
  /** 图片语法所在行号 */
  sourceLine: number;
  
  /** 源文件路径（用于路径解析） */
  sourceFilePath: string;
}

/**
 * 遮罩数据解析结果
 */
export interface ParseResult {
  /** 是否解析成功 */
  success: boolean;
  
  /** 遮罩数据（成功时） */
  data?: MaskData;
  
  /** 错误信息（失败时） */
  error?: string;
}

/**
 * HTML 注释查找结果
 */
export interface CommentLocation {
  /** 是否找到注释 */
  found: boolean;
  
  /** 注释所在行号 */
  line?: number;
  
  /** 注释完整内容 */
  content?: string;
}

/**
 * 遮罩渲染选项
 */
export interface MaskRenderOptions {
  /** 是否显示遮罩（学习模式下的状态） */
  visible: boolean;
  
  /** 动画持续时间（毫秒） */
  animationDuration?: number;
  
  /** 是否启用动画 */
  enableAnimation?: boolean;
}

/**
 * 常量定义
 */
export const MASK_CONSTANTS = {
  /** HTML 注释前缀 */
  COMMENT_PREFIX: '<!-- tuanki-mask:',
  
  /** HTML 注释后缀 */
  COMMENT_SUFFIX: '-->',
  
  /** 当前数据版本 */
  CURRENT_VERSION: '1.0' as const,
  
  /** 默认遮罩样式 */
  DEFAULT_STYLE: 'solid' as MaskStyle,
  
  /** 默认填充色 */
  DEFAULT_FILL: 'rgba(0, 0, 0, 0.7)',
  
  /** 默认模糊半径 */
  DEFAULT_BLUR_RADIUS: 10,
  
  /** 默认动画持续时间（毫秒） */
  DEFAULT_ANIMATION_DURATION: 300,
} as const;

/**
 * 遮罩编辑器事件
 */
export interface MaskEditorEvents {
  /** 遮罩添加事件 */
  onMaskAdded?: (mask: Mask) => void;
  
  /** 遮罩修改事件 */
  onMaskModified?: (mask: Mask) => void;
  
  /** 遮罩删除事件 */
  onMaskDeleted?: (maskId: string) => void;
  
  /** 保存事件 */
  onSave?: (maskData: MaskData) => void;
  
  /** 取消事件 */
  onCancel?: () => void;
}



