import {
	App,
	Component,
	MarkdownView,
	Platform,
	Scope,
	TFile,
	WorkspaceLeaf,
	type WorkspaceSplit,
} from "obsidian";
import { isCallable, readUnknownProperty } from "../../utils/dynamic-access";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import {
	getEditorCodeMirrorView,
	getLeafContainerEl,
} from "../../utils/obsidian-markdown-editor";
import EditorContextManager from "./EditorContextManager";
import {
	buildDetachedEditorTempFilePath,
	isDetachedEditorTempFilePath,
	resolveDetachedEditorTempFolder,
} from "./editor-temp-file-policy";
import { applyStyleProps } from "../../utils/style-props";
import { shouldHideDocumentPropertiesForVault } from "./document-properties-visibility";

export interface DetachedEditorOptions {
	value?: string;
	placeholder?: string;
	sourcePath?: string;
	sessionId?: string;
	/** 为 true 时强制隐藏笔记属性区；默认跟随 Obsidian「笔记内属性」设置 */
	hideDocumentProperties?: boolean;
	onSubmit?: (editor: DetachedLeafEditor) => void;
	onEscape?: (editor: DetachedLeafEditor) => void;
	onChange?: (editor: DetachedLeafEditor) => void;
	onBlur?: (editor: DetachedLeafEditor) => void;
}

/**
 * DetachedLeafEditor
 * 使用真正的 WorkspaceLeaf 实现嵌入式编辑器，确保 100% 的 Obsidian 原生体验（Live Preview、插件支持等）
 */
export class DetachedLeafEditor extends Component {
	private app: App;
	private containerEl: HTMLElement;
	private options: DetachedEditorOptions;
	private leaf: WorkspaceLeaf | null = null;
	private tempFile: TFile | null = null;
	private scope: Scope;
	private editorView: MarkdownView | null = null;
	private readyPromise: Promise<void>;
	private readyResolve: (() => void) | null = null;
	private destroyed = false;
	private focusInHandler: ((ev: FocusEvent) => void) | null = null;
	private focusOutHandler: ((ev: FocusEvent) => void) | null = null;
	private pointerDownCaptureHandler: ((ev: Event) => void) | null = null;
	private contentChromeObserver: MutationObserver | null = null;
	private viewScopePushed = false;
	private prevActiveLeaf: WorkspaceLeaf | null = null;
	private keydownCaptureHandler: ((ev: KeyboardEvent) => void) | null = null;

	// 原始父节点，用于恢复 DOM（虽然通常我们销毁时直接删除）
	private originalParent: HTMLElement | null = null;
	private originalNextSibling: Node | null = null;

	constructor(app: App, container: HTMLElement, options: DetachedEditorOptions = {}) {
		super();
		this.app = app;
		this.containerEl = container;
		this.options = options;
		this.scope = new Scope(this.app.scope);

		this.readyPromise = new Promise<void>((resolve) => {
			this.readyResolve = resolve;
		});
	}

	whenReady(): Promise<void> {
		return this.readyPromise;
	}

	private getWorkspaceActiveLeaf(): WorkspaceLeaf | null {
		try {
			const ws = this.app.workspace;
			const getActiveLeaf = readUnknownProperty(ws, "getActiveLeaf");
			if (isCallable(getActiveLeaf)) {
				const leaf = Reflect.apply(getActiveLeaf, ws, []);
				return (leaf as WorkspaceLeaf) || null;
			}
			const getMostRecentLeaf = readUnknownProperty(ws, "getMostRecentLeaf");
			if (isCallable(getMostRecentLeaf)) {
				const leaf = Reflect.apply(getMostRecentLeaf, ws, []);
				return (leaf as WorkspaceLeaf) || null;
			}
			return null;
		} catch {
			return null;
		}
	}

	private setWorkspaceActiveLeaf(leaf: WorkspaceLeaf | null, focus: boolean): void {
		if (!leaf) return;
		try {
			const ws = this.app.workspace;
			const setActiveLeaf = readUnknownProperty(ws, "setActiveLeaf");
			if (!isCallable(setActiveLeaf)) {
				return;
			}

			try {
				const current = this.getWorkspaceActiveLeaf();
				if (current === leaf) return;
			} catch { /* no-op */ }

			try {
				Reflect.apply(setActiveLeaf, ws, [leaf, { focus }]);
			} catch {
				Reflect.apply(setActiveLeaf, ws, [leaf, focus]);
			}
		} catch { /* no-op */ }
	}

	private pushViewScope(): void {
		if (this.viewScopePushed) return;
		const scope = readUnknownProperty(this.editorView, "scope") as Scope | undefined;
		const keymap = readUnknownProperty(this.app, "keymap");
		const pushScope = readUnknownProperty(keymap, "pushScope");
		if (!scope || !isCallable(pushScope)) return;

		try {
			Reflect.apply(pushScope, keymap, [scope]);
			this.viewScopePushed = true;
		} catch { /* no-op */ }
	}

	private popViewScope(): void {
		if (!this.viewScopePushed) return;
		const scope = readUnknownProperty(this.editorView, "scope") as Scope | undefined;
		const keymap = readUnknownProperty(this.app, "keymap");
		const popScope = readUnknownProperty(keymap, "popScope");
		if (!scope || !isCallable(popScope)) {
			this.viewScopePushed = false;
			return;
		}

		try {
			Reflect.apply(popScope, keymap, [scope]);
		} catch { /* no-op */ }
		this.viewScopePushed = false;
	}

	onload(): void {
		void this.initialize();
	}

	private async waitForWorkspaceLayoutReady(): Promise<void> {
		try {
			await new Promise<void>((resolve) => {
				try {
					this.app.workspace.onLayoutReady(() => resolve());
				} catch {
					resolve();
				}
			});
		} catch { /* no-op */ }
	}

	private async initialize() {
		try {
			logger.debug("[DetachedLeafEditor] 开始初始化...");

			const activeLeafBeforeInit = this.getWorkspaceActiveLeaf();

			await this.waitForWorkspaceLayoutReady();

			// 1. 准备临时文件
			await this.prepareTempFile();

			if (!this.tempFile) {
				throw new Error("无法创建临时文件");
			}

			// 2. 创建 detached leaf
			this.createLeaf();

			if (!this.leaf) {
				throw new Error("无法创建 WorkspaceLeaf");
			}

			if (
				Platform.isMobile &&
				activeLeafBeforeInit &&
				this.leaf &&
				activeLeafBeforeInit !== this.leaf
			) {
				try {
					this.setWorkspaceActiveLeaf(activeLeafBeforeInit, false);
				} catch { /* no-op */ }
			}

			// 3. 打开文件
			await this.openFileInLeaf();

			// 4. 劫持 DOM 并注入到容器
			await this.hijackDOM();

			// 5. 初始化设置（Live Preview, 快捷键等）
			this.setupEditor();

			if (
				Platform.isMobile &&
				activeLeafBeforeInit &&
				this.leaf &&
				activeLeafBeforeInit !== this.leaf
			) {
				try {
					this.setWorkspaceActiveLeaf(activeLeafBeforeInit, false);
				} catch { /* no-op */ }
			}

			logger.debug("[DetachedLeafEditor] 初始化完成");
		} catch (error) {
			logger.error("[DetachedLeafEditor] 初始化失败:", error);
			// 显示错误信息
			this.containerEl.createDiv({ text: "编辑器初始化失败", cls: "error-message" });
		} finally {
			if (this.readyResolve) {
				try {
					this.readyResolve();
				} catch { /* no-op */ }
				this.readyResolve = null;
			}
		}
	}

	private async prepareTempFile() {
		const sessionId = this.options.sessionId || Date.now().toString();
		const folderPath = resolveDetachedEditorTempFolder(this.app, this.options.sourcePath);
		const preferredPath = buildDetachedEditorTempFilePath(
			folderPath,
			`weave-editor-${sessionId}.md`
		);
		const fallbackPath = buildDetachedEditorTempFilePath(
			folderPath,
			`weave-editor-${Date.now()}.md`
		);
		const candidatePaths =
			preferredPath === fallbackPath ? [preferredPath] : [preferredPath, fallbackPath];

		if (folderPath) {
			await DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, folderPath);
		}

		let lastError: unknown = null;
		for (const filePath of candidatePaths) {
			logger.debug("[DetachedLeafEditor] 临时文件路径:", filePath);

			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					await this.app.vault.modify(file, this.options.value || "");
					this.tempFile = file;
					return;
				}

				this.tempFile = await this.app.vault.create(filePath, this.options.value || "");
				return;
			} catch (error) {
				lastError = error;
				logger.warn("[DetachedLeafEditor] 创建临时文件失败，尝试备用路径:", filePath, error);
			}
		}

		logger.error("[DetachedLeafEditor] 创建临时文件失败:", lastError);
		throw lastError instanceof Error
			? lastError
			: new Error("无法创建 DetachedLeafEditor 临时文件");
	}

	private readWorkspaceSplit(key: string): WorkspaceSplit | undefined {
		const split = readUnknownProperty(this.app.workspace, key);
		if (!split || !isCallable(readUnknownProperty(split, "setDimension"))) {
			return undefined;
		}
		return split as WorkspaceSplit;
	}

	private createLeaf() {
		// 使用 createLeafInParent 创建一个位于 rootSplit 的 leaf
		// 这允许我们创建一个"真正的"编辑器实例，但将其隐藏
		const candidates = Platform.isMobile
			? [
					this.readWorkspaceSplit("rightSplit"),
					this.readWorkspaceSplit("leftSplit"),
					this.readWorkspaceSplit("rootSplit"),
				]
			: [this.readWorkspaceSplit("rootSplit")];

		const parentSplit = candidates.find((split) => split !== undefined) ?? this.readWorkspaceSplit("rootSplit");
		const rootSplit = this.readWorkspaceSplit("rootSplit");

		try {
			if (!parentSplit) {
				throw new Error("No workspace split available");
			}
			this.leaf = this.app.workspace.createLeafInParent(parentSplit, 0);
		} catch (e) {
			logger.warn("[DetachedLeafEditor] createLeafInParent 失败，回退到 rootSplit:", e);
			try {
				if (rootSplit) {
					this.leaf = this.app.workspace.createLeafInParent(rootSplit, 0);
				} else {
					this.leaf = null;
				}
			} catch {
				this.leaf = null;
			}
		}

		// 立即隐藏，防止闪烁
		const leafEl = getLeafContainerEl(this.leaf);
		if (leafEl) {
			leafEl.dataset.weaveDetachedLeafEditor = "true";
			this.originalParent = leafEl.parentElement;
			this.originalNextSibling = leafEl.nextSibling;

			// 关键：不要使用 display:none，否则 Obsidian 无法正确路由快捷键到 activeLeaf
			// 改为移动到屏幕外，但保持在 DOM 中（参考 ModalEditorManager 的方案）
			applyStyleProps(leafEl, {
				position: "absolute",
				left: "-9999px",
				top: "-9999px",
				width: "1px",
				height: "1px",
				overflow: "hidden",
				"pointer-events": "none",
				display: "block",
				visibility: "visible",
			});
		}
	}

	private async openFileInLeaf() {
		if (!this.leaf || !this.tempFile) return;

		// active: false 防止获得焦点并滚动 workspace
		await this.leaf.openFile(this.tempFile, { active: false });

		// 获取 View 实例
		const view = this.leaf.view;
		if (view instanceof MarkdownView) {
			this.editorView = view;
		} else {
			logger.error("[DetachedLeafEditor] Leaf 打开的不是 MarkdownView");
		}
	}

	private async hijackDOM() {
		if (!this.leaf || !this.editorView) return;

		// 等待编辑器渲染
		await this.waitForEditorReady();

		const view = this.editorView;
		const contentEl = view.contentEl; // 这是包含编辑器的主要元素
		(contentEl).dataset.weaveDetachedLeafEditor = "true";

		try {
			contentEl.querySelectorAll(".weave-ir-markdown-bottom-toolbar-container").forEach((el) => {
				try {
					(el as HTMLElement).remove();
				} catch { /* no-op */ }
			});
		} catch { /* no-op */ }

		// 清空容器
		this.containerEl.empty();

		// 移动 DOM
		this.containerEl.appendChild(contentEl);

		// 调整样式以适应嵌入
		applyStyleProps(contentEl, {
			display: "flex",
			flexDirection: "column",
			position: "relative",
			width: "100%",
			flex: "1",
			minHeight: "0",
			padding: "0",
			margin: "0",
		});

		const removeElNoSpace = (el: HTMLElement | null) => {
			if (!el) return;
			try {
				el.remove();
			} catch {
				try {
					applyStyleProps(el, {
						display: "none",
						height: "0",
						"min-height": "0",
						"max-height": "0",
						margin: "0",
						padding: "0",
						border: "0",
					});
				} catch { /* no-op */ }
			}
		};

		const toggleHideNoSpace = (el: HTMLElement | null, hide: boolean) => {
			if (!el) return;
			try {
				if (hide) {
					applyStyleProps(el, {
						display: "none",
						height: "0",
						"min-height": "0",
						"max-height": "0",
						margin: "0",
						padding: "0",
						border: "0",
					});
				} else {
					applyStyleProps(el, {
						display: "",
						height: "",
						"min-height": "",
						"max-height": "",
						margin: "",
						padding: "",
						border: "",
					});
				}
			} catch { /* no-op */ }
		};

		const applyHideChrome = () => {
			try {
				const headerSelectors = [
					".view-header",
					".view-header-title-container",
					".view-header-title-wrapper",
					".view-header-nav-buttons",
					".view-actions",
					".view-action",
				];

				for (const selector of headerSelectors) {
					const nodes = contentEl.querySelectorAll(selector);
					nodes.forEach((n) => removeElNoSpace(n as HTMLElement));
				}

				const inlineTitleSelectors = [
					".inline-title-wrapper",
					".inline-title",
					".mod-header",
					".markdown-source-view .mod-header",
				];

				for (const selector of inlineTitleSelectors) {
					const nodes = contentEl.querySelectorAll(selector);
					nodes.forEach((n) => removeElNoSpace(n as HTMLElement));
				}

				const hideProps =
					this.options.hideDocumentProperties === true
					|| shouldHideDocumentPropertiesForVault(this.app.vault);
				const propsSelectors = [
					".metadata-container",
					".metadata-properties",
					".metadata-container-inner",
					".metadata-properties-heading",
					".metadata-add-property",
					".metadata-properties-title",
					".metadata-property",
					".markdown-source-view .metadata-container",
					".markdown-source-view .metadata-properties",
				];

				for (const selector of propsSelectors) {
					const nodes = contentEl.querySelectorAll(selector);
					nodes.forEach((n) => {
						if (hideProps) {
							removeElNoSpace(n as HTMLElement);
						} else {
							toggleHideNoSpace(n as HTMLElement, false);
						}
					});
				}
			} catch { /* no-op */ }
		};

		applyHideChrome();

		try {
			if (this.contentChromeObserver) {
				this.contentChromeObserver.disconnect();
			}
			this.contentChromeObserver = new MutationObserver(() => {
				applyHideChrome();
			});
			this.contentChromeObserver.observe(contentEl, {
				childList: true,
				subtree: true,
				attributes: true,
			});
		} catch { /* no-op */ }

		// 隐藏 header 等不需要的元素（如果有）
		// 通常 MarkdownView 的 contentEl 只包含编辑器内容，header 在 view.containerEl 中
		// 但我们需要确保 view.containerEl 的其他部分不干扰

		// 强制刷新布局
		if (view.editor) {
			view.editor.refresh();
		}
	}

	private async waitForEditorReady(timeout = 2000) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			if (this.editorView?.editor) {
				return;
			}
			await new Promise((resolve) => window.setTimeout(resolve, 50));
		}
		logger.warn("[DetachedLeafEditor] 等待编辑器就绪超时");
	}

	private syncWithPreferredEditorMode(): void {
		if (!this.editorView) return;

		const getConfig = readUnknownProperty(this.app.vault, "getConfig");
		const globalLivePreview = isCallable(getConfig)
			? Reflect.apply(getConfig, this.app.vault, ["livePreview"])
			: undefined;
		if (!globalLivePreview) return;

		try {
			const getMode = readUnknownProperty(this.editorView, "getMode");
			if (!isCallable(getMode) || Reflect.apply(getMode, this.editorView, []) !== "source") {
				return;
			}

			// Obsidian 公开 API 只能区分 preview/source，无法直接区分
			// source 模式下的 Live Preview 与纯源码模式，这里仅在内部状态明确表示
			// 当前是纯源码模式时，才谨慎地切回 Live Preview。
			const currentMode = readUnknownProperty(this.editorView, "currentMode");
			const modeType = readUnknownProperty(currentMode, "type");
			const sourceMode = readUnknownProperty(currentMode, "sourceMode");
			if (modeType !== "source" || sourceMode !== true) {
				return;
			}

			const toggleSource = readUnknownProperty(currentMode, "toggleSource");
			if (!isCallable(toggleSource)) {
				logger.debug("[DetachedLeafEditor] 当前版本未暴露 toggleSource，跳过 Live Preview 同步");
				return;
			}

			Reflect.apply(toggleSource, currentMode, []);
			this.editorView.editor?.refresh?.();
		} catch (error) {
			logger.warn("[DetachedLeafEditor] Live Preview 同步失败，保留当前编辑模式:", error);
		}
	}

	private setupEditor() {
		if (!this.editorView) return;

		// 1. 尽量跟随用户的全局 Live Preview 偏好，但仅在明确需要时切换。
		this.syncWithPreferredEditorMode();

		// 2. 注册事件
		this.registerDomEvents();

		// 3. 注册快捷键
		this.registerHotkeys();
	}

	private activateLeafForHotkeys(): void {
		if (!this.leaf) return;

		// 允许移动端激活 Leaf，以便显示原生工具栏
		// if (Platform.isMobile) {
		//   return;
		// }

		this.setWorkspaceActiveLeaf(this.leaf, false);
	}

	private isEventFromPropertiesUI(target: EventTarget | null): boolean {
		try {
			if (!target) return false;

			let el: HTMLElement | null = null;
			if (target instanceof HTMLElement) {
				el = target;
			} else {
				const parentEl = readUnknownProperty(target, "parentElement");
				if (parentEl instanceof HTMLElement) {
					el = parentEl;
				}
			}

			if (!el) return false;

			const hit = el.closest(
				".metadata-container, .metadata-properties, .metadata-container-inner, .metadata-properties-heading, .metadata-add-property"
			);
			return !!hit;
		} catch {
			return false;
		}
	}

	private registerDomEvents() {
		// 监听内容变化
		// 使用 Obsidian 事件或 CodeMirror 事件
		if (this.options.onChange && this.editorView) {
			// @ts-ignore
			this.registerEvent(
				this.app.workspace.on("editor-change", (_editor, info) => {
					if (info === this.editorView) {
						this.options.onChange?.(this);
					}
				})
			);
		}

		// 焦点事件
		if (this.editorView?.contentEl) {
			if (!this.pointerDownCaptureHandler) {
				this.pointerDownCaptureHandler = (ev) => {
					if (!Platform.isMobile) return;

					try {
						EditorContextManager.getInstance().registerActive(this);
					} catch { /* no-op */ }

					this.pushViewScope();

					// 移动端点击时也要激活 Leaf，触发原生工具栏
					if (!this.prevActiveLeaf) {
						this.prevActiveLeaf = this.getWorkspaceActiveLeaf();
					}
					this.activateLeafForHotkeys();

					const fromProps = this.isEventFromPropertiesUI(ev.target);
					if (!fromProps) {
						try {
							this.editorView?.editor?.focus();
						} catch { /* no-op */ }
					}
				};
			}

			this.editorView.contentEl.addEventListener(
				"pointerdown",
				this.pointerDownCaptureHandler,
				true
			);
			this.editorView.contentEl.addEventListener(
				"touchstart",
				this.pointerDownCaptureHandler,
				true
			);

			if (!this.keydownCaptureHandler) {
				this.keydownCaptureHandler = (ev) => {
					if (!(ev.ctrlKey || ev.metaKey || ev.altKey || ev.key === "Tab")) return;
					this.activateLeafForHotkeys();
				};
			}

			this.editorView.contentEl.addEventListener("keydown", this.keydownCaptureHandler, true);

			// 移动端也需要监听焦点事件，确保 Active Leaf 正确切换以显示工具栏
			// 原先仅在桌面端启用，导致移动端焦点切换时工具栏不显示
			if (!this.focusInHandler) {
				this.focusInHandler = (ev) => {
					try {
						EditorContextManager.getInstance().registerActive(this);
					} catch { /* no-op */ }

					this.pushViewScope();

					if (!this.prevActiveLeaf) {
						this.prevActiveLeaf = this.getWorkspaceActiveLeaf();
					}

					this.activateLeafForHotkeys();
					window.requestAnimationFrame(() => {
						this.activateLeafForHotkeys();
					});

					const fromProps = this.isEventFromPropertiesUI(ev.target);
					if (!fromProps) {
						try {
							this.editorView?.editor?.focus();
						} catch { /* no-op */ }
					}
				};
			}

			if (!this.focusOutHandler) {
				this.focusOutHandler = (ev: FocusEvent) => {
					try {
						const next = ev.relatedTarget as HTMLElement | null;
						if (next && this.editorView?.contentEl?.contains(next)) {
							return;
						}
					} catch { /* no-op */ }

					try {
						EditorContextManager.getInstance().unregisterActive(this);
					} catch { /* no-op */ }

					this.popViewScope();

					if (this.prevActiveLeaf && this.leaf && this.prevActiveLeaf !== this.leaf) {
						this.setWorkspaceActiveLeaf(this.prevActiveLeaf, false);
					}
					this.prevActiveLeaf = null;

					this.options.onBlur?.(this);
				};
			}

			this.editorView.contentEl.addEventListener("focusin", this.focusInHandler, true);
			this.editorView.contentEl.addEventListener("focusout", this.focusOutHandler, true);
		}
	}

	private registerHotkeys() {
		this.scope.register(["Mod"], "Enter", () => {
			this.options.onSubmit?.(this);
			return false;
		});

		this.scope.register([], "Escape", () => {
			this.options.onEscape?.(this);
			return false;
		});

		// 必须推入 scope 才能生效吗？
		// Component 会自动管理吗？
		// 我们手动管理 scope
		// 这里可能有问题，因为 editor 本身也有 scope
	}

	// --- Public API ---

	/**
	 * 返回 DetachedLeaf 背后打开的 vault 临时文件路径。
	 * EmbeddableEditorManager 用此路径把 metadata 变更映射回编辑会话（如 we_decks 同步）。
	 */
	getTempFilePath(): string | null {
		return this.tempFile?.path ?? null;
	}

	get value(): string {
		return this.editorView?.editor?.getValue() || "";
	}

	setValue(content: string) {
		this.editorView?.editor?.setValue(content);
	}

	focus() {
		this.editorView?.editor?.focus();
	}

	refresh() {
		this.editorView?.editor?.refresh?.();
	}

	getEditor() {
		return this.editorView?.editor;
	}

	// 兼容旧 API
	getCM() {
		return getEditorCodeMirrorView(this.editorView?.editor);
	}

	onunload() {
		this.destroy();
	}

	destroy() {
		logger.debug("[DetachedLeafEditor] 销毁...");

		this.destroyed = true;

		if (this.readyResolve) {
			try {
				this.readyResolve();
			} catch { /* no-op */ }
			this.readyResolve = null;
		}

		try {
			EditorContextManager.getInstance().unregisterActive(this);
		} catch { /* no-op */ }

		this.popViewScope();

		if (this.prevActiveLeaf && this.leaf && this.prevActiveLeaf !== this.leaf) {
			this.setWorkspaceActiveLeaf(this.prevActiveLeaf, false);
		}
		this.prevActiveLeaf = null;

		try {
			if (this.contentChromeObserver) {
				this.contentChromeObserver.disconnect();
			}
			if (this.editorView?.contentEl && this.pointerDownCaptureHandler) {
				this.editorView.contentEl.removeEventListener(
					"pointerdown",
					this.pointerDownCaptureHandler,
					true
				);
				this.editorView.contentEl.removeEventListener(
					"touchstart",
					this.pointerDownCaptureHandler,
					true
				);
			}
			if (this.editorView?.contentEl && this.focusInHandler) {
				this.editorView.contentEl.removeEventListener("focusin", this.focusInHandler, true);
			}
			if (this.editorView?.contentEl && this.focusOutHandler) {
				this.editorView.contentEl.removeEventListener("focusout", this.focusOutHandler, true);
			}

			if (this.editorView?.contentEl && this.keydownCaptureHandler) {
				this.editorView.contentEl.removeEventListener("keydown", this.keydownCaptureHandler, true);
			}
		} catch { /* no-op */ }

		this.contentChromeObserver = null;
		this.pointerDownCaptureHandler = null;
		this.keydownCaptureHandler = null;

		// 1. 恢复 DOM (可选，防止内存泄漏)
		// 如果我们只是 detach leaf，Obsidian 会清理

		// 2. 关闭/Detach Leaf
		if (this.leaf) {
			this.leaf.detach();
			this.leaf = null;
		}

		// 3. 清理临时文件 (可选，或者保留用于恢复)
		const tempFileToDelete = this.tempFile;
		this.tempFile = null;

		if (tempFileToDelete instanceof TFile) {
			const isPluginTemp = isDetachedEditorTempFilePath(tempFileToDelete.path);
			if (isPluginTemp) {
				try {
					this.app.fileManager.trashFile(tempFileToDelete).catch((_err) => {
						logger.warn("[DetachedLeafEditor] 删除临时文件失败:", _err);
					});
				} catch (err) {
					logger.warn("[DetachedLeafEditor] 删除临时文件异常:", err);
				}
			}
		}

		this.containerEl.empty();
	}
}
