import { TFile, type App } from "obsidian";
import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
import type { IRMaterialRecord, IRPoint } from "../../types/ir-point-storage-types";
import type { IRChunkFileData, IRDeck } from "../../types/ir-types";
import type { IRPdfBookmarkTask } from "./IRPdfBookmarkTaskService";
import type { IREpubBookmarkTask } from "./IREpubBookmarkTaskService";
import type { IRTraceSourceKind } from "./IRSourceTraceStats";
import {
	buildIRTableFields,
	getIRPriorityValue,
	getIRSourceDocumentLabel,
	getIRSourceSubunitLabel,
} from "./IRCardManagementAdapter";
import { resolveAssociatedNotePath, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { detectTraceSourceKind, normalizeTraceDocumentKey, normalizeTraceSubunitKey } from "./IRSourceTraceStats";
import { getChunkTopicIds, getTaskTopicId } from "../../utils/ir-topic-compat";
import { extractAllTags } from "../../utils/yaml-utils";

type BuildIRCardBase = (params: {
	id: string;
	deckId?: string;
	templateId: string;
	type: string;
	content: string;
	front: string;
	back: string;
	sourceFile: string;
	sourcePosition?: { startLine: number; endLine: number; contentHash: string };
	created: string;
	modified: string;
	totalReviews?: number;
	totalTime?: number;
	averageTime?: number;
	fsrsState: number;
	stability?: number;
	due?: string;
	lastReview?: string;
	reps?: number;
	scheduledDays?: number;
	tags?: string[];
	priority?: number;
	suspended?: boolean;
	metadata?: Record<string, any>;
	sourceKind?: IRTraceSourceKind;
	sourceDocumentKey?: string;
	sourceSubunitKey?: string;
	primaryAssociatedNotePath?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];
}) => Card & Record<string, any>;

export interface IRCardBuilderHelpers {
	buildIRCardBase: BuildIRCardBase;
	resolveIRDeckId: (deckIdentifier?: string | null) => string;
	resolveIRDeckIds: (deckIds: Array<string | null | undefined>) => string[];
	getIRDeckName: (deckId?: string | null, fallback?: string) => string;
	getIRReadingSeconds: (
		id: string,
		readingSecondsById: Map<string, number>,
		fallback: number | null | undefined
	) => number;
	resolveTagGroupName: (options: {
		explicitGroupId?: string;
		documentPath?: string;
		tags?: string[];
	}) => Promise<string>;
}

type LegacyAssociatedNoteCarrier = {
	primaryAssociatedNotePath?: string | null;
	associatedNotePath?: string | null;
	associatedNotePaths?: Array<string | null | undefined> | null;
} | null | undefined;

function resolveLegacyAssociatedNotePaths(
	primary: LegacyAssociatedNoteCarrier,
	fallback?: LegacyAssociatedNoteCarrier
): string[] {
	return resolveAssociatedNotePaths({
		associatedNotePath:
			resolveAssociatedNotePath(primary as any) || resolveAssociatedNotePath(fallback as any),
		associatedNotePaths: Array.isArray(primary?.associatedNotePaths)
			? primary.associatedNotePaths
			: Array.isArray(fallback?.associatedNotePaths)
				? fallback.associatedNotePaths
				: undefined,
	});
}

export async function extractChunkTags(app: App, chunkFilePath: string): Promise<string[]> {
	try {
		const chunkFile = app.vault.getAbstractFileByPath(chunkFilePath);
		if (!(chunkFile instanceof TFile)) {
			return [];
		}

		const content = await app.vault.read(chunkFile);
		return extractAllTags(content);
	} catch {
		return [];
	}
}

export async function buildLegacyIRBlockCard(options: {
	block: any;
	irDecks: Record<string, IRDeck>;
	chunkIds: Set<string>;
	readingSecondsById: Map<string, number>;
	helpers: IRCardBuilderHelpers;
}): Promise<(Card & Record<string, any>) | null> {
	const { block, irDecks, chunkIds, readingSecondsById, helpers } = options;
	if (chunkIds.has(block.id)) {
		return null;
	}

	const deckIds: string[] = [];
	for (const deck of Object.values(irDecks)) {
		if (deck.blockIds?.includes(block.id)) {
			deckIds.push(deck.id);
		}
	}

	const headingPath = Array.isArray(block.headingPath) ? block.headingPath : [];
	const displayContent = `# ${block.headingText || "无标题"}\n\n${
		headingPath.length > 1 ? `${headingPath.join(" > ")}\n\n` : ""
	}来源: ${block.filePath}`;

	const readingSeconds = helpers.getIRReadingSeconds(
		block.id,
		readingSecondsById,
		block.totalReadingTime
	);
	const sourceKind = detectTraceSourceKind(block.filePath);
	const sourceDocumentKey = normalizeTraceDocumentKey(block.filePath, sourceKind) || block.filePath;
	const priorityValue = getIRPriorityValue(block.priorityUi, block.priorityEff, block.priority);
	const associatedNotePaths = resolveLegacyAssociatedNotePaths(block, (block.meta || null) as any);
	const primaryAssociatedNotePath = associatedNotePaths[0];
	const tagGroupName = await helpers.resolveTagGroupName({
		explicitGroupId: block.tagGroupId || block.meta?.tagGroup,
		documentPath: block.filePath,
		tags: block.tags || [],
	});

	return {
		...helpers.buildIRCardBase({
			id: block.id,
			deckId: deckIds[0] || "",
			templateId: CardType.IRBlock,
			type: CardType.IRBlock,
			content: displayContent,
			front: block.headingText || "无标题",
			back: headingPath.join(" > "),
			sourceFile: block.filePath,
			sourcePosition: {
				startLine: block.startLine,
				endLine: block.startLine,
				contentHash: "",
			},
			created: block.createdAt,
			modified: block.updatedAt,
			totalReviews: block.reviewCount || 0,
			totalTime: readingSeconds,
			averageTime: block.reviewCount ? Math.floor(readingSeconds / block.reviewCount) : 0,
			fsrsState: block.state === "new" ? 0 : block.state === "learning" ? 1 : 2,
			stability: block.interval,
			due: block.nextReview || new Date().toISOString(),
			lastReview: block.lastReview || undefined,
			reps: block.reviewCount,
			scheduledDays: block.interval || 0,
			tags: block.tags || [],
			priority: priorityValue,
			suspended: block.state === "suspended",
			sourceKind,
			sourceDocumentKey,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
			metadata: {
				irBlock: true,
				headingLevel: block.headingLevel,
				headingPath: block.headingPath,
				totalReadingTime: readingSeconds,
				favorite: block.favorite,
				extractedCards: block.extractedCards,
				deckIds,
			},
		}),
		...buildIRTableFields({
			title: headingPath.join(" > ") || block.headingText || "无标题",
			sourceFile: block.filePath,
			sourceKind,
			sourceDocumentKey,
			sourceDocumentLabel: getIRSourceDocumentLabel(block.filePath, sourceDocumentKey),
			deckName: deckIds.length > 0 ? helpers.getIRDeckName(deckIds[0]) : "未分配",
			deckIds,
			state: block.state,
			priority: priorityValue,
			priorityValue,
			tags: block.tags || [],
			associatedNotePaths,
			favorite: block.favorite,
			nextReview: block.nextReview,
			reviewCount: block.reviewCount,
			readingTime: readingSeconds,
			tagGroupName,
			created: block.createdAt,
		}),
	};
}

export async function buildIRChunkCard(options: {
	app: App;
	chunk: IRChunkFileData;
	source: any;
	readingSecondsById: Map<string, number>;
	helpers: IRCardBuilderHelpers;
}): Promise<Card & Record<string, any>> {
	const { app, chunk, source, readingSecondsById, helpers } = options;
	const fileName = chunk.filePath.replace(/^.*\//, "").replace(/\.md$/, "");
	const title = fileName.replace(/^\d+_/, "");
	const sourceTitle = source?.title || "未知来源";
	const sourcePath = source?.originalPath || source?.rawFilePath || chunk.filePath;
	const tags = await extractChunkTags(app, chunk.filePath);
	const displayContent = `# ${title}\n\n来源: ${sourceTitle}\n文件: ${chunk.filePath}`;
	const readingSeconds = helpers.getIRReadingSeconds(
		chunk.chunkId,
		readingSecondsById,
		chunk.stats?.totalReadingTimeSec
	);
	const sourceKind = detectTraceSourceKind(sourcePath);
	const sourceDocumentKey = normalizeTraceDocumentKey(sourcePath, sourceKind) || sourcePath;
	const priorityValue = getIRPriorityValue((chunk as any).priorityUi, chunk.priorityEff);
	const associatedNotePaths = resolveLegacyAssociatedNotePaths((chunk.meta || null) as any);
	const primaryAssociatedNotePath = associatedNotePaths[0];
	const tagGroupName = await helpers.resolveTagGroupName({
		explicitGroupId: chunk.meta?.tagGroup,
		documentPath: sourcePath,
		tags,
	});
	const chunkDeckIds = helpers.resolveIRDeckIds(getChunkTopicIds(chunk));

	return {
		...helpers.buildIRCardBase({
			id: chunk.chunkId,
			deckId: chunkDeckIds[0] || "",
			templateId: CardType.IRChunk,
			type: CardType.IRChunk,
			content: displayContent,
			front: title,
			back: sourceTitle,
			sourceFile: chunk.filePath,
			sourcePosition: { startLine: 0, endLine: 0, contentHash: "" },
			created: typeof chunk.createdAt === "number" ? new Date(chunk.createdAt).toISOString() : chunk.createdAt,
			modified: typeof chunk.updatedAt === "number" ? new Date(chunk.updatedAt).toISOString() : chunk.updatedAt,
			totalReviews: chunk.stats?.impressions || 0,
			totalTime: readingSeconds,
			averageTime: chunk.stats?.impressions ? Math.floor(readingSeconds / chunk.stats.impressions) : 0,
			fsrsState: chunk.scheduleStatus === "new" ? 0 : chunk.scheduleStatus === "active" ? 1 : 2,
			stability: chunk.intervalDays,
			due: chunk.nextRepDate ? new Date(chunk.nextRepDate).toISOString() : new Date().toISOString(),
			lastReview: undefined,
			reps: chunk.stats?.impressions || 0,
			scheduledDays: chunk.intervalDays || 0,
			tags,
			priority: priorityValue,
			suspended: chunk.scheduleStatus === "suspended",
			sourceKind,
			sourceDocumentKey,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
			metadata: {
				irChunk: true,
				sourceId: chunk.sourceId,
				sourceTitle,
				deckTag: chunk.deckTag,
				deckIds: chunkDeckIds,
			},
		}),
		...buildIRTableFields({
			title,
			sourceFile: sourcePath,
			sourceKind,
			sourceDocumentKey,
			sourceDocumentLabel: getIRSourceDocumentLabel(sourcePath, sourceDocumentKey),
			deckName:
				chunkDeckIds.length > 0
					? helpers.getIRDeckName(chunkDeckIds[0])
					: chunk.deckTag
						? chunk.deckTag.replace("#IR_deck_", "")
						: "未分配",
			deckIds: chunkDeckIds,
			state: chunk.scheduleStatus,
			priority: priorityValue,
			priorityValue,
			tags,
			associatedNotePaths,
			favorite: false,
			nextReview: chunk.nextRepDate ? new Date(chunk.nextRepDate).toISOString() : null,
			reviewCount: chunk.stats?.impressions || 0,
			readingTime: readingSeconds,
			tagGroupName,
			created: typeof chunk.createdAt === "number" ? new Date(chunk.createdAt).toISOString() : chunk.createdAt,
		}),
	};
}

export async function buildIRPdfTaskCard(options: {
	task: IRPdfBookmarkTask;
	readingSecondsById: Map<string, number>;
	helpers: IRCardBuilderHelpers;
}): Promise<Card & Record<string, any>> {
	const { task, readingSecondsById, helpers } = options;
	const canonicalDeckId = helpers.resolveIRDeckId(getTaskTopicId(task));
	const canonicalDeckIds = canonicalDeckId ? [canonicalDeckId] : [];
	const deckName = helpers.getIRDeckName(canonicalDeckId || getTaskTopicId(task));
	const displayContent = `# ${task.title}\n\nPDF: ${task.pdfPath}\n链接: ${task.link}`;
	const priorityValue = getIRPriorityValue(task.priorityUi, task.priorityEff);
	const readingSeconds = helpers.getIRReadingSeconds(
		task.id,
		readingSecondsById,
		task.stats?.totalReadingTimeSec
	);
	const sourceKind: IRTraceSourceKind = "pdf";
	const sourceDocumentKey = normalizeTraceDocumentKey(task.pdfPath, sourceKind) || task.pdfPath;
	const sourceSubunitKey = normalizeTraceSubunitKey(task.link) || undefined;
	const associatedNotePaths = resolveLegacyAssociatedNotePaths(task.meta as any);
	const primaryAssociatedNotePath = associatedNotePaths[0];
	const tagGroupName = await helpers.resolveTagGroupName({
		explicitGroupId: task.meta?.tagGroup,
		documentPath: task.pdfPath,
		tags: task.tags || [],
	});

	return {
		...helpers.buildIRCardBase({
			id: task.id,
			deckId: canonicalDeckId,
			templateId: CardType.IRChunk,
			type: CardType.IRChunk,
			content: displayContent,
			front: task.title,
			back: task.pdfPath,
			sourceFile: task.pdfPath,
			sourcePosition: { startLine: 0, endLine: 0, contentHash: "" },
			created: new Date(task.createdAt).toISOString(),
			modified: new Date(task.updatedAt).toISOString(),
			totalReviews: task.stats?.impressions || 0,
			totalTime: readingSeconds,
			averageTime: task.stats?.impressions ? Math.floor(readingSeconds / task.stats.impressions) : 0,
			fsrsState: task.status === "new" ? 0 : task.status === "active" || task.status === "queued" ? 1 : 2,
			stability: task.intervalDays,
			due: task.nextRepDate ? new Date(task.nextRepDate).toISOString() : new Date().toISOString(),
			lastReview: undefined,
			reps: task.stats?.impressions || 0,
			scheduledDays: task.intervalDays || 0,
			tags: task.tags || [],
			priority: priorityValue,
			suspended: task.status === "suspended",
			sourceKind,
			sourceDocumentKey,
			sourceSubunitKey,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
			metadata: {
				irPdfBookmark: true,
				pdfPath: task.pdfPath,
				resumeLink: task.link,
				link: task.link,
				annotationId: task.annotationId,
				deckIds: canonicalDeckIds,
			},
		}),
		...buildIRTableFields({
			title: task.title,
			sourceFile: task.pdfPath,
			sourceKind,
			sourceDocumentKey,
			sourceDocumentLabel: getIRSourceDocumentLabel(task.pdfPath, sourceDocumentKey),
			sourceSubunitLabel: getIRSourceSubunitLabel(sourceSubunitKey, sourceKind),
			deckName,
			deckIds: canonicalDeckIds,
			state: task.status,
			priority: priorityValue,
			priorityValue,
			tags: task.tags || [],
			associatedNotePaths,
			favorite: false,
			nextReview: task.nextRepDate ? new Date(task.nextRepDate).toISOString() : null,
			reviewCount: task.stats?.impressions || 0,
			readingTime: readingSeconds,
			tagGroupName,
			created: new Date(task.createdAt).toISOString(),
		}),
	};
}

function getIRScheduleFsrsState(status: string | undefined): number {
	return status === "new"
		? 0
		: status === "active" || status === "queued" || status === "scheduled"
			? 1
			: 2;
}

function getPointMetadataString(point: IRPoint, key: string): string | undefined {
	const value = point.metadata?.[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolvePointTopicIds(point: IRPoint, topicId: string): string[] {
	const topicIds = Array.isArray(point.relations.topicIds) ? point.relations.topicIds : [];
	const normalized = Array.from(
		new Set(
			[...topicIds, topicId]
				.map((value) => String(value || "").trim())
				.filter(Boolean)
		)
	);
	return normalized;
}

function resolvePointReadingSeconds(
	point: IRPoint,
	readingSecondsById: Map<string, number>,
	helpers: IRCardBuilderHelpers
): number {
	return helpers.getIRReadingSeconds(
		point.id,
		readingSecondsById,
		Math.max(0, Math.round((point.stats?.totalReadingTimeMs || 0) / 1000))
	);
}

function resolvePointAssociatedNotePaths(point: IRPoint): string[] {
	return resolveAssociatedNotePaths({
		associatedNotePaths: point.relations.linkedNotePaths,
	});
}

export async function buildIRPdfPointCard(options: {
	point: IRPoint;
	material: IRMaterialRecord | null;
	topicId: string;
	topicName: string;
	readingSecondsById: Map<string, number>;
	helpers: IRCardBuilderHelpers;
}): Promise<Card & Record<string, any>> {
	const { point, material, topicId, topicName, readingSecondsById, helpers } = options;
	const topicIds = resolvePointTopicIds(point, topicId);
	const canonicalDeckIds = helpers.resolveIRDeckIds(topicIds);
	const canonicalDeckId = canonicalDeckIds[0] || helpers.resolveIRDeckId(topicId);
	const deckName = helpers.getIRDeckName(canonicalDeckId || topicId, topicName || "未分配");
	const pdfPath =
		(typeof point.trace.locator.pdfPath === "string" && point.trace.locator.pdfPath.trim()) ||
		point.source?.path ||
		material?.source.path ||
		"";
	const link =
		(typeof point.trace.locator.link === "string" && point.trace.locator.link.trim()) || point.id;
	const annotationId =
		typeof point.trace.locator.annotationId === "string" && point.trace.locator.annotationId.trim()
			? point.trace.locator.annotationId.trim()
			: undefined;
	const title = point.userData.title || point.source?.title || material?.bibliography.title || point.id;
	const priorityValue = getIRPriorityValue(
		point.schedule.manualPriority,
		point.schedule.priorityScore
	);
	const readingSeconds = resolvePointReadingSeconds(point, readingSecondsById, helpers);
	const sourceKind: IRTraceSourceKind = "pdf";
	const sourceDocumentKey = normalizeTraceDocumentKey(pdfPath, sourceKind) || pdfPath;
	const sourceSubunitKey = normalizeTraceSubunitKey(link) || undefined;
	const associatedNotePaths = resolvePointAssociatedNotePaths(point);
	const primaryAssociatedNotePath = associatedNotePaths[0];
	const tagGroupName = await helpers.resolveTagGroupName({
		explicitGroupId: getPointMetadataString(point, "tagGroupId"),
		documentPath: pdfPath,
		tags: point.userData.tags || [],
	});
	const displayContent = `# ${title}\n\nPDF: ${pdfPath}\n链接: ${link}`;
	const reviewCount = point.stats.reviewCount || point.stats.impressionCount || 0;

	return {
		...helpers.buildIRCardBase({
			id: point.id,
			deckId: canonicalDeckId,
			templateId: CardType.IRChunk,
			type: CardType.IRChunk,
			content: displayContent,
			front: title,
			back: pdfPath,
			sourceFile: pdfPath,
			sourcePosition: { startLine: 0, endLine: 0, contentHash: "" },
			created: point.timestamps.createdAt,
			modified: point.timestamps.updatedAt,
			totalReviews: reviewCount,
			totalTime: readingSeconds,
			averageTime: reviewCount ? Math.floor(readingSeconds / reviewCount) : 0,
			fsrsState: getIRScheduleFsrsState(point.schedule.status),
			stability: point.schedule.intervalDays,
			due: point.schedule.nextReviewAt || new Date().toISOString(),
			lastReview: point.schedule.lastReviewedAt || undefined,
			reps: reviewCount,
			scheduledDays: point.schedule.intervalDays || 0,
			tags: point.userData.tags || [],
			priority: priorityValue,
			suspended: point.schedule.status === "suspended",
			sourceKind,
			sourceDocumentKey,
			sourceSubunitKey,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
			metadata: {
				irPdfBookmark: true,
				pdfPath,
				resumeLink: link,
				link,
				annotationId,
				deckIds: canonicalDeckIds,
			},
		}),
		...buildIRTableFields({
			title,
			sourceFile: pdfPath,
			sourceKind,
			sourceDocumentKey,
			sourceDocumentLabel: getIRSourceDocumentLabel(pdfPath, sourceDocumentKey),
			sourceSubunitLabel: getIRSourceSubunitLabel(sourceSubunitKey, sourceKind),
			deckName,
			deckIds: canonicalDeckIds,
			state: point.schedule.status,
			priority: priorityValue,
			priorityValue,
			tags: point.userData.tags || [],
			associatedNotePaths,
			favorite: point.userData.isStarred,
			nextReview: point.schedule.nextReviewAt || null,
			reviewCount,
			readingTime: readingSeconds,
			tagGroupName,
			created: point.timestamps.createdAt,
		}),
	};
}

export async function buildIREpubTaskCard(options: {
	task: IREpubBookmarkTask;
	readingSecondsById: Map<string, number>;
	helpers: IRCardBuilderHelpers;
}): Promise<Card & Record<string, any>> {
	const { task, readingSecondsById, helpers } = options;
	const canonicalDeckId = helpers.resolveIRDeckId(getTaskTopicId(task as any));
	const canonicalDeckIds = canonicalDeckId ? [canonicalDeckId] : [];
	const deckName = helpers.getIRDeckName(canonicalDeckId || getTaskTopicId(task as any));
	const priorityValue = getIRPriorityValue(task.priorityUi, task.priorityEff);
	const readingSeconds = helpers.getIRReadingSeconds(
		task.id,
		readingSecondsById,
		task.stats?.totalReadingTimeSec
	);
	const sourceKind: IRTraceSourceKind = "epub";
	const sourceDocumentKey = normalizeTraceDocumentKey(task.epubFilePath, sourceKind) || task.epubFilePath;
	const sourceSubunitKey = normalizeTraceSubunitKey(task.tocHref || task.id) || undefined;
	const associatedNotePaths = resolveLegacyAssociatedNotePaths(task.meta as any);
	const primaryAssociatedNotePath = associatedNotePaths[0];
	const tagGroupName = await helpers.resolveTagGroupName({
		explicitGroupId: task.meta?.tagGroup,
		documentPath: task.epubFilePath,
		tags: task.tags || [],
	});
	const displayContent = `# ${task.title}\n\nEPUB: ${task.epubFilePath}\n目录: ${task.tocHref || task.id}`;

	return {
		...helpers.buildIRCardBase({
			id: task.id,
			deckId: canonicalDeckId,
			templateId: CardType.IRChunk,
			type: CardType.IRChunk,
			content: displayContent,
			front: task.title,
			back: task.epubFilePath,
			sourceFile: task.epubFilePath,
			sourcePosition: { startLine: 0, endLine: 0, contentHash: "" },
			created: new Date(task.createdAt).toISOString(),
			modified: new Date(task.updatedAt).toISOString(),
			totalReviews: task.stats?.impressions || 0,
			totalTime: readingSeconds,
			averageTime: task.stats?.impressions ? Math.floor(readingSeconds / task.stats.impressions) : 0,
			fsrsState: task.status === "new" ? 0 : task.status === "active" || task.status === "queued" ? 1 : 2,
			stability: task.intervalDays,
			due: task.nextRepDate ? new Date(task.nextRepDate).toISOString() : new Date().toISOString(),
			lastReview: undefined,
			reps: task.stats?.impressions || 0,
			scheduledDays: task.intervalDays || 0,
			tags: task.tags || [],
			priority: priorityValue,
			suspended: task.status === "suspended",
			sourceKind,
			sourceDocumentKey,
			sourceSubunitKey,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
			metadata: {
				irEpubBookmark: true,
				sourceId: task.sourceId,
				epubFilePath: task.epubFilePath,
				tocHref: task.tocHref,
				tocLevel: task.tocLevel,
				resumeCfi: task.resumeCfi,
				deckIds: canonicalDeckIds,
			},
		}),
		...buildIRTableFields({
			title: task.title,
			sourceFile: task.epubFilePath,
			sourceKind,
			sourceDocumentKey,
			sourceDocumentLabel: getIRSourceDocumentLabel(task.epubFilePath, sourceDocumentKey),
			sourceSubunitLabel: getIRSourceSubunitLabel(sourceSubunitKey, sourceKind),
			deckName,
			deckIds: canonicalDeckIds,
			state: task.status,
			priority: priorityValue,
			priorityValue,
			tags: task.tags || [],
			associatedNotePaths,
			favorite: false,
			nextReview: task.nextRepDate ? new Date(task.nextRepDate).toISOString() : null,
			reviewCount: task.stats?.impressions || 0,
			readingTime: readingSeconds,
			tagGroupName,
			created: new Date(task.createdAt).toISOString(),
		}),
	};
}

export async function buildIREpubPointCard(options: {
	point: IRPoint;
	material: IRMaterialRecord | null;
	topicId: string;
	topicName: string;
	readingSecondsById: Map<string, number>;
	helpers: IRCardBuilderHelpers;
}): Promise<Card & Record<string, any>> {
	const { point, material, topicId, topicName, readingSecondsById, helpers } = options;
	const topicIds = resolvePointTopicIds(point, topicId);
	const canonicalDeckIds = helpers.resolveIRDeckIds(topicIds);
	const canonicalDeckId = canonicalDeckIds[0] || helpers.resolveIRDeckId(topicId);
	const deckName = helpers.getIRDeckName(canonicalDeckId || topicId, topicName || "未分配");
	const epubFilePath = point.source?.path || material?.source.path || "";
	const tocHref =
		(typeof point.trace.locator.tocHref === "string" && point.trace.locator.tocHref.trim()) ||
		"";
	const tocLevel =
		typeof point.trace.locator.tocLevel === "number" ? point.trace.locator.tocLevel : undefined;
	const title = point.userData.title || point.source?.title || material?.bibliography.title || point.id;
	const priorityValue = getIRPriorityValue(
		point.schedule.manualPriority,
		point.schedule.priorityScore
	);
	const readingSeconds = resolvePointReadingSeconds(point, readingSecondsById, helpers);
	const sourceKind: IRTraceSourceKind = "epub";
	const sourceDocumentKey =
		normalizeTraceDocumentKey(epubFilePath, sourceKind) || epubFilePath;
	const sourceSubunitKey =
		normalizeTraceSubunitKey(
			tocHref ||
				(typeof point.trace.locator.resumeCfi === "string" && point.trace.locator.resumeCfi.trim()) ||
				point.id
		) || undefined;
	const associatedNotePaths = resolvePointAssociatedNotePaths(point);
	const primaryAssociatedNotePath = associatedNotePaths[0];
	const tagGroupName = await helpers.resolveTagGroupName({
		explicitGroupId: getPointMetadataString(point, "tagGroupId"),
		documentPath: epubFilePath,
		tags: point.userData.tags || [],
	});
	const displayContent = `# ${title}\n\nEPUB: ${epubFilePath}\n目录: ${tocHref || point.id}`;
	const reviewCount = point.stats.reviewCount || point.stats.impressionCount || 0;

	return {
		...helpers.buildIRCardBase({
			id: point.id,
			deckId: canonicalDeckId,
			templateId: CardType.IRChunk,
			type: CardType.IRChunk,
			content: displayContent,
			front: title,
			back: epubFilePath,
			sourceFile: epubFilePath,
			sourcePosition: { startLine: 0, endLine: 0, contentHash: "" },
			created: point.timestamps.createdAt,
			modified: point.timestamps.updatedAt,
			totalReviews: reviewCount,
			totalTime: readingSeconds,
			averageTime: reviewCount ? Math.floor(readingSeconds / reviewCount) : 0,
			fsrsState: getIRScheduleFsrsState(point.schedule.status),
			stability: point.schedule.intervalDays,
			due: point.schedule.nextReviewAt || new Date().toISOString(),
			lastReview: point.schedule.lastReviewedAt || undefined,
			reps: reviewCount,
			scheduledDays: point.schedule.intervalDays || 0,
			tags: point.userData.tags || [],
			priority: priorityValue,
			suspended: point.schedule.status === "suspended",
			sourceKind,
			sourceDocumentKey,
			sourceSubunitKey,
			primaryAssociatedNotePath,
			associatedNotePath: primaryAssociatedNotePath,
			associatedNotePaths,
			metadata: {
				irEpubBookmark: true,
				sourceId: point.source?.id,
				epubFilePath,
				tocHref,
				tocLevel,
				resumeCfi:
					typeof point.trace.locator.resumeCfi === "string"
						? point.trace.locator.resumeCfi
						: undefined,
				deckIds: canonicalDeckIds,
			},
		}),
		...buildIRTableFields({
			title,
			sourceFile: epubFilePath,
			sourceKind,
			sourceDocumentKey,
			sourceDocumentLabel: getIRSourceDocumentLabel(epubFilePath, sourceDocumentKey),
			sourceSubunitLabel: getIRSourceSubunitLabel(sourceSubunitKey, sourceKind),
			deckName,
			deckIds: canonicalDeckIds,
			state: point.schedule.status,
			priority: priorityValue,
			priorityValue,
			tags: point.userData.tags || [],
			associatedNotePaths,
			favorite: point.userData.isStarred,
			nextReview: point.schedule.nextReviewAt || null,
			reviewCount,
			readingTime: readingSeconds,
			tagGroupName,
			created: point.timestamps.createdAt,
		}),
	};
}
