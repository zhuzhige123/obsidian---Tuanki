/**
 * 统一日志管理器
 * 职责：管理所有调试日志输出，根据用户设置控制是否显示
 *
 * 日志级别：
 * - debug: 调试信息（仅在调试模式开启时显示）
 * - info: 一般信息（仅在调试模式开启时显示）
 * - warn: 警告信息（始终显示）
 * - error: 错误信息（始终显示）
 */

/**
 * 日志管理器类
 */
export class Logger {
	private static instance: Logger | null = null;
	private debugMode = false;
	private enableTimestamp = true;
	private performanceMarks = new Map<string, number>();
	private verboseSilenceDepth = 0;

	private constructor() {}

	/**
	 * 获取单例实例
	 */
	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	/**
	 * 设置调试模式
	 * @param enabled 是否启用调试模式
	 */
	setDebugMode(enabled: boolean): void {
		this.debugMode = enabled;
	}

	/**
	 * 检查是否启用调试模式
	 */
	isDebugMode(): boolean {
		return this.debugMode;
	}

	/**
	 * 调试日志（仅在调试模式开启时显示）
	 * @param message 日志消息
	 * @param args 额外参数
	 */
	debug(message: string, ...args: unknown[]): void {
		if (this.isVerboseLoggingEnabled() && typeof console !== "undefined" && console.debug) {
			const prefix = this.formatPrefix("DEBUG");
			console.debug(`${prefix} ${message}`, ...args);
		}
	}

	/**
	 * 信息日志（仅在调试模式开启时显示）
	 * @param message 日志消息
	 * @param args 额外参数
	 */
	info(message: string, ...args: unknown[]): void {
		if (this.isVerboseLoggingEnabled() && typeof console !== "undefined" && console.debug) {
			const prefix = this.formatPrefix("INFO");
			console.debug(`${prefix} ${message}`, ...args);
		}
	}

	/**
	 * 警告日志（始终显示）
	 * @param message 日志消息
	 * @param args 额外参数
	 */
	warn(message: string, ...args: unknown[]): void {
		if (typeof console !== "undefined" && console.warn) {
			const prefix = this.formatPrefix("WARN");
			console.warn(`${prefix} ${message}`, ...args);
		}
	}

	/**
	 * 错误日志（始终显示）
	 * @param message 日志消息
	 * @param args 额外参数
	 */
	error(message: string, ...args: unknown[]): void {
		if (typeof console !== "undefined" && console.error) {
			const prefix = this.formatPrefix("ERROR");
			console.error(`${prefix} ${message}`, ...args);
		}
	}

	/**
	 * 带标签的调试日志（便于分类）
	 * @param tag 标签（通常是模块名）
	 * @param message 日志消息
	 * @param args 额外参数
	 */
	debugWithTag(tag: string, message: string, ...args: unknown[]): void {
		if (this.isVerboseLoggingEnabled() && typeof console !== "undefined" && console.debug) {
			const prefix = this.formatPrefix("DEBUG", tag);
			console.debug(`${prefix} ${message}`, ...args);
		}
	}

	/**
	 * 带标签的信息日志
	 * @param tag 标签（通常是模块名）
	 * @param message 日志消息
	 * @param args 额外参数
	 */
	infoWithTag(tag: string, message: string, ...args: unknown[]): void {
		if (this.isVerboseLoggingEnabled() && typeof console !== "undefined" && console.debug) {
			const prefix = this.formatPrefix("INFO", tag);
			console.debug(`${prefix} ${message}`, ...args);
		}
	}

	suspendVerboseLogs(): void {
		this.verboseSilenceDepth++;
	}

	resumeVerboseLogs(): void {
		this.verboseSilenceDepth = Math.max(0, this.verboseSilenceDepth - 1);
	}

	private isVerboseLoggingEnabled(): boolean {
		return this.debugMode && this.verboseSilenceDepth === 0;
	}

	/**
	 * 格式化日志前缀（私有方法）
	 * @param level 日志级别
	 * @param tag 可选标签
	 */
	private formatPrefix(level: string, tag?: string): string {
		const timestamp = this.enableTimestamp ? `[${new Date().toISOString().substring(11, 23)}]` : "";
		const tagStr = tag ? `[${tag}]` : "";
		return `${timestamp}[${level}]${tagStr}`;
	}

	/**
	 * 开始性能计时
	 * @param label 计时标签
	 */
	startTimer(label: string): void {
		if (this.debugMode) {
			this.performanceMarks.set(label, performance.now());
		}
	}

	/**
	 * 结束性能计时并返回耗时（毫秒）
	 * @param label 计时标签
	 * @returns 耗时（毫秒），如果未找到开始时间则返回-1
	 */
	endTimer(label: string): number {
		if (!this.debugMode) return -1;

		const startTime = this.performanceMarks.get(label);
		if (startTime === undefined) {
			this.warn(`Performance timer "${label}" was not started`);
			return -1;
		}

		const elapsed = performance.now() - startTime;
		this.performanceMarks.delete(label);
		this.debug(`⏱️ ${label}: ${elapsed.toFixed(2)}ms`);
		return elapsed;
	}
}

/**
 * 全局日志实例（导出便捷方法）
 */
const logger = Logger.getInstance();

/**
 * 便捷的日志函数
 */
export const logDebug = (message: string, ...args: unknown[]) => logger.debug(message, ...args);
export const logInfo = (message: string, ...args: unknown[]) => logger.info(message, ...args);
export const logWarn = (message: string, ...args: unknown[]) => logger.warn(message, ...args);
export const logError = (message: string, ...args: unknown[]) => logger.error(message, ...args);
export const logDebugWithTag = (tag: string, message: string, ...args: unknown[]) =>
	logger.debugWithTag(tag, message, ...args);
export const logInfoWithTag = (tag: string, message: string, ...args: unknown[]) =>
	logger.infoWithTag(tag, message, ...args);

/**
 * 性能追踪便捷函数
 */
export const startTimer = (label: string) => logger.startTimer(label);
export const endTimer = (label: string) => logger.endTimer(label);

/**
 * 导出日志管理器实例（用于设置调试模式）
 */
export { logger };
