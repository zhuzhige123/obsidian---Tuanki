import { describe, expect, it } from "vitest";

import { IRCalendarQueryService } from "../IRCalendarQueryService";

describe("IRCalendarQueryService cache title normalization", () => {
	it("normalizes stale cached pdf and epub items when attaching runtime context", () => {
		const service = new IRCalendarQueryService({} as any);
		const stalePdfItem = {
			id: "pdf-1",
			title: "第一章 / 第二节 / PDF 阅读点",
			sourceFile: "Books/Test.pdf",
			priority: 5,
			intervalDays: 1,
			scheduleStatus: "new",
			nextRepDate: 0,
			nextReviewDate: null,
			sourceType: "pdf",
		} as any;
		const staleEpubItem = {
			id: "epub-1",
			title: "第一部分 / 第二章 / EPUB 阅读点",
			sourceFile: "Books/Test.epub",
			priority: 5,
			intervalDays: 1,
			scheduleStatus: "new",
			nextRepDate: 0,
			nextReviewDate: null,
			sourceType: "epub",
		} as any;
		const legacyItem = {
			id: "legacy-1",
			title: "第一章 / 第二节 / 旧块",
			sourceFile: "Notes/Test.md",
			priority: 5,
			intervalDays: 1,
			scheduleStatus: "new",
			nextRepDate: 0,
			nextReviewDate: null,
			sourceType: "legacy-block",
		} as any;

		const result = (service as any).attachRuntimeContext(
			{
				workspaceData: { generatedAt: 1 } as any,
				readingMaterials: [],
				materialsByDate: new Map([["2026-05-01", [stalePdfItem, legacyItem]]]),
				continueReadingSuspendedItemsPool: [staleEpubItem],
				schedule: { generatedAt: 2, version: 1, deckIds: [], days: [] },
				scope: { deckIds: [], cacheKey: "__all__::__default__", stateKey: "old" },
			},
			{ generatedAt: 1 } as any,
			[],
			{ deckIds: [], cacheKey: "__all__::__default__" }
		);

		expect(result.materialsByDate.get("2026-05-01")?.[0]?.displayName).toBe("PDF 阅读点");
		expect(result.continueReadingSuspendedItemsPool[0]?.displayName).toBe("EPUB 阅读点");
		expect(result.materialsByDate.get("2026-05-01")?.[1]?.displayName).toBeUndefined();
	});

	it("normalizes hydrated disk-cache epub items with missing displayName", () => {
		const service = new IRCalendarQueryService({} as any);
		const hydrated = (service as any).hydrateScheduleItem({
			id: "epub-1",
			title: "第一部分 / 第二章 / EPUB 阅读点",
			sourceFile: "Books/Test.epub",
			priority: 5,
			intervalDays: 1,
			scheduleStatus: "new",
			nextRepDate: 0,
			nextReviewDate: null,
			sourceType: "epub",
		});

		expect(hydrated.displayName).toBe("EPUB 阅读点");
	});

	it("drops disk cache entries from older cache versions", () => {
		const service = new IRCalendarQueryService({} as any);
		const normalized = (service as any).normalizeDiskCacheStore({
			version: "1.0.0",
			lastUpdated: new Date().toISOString(),
			entries: {
				foo: {
					workspaceFingerprint: "w",
					settingsFingerprint: "s",
					savedAt: new Date().toISOString(),
					result: {
						materialsByDate: [],
						continueReadingSuspendedItemsPool: [],
						schedule: { generatedAt: 1, version: 1, deckIds: [], days: [] },
						scope: { deckIds: [], cacheKey: "k" },
					},
				},
			},
		});

		expect(normalized.version).toBe("1.1.0");
		expect(normalized.entries).toEqual({});
	});
});
