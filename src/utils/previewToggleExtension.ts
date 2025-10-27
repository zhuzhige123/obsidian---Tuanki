/**
 * CodeMirror 6 扩展：预览切换快捷键
 * 
 * 这个扩展为 CodeMirror 编辑器添加 Ctrl+E 快捷键支持，
 * 实现 Obsidian 风格的编辑预览模式切换。
 */

import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * 预览切换回调函数类型
 */
export type PreviewToggleCallback = () => void;

/**
 * 预览切换扩展配置
 */
export interface PreviewToggleConfig {
  /** 预览切换回调函数 */
  onTogglePreview: PreviewToggleCallback;
  /** 是否启用快捷键（默认：true） */
  enabled?: boolean;
  /** 自定义快捷键（默认：Ctrl-e） */
  key?: string;
}

/**
 * 创建预览切换扩展
 * 
 * 这个扩展会在 CodeMirror 编辑器中添加 Ctrl+E 快捷键支持，
 * 当用户按下快捷键时，会调用提供的回调函数。
 * 
 * @param config 扩展配置
 * @returns CodeMirror 扩展
 * 
 * @example
 * ```typescript
 * import { previewToggleExtension } from './utils/previewToggleExtension';
 * 
 * const extensions = [
 *   // ... 其他扩展
 *   previewToggleExtension({
 *     onTogglePreview: () => {
 *       // 切换预览模式的逻辑
 *       togglePreviewMode();
 *     }
 *   })
 * ];
 * ```
 */
export function previewToggleExtension(config: PreviewToggleConfig): Extension {
  const { onTogglePreview, enabled = true, key = "Ctrl-e" } = config;

  // 如果禁用，返回空扩展
  if (!enabled) {
    return [];
  }

  return keymap.of([
    {
      key,
      run: () => {
        try {
          onTogglePreview();
          return true; // 表示快捷键已处理
        } catch (error) {
          console.error('Preview toggle failed:', error);
          return false; // 表示快捷键处理失败
        }
      },
      preventDefault: true, // 阻止默认行为
    }
  ]);
}

/**
 * 创建带有多个快捷键的预览切换扩展
 * 
 * 支持同时绑定多个快捷键到同一个预览切换功能
 * 
 * @param config 扩展配置
 * @returns CodeMirror 扩展
 * 
 * @example
 * ```typescript
 * const extensions = [
 *   multiKeyPreviewToggleExtension({
 *     onTogglePreview: togglePreview,
 *     keys: ["Ctrl-e", "Cmd-e", "F5"] // 支持多个快捷键
 *   })
 * ];
 * ```
 */
export function multiKeyPreviewToggleExtension(config: {
  onTogglePreview: PreviewToggleCallback;
  keys: string[];
  enabled?: boolean;
}): Extension {
  const { onTogglePreview, keys, enabled = true } = config;

  if (!enabled || keys.length === 0) {
    return [];
  }

  return keymap.of(
    keys.map(key => ({
      key,
      run: () => {
        try {
          onTogglePreview();
          return true;
        } catch (error) {
          console.error(`Preview toggle failed for key ${key}:`, error);
          return false;
        }
      },
      preventDefault: true,
    }))
  );
}

/**
 * 创建条件预览切换扩展
 * 
 * 只有在满足特定条件时才会响应快捷键
 * 
 * @param config 扩展配置
 * @returns CodeMirror 扩展
 * 
 * @example
 * ```typescript
 * const extensions = [
 *   conditionalPreviewToggleExtension({
 *     onTogglePreview: togglePreview,
 *     condition: () => isMarkdownMode && !isReadOnly,
 *     key: "Ctrl-e"
 *   })
 * ];
 * ```
 */
export function conditionalPreviewToggleExtension(config: {
  onTogglePreview: PreviewToggleCallback;
  condition: () => boolean;
  key?: string;
  enabled?: boolean;
}): Extension {
  const { onTogglePreview, condition, key = "Ctrl-e", enabled = true } = config;

  if (!enabled) {
    return [];
  }

  return keymap.of([
    {
      key,
      run: () => {
        try {
          // 检查条件
          if (!condition()) {
            return false; // 条件不满足，不处理快捷键
          }
          
          onTogglePreview();
          return true;
        } catch (error) {
          console.error('Conditional preview toggle failed:', error);
          return false;
        }
      },
      preventDefault: true,
    }
  ]);
}

/**
 * 预设的 Obsidian 风格预览切换扩展
 * 
 * 使用 Obsidian 的默认快捷键配置
 * 
 * @param onTogglePreview 预览切换回调
 * @returns CodeMirror 扩展
 */
export function obsidianPreviewToggleExtension(
  onTogglePreview: PreviewToggleCallback
): Extension {
  return multiKeyPreviewToggleExtension({
    onTogglePreview,
    keys: ["Ctrl-e", "Cmd-e"], // 支持 Windows/Linux 和 macOS
  });
}

/**
 * 调试用的预览切换扩展
 * 
 * 会在控制台输出调试信息
 * 
 * @param config 扩展配置
 * @returns CodeMirror 扩展
 */
export function debugPreviewToggleExtension(config: {
  onTogglePreview: PreviewToggleCallback;
  key?: string;
  debugLabel?: string;
}): Extension {
  const { onTogglePreview, key = "Ctrl-e", debugLabel = "PreviewToggle" } = config;

  return keymap.of([
    {
      key,
      run: () => {
        console.log(`[${debugLabel}] Preview toggle triggered by ${key}`);
        try {
          onTogglePreview();
          console.log(`[${debugLabel}] Preview toggle successful`);
          return true;
        } catch (error) {
          console.error(`[${debugLabel}] Preview toggle failed:`, error);
          return false;
        }
      },
      preventDefault: true,
    }
  ]);
}

/**
 * 获取当前平台的默认预览切换快捷键
 * 
 * @returns 快捷键字符串
 */
export function getDefaultPreviewToggleKey(): string {
  // 检测平台
  const isMac = typeof navigator !== 'undefined' && 
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  
  return isMac ? "Cmd-e" : "Ctrl-e";
}

/**
 * 创建平台自适应的预览切换扩展
 * 
 * 自动根据当前平台选择合适的快捷键
 * 
 * @param onTogglePreview 预览切换回调
 * @returns CodeMirror 扩展
 */
export function adaptivePreviewToggleExtension(
  onTogglePreview: PreviewToggleCallback
): Extension {
  return previewToggleExtension({
    onTogglePreview,
    key: getDefaultPreviewToggleKey(),
  });
}
