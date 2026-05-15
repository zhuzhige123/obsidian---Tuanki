import type { IRPointSnapshot } from "../../types/ir-point-storage-types";
import type { IRPdfBookmarkTask } from "./IRPdfBookmarkTaskService";
import type { IREpubBookmarkTask } from "./IREpubBookmarkTaskService";
import type { IRBlock, IRBlockStatus, IRChunkFileData, IRSourceFileMeta } from "../../types/ir-types";
import { DEFAULT_IR_BLOCK_META, DEFAULT_IR_BLOCK_STATS } from "../../types/ir-types";
import { resolveAssociatedNotePath, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";

function toTimestamp(value: string | null | undefined): number {
	if (!value) {
		return 0;
	}
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getPointMetadataString(snapshot: IRPointSnapshot, key: string): string | undefined {
	const value = snapshot.point.metadata?.[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getPointMetadataNumber(snapshot: IRPointSnapshot, key: string): number | undefined {
	const value = snapshot.point.metadata?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getPointMetadataBoolean(snapshot: IRPointSnapshot, key: string): boolean | undefined {
	const value = snapshot.point.metadata?.[key];
	return typeof value === "boolean" ? value : undefined;
}

function getPointMetadataStringArray(snapshot: IRPointSnapshot, key: string): string[] | undefined {
	const value = snapshot.point.metadata?.[key];
	if (!Array.isArray(value)) {
		return undefined;
	}
	const normalized = value
		.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
		.filter(Boolean);
	return normalized.length > 0 ? normalized : undefined;
}

function resolvePointAssociatedNotePaths(snapshot: IRPointSnapshot): string[] {
	return resolveAssociatedNotePaths({
		associatedNotePaths: Array.isArray(snapshot.point.relations?.linkedNotePaths)
			? snapshot.point.relations?.linkedNotePaths
			: undefined,
	});
}

function toUnknownRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object"
		? (value as unknown as Record<string, unknown>)
		: undefined;
}

function getTaskTopicId(snapshot: IRPointSnapshot): string {
	const topicIds = Array.isArray(snapshot.point.relations?.topicIds)
		? snapshot.point.relations?.topicIds
		: [];
	return (
		topicIds.map((value) => String(value || "").trim()).find(Boolean) ||
		String(snapshot.topicId || "").trim() ||
		""
	);
}

function getPointStats(snapshot: IRPointSnapshot) {
	const readingSeconds = Math.max(
		0,
		Math.round(Number(snapshot.point.stats.totalReadingTimeMs || 0) / 1000)
	);
	const lastInteractionAt = toTimestamp(snapshot.point.timestamps.lastInteractionAt);
	return {
		...DEFAULT_IR_BLOCK_STATS,
		impressions: Math.max(
			Number(snapshot.point.stats.impressionCount || 0),
			Number(snapshot.point.stats.reviewCount || 0)
		),
		totalReadingTimeSec: readingSeconds,
		effectiveReadingTimeSec: readingSeconds,
		extracts: Number(snapshot.point.stats.extractCount || 0),
		cardsCreated: Number(snapshot.point.stats.cardCreatedCount || 0),
		notesWritten: Number(snapshot.point.stats.noteCreatedCount || 0),
		lastInteraction: lastInteractionAt,
		lastShownAt: lastInteractionAt,
	};
}

function getPointMeta(snapshot: IRPointSnapshot) {
	const linkedNotePaths = resolvePointAssociatedNotePaths(snapshot);
	const primaryAssociatedNotePath = resolveAssociatedNotePath({ associatedNotePaths: linkedNotePaths });
	return {
		...DEFAULT_IR_BLOCK_META,
		tagGroup: getPointMetadataString(snapshot, "tagGroupId") || DEFAULT_IR_BLOCK_META.tagGroup,
		primaryAssociatedNotePath,
		associatedNotePath: primaryAssociatedNotePath,
		associatedNotePaths: linkedNotePaths,
		...(getPointMetadataString(snapshot, "autoSubscribedAt")
			? { autoSubscribedAt: getPointMetadataString(snapshot, "autoSubscribedAt") }
			: {}),
		...(getPointMetadataString(snapshot, "autoSubscribedFolderPath")
			? { autoSubscribedFolderPath: getPointMetadataString(snapshot, "autoSubscribedFolderPath") }
			: {}),
		...(getPointMetadataString(snapshot, "autoSubscribedBadgeUntil")
			? { autoSubscribedBadgeUntil: getPointMetadataString(snapshot, "autoSubscribedBadgeUntil") }
			: {}),
		...(getPointMetadataBoolean(snapshot, "externalDocument") !== undefined
			? { externalDocument: getPointMetadataBoolean(snapshot, "externalDocument") }
			: {}),
		...(getPointMetadataString(snapshot, "pointTitle")
			? { pointTitle: getPointMetadataString(snapshot, "pointTitle") }
			: typeof snapshot.point.userData?.title === "string" && snapshot.point.userData.title.trim()
				? { pointTitle: snapshot.point.userData.title.trim() }
				: {}),
		...(getPointMetadataString(snapshot, "resumeLink")
			? { resumeLink: getPointMetadataString(snapshot, "resumeLink") }
			: {}),
		...(getPointMetadataString(snapshot, "canvasNodeId")
			? { canvasNodeId: getPointMetadataString(snapshot, "canvasNodeId") }
			: {}),
		...(getPointMetadataStringArray(snapshot, "canvasTextCandidates")
			? { canvasTextCandidates: getPointMetadataStringArray(snapshot, "canvasTextCandidates") }
			: {}),
		...(getPointMetadataString(snapshot, "sourceSequenceGroup")
			? { sourceSequenceGroup: getPointMetadataString(snapshot, "sourceSequenceGroup") }
			: {}),
		...(getPointMetadataNumber(snapshot, "sourceSequenceOrder") !== undefined
			? { sourceSequenceOrder: getPointMetadataNumber(snapshot, "sourceSequenceOrder") }
			: {}),
		...(getPointMetadataBoolean(snapshot, "sourceSequenceLocked") !== undefined
			? { sourceSequenceLocked: getPointMetadataBoolean(snapshot, "sourceSequenceLocked") }
			: {}),
		...(getPointMetadataString(snapshot, "sourceSequenceAnchorDateKey")
			? { sourceSequenceAnchorDateKey: getPointMetadataString(snapshot, "sourceSequenceAnchorDateKey") }
			: {}),
	};
}

export function getStoredPointKind(snapshot: IRPointSnapshot): "pdf" | "epub" | "chunk" | null {
	const point = snapshot.point;
	if (point.id.startsWith("pdfbm-")) {
		return "pdf";
	}
	if (point.id.startsWith("epubbm-")) {
		return "epub";
	}

	const originType = point.audit?.origin?.type;
	const locatorType = point.trace?.locatorType;
	if (originType === "pdf-bookmark") {
		return "pdf";
	}
	if (originType === "epub-bookmark") {
		return "epub";
	}

	if (locatorType === "pdf-selection") {
		return "pdf";
	}
	if (locatorType === "epub-chapter") {
		return "epub";
	}

	if (point.pointType === "selection-entry" && point.source?.type === "pdf") {
		return "pdf";
	}
	if (point.pointType === "chapter-entry" && point.source?.type === "epub") {
		return "epub";
	}
	if (
		point.pointType === "chunk-entry" ||
		originType === "ir-chunk" ||
		locatorType === "markdown-chunk"
	) {
		return "chunk";
	}

	return null;
}

function toLegacyPriority(priority: number): 1 | 2 | 3 {
	if (priority >= 6) {
		return 1;
	}
	if (priority >= 4) {
		return 2;
	}
	return 3;
}

function toLegacyBlockState(status: string | null | undefined): IRBlock["state"] {
	switch (String(status || "").trim()) {
		case "queued":
		case "active":
			return "learning";
		case "scheduled":
			return "review";
		case "suspended":
			return "suspended";
		case "new":
			return "new";
		default:
			return "new";
	}
}

function readNumberRecordValue(
	record: Record<string, unknown> | undefined,
	key: string
): number | undefined {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringRecordValue(
	record: Record<string, unknown> | undefined,
	key: string
): string | undefined {
	const value = record?.[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArrayRecordValue(
	record: Record<string, unknown> | undefined,
	key: string
): string[] {
	const value = record?.[key];
	return Array.isArray(value)
		? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
		: [];
}

export function isLegacyBlockPointSnapshot(snapshot: IRPointSnapshot): boolean {
	return getStoredPointKind(snapshot) === null && snapshot.point.source?.type === "markdown";
}

export function buildLegacyBlockFromPointSnapshot(snapshot: IRPointSnapshot): IRBlock | null {
	if (!isLegacyBlockPointSnapshot(snapshot)) {
		return null;
	}

	const point = snapshot.point;
	const schedule = toUnknownRecord(point.schedule);
	const timestamps = toUnknownRecord(point.timestamps);
	const relations = toUnknownRecord(point.relations);
	const userData = toUnknownRecord(point.userData);
	const stats = toUnknownRecord(point.stats);
	const scheduleStatus = readStringRecordValue(schedule, "status") || "new";
	if (scheduleStatus === "done" || scheduleStatus === "removed") {
		return null;
	}

	const metadata =
		point.metadata && typeof point.metadata === "object"
			? (point.metadata as Record<string, unknown>)
			: undefined;
	const locator =
		point.trace?.locator && typeof point.trace.locator === "object"
			? (point.trace.locator as Record<string, unknown>)
			: undefined;
	const filePath =
		readStringRecordValue(metadata, "sourcePath") ||
		readStringRecordValue(locator, "sourcePath") ||
		readStringRecordValue(locator, "filePath") ||
		point.source?.path ||
		snapshot.material?.source.path ||
		"";
	const explicitHeadingPath = readStringArrayRecordValue(metadata, "headingPath");
	const locatorHeadingPath = readStringArrayRecordValue(locator, "headingPath");
	const title =
		readStringRecordValue(userData, "title") ||
		readStringRecordValue(metadata, "headingText") ||
		readStringRecordValue(locator, "headingText") ||
		point.source?.title ||
		point.id;
	const headingPath =
		explicitHeadingPath.length > 0
			? explicitHeadingPath
			: locatorHeadingPath.length > 0
				? locatorHeadingPath
				: title
					? [title]
					: [];
	const headingText = headingPath[headingPath.length - 1] || title || point.id;
	const startLine =
		readNumberRecordValue(metadata, "startLine") ??
		readNumberRecordValue(locator, "startLine") ??
		0;
	const endLine =
		readNumberRecordValue(metadata, "endLine") ??
		readNumberRecordValue(locator, "endLine") ??
		startLine;
	const headingLevel =
		readNumberRecordValue(metadata, "headingLevel") ??
		readNumberRecordValue(locator, "headingLevel") ??
		1;
	const priorityUi = Number(readNumberRecordValue(schedule, "manualPriority") || 0);
	const priorityEff = Number(readNumberRecordValue(schedule, "priorityScore") || priorityUi || 0);
	const tagGroupId =
		getPointMetadataString(snapshot, "tagGroupId") ||
		getPointMetadataString(snapshot, "tagGroup") ||
		DEFAULT_IR_BLOCK_META.tagGroup;
	const associatedNotePaths = resolvePointAssociatedNotePaths(snapshot);
	const primaryAssociatedNotePath = resolveAssociatedNotePath({ associatedNotePaths });

	return {
		id: point.id,
		filePath,
		headingPath,
		headingLevel: Math.max(1, Math.round(headingLevel || 1)),
		startLine: Math.max(0, Math.round(startLine || 0)),
		endLine: Math.max(0, Math.round(endLine || startLine || 0)),
		priority: toLegacyPriority(priorityUi || priorityEff),
		state: toLegacyBlockState(scheduleStatus),
		interval: Math.max(0, Math.round(Number(readNumberRecordValue(schedule, "intervalDays") || 0))),
		intervalFactor:
			readNumberRecordValue(metadata, "intervalFactor") ??
			readNumberRecordValue(locator, "intervalFactor") ??
			1.5,
		nextReview: readStringRecordValue(schedule, "nextReviewAt") || null,
		reviewCount: Math.max(
			Number(readNumberRecordValue(stats, "reviewCount") || 0),
			Number(readNumberRecordValue(stats, "impressionCount") || 0)
		),
		lastReview:
			readStringRecordValue(schedule, "lastReviewedAt") ||
			readStringRecordValue(timestamps, "lastInteractionAt") ||
			null,
		favorite: Boolean(userData?.isStarred ?? userData?.starred),
		tags: Array.isArray(userData?.tags) ? [...(userData.tags as string[])] : [],
		notes:
			readStringRecordValue(userData, "note") ||
			readStringRecordValue(userData, "notes") ||
			"",
		extractedCards: Array.isArray(relations?.linkedCardIds)
			? [...(relations.linkedCardIds as string[])]
			: [],
		totalReadingTime: Math.max(
			0,
			Math.round(Number(readNumberRecordValue(stats, "totalReadingTimeMs") || 0) / 1000)
		),
		firstReadAt: readStringRecordValue(timestamps, "createdAt") || null,
		priorityUi,
		priorityEff,
		tagGroupId,
		createdAt: readStringRecordValue(timestamps, "createdAt") || new Date(0).toISOString(),
		updatedAt:
			readStringRecordValue(timestamps, "updatedAt") ||
			readStringRecordValue(timestamps, "createdAt") ||
			new Date(0).toISOString(),
		headingText,
		deckPath: String(snapshot.topicId || "").trim() || undefined,
		blockIndex: Math.max(0, Math.round(startLine || 0)),
		contentPreview:
			readStringRecordValue(metadata, "contentPreview") ||
			readStringRecordValue(locator, "contentPreview") ||
			headingText,
		primaryAssociatedNotePath,
		associatedNotePath: primaryAssociatedNotePath,
		associatedNotePaths,
		meta: {
			...DEFAULT_IR_BLOCK_META,
			tagGroup: tagGroupId,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
		},
	} as IRBlock;
}

export function getLegacyBookmarkTaskKind(snapshot: IRPointSnapshot): "pdf" | "epub" | null {
	const kind = getStoredPointKind(snapshot);
	return kind === "pdf" || kind === "epub" ? kind : null;
}

export function buildLegacyChunkFromPointSnapshot(snapshot: IRPointSnapshot): {
	chunk: IRChunkFileData;
	source: IRSourceFileMeta;
} {
	const topicIds = Array.isArray(snapshot.point.relations?.topicIds)
		? snapshot.point.relations?.topicIds.map((value) => String(value || "").trim()).filter(Boolean)
		: [];
	const locator = snapshot.point.trace.locator || {};
	const userData = toUnknownRecord(snapshot.point.userData);
	const chunkFilePath =
		typeof userData?.sourceFilePath === "string"
			? userData.sourceFilePath.trim()
			: typeof snapshot.point.metadata?.chunkFilePath === "string"
				? snapshot.point.metadata.chunkFilePath.trim()
				: typeof locator.chunkFilePath === "string" && locator.chunkFilePath.trim()
					? locator.chunkFilePath.trim()
					: snapshot.point.source?.path || snapshot.material?.source.path || "";
	const sourcePath =
		typeof snapshot.point.metadata?.sourcePath === "string" &&
		snapshot.point.metadata.sourcePath.trim()
			? snapshot.point.metadata.sourcePath.trim()
			: typeof snapshot.point.metadata?.rawFilePath === "string" &&
				snapshot.point.metadata.rawFilePath.trim()
				? snapshot.point.metadata.rawFilePath.trim()
				: typeof locator.sourcePath === "string" && locator.sourcePath.trim()
					? locator.sourcePath.trim()
					: snapshot.point.source?.path || snapshot.material?.source.path || chunkFilePath;
	const rawFilePath =
		(typeof snapshot.point.metadata?.rawFilePath === "string" &&
			snapshot.point.metadata.rawFilePath.trim()) ||
		sourcePath;
	const indexFilePath =
		(typeof snapshot.point.metadata?.indexFilePath === "string" &&
			snapshot.point.metadata.indexFilePath.trim()) ||
		"";
	const sourceTitle =
		(typeof snapshot.point.metadata?.sourceTitle === "string" &&
			snapshot.point.metadata.sourceTitle.trim()) ||
		snapshot.point.source?.title ||
		snapshot.material?.bibliography.title ||
		snapshot.point.userData.title ||
		snapshot.point.id;

	return {
		chunk: {
			chunkId: snapshot.point.id,
			sourceId: snapshot.point.materialId,
			filePath: chunkFilePath,
			topicIds,
			deckIds: topicIds,
			favorite: Boolean(snapshot.point.userData.isStarred),
			priorityUi: Number(snapshot.point.schedule.manualPriority || 0),
			priorityEff: Number(snapshot.point.schedule.priorityScore || 0),
			intervalDays: Number(snapshot.point.schedule.intervalDays || 0),
			nextRepDate: toTimestamp(snapshot.point.schedule.nextReviewAt || null),
			scheduleStatus: snapshot.point.schedule.status as IRBlockStatus,
			doneReason:
				snapshot.point.schedule.doneReason === "archived" ||
				snapshot.point.schedule.doneReason === "removed" ||
				snapshot.point.schedule.doneReason === "completed"
					? snapshot.point.schedule.doneReason
					: undefined,
			doneAt: toTimestamp(snapshot.point.schedule.lastReviewedAt || null) || undefined,
			stats: getPointStats(snapshot),
			meta: getPointMeta(snapshot),
			createdAt: toTimestamp(snapshot.point.timestamps.createdAt),
			updatedAt: toTimestamp(snapshot.point.timestamps.updatedAt),
		} as IRChunkFileData,
		source: {
			sourceId: snapshot.point.materialId,
			originalPath: sourcePath,
			rawFilePath,
			indexFilePath,
			chunkIds: [snapshot.point.id],
			title: sourceTitle,
			tagGroup: getPointMetadataString(snapshot, "tagGroupId") || DEFAULT_IR_BLOCK_META.tagGroup,
			createdAt: toTimestamp(snapshot.point.timestamps.createdAt),
			updatedAt: toTimestamp(snapshot.point.timestamps.updatedAt),
		},
	};
}

export function buildLegacyPdfTaskFromPointSnapshot(snapshot: IRPointSnapshot): IRPdfBookmarkTask {
	const topicId = getTaskTopicId(snapshot);
	const locator = snapshot.point.trace.locator || {};
	const pdfPath =
		(typeof locator.pdfPath === "string" && locator.pdfPath.trim()) ||
		snapshot.point.source?.path ||
		snapshot.material?.source.path ||
		"";

	return {
		id: snapshot.point.id,
		topicId,
		deckId: topicId,
		materialId: snapshot.point.materialId,
		pdfPath,
		title:
			snapshot.point.userData.title ||
			snapshot.point.source?.title ||
			snapshot.material?.bibliography.title ||
			snapshot.point.id,
		link: typeof locator.link === "string" ? locator.link : "",
		annotationId: typeof locator.annotationId === "string" ? locator.annotationId : undefined,
		status: snapshot.point.schedule.status as IRPdfBookmarkTask["status"],
		priorityUi: Number(snapshot.point.schedule.manualPriority || 0),
		priorityEff: Number(snapshot.point.schedule.priorityScore || 0),
		intervalDays: Number(snapshot.point.schedule.intervalDays || 0),
		nextRepDate: toTimestamp(snapshot.point.schedule.nextReviewAt || null),
		stats: getPointStats(snapshot),
		meta: getPointMeta(snapshot),
		tags: Array.isArray(snapshot.point.userData.tags) ? [...snapshot.point.userData.tags] : [],
		favorite: Boolean(snapshot.point.userData.isStarred),
		createdAt: toTimestamp(snapshot.point.timestamps.createdAt),
		updatedAt: toTimestamp(snapshot.point.timestamps.updatedAt),
	};
}

export function buildLegacyEpubTaskFromPointSnapshot(snapshot: IRPointSnapshot): IREpubBookmarkTask {
	const topicId = getTaskTopicId(snapshot);
	const locator = snapshot.point.trace.locator || {};
	return {
		id: snapshot.point.id,
		topicId,
		deckId: topicId,
		sourceId: snapshot.point.materialId,
		epubFilePath: snapshot.point.source?.path || snapshot.material?.source.path || "",
		title:
			snapshot.point.userData.title ||
			snapshot.point.source?.title ||
			snapshot.material?.bibliography.title ||
			snapshot.point.id,
		tocHref: typeof locator.tocHref === "string" ? locator.tocHref : "",
		tocLevel: typeof locator.tocLevel === "number" ? locator.tocLevel : 0,
		resumeCfi: typeof locator.resumeCfi === "string" ? locator.resumeCfi : undefined,
		resumeUpdatedAt: toTimestamp(snapshot.point.timestamps.lastInteractionAt),
		status: snapshot.point.schedule.status as IREpubBookmarkTask["status"],
		priorityUi: Number(snapshot.point.schedule.manualPriority || 0),
		priorityEff: Number(snapshot.point.schedule.priorityScore || 0),
		intervalDays: Number(snapshot.point.schedule.intervalDays || 0),
		nextRepDate: toTimestamp(snapshot.point.schedule.nextReviewAt || null),
		stats: getPointStats(snapshot),
		meta: getPointMeta(snapshot),
		tags: Array.isArray(snapshot.point.userData.tags) ? [...snapshot.point.userData.tags] : [],
		createdAt: toTimestamp(snapshot.point.timestamps.createdAt),
		updatedAt: toTimestamp(snapshot.point.timestamps.updatedAt),
	};
}
