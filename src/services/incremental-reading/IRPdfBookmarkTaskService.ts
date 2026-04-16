import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import { getV2PathsFromApp } from "../../config/paths";
import type { IRBlockMeta, IRBlockStats, IRBlockStatus, IRBlockV4 } from "../../types/ir-types";
import { DEFAULT_IR_BLOCK_META, DEFAULT_IR_BLOCK_STATS } from "../../types/ir-types";
import {
	getTaskTopicId,
	normalizeBookmarkTaskForRuntime,
	serializeBookmarkTaskForStorage,
} from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
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
	/** 收藏 */
	favorite?: boolean;
	createdAt: number;
	updatedAt: number;
}

interface IRPdfBookmarkTaskStore {
	version: number;
	tasks: Record<string, IRPdfBookmarkTask>;
}

const DEFAULT_STORE: IRPdfBookmarkTaskStore = {
	version: 1,
	tasks: {},
};

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

export class IRPdfBookmarkTaskService {
	private app: App;
	private initialized = false;
	private filePath: string;
	private pointStorageService: IRPointStorageService | null = null;

	constructor(app: App) {
		this.app = app;
		const storageDir = getV2PathsFromApp(app as any).ir.root;
		this.filePath = normalizePath(`${storageDir}/pdf-bookmark-tasks.json`);
	}

	private getPointStorageService(): IRPointStorageService {
		if (!this.pointStorageService) {
			this.pointStorageService = new IRPointStorageService(this.app);
		}
		return this.pointStorageService;
	}

	private async syncTaskToPointStorage(task: IRPdfBookmarkTask): Promise<void> {
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
		});
	}

	private async deletePointFromPointStorage(pointId: string): Promise<void> {
		await this.getPointStorageService().deletePointByLegacyId(pointId);
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		const adapter = this.app.vault.adapter;

		logger.info("[IRPdfBookmarkTaskService] 初始化:", { filePath: this.filePath });

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
				logger.info("[IRPdfBookmarkTaskService] 已创建存储文件:", { filePath: this.filePath });
			}
		} catch (e) {
			logger.warn("[IRPdfBookmarkTaskService] 初始化失败:", e);
		}

		this.initialized = true;
	}

	private async readStore(): Promise<IRPdfBookmarkTaskStore> {
		await this.initialize();
		const adapter = this.app.vault.adapter;

		try {
			if (!(await adapter.exists(this.filePath))) {
				return { ...DEFAULT_STORE };
			}
			const content = await adapter.read(this.filePath);
			const parsed = JSON.parse(content) as IRPdfBookmarkTaskStore;
			if (!parsed || typeof parsed !== "object") return { ...DEFAULT_STORE };
			const tasks = (parsed as any).tasks;
			if (!tasks || typeof tasks !== "object") return { version: 1, tasks: {} };
			return {
				version: typeof (parsed as any).version === "number" ? (parsed as any).version : 1,
				tasks: Object.fromEntries(
					Object.entries(tasks as Record<string, IRPdfBookmarkTask>).map(([id, task]) => [
						id,
						normalizeBookmarkTaskForRuntime(task),
					])
				),
			};
		} catch (e) {
			logger.warn("[IRPdfBookmarkTaskService] 读取失败:", e);
			return { ...DEFAULT_STORE };
		}
	}

	private async writeStore(store: IRPdfBookmarkTaskStore): Promise<void> {
		await this.initialize();
		const adapter = this.app.vault.adapter;
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		plugin?.externalSyncWatcher?.markInternalWrite?.();
		const serializedStore: IRPdfBookmarkTaskStore = {
			version: store.version,
			tasks: Object.fromEntries(
				Object.entries(store.tasks || {}).map(([id, task]) => [
					id,
					serializeBookmarkTaskForStorage(task),
				])
			),
		};
		await adapter.write(this.filePath, JSON.stringify(serializedStore));
		logger.debug("[IRPdfBookmarkTaskService] 已写入:", {
			filePath: this.filePath,
			count: Object.keys(store.tasks || {}).length,
		});
	}

	async getTask(id: string): Promise<IRPdfBookmarkTask | null> {
		const store = await this.readStore();
		return store.tasks[id] || null;
	}

	async getAllTasks(): Promise<IRPdfBookmarkTask[]> {
		const store = await this.readStore();
		return Object.values(store.tasks);
	}

	async getTasksByDeck(deckId: string): Promise<IRPdfBookmarkTask[]> {
		return this.getTasksByDeckIdentifiers([deckId]);
	}

	async getTasksByDeckIdentifiers(deckIds: string[]): Promise<IRPdfBookmarkTask[]> {
		const identifiers = this.toNormalizedSet(deckIds);
		if (identifiers.size === 0) {
			return [];
		}

		const store = await this.readStore();
		return Object.values(store.tasks).filter((task) =>
			identifiers.has(String(getTaskTopicId(task) || "").trim())
		);
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
	}): Promise<IRPdfBookmarkTask> {
		const store = await this.readStore();

		const now = Date.now();
		const id = generatePdfBookmarkTaskId();
		const priorityUi = typeof input.priorityUi === "number" ? input.priorityUi : 5;

		const topicId = getTaskTopicId(input);
		if (!topicId) {
			throw new Error("PDF 书签任务缺少专题 ID");
		}

		const task: IRPdfBookmarkTask = {
			id,
			topicId,
			deckId: topicId,
			materialId: input.materialId,
			pdfPath: input.pdfPath,
			title: input.title,
			link: input.link,
			annotationId: input.annotationId,
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

	async updateTask(
		id: string,
		updates: Partial<Omit<IRPdfBookmarkTask, "id" | "createdAt">>
	): Promise<IRPdfBookmarkTask | null> {
		const store = await this.readStore();
		const existing = store.tasks[id];
		if (!existing) return null;

		const updated: IRPdfBookmarkTask = {
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

	async updateTaskFromBlock(
		block: IRBlockV4 & { pdfBookmarkLink?: string; pdfBookmarkTitle?: string }
	): Promise<void> {
		if (!isPdfBookmarkTaskId(block.id)) return;

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

		// 每日展示计数器（跨天自动重置）
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
		logger.info("[IRPdfBookmarkTaskService] 已删除任务:", id);
		return true;
	}

	async deleteTasksByDeck(deckId: string): Promise<number> {
		return this.deleteTasksByDeckIdentifiers([deckId]);
	}

	async deleteTasksByDeckIdentifiers(deckIds: string[]): Promise<number> {
		const identifiers = this.toNormalizedSet(deckIds);
		return this.deleteTasksByPredicate(
			(task) => identifiers.has(String(getTaskTopicId(task) || "").trim()),
			"[IRPdfBookmarkTaskService] 已按牌组标识删除任务:",
			{ deckIds: Array.from(identifiers) }
		);
	}

	async deleteTasksByPdfPaths(pdfPaths: string[]): Promise<number> {
		const paths = this.toNormalizedSet(pdfPaths);
		return this.deleteTasksByPredicate(
			(task) => paths.has(String(task?.pdfPath || "").trim()),
			"[IRPdfBookmarkTaskService] 已按 PDF 路径删除任务:",
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
