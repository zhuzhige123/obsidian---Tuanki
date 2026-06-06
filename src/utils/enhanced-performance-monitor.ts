import { getChromeMemoryUsageSnapshot } from "./chrome-performance-memory";
import { isCallable, readUnknownProperty } from "./dynamic-access";
import { extractErrorMessage } from "../types/utility-types";
import { logger } from "../utils/logger";
import type { TimerHandle } from "../types/timer";
/**
 * 增强性能监控和日志系统
 * 监控解析性能，记录详细日志，帮助识别性能瓶颈和问题排查
 */

export interface PerformanceMetric {
	id: string;
	operation: string;
	startTime: number;
	endTime: number;
	duration: number;
	contentSize: number;
	templateName: string;
	method: string;
	success: boolean;
	memoryBefore?: number;
	memoryAfter?: number;
	memoryDelta?: number;
	metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
	totalOperations: number;
	successfulOperations: number;
	failedOperations: number;
	successRate: number;
	averageDuration: number;
	minDuration: number;
	maxDuration: number;
	medianDuration: number;
	p95Duration: number;
	p99Duration: number;
	totalMemoryUsage: number;
	averageMemoryUsage: number;
	operationsPerSecond: number;
	timeRange: {
		start: number;
		end: number;
		duration: number;
	};
}

type ActiveOperationMetadata = {
	operation: string;
	contentSize?: number;
	templateName?: string;
	method?: string;
	[key: string]: unknown;
};

export interface LogEntry {
	id: string;
	timestamp: number;
	level: "debug" | "info" | "warn" | "error";
	category: string;
	message: string;
	data?: unknown;
	performanceId?: string;
	stackTrace?: string;
}

export interface MonitorConfig {
	enablePerformanceTracking: boolean;
	enableMemoryTracking: boolean;
	enableDetailedLogging: boolean;
	maxMetricsHistory: number;
	maxLogHistory: number;
	logLevel: "debug" | "info" | "warn" | "error";
	performanceThresholds: {
		slowOperation: number; // ms
		memoryWarning: number; // bytes
		errorRate: number; // percentage
	};
	autoCleanup: boolean;
	cleanupInterval: number; // ms
}

/**
 * 增强性能监控器
 * 提供全面的性能监控和日志记录功能
 */
export class EnhancedPerformanceMonitor {
	private metrics: Map<string, PerformanceMetric> = new Map();
	private logs: LogEntry[] = [];
	private config: MonitorConfig;
	private cleanupTimer: TimerHandle | null = null;
	private activeOperations: Map<string, { startTime: number; metadata: ActiveOperationMetadata }> =
		new Map();

	constructor(config?: Partial<MonitorConfig>) {
		this.config = {
			enablePerformanceTracking: true,
			enableMemoryTracking: true,
			enableDetailedLogging: true,
			maxMetricsHistory: 1000,
			maxLogHistory: 5000,
			logLevel: "info",
			performanceThresholds: {
				slowOperation: 100, // 100ms
				memoryWarning: 50 * 1024 * 1024, // 50MB
				errorRate: 5, // 5%
			},
			autoCleanup: true,
			cleanupInterval: 5 * 60 * 1000, // 5分钟
			...config,
		};

		if (this.config.autoCleanup) {
			this.startCleanupTimer();
		}

		this.log("info", "PerformanceMonitor", "增强性能监控器已初始化", { config: this.config });
	}

	/**
	 * 开始性能监控
	 */
	startOperation(
		operation: string,
		metadata: {
			contentSize?: number;
			templateName?: string;
			method?: string;
			[key: string]: unknown;
		} = {}
	): string {
		if (!this.config.enablePerformanceTracking) {
			return "";
		}

		const operationId = this.generateId();
		const startTime = performance.now();

		this.activeOperations.set(operationId, {
			startTime,
			metadata: { ...metadata, operation },
		});

		this.log("debug", "Performance", `开始操作: ${operation}`, {
			operationId,
			metadata,
		});

		return operationId;
	}

	/**
	 * 结束性能监控
	 */
	endOperation(
		operationId: string,
		success = true,
		additionalData?: Record<string, unknown>
	): PerformanceMetric | null {
		if (!this.config.enablePerformanceTracking || !operationId) {
			return null;
		}

		const activeOp = this.activeOperations.get(operationId);
		if (!activeOp) {
			this.log("warn", "Performance", `未找到活动操作: ${operationId}`);
			return null;
		}

		const endTime = performance.now();
		const duration = endTime - activeOp.startTime;

		// 获取内存使用情况
		let memoryBefore: number | undefined;
		let memoryAfter: number | undefined;
		let memoryDelta: number | undefined;

		if (this.config.enableMemoryTracking) {
			const memoryInfo = this.getMemoryUsage();
			memoryAfter = memoryInfo.used;
			memoryBefore = memoryAfter - (additionalData?.memoryDelta || 0);
			memoryDelta = memoryAfter - memoryBefore;
		}

		const metric: PerformanceMetric = {
			id: operationId,
			operation: activeOp.metadata.operation || "unknown",
			startTime: activeOp.startTime,
			endTime,
			duration,
			contentSize: activeOp.metadata.contentSize || 0,
			templateName: activeOp.metadata.templateName || "unknown",
			method: activeOp.metadata.method || "unknown",
			success,
			memoryBefore,
			memoryAfter,
			memoryDelta,
			metadata: { ...activeOp.metadata, ...additionalData },
		};

		this.metrics.set(operationId, metric);
		this.activeOperations.delete(operationId);

		// 检查性能阈值
		this.checkPerformanceThresholds(metric);

		// 清理旧数据
		this.enforceHistoryLimits();

		this.log("debug", "Performance", `操作完成: ${metric.operation}`, {
			duration: `${duration.toFixed(2)}ms`,
			success,
			contentSize: metric.contentSize,
		});

		return metric;
	}

	/**
	 * 记录日志
	 */
	log(
		level: LogEntry["level"],
		category: string,
		message: string,
		data?: unknown,
		performanceId?: string
	): void {
		if (!this.config.enableDetailedLogging) {
			return;
		}

		// 检查日志级别
		const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
		if (levelPriority[level] < levelPriority[this.config.logLevel]) {
			return;
		}

		const logEntry: LogEntry = {
			id: this.generateId(),
			timestamp: Date.now(),
			level,
			category,
			message,
			data,
			performanceId,
		};

		// 对于错误级别，添加堆栈跟踪
		if (level === "error") {
			logEntry.stackTrace = new Error().stack;
		}

		this.logs.push(logEntry);

		// 输出到控制台
		this.outputToConsole(logEntry);

		// 清理旧日志
		this.enforceHistoryLimits();
	}

	/**
	 * 获取内存使用情况
	 */
	getMemoryUsage(): { used: number; total: number; percentage: number } {
		return getChromeMemoryUsageSnapshot();
	}

	/**
	 * 获取性能统计
	 */
	getPerformanceStats(): PerformanceStats {
		const metricsArray = Array.from(this.metrics.values());

		if (metricsArray.length === 0) {
			return this.getEmptyStats();
		}

		const durations = metricsArray.map((m) => m.duration).sort((a, b) => a - b);
		const successfulOps = metricsArray.filter((m) => m.success);
		const memoryUsages = metricsArray.map((m) => m.memoryDelta || 0).filter((_m) => _m > 0);

		const totalDuration = durations.reduce((sum, d) => sum + d, 0);
		const totalMemory = memoryUsages.reduce((sum, m) => sum + m, 0);

		const timeRange = {
			start: Math.min(...metricsArray.map((m) => m.startTime)),
			end: Math.max(...metricsArray.map((m) => m.endTime)),
			duration: 0,
		};
		timeRange.duration = timeRange.end - timeRange.start;

		return {
			totalOperations: metricsArray.length,
			successfulOperations: successfulOps.length,
			failedOperations: metricsArray.length - successfulOps.length,
			successRate: (successfulOps.length / metricsArray.length) * 100,
			averageDuration: totalDuration / metricsArray.length,
			minDuration: durations[0],
			maxDuration: durations[durations.length - 1],
			medianDuration: durations[Math.floor(durations.length / 2)],
			p95Duration: durations[Math.floor(durations.length * 0.95)],
			p99Duration: durations[Math.floor(durations.length * 0.99)],
			totalMemoryUsage: totalMemory,
			averageMemoryUsage: memoryUsages.length > 0 ? totalMemory / memoryUsages.length : 0,
			operationsPerSecond:
				timeRange.duration > 0 ? (metricsArray.length / timeRange.duration) * 1000 : 0,
			timeRange,
		};
	}

	/**
	 * 获取慢操作
	 */
	getSlowOperations(threshold?: number): PerformanceMetric[] {
		const slowThreshold = threshold || this.config.performanceThresholds.slowOperation;
		return Array.from(this.metrics.values())
			.filter((metric) => metric.duration > slowThreshold)
			.sort((a, b) => b.duration - a.duration);
	}

	/**
	 * 生成性能报告
	 */
	generatePerformanceReport(): string {
		const stats = this.getPerformanceStats();
		const slowOps = this.getSlowOperations();
		const errorLogs = this.logs.filter((log) => log.level === "error").slice(-10);

		const report = [];

		report.push("# 性能监控报告");
		report.push(`生成时间: ${new Date().toLocaleString("zh-CN")}`);
		report.push("");

		// 总体统计
		report.push("## 总体统计");
		report.push(`- 总操作数: ${stats.totalOperations}`);
		report.push(`- 成功操作: ${stats.successfulOperations}`);
		report.push(`- 失败操作: ${stats.failedOperations}`);
		report.push(`- 成功率: ${stats.successRate.toFixed(1)}%`);
		report.push(`- 平均耗时: ${stats.averageDuration.toFixed(2)}ms`);
		report.push(`- 最大耗时: ${stats.maxDuration.toFixed(2)}ms`);
		report.push(`- P95耗时: ${stats.p95Duration.toFixed(2)}ms`);
		report.push(`- 操作频率: ${stats.operationsPerSecond.toFixed(2)} ops/s`);
		report.push("");

		// 慢操作
		if (slowOps.length > 0) {
			report.push("## 慢操作 (前10个)");
			slowOps.slice(0, 10).forEach((op, index) => {
				report.push(
					`${index + 1}. ${op.operation} - ${op.duration.toFixed(2)}ms (${op.templateName})`
				);
			});
			report.push("");
		}

		// 错误日志
		if (errorLogs.length > 0) {
			report.push("## 最近错误 (前10个)");
			errorLogs.forEach((log, index) => {
				const time = new Date(log.timestamp).toLocaleString("zh-CN");
				report.push(`${index + 1}. [${time}] ${log.category}: ${log.message}`);
			});
			report.push("");
		}

		return report.join("\n");
	}

	/**
	 * 销毁监控器
	 */
	destroy(): void {
		if (this.cleanupTimer) {
			window.clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}

		this.metrics.clear();
		this.logs = [];
		this.activeOperations.clear();

		logger.debug("🔍 [EnhancedPerformanceMonitor] 增强性能监控器已销毁");
	}

	// 私有方法

	private checkPerformanceThresholds(metric: PerformanceMetric): void {
		if (metric.duration > this.config.performanceThresholds.slowOperation) {
			this.log("warn", "Performance", `检测到慢操作: ${metric.operation}`, {
				duration: `${metric.duration.toFixed(2)}ms`,
				threshold: `${this.config.performanceThresholds.slowOperation}ms`,
				templateName: metric.templateName,
			});
		}

		if (
			metric.memoryDelta &&
			metric.memoryDelta > this.config.performanceThresholds.memoryWarning
		) {
			this.log("warn", "Memory", `检测到高内存使用: ${metric.operation}`, {
				memoryDelta: `${(metric.memoryDelta / 1024 / 1024).toFixed(2)}MB`,
				threshold: `${(this.config.performanceThresholds.memoryWarning / 1024 / 1024).toFixed(
					2
				)}MB`,
			});
		}
	}

	private enforceHistoryLimits(): void {
		if (this.metrics.size > this.config.maxMetricsHistory) {
			const entries = Array.from(this.metrics.entries()).sort(
				([, a], [, b]) => a.startTime - b.startTime
			);

			const toRemove = this.metrics.size - this.config.maxMetricsHistory;
			for (let i = 0; i < toRemove; i++) {
				this.metrics.delete(entries[i][0]);
			}
		}

		if (this.logs.length > this.config.maxLogHistory) {
			this.logs = this.logs.slice(-this.config.maxLogHistory);
		}
	}

	private outputToConsole(logEntry: LogEntry): void {
		const timestamp = new Date(logEntry.timestamp).toLocaleTimeString("zh-CN");
		const prefix = `[${timestamp}] [${logEntry.level.toUpperCase()}] [${logEntry.category}]`;
		const message = `${prefix} ${logEntry.message}`;

		switch (logEntry.level) {
			case "debug":
				logger.debug(message, logEntry.data);
				break;
			case "info":
				logger.debug(message, logEntry.data);
				break;
			case "warn":
				logger.warn(message, logEntry.data);
				break;
			case "error":
				logger.error(message, logEntry.data);
				break;
		}
	}

	private getEmptyStats(): PerformanceStats {
		return {
			totalOperations: 0,
			successfulOperations: 0,
			failedOperations: 0,
			successRate: 0,
			averageDuration: 0,
			minDuration: 0,
			maxDuration: 0,
			medianDuration: 0,
			p95Duration: 0,
			p99Duration: 0,
			totalMemoryUsage: 0,
			averageMemoryUsage: 0,
			operationsPerSecond: 0,
			timeRange: { start: 0, end: 0, duration: 0 },
		};
	}

	private startCleanupTimer(): void {
		this.cleanupTimer = window.setInterval(() => {
			this.enforceHistoryLimits();
		}, this.config.cleanupInterval);
	}

	private generateId(): string {
		return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}
}

/**
 * 全局增强性能监控器实例
 */
let globalEnhancedMonitor: EnhancedPerformanceMonitor | null = null;

function getOrCreateWindowEnhancedMonitor(
	config?: Partial<MonitorConfig>
): EnhancedPerformanceMonitor {
	if (typeof window === "undefined") {
		if (!globalEnhancedMonitor) {
			globalEnhancedMonitor = new EnhancedPerformanceMonitor(config);
		}
		return globalEnhancedMonitor;
	}

	const w = window as unknown;
	if (w.__weaveEnhancedPerformanceMonitor) {
		return w.__weaveEnhancedPerformanceMonitor as EnhancedPerformanceMonitor;
	}

	const instance = new EnhancedPerformanceMonitor(config);
	w.__weaveEnhancedPerformanceMonitor = instance;
	w.__weaveEnhancedPerformanceMonitorCleanup = () => {
		try {
			(w.__weaveEnhancedPerformanceMonitor as EnhancedPerformanceMonitor | undefined)?.destroy();
		} catch { /* no-op */ }

		try {
			w.__weaveEnhancedPerformanceMonitor = undefined;
			w.__weaveEnhancedPerformanceMonitorCleanup = undefined;
		} catch {
			w.__weaveEnhancedPerformanceMonitor = null;
			w.__weaveEnhancedPerformanceMonitorCleanup = null;
		}
	};

	return instance;
}

/**
 * 获取全局增强性能监控器
 */
export function getGlobalEnhancedPerformanceMonitor(
	config?: Partial<MonitorConfig>
): EnhancedPerformanceMonitor {
	const monitor = getOrCreateWindowEnhancedMonitor(config);
	globalEnhancedMonitor = monitor;
	return monitor;
}

/**
 * 性能监控装饰器
 */
export function withPerformanceMonitoring(operation: string, monitor?: EnhancedPerformanceMonitor) {
	const monitorInstance = monitor || getGlobalEnhancedPerformanceMonitor();

	return function <T extends (...args: unknown[]) => unknown>(
		_target: unknown,
		propertyName: string,
		descriptor: TypedPropertyDescriptor<T>
	) {
		const method = descriptor.value!;

		descriptor.value = function (this: unknown, ...args: unknown[]) {
			const operationId = monitorInstance.startOperation(operation, {
				method: propertyName,
				args: args.length,
			});

			try {
				const result = method.apply(this, args);

				const thenFn = readUnknownProperty(result, "then");
				if (isCallable(thenFn)) {
					return Reflect.apply(thenFn, result, [
						(value: unknown) => {
							monitorInstance.endOperation(operationId, true);
							return value;
						},
						(error: unknown) => {
							monitorInstance.endOperation(operationId, false, {
								error: extractErrorMessage(error),
							});
							throw error;
						},
					]);
				} else {
					monitorInstance.endOperation(operationId, true);
					return result;
				}
			} catch (error) {
				monitorInstance.endOperation(operationId, false, {
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		} as T;

		return descriptor;
	};
}
