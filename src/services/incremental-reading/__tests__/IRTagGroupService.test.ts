import { getV2Paths } from "../../../config/paths";
import { IR_POINT_STORAGE_VERSION } from "../../../types/ir-point-storage-types";
import {
	DEFAULT_TAG_GROUP,
	DEFAULT_TAG_GROUP_PROFILE,
	type IRTagGroup,
	type IRTagGroupProfile,
} from "../../../types/ir-types";
import { IRTagGroupService } from "../IRTagGroupService";
import { createMemoryApp, normalizeTestPath } from "./testMemoryApp";

function cloneDefaultGroup(): IRTagGroup {
	return {
		...DEFAULT_TAG_GROUP,
		createdAt: "2026-04-17T00:00:00.000Z",
		updatedAt: "2026-04-17T00:00:00.000Z",
	};
}

function cloneDefaultProfile(groupId = DEFAULT_TAG_GROUP_PROFILE.groupId): IRTagGroupProfile {
	return {
		...DEFAULT_TAG_GROUP_PROFILE,
		groupId,
		updatedAt: "2026-04-17T00:00:00.000Z",
	};
}

function buildGroup(
	id: string,
	name: string,
	matchAnyTags: string[],
	updatedAt = "2026-04-17T00:00:00.000Z"
): IRTagGroup {
	return {
		id,
		name,
		description: `${name} group`,
		matchAnyTags,
		matchPriority: 50,
		matchSource: {
			yamlTags: true,
			inlineTags: true,
			customProperties: [],
		},
		createdAt: "2026-04-16T00:00:00.000Z",
		updatedAt,
	};
}

function buildProfile(
	groupId: string,
	overrides: Partial<IRTagGroupProfile> = {}
): IRTagGroupProfile {
	return {
		...cloneDefaultProfile(groupId),
		intervalFactorBase: 1.8,
		initialIntervalMultiplier: 1.1,
		sampleCount: 3,
		...overrides,
		groupId,
	};
}

function buildPoint(pointId: string, tagGroupId: string) {
	return {
		id: pointId,
		pointType: "epub-bookmark",
		materialId: "",
		source: {
			id: `src-${pointId}`,
			type: "epub" as const,
			path: "Books/Test.epub",
			title: "Test Book",
		},
		timestamps: {
			createdAt: "2026-04-16T00:00:00.000Z",
			updatedAt: "2026-04-17T00:00:00.000Z",
		},
		trace: {
			locatorType: "epub-cfi",
			locator: { cfi: "epubcfi(/6/2)" },
			traceState: "verified" as const,
			traceConfidence: 1,
			fallbackLocators: [],
		},
		parameterContext: {
			materialClass: "academic-book",
			scheduleProfileRef: "profile-academic-book",
			classificationSource: "manual" as const,
			isOverride: false,
		},
		schedule: {
			status: "new",
			priorityScore: 5,
			manualPriority: 5,
			nextReviewAt: null,
			lastReviewedAt: null,
			intervalDays: 1,
			snoozeUntil: null,
			doneReason: null,
		},
		relations: {
			topicIds: ["topic-1"],
			parentPointId: null,
			linkedCardIds: [],
			linkedNotePaths: [],
		},
		userData: {
			title: pointId,
			tags: [],
			isStarred: false,
		},
		stats: {
			impressionCount: 0,
			reviewCount: 0,
			extractCount: 0,
			cardCreatedCount: 0,
			noteCreatedCount: 0,
			totalReadingTimeMs: 0,
		},
		audit: {
			createdBy: "test",
		},
		metadata: {
			tagGroupId,
		},
	};
}

function buildPointFile(options: {
	topicId: string;
	topicName: string;
	tagGroups?: Record<string, IRTagGroup>;
	tagGroupProfiles?: Record<string, IRTagGroupProfile>;
	points?: ReturnType<typeof buildPoint>[];
}) {
	return JSON.stringify({
		schemaVersion: IR_POINT_STORAGE_VERSION,
		topicId: options.topicId,
		topicName: options.topicName,
		updatedAt: "2026-04-17T00:00:00.000Z",
		tagGroups: options.tagGroups || {
			default: cloneDefaultGroup(),
		},
		tagGroupProfiles: options.tagGroupProfiles || {
			default: cloneDefaultProfile(),
		},
		points: options.points || [],
	});
}

describe("IRTagGroupService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-17T00:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("aggregates groups and scope metadata from .irdeck files", async () => {
		const v2Paths = getV2Paths("");
		const paperGroup = buildGroup("paper", "论文", ["paper"]);
		const paperProfile = buildProfile("paper", { intervalFactorBase: 1.9 });
		const novelGroup = buildGroup("novel", "小说", ["fiction"], "2026-04-17T01:00:00.000Z");
		const novelProfile = buildProfile("novel", { intervalFactorBase: 1.4 });
		const { app } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.pointFilesIndex]: JSON.stringify({
				schemaVersion: IR_POINT_STORAGE_VERSION,
				updatedAt: "2026-04-17T00:00:00.000Z",
				files: [
					{
						topicId: "topic-a",
						topicName: "专题 A",
						file: "points/专题 A.irdeck",
						pointCount: 0,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
					{
						topicId: "topic-b",
						topicName: "专题 B",
						file: "points/专题 B.irdeck",
						pointCount: 0,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
				],
				}),
				[`${v2Paths.ir.root}/points/专题 A.irdeck`]: buildPointFile({
				topicId: "topic-a",
				topicName: "专题 A",
				tagGroups: {
					default: cloneDefaultGroup(),
					paper: paperGroup,
				},
				tagGroupProfiles: {
					default: cloneDefaultProfile(),
					paper: paperProfile,
				},
				}),
				[`${v2Paths.ir.root}/points/专题 B.irdeck`]: buildPointFile({
				topicId: "topic-b",
				topicName: "专题 B",
				tagGroups: {
					default: cloneDefaultGroup(),
					novel: novelGroup,
				},
				tagGroupProfiles: {
					default: cloneDefaultProfile(),
					novel: novelProfile,
				},
				}),
			},
		});
		const service = new IRTagGroupService(app as any);

		const groups = await service.getAllGroups();
		const deckScopes = await service.getDeckScopes();

		expect(groups.map((group) => group.id)).toEqual(["paper", "novel", "default"]);
		expect(deckScopes).toEqual([
			{ topicId: "topic-a", topicName: "专题 A" },
			{ topicId: "topic-b", topicName: "专题 B" },
		]);
		expect(await service.getGroupScopeTopicIds("paper")).toEqual(["topic-a"]);
		expect(await service.getGroupScopeTopicIds("novel")).toEqual(["topic-b"]);
		expect((await service.getProfile("paper")).intervalFactorBase).toBe(1.9);
	});

	it("ignores legacy tag-group files for runtime reads until an explicit migration runs", async () => {
		const v2Paths = getV2Paths("");
		const legacyGroup = buildGroup("paper", "论文", ["paper"]);
		const legacyProfile = buildProfile("paper", { intervalFactorBase: 2.1, sampleCount: 8 });
		const pointFilePath = normalizeTestPath(`${v2Paths.ir.root}/points/专题 A.irdeck`);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.tagGroups]: JSON.stringify({
				version: "1.0.0",
				groups: {
					paper: legacyGroup,
				},
				}),
				[v2Paths.ir.tagGroupProfiles]: JSON.stringify({
				version: "1.0.0",
				profiles: {
					paper: legacyProfile,
				},
				}),
				[v2Paths.ir.pointFilesIndex]: JSON.stringify({
				schemaVersion: IR_POINT_STORAGE_VERSION,
				updatedAt: "2026-04-17T00:00:00.000Z",
				files: [
					{
						topicId: "topic-a",
						topicName: "专题 A",
						file: "points/专题 A.irdeck",
						pointCount: 0,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
				],
				}),
				[pointFilePath]: JSON.stringify({
				schemaVersion: IR_POINT_STORAGE_VERSION,
				topicId: "topic-a",
				topicName: "专题 A",
				updatedAt: "2026-04-17T00:00:00.000Z",
				points: [],
				}),
			},
		});
		const service = new IRTagGroupService(app as any);

		const groups = await service.getAllGroups();
		const deckFile = JSON.parse(files.get(pointFilePath) || "{}");

		expect(groups.map((group) => group.id)).toEqual(["default"]);
		expect(await service.getGroupScopeTopicIds("paper")).toEqual([]);
		expect(deckFile.tagGroups?.paper).toBeUndefined();
		expect(deckFile.tagGroupProfiles?.paper).toBeUndefined();
	});

	it("migrates legacy tag-group files into .irdeck files only through the explicit migration API", async () => {
		const v2Paths = getV2Paths("");
		const legacyGroup = buildGroup("paper", "论文", ["paper"]);
		const legacyProfile = buildProfile("paper", { intervalFactorBase: 2.1, sampleCount: 8 });
		const pointFilePath = normalizeTestPath(`${v2Paths.ir.root}/points/专题 A.irdeck`);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.tagGroups]: JSON.stringify({
					version: "1.0.0",
					groups: {
						paper: legacyGroup,
					},
				}),
				[v2Paths.ir.tagGroupProfiles]: JSON.stringify({
					version: "1.0.0",
					profiles: {
						paper: legacyProfile,
					},
				}),
				[v2Paths.ir.pointFilesIndex]: JSON.stringify({
					schemaVersion: IR_POINT_STORAGE_VERSION,
					updatedAt: "2026-04-17T00:00:00.000Z",
					files: [
						{
							topicId: "topic-a",
							topicName: "专题 A",
							file: "points/专题 A.irdeck",
							pointCount: 0,
							updatedAt: "2026-04-17T00:00:00.000Z",
						},
					],
				}),
				[pointFilePath]: JSON.stringify({
					schemaVersion: IR_POINT_STORAGE_VERSION,
					topicId: "topic-a",
					topicName: "专题 A",
					updatedAt: "2026-04-17T00:00:00.000Z",
					points: [],
				}),
			},
		});
		const service = new IRTagGroupService(app as any);

		const report = await service.migrateLegacyCatalogToPointFiles({
			cleanupLegacyFiles: true,
		});
		const groups = await service.getAllGroups();
		const deckFile = JSON.parse(files.get(pointFilePath) || "{}");

		expect(report.embeddedTopicCount).toBe(1);
		expect(report.removedLegacyFileCount).toBe(2);
		expect(report.remainingLegacyFiles).toEqual([]);
		expect(groups.some((group) => group.id === "paper")).toBe(true);
		expect(await service.getGroupScopeTopicIds("paper")).toEqual(["topic-a"]);
		expect(deckFile.tagGroups.paper).toMatchObject({
			id: "paper",
			name: "论文",
		});
		expect(deckFile.tagGroupProfiles.paper).toMatchObject({
			groupId: "paper",
			intervalFactorBase: 2.1,
			sampleCount: 8,
		});
		expect(files.has(normalizeTestPath(v2Paths.ir.tagGroups))).toBe(false);
		expect(files.has(normalizeTestPath(v2Paths.ir.tagGroupProfiles))).toBe(false);
	});

	it("writes group and profile back only to selected .irdeck files", async () => {
		const v2Paths = getV2Paths("");
		const topicAPath = normalizeTestPath(`${v2Paths.ir.root}/points/专题 A.irdeck`);
		const topicBPath = normalizeTestPath(`${v2Paths.ir.root}/points/专题 B.irdeck`);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.pointFilesIndex]: JSON.stringify({
				schemaVersion: IR_POINT_STORAGE_VERSION,
				updatedAt: "2026-04-17T00:00:00.000Z",
				files: [
					{
						topicId: "topic-a",
						topicName: "专题 A",
						file: "points/专题 A.irdeck",
						pointCount: 0,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
					{
						topicId: "topic-b",
						topicName: "专题 B",
						file: "points/专题 B.irdeck",
						pointCount: 0,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
				],
				}),
				[topicAPath]: buildPointFile({ topicId: "topic-a", topicName: "专题 A" }),
				[topicBPath]: buildPointFile({ topicId: "topic-b", topicName: "专题 B" }),
			},
		});
		const service = new IRTagGroupService(app as any);
		const group = buildGroup("paper", "论文", ["paper"]);
		const profile = buildProfile("paper", { intervalFactorBase: 2.2, sampleCount: 6 });

		const groupResult = await service.saveGroup(group, { targetTopicIds: ["topic-b"] });
		const profileResult = await service.saveProfile(profile, { targetTopicIds: ["topic-b"] });
		const topicAFile = JSON.parse(files.get(topicAPath) || "{}");
		const topicBFile = JSON.parse(files.get(topicBPath) || "{}");

		expect(groupResult.affectedTopicIds).toEqual(["topic-b"]);
		expect(new Set(profileResult.affectedTopicIds)).toEqual(new Set(["topic-b"]));
		expect(topicAFile.tagGroups.paper).toBeUndefined();
		expect(topicAFile.tagGroupProfiles.paper).toBeUndefined();
		expect(topicBFile.tagGroups.paper).toMatchObject({
			id: "paper",
			name: "论文",
		});
		expect(topicBFile.tagGroupProfiles.paper).toMatchObject({
			groupId: "paper",
			intervalFactorBase: 2.2,
			sampleCount: 6,
		});
		expect(await service.getGroupScopeTopicIds("paper")).toEqual(["topic-b"]);
	});

	it("removes a group from selected .irdeck files and resets affected points to default", async () => {
		const v2Paths = getV2Paths("");
		const group = buildGroup("paper", "论文", ["paper"]);
		const profile = buildProfile("paper");
		const topicAPath = normalizeTestPath(`${v2Paths.ir.root}/points/专题 A.irdeck`);
		const topicBPath = normalizeTestPath(`${v2Paths.ir.root}/points/专题 B.irdeck`);
		const { app, files } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.pointFilesIndex]: JSON.stringify({
				schemaVersion: IR_POINT_STORAGE_VERSION,
				updatedAt: "2026-04-17T00:00:00.000Z",
				files: [
					{
						topicId: "topic-a",
						topicName: "专题 A",
						file: "points/专题 A.irdeck",
						pointCount: 1,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
					{
						topicId: "topic-b",
						topicName: "专题 B",
						file: "points/专题 B.irdeck",
						pointCount: 1,
						updatedAt: "2026-04-17T00:00:00.000Z",
					},
				],
				}),
				[topicAPath]: buildPointFile({
				topicId: "topic-a",
				topicName: "专题 A",
				tagGroups: {
					default: cloneDefaultGroup(),
					paper: group,
				},
				tagGroupProfiles: {
					default: cloneDefaultProfile(),
					paper: profile,
				},
				points: [buildPoint("point-a", "paper")],
				}),
				[topicBPath]: buildPointFile({
				topicId: "topic-b",
				topicName: "专题 B",
				tagGroups: {
					default: cloneDefaultGroup(),
					paper: group,
				},
				tagGroupProfiles: {
					default: cloneDefaultProfile(),
					paper: profile,
				},
				points: [buildPoint("point-b", "paper")],
				}),
			},
		});
		const service = new IRTagGroupService(app as any);

		await service.getAllGroups();
		await service.deleteGroup("paper", {
			targetTopicIds: ["topic-a"],
		});

		const topicAFile = JSON.parse(files.get(topicAPath) || "{}");
		const topicBFile = JSON.parse(files.get(topicBPath) || "{}");

		expect(topicAFile.tagGroups.paper).toBeUndefined();
		expect(topicAFile.tagGroupProfiles.paper).toBeUndefined();
		expect(topicAFile.points[0].metadata.tagGroupId).toBe("default");
		expect(topicBFile.tagGroups.paper).toMatchObject({
			id: "paper",
			name: "论文",
		});
		expect(topicBFile.points[0].metadata.tagGroupId).toBe("paper");
		expect(await service.getGroupScopeTopicIds("paper")).toEqual(["topic-b"]);
	});
});
