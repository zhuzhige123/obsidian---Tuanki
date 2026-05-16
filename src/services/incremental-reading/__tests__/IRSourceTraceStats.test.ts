import type { Card } from "../../../data/types";
import {
	buildIRTraceOverviewStats,
	collectCardTraceSources,
	normalizeTraceDocumentKey,
} from "../IRSourceTraceStats";

function createCard(
	partial: Partial<Card> & Pick<Card, "uuid" | "content" | "stats" | "created" | "modified">
): Card {
	return {
		uuid: partial.uuid,
		content: partial.content,
		stats: partial.stats,
		created: partial.created,
		modified: partial.modified,
		cardPurpose: partial.cardPurpose,
		sourceFile: partial.sourceFile,
		sourceDocumentKey: partial.sourceDocumentKey,
		sourceSubunitKey: partial.sourceSubunitKey,
		sourceKind: partial.sourceKind,
		outputKind: partial.outputKind,
		tags: partial.tags || [],
	};
}

describe("collectCardTraceSources", () => {
	it("normalizes markdown wikilinks and explicit .md paths into one document key", () => {
		const card = createCard({
			uuid: "card-md",
			content: `---
we_source:
  - '[[Notes/Alpha]]'
  - '[[Notes/Alpha.md#^block-1]]'
---
body`,
			stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
			created: "2026-04-11T00:00:00.000Z",
			modified: "2026-04-11T00:00:00.000Z",
			sourceFile: "Notes/Alpha.md",
		});

		const sources = collectCardTraceSources(card);
		const markdownSources = sources.filter((source) => source.sourceKind === "markdown");

		expect(markdownSources).toHaveLength(1);
		expect(markdownSources[0].sourceDocumentKey).toBe(normalizeTraceDocumentKey("Notes/Alpha.md"));
	});
});

describe("buildIRTraceOverviewStats", () => {
	it("counts markdown notes, extract cards, and memory cards separately", () => {
		const units = [
			{
				sourceKind: "markdown" as const,
				sourceDocumentKey: normalizeTraceDocumentKey("Notes/Alpha.md", "markdown")!,
				associatedNotePath: "Permanent/Alpha Note",
			},
		];

		const cards = [
			createCard({
				uuid: "extract-1",
				content: `---
we_source: '[[Notes/Alpha]]'
---
extract`,
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
				outputKind: "extract",
			}),
			createCard({
				uuid: "extract-2",
				content: `---
we_source: '[[Notes/Alpha.md#^block-1]]'
---
extract`,
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
			}),
			createCard({
				uuid: "memory-1",
				content: `---
we_source: '[[Notes/Alpha]]'
---
memory`,
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
			}),
			createCard({
				uuid: "test-1",
				content: `---
we_source: '[[Notes/Alpha]]'
---
test`,
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
				cardPurpose: "test",
			}),
		];

		expect(
			buildIRTraceOverviewStats({
				units,
				cards,
				extractCardIds: ["extract-2"],
			})
		).toEqual({
			extractCount: 2,
			memoryCardCount: 1,
			noteCount: 1,
		});
	});

	it("keeps mixed pdf and epub documents isolated and lets explicit subunit keys match", () => {
		const units = [
			{
				sourceKind: "pdf" as const,
				sourceDocumentKey: normalizeTraceDocumentKey("Books/demo.pdf", "pdf")!,
				sourceSubunitKey: "[[books/demo.pdf#page=3&selection=abc]]",
			},
			{
				sourceKind: "epub" as const,
				sourceDocumentKey: normalizeTraceDocumentKey("Books/demo.epub", "epub")!,
				sourceSubunitKey: "chapter-2",
			},
		];

		const cards = [
			createCard({
				uuid: "pdf-memory",
				content: `---
we_source: '[[Books/demo.pdf#page=3&selection=abc]]'
---
pdf memory`,
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
			}),
			createCard({
				uuid: "epub-extract",
				content: "epub extract",
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
				sourceDocumentKey: "books/demo.epub",
				sourceKind: "epub",
				sourceSubunitKey: "chapter-2",
				outputKind: "extract",
			}),
			createCard({
				uuid: "legacy-other-pdf",
				content: `---
we_source: '[[Books/other.pdf#page=3&selection=abc]]'
---
other pdf`,
				stats: { totalReviews: 0, totalTime: 0, averageTime: 0 },
				created: "2026-04-11T00:00:00.000Z",
				modified: "2026-04-11T00:00:00.000Z",
			}),
		];

		expect(
			buildIRTraceOverviewStats({
				units,
				cards,
			})
		).toEqual({
			extractCount: 1,
			memoryCardCount: 1,
			noteCount: 0,
		});
	});

	it("counts all normalized associated note paths from multi-note units", () => {
		const units = [
			{
				sourceKind: "markdown" as const,
				sourceDocumentKey: normalizeTraceDocumentKey("Notes/Alpha.md", "markdown")!,
				associatedNotePaths: ["Permanent/Alpha", "Permanent/Alpha.md", "Permanent/Appendix.md"],
			},
		];

		expect(
			buildIRTraceOverviewStats({
				units,
				cards: [],
			})
		).toEqual({
			extractCount: 0,
			memoryCardCount: 0,
			noteCount: 2,
		});
	});
});
