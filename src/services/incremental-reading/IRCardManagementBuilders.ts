import { TFile, type App } from "obsidian";
import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
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
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { detectTraceSourceKind, normalizeTraceDocumentKey, normalizeTraceSubunitKey } from "./IRSourceTraceStats";
import { getChunkTopicIds, getTaskTopicId } from "../../utils/ir-topic-compat";

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

export async function extractChunkTags(app: App, chunkFilePath: string): Promise<string[]> {
	let tags: string[] = [];
	try {
		const chunkFile = app.vault.getAbstractFileByPath(chunkFilePath);
		if (!(chunkFile instanceof TFile)) {
			return [];
		}

		const content = await app.vault.read(chunkFile);
		const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (yamlMatch) {
			const yamlContent = yamlMatch[1];
			const tagsMatch =
				yamlContent.match(/tags:\s*\[([^\]]+)\]/) ||
				yamlContent.match(/tags:\s*\n((?:\s+-\s+.+\n)+)/);
			if (tagsMatch) {
				if (tagsMatch[1].includes("-")) {
					tags = tagsMatch[1]
						.split("\n")
						.map((line) => line.trim().replace(/^-\s+/, ""))
						.filter((tag) => tag.length > 0);
				} else {
					tags = tagsMatch[1]
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag.length > 0);
				}
			}
		}

		const bodyContent = content.replace(/^---\n[\s\S]*?\n---/, "");
		const contentTags = bodyContent.match(/(?<![#\w])#([\w\u4e00-\u9fa5-]+)/g) || [];
		const filteredTags = contentTags
			.map((tag) => tag.substring(1))
			.filter((tag) => !/^\d+$/.test(tag));
		return [...new Set([...tags, ...filteredTags])];
	} catch {
		return tags;
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
	const associatedNotePaths = resolveAssociatedNotePaths({
		associatedNotePath: block.primaryAssociatedNotePath || block.associatedNotePath || block.meta?.primaryAssociatedNotePath || block.meta?.associatedNotePath,
		associatedNotePaths: block.associatedNotePaths || block.meta?.associatedNotePaths,
	});
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
	const associatedNotePaths = resolveAssociatedNotePaths({
		associatedNotePath: (chunk.meta as any)?.primaryAssociatedNotePath || chunk.meta?.associatedNotePath,
		associatedNotePaths: (chunk.meta as any)?.associatedNotePaths,
	});
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
	const associatedNotePaths = resolveAssociatedNotePaths({
		associatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
		associatedNotePaths: task.meta?.associatedNotePaths,
	});
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
	const associatedNotePaths = resolveAssociatedNotePaths({
		associatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
		associatedNotePaths: task.meta?.associatedNotePaths,
	});
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
				epubFilePath: task.epubFilePath,
				tocHref: task.tocHref,
				tocLevel: task.tocLevel,
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
