import type { App } from "obsidian";
import type { ReadingMaterial } from "../../types/incremental-reading-types";
import {
	DEFAULT_ADVANCED_SCHEDULE_SETTINGS,
	type IRAdvancedScheduleSettings,
	type IRChunkFileData,
	type IRDeck,
} from "../../types/ir-types";
import { getChunkTopicIds, getTaskTopicId } from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import {
	type IRAssociatedNoteSignalIndex,
	buildAssociatedNoteSignalIndex,
	getAssociatedNoteSignal,
	resolveAssociatedNotePath,
} from "./IRAssociatedNoteSignals";
import { type IRCognitiveProfile, IRCognitiveProfileService } from "./IRCognitiveProfileService";
import { IREpubBookmarkTaskService } from "./IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "./IRPdfBookmarkTaskService";
import { IRPlanGeneratorService } from "./IRPlanGeneratorService";
import { IRStorageService } from "./IRStorageService";

export type ScheduleRecomputeReason =
	| "complete_block"
	| "change_priority"
	| "manual_reschedule"
	| "postpone_block"
	| "suspend_block"
	| "archive_block"
	| "remove_block"
	| "import_materials"
	| "tag_group_changed"
	| "reading_point_tags_changed"
	| "metadata_changed"
	| "metadata_renamed"
	| "metadata_deleted"
	| "settings_changed"
	| "ui_refresh";

export interface RecomputeOptions {
	deckIds?: string[];
	horizonDays?: number;
}

export interface IRScheduleChangeSet {
	itemId: string;
	manualPriority?: number;
	effectivePriority?: number;
	nextRepDate?: number;
	intervalDays?: number;
	scheduleStatus?: string;
}

export interface IRScheduleExplanation {
	primaryReason: string;
	secondaryReasons: string[];
	manualPriority?: number;
	effectivePriority?: number;
	isOverdue: boolean;
	overdueDays: number;
	hasManualSchedule: boolean;
	estimatedMinutes: number;
	scoreBreakdown: IRCognitiveProfile;
	compositeScore: number;
}

export interface IRPlannedScheduleItem {
	id: string;
	title: string;
	displayName?: string;
	sourceFile: string;
	topicKey: string;
	associatedNotePath?: string;
	associatedNoteScope?: "point" | "material";
	linkedCardCount?: number;
	linkedCardPrioritySignal?: number;
	resumeLink?: string;
	priority: number;
	intervalDays: number;
	scheduleStatus: string;
	nextRepDate: number;
	nextReviewDate: Date | null;
	estimatedMinutes: number;
	deckId?: string;
	sourceType: "chunk" | "pdf" | "epub";
	explanation: IRScheduleExplanation;
}

export interface IRPlannedDay {
	dateKey: string;
	items: IRPlannedScheduleItem[];
	totalEstimatedMinutes: number;
	overloadLevel: "normal" | "warning" | "overloaded";
}

export interface IRPlannedSchedule {
	generatedAt: number;
	version: number;
	days: IRPlannedDay[];
	itemsByDate: Map<string, IRPlannedScheduleItem[]>;
	deckIds: string[];
	triggerReason?: ScheduleRecomputeReason;
}

export interface IRScheduleImpactPreview {
	before: IRPlannedSchedule;
	after: IRPlannedSchedule;
	changedItemId: string;
	beforeItem?: IRPlannedScheduleItem;
	afterItem?: IRPlannedScheduleItem;
}

function formatDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function estimateMinutesFromStats(stats?: {
	impressions?: number;
	effectiveReadingTimeSec?: number;
}): number {
	const impressions = stats?.impressions ?? 0;
	const effectiveReadingTimeSec = stats?.effectiveReadingTimeSec ?? 0;
	if (impressions > 0 && effectiveReadingTimeSec > 0) {
		return Math.max(0.5, effectiveReadingTimeSec / impressions / 60);
	}
	return 2;
}

function extractChunkTitle(filePath: string, fallback: string): string {
	const base = filePath?.split("/").pop() || fallback;
	return base.replace(/\.md$/i, "").replace(/^\d+_/, "");
}

function extractPdfHeading(fullTitle: string): string {
	const sep = " / ";
	const idx = fullTitle.indexOf(sep);
	if (idx >= 0) {
		return fullTitle.slice(idx + sep.length).trim() || fullTitle;
	}
	return fullTitle;
}

function buildExplanation(input: {
	scheduleStatus: string;
	nextRepDate: number;
	estimatedMinutes: number;
	manualPriority?: number;
	effectivePriority?: number;
	intervalDays?: number;
	stats?: { impressions?: number };
	nowMs: number;
}): IRScheduleExplanation {
	const scoreBreakdown = new IRCognitiveProfileService().computeProfile(input);
	const overdueDays =
		input.nextRepDate > 0 && input.nextRepDate < input.nowMs
			? Math.max(1, Math.floor((input.nowMs - input.nextRepDate) / (24 * 60 * 60 * 1000)))
			: 0;
	const isOverdue = overdueDays > 0;
	const hasManualSchedule = input.nextRepDate > 0;

	let primaryReason = "按当前间隔进入计划";
	if (isOverdue) {
		primaryReason = `已逾期 ${overdueDays} 天，优先回到计划`;
	} else if ((input.manualPriority ?? 0) >= 8) {
		primaryReason = "手动高优先级推动到前列";
	} else if (input.scheduleStatus === "new") {
		primaryReason = "新项目已进入待处理队列";
	} else if (!hasManualSchedule) {
		primaryReason = "尚未形成稳定排期，按今日待处理处理";
	}

	const secondaryReasons: string[] = [];
	if ((input.manualPriority ?? 0) > 0) {
		secondaryReasons.push(`手动优先级 P${input.manualPriority}`);
	}
	if ((input.effectivePriority ?? 0) > 0 && input.effectivePriority !== input.manualPriority) {
		secondaryReasons.push(`有效优先级 ${(input.effectivePriority ?? 0).toFixed(1)}`);
	}
	secondaryReasons.push(`预计耗时 ${input.estimatedMinutes.toFixed(1)} 分钟`);
	secondaryReasons.push(`状态 ${input.scheduleStatus}`);
	secondaryReasons.push(
		`重要性 ${scoreBreakdown.importanceScore.toFixed(
			1
		)} / 紧迫性 ${scoreBreakdown.urgencyScore.toFixed(
			1
		)} / 难度 ${scoreBreakdown.difficultyScore.toFixed(1)}`
	);
	if (hasManualSchedule) {
		secondaryReasons.push("已有明确复习日期");
	}

	return {
		primaryReason,
		secondaryReasons,
		manualPriority: input.manualPriority,
		effectivePriority: input.effectivePriority,
		isOverdue,
		overdueDays,
		hasManualSchedule,
		estimatedMinutes: input.estimatedMinutes,
		scoreBreakdown,
		compositeScore: scoreBreakdown.compositeScore,
	};
}

export class IRScheduleKernel {
	private app: App;
	private storage: IRStorageService;
	private pdfService: IRPdfBookmarkTaskService;
	private epubService: IREpubBookmarkTaskService;
	private profileService: IRCognitiveProfileService;
	private planGenerator: IRPlanGeneratorService;
	private scheduleCache = new Map<string, IRPlannedSchedule>();
	private inflightRecomputes = new Map<string, Promise<IRPlannedSchedule>>();

	constructor(app: App) {
		this.app = app;
		this.storage = new IRStorageService(app);
		this.pdfService = new IRPdfBookmarkTaskService(app);
		this.epubService = new IREpubBookmarkTaskService(app);
		this.profileService = new IRCognitiveProfileService();
		this.planGenerator = new IRPlanGeneratorService(this.profileService);
	}

	private resolveHorizonDays(options?: RecomputeOptions): number {
		return Math.max(1, Math.floor(options?.horizonDays ?? 7));
	}

	private buildScheduleCacheKey(options?: RecomputeOptions): string {
		const normalizedDeckIds = this.normalizeIdentifiers(options?.deckIds || []).sort((a, b) =>
			a.localeCompare(b)
		);
		const deckKey = normalizedDeckIds.length > 0 ? normalizedDeckIds.join("||") : "__all__";
		return `${deckKey}::${this.resolveHorizonDays(options)}`;
	}

	getCachedSchedule(options?: RecomputeOptions): IRPlannedSchedule | null {
		const cacheKey = this.buildScheduleCacheKey(options);
		return this.scheduleCache.get(cacheKey) || null;
	}

	private getPlanningSettingsSnapshot(): IRAdvancedScheduleSettings {
		const defaults = DEFAULT_ADVANCED_SCHEDULE_SETTINGS;

		try {
			const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
			const ir = plugin?.settings?.incrementalReading;
			return {
				...defaults,
				dailyTimeBudgetMinutes: ir?.dailyTimeBudgetMinutes ?? defaults.dailyTimeBudgetMinutes,
				interleaveMode: ir?.interleaveMode ?? defaults.interleaveMode,
				maxConsecutiveSameTopic:
					ir?.maxConsecutiveSameTopic ?? defaults.maxConsecutiveSameTopic,
			};
		} catch {
			return defaults;
		}
	}

	private resolveTopicKey(sourceFile: string, tagGroup?: string | null): string {
		const normalizedGroup = String(tagGroup || "").trim();
		if (normalizedGroup && normalizedGroup !== "default") {
			return `tag:${normalizedGroup}`;
		}
		return `source:${sourceFile}`;
	}

	private normalizeIdentifiers(values: string[]): string[] {
		return Array.from(
			new Set(
				(Array.isArray(values) ? values : [])
					.map((value) => String(value || "").trim())
					.filter(Boolean)
			)
		);
	}

	private buildDeckIdentifierContext(decks: IRDeck[], requestedDeckIds: string[]): {
		targetIdentifiers: Set<string>;
		canonicalDeckIds: string[];
		canonicalByIdentifier: Map<string, string>;
	} {
		const normalizedTargets = this.normalizeIdentifiers(requestedDeckIds);
		const targetIdentifiers = new Set<string>();
		const canonicalByIdentifier = new Map<string, string>();
		const canonicalDeckIds: string[] = [];

		for (const deck of decks) {
			const deckId = String(deck?.id || "").trim();
			const deckPath = String((deck as any)?.path || "").trim();
			const identifiers = this.normalizeIdentifiers([deckId, deckPath]);
			if (identifiers.length === 0) {
				continue;
			}

			const isTarget =
				normalizedTargets.length === 0 ||
				identifiers.some((identifier) => normalizedTargets.includes(identifier));
			if (!isTarget) {
				continue;
			}

			if (deckId && !canonicalDeckIds.includes(deckId)) {
				canonicalDeckIds.push(deckId);
			}

			for (const identifier of identifiers) {
				targetIdentifiers.add(identifier);
				if (deckId) {
					canonicalByIdentifier.set(identifier, deckId);
				}
			}
		}

		for (const identifier of normalizedTargets) {
			if (!targetIdentifiers.has(identifier)) {
				targetIdentifiers.add(identifier);
			}
			if (!canonicalByIdentifier.has(identifier)) {
				canonicalByIdentifier.set(identifier, identifier);
			}
			if (!canonicalDeckIds.includes(canonicalByIdentifier.get(identifier) || identifier)) {
				canonicalDeckIds.push(canonicalByIdentifier.get(identifier) || identifier);
			}
		}

		return {
			targetIdentifiers,
			canonicalDeckIds,
			canonicalByIdentifier,
		};
	}

	private resolveCanonicalDeckId(
		deckIdentifier: string | null | undefined,
		canonicalByIdentifier: Map<string, string>
	): string {
		const normalizedIdentifier = String(deckIdentifier || "").trim();
		if (!normalizedIdentifier) {
			return "";
		}

		return canonicalByIdentifier.get(normalizedIdentifier) || normalizedIdentifier;
	}

	async recomputeScheduleForDeck(
		reason: ScheduleRecomputeReason,
		options?: RecomputeOptions
	): Promise<IRPlannedSchedule> {
		const cacheKey = this.buildScheduleCacheKey(options);
		const inflight = this.inflightRecomputes.get(cacheKey);
		if (inflight) {
			return inflight;
		}

		const recomputePromise = this.recomputeScheduleForDeckInternal(reason, options, cacheKey);
		this.inflightRecomputes.set(cacheKey, recomputePromise);

		try {
			return await recomputePromise;
		} finally {
			if (this.inflightRecomputes.get(cacheKey) === recomputePromise) {
				this.inflightRecomputes.delete(cacheKey);
			}
		}
	}

	private async recomputeScheduleForDeckInternal(
		reason: ScheduleRecomputeReason,
		options: RecomputeOptions | undefined,
		cacheKey: string
	): Promise<IRPlannedSchedule> {
		await this.storage.initialize();
		await this.pdfService.initialize();
		await this.epubService.initialize();

		const decks = Object.values(await this.storage.getAllDecks());
		const requestedDeckIds = (
			options?.deckIds?.length ? options.deckIds : decks.map((deck) => deck.id)
		).filter(Boolean);
		const { targetIdentifiers, canonicalDeckIds, canonicalByIdentifier } =
			this.buildDeckIdentifierContext(decks, requestedDeckIds);

		const planningSettings = this.getPlanningSettingsSnapshot();
		const readingMaterials = await this.getReadingMaterials();
		const readingMaterialByPath = this.getReadingMaterialMap(readingMaterials);
		const associatedNoteSignalIndex = await this.getAssociatedNoteSignalIndex();
		const chunks = Object.values((await this.storage.getAllChunkDataWithSync()) || {});
		const pdfTasks = await this.pdfService.getAllTasks();
		const epubTasks = await this.epubService.getAllTasks();

		const candidates: IRPlannedScheduleItem[] = [];
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const nowMs = now.getTime();

		for (const chunk of chunks) {
			if (!this.belongsToTargetDecks(chunk, targetIdentifiers)) continue;
			const item = this.mapChunkToPlannedItem(
				chunk,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier
			);
			if (!item) continue;
			candidates.push(item);
		}

		for (const task of pdfTasks) {
			const taskDeckIdentifier = getTaskTopicId(task);
			if (!targetIdentifiers.has(String(taskDeckIdentifier || "").trim())) continue;
			const item = this.mapPdfTaskToPlannedItem(
				task,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier
			);
			if (!item) continue;
			candidates.push(item);
		}

		for (const task of epubTasks) {
			const taskDeckIdentifier = getTaskTopicId(task);
			if (!targetIdentifiers.has(String(taskDeckIdentifier || "").trim())) continue;
			const item = this.mapEpubTaskToPlannedItem(
				task,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier
			);
			if (!item) continue;
			candidates.push(item);
		}
		const horizonDays = this.resolveHorizonDays(options);
		const generated = this.planGenerator.generatePlan(candidates, {
			horizonDays,
			dailyBudgetMinutes: planningSettings.dailyTimeBudgetMinutes ?? 45,
			enableInterleaving: planningSettings.interleaveMode !== false,
			maxConsecutiveSameTopic: planningSettings.maxConsecutiveSameTopic ?? 3,
		});
		const schedule = this.buildPlannedScheduleFromMap(generated.itemsByDate, canonicalDeckIds, reason);
		this.scheduleCache.set(cacheKey, schedule);
		return schedule;
	}

	async previewScheduleImpact(
		changeSet: IRScheduleChangeSet,
		options?: RecomputeOptions
	): Promise<IRScheduleImpactPreview> {
		const before = await this.recomputeScheduleForDeck("ui_refresh", options);
		const flatItems = before.days
			.flatMap((day) => day.items)
			.map((item) => ({
				...item,
				explanation: {
					...item.explanation,
					scoreBreakdown: { ...item.explanation.scoreBreakdown },
				},
			}));
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const nowMs = now.getTime();
		let targetIndex = flatItems.findIndex((item) => item.id === changeSet.itemId);

		if (targetIndex < 0) {
			if (this.isInactiveScheduleStatus(changeSet.scheduleStatus)) {
				return {
					before,
					after: before,
					changedItemId: changeSet.itemId,
				};
			}

			const decks = Object.values(await this.storage.getAllDecks());
			const requestedDeckIds = options?.deckIds?.length ? options.deckIds : before.deckIds;
			const { canonicalByIdentifier } = this.buildDeckIdentifierContext(decks, requestedDeckIds);
			const readingMaterialByPath = this.getReadingMaterialMap(await this.getReadingMaterials());
			const associatedNoteSignalIndex = await this.getAssociatedNoteSignalIndex();
			const potentialItem = await this.loadPotentialPlannedItemById(
				changeSet.itemId,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier
			);

			if (potentialItem) {
				flatItems.push(potentialItem);
				targetIndex = flatItems.length - 1;
			}
		}

		if (targetIndex < 0) {
			return {
				before,
				after: before,
				changedItemId: changeSet.itemId,
			};
		}

		const target = flatItems[targetIndex];
		const manualPriority = changeSet.manualPriority ?? target.explanation.manualPriority;
		const effectivePriority =
			changeSet.effectivePriority ?? target.explanation.effectivePriority ?? target.priority;
		const nextRepDate = changeSet.nextRepDate ?? target.nextRepDate;
		const intervalDays = changeSet.intervalDays ?? target.intervalDays;
		const scheduleStatus = changeSet.scheduleStatus ?? target.scheduleStatus;

		target.priority = manualPriority ?? effectivePriority ?? target.priority;
		target.nextRepDate = nextRepDate;
		target.nextReviewDate = nextRepDate > 0 ? new Date(nextRepDate) : null;
		target.intervalDays = intervalDays;
		target.scheduleStatus = scheduleStatus;
		target.explanation = this.buildExplanation({
			scheduleStatus,
			nextRepDate,
			estimatedMinutes: target.estimatedMinutes,
			manualPriority,
			effectivePriority,
			memoryPrioritySignal:
				(target.linkedCardCount ?? 0) > 0 ? target.linkedCardPrioritySignal : undefined,
			intervalDays,
			linkedCardCount: target.linkedCardCount,
			nowMs,
		});

		const planningSettings = this.getPlanningSettingsSnapshot();
		const horizonDays = this.resolveHorizonDays(options);
		const generated = this.planGenerator.generatePlan(
			flatItems.filter((item) => !this.isInactiveScheduleStatus(item.scheduleStatus)),
			{
				horizonDays,
				dailyBudgetMinutes: planningSettings.dailyTimeBudgetMinutes ?? 45,
				enableInterleaving: planningSettings.interleaveMode !== false,
				maxConsecutiveSameTopic: planningSettings.maxConsecutiveSameTopic ?? 3,
			}
		);
		const after = this.buildPlannedScheduleFromMap(
			generated.itemsByDate,
			before.deckIds,
			"ui_refresh"
		);
		return {
			before,
			after,
			changedItemId: changeSet.itemId,
			beforeItem: before.days
				.flatMap((day) => day.items)
				.find((item) => item.id === changeSet.itemId),
			afterItem: after.days
				.flatMap((day) => day.items)
				.find((item) => item.id === changeSet.itemId),
		};
	}

	async getDecks(): Promise<IRDeck[]> {
		await this.storage.initialize();
		return Object.values(await this.storage.getAllDecks());
	}

	private async getReadingMaterials(): Promise<ReadingMaterial[]> {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		if (plugin?.readingMaterialManager) {
			try {
				return await plugin.readingMaterialManager.getAllMaterials();
			} catch (error) {
				logger.warn("[IRScheduleKernel] 读取阅读材料失败:", error);
			}
		}
		return [];
	}

	private getReadingMaterialMap(readingMaterials: ReadingMaterial[]): Map<string, ReadingMaterial> {
		return new Map(readingMaterials.map((material) => [material.filePath, material] as const));
	}

	private async getAssociatedNoteSignalIndex(): Promise<IRAssociatedNoteSignalIndex> {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		if (plugin?.dataStorage?.getAllCards) {
			try {
				const cards = await plugin.dataStorage.getAllCards();
				return buildAssociatedNoteSignalIndex(cards);
			} catch (error) {
				logger.warn("[IRScheduleKernel] 读取关联记忆卡片失败:", error);
			}
		}
		return new Map();
	}

	private getAssociatedNoteMeta(
		sourceFile: string,
		readingMaterialByPath: Map<string, ReadingMaterial>,
		associatedNoteSignalIndex: IRAssociatedNoteSignalIndex,
		explicitAssociatedNotePath?: string
	): Pick<
		IRPlannedScheduleItem,
		"associatedNotePath" | "associatedNoteScope" | "linkedCardCount" | "linkedCardPrioritySignal"
	> {
		const explicitPath = resolveAssociatedNotePath(
			explicitAssociatedNotePath
				? ({ associatedNotePath: explicitAssociatedNotePath } as Pick<
						ReadingMaterial,
						"associatedNotePath"
				  >)
				: null
		);
		const materialPath = resolveAssociatedNotePath(readingMaterialByPath.get(sourceFile));
		const associatedNotePath = explicitPath ?? materialPath;
		if (!associatedNotePath) {
			return {};
		}

		const signal = getAssociatedNoteSignal(associatedNoteSignalIndex, associatedNotePath);
		return {
			associatedNotePath,
			associatedNoteScope: explicitPath ? "point" : "material",
			linkedCardCount: signal?.cardCount ?? 0,
			linkedCardPrioritySignal: signal?.prioritySignal ?? 0,
		};
	}

	private belongsToTargetDecks(chunk: IRChunkFileData, targetIdentifiers: Set<string>): boolean {
		if (targetIdentifiers.size === 0) {
			return true;
		}

		if (getChunkTopicIds(chunk).some((deckId) => targetIdentifiers.has(deckId))) {
			return true;
		}

		return false;
	}

	private mapChunkToPlannedItem(
		chunk: IRChunkFileData,
		readingMaterialByPath: Map<string, ReadingMaterial>,
		associatedNoteSignalIndex: IRAssociatedNoteSignalIndex,
		nowMs: number,
		canonicalByIdentifier: Map<string, string>,
		includeInactive = false
	): IRPlannedScheduleItem | null {
		const scheduleStatus = String(chunk.scheduleStatus || "new");
		if (!includeInactive && this.isInactiveScheduleStatus(scheduleStatus)) {
			return null;
		}

		const nextRepDate = Number(chunk.nextRepDate || 0);
		const nextReviewDate = nextRepDate > 0 ? new Date(nextRepDate) : null;
		const filePath = String(chunk.filePath || "");
		const title = extractChunkTitle(filePath, chunk.chunkId);
		const material = readingMaterialByPath.get(filePath);
		const associationMeta = this.getAssociatedNoteMeta(
			filePath,
			readingMaterialByPath,
			associatedNoteSignalIndex,
			chunk.meta?.associatedNotePath
		);
		const estimatedMinutes = estimateMinutesFromStats(chunk.stats);
		const manualPriority = typeof chunk.priorityUi === "number" ? chunk.priorityUi : undefined;
		const effectivePriority = Number(chunk.priorityEff ?? chunk.priorityUi ?? 5);
		const memoryPrioritySignal =
			(associationMeta.linkedCardCount ?? 0) > 0
				? associationMeta.linkedCardPrioritySignal
				: undefined;

		return {
			id: chunk.chunkId,
			title,
			sourceFile: filePath,
			topicKey: this.resolveTopicKey(filePath, chunk.meta?.tagGroup),
			...associationMeta,
			resumeLink: material?.resumeLink,
			priority: (chunk.priorityUi as number | undefined) ?? chunk.priorityEff ?? 5,
			intervalDays: Number(chunk.intervalDays ?? 1),
			scheduleStatus,
			nextRepDate,
			nextReviewDate,
			estimatedMinutes,
			deckId: this.resolveCanonicalDeckId(getChunkTopicIds(chunk)[0], canonicalByIdentifier),
			sourceType: "chunk",
			explanation: this.buildExplanation({
				scheduleStatus,
				nextRepDate,
				estimatedMinutes,
				manualPriority,
				effectivePriority,
				memoryPrioritySignal,
				intervalDays: Number(chunk.intervalDays ?? 1),
				linkedCardCount: associationMeta.linkedCardCount,
				stats: chunk.stats,
				nowMs,
			}),
		};
	}

	private pushItem(
		itemsByDate: Map<string, IRPlannedScheduleItem[]>,
		item: IRPlannedScheduleItem,
		explicitDateKey?: string
	): void {
		const dateKey =
			explicitDateKey ??
			(item.nextReviewDate ? formatDateKey(item.nextReviewDate) : formatDateKey(new Date()));
		const current = itemsByDate.get(dateKey) || [];
		current.push(item);
		itemsByDate.set(dateKey, current);
	}

	private buildPlannedScheduleFromMap(
		itemsByDate: Map<string, IRPlannedScheduleItem[]>,
		deckIds: string[],
		reason: ScheduleRecomputeReason
	): IRPlannedSchedule {
		const days = Array.from(itemsByDate.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([dateKey, items]) => {
				const totalEstimatedMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
				return {
					dateKey,
					items,
					totalEstimatedMinutes,
					overloadLevel:
						totalEstimatedMinutes >= 60
							? "overloaded"
							: totalEstimatedMinutes >= 40
							? "warning"
							: "normal",
				} satisfies IRPlannedDay;
			});

		const normalizedItemsByDate = new Map<string, IRPlannedScheduleItem[]>();
		for (const day of days) {
			normalizedItemsByDate.set(day.dateKey, day.items);
		}

		return {
			generatedAt: Date.now(),
			version: 1,
			days,
			itemsByDate: normalizedItemsByDate,
			deckIds,
			triggerReason: reason,
		};
	}

	private buildExplanation(input: {
		scheduleStatus: string;
		nextRepDate: number;
		estimatedMinutes: number;
		manualPriority?: number;
		effectivePriority?: number;
		memoryPrioritySignal?: number;
		intervalDays?: number;
		linkedCardCount?: number;
		stats?: { impressions?: number };
		nowMs: number;
	}): IRScheduleExplanation {
		const scoreBreakdown = this.profileService.computeProfile(input);
		const overdueDays =
			input.nextRepDate > 0 && input.nextRepDate < input.nowMs
				? Math.max(1, Math.floor((input.nowMs - input.nextRepDate) / (24 * 60 * 60 * 1000)))
				: 0;
		const isOverdue = overdueDays > 0;
		const hasManualSchedule = input.nextRepDate > 0;

		let primaryReason = "按统一计划生成器进入未来计划";
		if (isOverdue) {
			primaryReason = `已逾期 ${overdueDays} 天，优先回到计划`;
		} else if ((input.manualPriority ?? 0) >= 8) {
			primaryReason = "手动高优先级推动到前列";
		} else if (input.scheduleStatus === "new") {
			primaryReason = "新项目已进入待处理队列";
		}

		const secondaryReasons: string[] = [];
		if ((input.manualPriority ?? 0) > 0)
			secondaryReasons.push(`手动优先级 P${input.manualPriority}`);
		if ((input.effectivePriority ?? 0) > 0 && input.effectivePriority !== input.manualPriority) {
			secondaryReasons.push(`有效优先级 ${(input.effectivePriority ?? 0).toFixed(1)}`);
		}
		if (typeof input.memoryPrioritySignal === "number") {
			secondaryReasons.push(
				`记忆卡信号 ${input.memoryPrioritySignal.toFixed(1)} / 10（${
					input.linkedCardCount ?? 0
				} 张卡片）`
			);
		}
		secondaryReasons.push(`预计耗时 ${input.estimatedMinutes.toFixed(1)} 分钟`);
		secondaryReasons.push(`状态 ${input.scheduleStatus}`);
		secondaryReasons.push(
			`重要性 ${scoreBreakdown.importanceScore.toFixed(
				1
			)} / 紧迫性 ${scoreBreakdown.urgencyScore.toFixed(
				1
			)} / 难度 ${scoreBreakdown.difficultyScore.toFixed(1)}`
		);
		if (hasManualSchedule) secondaryReasons.push("已有明确复习日期");

		return {
			primaryReason,
			secondaryReasons,
			manualPriority: input.manualPriority,
			effectivePriority: input.effectivePriority,
			isOverdue,
			overdueDays,
			hasManualSchedule,
			estimatedMinutes: input.estimatedMinutes,
			scoreBreakdown,
			compositeScore: scoreBreakdown.compositeScore,
		};
	}

	private mapPdfTaskToPlannedItem(
		task: any,
		readingMaterialByPath: Map<string, ReadingMaterial>,
		associatedNoteSignalIndex: IRAssociatedNoteSignalIndex,
		nowMs: number,
		canonicalByIdentifier: Map<string, string>,
		includeInactive = false
	): IRPlannedScheduleItem | null {
		const scheduleStatus = String(task.status || "new");
		if (!includeInactive && this.isInactiveScheduleStatus(scheduleStatus)) {
			return null;
		}

		const taskDeckIdentifier = getTaskTopicId(task);
		const nextRepDate = Number(task.nextRepDate || 0);
		const nextReviewDate = nextRepDate > 0 ? new Date(nextRepDate) : null;
		const manualPriority = Number(task.priorityUi ?? 0) || undefined;
		const effectivePriority = Number(task.priorityEff ?? task.priorityUi ?? 5);
		const estimatedMinutes = estimateMinutesFromStats(task.stats);
		const associationMeta = this.getAssociatedNoteMeta(
			task.pdfPath,
			readingMaterialByPath,
			associatedNoteSignalIndex,
			task.meta?.associatedNotePath
		);
		const memoryPrioritySignal =
			(associationMeta.linkedCardCount ?? 0) > 0
				? associationMeta.linkedCardPrioritySignal
				: undefined;

		return {
			id: task.id,
			title: String(task.title || "").trim() || "PDF 书签任务",
			displayName: extractPdfHeading(String(task.title || "").trim() || "PDF 书签任务"),
			sourceFile: task.pdfPath,
			topicKey: this.resolveTopicKey(task.pdfPath, task.meta?.tagGroup),
			...associationMeta,
			resumeLink: task.link,
			priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
			intervalDays: Number(task.intervalDays ?? 1),
			scheduleStatus,
			nextRepDate,
			nextReviewDate,
			estimatedMinutes,
			deckId: this.resolveCanonicalDeckId(taskDeckIdentifier, canonicalByIdentifier),
			sourceType: "pdf",
			explanation: this.buildExplanation({
				scheduleStatus,
				nextRepDate,
				estimatedMinutes,
				manualPriority,
				effectivePriority,
				memoryPrioritySignal,
				intervalDays: Number(task.intervalDays ?? 1),
				linkedCardCount: associationMeta.linkedCardCount,
				stats: task.stats,
				nowMs,
			}),
		};
	}

	private mapEpubTaskToPlannedItem(
		task: any,
		readingMaterialByPath: Map<string, ReadingMaterial>,
		associatedNoteSignalIndex: IRAssociatedNoteSignalIndex,
		nowMs: number,
		canonicalByIdentifier: Map<string, string>,
		includeInactive = false
	): IRPlannedScheduleItem | null {
		const scheduleStatus = String(task.status || "new");
		if (!includeInactive && this.isInactiveScheduleStatus(scheduleStatus)) {
			return null;
		}

		const taskDeckIdentifier = getTaskTopicId(task);
		const nextRepDate = Number(task.nextRepDate || 0);
		const nextReviewDate = nextRepDate > 0 ? new Date(nextRepDate) : null;
		const manualPriority = Number(task.priorityUi ?? 0) || undefined;
		const effectivePriority = Number(task.priorityEff ?? task.priorityUi ?? 5);
		const estimatedMinutes = estimateMinutesFromStats(task.stats);
		const associationMeta = this.getAssociatedNoteMeta(
			task.epubFilePath,
			readingMaterialByPath,
			associatedNoteSignalIndex,
			task.meta?.associatedNotePath
		);
		const memoryPrioritySignal =
			(associationMeta.linkedCardCount ?? 0) > 0
				? associationMeta.linkedCardPrioritySignal
				: undefined;

		return {
			id: task.id,
			title: String(task.title || "").trim() || "EPUB",
			sourceFile: task.epubFilePath,
			topicKey: this.resolveTopicKey(task.epubFilePath, task.meta?.tagGroup),
			...associationMeta,
			priority: Number(task.priorityUi ?? task.priorityEff ?? 5),
			intervalDays: Number(task.intervalDays ?? 1),
			scheduleStatus,
			nextRepDate,
			nextReviewDate,
			estimatedMinutes,
			deckId: this.resolveCanonicalDeckId(taskDeckIdentifier, canonicalByIdentifier),
			sourceType: "epub",
			explanation: this.buildExplanation({
				scheduleStatus,
				nextRepDate,
				estimatedMinutes,
				manualPriority,
				effectivePriority,
				memoryPrioritySignal,
				intervalDays: Number(task.intervalDays ?? 1),
				linkedCardCount: associationMeta.linkedCardCount,
				stats: task.stats,
				nowMs,
			}),
		};
	}

	private async loadPotentialPlannedItemById(
		itemId: string,
		readingMaterialByPath: Map<string, ReadingMaterial>,
		associatedNoteSignalIndex: IRAssociatedNoteSignalIndex,
		nowMs: number,
		canonicalByIdentifier: Map<string, string>
	): Promise<IRPlannedScheduleItem | null> {
		const chunks = (await this.storage.getAllChunkDataWithSync()) || {};
		const chunk =
			(chunks[itemId] as IRChunkFileData | undefined) ||
			(Object.values(chunks).find((entry) => entry?.chunkId === itemId) as IRChunkFileData | undefined);
		if (chunk) {
			return this.mapChunkToPlannedItem(
				chunk,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier,
				true
			);
		}

		const pdfTask = (await this.pdfService.getAllTasks()).find((task) => task.id === itemId);
		if (pdfTask) {
			return this.mapPdfTaskToPlannedItem(
				pdfTask,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier,
				true
			);
		}

		const epubTask = (await this.epubService.getAllTasks()).find((task) => task.id === itemId);
		if (epubTask) {
			return this.mapEpubTaskToPlannedItem(
				epubTask,
				readingMaterialByPath,
				associatedNoteSignalIndex,
				nowMs,
				canonicalByIdentifier,
				true
			);
		}

		return null;
	}

	private isInactiveScheduleStatus(status?: string): boolean {
		return status === "done" || status === "suspended" || status === "removed";
	}
}

export function createIRScheduleKernel(app: App): IRScheduleKernel {
	return new IRScheduleKernel(app);
}

const sharedScheduleKernelByApp = new WeakMap<App, IRScheduleKernel>();

export function getSharedIRScheduleKernel(app: App): IRScheduleKernel {
	let kernel = sharedScheduleKernelByApp.get(app);
	if (!kernel) {
		kernel = new IRScheduleKernel(app);
		sharedScheduleKernelByApp.set(app, kernel);
	}
	return kernel;
}
