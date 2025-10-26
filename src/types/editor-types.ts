/**
 * 编辑器相关类型定义
 * 用于InlineCardEditor和嵌入式编辑器管理
 */

/**
 * 键盘事件处理器配置选项
 */
export interface KeyboardEventHandlerOptions {
  /** 保存回调函数 */
  onSave: () => void;
  
  /** 取消回调函数 */
  onCancel: () => void;
  
  /** 允许的Obsidian快捷键集合（可选，默认允许所有） */
  allowedObsidianShortcuts?: Set<string>;
  
  /** 自定义快捷键映射（键组合 -> 处理函数，返回false阻止传播） */
  customShortcuts?: Map<string, () => boolean>;
  
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 键盘事件上下文信息
 */
export interface KeyboardEventContext {
  /** 事件是否发生在编辑器内 */
  isInEditor: boolean;
  
  /** 编辑器是否获得焦点 */
  isFocused: boolean;
  
  /** 当前激活的元素 */
  activeElement: HTMLElement | null;
  
  /** 事件目标元素 */
  target: HTMLElement | null;
}

/**
 * 编辑器创建选项
 */
export interface EditorOptions {
  /** 保存回调函数 */
  onSave: (content: string) => void;
  
  /** 取消回调函数 */
  onCancel: () => void;
  
  /** 初始光标位置 */
  initialCursorPosition?: 'start' | 'end';
  
  /** 是否启用键盘快捷键 */
  enableKeyboardShortcuts?: boolean;
  
  /** 是否启用右键菜单 */
  enableContextMenu?: boolean;
  
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 编辑器创建结果
 */
export interface EditorResult {
  /** 是否创建成功 */
  success: boolean;
  
  /** 错误信息（如果失败） */
  error?: string;
  
  /** 清理函数 */
  cleanup: () => void;
  
  /** 获取编辑器内容 */
  getContent: () => string;
  
  /** 设置编辑器内容 */
  setContent: (content: string) => void;
  
  /** 聚焦编辑器 */
  focus: () => void;
}

/**
 * 加载状态类型
 */
export type LoadingState = 
  | 'idle'           // 空闲状态
  | 'creating-file'  // 创建临时文件中
  | 'creating-editor' // 创建编辑器中
  | 'ready'          // 就绪
  | 'error';         // 错误

/**
 * 保存状态类型
 */
export type SaveState = 
  | 'idle'    // 空闲
  | 'saving'  // 保存中
  | 'saved'   // 已保存
  | 'error';  // 保存失败

/**
 * 错误详情
 */
export interface ErrorDetails {
  /** 错误消息 */
  message: string;
  
  /** 是否可恢复（可重试） */
  recoverable: boolean;
  
  /** 错误代码（可选） */
  code?: string;
  
  /** 原始错误对象（可选） */
  originalError?: Error;
}

