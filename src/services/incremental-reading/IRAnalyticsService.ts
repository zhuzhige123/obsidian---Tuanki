import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import type { Card } from "../../data/types";
import type {
	IRBlock,
	IRBlockStats,
	IRChunkFileData,
	IRDeck,
	IRSession,
	IRStudySession,
	IRSourceFileMeta,
} from "../../types/ir-types";
import { migrateToIRBlockV4 } from "../../types/ir-types";
import type { ReadingMaterial } from "../../types/incremental-reading-types";
import { type IREpubBookmarkTask, IREpubBookmarkTaskService } from "./IREpubBookmarkTaskService";
import { resolveAssociatedNotePath, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import { getIRPriorityValue } from "./IRCardManagementAdapter";
import { IRMonitoringService } from "./IRMonitoringService";
import { type IRPdfBookmarkTask, IRPdfBookmarkTaskService } from "./IRPdfBookmarkTaskService";
import { IRStorageService } from "./IRStorageService";
import {
	buildProjectedDayLoadMap,
	getProjectedScheduleSummary,
	type IRProjectedScheduleSummary,
} from "./IRProjectedScheduleSummary";
import {
	buildIRTraceOverviewStats,
	collectTraceCardMatches,
	detectTraceSourceKind,
	normalizeTraceDocumentKey,
	normalizeTraceSubunitKey,
	type IRTraceSourceKind,
} from "./IRSourceTraceStats";

export type IRAnalyticsMode = "overall" | "topic" | "tag";
export type IRAnalyticsSourceKind = "topic" | "tag";

export interface IRAnalyticsSourceOption {
	key: string;
	label: string;
	subtitle: string;
	kind: IRAnalyticsSourceKind;
	itemCount: number;
	activeCount: number;
	dueCount: number;
	overdueCount: number;
	totalReadingHours: number;
	avgPriority: number;
}

export interface IRAnalyticsOverview {
	totalItems: number;
	activeItems: number;
	dueToday: number;
	overdueItems: number;
	totalReadingHours: number;
	avgPriority: number;
	cardsCreated: number;
	extracts: number;
	notesWritten: number;
	actionCardsCreated: number;
	actionExtracts: number;
	actionNotesWritten: number;
}

export interface IRAnalyticsActivityPoint {
	dateKey: string;
	label: string;
	createdCount: number;
	interactedCount: number;
	completedCount: number;
}

export interface IRAnalyticsQuantityPoint {
	dateKey: string;
	label: string;
	totalCount: number;
	activeCount: number;
	closedCount: number;
}

export type IRAnalyticsTimingBucketKey =
	| "overdue_7_plus"
	| "overdue_2_7"
	| "overdue_lt_2"
	| "due_today"
	| "next_1_3"
	| "next_4_7"
	| "next_8_14"
	| "next_15_30"
	| "next_30_plus"
	| "unscheduled";

export interface IRAnalyticsTimingBucket {
	key: IRAnalyticsTimingBucketKey;
	label: string;
	count: number;
}

export interface IRAnalyticsScatterPoint {
	label: string;
	x: number;
	y: number;
	size: number;
	itemCount: number;
	dueCount: number;
	overdueCount: number;
	readingHours: number;
	cardsCreated: number;
	extracts: number;
	notesWritten: number;
}

export interface IRAnalyticsForecastPoint {
	dateKey: string;
	label: string;
	itemCount: number;
	totalEstimatedMinutes: number;
	overloadLevel: "normal" | "warning" | "overloaded";
}

export interface IRLoadForecastSnapshot {
	days: number;
	dailyBudgetMinutes: number;
	forecast: IRAnalyticsForecastPoint[];
}

export interface IRStudySessionScatterPoint {
	value: [number, number, number];
	session: IRStudySession;
}

export interface IRStudySessionScatterSummary {
	totalSessions: number;
	totalHours: number;
	averageMinutes: number;
}

export interface IRStudySessionScatterSnapshot {
	minDurationSeconds: number;
	dateAxis: string[];
	weekdayAxis: string[];
	dateViewData: IRStudySessionScatterPoint[];
	weekdayViewData: IRStudySessionScatterPoint[];
	maxDurationMinutes: number;
	summary: IRStudySessionScatterSummary;
}

export interface IRActivityHeatmapDay {
	date: string;
	blocks: number;
	duration: number;
	level: number;
	isPlaceholder?: boolean;
}

export interface IRActivityHeatmapWeek {
	days: IRActivityHeatmapDay[];
}

export interface IRActivityHeatmapMonthLabel {
	name: string;
	position: number;
}

export interface IRActivityHeatmapSummary {
	totalBlocks: number;
	totalMinutes: number;
	totalDays: number;
	avgBlocksPerDay: number;
	currentStreak: number;
	maxStreak: number;
}

export interface IRActivityHeatmapSnapshot {
	weeks: IRActivityHeatmapWeek[];
	monthLabels: IRActivityHeatmapMonthLabel[];
	maxMinutes: number;
	summary: IRActivityHeatmapSummary;
}

export interface IRStudySessionSnapshot {
	sessions: IRStudySession[];
	scatter: IRStudySessionScatterSnapshot;
	heatmap: IRActivityHeatmapSnapshot;
}

export interface IRAnalyticsMonitoringSummary {
	dailyReadingMinutes: number;
	dailyScheduled: number;
	dailyCompleted: number;
	linkedOutcomeRate: number;
}

export interface IRAnalyticsSourceBreakdownChild {
	key: string;
	label: string;
	itemCount: number;
	activeCount: number;
	extracts: number;
	cardsCreated: number;
	notesWritten: number;
	isUnmapped?: boolean;
}

export interface IRAnalyticsSourceBreakdown {
	key: string;
	label: string;
	subtitle: string;
	sourceKind: IRTraceSourceKind;
	itemCount: number;
	activeCount: number;
	extracts: number;
	cardsCreated: number;
	notesWritten: number;
	children: IRAnalyticsSourceBreakdownChild[];
}

export interface IRAnalyticsSnapshot {
	scopeMode: IRAnalyticsMode;
	scopeKey: string | null;
	scopeLabel: string;
	sources: IRAnalyticsSourceOption[];
	sourceBreakdown: IRAnalyticsSourceBreakdown[];
	overview: IRAnalyticsOverview;
	activityTrend: IRAnalyticsActivityPoint[];
	quantityTrend: IRAnalyticsQuantityPoint[];
	timingBuckets: IRAnalyticsTimingBucket[];
	difficultyScatter: IRAnalyticsScatterPoint[];
	forecast: IRAnalyticsForecastPoint[];
	monitoringSummary: IRAnalyticsMonitoringSummary | null;
}

interface IRAnalyticsUnit {
	id: string;
	title: string;
	status: string;
	priorityUi: number;
	priorityEff: number;
	intervalDays: number;
	nextRepDate: number;
	createdAt: number;
	updatedAt: number;
	doneAt: number;
	lastInteractionAt: number;
	stats: IRBlockStats;
	topicKeys: string[];
	tagKeys: string[];
	tagLabels: string[];
	sourceKind: IRTraceSourceKind;
	sourceDocumentKey: string;
	sourceSubunitKey?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];
}

export interface IRAnalyticsSelectionUnit {
	id: string;
	status: string;
	nextRepDate: number;
	priorityUi: number;
	priorityEff: number;
	readingHours: number;
	topicKeys: string[];
	tagKeys: string[];
}

interface AnalyticsDatePoint {
	dateKey: string;
	label: string;
	startMs: number;
	endMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = new Set(["done", "suspended", "removed"]);
const STUDY_SESSION_MIN_DURATION_SECONDS = 60;
const HEATMAP_LOOKBACK_DAYS = 365;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export const IR_TIMING_BUCKET_LABELS: Record<IRAnalyticsTimingBucketKey, string> = {
	overdue_7_plus: "逾期 7 天以上",
	overdue_2_7: "逾期 2-7 天",
	overdue_lt_2: "逾期 2 天内",
	due_today: "今日到期",
	next_1_3: "1-3 天内",
	next_4_7: "4-7 天内",
	next_8_14: "8-14 天",
	next_15_30: "15-30 天",
	next_30_plus: "30 天以上",
	unscheduled: "未安排",
};

const TIMING_BUCKET_KEYS = [
	"overdue_7_plus",
	"overdue_2_7",
	"overdue_lt_2",
	"due_today",
	"next_1_3",
	"next_4_7",
	"next_8_14",
	"next_15_30",
	"next_30_plus",
	"unscheduled",
] as const satisfies readonly IRAnalyticsTimingBucketKey[];

function formatDateKeyFromMs(ms: number): string {
	const date = new Date(ms);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate()
	).padStart(2, "0")}`;
}

function formatDateKeyFromDate(date: Date): string {
	return formatDateKeyFromMs(date.getTime());
}

function buildRecentDatePoints(days: number): AnalyticsDatePoint[] {
	const safeDays = Math.max(1, days);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const points: AnalyticsDatePoint[] = [];

	for (let i = safeDays - 1; i >= 0; i--) {
		const start = today.getTime() - i * DAY_MS;
		const end = start + DAY_MS - 1;
		const date = new Date(start);
		points.push({
			dateKey: formatDateKeyFromMs(start),
			label: `${date.getMonth() + 1}/${date.getDate()}`,
			startMs: start,
			endMs: end,
		});
	}

	return points;
}

function buildUpcomingForecastPoints(days: number): IRAnalyticsForecastPoint[] {
	const safeDays = Math.max(1, days);
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const points: IRAnalyticsForecastPoint[] = [];

	for (let i = 0; i < safeDays; i++) {
		const current = new Date(start.getTime() + i * DAY_MS);
		const dateKey = formatDateKeyFromDate(current);
		points.push({
			dateKey,
			label: toShortDateLabel(dateKey),
			itemCount: 0,
			totalEstimatedMinutes: 0,
			overloadLevel: "normal",
		});
	}

	return points;
}

function getPathBaseName(path: string): string {
	const normalized = String(path || "").replace(/\\/g, "/");
	const base = normalized.split("/").pop() || normalized;
	return base || "Untitled";
}

function stripExtension(name: string): string {
	return String(name || "").replace(/\.[^.]+$/i, "");
}

function isClosedStatus(status: string): boolean {
	return CLOSED_STATUSES.has(String(status || "").toLowerCase());
}

function toCloseTimestamp(unit: Pick<IRAnalyticsUnit, "doneAt" | "updatedAt" | "status">): number {
	if (unit.doneAt > 0) return unit.doneAt;
	return isClosedStatus(unit.status) ? unit.updatedAt : 0;
}

function average(values: number[]): number {
	if (!values.length) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 1): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function truncateLabel(label: string, max: number): string {
	if (label.length <= max) return label;
	return `${label.slice(0, Math.max(1, max - 1))}…`;
}

function estimateReadingHours(stats: IRBlockStats): number {
	return (stats.totalReadingTimeSec || 0) / 3600;
}

function buildSessionSecondsByBlockId(sessions: IRSession[]): Map<string, number> {
	const totals = new Map<string, number>();
	for (const session of sessions || []) {
		const blockId = String(session?.blockId || "");
		const duration = Number(session?.duration || 0);
		if (!blockId || duration <= 0) continue;
		totals.set(blockId, (totals.get(blockId) || 0) + duration);
	}
	return totals;
}

function getReadingHoursForUnit(
	unit: Pick<IRAnalyticsUnit, "id" | "stats">,
	sessionSecondsByBlockId: Map<string, number>
): number {
	if (sessionSecondsByBlockId.has(unit.id)) {
		return (sessionSecondsByBlockId.get(unit.id) || 0) / 3600;
	}
	return estimateReadingHours(unit.stats);
}

function estimateEffectivePriority(unit: Pick<IRAnalyticsUnit, "priorityEff" | "priorityUi">): number {
	return Number.isFinite(unit.priorityEff) ? unit.priorityEff : unit.priorityUi;
}

export function calculateUrgencyScore(nextRepDate: number, nowMs = Date.now()): number {
	if (!Number.isFinite(nextRepDate) || nextRepDate <= 0) return 6.5;

	const today = new Date(nowMs);
	today.setHours(0, 0, 0, 0);
	const todayStart = today.getTime();
	const diffDays = (nextRepDate - todayStart) / DAY_MS;

	if (diffDays < 0) {
		return round(Math.min(10, 7 + Math.log2(1 + Math.abs(diffDays))), 1);
	}
	if (diffDays === 0) {
		return 7;
	}
	return round(Math.max(1, 7 - Math.log2(1 + diffDays) * 1.6), 1);
}

function calculateActionScore(unit: IRAnalyticsUnit, readingHours: number, nowMs = Date.now()): number {
	const activityWeight =
		1 +
		(unit.stats.cardsCreated || 0) * 0.15 +
		(unit.stats.extracts || 0) * 0.08 +
		(unit.stats.notesWritten || 0) * 0.06 +
		readingHours * 0.1;
	return estimateEffectivePriority(unit) * calculateUrgencyScore(unit.nextRepDate, nowMs) * activityWeight;
}

function normalizeSelectionKey(value: string): string {
	return String(value || "").trim().toLowerCase();
}

function normalizeIdentifiers(values: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(values.map((value) => normalizeSelectionKey(String(value || ""))).filter(Boolean))
	);
}

function getStudySessionDeckIdentifiers(session: Partial<IRStudySession> | null | undefined): string[] {
	return Array.from(
		new Set(
			[session?.topicId, session?.deckId]
				.map((value) => normalizeSelectionKey(String(value || "")))
				.filter(Boolean)
		)
	);
}

function isSystemAnalyticsTag(tagKey: string): boolean {
	const normalized = normalizeSelectionKey(tagKey);
	if (!normalized) return true;
	return /^#?ir([/_-]|$)/.test(normalized);
}

export function normalizeAnalyticsTags(tags: string[]): Array<{ key: string; label: string }> {
	const ordered = new Map<string, string>();
	for (const rawTag of tags || []) {
		const label = String(rawTag || "").trim();
		const key = normalizeSelectionKey(label);
		if (!key || isSystemAnalyticsTag(key) || ordered.has(key)) continue;
		ordered.set(key, label);
	}
	return Array.from(ordered.entries()).map(([key, label]) => ({ key, label }));
}

function createSelectionUnit(unit: IRAnalyticsUnit, readingHours: number): IRAnalyticsSelectionUnit {
	return {
		id: unit.id,
		status: unit.status,
		nextRepDate: unit.nextRepDate,
		priorityUi: unit.priorityUi,
		priorityEff: unit.priorityEff,
		readingHours,
		topicKeys: unit.topicKeys,
		tagKeys: unit.tagKeys,
	};
}

export function filterAnalyticsSelectionUnits(
	units: IRAnalyticsSelectionUnit[],
	mode: IRAnalyticsMode,
	selectionKey?: string
): IRAnalyticsSelectionUnit[] {
	if (mode === "overall") return units;
	const normalizedKey = normalizeSelectionKey(selectionKey || "");
	if (!normalizedKey) return [];
	if (mode === "topic") {
		return units.filter((unit) => unit.topicKeys.includes(normalizedKey));
	}
	return units.filter((unit) => unit.tagKeys.includes(normalizedKey));
}

export function buildAnalyticsSelectionOptions(
	units: IRAnalyticsSelectionUnit[],
	mode: Exclude<IRAnalyticsMode, "overall">,
	labelByKey: Map<string, string>
): IRAnalyticsSourceOption[] {
	const grouped = new Map<string, IRAnalyticsSelectionUnit[]>();
	for (const unit of units) {
		const keys = mode === "topic" ? unit.topicKeys : unit.tagKeys;
		for (const key of keys) {
			const current = grouped.get(key) || [];
			current.push(unit);
			grouped.set(key, current);
		}
	}

	const today = new Date();
	today.setHours(23, 59, 59, 999);
	const todayEnd = today.getTime();
	const todayStart = todayEnd - DAY_MS + 1;

	return Array.from(grouped.entries())
		.map(([key, items]) => {
			const activeItems = items.filter((item) => !isClosedStatus(item.status));
			const dueCount = activeItems.filter((item) => item.nextRepDate <= 0 || item.nextRepDate <= todayEnd).length;
			const overdueCount = activeItems.filter((item) => item.nextRepDate > 0 && item.nextRepDate < todayStart).length;
			return {
				key,
				label: labelByKey.get(key) || key,
				subtitle: mode === "topic" ? "专题" : `#${labelByKey.get(key) || key}`,
				kind: mode,
				itemCount: items.length,
				activeCount: activeItems.length,
				dueCount,
				overdueCount,
				totalReadingHours: round(items.reduce((sum, item) => sum + item.readingHours, 0), 1),
				avgPriority: round(average(items.map((item) => Number.isFinite(item.priorityEff) ? item.priorityEff : item.priorityUi)), 1),
			} satisfies IRAnalyticsSourceOption;
		})
		.filter((option) => option.itemCount > 0)
		.sort((a, b) => {
			if (mode === "tag") {
				if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
				if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
				return a.label.localeCompare(b.label, "zh-CN");
			}
			if (b.dueCount !== a.dueCount) return b.dueCount - a.dueCount;
			if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
			return a.label.localeCompare(b.label, "zh-CN");
		});
}

function toShortDateLabel(dateKey: string): string {
	const parts = String(dateKey || "").split("-");
	if (parts.length !== 3) return dateKey;
	return `${Number(parts[1])}/${Number(parts[2])}`;
}

export function buildAnalyticsForecastFromProjectedSummary(
	summary: IRProjectedScheduleSummary,
	filteredIdSet: Set<string>
): IRAnalyticsForecastPoint[] {
	const projectedDayLoadMap = buildProjectedDayLoadMap(summary);
	const overloadLevelByDate = new Map(
		summary.schedule.days.map((day) => [day.dateKey, day.overloadLevel] as const)
	);

	return summary.schedule.days.map((day) => {
		const dayLoad = projectedDayLoadMap.get(day.dateKey);
		const allItems = dayLoad?.items || [];
		const items =
			filteredIdSet.size > 0 ? allItems.filter((item) => filteredIdSet.has(item.id)) : allItems;

		return {
			dateKey: day.dateKey,
			label: toShortDateLabel(day.dateKey),
			itemCount: items.length,
			totalEstimatedMinutes: round(
				items.reduce((sum, item) => sum + Number(item.estimatedMinutes || 0), 0),
				1
			),
			overloadLevel:
				items.length === 0 ? "normal" : overloadLevelByDate.get(day.dateKey) || "normal",
		};
	});
}

export class IRAnalyticsService {
	private readonly storage: IRStorageService;
	private readonly pdfService: IRPdfBookmarkTaskService;
	private readonly epubService: IREpubBookmarkTaskService;
	private readonly monitoringService: IRMonitoringService;

	constructor(private readonly app: App) {
		this.storage = new IRStorageService(app);
		this.pdfService = new IRPdfBookmarkTaskService(app);
		this.epubService = new IREpubBookmarkTaskService(app);
		this.monitoringService = new IRMonitoringService(app.vault);
	}

	async initialize(): Promise<void> {
		await this.storage.initialize();
		await this.pdfService.initialize();
		await this.epubService.initialize();
		await this.monitoringService.load();
	}

	async getAvailableDecks(): Promise<IRDeck[]> {
		await this.initialize();
		return Object.values(await this.storage.getAllDecks());
	}

	async getLoadForecastSnapshot(options?: {
		deckIds?: string[];
		days?: number;
	}): Promise<IRLoadForecastSnapshot> {
		await this.initialize();

		const days = Math.max(1, Math.round(options?.days ?? 30));
		const dailyBudgetMinutes = this.getDailyReadingBudgetMinutes();
		const hasExplicitDeckFilter = Array.isArray(options?.deckIds);
		const normalizedDeckIds = normalizeIdentifiers(options?.deckIds || []);

		if (hasExplicitDeckFilter && normalizedDeckIds.length === 0) {
			return {
				days,
				dailyBudgetMinutes,
				forecast: buildUpcomingForecastPoints(days),
			};
		}

		const [decks, blocksMap, history] = await Promise.all([
			this.storage.getAllDecks(),
			this.storage.getAllBlocks(),
			this.storage.getHistory(),
		]);
		const projectedSummary = await getProjectedScheduleSummary(this.app, {
			deckIds: normalizedDeckIds.length > 0 ? normalizedDeckIds : undefined,
			horizonDays: days,
			seedData: {
				decksRecord: decks,
				blocksRecord: blocksMap,
				history,
			},
		});

		return {
			days,
			dailyBudgetMinutes,
			forecast: buildAnalyticsForecastFromProjectedSummary(projectedSummary, new Set()),
		};
	}

	async getStudySessionSnapshot(options?: {
		deckIds?: string[];
	}): Promise<IRStudySessionSnapshot> {
		await this.initialize();

		const sessions = await this.getFilteredStudySessions(options?.deckIds);
		return {
			sessions,
			scatter: this.buildStudySessionScatterSnapshot(sessions),
			heatmap: this.buildActivityHeatmapSnapshot(sessions),
		};
	}

	async getSnapshot(options?: {
		mode?: IRAnalyticsMode;
		selectionKey?: string;
		days?: number;
	}): Promise<IRAnalyticsSnapshot> {
		await this.initialize();

		const mode = options?.mode ?? "overall";
		const days = Math.max(7, options?.days ?? 30);
		const [
			sourcesMap,
			chunksMap,
			blocksMap,
			pdfTasks,
			epubTasks,
			history,
			decks,
			cards,
			readingMaterials,
		] = await Promise.all([
			this.storage.getAllSources(),
			this.storage.getAllChunkDataWithSync(),
			this.storage.getAllBlocks(),
			this.pdfService.getAllTasks(),
			this.epubService.getAllTasks(),
			this.storage.getHistory(),
			this.storage.getAllDecks(),
			this.getAllMemoryCards(),
			this.getAllReadingMaterials(),
		]);
		const projectedSummary = await getProjectedScheduleSummary(this.app, {
			horizonDays: days,
			seedData: {
				decksRecord: decks,
				blocksRecord: blocksMap,
				history,
			},
		});

		const topicLabelByKey = this.buildTopicLabelMap(decks);
		const materialByPath = this.buildReadingMaterialByPath(readingMaterials);
		const units = this.buildUnits({
			sourcesMap,
			legacyBlocks: Object.values(blocksMap || {}),
			chunks: Object.values(chunksMap || {}),
			pdfTasks,
			epubTasks,
			decksRecord: decks,
			materialByPath,
		});
		const extractCardIds = this.collectExtractCardIds(readingMaterials);

		const sessionSecondsByBlockId = buildSessionSecondsByBlockId(history.sessions || []);
		const selectionUnits = units.map((unit) => createSelectionUnit(unit, getReadingHoursForUnit(unit, sessionSecondsByBlockId)));
		const tagLabelByKey = this.buildTagLabelMap(units);
		const sources =
			mode === "overall"
				? []
				: buildAnalyticsSelectionOptions(selectionUnits, mode, mode === "topic" ? topicLabelByKey : tagLabelByKey);

		const normalizedSelectionKey = normalizeSelectionKey(options?.selectionKey || "");
		const resolvedSelectionKey =
			mode === "overall"
				? ""
				: sources.some((item) => item.key === normalizedSelectionKey)
					? normalizedSelectionKey
					: "";
		const filteredUnits = this.filterUnits(units, mode, resolvedSelectionKey);
		const filteredIdSet = new Set(filteredUnits.map((unit) => unit.id));

		return {
			scopeMode: mode,
			scopeKey: resolvedSelectionKey || null,
			scopeLabel: this.buildScopeLabel(mode, resolvedSelectionKey, topicLabelByKey, tagLabelByKey),
			sources,
			sourceBreakdown: this.buildSourceBreakdown(filteredUnits, cards, extractCardIds),
			overview: this.buildOverview(filteredUnits, sessionSecondsByBlockId, cards, extractCardIds),
			activityTrend: this.buildActivityTrend(filteredUnits, days),
			quantityTrend: this.buildQuantityTrend(filteredUnits, days),
			timingBuckets: this.buildTimingBuckets(filteredUnits),
			difficultyScatter: this.buildDifficultyScatter(filteredUnits, sessionSecondsByBlockId),
			forecast: buildAnalyticsForecastFromProjectedSummary(projectedSummary, filteredIdSet),
			monitoringSummary: mode === "overall" ? this.buildMonitoringSummary() : null,
		};
	}

	private buildTopicLabelMap(decks: Record<string, IRDeck>): Map<string, string> {
		const map = new Map<string, string>();
		for (const deck of Object.values(decks || {})) {
			const label = String(deck?.name || "").trim();
			const identifiers = [deck?.id, deck?.path].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
			for (const identifier of identifiers) {
				map.set(normalizeSelectionKey(identifier), label || identifier);
			}
		}
		return map;
	}

	private buildTagLabelMap(units: IRAnalyticsUnit[]): Map<string, string> {
		const map = new Map<string, string>();
		for (const unit of units) {
			unit.tagKeys.forEach((key, index) => {
				if (!map.has(key)) {
					map.set(key, unit.tagLabels[index] || key);
				}
			});
		}
		return map;
	}

	private buildUnits(input: {
		sourcesMap: Record<string, IRSourceFileMeta>;
		legacyBlocks: IRBlock[];
		chunks: IRChunkFileData[];
		pdfTasks: IRPdfBookmarkTask[];
		epubTasks: IREpubBookmarkTask[];
		decksRecord: Record<string, IRDeck>;
		materialByPath: Map<string, ReadingMaterial>;
	}): IRAnalyticsUnit[] {
		const units: IRAnalyticsUnit[] = [];

		for (const block of input.legacyBlocks) {
			const sourcePath = String(block.filePath || "").trim();
			const sourceKind = detectTraceSourceKind(sourcePath);
			const sourceDocumentKey = normalizeTraceDocumentKey(sourcePath, sourceKind);
			if (!sourceDocumentKey) {
				continue;
			}
			const material = input.materialByPath.get(normalizePath(sourcePath || ""));
			const sourceTitle = stripExtension(getPathBaseName(sourcePath));
			const normalizedTags = normalizeAnalyticsTags(block.tags || []);
			const migrated = migrateToIRBlockV4(block);
			const legacyBlock = block as IRBlock & {
				meta?: { associatedNotePaths?: string[] };
				associatedNotePaths?: string[];
			};
			const associatedNotePaths = resolveAssociatedNotePaths({
				associatedNotePath:
					resolveAssociatedNotePath(legacyBlock as any) ||
					resolveAssociatedNotePath((legacyBlock.meta || null) as any) ||
					resolveAssociatedNotePath(material as any),
				associatedNotePaths:
					legacyBlock.associatedNotePaths ||
					legacyBlock.meta?.associatedNotePaths ||
					material?.associatedNotePaths,
			});
			units.push({
				id: block.id,
				title: sourceTitle,
				status: String(migrated.status || block.state || "new"),
				priorityUi: getIRPriorityValue((block as any).priorityUi, (block as any).priorityEff, block.priority),
				priorityEff: getIRPriorityValue((block as any).priorityEff, (block as any).priorityUi, block.priority),
				intervalDays: Number(migrated.intervalDays || block.interval || 0),
				nextRepDate: Number(migrated.nextRepDate || 0),
				createdAt: Number(migrated.createdAt ?? 0),
				updatedAt: Number(migrated.updatedAt ?? 0),
				doneAt: 0,
				lastInteractionAt: Number(migrated.stats?.lastInteraction || 0),
				stats: { ...(migrated.stats || {}) },
				topicKeys: this.extractLegacyBlockTopicKeys(block, input.decksRecord),
				tagKeys: normalizedTags.map((tag) => tag.key),
				tagLabels: normalizedTags.map((tag) => tag.label),
				sourceKind,
				sourceDocumentKey,
				associatedNotePath: associatedNotePaths[0],
				associatedNotePaths,
			});
		}

		for (const chunk of input.chunks) {
			const sourceMeta = chunk.sourceId ? input.sourcesMap[chunk.sourceId] : undefined;
			const sourcePath = sourceMeta?.originalPath || chunk.filePath;
			const sourceKind = detectTraceSourceKind(sourcePath);
			const sourceDocumentKey = normalizeTraceDocumentKey(sourcePath, sourceKind);
			if (!sourceDocumentKey) {
				continue;
			}
			const material = input.materialByPath.get(normalizePath(sourcePath || ""));
			const sourceTitle = sourceMeta?.title || stripExtension(getPathBaseName(sourcePath));
			const topicKeys = this.extractChunkTopicKeys(chunk);
			const normalizedTags = normalizeAnalyticsTags((chunk as { tags?: string[] }).tags || []);
			const associatedNotePaths = resolveAssociatedNotePaths({
				associatedNotePath:
					resolveAssociatedNotePath((chunk.meta || null) as any) || resolveAssociatedNotePath(material as any),
				associatedNotePaths: (chunk.meta as { associatedNotePaths?: string[] } | null)?.associatedNotePaths || material?.associatedNotePaths,
			});
			units.push({
				id: chunk.chunkId,
				title: sourceTitle,
				status: String(chunk.scheduleStatus || "new"),
				priorityUi: Number(chunk.priorityUi ?? chunk.priorityEff ?? 5),
				priorityEff: Number(chunk.priorityEff ?? chunk.priorityUi ?? 5),
				intervalDays: Number(chunk.intervalDays ?? 0),
				nextRepDate: Number(chunk.nextRepDate ?? 0),
				createdAt: Number(chunk.createdAt ?? 0),
				updatedAt: Number(chunk.updatedAt ?? 0),
				doneAt: Number((chunk as { doneAt?: number }).doneAt ?? 0),
				lastInteractionAt: Number(chunk.stats?.lastInteraction || 0),
				stats: { ...(chunk.stats || {}) },
				topicKeys,
				tagKeys: normalizedTags.map((tag) => tag.key),
				tagLabels: normalizedTags.map((tag) => tag.label),
				sourceKind,
				sourceDocumentKey,
				associatedNotePath: associatedNotePaths[0],
				associatedNotePaths,
			});
		}

		for (const task of input.pdfTasks) {
			const normalizedTags = normalizeAnalyticsTags(task.tags || []);
			const sourceKind: IRTraceSourceKind = "pdf";
			const sourceDocumentKey = normalizeTraceDocumentKey(task.pdfPath, sourceKind);
			if (!sourceDocumentKey) {
				continue;
			}
			const associatedNotePaths = resolveAssociatedNotePaths({
				associatedNotePath: resolveAssociatedNotePath((task.meta || null) as any),
				associatedNotePaths: task.meta?.associatedNotePaths,
			});
			units.push({
				id: task.id,
				title: task.title || stripExtension(getPathBaseName(task.pdfPath)),
				status: String(task.status || "new"),
				priorityUi: Number(task.priorityUi ?? task.priorityEff ?? 5),
				priorityEff: Number(task.priorityEff ?? task.priorityUi ?? 5),
				intervalDays: Number(task.intervalDays ?? 0),
				nextRepDate: Number(task.nextRepDate ?? 0),
				createdAt: Number(task.createdAt ?? 0),
				updatedAt: Number(task.updatedAt ?? 0),
				doneAt: 0,
				lastInteractionAt: Number(task.stats?.lastInteraction || 0),
				stats: { ...(task.stats || {}) },
				topicKeys: this.extractTaskTopicKeys(task.deckId, task.topicId),
				tagKeys: normalizedTags.map((tag) => tag.key),
				tagLabels: normalizedTags.map((tag) => tag.label),
				sourceKind,
				sourceDocumentKey,
				sourceSubunitKey: normalizeTraceSubunitKey(task.link) || undefined,
				associatedNotePath: associatedNotePaths[0],
				associatedNotePaths,
			});
		}

		for (const task of input.epubTasks) {
			const normalizedTags = normalizeAnalyticsTags(task.tags || []);
			const sourceKind: IRTraceSourceKind = "epub";
			const sourceDocumentKey = normalizeTraceDocumentKey(task.epubFilePath, sourceKind);
			if (!sourceDocumentKey) {
				continue;
			}
			const associatedNotePaths = resolveAssociatedNotePaths({
				associatedNotePath: resolveAssociatedNotePath((task.meta || null) as any),
				associatedNotePaths: task.meta?.associatedNotePaths,
			});
			units.push({
				id: task.id,
				title: task.title || stripExtension(getPathBaseName(task.epubFilePath)),
				status: String(task.status || "new"),
				priorityUi: Number(task.priorityUi ?? task.priorityEff ?? 5),
				priorityEff: Number(task.priorityEff ?? task.priorityUi ?? 5),
				intervalDays: Number(task.intervalDays ?? 0),
				nextRepDate: Number(task.nextRepDate ?? 0),
				createdAt: Number(task.createdAt ?? 0),
				updatedAt: Number(task.updatedAt ?? 0),
				doneAt: 0,
				lastInteractionAt: Number(task.stats?.lastInteraction || 0),
				stats: { ...(task.stats || {}) },
				topicKeys: this.extractTaskTopicKeys(task.deckId, task.topicId),
				tagKeys: normalizedTags.map((tag) => tag.key),
				tagLabels: normalizedTags.map((tag) => tag.label),
				sourceKind,
				sourceDocumentKey,
				sourceSubunitKey: normalizeTraceSubunitKey(task.tocHref || task.id) || undefined,
				associatedNotePath: associatedNotePaths[0],
				associatedNotePaths,
			});
		}

		return units;
	}

	private extractChunkTopicKeys(chunk: IRChunkFileData): string[] {
		const keys = new Set<string>();
		const rawKeys = [
			...((chunk.topicIds || []) as string[]),
			...((chunk.deckIds || []) as string[]),
		];
		for (const rawKey of rawKeys) {
			const key = normalizeSelectionKey(rawKey);
			if (key) keys.add(key);
		}
		return Array.from(keys);
	}

	private extractTaskTopicKeys(deckId?: string, topicId?: string): string[] {
		const keys = new Set<string>();
		for (const rawKey of [topicId, deckId]) {
			const key = normalizeSelectionKey(rawKey || "");
			if (key) keys.add(key);
		}
		return Array.from(keys);
	}

	private extractLegacyBlockTopicKeys(block: IRBlock, decksRecord: Record<string, IRDeck>): string[] {
		const keys = new Set<string>();
		const normalizedDeckPath = normalizeSelectionKey(String((block as any).deckPath || ""));
		if (normalizedDeckPath) {
			keys.add(normalizedDeckPath);
		}

		for (const deck of Object.values(decksRecord || {})) {
			const identifiers = [deck?.id, deck?.path].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
			const matchesBlockId = Array.isArray(deck?.blockIds) && deck.blockIds.includes(block.id);
			const matchesDeckPath = normalizedDeckPath !== "" && identifiers.includes(normalizedDeckPath);
			if (!matchesBlockId && !matchesDeckPath) {
				continue;
			}
			for (const identifier of identifiers) {
				keys.add(identifier);
			}
		}

		return Array.from(keys);
	}

	private filterUnits(units: IRAnalyticsUnit[], mode: IRAnalyticsMode, selectionKey?: string): IRAnalyticsUnit[] {
		if (mode === "overall") return units;
		const normalizedKey = normalizeSelectionKey(selectionKey || "");
		if (!normalizedKey) return [];
		if (mode === "topic") {
			return units.filter((unit) => unit.topicKeys.includes(normalizedKey));
		}
		return units.filter((unit) => unit.tagKeys.includes(normalizedKey));
	}

	private buildScopeLabel(
		mode: IRAnalyticsMode,
		selectionKey: string,
		topicLabelByKey: Map<string, string>,
		tagLabelByKey: Map<string, string>
	): string {
		if (mode === "overall") return "总体增量阅读";
		if (!selectionKey) return mode === "topic" ? "专题" : "标签";
		if (mode === "topic") return `专题：${topicLabelByKey.get(selectionKey) || selectionKey}`;
		return `标签：#${tagLabelByKey.get(selectionKey) || selectionKey}`;
	}

	private buildOverview(
		units: IRAnalyticsUnit[],
		sessionSecondsByBlockId: Map<string, number>,
		cards: Card[],
		extractCardIds: Set<string>
	): IRAnalyticsOverview {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStart = today.getTime();
		const todayEnd = todayStart + DAY_MS - 1;
		const activeUnits = units.filter((unit) => !isClosedStatus(unit.status));
		const tracedStats = buildIRTraceOverviewStats({
			units: units.map((unit) => ({
				sourceKind: unit.sourceKind,
				sourceDocumentKey: unit.sourceDocumentKey,
				sourceSubunitKey: unit.sourceSubunitKey,
				associatedNotePath: unit.associatedNotePath,
				associatedNotePaths: unit.associatedNotePaths,
			})),
			cards,
			extractCardIds,
		});
		const actionCardsCreated = units.reduce((sum, unit) => sum + (unit.stats.cardsCreated || 0), 0);
		const actionExtracts = units.reduce((sum, unit) => sum + (unit.stats.extracts || 0), 0);
		const actionNotesWritten = units.reduce((sum, unit) => sum + (unit.stats.notesWritten || 0), 0);

		return {
			totalItems: units.length,
			activeItems: activeUnits.length,
			dueToday: activeUnits.filter((unit) => unit.nextRepDate <= 0 || unit.nextRepDate <= todayEnd).length,
			overdueItems: activeUnits.filter((unit) => unit.nextRepDate > 0 && unit.nextRepDate < todayStart).length,
			totalReadingHours: round(units.reduce((sum, unit) => sum + getReadingHoursForUnit(unit, sessionSecondsByBlockId), 0), 1),
			avgPriority: round(average(units.map((unit) => estimateEffectivePriority(unit))), 1),
			cardsCreated: tracedStats.memoryCardCount,
			extracts: tracedStats.extractCount,
			notesWritten: tracedStats.noteCount,
			actionCardsCreated,
			actionExtracts,
			actionNotesWritten,
		};
	}

	private buildSourceBreakdown(
		units: IRAnalyticsUnit[],
		cards: Card[],
		extractCardIds: Set<string>
	): IRAnalyticsSourceBreakdown[] {
		if (!units.length) {
			return [];
		}

		const cardMatches = collectTraceCardMatches({ cards, extractCardIds });
		const matchesByDocument = new Map<string, typeof cardMatches>();
		for (const match of cardMatches) {
			const current = matchesByDocument.get(match.sourceDocumentKey) || [];
			current.push(match);
			matchesByDocument.set(match.sourceDocumentKey, current);
		}

		const unitGroups = new Map<string, IRAnalyticsUnit[]>();
		for (const unit of units) {
			const current = unitGroups.get(unit.sourceDocumentKey) || [];
			current.push(unit);
			unitGroups.set(unit.sourceDocumentKey, current);
		}

		return Array.from(unitGroups.entries())
			.map(([documentKey, documentUnits]) => {
				const firstUnit = documentUnits[0];
				const documentMatches = matchesByDocument.get(documentKey) || [];
				const docStats = this.summarizeCardMatches(documentMatches);
				const notesWritten = new Set(
					documentUnits.flatMap((unit) =>
						resolveAssociatedNotePaths({
							associatedNotePath: unit.associatedNotePath,
							associatedNotePaths: unit.associatedNotePaths,
						})
					)
				).size;
				const itemCount = documentUnits.length;
				const activeCount = documentUnits.filter((unit) => !isClosedStatus(unit.status)).length;
				const children = this.buildSourceBreakdownChildren(documentUnits, documentMatches);

				return {
					key: documentKey,
					label: firstUnit.title,
					subtitle: this.buildSourceBreakdownSubtitle(firstUnit.sourceKind, documentKey),
					sourceKind: firstUnit.sourceKind,
					itemCount,
					activeCount,
					extracts: docStats.extracts,
					cardsCreated: docStats.cardsCreated,
					notesWritten,
					children,
				} satisfies IRAnalyticsSourceBreakdown;
			})
			.sort((a, b) => {
				if (b.cardsCreated !== a.cardsCreated) return b.cardsCreated - a.cardsCreated;
				if (b.extracts !== a.extracts) return b.extracts - a.extracts;
				if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
				return a.label.localeCompare(b.label, "zh-CN");
			})
			.slice(0, 12);
	}

	private buildSourceBreakdownChildren(
		documentUnits: IRAnalyticsUnit[],
		documentMatches: ReturnType<typeof collectTraceCardMatches>
	): IRAnalyticsSourceBreakdownChild[] {
		const sourceKind = documentUnits[0]?.sourceKind;
		if (sourceKind !== "pdf" && sourceKind !== "epub") {
			return [];
		}

		const childGroups = new Map<string, IRAnalyticsUnit[]>();
		for (const unit of documentUnits) {
			const childKey = unit.sourceSubunitKey || "";
			if (!childKey) {
				continue;
			}
			const current = childGroups.get(childKey) || [];
			current.push(unit);
			childGroups.set(childKey, current);
		}

		let mappedExtracts = 0;
		let mappedCards = 0;
		const children: IRAnalyticsSourceBreakdownChild[] = Array.from(childGroups.entries())
			.map(([childKey, childUnits]) => {
				const childMatches = documentMatches.filter((match) => match.sourceSubunitKey === childKey);
				const childStats = this.summarizeCardMatches(childMatches);
				mappedExtracts += childStats.extracts;
				mappedCards += childStats.cardsCreated;
				const notesWritten = new Set(
					childUnits.flatMap((unit) =>
						resolveAssociatedNotePaths({
							associatedNotePath: unit.associatedNotePath,
							associatedNotePaths: unit.associatedNotePaths,
						})
					)
				).size;
				return {
					key: childKey,
					label: childUnits[0]?.title || "未命名书签",
					itemCount: childUnits.length,
					activeCount: childUnits.filter((unit) => !isClosedStatus(unit.status)).length,
					extracts: childStats.extracts,
					cardsCreated: childStats.cardsCreated,
					notesWritten,
				} satisfies IRAnalyticsSourceBreakdownChild;
			})
			.sort((a, b) => {
				if (b.cardsCreated !== a.cardsCreated) return b.cardsCreated - a.cardsCreated;
				if (b.extracts !== a.extracts) return b.extracts - a.extracts;
				if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
				return a.label.localeCompare(b.label, "zh-CN");
			});

		const totalStats = this.summarizeCardMatches(documentMatches);
		const unmappedExtracts = Math.max(0, totalStats.extracts - mappedExtracts);
		const unmappedCards = Math.max(0, totalStats.cardsCreated - mappedCards);
		if (unmappedExtracts > 0 || unmappedCards > 0) {
			children.push({
				key: "__unmapped__",
				label: "未定位到目录书签",
				itemCount: 0,
				activeCount: 0,
				extracts: unmappedExtracts,
				cardsCreated: unmappedCards,
				notesWritten: 0,
				isUnmapped: true,
			});
		}

		return children;
	}

	private summarizeCardMatches(matches: ReturnType<typeof collectTraceCardMatches>): {
		extracts: number;
		cardsCreated: number;
	} {
		let extracts = 0;
		let cardsCreated = 0;
		for (const match of matches) {
			if (match.isExtract) {
				extracts += 1;
			} else {
				cardsCreated += 1;
			}
		}
		return { extracts, cardsCreated };
	}

	private buildSourceBreakdownSubtitle(sourceKind: IRTraceSourceKind, documentKey: string): string {
		if (sourceKind === "pdf") {
			return `PDF · ${documentKey}`;
		}
		if (sourceKind === "epub") {
			return `EPUB · ${documentKey}`;
		}
		if (sourceKind === "markdown") {
			return `Markdown · ${documentKey}`;
		}
		return documentKey;
	}

	private buildReadingMaterialByPath(materials: ReadingMaterial[]): Map<string, ReadingMaterial> {
		const map = new Map<string, ReadingMaterial>();
		for (const material of materials || []) {
			const normalizedFilePath = normalizePath(material.filePath || "");
			if (normalizedFilePath) {
				map.set(normalizedFilePath, material);
			}
		}
		return map;
	}

	private collectExtractCardIds(materials: ReadingMaterial[]): Set<string> {
		const extractCardIds = new Set<string>();
		for (const material of materials || []) {
			for (const cardId of material.extractedCards || []) {
				if (cardId) {
					extractCardIds.add(cardId);
				}
			}
		}
		return extractCardIds;
	}

	private async getAllMemoryCards(): Promise<Card[]> {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		if (!plugin?.dataStorage?.getAllCards) {
			return [];
		}
		try {
			return await plugin.dataStorage.getAllCards();
		} catch {
			return [];
		}
	}

	private async getAllReadingMaterials(): Promise<ReadingMaterial[]> {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		if (!plugin?.readingMaterialManager?.getAllMaterials) {
			return [];
		}
		try {
			return await plugin.readingMaterialManager.getAllMaterials();
		} catch {
			return [];
		}
	}

	private getPluginInstance(): any {
		return (this.app as any)?.plugins?.getPlugin?.("weave");
	}

	private getDailyReadingBudgetMinutes(): number {
		const plugin = this.getPluginInstance();
		const configured = Number(plugin?.settings?.incrementalReading?.dailyTimeBudgetMinutes ?? 30);
		return Number.isFinite(configured) && configured > 0 ? configured : 30;
	}

	private async getFilteredStudySessions(deckIds?: string[]): Promise<IRStudySession[]> {
		const sessions = await this.storage.getStudySessions();
		if (!Array.isArray(deckIds)) {
			return sessions;
		}

		const requestedDeckIds = normalizeIdentifiers(deckIds);
		if (requestedDeckIds.length === 0) {
			return [];
		}

		const decks = Object.values(await this.storage.getAllDecks());
		const allowedIdentifiers = new Set(requestedDeckIds);
		for (const deck of decks) {
			const identifiers = normalizeIdentifiers([deck.id, deck.path]);
			if (!identifiers.some((identifier) => allowedIdentifiers.has(identifier))) {
				continue;
			}
			for (const identifier of identifiers) {
				allowedIdentifiers.add(identifier);
			}
		}

		return sessions.filter((session) =>
			getStudySessionDeckIdentifiers(session).some((identifier) =>
				allowedIdentifiers.has(identifier)
			)
		);
	}

	private buildStudySessionScatterSnapshot(
		sessions: IRStudySession[]
	): IRStudySessionScatterSnapshot {
		const validSessions = sessions.filter(
			(session) => Number(session.confirmedDuration || 0) >= STUDY_SESSION_MIN_DURATION_SECONDS
		);
		const dateAxis = Array.from(
			new Set(validSessions.map((session) => String(session.startTime || "").split("T")[0]))
		).sort();
		const dateViewData = validSessions.map((session) => {
			const startDate = new Date(session.startTime);
			const dateKey = String(session.startTime || "").split("T")[0];
			const timeOfDay = startDate.getHours() + startDate.getMinutes() / 60;
			return {
				value: [
					timeOfDay,
					Math.max(0, dateAxis.indexOf(dateKey)),
					Math.round(Number(session.confirmedDuration || 0) / 60),
				],
				session,
			} satisfies IRStudySessionScatterPoint;
		});
		const weekdayViewData = validSessions.map((session) => {
			const startDate = new Date(session.startTime);
			const timeOfDay = startDate.getHours() + startDate.getMinutes() / 60;
			return {
				value: [
					timeOfDay,
					startDate.getDay(),
					Math.round(Number(session.confirmedDuration || 0) / 60),
				],
				session,
			} satisfies IRStudySessionScatterPoint;
		});
		const totalSeconds = validSessions.reduce(
			(sum, session) => sum + Number(session.confirmedDuration || 0),
			0
		);

		return {
			minDurationSeconds: STUDY_SESSION_MIN_DURATION_SECONDS,
			dateAxis,
			weekdayAxis: [...WEEKDAY_LABELS],
			dateViewData,
			weekdayViewData,
			maxDurationMinutes: Math.max(...dateViewData.map((point) => point.value[2]), 60),
			summary: {
				totalSessions: validSessions.length,
				totalHours: round(totalSeconds / 3600, 1),
				averageMinutes:
					validSessions.length > 0
						? Math.round(totalSeconds / validSessions.length / 60)
						: 0,
			},
		};
	}

	private buildActivityHeatmapSnapshot(sessions: IRStudySession[]): IRActivityHeatmapSnapshot {
		const dailyData = new Map<string, { blocks: number; duration: number }>();
		for (const session of sessions) {
			const dateKey = String(session.startTime || "").split("T")[0];
			if (!dateKey) continue;
			const current = dailyData.get(dateKey) || { blocks: 0, duration: 0 };
			current.blocks += Number(session.blocksCompleted || 0);
			current.duration += Number(session.confirmedDuration || 0);
			dailyData.set(dateKey, current);
		}

		const allMinutes = Array.from(dailyData.values()).map((item) =>
			Math.round(item.duration / 60)
		);
		const maxMinutes = Math.max(...allMinutes, 30);
		const endDate = new Date();
		endDate.setHours(0, 0, 0, 0);
		const startDate = new Date(endDate);
		startDate.setDate(startDate.getDate() - HEATMAP_LOOKBACK_DAYS);
		startDate.setHours(0, 0, 0, 0);
		startDate.setDate(startDate.getDate() - startDate.getDay());

		const weeks: IRActivityHeatmapWeek[] = [];
		const monthLabels: IRActivityHeatmapMonthLabel[] = [];
		let currentWeek: IRActivityHeatmapDay[] = [];
		let weekIndex = 0;
		const cursor = new Date(startDate);

		while (cursor <= endDate) {
			if (cursor.getDay() === 0 && currentWeek.length > 0) {
				weeks.push({ days: currentWeek });
				currentWeek = [];
				weekIndex++;
			}

			if (cursor.getDay() === 0 && cursor.getDate() <= 7) {
				const monthName = cursor.toLocaleString("zh-CN", { month: "short" });
				if (
					!monthLabels.some(
						(label) => label.name === monthName && Math.abs(label.position - weekIndex) < 4
					)
				) {
					monthLabels.push({ name: monthName, position: weekIndex });
				}
			}

			const dateKey = formatDateKeyFromDate(cursor);
			const data = dailyData.get(dateKey) || { blocks: 0, duration: 0 };
			const minutes = Math.round(data.duration / 60);
			currentWeek.push({
				date: dateKey,
				blocks: data.blocks,
				duration: minutes,
				level: this.getHeatmapLevel(minutes, maxMinutes),
			});
			cursor.setDate(cursor.getDate() + 1);
		}

		if (currentWeek.length > 0) {
			while (currentWeek.length < 7) {
				currentWeek.push({
					date: "",
					blocks: 0,
					duration: 0,
					level: 0,
					isPlaceholder: true,
				});
			}
			weeks.push({ days: currentWeek });
		}

		const activeDates = Array.from(dailyData.keys()).sort();
		const totalBlocks = sessions.reduce(
			(sum, session) => sum + Number(session.blocksCompleted || 0),
			0
		);
		const totalMinutes = Math.round(
			sessions.reduce((sum, session) => sum + Number(session.confirmedDuration || 0), 0) / 60
		);
		const totalDays = activeDates.length;

		return {
			weeks,
			monthLabels,
			maxMinutes,
			summary: {
				totalBlocks,
				totalMinutes,
				totalDays,
				avgBlocksPerDay: totalDays > 0 ? round(totalBlocks / totalDays, 1) : 0,
				currentStreak: this.getCurrentSessionStreak(new Set(activeDates)),
				maxStreak: this.getMaxSessionStreak(activeDates),
			},
		};
	}

	private getHeatmapLevel(minutes: number, maxMinutes: number): number {
		if (minutes <= 0 || maxMinutes <= 0) return 0;
		const quart = maxMinutes / 4;
		if (minutes <= quart) return 1;
		if (minutes <= quart * 2) return 2;
		if (minutes <= quart * 3) return 3;
		return 4;
	}

	private getCurrentSessionStreak(activeDates: Set<string>): number {
		let streak = 0;
		const cursor = new Date();
		cursor.setHours(0, 0, 0, 0);

		while (activeDates.has(formatDateKeyFromDate(cursor))) {
			streak += 1;
			cursor.setDate(cursor.getDate() - 1);
		}

		return streak;
	}

	private getMaxSessionStreak(activeDates: string[]): number {
		if (!activeDates.length) {
			return 0;
		}

		let maxStreak = 1;
		let currentStreak = 1;
		for (let index = 1; index < activeDates.length; index++) {
			const previous = new Date(activeDates[index - 1]);
			const current = new Date(activeDates[index]);
			const diffDays = Math.round((current.getTime() - previous.getTime()) / DAY_MS);
			if (diffDays === 1) {
				currentStreak += 1;
			} else {
				currentStreak = 1;
			}
			maxStreak = Math.max(maxStreak, currentStreak);
		}

		return maxStreak;
	}

	private buildActivityTrend(units: IRAnalyticsUnit[], days: number): IRAnalyticsActivityPoint[] {
		const datePoints = buildRecentDatePoints(days);
		return datePoints.map((point) => ({
			dateKey: point.dateKey,
			label: point.label,
			createdCount: units.filter((unit) => unit.createdAt > 0 && unit.createdAt >= point.startMs && unit.createdAt <= point.endMs).length,
			interactedCount: units.filter((unit) => unit.lastInteractionAt > 0 && unit.lastInteractionAt >= point.startMs && unit.lastInteractionAt <= point.endMs).length,
			completedCount: units.filter((unit) => {
				const closedAt = toCloseTimestamp(unit);
				return closedAt > 0 && closedAt >= point.startMs && closedAt <= point.endMs;
			}).length,
		}));
	}

	private buildQuantityTrend(units: IRAnalyticsUnit[], days: number): IRAnalyticsQuantityPoint[] {
		const datePoints = buildRecentDatePoints(days);
		return datePoints.map((point) => {
			const existing = units.filter((unit) => unit.createdAt <= point.endMs);
			const closed = existing.filter((unit) => {
				const closedAt = toCloseTimestamp(unit);
				return closedAt > 0 && closedAt <= point.endMs;
			});
			return {
				dateKey: point.dateKey,
				label: point.label,
				totalCount: existing.length,
				activeCount: existing.length - closed.length,
				closedCount: closed.length,
			};
		});
	}

	private buildTimingBuckets(units: IRAnalyticsUnit[]): IRAnalyticsTimingBucket[] {
		const activeUnits = units.filter((unit) => !isClosedStatus(unit.status));
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const todayStart = now.getTime();
		const buckets = TIMING_BUCKET_KEYS.map((key) => ({
			key,
			label: IR_TIMING_BUCKET_LABELS[key],
			count: 0,
		}));

		for (const unit of activeUnits) {
			if (unit.nextRepDate <= 0) {
				buckets[9].count += 1;
				continue;
			}

			const diffDays = Math.floor((unit.nextRepDate - todayStart) / DAY_MS);
			if (diffDays <= -7) buckets[0].count += 1;
			else if (diffDays <= -2) buckets[1].count += 1;
			else if (diffDays < 0) buckets[2].count += 1;
			else if (diffDays === 0) buckets[3].count += 1;
			else if (diffDays <= 3) buckets[4].count += 1;
			else if (diffDays <= 7) buckets[5].count += 1;
			else if (diffDays <= 14) buckets[6].count += 1;
			else if (diffDays <= 30) buckets[7].count += 1;
			else buckets[8].count += 1;
		}

		return buckets;
	}

	private buildDifficultyScatter(
		units: IRAnalyticsUnit[],
		sessionSecondsByBlockId: Map<string, number>
	): IRAnalyticsScatterPoint[] {
		if (!units.length) return [];
		const actionableUnits = units.filter((unit) => !isClosedStatus(unit.status));
		if (!actionableUnits.length) return [];
		const nowMs = Date.now();

		return actionableUnits
			.slice()
			.sort((a, b) => {
				const aHours = getReadingHoursForUnit(a, sessionSecondsByBlockId);
				const bHours = getReadingHoursForUnit(b, sessionSecondsByBlockId);
				return calculateActionScore(b, bHours, nowMs) - calculateActionScore(a, aHours, nowMs);
			})
			.slice(0, 80)
			.map((unit) => ({
				label: truncateLabel(unit.title, 18),
				x: round(estimateEffectivePriority(unit), 1),
				y: calculateUrgencyScore(unit.nextRepDate, nowMs),
				size: Math.max(
					8,
					Math.min(
						38,
						8 + Math.sqrt((unit.stats.cardsCreated || 0) * 6 + (unit.stats.extracts || 0) * 4 + (unit.stats.notesWritten || 0) * 3 + 4)
					)
				),
				itemCount: 1,
				dueCount: unit.nextRepDate <= 0 || unit.nextRepDate <= nowMs ? 1 : 0,
				overdueCount: unit.nextRepDate > 0 && unit.nextRepDate < nowMs ? 1 : 0,
				readingHours: round(getReadingHoursForUnit(unit, sessionSecondsByBlockId), 2),
				cardsCreated: unit.stats.cardsCreated || 0,
				extracts: unit.stats.extracts || 0,
				notesWritten: unit.stats.notesWritten || 0,
			}));
	}

	private buildMonitoringSummary(): IRAnalyticsMonitoringSummary | null {
		const report = this.monitoringService.getSummaryReport();
		const calibration = this.monitoringService.getDecisionCalibrationSummary();
		return {
			dailyReadingMinutes: round(report.weeklyAvg.readingMinutes, 1),
			dailyScheduled: round(report.weeklyAvg.scheduledCount, 1),
			dailyCompleted: round(report.weeklyAvg.completedCount, 1),
			linkedOutcomeRate: round(calibration.linkedOutcomeRate * 100, 1),
		};
	}

}
