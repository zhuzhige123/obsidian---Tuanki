import { describe, expect, it } from "vitest";
import type { Card } from "../../../data/types";
import { buildIRCardManagementSourceStats } from "../IRCardManagementSourceStats";
import { normalizeTraceDocumentKey, normalizeTraceSubunitKey } from "../IRSourceTraceStats";

function createCard(partial: Partial<Card>): Card {
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

describe("buildIRCardManagementSourceStats", () => {
	it("按 markdown 来源统计关联笔记、摘录卡和记忆卡", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Notes/Alpha.md", "markdown")!;
		const stats = buildIRCardManagementSourceStats({
			units: [
				{
					sourceKind: "markdown",
					sourceDocumentKey,
					associatedNotePath: "Permanent/Alpha Note",
				},
			],
			cards: [
				createCard({
					uuid: "extract-1",
					sourceFile: "Notes/Alpha.md",
					outputKind: "extract",
				}),
				createCard({
					uuid: "memory-1",
					sourceFile: "Notes/Alpha.md",
					outputKind: "memory",
				}),
			],
		});

		expect(stats.get(sourceDocumentKey)).toEqual({
			sourceDocumentKey,
			sourceKind: "markdown",
			associatedNoteCount: 1,
			associatedNotePaths: ["Permanent/Alpha Note"],
			associatedNotePrimaryPath: "Permanent/Alpha Note",
			extractCardCount: 1,
			memoryCardCount: 1,
		});
	});

	it("pdf 默认文档级统计会保留未带书签的历史卡片", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Books/demo.pdf", "pdf")!;
		const stats = buildIRCardManagementSourceStats({
			units: [
				{
					sourceKind: "pdf",
					sourceDocumentKey,
					sourceSubunitKey: normalizeTraceSubunitKey("[[Books/demo.pdf#page=3]]")!,
				},
			],
			cards: [
				createCard({
					uuid: "legacy-memory",
					sourceFile: "Books/demo.pdf",
					outputKind: "memory",
				}),
			],
		});

		expect(stats.get(sourceDocumentKey)?.memoryCardCount).toBe(1);
	});

	it("epub 在当前筛选只保留部分章节时只统计对应章节和文档级卡片", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Books/demo.epub", "epub")!;
		const chapterOne = normalizeTraceSubunitKey("Text/chapter-1.xhtml")!;
		const chapterTwo = normalizeTraceSubunitKey("Text/chapter-2.xhtml")!;
		const stats = buildIRCardManagementSourceStats({
			units: [
				{
					sourceKind: "epub",
					sourceDocumentKey,
					sourceSubunitKey: chapterOne,
				},
			],
			cards: [
				createCard({
					uuid: "doc-memory",
					sourceFile: "Books/demo.epub",
					outputKind: "memory",
				}),
				createCard({
					uuid: "chapter-1-extract",
					sourceFile: "Books/demo.epub",
					sourceDocumentKey,
					sourceSubunitKey: chapterOne,
					outputKind: "extract",
				}),
				createCard({
					uuid: "chapter-2-extract",
					sourceFile: "Books/demo.epub",
					sourceDocumentKey,
					sourceSubunitKey: chapterTwo,
					outputKind: "extract",
				}),
			],
		});

		expect(stats.get(sourceDocumentKey)).toMatchObject({
			extractCardCount: 1,
			memoryCardCount: 1,
		});
	});

	it("旧数据没有 outputKind 时会回退到 extractCardIds", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Notes/Legacy.md", "markdown")!;
		const stats = buildIRCardManagementSourceStats({
			units: [
				{
					sourceKind: "markdown",
					sourceDocumentKey,
				},
			],
			cards: [
				createCard({
					uuid: "legacy-extract",
					sourceFile: "Notes/Legacy.md",
				}),
				createCard({
					uuid: "legacy-memory",
					sourceFile: "Notes/Legacy.md",
				}),
			],
			extractCardIds: ["legacy-extract"],
		});

		expect(stats.get(sourceDocumentKey)).toMatchObject({
			extractCardCount: 1,
			memoryCardCount: 1,
		});
	});

	it("关联笔记会按路径去重并保留主路径", () => {
		const sourceDocumentKey = normalizeTraceDocumentKey("Notes/Dedupe.md", "markdown")!;
		const stats = buildIRCardManagementSourceStats({
			units: [
				{
					sourceKind: "markdown",
					sourceDocumentKey,
					associatedNotePath: "Permanent/My Note.md",
				},
				{
					sourceKind: "markdown",
					sourceDocumentKey,
					associatedNotePath: "Permanent/My Note",
				},
			],
			cards: [],
		});

		expect(stats.get(sourceDocumentKey)).toMatchObject({
			associatedNoteCount: 1,
			associatedNotePaths: ["Permanent/My Note.md"],
			associatedNotePrimaryPath: "Permanent/My Note.md",
		});
	});
});
