
vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../../../tests/mocks/obsidian")>(
		"../../../tests/mocks/obsidian"
	);
	return {
		...actual,
		normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
	};
});

import {
	buildProjectedDayLoadMap,
	getProjectedDayLoad,
	getProjectedScheduleSummary,
} from "../IRProjectedScheduleSummary";
import type { IRPlannedSchedule, IRPlannedScheduleItem } from "../IRScheduleKernel";

function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function createPlannedItem(input: Partial<IRPlannedScheduleItem> & Pick<IRPlannedScheduleItem, "id">): IRPlannedScheduleItem {
	const nextReviewDate = input.nextReviewDate ?? new Date();
	return {
		id: input.id,
		title: input.title ?? input.id,
		sourceFile: input.sourceFile ?? "Books/Test.md",
		topicKey: input.topicKey ?? "source:Books/Test.md",
		priority: input.priority ?? 5,
		intervalDays: input.intervalDays ?? 1,
		scheduleStatus: input.scheduleStatus ?? "queued",
		nextRepDate: input.nextRepDate ?? nextReviewDate.getTime(),
		nextReviewDate,
		estimatedMinutes: input.estimatedMinutes ?? 2,
		deckId: input.deckId ?? "deck-1",
		sourceType: input.sourceType ?? "chunk",
		explanation:
			input.explanation ?? ({
				primaryReason: "test",
				secondaryReasons: [],
				isOverdue: false,
				overdueDays: 0,
				hasManualSchedule: true,
				estimatedMinutes: input.estimatedMinutes ?? 2,
				scoreBreakdown: {
					importanceScore: 1,
					urgencyScore: 1,
					difficultyScore: 1,
					compositeScore: 1,
				},
				compositeScore: 1,
			} as any),
	};
}

function createSchedule(itemsByDate: Map<string, IRPlannedScheduleItem[]>): IRPlannedSchedule {
	return {
		generatedAt: Date.now(),
		version: 1,
		days: Array.from(itemsByDate.entries()).map(([dateKey, items]) => ({
			dateKey,
			items,
			totalEstimatedMinutes: items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
			overloadLevel: "normal" as const,
		})),
		itemsByDate,
		deckIds: ["deck-1"],
		triggerReason: "ui_refresh",
	};
}

describe("IRProjectedScheduleSummary", () => {
	it("merges legacy blocks into the shared projected day load", async () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(today.getDate() + 1);
		const schedule = createSchedule(
			new Map([
				[
					formatDateKey(tomorrow),
					[
						createPlannedItem({
							id: "chunk-1",
							nextReviewDate: tomorrow,
							nextRepDate: tomorrow.getTime(),
							deckId: "deck-1",
						}),
					],
				],
			])
		);

		const summary = await getProjectedScheduleSummary({} as any, {
			schedule,
			seedData: {
				decksRecord: {
					"deck-1": {
						id: "deck-1",
						name: "Deck 1",
						description: "",
						icon: "",
						color: "",
						blockIds: ["legacy-1"],
						sourceFiles: [],
						settings: {} as any,
						createdAt: "",
						updatedAt: "",
						archivedAt: null,
						path: "legacy/deck-path",
					} as any,
				},
				blocksRecord: {
					"legacy-1": {
						id: "legacy-1",
						filePath: "Books/Legacy.md",
						headingPath: ["Legacy Heading"],
						headingLevel: 2,
						startLine: 1,
						priority: 2,
						state: "new",
						interval: 1,
						intervalFactor: 1.5,
						nextReview: null,
						reviewCount: 0,
						lastReview: null,
						createdAt: new Date(today).toISOString(),
						updatedAt: new Date(today).toISOString(),
						contentPreview: "Legacy preview",
						tags: [],
						associatedNotePaths: ["Notes/Legacy", "Notes/Legacy.md", "Notes/Appendix.md"],
					} as any,
				},
				history: { sessions: [] },
			},
		});

		const todayLoad = getProjectedDayLoad(summary, today, ["deck-1"]);
		const tomorrowLoad = getProjectedDayLoad(summary, tomorrow, ["deck-1"]);

		expect(todayLoad.items.map((item) => item.id)).toContain("legacy-1");
		expect(todayLoad.items.find((item) => item.id === "legacy-1")).toMatchObject({
			sourceType: "legacy-block",
			associatedNotePath: "Notes/Legacy.md",
			associatedNoteScope: "point",
		});
		expect(tomorrowLoad.items.map((item) => item.id)).toContain("chunk-1");
	});

	it("resolves legacy deck path identifiers through canonical deck ids", async () => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const schedule = createSchedule(new Map());

		const summary = await getProjectedScheduleSummary({} as any, {
			schedule,
			deckIds: ["legacy/deck-path"],
			seedData: {
				decksRecord: {
					"deck-1": {
						id: "deck-1",
						name: "Deck 1",
						description: "",
						icon: "",
						color: "",
						blockIds: [],
						sourceFiles: [],
						settings: {} as any,
						createdAt: "",
						updatedAt: "",
						archivedAt: null,
						path: "legacy/deck-path",
					} as any,
				},
				blocksRecord: {
					"legacy-2": {
						id: "legacy-2",
						filePath: "Books/LegacyPath.md",
						headingPath: ["Legacy Path"],
						headingLevel: 2,
						startLine: 1,
						priority: 2,
						state: "review",
						interval: 2,
						intervalFactor: 1.5,
						nextReview: new Date(today).toISOString(),
						reviewCount: 1,
						lastReview: new Date(today).toISOString(),
						createdAt: new Date(today).toISOString(),
						updatedAt: new Date(today).toISOString(),
						contentPreview: "Legacy by deck path",
						tags: [],
						deckPath: "legacy/deck-path",
					} as any,
				},
				history: { sessions: [] },
			},
		});

		const loadMap = buildProjectedDayLoadMap(summary, ["deck-1"]);
		const todayLoad = loadMap.get(formatDateKey(today));

		expect(todayLoad?.items.map((item) => item.id)).toContain("legacy-2");
		expect(todayLoad?.items.find((item) => item.id === "legacy-2")?.deckId).toBe("deck-1");
	});
});
