vi.mock('obsidian', async (importOriginal) => {
	const actual = await importOriginal<typeof import('obsidian')>();
	return {
		...actual,
		App: actual.App ?? class MockApp {},
		TFile: actual.TFile ?? class MockTFile {},
		ItemView: actual.ItemView ?? class MockItemView {},
		WorkspaceLeaf: actual.WorkspaceLeaf ?? class MockWorkspaceLeaf {},
		MarkdownView: actual.MarkdownView ?? class MockMarkdownView {},
		Notice: actual.Notice ?? class MockNotice { constructor(_message?: string) {} },
		Menu: actual.Menu ?? class MockMenu {},
		Modal: actual.Modal ?? class MockModal {},
		Plugin: actual.Plugin ?? class MockPlugin {},
		PluginSettingTab: actual.PluginSettingTab ?? class MockPluginSettingTab {},
		Platform: actual.Platform ?? { isMobile: false },
		normalizePath:
			actual.normalizePath ??
			((value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')),
	};
});

import { describe, expect, it } from "vitest";
import type { IRPointSnapshot } from "../../../types/ir-point-storage-types";
import {
	buildLegacyBlockFromPointSnapshot,
	buildLegacyChunkFromPointSnapshot,
	buildLegacyPdfTaskFromPointSnapshot,
} from "../IRLegacyTaskCompatAdapter";

function createSnapshot(overrides?: Partial<IRPointSnapshot>): IRPointSnapshot {
	const base = {
		topicId: "topic-1",
		topicName: "Topic 1",
		material: {
			id: "material-1",
			source: {
				path: "Notes/Source.md",
				type: "markdown",
			},
			bibliography: {
				title: "Source Title",
			},
		} as any,
		point: {
			id: "point-1",
			materialId: "material-1",
			pointType: "selection-entry",
			source: {
				type: "markdown",
				path: "Notes/Source.md",
				title: "Source Title",
			},
			trace: {
				locatorType: "markdown-selection",
				locator: {
					sourcePath: "Notes/Source.md",
					filePath: "Notes/Source.md",
					headingText: "Heading",
					headingPath: ["Heading"],
					startLine: 10,
					endLine: 12,
					headingLevel: 2,
				},
			},
			relations: {
				topicIds: ["topic-1"],
				linkedCardIds: [],
				linkedNotePaths: ["Notes/Topic", "Notes/Topic.md", "Notes/Appendix.md"],
			},
			userData: {
				title: "Point Title",
				tags: ["tag-a"],
				isStarred: false,
				note: "",
			},
			schedule: {
				status: "active",
				manualPriority: 5,
				priorityScore: 5,
				intervalDays: 3,
				nextReviewAt: "2026-04-30T00:00:00.000Z",
				lastReviewedAt: "2026-04-24T00:00:00.000Z",
			},
			stats: {
				totalReadingTimeMs: 30000,
				impressionCount: 2,
				reviewCount: 2,
				extractCount: 1,
				cardCreatedCount: 1,
				noteCreatedCount: 1,
			},
			timestamps: {
				createdAt: "2026-04-20T00:00:00.000Z",
				updatedAt: "2026-04-24T00:00:00.000Z",
				lastInteractionAt: "2026-04-24T00:00:00.000Z",
			},
			metadata: {
				tagGroupId: "group-a",
			},
			audit: {
				origin: {
					type: "legacy-import",
				},
			},
		} as any,
	} as any as IRPointSnapshot;

	return {
		...base,
		...overrides,
		point: {
			...base.point,
			...(overrides?.point || {}),
			relations: {
				...base.point.relations,
				...((overrides?.point as any)?.relations || {}),
			},
			trace: {
				...base.point.trace,
				...((overrides?.point as any)?.trace || {}),
				locator: {
					...base.point.trace.locator,
					...((overrides?.point as any)?.trace?.locator || {}),
				},
			},
			userData: {
				...base.point.userData,
				...((overrides?.point as any)?.userData || {}),
			},
			schedule: {
				...base.point.schedule,
				...((overrides?.point as any)?.schedule || {}),
			},
			stats: {
				...base.point.stats,
				...((overrides?.point as any)?.stats || {}),
			},
			timestamps: {
				...base.point.timestamps,
				...((overrides?.point as any)?.timestamps || {}),
			},
			metadata: {
				...base.point.metadata,
				...((overrides?.point as any)?.metadata || {}),
			},
		},
	};
}

describe("IRLegacyTaskCompatAdapter", () => {
	it("buildLegacyBlockFromPointSnapshot 会统一 linkedNotePaths 的去重与主路径选择", () => {
		const block = buildLegacyBlockFromPointSnapshot(createSnapshot()) as any;

		expect(block).toBeTruthy();
		expect(block?.primaryAssociatedNotePath).toBe("Notes/Topic.md");
		expect(block?.associatedNotePath).toBe("Notes/Topic.md");
		expect(block?.associatedNotePaths).toEqual(["Notes/Topic.md", "Notes/Appendix.md"]);
		expect(block?.meta?.associatedNotePaths).toEqual(["Notes/Topic.md", "Notes/Appendix.md"]);
	});

	it("buildLegacyPdfTaskFromPointSnapshot 会对 point meta 中关联笔记保持同一口径", () => {
		const task = buildLegacyPdfTaskFromPointSnapshot(
			createSnapshot({
				point: {
					id: "pdfbm-1",
					pointType: "selection-entry",
					source: {
						type: "pdf",
						path: "Docs/demo.pdf",
						title: "Demo PDF",
					},
					trace: {
						locatorType: "pdf-selection",
						locator: {
							pdfPath: "Docs/demo.pdf",
							link: "obsidian://pdf-demo",
							annotationId: "ann-1",
						},
					},
				},
				material: {
					id: "material-pdf",
					source: {
						path: "Docs/demo.pdf",
						type: "pdf",
					},
					bibliography: {
						title: "Demo PDF",
					},
				} as any,
			} as any)
		);

		expect(task.meta?.primaryAssociatedNotePath).toBe("Notes/Topic.md");
		expect(task.meta?.associatedNotePath).toBe("Notes/Topic.md");
		expect(task.meta?.associatedNotePaths).toEqual(["Notes/Topic.md", "Notes/Appendix.md"]);
	});

	it("buildLegacyChunkFromPointSnapshot 会恢复 today 模式依赖的序列锚点与订阅元数据", () => {
		const { chunk } = buildLegacyChunkFromPointSnapshot(
			createSnapshot({
				point: {
					id: "chunk-1",
					pointType: "chunk-entry",
					trace: {
						locatorType: "markdown-chunk",
						locator: {
							chunkFilePath: "Inbox/Subscribed/demo.md",
							sourcePath: "Inbox/Subscribed/demo.md",
						},
					},
					metadata: {
						tagGroupId: "group-a",
						sourceSequenceGroup: "md:Inbox/Subscribed/demo.md",
						sourceSequenceOrder: 1,
						sourceSequenceLocked: true,
						sourceSequenceAnchorDateKey: "2026-05-03",
						autoSubscribedAt: "2026-05-03T01:02:03.000Z",
						autoSubscribedFolderPath: "Inbox/Subscribed",
						autoSubscribedBadgeUntil: "2026-05-10T01:02:03.000Z",
						externalDocument: true,
						chunkFilePath: "Inbox/Subscribed/demo.md",
						sourcePath: "Inbox/Subscribed/demo.md",
					},
					schedule: {
						status: "new",
						manualPriority: 5,
						priorityScore: 5,
						intervalDays: 1,
						nextReviewAt: "2026-05-03T00:00:00.000Z",
					},
				},
			} as any)
		);
		const chunkMeta = ((chunk.meta || {}) as unknown) as Record<string, unknown>;

		expect(chunk.filePath).toBe("Inbox/Subscribed/demo.md");
		expect(chunk.nextRepDate).toBe(Date.parse("2026-05-03T00:00:00.000Z"));
		expect(chunk.scheduleStatus).toBe("new");
		expect(chunkMeta.sourceSequenceGroup).toBe("md:Inbox/Subscribed/demo.md");
		expect(chunkMeta.sourceSequenceOrder).toBe(1);
		expect(chunkMeta.sourceSequenceLocked).toBe(true);
		expect(chunkMeta.sourceSequenceAnchorDateKey).toBe("2026-05-03");
		expect(chunkMeta.autoSubscribedAt).toBe("2026-05-03T01:02:03.000Z");
		expect(chunkMeta.autoSubscribedFolderPath).toBe("Inbox/Subscribed");
		expect(chunkMeta.autoSubscribedBadgeUntil).toBe("2026-05-10T01:02:03.000Z");
		expect(chunkMeta.externalDocument).toBe(true);
	});
});
