import { describe, expect, it } from "vitest";

import {
	getKanbanGroupByDragRestrictionReasonKey,
	getKanbanGroupByOptions,
	isKanbanGroupByCardDraggable,
	normalizeKanbanGroupByForSource,
	resolveKanbanGroupBy,
} from "./kanban-grouping";

describe("kanban-grouping", () => {
	it("为记忆/题库数据源正确标记哪些分组支持拖拽改列", () => {
		const memoryOptions = getKanbanGroupByOptions("memory");
		const optionMap = new Map(memoryOptions.map((option) => [option.key, option]));

		expect(optionMap.get("priority")?.supportsCardDrag).toBe(true);
		expect(optionMap.get("deck")?.supportsCardDrag).toBe(true);
		expect(optionMap.get("status")?.supportsCardDrag).toBe(false);
		expect(optionMap.get("type")?.supportsCardDrag).toBe(false);
		expect(optionMap.get("createTime")?.supportsCardDrag).toBe(false);
		expect(optionMap.get("tag")?.supportsCardDrag).toBe(false);
		expect(optionMap.get("tagGroup")?.supportsCardDrag).toBe(false);
	});

	it("为增量阅读数据源正确收口不可拖拽分组", () => {
		expect(isKanbanGroupByCardDraggable("priority", "incremental-reading")).toBe(true);
		expect(isKanbanGroupByCardDraggable("deck", "incremental-reading")).toBe(false);
		expect(isKanbanGroupByCardDraggable("tag", "incremental-reading")).toBe(false);
		expect(isKanbanGroupByCardDraggable("ir_tag_group", "incremental-reading")).toBe(false);
		expect(getKanbanGroupByDragRestrictionReasonKey("deck", "incremental-reading")).toBe("cards.kanban.drag.irDeckRestriction");
	});

	it("会按数据源归一化非法分组值", () => {
		expect(normalizeKanbanGroupByForSource("ir_tag_group", "memory")).toBe("status");
		expect(normalizeKanbanGroupByForSource("status", "incremental-reading")).toBe("deck");
	});

	it("会把未知持久化值回退到默认分组", () => {
		expect(resolveKanbanGroupBy("priority")).toBe("priority");
		expect(resolveKanbanGroupBy("unknown-group")).toBe("status");
		expect(resolveKanbanGroupBy(undefined)).toBe("status");
	});
});
