import { type EventRef, ItemView, Menu, Platform } from "obsidian";
import type { WeaveIntervalHandle } from "../types/timer-handle";
import type { WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../main";
import { i18n } from "../utils/i18n";
import { logger } from "../utils/logger";
import {
	getLocationToggleIcon,
	getLocationToggleTooltip,
	getViewSurfaceTokens,
	isInSidebar,
	toggleViewLocation,
} from "../utils/view-location-utils";
import { resolveDeckStudyViewMode } from "../services/deck/deck-study-view-by-location";
import {
	type WeaveCardDataSource,
	type WeaveCardViewType,
	type WeaveDeckStudyFilter,
	type WeaveGridLayoutMode,
	type WeaveIRTypeFilter,
	type WeaveKanbanLayoutMode,
	type WeaveTableViewMode,
	populateWeaveMainMenu,
	type WeaveMainMenuOptions,
	type WeavePopulateMainInterfaceMenuDetail,
} from "../utils/weave-main-menu";
import { emitCardManagementToolbarAction } from "../utils/card-management-toolbar-contract";
import { weaveMainInterfaceStore } from "../stores/weave-main-interface-store";
import { computeMobileHeaderCenterTop } from "../utils/mobile-header-center";

export const VIEW_TYPE_WEAVE = "weave-view";

export class WeaveView extends ItemView {
	component: object | null = null;
	plugin: WeavePlugin;
	private isClosing = false;
	private currentPage = weaveMainInterfaceStore.getState().currentPage;
	private aiSelectionStateHandler: ((event: Event) => void) | null = null;
	private mainInterfaceUnsubscribe: (() => void) | null = null;
	private layoutChangeRef: EventRef | null = null;
	private surfaceLocationChangeHandler: EventListener | null = null;
	private mobileHeaderCenterComponent: object | null = null;
	private mobileHeaderCenterHost: HTMLElement | null = null;
	private mobileHeaderCenterAlignmentCleanup: (() => void) | null = null;
	private mobileHeaderCenterAlignmentRaf = 0;
	private cardManagementSearchAction: HTMLElement | null = null;
	private cardViewChangeHandler: ((event: Event) => void) | null = null;
	private deckViewChangeHandler: ((event: Event) => void) | null = null;
	private deckFilterChangeHandler: ((event: Event) => void) | null = null;
	private cardDataSourceChangeHandler: ((event: Event) => void) | null = null;
	private cardToolbarStateHandler: ((event: Event) => void) | null = null;
	private pendingLoadRetryInterval: WeaveIntervalHandle | null = null;
	private aiSelectionState = {
		hasCards: false,
		selectedCount: 0,
		totalCount: 0,
		isAllSelected: false,
	};
	private currentCardView: WeaveCardViewType = "table";
	private currentDeckStudyView = "kanban" as const;
	private currentDeckStudyFilter: WeaveDeckStudyFilter = "memory";
	private currentCardDataSource: WeaveCardDataSource = "memory";
	private cardToolbarState: {
		tableViewMode: WeaveTableViewMode;
		gridLayoutMode: WeaveGridLayoutMode;
		gridCardBorderStyle: "solid" | "dashed";
		kanbanLayoutMode: WeaveKanbanLayoutMode;
		irTypeFilter: WeaveIRTypeFilter;
		documentFilterMode: "all" | "current";
		currentActiveDocument: string | null;
		enableCardLocationJump: boolean;
		showTableGridBorders: boolean;
	} = {
		tableViewMode: "basic",
		gridLayoutMode: "fixed",
		gridCardBorderStyle: "solid",
		kanbanLayoutMode: "comfortable",
		irTypeFilter: "all",
		documentFilterMode: "all",
		currentActiveDocument: null,
		enableCardLocationJump: false,
		showTableGridBorders: false,
	};

	constructor(leaf: WorkspaceLeaf, plugin: WeavePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDeckStudyView = resolveDeckStudyViewMode();
	}

	getViewType() {
		return VIEW_TYPE_WEAVE;
	}

	getDisplayText() {
		return "Weave";
	}

	getIcon() {
		return "brain";
	}

	// 设置为可以在主编辑区打开
	allowNoFile() {
		return true;
	}

	// 设置导航类型
	getNavigationType() {
		return "tab";
	}

	private usesMobileNativeHeader(): boolean {
		return Platform.isMobile && !isInSidebar(this.leaf);
	}

	private async unmountMobileHeaderCenter(): Promise<void> {
		if (this.mobileHeaderCenterComponent) {
			try {
				const { unmount } = await import("svelte");
				await unmount(this.mobileHeaderCenterComponent);
			} catch (error) {
				logger.error("[WeaveView] 移动端顶栏圆点组件销毁失败:", error);
			}
			this.mobileHeaderCenterComponent = null;
		}

		if (this.mobileHeaderCenterAlignmentCleanup) {
			this.mobileHeaderCenterAlignmentCleanup();
			this.mobileHeaderCenterAlignmentCleanup = null;
		}
		if (this.mobileHeaderCenterAlignmentRaf !== 0) {
			window.cancelAnimationFrame(this.mobileHeaderCenterAlignmentRaf);
			this.mobileHeaderCenterAlignmentRaf = 0;
		}

		if (this.mobileHeaderCenterHost?.parentNode) {
			this.mobileHeaderCenterHost.parentNode.removeChild(this.mobileHeaderCenterHost);
		}
		this.mobileHeaderCenterHost = null;

		if (this.containerEl.instanceOf(HTMLElement)) {
			delete this.containerEl.dataset.weaveMobileNativeHeader;
		}
	}

	private async syncMobileHeaderMode(): Promise<void> {
		if (!Platform.isMobile) return;

		if (this.usesMobileNativeHeader()) {
			if (this.containerEl.instanceOf(HTMLElement)) {
				this.containerEl.dataset.weaveMobileNativeHeader = "true";
			}
			await this.mountMobileHeaderCenter();
		} else {
			await this.unmountMobileHeaderCenter();
		}

		this.updateMobileHeaderActionsVisibility();
	}

	private applySurfaceContext(): void {
		const surfaceTokens = getViewSurfaceTokens(this.leaf);
		const targets = [this.contentEl, this.contentEl.parentElement].filter(Boolean) as HTMLElement[];

		for (const target of targets) {
			target.dataset.weaveSurfaceContext = surfaceTokens.context;
			target.style.setProperty("--weave-surface-background", surfaceTokens.surfaceBackground);
			target.style.setProperty("--weave-surface", surfaceTokens.surfaceBackground);
			target.style.setProperty("--weave-elevated-background", surfaceTokens.elevatedBackground);
			target.style.setProperty("--weave-secondary-bg", surfaceTokens.elevatedBackground);
			target.style.setProperty("--weave-surface-secondary", surfaceTokens.elevatedBackground);
		}
	}

	async onOpen() {
		// 清空容器内容，防止残留
		this.contentEl.empty();

		// 直接创建主组件，无需进度条
		this.contentEl.classList.add("weave-view-content");
		this.contentEl.classList.add("weave-main-editor-mode");
		this.applySurfaceContext();
		this.layoutChangeRef = this.app.workspace.on("layout-change", () => {
			this.applySurfaceContext();
			void this.syncMobileHeaderMode();
		});

		const handleSurfaceLocationChange = () => {
			void this.syncMobileHeaderMode();
		};
		window.addEventListener(
			"Weave:surface-location-change",
			handleSurfaceLocationChange
		);
		this.surfaceLocationChangeHandler = handleSurfaceLocationChange;

		//  性能优化：异步非阻塞加载
		// 先显示加载占位符，不阻塞 Obsidian 主界面
		this.showLoadingPlaceholder();
		this.setupMobileHeaderActions();

		// 后台异步等待并加载组件
		void this.loadComponentAsync();
	}

	private setupMobileHeaderActions(): void {
		if (!Platform.isMobile) return;

		void this.syncMobileHeaderMode();

		this.cardManagementSearchAction = this.addAction("search", i18n.t("cardManagement.search"), () => {
			emitCardManagementToolbarAction("toggle-search", this.cardManagementSearchAction);
		});
		this.mainInterfaceUnsubscribe = weaveMainInterfaceStore.subscribe((state) => {
			if (this.currentPage !== state.currentPage) {
				this.currentPage = state.currentPage;
				this.updateMobileHeaderActionsVisibility();
			}

		});
		this.aiSelectionStateHandler = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					hasCards?: boolean;
					selectedCount?: number;
					totalCount?: number;
					isAllSelected?: boolean;
				}>
			).detail;
			if (!detail) return;

			this.aiSelectionState = {
				hasCards: Boolean(detail.hasCards),
				selectedCount: typeof detail.selectedCount === "number" ? detail.selectedCount : 0,
				totalCount: typeof detail.totalCount === "number" ? detail.totalCount : 0,
				isAllSelected: Boolean(detail.isAllSelected),
			};
		};
		this.cardViewChangeHandler = (event: Event) => {
			const view = (event as CustomEvent<string>).detail;
			if (view === "table" || view === "grid" || view === "kanban") {
				this.currentCardView = view;
			}
		};
		this.deckViewChangeHandler = (event: Event) => {
			const view = (event as CustomEvent<string>).detail;
			if (view === "kanban") {
				this.currentDeckStudyView = "kanban";
			}
		};
		this.deckFilterChangeHandler = (event: Event) => {
			const filter = (event as CustomEvent<string>).detail;
			if (
				filter === "memory" ||
				filter === "question-bank"
			) {
				this.currentDeckStudyFilter = filter;
			}
		};
		this.cardDataSourceChangeHandler = (event: Event) => {
			const source = (event as CustomEvent<string>).detail;
			if (
				source === "memory" ||
				source === "questionBank"
			) {
				this.currentCardDataSource = source;
			}
		};
		this.cardToolbarStateHandler = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					tableViewMode?: WeaveTableViewMode;
					gridLayout?: WeaveGridLayoutMode;
					gridCardBorderStyle?: "solid" | "dashed";
					kanbanLayoutMode?: WeaveKanbanLayoutMode;
					irTypeFilter?: WeaveIRTypeFilter;
					documentFilterMode?: "all" | "current";
					currentActiveDocument?: string | null;
					enableCardLocationJump?: boolean;
					showTableGridBorders?: boolean;
					dataSource?: WeaveCardDataSource;
				}>
			).detail;
			if (!detail) return;

			if (detail.tableViewMode) {
				this.cardToolbarState.tableViewMode = detail.tableViewMode;
			}
			if (detail.gridLayout) {
				this.cardToolbarState.gridLayoutMode = detail.gridLayout;
			}
			if (detail.gridCardBorderStyle === "solid" || detail.gridCardBorderStyle === "dashed") {
				this.cardToolbarState.gridCardBorderStyle = detail.gridCardBorderStyle;
			}
			if (detail.kanbanLayoutMode) {
				this.cardToolbarState.kanbanLayoutMode = detail.kanbanLayoutMode;
			}
			if (detail.irTypeFilter) {
				this.cardToolbarState.irTypeFilter = detail.irTypeFilter;
			}
			if (detail.documentFilterMode) {
				this.cardToolbarState.documentFilterMode = detail.documentFilterMode;
			}
			if ("currentActiveDocument" in detail) {
				this.cardToolbarState.currentActiveDocument = detail.currentActiveDocument ?? null;
			}
			if (typeof detail.enableCardLocationJump === "boolean") {
				this.cardToolbarState.enableCardLocationJump = detail.enableCardLocationJump;
			}
			if (typeof detail.showTableGridBorders === "boolean") {
				this.cardToolbarState.showTableGridBorders = detail.showTableGridBorders;
			}
			if (
				detail.dataSource === "memory" ||
				detail.dataSource === "questionBank"
			) {
				this.currentCardDataSource = detail.dataSource;
			}
		};
		window.addEventListener(
			"Weave:ai-selection-state-change",
			this.aiSelectionStateHandler
		);
		window.addEventListener("Weave:card-view-change", this.cardViewChangeHandler);
		window.addEventListener("Weave:deck-view-change", this.deckViewChangeHandler);
		window.addEventListener(
			"Weave:deck-filter-change",
			this.deckFilterChangeHandler
		);
		window.addEventListener(
			"Weave:card-data-source-change",
			this.cardDataSourceChangeHandler
		);
		window.addEventListener(
			"Weave:card-management-toolbar-state",
			this.cardToolbarStateHandler
		);
		this.updateMobileHeaderActionsVisibility();
	}

	private buildWeaveMainMenuOptions(): WeaveMainMenuOptions {
		return {
			currentPage: this.currentPage,
			leaf: this.leaf,
			isMobile: Platform.isMobile,
			navigationVisibility: weaveMainInterfaceStore.getState().navigationVisibility,
			deckStudyView: this.currentDeckStudyView,
			deckStudyFilter: this.currentDeckStudyFilter,
			cardDataSource: this.currentCardDataSource,
			currentView: this.currentCardView,
			tableViewMode: this.cardToolbarState.tableViewMode,
			gridLayoutMode: this.cardToolbarState.gridLayoutMode,
			gridCardBorderStyle: this.cardToolbarState.gridCardBorderStyle,
			kanbanLayoutMode: this.cardToolbarState.kanbanLayoutMode,
			irTypeFilter: this.cardToolbarState.irTypeFilter,
			documentFilterMode: this.cardToolbarState.documentFilterMode,
			currentActiveDocument: this.cardToolbarState.currentActiveDocument,
			enableCardLocationJump: this.cardToolbarState.enableCardLocationJump,
			showTableGridBorders: this.cardToolbarState.showTableGridBorders,
			onNavigate: (pageId) => {
				weaveMainInterfaceStore.setCurrentPage(pageId);
				window.dispatchEvent(new CustomEvent("Weave:navigate", { detail: pageId }));
			},
			onCardDataSourceChange: (source) => {
				this.currentCardDataSource = source;
			},
			onViewChange: (view) => {
				this.currentCardView = view;
			},
		};
	}

	private populateMobileMainInterfaceMenu(menu: Menu): void {
		const populateRequest = new CustomEvent<WeavePopulateMainInterfaceMenuDetail>(
			"Weave:populate-main-interface-menu",
			{
				cancelable: true,
				detail: {
					menu,
					page: this.currentPage,
					source: "pane-menu",
				},
			}
		);
		const handledByPage = !window.dispatchEvent(populateRequest);
		if (!handledByPage) {
			populateWeaveMainMenu(menu, this.buildWeaveMainMenuOptions());
		}
	}

	private updateMobileHeaderActionsVisibility(): void {
		const cardSearchVisible =
			this.usesMobileNativeHeader() && this.currentPage === "weave-card-management";

		if (this.cardManagementSearchAction) {
			this.cardManagementSearchAction.style.display = cardSearchVisible ? "" : "none";
		}

		if (this.usesMobileNativeHeader()) {
			this.scheduleMobileHeaderCenterAlignment();
		}
	}

	private resolveMobileHeaderHost(): HTMLElement | null {
		if (!(this.containerEl.instanceOf(HTMLElement))) {
			return null;
		}

		if (!this.usesMobileNativeHeader()) {
			return null;
		}

		this.containerEl.dataset.weaveMobileNativeHeader = "true";
		const viewHeader = this.containerEl.querySelector(".view-header");
		if (!(viewHeader instanceof HTMLElement)) {
			return null;
		}

		let host: HTMLElement | null =
			this.mobileHeaderCenterHost instanceof HTMLElement
				? this.mobileHeaderCenterHost
				: viewHeader.querySelector(".weave-mobile-header-center-host");

		if (!(host instanceof HTMLElement)) {
			host = activeDocument.createElement("div");
			host.className = "weave-mobile-header-center-host";
		}

		if (host.parentElement !== viewHeader) {
			viewHeader.appendChild(host);
		}

		this.mobileHeaderCenterHost = host;
		this.ensureMobileHeaderCenterAlignment(viewHeader, host);
		this.scheduleMobileHeaderCenterAlignment();
		return host;
	}

	private getMobileHeaderAlignmentCandidates(
		viewHeader: HTMLElement,
		host: HTMLElement
	): HTMLElement[] {
		const candidates = new Set<HTMLElement>();
		const selectors = [".clickable-icon", ".view-action", "button"];

		for (const selector of selectors) {
			for (const node of viewHeader.querySelectorAll(selector)) {
				if (!(node.instanceOf(HTMLElement))) continue;
				if (host.contains(node)) continue;
				if (!node.isConnected) continue;

				const computedStyle = window.getComputedStyle(node);
				if (
					computedStyle.display === "none" ||
					computedStyle.visibility === "hidden" ||
					computedStyle.opacity === "0"
				) {
					continue;
				}

				const rect = node.getBoundingClientRect();
				if (rect.width <= 0 || rect.height <= 0) continue;
				if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;

				candidates.add(node);
			}
		}

		return [...candidates];
	}

	private alignMobileHeaderCenterHost(): void {
		this.mobileHeaderCenterAlignmentRaf = 0;

		const host = this.mobileHeaderCenterHost;
		const viewHeader = host?.parentElement;
		if (!(host instanceof HTMLElement) || !(viewHeader instanceof HTMLElement)) {
			return;
		}

		const headerRect = viewHeader.getBoundingClientRect();
		const candidateRects = this.getMobileHeaderAlignmentCandidates(viewHeader, host).map((element) =>
			element.getBoundingClientRect()
		);
		const top = computeMobileHeaderCenterTop(headerRect, candidateRects);

		if (typeof top === "number") {
			host.style.top = `${Math.round(top)}px`;
		} else {
			host.style.removeProperty("top");
		}
	}

	private scheduleMobileHeaderCenterAlignment(): void {
		if (this.mobileHeaderCenterAlignmentRaf !== 0) {
			return;
		}

		this.mobileHeaderCenterAlignmentRaf = window.requestAnimationFrame(() => {
			this.alignMobileHeaderCenterHost();
		});
	}

	private ensureMobileHeaderCenterAlignment(viewHeader: HTMLElement, host: HTMLElement): void {
		if (this.mobileHeaderCenterAlignmentCleanup) {
			this.mobileHeaderCenterAlignmentCleanup();
			this.mobileHeaderCenterAlignmentCleanup = null;
		}

		const scheduleAlignment = () => {
			this.scheduleMobileHeaderCenterAlignment();
		};

		const resizeObserver =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(() => {
						scheduleAlignment();
				  })
				: null;
		const mutationObserver =
			typeof MutationObserver !== "undefined"
				? new MutationObserver(() => {
						scheduleAlignment();
				  })
				: null;

		resizeObserver?.observe(viewHeader);
		mutationObserver?.observe(viewHeader, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["class", "style", "hidden", "aria-hidden"],
		});
		mutationObserver?.observe(activeDocument.body, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});

		window.addEventListener("resize", scheduleAlignment);
		window.addEventListener("orientationchange", scheduleAlignment);
		window.visualViewport?.addEventListener("resize", scheduleAlignment);
		window.visualViewport?.addEventListener("scroll", scheduleAlignment);

		this.mobileHeaderCenterAlignmentCleanup = () => {
			resizeObserver?.disconnect();
			mutationObserver?.disconnect();
			window.removeEventListener("resize", scheduleAlignment);
			window.removeEventListener("orientationchange", scheduleAlignment);
			window.visualViewport?.removeEventListener("resize", scheduleAlignment);
			window.visualViewport?.removeEventListener("scroll", scheduleAlignment);
		};

		void host;
	}

	private async mountMobileHeaderCenter(): Promise<void> {
		if (!this.usesMobileNativeHeader()) return;

		const host = this.resolveMobileHeaderHost();
		if (!host) return;
		if (!Platform.isMobile || this.mobileHeaderCenterComponent) return;

		try {
			const { mount } = await import("svelte");
			const { default: Component } = await import(
				"../components/navigation/WeaveMobileHeaderCenter.svelte"
			);

			host.empty();
			this.mobileHeaderCenterComponent = mount(Component, {
				target: host,
			});
			this.scheduleMobileHeaderCenterAlignment();
		} catch (error) {
			logger.error("[WeaveView] 挂载移动端原生顶栏圆点失败:", error);
		}
	}

	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu?.(menu, source);

		if (!Platform.isMobile) return;

		if (this.currentPage === "ai-assistant" && this.aiSelectionState.hasCards) {
			menu.addSeparator();
			menu.addItem((item) => {
				const shouldDeselect = this.aiSelectionState.isAllSelected;
				item
					.setTitle(shouldDeselect ? i18n.t("views.weave.deselectAll") : i18n.t("views.weave.selectAllCards"))
					.setIcon(shouldDeselect ? "square" : "check-square")
					.onClick(() => {
						window.dispatchEvent(
							new CustomEvent("Weave:ai-selection-action", {
								detail: { action: shouldDeselect ? "deselect-all" : "select-all" },
							})
						);
					});
			});
		}

		menu.addSeparator();
		this.populateMobileMainInterfaceMenu(menu);

		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle(getLocationToggleTooltip(this.leaf))
				.setIcon(getLocationToggleIcon(this.leaf))
				.onClick(async () => {
					await toggleViewLocation(this, "right");
				});
		});
	}

	/**
	 * 显示加载占位符
	 */
	private showLoadingPlaceholder(): void {
		this.renderLoadingState({
			title: i18n.t("views.weave.loadingInitTitle"),
			message: i18n.t("views.weave.loadingInitMessage"),
		});
	}

	private renderLoadingState(options: { title: string; message?: string; hint?: string }): void {
		this.contentEl.empty();
		const loadingRoot = this.contentEl.createDiv({ cls: "weave-view-loading" });
		const loadingShell = loadingRoot.createDiv({ cls: "weave-view-loading-shell" });
		const loadingBadge = loadingShell.createDiv({ cls: "weave-view-loading-badge" });
		loadingBadge.createSpan({ cls: "weave-view-loading-badge-dot" });
		loadingBadge.createSpan({ cls: "weave-view-loading-badge-label", text: "Weave" });

		loadingShell.createDiv({ cls: "weave-view-loading-spinner" });
		loadingShell.createDiv({ cls: "weave-view-loading-title", text: options.title });

		if (options.message) {
			loadingShell.createDiv({ cls: "weave-view-loading-text", text: options.message });
		}

		if (options.hint) {
			loadingShell.createDiv({ cls: "weave-view-loading-hint", text: options.hint });
		}
	}

	/**
	 * 异步加载组件（不阻塞 onOpen）
	 */
	private async loadComponentAsync(): Promise<void> {
		try {
			if (this.isClosing) {
				return;
			}

			// 异步等待 dataStorage 初始化
			await this.waitForDataStorage();

			if (this.isClosing) {
				return;
			}

			// 检查 dataStorage 是否已初始化
			if (!this.plugin.dataStorage) {
				logger.warn("[WeaveView] dataStorage 未初始化，显示等待状态");
				this.renderLoadingState({
					title: i18n.t("views.weave.loadingDataTitle"),
					message: i18n.t("views.weave.loadingDataMessage"),
					hint: i18n.t("views.weave.loadingDataHint"),
				});

				// 继续等待，每秒检查一次
				if (!this.pendingLoadRetryInterval) {
					this.pendingLoadRetryInterval = window.setInterval(() => {
						void (async () => {
							if (this.isClosing) {
								if (this.pendingLoadRetryInterval) {
									window.clearInterval(this.pendingLoadRetryInterval);
									this.pendingLoadRetryInterval = null;
								}
								return;
							}

							if (this.plugin.dataStorage) {
								if (this.pendingLoadRetryInterval) {
									window.clearInterval(this.pendingLoadRetryInterval);
									this.pendingLoadRetryInterval = null;
								}
								await this.loadComponentAsync();
							}
						})();
					}, 1000);
				}

				return;
			}

			if (this.pendingLoadRetryInterval) {
				window.clearInterval(this.pendingLoadRetryInterval);
				this.pendingLoadRetryInterval = null;
			}

			// 清空占位符
			this.contentEl.empty();
			this.contentEl.classList.add("weave-view-content");
			this.contentEl.classList.add("weave-main-editor-mode");

			// 创建主组件
			await this.createMainComponent();
		} catch (error) {
			logger.error("[WeaveView] 组件加载失败:", error);
			this.contentEl.empty();
			const errorDiv = this.contentEl.createDiv({ cls: "weave-view-error" });
			errorDiv.createDiv({ cls: "error-icon", text: i18n.t("common.warning") });
			errorDiv.createDiv({ cls: "error-text", text: i18n.t("views.weave.initFailedTitle") });
			errorDiv.createDiv({ cls: "error-hint", text: i18n.t("views.weave.initFailedHint") });
		}
	}

	/**
	 * 等待所有核心服务初始化完成（异步，不阻塞界面）
	 * 使用事件驱动方式，比轮询更高效
	 */
	private async waitForDataStorage(): Promise<void> {
		if (this.plugin.dataStorage) {
			return;
		}

		logger.debug("[WeaveView] 等待 allCoreServices 初始化...");

		try {
			const { waitForServiceReady } = await import("../utils/service-ready-event");
			await waitForServiceReady("allCoreServices", 15000);
			logger.debug("[WeaveView] allCoreServices 已就绪（事件通知）");
		} catch {
			logger.warn("[WeaveView] 事件等待超时，回退到轮询检查");

			const maxAttempts = 20;
			const interval = 100;

			for (let i = 0; i < maxAttempts; i++) {
				if (this.plugin.dataStorage) {
					logger.debug(`[WeaveView] allCoreServices 已就绪（轮询 ${i * interval}ms）`);
					return;
				}
				await new Promise((resolve) => window.setTimeout(resolve, interval));
			}

			logger.warn("[WeaveView] dataStorage 初始化超时，将显示加载状态");
		}
	}

	private async createMainComponent() {
		try {
			// 动态导入主组件，实现懒加载
			const { mount } = await import("svelte");
			const { default: Component } = await import("../components/WeaveApp.svelte");

			this.component = mount(Component, {
				target: this.contentEl,
				props: {
					plugin: this.plugin,
					dataStorage: this.plugin.dataStorage,
					fsrs: this.plugin.fsrs,
					currentLeaf: this.leaf,
				},
			});

			void this.syncMobileHeaderMode();
		} catch (error) {
			logger.error("Failed to create WeaveView component:", error);
			this.contentEl.createDiv({ cls: "error", text: i18n.t("views.weave.loadFailed") });
		}
	}

	async onClose() {
		//  防止重入：视图关闭时设置标志
		if (this.isClosing) {
			logger.debug("[WeaveView] 防止重复关闭");
			return;
		}
		this.isClosing = true;

		if (this.pendingLoadRetryInterval) {
			window.clearInterval(this.pendingLoadRetryInterval);
			this.pendingLoadRetryInterval = null;
		}

		if (this.layoutChangeRef) {
			this.app.workspace.offref(this.layoutChangeRef);
			this.layoutChangeRef = null;
		}

		if (this.surfaceLocationChangeHandler) {
			window.removeEventListener(
				"Weave:surface-location-change",
				this.surfaceLocationChangeHandler
			);
			this.surfaceLocationChangeHandler = null;
		}

		if (this.mobileHeaderCenterComponent) {
			try {
				const { unmount } = await import("svelte");
				void unmount(this.mobileHeaderCenterComponent);
				this.mobileHeaderCenterComponent = null;
			} catch (error) {
				logger.error("[WeaveView] 移动端顶栏圆点组件销毁失败:", error);
			}
		}

		if (this.mobileHeaderCenterAlignmentCleanup) {
			this.mobileHeaderCenterAlignmentCleanup();
			this.mobileHeaderCenterAlignmentCleanup = null;
		}
		if (this.mobileHeaderCenterAlignmentRaf !== 0) {
			window.cancelAnimationFrame(this.mobileHeaderCenterAlignmentRaf);
			this.mobileHeaderCenterAlignmentRaf = 0;
		}

		if (this.mobileHeaderCenterHost?.parentNode) {
			this.mobileHeaderCenterHost.parentNode.removeChild(this.mobileHeaderCenterHost);
		}
		this.mobileHeaderCenterHost = null;
		delete this.containerEl.dataset.weaveMobileNativeHeader;
		this.cardManagementSearchAction = null;

		//  安全销毁组件
		if (this.component) {
			try {
				const { unmount } = await import("svelte");
				void unmount(this.component);
				this.component = null;
			} catch (error) {
				logger.error("[WeaveView] 组件销毁失败:", error);
			}
		}

		//  清空容器内容
		this.contentEl.empty();

		if (this.mainInterfaceUnsubscribe) {
			this.mainInterfaceUnsubscribe();
			this.mainInterfaceUnsubscribe = null;
		}
		if (this.aiSelectionStateHandler) {
			window.removeEventListener(
				"Weave:ai-selection-state-change",
				this.aiSelectionStateHandler
			);
			this.aiSelectionStateHandler = null;
		}
		if (this.cardViewChangeHandler) {
			window.removeEventListener("Weave:card-view-change", this.cardViewChangeHandler);
			this.cardViewChangeHandler = null;
		}
		if (this.deckViewChangeHandler) {
			window.removeEventListener("Weave:deck-view-change", this.deckViewChangeHandler);
			this.deckViewChangeHandler = null;
		}
		if (this.deckFilterChangeHandler) {
			window.removeEventListener(
				"Weave:deck-filter-change",
				this.deckFilterChangeHandler
			);
			this.deckFilterChangeHandler = null;
		}
		if (this.cardDataSourceChangeHandler) {
			window.removeEventListener(
				"Weave:card-data-source-change",
				this.cardDataSourceChangeHandler
			);
			this.cardDataSourceChangeHandler = null;
		}
		if (this.cardToolbarStateHandler) {
			window.removeEventListener(
				"Weave:card-management-toolbar-state",
				this.cardToolbarStateHandler
			);
			this.cardToolbarStateHandler = null;
		}
	}
}
