import { getPluginPaths, getV2Paths } from "../../../config/paths";
import { IRMonitoringService } from "../IRMonitoringService";
import { IRStorageService } from "../IRStorageService";
import { IRTagGroupService } from "../IRTagGroupService";
import { createMemoryApp, normalizeTestPath } from "./testMemoryApp";

describe("IR runtime local state relocation", () => {
	it("reads legacy sync-state but persists updates into plugin cache only", async () => {
		const v2Paths = getV2Paths("");
		const pluginPaths = getPluginPaths({ vault: { configDir: ".obsidian" } } as any);
		const legacyPath = normalizeTestPath(`${v2Paths.ir.root}/sync-state.json`);
		const localPath = normalizeTestPath(pluginPaths.cache.incrementalReading.syncState);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[legacyPath]: JSON.stringify({
					version: "3.0.0",
					files: {
						"notes/demo.md": {
							filePath: "notes/demo.md",
							mtime: 1,
							size: 2,
							uuidListHash: "legacy-hash",
							lastSynced: "2026-04-17T00:00:00.000Z",
						},
					},
				}),
			},
		});
		const service = new IRStorageService(app as any);

		const states = await service.getAllSyncStates();
		expect(states["notes/demo.md"]).toMatchObject({
			uuidListHash: "legacy-hash",
		});

		await service.saveFileSyncState({
			filePath: "notes/demo.md",
			mtime: 2,
			size: 3,
			uuidListHash: "new-hash",
			lastSynced: "2026-04-18T00:00:00.000Z",
		});

		expect(files.has(localPath)).toBe(true);
		expect(JSON.parse(files.get(localPath) || "{}")).toMatchObject({
			files: {
				"notes/demo.md": expect.objectContaining({
					uuidListHash: "new-hash",
				}),
			},
		});
		expect(JSON.parse(files.get(legacyPath) || "{}")).toMatchObject({
			files: {
				"notes/demo.md": expect.objectContaining({
					uuidListHash: "legacy-hash",
				}),
			},
		});
	});

	it("reuses legacy document-group-map cache but writes the cache into plugin directory only", async () => {
		const v2Paths = getV2Paths("");
		const pluginPaths = getPluginPaths({ vault: { configDir: ".obsidian" } } as any);
		const legacyPath = normalizeTestPath(v2Paths.ir.documentGroupMap);
		const localPath = normalizeTestPath(pluginPaths.cache.incrementalReading.documentGroupMap);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[legacyPath]: JSON.stringify({
					version: "3.0.0",
					map: {
						"notes/demo.md": {
							filePath: "notes/demo.md",
							groupId: "default",
							tagsSnapshot: ["demo"],
							updatedAt: "2026-04-17T00:00:00.000Z",
						},
					},
				}),
			},
		});
		const service = new IRTagGroupService(app as any);

		expect(await service.matchGroupForDocument("notes/demo.md")).toBe("default");
		await service.updateDocumentGroupManual("notes/next.md", "default");

		expect(files.has(localPath)).toBe(true);
		expect(JSON.parse(files.get(localPath) || "{}")).toMatchObject({
			map: {
				"notes/demo.md": expect.objectContaining({ groupId: "default" }),
				"notes/next.md": expect.objectContaining({ groupId: "default" }),
			},
		});
		expect(JSON.parse(files.get(legacyPath) || "{}")).toMatchObject({
			map: {
				"notes/demo.md": expect.objectContaining({ groupId: "default" }),
			},
		});
	});

	it("loads legacy monitoring data but saves monitoring into plugin state only", async () => {
		const v2Paths = getV2Paths("");
		const pluginPaths = getPluginPaths({ vault: { configDir: ".obsidian" } } as any);
		const legacyPath = normalizeTestPath(`${v2Paths.ir.root}/monitoring.json`);
		const localPath = normalizeTestPath(pluginPaths.state.incrementalReading.monitoring);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[legacyPath]: JSON.stringify({
					version: "3.0.0",
					dailyStats: [
						{
							date: "2026-04-16",
							dueCount: 2,
							scheduledCount: 1,
							postponedCount: 0,
							totalEstimatedMinutes: 5,
							totalActualReadingSeconds: 10,
							tagGroupAppearances: {},
							newBlocksCount: 0,
							completedBlocksCount: 0,
						},
					],
					priorityChanges: [],
					groupParamChanges: [],
					decisionEvents: [],
					decisionOutcomes: [],
					lastUpdated: "2026-04-16T09:00:00.000Z",
				}),
			},
		});
		const service = new IRMonitoringService(app.vault as any);

		await service.load();
		expect(service.getSummaryReport().weeklyAvg.dueCount).toBeGreaterThan(0);

		service.recordDueCount(4);
		await service.save();

		expect(files.has(localPath)).toBe(true);
		expect(JSON.parse(files.get(localPath) || "{}")).toMatchObject({
			dailyStats: expect.arrayContaining([expect.objectContaining({ date: "2026-04-16", dueCount: 2 })]),
		});
		expect(JSON.parse(files.get(legacyPath) || "{}")).toMatchObject({
			dailyStats: [expect.objectContaining({ date: "2026-04-16", dueCount: 2 })],
		});
	});

	it("reads legacy history/calendar/session files but persists updates into plugin state only", async () => {
		const v2Paths = getV2Paths("");
		const pluginPaths = getPluginPaths({ vault: { configDir: ".obsidian" } } as any);
		const historyLegacyPath = normalizeTestPath(v2Paths.ir.history);
		const historyLocalPath = normalizeTestPath(pluginPaths.state.incrementalReading.history);
		const calendarLegacyPath = normalizeTestPath(v2Paths.ir.calendarProgress);
		const calendarLocalPath = normalizeTestPath(
			pluginPaths.state.incrementalReading.calendarProgress
		);
		const studyLegacyPath = normalizeTestPath(v2Paths.ir.studySessions);
		const studyLocalPath = normalizeTestPath(pluginPaths.state.incrementalReading.studySessions);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[historyLegacyPath]: JSON.stringify({
					version: "4.0",
					sessions: [
						{
							id: "legacy-history-1",
							blockId: "chunk-1",
							deckId: "topic-1",
							topicId: "topic-1",
							startTime: "2026-04-16T08:00:00.000Z",
							endTime: "2026-04-16T08:05:00.000Z",
							duration: 300,
							action: "completed",
							rating: 3,
						},
					],
				}),
				[calendarLegacyPath]: JSON.stringify({
					version: "4.0",
					byDate: {
						"2026-04-16": ["chunk-1"],
					},
				}),
				[studyLegacyPath]: JSON.stringify({
					version: "1.0",
					sessions: [
						{
							id: "legacy-study-1",
							deckId: "topic-1",
							topicId: "topic-1",
							deckName: "Topic One",
							topicName: "Topic One",
							startTime: "2026-04-16T08:00:00.000Z",
							endTime: "2026-04-16T08:20:00.000Z",
							autoRecordedDuration: 1200,
							confirmedDuration: 1200,
							blocksCompleted: 2,
							cardsCreated: 1,
						},
					],
				}),
			},
		});
		const service = new IRStorageService(app as any);

		expect((await service.getHistory()).sessions[0]?.id).toBe("legacy-history-1");
		expect((await service.getCalendarProgress())["2026-04-16"]).toEqual(["chunk-1"]);
		expect((await service.getStudySessions())[0]?.id).toBe("legacy-study-1");

		await service.addSession({
			id: "history-local-2",
			blockId: "chunk-2",
			deckId: "topic-1",
			topicId: "topic-1",
			startTime: "2026-04-17T08:00:00.000Z",
			endTime: "2026-04-17T08:02:00.000Z",
			duration: 120,
			action: "completed",
			rating: 4,
		});
		await service.addCalendarCompletion("2026-04-17", "chunk-2");
		await service.addStudySession({
			id: "study-local-2",
			deckId: "topic-1",
			topicId: "topic-1",
			deckName: "Topic One",
			topicName: "Topic One",
			startTime: "2026-04-17T09:00:00.000Z",
			endTime: "2026-04-17T09:10:00.000Z",
			autoRecordedDuration: 600,
			confirmedDuration: 600,
			blocksCompleted: 1,
			cardsCreated: 0,
		});

		expect(files.has(historyLocalPath)).toBe(true);
		expect(JSON.parse(files.get(historyLocalPath) || "{}")).toMatchObject({
			sessions: expect.arrayContaining([
				expect.objectContaining({ id: "legacy-history-1" }),
				expect.objectContaining({ id: "history-local-2" }),
			]),
		});
		expect(JSON.parse(files.get(historyLegacyPath) || "{}")).toMatchObject({
			sessions: [expect.objectContaining({ id: "legacy-history-1" })],
		});

		expect(files.has(calendarLocalPath)).toBe(true);
		expect(JSON.parse(files.get(calendarLocalPath) || "{}")).toMatchObject({
			byDate: {
				"2026-04-16": ["chunk-1"],
				"2026-04-17": ["chunk-2"],
			},
		});
		expect(JSON.parse(files.get(calendarLegacyPath) || "{}")).toMatchObject({
			byDate: {
				"2026-04-16": ["chunk-1"],
			},
		});

		expect(files.has(studyLocalPath)).toBe(true);
		expect(JSON.parse(files.get(studyLocalPath) || "{}")).toMatchObject({
			sessions: expect.arrayContaining([
				expect.objectContaining({ id: "legacy-study-1" }),
				expect.objectContaining({ id: "study-local-2" }),
			]),
		});
		expect(JSON.parse(files.get(studyLegacyPath) || "{}")).toMatchObject({
			sessions: [expect.objectContaining({ id: "legacy-study-1" })],
		});
	});
});
