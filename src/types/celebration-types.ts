/**
 * 庆祝功能类型定义
 */

/**
 * 恭喜消息
 */
export interface CongratulationMessage {
  emoji: string;
  text: string;
}

/**
 * 神经科学名言
 */
export interface NeuroScienceQuote {
  icon: string;
  text: string;
  author: string;
  note: string;
}

/**
 * 庆祝统计数据
 */
export interface CelebrationStats {
  reviewed: number;      // 复习卡片数
  studyTime: number;     // 学习时长（秒）
  memoryRate: number;    // 记忆率（0-1）
  newCards?: number;     // 新学习的卡片数
}

/**
 * 庆祝设置
 */
export interface CelebrationSettings {
  enabled: boolean;              // 是否启用庆祝动画
  soundEnabled: boolean;         // 音效开关
  soundVolume: number;           // 音量 0-1
  animationIntensity: 'low' | 'medium' | 'high'; // 动画强度
  showStats: boolean;            // 显示统计信息
  autoCloseDuration: number;     // 自动关闭时长（秒，0=手动）
}

/**
 * 默认庆祝设置
 */
export const DEFAULT_CELEBRATION_SETTINGS: CelebrationSettings = {
  enabled: true,
  soundEnabled: true,
  soundVolume: 0.5,
  animationIntensity: 'medium',
  showStats: true,
  autoCloseDuration: 0
};


