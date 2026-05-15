import {
	ItemView,
	MarkdownView,
	Menu,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	normalizePath,
	setIcon,
} from "obsidian";
import type { EpubFlowMode, EpubLayoutMode, EpubReadingReferencePoint } from "../services/epub";
import { stripSupportedBookExtension } from "../services/epub/book-format";
import { EPUB_RUNTIME } from "../services/epub";
import type { EpubCanvasService } from "../services/epub/EpubCanvasService";
import { reportEpubError } from "../services/epub/epub-error";
import type { CanvasLayoutDirection } from "../services/epub/canvas-types";
import { resolveRecentEpubPath } from "../utils/epub-leaf-utils";
import { i18n } from "../utils/i18n";
import { logger } from "../utils/logger";
import { revealLeaf } from "../utils/workspace-navigation";
import { isAISelectedTextPanelHost, type EpubViewHost } from "./epub-view-host";
import { VIEW_TYPE_EPUB_SIDEBAR } from "./EpubSidebarView";
import { applyStyleProps } from "../utils/style-props";

export const VIEW_TYPE_EPUB = EPUB_RUNTIME.viewTypes.reader;

export class EpubView extends ItemView {
	private component: any = null;
	private plugin: EpubViewHost;
	private filePath = "";
	private bookTitle = "";
	private chapterTitle = "";
	private isOpen = false;
	private pendingCfi = "";
	private pendingText = "";
	private autoInsertEnabled = false;
	private screenshotModeActive = false;
	private screenshotSaveAsImage = true;
	private layoutMode: EpubLayoutMode = "paginated";
	private flowMode: EpubFlowMode = "paginated";
	private lastActiveMarkdownLeaf: WorkspaceLeaf | null = null;
	private leafChangeHandler: any = null;
	private layoutChangeHandler: any = null;
	private linkedCanvasPath: string | null = null;
	private mounting = false;
	private pendingRemount = false;
	private readerHostEl: HTMLDivElement | null = null;
	private aiPanelHostEl: HTMLDivElement | null = null;
	private inlineToolbarEl: HTMLDivElement | null = null;
	private inlineToolbarActionsEl: HTMLDivElement | null = null;
	private inlineToolbarToggleBtn: HTMLButtonElement | null = null;
	private inlineToolbarExpanded = false;
	private sidebarBtn: HTMLElement | null = null;
	private inlineSidebarBtn: HTMLButtonElement | null = null;
	private autoInsertBtn: HTMLElement | null = null;
	private inlineAutoInsertBtn: HTMLButtonElement | null = null;
	private screenshotBtn: HTMLElement | null = null;
	private inlineScreenshotBtn: HTMLButtonElement | null = null;
	private saveAsImageBtn: HTMLElement | null = null;
	private inlineSaveAsImageBtn: HTMLButtonElement | null = null;
	private flowBtn: HTMLElement | null = null;
	private inlineFlowBtn: HTMLButtonElement | null = null;
	private layoutBtn: HTMLElement | null = null;
	private inlineLayoutBtn: HTMLButtonElement | null = null;
	private canvasBtn: HTMLElement | null = null;
	private inlineCanvasBtn: HTMLButtonElement | null = null;
	private canvasDirBtn: HTMLElement | null = null;
	private inlineCanvasDirBtn: HTMLButtonElement | null = null;
	private canvasModeActive = false;
	private canvasDirection: CanvasLayoutDirection = "down";
	private readingReferenceBtn: HTMLElement | null = null;
	private inlineReadingReferenceBtn: HTMLButtonElement | null = null;
	private hasReadingReferencePoint = false;
	private resumePointBtn: HTMLElement | null = null;
	private inlineResumePointBtn: HTMLButtonElement | null = null;
	private tutorialBtn: HTMLElement | null = null;
	private inlineTutorialBtn: HTMLButtonElement | null = null;
	private bookmarkBtn: HTMLElement | null = null;
	private actionHandlers: {
		setAutoInsert?: (enabled: boolean) => void;
		setScreenshotMode?: (active: boolean) => void;
		setLayoutMode?: (mode: EpubLayoutMode) => void;
		setFlowMode?: (mode: EpubFlowMode) => void;
		openTypographyPanel?: () => void;
		setScreenshotSaveMode?: (saveAsImage: boolean) => void;
		navigateToCfi?: (cfi: string, text: string) => void;
		toggleTutorial?: () => void;
		addBookmark?: () => Promise<void>;
		saveReadingReferencePoint?: () => Promise<void>;
		saveLastOpenBookmark?: () => Promise<void>;
		bindCanvasPath?: (canvasPath: string) => void;
		unbindCanvas?: () => void;
		getCanvasService?: () => EpubCanvasService;
		canMarkIRResumePoint?: () => boolean;
		markIRResumePoint?: () => Promise<void>;
		exportCurrentChapterToMarkdown?: () => Promise<void>;
		exportBookHighlightsToMarkdown?: () => Promise<void>;
	} = {};
	private epubSelectedTextAIPanel: {
		instance: any;
		container: HTMLElement;
	} | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: EpubViewHost) {
		super(leaf);
		this.plugin = plugin;
	}

	private t(key: string, params?: Record<string, string | number>): string {
		return i18n.t(key, params);
	}

	private getCanvasDirectionLabel(direction: CanvasLayoutDirection): string {
		return this.t(`views.epubView.direction.${direction}`);
	}

	private hasWeaveIncrementalReadingHost(): boolean {
		return Boolean(this.actionHandlers.canMarkIRResumePoint?.());
	}

	getViewType(): string {
		return VIEW_TYPE_EPUB;
	}

	getDisplayText(): string {
		return this.getResolvedHeaderTitle();
	}

	getIcon(): string {
		return "book-open";
	}

	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);

		if (this.filePath) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.exportBookHighlights"));
				_item.setIcon("notebook-pen");
				_item.onClick(() => {
					void this.actionHandlers.exportBookHighlightsToMarkdown?.();
				});
			});

			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.exportCurrentChapter"));
				_item.setIcon("file-text");
				_item.onClick(() => {
					void this.actionHandlers.exportCurrentChapterToMarkdown?.();
				});
			});

			menu.addItem((_item) => {
				_item.setTitle("阅读排版调节");
				_item.setIcon("sliders-horizontal");
				_item.onClick(() => {
					window.setTimeout(() => {
						this.actionHandlers.openTypographyPanel?.();
					}, 0);
				});
			});
		}

		if (!Platform.isMobile) return;

		menu.addSeparator();
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.toggleSidebar"));
			_item.setIcon("list");
			_item.onClick(() => {
				void this.toggleGlobalSidebar();
			});
		});

		menu.addSeparator();
		this.addMobileToolsToMenu(menu);
	}

	allowNoFile(): boolean {
		return true;
	}

	getCurrentFilePath(): string {
		return normalizePath(this.filePath || "");
	}

	getState(): any {
		return { filePath: this.filePath, file: this.filePath };
	}

	async setState(state: any, result: any): Promise<void> {
		await super.setState(state, result);

		const incomingPath = state?.filePath || state?.file || "";

		if (state?.pendingCfi) {
			this.pendingCfi = state.pendingCfi;
			this.pendingText = state.pendingText || "";
		}

		if (incomingPath && incomingPath !== this.filePath) {
			this.filePath = incomingPath;
			this.bookTitle = "";
			this.chapterTitle = "";
			this.hasReadingReferencePoint = false;
			this.refreshAllActionButtons();
			this.refreshInlineToolbarVisibility();
			this.refreshViewTitle();
			if (this.isOpen) {
				await this.mountComponent();
			}
		} else if (incomingPath && !this.component && this.isOpen) {
			this.filePath = incomingPath;
			this.refreshInlineToolbarVisibility();
			this.refreshViewTitle();
			await this.mountComponent();
		} else if (this.pendingCfi && this.component) {
			this.actionHandlers.navigateToCfi?.(this.pendingCfi, this.pendingText);
			this.pendingCfi = "";
			this.pendingText = "";
		}
	}

	async onOpen(): Promise<void> {
		this.isOpen = true;
		this.contentEl.empty();
		this.contentEl.addClass("weave-epub-view-content");
		this.ensureViewShell();
		this.refreshViewTitle();

		if (!Platform.isMobile) {
			this.sidebarBtn = this.addAction("list", "切换侧边栏", () => {
				void this.toggleGlobalSidebar();
			});
		}

		this.saveAsImageBtn = this.addAction("image", "保存为图片文件（开）", () => {
			this.screenshotSaveAsImage = !this.screenshotSaveAsImage;
			this.updateSaveAsImageBtn();
			this.actionHandlers.setScreenshotSaveMode?.(this.screenshotSaveAsImage);
		});
		this.screenshotBtn = this.addAction("camera", "截图工具", () => {
			this.screenshotModeActive = !this.screenshotModeActive;
			this.updateScreenshotBtn();
			this.actionHandlers.setScreenshotMode?.(this.screenshotModeActive);
		});
		this.autoInsertBtn = this.addAction("zap", "自动模式（关：复制，开：插入）", () => {
			this.autoInsertEnabled = !this.autoInsertEnabled;
			this.updateAutoInsertBtn();
			this.actionHandlers.setAutoInsert?.(this.autoInsertEnabled);
		});
		this.bookmarkBtn = this.addAction("bookmark", "添加当前页书签", () => {
			void this.actionHandlers.addBookmark?.();
		});
		this.readingReferenceBtn = this.addAction("flag", this.t("views.epubView.label.readingReferencePointUnset"), () => {
			void this.actionHandlers.saveReadingReferencePoint?.();
		});

		if (!Platform.isMobile) {
			this.flowBtn = this.addAction("arrow-up-down", "阅读模式：翻页", () => {
				this.toggleFlowMode();
			});
			this.layoutBtn = this.addAction("scroll-text", "布局：翻页", () => {
				this.cycleLayoutMode();
			});
			this.canvasDirBtn = this.addAction("arrow-down", "Canvas 方向：向下", (evt) => {
				this.showDirectionMenu(evt);
			});
			applyStyleProps(this.canvasDirBtn, { display: "none" });
			this.canvasBtn = this.addAction("layout-dashboard", "Canvas 脑图（关）", (evt) => {
				this.showCanvasMenu(evt);
			});
			this.resumePointBtn = this.addAction("bookmark-plus", "增量阅读续读点", () => {
				void this.actionHandlers.markIRResumePoint?.();
			});
			this.tutorialBtn = this.addAction("circle-help", "使用教程", () => {
				this.actionHandlers.toggleTutorial?.();
			});
			this.positionFlowBtn();
		}
		this.refreshAllActionButtons();

		if (!Platform.isMobile) {
			this.moveSidebarBtnToNav();
			this.refreshInlineToolbarVisibility();
		}
		this.setupLeafChangeTracking();
		this.setupLinkedTabTracking();

		if (this.filePath) {
			await this.mountComponent();
		}
	}

	private async toggleGlobalSidebar(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_EPUB_SIDEBAR);
		if (existing.length > 0) {
			for (const leaf of existing) {
				leaf.detach();
			}
			return;
		}

		const leftLeaf = workspace.getLeftLeaf(false);
		if (leftLeaf) {
			await leftLeaf.setViewState({
				type: VIEW_TYPE_EPUB_SIDEBAR,
				active: true,
			});
			revealLeaf(this.app, leftLeaf);
		}
	}

	private moveSidebarBtnToNav(): void {
		if (!this.sidebarBtn) return;
		const navButtons = this.containerEl.querySelector(".view-header-nav-buttons");
		if (navButtons) {
			navButtons.appendChild(this.sidebarBtn);
		}
	}

	private ensureViewShell(): void {
		if (this.readerHostEl?.isConnected && this.aiPanelHostEl?.isConnected) {
			return;
		}

		this.contentEl.empty();
		const shellEl = this.contentEl.createDiv({ cls: "weave-epub-view-shell" });
		this.readerHostEl = shellEl.createDiv({ cls: "weave-epub-reader-host" });
		this.aiPanelHostEl = shellEl.createDiv({ cls: "epub-selected-text-ai-panel-slot is-hidden" });

		if (!Platform.isMobile) {
			this.buildInlineToolbar(shellEl);
		}
	}

	async openSelectedTextAIPanel(params: {
		selectedText: string;
		actionId: string;
		sourceLink?: string;
	}): Promise<void> {
		if (!this.filePath) {
			new Notice("未找到当前 EPUB 文件");
			return;
		}

		this.ensureViewShell();
		if (!this.aiPanelHostEl) {
			new Notice("EPUB AI 预览面板挂载点不可用");
			return;
		}

		if (!isAISelectedTextPanelHost(this.plugin)) {
			new Notice("当前宿主未提供 AI 预览能力");
			return;
		}

		await this.closeSelectedTextAIPanel();
		const container = this.aiPanelHostEl.createDiv({ cls: "weave-ai-card-panel-container" });
		this.aiPanelHostEl.removeClass("is-hidden");

		const { mount } = await import("svelte");
		const { default: SelectedTextAICardPanel } = await import(
			"../components/ai-assistant/SelectedTextAICardPanel.svelte"
		);
		const instance = mount(SelectedTextAICardPanel, {
			target: container,
			props: {
				host: this.plugin,
				selectedText: params.selectedText,
				actionId: params.actionId,
				sourceFilePath: this.filePath,
				sourceLink: params.sourceLink,
				onClose: () => {
					void this.closeSelectedTextAIPanel();
				},
			},
		});

		this.epubSelectedTextAIPanel = { instance, container };
	}

	async closeSelectedTextAIPanel(): Promise<void> {
		const existing = this.epubSelectedTextAIPanel;
		if (!existing) {
			this.aiPanelHostEl?.empty();
			this.aiPanelHostEl?.addClass("is-hidden");
			return;
		}

		const { unmount } = await import("svelte");
		try {
			void unmount(existing.instance);
		} catch (_e) {
			/* ignore */
		}

		try {
			existing.container.remove();
		} catch (_e) {
			/* ignore */
		}

		this.epubSelectedTextAIPanel = null;
		this.aiPanelHostEl?.empty();
		this.aiPanelHostEl?.addClass("is-hidden");
	}

	private buildInlineToolbar(shellEl: HTMLDivElement): void {
		this.inlineToolbarEl = shellEl.createDiv({ cls: "epub-left-inline-toolbar epub-glass-panel" });
		this.inlineToolbarToggleBtn = this.createInlineToolbarButton(
			"chevrons-right",
			"展开 EPUB 工具栏",
			() => {
				this.inlineToolbarExpanded = !this.inlineToolbarExpanded;
				this.updateInlineToolbarExpandedState();
			}
		);
		this.inlineToolbarToggleBtn.addClass("epub-left-inline-toolbar-toggle");
		this.inlineToolbarEl.appendChild(this.inlineToolbarToggleBtn);

		this.inlineToolbarActionsEl = this.inlineToolbarEl.createDiv({ cls: "epub-left-inline-toolbar-actions" });
		this.inlineSidebarBtn = this.appendInlineActionButton("list", "切换侧边栏", () => {
			void this.toggleGlobalSidebar();
		});
		this.inlineSaveAsImageBtn = this.appendInlineActionButton("image", "保存为图片文件（开）", () => {
			this.screenshotSaveAsImage = !this.screenshotSaveAsImage;
			this.updateSaveAsImageBtn();
			this.actionHandlers.setScreenshotSaveMode?.(this.screenshotSaveAsImage);
		});
		this.inlineScreenshotBtn = this.appendInlineActionButton("camera", "截图工具", () => {
			this.screenshotModeActive = !this.screenshotModeActive;
			this.updateScreenshotBtn();
			this.actionHandlers.setScreenshotMode?.(this.screenshotModeActive);
		});
		this.inlineAutoInsertBtn = this.appendInlineActionButton("zap", "自动模式（关：复制，开：插入）", () => {
			this.autoInsertEnabled = !this.autoInsertEnabled;
			this.updateAutoInsertBtn();
			this.actionHandlers.setAutoInsert?.(this.autoInsertEnabled);
		});
		this.inlineFlowBtn = this.appendInlineActionButton("arrow-up-down", "阅读模式：翻页", () => {
			this.toggleFlowMode();
		});
		this.inlineLayoutBtn = this.appendInlineActionButton("scroll-text", "布局：翻页", () => {
			this.cycleLayoutMode();
		});
		this.inlineCanvasDirBtn = this.appendInlineActionButton("arrow-down", "Canvas 方向：向下", (evt) => {
			this.showDirectionMenu(evt);
		});
		this.inlineCanvasBtn = this.appendInlineActionButton("layout-dashboard", "Canvas 脑图（关）", (evt) => {
			this.showCanvasMenu(evt);
		});
		this.inlineReadingReferenceBtn = this.appendInlineActionButton(
			"flag",
			this.t("views.epubView.label.readingReferencePointUnset"),
			() => {
				void this.actionHandlers.saveReadingReferencePoint?.();
			}
		);
		this.inlineResumePointBtn = this.appendInlineActionButton("bookmark-plus", "增量阅读续读点", () => {
			void this.actionHandlers.markIRResumePoint?.();
		});
		this.inlineTutorialBtn = this.appendInlineActionButton("circle-help", "使用教程", () => {
			this.actionHandlers.toggleTutorial?.();
		});

		this.updateInlineToolbarExpandedState();
		this.refreshAllActionButtons();
		this.refreshInlineToolbarVisibility();
	}

	private appendInlineActionButton(
		icon: string,
		label: string,
		onClick: (evt: MouseEvent) => void
	): HTMLButtonElement {
		const button = this.createInlineToolbarButton(icon, label, onClick);
		this.inlineToolbarActionsEl?.appendChild(button);
		return button;
	}

	private createInlineToolbarButton(
		icon: string,
		label: string,
		onClick: (evt: MouseEvent) => void
	): HTMLButtonElement {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "clickable-icon-button epub-left-inline-toolbar-btn";
		setIcon(button, icon);
		button.setAttribute("aria-label", label);
		button.setAttribute("title", label);
		button.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			onClick(evt);
		});
		return button;
	}

	private updateInlineToolbarExpandedState(): void {
		this.inlineToolbarEl?.toggleClass("is-expanded", this.inlineToolbarExpanded);
		this.inlineToolbarActionsEl?.toggleClass("is-expanded", this.inlineToolbarExpanded);
		if (!this.inlineToolbarToggleBtn) {
			return;
		}
		const icon = this.inlineToolbarExpanded ? "chevrons-left" : "chevrons-right";
		const label = this.inlineToolbarExpanded ? "收起 EPUB 工具栏" : "展开 EPUB 工具栏";
		setIcon(this.inlineToolbarToggleBtn, icon);
		this.inlineToolbarToggleBtn.setAttribute("aria-label", label);
		this.inlineToolbarToggleBtn.setAttribute("title", label);
		this.inlineToolbarToggleBtn.toggleClass("is-active", this.inlineToolbarExpanded);
	}

	private refreshInlineToolbarVisibility(): void {
		if (!this.inlineToolbarEl) {
			return;
		}
		const shouldShow = !Platform.isMobile && Boolean(this.filePath);
		this.inlineToolbarEl.toggleClass("is-hidden", !shouldShow);
	}

	private refreshAllActionButtons(): void {
		this.updateSaveAsImageBtn();
		this.updateScreenshotBtn();
		this.updateAutoInsertBtn();
		this.updateReadingReferencePointBtn();
		this.updateFlowBtn();
		this.updateLayoutBtn();
		this.updateCanvasBtn();
		this.updateDirectionBtn();
		this.updateResumePointBtn();
	}

	private applyActionButtonState(
		button: HTMLElement | null,
		options: {
			icon?: string;
			label?: string;
			active?: boolean;
			visible?: boolean;
		}
	): void {
		if (!button) {
			return;
		}
		if (options.icon) {
			setIcon(button, options.icon);
		}
		if (options.label) {
			button.setAttribute("aria-label", options.label);
			button.setAttribute("title", options.label);
		}
		if (typeof options.active === "boolean") {
			button.toggleClass("is-active", options.active);
		}
		if (typeof options.visible === "boolean") {
			applyStyleProps(button, { display: options.visible ? "" : "none" });
		}
	}

	private positionFlowBtn(): void {
		if (!this.flowBtn || !this.layoutBtn) return;
		const parent = this.layoutBtn.parentElement;
		if (!parent || parent !== this.flowBtn.parentElement) return;

		const direction = window.getComputedStyle(parent).flexDirection;
		if (direction === "row-reverse") {
			if (this.layoutBtn.nextSibling !== this.flowBtn) {
				parent.insertBefore(this.flowBtn, this.layoutBtn.nextSibling);
			}
			return;
		}

		if (this.layoutBtn.previousSibling !== this.flowBtn) {
			parent.insertBefore(this.flowBtn, this.layoutBtn);
		}
	}

	private getResolvedBookTitle(): string {
		if (this.bookTitle.trim()) {
			return this.bookTitle.trim();
		}

		if (this.filePath) {
			const fileName = this.filePath.split(/[\\/]/).pop() || this.filePath;
			const titleFromFile = stripSupportedBookExtension(fileName).trim();
			if (titleFromFile) {
				return titleFromFile;
			}
		}

		return "EPUB 书架";
	}

	private getResolvedHeaderTitle(): string {
		const bookTitle = this.getResolvedBookTitle();
		const chapterTitle = this.chapterTitle.trim();
		if (!chapterTitle || chapterTitle === bookTitle) {
			return bookTitle;
		}
		return `${bookTitle} - ${chapterTitle}`;
	}

	private refreshViewTitle(): void {
		const title = this.getResolvedHeaderTitle();

		try {
			if (this.leaf && typeof (this.leaf as any).updateHeader === "function") {
				(this.leaf as any).updateHeader();
			}

			this.app.workspace.trigger("layout-change");

			const titleEl = this.leaf?.view?.containerEl?.querySelector(".view-header-title");
			if (titleEl instanceof HTMLElement) {
				titleEl.textContent = title;
				titleEl.setAttribute("aria-label", title);
			}
		} catch (error) {
			logger.warn("[EpubView] Failed to refresh view title:", error);
		}
	}

	private async mountComponent(): Promise<void> {
		if (this.mounting) {
			this.pendingRemount = true;
			return;
		}

		const mountedFilePath = this.filePath;
		this.mounting = true;
		this.pendingRemount = false;
		try {
			this.ensureViewShell();
			if (this.plugin.hasEpubPremiumAccess && !this.plugin.hasEpubPremiumAccess()) {
				this.readerHostEl?.empty();
				const lockedEl = this.readerHostEl?.createDiv({
					cls: "epub-error-state",
					text: "EPUB 阅读器是高级功能，请激活许可证后使用。",
				});
				if (lockedEl && this.plugin.openEpubPremiumSettings) {
					const buttonEl = lockedEl.createEl("button", {
						text: "打开授权设置",
					});
					buttonEl.addClass("mod-cta");
					buttonEl.addEventListener("click", () => {
						this.plugin.openEpubPremiumSettings?.();
					});
				}
				return;
			}
			await this.closeSelectedTextAIPanel();
			if (this.component) {
				const { unmount: unmountOld } = await import("svelte");
				try {
					void unmountOld(this.component);
				} catch (_e) {
					/* ignore */
				}
				this.component = null;
			}
			this.readerHostEl?.empty();

			const { mount } = await import("svelte");
			const { default: EpubReaderApp } = await import("../components/epub/EpubReaderApp.svelte");
			if (!this.readerHostEl) {
				throw new Error("EPUB reader host is unavailable");
			}

			const initialPendingCfi = this.pendingCfi;
			const initialPendingText = this.pendingText;

			this.component = mount(EpubReaderApp, {
				target: this.readerHostEl,
				props: {
					app: this.app,
					filePath: this.filePath,
					onTitleChange: (title: string) => {
						this.bookTitle = title;
						this.refreshViewTitle();
					},
					onChapterTitleChange: (title: string) => {
						this.chapterTitle = String(title || "").trim();
						this.refreshViewTitle();
					},
					onReaderSettingsLoaded: (settings: {
						layoutMode: EpubLayoutMode;
						flowMode: EpubFlowMode;
					}) => {
						this.layoutMode = settings.layoutMode;
						this.flowMode = settings.flowMode;
						this.updateFlowBtn();
						this.updateLayoutBtn();
					},
					onReadingReferencePointChange: (point: EpubReadingReferencePoint | null) => {
						this.hasReadingReferencePoint = Boolean(point);
						this.updateReadingReferencePointBtn();
					},
					pendingCfi: initialPendingCfi,
					pendingText: initialPendingText,
					autoInsertEnabled: this.autoInsertEnabled,
					getLastActiveMarkdownLeaf: () => this.getValidMarkdownLeaf(),
					onBackFromBookshelf: async () => {
						await this.returnFromBookshelfToRecentBook();
					},
					onActionsReady: (actions: typeof this.actionHandlers) => {
						this.actionHandlers = actions;
					},
					onSwitchBook: async (newFilePath: string) => {
						await this.switchBookInCurrentLeaf(newFilePath);
					},
					onCanvasStateChange: (active: boolean, _canvasPath: string | null) => {
						this.canvasModeActive = active;
						this.updateCanvasBtn();
					},
				},
			});

			this.pendingCfi = "";
			this.pendingText = "";

			logger.debug("[EpubView] EPUB component mounted:", this.filePath);
		} catch (error) {
			const classified = reportEpubError(error, "open");
			this.readerHostEl?.empty();
			this.readerHostEl?.createDiv({
				cls: "epub-error-state",
				text: classified.userMessage,
			});
		} finally {
			this.mounting = false;
			if (this.pendingRemount || mountedFilePath !== this.filePath) {
				this.pendingRemount = false;
				void this.mountComponent();
			}
		}
	}

	async onClose(): Promise<void> {
		if (this.leafChangeHandler) {
			this.app.workspace.off("active-leaf-change", this.leafChangeHandler);
			this.leafChangeHandler = null;
		}
		if (this.layoutChangeHandler) {
			this.app.workspace.off("layout-change", this.layoutChangeHandler);
			this.layoutChangeHandler = null;
		}
		if (this.component) {
			const { unmount } = await import("svelte");
			try {
				void unmount(this.component);
			} catch (_e) {
				// ignore
			}
			this.component = null;
		}
		await this.closeSelectedTextAIPanel();
		this.readerHostEl = null;
		this.aiPanelHostEl = null;
		this.inlineToolbarEl = null;
		this.inlineToolbarActionsEl = null;
		this.inlineToolbarToggleBtn = null;
		this.inlineSidebarBtn = null;
		this.inlineSaveAsImageBtn = null;
		this.inlineScreenshotBtn = null;
		this.inlineAutoInsertBtn = null;
		this.inlineFlowBtn = null;
		this.inlineLayoutBtn = null;
		this.inlineCanvasDirBtn = null;
		this.inlineCanvasBtn = null;
		this.inlineReadingReferenceBtn = null;
		this.inlineResumePointBtn = null;
		this.inlineTutorialBtn = null;
		this.readingReferenceBtn = null;
		this.hasReadingReferencePoint = false;
	}

	private setupLinkedTabTracking(): void {
		this.layoutChangeHandler = () => {
			this.checkLinkedCanvasTab();
		};
		this.app.workspace.on("layout-change", this.layoutChangeHandler);
	}

	private checkLinkedCanvasTab(): void {
		const myGroup = (this.leaf as any).group;

		if (!myGroup) {
			if (this.linkedCanvasPath) {
				this.linkedCanvasPath = null;
				this.canvasModeActive = false;
				this.actionHandlers.unbindCanvas?.();
				this.updateCanvasBtn();
			}
			return;
		}

		const canvasLeaves = this.app.workspace.getLeavesOfType("canvas");
		let foundCanvasPath: string | null = null;

		for (const leaf of canvasLeaves) {
			if ((leaf as any).group === myGroup) {
				const file = (leaf.view as any)?.file;
				if (file?.path) {
					foundCanvasPath = file.path;
					break;
				}
			}
		}

		if (foundCanvasPath && foundCanvasPath !== this.linkedCanvasPath) {
			this.linkedCanvasPath = foundCanvasPath;
			this.canvasModeActive = true;
			this.actionHandlers.bindCanvasPath?.(foundCanvasPath);
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasLinked", { name: foundCanvasPath.split("/").pop() || foundCanvasPath }));
		} else if (!foundCanvasPath && this.linkedCanvasPath) {
			this.linkedCanvasPath = null;
			this.canvasModeActive = false;
			this.actionHandlers.unbindCanvas?.();
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasUnlinked"));
		}
	}

	private setupLeafChangeTracking(): void {
		this.leafChangeHandler = (leaf: WorkspaceLeaf | null) => {
			if (leaf && leaf.view instanceof MarkdownView) {
				this.lastActiveMarkdownLeaf = leaf;
			}
		};
		this.app.workspace.on("active-leaf-change", this.leafChangeHandler);

		const currentLeaves = this.app.workspace.getLeavesOfType("markdown");
		if (currentLeaves.length > 0) {
			this.lastActiveMarkdownLeaf = currentLeaves[0];
		}
	}

	private getValidMarkdownLeaf(): WorkspaceLeaf | null {
		if (this.lastActiveMarkdownLeaf) {
			try {
				const view = this.lastActiveMarkdownLeaf.view;
				if (view instanceof MarkdownView && view.editor) {
					return this.lastActiveMarkdownLeaf;
				}
			} catch (_e) {
				// stale reference
			}
		}

		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			if (leaf.view instanceof MarkdownView && leaf.view.editor) {
				this.lastActiveMarkdownLeaf = leaf;
				return leaf;
			}
		}
		return null;
	}

	private async switchBookInCurrentLeaf(newFilePath: string): Promise<void> {
		if (!newFilePath) {
			return;
		}

		if (newFilePath === this.filePath && this.component) {
			revealLeaf(this.app, this.leaf);
			return;
		}

		this.bookTitle = "";
		this.chapterTitle = "";
		this.pendingCfi = "";
		this.pendingText = "";
		await this.leaf.setViewState({
			type: VIEW_TYPE_EPUB,
			active: true,
			state: { filePath: newFilePath },
		});
		revealLeaf(this.app, this.leaf);
	}

	private async returnFromBookshelfToRecentBook(): Promise<void> {
		const recentPath = await resolveRecentEpubPath(this.app);
		if (!recentPath) {
			new Notice(this.t("views.epubView.notice.noRecentBook"));
			return;
		}

		await this.switchBookInCurrentLeaf(recentPath);
	}

	public updateBookTitle(title: string): void {
		this.bookTitle = title;
		this.refreshViewTitle();
	}

	private toggleFlowMode(): void {
		this.flowMode = this.flowMode === "scrolled" ? "paginated" : "scrolled";
		if (this.flowMode === "scrolled") {
			this.layoutMode = "paginated";
		}
		this.updateFlowBtn();
		this.updateLayoutBtn();
		this.actionHandlers.setFlowMode?.(this.flowMode);
	}

	private cycleLayoutMode(): void {
		if (Platform.isMobile) {
			this.layoutMode = "paginated";
			this.actionHandlers.setLayoutMode?.("paginated");
			return;
		}
		if (this.flowMode === "scrolled") {
			this.flowMode = "paginated";
			this.updateFlowBtn();
		}
		const modes: EpubLayoutMode[] = ["paginated", "double"];
		const idx = modes.indexOf(this.layoutMode);
		this.layoutMode = modes[(idx + 1) % modes.length];
		this.updateLayoutBtn();
		this.actionHandlers.setLayoutMode?.(this.layoutMode);
	}

	private updateFlowBtn(): void {
		const icon = this.flowMode === "scrolled" ? "scroll-text" : "arrow-up-down";
		const label = this.t("views.epubView.label.readingMode", {
			mode: this.flowMode === "scrolled"
				? this.t("views.epubView.label.readingModeScrolled")
				: this.t("views.epubView.label.readingModePaginated"),
		});
		this.applyActionButtonState(this.flowBtn, {
			icon,
			label,
			active: this.flowMode === "scrolled",
		});
		this.applyActionButtonState(this.inlineFlowBtn, {
			icon,
			label,
			active: this.flowMode === "scrolled",
		});
	}

	private updateLayoutBtn(): void {
		const iconMap: Record<EpubLayoutMode, string> = {
			paginated: "file-text",
			double: "book-open",
		};
		const layoutLabels: Record<EpubLayoutMode, string> = {
			paginated: this.t("views.epubView.label.layoutSingle"),
			double: this.t("views.epubView.label.layoutDouble"),
		};
		const label = this.t("views.epubView.label.layout", { layout: layoutLabels[this.layoutMode] });
		const icon = iconMap[this.layoutMode];
		this.applyActionButtonState(this.layoutBtn, {
			icon,
			label,
			active: this.layoutMode === "double",
		});
		this.applyActionButtonState(this.inlineLayoutBtn, {
			icon,
			label,
			active: this.layoutMode === "double",
		});
	}

	private updateSaveAsImageBtn(): void {
		const icon = this.screenshotSaveAsImage ? "image" : "code";
		const label = this.screenshotSaveAsImage
			? this.t("views.epubView.label.saveAsImageOn")
			: this.t("views.epubView.label.saveAsImageOff");
		this.applyActionButtonState(this.saveAsImageBtn, {
			icon,
			label,
			active: this.screenshotSaveAsImage,
		});
		this.applyActionButtonState(this.inlineSaveAsImageBtn, {
			icon,
			label,
			active: this.screenshotSaveAsImage,
		});
	}

	private updateScreenshotBtn(): void {
		const label = this.screenshotModeActive
			? this.t("views.epubView.label.screenshotToolOn")
			: this.t("views.epubView.label.screenshotToolOff");
		this.applyActionButtonState(this.screenshotBtn, {
			label,
			active: this.screenshotModeActive,
		});
		this.applyActionButtonState(this.inlineScreenshotBtn, {
			label,
			active: this.screenshotModeActive,
		});
	}

	private updateAutoInsertBtn(): void {
		const label = this.autoInsertEnabled
			? this.t("views.epubView.label.autoModeOn")
			: this.t("views.epubView.label.autoModeOff");
		this.applyActionButtonState(this.autoInsertBtn, {
			label,
			active: this.autoInsertEnabled,
		});
		this.applyActionButtonState(this.inlineAutoInsertBtn, {
			label,
			active: this.autoInsertEnabled,
		});
	}

	private updateReadingReferencePointBtn(): void {
		const label = this.hasReadingReferencePoint
			? this.t("views.epubView.label.readingReferencePointSet")
			: this.t("views.epubView.label.readingReferencePointUnset");
		this.applyActionButtonState(this.readingReferenceBtn, {
			icon: "flag",
			label,
			active: this.hasReadingReferencePoint,
		});
		this.applyActionButtonState(this.inlineReadingReferenceBtn, {
			icon: "flag",
			label,
			active: this.hasReadingReferencePoint,
		});
	}

	private updateCanvasBtn(): void {
		const label = this.canvasModeActive
			? this.t("views.epubView.label.canvasOn")
			: this.t("views.epubView.label.canvasOff");
		this.applyActionButtonState(this.canvasBtn, {
			icon: "layout-dashboard",
			label,
			active: this.canvasModeActive,
		});
		this.applyActionButtonState(this.inlineCanvasBtn, {
			icon: "layout-dashboard",
			label,
			active: this.canvasModeActive,
		});
		this.applyActionButtonState(this.canvasDirBtn, {
			visible: this.canvasModeActive,
		});
		this.applyActionButtonState(this.inlineCanvasDirBtn, {
			visible: this.canvasModeActive,
		});
	}

	private updateResumePointBtn(): void {
		const visible = this.hasWeaveIncrementalReadingHost();
		const label = this.t("views.epubView.menu.markResumePoint");
		this.applyActionButtonState(this.resumePointBtn, {
			icon: "bookmark-plus",
			label,
			visible,
		});
		this.applyActionButtonState(this.inlineResumePointBtn, {
			icon: "bookmark-plus",
			label,
			visible,
		});
	}

	private addMobileToolsToMenu(menu: Menu): void {
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.label.readingMode", { mode: this.t("views.epubView.label.readingModeScrolled") }));
			_item.setIcon("scroll-text");
			_item.setChecked(this.flowMode === "scrolled");
			_item.onClick(() => {
				if (this.flowMode === "scrolled") return;
				this.flowMode = "scrolled";
				this.layoutMode = "paginated";
				this.updateFlowBtn();
				this.updateLayoutBtn();
				this.actionHandlers.setFlowMode?.("scrolled");
			});
		});
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.label.readingMode", { mode: this.t("views.epubView.label.readingModePaginated") }));
			_item.setIcon("arrow-up-down");
			_item.setChecked(this.flowMode === "paginated");
			_item.onClick(() => {
				if (this.flowMode === "paginated") return;
				this.flowMode = "paginated";
				this.updateFlowBtn();
				this.updateLayoutBtn();
				this.actionHandlers.setFlowMode?.("paginated");
			});
		});
		menu.addSeparator();
		menu.addItem((_item) => {
			_item.setTitle("添加当前页书签");
			_item.setIcon("bookmark");
			_item.onClick(() => {
				void this.actionHandlers.addBookmark?.();
			});
		});
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.saveLastReadingPoint"));
			_item.setIcon("bookmark-check");
			_item.onClick(() => {
				void this.actionHandlers.saveLastOpenBookmark?.();
			});
		});
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.saveReadingReferencePoint"));
			_item.setIcon("flag");
			_item.setChecked(this.hasReadingReferencePoint);
			_item.onClick(() => {
				void this.actionHandlers.saveReadingReferencePoint?.();
			});
		});
		menu.addItem((_item) => {
			_item.setTitle(this.canvasModeActive ? this.t("views.epubView.label.canvasOn") : this.t("views.epubView.label.canvasOff"));
			_item.setIcon("layout-dashboard");
			_item.setChecked(this.canvasModeActive);
			_item.onClick((e) => {
				this.showCanvasMenu(e);
			});
		});
		if (this.canvasModeActive) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.label.canvasDirection", { direction: this.getCanvasDirectionLabel(this.canvasDirection) }));
				_item.setIcon(
					{
						down: "arrow-down",
						right: "arrow-right",
						up: "arrow-up",
						left: "arrow-left",
					}[this.canvasDirection]
				);
				_item.onClick((e) => {
					this.showDirectionMenu(e);
				});
			});
		}
		if (this.hasWeaveIncrementalReadingHost()) {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.menu.markResumePoint"));
				_item.setIcon("bookmark-plus");
				_item.onClick(() => {
					void this.actionHandlers.markIRResumePoint?.();
				});
			});
		}
		menu.addItem((_item) => {
			_item.setTitle(this.t("views.epubView.menu.tutorial"));
			_item.setIcon("circle-help");
			_item.onClick(() => {
				this.actionHandlers.toggleTutorial?.();
			});
		});
	}

	private showDirectionMenu(evt: MouseEvent | Event): void {
		const canvasService = this.actionHandlers.getCanvasService?.();
		if (!canvasService) return;

		const menu = new Menu();
		const dirs: { dir: CanvasLayoutDirection; icon: string; label: string }[] = [
			{ dir: "down", icon: "arrow-down", label: this.getCanvasDirectionLabel("down") },
			{ dir: "right", icon: "arrow-right", label: this.getCanvasDirectionLabel("right") },
			{ dir: "up", icon: "arrow-up", label: this.getCanvasDirectionLabel("up") },
			{ dir: "left", icon: "arrow-left", label: this.getCanvasDirectionLabel("left") },
		];

		for (const { dir, icon, label } of dirs) {
			menu.addItem((_item) => {
				_item.setTitle(label);
				_item.setIcon(icon);
				_item.setChecked(this.canvasDirection === dir);
				_item.onClick(() => {
					this.canvasDirection = dir;
					canvasService.setLayoutDirection(dir);
					this.updateDirectionBtn();
				});
			});
		}

		menu.showAtMouseEvent(evt as MouseEvent);
	}

	private updateDirectionBtn(): void {
		const iconMap: Record<CanvasLayoutDirection, string> = {
			down: "arrow-down",
			right: "arrow-right",
			up: "arrow-up",
			left: "arrow-left",
		};
		const label = this.t("views.epubView.label.canvasDirection", {
			direction: this.getCanvasDirectionLabel(this.canvasDirection),
		});
		const icon = iconMap[this.canvasDirection];
		this.applyActionButtonState(this.canvasDirBtn, {
			icon,
			label,
			visible: this.canvasModeActive,
		});
		this.applyActionButtonState(this.inlineCanvasDirBtn, {
			icon,
			label,
			visible: this.canvasModeActive,
		});
	}

	private showCanvasMenu(evt: MouseEvent | Event): void {
		const canvasService = this.actionHandlers.getCanvasService?.();
		if (!canvasService) return;

		const menu = new Menu();

		if (this.canvasModeActive) {
			const currentPath = canvasService.getCanvasPath();
			if (currentPath) {
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.label.canvasCurrent", { path: currentPath }));
					_item.setIcon("file");
					_item.setDisabled(true);
				});
				menu.addItem((_item) => {
					_item.setTitle(this.t("views.epubView.label.canvasOpen"));
					_item.setIcon("external-link");
					_item.onClick(() => this.openCanvasFile(currentPath));
				});
			}
			menu.addSeparator();
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.label.canvasDisconnect"));
				_item.setIcon("unlink");
				_item.onClick(() => {
					this.canvasModeActive = false;
					this.actionHandlers.unbindCanvas?.();
					this.updateCanvasBtn();
				});
			});
		} else {
			menu.addItem((_item) => {
				_item.setTitle(this.t("views.epubView.label.canvasNew"));
				_item.setIcon("plus");
				_item.onClick(() => this.createAndBindCanvas(canvasService));
			});

			const canvasFiles = this.app.vault
				.getFiles()
				.filter((f) => f.extension === "canvas")
				.sort((a, b) => b.stat.mtime - a.stat.mtime)
				.slice(0, 15);

			if (canvasFiles.length > 0) {
				menu.addSeparator();
				for (const file of canvasFiles) {
					menu.addItem((_item) => {
						_item.setTitle(file.path);
						_item.setIcon("file");
						_item.onClick(() => this.bindExistingCanvas(canvasService, file.path));
					});
				}
			}
		}

		menu.showAtMouseEvent(evt as MouseEvent);
	}

	private async createAndBindCanvas(canvasService: EpubCanvasService): Promise<void> {
		const title = this.bookTitle || "EPUB";
		const safeName = title
			.replace(/[\\/:*?"<>|]/g, "_")
			.substring(0, 40)
			.trim();
		const canvasPath = `${safeName}-mindmap.canvas`;

		try {
			await canvasService.createCanvas(canvasPath);
			this.canvasModeActive = true;
			this.actionHandlers.bindCanvasPath?.(canvasPath);
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasCreated", { path: canvasPath }));

			this.openCanvasFile(canvasPath);
		} catch (e) {
			logger.error("[EpubView] Failed to create canvas:", e);
			new Notice(this.t("views.epubView.notice.canvasCreateFailed"));
		}
	}

	private async bindExistingCanvas(_canvasService: EpubCanvasService, path: string): Promise<void> {
		try {
			this.canvasModeActive = true;
			this.actionHandlers.bindCanvasPath?.(path);
			this.updateCanvasBtn();
			new Notice(this.t("views.epubView.notice.canvasConnected", { path }));
		} catch (e) {
			logger.error("[EpubView] Failed to bind canvas:", e);
		}
	}

	private openCanvasFile(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf("split", "vertical");
			void leaf.openFile(file);
		}
	}
}
