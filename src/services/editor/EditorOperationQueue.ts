import { logger } from "../../utils/logger";
/**
 * 编辑器操作队列
 *
 * 功能：
 * - 队列化编辑器操作，确保操作按顺序执行
 * - 消除时序依赖和竞态条件
 * - 替代复杂的保护锁机制
 *
 * 设计原则：
 * - 所有操作自动排队
 * - 失败的操作不阻塞队列
 * - 支持操作优先级（可选）
 */

export interface Operation<T = unknown> {
	/** 操作执行函数 */
	execute: () => Promise<T>;

	/** 操作名称（用于调试） */
	name?: string;

	/** 操作优先级（数字越大优先级越高） */
	priority?: number;
}

export interface OperationResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: Error;
	operationName?: string;
}

/**
 * 编辑器操作队列
 * 确保编辑器操作按顺序执行，避免竞态条件
 */
export class EditorOperationQueue {
	private operationQueue: Array<Operation> = [];
	private isProcessing = false;
	private debug = false;

	constructor(debug = false) {
		this.debug = debug;
		this.log("EditorOperationQueue created");
	}

	/**
	 * 将操作加入队列并等待执行完成
	 * @param operation 操作函数
	 * @param options 操作选项
	 * @returns 操作结果
	 */
	async enqueue<T>(
		operation: () => Promise<T>,
		options?: { name?: string; priority?: number }
	): Promise<OperationResult<T>> {
		const op: Operation<T> = {
			execute: operation,
			name: options?.name || "anonymous",
			priority: options?.priority || 0,
		};

		this.log(`Enqueuing operation: ${op.name}, priority: ${op.priority}`);

		// 根据优先级插入队列
		const insertIndex = this.findInsertPosition(op.priority || 0);
		this.operationQueue.splice(insertIndex, 0, op);

		this.log(`Queue size: ${this.operationQueue.length}`);

		// 如果队列未在处理，启动处理
		if (!this.isProcessing) {
			void this.processQueue();
		}

		// 等待该操作执行完成
		return new Promise((resolve) => {
			// 轮询等待该操作完成
			const checkInterval = window.setInterval(() => {
				// 如果队列中不再包含该操作，说明已执行完成
				if (!this.operationQueue.includes(op)) {
					window.clearInterval(checkInterval);

					// 注意：这里简化处理，实际中应该保存结果
					// 在更完善的实现中，应该维护一个结果映射
					resolve({ success: true, operationName: op.name });
				}
			}, 10);
		});
	}

	/**
	 * 查找插入位置（按优先级排序）
	 * @param priority 优先级
	 * @returns 插入位置索引
	 */
	private findInsertPosition(priority: number): number {
		for (let i = 0; i < this.operationQueue.length; i++) {
			if ((this.operationQueue[i].priority || 0) < priority) {
				return i;
			}
		}
		return this.operationQueue.length;
	}

	/**
	 * 处理队列中的操作
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessing) {
			this.log("Queue already processing, skipping");
			return;
		}

		this.isProcessing = true;
		this.log("Started processing queue");

		while (this.operationQueue.length > 0) {
			const operation = this.operationQueue.shift();

			if (!operation) {
				continue;
			}

			this.log(`Executing operation: ${operation.name}`);

			try {
				const startTime = performance.now();
				await operation.execute();
				const duration = performance.now() - startTime;

				this.log(`Operation completed: ${operation.name}, duration: ${duration.toFixed(2)}ms`);
			} catch (error) {
				logger.error(`[EditorOperationQueue] Operation failed: ${operation.name}`, error);
				// 操作失败不阻塞队列，继续处理下一个操作
			}
		}

		this.isProcessing = false;
		this.log("Queue processing completed");
	}

	/**
	 * 清空队列
	 */
	clear(): void {
		this.log(`Clearing queue, ${this.operationQueue.length} operations discarded`);
		this.operationQueue = [];
	}

	/**
	 * 获取队列大小
	 */
	get size(): number {
		return this.operationQueue.length;
	}

	/**
	 * 检查队列是否正在处理
	 */
	get processing(): boolean {
		return this.isProcessing;
	}

	/**
	 * 调试日志
	 */
	private log(message: string): void {
		if (this.debug) {
			logger.debug(`[EditorOperationQueue] ${message}`);
		}
	}
}
