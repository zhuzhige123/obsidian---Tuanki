/**
 * 模态窗专用编辑器管理器
 *
 * 方案A实现：为CreateCardModal维护一个永久的隐藏MarkdownView
 * 避免临时文件创建和清理问题，提供稳定的编辑器环境
 *
 * 核心设计：
 * 1. 单例模式，全局唯一
 * 2. 维护一个永久的隐藏WorkspaceLeaf + MarkdownView
 * 3. 通过更新MarkdownView的内容来复用编辑器
 * 4. 仅在插件卸载时销毁
 */

import { App, Editor, EventRef, MarkdownView, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { isCallable, readUnknownProperty, readUnknownString } from "../../utils/dynamic-access";
import { isRecord } from "../../utils/typed-json";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import {
	getVaultEditorTempDir,
	isLegacyModalEditorPermanentFilePath,
	isPluginCacheModalEditorPermanentFilePath,
} from "./editor-temp-file-policy";
import { applyStyleProps } from "../../utils/style-props";
import { shouldHideDocumentPropertiesForVault } from "./document-properties-visibility";

interface ModalEditorSessionCard {
	uuid?: string;
	content?: string;
}

interface ModalEditorSessionOptions {
	isStudySession?: boolean;
	sessionId?: string;
	backingFilePath?: string;
}

export class ModalEditorManager {
	private static instance: ModalEditorManager | null = null;
	private app: App;
	private slotKeydownHandlers = new Map<number, (e: KeyboardEvent) => void>();

	private readonly INITIAL_POOL_SIZE = 5;
	private hasCleanedRestoredLeaves = false;
	private pool: Array<{
		index: number;
		file: TFile;
		leaf: WorkspaceLeaf | null;
		leafHomeParent: HTMLElement | null;
		leafHomeNextSibling: ChildNode | null;
		contentHomeParent: HTMLElement | null;
		contentHomeNextSibling: ChildNode | null;
		contentChangeEventRef: EventRef | null;
		activeChangeListenerFilePath: string | null;
		isProgrammaticContentUpdate: boolean;
		currentCallbacks: {
			onSave?: (content: string) => void;
			onCancel?: () => void;
			onChange?: (content: string) => void;
		};
		inUseSessionId: string | null;
		lastUsedTs: number;
	}> = [];
	private isInitialized = false;

	private readonly STUDY_SESSION_CARD_ID = "weave-study-session-editor";
	private currentEditingCardUuid = "";

	private hideLeafUiElements(rootEl: HTMLElement): void {
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

		if (shouldHideDocumentPropertiesForVault(this.app.vault)) {
			selectors.push(".metadata-container");
		}

		for (const selector of selectors) {
			const els = rootEl.querySelectorAll(selector);
			els.forEach((el) => {
				const h = el as HTMLElement;
				applyStyleProps(h, {
					display: "none",
					height: "0",
					"min-height": "0",
					margin: "0",
					padding: "0",
				});
			});
		}
	}

	private async expandPoolToSize(targetSize: number): Promise<void> {
		if (targetSize <= this.pool.length) return;

		const dirPath = this.getEditorTempDirPath();

		const newSlots: typeof this.pool = [];

		for (let i = this.pool.length; i < targetSize; i++) {
			const fileName = i === 0 ? "modal-editor-permanent.md" : `modal-editor-permanent-${i + 1}.md`;
			const filePath = normalizePath(`${dirPath}/${fileName}`);
			const file = await this.ensurePermanentFileAtPath(filePath);
			if (!file) {
				throw new Error("无法获取永久编辑器文件（TFile）");
			}

			newSlots.push({
				index: i,
				file,
				leaf: null,
				leafHomeParent: null,
				leafHomeNextSibling: null,
				contentHomeParent: null,
				contentHomeNextSibling: null,
				contentChangeEventRef: null,
				activeChangeListenerFilePath: null,
				isProgrammaticContentUpdate: false,
				currentCallbacks: {},
				inUseSessionId: null,
				lastUsedTs: 0,
			});
		}

		this.pool.push(...newSlots);
	}

	private async waitForEditorReady(
		view: MarkdownView,
		maxWaitMs = 2000,
		intervalMs = 50
	): Promise<void> {
		const start = Date.now();
		while (Date.now() - start < maxWaitMs) {
			const editor = view.editor;
			const contentEl = view.contentEl;
			if (editor && contentEl) {
				const cm = contentEl.querySelector(".cm-editor");
				if (cm) return;
			}
			await new Promise<void>((resolve) => window.setTimeout(resolve, intervalMs));
		}
	}

	private getEditorTempDirPath(): string {
		return getVaultEditorTempDir(this.app);
	}

	private isTFileLike(file: unknown): file is TFile {
		return isRecord(file) && typeof file.path === "string" && typeof file.extension === "string";
	}

	private async getTFileByPathWithRetry(
		filePath: string,
		retries = 20,
		delayMs = 50
	): Promise<TFile | null> {
		for (let i = 0; i < retries; i++) {
			const af = this.app.vault.getAbstractFileByPath(filePath);
			if (this.isTFileLike(af)) return af;
			await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
		}
		const af = this.app.vault.getAbstractFileByPath(filePath);
		return this.isTFileLike(af) ? af : null;
	}

	private async ensurePermanentFileAtPath(filePath: string): Promise<TFile | null> {
		try {
			await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, filePath);
		} catch (error) {
			logger.warn("[ModalEditorManager] 创建目录失败（忽略）:", error);
		}

		try {
			const fileExistsOnDisk = await this.app.vault.adapter.exists(filePath);
			if (!fileExistsOnDisk) {
				const created = await this.app.vault.create(filePath, "");
				return this.isTFileLike(created) ? created : null;
			}
		} catch { /* no-op */ }

		const existing = await this.getTFileByPathWithRetry(filePath);
		if (existing) return existing;

		try {
			await this.app.vault.adapter.remove(filePath);
		} catch { /* no-op */ }

		try {
			const recreated = await this.app.vault.create(filePath, "");
			if (this.isTFileLike(recreated)) return recreated;
		} catch { /* no-op */ }

		return await this.getTFileByPathWithRetry(filePath);
	}

	// 会话数据（保证 finishEditing 能返回完整 card，包括 uuid）
	private sessions: Map<
		string,
		{
			card: ModalEditorSessionCard;
			backingFile: TFile;
			usePermanentBuffer: boolean;
			slotIndex: number;
		}
	> = new Map();

	private getWorkspaceActiveLeaf(): WorkspaceLeaf | null {
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
	}

	private setWorkspaceActiveLeaf(leaf: WorkspaceLeaf | null, focus: boolean): void {
		if (!leaf) return;
		const ws = this.app.workspace;
		const setActiveLeaf = readUnknownProperty(ws, "setActiveLeaf");
		if (!isCallable(setActiveLeaf)) {
			return;
		}
		try {
			Reflect.apply(setActiveLeaf, ws, [leaf, { focus }]);
		} catch {
			Reflect.apply(setActiveLeaf, ws, [leaf, focus]);
		}
	}

	private getSlot(index: number) {
		const slot = this.pool[index];
		if (!slot) {
			throw new Error(`编辑器槽位不存在: ${index}`);
		}
		return slot;
	}

	private allocateSlotIndex(sessionId: string): number {
		for (const slot of this.pool) {
			if (slot.inUseSessionId === sessionId) return slot.index;
		}
		const free = this.pool.find((s) => !s.inUseSessionId);
		if (free) return free.index;

		// 池满时：回收已经丢失的会话占用（防止某些组件异常退出导致永远占用）
		for (const slot of this.pool) {
			if (slot.inUseSessionId && !this.sessions.has(slot.inUseSessionId)) {
				slot.inUseSessionId = null;
			}
		}

		const freeAfterReclaim = this.pool.find((s) => !s.inUseSessionId);
		if (freeAfterReclaim) return freeAfterReclaim.index;
		return -1;
	}

	private getLeafContainerEl(leaf: WorkspaceLeaf): HTMLElement | null {
		const el = readUnknownProperty(leaf, "containerEl");
		if (typeof el === "object" && el !== null && "instanceOf" in el) {
			const domEl = el as HTMLElement;
			if (domEl.instanceOf(HTMLElement)) {
				return domEl;
			}
		}
		return null;
	}

	private restoreLeafContainerToHome(slot: typeof this.pool[number]): void {
		if (!slot.leaf) return;
		if (!slot.leafHomeParent) return;
		const leafEl = this.getLeafContainerEl(slot.leaf);
		if (!leafEl) return;
		if (leafEl.parentElement === slot.leafHomeParent) return;

		try {
			if (slot.leafHomeNextSibling && slot.leafHomeNextSibling.parentNode === slot.leafHomeParent) {
				slot.leafHomeParent.insertBefore(leafEl, slot.leafHomeNextSibling);
			} else {
				slot.leafHomeParent.appendChild(leafEl);
			}
		} catch { /* no-op */ }
	}

	private restoreAllLeafContainersToHome(): void {
		for (const slot of this.pool) {
			try {
				this.restoreLeafContainerToHome(slot);
			} catch { /* no-op */ }
		}
	}

	private async ensureSlotLeaf(slotIndex: number): Promise<void> {
		const slot = this.getSlot(slotIndex);
		if (slot.leaf) return;

		await new Promise<void>((resolve) => {
			this.app.workspace.onLayoutReady(() => resolve());
		});

		this.restoreAllLeafContainersToHome();

		slot.leaf = this.app.workspace.createLeafInParent(this.app.workspace.rootSplit, 0);

		const leafEl = this.getLeafContainerEl(slot.leaf);
		if (leafEl) {
			slot.leafHomeParent = leafEl.parentElement;
			slot.leafHomeNextSibling = leafEl.nextSibling;
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

		await slot.leaf.openFile(slot.file, { active: false });

		try {
			const view = slot.leaf.view as MarkdownView;
			await this.waitForEditorReady(view, 5000, 100); // 等待 5 秒，间隔 100 毫秒

			const contentEl = view.contentEl;
			if (contentEl && !slot.contentHomeParent) {
				slot.contentHomeParent = contentEl.parentElement;
				slot.contentHomeNextSibling = contentEl.nextSibling;
			}

			const leafContainer = this.getLeafContainerEl(slot.leaf);
			if (leafContainer) {
				this.hideLeafUiElements(leafContainer);
			}
			const tabEl = readUnknownProperty(slot.leaf, "tabHeaderEl") as HTMLElement | undefined;
			if (tabEl) {
				applyStyleProps(tabEl, { display: "none" });
			}
			const titleEl = readUnknownProperty(slot.leaf, "titleEl") as HTMLElement | undefined;
			if (titleEl) {
				applyStyleProps(titleEl, { display: "none" });
			}
		} catch { /* no-op */ }
	}

	private constructor(app: App) {
		this.app = app;
	}

	/**
	 * 获取单例实例
	 */
	static getInstance(app: App): ModalEditorManager {
		if (!this.instance) {
			this.instance = new ModalEditorManager(app);
		}
		return this.instance;
	}

	/**
	 * 销毁单例（插件卸载时调用）
	 */
	static destroy(): void {
		if (this.instance) {
			this.instance.destroyResources();
			this.instance = null;
		}
	}

	get studySessionCardId(): string {
		return this.STUDY_SESSION_CARD_ID;
	}

	setCurrentEditingCard(cardId: string): void {
		this.currentEditingCardUuid = cardId;
	}

	static cleanupRestoredLeaves(app: App): void {
		try {
			const leaves = app.workspace.getLeavesOfType("markdown");
			for (const leaf of leaves) {
				try {
					const view = leaf.view;
					const file = view instanceof MarkdownView ? view.file : null;
					const p = file?.path ? normalizePath(file.path) : "";
					if (!p) continue;
					if (isPluginCacheModalEditorPermanentFilePath(app, p)) {
						leaf.detach();
						continue;
					}

					// 兼容旧目录：只要命中历史 modal buffer 路径就清理
					if (isLegacyModalEditorPermanentFilePath(p)) {
						leaf.detach();
					}
				} catch { /* no-op */ }
			}
		} catch { /* no-op */ }
	}

	/**
	 * 初始化永久资源
	 */
	private async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			logger.debug("[ModalEditorManager] 初始化永久资源...");

			if (!this.hasCleanedRestoredLeaves) {
				this.hasCleanedRestoredLeaves = true;
				ModalEditorManager.cleanupRestoredLeaves(this.app);
			}

			this.pool = [];
			await this.expandPoolToSize(this.INITIAL_POOL_SIZE);

			this.isInitialized = true;
			logger.debug("[ModalEditorManager] 永久资源初始化完成");
		} catch (error) {
			logger.error("[ModalEditorManager] 初始化失败:", error);
			throw error;
		}
	}

	/**
	 * 创建编辑会话（兼容EmbeddableEditorManager接口）
	 */
	async createEditorSession(
		card: ModalEditorSessionCard,
		options?: ModalEditorSessionOptions
	): Promise<{
		success: boolean;
		sessionId?: string;
		filePath?: string;
		error?: string;
	}> {
		try {
			// 确保初始化
			await this.initialize();

			// 生成会话ID
			const sessionId = options?.isStudySession
				? options.sessionId || this.STUDY_SESSION_CARD_ID
				: options?.sessionId || card.uuid || `modal-${Date.now()}`;

			const existing = this.sessions.get(sessionId);
			if (existing) {
				return {
					success: true,
					sessionId,
					filePath: existing.backingFile.path,
				};
			}

			let slotIndex = this.allocateSlotIndex(sessionId);
			if (slotIndex < 0) {
				await this.expandPoolToSize(this.pool.length + 1);
				slotIndex = this.allocateSlotIndex(sessionId);
			}

			if (slotIndex < 0) {
				throw new Error("编辑器临时文件池已满");
			}
			const slot = this.getSlot(slotIndex);
			slot.inUseSessionId = sessionId;
			slot.lastUsedTs = Date.now();

			const backingFilePath = readUnknownString(options, "backingFilePath");
			let backingFile: TFile;
			let usePermanentBuffer = true;

			if (backingFilePath) {
				const af = this.app.vault.getAbstractFileByPath(backingFilePath);
				if (!(af instanceof TFile)) {
					throw new Error(`无法获取源文件（TFile）: ${backingFilePath}`);
				}
				backingFile = af;
				usePermanentBuffer = false;
			} else {
				backingFile = slot.file;
				usePermanentBuffer = true;
			}

			// 保存会话卡片信息（用于 finishEditing 返回完整 updatedCard）
			this.sessions.set(sessionId, {
				card: { ...card },
				backingFile,
				usePermanentBuffer,
				slotIndex,
			});

			// JSON/缓冲模式：更新缓冲文件内容
			if (usePermanentBuffer) {
				await this.app.vault.modify(backingFile, card.content ?? "");
			}

			logger.debug("[ModalEditorManager] 创建编辑会话:", sessionId);

			return {
				success: true,
				sessionId,
				filePath: backingFile.path,
			};
		} catch (error) {
			logger.error("[ModalEditorManager] 创建会话失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "创建会话失败",
			};
		}
	}

	/**
	 * 创建嵌入式编辑器（提取DOM到容器）
	 */
	async createEmbeddedEditor(
		container: HTMLElement,
		sessionId: string,
		onSave: (content: string) => void,
		onCancel: () => void,
		onChange?: (content: string) => void
	): Promise<{
		success: boolean;
		cleanup?: () => void;
		error?: string;
	}> {
		try {
			// 确保初始化
			await this.initialize();

			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			const slot = this.getSlot(session.slotIndex);

			await this.ensureSlotLeaf(session.slotIndex);

			if (!slot.leaf) {
				throw new Error("永久Leaf未初始化");
			}

			logger.debug("[ModalEditorManager] 创建嵌入式编辑器:", sessionId);

			// 保存回调
			slot.currentCallbacks = { onSave, onCancel, onChange };

			const leafContainerEl = this.getLeafContainerEl(slot.leaf);
			if (!leafContainerEl) {
				throw new Error("无法获取Leaf容器");
			}

			if (!slot.leafHomeParent) {
				slot.leafHomeParent = leafContainerEl.parentElement;
				slot.leafHomeNextSibling = leafContainerEl.nextSibling;
			}

			const prevActiveLeaf = this.getWorkspaceActiveLeaf();

			// 获取MarkdownView
			const view = slot.leaf.view as MarkdownView;

			const contentEl = view.contentEl;
			if (!contentEl) {
				throw new Error("无法获取编辑器内容容器");
			}

			if (!slot.contentHomeParent) {
				slot.contentHomeParent = contentEl.parentElement;
				slot.contentHomeNextSibling = contentEl.nextSibling;
			}

			// 打开会话对应文件（IR: 源文件；JSON: 缓冲文件）
			try {
				await slot.leaf.openFile(session.backingFile, { active: false });
			} catch (error) {
				logger.warn("[ModalEditorManager] openFile失败（忽略，继续）:", error);
			}

			await this.waitForEditorReady(view);

			// IR 源文件模式：用当前会话内容覆盖编辑器显示值（不直接写入文件）
			if (!session.usePermanentBuffer) {
				try {
					if (view.editor) {
						slot.isProgrammaticContentUpdate = true;
						view.editor.setValue(session.card.content ?? "");
					}
				} finally {
					slot.isProgrammaticContentUpdate = false;
				}
			}

			// 先清空容器，再挂载复用的 Obsidian 编辑器节点
			container.replaceChildren();
			container.appendChild(contentEl);

			applyStyleProps(contentEl, {
				position: "relative",
				left: "0",
				top: "0",
				width: "100%",
				height: "100%",
				overflow: "hidden",
				"pointer-events": "auto",
				display: "block",
				visibility: "visible",
			});
			applyStyleProps(contentEl, { zIndex: "auto" });

			await this.waitForEditorReady(view);

			// 设置样式
			this.setupEditorStyles(view.contentEl);

			// 设置键盘快捷键
			this.setupKeyboardHandlersForSlot(view.contentEl, session.slotIndex, view);

			// 设置内容变化监听
			if (onChange) {
				slot.activeChangeListenerFilePath = session.backingFile.path;
				this.setupContentChangeListenerForSlot(session.slotIndex, onChange);
			}

			const focusHandler = () => {
				if (slot.leaf) {
					this.setWorkspaceActiveLeaf(slot.leaf, true);
					try {
						view.editor?.focus();
					} catch { /* no-op */ }
				}
			};

			contentEl.addEventListener("focusin", focusHandler, true);

			this.setWorkspaceActiveLeaf(slot.leaf, true);
			try {
				view.editor?.focus();
			} catch { /* no-op */ }

			logger.debug("[ModalEditorManager] 编辑器创建成功");

			return {
				success: true,
				cleanup: () => {
					// 清理时将编辑器DOM移回隐藏Leaf
					contentEl.removeEventListener("focusin", focusHandler, true);

					if (slot.contentHomeParent) {
						try {
							if (
								slot.contentHomeNextSibling &&
								slot.contentHomeNextSibling.parentNode === slot.contentHomeParent
							) {
								slot.contentHomeParent.insertBefore(contentEl, slot.contentHomeNextSibling);
							} else {
								slot.contentHomeParent.appendChild(contentEl);
							}
						} catch { /* no-op */ }
					}

					slot.currentCallbacks = { /* no-op */ };

					slot.activeChangeListenerFilePath = null;

					if (slot.contentChangeEventRef) {
						try {
							this.app.workspace.offref(slot.contentChangeEventRef);
						} catch { /* no-op */ }
						slot.contentChangeEventRef = null;
					}

					if (prevActiveLeaf && slot.leaf && prevActiveLeaf !== slot.leaf) {
						this.setWorkspaceActiveLeaf(prevActiveLeaf, false);
					}

					slot.inUseSessionId = null;
					slot.lastUsedTs = Date.now();

					// 对齐 EmbeddableEditorManager 行为：组件卸载时结束会话
					this.sessions.delete(sessionId);
				},
			};
		} catch (error) {
			logger.error("[ModalEditorManager] 创建编辑器失败:", error);

			try {
				const session = this.sessions.get(sessionId);
				if (session) {
					const slot = this.pool[session.slotIndex];
					if (slot && slot.inUseSessionId === sessionId) {
						slot.inUseSessionId = null;
					}
					this.sessions.delete(sessionId);
				}
			} catch { /* no-op */ }

			return {
				success: false,
				error: error instanceof Error ? error.message : "创建编辑器失败",
			};
		}
	}

	/**
	 * 完成编辑
	 */
	async finishEditing(
		sessionId: string,
		_shouldSync = false,
		// 兼容 InlineCardEditor 传入的第三个参数（当前不使用）
		_options?: unknown
	): Promise<{
		success: boolean;
		updatedCard?: unknown;
		error?: string;
	}> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			const slot = this.getSlot(session.slotIndex);
			if (!slot.leaf) {
				throw new Error("永久资源未初始化");
			}

			const view = slot.leaf.view as MarkdownView;
			await this.waitForEditorReady(view);
			const content = view?.editor?.getValue?.() ?? session.card?.content ?? "";

			logger.debug("[ModalEditorManager] 完成编辑:", {
				sessionId,
				contentLength: content.length,
			});

			if (session.usePermanentBuffer) {
				try {
					slot.isProgrammaticContentUpdate = true;
					try {
						view?.editor?.setValue?.("");
					} catch { /* no-op */ }
					await this.app.vault.modify(session.backingFile, "");
				} finally {
					slot.isProgrammaticContentUpdate = false;
				}
			}

			return {
				success: true,
				updatedCard: {
					...session.card,
					content,
				},
			};
		} catch (error) {
			logger.error("[ModalEditorManager] 完成编辑失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "完成编辑失败",
			};
		}
	}

	/**
	 * 取消编辑
	 */
	async cancelEditing(sessionId: string): Promise<void> {
		logger.debug("[ModalEditorManager] 取消编辑:", sessionId);

		const session = this.sessions.get(sessionId);
		this.sessions.delete(sessionId);

		if (session) {
			try {
				const slot = this.pool[session.slotIndex];
				if (slot && slot.inUseSessionId === sessionId) {
					slot.inUseSessionId = null;
				}
			} catch { /* no-op */ }
		}

		// 仅缓冲模式清空内容，避免误清空 IR 源文件
		if (session?.usePermanentBuffer) {
			await this.app.vault.modify(session.backingFile, "");
		}
	}

	/**
	 * 更新会话内容
	 */
	async updateSessionContent(
		sessionId: string,
		content: string | undefined,
		container?: HTMLElement
	): Promise<{ success: boolean; error?: string }> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			const slot = this.getSlot(session.slotIndex);

			if (container) {
				await this.ensureSlotLeaf(session.slotIndex);
				if (!slot.leaf) {
					throw new Error("永久Leaf未初始化");
				}
				const view = slot.leaf.view as MarkdownView;
				const contentEl = view.contentEl;
				if (contentEl && contentEl.parentElement !== container) {
					if (!slot.contentHomeParent) {
						slot.contentHomeParent = contentEl.parentElement;
						slot.contentHomeNextSibling = contentEl.nextSibling;
					}

					// 先清空容器，再挂载复用的 Obsidian 编辑器节点
					container.replaceChildren();
					container.appendChild(contentEl);

					applyStyleProps(contentEl, {
						position: "relative",
						left: "0",
						top: "0",
						width: "100%",
						height: "100%",
						overflow: "hidden",
						"pointer-events": "auto",
						display: "block",
						visibility: "visible",
					});
					applyStyleProps(contentEl, { zIndex: "auto" });
				}
			}

			session.card.content = content || "";

			// IR 源文件模式：只更新编辑器显示值，不直接写文件
			if (!session.usePermanentBuffer) {
				if (slot.leaf) {
					const view = slot.leaf.view as MarkdownView;
					await this.waitForEditorReady(view);
					if (view?.editor) {
						try {
							slot.isProgrammaticContentUpdate = true;
							view.editor.setValue(content || "");
						} finally {
							slot.isProgrammaticContentUpdate = false;
						}
					}
				}

				logger.debug("[ModalEditorManager] 内容已更新（IR源文件模式，未写入文件）");
				return { success: true };
			}

			try {
				slot.isProgrammaticContentUpdate = true;
				await this.app.vault.modify(session.backingFile, content || "");
				logger.debug("[ModalEditorManager] 内容已更新");
				return { success: true };
			} finally {
				slot.isProgrammaticContentUpdate = false;
			}
		} catch (error) {
			logger.error("[ModalEditorManager] 更新内容失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "更新内容失败",
			};
		}
	}

	/**
	 * 更新会话的card对象（钉住模式用）
	 */
	async updateSessionCard(
		sessionId: string,
		newCard: ModalEditorSessionCard
	): Promise<{ success: boolean; error?: string }> {
		try {
			const session = this.sessions.get(sessionId);
			if (!session) {
				throw new Error(`会话不存在: ${sessionId}`);
			}

			const slot = this.getSlot(session.slotIndex);

			this.sessions.set(sessionId, {
				card: { ...newCard },
				backingFile: slot.file,
				usePermanentBuffer: true,
				slotIndex: session.slotIndex,
			});

			await this.app.vault.modify(slot.file, newCard.content ?? "");

			logger.debug("[ModalEditorManager] 卡片对象已更新");

			return { success: true };
		} catch (error) {
			logger.error("[ModalEditorManager] 更新卡片失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "更新卡片失败",
			};
		}
	}

	/**
	 * 设置编辑器样式
	 */
	private setupEditorStyles(editorEl: HTMLElement): void {
		applyStyleProps(editorEl, {
			background: "var(--background-primary)",
			color: "var(--text-normal)",
			height: "100%",
		});

		const cmEditor = editorEl.querySelector(".cm-editor") as HTMLElement;
		if (cmEditor) {
			applyStyleProps(cmEditor, {
				height: "100%",
				"font-size": "var(--font-text-size)",
				"font-family": "var(--font-text)",
			});
		}

		const cmContent = editorEl.querySelector(".cm-content") as HTMLElement;
		if (cmContent) {
			applyStyleProps(cmContent, {
				padding: "20px 24px",
				"min-height": "unset",
			});
		}
	}

	/**
	 * 设置键盘快捷键
	 */
	private setupKeyboardHandlersForSlot(
		editorEl: HTMLElement,
		slotIndex: number,
		view: MarkdownView
	): void {
		const slot = this.getSlot(slotIndex);

		const handleKeydown = (e: KeyboardEvent) => {
			// Ctrl+Enter 保存
			if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
				e.preventDefault();
				e.stopImmediatePropagation();
				try {
					const content = view?.editor?.getValue?.() ?? "";
					slot.currentCallbacks.onSave?.(content);
				} catch { /* no-op */ }
				return;
			}

			// Escape 取消
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				slot.currentCallbacks.onCancel?.();
				return;
			}
		};

		// 避免重复绑定导致一次按键触发多次
		const prev = this.slotKeydownHandlers.get(slot.index);
		if (prev) {
			editorEl.removeEventListener("keydown", prev, true);
		}
		this.slotKeydownHandlers.set(slot.index, handleKeydown);
		editorEl.addEventListener("keydown", handleKeydown, true);
	}

	/**
	 * 设置内容变化监听
	 */
	private setupContentChangeListenerForSlot(
		slotIndex: number,
		onChange: (content: string) => void
	): void {
		const slot = this.getSlot(slotIndex);
		if (!onChange) return;

		if (!slot.activeChangeListenerFilePath) return;

		if (slot.contentChangeEventRef) {
			try {
				this.app.workspace.offref(slot.contentChangeEventRef);
			} catch { /* no-op */ }
			slot.contentChangeEventRef = null;
		}

		const filePath = slot.activeChangeListenerFilePath;

		slot.contentChangeEventRef = this.app.workspace.on("editor-change", (editor: Editor, info) => {
			try {
				if (slot.isProgrammaticContentUpdate) return;

				if (!(info instanceof MarkdownView)) return;
				const view = info;
				if (!view.file) return;
				if (view.file.path !== filePath) return;
				onChange(editor.getValue());
			} catch { /* no-op */ }
		});
	}

	/**
	 * 清理资源（不删除永久文件）
	 */
	public cleanup(): void {
		logger.debug("[ModalEditorManager] 清理资源...");

		for (const slot of this.pool) {
			if (slot.contentChangeEventRef) {
				try {
					this.app.workspace.offref(slot.contentChangeEventRef);
				} catch { /* no-op */ }
				slot.contentChangeEventRef = null;
			}

			if (slot.leaf) {
				try {
					slot.leaf.detach();
				} catch { /* no-op */ }
				slot.leaf = null;
			}

			slot.currentCallbacks = { /* no-op */ };
			slot.leafHomeParent = null;
			slot.leafHomeNextSibling = null;
			slot.activeChangeListenerFilePath = null;
			slot.isProgrammaticContentUpdate = false;
			slot.inUseSessionId = null;
		}

		this.sessions.clear();
		this.currentEditingCardUuid = "";

		logger.debug("[ModalEditorManager] 资源清理完成");
	}

	private destroyResources(): void {
		this.cleanup();

		for (const slot of this.pool) {
			try {
				this.app.fileManager.trashFile(slot.file).catch((_err) => {
					logger.warn("[ModalEditorManager] 删除永久文件失败:", _err);
				});
			} catch { /* no-op */ }
		}

		this.pool = [];

		this.isInitialized = false;
	}
}
