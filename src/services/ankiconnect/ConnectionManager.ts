import { logger } from "../../utils/logger";
/**
 * AnkiConnect 连接管理器
 * 负责心跳检测、自动重连和连接状态管理
 */

import type { AnkiConnectClient } from "./AnkiConnectClient";

/**
 * 连接状态
 */
export interface ConnectionState {
	status: "connected" | "disconnected" | "reconnecting";
	lastHeartbeat: number;
	reconnectAttempts: number;
	error?: string;
}

/**
 * 连接状态变化回调
 */
export type ConnectionStateCallback = (state: ConnectionState) => void;

/**
 * 连接管理器配置
 */
export interface ConnectionManagerConfig {
	heartbeatInterval?: number; // 心跳间隔（毫秒），默认 30000 (30秒)
	maxReconnectAttempts?: number; // 最大重连次数，默认 3
	reconnectDelays?: number[]; // 重连延迟序列（指数退避），默认 [1000, 2000, 4000]
}

/**
 * 连接管理器
 */
export class ConnectionManager {
	private state: ConnectionState = {
		status: "disconnected",
		lastHeartbeat: 0,
		reconnectAttempts: 0,
	};

	private heartbeatTimer: number | null = null;
	private reconnectTimer: number | null = null;
	private callbacks: Set<ConnectionStateCallback> = new Set();

	private heartbeatInterval: number;
	private maxReconnectAttempts: number;
	private reconnectDelays: number[];

	constructor(private client: AnkiConnectClient, config: ConnectionManagerConfig = {}) {
		this.heartbeatInterval = config.heartbeatInterval ?? 30000; // 30秒
		this.maxReconnectAttempts = config.maxReconnectAttempts ?? 3;
		this.reconnectDelays = config.reconnectDelays ?? [1000, 2000, 4000];
	}

	/**
	 * 启动心跳检测
	 */
	startHeartbeat(): void {
		logger.debug("[AnkiConnect] 启动心跳检测，间隔:", this.heartbeatInterval / 1000, "秒");

		// 清理已有定时器
		this.stopHeartbeat();

		// 立即执行一次心跳
		void this.performHeartbeat();

		// 启动定时心跳
		this.heartbeatTimer = window.setInterval(() => {
			void this.performHeartbeat();
		}, this.heartbeatInterval);
	}

	/**
	 * 停止心跳检测
	 */
	stopHeartbeat(): void {
		if (this.heartbeatTimer !== null) {
			window.clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
			logger.debug("[AnkiConnect] 心跳检测已停止");
		}

		// 同时停止重连定时器
		if (this.reconnectTimer !== null) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	/**
	 * 执行单次心跳检测
	 */
	private async performHeartbeat(): Promise<void> {
		try {
			const isAlive = await this.client.testConnection();

			if (isAlive) {
				const now = Date.now();
				const wasDisconnected = this.state.status !== "connected";

				this.state = {
					status: "connected",
					lastHeartbeat: now,
					reconnectAttempts: 0,
					error: undefined,
				};

				if (wasDisconnected) {
					logger.debug("[AnkiConnect] ✅ 连接已恢复");
				}

				this.notifyStateChange();
			} else {
				this.handleConnectionLost("心跳检测失败");
			}
		} catch (error) {
			this.handleConnectionLost(error instanceof Error ? error.message : "未知错误");
		}
	}

	/**
	 * 处理连接丢失
	 */
	private handleConnectionLost(error: string): void {
		if (this.state.status === "connected") {
			logger.warn("[AnkiConnect] ⚠️ 连接丢失:", error);
		}

		this.state = {
			status: "disconnected",
			lastHeartbeat: this.state.lastHeartbeat,
			reconnectAttempts: this.state.reconnectAttempts,
			error,
		};

		this.notifyStateChange();

		// 尝试自动重连
		this.attemptReconnect();
	}

	/**
	 * 尝试自动重连
	 */
	private attemptReconnect(): void {
		// 如果已达到最大重连次数，停止尝试
		if (this.state.reconnectAttempts >= this.maxReconnectAttempts) {
			logger.warn(
				`[AnkiConnect] 连接失败，已尝试 ${this.maxReconnectAttempts} 次。请检查Anki软件是否正常启动且运行。`
			);
			return;
		}

		// 获取当前重连延迟（使用指数退避）
		const delayIndex = Math.min(this.state.reconnectAttempts, this.reconnectDelays.length - 1);
		const delay = this.reconnectDelays[delayIndex];

		logger.debug(
			`[AnkiConnect] 🔄 将在 ${delay / 1000} 秒后尝试第 ${
				this.state.reconnectAttempts + 1
			} 次重连...`
		);

		this.state.status = "reconnecting";
		this.state.reconnectAttempts++;
		this.notifyStateChange();

		// 清理已有重连定时器
		if (this.reconnectTimer !== null) {
			window.clearTimeout(this.reconnectTimer);
		}

		// 设置重连定时器
		this.reconnectTimer = window.setTimeout(() => {
			void (async () => {
				logger.debug(
					`[AnkiConnect] 正在尝试重连 (${this.state.reconnectAttempts}/${this.maxReconnectAttempts})...`
				);

				try {
					const isAlive = await this.client.testConnection();

					if (isAlive) {
						logger.debug("[AnkiConnect] ✅ 重连成功！");
						this.state = {
							status: "connected",
							lastHeartbeat: Date.now(),
							reconnectAttempts: 0,
							error: undefined,
						};
						this.notifyStateChange();
					} else {
						// 重连失败，继续尝试
						this.handleConnectionLost("重连失败");
					}
				} catch (error) {
					this.handleConnectionLost(error instanceof Error ? error.message : "重连出错");
				}
			})();
		}, delay);
	}

	/**
	 * 手动触发重连
	 */
	public manualReconnect(): void {
		logger.debug("[AnkiConnect] 手动触发重连");
		this.state.reconnectAttempts = 0; // 重置重连计数
		this.attemptReconnect();
	}

	/**
	 * 获取当前连接状态
	 */
	getState(): ConnectionState {
		return { ...this.state };
	}

	/**
	 * 监听连接状态变化
	 */
	onStateChange(callback: ConnectionStateCallback): () => void {
		this.callbacks.add(callback);

		// 立即调用一次回调，传递当前状态
		callback(this.getState());

		// 返回取消监听函数
		return () => {
			this.callbacks.delete(callback);
		};
	}

	/**
	 * 通知所有监听器状态变化
	 */
	private notifyStateChange(): void {
		const currentState = this.getState();
		for (const _callback of this.callbacks) {
			try {
				_callback(currentState);
			} catch (error) {
				logger.error("[AnkiConnect] 状态回调执行错误:", error);
			}
		}
	}

	/**
	 * 清理资源
	 */
	destroy(): void {
		this.stopHeartbeat();
		this.callbacks.clear();
		logger.debug("[AnkiConnect] 连接管理器已销毁");
	}
}
