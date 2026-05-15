/**
 * 卡片管理菜单/顶部工具栏显隐策略
 *
 * 这份策略专门解决一个长期问题：
 * 同一批“卡片管理局部操作”既可能出现在顶部工具栏，也可能出现在多功能菜单里。
 * 如果菜单和顶部各自维护一套条件，后续很容易出现：
 * 1. 桌面内容区重复显示
 * 2. 侧边栏该保留的菜单项被误隐藏
 * 3. 移动端沿用桌面去重规则，导致入口缺失
 *
 * 因此这里把“当前界面属于哪一种承载环境”以及“哪些操作应视为已由顶部承担”
 * 收口成单一策略源，供菜单去重逻辑统一复用。
 *
 * 注意：
 * - 这里描述的是“菜单应不应该再重复显示”的策略，不等同于每个按钮的 DOM 渲染细节。
 * - 尤其是桌面内容区下的“时间线视图”：
 *   虽然不一定始终以独立按钮直接出现在顶部，但它属于桌面主工作区的局部视图控制范畴，
 *   为了让多功能菜单保持精简，仍然视为“不要在菜单中重复堆叠”的操作。
 */

export type CardManagementToolbarActionKey =
	| "data-source-switch"
	| "table-view-basic"
	| "table-view-review"
	| "ir-type-md"
	| "ir-type-pdf"
	| "grid-layout-fixed"
	| "grid-layout-masonry"
	| "grid-layout-timeline"
	| "kanban-layout-compact"
	| "kanban-layout-comfortable"
	| "kanban-layout-spacious"
	| "open-data-management"
	| "open-column-manager"
	| "open-kanban-column-settings"
	| "open-grid-attribute-menu"
	| "toggle-document-filter"
	| "toggle-card-relation-filter"
	| "toggle-card-location-jump";

export type CardManagementMenuSurface = "mobile" | "desktop-main" | "desktop-sidebar";

type CardManagementView = "table" | "grid" | "kanban";
type CardManagementDataSource = "memory" | "questionBank" | "incremental-reading";

export function resolveCardManagementMenuSurface(options: {
	isMobile?: boolean;
	isInSidebar?: boolean;
}): CardManagementMenuSurface {
	/**
	 * 移动端优先级最高。
	 * 即使某个移动端 leaf 恰好在侧栏容器里，也不应该套用桌面侧栏的去重规则。
	 */
	if (options.isMobile) {
		return "mobile";
	}

	return options.isInSidebar ? "desktop-sidebar" : "desktop-main";
}

export function getCardManagementToolbarMirrorActions(options: {
	surface: CardManagementMenuSurface;
	currentView: CardManagementView;
	cardDataSource: CardManagementDataSource;
}): ReadonlySet<CardManagementToolbarActionKey> {
	const visibleActions = new Set<CardManagementToolbarActionKey>();

	/**
	 * 移动端不做“顶部已显示，所以菜单去重”的处理。
	 *
	 * 原因：
	 * - 移动端头部是紧凑模式，入口承载能力远小于桌面端
	 * - 主要操作更依赖菜单本身提供
	 * - 如果沿用桌面去重，最容易出现菜单项消失、用户找不到入口
	 */
	if (options.surface === "mobile") {
		return visibleActions;
	}

	if (options.surface === "desktop-sidebar") {
		/**
		 * 桌面侧边栏顶部只保留“关联当前活动文档”这一类就近操作。
		 *
		 * 其余卡片管理功能仍保留在菜单中，避免侧边栏顶部塞太满。
		 */
		visibleActions.add("toggle-document-filter");
		if (options.currentView === "grid" || options.currentView === "kanban") {
			visibleActions.add("toggle-card-relation-filter");
		}
		return visibleActions;
	}

	/**
	 * 桌面内容区（主工作区）采用“顶部承担局部控制，菜单保持精简”的策略。
	 * 因此和当前视图强相关的局部操作，优先认为已经由顶部功能区承载，不再在菜单重复列出。
	 */
	visibleActions.add("data-source-switch");
	visibleActions.add("open-data-management");

	if (options.currentView === "table") {
		visibleActions.add("open-column-manager");
		visibleActions.add("grid-layout-timeline");

		if (options.cardDataSource === "memory") {
			visibleActions.add("table-view-basic");
			visibleActions.add("table-view-review");
		}

		if (options.cardDataSource === "incremental-reading") {
			visibleActions.add("ir-type-md");
			visibleActions.add("ir-type-pdf");
		}
	}

	if (options.currentView === "grid") {
		visibleActions.add("grid-layout-fixed");
		visibleActions.add("grid-layout-masonry");
		visibleActions.add("grid-layout-timeline");
		visibleActions.add("open-grid-attribute-menu");
		visibleActions.add("toggle-card-relation-filter");
	}

	if (options.currentView === "kanban") {
		visibleActions.add("open-kanban-column-settings");
		visibleActions.add("open-grid-attribute-menu");
		visibleActions.add("toggle-card-relation-filter");
	}

	return visibleActions;
}

export function shouldHideCardManagementMenuActionBecauseToolbarAlreadyHandlesIt(options: {
	action: CardManagementToolbarActionKey;
	surface: CardManagementMenuSurface;
	currentView: CardManagementView;
	cardDataSource: CardManagementDataSource;
}): boolean {
	return getCardManagementToolbarMirrorActions(options).has(options.action);
}
