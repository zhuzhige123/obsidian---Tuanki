/**
 * 卡片管理工具栏事件契约
 *
 * 顶栏按钮、Obsidian 原生 view-header、多功能菜单、SidebarNavHeader
 * 都通过 `Weave:card-management-toolbar-action` 把操作交给卡片管理页执行。
 * 新增入口时必须同时更新「可派发动作」与「已处理动作」，并由单测守住。
 */

/** 会从 UI / 菜单 / 顶栏派发出的动作名 */
export const CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS = [
	"create-card",
	"toggle-search",
	"toggle-document-filter",
	"toggle-card-location-jump",
	"toggle-card-relation-filter",
	"table-view-basic",
	"table-view-review",
	"ir-type-md",
	"ir-type-pdf",
	"grid-layout-fixed",
	"grid-layout-masonry",
	"grid-layout-timeline",
	"grid-border-style-solid",
	"grid-border-style-dashed",
	"kanban-layout-compact",
	"kanban-layout-comfortable",
	"kanban-layout-spacious",
	"open-data-management",
	"open-column-manager",
	"open-kanban-column-settings",
	"open-grid-attribute-menu",
] as const;

export type CardManagementToolbarDispatchAction =
	(typeof CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS)[number];

/**
 * 卡片管理页 `handleCardManagementToolbarAction` 必须处理的动作。
 * 与 DISPATCH 列表保持一致；若只在一侧出现，单测会失败。
 */
export const CARD_MANAGEMENT_TOOLBAR_HANDLED_ACTIONS = [
	...CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS,
] as const;

export type CardManagementToolbarHandledAction =
	(typeof CARD_MANAGEMENT_TOOLBAR_HANDLED_ACTIONS)[number];

export function isCardManagementToolbarDispatchAction(
	action: string | undefined
): action is CardManagementToolbarDispatchAction {
	return (
		typeof action === "string" &&
		(CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS as readonly string[]).includes(action)
	);
}

export function emitCardManagementToolbarAction(
	action: CardManagementToolbarDispatchAction,
	anchor?: HTMLElement | null
): void {
	window.dispatchEvent(
		new CustomEvent("Weave:card-management-toolbar-action", {
			detail: { action, anchor: anchor ?? null },
		})
	);
}
