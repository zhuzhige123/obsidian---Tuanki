import { isCallable, readUnknownProperty } from "./dynamic-access";
import { logger } from "../utils/logger";
/**
 * 统一错误处理器
 * 提供统一的错误处理、分类、恢复和监控机制
 *
 * 功能：
 * 1. 错误分类和严重程度评估
 * 2. 自动错误恢复策略
 * 3. 错误监控和报告
 * 4. 渐进式降级支持
 */

/**
 * 错误类型枚举
 */
export enum ErrorType {
	INITIALIZATION = "initialization",
	EXTENSION = "extension",
	PREVIEW = "preview",
	COMMAND = "command",
	THEME = "theme",
	NETWORK = "network",
	VALIDATION = "validation",
	UNKNOWN = "unknown",
}

/**
 * 错误严重程度枚举
 */
export enum ErrorSeverity {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

/**
 * 错误上下文接口
 */
export interface ErrorContext {
	type: ErrorType;
	operation: string;
	editorId?: string;
	componentName?: string;
	timestamp: number;
	additionalInfo?: Record<string, unknown>;
	stackTrace?: string;
}

/**
 * 编辑器错误接口
 */
export interface EditorError {
	id: string;
	message: string;
	originalError: Error;
	context: ErrorContext;
	severity: ErrorSeverity;
	recoverable: boolean;
	retryCount: number;
	maxRetries: number;
	timestamp: number;
}

/**
 * 错误恢复策略接口
 */
export interface ErrorRecoveryStrategy {
	canRecover(error: EditorError): boolean;
	recover(error: EditorError): Promise<boolean>;
	getDescription(): string;
}

/**
 * 错误监听器接口
 */
export interface ErrorListener {
	onError(error: EditorError): void;
	onRecovery(error: EditorError, success: boolean): void;
}

/**
 * 统一错误处理器类
 * 单例模式，提供全局统一的错误处理
 */
export class UnifiedErrorHandler {
	private static instance: UnifiedErrorHandler;
	private errorHistory: EditorError[] = [];
	private listeners: ErrorListener[] = [];
	private recoveryStrategies = new Map<ErrorType, ErrorRecoveryStrategy[]>();
	private errorCounter = 0;
	private readonly maxHistorySize = 100;

	private windowUnhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;
	private windowErrorHandler: ((event: ErrorEvent) => void) | null = null;
	private hasGlobalHandlers = false;

	// 错误频率限制
	private errorFrequencyMap = new Map<string, { count: number; lastOccurrence: number }>();
	private readonly maxErrorsPerMinute = 10;
	private readonly errorCooldownMs = 60000; // 1分钟

	private constructor() {
		this.setupDefaultRecoveryStrategies();
		this.setupGlobalErrorHandlers();
	}

	/**
	 * 获取单例实例
	 */
	static getInstance(): UnifiedErrorHandler {
		if (typeof window !== "undefined") {
			const cached = window.__weaveUnifiedErrorHandler;
			if (cached) {
				return cached;
			}
		}

		if (!UnifiedErrorHandler.instance) {
			try {
				UnifiedErrorHandler.instance = new UnifiedErrorHandler();
			} catch (error) {
				logger.error("[UnifiedErrorHandler] Failed to create instance:", error);
				// 创建一个最小化的实例作为后备
				UnifiedErrorHandler.instance = UnifiedErrorHandler.createFallbackInstance();
			}

			if (typeof window !== "undefined") {
				window.__weaveUnifiedErrorHandler = UnifiedErrorHandler.instance;
				window.__weaveUnifiedErrorHandlerCleanup = () => {
					try {
						window.__weaveUnifiedErrorHandler?.destroy();
					} catch { /* no-op */ }

					try {
						window.__weaveUnifiedErrorHandler = undefined;
						window.__weaveUnifiedErrorHandlerCleanup = undefined;
					} catch {
						window.__weaveUnifiedErrorHandler = null;
						window.__weaveUnifiedErrorHandlerCleanup = null;
					}
				};
			}
		}
		return UnifiedErrorHandler.instance;
	}

	/**
	 * 创建后备实例（当正常初始化失败时使用）
	 */
	private static createFallbackInstance(): UnifiedErrorHandler {
		return Object.assign(Object.create(UnifiedErrorHandler.prototype), {
			errorHistory: [],
			listeners: [],
			recoveryStrategies: new Map(),
			errorCounter: 0,
			maxHistorySize: 100,
			errorFrequencyMap: new Map(),
			maxErrorsPerMinute: 10,
			errorCooldownMs: 60000,
		}) as unknown as UnifiedErrorHandler;
	}

	/**
	 * 处理错误
	 */
	async handleError(
		originalError: Error,
		context: Partial<ErrorContext>,
		options: {
			autoRecover?: boolean;
			maxRetries?: number;
			suppressLogging?: boolean;
		} = {}
	): Promise<EditorError> {
		// 防护措施：确保this上下文正确
		if (!this) {
			logger.error("[UnifiedErrorHandler] Invalid context. Falling back to basic error handling.");
			return EditorRecoveryStrategies.createFallbackError(originalError, context);
		}

		const { autoRecover = true, maxRetries = 3, suppressLogging = false } = options;

		try {
			// 检查错误频率限制
			const errorKey = `${context.type || "unknown"}-${context.operation || "unknown"}-${
				context.editorId || "global"
			}`;
			if (this.isErrorRateLimited(errorKey)) {
				logger.warn(`[ErrorHandler] 错误频率过高，跳过处理: ${errorKey}`);
				// 返回一个简化的错误对象，不进行恢复处理
				return this.createSimplifiedError(originalError, context);
			}
		} catch (rateLimitError) {
			logger.error("[UnifiedErrorHandler] Rate limit check failed:", rateLimitError);
			// 如果频率限制检查失败，继续处理但记录警告
		}

		// 创建完整的错误对象
		const editorError = this.createEditorError(originalError, context, maxRetries);

		// 记录错误
		if (!suppressLogging) {
			this.logError(editorError);
		}

		// 添加到历史记录
		this.addToHistory(editorError);

		// 通知监听器
		this.notifyErrorListeners(editorError);

		// 尝试自动恢复
		if (autoRecover && editorError.recoverable) {
			const recovered = await this.attemptRecovery(editorError);
			this.notifyRecoveryListeners(editorError, recovered);

			if (!recovered && editorError.retryCount < editorError.maxRetries) {
				// 增加重试次数并重新处理
				editorError.retryCount++;
				logger.warn(
					`[ErrorHandler] 重试错误处理 (${editorError.retryCount}/${editorError.maxRetries}):`,
					editorError.id
				);

				// 添加延迟避免无限循环和性能问题
				await new Promise((resolve) =>
					window.setTimeout(resolve, Math.min(1000 * editorError.retryCount, 5000))
				);

				// 修复递归调用，传递正确的参数
				return this.handleError(originalError, context, {
					...options,
					maxRetries: editorError.maxRetries - editorError.retryCount,
				});
			}
		}

		return editorError;
	}

	/**
	 * 创建编辑器错误对象
	 */
	private createEditorError(
		originalError: Error,
		context: Partial<ErrorContext>,
		maxRetries: number
	): EditorError {
		const errorId = this.generateErrorId();
		const errorType = this.determineErrorType(originalError, context);
		const severity = this.determineSeverity(originalError, context, errorType);

		const fullContext: ErrorContext = {
			type: errorType,
			operation: context.operation || "unknown",
			editorId: context.editorId,
			componentName: context.componentName,
			timestamp: Date.now(),
			additionalInfo: context.additionalInfo || {},
			stackTrace: originalError.stack,
			...context,
		};

		return {
			id: errorId,
			message: originalError.message,
			originalError,
			context: fullContext,
			severity,
			recoverable: this.isRecoverable(errorType, severity),
			retryCount: 0,
			maxRetries,
			timestamp: Date.now(),
		};
	}

	/**
	 * 生成错误ID
	 */
	private generateErrorId(): string {
		return `error-${Date.now()}-${++this.errorCounter}`;
	}

	/**
	 * 确定错误类型
	 */
	private determineErrorType(error: Error, context: Partial<ErrorContext>): ErrorType {
		if (context.type) {
			return context.type;
		}

		const message = error.message.toLowerCase();
		const stack = error.stack?.toLowerCase() || "";

		// 基于错误消息和堆栈的启发式分类
		if (message.includes("initialization") || message.includes("init")) {
			return ErrorType.INITIALIZATION;
		}
		if (message.includes("extension") || stack.includes("extension")) {
			return ErrorType.EXTENSION;
		}
		if (message.includes("preview") || message.includes("render")) {
			return ErrorType.PREVIEW;
		}
		if (message.includes("command") || message.includes("cmd")) {
			return ErrorType.COMMAND;
		}
		if (message.includes("theme") || message.includes("style")) {
			return ErrorType.THEME;
		}
		if (message.includes("network") || message.includes("fetch") || message.includes("request")) {
			return ErrorType.NETWORK;
		}
		if (message.includes("validation") || message.includes("invalid")) {
			return ErrorType.VALIDATION;
		}

		return ErrorType.UNKNOWN;
	}

	/**
	 * 确定错误严重程度
	 */
	private determineSeverity(
		error: Error,
		context: Partial<ErrorContext>,
		errorType: ErrorType
	): ErrorSeverity {
		// 基于错误类型的默认严重程度
		const typeSeverityMap: Record<ErrorType, ErrorSeverity> = {
			[ErrorType.INITIALIZATION]: ErrorSeverity.CRITICAL,
			[ErrorType.EXTENSION]: ErrorSeverity.HIGH,
			[ErrorType.PREVIEW]: ErrorSeverity.MEDIUM,
			[ErrorType.COMMAND]: ErrorSeverity.MEDIUM,
			[ErrorType.THEME]: ErrorSeverity.LOW,
			[ErrorType.NETWORK]: ErrorSeverity.MEDIUM,
			[ErrorType.VALIDATION]: ErrorSeverity.LOW,
			[ErrorType.UNKNOWN]: ErrorSeverity.MEDIUM,
		};

		let severity = typeSeverityMap[errorType];

		// 基于错误消息调整严重程度
		const message = error.message.toLowerCase();
		if (message.includes("critical") || message.includes("fatal")) {
			severity = ErrorSeverity.CRITICAL;
		} else if (message.includes("warning") || message.includes("minor")) {
			severity = ErrorSeverity.LOW;
		}

		// 基于上下文调整严重程度
		if (context.operation === "startup" || context.operation === "initialization") {
			severity = ErrorSeverity.CRITICAL;
		}

		return severity;
	}

	/**
	 * 判断错误是否可恢复
	 */
	private isRecoverable(errorType: ErrorType, severity: ErrorSeverity): boolean {
		// 严重错误通常不可恢复
		if (severity === ErrorSeverity.CRITICAL) {
			return errorType !== ErrorType.INITIALIZATION;
		}

		// 大部分错误都是可恢复的
		return true;
	}

	/**
	 * 记录错误
	 */
	private logError(error: EditorError): void {
		const logLevel = this.getLogLevel(error.severity);
		const logMessage = `[${error.context.type.toUpperCase()}] ${error.message}`;
		const logDetails = {
			id: error.id,
			operation: error.context.operation,
			editorId: error.context.editorId,
			componentName: error.context.componentName,
			severity: error.severity,
			recoverable: error.recoverable,
			additionalInfo: error.context.additionalInfo,
		};

		switch (logLevel) {
			case "error":
				logger.error(logMessage, logDetails, error.originalError);
				break;
			case "warn":
				logger.warn(logMessage, logDetails);
				break;
			case "info":
				logger.info(logMessage, logDetails);
				break;
			default:
				logger.debug(logMessage, logDetails);
		}
	}

	/**
	 * 获取日志级别
	 */
	private getLogLevel(severity: ErrorSeverity): "error" | "warn" | "info" | "log" {
		switch (severity) {
			case ErrorSeverity.CRITICAL:
			case ErrorSeverity.HIGH:
				return "error";
			case ErrorSeverity.MEDIUM:
				return "warn";
			case ErrorSeverity.LOW:
				return "info";
			default:
				return "log";
		}
	}

	/**
	 * 添加到历史记录
	 */
	private addToHistory(error: EditorError): void {
		this.errorHistory.unshift(error);

		// 限制历史记录大小
		if (this.errorHistory.length > this.maxHistorySize) {
			this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
		}
	}

	/**
	 * 通知错误监听器
	 */
	private notifyErrorListeners(error: EditorError): void {
		for (const listener of this.listeners) {
			try {
				listener.onError(error);
			} catch (listenerError) {
				logger.error("[ErrorHandler] 监听器执行失败:", listenerError);
			}
		}
	}

	/**
	 * 通知恢复监听器
	 */
	private notifyRecoveryListeners(error: EditorError, success: boolean): void {
		for (const listener of this.listeners) {
			try {
				listener.onRecovery(error, success);
			} catch (listenerError) {
				logger.error("[ErrorHandler] 恢复监听器执行失败:", listenerError);
			}
		}
	}

	/**
	 * 尝试错误恢复
	 */
	private async attemptRecovery(error: EditorError): Promise<boolean> {
		const strategies = this.recoveryStrategies.get(error.context.type) || [];

		for (const strategy of strategies) {
			if (strategy.canRecover(error)) {
				try {
					logger.info(`[ErrorHandler] 尝试恢复策略: ${strategy.getDescription()}`);
					const success = await strategy.recover(error);

					if (success) {
						logger.info(`[ErrorHandler] 恢复成功: ${error.id}`);
						return true;
					}
				} catch (recoveryError) {
					logger.error("[ErrorHandler] 恢复策略失败:", recoveryError);
				}
			}
		}

		logger.warn(`[ErrorHandler] 所有恢复策略都失败: ${error.id}`);
		return false;
	}

	/**
	 * 设置默认恢复策略
	 */
	private setupDefaultRecoveryStrategies(): void {
		// 初始化错误恢复策略
		this.addRecoveryStrategy(ErrorType.INITIALIZATION, {
			canRecover: (error) => error.severity !== ErrorSeverity.CRITICAL,
			recover: async (_error) => {
				logger.debug("[Recovery] 尝试基础配置重新初始化");
				// 这里会在具体实现中调用编辑器的基础初始化
				return false; // 需要具体实现
			},
			getDescription: () => "基础配置重新初始化",
		});

		// 扩展错误恢复策略
		this.addRecoveryStrategy(ErrorType.EXTENSION, {
			canRecover: (_error) => true,
			recover: async (_error) => {
				logger.debug("[Recovery] 尝试禁用有问题的扩展");
				// 这里会在具体实现中禁用有问题的扩展
				return false; // 需要具体实现
			},
			getDescription: () => "禁用有问题的扩展",
		});

		// 预览错误恢复策略
		this.addRecoveryStrategy(ErrorType.PREVIEW, {
			canRecover: (_error) => true,
			recover: async (_error) => {
				logger.debug("[Recovery] 尝试重置预览组件");
				// 这里会在具体实现中重置预览组件
				return false; // 需要具体实现
			},
			getDescription: () => "重置预览组件",
		});

		// 验证错误恢复策略
		this.addRecoveryStrategy(ErrorType.VALIDATION, {
			canRecover: (error) => error.severity !== ErrorSeverity.CRITICAL,
			recover: async (error) => {
				logger.debug("[Recovery] 尝试数据验证恢复");

				// 触发数据验证恢复事件
				const event = new CustomEvent("validation-recovery", {
					detail: {
						errorId: error.id,
						context: error.context,
						operation: error.context.operation,
					},
				});
				activeDocument.dispatchEvent(event);

				return true; // 假设验证恢复总是成功的
			},
			getDescription: () => "数据验证恢复",
		});
	}

	/**
	 * 设置全局错误处理器
	 */
	private setupGlobalErrorHandlers(): void {
		if (this.hasGlobalHandlers) return;
		if (typeof window === "undefined") return;

		// 确保正确绑定this上下文的处理函数
		this.windowUnhandledRejectionHandler = (event: PromiseRejectionEvent) => {
			try {
				void this.handleError(new Error(`Unhandled Promise Rejection: ${event.reason}`), {
					type: ErrorType.UNKNOWN,
					operation: "unhandled-promise-rejection",
					additionalInfo: { reason: event.reason },
				});
			} catch (error) {
				logger.error("[UnifiedErrorHandler] Failed to handle unhandled rejection:", error);
			}
		};

		this.windowErrorHandler = (event: ErrorEvent) => {
			try {
				const error =
					event.error instanceof Error
						? event.error
						: new Error(typeof event.message === "string" ? event.message : "Global error");
				void this.handleError(error, {
					type: ErrorType.UNKNOWN,
					operation: "global-error",
					additionalInfo: {
						filename: event.filename,
						lineno: event.lineno,
						colno: event.colno,
					},
				});
			} catch (error) {
				logger.error("[UnifiedErrorHandler] Failed to handle global error:", error);
			}
		};

		// 捕获未处理的Promise拒绝
		if (this.windowUnhandledRejectionHandler) {
			window.addEventListener("unhandledrejection", this.windowUnhandledRejectionHandler);
		}

		// 捕获全局错误
		if (this.windowErrorHandler) {
			window.addEventListener("error", this.windowErrorHandler);
		}

		this.hasGlobalHandlers = true;
	}

	private removeGlobalErrorHandlers(): void {
		if (!this.hasGlobalHandlers) return;
		if (typeof window === "undefined") return;

		if (this.windowUnhandledRejectionHandler) {
			window.removeEventListener("unhandledrejection", this.windowUnhandledRejectionHandler);
		}

		if (this.windowErrorHandler) {
			window.removeEventListener("error", this.windowErrorHandler);
		}

		this.windowUnhandledRejectionHandler = null;
		this.windowErrorHandler = null;
		this.hasGlobalHandlers = false;
	}

	destroy(): void {
		this.removeGlobalErrorHandlers();
		this.listeners.length = 0;
		this.errorHistory.length = 0;
		this.errorFrequencyMap.clear();
		this.recoveryStrategies.clear();

		try {
			if (typeof window !== "undefined" && window.__weaveUnifiedErrorHandler === this) {
				window.__weaveUnifiedErrorHandler = undefined;
			}
		} catch { /* no-op */ }

		UnifiedErrorHandler.instance = null as unknown as UnifiedErrorHandler;
	}

	/**
	 * 添加错误监听器
	 */
	addListener(listener: ErrorListener): () => void {
		this.listeners.push(listener);

		return () => {
			const index = this.listeners.indexOf(listener);
			if (index > -1) {
				this.listeners.splice(index, 1);
			}
		};
	}

	/**
	 * 添加恢复策略
	 */
	addRecoveryStrategy(errorType: ErrorType, strategy: ErrorRecoveryStrategy): void {
		if (!this.recoveryStrategies.has(errorType)) {
			this.recoveryStrategies.set(errorType, []);
		}
		this.recoveryStrategies.get(errorType)?.push(strategy);
	}

	/**
	 * 获取错误历史
	 */
	getErrorHistory(): EditorError[] {
		return [...this.errorHistory];
	}

	/**
	 * 获取错误统计
	 */
	getErrorStats(): {
		total: number;
		byType: Record<ErrorType, number>;
		bySeverity: Record<ErrorSeverity, number>;
		recentErrors: EditorError[];
	} {
		const byType = {} as Record<ErrorType, number>;
		const bySeverity = {} as Record<ErrorSeverity, number>;

		for (const error of this.errorHistory) {
			byType[error.context.type] = (byType[error.context.type] || 0) + 1;
			bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
		}

		return {
			total: this.errorHistory.length,
			byType,
			bySeverity,
			recentErrors: this.errorHistory.slice(0, 10),
		};
	}

	/**
	 * 清理错误历史
	 */
	clearHistory(): void {
		this.errorHistory = [];
		logger.info("[ErrorHandler] 错误历史已清理");
	}

	/**
	 * 检查错误是否受频率限制
	 */
	private isErrorRateLimited(errorKey: string): boolean {
		const now = Date.now();
		const errorInfo = this.errorFrequencyMap.get(errorKey);

		if (!errorInfo) {
			// 首次出现该错误
			this.errorFrequencyMap.set(errorKey, { count: 1, lastOccurrence: now });
			return false;
		}

		// 检查是否超过冷却时间
		if (now - errorInfo.lastOccurrence > this.errorCooldownMs) {
			// 重置计数器
			this.errorFrequencyMap.set(errorKey, { count: 1, lastOccurrence: now });
			return false;
		}

		// 增加计数
		errorInfo.count++;
		errorInfo.lastOccurrence = now;

		// 检查是否超过频率限制
		return errorInfo.count > this.maxErrorsPerMinute;
	}

	/**
	 * 创建简化的错误对象（用于频率限制情况）
	 */
	private createSimplifiedError(originalError: Error, context: Partial<ErrorContext>): EditorError {
		const errorType = this.determineErrorType(originalError, context);
		const severity = this.determineSeverity(originalError, context, errorType);

		return {
			id: `error-${Date.now()}-${++this.errorCounter}`,
			message: originalError.message,
			originalError,
			context: {
				type: errorType,
				operation: context.operation || "unknown",
				editorId: context.editorId,
				componentName: context.componentName,
				timestamp: Date.now(),
				additionalInfo: context.additionalInfo,
				stackTrace: originalError.stack,
			},
			severity,
			recoverable: false, // 频率限制的错误不进行恢复
			retryCount: 0,
			maxRetries: 0,
			timestamp: Date.now(),
		};
	}
}

/**
 * 编辑器特定的错误恢复策略
 * 静态方法集合，不需要实例化
 */
export abstract class EditorRecoveryStrategies {
	// 抽象类，无法实例化，只能使用静态方法
	/**
	 * 创建初始化错误恢复策略
	 */
	static createInitializationRecovery(): ErrorRecoveryStrategy {
		return {
			canRecover: (error) => error.severity !== ErrorSeverity.CRITICAL,
			recover: async (error) => {
				try {
					logger.debug("[Recovery] 尝试使用基础配置重新初始化编辑器");

					// 获取编辑器ID
					const editorId = error.context.editorId;
					if (!editorId) {
						return false;
					}

					// 这里需要与具体的编辑器实例交互
					// 实际实现中会调用编辑器的重新初始化方法
					const success = await EditorRecoveryStrategies.reinitializeWithBasicConfig(editorId);
					return success;
				} catch (recoveryError) {
					logger.error("[Recovery] 初始化恢复失败:", recoveryError);
					return false;
				}
			},
			getDescription: () => "使用基础配置重新初始化编辑器",
		};
	}

	/**
	 * 创建扩展错误恢复策略
	 */
	static createExtensionRecovery(): ErrorRecoveryStrategy {
		return {
			canRecover: (_error) => true,
			recover: async (error) => {
				try {
					logger.debug("[Recovery] 尝试禁用有问题的扩展并重新加载");

					const editorId = error.context.editorId;
					if (!editorId) {
						return false;
					}

					// 禁用有问题的扩展
					const success = await EditorRecoveryStrategies.disableProblematicExtensions(
						editorId,
						error
					);
					return success;
				} catch (recoveryError) {
					logger.error("[Recovery] 扩展恢复失败:", recoveryError);
					return false;
				}
			},
			getDescription: () => "禁用有问题的扩展并重新加载",
		};
	}

	/**
	 * 创建预览错误恢复策略
	 */
	static createPreviewRecovery(): ErrorRecoveryStrategy {
		return {
			canRecover: (_error) => true,
			recover: async (error) => {
				try {
					logger.debug("[Recovery] 尝试重置预览组件");

					const editorId = error.context.editorId;
					if (!editorId) {
						return false;
					}

					// 重置预览组件
					const success = await EditorRecoveryStrategies.resetPreviewComponent(editorId);
					return success;
				} catch (recoveryError) {
					logger.error("[Recovery] 预览恢复失败:", recoveryError);
					return false;
				}
			},
			getDescription: () => "重置预览组件",
		};
	}

	/**
	 * 创建主题错误恢复策略
	 */
	static createThemeRecovery(): ErrorRecoveryStrategy {
		return {
			canRecover: (_error) => true,
			recover: async (error) => {
				try {
					logger.debug("[Recovery] 尝试重置主题配置");

					const editorId = error.context.editorId;
					if (!editorId) {
						return false;
					}

					// 重置主题配置
					const success = await EditorRecoveryStrategies.resetThemeConfiguration(editorId);
					return success;
				} catch (recoveryError) {
					logger.error("[Recovery] 主题恢复失败:", recoveryError);
					return false;
				}
			},
			getDescription: () => "重置主题配置",
		};
	}

	/**
	 * 使用基础配置重新初始化编辑器
	 */
	static async reinitializeWithBasicConfig(editorId?: string): Promise<boolean> {
		try {
			logger.debug(`[Recovery] 重新初始化编辑器: ${editorId}`);

			// 尝试清理现有的编辑器实例
			const editorElement = activeDocument.querySelector(`[data-editor-id="${editorId}"]`);
			if (editorElement) {
				// 清理现有的CodeMirror实例
				const cmInstance = readUnknownProperty(editorElement, "CodeMirror");
				const toTextArea = readUnknownProperty(cmInstance, "toTextArea");
				if (isCallable(toTextArea)) {
					Reflect.apply(toTextArea, cmInstance, []);
				}
			}

			// 等待DOM清理完成
			await new Promise((resolve) => window.setTimeout(resolve, 50));

			// 触发重新初始化事件
			const event = new CustomEvent("editor-reinitialize", {
				detail: { editorId, config: "basic" },
			});
			activeDocument.dispatchEvent(event);

			logger.debug(`[Recovery] 编辑器重新初始化完成: ${editorId}`);
			return true;
		} catch (error) {
			logger.error(`[Recovery] 编辑器重新初始化失败: ${editorId}`, error);
			return false;
		}
	}

	/**
	 * 禁用有问题的扩展
	 */
	static async disableProblematicExtensions(
		editorId?: string,
		error?: EditorError
	): Promise<boolean> {
		try {
			logger.debug(`[Recovery] 禁用有问题的扩展: ${editorId}`);

			// 分析错误信息，确定有问题的扩展
			const problematicExtensions = error
				? EditorRecoveryStrategies.identifyProblematicExtensions(error)
				: [];

			if (problematicExtensions.length === 0) {
				logger.debug("[Recovery] 未发现有问题的扩展，尝试重置所有扩展");

				// 触发扩展重置事件
				const event = new CustomEvent("editor-reset-extensions", {
					detail: { editorId, action: "reset-all" },
				});
				activeDocument.dispatchEvent(event);
				return true;
			}

			// 禁用特定的有问题扩展
			const event = new CustomEvent("editor-disable-extensions", {
				detail: { editorId, extensions: problematicExtensions },
			});
			activeDocument.dispatchEvent(event);

			logger.debug("[Recovery] 已禁用扩展:", problematicExtensions);
			return true;
		} catch (error) {
			logger.error(`[Recovery] 禁用扩展失败: ${editorId}`, error);
			return false;
		}
	}

	/**
	 * 重置预览组件
	 */
	static async resetPreviewComponent(editorId?: string): Promise<boolean> {
		try {
			logger.debug(`[Recovery] 重置预览组件: ${editorId}`);

			// 查找预览容器并清理
			const previewElements = activeDocument.querySelectorAll(
				`[data-editor-id="${editorId}"] .unified-preview`
			);
			previewElements.forEach((_element) => {
				// /skip innerHTML = '' is used to clear preview container during error recovery
				_element.replaceChildren();
				_element.classList.remove("error", "loading");
			});

			// 触发预览重置事件
			const event = new CustomEvent("editor-reset-preview", {
				detail: { editorId },
			});
			activeDocument.dispatchEvent(event);

			logger.debug(`[Recovery] 预览组件重置完成: ${editorId}`);
			return true;
		} catch (error) {
			logger.error(`[Recovery] 预览组件重置失败: ${editorId}`, error);
			return false;
		}
	}

	/**
	 * 重置主题配置
	 */
	static async resetThemeConfiguration(editorId?: string): Promise<boolean> {
		try {
			logger.debug(`[Recovery] 重置主题配置: ${editorId}`);

			// 移除可能有问题的主题类
			const editorElement = activeDocument.querySelector(`[data-editor-id="${editorId}"]`);
			if (editorElement) {
				// 移除所有主题相关的类
				const themeClasses = Array.from(editorElement.classList).filter(
					(cls) =>
						cls.includes("theme-") ||
						cls.includes("cm-") ||
						cls.includes("dark") ||
						cls.includes("light")
				);
				themeClasses.forEach((cls) => editorElement.classList.remove(cls));

				// 添加默认主题类
				editorElement.classList.add("theme-default");
			}

			// 触发主题重置事件
			const event = new CustomEvent("editor-reset-theme", {
				detail: { editorId, theme: "default" },
			});
			activeDocument.dispatchEvent(event);

			logger.debug(`[Recovery] 主题配置重置完成: ${editorId}`);
			return true;
		} catch (error) {
			logger.error(`[Recovery] 主题配置重置失败: ${editorId}`, error);
			return false;
		}
	}

	/**
	 * 识别有问题的扩展
	 */
	static identifyProblematicExtensions(error: EditorError | undefined): string[] {
		if (!error) {
			return [];
		}
		const extensions: string[] = [];
		const message = error.message.toLowerCase();
		const stack = error.originalError.stack?.toLowerCase() || "";

		// 基于错误信息识别可能有问题的扩展
		if (message.includes("markdown") || stack.includes("markdown")) {
			extensions.push("markdown");
		}
		if (message.includes("vim") || stack.includes("vim")) {
			extensions.push("vim");
		}
		if (message.includes("emacs") || stack.includes("emacs")) {
			extensions.push("emacs");
		}
		if (message.includes("autocomplete") || stack.includes("autocomplete")) {
			extensions.push("autocomplete");
		}
		if (message.includes("search") || stack.includes("search")) {
			extensions.push("search");
		}

		return extensions;
	}

	/**
	 * 创建后备错误对象（静态方法）
	 */
	static createFallbackError(originalError: Error, context: Partial<ErrorContext>): EditorError {
		return {
			id: `fallback-error-${Date.now()}`,
			message: originalError.message || "Unknown error",
			originalError,
			context: {
				type: ErrorType.UNKNOWN,
				operation: context.operation || "unknown",
				editorId: context.editorId || "unknown",
				componentName: context.componentName || "unknown",
				timestamp: Date.now(),
				additionalInfo: context.additionalInfo || {},
				stackTrace: originalError.stack || "No stack trace available",
			},
			severity: ErrorSeverity.HIGH,
			recoverable: false,
			retryCount: 0,
			maxRetries: 0,
			timestamp: Date.now(),
		};
	}

	/**
	 * 创建基础错误对象（用于上下文丢失的紧急情况）
	 */
	static createBasicError(originalError: Error, context: Partial<ErrorContext>): EditorError {
		return {
			id: `basic-error-${Date.now()}`,
			message: originalError.message || "Unknown error",
			originalError,
			context: {
				type: ErrorType.UNKNOWN,
				operation: context.operation || "unknown",
				editorId: context.editorId || "unknown",
				componentName: context.componentName || "unknown",
				timestamp: Date.now(),
				additionalInfo: context.additionalInfo || {},
				stackTrace: originalError.stack || "No stack trace available",
			},
			severity: ErrorSeverity.HIGH,
			recoverable: false,
			retryCount: 0,
			maxRetries: 0,
			timestamp: Date.now(),
		};
	}
}
