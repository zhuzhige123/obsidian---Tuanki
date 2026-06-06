/**
 * 负荷控制管理器
 *
 * 负责监控和优化复习负荷，防止卡片集群导致的负荷激增
 * 提供负荷预测、智能Fuzz、负荷分散等功能
 */

import type { Card, Rating } from "../data/types";
import { logger } from "../utils/logger";
/**
 * 负荷状态枚举
 */
export enum LoadStatus {
	LOW = "low",
	NORMAL = "normal",
	HIGH = "high",
	OVERLOAD = "overload",
}

/**
 * 负荷预测数据
 */
export interface LoadForecast {
	date: Date;
	scheduled: number;
	estimated: number;
	total: number;
	status: LoadStatus;
	isSpike: boolean;
	suggestions?: string[];
}
import type { FSRS } from "../algorithms/fsrs";
import type { WeaveDataStorage } from "../data/storage";

export interface LoadBalanceConfig {
	/** 用户每日容量（卡片数） */
	dailyCapacity: number;

	/** 负荷阈值设置 */
	thresholds: {
		low: number; // 低负荷阈值 (<50%)
		normal: number; // 正常负荷阈值 (<80%)
		high: number; // 高负荷阈值 (<120%)
	};

	/** 智能Fuzz配置 */
	smartFuzz: {
		enabled: boolean;
		range: number; // Fuzz范围（天）
		algorithm: "uniform" | "gaussian" | "loadBased";
	};

	/** 负荷预测配置 */
	forecast: {
		days: number; // 预测天数
		includeEstimated: boolean; // 包含推荐影响
	};
}

export class LoadBalanceManager {
	private storage: WeaveDataStorage;
	private fsrs: FSRS;
	private config: LoadBalanceConfig;

	// 缓存
	private loadCache = new Map<string, number>();
	private forecastCache = new Map<string, LoadForecast[]>();
	private lastUpdateTime = 0;
	private cacheTimeout = 5 * 60 * 1000; // 5分钟缓存

	constructor(storage: WeaveDataStorage, fsrs: FSRS, config?: Partial<LoadBalanceConfig>) {
		this.storage = storage;
		this.fsrs = fsrs;
		this.config = this.mergeConfig(config);
	}

	/**
	 * 获取默认配置
	 */
	private getDefaultConfig(): LoadBalanceConfig {
		return {
			dailyCapacity: 100,
			thresholds: {
				low: 0.5,
				normal: 0.8,
				high: 1.2,
			},
			smartFuzz: {
				enabled: true,
				range: 2,
				algorithm: "loadBased",
			},
			forecast: {
				days: 14,
				includeEstimated: true,
			},
		};
	}

	/**
	 * 合并配置
	 */
	private mergeConfig(partial?: Partial<LoadBalanceConfig>): LoadBalanceConfig {
		const defaultConfig = this.getDefaultConfig();
		if (!partial) return defaultConfig;

		return {
			...defaultConfig,
			...partial,
			thresholds: {
				...defaultConfig.thresholds,
				...partial.thresholds,
			},
			smartFuzz: {
				...defaultConfig.smartFuzz,
				...partial.smartFuzz,
			},
			forecast: {
				...defaultConfig.forecast,
				...partial.forecast,
			},
		};
	}

	/**
	 * 获取当前负荷状态
	 */
	async getCurrentLoadStatus(): Promise<LoadStatus> {
		const todayLoad = await this.getTodayLoad();
		const ratio = todayLoad / this.config.dailyCapacity;

		if (ratio < this.config.thresholds.low) {
			return LoadStatus.LOW;
		} else if (ratio < this.config.thresholds.normal) {
			return LoadStatus.NORMAL;
		} else if (ratio < this.config.thresholds.high) {
			return LoadStatus.HIGH;
		} else {
			return LoadStatus.OVERLOAD;
		}
	}

	/**
	 * 获取今日负荷
	 */
	async getTodayLoad(): Promise<number> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return this.getLoadAt(today);
	}

	/**
	 * 获取指定日期的负荷
	 */
	async getLoadAt(date: Date): Promise<number> {
		// 标准化日期（去掉时间部分）
		const dateKey = this.getDateKey(date);

		// 检查缓存
		if (this.isCacheValid() && this.loadCache.has(dateKey)) {
			return this.loadCache.get(dateKey)!;
		}

		try {
			// 获取所有卡片
			const cards = await this.storage.getCards();
			let load = 0;

			for (const card of cards) {
				// 使用 fsrs 属性而不是 fsrsData
				if (!card.fsrs) continue;
				if (!card.fsrs.due) continue;

				const dueDate = new Date(card.fsrs.due);
				const dueDateKey = this.getDateKey(dueDate);

				if (dueDateKey === dateKey) {
					load++;
				}
			}

			// 更新缓存
			this.loadCache.set(dateKey, load);
			this.lastUpdateTime = Date.now();

			return load;
		} catch (error) {
			logger.error("[LoadBalance] 获取负荷失败:", error);
			return 0;
		}
	}

	/**
	 * 获取平均负荷
	 */
	async getAverageLoad(days: number): Promise<number> {
		const loads = [];
		const today = new Date();

		for (let i = 0; i < days; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const load = await this.getLoadAt(date);
			loads.push(load);
		}

		if (loads.length === 0) return 0;
		return loads.reduce((a, b) => a + b, 0) / loads.length;
	}

	/**
	 * 生成负荷预测
	 */
	async generateLoadForecast(days?: number): Promise<LoadForecast[]> {
		const forecastDays = days || this.config.forecast.days;
		const cacheKey = `forecast-${forecastDays}`;

		// 检查缓存
		if (this.isCacheValid() && this.forecastCache.has(cacheKey)) {
			return this.forecastCache.get(cacheKey)!;
		}

		const forecast: LoadForecast[] = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let i = 0; i < forecastDays; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);

			const scheduled = await this.getLoadAt(date);
			const estimated = this.config.forecast.includeEstimated
				? this.estimateRecommendationImpact(date)
				: 0;
			const total = scheduled + estimated;

			// 计算负荷状态
			const ratio = total / this.config.dailyCapacity;
			let status: LoadStatus;
			if (ratio < this.config.thresholds.low) {
				status = LoadStatus.LOW;
			} else if (ratio < this.config.thresholds.normal) {
				status = LoadStatus.NORMAL;
			} else if (ratio < this.config.thresholds.high) {
				status = LoadStatus.HIGH;
			} else {
				status = LoadStatus.OVERLOAD;
			}

			// 检测峰值
			const averageLoad = await this.getAverageLoad(7);
			const isSpike = total > averageLoad * 1.5;

			// 生成建议
			const suggestions = this.generateSuggestions(date, total, status, isSpike);

			forecast.push({
				date,
				scheduled,
				estimated,
				total,
				status,
				isSpike,
				suggestions,
			});
		}

		// 更新缓存
		this.forecastCache.set(cacheKey, forecast);

		return forecast;
	}

	/**
	 * 估算推荐对负荷的影响
	 */
	private estimateRecommendationImpact(date: Date): number {
		// 简化版：假设每天接受5张推荐卡片
		const baseEstimate = 5;

		// 根据星期几调整（周末可能更多）
		const dayOfWeek = date.getDay();
		const weekendMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.2 : 1.0;

		return Math.round(baseEstimate * weekendMultiplier);
	}

	/**
	 * 生成建议
	 */
	private generateSuggestions(
		date: Date,
		_load: number,
		status: LoadStatus,
		isSpike: boolean
	): string[] {
		const suggestions: string[] = [];

		if (status === LoadStatus.OVERLOAD) {
			suggestions.push("⚠️ 负荷过载，建议分散部分卡片");
			suggestions.push("考虑暂停接受推荐卡片");
		} else if (status === LoadStatus.HIGH) {
			suggestions.push("负荷较高，适度控制新增卡片");
			if (isSpike) {
				suggestions.push("检测到负荷峰值，可以使用负荷分散功能");
			}
		} else if (status === LoadStatus.LOW) {
			suggestions.push("负荷较低，可以接受更多推荐");
			suggestions.push("适合学习新卡片或探索相关内容");
		}

		// 特定日期建议
		const dayOfWeek = date.getDay();
		if (dayOfWeek === 5) {
			suggestions.push("周五：可以为周末准备一些探索性内容");
		} else if (dayOfWeek === 1) {
			suggestions.push("周一：新的一周，保持稳定节奏");
		}

		return suggestions;
	}

	/**
	 * 计算智能Fuzz
	 */
	async calculateSmartFuzz(_card: Card, proposedDue: Date, _rating: Rating): Promise<number> {
		if (!this.config.smartFuzz.enabled) {
			return 0;
		}

		const range = this.config.smartFuzz.range;

		switch (this.config.smartFuzz.algorithm) {
			case "uniform":
				return this.uniformFuzz(range);

			case "gaussian":
				return this.gaussianFuzz(range);

			case "loadBased":
				return await this.loadBasedFuzz(proposedDue, range);

			default:
				return 0;
		}
	}

	/**
	 * 均匀分布Fuzz
	 */
	private uniformFuzz(range: number): number {
		return Math.floor(Math.random() * (2 * range + 1)) - range;
	}

	/**
	 * 高斯分布Fuzz
	 */
	private gaussianFuzz(range: number): number {
		// Box-Muller变换生成正态分布
		const u1 = Math.random();
		const u2 = Math.random();
		const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

		// 缩放到指定范围
		const fuzz = Math.round(z0 * (range / 2));

		// 限制在范围内
		return Math.max(-range, Math.min(range, fuzz));
	}

	/**
	 * 基于负荷的智能Fuzz
	 */
	private async loadBasedFuzz(proposedDue: Date, range: number): Promise<number> {
		// 获取前后range天的负荷
		const loads: { day: number; load: number }[] = [];

		for (let i = -range; i <= range; i++) {
			const date = new Date(proposedDue);
			date.setDate(date.getDate() + i);
			const load = await this.getLoadAt(date);
			loads.push({ day: i, load });
		}

		// 找到负荷最低的日期
		const minLoad = loads.reduce((min, curr) => (curr.load < min.load ? curr : min));

		// 如果原定日期已经是最低负荷，不调整
		if (minLoad.day === 0) {
			return 0;
		}

		// 有一定概率选择最低负荷日
		const probability = 0.7; // 70%概率选择最低负荷
		if (Math.random() < probability) {
			return minLoad.day;
		}

		// 否则选择次低负荷
		loads.sort((a, b) => a.load - b.load);
		if (loads.length > 1) {
			return loads[1].day;
		}

		return 0;
	}

	/**
	 * 分散负荷（手动重新分配）
	 */
	async redistributeLoad(
		startDate: Date,
		endDate: Date,
		options?: {
			maxPerDay?: number;
			preserveEasy?: boolean;
			algorithm?: "smooth" | "peak-shaving";
		}
	): Promise<{
		success: boolean;
		movedCount: number;
		message: string;
	}> {
		try {
			const maxPerDay = options?.maxPerDay || this.config.dailyCapacity * 0.8;
			const algorithm = options?.algorithm || "peak-shaving";

			// 获取期间内的所有卡片
			const cards = await this.storage.getCards();
			const affectedCards: Card[] = [];

			for (const card of cards) {
				// 使用 fsrs 属性
				if (!card.fsrs?.due) continue;

				const dueDate = new Date(card.fsrs.due);
				if (dueDate >= startDate && dueDate <= endDate) {
					// 如果设置了保留Easy卡片，跳过高稳定性卡片
					if (options?.preserveEasy && card.fsrs.stability && card.fsrs.stability > 30) {
						continue;
					}
					affectedCards.push(card);
				}
			}

			if (affectedCards.length === 0) {
				return {
					success: false,
					movedCount: 0,
					message: "没有需要重新分配的卡片",
				};
			}

			// 根据算法重新分配
			let movedCount = 0;

			if (algorithm === "smooth") {
				// 平滑算法：均匀分配
				movedCount = await this.smoothRedistribution(affectedCards, startDate, endDate, maxPerDay);
			} else {
				// 削峰算法：只处理超载的日期
				movedCount = await this.peakShavingRedistribution(affectedCards, maxPerDay);
			}

			return {
				success: true,
				movedCount,
				message: `成功重新分配 ${movedCount} 张卡片`,
			};
		} catch (error) {
			logger.error("[LoadBalance] 负荷分散失败:", error);
			return {
				success: false,
				movedCount: 0,
				message: "负荷分散失败",
			};
		}
	}

	/**
	 * 平滑重新分配
	 */
	private async smoothRedistribution(
		cards: Card[],
		startDate: Date,
		endDate: Date,
		maxPerDay: number
	): Promise<number> {
		// 计算总天数
		const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

		// 计算每天应该分配的卡片数
		const cardsPerDay = Math.min(Math.ceil(cards.length / totalDays), maxPerDay);

		// 重新分配
		let movedCount = 0;
		let currentDay = 0;
		let dailyCount = 0;

		for (const card of cards) {
			const newDate = new Date(startDate);
			newDate.setDate(newDate.getDate() + currentDay);

			// 更新卡片的到期日
			if (card.fsrs?.due) {
				const oldDue = new Date(card.fsrs.due);
				if (Math.abs(oldDue.getTime() - newDate.getTime()) > 1000 * 60 * 60 * 24) {
					card.fsrs.due = newDate.toISOString();
					await this.storage.saveCard(card);
					movedCount++;
				}
			}

			dailyCount++;
			if (dailyCount >= cardsPerDay) {
				currentDay++;
				dailyCount = 0;
			}
		}

		return movedCount;
	}

	/**
	 * 削峰重新分配
	 */
	private async peakShavingRedistribution(cards: Card[], maxPerDay: number): Promise<number> {
		// 统计每天的负荷
		const loadMap = new Map<string, Card[]>();

		for (const card of cards) {
			if (!card.fsrs?.due) continue;
			const dateKey = this.getDateKey(new Date(card.fsrs.due));

			if (!loadMap.has(dateKey)) {
				loadMap.set(dateKey, []);
			}
			loadMap.get(dateKey)?.push(card);
		}

		// 找出超载的日期
		const overloadedDates: string[] = [];
		const underloadedDates: string[] = [];

		for (const [dateKey, dateCards] of loadMap) {
			if (dateCards.length > maxPerDay) {
				overloadedDates.push(dateKey);
			} else if (dateCards.length < maxPerDay * 0.7) {
				underloadedDates.push(dateKey);
			}
		}

		if (overloadedDates.length === 0) {
			return 0; // 没有超载，不需要调整
		}

		// 从超载日期移动卡片到低负荷日期
		let movedCount = 0;

		for (const overloadedDate of overloadedDates) {
			const overloadCards = loadMap.get(overloadedDate)!;
			const excessCount = overloadCards.length - maxPerDay;

			// 移动多余的卡片
			for (let i = 0; i < excessCount && i < overloadCards.length; i++) {
				const card = overloadCards[i];

				// 找到最近的低负荷日期
				const targetDate = this.findBestTargetDate(
					new Date(overloadedDate),
					underloadedDates,
					loadMap,
					maxPerDay
				);

				if (targetDate && card.fsrs) {
					card.fsrs.due = targetDate.toISOString();
					await this.storage.saveCard(card);
					movedCount++;

					// 更新loadMap
					const targetKey = this.getDateKey(targetDate);
					if (!loadMap.has(targetKey)) {
						loadMap.set(targetKey, []);
					}
					loadMap.get(targetKey)?.push(card);
				}
			}
		}

		return movedCount;
	}

	/**
	 * 找到最佳目标日期
	 */
	private findBestTargetDate(
		originalDate: Date,
		_underloadedDates: string[],
		loadMap: Map<string, Card[]>,
		maxPerDay: number
	): Date | null {
		// 寻找最近的低负荷日期
		let bestDate: Date | null = null;
		let minDistance = Infinity;

		// 检查前后7天
		for (let i = -7; i <= 7; i++) {
			if (i === 0) continue;

			const targetDate = new Date(originalDate);
			targetDate.setDate(targetDate.getDate() + i);
			const targetKey = this.getDateKey(targetDate);

			const currentLoad = loadMap.get(targetKey)?.length || 0;
			if (currentLoad < maxPerDay * 0.8) {
				const distance = Math.abs(i);
				if (distance < minDistance) {
					minDistance = distance;
					bestDate = targetDate;
				}
			}
		}

		return bestDate;
	}

	/**
	 * 获取日期键
	 */
	private getDateKey(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * 检查缓存是否有效
	 */
	private isCacheValid(): boolean {
		return Date.now() - this.lastUpdateTime < this.cacheTimeout;
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		this.loadCache.clear();
		this.forecastCache.clear();
		this.lastUpdateTime = 0;
	}

	/**
	 * 获取负荷统计
	 */
	async getLoadStatistics(days = 30): Promise<{
		average: number;
		peak: number;
		peakDate: Date | null;
		standardDeviation: number;
		trend: "increasing" | "stable" | "decreasing";
	}> {
		const loads: { date: Date; load: number }[] = [];
		const today = new Date();

		for (let i = 0; i < days; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const load = await this.getLoadAt(date);
			loads.push({ date, load });
		}

		if (loads.length === 0) {
			return {
				average: 0,
				peak: 0,
				peakDate: null,
				standardDeviation: 0,
				trend: "stable",
			};
		}

		// 计算平均值
		const average = loads.reduce((sum, l) => sum + l.load, 0) / loads.length;

		// 找出峰值
		const peak = loads.reduce((max, l) => (l.load > max.load ? l : max));

		// 计算标准差
		const variance = loads.reduce((sum, l) => sum + (l.load - average) ** 2, 0) / loads.length;
		const standardDeviation = Math.sqrt(variance);

		// 判断趋势（简单线性回归）
		const firstHalf = loads.slice(0, Math.floor(loads.length / 2));
		const secondHalf = loads.slice(Math.floor(loads.length / 2));
		const firstAvg = firstHalf.reduce((sum, l) => sum + l.load, 0) / firstHalf.length;
		const secondAvg = secondHalf.reduce((sum, l) => sum + l.load, 0) / secondHalf.length;

		let trend: "increasing" | "stable" | "decreasing";
		const change = secondAvg - firstAvg;
		if (Math.abs(change) < average * 0.1) {
			trend = "stable";
		} else if (change > 0) {
			trend = "increasing";
		} else {
			trend = "decreasing";
		}

		return {
			average,
			peak: peak.load,
			peakDate: peak.date,
			standardDeviation,
			trend,
		};
	}
}
