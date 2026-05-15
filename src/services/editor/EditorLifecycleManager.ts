/**
 * 编辑器生命周期管理器
 *  解决编辑器创建不稳定问题
 * - 使用状态机管理生命周期
 * - 支持取消操作
 * - 可靠的就绪检测（超时3000ms）
 * - 正确的异步流程控制
 */

import type { TFile, WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../../main";
import type { EditorResult } from "../../types/editor-types";
import { logger } from "../../utils/logger";
import { applyStyleProps } from "../../utils/style-props";

// 编辑器状态枚举
type EditorState =
	| "idle" // 空闲
	| "creating" // 创建中
	| "ready" // 就绪
	| "updating" // 更新中
	| "error"; // 错误

export class EditorLifecycleManager {
	private state: EditorState = "idle";
	private currentOperation: AbortController | null = null;
	private plugin: WeavePlugin;
	private leaf: WorkspaceLeaf | null = null;
	private editorElement: HTMLElement | null = null;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 *  创建编辑器（带状态机和取消机制）
	 */
	async createEditor(
		container: HTMLElement,
		file: TFile,
		signal?: AbortSignal
	): Promise<EditorResult> {
		// 状态检查
		if (this.state === "creating") {
			return {
				success: false,
				error: "编辑器创建已在进行中",
				cleanup: () => {},
				getContent: () => "",
				setContent: () => {},
				focus: () => {},
			};
		}

		// 创建取消控制器
		this.currentOperation = new AbortController();
		const combinedSignal = this.combineSignals(signal, this.currentOperation.signal);

		try {
			this.state = "creating";

			// Step 1: 创建 Leaf
			logger.debug("[EditorLifecycleManager]", "Step 1: 创建 Leaf");
			this.leaf = await this.createLeaf(file, combinedSignal);
			this.checkAborted(combinedSignal);

			// Step 2: 等待 CodeMirror 初始化（ 增加超时到3000ms）
			logger.debug("[EditorLifecycleManager]", "Step 2: 等待 CodeMirror 初始化");
			await this.waitForCodeMirrorInit(this.leaf, 3000, combinedSignal);
			this.checkAborted(combinedSignal);

			// Step 3: 提取编辑器 DOM
			logger.debug("[EditorLifecycleManager]", "Step 3: 提取编辑器 DOM");
			this.editorElement = await this.extractEditorDOM(this.leaf, combinedSignal);
			this.checkAborted(combinedSignal);

			// Step 4: 附加到容器
			logger.debug("[EditorLifecycleManager]", "Step 4: 附加到容器");
			await this.attachToContainer(container, this.editorElement, combinedSignal);
			this.checkAborted(combinedSignal);

			// Step 5: 隐藏 Leaf（ 最后执行，确保DOM完全就绪）
			logger.debug("[EditorLifecycleManager]", "Step 5: 隐藏 Leaf");
			this.hideLeaf(this.leaf);

			this.state = "ready";
			logger.debug("[EditorLifecycleManager]", "✅ 编辑器创建成功");

			return {
				success: true,
				cleanup: () => {
					void this.dispose();
				},
				getContent: () => {
					const view = this.leaf?.view as any;
					const editor = view?.editor;
					return editor?.getValue?.() ?? "";
				},
				setContent: (content: string) => {
					const view = this.leaf?.view as any;
					const editor = view?.editor;
					editor?.setValue?.(content);
				},
				focus: () => {
					const view = this.leaf?.view as any;
					const editor = view?.editor;
					editor?.focus?.();
				},
			};
		} catch (error) {
			this.state = "error";
			const errorMessage = error instanceof Error ? error.message : "未知错误";
			logger.debug("[EditorLifecycleManager]", "❌ 编辑器创建失败:", errorMessage);

			// 清理资源
			if (this.leaf) {
				this.leaf.detach();
				this.leaf = null;
			}

			return {
				success: false,
				error: errorMessage,
				cleanup: () => {
					void this.dispose();
				},
				getContent: () => "",
				setContent: () => {},
				focus: () => {},
			};
		} finally {
			this.currentOperation = null;
		}
	}

	/**
	 *  可靠的 CodeMirror 初始化检测
	 */
	private async waitForCodeMirrorInit(
		leaf: WorkspaceLeaf,
		timeout: number,
		signal: AbortSignal
	): Promise<void> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			const check = () => {
				// 检查是否被取消
				if (signal.aborted) {
					reject(new Error("操作已取消"));
					return;
				}

				//  多重检测：确保编辑器完全就绪
				const view = leaf.view as any;
				const hasEditor = view?.editor;
				const hasContentEl = view?.contentEl;
				const hasDOM = hasContentEl?.querySelector(".cm-editor");
				const hasContent = hasDOM?.querySelector(".cm-content");
				const hasScroller = hasDOM?.querySelector(".cm-scroller");

				if (hasEditor && hasDOM && hasContent && hasScroller) {
					logger.debug("[EditorLifecycleManager]", "CodeMirror 已就绪");
					resolve();
					return;
				}

				//  超时检测
				if (Date.now() - startTime > timeout) {
					reject(new Error(`编辑器初始化超时 (${timeout}ms)`));
					return;
				}

				// 继续检测（使用 requestAnimationFrame 而不是 setTimeout）
				requestAnimationFrame(check);
			};

			// 开始检测
			check();
		});
	}

	/**
	 * 创建 Leaf
	 */
	private async createLeaf(file: TFile, signal: AbortSignal): Promise<WorkspaceLeaf> {
		this.checkAborted(signal);

		await this.waitForLayoutReady(signal);

		// 创建隐藏的 leaf
		const leaf = this.plugin.app.workspace.createLeafInParent(
			this.plugin.app.workspace.rootSplit,
			0
		);

		// 打开文件（不激活）
		await leaf.openFile(file, { active: false });

		// 短暂激活以触发 Obsidian 快捷键注册
		this.plugin.app.workspace.setActiveLeaf(leaf, { focus: false });

		return leaf;
	}

	/**
	 * 提取编辑器 DOM
	 */
	private async extractEditorDOM(leaf: WorkspaceLeaf, signal: AbortSignal): Promise<HTMLElement> {
		this.checkAborted(signal);

		const markdownView = leaf.view as any;
		if (!markdownView || !markdownView.editor) {
			throw new Error("无法获取 MarkdownView 或编辑器实例");
		}

		const editorEl = markdownView.contentEl as HTMLElement;
		if (!editorEl) {
			throw new Error("无法获取编辑器DOM元素");
		}

		return editorEl;
	}

	/**
	 * 附加到容器
	 */
	private async attachToContainer(
		container: HTMLElement,
		editorElement: HTMLElement,
		signal: AbortSignal
	): Promise<void> {
		this.checkAborted(signal);

		// 清空容器
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		// 附加编辑器
		container.appendChild(editorElement);

		// 等待 DOM 更新
		await new Promise((resolve) => requestAnimationFrame(resolve));
	}

	/**
	 * 隐藏 Leaf
	 */
	private hideLeaf(leaf: WorkspaceLeaf): void {
		const leafContainer = (leaf as any).containerEl as HTMLElement;
		if (leafContainer) {
			applyStyleProps(leafContainer, {
				display: "none",
				position: "absolute",
				left: "-9999px",
				top: "-9999px",
			});
		}
	}

	/**
	 *  取消当前操作
	 */
	cancel(): void {
		if (this.currentOperation) {
			this.currentOperation.abort();
			logger.debug("[EditorLifecycleManager]", "操作已取消");
		}
	}

	/**
	 *  清理资源
	 */
	async dispose(): Promise<void> {
		this.cancel();

		if (this.leaf) {
			this.leaf.detach();
			this.leaf = null;
		}

		this.editorElement = null;
		this.state = "idle";
		logger.debug("[EditorLifecycleManager]", "资源已清理");
	}

	/**
	 * 获取当前状态
	 */
	getState(): EditorState {
		return this.state;
	}

	// ============================================
	// 工具方法
	// ============================================

	/**
	 * 组合多个 AbortSignal
	 */
	private combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
		const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

		if (validSignals.length === 0) {
			return new AbortController().signal;
		}

		if (validSignals.length === 1) {
			return validSignals[0];
		}

		const controller = new AbortController();

		for (const signal of validSignals) {
			if (signal.aborted) {
				controller.abort();
				break;
			}

			signal.addEventListener("abort", () => {
				controller.abort();
			});
		}

		return controller.signal;
	}

	/**
	 * 检查是否已取消
	 */
	private checkAborted(signal: AbortSignal): void {
		if (signal.aborted) {
			throw new Error("操作已取消");
		}
	}

	private async waitForLayoutReady(signal: AbortSignal): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(new Error("操作已取消"));
				return;
			}

			const onAbort = () => {
				reject(new Error("操作已取消"));
			};
			signal.addEventListener("abort", onAbort, { once: true });

			this.plugin.app.workspace.onLayoutReady(() => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			});
		});
	}
}
