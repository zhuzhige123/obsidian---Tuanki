/** Workspace 兼容事件名（第三方/UI 监听用，非主写入路径） */
export const WEAVE_WORKSPACE_EVENTS = {
	DATA_CHANGED: "Weave:data-changed",
	CARD_CREATED: "Weave:card-created",
	CARD_UPDATED: "Weave:card-updated",
	CARD_DELETED: "Weave:card-deleted",
} as const;
