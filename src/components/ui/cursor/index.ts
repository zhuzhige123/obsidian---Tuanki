/**
 * Cursor 风格 UI 组件库入口
 * 导出所有基础组件
 */

// 基础组件
export { default as CursorButton } from './CursorButton.svelte';
export { default as CursorInput } from './CursorInput.svelte';
export { default as CursorSelect } from './CursorSelect.svelte';
export { default as CursorTextarea } from './CursorTextarea.svelte';
export { default as CursorCheckbox } from './CursorCheckbox.svelte';
export { default as CursorRadio } from './CursorRadio.svelte';
export { default as CursorSwitch } from './CursorSwitch.svelte';

// 布局组件
export { default as CursorCard } from './CursorCard.svelte';
export { default as CursorModal } from './CursorModal.svelte';
export { default as CursorTabs } from './CursorTabs.svelte';
export { default as CursorAccordion } from './CursorAccordion.svelte';

// 反馈组件
export { default as CursorToast } from './CursorToast.svelte';
export { default as CursorSpinner } from './CursorSpinner.svelte';
export { default as CursorProgress } from './CursorProgress.svelte';

// 数据展示组件
export { default as CursorTable } from './CursorTable.svelte';
export { default as CursorBadge } from './CursorBadge.svelte';
export { default as CursorTag } from './CursorTag.svelte';

// 交互组件
export { default as CursorDropdown } from './CursorDropdown.svelte';
export { default as CursorTooltip } from './CursorTooltip.svelte';
export { default as CursorPopover } from './CursorPopover.svelte';

// 特殊组件
export { default as DragDropList } from './DragDropList.svelte';
export { default as CodeEditor } from './CodeEditor.svelte';

// 类型定义
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type InputSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type ToastType = 'success' | 'error' | 'warning' | 'info';

// 组件属性接口
export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onclick?: () => void;
}

export interface InputProps {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  size?: InputSize;
  error?: string;
  onchange?: (value: string) => void;
  oninput?: (value: string) => void;
}

export interface SelectProps {
  value?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
  disabled?: boolean;
  size?: InputSize;
  error?: string;
  onchange?: (value: string) => void;
}

export interface ModalProps {
  open?: boolean;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closable?: boolean;
  onClose?: () => void;
}

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
  badge?: string | number;
}

export interface TabsProps {
  items: TabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export interface ToastProps {
  type?: ToastType;
  title?: string;
  message: string;
  duration?: number;
  closable?: boolean;
  onClose?: () => void;
}

export interface TableColumn {
  key: string;
  title: string;
  width?: string;
  sortable?: boolean;
  render?: (value: any, row: any) => string;
}

export interface TableProps {
  columns: TableColumn[];
  data: any[];
  loading?: boolean;
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
}

export interface DragDropItem {
  id: string;
  [key: string]: any;
}

export interface DragDropListProps {
  items: DragDropItem[];
  onReorder?: (items: DragDropItem[]) => void;
  onItemClick?: (item: DragDropItem) => void;
  renderItem?: (item: DragDropItem) => string;
}

// 工具函数
export const createToast = (props: ToastProps) => {
  // 创建 Toast 实例的工具函数
  // 实际实现会在组件中完成
};

export const showModal = (component: any, props: any = {}) => {
  // 显示模态框的工具函数
  // 实际实现会在组件中完成
};

// 主题相关
export interface ThemeConfig {
  primaryColor?: string;
  borderRadius?: string;
  fontSize?: string;
  fontFamily?: string;
}

export const applyTheme = (config: ThemeConfig) => {
  // 应用主题配置
  const root = document.documentElement;
  
  if (config.primaryColor) {
    root.style.setProperty('--tuanki-primary', config.primaryColor);
  }
  
  if (config.borderRadius) {
    root.style.setProperty('--tuanki-radius-md', config.borderRadius);
  }
  
  if (config.fontSize) {
    root.style.setProperty('--tuanki-text-base', config.fontSize);
  }
  
  if (config.fontFamily) {
    root.style.setProperty('--tuanki-font-sans', config.fontFamily);
  }
};

// 响应式工具
export const useBreakpoint = () => {
  // 响应式断点检测 hook
  // 实际实现会使用 Svelte 的响应式特性
};

// 动画工具
export const fadeIn = (node: Element, { duration = 300 } = {}) => {
  return {
    duration,
    css: (t: number) => `opacity: ${t}`
  };
};

export const slideIn = (node: Element, { duration = 300 } = {}) => {
  return {
    duration,
    css: (t: number) => `
      transform: translateY(${(1 - t) * 20}px);
      opacity: ${t};
    `
  };
};

export const scale = (node: Element, { duration = 300 } = {}) => {
  return {
    duration,
    css: (t: number) => `
      transform: scale(${0.9 + t * 0.1});
      opacity: ${t};
    `
  };
};
