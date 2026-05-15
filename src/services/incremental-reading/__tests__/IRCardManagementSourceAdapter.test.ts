import { describe, expect, it } from "vitest";
import type { Card } from "../../../data/types";
import { applyIRCardManagementSourceStats } from "../IRCardManagementSourceAdapter";
import { normalizeTraceDocumentKey } from "../IRSourceTraceStats";

function createCard(partial: Partial<Card> & Record<string, any>): Card {
	return {
		uuid: partial.uuid || "card-1",
		deckId: partial.deckId || "deck-1",
		type: partial.type || ("basic" as any),
		content: partial.content || "",
		tags: partial.tags || [],
		stats: partial.stats || {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
		},
		created: partial.created || new Date().toISOString(),
		modified: partial.modified || new Date().toISOString(),
		...partial,
	} as Card;
}

describe("applyIRCardManagementSourceStats", () => {
	it("会把来源统计注入到 IR 行字段", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Notes/demo.md", "markdown")!;
		const rows = [
			createCard({
				uuid: "row-1",
				sourceDocumentKey,
				sourceKind: "markdown",
				sourceFile: "Notes/demo.md",
				associatedNotePath: "Notes/关联笔记.md",
				ir_tag_group: "",
			}),
		];
		const allCards = [
			createCard({
				uuid: "extract-1",
				sourceFile: "Notes/demo.md",
				outputKind: "extract",
			}),
			createCard({
				uuid: "memory-1",
				sourceFile: "Notes/demo.md",
				outputKind: "memory",
			}),
		];

		const result = applyIRCardManagementSourceStats({
			rows,
			allCards,
		});

		expect(result[0]).toMatchObject({
			ir_source_kind: "markdown",
			ir_source_document_label: "demo.md",
			ir_notes: 1,
			ir_associated_note_primary_path: "Notes/关联笔记.md",
			ir_associated_note_paths: ["Notes/关联笔记.md"],
			ir_extract_cards: 1,
			ir_memory_cards: 1,
			ir_tag_group: "默认",
		});
	});

	it("EPUB 同文档不同阅读点不会继承彼此的关联笔记", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Books/demo.epub", "epub")!;
		const rows = [
			createCard({
				uuid: "row-1",
				sourceDocumentKey,
				sourceKind: "epub",
				sourceSubunitKey: "chapter-1",
				sourceFile: "Books/demo.epub",
				associatedNotePath: "Notes/Chapter One.md",
			}),
			createCard({
				uuid: "row-2",
				sourceDocumentKey,
				sourceKind: "epub",
				sourceSubunitKey: "chapter-2",
				sourceFile: "Books/demo.epub",
			}),
		];
		const allCards = [
			createCard({
				uuid: "memory-1",
				sourceFile: "Books/demo.epub",
				sourceDocumentKey,
				sourceSubunitKey: "chapter-1",
				outputKind: "memory",
			}),
		];

		const result = applyIRCardManagementSourceStats({
			rows,
			allCards,
		});

		expect(result[0]).toMatchObject({
			ir_notes: 1,
			ir_associated_note_primary_path: "Notes/Chapter One.md",
			ir_associated_note_paths: ["Notes/Chapter One.md"],
		});
		expect(result[1]).toMatchObject({
			ir_notes: 0,
			ir_associated_note_primary_path: undefined,
			ir_associated_note_paths: [],
		});
	});

	it("只有多关联笔记数组字段时也会保留完整去重后的路径集合", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Notes/multi.md", "markdown")!;
		const rows = [
			createCard({
				uuid: "row-multi",
				sourceDocumentKey,
				sourceKind: "markdown",
				sourceFile: "Notes/multi.md",
				associatedNotePaths: ["Notes/Topic", "Notes/Topic.md", "Notes/Appendix.md"],
			}),
		];

		const result = applyIRCardManagementSourceStats({
			rows,
			allCards: [],
		});

		expect(result[0]).toMatchObject({
			ir_notes: 2,
			ir_associated_note_primary_path: "Notes/Topic.md",
			ir_associated_note_paths: ["Notes/Topic.md", "Notes/Appendix.md"],
		});
	});
});
