/**
 * 服务就绪事件系统
 *
 * 提供事件驱动的服务就绪通知机制，替代轮询等待
 * 优化启动性能，减少 CPU 占用
 *
 * @module utils/service-ready-event
 */

import { logger } from "./logger";

/**
 * 服务就绪事件类型
 */
export type ServiceReadyEventType =
	| "dataStorage"
	| "questionBankService"
	| "annotationSystem"
	| "readingMaterialManager"
	| "allCoreServices";

/**
 * 服务就绪事件监听器
 */
type ServiceReadyListener = () => void;

/**
 * 服务就绪事件管理器（单例）
 */
class ServiceReadyEventManager {
	private static instance: ServiceReadyEventManager;

	/** 已就绪的服务集合 */
	private readyServices: Set<ServiceReadyEventType> = new Set();

	/** 等待中的监听器 */
	private pendingListeners: Map<ServiceReadyEventType, ServiceReadyListener[]> = new Map();

	private constructor() {}

	static getInstance(): ServiceReadyEventManager {
		if (!ServiceReadyEventManager.instance) {
			ServiceReadyEventManager.instance = new ServiceReadyEventManager();
		}
		return ServiceReadyEventManager.instance;
	}

	/**
	 * 标记服务已就绪
	 * @param serviceType 服务类型
	 */
	markReady(serviceType: ServiceReadyEventType): void {
		if (this.readyServices.has(serviceType)) {
			return; // 已经标记过
		}

		this.readyServices.add(serviceType);
		logger.debug(`[ServiceReadyEvent] 服务已就绪: ${serviceType}`);

		// 触发等待中的监听器
		const listeners = this.pendingListeners.get(serviceType);
		if (listeners) {
			listeners.forEach((_listener) => {
				try {
					_listener();
				} catch (error) {
					logger.error("[ServiceReadyEvent] 监听器执行失败:", error);
				}
			});
			this.pendingListeners.delete(serviceType);
		}
	}

	/**
	 * 检查服务是否已就绪
	 * @param serviceType 服务类型
	 */
	isReady(serviceType: ServiceReadyEventType): boolean {
		return this.readyServices.has(serviceType);
	}

	/**
	 * 等待服务就绪
	 * @param serviceType 服务类型
	 * @param timeout 超时时间（毫秒），默认 5000ms
	 * @returns Promise，服务就绪时 resolve
	 */
	waitFor(serviceType: ServiceReadyEventType, timeout = 5000): Promise<void> {
		// 如果已就绪，立即返回
		if (this.readyServices.has(serviceType)) {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			// 设置超时
			const timeoutId = window.setTimeout(() => {
				// 从等待列表中移除
				const listeners = this.pendingListeners.get(serviceType);
				if (listeners) {
					const index = listeners.indexOf(listener);
					if (index > -1) {
						listeners.splice(index, 1);
					}
				}
				reject(new Error(`等待服务 ${serviceType} 超时 (${timeout}ms)`));
			}, timeout);

			// 创建监听器
			const listener = () => {
				window.clearTimeout(timeoutId);
				resolve();
			};

			// 添加到等待列表
			if (!this.pendingListeners.has(serviceType)) {
				this.pendingListeners.set(serviceType, []);
			}
			this.pendingListeners.get(serviceType)?.push(listener);
		});
	}

	/**
	 * 重置所有状态（用于测试或插件卸载）
	 */
	reset(): void {
		this.readyServices.clear();
		this.pendingListeners.clear();
	}
}

// 导出单例实例
export const serviceReadyEvent = ServiceReadyEventManager.getInstance();

/**
 * 便捷函数：标记服务已就绪
 */
export function markServiceReady(serviceType: ServiceReadyEventType): void {
	serviceReadyEvent.markReady(serviceType);
}

/**
 * 便捷函数：等待服务就绪
 */
export function waitForServiceReady(
	serviceType: ServiceReadyEventType,
	timeout?: number
): Promise<void> {
	return serviceReadyEvent.waitFor(serviceType, timeout);
}

/**
 * 便捷函数：检查服务是否已就绪
 */
export function isServiceReady(serviceType: ServiceReadyEventType): boolean {
	return serviceReadyEvent.isReady(serviceType);
}
