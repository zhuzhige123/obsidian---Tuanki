/**
 * Cursor 风格设计令牌系统
 * 提供统一的设计变量和主题适配
 */

export const Colors = {
  primary: "var(--weave-primary, #6366f1)",
  primaryHover: "var(--weave-primary-hover, #5855eb)",
  primaryActive: "var(--weave-primary-active, #4f46e5)",
  primaryLight: "var(--weave-primary-light, #a5b4fc)",
  primaryDark: "var(--weave-primary-dark, #3730a3)",
  secondary: "var(--weave-secondary, #8b5cf6)",
  secondaryHover: "var(--weave-secondary-hover, #7c3aed)",
  secondaryActive: "var(--weave-secondary-active, #6d28d9)",
  background: "var(--weave-bg, #ffffff)",
  backgroundSecondary: "var(--weave-bg-secondary, #f8fafc)",
  surface: "var(--weave-surface, #f8fafc)",
  surfaceHover: "var(--weave-surface-hover, #f1f5f9)",
  surfaceActive: "var(--weave-surface-active, #e2e8f0)",
  border: "var(--weave-border, #e2e8f0)",
  borderHover: "var(--weave-border-hover, #cbd5e1)",
  borderActive: "var(--weave-border-active, #94a3b8)",
  divider: "var(--weave-divider, #f1f5f9)",
  text: {
    primary: "var(--weave-text-primary, #1e293b)",
    secondary: "var(--weave-text-secondary, #64748b)",
    muted: "var(--weave-text-muted, #94a3b8)",
    disabled: "var(--weave-text-disabled, #cbd5e1)",
    inverse: "var(--weave-text-inverse, #ffffff)",
  },
  status: {
    success: "var(--weave-success, #10b981)",
    successLight: "var(--weave-success-light, #d1fae5)",
    warning: "var(--weave-warning, #f59e0b)",
    warningLight: "var(--weave-warning-light, #fef3c7)",
    error: "var(--weave-error, #ef4444)",
    errorLight: "var(--weave-error-light, #fee2e2)",
    info: "var(--weave-info, #3b82f6)",
    infoLight: "var(--weave-info-light, #dbeafe)",
  },
  overlay: "var(--weave-overlay, rgba(0, 0, 0, 0.5))",
  backdrop: "var(--weave-backdrop, rgba(0, 0, 0, 0.25))",
  highlight: "var(--weave-highlight, #fbbf24)",
  selection: "var(--weave-selection, #bfdbfe)",
} as const;

export const Spacing = {
  xs: "var(--weave-space-xs, 0.25rem)",
  sm: "var(--weave-space-sm, 0.5rem)",
  md: "var(--weave-space-md, 1rem)",
  lg: "var(--weave-space-lg, 1.5rem)",
  xl: "var(--weave-space-xl, 2rem)",
  "2xl": "var(--weave-space-2xl, 3rem)",
} as const;

export const Radius = {
  none: "0",
  sm: "var(--weave-radius-sm, 0.375rem)",
  md: "var(--weave-radius-md, 0.5rem)",
  lg: "var(--weave-radius-lg, 0.75rem)",
  xl: "var(--weave-radius-xl, 1rem)",
  full: "9999px",
} as const;

export const Shadows = {
  none: "none",
  sm: "var(--weave-shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05))",
  md: "var(--weave-shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1))",
  lg: "var(--weave-shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))",
  xl: "var(--weave-shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1))",
  inner: "var(--weave-shadow-inner, inset 0 2px 4px 0 rgb(0 0 0 / 0.05))",
} as const;

export const Typography = {
  fontFamily: {
    sans: "var(--weave-font-sans, ui-sans-serif, system-ui, sans-serif)",
    mono: 'var(--weave-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace)',
  },
  fontSize: {
    xs: "var(--weave-text-xs, 0.75rem)",
    sm: "var(--weave-text-sm, 0.875rem)",
    base: "var(--weave-text-base, 1rem)",
    lg: "var(--weave-text-lg, 1.125rem)",
    xl: "var(--weave-text-xl, 1.25rem)",
    "2xl": "var(--weave-text-2xl, 1.5rem)",
    "3xl": "var(--weave-text-3xl, 1.875rem)",
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.75",
  },
} as const;

export const Animation = {
  duration: {
    fast: "var(--weave-duration-fast, 150ms)",
    normal: "var(--weave-duration-normal, 300ms)",
    slow: "var(--weave-duration-slow, 500ms)",
  },
  easing: {
    linear: "linear",
    ease: "ease",
    easeIn: "ease-in",
    easeOut: "ease-out",
    easeInOut: "ease-in-out",
  },
} as const;

export const ZIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
} as const;

export const Breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

export const Components = {
  button: {
    height: {
      sm: "2rem",
      md: "2.5rem",
      lg: "3rem",
    },
    padding: {
      sm: "0.5rem 1rem",
      md: "0.75rem 1.5rem",
      lg: "1rem 2rem",
    },
  },
  input: {
    height: {
      sm: "2rem",
      md: "2.5rem",
      lg: "3rem",
    },
    padding: "0.75rem 1rem",
  },
  modal: {
    maxWidth: {
      sm: "28rem",
      md: "32rem",
      lg: "48rem",
      xl: "64rem",
    },
  },
  card: {
    padding: {
      sm: "1rem",
      md: "1.5rem",
      lg: "2rem",
    },
  },
} as const;

export const Preview = {
  container: {
    background: "var(--weave-surface)",
    borderRadius: "var(--weave-radius-lg)",
    padding: "var(--weave-space-lg)",
    shadow: "var(--weave-shadow-lg)",
    border: "1px solid var(--weave-border)",
  },
  cardTypes: {
    basicQA: {
      accent: "#6366f1",
      background: "rgba(99, 102, 241, 0.1)",
      border: "rgba(99, 102, 241, 0.2)",
    },
    cloze: {
      accent: "#8b5cf6",
      background: "rgba(139, 92, 246, 0.1)",
      border: "rgba(139, 92, 246, 0.2)",
    },
    multipleChoice: {
      accent: "#10b981",
      background: "rgba(16, 185, 129, 0.1)",
      border: "rgba(16, 185, 129, 0.2)",
    },
    extensible: {
      accent: "#f59e0b",
      background: "rgba(245, 158, 11, 0.1)",
      border: "rgba(245, 158, 11, 0.2)",
    },
  },
  animations: {
    contentReveal: {
      duration: "300ms",
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      delay: "0ms",
    },
    typeTransition: {
      duration: "400ms",
      easing: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      delay: "100ms",
    },
    clozeReveal: {
      duration: "250ms",
      easing: "ease-out",
      delay: "50ms",
    },
    optionSelection: {
      duration: "150ms",
      easing: "ease-out",
      delay: "0ms",
    },
  },
  sections: {
    question: {
      background: "var(--weave-surface)",
      borderLeft: "4px solid var(--weave-primary)",
      padding: "var(--weave-space-md)",
    },
    answer: {
      background: "var(--weave-surface-secondary)",
      borderLeft: "4px solid var(--weave-success)",
      padding: "var(--weave-space-md)",
    },
    options: {
      background: "var(--weave-surface)",
      border: "1px solid var(--weave-border)",
      borderRadius: "var(--weave-radius-md)",
      padding: "var(--weave-space-sm)",
    },
    explanation: {
      background: "var(--weave-info-light)",
      borderLeft: "4px solid var(--weave-info)",
      padding: "var(--weave-space-md)",
    },
  },
} as const;

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
  preview: Preview,
} as const;

export const getThemeVariables = (isDark = false) => {
  const baseVariables = {
    "--weave-primary": "#6366f1",
    "--weave-primary-hover": "#5855eb",
    "--weave-primary-active": "#4f46e5",
    "--weave-secondary": "#8b5cf6",
    "--weave-success": "#10b981",
    "--weave-warning": "#f59e0b",
    "--weave-error": "#ef4444",
    "--weave-info": "#3b82f6",
  };

  if (isDark) {
    return {
      ...baseVariables,
      "--weave-bg": "#0f172a",
      "--weave-bg-secondary": "#1e293b",
      "--weave-surface": "#1e293b",
      "--weave-surface-hover": "#334155",
      "--weave-surface-active": "#475569",
      "--weave-border": "#334155",
      "--weave-border-hover": "#475569",
      "--weave-border-active": "#64748b",
      "--weave-divider": "#334155",
      "--weave-text-primary": "#f1f5f9",
      "--weave-text-secondary": "#cbd5e1",
      "--weave-text-muted": "#94a3b8",
      "--weave-text-disabled": "#64748b",
    };
  }

  return {
    ...baseVariables,
    "--weave-bg": "#ffffff",
    "--weave-bg-secondary": "#f8fafc",
    "--weave-surface": "#f8fafc",
    "--weave-surface-hover": "#f1f5f9",
    "--weave-surface-active": "#e2e8f0",
    "--weave-border": "#e2e8f0",
    "--weave-border-hover": "#cbd5e1",
    "--weave-border-active": "#94a3b8",
    "--weave-divider": "#f1f5f9",
    "--weave-text-primary": "#1e293b",
    "--weave-text-secondary": "#64748b",
    "--weave-text-muted": "#94a3b8",
    "--weave-text-disabled": "#cbd5e1",
  };
};

export default DesignTokens;
