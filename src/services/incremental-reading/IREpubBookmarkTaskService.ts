import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import { EpubStorageService, type EpubSourceRegistryEntry } from "../epub/EpubStorageService";
import type { IRBlockMeta, IRBlockStats, IRBlockStatus, IRBlockV4 } from "../../types/ir-types";
import { DEFAULT_IR_BLOCK_META, DEFAULT_IR_BLOCK_STATS } from "../../types/ir-types";
import {
	getTaskTopicId,
	normalizeBookmarkTaskForRuntime,
	serializeBookmarkTaskForStorage,
} from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import { IRPointStorageService } from "./IRPointStorageService";

/**
 * EPUB 书签 IR 任务
 * 每个任务对应 EPUB 目录中的一个条目（章节/节），参与 IR 调度队列
 */
export interface IREpubBookmarkTask {
	id: string;
	topicId?: string;
	deckId: string;
	sourceId?: string;
	/** EPUB 文件在 Vault 中的路径 */
	epubFilePath: string;
	/** TOC 条目标题 */
	title: string;
	/** TOC 条目的 href（用于导航跳转） */
	tocHref: string;
	/** TOC 层级深度（0=顶层章节，1=节，2=小节...） */
	tocLevel: number;
	/** 续读点 CFI（用户手动标记的阅读位置） */
	resumeCfi?: string;
	/** 续读点更新时间 */
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

interface IREpubBookmarkTaskStore {
	version: number;
	tasks: Record<string, IREpubBookmarkTask>;
}

const DEFAULT_STORE: IREpubBookmarkTaskStore = {
	version: 1,
	tasks: {},
};

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

export class IREpubBookmarkTaskService {
	private app: App;
	private initialized = false;
	private filePath: string;
	private epubStorageService: EpubStorageService;
	private pointStorageService: IRPointStorageService | null = null;

	constructor(app: App) {
		this.app = app;
		this.epubStorageService = new EpubStorageService(app);
		const storageDir = getV2PathsFromApp(app as any).ir.root;
		this.filePath = normalizePath(`${storageDir}/epub-bookmark-tasks.json`);
	}

	private getPointStorageService(): IRPointStorageService {
		if (!this.pointStorageService) {
			this.pointStorageService = new IRPointStorageService(this.app);
		}
		return this.pointStorageService;
	}

	private async syncTaskToPointStorage(task: IREpubBookmarkTask): Promise<void> {
		await this.getPointStorageService().syncLegacyPoint({
			id: task.id,
			topicId: getTaskTopicId(task),
			title: task.title,
			tags: task.tags,
			status: task.status,
			priorityUi: task.priorityUi,
			priorityEff: task.priorityEff,
			intervalDays: task.intervalDays,
			nextRepDate: task.nextRepDate,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			lastInteractionAt: task.resumeUpdatedAt,
			sourceType: "epub-bookmark",
			materialId: task.sourceId,
			sourcePath: task.epubFilePath,
			locatorType: "epub-chapter",
			locator: {
				tocHref: task.tocHref,
				tocLevel: task.tocLevel,
				resumeCfi: task.resumeCfi,
			},
		});
	}

	private async deletePointFromPointStorage(pointId: string): Promise<void> {
		await this.getPointStorageService().deletePointByLegacyId(pointId);
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		const adapter = this.app.vault.adapter;

		logger.info("[IREpubBookmarkTaskService] init:", { filePath: this.filePath });

		const ensureDir = async (dirPath: string): Promise<void> => {
			const normalized = normalizePath(dirPath);
			const parts = normalized.split("/").filter(Boolean);
			let current = "";
			for (const part of parts) {
				current = current ? `${current}/${part}` : part;
				try {
					if (!(await adapter.exists(current))) {
						await adapter.mkdir(current);
					}
				} catch {
					// ignore
				}
			}
		};

		const parts = this.filePath.split("/");
		parts.pop();
		const dir = parts.join("/");
		try {
			await ensureDir(dir);
		} catch {}

		try {
			if (!(await adapter.exists(this.filePath))) {
				await adapter.write(this.filePath, JSON.stringify(DEFAULT_STORE));
				logger.info("[IREpubBookmarkTaskService] storage file created:", {
					filePath: this.filePath,
				});
			}
		} catch (e) {
			logger.warn("[IREpubBookmarkTaskService] init failed:", e);
		}

		this.initialized = true;
	}

	private async readStore(): Promise<IREpubBookmarkTaskStore> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		try {
			if (!(await adapter.exists(this.filePath))) {
				return { ...DEFAULT_STORE };
			}
			const content = await adapter.read(this.filePath);
			const parsed = JSON.parse(content) as IREpubBookmarkTaskStore;
			if (!parsed || typeof parsed !== "object") return { ...DEFAULT_STORE };
			const tasks = (parsed as any).tasks;
			if (!tasks || typeof tasks !== "object") return { version: 1, tasks: {} };
			const store = {
				version: typeof (parsed as any).version === "number" ? (parsed as any).version : 1,
				tasks: Object.fromEntries(
					Object.entries(tasks as Record<string, IREpubBookmarkTask>).map(([id, task]) => [
						id,
						normalizeBookmarkTaskForRuntime(task),
					])
				),
			};
			await this.reconcileTaskSourceIdentities(store);
			return store;
		} catch (e) {
			logger.warn("[IREpubBookmarkTaskService] read failed:", e);
			return { ...DEFAULT_STORE };
		}
	}

	private async writeStore(store: IREpubBookmarkTaskStore): Promise<void> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		plugin?.externalSyncWatcher?.markInternalWrite?.();
		const serializedStore: IREpubBookmarkTaskStore = {
			version: store.version,
			tasks: Object.fromEntries(
				Object.entries(store.tasks || {}).map(([id, task]) => [
					id,
					serializeBookmarkTaskForStorage(task),
				])
			),
		};
		await adapter.write(this.filePath, JSON.stringify(serializedStore));
		logger.debug("[IREpubBookmarkTaskService] written:", {
			filePath: this.filePath,
			count: Object.keys(store.tasks || {}).length,
		});
	}

	private async reconcileTaskSourceIdentities(store: IREpubBookmarkTaskStore): Promise<void> {
		let changed = false;
		const sourceEntryCache = new Map<string, Promise<EpubSourceRegistryEntry | null>>();
		const resolvedPathCache = new Map<string, Promise<string | null>>();
		for (const task of Object.values(store.tasks)) {
			const taskChanged = await this.reconcileTaskSourceIdentity(
				task,
				sourceEntryCache,
				resolvedPathCache
			);
			if (taskChanged) {
				changed = true;
			}
		}

		if (changed) {
			await this.writeStore(store);
		}
	}

	private async reconcileTaskSourceIdentity(
		task: IREpubBookmarkTask,
		sourceEntryCache: Map<string, Promise<EpubSourceRegistryEntry | null>>,
		resolvedPathCache: Map<string, Promise<string | null>>
	): Promise<boolean> {
		let changed = false;
		const normalizedPath = normalizePath(task.epubFilePath || "");

		if (normalizedPath) {
			const sourceCacheKey = `${String(task.sourceId || "").trim()}::${normalizedPath}`;
			let sourceEntryPromise = sourceEntryCache.get(sourceCacheKey);
			if (!sourceEntryPromise) {
				sourceEntryPromise = this.epubStorageService.ensureSourceIdentity(normalizedPath, {
					preferredSourceId: task.sourceId,
				});
				sourceEntryCache.set(sourceCacheKey, sourceEntryPromise);
			}
			const sourceEntry = await sourceEntryPromise;
			if (sourceEntry) {
				if (task.epubFilePath !== sourceEntry.filePath) {
					task.epubFilePath = sourceEntry.filePath;
					changed = true;
				}
				if (task.sourceId !== sourceEntry.sourceId) {
					task.sourceId = sourceEntry.sourceId;
					changed = true;
				}
			}
		}

		if (task.sourceId) {
			const resolveCacheKey = `${task.sourceId}::${String(task.epubFilePath || "").trim()}`;
			let resolvedPathPromise = resolvedPathCache.get(resolveCacheKey);
			if (!resolvedPathPromise) {
				resolvedPathPromise = this.epubStorageService.resolveSourceFilePath(
					task.sourceId,
					task.epubFilePath
				);
				resolvedPathCache.set(resolveCacheKey, resolvedPathPromise);
			}
			const resolvedPath = await resolvedPathPromise;
			if (resolvedPath && resolvedPath !== task.epubFilePath) {
				task.epubFilePath = resolvedPath;
				changed = true;
			}
		}

		return changed;
	}

	async getTask(id: string): Promise<IREpubBookmarkTask | null> {
		const store = await this.readStore();
		return store.tasks[id] || null;
	}

	async getAllTasks(): Promise<IREpubBookmarkTask[]> {
		const store = await this.readStore();
		return Object.values(store.tasks);
	}

	async getTasksByDeck(deckId: string): Promise<IREpubBookmarkTask[]> {
		return this.getTasksByDeckIdentifiers([deckId]);
	}

	async getTasksByDeckIdentifiers(deckIds: string[]): Promise<IREpubBookmarkTask[]> {
		const identifiers = this.toNormalizedSet(deckIds);
		if (identifiers.size === 0) {
			return [];
		}

		const store = await this.readStore();
		return Object.values(store.tasks).filter((task) =>
			identifiers.has(String(getTaskTopicId(task) || "").trim())
		);
	}

	async getTasksByEpub(epubFilePath: string): Promise<IREpubBookmarkTask[]> {
		const normalizedPath = normalizePath(epubFilePath || "");
		const sourceEntry = normalizedPath
			? await this.epubStorageService.ensureSourceIdentity(normalizedPath)
			: null;
		const store = await this.readStore();
		return Object.values(store.tasks).filter((task) => {
			if (normalizePath(task.epubFilePath || "") === normalizedPath) {
				return true;
			}
			return Boolean(sourceEntry?.sourceId && task.sourceId === sourceEntry.sourceId);
		});
	}

	async updateEpubFileReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(oldPath || "");
		const normalizedNewPath = normalizePath(newPath || "");
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const store = await this.readStore();
		let updated = 0;
		let changed = false;

		for (const task of Object.values(store.tasks)) {
			const remapped = this.remapPath(task.epubFilePath, normalizedOldPath, normalizedNewPath);
			if (!remapped || remapped === task.epubFilePath) {
				continue;
			}

			task.epubFilePath = remapped;
			if (!task.sourceId) {
				const sourceEntry = await this.epubStorageService.ensureSourceIdentity(remapped);
				if (sourceEntry?.sourceId) {
					task.sourceId = sourceEntry.sourceId;
				}
			}
			task.updatedAt = Date.now();
			updated += 1;
			changed = true;
		}

		if (changed) {
			await this.writeStore(store);
		}

		return updated;
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
	}): Promise<IREpubBookmarkTask> {
		const store = await this.readStore();

		const now = Date.now();
		const id = generateEpubBookmarkTaskId();
		const priorityUi = typeof input.priorityUi === "number" ? input.priorityUi : 5;
		const sourceEntry = await this.epubStorageService.ensureSourceIdentity(input.epubFilePath, {
			preferredSourceId: input.sourceId,
		});

		const topicId = getTaskTopicId(input);
		if (!topicId) {
			throw new Error("EPUB 书签任务缺少专题 ID");
		}

		const task: IREpubBookmarkTask = {
			id,
			topicId,
			deckId: topicId,
			sourceId: sourceEntry?.sourceId || input.sourceId,
			epubFilePath: sourceEntry?.filePath || input.epubFilePath,
			title: input.title,
			tocHref: input.tocHref,
			tocLevel: input.tocLevel,
			status: "new",
			priorityUi,
			priorityEff: priorityUi,
			intervalDays: 0,
			nextRepDate: 0,
			stats: { ...DEFAULT_IR_BLOCK_STATS },
			meta: { ...DEFAULT_IR_BLOCK_META, siblings: { prev: null, next: null } },
			tags: [],
			createdAt: now,
			updatedAt: now,
		};

		store.tasks[id] = task;
		await this.writeStore(store);
		await this.syncTaskToPointStorage(task);

		return task;
	}

	/**
	 * Batch create tasks from EPUB TOC items.
	 * Sets up sibling chain (prev/next) for navigation context.
	 */
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
		}>
	): Promise<IREpubBookmarkTask[]> {
		if (inputs.length === 0) return [];

		const store = await this.readStore();
		const now = Date.now();
		const created: IREpubBookmarkTask[] = [];

		for (const input of inputs) {
			const id = generateEpubBookmarkTaskId();
			const priorityUi = typeof input.priorityUi === "number" ? input.priorityUi : 5;
			const sourceEntry = await this.epubStorageService.ensureSourceIdentity(input.epubFilePath, {
				preferredSourceId: input.sourceId,
			});

			const topicId = getTaskTopicId(input);
			if (!topicId) {
				throw new Error("EPUB 书签任务缺少专题 ID");
			}

			const task: IREpubBookmarkTask = {
				id,
				topicId,
				deckId: topicId,
				sourceId: sourceEntry?.sourceId || input.sourceId,
				epubFilePath: sourceEntry?.filePath || input.epubFilePath,
				title: input.title,
				tocHref: input.tocHref,
				tocLevel: input.tocLevel,
				status: input.nextRepDate ? "queued" : "new",
				priorityUi,
				priorityEff: priorityUi,
				intervalDays: input.nextRepDate ? 1 : 0,
				nextRepDate: input.nextRepDate || 0,
				stats: { ...DEFAULT_IR_BLOCK_STATS },
				meta: { ...DEFAULT_IR_BLOCK_META, siblings: { prev: null, next: null } },
				tags: [],
				createdAt: now,
				updatedAt: now,
			};

			store.tasks[id] = task;
			created.push(task);
		}

		// Set up sibling chain
		for (let i = 0; i < created.length; i++) {
			const task = created[i];
			task.meta.siblings = {
				prev: i > 0 ? created[i - 1].id : null,
				next: i < created.length - 1 ? created[i + 1].id : null,
			};
			store.tasks[task.id] = task;
		}

		await this.writeStore(store);
		logger.info("[IREpubBookmarkTaskService] batch created:", {
			count: created.length,
			topicId: getTaskTopicId(inputs[0]),
		});

		return created;
	}

	async updateTask(
		id: string,
		updates: Partial<Omit<IREpubBookmarkTask, "id" | "createdAt">>
	): Promise<IREpubBookmarkTask | null> {
		const store = await this.readStore();
		const existing = store.tasks[id];
		if (!existing) return null;

		const updated: IREpubBookmarkTask = {
			...existing,
			...updates,
			meta: mergeTaskMeta(existing.meta, updates.meta),
			stats: mergeTaskStats(existing.stats, updates.stats),
			updatedAt: Date.now(),
		};

		store.tasks[id] = updated;
		await this.writeStore(store);
		await this.syncTaskToPointStorage(updated);

		return updated;
	}

	/**
	 * Update task scheduling data from IRBlockV4 (after IR session completion)
	 */
	async updateTaskFromBlock(
		block: IRBlockV4 & { epubBookmarkHref?: string; epubBookmarkTitle?: string }
	): Promise<void> {
		if (!isEpubBookmarkTaskId(block.id)) return;

		const store = await this.readStore();
		const existing = store.tasks[block.id];
		if (!existing) return;

		store.tasks[block.id] = {
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
		};

		await this.writeStore(store);
		await this.syncTaskToPointStorage(store.tasks[block.id]);
	}

	/**
	 * Set or update the resume point (CFI) for a task
	 */
	async setResumePoint(taskId: string, cfi: string): Promise<void> {
		const store = await this.readStore();
		const existing = store.tasks[taskId];
		if (!existing) return;

		existing.resumeCfi = cfi;
		existing.resumeUpdatedAt = Date.now();
		existing.updatedAt = Date.now();
		store.tasks[taskId] = existing;

		await this.writeStore(store);
		await this.syncTaskToPointStorage(existing);
		logger.debug("[IREpubBookmarkTaskService] resume point set:", { taskId, cfi });
	}

	/**
	 * Clear the resume point for a task
	 */
	async clearResumePoint(taskId: string): Promise<void> {
		const store = await this.readStore();
		const existing = store.tasks[taskId];
		if (!existing) return;

		existing.resumeCfi = undefined;
		existing.resumeUpdatedAt = undefined;
		existing.updatedAt = Date.now();
		store.tasks[taskId] = existing;

		await this.writeStore(store);
	}

	async recordTaskInteraction(
		taskId: string,
		readingTimeSec: number,
		actions: { extracts?: number; cardsCreated?: number; notesWritten?: number } = {}
	): Promise<void> {
		const store = await this.readStore();
		const existing = store.tasks[taskId];
		if (!existing) return;

		const stats = existing.stats;
		stats.impressions++;
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

		store.tasks[taskId] = {
			...existing,
			stats,
			updatedAt: Date.now(),
		};

		await this.writeStore(store);
	}

	async deleteTask(id: string): Promise<boolean> {
		const store = await this.readStore();
		if (!store.tasks[id]) return false;
		delete store.tasks[id];
		await this.writeStore(store);
		await this.deletePointFromPointStorage(id);
		logger.info("[IREpubBookmarkTaskService] task deleted:", id);
		return true;
	}

	async deleteTasksByDeck(deckId: string): Promise<number> {
		return this.deleteTasksByDeckIdentifiers([deckId]);
	}

	async deleteTasksByDeckIdentifiers(deckIds: string[]): Promise<number> {
		const identifiers = this.toNormalizedSet(deckIds);
		return this.deleteTasksByPredicate(
			(task) => identifiers.has(String(getTaskTopicId(task) || "").trim()),
			"[IREpubBookmarkTaskService] tasks deleted by deck identifiers:",
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
		return this.deleteTasksByPredicate(
			(task) =>
				paths.has(String(task?.epubFilePath || "").trim()) ||
				Boolean(task?.sourceId && sourceIds.has(String(task.sourceId).trim())),
			"[IREpubBookmarkTaskService] tasks deleted by epub paths:",
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
		const store = await this.readStore();
		const toDelete = Object.entries(store.tasks)
			.filter(([, task]) => predicate(task))
			.map(([id]) => id);

		if (toDelete.length === 0) {
			return 0;
		}

		for (const id of toDelete) {
			delete store.tasks[id];
		}

		await this.writeStore(store);
		for (const id of toDelete) {
			await this.deletePointFromPointStorage(id);
		}
		logger.info(logMessage, {
			...logMeta,
			count: toDelete.length,
		});

		return toDelete.length;
	}

	/**
	 * Convert task to IRBlockV4 for IR scheduling integration
	 */
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
