import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import type { IRBlockMeta, IRBlockStats, IRBlockStatus, IRBlockV4 } from "../../types/ir-types";
import { DEFAULT_IR_BLOCK_META, DEFAULT_IR_BLOCK_STATS } from "../../types/ir-types";
import { getTaskTopicId } from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import {
	buildLegacyPdfTaskFromPointSnapshot,
	getLegacyBookmarkTaskKind,
} from "./IRLegacyTaskCompatAdapter";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { IRPointStorageService } from "./IRPointStorageService";

export interface IRPdfBookmarkTask {
	id: string;
	topicId?: string;
	deckId: string;
	materialId?: string;
	pdfPath: string;
	title: string;
	link: string;
	annotationId?: string;
	status: IRBlockStatus;
	priorityUi: number;
	priorityEff: number;
	intervalDays: number;
	nextRepDate: number;
	stats: IRBlockStats;
	meta: IRBlockMeta;
	tags: string[];
	favorite?: boolean;
	createdAt: number;
	updatedAt: number;
}

export function isPdfBookmarkTaskId(id: string): boolean {
	return typeof id === "string" && id.startsWith("pdfbm-");
}

function generatePdfBookmarkTaskId(): string {
	return `pdfbm-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function mergeTaskMeta(existing: IRBlockMeta, updates?: Partial<IRBlockMeta>): IRBlockMeta {
	if (!updates) {
		return existing;
	}

	return {
		...existing,
		...updates,
		siblings: updates.siblings
			? {
					...existing.siblings,
					...updates.siblings,
			  }
			: existing.siblings,
	};
}

function mergeTaskStats(existing: IRBlockStats, updates?: Partial<IRBlockStats>): IRBlockStats {
	if (!updates) {
		return existing;
	}

	return {
		...existing,
		...updates,
	};
}

function normalizeTaskTopic(task: Pick<IRPdfBookmarkTask, "topicId" | "deckId">): string {
	const topicId = String(getTaskTopicId(task) || "").trim();
	if (!topicId) {
		throw new Error("PDF 书签任务缺少专题 ID");
	}
	return topicId;
}

export class IRPdfBookmarkTaskService {
	private pointStorageService: IRPointStorageService | null = null;
	private initialized = false;

	constructor(private readonly app: App) {}

	private getPointStorageService(): IRPointStorageService {
		if (!this.pointStorageService) {
			this.pointStorageService = new IRPointStorageService(this.app);
		}
		return this.pointStorageService;
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			await this.getPointStorageService().ensureRuntimeBaseline();
		} catch (error) {
			logger.warn("[IRPdfBookmarkTaskService] 自动迁移旧 PDF 书签失败，继续使用已存在的新 points", error);
			await this.getPointStorageService().initialize();
		}

		this.initialized = true;
	}

	private async getTaskFromPointStorage(taskId: string): Promise<IRPdfBookmarkTask | null> {
		await this.initialize();
		const snapshot = await this.getPointStorageService().getPointSnapshotById(taskId);
		if (!snapshot || getLegacyBookmarkTaskKind(snapshot) !== "pdf") {
			return null;
		}
		return buildLegacyPdfTaskFromPointSnapshot(snapshot);
	}

	private async getPointTasks(): Promise<IRPdfBookmarkTask[]> {
		await this.initialize();
		const snapshots = await this.getPointStorageService().listPointSnapshots();
		return snapshots
			.filter((snapshot) => getLegacyBookmarkTaskKind(snapshot) === "pdf")
			.map((snapshot) => buildLegacyPdfTaskFromPointSnapshot(snapshot));
	}

	private async persistTask(task: IRPdfBookmarkTask): Promise<IRPdfBookmarkTask> {
		const linkedNotePaths = resolveAssociatedNotePaths({
			associatedNotePath: task.meta?.primaryAssociatedNotePath || task.meta?.associatedNotePath,
			associatedNotePaths: task.meta?.associatedNotePaths,
		});
		const taskMeta = (task.meta || {}) as unknown as Record<string, unknown>;
		const sourceSequenceMetadata: Record<string, unknown> = {};
		if (typeof taskMeta.sourceSequenceGroup === "string" && taskMeta.sourceSequenceGroup.trim()) {
			sourceSequenceMetadata.sourceSequenceGroup = taskMeta.sourceSequenceGroup.trim();
		}
		if (typeof taskMeta.sourceSequenceOrder === "number" && Number.isFinite(taskMeta.sourceSequenceOrder)) {
			sourceSequenceMetadata.sourceSequenceOrder = taskMeta.sourceSequenceOrder;
		}
		if (typeof taskMeta.sourceSequenceLocked === "boolean") {
			sourceSequenceMetadata.sourceSequenceLocked = taskMeta.sourceSequenceLocked;
		}
		if (
			typeof taskMeta.sourceSequenceAnchorDateKey === "string" &&
			taskMeta.sourceSequenceAnchorDateKey.trim()
		) {
			sourceSequenceMetadata.sourceSequenceAnchorDateKey = taskMeta.sourceSequenceAnchorDateKey.trim();
		}
		const lastInteractionAt =
			typeof task.stats?.lastInteraction === "number" ? task.stats.lastInteraction : undefined;

		await this.getPointStorageService().syncLegacyPoint({
			id: task.id,
			topicId: normalizeTaskTopic(task),
			title: task.title,
			tags: task.tags,
			status: task.status,
			priorityUi: task.priorityUi,
			priorityEff: task.priorityEff,
			intervalDays: task.intervalDays,
			nextRepDate: task.nextRepDate,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			lastInteractionAt,
			sourceType: "pdf-bookmark",
			materialId: task.materialId,
			sourcePath: task.pdfPath,
			locatorType: "pdf-selection",
			locator: {
				link: task.link,
				annotationId: task.annotationId,
				pdfPath: task.pdfPath,
			},
			isStarred: Boolean(task.favorite),
			linkedNotePaths,
			explicitTagGroupId:
				task.meta?.tagGroup && task.meta.tagGroup !== DEFAULT_IR_BLOCK_META.tagGroup
					? task.meta.tagGroup
					: undefined,
			stats: {
				impressions: task.stats?.impressions,
				extracts: task.stats?.extracts,
				cardsCreated: task.stats?.cardsCreated,
				notesWritten: task.stats?.notesWritten,
				totalReadingTimeSec: task.stats?.totalReadingTimeSec,
				lastInteractionAt,
			},
			metadata: Object.keys(sourceSequenceMetadata).length > 0 ? sourceSequenceMetadata : undefined,
		});

		return (await this.getTask(task.id)) || task;
	}

	async getTask(id: string): Promise<IRPdfBookmarkTask | null> {
		return await this.getTaskFromPointStorage(id);
	}

	async getAllTasks(): Promise<IRPdfBookmarkTask[]> {
		const tasks = await this.getPointTasks();
		return tasks.sort((left, right) => left.id.localeCompare(right.id));
	}

	async getTasksByDeck(deckId: string): Promise<IRPdfBookmarkTask[]> {
		return await this.getTasksByDeckIdentifiers([deckId]);
	}

	async getTasksByDeckIdentifiers(deckIds: string[]): Promise<IRPdfBookmarkTask[]> {
		const identifiers = this.toNormalizedSet(deckIds);
		if (identifiers.size === 0) {
			return [];
		}

		const tasks = await this.getAllTasks();
		return tasks.filter((task) => identifiers.has(String(getTaskTopicId(task) || "").trim()));
	}

	async createTask(input: {
		topicId?: string;
		deckId?: string;
		materialId?: string;
		pdfPath: string;
		title: string;
		link: string;
		annotationId?: string;
		priorityUi?: number;
		sourceSequenceGroup?: string;
		sourceSequenceOrder?: number;
		sourceSequenceLocked?: boolean;
		sourceSequenceAnchorDateKey?: string;
	}): Promise<IRPdfBookmarkTask> {
		await this.initialize();

		const now = Date.now();
		const priorityUi = typeof input.priorityUi === "number" ? input.priorityUi : 5;
		const topicId = normalizeTaskTopic({
			topicId: input.topicId,
			deckId: input.deckId,
		} as IRPdfBookmarkTask);

		return await this.persistTask({
			id: generatePdfBookmarkTaskId(),
			topicId,
			deckId: topicId,
			materialId: input.materialId,
			pdfPath: normalizePath(input.pdfPath),
			title: input.title,
			link: input.link,
			annotationId: input.annotationId,
			status: "new",
			priorityUi,
			priorityEff: priorityUi,
			intervalDays: 0,
			nextRepDate: 0,
			stats: { ...DEFAULT_IR_BLOCK_STATS },
			meta: {
				...DEFAULT_IR_BLOCK_META,
				siblings: { prev: null, next: null },
				...(typeof input.sourceSequenceGroup === "string" && input.sourceSequenceGroup.trim()
					? { sourceSequenceGroup: input.sourceSequenceGroup.trim() }
					: {}),
				...(typeof input.sourceSequenceOrder === "number" && Number.isFinite(input.sourceSequenceOrder)
					? { sourceSequenceOrder: input.sourceSequenceOrder }
					: {}),
				...(typeof input.sourceSequenceLocked === "boolean"
					? { sourceSequenceLocked: input.sourceSequenceLocked }
					: {}),
				...(typeof input.sourceSequenceAnchorDateKey === "string" && input.sourceSequenceAnchorDateKey.trim()
					? { sourceSequenceAnchorDateKey: input.sourceSequenceAnchorDateKey.trim() }
					: {}),
			} as IRPdfBookmarkTask["meta"],
			tags: [],
			favorite: false,
			createdAt: now,
			updatedAt: now,
		});
	}

	async updateTask(
		id: string,
		updates: Partial<Omit<IRPdfBookmarkTask, "id" | "createdAt">>
	): Promise<IRPdfBookmarkTask | null> {
		const existing = await this.getTask(id);
		if (!existing) {
			return null;
		}

		const topicId = normalizeTaskTopic({
			topicId: updates.topicId ?? existing.topicId,
			deckId: updates.deckId ?? existing.deckId,
		} as IRPdfBookmarkTask);
		const updated: IRPdfBookmarkTask = {
			...existing,
			...updates,
			topicId,
			deckId: topicId,
			pdfPath: updates.pdfPath ? normalizePath(updates.pdfPath) : existing.pdfPath,
			meta: mergeTaskMeta(existing.meta, updates.meta),
			stats: mergeTaskStats(existing.stats, updates.stats),
			updatedAt: Date.now(),
		};

		return await this.persistTask(updated);
	}

	async updateTaskFromBlock(
		block: IRBlockV4 & { pdfBookmarkLink?: string; pdfBookmarkTitle?: string }
	): Promise<void> {
		if (!isPdfBookmarkTaskId(block.id)) {
			return;
		}

		const existing = await this.getTask(block.id);
		if (!existing) {
			return;
		}

		await this.persistTask({
			...existing,
			status: block.status,
			priorityUi: block.priorityUi,
			priorityEff: block.priorityEff,
			intervalDays: block.intervalDays,
			nextRepDate: block.nextRepDate,
			stats: block.stats,
			meta: block.meta,
			tags: Array.isArray(block.tags) ? block.tags : existing.tags || [],
			updatedAt: Date.now(),
		});
	}

	async recordTaskInteraction(
		taskId: string,
		readingTimeSec: number,
		actions: { extracts?: number; cardsCreated?: number; notesWritten?: number } = {}
	): Promise<void> {
		const existing = await this.getTask(taskId);
		if (!existing) {
			return;
		}

		const stats = {
			...existing.stats,
		};
		stats.impressions += 1;
		stats.totalReadingTimeSec += readingTimeSec;
		stats.effectiveReadingTimeSec += Math.min(readingTimeSec, 600);
		stats.extracts += actions.extracts || 0;
		stats.cardsCreated += actions.cardsCreated || 0;
		stats.notesWritten += actions.notesWritten || 0;
		stats.lastInteraction = Date.now();
		stats.lastShownAt = Date.now();

		const todayStr = new Date().toISOString().slice(0, 10);
		if (stats.todayShownDate === todayStr) {
			stats.todayShownCount = (stats.todayShownCount || 0) + 1;
		} else {
			stats.todayShownDate = todayStr;
			stats.todayShownCount = 1;
		}

		await this.persistTask({
			...existing,
			stats,
			updatedAt: Date.now(),
		});
	}

	async deleteTask(id: string): Promise<boolean> {
		await this.initialize();
		const deleted = await this.getPointStorageService().deletePointByLegacyId(id);
		if (deleted) {
			logger.info("[IRPdfBookmarkTaskService] 已删除任务", id);
		}
		return deleted;
	}

	async deleteTasksByDeck(deckId: string): Promise<number> {
		return await this.deleteTasksByDeckIdentifiers([deckId]);
	}

	async deleteTasksByDeckIdentifiers(deckIds: string[]): Promise<number> {
		const identifiers = this.toNormalizedSet(deckIds);
		return await this.deleteTasksByPredicate(
			(task) => identifiers.has(String(getTaskTopicId(task) || "").trim()),
			"[IRPdfBookmarkTaskService] 已按专题标识删除任务",
			{ deckIds: Array.from(identifiers) }
		);
	}

	async deleteTasksByPdfPaths(pdfPaths: string[]): Promise<number> {
		const paths = new Set(
			Array.from(this.toNormalizedSet(pdfPaths)).map((path) => normalizePath(path))
		);
		return await this.deleteTasksByPredicate(
			(task) => paths.has(normalizePath(String(task?.pdfPath || "").trim())),
			"[IRPdfBookmarkTaskService] 已按 PDF 路径删除任务",
			{ pdfPaths: Array.from(paths) }
		);
	}

	private toNormalizedSet(values: string[]): Set<string> {
		return new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => String(value || "").trim())
				.filter(Boolean)
		);
	}

	private async deleteTasksByPredicate(
		predicate: (task: IRPdfBookmarkTask) => boolean,
		logMessage: string,
		logMeta: Record<string, unknown>
	): Promise<number> {
		const toDelete = (await this.getAllTasks()).filter(predicate).map((task) => task.id);
		if (toDelete.length === 0) {
			return 0;
		}

		let deletedCount = 0;
		for (const id of toDelete) {
			if (await this.deleteTask(id)) {
				deletedCount += 1;
			}
		}

		logger.info(logMessage, {
			...logMeta,
			count: deletedCount,
		});
		return deletedCount;
	}

	toBlockV4(task: IRPdfBookmarkTask): IRBlockV4 {
		const block: IRBlockV4 = {
			id: task.id,
			sourcePath: task.pdfPath,
			blockId: task.id,
			contentHash: "",
			status: task.status,
			priorityUi: task.priorityUi,
			priorityEff: task.priorityEff,
			intervalDays: task.intervalDays,
			nextRepDate: task.nextRepDate,
			stats: task.stats,
			meta: task.meta,
			tags: task.tags || [],
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
		};

		(block as any).contentPreview = task.title;
		(block as any).pdfBookmarkLink = task.link;
		(block as any).pdfBookmarkTitle = task.title;
		(block as any).pdfBookmarkAnnotationId = task.annotationId;

		return block;
	}
}
