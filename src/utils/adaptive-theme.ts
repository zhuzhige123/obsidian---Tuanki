/**
 * 自适应主题系统
 * 为记忆分析界面提供完整的主题适配支持
 */

import { untrack } from 'svelte';
import { isDarkMode, createThemeListener } from './theme-detection';

// 重新导出 isDarkMode 函数以解决导入问题
export { isDarkMode } from './theme-detection';

export interface ThemeColors {
  // 基础颜色
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  
  // 状态颜色
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // 图表颜色
  chartGrid: string;
  chartAxis: string;
  chartFsrsLine: string;
  chartActualLine: string;
  chartGapFill: string;
  chartPointBg: string;
  chartTooltipBg: string;
  chartTooltipBorder: string;
}

/**
 * 获取当前主题的颜色配置
 */
export function getThemeColors(): ThemeColors {
  const isDark = isDarkMode();
  
  if (isDark) {
    return {
      background: 'var(--memory-analysis-bg)',
      surface: 'var(--memory-analysis-surface)',
      border: 'var(--memory-analysis-border)',
      textPrimary: 'var(--memory-analysis-text-primary)',
      textSecondary: 'var(--memory-analysis-text-secondary)',
      textMuted: 'var(--memory-analysis-text-muted)',
      accent: 'var(--memory-analysis-accent)',
      success: 'var(--memory-analysis-success)',
      warning: 'var(--memory-analysis-warning)',
      error: 'var(--memory-analysis-error)',
      info: 'var(--memory-analysis-info)',
      chartGrid: 'var(--chart-grid)',
      chartAxis: 'var(--chart-axis)',
      chartFsrsLine: 'var(--chart-fsrs-line)',
      chartActualLine: 'var(--chart-actual-line)',
      chartGapFill: 'var(--chart-gap-fill)',
      chartPointBg: 'var(--chart-point-bg)',
      chartTooltipBg: 'var(--chart-tooltip-bg)',
      chartTooltipBorder: 'var(--chart-tooltip-border)'
    };
  } else {
    return {
      background: 'var(--memory-analysis-bg)',
      surface: 'var(--memory-analysis-surface)',
      border: 'var(--memory-analysis-border)',
      textPrimary: 'var(--memory-analysis-text-primary)',
      textSecondary: 'var(--memory-analysis-text-secondary)',
      textMuted: 'var(--memory-analysis-text-muted)',
      accent: 'var(--memory-analysis-accent)',
      success: 'var(--memory-analysis-success)',
      warning: 'var(--memory-analysis-warning)',
      error: 'var(--memory-analysis-error)',
      info: 'var(--memory-analysis-info)',
      chartGrid: 'var(--chart-grid)',
      chartAxis: 'var(--chart-axis)',
      chartFsrsLine: 'var(--chart-fsrs-line)',
      chartActualLine: 'var(--chart-actual-line)',
      chartGapFill: 'var(--chart-gap-fill)',
      chartPointBg: 'var(--chart-point-bg)',
      chartTooltipBg: 'var(--chart-tooltip-bg)',
      chartTooltipBorder: 'var(--chart-tooltip-border)'
    };
  }
}

/**
 * 计算对比度比例
 */
export function getContrastRatio(color1: string, color2: string): number {
  // 简化的对比度计算，实际应用中可以使用更精确的算法
  const getLuminance = (color: string): number => {
    // 这里应该实现真正的亮度计算
    // 暂时返回一个模拟值
    return color.includes('255') ? 1 : 0.1;
  };
  
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * 获取自适应的文本颜色
 */
export function getAdaptiveTextColor(backgroundColor: string): string {
  const isDark = isDarkMode();
  const colors = getThemeColors();
  
  // 根据背景色和主题模式返回最佳对比度的文本颜色
  if (backgroundColor === colors.surface) {
    return colors.textPrimary;
  } else if (backgroundColor === colors.accent) {
    return isDark ? '#ffffff' : '#ffffff';
  } else {
    return colors.textPrimary;
  }
}

/**
 * 获取自适应的边框颜色
 */
export function getAdaptiveBorderColor(intensity: 'light' | 'medium' | 'strong' = 'medium'): string {
  const isDark = isDarkMode();
  const baseOpacity = isDark ? 0.12 : 0.08;
  
  const opacityMap = {
    light: baseOpacity * 0.5,
    medium: baseOpacity,
    strong: baseOpacity * 2
  };
  
  const color = isDark ? '255, 255, 255' : '0, 0, 0';
  return `rgba(${color}, ${opacityMap[intensity]})`;
}

/**
 * 获取自适应的阴影
 */
export function getAdaptiveShadow(size: 'sm' | 'md' | 'lg' | 'xl' = 'md'): string {
  const isDark = isDarkMode();
  
  const shadows = {
    sm: isDark 
      ? '0 1px 2px 0 rgba(0, 0, 0, 0.3)' 
      : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: isDark 
      ? '0 4px 6px -1px rgba(0, 0, 0, 0.4)' 
      : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: isDark 
      ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)' 
      : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: isDark 
      ? '0 20px 25px -5px rgba(0, 0, 0, 0.6)' 
      : '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
  };
  
  return shadows[size];
}

/**
 * 创建响应式主题状态
 */
export function createAdaptiveTheme() {
  // 使用普通对象而不是 $state，因为这不在组件上下文中
  let currentTheme = {
    isDark: isDarkMode(),
    colors: getThemeColors()
  };

  // 监听主题变化
  const cleanup = createThemeListener((isDark) => {
    currentTheme.isDark = isDark;
    currentTheme.colors = getThemeColors();
  });

  return {
    get theme() {
      return currentTheme;
    },
    cleanup
  };
}

/**
 * 为元素应用自适应主题类
 */
export function applyAdaptiveTheme(element: HTMLElement): void {
  const isDark = isDarkMode();

  // 移除旧的主题类
  element.classList.remove('theme-dark', 'theme-light', 'tuanki-adaptive-theme-dark', 'tuanki-adaptive-theme-light');

  // 添加新的主题类
  if (isDark) {
    element.classList.add('theme-dark', 'tuanki-adaptive-theme-dark');
  } else {
    element.classList.add('theme-light', 'tuanki-adaptive-theme-light');
  }
}

/**
 * 获取图表的自适应配置
 */
export function getChartThemeConfig() {
  const colors = getThemeColors();
  const isDark = isDarkMode();
  
  return {
    backgroundColor: colors.background,
    textStyle: {
      color: colors.textPrimary,
      fontFamily: 'var(--font-interface, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)'
    },
    grid: {
      borderColor: colors.chartGrid,
      backgroundColor: 'transparent'
    },
    axis: {
      axisLine: { lineStyle: { color: colors.chartAxis } },
      axisTick: { lineStyle: { color: colors.chartAxis } },
      axisLabel: { color: colors.textSecondary },
      splitLine: { lineStyle: { color: colors.chartGrid } }
    },
    series: {
      fsrsLine: {
        color: colors.chartFsrsLine,
        lineStyle: { width: 3, type: 'dashed' }
      },
      actualLine: {
        color: colors.chartActualLine,
        lineStyle: { width: 4 }
      },
      gapArea: {
        color: colors.chartGapFill
      }
    },
    tooltip: {
      backgroundColor: colors.chartTooltipBg,
      borderColor: colors.chartTooltipBorder,
      textStyle: { color: colors.textPrimary }
    }
  };
}
