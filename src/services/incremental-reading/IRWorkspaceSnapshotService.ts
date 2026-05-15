import { App, TFile } from "obsidian";
import type {
	IRBlock,
	IRChunkFileData,
	IRDeck,
	IRDeckStats,
	IRSession,
	IRSourceFileMeta,
} from "../../types/ir-types";
import { getTaskTopicId } from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import { IREpubBookmarkTaskService } from "./IREpubBookmarkTaskService";
import {
	getProjectedDayLoad,
	getProjectedScheduleSummary,
	type IRProjectedScheduleSummary,
} from "./IRProjectedScheduleSummary";
import { IRPdfBookmarkTaskService } from "./IRPdfBookmarkTaskService";
import { IRStorageService } from "./IRStorageService";

type DeckOverviewOptions = {
	dailyNewLimit?: number;
	dailyReviewLimit?: number;
	learnAheadDays?: number;
	dailyTimeBudgetMinutes?: number;
	loadRateDays?: number;
};

export interface IRWorkspaceDataSnapshot {
	generatedAt: number;
	decksRecord: Record<string, IRDeck>;
	blocksRecord: Record<string, IRBlock>;
	chunksRecord: Record<string, IRChunkFileData>;
	sourcesRecord: Record<string, IRSourceFileMeta>;
	history: { sessions?: IRSession[] };
	pdfTasks: any[];
	epubTasks: any[];
}

export interface IRDeckOverviewSnapshot {
	generatedAt: number;
	decks: IRDeck[];
	deckStats: Record<string, IRDeckStats>;
}

export class IRWorkspaceSnapshotService {
	private app: App;
	private storage: IRStorageService;
	private pdfService: IRPdfBookmarkTaskService;
	private epubService: IREpubBookmarkTaskService;
	private workspaceDataCache: IRWorkspaceDataSnapshot | null = null;
	private inflightWorkspaceData: Promise<IRWorkspaceDataSnapshot> | null = null;
	private deckOverviewCache = new Map<string, IRDeckOverviewSnapshot>();
	private inflightDeckOverview = new Map<string, Promise<IRDeckOverviewSnapshot>>();
	private cacheVersion = 0;

	constructor(app: App) {
		this.app = app;
		this.storage = new IRStorageService(app);
		this.pdfService = new IRPdfBookmarkTaskService(app);
		this.epubService = new IREpubBookmarkTaskService(app);
	}

	invalidate(): void {
		this.cacheVersion += 1;
		this.workspaceDataCache = null;
		this.inflightWorkspaceData = null;
		this.deckOverviewCache.clear();
		this.inflightDeckOverview.clear();
	}

	getCachedWorkspaceData(): IRWorkspaceDataSnapshot | null {
		return this.workspaceDataCache;
	}

	async getWorkspaceData(): Promise<IRWorkspaceDataSnapshot> {
		if (this.workspaceDataCache) {
			return this.workspaceDataCache;
		}
		if (this.inflightWorkspaceData) {
			return this.inflightWorkspaceData;
		}

		const requestVersion = this.cacheVersion;
		const snapshotPromise = this.buildWorkspaceData(requestVersion);
		this.inflightWorkspaceData = snapshotPromise;
		try {
			return await snapshotPromise;
		} finally {
			if (this.inflightWorkspaceData === snapshotPromise) {
				this.inflightWorkspaceData = null;
			}
		}
	}

	getCachedDeckOverview(options: DeckOverviewOptions = {}): IRDeckOverviewSnapshot | null {
		return this.deckOverviewCache.get(this.buildDeckOverviewCacheKey(options)) || null;
	}

	async getDeckOverview(options: DeckOverviewOptions = {}): Promise<IRDeckOverviewSnapshot> {
		const cacheKey = this.buildDeckOverviewCacheKey(options);
		const cached = this.deckOverviewCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const inflight = this.inflightDeckOverview.get(cacheKey);
		if (inflight) {
			return inflight;
		}

		const requestVersion = this.cacheVersion;
		const snapshotPromise = this.buildDeckOverview(options, cacheKey, requestVersion);
		this.inflightDeckOverview.set(cacheKey, snapshotPromise);
		try {
			return await snapshotPromise;
		} finally {
			if (this.inflightDeckOverview.get(cacheKey) === snapshotPromise) {
				this.inflightDeckOverview.delete(cacheKey);
			}
		}
	}

	private buildDeckOverviewCacheKey(options: DeckOverviewOptions): string {
		return JSON.stringify({
			dailyNewLimit: options.dailyNewLimit ?? 20,
			dailyReviewLimit: options.dailyReviewLimit ?? 50,
			learnAheadDays: options.learnAheadDays ?? 3,
			dailyTimeBudgetMinutes: options.dailyTimeBudgetMinutes ?? 30,
			loadRateDays: options.loadRateDays ?? 3,
		});
	}

	private async buildDeckOverview(
		options: DeckOverviewOptions,
		cacheKey: string,
		requestVersion: number
	): Promise<IRDeckOverviewSnapshot> {
		const startedAt = Date.now();
		const {
			decksRecord,
			blocksRecord,
			chunksRecord,
			history,
			pdfTasks,
			epubTasks,
		} = await this.getWorkspaceData();

		const decks = Object.values(decksRecord);
		const blocks = Object.values(blocksRecord);
		const chunks = Object.values(chunksRecord);
		const safeLearnAheadDays = Math.min(Math.max(options.learnAheadDays ?? 3, 1), 14);
		const dailyNewLimit = options.dailyNewLimit ?? 20;
		const dailyReviewLimit = options.dailyReviewLimit ?? 50;
		const dailyBudget = options.dailyTimeBudgetMinutes ?? 30;
		const loadRateDays = Math.max(1, options.loadRateDays ?? 3);
		const projectedSummary = await getProjectedScheduleSummary(this.app, {
			horizonDays: Math.max(safeLearnAheadDays, loadRateDays),
			seedData: {
				decksRecord,
				blocksRecord,
				history,
			},
		});

		const ignoreTagByFile = new Map<string, boolean>();
		const deckKeysByIdentifier = this.buildDeckKeysByIdentifier(decks);
		const blocksByDeckKey = this.buildBlocksByDeckKey(decks, blocks, deckKeysByIdentifier);
		const chunksByDeckKey = this.buildChunksByDeckKey(decks, chunks, deckKeysByIdentifier, ignoreTagByFile);
		const pdfTasksByDeckKey = this.buildTasksByDeckKey(decks, pdfTasks, deckKeysByIdentifier);
		const epubTasksByDeckKey = this.buildTasksByDeckKey(decks, epubTasks, deckKeysByIdentifier);
		const allFiles = new Set<string>();

		for (const deck of decks) {
			const deckKey = this.getDeckKey(deck);
			for (const block of blocksByDeckKey.get(deckKey) || []) {
				if (block.filePath) allFiles.add(block.filePath);
			}
			for (const chunk of chunksByDeckKey.get(deckKey) || []) {
				if (chunk.filePath) allFiles.add(chunk.filePath);
			}
			for (const task of pdfTasksByDeckKey.get(deckKey) || []) {
				const path = String(task.pdfPath || "").trim();
				if (path) allFiles.add(path);
			}
			for (const task of epubTasksByDeckKey.get(deckKey) || []) {
				const path = String(task.epubFilePath || "").trim();
				if (path) allFiles.add(path);
			}
		}

		const questionStatsByFile = await this.buildQuestionStatsByFile(Array.from(allFiles));
		const deckStats: Record<string, IRDeckStats> = {};
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);

		for (const deck of decks) {
			const deckKey = this.getDeckKey(deck);
			const deckBlocks = blocksByDeckKey.get(deckKey) || [];
			const deckChunks = chunksByDeckKey.get(deckKey) || [];
			const deckPdfTasks = pdfTasksByDeckKey.get(deckKey) || [];
			const deckEpubTasks = epubTasksByDeckKey.get(deckKey) || [];
			const deckFiles = new Set<string>();

			let newCount = 0;
			let learningCount = 0;
			let reviewCount = 0;
			let dueToday = 0;
			let dueWithinDays = 0;

			for (const block of deckBlocks) {
				if (block.filePath) deckFiles.add(block.filePath);
				const state = String(block.state || "new");
				if (state === "new") {
					newCount++;
				} else if (state === "learning") {
					learningCount++;
				} else if (state === "review") {
					reviewCount++;
				}
			}

			for (const chunk of deckChunks) {
				if (chunk.filePath) deckFiles.add(chunk.filePath);
				const status = String(chunk.scheduleStatus || "new");
				if (status === "new") {
					newCount++;
				} else if (status === "queued" || status === "active") {
					learningCount++;
				} else if (status === "scheduled") {
					reviewCount++;
				}
			}

			const activePdfTasks = this.filterActiveTasks(deckPdfTasks);
			const activeEpubTasks = this.filterActiveTasks(deckEpubTasks);
			for (const task of activePdfTasks) {
				const sourcePath = String(task.pdfPath || "").trim();
				if (sourcePath) deckFiles.add(sourcePath);
				const status = String(task.status || "new");
				if (status === "new") {
					newCount++;
				} else if (status === "queued" || status === "active") {
					learningCount++;
				} else if (status === "scheduled") {
					reviewCount++;
				}
			}

			for (const task of activeEpubTasks) {
				const sourcePath = String(task.epubFilePath || "").trim();
				if (sourcePath) deckFiles.add(sourcePath);
				const status = String(task.status || "new");
				if (status === "new") {
					newCount++;
				} else if (status === "queued" || status === "active") {
					learningCount++;
				} else if (status === "scheduled") {
					reviewCount++;
				}
			}

			for (let dayOffset = 0; dayOffset < safeLearnAheadDays; dayOffset++) {
				const targetDate = new Date(startOfToday);
				targetDate.setDate(startOfToday.getDate() + dayOffset);
				const projectedDayLoad = getProjectedDayLoad(projectedSummary, targetDate, [deckKey]);
				if (dayOffset === 0) {
					dueToday += projectedDayLoad.items.length;
				}
				dueWithinDays += projectedDayLoad.items.length;
			}

			let questionCount = 0;
			let completedQuestionCount = 0;
			for (const filePath of deckFiles) {
				const fileStats = questionStatsByFile.get(filePath);
				if (!fileStats) continue;
				questionCount += fileStats.total;
				completedQuestionCount += fileStats.completed;
			}

			deckStats[deckKey] = {
				newCount,
				learningCount,
				reviewCount,
				dueToday,
				dueWithinDays,
				totalCount:
					deckBlocks.length + deckChunks.length + activePdfTasks.length + activeEpubTasks.length,
				fileCount: deckFiles.size,
				questionCount,
				completedQuestionCount,
				todayNewCount: Math.min(newCount, dailyNewLimit),
				todayDueCount: Math.min(dueToday, dailyReviewLimit),
				loadRatePercent:
					dailyBudget > 0
						? this.calculateDeckLoadRatePercent({
							projectedSummary,
							deckIds: [deckKey],
							dailyBudget,
							loadRateDays,
						})
						: undefined,
			};
		}

		const snapshot: IRDeckOverviewSnapshot = {
			generatedAt: Date.now(),
			decks,
			deckStats,
		};
		if (this.cacheVersion === requestVersion) {
			this.deckOverviewCache.set(cacheKey, snapshot);
		}
		logger.info("[IRWorkspaceSnapshotService] deck overview ready", {
			deckCount: decks.length,
			blockCount: Object.keys(blocksRecord).length,
			chunkCount: chunks.length,
			pdfTaskCount: pdfTasks.length,
			epubTaskCount: epubTasks.length,
			durationMs: Date.now() - startedAt,
		});
		return snapshot;
	}

	private async buildWorkspaceData(requestVersion: number): Promise<IRWorkspaceDataSnapshot> {
		const startedAt = Date.now();
		await Promise.all([
			this.storage.initialize(),
			this.pdfService.initialize(),
			this.epubService.initialize(),
		]);

		const [
			decksRecord,
			blocksRecord,
			chunksRecord,
			sourcesRecord,
			history,
			pdfTasks,
			epubTasks,
		] = await Promise.all([
			this.storage.getAllDecks(),
			this.storage.getAllBlocks(),
			this.storage.getAllChunkData(),
			this.storage.getAllSources(),
			this.storage.getHistory(),
			this.pdfService.getAllTasks(),
			this.epubService.getAllTasks(),
		]);

		const snapshot: IRWorkspaceDataSnapshot = {
			generatedAt: Date.now(),
			decksRecord,
			blocksRecord,
			chunksRecord,
			sourcesRecord,
			history,
			pdfTasks,
			epubTasks,
		};
		if (this.cacheVersion === requestVersion) {
			this.workspaceDataCache = snapshot;
		}
		logger.info("[IRWorkspaceSnapshotService] workspace data ready", {
			deckCount: Object.keys(decksRecord).length,
			blockCount: Object.keys(blocksRecord).length,
			chunkCount: Object.keys(chunksRecord).length,
			sourceCount: Object.keys(sourcesRecord).length,
			pdfTaskCount: pdfTasks.length,
			epubTaskCount: epubTasks.length,
			durationMs: Date.now() - startedAt,
		});
		return snapshot;
	}

	private getDeckKey(deck: IRDeck): string {
		return String(deck.id || deck.path || "").trim();
	}

	private normalizeIdentifiers(values: Array<string | null | undefined>): string[] {
		return Array.from(
			new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
		);
	}

	private buildDeckKeysByIdentifier(decks: IRDeck[]): Map<string, Set<string>> {
		const deckKeysByIdentifier = new Map<string, Set<string>>();
		for (const deck of decks) {
			const deckKey = this.getDeckKey(deck);
			if (!deckKey) continue;
			for (const identifier of this.normalizeIdentifiers([deck.id, deck.path])) {
				const set = deckKeysByIdentifier.get(identifier) || new Set<string>();
				set.add(deckKey);
				deckKeysByIdentifier.set(identifier, set);
			}
		}
		return deckKeysByIdentifier;
	}

	private buildBlocksByDeckKey(
		decks: IRDeck[],
		blocks: IRBlock[],
		deckKeysByIdentifier: Map<string, Set<string>>
	): Map<string, IRBlock[]> {
		const map = new Map<string, IRBlock[]>();
		for (const deck of decks) {
			map.set(this.getDeckKey(deck), []);
		}

		const deckByBlockId = new Map<string, Set<string>>();
		for (const deck of decks) {
			const deckKey = this.getDeckKey(deck);
			for (const blockId of deck.blockIds || []) {
				const set = deckByBlockId.get(blockId) || new Set<string>();
				set.add(deckKey);
				deckByBlockId.set(blockId, set);
			}
		}

		for (const block of blocks) {
			if (!this.shouldIncludeLegacyBlock(block)) continue;
			const blockDeckKeys = deckByBlockId.get(String(block.id || "").trim());
			if (blockDeckKeys && blockDeckKeys.size > 0) {
				for (const deckKey of blockDeckKeys) {
					map.get(deckKey)?.push(block);
				}
				continue;
			}
			for (const deckKey of deckKeysByIdentifier.get(String((block as any).deckPath || "").trim()) || []) {
				map.get(deckKey)?.push(block);
			}
		}

		return map;
	}

	private shouldIncludeLegacyBlock(block: IRBlock): boolean {
		if (block.state === "suspended") return false;
		const tags = Array.isArray(block.tags) ? block.tags : [];
		if (tags.some((tag) => {
			const normalized = String(tag || "").trim().toLowerCase();
			return normalized === "ignore" || normalized === "#ignore";
		})) {
			return false;
		}
		return !/#ignore\b/i.test(String(block.contentPreview || ""));
	}

	private buildChunksByDeckKey(
		decks: IRDeck[],
		chunks: IRChunkFileData[],
		deckKeysByIdentifier: Map<string, Set<string>>,
		ignoreTagByFile: Map<string, boolean>
	): Map<string, IRChunkFileData[]> {
		const map = new Map<string, IRChunkFileData[]>();
		const deckKeysByTag = new Map<string, string>();
		for (const deck of decks) {
			const deckKey = this.getDeckKey(deck);
			map.set(deckKey, []);
			if (deck.name) {
				deckKeysByTag.set(`#IR_deck_${deck.name}`, deckKey);
			}
		}

		for (const chunk of chunks) {
			if (this.hasIgnoreTagInFile(chunk.filePath, ignoreTagByFile)) continue;
			const matchedDeckKeys = new Set<string>();
			for (const identifier of this.normalizeIdentifiers((chunk as any).deckIds || [])) {
				for (const deckKey of deckKeysByIdentifier.get(identifier) || []) {
					matchedDeckKeys.add(deckKey);
				}
			}
			const deckTag = String((chunk as any).deckTag || "").trim();
			if (deckTag && deckKeysByTag.has(deckTag)) {
				matchedDeckKeys.add(deckKeysByTag.get(deckTag)!);
			}
			for (const deckKey of matchedDeckKeys) {
				map.get(deckKey)?.push(chunk);
			}
		}

		return map;
	}

	private buildTasksByDeckKey<T extends { deckId?: string }>(
		decks: IRDeck[],
		tasks: T[],
		deckKeysByIdentifier: Map<string, Set<string>>
	): Map<string, T[]> {
		const map = new Map<string, T[]>();
		for (const deck of decks) {
			map.set(this.getDeckKey(deck), []);
		}

		for (const task of tasks) {
			const identifier = String(getTaskTopicId(task as any) || (task as any)?.deckId || "").trim();
			if (!identifier) continue;
			for (const deckKey of deckKeysByIdentifier.get(identifier) || []) {
				map.get(deckKey)?.push(task);
			}
		}

		return map;
	}

	private filterActiveTasks<T extends { status?: string }>(tasks: T[]): T[] {
		return tasks.filter((task) => {
			const status = String(task.status || "new");
			return status !== "done" && status !== "suspended" && status !== "removed";
		});
	}

	private hasIgnoreTagInFile(filePath: string, cache: Map<string, boolean>): boolean {
		const normalizedPath = String(filePath || "").trim();
		if (!normalizedPath) return false;
		if (cache.has(normalizedPath)) {
			return cache.get(normalizedPath) || false;
		}

		let ignored = false;
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (file instanceof TFile) {
			const fileCache = this.app.metadataCache.getFileCache(file);
			const inlineTags = fileCache?.tags?.map((tag) => String(tag.tag || "").replace(/^#/, "").toLowerCase()) || [];
			const frontmatterTagsRaw = (fileCache?.frontmatter as any)?.tags;
			const frontmatterTags = Array.isArray(frontmatterTagsRaw)
				? frontmatterTagsRaw.map((tag) => String(tag || "").trim().toLowerCase())
				: typeof frontmatterTagsRaw === "string"
					? frontmatterTagsRaw.split(",").map((tag) => tag.trim().toLowerCase())
					: [];
			ignored =
				inlineTags.includes("ignore") ||
				frontmatterTags.includes("ignore") ||
				JSON.stringify(fileCache?.frontmatter || {}).toLowerCase().includes("ignore");
		}

		cache.set(normalizedPath, ignored);
		return ignored;
	}

	private async buildQuestionStatsByFile(
		filePaths: string[]
	): Promise<Map<string, { total: number; completed: number }>> {
		const result = new Map<string, { total: number; completed: number }>();
		const completedQuestionRegex = /^[-*]\s*\[x\]\s*.+[?？]/gim;
		const uncompletedQuestionRegex = /^[-*]\s*\[\s\]\s*.+[?？]/gim;

		for (const filePath of filePaths) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (!(file instanceof TFile)) continue;
				const content = await this.app.vault.read(file);
				const completedMatches = content.match(completedQuestionRegex);
				const uncompletedMatches = content.match(uncompletedQuestionRegex);
				const completed = completedMatches ? completedMatches.length : 0;
				const total = completed + (uncompletedMatches ? uncompletedMatches.length : 0);
				result.set(filePath, { total, completed });
			} catch (error) {
				logger.debug("[IRWorkspaceSnapshotService] question stats skipped", { filePath, error });
			}
		}

		return result;
	}

	private calculateDeckLoadRatePercent(input: {
		projectedSummary: IRProjectedScheduleSummary;
		deckIds: string[];
		dailyBudget: number;
		loadRateDays: number;
	}): number {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		let maxRatio = 0;

		for (let dayOffset = 0; dayOffset < input.loadRateDays; dayOffset++) {
			const targetDate = new Date(today);
			targetDate.setDate(today.getDate() + dayOffset);
			const dayMinutes = getProjectedDayLoad(
				input.projectedSummary,
				targetDate,
				input.deckIds
			).totalEstimatedMinutes;

			maxRatio = Math.max(maxRatio, dayMinutes / input.dailyBudget);
		}

		return Math.round(maxRatio * 100);
	}
}

const snapshotServiceByApp = new WeakMap<App, IRWorkspaceSnapshotService>();

export function getSharedIRWorkspaceSnapshotService(app: App): IRWorkspaceSnapshotService {
	let service = snapshotServiceByApp.get(app);
	if (!service) {
		service = new IRWorkspaceSnapshotService(app);
		snapshotServiceByApp.set(app, service);
	}
	return service;
}
