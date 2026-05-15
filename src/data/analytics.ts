import { logger } from "../utils/logger";
import { LoadStatus } from "../services/LoadBalanceManager";
import { generateDeckMemoryCurveData, type DeckMemoryCurvePoint } from "../utils/memory-curve-utils";
import {
	type TimeBucket,
	bucketDate,
	dayOfWeek,
	fmtISODate,
	hourOfDay,
	hoursMatrixInit,
	rangeDays,
	startOfDay,
} from "../utils/time";
import { isMasteredMemoryCard } from "../services/deck/MemoryDeckLevelService";
import type { WeaveDataStorage } from "./storage";
import type { StudySession } from "./study-types";
import type { Card, Deck } from "./types";
import { Rating } from "./types";

export interface TrendPoint {
	key: string;
	reviews: number;
	minutes: number;
	accuracy: number;
}
export interface RatingBar {
	rating: Rating;
	count: number;
}
export interface HistogramBin {
	x0: number;
	x1: number;
	count: number;
}

// FSRS6 分析相关数据类型
export interface MemoryCurvePoint {
	day: number;
	actualRetention: number;
	fsrsPredicted: number;
	sampleSize: number;
}

export interface DifficultyBin {
	x0: number;
	x1: number;
	count: number;
	label: string;
	percentage: number;
}

export interface ParameterImpact {
	parameterName: string;
	parameterIndex: number;
	currentValue: number;
	impactScore: number;
	description: string;
	recommendation: string;
	category: "initialization" | "difficulty" | "recall" | "forget" | "short_term";
}

export interface AlgorithmComparisonData {
	fsrsAccuracy: number;
	traditionalAccuracy: number;
	efficiencyGain: number;
	retentionImprovement: number;
	sampleSize: number;
	confidenceLevel: number;
}

export interface FSRSKPIData {
	avgDifficulty: number;
	avgStability: number;
	retentionRate: number;
	algorithmEfficiency: number;
	parameterOptimization: number;
	totalCards: number;
	matureCards: number;
}

export interface AnalyticsFilter {
	since?: string; // ISO 8601 string
	until?: string; // ISO 8601 string
	deckIds?: string[];
}

export interface DeckAnalyticsSnapshotOptions {
	deckIds?: string[];
	since?: string;
	until?: string;
	days?: number;
	dailyCapacity?: number;
	targetRetention?: number;
	useGlobalLoad?: boolean;
}

export interface DeckAnalyticsQuantitySnapshot {
	dates: string[];
	newCards: number[];
	learning: number[];
	review: number[];
	mastered: number[];
	masteryRate: number[];
}

export interface DeckAnalyticsTimingSnapshot {
	dates: string[];
	early: number[];
	ontime: number[];
	late: number[];
}

export interface DeckAnalyticsDifficultyPoint {
	tag: string;
	difficulty: number;
	count: number;
}

export interface DeckAnalyticsForecastPoint {
	date: string;
	total: number;
	status: LoadStatus;
}

export interface DeckAnalyticsSummary {
	totalCards: number;
	reviewedCards: number;
	hasReviewData: boolean;
	targetRetention: number;
	dailyCapacity: number;
	selectedDeckIds: string[];
	selectedDeckNames: string[];
}

export interface DeckAnalyticsRetentionSnapshot {
	points: DeckMemoryCurvePoint[];
	comparisonLabels: string[];
	comparisonSeries: Array<{
		deckId: string;
		deckName: string;
		values: Array<number | null>;
	}>;
}

export interface DeckAnalyticsSnapshot {
	retention: DeckAnalyticsRetentionSnapshot;
	quantity: DeckAnalyticsQuantitySnapshot;
	timing: DeckAnalyticsTimingSnapshot;
	difficulty: DeckAnalyticsDifficultyPoint[];
	forecast: DeckAnalyticsForecastPoint[];
	summary: DeckAnalyticsSummary;
}

interface DeckAnalyticsDatePoint {
	date: Date;
	dateKey: string;
	endOfDay: Date;
}

// 缓存项接口
interface CacheItem<T = unknown> {
	data: T;
	timestamp: number;
	ttl: number; // 生存时间（毫秒）
	accessCount: number;
	lastAccess: number;
}

// 缓存配置
interface CacheConfig {
	maxSize: number;
	defaultTTL: number;
	cleanupInterval: number;
}

export class AnalyticsService {
	private storage: WeaveDataStorage;
	private cache = new Map<string, CacheItem>();
	private cacheConfig: CacheConfig = {
		maxSize: 30, // 最大缓存项数（从100降低到30，减少内存占用）
		defaultTTL: 2 * 60 * 1000, // 默认2分钟过期（从5分钟降低）
		cleanupInterval: 30 * 1000, // 每30秒清理一次（从60秒降低，更激进）
	};
	private cleanupTimer: NodeJS.Timeout | null = null;
	private lastDataVersion = 0; // 数据版本号，用于检测数据变更

	private static readonly ratingValues = [
		Rating.Again,
		Rating.Hard,
		Rating.Good,
		Rating.Easy,
	] as const;

	constructor(storage: WeaveDataStorage) {
		this.storage = storage;
		this.startCacheCleanup();
	}

	/**
	 * 启动缓存清理定时器
	 */
	private startCacheCleanup(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
		}

		this.cleanupTimer = setInterval(() => {
			this.cleanupExpiredCache();
		}, this.cacheConfig.cleanupInterval);
	}

	/**
	 * 清理过期缓存
	 */
	private cleanupExpiredCache(): void {
		const now = Date.now();
		const keysToDelete: string[] = [];

		for (const [key, item] of this.cache.entries()) {
			if (now - item.timestamp > item.ttl) {
				keysToDelete.push(key);
			}
		}

		for (const key of keysToDelete) {
			this.cache.delete(key);
		}

		// 如果缓存超过最大大小，删除最少使用的项
		if (this.cache.size > this.cacheConfig.maxSize) {
			const sortedEntries = Array.from(this.cache.entries()).sort(
				(a, b) => a[1].lastAccess - b[1].lastAccess
			);

			const deleteCount = this.cache.size - this.cacheConfig.maxSize;
			for (let i = 0; i < deleteCount; i++) {
				this.cache.delete(sortedEntries[i][0]);
			}
		}
	}

	/**
	 * 获取缓存数据
	 */
	private getCachedData<T>(key: string): T | null {
		const item = this.cache.get(key);
		if (!item) return null;

		const now = Date.now();
		if (now - item.timestamp > item.ttl) {
			this.cache.delete(key);
			return null;
		}

		// 更新访问信息
		item.accessCount++;
		item.lastAccess = now;
		return item.data as T;
	}

	/**
	 * 设置缓存数据
	 */
	private setCachedData<T>(key: string, data: T, ttl?: number): void {
		const now = Date.now();
		this.cache.set(key, {
			data,
			timestamp: now,
			ttl: ttl || this.cacheConfig.defaultTTL,
			accessCount: 1,
			lastAccess: now,
		});
	}

	/**
	 * 清除所有缓存
	 */
	public clearCache(): void {
		this.cache.clear();
		this.lastDataVersion++;
	}

	/**
	 * 销毁服务，清理资源
	 */
	public destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		this.cache.clear();
	}

	/**
	 * 处理牌组删除事件，清理相关缓存和数据
	 */
	public onDeckDeleted(deckId: string): void {
		logger.debug(`🧹 AnalyticsService: 清理已删除牌组的缓存数据: ${deckId}`);

		// 清理所有缓存，因为很多缓存可能包含该牌组的数据
		this.clearCache();

		// 增加数据版本号，使所有缓存失效
		this.lastDataVersion++;

		logger.debug(`✅ AnalyticsService: 缓存清理完成，数据版本更新为: ${this.lastDataVersion}`);
	}

	async loadRaw() {
		const cacheKey = "loadRaw";
		const cached = this.getCachedData<{ cards: Card[]; decks: Deck[]; sessions: StudySession[] }>(
			cacheKey
		);

		if (cached) {
			return cached;
		}

		const [cards, decks, sessions] = await Promise.all([
			this.storage.getCards(),
			this.storage.getDecks(),
			this.storage.getStudySessions(),
		]);

		const result = { cards, decks, sessions };
		this.setCachedData(cacheKey, result, 2 * 60 * 1000); // 2分钟缓存
		return result;
	}

	private async applyFilter<T extends { deckId?: string; startTime?: Date | string | number }>(
		arr: T[],
		f?: AnalyticsFilter
	): Promise<T[]> {
		if (!f) {
			// 即使没有过滤器，也要验证牌组是否存在
			return this.filterValidDeckData(arr);
		}

		const filtered = arr.filter((item) => {
			if (f.deckIds?.length && item.deckId && !f.deckIds.includes(item.deckId)) return false;

			const startTime = this.parseStartTime(item.startTime);
			if (f.since && startTime && startTime < new Date(f.since)) return false;
			if (f.until && startTime && startTime > new Date(f.until)) return false;

			return true;
		});

		// 验证牌组是否存在
		return this.filterValidDeckData(filtered);
	}

	/**
	 * 过滤掉引用不存在牌组的数据
	 */
	private async filterValidDeckData<T extends { deckId?: string }>(arr: T[]): Promise<T[]> {
		try {
			const decks = await this.storage.getDecks();
			const validDeckIds = new Set(decks.map((d) => d.id));

			const beforeCount = arr.length;
			const filtered = arr.filter((_item) => {
				if (!_item.deckId) return true; // 保留没有deckId的数据
				return validDeckIds.has(_item.deckId);
			});

			const removedCount = beforeCount - filtered.length;
			if (removedCount > 0) {
				logger.debug(`🧹 过滤掉 ${removedCount} 个引用不存在牌组的数据项`);
			}

			return filtered;
		} catch (error) {
			logger.warn("验证牌组数据时出错:", error);
			return arr; // 出错时返回原数组
		}
	}

	private parseStartTime(value?: Date | string | number): Date | null {
		if (value instanceof Date) {
			return Number.isNaN(value.getTime()) ? null : value;
		}

		if (typeof value === "string" || typeof value === "number") {
			const parsed = new Date(value);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		return null;
	}

	async trend(
		bucket: TimeBucket,
		daysWindow = 30,
		filter?: AnalyticsFilter
	): Promise<TrendPoint[]> {
		const cacheKey = `trend:${bucket}:${daysWindow}:${JSON.stringify(filter)}:${
			this.lastDataVersion
		}`;
		const cached = this.getCachedData<TrendPoint[]>(cacheKey);

		if (cached) {
			return cached;
		}

		try {
			const sessions = await this.storage.getStudySessions({
				since: filter?.since,
				until: filter?.until,
			});
			const src = await this.applyFilter(sessions, filter);
			const map = new Map<
				string,
				{ reviews: number; minutes: number; correct: number; total: number }
			>();

			for (const s of src) {
				if (!s.startTime) continue; // 跳过无效数据

				const k = bucketDate(new Date(s.startTime), bucket);
				const rec = map.get(k) || { reviews: 0, minutes: 0, correct: 0, total: 0 };
				rec.reviews += Math.max(0, s.cardsReviewed || 0);
				rec.minutes += Math.max(0, Math.round((s.totalTime || 0) / 60));
				rec.correct += Math.max(0, s.correctAnswers || 0);
				rec.total += Math.max(0, s.cardsReviewed || 0);
				map.set(k, rec);
			}

			// generate continuous range for last N days when bucket is day
			let keys = Array.from(map.keys()).sort();
			if (bucket === "day") {
				const days = rangeDays(new Date(), daysWindow);
				keys = days;
				for (const d of days) {
					if (!map.has(d)) {
						map.set(d, { reviews: 0, minutes: 0, correct: 0, total: 0 });
					}
				}
			}

			const result = keys.map((_k) => {
				const r = map.get(_k) ?? { reviews: 0, minutes: 0, correct: 0, total: 0 };
				return {
					key: _k,
					reviews: r.reviews,
					minutes: r.minutes,
					accuracy: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
				};
			});

			this.setCachedData(cacheKey, result);
			return result;
		} catch (error) {
			logger.error("Error calculating trend data:", error);
			return [];
		}
	}

	async ratingDistribution(filter?: AnalyticsFilter): Promise<RatingBar[]> {
		const sessions = await this.storage.getStudySessions({
			since: filter?.since,
			until: filter?.until,
		});
		const src = await this.applyFilter(sessions, filter);
		const counts: Record<Rating, number> = {
			[Rating.Again]: 0,
			[Rating.Hard]: 0,
			[Rating.Good]: 0,
			[Rating.Easy]: 0,
		};
		for (const s of src) {
			for (const r of s.cardReviews || []) {
				counts[r.rating] = (counts[r.rating] || 0) + 1;
			}
		}
		const result: RatingBar[] = AnalyticsService.ratingValues.map((rating) => ({
			rating,
			count: counts[rating] || 0,
		}));
		return result;
	}

	async timeHistogram(
		binSizeSec = 5,
		maxSec = 60,
		filter?: AnalyticsFilter
	): Promise<HistogramBin[]> {
		const sessions = await this.storage.getStudySessions({
			since: filter?.since,
			until: filter?.until,
		});
		const src = await this.applyFilter(sessions, filter);
		const bins: HistogramBin[] = [];
		for (let x = 0; x < maxSec; x += binSizeSec) bins.push({ x0: x, x1: x + binSizeSec, count: 0 });
		for (const s of src)
			for (const r of s.cardReviews || []) {
				const sec = Math.round(r.responseTime || 0);
				const idx = Math.min(Math.floor(sec / binSizeSec), bins.length - 1);
				bins[idx].count++;
			}
		return bins;
	}

	async calendarHeat(
		year = new Date().getFullYear(),
		filter?: AnalyticsFilter
	): Promise<Record<string, number>> {
		const sessions = await this.storage.getStudySessions({
			since: `${year}-01-01T00:00:00Z`,
			until: `${year}-12-31T23:59:59Z`,
		});
		const src = await this.applyFilter(sessions, filter);
		const map: Record<string, number> = {};
		for (const s of src) {
			const d = new Date(s.startTime);
			if (d.getFullYear() !== year) continue;
			const k = fmtISODate(startOfDay(d));
			map[k] = (map[k] || 0) + (s.cardsReviewed || 0);
		}
		return map;
	}

	async hourWeekMatrix(filter?: AnalyticsFilter): Promise<number[][]> {
		const sessions = await this.storage.getStudySessions({
			since: filter?.since,
			until: filter?.until,
		});
		const src = await this.applyFilter(sessions, filter);
		const m = hoursMatrixInit();
		for (const s of src) {
			const d = new Date(s.startTime);
			const w = dayOfWeek(d);
			const h = hourOfDay(d);
			m[w][h] += s.cardsReviewed || 0;
		}
		return m;
	}

	async deckCompare(filter?: AnalyticsFilter) {
		const _key = "deck:compare";
		const [decks, sessions] = await Promise.all([
			this.storage.getDecks(),
			this.storage.getStudySessions({ since: filter?.since, until: filter?.until }),
		]);
		// 仅按需加载卡片：若筛选了 deckIds，则逐牌组读取；否则读取全部（保持兼容）
		let cards: Card[] = [];
		if (filter?.deckIds?.length) {
			for (const id of filter.deckIds) {
				try {
					cards.push(...(await this.storage.getDeckCards(id)));
				} catch {}
			}
		} else {
			cards = await this.storage.getCards();
		}
		const srcSessions = await this.applyFilter(sessions, filter);
		const srcCards = await this.filterValidDeckData(filter?.deckIds?.length ? cards : cards);
		const byDeck = new Map<
			string,
			{
				name: string;
				reviews: number;
				correct: number;
				total: number;
				avgInterval: number;
				avgDifficulty: number;
				n: number;
			}
		>();
		const deckMap = new Map(decks.map((d) => [d.id, d.name]));
		for (const s of srcSessions) {
			const rec = byDeck.get(s.deckId || "") || {
				name: deckMap.get(s.deckId || "") || "",
				reviews: 0,
				correct: 0,
				total: 0,
				avgInterval: 0,
				avgDifficulty: 0,
				n: 0,
			};
			rec.reviews += s.cardsReviewed || 0;
			rec.correct += s.correctAnswers || 0;
			rec.total += s.cardsReviewed || 0;
			byDeck.set(s.deckId || "", rec);
		}
		for (const c of srcCards) {
			const rec = byDeck.get(c.deckId || "") || {
				name: deckMap.get(c.deckId || "") || "",
				reviews: 0,
				correct: 0,
				total: 0,
				avgInterval: 0,
				avgDifficulty: 0,
				n: 0,
			};
			rec.avgInterval += c.fsrs?.scheduledDays || 0;
			rec.avgDifficulty += c.fsrs?.difficulty || 0;
			rec.n += 1;
			byDeck.set(c.deckId || "", rec);
		}
		const result = Array.from(byDeck.entries()).map(([deckId, r]) => ({
			deckId,
			name: r.name,
			reviews: r.reviews,
			accuracy: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
			avgInterval: r.n > 0 ? +(r.avgInterval / r.n).toFixed(1) : 0,
			avgDifficulty: r.n > 0 ? +(r.avgDifficulty / r.n).toFixed(2) : 0,
		}));
		return result;
	}

	// Interval growth trend: average scheduledDays among reviewed cards per bucket
	async intervalGrowth(bucket: TimeBucket, filter?: AnalyticsFilter): Promise<TrendPoint[]> {
		const sessions = await this.storage.getStudySessions({
			since: filter?.since,
			until: filter?.until,
		});
		// 按需加载卡片
		let cards: Card[] = [];
		if (filter?.deckIds?.length) {
			for (const id of filter.deckIds) {
				try {
					cards.push(...(await this.storage.getDeckCards(id)));
				} catch {}
			}
		} else {
			cards = await this.storage.getCards();
		}
		const src = await this.applyFilter(sessions, filter);
		const validCards = await this.filterValidDeckData(cards);
		const cardMap = new Map(validCards.map((c) => [c.uuid, c]));
		const map = new Map<string, { sum: number; n: number }>();
		for (const s of src) {
			const k = bucketDate(new Date(s.startTime), bucket);
			for (const r of s.cardReviews || []) {
				const c = cardMap.get(r.cardId);
				if (!c) continue;
				const rec = map.get(k) || { sum: 0, n: 0 };
				rec.sum += c.fsrs?.scheduledDays || 0;
				rec.n += 1;
				map.set(k, rec);
			}
		}
		const keys = Array.from(map.keys()).sort();
		return keys.map((_k) => {
			const r = map.get(_k) ?? { sum: 0, n: 0 };
			return {
				key: _k,
				reviews: 0,
				minutes: 0,
				accuracy: r.n ? +(r.sum / r.n).toFixed(1) : 0,
			};
		});
	}

	async getDeckAnalyticsSnapshot(
		options: DeckAnalyticsSnapshotOptions = {}
	): Promise<DeckAnalyticsSnapshot> {
		const normalizedDeckIds = Array.from(
			new Set((options.deckIds || []).map((deckId) => String(deckId || "").trim()).filter(Boolean))
		);
		const days = Math.max(1, Math.round(options.days ?? 30));
		const targetRetention = Math.min(Math.max(options.targetRetention ?? 90, 50), 99);
		const dailyCapacity = Math.max(1, Math.round(options.dailyCapacity ?? 100));
		const cacheKey = `deck-analytics-snapshot:${JSON.stringify({
			deckIds: normalizedDeckIds,
			since: options.since || "",
			until: options.until || "",
			days,
			targetRetention,
			dailyCapacity,
			useGlobalLoad: !!options.useGlobalLoad,
			version: this.lastDataVersion,
		})}`;
		const cached = this.getCachedData<DeckAnalyticsSnapshot>(cacheKey);
		if (cached) {
			return cached;
		}

		const [decks, selectedCards, forecastCards] = await Promise.all([
			this.storage.getDecks(),
			this.getCardsForDeckAnalytics(normalizedDeckIds),
			options.useGlobalLoad
				? this.filterValidDeckData(await this.storage.getCards())
				: this.getCardsForDeckAnalytics(normalizedDeckIds),
		]);
		const datePoints = this.buildDeckAnalyticsDatePoints(days, options.since, options.until);
		const filteredCards = this.filterCardsReviewHistoryByRange(
			selectedCards,
			options.since,
			options.until
		);
		const deckNameById = new Map(decks.map((deck) => [deck.id, deck.name]));
		const comparisonSeries = await this.buildDeckRetentionComparisonSeries(
			normalizedDeckIds,
			deckNameById,
			days,
			targetRetention,
			options.since,
			options.until
		);

		const snapshot: DeckAnalyticsSnapshot = {
			retention: {
				points: generateDeckMemoryCurveData(filteredCards, days, targetRetention),
				comparisonLabels: Array.from({ length: days + 1 }, (_, index) => String(index)),
				comparisonSeries,
			},
			quantity: this.buildDeckQuantitySnapshot(filteredCards, datePoints),
			timing: this.buildDeckTimingSnapshot(filteredCards, datePoints),
			difficulty: this.buildDeckDifficultySnapshot(filteredCards),
			forecast: this.buildDeckForecastSnapshot(forecastCards, days, dailyCapacity),
			summary: {
				totalCards: selectedCards.length,
				reviewedCards: filteredCards.filter(
					(card) => Array.isArray(card.reviewHistory) && card.reviewHistory.length > 0
				).length,
				hasReviewData: filteredCards.some(
					(card) => Array.isArray(card.reviewHistory) && card.reviewHistory.length > 0
				),
				targetRetention,
				dailyCapacity,
				selectedDeckIds: normalizedDeckIds,
				selectedDeckNames: normalizedDeckIds.map((deckId) => deckNameById.get(deckId) || deckId),
			},
		};

		this.setCachedData(cacheKey, snapshot);
		return snapshot;
	}

	// ==================== FSRS6 分析方法 ====================

	/**
	 * 获取FSRS记忆曲线数据
	 */
	async getMemoryCurveData(filter?: AnalyticsFilter): Promise<MemoryCurvePoint[]> {
		const cacheKey = `memory-curve-${JSON.stringify(filter)}`;
		const cached = this.getCachedData<MemoryCurvePoint[]>(cacheKey);
		if (cached) return cached;

		try {
			const cards = await this.filterValidDeckData(await this.storage.getCards());
			const sessions = await this.applyFilter(await this.storage.getStudySessions(), filter);

			const curveData = this.calculateMemoryCurve(cards, sessions);

			this.setCachedData(cacheKey, curveData);
			return curveData;
		} catch (error) {
			logger.error("Error getting memory curve data:", error);
			return [];
		}
	}

	/**
	 * 获取难度分布数据
	 */
	async getDifficultyDistribution(filter?: AnalyticsFilter): Promise<DifficultyBin[]> {
		const cacheKey = `difficulty-dist-${JSON.stringify(filter)}`;
		const cached = this.getCachedData<DifficultyBin[]>(cacheKey);
		if (cached) return cached;

		try {
			const cards = await this.filterValidDeckData(await this.storage.getCards());

			const bins = this.createDifficultyBins(cards);

			this.setCachedData(cacheKey, bins);
			return bins;
		} catch (error) {
			logger.error("Error getting difficulty distribution:", error);
			return [];
		}
	}

	/**
	 * 获取稳定性趋势数据
	 */
	async getStabilityTrend(
		bucket: TimeBucket,
		days: number,
		filter?: AnalyticsFilter
	): Promise<TrendPoint[]> {
		const cacheKey = `stability-trend-${bucket}-${days}-${JSON.stringify(filter)}`;
		const cached = this.getCachedData<TrendPoint[]>(cacheKey);
		if (cached) return cached;

		try {
			const cards = await this.filterValidDeckData(await this.storage.getCards());
			const sessions = await this.applyFilter(await this.storage.getStudySessions(), filter);

			const trendData = this.calculateStabilityTrend(cards, sessions, bucket, days);

			this.setCachedData(cacheKey, trendData);
			return trendData;
		} catch (error) {
			logger.error("Error getting stability trend:", error);
			return [];
		}
	}

	/**
	 * 获取参数影响分析数据
	 */
	async getParameterImpactAnalysis(filter?: AnalyticsFilter): Promise<ParameterImpact[]> {
		const cacheKey = `param-impact-${JSON.stringify(filter)}`;
		const cached = this.getCachedData<ParameterImpact[]>(cacheKey);
		if (cached) return cached;

		try {
			const cards = await this.filterValidDeckData(await this.storage.getCards());
			const sessions = await this.applyFilter(await this.storage.getStudySessions(), filter);

			const impactData = this.analyzeParameterImpact(cards, sessions);

			this.setCachedData(cacheKey, impactData);
			return impactData;
		} catch (error) {
			logger.error("Error getting parameter impact analysis:", error);
			return [];
		}
	}

	/**
	 * 获取算法效果对比数据
	 */
	async getAlgorithmComparison(filter?: AnalyticsFilter): Promise<AlgorithmComparisonData> {
		const cacheKey = `algo-comparison-${JSON.stringify(filter)}`;
		const cached = this.getCachedData<AlgorithmComparisonData>(cacheKey);
		if (cached) return cached;

		try {
			const cards = await this.filterValidDeckData(await this.storage.getCards());
			const sessions = await this.applyFilter(await this.storage.getStudySessions(filter), filter);

			const comparisonData = this.compareAlgorithmPerformance(cards, sessions);

			this.setCachedData(cacheKey, comparisonData);
			return comparisonData;
		} catch (error) {
			logger.error("Error getting algorithm comparison:", error);
			return this.getEmptyComparisonData();
		}
	}

	/**
	 * 获取FSRS KPI数据
	 */
	async getFSRSKPIData(filter?: AnalyticsFilter): Promise<FSRSKPIData> {
		const cacheKey = `fsrs-kpi-${JSON.stringify(filter)}`;
		const cached = this.getCachedData<FSRSKPIData>(cacheKey);
		if (cached) return cached;

		try {
			const cards = await this.filterValidDeckData(await this.storage.getCards());
			const sessions = await this.applyFilter(await this.storage.getStudySessions(filter), filter);

			const kpiData = this.calculateFSRSKPI(cards, sessions);

			this.setCachedData(cacheKey, kpiData);
			return kpiData;
		} catch (error) {
			logger.error("Error getting FSRS KPI data:", error);
			return this.getEmptyFSRSKPI();
		}
	}

	private async getCardsForDeckAnalytics(deckIds: string[]): Promise<Card[]> {
		if (deckIds.length === 0) {
			return this.filterValidDeckData(await this.storage.getCards());
		}

		const cardsById = new Map<string, Card>();
		for (const deckId of deckIds) {
			try {
				const deckCards = await this.storage.getDeckCards(deckId);
				for (const card of await this.filterValidDeckData(deckCards)) {
					cardsById.set(card.uuid, card);
				}
			} catch (error) {
				logger.warn(`[AnalyticsService] 加载牌组分析卡片失败: ${deckId}`, error);
			}
		}

		return Array.from(cardsById.values());
	}

	private buildDeckAnalyticsDatePoints(
		days: number,
		since?: string,
		until?: string
	): DeckAnalyticsDatePoint[] {
		const safeDays = Math.max(1, Math.round(days));
		const endDate = until ? new Date(until) : new Date();
		endDate.setHours(23, 59, 59, 999);

		let startDate: Date;
		if (since) {
			startDate = new Date(since);
			startDate.setHours(0, 0, 0, 0);
		} else {
			startDate = new Date(endDate);
			startDate.setDate(startDate.getDate() - safeDays + 1);
			startDate.setHours(0, 0, 0, 0);
		}

		const pointCount = Math.max(
			1,
			Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
		);

		return Array.from({ length: pointCount }, (_, index) => {
			const date = new Date(startDate);
			date.setDate(startDate.getDate() + index);
			const endOfDay = new Date(date);
			endOfDay.setHours(23, 59, 59, 999);
			return {
				date,
				dateKey: this.toLocalDateKey(date),
				endOfDay,
			};
		});
	}

	private toLocalDateKey(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate()
		).padStart(2, "0")}`;
	}

	private filterCardsReviewHistoryByRange(cards: Card[], since?: string, until?: string): Card[] {
		if (!since && !until) {
			return cards;
		}

		const sinceTime = since ? new Date(since).getTime() : Number.NEGATIVE_INFINITY;
		const untilTime = until ? new Date(until).getTime() : Number.POSITIVE_INFINITY;

		return cards.map((card) => ({
			...card,
			reviewHistory: (card.reviewHistory || []).filter((review) => {
				const reviewTime = new Date(review.review).getTime();
				return reviewTime >= sinceTime && reviewTime <= untilTime;
			}),
		}));
	}

	private async buildDeckRetentionComparisonSeries(
		deckIds: string[],
		deckNameById: Map<string, string>,
		days: number,
		targetRetention: number,
		since?: string,
		until?: string
	): Promise<Array<{ deckId: string; deckName: string; values: Array<number | null> }>> {
		if (deckIds.length <= 1) {
			return [];
		}

		const series: Array<{ deckId: string; deckName: string; values: Array<number | null> }> = [];
		for (const deckId of deckIds) {
			const deckCards = this.filterCardsReviewHistoryByRange(
				await this.getCardsForDeckAnalytics([deckId]),
				since,
				until
			);
			const points = generateDeckMemoryCurveData(deckCards, days, targetRetention);
			series.push({
				deckId,
				deckName: deckNameById.get(deckId) || deckId,
				values: points.map((point) => point.avgRetrievability),
			});
		}

		return series;
	}

	private buildDeckQuantitySnapshot(
		cards: Card[],
		datePoints: DeckAnalyticsDatePoint[]
	): DeckAnalyticsQuantitySnapshot {
		const snapshot: DeckAnalyticsQuantitySnapshot = {
			dates: [],
			newCards: [],
			learning: [],
			review: [],
			mastered: [],
			masteryRate: [],
		};

		for (const point of datePoints) {
			snapshot.dates.push(point.dateKey);
			let newCount = 0;
			let learningCount = 0;
			let reviewCount = 0;
			let masteredCount = 0;

			for (const card of cards) {
				const createdAt = new Date(card.created).getTime();
				if (!Number.isFinite(createdAt) || createdAt > point.endOfDay.getTime()) {
					continue;
				}

				const state = card.fsrs?.state ?? 0;
				if (state === 0) {
					newCount += 1;
					continue;
				}
				if (state === 1 || state === 3) {
					learningCount += 1;
					continue;
				}

				if (isMasteredMemoryCard(card)) {
					masteredCount += 1;
				} else {
					reviewCount += 1;
				}
			}

			snapshot.newCards.push(newCount);
			snapshot.learning.push(learningCount);
			snapshot.review.push(reviewCount);
			snapshot.mastered.push(masteredCount);

			const total = newCount + learningCount + reviewCount + masteredCount;
			snapshot.masteryRate.push(
				total > 0 ? Number(((masteredCount / total) * 100).toFixed(1)) : 0
			);
		}

		return snapshot;
	}

	private buildDeckTimingSnapshot(
		cards: Card[],
		datePoints: DeckAnalyticsDatePoint[]
	): DeckAnalyticsTimingSnapshot {
		const snapshot: DeckAnalyticsTimingSnapshot = {
			dates: [],
			early: [],
			ontime: [],
			late: [],
		};

		for (const point of datePoints) {
			snapshot.dates.push(point.dateKey);
			let earlyCount = 0;
			let ontimeCount = 0;
			let lateCount = 0;

			for (const card of cards) {
				for (const review of card.reviewHistory || []) {
					const reviewDate = new Date(review.review);
					if (this.toLocalDateKey(reviewDate) !== point.dateKey) {
						continue;
					}

					const dueDate = new Date(review.due);
					const diffHours = (reviewDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
					if (diffHours < -24) {
						earlyCount += 1;
					} else if (diffHours > 24) {
						lateCount += 1;
					} else {
						ontimeCount += 1;
					}
				}
			}

			const total = earlyCount + ontimeCount + lateCount;
			snapshot.early.push(total > 0 ? Math.round((earlyCount / total) * 100) : 0);
			snapshot.ontime.push(total > 0 ? Math.round((ontimeCount / total) * 100) : 0);
			snapshot.late.push(total > 0 ? Math.round((lateCount / total) * 100) : 0);
		}

		return snapshot;
	}

	private buildDeckDifficultySnapshot(cards: Card[]): DeckAnalyticsDifficultyPoint[] {
		const statsByTag = new Map<string, { totalDifficulty: number; count: number }>();
		for (const card of cards) {
			const difficulty = card.fsrs?.difficulty;
			if (!Number.isFinite(difficulty) || !Array.isArray(card.tags) || card.tags.length === 0) {
				continue;
			}

			for (const tag of card.tags) {
				const normalizedTag = String(tag || "").trim();
				if (!normalizedTag) {
					continue;
				}

				const current = statsByTag.get(normalizedTag) || { totalDifficulty: 0, count: 0 };
				current.totalDifficulty += difficulty || 0;
				current.count += 1;
				statsByTag.set(normalizedTag, current);
			}
		}

		return Array.from(statsByTag.entries())
			.map(([tag, stats]) => ({
				tag,
				difficulty: stats.count > 0 ? stats.totalDifficulty / stats.count : 0,
				count: stats.count,
			}))
			.sort((left, right) => right.count - left.count)
			.slice(0, 20);
	}

	private buildDeckForecastSnapshot(
		cards: Card[],
		days: number,
		dailyCapacity: number
	): DeckAnalyticsForecastPoint[] {
		const safeDays = Math.max(1, Math.round(days));
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		return Array.from({ length: safeDays }, (_, index) => {
			const targetDate = new Date(today);
			targetDate.setDate(today.getDate() + index);
			const dateKey = this.toLocalDateKey(targetDate);
			const total = cards.reduce((sum, card) => {
				if (!card.fsrs?.due) {
					return sum;
				}
				const dueDate = new Date(card.fsrs.due);
				return this.toLocalDateKey(dueDate) === dateKey ? sum + 1 : sum;
			}, 0);
			const ratio = total / dailyCapacity;
			const status =
				ratio <= 0.5
					? LoadStatus.LOW
					: ratio <= 0.8
						? LoadStatus.NORMAL
						: ratio <= 1.2
							? LoadStatus.HIGH
							: LoadStatus.OVERLOAD;

			return {
				date: dateKey,
				total,
				status,
			};
		});
	}

	// ==================== FSRS6 分析私有方法 ====================

	/**
	 * 计算记忆曲线数据
	 */
	private calculateMemoryCurve(cards: Card[], sessions: StudySession[]): MemoryCurvePoint[] {
		const curvePoints: MemoryCurvePoint[] = [];

		// 按时间间隔分组计算实际记忆保持率
		const intervalGroups = new Map<number, { total: number; correct: number }>();

		for (const session of sessions) {
			for (const review of session.cardReviews || []) {
				const card = cards.find((c) => c.uuid === review.cardId);
				if (!card?.fsrs) continue;

				const interval = Math.floor(card.fsrs.scheduledDays || 0);
				if (interval <= 0) continue;

				const group = intervalGroups.get(interval) || { total: 0, correct: 0 };
				group.total++;
				if (review.rating >= 2) group.correct++; // Hard以上算正确
				intervalGroups.set(interval, group);
			}
		}

		// 转换为曲线点
		for (const [interval, group] of intervalGroups) {
			if (group.total >= 3) {
				// 至少3个样本才有统计意义
				curvePoints.push({
					day: interval,
					actualRetention: group.correct / group.total,
					fsrsPredicted: this.calculateFSRSPrediction(interval),
					sampleSize: group.total,
				});
			}
		}

		return curvePoints.sort((a, b) => a.day - b.day);
	}

	/**
	 * 创建难度分布数据
	 */
	private createDifficultyBins(cards: Card[]): DifficultyBin[] {
		const bins: DifficultyBin[] = [];
		const binSize = 0.5; // 难度区间大小
		const maxDifficulty = 10;
		const totalCards = cards.filter((c) => c.fsrs?.difficulty !== undefined).length;

		for (let i = 0; i < maxDifficulty; i += binSize) {
			const count = cards.filter(
				(card) =>
					card.fsrs?.difficulty !== undefined &&
					card.fsrs.difficulty >= i &&
					card.fsrs.difficulty < i + binSize
			).length;

			bins.push({
				x0: i,
				x1: i + binSize,
				count,
				label: `${i.toFixed(1)}-${(i + binSize).toFixed(1)}`,
				percentage: totalCards > 0 ? (count / totalCards) * 100 : 0,
			});
		}

		return bins;
	}

	/**
	 * 计算稳定性趋势
	 */
	private calculateStabilityTrend(
		cards: Card[],
		sessions: StudySession[],
		bucket: TimeBucket,
		days: number
	): TrendPoint[] {
		const trendPoints: TrendPoint[] = [];
		const now = new Date();

		for (let i = days - 1; i >= 0; i--) {
			const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
			const dateKey = bucketDate(date, bucket);

			// 计算该时间点的平均稳定性
			const relevantSessions = sessions.filter(
				(s) => bucketDate(new Date(s.startTime), bucket) === dateKey
			);

			let totalStability = 0;
			let count = 0;

			for (const session of relevantSessions) {
				for (const review of session.cardReviews || []) {
					const card = cards.find((c) => c.uuid === review.cardId);
					if (card?.fsrs?.stability) {
						totalStability += card.fsrs.stability;
						count++;
					}
				}
			}

			trendPoints.push({
				key: dateKey,
				reviews: count,
				minutes: 0,
				accuracy: count > 0 ? totalStability / count : 0,
			});
		}

		return trendPoints;
	}

	/**
	 * 分析参数影响
	 */
	private analyzeParameterImpact(cards: Card[], sessions: StudySession[]): ParameterImpact[] {
		const impacts: ParameterImpact[] = [];

		// FSRS6参数分类和描述
		const parameterInfo: Array<
			Pick<ParameterImpact, "parameterName" | "description" | "category">
		> = [
			{ parameterName: "w0_init_again", category: "initialization", description: "初始Again难度" },
			{ parameterName: "w1_init_hard", category: "initialization", description: "初始Hard难度" },
			{ parameterName: "w2_init_good", category: "initialization", description: "初始Good难度" },
			{ parameterName: "w3_init_easy", category: "initialization", description: "初始Easy难度" },
			{ parameterName: "w4_mean_difficulty", category: "difficulty", description: "平均难度基准" },
			{ parameterName: "w5_diff_reg", category: "difficulty", description: "难度回归系数" },
			{ parameterName: "w6_diff_delta", category: "difficulty", description: "难度变化量" },
			{ parameterName: "w7_mean_reversion", category: "difficulty", description: "均值回归强度" },
			{ parameterName: "w8_recall_gain", category: "recall", description: "回忆增益系数" },
			{ parameterName: "w9_retrievability_coef", category: "recall", description: "可提取性系数" },
			{ parameterName: "w10_forget_base", category: "forget", description: "遗忘基础率" },
			{ parameterName: "w11_forget_diff_coef", category: "forget", description: "遗忘难度系数" },
			{ parameterName: "w12_forget_stab_exp", category: "forget", description: "遗忘稳定性指数" },
			{ parameterName: "w13_forget_time_exp", category: "forget", description: "遗忘时间指数" },
			{ parameterName: "w14_forget_min", category: "forget", description: "最小遗忘稳定性" },
			{ parameterName: "w15_hard_penalty", category: "recall", description: "Hard评分惩罚" },
			{ parameterName: "w16_easy_bonus", category: "recall", description: "Easy评分奖励" },
			{ parameterName: "w17_short_term_base", category: "short_term", description: "短期记忆基础" },
			{
				parameterName: "w18_short_term_rating",
				category: "short_term",
				description: "短期记忆评分影响",
			},
			{
				parameterName: "w19_short_term_stability",
				category: "short_term",
				description: "短期记忆稳定性",
			},
			{ parameterName: "w20_decay_factor", category: "forget", description: "衰减因子" },
		];

		// 计算每个参数的影响分数（简化版本）
		for (const [index, info] of parameterInfo.entries()) {
			const impactScore = this.calculateParameterImpact(index, cards, sessions);

			impacts.push({
				parameterName: info.parameterName,
				parameterIndex: index,
				currentValue: 0, // 需要从实际设置中获取
				impactScore,
				description: info.description,
				recommendation: this.generateParameterRecommendation(impactScore),
				category: info.category,
			});
		}

		return impacts;
	}

	/**
	 * 对比算法性能
	 */
	private compareAlgorithmPerformance(
		cards: Card[],
		sessions: StudySession[]
	): AlgorithmComparisonData {
		// 计算FSRS算法的准确性
		const fsrsAccuracy = this.calculateFSRSAccuracy(cards, sessions);

		// 计算传统算法的准确性（模拟）
		const traditionalAccuracy = this.calculateTraditionalAccuracy(cards, sessions);

		// 计算效率增益
		const efficiencyGain =
			fsrsAccuracy > traditionalAccuracy
				? ((fsrsAccuracy - traditionalAccuracy) / traditionalAccuracy) * 100
				: 0;

		// 计算记忆保持率改进
		const retentionImprovement = Math.max(0, (fsrsAccuracy - traditionalAccuracy) * 100);

		return {
			fsrsAccuracy,
			traditionalAccuracy,
			efficiencyGain,
			retentionImprovement,
			sampleSize: sessions.length,
			confidenceLevel: sessions.length > 100 ? 0.95 : sessions.length > 30 ? 0.85 : 0.7,
		};
	}

	/**
	 * 计算FSRS KPI指标
	 */
	private calculateFSRSKPI(cards: Card[], sessions: StudySession[]): FSRSKPIData {
		const fsrsCards = cards.filter((c) => c.fsrs);
		const totalCards = fsrsCards.length;
		const matureCards = fsrsCards.filter((c) => isMasteredMemoryCard(c)).length;

		// 计算平均难度
		const avgDifficulty =
			totalCards > 0
				? fsrsCards.reduce((sum, c) => sum + (c.fsrs?.difficulty || 0), 0) / totalCards
				: 0;

		// 计算平均稳定性
		const avgStability =
			totalCards > 0
				? fsrsCards.reduce((sum, c) => sum + (c.fsrs?.stability || 0), 0) / totalCards
				: 0;

		// 计算记忆保持率
		const retentionRate = this.calculateOverallRetentionRate(sessions);

		// 计算算法效率（基于预测准确性）
		const algorithmEfficiency = this.calculateAlgorithmEfficiency(cards, sessions);

		// 计算参数优化程度（基于与默认值的差异）
		const parameterOptimization = this.calculateParameterOptimization(cards);

		return {
			avgDifficulty,
			avgStability,
			retentionRate,
			algorithmEfficiency,
			parameterOptimization,
			totalCards,
			matureCards,
		};
	}

	// 辅助计算方法
	private calculateFSRSPrediction(interval: number): number {
		// 简化的FSRS预测公式
		return Math.exp(-interval / 30);
	}

	private calculateParameterImpact(
		_paramIndex: number,
		_cards: Card[],
		_sessions: StudySession[]
	): number {
		// 简化的参数影响计算
		// 实际实现需要更复杂的统计分析
		return Math.random() * 100; // 临时实现
	}

	private generateParameterRecommendation(impactScore: number): string {
		if (impactScore > 80) return "高影响参数，建议谨慎调整";
		if (impactScore > 50) return "中等影响参数，可适度优化";
		return "低影响参数，可自由调整";
	}

	private calculateFSRSAccuracy(cards: Card[], sessions: StudySession[]): number {
		// 计算FSRS预测的准确性
		let correct = 0;
		let total = 0;

		for (const session of sessions) {
			for (const review of session.cardReviews || []) {
				const card = cards.find((c) => c.uuid === review.cardId);
				if (card?.fsrs) {
					total++;
					// 简化的准确性判断
					if (review.rating >= 2) correct++;
				}
			}
		}

		return total > 0 ? correct / total : 0;
	}

	private calculateTraditionalAccuracy(cards: Card[], sessions: StudySession[]): number {
		// 模拟传统算法的准确性（通常比FSRS低）
		return this.calculateFSRSAccuracy(cards, sessions) * 0.85;
	}

	private calculateOverallRetentionRate(sessions: StudySession[]): number {
		let correct = 0;
		let total = 0;

		for (const session of sessions) {
			for (const review of session.cardReviews || []) {
				total++;
				if (review.rating >= 2) correct++;
			}
		}

		return total > 0 ? correct / total : 0;
	}

	private calculateAlgorithmEfficiency(cards: Card[], sessions: StudySession[]): number {
		// 基于预测准确性计算算法效率
		return this.calculateFSRSAccuracy(cards, sessions) * 100;
	}

	private calculateParameterOptimization(_cards: Card[]): number {
		// 计算参数优化程度（简化实现）
		return Math.random() * 100; // 临时实现
	}

	private getEmptyComparisonData(): AlgorithmComparisonData {
		return {
			fsrsAccuracy: 0,
			traditionalAccuracy: 0,
			efficiencyGain: 0,
			retentionImprovement: 0,
			sampleSize: 0,
			confidenceLevel: 0,
		};
	}

	private getEmptyFSRSKPI(): FSRSKPIData {
		return {
			avgDifficulty: 0,
			avgStability: 0,
			retentionRate: 0,
			algorithmEfficiency: 0,
			parameterOptimization: 0,
			totalCards: 0,
			matureCards: 0,
		};
	}
}
