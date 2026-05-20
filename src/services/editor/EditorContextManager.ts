/**
 * 全局编辑器上下文管理器
 *
 * 职责：
 * 1. 跟踪当前活动的插件编辑器
 * 2. 为全局快捷键提供编辑器实例访问
 * 3. 支持标准的 Obsidian Editor API
 *
 * 设计理念：
 * - 单例模式确保全局唯一
 * - 提供兼容的 Editor API，使全局快捷键无需修改即可支持插件编辑器
 * - 基于焦点事件自动追踪活动编辑器
 */

import type { Editor } from "obsidian";
import { logger } from "../../utils/logger";
import type { DetachedLeafEditor } from "./DetachedLeafEditor";

/**
 * 编辑器上下文管理器（单例）
 */
class EditorContextManager {
	private static instance: EditorContextManager | null = null;
	private activePluginEditor: DetachedLeafEditor | null = null;

	private constructor() {
		logger.debug("[EditorContextManager] 初始化");
	}

	/**
	 * 获取单例实例
	 */
	static getInstance(): EditorContextManager {
		if (!this.instance) {
			this.instance = new EditorContextManager();
		}
		return this.instance;
	}

	static resetInstance(): void {
		if (!this.instance) {
			return;
		}

		this.instance.activePluginEditor = null;
		this.instance = null;
	}

	/**
	 * 注册活动编辑器
	 * 当插件编辑器获得焦点时调用
	 */
	registerActive(editor: DetachedLeafEditor): void {
		logger.debug("[EditorContextManager] 注册活动编辑器");
		this.activePluginEditor = editor;
	}

	/**
	 * 取消注册
	 * 当插件编辑器失焦或销毁时调用
	 */
	unregisterActive(editor: DetachedLeafEditor): void {
		if (this.activePluginEditor === editor) {
			logger.debug("[EditorContextManager] 取消注册活动编辑器");
			this.activePluginEditor = null;
		}
	}

	/**
	 * 获取活动的插件编辑器
	 */
	getActivePluginEditor(): DetachedLeafEditor | null {
		return this.activePluginEditor;
	}

	/**
	 * 检查是否有活动的插件编辑器
	 */
	hasActivePluginEditor(): boolean {
		return this.activePluginEditor !== null;
	}

	/**
	 * 获取兼容的 Editor API（用于全局快捷键）
	 *
	 * 返回一个兼容 Obsidian Editor 的对象，支持：
	 * - getSelection(): 获取选中文本
	 * - replaceSelection(): 替换选中文本
	 * - getValue(): 获取全部内容
	 * - setValue(): 设置全部内容
	 *
	 * @returns 兼容的 Editor 对象，如果没有活动编辑器则返回 null
	 */
	getCompatibleEditor(): Editor | null {
		if (!this.activePluginEditor) {
			return null;
		}

		// 优先使用 getEditor() 获取原生 Editor 对象 (DetachedLeafEditor 支持)
		if ("getEditor" in this.activePluginEditor) {
			const editor = this.activePluginEditor.getEditor();
			if (editor) return editor;
		}

		const cm = this.activePluginEditor.getCM();
		if (!cm) {
			logger.warn("[EditorContextManager] CodeMirror 实例不存在");
			return null;
		}

		// 创建兼容的 Editor API (Legacy EmbeddableMarkdownEditor)
		return {
			/**
			 * 获取选中文本
			 */
			getSelection: () => {
				try {
					const state = cm.state;
					const selection = state.selection.main;
					return state.sliceDoc(selection.from, selection.to);
				} catch (error) {
					logger.error("[EditorContextManager] getSelection 失败:", error);
					return "";
				}
			},

			/**
			 * 替换选中文本
			 */
			replaceSelection: (replacement: string) => {
				try {
					const state = cm.state;
					const selection = state.selection.main;
					cm.dispatch({
						changes: {
							from: selection.from,
							to: selection.to,
							insert: replacement,
						},
						selection: { anchor: selection.from + replacement.length },
					});
				} catch (error) {
					logger.error("[EditorContextManager] replaceSelection 失败:", error);
				}
			},

			/**
			 * 获取编辑器全部内容
			 */
			getValue: () => {
				try {
					return cm.state.doc.toString();
				} catch (error) {
					logger.error("[EditorContextManager] getValue 失败:", error);
					return "";
				}
			},

			/**
			 * 设置编辑器全部内容
			 */
			setValue: (content: string) => {
				try {
					cm.dispatch({
						changes: {
							from: 0,
							to: cm.state.doc.length,
							insert: content,
						},
					});
				} catch (error) {
					logger.error("[EditorContextManager] setValue 失败:", error);
				}
			},
		} as any;
	}
}

export default EditorContextManager;
