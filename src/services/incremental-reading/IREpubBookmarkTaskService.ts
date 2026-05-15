import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { EpubStorageService } from "../epub/EpubStorageService";
import type { IRBlockMeta, IRBlockStats, IRBlockStatus, IRBlockV4 } from "../../types/ir-types";
import { DEFAULT_IR_BLOCK_META, DEFAULT_IR_BLOCK_STATS } from "../../types/ir-types";
import { getTaskTopicId } from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import {
	buildLegacyEpubTaskFromPointSnapshot,
	getLegacyBookmarkTaskKind,
} from "./IRLegacyTaskCompatAdapter";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { IRPointStorageService } from "./IRPointStorageService";

export interface IREpubBookmarkTask {
	id: string;
	topicId?: string;
	deckId: string;
	sourceId?: string;
	epubFilePath: string;
	title: string;
	tocHref: string;
	tocLevel: number;
	resumeCfi?: string;
	resumeUpdatedAt?: number;
	status: IRBlockStatus;
	priorityUi: number;
	priorityEff: number;
	intervalDays: number;
	nextRepDate: number;
	stats: IRBlockStats;
	meta: IRBlockMeta;
	tags: string[];
	createdAt: number;
	updatedAt: number;
}

export function isEpubBookmarkTaskId(id: string): boolean {
	return typeof id === "string" && id.startsWith("epubbm-");
}

function generateEpubBookmarkTaskId(): string {
	return `epubbm-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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

function normalizeTaskTopic(task: Pick<IREpubBookmarkTask, "topicId" | "deckId">): string {
	const topicId = String(getTaskTopicId(task) || "").trim();
	if (!topicId) {
		throw new Error("EPUB 书签任务缺少专题 ID");
	}
	return topicId;
}

function normalizeTocLevel(level: number | undefined): number {
	const numericLevel = Number(level);
	return Number.isFinite(numericLevel) ? Math.max(1, numericLevel) : 1;
}

export class IREpubBookmarkTaskService {
	private readonly epubStorageService: EpubStorageService;
	private pointStorageService: IRPointStorageService | null = null;
	private initialized = false;

	constructor(private readonly app: App) {
		this.epubStorageService = new EpubStorageService(app);
	}

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
			logger.warn("[IREpubBookmarkTaskService] 自动迁移旧 EPUB 书签失败，继续使用已存在的新 points", error);
			await this.getPointStorageService().initialize();
		}

		this.initialized = true;
	}

	private async getTaskFromPointStorage(taskId: string): Promise<IREpubBookmarkTask | null> {
		await this.initialize();
		const snapshot = await this.getPointStorageService().getPointSnapshotById(taskId);
		if (!snapshot || getLegacyBookmarkTaskKind(snapshot) !== "epub") {
			return null;
		}
		return buildLegacyEpubTaskFromPointSnapshot(snapshot);
	}

	private async getPointTasks(): Promise<IREpubBookmarkTask[]> {
		await this.initialize();
		const snapshots = await this.getPointStorageService().listPointSnapshots();
		return snapshots
			.filter((snapshot) => getLegacyBookmarkTaskKind(snapshot) === "epub")
			.map((snapshot) => buildLegacyEpubTaskFromPointSnapshot(snapshot));
	}

	private async resolveTaskSourceIdentity(task: IREpubBookmarkTask): Promise<IREpubBookmarkTask> {
		const normalizedPath = normalizePath(String(task.epubFilePath || "").trim());
		if (!normalizedPath) {
			return task;
		}

		const sourceEntry = await this.epubStorageService.ensureSourceIdentity(normalizedPath, {
			preferredSourceId: task.sourceId,
		});

		return {
			...task,
			sourceId: sourceEntry?.sourceId || task.sourceId,
			epubFilePath: sourceEntry?.filePath || normalizedPath,
		};
	}

	private async persistTask(task: IREpubBookmarkTask): Promise<IREpubBookmarkTask> {
		const normalizedTask = await this.resolveTaskSourceIdentity(task);
		const linkedNotePaths = resolveAssociatedNotePaths({
			associatedNotePath:
				normalizedTask.meta?.primaryAssociatedNotePath || normalizedTask.meta?.associatedNotePath,
			associatedNotePaths: normalizedTask.meta?.associatedNotePaths,
		});
		const taskMeta = (normalizedTask.meta || {}) as unknown as Record<string, unknown>;
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
			typeof normalizedTask.resumeUpdatedAt === "number"
				? normalizedTask.resumeUpdatedAt
				: typeof normalizedTask.stats?.lastInteraction === "number"
					? normalizedTask.stats.lastInteraction
					: undefined;

		await this.getPointStorageService().syncLegacyPoint({
			id: normalizedTask.id,
			topicId: normalizeTaskTopic(normalizedTask),
			title: normalizedTask.title,
			tags: normalizedTask.tags,
			status: normalizedTask.status,
			priorityUi: normalizedTask.priorityUi,
			priorityEff: normalizedTask.priorityEff,
			intervalDays: normalizedTask.intervalDays,
			nextRepDate: normalizedTask.nextRepDate,
			createdAt: normalizedTask.createdAt,
			updatedAt: normalizedTask.updatedAt,
			lastInteractionAt,
			sourceType: "epub-bookmark",
			materialId: normalizedTask.sourceId,
			sourcePath: normalizedTask.epubFilePath,
			locatorType: "epub-chapter",
			locator: {
				tocHref: normalizedTask.tocHref,
				tocLevel: normalizedTask.tocLevel,
				resumeCfi: normalizedTask.resumeCfi,
			},
			linkedNotePaths,
			explicitTagGroupId:
				normalizedTask.meta?.tagGroup && normalizedTask.meta.tagGroup !== DEFAULT_IR_BLOCK_META.tagGroup
					? normalizedTask.meta.tagGroup
					: undefined,
			stats: {
				impressions: normalizedTask.stats?.impressions,
				extracts: normalizedTask.stats?.extracts,
				cardsCreated: normalizedTask.stats?.cardsCreated,
				notesWritten: normalizedTask.stats?.notesWritten,
				totalReadingTimeSec: normalizedTask.stats?.totalReadingTimeSec,
				lastInteractionAt,
			},
			metadata: Object.keys(sourceSequenceMetadata).length > 0 ? sourceSequenceMetadata : undefined,
		});

		return (await this.getTask(normalizedTask.id)) || normalizedTask;
	}

	async getTask(id: string): Promise<IREpubBookmarkTask | null> {
		return await this.getTaskFromPointStorage(id);
	}

	async getAllTasks(): Promise<IREpubBookmarkTask[]> {
		const tasks = await this.getPointTasks();
		return tasks.sort((left, right) => left.id.localeCompare(right.id));
	}

	async getTasksByDeck(deckId: string): Promise<IREpubBookmarkTask[]> {
		return await this.getTasksByDeckIdentifiers([deckId]);
	}

	async getTasksByDeckIdentifiers(deckIds: string[]): Promise<IREpubBookmarkTask[]> {
		const identifiers = this.toNormalizedSet(deckIds);
		if (identifiers.size === 0) {
			return [];
		}

		const tasks = await this.getAllTasks();
		return tasks.filter((task) => identifiers.has(String(getTaskTopicId(task) || "").trim()));
	}

	async getTasksByEpub(epubFilePath: string): Promise<IREpubBookmarkTask[]> {
		const normalizedPath = normalizePath(String(epubFilePath || "").trim());
		const sourceEntry = normalizedPath
			? await this.epubStorageService.ensureSourceIdentity(normalizedPath)
			: null;
		const tasks = await this.getAllTasks();
		return tasks.filter((task) => {
			if (normalizePath(String(task.epubFilePath || "").trim()) === normalizedPath) {
				return true;
			}
			return Boolean(sourceEntry?.sourceId && task.sourceId === sourceEntry.sourceId);
		});
	}

	async updateEpubFileReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(String(oldPath || "").trim());
		const normalizedNewPath = normalizePath(String(newPath || "").trim());
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const tasks = await this.getAllTasks();
		let updatedCount = 0;
		for (const task of tasks) {
			const remapped = this.remapPath(task.epubFilePath, normalizedOldPath, normalizedNewPath);
			if (!remapped || remapped === task.epubFilePath) {
				continue;
			}

			await this.persistTask({
				...task,
				epubFilePath: remapped,
				updatedAt: Date.now(),
			});
			updatedCount += 1;
		}

		return updatedCount;
	}

	async createTask(input: {
		topicId?: string;
		deckId?: string;
		epubFilePath: string;
		sourceId?: string;
		title: string;
		tocHref: string;
		tocLevel: number;
		priorityUi?: number;
		sourceSequenceGroup?: string;
		sourceSequenceOrder?: number;
		sourceSequenceLocked?: boolean;
		sourceSequenceAnchorDateKey?: string;
	}): Promise<IREpubBookmarkTask> {
		await this.initialize();

		const now = Date.now();
		const priorityUi = typeof input.priorityUi === "number" ? input.priorityUi : 5;
		const topicId = normalizeTaskTopic({
			topicId: input.topicId,
			deckId: input.deckId,
		} as IREpubBookmarkTask);
		const tocLevel = normalizeTocLevel(input.tocLevel);

		return await this.persistTask({
			id: generateEpubBookmarkTaskId(),
			topicId,
			deckId: topicId,
			sourceId: input.sourceId,
			epubFilePath: normalizePath(input.epubFilePath),
			title: input.title,
			tocHref: input.tocHref,
			tocLevel,
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
			} as IREpubBookmarkTask["meta"],
			tags: [],
			createdAt: now,
			updatedAt: now,
		});
	}

	async batchCreateTasks(
		inputs: Array<{
			topicId?: string;
			deckId?: string;
			epubFilePath: string;
			sourceId?: string;
			title: string;
			tocHref: string;
			tocLevel: number;
			priorityUi?: number;
			nextRepDate?: number;
			sourceSequenceGroup?: string;
			sourceSequenceOrder?: number;
			sourceSequenceLocked?: boolean;
			sourceSequenceAnchorDateKey?: string;
		}>
	): Promise<IREpubBookmarkTask[]> {
		await this.initialize();
		if (inputs.length === 0) {
			return [];
		}

		const now = Date.now();
		const created: IREpubBookmarkTask[] = inputs.map((input) => {
			const priorityUi = typeof input.priorityUi === "number" ? input.priorityUi : 5;
			const topicId = normalizeTaskTopic({
				topicId: input.topicId,
				deckId: input.deckId,
			} as IREpubBookmarkTask);
			const tocLevel = normalizeTocLevel(input.tocLevel);

			return {
				id: generateEpubBookmarkTaskId(),
				topicId,
				deckId: topicId,
				sourceId: input.sourceId,
				epubFilePath: normalizePath(input.epubFilePath),
				title: input.title,
				tocHref: input.tocHref,
				tocLevel,
				status: input.nextRepDate ? "queued" : "new",
				priorityUi,
				priorityEff: priorityUi,
				intervalDays: input.nextRepDate ? 1 : 0,
				nextRepDate: input.nextRepDate || 0,
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
				} as IREpubBookmarkTask["meta"],
				tags: [],
				createdAt: now,
				updatedAt: now,
			};
		});

		for (let index = 0; index < created.length; index += 1) {
			created[index].meta.siblings = {
				prev: index > 0 ? created[index - 1].id : null,
				next: index < created.length - 1 ? created[index + 1].id : null,
			};
		}

		const persisted: IREpubBookmarkTask[] = [];
		for (const task of created) {
			persisted.push(await this.persistTask(task));
		}

		logger.info("[IREpubBookmarkTaskService] 批量创建任务", {
			count: persisted.length,
			topicId: persisted[0]?.topicId,
		});
		return persisted;
	}

	async updateTask(
		id: string,
		updates: Partial<Omit<IREpubBookmarkTask, "id" | "createdAt">>
	): Promise<IREpubBookmarkTask | null> {
		const existing = await this.getTask(id);
		if (!existing) {
			return null;
		}

		const topicId = normalizeTaskTopic({
			topicId: updates.topicId ?? existing.topicId,
			deckId: updates.deckId ?? existing.deckId,
		} as IREpubBookmarkTask);
		const updated: IREpubBookmarkTask = {
			...existing,
			...updates,
			topicId,
			deckId: topicId,
			tocLevel:
				typeof updates.tocLevel === "number"
					? normalizeTocLevel(updates.tocLevel)
					: existing.tocLevel,
			epubFilePath: updates.epubFilePath
				? normalizePath(updates.epubFilePath)
				: existing.epubFilePath,
			meta: mergeTaskMeta(existing.meta, updates.meta),
			stats: mergeTaskStats(existing.stats, updates.stats),
			updatedAt: Date.now(),
		};

		return await this.persistTask(updated);
	}

	async updateTaskFromBlock(
		block: IRBlockV4 & { epubBookmarkHref?: string; epubBookmarkTitle?: string }
	): Promise<void> {
		if (!isEpubBookmarkTaskId(block.id)) {
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

	async setResumePoint(taskId: string, cfi: string): Promise<void> {
		const existing = await this.getTask(taskId);
		if (!existing) {
			return;
		}

		await this.persistTask({
			...existing,
			resumeCfi: cfi,
			resumeUpdatedAt: Date.now(),
			updatedAt: Date.now(),
		});
		logger.debug("[IREpubBookmarkTaskService] 已设置续读点", { taskId, cfi });
	}

	async clearResumePoint(taskId: string): Promise<void> {
		const existing = await this.getTask(taskId);
		if (!existing) {
			return;
		}

		await this.persistTask({
			...existing,
			resumeCfi: undefined,
			resumeUpdatedAt: undefined,
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
			logger.info("[IREpubBookmarkTaskService] 已删除任务", id);
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
			"[IREpubBookmarkTaskService] 已按专题标识删除任务",
			{ deckIds: Array.from(identifiers) }
		);
	}

	async deleteTasksByEpubPaths(epubFilePaths: string[]): Promise<number> {
		const paths = this.toNormalizedSet(epubFilePaths);
		const sourceIds = new Set<string>();
		for (const path of paths) {
			const sourceEntry = await this.epubStorageService.ensureSourceIdentity(path);
			if (sourceEntry?.sourceId) {
				sourceIds.add(sourceEntry.sourceId);
			}
		}

		return await this.deleteTasksByPredicate(
			(task) =>
				paths.has(String(task?.epubFilePath || "").trim()) ||
				Boolean(task?.sourceId && sourceIds.has(String(task.sourceId).trim())),
			"[IREpubBookmarkTaskService] 已按 EPUB 路径删除任务",
			{ epubFilePaths: Array.from(paths) }
		);
	}

	private toNormalizedSet(values: string[]): Set<string> {
		return new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => String(value || "").trim())
				.filter(Boolean)
		);
	}

	private remapPath(filePath: string, oldPath: string, newPath: string): string | null {
		const normalizedFilePath = normalizePath(filePath || "");
		if (!normalizedFilePath) {
			return null;
		}

		if (normalizedFilePath === oldPath) {
			return newPath;
		}

		if (normalizedFilePath.startsWith(`${oldPath}/`)) {
			return `${newPath}${normalizedFilePath.slice(oldPath.length)}`;
		}

		return null;
	}

	private async deleteTasksByPredicate(
		predicate: (task: IREpubBookmarkTask) => boolean,
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

	toBlockV4(task: IREpubBookmarkTask): IRBlockV4 {
		const block: IRBlockV4 = {
			id: task.id,
			sourcePath: task.epubFilePath,
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
		(block as any).epubBookmarkHref = task.tocHref;
		(block as any).epubBookmarkTitle = task.title;
		(block as any).epubBookmarkLevel = task.tocLevel;
		(block as any).epubBookmarkResumeCfi = task.resumeCfi;

		return block;
	}
}
