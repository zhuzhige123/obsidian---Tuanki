import {
	buildAnalyticsForecastFromProjectedSummary,
	buildAnalyticsSelectionOptions,
	calculateUrgencyScore,
	filterAnalyticsSelectionUnits,
	normalizeAnalyticsTags,
	type IRAnalyticsSelectionUnit,
} from "../IRAnalyticsService";
import type {
	IRProjectedScheduleItem,
	IRProjectedScheduleSummary,
} from "../IRProjectedScheduleSummary";

function createUnit(partial: Partial<IRAnalyticsSelectionUnit> & Pick<IRAnalyticsSelectionUnit, "id">): IRAnalyticsSelectionUnit {
	return {
		id: partial.id,
		status: partial.status ?? "active",
		nextRepDate: partial.nextRepDate ?? 0,
		priorityUi: partial.priorityUi ?? 5,
		priorityEff: partial.priorityEff ?? 5,
		readingHours: partial.readingHours ?? 1,
		topicKeys: partial.topicKeys ?? [],
		tagKeys: partial.tagKeys ?? [],
	};
}

describe("calculateUrgencyScore", () => {
	it("treats overdue items as more urgent than due-today and future items", () => {
		const now = new Date("2026-04-10T10:00:00.000Z").getTime();
		const overdue = new Date("2026-04-07T08:00:00.000Z").getTime();
		const dueToday = new Date("2026-04-10T12:00:00.000Z").getTime();
		const future = new Date("2026-04-20T12:00:00.000Z").getTime();

		expect(calculateUrgencyScore(overdue, now)).toBeGreaterThan(calculateUrgencyScore(dueToday, now));
		expect(calculateUrgencyScore(dueToday, now)).toBeGreaterThan(calculateUrgencyScore(future, now));
	});

	it("gives unscheduled items a mid-high urgency instead of collapsing them to zero", () => {
		const now = new Date("2026-04-10T10:00:00.000Z").getTime();
		expect(calculateUrgencyScore(0, now)).toBe(6.5);
	});
});

describe("normalizeAnalyticsTags", () => {
	it("keeps manual tags, trims whitespace, preserves first display casing, and deduplicates case-insensitively", () => {
		expect(normalizeAnalyticsTags(["  Research  ", "research", "Deep/Work", "", "   "])).toEqual([
			{ key: "research", label: "Research" },
			{ key: "deep/work", label: "Deep/Work" },
		]);
	});

	it("filters out system ir tags from analytics tag mode", () => {
		expect(normalizeAnalyticsTags(["#ir", "IR_queue", "topic-a", "  #IR-tag  ", "Focus"])).toEqual([
			{ key: "topic-a", label: "topic-a" },
			{ key: "focus", label: "Focus" },
		]);
	});
});

describe("buildAnalyticsForecastFromProjectedSummary", () => {
	it("includes merged legacy blocks in forecast totals and filtering", () => {
		const todayItem: IRProjectedScheduleItem = {
			id: "legacy-1",
			title: "Legacy",
			sourceFile: "Notes/legacy.md",
			topicKey: "source:Notes/legacy.md",
			priority: 6,
			intervalDays: 2,
			scheduleStatus: "scheduled",
			nextRepDate: new Date("2026-04-10T09:00:00.000Z").getTime(),
			nextReviewDate: new Date("2026-04-10T09:00:00.000Z"),
			estimatedMinutes: 12,
			deckId: "deck-1",
			sourceType: "legacy-block",
		};
		const tomorrowItem: IRProjectedScheduleItem = {
			id: "chunk-1",
			title: "Chunk",
			sourceFile: "Notes/chunk.md",
			topicKey: "source:Notes/chunk.md",
			priority: 5,
			intervalDays: 3,
			scheduleStatus: "queued",
			nextRepDate: new Date("2026-04-11T09:00:00.000Z").getTime(),
			nextReviewDate: new Date("2026-04-11T09:00:00.000Z"),
			estimatedMinutes: 8,
			deckId: "deck-1",
			sourceType: "chunk",
			explanation: {} as any,
		};
		const summary: IRProjectedScheduleSummary = {
			schedule: {
				generatedAt: 1,
				version: 1,
				deckIds: ["deck-1"],
				days: [
					{ dateKey: "2026-04-10", items: [], totalEstimatedMinutes: 0, overloadLevel: "normal" },
					{ dateKey: "2026-04-11", items: [], totalEstimatedMinutes: 0, overloadLevel: "warning" },
				],
				itemsByDate: new Map(),
				triggerReason: "ui_refresh",
			},
			dayLoadsByDate: new Map([
				["2026-04-10", { dateKey: "2026-04-10", items: [todayItem], totalEstimatedMinutes: 12 }],
				["2026-04-11", { dateKey: "2026-04-11", items: [tomorrowItem], totalEstimatedMinutes: 8 }],
			]),
			dayLoadsByDeckId: new Map(),
		};

		const overall = buildAnalyticsForecastFromProjectedSummary(summary, new Set());
		expect(overall).toEqual([
			expect.objectContaining({ dateKey: "2026-04-10", itemCount: 1, totalEstimatedMinutes: 12 }),
			expect.objectContaining({ dateKey: "2026-04-11", itemCount: 1, totalEstimatedMinutes: 8, overloadLevel: "warning" }),
		]);

		const filtered = buildAnalyticsForecastFromProjectedSummary(summary, new Set(["legacy-1"]));
		expect(filtered).toEqual([
			expect.objectContaining({ dateKey: "2026-04-10", itemCount: 1, totalEstimatedMinutes: 12 }),
			expect.objectContaining({ dateKey: "2026-04-11", itemCount: 0, totalEstimatedMinutes: 0, overloadLevel: "normal" }),
		]);
	});
});

describe("filterAnalyticsSelectionUnits", () => {
	const units: IRAnalyticsSelectionUnit[] = [
		createUnit({ id: "u1", topicKeys: ["deck-a", "deck-b"], tagKeys: ["tag-x", "tag-y"] }),
		createUnit({ id: "u2", topicKeys: ["deck-b"], tagKeys: ["tag-y"] }),
		createUnit({ id: "u3", topicKeys: ["deck-c"], tagKeys: ["tag-z"] }),
	];

	it("returns all units for overall mode without double counting", () => {
		expect(filterAnalyticsSelectionUnits(units, "overall").map((unit) => unit.id)).toEqual(["u1", "u2", "u3"]);
	});

	it("supports multi-belonging visibility in topic mode", () => {
		expect(filterAnalyticsSelectionUnits(units, "topic", "deck-b").map((unit) => unit.id)).toEqual(["u1", "u2"]);
	});

	it("supports tag projection views independent from topic membership", () => {
		expect(filterAnalyticsSelectionUnits(units, "tag", "TAG-y").map((unit) => unit.id)).toEqual(["u1", "u2"]);
	});

	it("returns empty when the requested topic or tag is missing", () => {
		expect(filterAnalyticsSelectionUnits(units, "topic", "missing")).toEqual([]);
		expect(filterAnalyticsSelectionUnits(units, "tag", "")).toEqual([]);
	});
});

describe("buildAnalyticsSelectionOptions", () => {
	it("aggregates topic options and sorts by due count before active count", () => {
		const now = new Date();
		now.setHours(12, 0, 0, 0);
		const overdue = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).getTime();
		const dueToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0).getTime();
		const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).getTime();

		const units: IRAnalyticsSelectionUnit[] = [
			createUnit({ id: "u1", topicKeys: ["deck-a", "deck-b"], nextRepDate: overdue, readingHours: 2, priorityEff: 8 }),
			createUnit({ id: "u2", topicKeys: ["deck-b"], nextRepDate: dueToday, readingHours: 1.5, priorityEff: 6 }),
			createUnit({ id: "u3", topicKeys: ["deck-c"], nextRepDate: future, readingHours: 3, priorityEff: 9 }),
		];

		const labelByKey = new Map([
			["deck-a", "专题 A"],
			["deck-b", "专题 B"],
			["deck-c", "专题 C"],
		]);

		const options = buildAnalyticsSelectionOptions(units, "topic", labelByKey);

		expect(options.map((option) => option.key)).toEqual(["deck-b", "deck-a", "deck-c"]);
		expect(options[0]).toMatchObject({
			key: "deck-b",
			label: "专题 B",
			itemCount: 2,
			activeCount: 2,
			dueCount: 2,
			overdueCount: 1,
			avgPriority: 7,
			totalReadingHours: 3.5,
		});
	});

	it("aggregates tag options and sorts by active count then due count", () => {
		const now = new Date();
		now.setHours(12, 0, 0, 0);
		const dueToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0).getTime();
		const future = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).getTime();

		const units: IRAnalyticsSelectionUnit[] = [
			createUnit({ id: "u1", tagKeys: ["alpha", "beta"], nextRepDate: dueToday, readingHours: 1, priorityEff: 7 }),
			createUnit({ id: "u2", tagKeys: ["alpha"], nextRepDate: future, readingHours: 1.5, priorityEff: 5 }),
			createUnit({ id: "u3", tagKeys: ["gamma"], nextRepDate: dueToday, status: "done", readingHours: 2, priorityEff: 9 }),
		];

		const labelByKey = new Map([
			["alpha", "Alpha"],
			["beta", "Beta"],
			["gamma", "Gamma"],
		]);

		const options = buildAnalyticsSelectionOptions(units, "tag", labelByKey);

		expect(options.map((option) => option.key)).toEqual(["alpha", "beta", "gamma"]);
		expect(options[0]).toMatchObject({
			key: "alpha",
			label: "Alpha",
			itemCount: 2,
			activeCount: 2,
			dueCount: 1,
		});
		expect(options[2]).toMatchObject({
			key: "gamma",
			activeCount: 0,
			dueCount: 0,
		});
	});
});
