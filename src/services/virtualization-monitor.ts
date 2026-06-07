import { logger } from "../utils/logger";
/**
 * 虚拟化性能监控服务
 *
 * 监控虚拟滚动性能指标，提供优化建议
 *
 * @module virtualization-monitor
 */

import type { PerformanceReport, VirtualizationMetrics } from "../types/virtualization-types";

/**
 * 性能阈值配置
 */
const PERFORMANCE_THRESHOLDS = {
	/** 首次渲染时间阈值（毫秒） */
	INITIAL_RENDER_TIME: 200,

	/** 增量渲染时间阈值（毫秒） */
	INCREMENTAL_RENDER_TIME: 50,

	/** 最小滚动帧率（FPS） */
	MIN_SCROLL_FPS: 55,

	/** 最大 DOM 节点数 */
	MAX_DOM_NODES: 500,

	/** 最小缓存命中率 */
	MIN_CACHE_HIT_RATE: 0.7,
};

/**
 * FPS 测量器类
 */
class FPSMeter {
	private frameTimes: number[] = [];
	private lastFrameTime = 0;
	private maxSamples = 60; // 保留最近 60 帧

	/**
	 * 记录一帧
	 */
	recordFrame(): void {
		const now = performance.now();

		if (this.lastFrameTime > 0) {
			const frameDuration = now - this.lastFrameTime;
			this.frameTimes.push(frameDuration);

			// 保持数组大小
			if (this.frameTimes.length > this.maxSamples) {
				this.frameTimes.shift();
			}
		}

		this.lastFrameTime = now;
	}

	/**
	 * 获取平均 FPS
	 */
	getAverageFPS(): number {
		if (this.frameTimes.length === 0) return 60;

		const avgFrameDuration = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
		return Math.round(1000 / avgFrameDuration);
	}

	/**
	 * 重置测量器
	 */
	reset(): void {
		this.frameTimes = [];
		this.lastFrameTime = 0;
	}
}

/**
 * 虚拟化性能监控器类
 *
 * 提供虚拟化性能监控和分析功能
 *
 * @example
 * ```typescript
 * const monitor = new VirtualizationMonitor();
 * monitor.startMonitoring('kanban');
 *
 * // 记录指标
 * monitor.recordMetric({
 *   totalItems: 1000,
 *   visibleItems: 50,
 *   renderedItems: 60,
 *   scrollPosition: 5000,
 *   virtualizedRatio: 0.06
 * });
 *
 * // 获取报告
 * const report = monitor.getPerformanceReport();
 * ```
 */
export class VirtualizationMonitor {
	/** 当前视图类型 */
	private viewType: "table" | "kanban" | "grid" | null = null;

	/** 监控是否激活 */
	private isActive = false;

	/** 监控开始时间 */
	private startTime = 0;

	/** 指标历史记录 */
	private metricsHistory: VirtualizationMetrics[] = [];

	/** FPS 测量器 */
	private fpsMeter: FPSMeter;

	/** RAF 句柄 */
	private rafHandle: number | null = null;

	/** 性能标记前缀 */
	private readonly markPrefix = "weave-virtualization";

	constructor() {
		this.fpsMeter = new FPSMeter();
	}

	/**
	 * 开始监控
	 *
	 * @param viewType - 视图类型
	 */
	startMonitoring(viewType: "table" | "kanban" | "grid"): void {
		if (this.isActive) {
			logger.warn("[VirtualizationMonitor] 监控已激活");
			return;
		}

		this.viewType = viewType;
		this.isActive = true;
		this.startTime = performance.now();
		this.metricsHistory = [];
		this.fpsMeter.reset();

		// 开始 FPS 监控
		this.startFPSMonitoring();

		// 创建性能标记
		performance.mark(`${this.markPrefix}-start-${viewType}`);

		logger.debug(`[VirtualizationMonitor] 开始监控 ${viewType} 视图`);
	}

	/**
	 * 停止监控
	 */
	stopMonitoring(): void {
		if (!this.isActive) {
			return;
		}

		this.isActive = false;

		// 停止 FPS 监控
		this.stopFPSMonitoring();

		// 创建性能标记
		if (this.viewType) {
			performance.mark(`${this.markPrefix}-end-${this.viewType}`);

			try {
				performance.measure(
					`${this.markPrefix}-${this.viewType}`,
					`${this.markPrefix}-start-${this.viewType}`,
					`${this.markPrefix}-end-${this.viewType}`
				);
			} catch {
				// 忽略测量错误
			}
		}

		logger.debug(`[VirtualizationMonitor] 停止监控 ${this.viewType} 视图`);
	}

	/**
	 * 记录性能指标
	 *
	 * @param metric - 性能指标
	 */
	recordMetric(metric: VirtualizationMetrics): void {
		if (!this.isActive) {
			return;
		}

		// 创建默认指标对象
		const defaultMetrics: VirtualizationMetrics = {
			totalItems: 0,
			visibleItems: 0,
			renderedItems: 0,
			scrollPosition: 0,
			virtualizedRatio: 0,
			domNodeCount: 0,
			cacheHitRate: 0,
			initialRenderTime: 0,
			averageScrollFPS: 0,
		};

		// 合并指标并添加实时FPS数据
		const enhancedMetric: VirtualizationMetrics = {
			...defaultMetrics,
			...metric,
			averageScrollFPS: this.fpsMeter.getAverageFPS(),
		};

		this.metricsHistory.push(enhancedMetric);

		// 保持历史记录在合理范围内（最多100条）
		if (this.metricsHistory.length > 100) {
			this.metricsHistory.shift();
		}
	}

	/**
	 * 获取性能报告
	 *
	 * @returns 性能报告
	 */
	getPerformanceReport(): PerformanceReport | null {
		if (!this.viewType || this.metricsHistory.length === 0) {
			return null;
		}

		// 获取最新指标
		const latestMetric = this.metricsHistory[this.metricsHistory.length - 1];

		// 计算平均指标
		const avgMetrics = this.calculateAverageMetrics();

		// 判断是否需要优化
		const needsOptimization = this.shouldOptimize();

		// 生成优化建议
		const recommendations = this.generateRecommendations();

		// 合并指标数据，平均值优先级更高
		const mergedMetrics: VirtualizationMetrics = {
			...latestMetric,
			...avgMetrics,
		};

		return {
			timestamp: Date.now(),
			metrics: mergedMetrics,
			performanceLevel: this.getPerformanceLevel(needsOptimization),
			recommendations: recommendations,
			warnings: [], // TODO: 实现警告逻辑
			errors: [], // TODO: 实现错误逻辑
		};
	}

	/**
	 * 判断是否需要优化
	 *
	 * @returns 是否需要优化
	 */
	shouldOptimize(): boolean {
		if (this.metricsHistory.length === 0) {
			return false;
		}

		const latest = this.metricsHistory[this.metricsHistory.length - 1];

		// 检查各项阈值
		const checks = [
			// FPS 过低
			(latest.averageScrollFPS || 60) < PERFORMANCE_THRESHOLDS.MIN_SCROLL_FPS,

			// DOM 节点过多
			(latest.domNodeCount || 0) > PERFORMANCE_THRESHOLDS.MAX_DOM_NODES,

			// 缓存命中率过低
			(latest.cacheHitRate || 1) < PERFORMANCE_THRESHOLDS.MIN_CACHE_HIT_RATE,

			// 首次渲染时间过长
			(latest.initialRenderTime || 0) > PERFORMANCE_THRESHOLDS.INITIAL_RENDER_TIME,
		];

		// 任一项不达标则需要优化
		return checks.some((_check) => _check);
	}

	/**
	 * 生成优化建议
	 *
	 * @private
	 * @returns 建议列表
	 */
	private generateRecommendations(): string[] {
		const recommendations: string[] = [];

		if (this.metricsHistory.length === 0) {
			return recommendations;
		}

		const latest = this.metricsHistory[this.metricsHistory.length - 1];

		// FPS 检查
		const fps = latest.averageScrollFPS || 60;
		if (fps < PERFORMANCE_THRESHOLDS.MIN_SCROLL_FPS) {
			recommendations.push(`滚动帧率偏低 (${fps} FPS)，建议增加 overscan 值或减少渲染复杂度`);
		}

		// DOM 节点检查
		const domNodes = latest.domNodeCount || 0;
		if (domNodes > PERFORMANCE_THRESHOLDS.MAX_DOM_NODES) {
			recommendations.push(`DOM 节点过多 (${domNodes})，建议减少 overscan 或启用更激进的虚拟化`);
		}

		// 缓存命中率检查
		const cacheHitRate = latest.cacheHitRate || 1;
		if (cacheHitRate < PERFORMANCE_THRESHOLDS.MIN_CACHE_HIT_RATE) {
			recommendations.push(
				`缓存命中率较低 (${(cacheHitRate * 100).toFixed(1)}%)，建议增加缓存大小`
			);
		}

		// 渲染时间检查
		const renderTime = latest.initialRenderTime || 0;
		if (renderTime > PERFORMANCE_THRESHOLDS.INITIAL_RENDER_TIME) {
			recommendations.push(`首次渲染时间较长 (${renderTime}ms)，建议减少初始加载数量`);
		}

		// 虚拟化比率检查
		if (latest.virtualizedRatio > 0.5) {
			recommendations.push("虚拟化比率较低，可能未充分利用虚拟滚动优化");
		}

		return recommendations;
	}

	/**
	 * 计算平均指标
	 *
	 * @private
	 * @returns 平均指标
	 */
	private calculateAverageMetrics(): Partial<VirtualizationMetrics> {
		if (this.metricsHistory.length === 0) {
			return {};
		}

		const count = this.metricsHistory.length;

		const sum = this.metricsHistory.reduce(
			(acc, metric) => {
				return {
					totalItems: acc.totalItems + metric.totalItems,
					visibleItems: acc.visibleItems + metric.visibleItems,
					renderedItems: acc.renderedItems + metric.renderedItems,
					scrollPosition: acc.scrollPosition + metric.scrollPosition,
					virtualizedRatio: acc.virtualizedRatio + metric.virtualizedRatio,
					averageScrollFPS: acc.averageScrollFPS + (metric.averageScrollFPS || 60),
					domNodeCount: acc.domNodeCount + (metric.domNodeCount || 0),
					cacheHitRate: acc.cacheHitRate + (metric.cacheHitRate || 0),
					initialRenderTime: acc.initialRenderTime + (metric.initialRenderTime || 0),
				};
			},
			{
				totalItems: 0,
				visibleItems: 0,
				renderedItems: 0,
				scrollPosition: 0,
				virtualizedRatio: 0,
				averageScrollFPS: 0,
				domNodeCount: 0,
				cacheHitRate: 0,
				initialRenderTime: 0,
			}
		);

		return {
			totalItems: Math.round(sum.totalItems / count),
			visibleItems: Math.round(sum.visibleItems / count),
			renderedItems: Math.round(sum.renderedItems / count),
			scrollPosition: Math.round(sum.scrollPosition / count),
			virtualizedRatio: sum.virtualizedRatio / count,
			averageScrollFPS: Math.round(sum.averageScrollFPS / count),
			domNodeCount: Math.round(sum.domNodeCount / count),
			cacheHitRate: sum.cacheHitRate / count,
			initialRenderTime: Math.round(sum.initialRenderTime / count),
		};
	}

	/**
	 * 开始 FPS 监控
	 *
	 * @private
	 */
	private startFPSMonitoring(): void {
		const measureFrame = () => {
			if (!this.isActive) return;

			this.fpsMeter.recordFrame();
			this.rafHandle = window.requestAnimationFrame(measureFrame);
		};

		this.rafHandle = window.requestAnimationFrame(measureFrame);
	}

	/**
	 * 停止 FPS 监控
	 *
	 * @private
	 */
	private stopFPSMonitoring(): void {
		if (this.rafHandle !== null) {
			cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
	}

	/**
	 * 标记性能事件
	 *
	 * @param eventName - 事件名称
	 */
	markEvent(eventName: string): void {
		if (!this.isActive) return;

		try {
			performance.mark(`${this.markPrefix}-${this.viewType}-${eventName}`);
		} catch (error) {
			logger.warn("[VirtualizationMonitor] 标记事件失败:", error);
		}
	}

	/**
	 * 测量两个事件之间的时间
	 *
	 * @param startEvent - 开始事件名称
	 * @param endEvent - 结束事件名称
	 * @returns 持续时间（毫秒），失败返回 null
	 */
	measureDuration(startEvent: string, endEvent: string): number | null {
		if (!this.isActive || !this.viewType) return null;

		try {
			const measureName = `${this.markPrefix}-${this.viewType}-duration`;
			const startMark = `${this.markPrefix}-${this.viewType}-${startEvent}`;
			const endMark = `${this.markPrefix}-${this.viewType}-${endEvent}`;

			performance.measure(measureName, startMark, endMark);

			const measures = performance.getEntriesByName(measureName, "measure");
			if (measures.length > 0) {
				return measures[measures.length - 1].duration;
			}
		} catch (error) {
			logger.warn("[VirtualizationMonitor] 测量持续时间失败:", error);
		}

		return null;
	}

	/**
	 * 清理性能标记和测量
	 */
	clearPerformanceData(): void {
		if (this.viewType) {
			try {
				performance.clearMarks(`${this.markPrefix}-${this.viewType}`);
				performance.clearMeasures(`${this.markPrefix}-${this.viewType}`);
			} catch {
				// 忽略清理错误
			}
		}
	}

	/**
	 * 获取监控统计
	 *
	 * @returns 统计信息
	 */
	getStats() {
		return {
			isActive: this.isActive,
			viewType: this.viewType,
			metricsCount: this.metricsHistory.length,
			elapsedTime: this.isActive ? performance.now() - this.startTime : 0,
			currentFPS: this.fpsMeter.getAverageFPS(),
		};
	}

	/**
	 * 获取性能等级
	 *
	 * @private
	 * @param needsOptimization - 是否需要优化
	 * @returns 性能等级
	 */
	private getPerformanceLevel(_needsOptimization: boolean): "excellent" | "good" | "fair" | "poor" {
		if (this.metricsHistory.length === 0) {
			return "fair";
		}

		const latestMetric = this.metricsHistory[this.metricsHistory.length - 1];

		// 基于多个指标综合判断性能等级
		let score = 100;

		// FPS评分
		if (latestMetric.averageScrollFPS < PERFORMANCE_THRESHOLDS.MIN_SCROLL_FPS) {
			score -= 30;
		} else if (latestMetric.averageScrollFPS < 58) {
			score -= 15;
		}

		// 渲染时间评分
		if (latestMetric.initialRenderTime > PERFORMANCE_THRESHOLDS.INITIAL_RENDER_TIME) {
			score -= 25;
		} else if (latestMetric.initialRenderTime > 150) {
			score -= 10;
		}

		// DOM节点数评分
		if (latestMetric.domNodeCount > PERFORMANCE_THRESHOLDS.MAX_DOM_NODES) {
			score -= 20;
		} else if (latestMetric.domNodeCount > 300) {
			score -= 10;
		}

		// 缓存命中率评分
		if (latestMetric.cacheHitRate < PERFORMANCE_THRESHOLDS.MIN_CACHE_HIT_RATE) {
			score -= 15;
		}

		// 根据分数确定等级
		if (score >= 90) return "excellent";
		if (score >= 75) return "good";
		if (score >= 60) return "fair";
		return "poor";
	}
}

/**
 * 导出性能阈值（用于测试和参考）
 */
export { PERFORMANCE_THRESHOLDS };
