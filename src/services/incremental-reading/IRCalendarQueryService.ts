import type { App } from "obsidian";
import { getPluginPaths } from "../../config/paths";
import type { ReadingMaterial } from "../../types/incremental-reading-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { EpubStorageService } from "../epub-integration/EpubStorageService";
import {
	buildProjectedDayLoadMap,
	getProjectedScheduleSummary,
} from "./IRProjectedScheduleSummary";
import {
	getSharedIRScheduleKernel,
	type IRPlannedDay,
	type IRPlannedSchedule,
	type IRPlannedScheduleItem,
	type RecomputeOptions,
	type ScheduleRecomputeReason,
} from "./IRScheduleKernel";
import {
	buildScheduleItemFromChunkData,
	buildScheduleItemFromEpubTask,
	buildScheduleItemFromLegacyBlock,
	buildScheduleItemFromPdfTask,
	buildScheduleItemFromProjectedItem,
	type ScheduleItem,
} from "./IRCalendarScheduleItem";
import { extractReadingPointDisplayName } from "./IRReadingPointTitle";
import {
	getSharedIRWorkspaceSnapshotService,
	type IRWorkspaceDataSnapshot,
} from "./IRWorkspaceSnapshotService";

export interface IRCalendarQueryOptions extends RecomputeOptions {
	forceRecompute?: boolean;
	reason?: ScheduleRecomputeReason;
}

export interface IRCalendarQueryScope {
	deckIds: string[];
	horizonDays?: number;
	cacheKey: string;
	stateKey: string;
}

export interface IRCalendarQueryResult {
	workspaceData: IRWorkspaceDataSnapshot;
	readingMaterials: ReadingMaterial[];
	materialsByDate: Map<string, ScheduleItem[]>;
	continueReadingSuspendedItemsPool: ScheduleItem[];
	schedule: IRPlannedSchedule;
	scope: IRCalendarQueryScope;
}

interface IRCalendarQueryCacheEntry {
	stateKey: string;
	workspaceFingerprint: string;
	settingsFingerprint: string;
	result: IRCalendarQueryResult;
}

const IR_CALENDAR_DISK_CACHE_VERSION = "1.1.0";

type SerializedScheduleItem = Omit<ScheduleItem, "nextReviewDate"> & {
	nextReviewDate: string | null;
};

type SerializedPlannedScheduleItem = Omit<IRPlannedScheduleItem, "nextReviewDate"> & {
	nextReviewDate: string | null;
};

type SerializedPlannedDay = Omit<IRPlannedDay, "items"> & {
	items: SerializedPlannedScheduleItem[];
};

interface SerializedPlannedSchedule {
	generatedAt: number;
	version: number;
	deckIds: string[];
	triggerReason?: ScheduleRecomputeReason;
	days: SerializedPlannedDay[];
}

interface SerializedIRCalendarQueryResult {
	materialsByDate: Array<[string, SerializedScheduleItem[]]>;
	continueReadingSuspendedItemsPool: SerializedScheduleItem[];
	schedule: SerializedPlannedSchedule;
	scope: Omit<IRCalendarQueryScope, "stateKey">;
}

interface IRCalendarDiskCacheEntry {
	workspaceFingerprint: string;
	settingsFingerprint: string;
	savedAt: string;
	result: SerializedIRCalendarQueryResult;
}

interface IRCalendarDiskCacheStore {
	version: string;
	lastUpdated: string;
	entries: Record<string, IRCalendarDiskCacheEntry>;
}

export class IRCalendarQueryService {
	private readonly queryCache = new Map<string, IRCalendarQueryCacheEntry>();
	private readonly inflightQueries = new Map<string, Promise<IRCalendarQueryResult>>();
	private epubStorageService: EpubStorageService | null = null;
	private diskCacheStore: IRCalendarDiskCacheStore | null = null;
	private diskCacheLoaded = false;
	private inflightDiskCacheLoad: Promise<IRCalendarDiskCacheStore> | null = null;
	private inflightDiskCacheWrite: Promise<void> | null = null;

	constructor(private readonly app: App) {}

	invalidate(): void {
		this.queryCache.clear();
		this.inflightQueries.clear();
	}

	async getCalendarQueryResult(options: IRCalendarQueryOptions = {}): Promise<IRCalendarQueryResult> {
		const workspaceData = await getSharedIRWorkspaceSnapshotService(this.app).getWorkspaceData();
		const queryScope = this.buildQueryScope(workspaceData, options);
		const workspaceFingerprint = this.buildWorkspaceFingerprint(workspaceData);
		const settingsFingerprint = this.buildSettingsFingerprint();
		const cacheKey = queryScope.cacheKey;
		const cached = !options.forceRecompute ? this.queryCache.get(cacheKey) : null;
		if (
			cached &&
			cached.workspaceFingerprint === workspaceFingerprint &&
			cached.settingsFingerprint === settingsFingerprint
		) {
			const readingMaterials = await this.getReadingMaterials();
			const runtimeResult = this.attachRuntimeContext(
				cached.result,
				workspaceData,
				readingMaterials,
				queryScope
			);
			cached.result = runtimeResult;
			cached.stateKey = runtimeResult.scope.stateKey;
			return runtimeResult;
		}

		if (!options.forceRecompute) {
			const diskEntry = await this.readDiskCacheEntry(cacheKey);
			if (
				diskEntry &&
				diskEntry.workspaceFingerprint === workspaceFingerprint &&
				diskEntry.settingsFingerprint === settingsFingerprint
			) {
				const readingMaterials = await this.getReadingMaterials();
				const hydratedResult = this.attachRuntimeContext(
					this.hydrateDiskCacheResult(workspaceData, diskEntry.result),
					workspaceData,
					readingMaterials,
					queryScope
				);
				this.queryCache.set(cacheKey, {
					stateKey: hydratedResult.scope.stateKey,
					workspaceFingerprint,
					settingsFingerprint,
					result: hydratedResult,
				});
				logger.debug("[IRCalendarQueryService] disk cache hit", {
					deckIds: queryScope.deckIds,
					horizonDays: queryScope.horizonDays,
					generatedAt: hydratedResult.schedule.generatedAt,
				});
				return hydratedResult;
			}
		}

		const inflightKey = `${cacheKey}::${workspaceFingerprint}::${settingsFingerprint}::${options.forceRecompute ? "force" : "normal"}`;
		const inflight = this.inflightQueries.get(inflightKey);
		if (inflight) {
			return inflight;
		}

		const queryPromise = (async () => {
			const readingMaterials = await this.getReadingMaterials();
			const schedule = await this.getSchedule(options, queryScope);
			const result = await this.buildCalendarQueryResult(
				workspaceData,
				schedule,
				readingMaterials,
				options,
				{
					...queryScope,
					stateKey: this.buildStateKey(workspaceData, schedule),
				}
			);
			this.queryCache.set(cacheKey, {
				stateKey: result.scope.stateKey,
				workspaceFingerprint,
				settingsFingerprint,
				result,
			});
			await this.persistDiskCacheEntry(cacheKey, {
				workspaceFingerprint,
				settingsFingerprint,
				savedAt: new Date().toISOString(),
				result: this.serializeQueryResult(result),
			});
			return result;
		})();
		this.inflightQueries.set(inflightKey, queryPromise);
		try {
			return await queryPromise;
		} finally {
			if (this.inflightQueries.get(inflightKey) === queryPromise) {
				this.inflightQueries.delete(inflightKey);
			}
		}
	}

	private attachRuntimeContext(
		result: IRCalendarQueryResult,
		workspaceData: IRWorkspaceDataSnapshot,
		readingMaterials: ReadingMaterial[],
		scope: Pick<IRCalendarQueryScope, "deckIds" | "horizonDays" | "cacheKey">
	): IRCalendarQueryResult {
		const normalizedMaterialsByDate = new Map(
			Array.from(result.materialsByDate.entries(), ([dateKey, items]) => [
				dateKey,
				items.map((item) => this.normalizeScheduleItemDisplayName(item)),
			])
		);
		const normalizedSuspendedItems = result.continueReadingSuspendedItemsPool.map((item) =>
			this.normalizeScheduleItemDisplayName(item)
		);
		return {
			...result,
			workspaceData,
			readingMaterials,
			materialsByDate: normalizedMaterialsByDate,
			continueReadingSuspendedItemsPool: normalizedSuspendedItems,
			scope: {
				deckIds: scope.deckIds,
				horizonDays: scope.horizonDays,
				cacheKey: scope.cacheKey,
				stateKey: this.buildStateKey(workspaceData, result.schedule),
			},
		};
	}

	private async buildCalendarQueryResult(
		workspaceData: IRWorkspaceDataSnapshot,
		schedule: IRPlannedSchedule,
		readingMaterials: ReadingMaterial[],
		options: IRCalendarQueryOptions,
		scope: IRCalendarQueryScope
	): Promise<IRCalendarQueryResult> {
		const startedAt = Date.now();
		const projectedSummary = await getProjectedScheduleSummary(this.app, {
			schedule,
			deckIds: scope.deckIds,
			horizonDays: options.horizonDays,
			reason: options.reason,
			seedData: {
				decksRecord: workspaceData.decksRecord,
				blocksRecord: workspaceData.blocksRecord,
				history: workspaceData.history,
			},
		});
		const projectedDayLoadMap = buildProjectedDayLoadMap(projectedSummary);
		const materialsByDate = new Map<string, ScheduleItem[]>();
		for (const [dateKey, dayLoad] of projectedDayLoadMap.entries()) {
			materialsByDate.set(
				dateKey,
				dayLoad.items.map((item) => buildScheduleItemFromProjectedItem(item))
			);
		}

		const continueReadingSuspendedItemsPool = await this.buildContinueReadingSuspendedItemPool(
			workspaceData,
			scope
		);
		logger.debug("[IRCalendarQueryService] query ready", {
			deckIds: scope.deckIds,
			horizonDays: options.horizonDays,
			dates: materialsByDate.size,
			suspendedPool: continueReadingSuspendedItemsPool.length,
			generatedAt: schedule.generatedAt,
			durationMs: Date.now() - startedAt,
		});
		return {
			workspaceData,
			readingMaterials,
			materialsByDate,
			continueReadingSuspendedItemsPool,
			schedule,
			scope,
		};
	}

	private async getSchedule(
		options: IRCalendarQueryOptions,
		scope: Pick<IRCalendarQueryScope, "deckIds" | "horizonDays">
	): Promise<IRPlannedSchedule> {
		const kernel = getSharedIRScheduleKernel(this.app);
		const recomputeOptions: RecomputeOptions = {
			deckIds: scope.deckIds,
			horizonDays: scope.horizonDays,
		};
		if (options.forceRecompute) {
			return await kernel.recomputeScheduleForDeck(options.reason ?? "ui_refresh", recomputeOptions);
		}
		return (
			kernel.getCachedSchedule(recomputeOptions) ??
			(await kernel.recomputeScheduleForDeck(options.reason ?? "ui_refresh", recomputeOptions))
		);
	}

	private async getReadingMaterials(): Promise<ReadingMaterial[]> {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		if (!plugin?.readingMaterialManager) {
			return [];
		}
		try {
			return await Promise.resolve(plugin.readingMaterialManager.getAllMaterials());
		} catch (error) {
			logger.warn("[IRCalendarQueryService] 读取阅读材料失败", error);
			return [];
		}
	}

	private async buildContinueReadingSuspendedItemPool(
		workspaceData: IRWorkspaceDataSnapshot,
		scope: Pick<IRCalendarQueryScope, "deckIds">
	): Promise<ScheduleItem[]> {
		const items: ScheduleItem[] = [];
		const seenIds = new Set<string>();
		const matchesScope = (item: ScheduleItem): boolean => {
			if (scope.deckIds.length === 0) {
				return true;
			}
			const canonicalDeckId = this.resolveCanonicalDeckId(
				item.deckId,
				workspaceData
			);
			return canonicalDeckId ? scope.deckIds.includes(canonicalDeckId) : false;
		};
		const appendIfSuspended = (item: ScheduleItem | null | undefined): void => {
			if (
				!item ||
				!item.id ||
				seenIds.has(item.id) ||
				!this.isSuspendedContinueReadingStatus(item.scheduleStatus) ||
				!matchesScope(item)
			) {
				return;
			}
			seenIds.add(item.id);
			items.push(item);
		};

		for (const chunk of Object.values(workspaceData.chunksRecord)) {
			appendIfSuspended(buildScheduleItemFromChunkData(chunk));
		}

		for (const block of Object.values(workspaceData.blocksRecord)) {
			appendIfSuspended(buildScheduleItemFromLegacyBlock(block));
		}

		for (const task of workspaceData.pdfTasks) {
			appendIfSuspended(buildScheduleItemFromPdfTask(task));
		}

		const epubItems = await Promise.all(
			workspaceData.epubTasks.map(async (task) => {
				const resolvedFilePath = await this.resolveEpubTaskFilePath(task);
				return await buildScheduleItemFromEpubTask(task, { resolvedFilePath });
			})
		);
		for (const item of epubItems) {
			appendIfSuspended(item);
		}

		return items;
	}

	private isSuspendedContinueReadingStatus(status: string | undefined | null): boolean {
		const normalizedStatus = String(status || "").trim().toLowerCase();
		return normalizedStatus === "suspended" || normalizedStatus === "archived";
	}

	private async resolveEpubTaskFilePath(task: {
		sourceId?: string;
		epubFilePath?: string;
	}): Promise<string> {
		return (
			(await this.getEpubStorageService().resolveSourceFilePath(
				String(task?.sourceId || "").trim() || undefined,
				String(task?.epubFilePath || "").trim() || undefined
			)) || String(task?.epubFilePath || "").trim()
		);
	}

	private getEpubStorageService(): EpubStorageService {
		if (!this.epubStorageService) {
			this.epubStorageService = new EpubStorageService(this.app);
		}
		return this.epubStorageService;
	}

	private getDiskCachePath(): string {
		return getPluginPaths(this.app as any).cache.incrementalReading.irCalendarCache;
	}

	private createEmptyDiskCacheStore(): IRCalendarDiskCacheStore {
		return {
			version: IR_CALENDAR_DISK_CACHE_VERSION,
			lastUpdated: new Date(0).toISOString(),
			entries: {},
		};
	}

	private normalizeDiskCacheStore(raw: unknown): IRCalendarDiskCacheStore {
		if (!raw || typeof raw !== "object") {
			return this.createEmptyDiskCacheStore();
		}
		const candidate = raw as Partial<IRCalendarDiskCacheStore>;
		const version =
			typeof candidate.version === "string" && candidate.version.trim()
				? candidate.version.trim()
				: "";
		if (version !== IR_CALENDAR_DISK_CACHE_VERSION) {
			return this.createEmptyDiskCacheStore();
		}
		return {
			version,
			lastUpdated:
				typeof candidate.lastUpdated === "string" && candidate.lastUpdated.trim()
					? candidate.lastUpdated
					: new Date().toISOString(),
			entries:
				candidate.entries && typeof candidate.entries === "object"
					? (candidate.entries as Record<string, IRCalendarDiskCacheEntry>)
					: {},
		};
	}

	private async loadDiskCacheStore(): Promise<IRCalendarDiskCacheStore> {
		if (this.diskCacheStore) {
			return this.diskCacheStore;
		}
		if (this.inflightDiskCacheLoad) {
			return this.inflightDiskCacheLoad;
		}
		const loadPromise = (async () => {
			const adapter = this.app.vault.adapter;
			const cachePath = this.getDiskCachePath();
			try {
				if (!(await adapter.exists(cachePath))) {
					const emptyStore = this.createEmptyDiskCacheStore();
					this.diskCacheStore = emptyStore;
					this.diskCacheLoaded = true;
					return emptyStore;
				}
				const content = await adapter.read(cachePath);
				const store = this.normalizeDiskCacheStore(JSON.parse(content));
				this.diskCacheStore = store;
				this.diskCacheLoaded = true;
				return store;
			} catch (error) {
				logger.warn("[IRCalendarQueryService] 读取日历磁盘缓存失败", error);
				const emptyStore = this.createEmptyDiskCacheStore();
				this.diskCacheStore = emptyStore;
				this.diskCacheLoaded = true;
				return emptyStore;
			}
		})();
		this.inflightDiskCacheLoad = loadPromise;
		try {
			return await loadPromise;
		} finally {
			if (this.inflightDiskCacheLoad === loadPromise) {
				this.inflightDiskCacheLoad = null;
			}
		}
	}

	private async readDiskCacheEntry(cacheKey: string): Promise<IRCalendarDiskCacheEntry | null> {
		const store = this.diskCacheLoaded ? this.diskCacheStore || this.createEmptyDiskCacheStore() : await this.loadDiskCacheStore();
		return store.entries[cacheKey] || null;
	}

	private async persistDiskCacheEntry(cacheKey: string, entry: IRCalendarDiskCacheEntry): Promise<void> {
		try {
			const store = this.diskCacheLoaded ? this.diskCacheStore || this.createEmptyDiskCacheStore() : await this.loadDiskCacheStore();
			const nextStore: IRCalendarDiskCacheStore = {
				...store,
				version: IR_CALENDAR_DISK_CACHE_VERSION,
				lastUpdated: new Date().toISOString(),
				entries: {
					...store.entries,
					[cacheKey]: entry,
				},
			};
			const previousWrite = this.inflightDiskCacheWrite ?? Promise.resolve();
			const writePromise = previousWrite
				.catch(() => undefined)
				.then(async () => {
					await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, this.getDiskCachePath());
					await this.app.vault.adapter.write(this.getDiskCachePath(), JSON.stringify(nextStore));
					this.diskCacheStore = nextStore;
					this.diskCacheLoaded = true;
				});
			this.inflightDiskCacheWrite = writePromise;
			try {
				await writePromise;
			} finally {
				if (this.inflightDiskCacheWrite === writePromise) {
					this.inflightDiskCacheWrite = null;
				}
			}
		} catch (error) {
			logger.warn("[IRCalendarQueryService] 写入日历磁盘缓存失败", error);
		}
	}

	private serializeQueryResult(result: IRCalendarQueryResult): SerializedIRCalendarQueryResult {
		return {
			materialsByDate: Array.from(result.materialsByDate.entries(), ([dateKey, items]) => [
				dateKey,
				items.map((item) => this.serializeScheduleItem(item)),
			]),
			continueReadingSuspendedItemsPool: result.continueReadingSuspendedItemsPool.map((item) =>
				this.serializeScheduleItem(item)
			),
			schedule: this.serializePlannedSchedule(result.schedule),
			scope: {
				deckIds: [...result.scope.deckIds],
				horizonDays: result.scope.horizonDays,
				cacheKey: result.scope.cacheKey,
			},
		};
	}

	private hydrateDiskCacheResult(
		workspaceData: IRWorkspaceDataSnapshot,
		serialized: SerializedIRCalendarQueryResult
	): IRCalendarQueryResult {
		const schedule = this.hydratePlannedSchedule(serialized.schedule);
		return {
			workspaceData,
			readingMaterials: [],
			materialsByDate: new Map(
				(serialized.materialsByDate || []).map(([dateKey, items]) => [
					dateKey,
					(items || []).map((item) => this.hydrateScheduleItem(item)),
				])
			),
			continueReadingSuspendedItemsPool: (serialized.continueReadingSuspendedItemsPool || []).map((item) =>
				this.hydrateScheduleItem(item)
			),
			schedule,
			scope: {
				deckIds: [...(serialized.scope?.deckIds || [])],
				horizonDays: serialized.scope?.horizonDays,
				cacheKey: String(serialized.scope?.cacheKey || "").trim(),
				stateKey: this.buildStateKey(workspaceData, schedule),
			},
		};
	}

	private serializeScheduleItem(item: ScheduleItem): SerializedScheduleItem {
		return {
			...item,
			nextReviewDate: item.nextReviewDate ? item.nextReviewDate.toISOString() : null,
		};
	}

	private hydrateScheduleItem(item: SerializedScheduleItem): ScheduleItem {
		return this.normalizeScheduleItemDisplayName({
			...item,
			nextReviewDate: item.nextReviewDate ? new Date(item.nextReviewDate) : null,
		});
	}

	private normalizeScheduleItemDisplayName(item: ScheduleItem): ScheduleItem {
		if (item.sourceType !== "pdf" && item.sourceType !== "epub") {
			return item;
		}

		const title = String(item.title || "").trim();
		if (!title) {
			return item;
		}

		const normalizedDisplayName = extractReadingPointDisplayName(title);
		if (!normalizedDisplayName) {
			return item;
		}

		if (String(item.displayName || "").trim() === normalizedDisplayName) {
			return item;
		}

		return {
			...item,
			displayName: normalizedDisplayName,
		};
	}

	private serializePlannedSchedule(schedule: IRPlannedSchedule): SerializedPlannedSchedule {
		return {
			generatedAt: schedule.generatedAt,
			version: schedule.version,
			deckIds: [...schedule.deckIds],
			triggerReason: schedule.triggerReason,
			days: schedule.days.map((day) => ({
				...day,
				items: day.items.map((item) => ({
					...item,
					nextReviewDate: item.nextReviewDate ? item.nextReviewDate.toISOString() : null,
				})),
			})),
		};
	}

	private hydratePlannedSchedule(schedule: SerializedPlannedSchedule): IRPlannedSchedule {
		const days: IRPlannedDay[] = (schedule.days || []).map((day) => ({
			...day,
			items: (day.items || []).map((item) => ({
				...item,
				nextReviewDate: item.nextReviewDate ? new Date(item.nextReviewDate) : null,
			})),
		}));
		return {
			generatedAt: schedule.generatedAt,
			version: schedule.version,
			days,
			itemsByDate: new Map(days.map((day) => [day.dateKey, day.items])),
			deckIds: [...(schedule.deckIds || [])],
			triggerReason: schedule.triggerReason,
		};
	}

	private buildWorkspaceFingerprint(workspaceData: IRWorkspaceDataSnapshot): string {
		return this.hashStableValue({
			decksRecord: workspaceData.decksRecord,
			blocksRecord: workspaceData.blocksRecord,
			chunksRecord: workspaceData.chunksRecord,
			sourcesRecord: workspaceData.sourcesRecord,
			history: workspaceData.history,
			pdfTasks: workspaceData.pdfTasks,
			epubTasks: workspaceData.epubTasks,
		});
	}

	private buildSettingsFingerprint(): string {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		return this.hashStableValue(plugin?.settings?.incrementalReading ?? null);
	}

	private hashStableValue(value: unknown): string {
		return this.hashString(this.stableStringify(value));
	}

	private stableStringify(value: unknown): string {
		if (value === null || value === undefined) {
			return "null";
		}
		if (typeof value === "number") {
			return Number.isFinite(value) ? String(value) : "null";
		}
		if (typeof value === "boolean") {
			return value ? "true" : "false";
		}
		if (typeof value === "string") {
			return JSON.stringify(value);
		}
		if (Array.isArray(value)) {
			return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
		}
		if (value instanceof Date) {
			return JSON.stringify(value.toISOString());
		}
		if (typeof value === "object") {
			const record = value as Record<string, unknown>;
			return `{${Object.keys(record)
				.sort((left, right) => left.localeCompare(right))
				.map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
				.join(",")}}`;
		}
		return JSON.stringify(String(value));
	}

	private hashString(input: string): string {
		let hash = 2166136261;
		for (let index = 0; index < input.length; index += 1) {
			hash ^= input.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
	}

	private buildQueryScope(
		workspaceData: IRWorkspaceDataSnapshot,
		options: IRCalendarQueryOptions
	): IRCalendarQueryScope {
		const normalizedTargets = this.normalizeIdentifiers(options.deckIds || []);
		const canonicalByIdentifier = new Map<string, string>();
		const canonicalDeckIds: string[] = [];

		for (const deck of Object.values(workspaceData.decksRecord || {})) {
			const deckId = String(deck?.id || "").trim();
			const deckPath = String((deck as any)?.path || "").trim();
			const identifiers = this.normalizeIdentifiers([deckId, deckPath]);
			if (identifiers.length === 0) {
				continue;
			}
			for (const identifier of identifiers) {
				if (deckId) {
					canonicalByIdentifier.set(identifier, deckId);
				}
			}
		}

		for (const identifier of normalizedTargets) {
			const canonicalDeckId = canonicalByIdentifier.get(identifier) || identifier;
			if (!canonicalDeckIds.includes(canonicalDeckId)) {
				canonicalDeckIds.push(canonicalDeckId);
			}
		}

		const cacheKey = this.buildQueryCacheKey({
			deckIds: canonicalDeckIds,
			horizonDays: options.horizonDays,
		});

		return {
			deckIds: canonicalDeckIds,
			horizonDays: options.horizonDays,
			cacheKey,
			stateKey: "",
		};
	}

	private resolveCanonicalDeckId(
		deckIdentifier: string | null | undefined,
		workspaceData: IRWorkspaceDataSnapshot
	): string {
		const normalizedIdentifier = String(deckIdentifier || "").trim();
		if (!normalizedIdentifier) {
			return "";
		}

		for (const deck of Object.values(workspaceData.decksRecord || {})) {
			const deckId = String(deck?.id || "").trim();
			const deckPath = String((deck as any)?.path || "").trim();
			if (normalizedIdentifier === deckId || normalizedIdentifier === deckPath) {
				return deckId || normalizedIdentifier;
			}
		}

		return normalizedIdentifier;
	}

	private buildQueryCacheKey(options: Pick<IRCalendarQueryScope, "deckIds" | "horizonDays">): string {
		const normalizedDeckIds = this.normalizeIdentifiers(options.deckIds || []).sort((left, right) =>
			left.localeCompare(right)
		);
		const deckKey = normalizedDeckIds.length > 0 ? normalizedDeckIds.join("||") : "__all__";
		const horizonKey = Number.isFinite(options.horizonDays) ? String(options.horizonDays) : "__default__";
		return `${deckKey}::${horizonKey}`;
	}

	private buildStateKey(
		workspaceData: IRWorkspaceDataSnapshot,
		schedule: IRPlannedSchedule
	): string {
		return `${workspaceData.generatedAt}::${schedule.generatedAt}`;
	}

	private normalizeIdentifiers(values: Array<string | null | undefined>): string[] {
		return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
	}
}

const calendarQueryServiceByApp = new WeakMap<App, IRCalendarQueryService>();

export function getSharedIRCalendarQueryService(app: App): IRCalendarQueryService {
	let service = calendarQueryServiceByApp.get(app);
	if (!service) {
		service = new IRCalendarQueryService(app);
		calendarQueryServiceByApp.set(app, service);
	}
	return service;
}
