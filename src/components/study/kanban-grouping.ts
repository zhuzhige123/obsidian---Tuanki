export type KanbanDataSourceType = "memory" | "questionBank" | "incremental-reading";

export type KanbanGroupBy =
	| "status"
	| "type"
	| "priority"
	| "deck"
	| "createTime"
	| "tag"
	| "tagGroup"
	| "ir_tag_group";

export interface KanbanGroupByOption {
	key: KanbanGroupBy;
	icon: string;
	supportsCardDrag: boolean;
	dragRestrictionReasonKey: string | null;
}

const ALL_KANBAN_GROUP_BY_VALUES: readonly KanbanGroupBy[] = [
	"status",
	"type",
	"priority",
	"deck",
	"createTime",
	"tag",
	"tagGroup",
	"ir_tag_group",
];

const DEFAULT_GROUP_BY_BY_SOURCE: Record<KanbanDataSourceType, KanbanGroupBy> = {
	memory: "status",
	questionBank: "status",
	"incremental-reading": "deck",
};

const MEMORY_GROUP_BY_OPTIONS: readonly KanbanGroupByOption[] = [
	{ key: "status", icon: "layers", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.statusRestriction" },
	{ key: "type", icon: "layout-grid", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.typeRestriction" },
	{ key: "priority", icon: "flag", supportsCardDrag: true, dragRestrictionReasonKey: null },
	{ key: "deck", icon: "folder", supportsCardDrag: true, dragRestrictionReasonKey: null },
	{ key: "createTime", icon: "calendar", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.timeRestriction" },
	{ key: "tag", icon: "tag", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.tagRestriction" },
	{ key: "tagGroup", icon: "tags", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.tagGroupRestriction" },
];

const IR_GROUP_BY_OPTIONS: readonly KanbanGroupByOption[] = [
	{ key: "deck", icon: "folder", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.irDeckRestriction" },
	{ key: "ir_tag_group", icon: "layers", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.tagGroupRestriction" },
	{ key: "tag", icon: "tag", supportsCardDrag: false, dragRestrictionReasonKey: "cards.kanban.drag.tagRestriction" },
	{ key: "priority", icon: "flag", supportsCardDrag: true, dragRestrictionReasonKey: null },
];

export function getKanbanGroupByOptions(source: KanbanDataSourceType): readonly KanbanGroupByOption[] {
	return source === "incremental-reading" ? IR_GROUP_BY_OPTIONS : MEMORY_GROUP_BY_OPTIONS;
}

export function isKanbanGroupBy(value: unknown): value is KanbanGroupBy {
	return typeof value === "string" && (ALL_KANBAN_GROUP_BY_VALUES as readonly string[]).includes(value);
}

export function resolveKanbanGroupBy(value: unknown): KanbanGroupBy {
	return isKanbanGroupBy(value) ? value : "status";
}

export function normalizeKanbanGroupByForSource(
	value: KanbanGroupBy,
	source: KanbanDataSourceType
): KanbanGroupBy {
	const allowedKeys = new Set(getKanbanGroupByOptions(source).map((option) => option.key));
	return allowedKeys.has(value) ? value : DEFAULT_GROUP_BY_BY_SOURCE[source];
}

export function getKanbanGroupByDragRestrictionReasonKey(
	value: KanbanGroupBy,
	source: KanbanDataSourceType
): string | null {
	const normalizedValue = normalizeKanbanGroupByForSource(value, source);
	return getKanbanGroupByOptions(source).find((option) => option.key === normalizedValue)?.dragRestrictionReasonKey ?? null;
}

export function isKanbanGroupByCardDraggable(
	value: KanbanGroupBy,
	source: KanbanDataSourceType
): boolean {
	return getKanbanGroupByDragRestrictionReasonKey(value, source) === null;
}
