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
import {
	emitCardManagementToolbarAction,
	type CardManagementToolbarDispatchAction,
} from "./card-management-toolbar-contract";
import { isInSidebar } from "./view-location-utils";
import { addWeaveNavigationItems, type WeavePageId } from "./weave-navigation-menu";
import {
	addMenuRadioChoices,
	addMenuSubmenuGroup,
	addMenuToggle,
	showWeaveMenuAtMouseEvent,
	showWeaveMenuAtPosition,
} from "./obsidian-menu";
import {
	dispatchLegacyApkgImportRequest,
	isLegacyApkgImportMenuVisible,
	type LegacyApkgImportNavigationVisibility,
} from "./legacy-apkg-import-action";

export type WeaveCardDataSource = "memory" | "questionBank" | "incremental-reading";
export type WeaveCardViewType = "table" | "grid" | "kanban";
export type WeaveDeckStudyFilter = "memory" | "question-bank" | "incremental-reading";
export type WeaveTableViewMode = "basic" | "review" | "questionBank" | "irContent";
export type WeaveGridLayoutMode = "fixed" | "masonry" | "timeline";
export type WeaveGridCardBorderStyle = "solid" | "dashed";
export type WeaveKanbanLayoutMode = "compact" | "comfortable" | "spacious";
export type WeaveIRTypeFilter = "all" | "md" | "pdf";

type NavigationVisibility = LegacyApkgImportNavigationVisibility & {
	csvImport?: boolean;
};

/** WeaveView.onPaneMenu 向各页分发，由页面往官方 Menu 填入条目 */
export interface WeavePopulateMainInterfaceMenuDetail {
	menu: Menu;
	page: string;
	source?: string;
}

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
	deckStudyView?: "kanban";
	deckStudyFilter?: WeaveDeckStudyFilter;
	cardDataSource?: WeaveCardDataSource;
	currentView?: WeaveCardViewType;
	tableViewMode?: WeaveTableViewMode;
	gridLayoutMode?: WeaveGridLayoutMode;
	gridCardBorderStyle?: WeaveGridCardBorderStyle;
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
		activeDocument.dispatchEvent(new CustomEvent(eventName));
		return;
	}

	activeDocument.dispatchEvent(new CustomEvent(eventName, { detail }));
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
		showWeaveMenuAtMouseEvent(menu, event);
		return;
	}

	const pos = getAnchorPosition(anchorEl);
	if (pos) {
		showWeaveMenuAtPosition(menu, pos);
		return;
	}

	showWeaveMenuAtPosition(menu, {
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

function addAiAssistantConfigMenuItem(menu: Menu): void {
	menu.addItem((item) => {
		item
			.setTitle(i18n.t("mainMenu.aiAssistant.config"))
			.setIcon("settings")
			.onClick(() => {
				dispatchWindowEvent("Weave:ai-toolbar-action", { action: "config" });
			});
	});
}

export function populateWeaveMainMenu(menu: Menu, options: WeaveMainMenuOptions): void {
	const premiumGuard = PremiumFeatureGuard.getInstance();
	const premiumState = getPremiumState(premiumGuard);
	const actionEvent =
		options.event ?? createAnchoredMouseEvent(options.anchorEl) ?? createViewportMouseEvent();
	const navigationVisibility = options.navigationVisibility ?? {};
	const deckStudyFilter = options.deckStudyFilter ?? "memory";
	const currentView = options.currentView ?? "table";
	const cardDataSource = options.cardDataSource ?? "memory";
	const gridLayoutMode = options.gridLayoutMode ?? "fixed";
	const gridCardBorderStyle = options.gridCardBorderStyle ?? "solid";
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
		addAiAssistantConfigMenuItem(menu);
	}

	if (options.currentPage === "deck-study") {
		const createEntry = getDeckStudyCreateEntry(deckStudyFilter);

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
	}

	if (options.currentPage === "weave-card-management") {
		if (shouldShowCardManagementMenuAction("data-source-switch")) {
			addMenuSubmenuGroup(
				menu,
				{ title: i18n.t("mainMenu.cardManagement.dataSourceSwitch"), icon: "database" },
				(submenu) => {
					const dataSourceChoices: Array<{
						title: string;
						icon: "brain" | "book-open" | "edit-3";
						value: WeaveCardDataSource;
					}> = [
						{
							title: i18n.t("mainMenu.cardManagement.memoryDeck"),
							icon: "brain",
							value: "memory",
						},
					];

					if (shouldShowPremiumEntry(premiumGuard, premiumState, PREMIUM_FEATURES.QUESTION_BANK)) {
						dataSourceChoices.push({
							title: premiumGuard.canUseFeature(PREMIUM_FEATURES.QUESTION_BANK)
								? i18n.t("mainMenu.cardManagement.questionBank")
								: i18n.t("mainMenu.cardManagement.questionBankPremium"),
							icon: "edit-3",
							value: "questionBank",
						});
					}

					addMenuRadioChoices(submenu, cardDataSource, dataSourceChoices, (source) => {
						options.onCardDataSourceChange?.(source);
						dispatchWindowEvent("Weave:card-data-source-change", source);
					});
				}
			);
		}

		if (
			currentView === "table"
			&& cardDataSource === "memory"
			&& (shouldShowCardManagementMenuAction("table-view-basic")
				|| shouldShowCardManagementMenuAction("table-view-review"))
		) {
			addMenuSubmenuGroup(
				menu,
				{ title: i18n.t("mainMenu.cardManagement.tableViewMode"), icon: "table" },
				(submenu) => {
					const tableViewChoices: Array<{
						title: string;
						icon: "table" | "bar-chart-2";
						value: WeaveTableViewMode;
					}> = [];

					if (shouldShowCardManagementMenuAction("table-view-basic")) {
						tableViewChoices.push({
							title: i18n.t("mainMenu.cardManagement.tableBasic"),
							icon: "table",
							value: "basic",
						});
					}

					if (shouldShowCardManagementMenuAction("table-view-review")) {
						tableViewChoices.push({
							title: i18n.t("mainMenu.cardManagement.tableReview"),
							icon: "bar-chart-2",
							value: "review",
						});
					}

					addMenuRadioChoices(
						submenu,
						options.tableViewMode ?? "basic",
						tableViewChoices,
						(mode) => {
							emitCardManagementToolbarAction(
								mode === "basic" ? "table-view-basic" : "table-view-review"
							);
						}
					);
				}
			);
		}

		if (
			inSidebar
			&& currentView === "table"
			&& cardDataSource === "incremental-reading"
			&& shouldShowCardManagementMenuAction("ir-type-md")
		) {
			const irTypeChoices: Array<{
				title: string;
				icon: "file-text" | "file";
				value: Exclude<WeaveIRTypeFilter, "all">;
			}> = [
				{
					title: i18n.t("mainMenu.cardManagement.irMarkdown"),
					icon: "file-text",
					value: "md",
				},
			];

			if (shouldShowCardManagementMenuAction("ir-type-pdf")) {
				irTypeChoices.push({
					title: i18n.t("mainMenu.cardManagement.irPdf"),
					icon: "file",
					value: "pdf",
				});
			}

			const currentIrType = options.irTypeFilter === "pdf" ? "pdf" : "md";
			addMenuRadioChoices(menu, currentIrType, irTypeChoices, (irType) => {
				emitCardManagementToolbarAction(irType === "md" ? "ir-type-md" : "ir-type-pdf");
			});
		}

		if (
			currentView === "grid"
			&& (shouldShowCardManagementMenuAction("grid-layout-fixed")
				|| shouldShowCardManagementMenuAction("grid-layout-masonry")
				|| shouldShowCardManagementMenuAction("grid-layout-timeline"))
		) {
			addMenuSubmenuGroup(
				menu,
				{ title: i18n.t("mainMenu.cardManagement.gridLayout"), icon: "layout-grid" },
				(submenu) => {
					const gridLayoutChoices: Array<{
						title: string;
						icon: "layout-grid" | "panels-top-left" | "history";
						value: WeaveGridLayoutMode;
						action: "grid-layout-fixed" | "grid-layout-masonry" | "grid-layout-timeline";
					}> = [];

					if (shouldShowCardManagementMenuAction("grid-layout-fixed")) {
						gridLayoutChoices.push({
							title: i18n.t("mainMenu.cardManagement.gridFixed"),
							icon: "layout-grid",
							value: "fixed",
							action: "grid-layout-fixed",
						});
					}

					if (shouldShowCardManagementMenuAction("grid-layout-masonry")) {
						gridLayoutChoices.push({
							title: i18n.t("mainMenu.cardManagement.gridMasonry"),
							icon: "panels-top-left",
							value: "masonry",
							action: "grid-layout-masonry",
						});
					}

					if (shouldShowCardManagementMenuAction("grid-layout-timeline")) {
						gridLayoutChoices.push({
							title: getPremiumEntryTitle(
								premiumGuard,
								i18n.t("mainMenu.cardManagement.timeline"),
								PREMIUM_FEATURES.TIMELINE_VIEW
							),
							icon: "history",
							value: "timeline",
							action: "grid-layout-timeline",
						});
					}

					addMenuRadioChoices(submenu, gridLayoutMode, gridLayoutChoices, (mode) => {
						const choice = gridLayoutChoices.find((entry) => entry.value === mode);
						if (!choice) {
							return;
						}

						if (currentView !== "grid") {
							options.onViewChange?.("grid");
						}

						emitCardManagementToolbarAction(choice.action);
					});
				}
			);
		}

		if (
			currentView === "grid"
			&& (shouldShowCardManagementMenuAction("grid-border-style-solid")
				|| shouldShowCardManagementMenuAction("grid-border-style-dashed"))
		) {
			addMenuSubmenuGroup(
				menu,
				{ title: i18n.t("mainMenu.cardManagement.gridBorderStyle"), icon: "square-dashed" },
				(submenu) => {
					const borderChoices: Array<{
						title: string;
						icon: "square" | "square-dashed";
						value: WeaveGridCardBorderStyle;
					}> = [];

					if (shouldShowCardManagementMenuAction("grid-border-style-solid")) {
						borderChoices.push({
							title: i18n.t("mainMenu.cardManagement.gridBorderSolid"),
							icon: "square",
							value: "solid",
						});
					}

					if (shouldShowCardManagementMenuAction("grid-border-style-dashed")) {
						borderChoices.push({
							title: i18n.t("mainMenu.cardManagement.gridBorderDashed"),
							icon: "square-dashed",
							value: "dashed",
						});
					}

					addMenuRadioChoices(submenu, gridCardBorderStyle, borderChoices, (style) => {
						emitCardManagementToolbarAction(
							style === "solid" ? "grid-border-style-solid" : "grid-border-style-dashed"
						);
					});
				}
			);
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
			if (
				shouldShowCardManagementMenuAction("kanban-layout-compact")
				|| shouldShowCardManagementMenuAction("kanban-layout-comfortable")
				|| shouldShowCardManagementMenuAction("kanban-layout-spacious")
			) {
				addMenuSubmenuGroup(
					menu,
					{ title: i18n.t("cardManagement.density.title"), icon: "layout-grid" },
					(submenu) => {
						const kanbanLayoutChoices: Array<{
							title: string;
							icon: "minimize-2" | "square" | "maximize-2";
							value: WeaveKanbanLayoutMode;
						}> = [];

						if (shouldShowCardManagementMenuAction("kanban-layout-compact")) {
							kanbanLayoutChoices.push({
								title: i18n.t("mainMenu.cardManagement.kanbanCompact"),
								icon: "minimize-2",
								value: "compact",
							});
						}

						if (shouldShowCardManagementMenuAction("kanban-layout-comfortable")) {
							kanbanLayoutChoices.push({
								title: i18n.t("mainMenu.cardManagement.kanbanComfortable"),
								icon: "square",
								value: "comfortable",
							});
						}

						if (shouldShowCardManagementMenuAction("kanban-layout-spacious")) {
							kanbanLayoutChoices.push({
								title: i18n.t("mainMenu.cardManagement.kanbanSpacious"),
								icon: "maximize-2",
								value: "spacious",
							});
						}

						addMenuRadioChoices(
							submenu,
							options.kanbanLayoutMode ?? "comfortable",
							kanbanLayoutChoices,
							(mode) => {
								const actionByMode: Record<WeaveKanbanLayoutMode, CardManagementToolbarDispatchAction> = {
									compact: "kanban-layout-compact",
									comfortable: "kanban-layout-comfortable",
									spacious: "kanban-layout-spacious",
								};
								emitCardManagementToolbarAction(actionByMode[mode]);
							}
						);
					}
				);
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
			addMenuToggle(menu, {
				title: i18n.t("mainMenu.cardManagement.relationMode"),
				icon: "link-2",
				getChecked: () => options.enableCardRelationFilterMode === true,
				onSetChecked: () => {
					emitCardManagementToolbarAction("toggle-card-relation-filter");
				},
			});
		}

		if (inSidebar && shouldShowCardManagementMenuAction("toggle-document-filter")) {
			addMenuToggle(menu, {
				title: i18n.t("mainMenu.cardManagement.currentDocumentOnly"),
				getIcon: () => (documentFilterMode === "current" ? "file-text" : "file"),
				getChecked: () => documentFilterMode === "current",
				isDisabled: () => !options.currentActiveDocument,
				onSetChecked: () => {
					emitCardManagementToolbarAction("toggle-document-filter");
				},
			});

			if (shouldShowCardManagementMenuAction("toggle-card-location-jump")) {
				addMenuToggle(menu, {
					title: i18n.t("mainMenu.cardManagement.cardLocationJump"),
					icon: "navigation",
					getChecked: () => enableCardLocationJump,
					onSetChecked: () => {
						emitCardManagementToolbarAction("toggle-card-location-jump");
					},
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
		if (isLegacyApkgImportMenuVisible(navigationVisibility)) {
			menu.addItem((item) => {
				item
					.setTitle(i18n.t("mainMenu.deckStudy.importLegacyPackage"))
					.setIcon("package")
					.onClick(() => {
						dispatchLegacyApkgImportRequest();
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

