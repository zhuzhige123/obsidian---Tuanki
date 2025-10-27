/**
 * Tuanki卡片预览设计令牌 (TypeScript版本)
 * 用于在JavaScript/TypeScript中引用设计令牌
 * 
 * @version 1.0.0
 * @description 提供类型安全的设计令牌访问
 */

export const CardDesignTokens = {
  /** 间距系统 */
  spacing: {
    xs: 'var(--tuanki-space-xs)',
    sm: 'var(--tuanki-space-sm)',
    md: 'var(--tuanki-space-md)',
    lg: 'var(--tuanki-space-lg)',
    xl: 'var(--tuanki-space-xl)',
    xxl: 'var(--tuanki-space-2xl)',
  },
  
  /** 圆角系统 */
  radius: {
    sm: 'var(--tuanki-radius-sm)',
    md: 'var(--tuanki-radius-md)',
    lg: 'var(--tuanki-radius-lg)',
    xl: 'var(--tuanki-radius-xl)',
  },
  
  /** 背景色 */
  background: {
    primary: 'var(--tuanki-bg-primary)',
    secondary: 'var(--tuanki-bg-secondary)',
    hover: 'var(--tuanki-bg-modifier)',
  },
  
  /** 文字颜色 */
  text: {
    normal: 'var(--tuanki-text-normal)',
    muted: 'var(--tuanki-text-muted)',
    faint: 'var(--tuanki-text-faint)',
  },
  
  /** 边框 */
  border: {
    default: 'var(--tuanki-border)',
    hover: 'var(--tuanki-border-hover)',
  },
  
  /** 强调色 */
  accent: {
    default: 'var(--tuanki-accent)',
    hover: 'var(--tuanki-accent-hover)',
  },
  
  /** 语义颜色 */
  semantic: {
    success: 'var(--tuanki-success)',
    error: 'var(--tuanki-error)',
    warning: 'var(--tuanki-warning)',
    info: 'var(--tuanki-info)',
  },
  
  /** 选择题状态 */
  choice: {
    default: 'var(--tuanki-choice-default)',
    hover: 'var(--tuanki-choice-hover)',
    selected: 'var(--tuanki-choice-selected)',
    correct: 'var(--tuanki-choice-correct)',
    incorrect: 'var(--tuanki-choice-incorrect)',
  },
  
  /** 阴影 */
  shadow: {
    sm: 'var(--tuanki-shadow-sm)',
    md: 'var(--tuanki-shadow-md)',
    lg: 'var(--tuanki-shadow-lg)',
  },
  
  /** 过渡时长 */
  transition: {
    fast: 'var(--tuanki-transition-fast)',
    normal: 'var(--tuanki-transition-normal)',
    slow: 'var(--tuanki-transition-slow)',
  },
  
  /** 缓动函数 */
  easing: {
    out: 'var(--tuanki-ease-out)',
    inOut: 'var(--tuanki-ease-in-out)',
    bounce: 'var(--tuanki-ease-bounce)',
  },
} as const;

/**
 * 设计令牌类型定义
 */
export type CardDesignTokensType = typeof CardDesignTokens;

/**
 * 动画类名常量
 */
export const AnimationClasses = {
  answerEnter: 'tuanki-answer-enter',
  optionSelected: 'tuanki-option-selected',
  correctFeedback: 'tuanki-correct-feedback',
  incorrectFeedback: 'tuanki-incorrect-feedback',
  clozeReveal: 'tuanki-cloze-reveal',
  dividerEnter: 'tuanki-divider-enter',
  cardMount: 'tuanki-card-mount',
  fadeIn: 'tuanki-fade-in',
  slideUp: 'tuanki-slide-up',
  noAnimation: 'tuanki-no-animation',
  gpuAccelerated: 'tuanki-gpu-accelerated',
} as const;

/**
 * 样式类名常量
 */
export const StyleClasses = {
  cardBase: 'tuanki-card-base',
  elegantDivider: 'tuanki-elegant-divider',
  dividerLine: 'divider-line',
  dividerLabel: 'divider-label',
  cardTypeBadge: 'tuanki-card-type-badge',
} as const;







