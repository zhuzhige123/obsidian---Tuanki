/**
 * 编辑器快捷键工具
 * 
 * 提供统一的编辑器快捷键管理功能
 */

import type { Extension } from "@codemirror/state";
import { obsidianPreviewToggleExtension, type PreviewToggleCallback } from "./previewToggleExtension";

/**
 * 编辑器快捷键配置
 */
export interface EditorShortcutsConfig {
  /** 预览切换回调 */
  onTogglePreview?: PreviewToggleCallback;
  /** 是否启用预览切换快捷键 */
  enablePreviewToggle?: boolean;
  /** 其他自定义快捷键 */
  customShortcuts?: Extension[];
}

/**
 * 创建编辑器快捷键扩展
 * 
 * 这个函数会根据配置创建所有需要的快捷键扩展
 * 
 * @param config 快捷键配置
 * @returns CodeMirror 扩展数组
 */
export function createEditorShortcuts(config: EditorShortcutsConfig = {}): Extension[] {
  const {
    onTogglePreview,
    enablePreviewToggle = true,
    customShortcuts = []
  } = config;

  const extensions: Extension[] = [];

  // 添加预览切换快捷键
  if (enablePreviewToggle && onTogglePreview) {
    extensions.push(obsidianPreviewToggleExtension(onTogglePreview));
  }

  // 添加自定义快捷键
  extensions.push(...customShortcuts);

  return extensions;
}

/**
 * 为 Markdown 编辑器创建快捷键
 * 
 * 专门为 Markdown 编辑器优化的快捷键配置
 * 
 * @param onTogglePreview 预览切换回调
 * @returns CodeMirror 扩展数组
 */
export function createMarkdownEditorShortcuts(
  onTogglePreview: PreviewToggleCallback
): Extension[] {
  return createEditorShortcuts({
    onTogglePreview,
    enablePreviewToggle: true,
  });
}

/**
 * 为普通编辑器创建快捷键
 * 
 * 不包含预览相关的快捷键
 * 
 * @param customShortcuts 自定义快捷键
 * @returns CodeMirror 扩展数组
 */
export function createBasicEditorShortcuts(
  customShortcuts: Extension[] = []
): Extension[] {
  return createEditorShortcuts({
    enablePreviewToggle: false,
    customShortcuts,
  });
}

/**
 * 检查是否支持预览切换
 * 
 * @param editorType 编辑器类型
 * @returns 是否支持预览切换
 */
export function supportsPreviewToggle(editorType: 'markdown' | 'basic' | 'fields'): boolean {
  return editorType === 'markdown';
}

/**
 * 获取快捷键帮助信息
 * 
 * @param editorType 编辑器类型
 * @returns 快捷键帮助信息
 */
export function getShortcutHelp(editorType: 'markdown' | 'basic' | 'fields'): string[] {
  const help: string[] = [];

  if (supportsPreviewToggle(editorType)) {
    help.push('Ctrl+E (Cmd+E on Mac): 切换编辑/预览模式');
  }

  return help;
}

/**
 * 快捷键常量
 */
export const SHORTCUTS = {
  PREVIEW_TOGGLE: {
    WINDOWS: 'Ctrl+E',
    MAC: 'Cmd+E',
    DESCRIPTION: '切换编辑/预览模式'
  }
} as const;
