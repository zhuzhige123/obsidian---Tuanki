/**
 * Cursor 风格设计令牌系统
 * 提供统一的设计变量和主题适配
 */

// 颜色系统
export const Colors = {
  // 主色调
  primary: 'var(--tuanki-primary, #6366f1)',
  primaryHover: 'var(--tuanki-primary-hover, #5855eb)',
  primaryActive: 'var(--tuanki-primary-active, #4f46e5)',
  primaryLight: 'var(--tuanki-primary-light, #a5b4fc)',
  primaryDark: 'var(--tuanki-primary-dark, #3730a3)',

  // 次要色调
  secondary: 'var(--tuanki-secondary, #8b5cf6)',
  secondaryHover: 'var(--tuanki-secondary-hover, #7c3aed)',
  secondaryActive: 'var(--tuanki-secondary-active, #6d28d9)',

  // 背景色系
  background: 'var(--tuanki-bg, #ffffff)',
  backgroundSecondary: 'var(--tuanki-bg-secondary, #f8fafc)',
  surface: 'var(--tuanki-surface, #f8fafc)',
  surfaceHover: 'var(--tuanki-surface-hover, #f1f5f9)',
  surfaceActive: 'var(--tuanki-surface-active, #e2e8f0)',

  // 边框和分割线
  border: 'var(--tuanki-border, #e2e8f0)',
  borderHover: 'var(--tuanki-border-hover, #cbd5e1)',
  borderActive: 'var(--tuanki-border-active, #94a3b8)',
  divider: 'var(--tuanki-divider, #f1f5f9)',

  // 文本色系
  text: {
    primary: 'var(--tuanki-text-primary, #1e293b)',
    secondary: 'var(--tuanki-text-secondary, #64748b)',
    muted: 'var(--tuanki-text-muted, #94a3b8)',
    disabled: 'var(--tuanki-text-disabled, #cbd5e1)',
    inverse: 'var(--tuanki-text-inverse, #ffffff)'
  },

  // 状态色
  status: {
    success: 'var(--tuanki-success, #10b981)',
    successLight: 'var(--tuanki-success-light, #d1fae5)',
    warning: 'var(--tuanki-warning, #f59e0b)',
    warningLight: 'var(--tuanki-warning-light, #fef3c7)',
    error: 'var(--tuanki-error, #ef4444)',
    errorLight: 'var(--tuanki-error-light, #fee2e2)',
    info: 'var(--tuanki-info, #3b82f6)',
    infoLight: 'var(--tuanki-info-light, #dbeafe)'
  },

  // 特殊用途色
  overlay: 'var(--tuanki-overlay, rgba(0, 0, 0, 0.5))',
  backdrop: 'var(--tuanki-backdrop, rgba(0, 0, 0, 0.25))',
  highlight: 'var(--tuanki-highlight, #fbbf24)',
  selection: 'var(--tuanki-selection, #bfdbfe)'
} as const;

// 间距系统 - 使用统一的变量名
export const Spacing = {
  xs: 'var(--tuanki-space-xs, 0.25rem)',
  sm: 'var(--tuanki-space-sm, 0.5rem)',
  md: 'var(--tuanki-space-md, 1rem)',
  lg: 'var(--tuanki-space-lg, 1.5rem)',
  xl: 'var(--tuanki-space-xl, 2rem)',
  '2xl': 'var(--tuanki-space-2xl, 3rem)'
} as const;

// 圆角系统
export const Radius = {
  none: '0',
  sm: 'var(--tuanki-radius-sm, 0.375rem)',
  md: 'var(--tuanki-radius-md, 0.5rem)',
  lg: 'var(--tuanki-radius-lg, 0.75rem)',
  xl: 'var(--tuanki-radius-xl, 1rem)',
  full: '9999px'
} as const;

// 阴影系统
export const Shadows = {
  none: 'none',
  sm: 'var(--tuanki-shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05))',
  md: 'var(--tuanki-shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1))',
  lg: 'var(--tuanki-shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))',
  xl: 'var(--tuanki-shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))',
  inner: 'var(--tuanki-shadow-inner, inset 0 2px 4px 0 rgb(0 0 0 / 0.05))'
} as const;

// 字体系统
export const Typography = {
  fontFamily: {
    sans: 'var(--tuanki-font-sans, ui-sans-serif, system-ui, sans-serif)',
    mono: 'var(--tuanki-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace)'
  },
  fontSize: {
    xs: 'var(--tuanki-text-xs, 0.75rem)',
    sm: 'var(--tuanki-text-sm, 0.875rem)',
    base: 'var(--tuanki-text-base, 1rem)',
    lg: 'var(--tuanki-text-lg, 1.125rem)',
    xl: 'var(--tuanki-text-xl, 1.25rem)',
    '2xl': 'var(--tuanki-text-2xl, 1.5rem)',
    '3xl': 'var(--tuanki-text-3xl, 1.875rem)'
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75'
  }
} as const;

// 动画系统
export const Animation = {
  duration: {
    fast: 'var(--tuanki-duration-fast, 150ms)',
    normal: 'var(--tuanki-duration-normal, 300ms)',
    slow: 'var(--tuanki-duration-slow, 500ms)'
  },
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out'
  }
} as const;

// Z-index 层级
export const ZIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070
} as const;

// 断点系统
export const Breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
} as const;

// 组件特定令牌
export const Components = {
  button: {
    height: {
      sm: '2rem',
      md: '2.5rem',
      lg: '3rem'
    },
    padding: {
      sm: '0.5rem 1rem',
      md: '0.75rem 1.5rem',
      lg: '1rem 2rem'
    }
  },
  input: {
    height: {
      sm: '2rem',
      md: '2.5rem',
      lg: '3rem'
    },
    padding: '0.75rem 1rem'
  },
  modal: {
    maxWidth: {
      sm: '28rem',
      md: '32rem',
      lg: '48rem',
      xl: '64rem'
    }
  },
  card: {
    padding: {
      sm: '1rem',
      md: '1.5rem',
      lg: '2rem'
    }
  }
} as const;

// 预览组件特定令牌
export const Preview = {
  // 预览容器样式
  container: {
    background: 'var(--tuanki-surface)',
    borderRadius: 'var(--tuanki-radius-lg)',
    padding: 'var(--tuanki-space-lg)',
    shadow: 'var(--tuanki-shadow-lg)',
    border: '1px solid var(--tuanki-border)'
  },

  // 题型特定颜色
  cardTypes: {
    basicQA: {
      accent: '#6366f1',
      background: 'rgba(99, 102, 241, 0.1)',
      border: 'rgba(99, 102, 241, 0.2)'
    },
    cloze: {
      accent: '#8b5cf6',
      background: 'rgba(139, 92, 246, 0.1)',
      border: 'rgba(139, 92, 246, 0.2)'
    },
    multipleChoice: {
      accent: '#10b981',
      background: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.2)'
    },
    extensible: {
      accent: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.2)'
    }
  },

  // 动效配置
  animations: {
    contentReveal: {
      duration: '300ms',
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      delay: '0ms'
    },
    typeTransition: {
      duration: '400ms',
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      delay: '100ms'
    },
    clozeReveal: {
      duration: '250ms',
      easing: 'ease-out',
      delay: '50ms'
    },
    optionSelection: {
      duration: '150ms',
      easing: 'ease-out',
      delay: '0ms'
    }
  },

  // 预览节样式
  sections: {
    question: {
      background: 'var(--tuanki-surface)',
      borderLeft: '4px solid var(--tuanki-primary)',
      padding: 'var(--tuanki-space-md)'
    },
    answer: {
      background: 'var(--tuanki-surface-secondary)',
      borderLeft: '4px solid var(--tuanki-success)',
      padding: 'var(--tuanki-space-md)'
    },
    options: {
      background: 'var(--tuanki-surface)',
      border: '1px solid var(--tuanki-border)',
      borderRadius: 'var(--tuanki-radius-md)',
      padding: 'var(--tuanki-space-sm)'
    },
    explanation: {
      background: 'var(--tuanki-info-light)',
      borderLeft: '4px solid var(--tuanki-info)',
      padding: 'var(--tuanki-space-md)'
    }
  }
} as const;

// 设计令牌集合
export const DesignTokens = {
  colors: Colors,
  spacing: Spacing,
  radius: Radius,
  shadows: Shadows,
  typography: Typography,
  animation: Animation,
  zIndex: ZIndex,
  breakpoints: Breakpoints,
  components: Components,
  preview: Preview
} as const;

// 主题适配函数
export const getThemeVariables = (isDark: boolean = false) => {
  const baseVariables = {
    '--tuanki-primary': '#6366f1',
    '--tuanki-primary-hover': '#5855eb',
    '--tuanki-primary-active': '#4f46e5',
    '--tuanki-secondary': '#8b5cf6',
    '--tuanki-success': '#10b981',
    '--tuanki-warning': '#f59e0b',
    '--tuanki-error': '#ef4444',
    '--tuanki-info': '#3b82f6'
  };

  if (isDark) {
    return {
      ...baseVariables,
      '--tuanki-bg': '#0f172a',
      '--tuanki-bg-secondary': '#1e293b',
      '--tuanki-surface': '#1e293b',
      '--tuanki-surface-hover': '#334155',
      '--tuanki-surface-active': '#475569',
      '--tuanki-border': '#334155',
      '--tuanki-border-hover': '#475569',
      '--tuanki-border-active': '#64748b',
      '--tuanki-divider': '#334155',
      '--tuanki-text-primary': '#f1f5f9',
      '--tuanki-text-secondary': '#cbd5e1',
      '--tuanki-text-muted': '#94a3b8',
      '--tuanki-text-disabled': '#64748b'
    };
  }

  return {
    ...baseVariables,
    '--tuanki-bg': '#ffffff',
    '--tuanki-bg-secondary': '#f8fafc',
    '--tuanki-surface': '#f8fafc',
    '--tuanki-surface-hover': '#f1f5f9',
    '--tuanki-surface-active': '#e2e8f0',
    '--tuanki-border': '#e2e8f0',
    '--tuanki-border-hover': '#cbd5e1',
    '--tuanki-border-active': '#94a3b8',
    '--tuanki-divider': '#f1f5f9',
    '--tuanki-text-primary': '#1e293b',
    '--tuanki-text-secondary': '#64748b',
    '--tuanki-text-muted': '#94a3b8',
    '--tuanki-text-disabled': '#cbd5e1'
  };
};

// 导出默认设计令牌
export default DesignTokens;
