import { Menu, type WorkspaceLeaf } from "obsidian";
import { get } from "svelte/store";
import { PREMIUM_FEATURES, PremiumFeatureGuard, type PremiumFeatureAccessContext } from "../services/premium/PremiumFeatureGuard";
import { i18n } from "./i18n";
import {
	getCardManagementToolbarMirrorActions,
	type CardManagementToolbarActionKey,
	type CardManagementMenuSurface,
	resolveCardManagementMenuSurface,
} from "./card-management-menu-policy";
import { isInSidebar } from "./view-location-utils";
import { addWeaveNavigationItems, type WeavePageId } from "./weave-navigation-menu";

const DECK_STUDY_FEATURE_CONTEXT: PremiumFeatureAccessContext = { page: "deck-study" };
const CARD_MANAGEMENT_FEATURE_CONTEXT: PremiumFeatureAccessContext = { page: "weave-card-management" };

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
	enableCardRelationFilterMode?: boolean;
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
	featureId: string,
	context?: PremiumFeatureAccessContext
): string {
	return guard.getFeatureEntryTitle(baseTitle, featureId, context);
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
		case "question-bank":
			return {
				title: i18n.t("mainMenu.deckStudy.createQuestionBank"),
				eventName: "create-question-bank",
			};
		case "memory":
		default:
			return {
				title: i18n.t("mainMenu.deckStudy.createMemoryDeck"),
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
				.setTitle(i18n.t("mainMenu.aiAssistant.history"))
				.setIcon("history")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "history",
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(i18n.t("mainMenu.aiAssistant.selectModel"))
				.setIcon("cpu")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "model",
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(i18n.t("mainMenu.aiAssistant.systemPrompt"))
				.setIcon("sliders-horizontal")
				.onClick(() => {
					dispatchWindowEvent("Weave:ai-toolbar-action", {
						action: "system-prompt",
					});
				});
		});

		menu.addItem((item) => {
			item
				.setTitle(i18n.t("mainMenu.aiAssistant.config"))
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
				.setTitle(i18n.t("mainMenu.deckStudy.switchView"))
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

		if (
			deckStudyView === "kanban"
			&& premiumGuard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW, DECK_STUDY_FEATURE_CONTEXT)
		) {
			menu.addItem((item) => {
				item
					.setTitle(i18n.t("mainMenu.deckStudy.kanbanColumnSettings"))
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
				item.setTitle(i18n.t("mainMenu.cardManagement.dataSourceSwitch")).setIcon("database");
				const submenu = (item as any).setSubmenu() as Menu;

				submenu.addItem((subItem: any) => {
					subItem
						.setTitle(i18n.t("mainMenu.cardManagement.memoryDeck"))
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
							? i18n.t("mainMenu.cardManagement.incrementalReading")
							: i18n.t("mainMenu.cardManagement.incrementalReadingPremium");

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
							? i18n.t("mainMenu.cardManagement.questionBank")
							: i18n.t("mainMenu.cardManagement.questionBankPremium");

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
					.setTitle(i18n.t("mainMenu.cardManagement.tableBasic"))
					.setIcon("table")
					.setChecked(options.tableViewMode === "basic")
					.onClick(() => {
						emitCardManagementToolbarAction("table-view-basic");
					});
			});

			if (shouldShowCardManagementMenuAction("table-view-review")) {
				menu.addItem((item) => {
					item
						.setTitle(i18n.t("mainMenu.cardManagement.tableReview"))
						.setIcon("bar-chart-2")
						.setChecked(options.tableViewMode === "review")
						.onClick(() => {
							emitCardManagementToolbarAction("table-view-review");
						});
				});
			}
		}

		if (
			inSidebar
			&& currentView === "table"
			&& cardDataSource === "incremental-reading"
			&& shouldShowCardManagementMenuAction("ir-type-md")
		) {
			menu.addItem((item) => {
				item
					.setTitle(i18n.t("mainMenu.cardManagement.irMarkdown"))
					.setIcon("file-text")
					.setChecked(options.irTypeFilter === "md")
					.onClick(() => {
						emitCardManagementToolbarAction("ir-type-md");
					});
			});

			if (shouldShowCardManagementMenuAction("ir-type-pdf")) {
				menu.addItem((item) => {
					item
						.setTitle(i18n.t("mainMenu.cardManagement.irPdf"))
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
					.setTitle(i18n.t("mainMenu.cardManagement.gridFixed"))
					.setIcon("layout-grid")
					.setChecked(gridLayoutMode === "fixed")
					.onClick(() => {
						emitCardManagementToolbarAction("grid-layout-fixed");
					});
			});

			if (shouldShowCardManagementMenuAction("grid-layout-masonry")) {
				menu.addItem((item) => {
					item
						.setTitle(i18n.t("mainMenu.cardManagement.gridMasonry"))
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
			const gridLocked = !premiumGuard.canUseFeature(
				PREMIUM_FEATURES.GRID_VIEW,
				CARD_MANAGEMENT_FEATURE_CONTEXT
			);
			menu.addItem((item) => {
				item
					.setTitle(
						getPremiumEntryTitle(
							premiumGuard,
							i18n.t("mainMenu.cardManagement.timeline"),
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
					.setTitle(i18n.t("mainMenu.cardManagement.columnManager"))
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
						.setTitle(i18n.t("mainMenu.cardManagement.kanbanCompact"))
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
						.setTitle(i18n.t("mainMenu.cardManagement.kanbanComfortable"))
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
						.setTitle(i18n.t("mainMenu.cardManagement.kanbanSpacious"))
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
						.setTitle(i18n.t("mainMenu.cardManagement.kanbanColumnSettings"))
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
					.setTitle(i18n.t("mainMenu.cardManagement.gridAttributes"))
					.setIcon("tag")
					.onClick(() => {
						emitCardManagementToolbarAction("open-grid-attribute-menu");
					});
			});
		}

		if (
			(currentView === "grid" || currentView === "kanban")
			&& shouldShowCardManagementMenuAction("toggle-card-relation-filter")
		) {
			menu.addItem((item) => {
				item
					.setTitle(i18n.t("mainMenu.cardManagement.relationMode"))
					.setIcon("link-2")
					.setChecked(options.enableCardRelationFilterMode === true)
					.onClick(() => {
						emitCardManagementToolbarAction("toggle-card-relation-filter");
					});
			});
		}

		if (inSidebar && shouldShowCardManagementMenuAction("toggle-document-filter")) {
			menu.addItem((item) => {
				item
					.setTitle(i18n.t("mainMenu.cardManagement.currentDocumentOnly"))
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
						.setTitle(i18n.t("mainMenu.cardManagement.cardLocationJump"))
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
					.setTitle(i18n.t("mainMenu.cardManagement.dataManagement"))
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
					.setTitle(i18n.t("mainMenu.deckStudy.importLegacyPackage"))
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
							i18n.t("mainMenu.deckStudy.importCsv"),
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

	}
}

export function openWeaveMainMenu(options: WeaveMainMenuOptions): Menu {
	const menu = new Menu();
	populateWeaveMainMenu(menu, options);
	showMenu(menu, options.event, options.anchorEl);
	return menu;
}

