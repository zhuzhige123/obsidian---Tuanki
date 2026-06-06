/**
 * 全局编辑器上下文管理器
 *
 * 职责：
 * 1. 跟踪当前活动的插件编辑器
 * 2. 为全局快捷键提供编辑器实例访问
 * 3. 支持标准的 Obsidian Editor API
 */

import type { Editor } from "obsidian";
import {
	asEditorView,
	createEditorFacadeFromView,
} from "../../utils/obsidian-markdown-editor";
import { logger } from "../../utils/logger";
import type { DetachedLeafEditor } from "./DetachedLeafEditor";

class EditorContextManager {
	private static instance: EditorContextManager | null = null;
	private activePluginEditor: DetachedLeafEditor | null = null;

	private constructor() {
		logger.debug("[EditorContextManager] 初始化");
	}

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

	registerActive(editor: DetachedLeafEditor): void {
		logger.debug("[EditorContextManager] 注册活动编辑器");
		this.activePluginEditor = editor;
	}

	unregisterActive(editor: DetachedLeafEditor): void {
		if (this.activePluginEditor === editor) {
			logger.debug("[EditorContextManager] 取消注册活动编辑器");
			this.activePluginEditor = null;
		}
	}

	getActivePluginEditor(): DetachedLeafEditor | null {
		return this.activePluginEditor;
	}

	hasActivePluginEditor(): boolean {
		return this.activePluginEditor !== null;
	}

	getCompatibleEditor(): Editor | null {
		if (!this.activePluginEditor) {
			return null;
		}

		if ("getEditor" in this.activePluginEditor) {
			const editor = this.activePluginEditor.getEditor();
			if (editor) return editor;
		}

		const cm = asEditorView(this.activePluginEditor.getCM());
		if (!cm) {
			logger.warn("[EditorContextManager] CodeMirror 实例不存在");
			return null;
		}

		return createEditorFacadeFromView(cm);
	}
}

export default EditorContextManager;
