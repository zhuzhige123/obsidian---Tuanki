/**
 * 视频课程类型定义
 * 
 * 用于视频课程牌组的视频文件管理和状态追踪
 */

/**
 * 视频文件信息
 */
export interface VideoFile {
  /** 视频文件名（包含扩展名） */
  filename: string;
  
  /** 完整的wiki-link引用格式 */
  wikiLink: string;
  
  /** 所属卡片ID */
  cardId: string;
  
  /** 相对路径（基于vault根目录） */
  relativePath?: string;
}

/**
 * 视频状态类型
 */
export type VideoStatus = 
  | 'current'    // 当前卡片包含（绿色高亮）
  | 'studied'    // 已学习过的卡片包含（灰色+勾选）
  | 'pending';   // 未学习（默认）

/**
 * 视频项（包含状态）
 */
export interface VideoItem extends VideoFile {
  /** 视频状态 */
  status: VideoStatus;
  
  /** 是否可点击 */
  clickable?: boolean;
}

/**
 * 视频提取选项
 */
export interface VideoExtractionOptions {
  /** 是否包含子牌组 */
  includeSubdecks?: boolean;
  
  /** 支持的视频格式 */
  supportedFormats?: string[];
  
  /** 是否去重 */
  deduplicate?: boolean;
}

/**
 * 支持的视频文件扩展名
 */
export const SUPPORTED_VIDEO_FORMATS = [
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'ogv',
  'm4v'
] as const;

/**
 * 视频文件正则表达式
 * 支持格式：
 * - ![[视频.mp4]]
 * - [[视频.mp4]]（兼容没有!的情况）
 */
export const VIDEO_REGEX = /!?\[\[([^\]]+\.(mp4|webm|mov|avi|mkv|ogv|m4v))\]\]/gi;

/**
 * 视频状态配置
 */
export const VIDEO_STATUS_CONFIG = {
  current: {
    label: '当前',
    icon: '▶',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    clickable: true
  },
  studied: {
    label: '已学习',
    icon: '✓',
    color: '#6b7280',
    gradient: 'rgba(107, 114, 128, 0.1)',
    clickable: false
  },
  pending: {
    label: '待学习',
    icon: '○',
    color: 'var(--text-muted)',
    gradient: 'transparent',
    clickable: false
  }
} as const;

