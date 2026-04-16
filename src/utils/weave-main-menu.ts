import { Menu, type WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";
import { PREMIUM_FEATURES, PremiumFeatureGuard } from "../services/premium/PremiumFeatureGuard";
import {
	getCardManagementToolbarMirrorActions,
	type CardManagementToolbarActionKey,
	type CardManagementMenuSurface,
	resolveCardManagementMenuSurface,
} from "./card-management-menu-policy";
import { isInSidebar } from "./view-location-utils";
import { addWeaveNavigationItems, type WeavePageId } from "./weave-navigation-menu";

export type WeaveCardDataSource = "memory" | "questionBank" | "incremental-reading";
export type WeaveCardViewType = "table" | "grid" | "kanban";
export type WeaveDeckStudyFilter = "memory" | "question-bank" | "incremental-reading";
export type WeaveTableViewMode = "basic" | "review" | "questionBank" | "irContent";
export type WeaveGridLayoutMode = "fixed" | "masonry" | "timeline";
export type WeaveKanbanLayoutMode = "compact" | "comfortable" | "spacious";
export type WeaveIRTypeFilter = "all" | "md" | "pdf";

type NavigationVisibility = {
	apkgImport?: boolean;
	csvImport?: boolean;
	clipboardImport?: boolean;
};

export interface WeaveMainMenuOptions {
	currentPage: string;
	leaf?: WorkspaceLeaf;
	isMobile?: boolean;
	isInSidebarMode?: boolean;
	/**
	 * 可选覆盖项：默认会在“卡片管理 + 桌面端”自动根据承载位置做菜单去重。
	 * 仅在确实需要保留重复入口的特殊场景下才应显式传入 false。
	 */
	dedupeVisibleDesktopCardToolbarActions?: boolean;
	cardManagementMenuSurface?: CardManagementMenuSurface;
	navigationVisibility?: NavigationVisibility;
	deckStudyView?: "grid" | "kanban";
	deckStudyFilter?: WeaveDeckStudyFilter;
	cardDataSource?: WeaveCardDataSource;
	currentView?: WeaveCardViewType;
	tableViewMode?: WeaveTableViewMode;
	gridLayoutMode?: WeaveGridLayoutMode;
	kanbanLayoutMode?: WeaveKanbanLayoutMode;
	irTypeFilter?: WeaveIRTypeFilter;
	documentFilterMode?: "all" | "current";
	currentActiveDocument?: string | null;
	enableCardLocationJump?: boolean;
	showTableGridBorders?: boolean;
	event?: MouseEvent;
	anchorEl?: HTMLElement | null;
	onNavigate: (pageId: WeavePageId) => void;
	onCardDataSourceChange?: (source: WeaveCardDataSource) => void;
	onViewChange?: (view: WeaveCardViewType) => void;
}

function dispatchWindowEvent<T>(eventName: string, detail: T): void {
	window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function dispatchDocumentEvent<T>(eventName: string, detail?: T): void {
	if (typeof detail === "undefined") {
		document.dispatchEvent(new CustomEvent(eventName));
		return;
	}

	document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function getAnchorPosition(anchorEl?: HTMLElement | null): { x: number; y: number } | null {
	if (!(anchorEl instanceof HTMLElement)) {
		return null;
	}

	const rect = anchorEl.getBoundingClientRect();
	return {
		x: Math.round(rect.left + rect.width / 2),
		y: Math.round(rect.bottom + 8),
	};
}

function createAnchoredMouseEvent(anchorEl?: HTMLElement | null): MouseEvent | null {
	const pos = getAnchorPosition(anchorEl);
	if (!pos) {
		return null;
	}

	return new MouseEvent("click", {
		bubbles: true,
		cancelable: true,
		clientX: pos.x,
		clientY: pos.y,
		screenX: pos.x,
		screenY: pos.y,
	});
}

function createViewportMouseEvent(): MouseEvent {
	const x = Math.round(window.innerWidth / 2);
	const y = Math.max(96, Math.round(window.innerHeight / 2));

	return new MouseEvent("click", {
		bubbles: true,
		cancelable: true,
		clientX: x,
		clientY: y,
		screenX: x,
		screenY: y,
	});
}

function showMenu(menu: Menu, event?: MouseEvent, anchorEl?: HTMLElement | null): void {
	if (event) {
		menu.showAtMouseEvent(event);
		return;
	}

	const pos = getAnchorPosition(anchorEl);
	if (pos) {
		menu.showAtPosition(pos);
		return;
	}

	menu.showAtPosition({
		x: Math.round(window.innerWidth / 2),
		y: Math.max(96, Math.round(window.innerHeight / 2)),
	});
}

function getPremiumState(guard: ReturnType<typeof PremiumFeatureGuard.getInstance>): {
	isPremium: boolean;
	showPremiumPreview: boolean;
} {
	return {
		isPremium: Boolean(get(guard.isPremiumActive)),
		showPremiumPreview: Boolean(get(guard.premiumFeaturesPreviewEnabled)),
	};
}

function shouldShowPremiumEntry(
	guard: ReturnType<typeof PremiumFeatureGuard.getInstance>,
	premiumState: ReturnType<typeof getPremiumState>,
	featureId: string
): boolean {
	return guard.shouldShowFeatureEntry(featureId, premiumState);
}

function getPremiumEntryTitle(
	guard: ReturnType<typeof PremiumFeatureGuard.getInstance>,
	baseTitle: string,
	featureId: string
): string {
	return guard.canUseFeature(featureId) ? baseTitle : `${baseTitle} (\u9ad8\u7ea7)`;
}

function emitCardManagementToolbarAction(action: string, anchor?: HTMLElement | null): void {
	dispatchWindowEvent("Weave:card-management-toolbar-action", {
		action,
		anchor: anchor ?? null,
	});
}

function getDeckStudyCreateEntry(filter: WeaveDeckStudyFilter): {
	title: string;
	eventName: string;
} {
	switch (filter) {
		case "incremental-reading":
			return {
				title: "新增增量阅读专题牌组",
				eventName: "create-ir-deck",
			};
		case "question-bank":
			return {
				title: "创建考试题组",
				eventName: "create-question-bank",
			};
		case "memory":
		default:
			return {
				title: "创建记忆牌组",
				eventName: "create-deck",
			};
	}
}

export function populateWeaveMainMenu(menu: Menu, options: WeaveMainMenuOptions): void {
	const premiumGuard = PremiumFeatureGuard.getInstance();
	const premiumState = getPremiumState(premiumGuard);
	const actionEvent =
		options.event ?? createAnchoredMouseEvent(options.anchorEl) ?? createViewportMouseEvent();
	const navigationVisibility = options.navigationVisibility ?? {};
	const deckStudyView = options.deckStudyView ?? "grid";
	const deckStudyFilter = options.deckStudyFilter ?? "memory";
	const currentView = options.currentView ?? "table";
	const cardDataSource = options.cardDataSource ?? "memory";
	const gridLayoutMode = options.gridLayoutMode ?? "fixed";
	const documentFilterMode = options.documentFilterMode ?? "all";
	const enableCardLocationJump = Boolean(options.enableCardLocationJump);
	const inSidebar = typeof options.isInSidebarMode === "boolean"
		? options.isInSidebarMode
		: options.leaf
			? isInSidebar(options.leaf)
			: false;
	const cardManagementMenuSurface = options.cardManagementMenuSurface
		?? resolveCardManagementMenuSurface({
			isMobile: Boolean(options.isMobile),
			isInSidebar: inSidebar,
		});
	const shouldDedupeDesktopToolbarMirrors = options.currentPage === "weave-card-management"
		&& cardManagementMenuSurface !== "mobile"
		&& options.dedupeVisibleDesktopCardToolbarActions !== false;
	const duplicatedDesktopToolbarActions = shouldDedupeDesktopToolbarMirrors
		? getCardManagementToolbarMirrorActions({
			surface: cardManagementMenuSurface,
			currentView,
			cardDataSource,
		})
		: new Set<CardManagementToolbarActionKey>();
	const shouldShowCardManagementMenuAction = (action: CardManagementToolbarActionKey): boolean =>
		!duplicatedDesktopToolbarActions.has(action);

	addWeaveNavigationItems(menu, options.currentPage, options.onNavigate);

	menu.addSeparator();

	if (options.currentPage === "ai-assistant") {
		menu.addItem((item) => {
			item
				.setTitle("历史记录")
				.setIcon("history")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "history",
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("选择模型")
				.setIcon("cpu")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "model",
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("系统提示词")
				.setIcon("sliders-horizontal")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "system-prompt",
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle("AI制卡配置")
				.setIcon("settings")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "config",
					});
				});
		});
	}

	if (options.currentPage === "deck-study") {
		const createEntry = getDeckStudyCreateEntry(deckStudyFilter);

		menu.addItem((item) => {
			item
				.setTitle("\u5207\u6362\u89c6\u56fe")
				.setIcon("layout-grid")
				.onClick(() => {
					dispatchWindowEvent("show-view-menu", {
						event: actionEvent,
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(createEntry.title)
				.setIcon("folder-plus")
					.onClick(() => {
						dispatchDocumentEvent(createEntry.eventName, {
							event: actionEvent,
						});
					});
		});

		if (deckStudyView === "kanban") {
			menu.addItem((item) => {
				item
					.setTitle("\u770b\u677f\u5217\u8bbe\u7f6e")
					.setIcon("sliders")
					.onClick(() => {
						dispatchWindowEvent("Weave:open-deck-kanban-menu", {
							x: actionEvent.clientX,
							y: actionEvent.clientY,
						});
					});
			});
		}
	}

	if (options.currentPage === "weave-card-management") {
		if (shouldShowCardManagementMenuAction("data-source-switch")) {
			menu.addItem((item) => {
				item.setTitle("\u6570\u636e\u6e90\u5207\u6362").setIcon("database");
				const submenu = (item as any).setSubmenu() as Menu;

				submenu.addItem((subItem: any) => {
					subItem
						.setTitle("\u8bb0\u5fc6\u724c\u7ec4")
						.setIcon("brain")
						.setChecked(cardDataSource === "memory")
						.onClick(() => {
							options.onCardDataSourceChange?.("memory");
							dispatchWindowEvent("Weave:card-data-source-change", "memory");
						});
				});

				if (shouldShowPremiumEntry(premiumGuard, premiumState, PREMIUM_FEATURES.INCREMENTAL_READING)) {
					submenu.addItem((subItem: any) => {
						const title = premiumGuard.canUseFeature(PREMIUM_FEATURES.INCREMENTAL_READING)
							? "\u589e\u91cf\u9605\u8bfb"
							: "\u589e\u91cf\u9605\u8bfb (\u9ad8\u7ea7)";

						subItem
							.setTitle(title)
							.setIcon("book-open")
							.setChecked(cardDataSource === "incremental-reading")
							.onClick(() => {
								options.onCardDataSourceChange?.("incremental-reading");
								dispatchWindowEvent("Weave:card-data-source-change", "incremental-reading");
							});
					});
				}

				if (shouldShowPremiumEntry(premiumGuard, premiumState, PREMIUM_FEATURES.QUESTION_BANK)) {
					submenu.addItem((subItem: any) => {
						const title = premiumGuard.canUseFeature(PREMIUM_FEATURES.QUESTION_BANK)
							? "\u8003\u8bd5\u9898\u7ec4"
							: "\u8003\u8bd5\u9898\u7ec4 (\u9ad8\u7ea7)";

						subItem
							.setTitle(title)
							.setIcon("edit-3")
							.setChecked(cardDataSource === "questionBank")
							.onClick(() => {
								options.onCardDataSourceChange?.("questionBank");
								dispatchWindowEvent("Weave:card-data-source-change", "questionBank");
							});
					});
				}
			});
		}

		if (
			currentView === "table"
			&& cardDataSource === "memory"
			&& shouldShowCardManagementMenuAction("table-view-basic")
		) {
			menu.addItem((item) => {
				item
					.setTitle("\u57fa\u7840\u4fe1\u606f\u6a21\u5f0f")
					.setIcon("table")
					.setChecked(options.tableViewMode === "basic")
					.onClick(() => {
						emitCardManagementToolbarAction("table-view-basic");
					});
			});

			if (shouldShowCardManagementMenuAction("table-view-review")) {
				menu.addItem((item) => {
					item
						.setTitle("\u590d\u4e60\u5386\u53f2\u6a21\u5f0f")
						.setIcon("bar-chart-2")
						.setChecked(options.tableViewMode === "review")
						.onClick(() => {
							emitCardManagementToolbarAction("table-view-review");
						});
				});
			}
		}

		if (
			currentView === "table"
			&& cardDataSource === "incremental-reading"
			&& shouldShowCardManagementMenuAction("ir-type-md")
		) {
			menu.addItem((item) => {
				item
					.setTitle("Markdown 文件")
					.setIcon("file-text")
					.setChecked(options.irTypeFilter === "md")
					.onClick(() => {
						emitCardManagementToolbarAction("ir-type-md");
					});
			});

			if (shouldShowCardManagementMenuAction("ir-type-pdf")) {
				menu.addItem((item) => {
					item
						.setTitle("PDF\u4e66\u7b7e")
						.setIcon("file")
						.setChecked(options.irTypeFilter === "pdf")
						.onClick(() => {
							emitCardManagementToolbarAction("ir-type-pdf");
						});
				});
			}
		}

		if (currentView === "grid" && shouldShowCardManagementMenuAction("grid-layout-fixed")) {
			menu.addItem((item) => {
				item
					.setTitle("\u56fa\u5b9a\u5e03\u5c40")
					.setIcon("layout-grid")
					.setChecked(gridLayoutMode === "fixed")
					.onClick(() => {
						emitCardManagementToolbarAction("grid-layout-fixed");
					});
			});

			if (shouldShowCardManagementMenuAction("grid-layout-masonry")) {
				menu.addItem((item) => {
					item
						.setTitle("\u7011\u5e03\u6d41\u5e03\u5c40")
						.setIcon("panels-top-left")
						.setChecked(gridLayoutMode === "masonry")
						.onClick(() => {
							emitCardManagementToolbarAction("grid-layout-masonry");
						});
				});
			}
		}

		if (
			(shouldShowPremiumEntry(premiumGuard, premiumState, PREMIUM_FEATURES.TIMELINE_VIEW)
				|| currentView === "grid")
			&& shouldShowCardManagementMenuAction("grid-layout-timeline")
		) {
			const gridLocked = !premiumGuard.canUseFeature(PREMIUM_FEATURES.GRID_VIEW);
			menu.addItem((item) => {
				item
					.setTitle(
						getPremiumEntryTitle(
							premiumGuard,
							"\u65f6\u95f4\u7ebf\u89c6\u56fe",
							PREMIUM_FEATURES.TIMELINE_VIEW
						)
					)
					.setIcon("history")
					.setChecked(currentView === "grid" && gridLayoutMode === "timeline")
					.onClick(() => {
						if (currentView !== "grid") {
							options.onViewChange?.("grid");
							if (gridLocked) {
								return;
							}
						}

						emitCardManagementToolbarAction("grid-layout-timeline");
					});
			});
		}

		if (currentView === "table" && shouldShowCardManagementMenuAction("open-column-manager")) {
			menu.addItem((item) => {
				item
					.setTitle("\u5b57\u6bb5\u7ba1\u7406")
					.setIcon("columns-2")
					.onClick(() => {
						emitCardManagementToolbarAction("open-column-manager");
					});
			});
		}

		if (currentView === "kanban") {
			if (shouldShowCardManagementMenuAction("kanban-layout-compact")) {
				menu.addItem((item) => {
					item
						.setTitle("\u7d27\u51d1\u6a21\u5f0f")
						.setIcon("minimize-2")
						.setChecked(options.kanbanLayoutMode === "compact")
						.onClick(() => {
							emitCardManagementToolbarAction("kanban-layout-compact");
						});
				});
			}

			if (shouldShowCardManagementMenuAction("kanban-layout-comfortable")) {
				menu.addItem((item) => {
					item
						.setTitle("\u8212\u9002\u6a21\u5f0f")
						.setIcon("square")
						.setChecked(options.kanbanLayoutMode === "comfortable")
						.onClick(() => {
							emitCardManagementToolbarAction("kanban-layout-comfortable");
						});
				});
			}

			if (shouldShowCardManagementMenuAction("kanban-layout-spacious")) {
				menu.addItem((item) => {
					item
						.setTitle("\u5bbd\u677e\u6a21\u5f0f")
						.setIcon("maximize-2")
						.setChecked(options.kanbanLayoutMode === "spacious")
						.onClick(() => {
							emitCardManagementToolbarAction("kanban-layout-spacious");
						});
				});
			}

			if (shouldShowCardManagementMenuAction("open-kanban-column-settings")) {
				menu.addItem((item) => {
					item
						.setTitle("\u770b\u677f\u5217\u8bbe\u7f6e")
						.setIcon("sliders-horizontal")
						.onClick(() => {
							emitCardManagementToolbarAction("open-kanban-column-settings");
						});
				});
			}
		}

		if (
			(currentView === "grid" || currentView === "kanban")
			&& shouldShowCardManagementMenuAction("open-grid-attribute-menu")
		) {
			menu.addItem((item) => {
				item
					.setTitle("\u5361\u7247\u5c5e\u6027")
					.setIcon("tag")
					.onClick(() => {
						emitCardManagementToolbarAction("open-grid-attribute-menu");
					});
			});
		}

		if (inSidebar && shouldShowCardManagementMenuAction("toggle-document-filter")) {
			menu.addItem((item) => {
				item
					.setTitle("\u5173\u8054\u5f53\u524d\u6d3b\u52a8\u6587\u6863")
					.setIcon(documentFilterMode === "current" ? "file-text" : "file")
					.setChecked(documentFilterMode === "current")
					.setDisabled(!options.currentActiveDocument)
					.onClick(() => {
						if (options.currentActiveDocument) {
							emitCardManagementToolbarAction("toggle-document-filter");
						}
					});
			});

			if (shouldShowCardManagementMenuAction("toggle-card-location-jump")) {
				menu.addItem((item) => {
					item
						.setTitle("\u5b9a\u4f4d\u8df3\u8f6c\u6a21\u5f0f")
						.setIcon("navigation")
						.setChecked(enableCardLocationJump)
						.onClick(() => {
							emitCardManagementToolbarAction("toggle-card-location-jump");
						});
				});
			}
		}

		if (shouldShowCardManagementMenuAction("open-data-management")) {
			menu.addItem((item) => {
				item
					.setTitle("\u6570\u636e\u7ba1\u7406")
					.setIcon("database")
					.onClick(() => {
						emitCardManagementToolbarAction("open-data-management");
					});
			});
		}

		menu.addSeparator();
	}

	if (options.currentPage === "deck-study") {
		if (navigationVisibility.apkgImport !== false) {
			menu.addItem((item) => {
				item
					.setTitle("导入旧版卡包")
					.setIcon("package")
					.onClick(() => {
						dispatchDocumentEvent("apkg-import", {
							event: actionEvent,
						});
					});
			});
		}

		if (
			navigationVisibility.csvImport !== false &&
			shouldShowPremiumEntry(premiumGuard, premiumState, PREMIUM_FEATURES.CSV_IMPORT)
		) {
			menu.addItem((item) => {
				item
					.setTitle(
						getPremiumEntryTitle(
							premiumGuard,
							"\u5bfc\u5165CSV\u6587\u4ef6",
							PREMIUM_FEATURES.CSV_IMPORT
						)
					)
					.setIcon("file-text")
					.onClick(() => {
						dispatchDocumentEvent("csv-import", {
							event: actionEvent,
						});
					});
			});
		}

		if (
			navigationVisibility.clipboardImport !== false &&
			shouldShowPremiumEntry(premiumGuard, premiumState, PREMIUM_FEATURES.CLIPBOARD_IMPORT)
		) {
			menu.addItem((item) => {
				item
					.setTitle(
						getPremiumEntryTitle(
							premiumGuard,
							"\u7c98\u8d34\u5361\u7247\u6279\u91cf\u5bfc\u5165",
							PREMIUM_FEATURES.CLIPBOARD_IMPORT
						)
					)
					.setIcon("clipboard-paste")
					.onClick(() => {
						dispatchDocumentEvent("clipboard-import", {
							event: actionEvent,
						});
					});
			});
		}

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("\u64cd\u4f5c\u7ba1\u7406").setIcon("more-horizontal");
			const operationSubmenu = (item as any).setSubmenu() as Menu;

			operationSubmenu.addItem((subItem: any) => {
				subItem
					.setTitle("\u6062\u590d\u5b98\u65b9\u6559\u7a0b\u724c\u7ec4")
					.setIcon("book-open")
					.onClick(() => {
						dispatchDocumentEvent("Weave:restore-guide-deck");
					});
			});
		});

	}
}

export function openWeaveMainMenu(options: WeaveMainMenuOptions): Menu {
	const menu = new Menu();
	populateWeaveMainMenu(menu, options);
	showMenu(menu, options.event, options.anchorEl);
	return menu;
}
