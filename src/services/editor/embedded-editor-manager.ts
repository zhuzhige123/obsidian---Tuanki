import { logger } from "../../utils/logger";
/**
 * 嵌入式编辑器管理器
 *
 * 负责管理嵌入式Obsidian编辑器的完整生命周期：
 * 1. 创建隐藏的Leaf和编辑器实例
 * 2. 提取编辑器DOM并嵌入到自定义容器
 * 3. 管理键盘事件和布局
 * 4. 修复z-index和右键菜单问题
 * 5. 清理资源
 *
 *  焦点管理重构：
 * - 仅在初始化时调用一次 setActiveLeaf
 * - 移除定时重新激活机制，避免移动端键盘闪烁
 * - 使用新的 FocusManager 进行平台感知的焦点管理
 */

import { Platform, TFile, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../../main";
import type { EditorOptions, EditorResult } from "../../types/editor-types";
import { EditorLayoutManager } from "./editor-layout-manager";
import { KeyboardEventHandler } from "./keyboard-event-handler";
import { applyStyleProps } from "../../utils/style-props";
import { shouldHideDocumentPropertiesForVault } from "./document-properties-visibility";

export class EmbeddedEditorManager {
	private plugin: WeavePlugin;
	private leaf: WorkspaceLeaf | null = null;
	private editor: any = null;
	private editorElement: HTMLElement | null = null;
	private container: HTMLElement | null = null;
	private keyboardHandler: KeyboardEventHandler | null = null;
	private layoutManager: EditorLayoutManager | null = null;
	private menuObserver: MutationObserver | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private debug = false;
	private lastKnownContent = ""; // 内容缓存
	private contentChangeInterval: number | null = null; // 内容变化监听定时器
	private contentChangeCallbacks: Set<(content: string) => void> = new Set(); // 内容变化回调
	//  焦点管理重构：已移除 leafReactivateInterval，避免移动端键盘闪烁

	constructor(plugin: WeavePlugin, debug = false) {
		this.plugin = plugin;
		this.debug = debug;
		this.log("EmbeddedEditorManager created");
	}

	/**
	 * 创建嵌入式编辑器
	 */
	public async create(
		container: HTMLElement,
		file: TFile,
		options: EditorOptions
	): Promise<EditorResult> {
		try {
			this.log("Creating embedded editor", { file: file.path, options });
			this.container = container;
			this.debug = options.debug || false;

			// 1. 创建Leaf
			this.leaf = await this.createLeaf(file);

			// 2. 提取编辑器DOM
			this.editorElement = this.extractEditorDOM(this.leaf);
			if (!this.editorElement) {
				throw new Error("Failed to extract editor DOM");
			}

			// 3. 设置编辑器
			await this.setupEditor(this.editorElement, options);

			// 4. 返回结果
			//  焦点管理重构：移除 startLeafReactivation()，避免移动端键盘闪烁
			return {
				success: true,
				cleanup: this.destroy.bind(this),
				getContent: this.getContent.bind(this),
				setContent: this.setContent.bind(this),
				focus: this.focusEditor.bind(this),
			};
		} catch (error) {
			this.log("Error creating embedded editor", error);

			// 清理已创建的资源
			this.destroy();

			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
				cleanup: () => {},
				getContent: () => "",
				setContent: () => {},
				focus: () => {},
			};
		}
	}

	/**
	 * 创建Leaf
	 *
	 * 等待编辑器完全初始化后再隐藏 leaf
	 */
	private async createLeaf(file: TFile): Promise<WorkspaceLeaf> {
		this.log("Creating leaf for file", { path: file.path });

		await this.waitForLayoutReady();

		// 创建隐藏的leaf
		const leaf = this.plugin.app.workspace.createLeafInParent(
			this.plugin.app.workspace.rootSplit,
			0
		);

		// 打开文件（不激活）
		await leaf.openFile(file, { active: false });

		// 激活 leaf 以触发 Obsidian 快捷键注册
		// 使用 focus: true 确保快捷键系统正确识别活跃编辑器
		this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });

		// 等待快捷键系统注册完成
		await new Promise((resolve) => setTimeout(resolve, 100));

		// 等待 CodeMirror 编辑器完全初始化
		// 不要立即隐藏leaf，等待编辑器DOM提取并确认就绪后再隐藏
		await this.waitForCodeMirrorInitialization(leaf);

		this.log("Leaf created and CodeMirror initialized");
		return leaf;
	}

	private async waitForLayoutReady(): Promise<void> {
		await new Promise<void>((resolve) => {
			this.plugin.app.workspace.onLayoutReady(() => {
				resolve();
			});
		});
	}

	/**
	 *  新增：等待CodeMirror编辑器完全初始化
	 * 确保编辑器DOM和实例都已就绪
	 */
	private async waitForCodeMirrorInitialization(leaf: WorkspaceLeaf): Promise<void> {
		const maxWaitTime = 2000; // 最多等待2秒
		const checkInterval = 50; // 每50ms检查一次
		const startTime = Date.now();

		return new Promise<void>((resolve) => {
			const checkCodeMirror = () => {
				const view = leaf.view as any;
				if (!view || !view.editor) {
					// 编辑器还未创建，继续等待
					if (Date.now() - startTime < maxWaitTime) {
						setTimeout(checkCodeMirror, checkInterval);
						return;
					}
					// 超时，但继续执行（可能是其他编辑器类型）
					this.log("CodeMirror initialization timeout, continuing...");
					resolve();
					return;
				}

				const editor = view.editor;
				const contentEl = view.contentEl as HTMLElement;

				// 检查CodeMirror实例是否存在
				const cm = (editor as any).cm;
				if (cm?.dom) {
					// CodeMirror 6 实例存在
					// 检查DOM元素是否已渲染
					const cmEditor = contentEl?.querySelector(".cm-editor");
					const cmContent = contentEl?.querySelector(".cm-content");

					if (cmEditor && cmContent && cmContent.clientHeight > 0) {
						this.log("CodeMirror fully initialized");
						resolve();
						return;
					}
				}

				// 检查是否为CodeMirror 5或其他编辑器
				if (contentEl?.querySelector(".markdown-source-view, .cm-editor")) {
					this.log("Editor DOM detected");
					resolve();
					return;
				}

				// 继续等待
				if (Date.now() - startTime < maxWaitTime) {
					setTimeout(checkCodeMirror, checkInterval);
				} else {
					this.log("CodeMirror initialization timeout, forcing resolve");
					resolve();
				}
			};

			// 立即开始检查
			checkCodeMirror();
		});
	}

	/**
	 * 隐藏Leaf的UI
	 * 保持 Leaf 可见但移到屏幕外，而不是完全隐藏
	 * 这样 Obsidian 快捷键系统才能识别到活跃的编辑器
	 */
	private hideLeafUI(leaf: WorkspaceLeaf): void {
		// 移动leaf容器到屏幕外（保持可见性）
		const leafEl = (leaf as any).containerEl as HTMLElement;
		if (leafEl) {
			// 不设置 display:none 和 visibility:hidden
			// 这样 Obsidian 才能认为这是一个“活跃”的编辑器
			applyStyleProps(leafEl, {
				display: "block", // 保持可见
				visibility: "visible", // 保持可见
				position: "absolute",
				left: "-9999px", // 移到屏幕外
				top: "-9999px",
				width: "1px", // 最小尺寸但不为0
				height: "1px",
				overflow: "hidden",
				opacity: "0", // 额外保险
				"pointer-events": "none", // 禁止鼠标交互
				"z-index": "-9999", // 超低 z-index
			});
			this.log("Leaf container moved off-screen (visible for shortcuts)");
		}

		// 隐藏标签页标题
		const tabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement;
		if (tabHeaderEl) {
			applyStyleProps(tabHeaderEl, { display: "none" });
			this.log("Tab header hidden");
		}

		// 隐藏文件名相关元素
		this.hideFileNameElements(leaf);
	}

	/**
	 * 隐藏文件名显示元素
	 */
	private hideFileNameElements(leaf: WorkspaceLeaf): void {
		const view = (leaf as any).view;
		if (!view || !view.containerEl) return;

		//  扩展选择器列表，完全隐藏编辑器标题栏相关元素
		const selectors = [
			".view-header",
			".view-header-title",
			".view-header-breadcrumb",
			".view-header-title-container",
			".view-header-title-parent",
			".view-header-icon",
			".view-header-nav-buttons",
			".inline-title",
			".view-header-title-wrapper",
		];

		if (shouldHideDocumentPropertiesForVault(this.plugin.app.vault)) {
			selectors.push(".metadata-container");
		}

		selectors.forEach((_selector) => {
			const element = view.containerEl.querySelector(_selector);
			if (element) {
				applyStyleProps((element as HTMLElement), {
					display: "none",
					height: "0",
					margin: "0",
					padding: "0",
				});
				this.log(`Hidden element: ${_selector}`);
			}
		});
	}

	/**
	 * 提取编辑器DOM
	 * 添加验证和重试机制，确保 DOM 完整
	 */
	private extractEditorDOM(leaf: WorkspaceLeaf): HTMLElement | null {
		this.log("Extracting editor DOM");

		const markdownView = leaf.view as any;
		if (!markdownView || !markdownView.editor) {
			this.log("Error: MarkdownView or editor not found");
			return null;
		}

		this.editor = markdownView.editor;
		const editorEl = markdownView.contentEl as HTMLElement;

		if (!editorEl) {
			this.log("Error: Editor element not found");
			return null;
		}

		// 验证 CodeMirror DOM 是否完整
		const cmEditor = editorEl.querySelector(".cm-editor");
		const cmContent = editorEl.querySelector(".cm-content");

		if (!cmEditor && !editorEl.querySelector(".markdown-source-view")) {
			this.log("Warning: CodeMirror DOM not fully initialized, but continuing...");
			// 不直接返回null，尝试继续（可能是其他编辑器类型）
		} else if (cmEditor && !cmContent) {
			this.log("Warning: CodeMirror editor found but content not ready");
			// CodeMirror DOM不完整，但继续尝试
		}

		// 移动编辑器DOM到容器
		if (this.container) {
			//  增强清理：确保容器完全清空
			this.log(`Container cleanup - before: ${this.container.childNodes.length} child nodes`);

			// 双重保险清理：先移除所有子节点
			while (this.container.firstChild) {
				this.container.removeChild(this.container.firstChild);
			}
			// 再次确保清空
			// /skip innerHTML = '' is used to ensure container is fully cleared before adding editor element
			this.container.replaceChildren();

			this.log(`Container cleanup - after: ${this.container.childNodes.length} child nodes`);

			// 添加编辑器元素
			this.container.appendChild(editorEl);
			this.log("Editor DOM moved to container");

			// 现在可以安全地隐藏 leaf
			// 编辑器DOM已提取并移动到容器，隐藏leaf不会影响编辑器
			this.hideLeafUI(leaf);
		}

		return editorEl;
	}

	/**
	 * 设置编辑器
	 */
	private async setupEditor(editorElement: HTMLElement, options: EditorOptions): Promise<void> {
		this.log("Setting up editor");

		// 设置基本样式
		this.setupEditorStyles(editorElement);

		// 初始化键盘事件处理器
		if (options.enableKeyboardShortcuts !== false) {
			this.initializeKeyboardHandler(options);
		}

		// 初始化布局管理器
		this.initializeLayoutManager();

		// 修复右键菜单z-index
		if (options.enableContextMenu !== false) {
			this.setupContextMenuFix();
		}

		//  性能优化：动态检测 DOM 就绪（替代固定延迟100ms）
		await this.waitForEditorReady(editorElement);

		// 启动内容变化监听
		this.startContentChangeMonitoring();

		//  移动端优化：跳过自动聚焦，防止键盘自动弹出
		// 只有用户点击输入区域时才显示键盘
		if (!options.skipAutoFocus) {
			// 聚焦编辑器
			this.focusEditor(options.initialCursorPosition);
		}

		this.log("Editor setup complete");
	}

	/**
	 * 等待编辑器 DOM 完全就绪
	 * 使用增强检测机制，确保编辑器真正就绪
	 *
	 * @param editorElement 编辑器元素
	 * @returns Promise
	 */
	private async waitForEditorReady(editorElement: HTMLElement): Promise<void> {
		// 检查编辑器是否已经有内容元素且 CodeMirror 实例已初始化
		const contentEl = editorElement.querySelector(".cm-editor, .markdown-source-view");
		const cmContent = editorElement.querySelector(".cm-content");

		// 检查CodeMirror实例是否存在
		if (this.editor) {
			const cm = (this.editor as any).cm;
			if (cm?.dom && contentEl && cmContent && cmContent.clientHeight > 0) {
				this.log("Editor already ready with CodeMirror instance");
				return; // 已就绪，立即返回
			}
		}

		// 基础检查：元素存在且有高度
		if (contentEl && contentEl.clientHeight > 0) {
			this.log("Editor already ready (basic check)");
			return; // 已就绪，立即返回
		}

		// 使用多层检测机制
		return new Promise<void>((resolve) => {
			let resolved = false;
			const maxWaitTime = 1000; // 增加到1秒
			const startTime = Date.now();

			// 检测函数：检查编辑器是否真正就绪
			const checkReady = () => {
				if (resolved) return;

				const contentEl = editorElement.querySelector(".cm-editor, .markdown-source-view");
				const cmContent = editorElement.querySelector(".cm-content");

				// 多层检查：
				// 1. CodeMirror实例检查（最可靠）
				if (this.editor) {
					const cm = (this.editor as any).cm;
					if (cm?.dom && cmContent && cmContent.clientHeight > 0) {
						observer.disconnect();
						resolved = true;
						this.log("Editor ready detected: CodeMirror instance + DOM");
						resolve();
						return;
					}
				}

				// 2. DOM元素检查（基础检查）
				if (contentEl && contentEl.clientHeight > 0 && cmContent && cmContent.clientHeight > 0) {
					observer.disconnect();
					resolved = true;
					this.log("Editor ready detected: DOM elements");
					resolve();
					return;
				}

				// 3. 超时检查
				if (Date.now() - startTime >= maxWaitTime) {
					observer.disconnect();
					resolved = true;
					this.log(`Editor ready timeout (${maxWaitTime}ms), forcing resolve`);
					resolve();
					return;
				}
			};

			// 使用 MutationObserver 监听DOM变化
			const observer = new MutationObserver(() => {
				checkReady();
			});

			observer.observe(editorElement, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["style", "class"],
			});

			// 立即检查一次（可能已经就绪）
			checkReady();

			// 定期检查（作为MutationObserver的补充）
			const intervalId = setInterval(() => {
				if (resolved) {
					clearInterval(intervalId);
					return;
				}
				checkReady();
			}, 50); // 每50ms检查一次

			// 确保在超时后清理
			setTimeout(() => {
				if (!resolved) {
					clearInterval(intervalId);
				}
			}, maxWaitTime + 100);
		});
	}

	/**
	 * 设置编辑器样式
	 */
	private setupEditorStyles(editorEl: HTMLElement): void {
		// 设置主题适配
		applyStyleProps(editorEl, {
			background: "var(--background-primary)",
			color: "var(--text-normal)",
		});

		// 查找并设置CodeMirror样式
		const cmEditor = editorEl.querySelector(".cm-editor") as HTMLElement;
		if (cmEditor) {
			applyStyleProps(cmEditor, {
				height: "100%",
				"font-size": "var(--font-text-size)",
				"font-family": "var(--font-text)",
				border: "none",
				background: "transparent",
			});
		}

		const cmScroller = editorEl.querySelector(".cm-scroller") as HTMLElement;
		if (cmScroller) {
			applyStyleProps(cmScroller, {
				"font-family": "var(--font-text)",
				height: "100%",
				overflow: "auto",
			});
		}

		const cmContent = editorEl.querySelector(".cm-content") as HTMLElement;
		if (cmContent) {
			applyStyleProps(cmContent, {
				padding: "20px 24px", //  UX最佳实践：上下20px，左右24px
				"min-height": "unset",
				height: "auto",
			});
		}

		this.log("Editor styles applied");
	}

	/**
	 * 初始化键盘事件处理器
	 */
	private initializeKeyboardHandler(options: EditorOptions): void {
		if (!this.editorElement) return;

		this.log("Initializing keyboard handler");

		this.keyboardHandler = new KeyboardEventHandler({
			onSave: () => {
				const content = this.getContent();
				options.onSave(content);
			},
			onCancel: options.onCancel,
			debug: this.debug,
		});

		this.keyboardHandler.attach(this.editorElement);
		this.log("Keyboard handler attached");
	}

	/**
	 * 初始化布局管理器
	 */
	private initializeLayoutManager(): void {
		if (!this.container || !this.editorElement) return;

		this.log("Initializing layout manager");

		this.layoutManager = new EditorLayoutManager(this.container, this.debug);
		this.layoutManager.initialize(this.editorElement);
		this.layoutManager.enableVerticalScroll();

		this.log("Layout manager initialized");
	}

	/**
	 * 修复右键菜单z-index
	 */
	private setupContextMenuFix(): void {
		if (!this.editorElement) return;

		this.log("Setting up context menu fix");

		// 立即修复现有菜单
		this.fixMenuZIndex(this.editorElement);

		// 监听新添加的菜单
		this.observeMenuElements();

		this.log("Context menu fix applied");
	}

	/**
	 * 修复菜单元素的z-index
	 *  修复后：使用合理的z-index值，不再无脑设置超高值
	 */
	private fixMenuZIndex(root: HTMLElement): void {
		const menuSelectors = [
			".menu",
			".suggestion-container",
			".popover",
			// 移除'.modal'，避免影响正常模态窗的层级管理
		];

		menuSelectors.forEach((_selector) => {
			const elements = root.querySelectorAll(_selector);
			elements.forEach((_el) => {
				// 对齐 Obsidian 层级变量（menu 高于 modal）
				// 使用 CSS 变量避免硬编码超大值造成的层级污染
				applyStyleProps((_el as HTMLElement), { "z-index": "var(--layer-menu, 65)" });
			});

			if (elements.length > 0) {
				this.log(
					`Fixed z-index for ${elements.length} ${_selector} elements to var(--layer-menu, 65)`
				);
			}
		});
	}

	/**
	 * 监听菜单元素的添加
	 */
	private observeMenuElements(): void {
		if (!this.editorElement) return;

		this.menuObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				mutation.addedNodes.forEach((_node) => {
					if (_node instanceof HTMLElement) {
						this.fixMenuZIndex(_node);
					}
				});
			}
		});

		this.menuObserver.observe(this.editorElement, {
			childList: true,
			subtree: true,
		});

		// 也监听document.body，因为某些菜单可能添加到body
		this.menuObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});

		this.log("Menu observer attached");
	}

	/**
	 * 聚焦编辑器
	 *  焦点管理重构：移除 setActiveLeaf 调用，仅在初始化时调用一次
	 * 避免移动端键盘闪烁问题
	 */
	public focusEditor(cursorPosition?: "start" | "end"): void {
		if (!this.editor) return;

		//  焦点管理重构：不再调用 setActiveLeaf，避免移动端键盘闪烁
		// setActiveLeaf 仅在 createLeaf() 初始化时调用一次

		setTimeout(() => {
			try {
				this.editor.focus();

				// 设置光标位置
				if (cursorPosition === "start") {
					this.editor.setCursor({ line: 0, ch: 0 });
				} else if (cursorPosition === "end") {
					const lastLine = this.editor.lastLine();
					const lastLineLength = this.editor.getLine(lastLine).length;
					this.editor.setCursor({ line: lastLine, ch: lastLineLength });
				}

				this.log("Editor focused");
			} catch (error) {
				this.log("Error focusing editor", error);
			}
		}, 150);
	}

	/**
	 * 检查编辑器是否已初始化
	 */
	public isReady(): boolean {
		return this.editor !== null;
	}

	/**
	 * 获取编辑器内容
	 * 使用多层回退机制和内容缓存更新
	 */
	public getContent(): string {
		if (!this.editor) {
			logger.error("[EmbeddedEditorManager] ❌ 编辑器未初始化");
			this.log("Warning: Cannot get content - editor not initialized");
			return "";
		}

		try {
			//  方案0：尝试多种 CodeMirror 6 API（最全面）
			const cm = (this.editor as any).cm;
			if (cm) {
				// 子方案0.1: 从 state.doc 获取（标准方式）
				if (cm.state?.doc) {
					const content = cm.state.doc.toString();
					//  已禁用：频繁触发的调试日志
					// logger.debug('[EmbeddedEditorManager]  从 CodeMirror state.doc 获取内容:', {
					//   length: content.length,
					//   preview: content.substring(0, 100),
					//   method: 'cm.state.doc.toString()'
					// });
					//  更新内部缓存
					this.lastKnownContent = content;
					//  静默模式：不输出频繁的内容获取日志（每500ms调用一次）
					// this.log('Content retrieved from CodeMirror state', { length: content.length });
					return content;
				}

				// 子方案0.2: 从 state.sliceDoc 获取（替代方式）
				if (cm.state && typeof cm.state.sliceDoc === "function") {
					const content = cm.state.sliceDoc();
					//  已禁用：频繁触发的调试日志
					// logger.debug('[EmbeddedEditorManager]  从 CodeMirror sliceDoc 获取内容:', {
					//   length: content.length,
					//   preview: content.substring(0, 100),
					//   method: 'cm.state.sliceDoc()'
					// });
					//  更新内部缓存
					this.lastKnownContent = content;
					return content;
				}
			}

			//  方案1：从 Obsidian Editor API 获取
			if (this.editor && typeof this.editor.getValue === "function") {
				const content = this.editor.getValue();
				if (content && content.trim().length > 0) {
					//  已禁用：频繁触发的调试日志
					// logger.debug('[EmbeddedEditorManager]  从 Editor.getValue() 获取内容:', {
					//   length: content.length,
					//   preview: content.substring(0, 100),
					//   method: 'editor.getValue()'
					// });
					//  更新内部缓存
					this.lastKnownContent = content;
					return content;
				}
			}

			//  方案2：从编辑器 DOM 直接读取文本（回退方案）
			if (this.editorElement) {
				const cmContent = this.editorElement.querySelector(".cm-content");
				if (cmContent) {
					const content = cmContent.textContent || "";
					if (content && content.trim().length > 0) {
						//  已禁用：频繁触发的调试日志
						// logger.debug('[EmbeddedEditorManager]  从 DOM 获取内容:', {
						//   length: content.length,
						//   preview: content.substring(0, 100),
						//   method: 'DOM.textContent'
						// });
						//  更新内部缓存
						this.lastKnownContent = content;
						return content;
					}
				}
			}

			//  方案3：使用内部缓存（如果可用）
			if (this.lastKnownContent && this.lastKnownContent.trim().length > 0) {
				//  已禁用：频繁触发的调试日志
				// logger.debug('[EmbeddedEditorManager]  从内部缓存获取内容（其他方法失败）:', {
				//   length: this.lastKnownContent.length,
				//   preview: this.lastKnownContent.substring(0, 100),
				//   method: 'lastKnownContent cache'
				// });
				//  静默模式：不输出频繁的缓存获取日志
				// this.log('Content retrieved from cache', { length: this.lastKnownContent.length });
				return this.lastKnownContent;
			}

			// 方案4：最后尝试 - 可能返回空字符串
			logger.warn("[EmbeddedEditorManager] ⚠️ 所有内容获取方法都失败，返回空字符串");
			this.log("Warning: All content retrieval methods failed");
			return "";
		} catch (error) {
			logger.error("[EmbeddedEditorManager] ❌ 获取内容失败:", error);
			this.log("Error getting content", error);
			return "";
		}
	}

	/**
	 * 设置编辑器内容
	 */
	public setContent(content: string): void {
		if (!this.editor) {
			this.log("Warning: Cannot set content - editor not initialized");
			return;
		}

		try {
			this.editor.setValue(content);
			this.lastKnownContent = content;
			this.log("Content set", { length: content.length });
		} catch (error) {
			this.log("Error setting content", error);
		}
	}

	/**
	 * 添加内容变化监听器
	 */
	public onContentChange(callback: (content: string) => void): void {
		this.contentChangeCallbacks.add(callback);
		this.log("Content change callback added", { total: this.contentChangeCallbacks.size });
	}

	/**
	 * 移除内容变化监听器
	 */
	public offContentChange(callback: (content: string) => void): void {
		this.contentChangeCallbacks.delete(callback);
		this.log("Content change callback removed", { total: this.contentChangeCallbacks.size });
	}

	/**
	 * 启动内容变化监听
	 */
	private startContentChangeMonitoring(): void {
		if (this.contentChangeInterval) {
			return;
		}

		// 初始化最后已知内容
		this.lastKnownContent = this.getContent();

		// 每500ms检查一次内容变化
		this.contentChangeInterval = window.setInterval(() => {
			if (!this.editor) {
				return;
			}

			try {
				const currentContent = this.getContent();

				if (currentContent !== this.lastKnownContent) {
					this.lastKnownContent = currentContent;
					this.notifyContentChange(currentContent);
				}
			} catch (error) {
				this.log("Error monitoring content change", error);
			}
		}, 500);

		this.log("Content change monitoring started");
	}

	/**
	 * 停止内容变化监听
	 */
	private stopContentChangeMonitoring(): void {
		if (this.contentChangeInterval) {
			clearInterval(this.contentChangeInterval);
			this.contentChangeInterval = null;
			this.log("Content change monitoring stopped");
		}
	}

	/**
	 * 通知内容变化
	 */
	private notifyContentChange(content: string): void {
		this.contentChangeCallbacks.forEach((_callback) => {
			try {
				_callback(content);
			} catch (error) {
				logger.error("[EmbeddedEditorManager] Content change callback error:", error);
			}
		});
	}

	//  焦点管理重构：已移除 startLeafReactivation() 和 stopLeafReactivation()
	// 定时调用 setActiveLeaf 会导致移动端键盘闪烁问题
	// 现在仅在 createLeaf() 初始化时调用一次 setActiveLeaf

	/**
	 * 销毁编辑器
	 */
	public destroy(): void {
		this.log("Destroying embedded editor");

		try {
			//  焦点管理重构：已移除 stopLeafReactivation() 调用

			// 停止内容变化监听
			this.stopContentChangeMonitoring();
			this.contentChangeCallbacks.clear();

			// 清理键盘事件处理器
			if (this.keyboardHandler) {
				this.keyboardHandler.detach();
				this.keyboardHandler = null;
				this.log("Keyboard handler detached");
			}

			// 清理布局管理器
			if (this.layoutManager) {
				this.layoutManager.cleanup();
				this.layoutManager = null;
				this.log("Layout manager cleaned up");
			}

			// 断开菜单观察器
			if (this.menuObserver) {
				this.menuObserver.disconnect();
				this.menuObserver = null;
				this.log("Menu observer disconnected");
			}

			// 断开resize观察器
			if (this.resizeObserver) {
				this.resizeObserver.disconnect();
				this.resizeObserver = null;
				this.log("Resize observer disconnected");
			}

			// 恢复leaf显示（虽然即将关闭）
			if (this.leaf) {
				const leafEl = (this.leaf as any).containerEl as HTMLElement;
				if (leafEl) {
					applyStyleProps(leafEl, {
						display: "",
						visibility: "",
						position: "",
						left: "",
						top: "",
						width: "",
						height: "",
						overflow: "",
					});
				}

				// 关闭leaf
				this.leaf.detach();
				this.log("Leaf detached");
			}

			// 清空所有引用
			this.leaf = null;
			this.editor = null;
			this.editorElement = null;
			this.container = null;

			this.log("Embedded editor destroyed");
		} catch (error) {
			this.log("Error during cleanup", error);
		}
	}

	/**
	 * 调试日志
	 */
	private log(message: string, data?: any): void {
		if (this.debug) {
			logger.debug(`[EmbeddedEditorManager] ${message}`, data || "");
		}
	}
}
