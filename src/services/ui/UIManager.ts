import { logger } from "../../utils/logger";
/**
 * UI管理器 - 统一管理全局UI组件的生命周期
 *
 * 职责：
 * 1. 管理全局悬浮按钮
 * 2. 管理模态窗实例
 * 3. 提供单例控制
 * 4. 统一的清理机制
 */

import type { App } from "obsidian";
import type WeavePlugin from "../../main";
import { applyStyleProps } from "../../utils/style-props";

/**
 * UI组件类型
 */
export type UIComponentType = "floating-button" | "create-card-modal" | "global-modal";

/**
 * UI组件实例
 */
type UIComponentInstance = {
	$destroy?: () => void;
	$on?: (type: string, callback: (event: unknown) => void) => () => void;
	$set?: (props: Record<string, unknown>) => void;
} & Record<string, unknown>;

type UIComponentMetadata = Record<string, unknown>;

interface UIComponent {
	type: UIComponentType;
	instance: UIComponentInstance | null;
	container?: HTMLElement;
	created: number;
	metadata?: UIComponentMetadata;
}

/**
 * UI管理器配置
 */
export interface UIManagerConfig {
	/** 是否启用调试模式 */
	debug?: boolean;
	/** 最大同时存在的模态窗数量 */
	maxModals?: number;
}

/**
 * UI管理器
 */
export class UIManager {
	private plugin: WeavePlugin;
	private app: App;
	private config: UIManagerConfig;

	// 组件注册表
	private components: Map<string, UIComponent> = new Map();

	// 单例模式
	private static instance: UIManager | null = null;

	constructor(plugin: WeavePlugin, config: UIManagerConfig = {}) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.config = {
			debug: false,
			maxModals: 3,
			...config,
		};
	}

	/**
	 * 获取单例
	 */
	static getInstance(plugin?: WeavePlugin, config?: UIManagerConfig): UIManager {
		if (!UIManager.instance && plugin) {
			UIManager.instance = new UIManager(plugin, config);
		}
		if (!UIManager.instance) {
			throw new Error("UIManager not initialized");
		}
		return UIManager.instance;
	}

	/**
	 * 注册UI组件
	 */
	register(
		id: string,
		type: UIComponentType,
		instance: UIComponentInstance | null,
		container?: HTMLElement,
		metadata?: UIComponentMetadata
	): void {
		// 检查是否已存在
		if (this.components.has(id)) {
			this.log(`Component ${id} already exists, destroying old instance`);
			this.destroy(id);
		}

		// 注册新组件
		this.components.set(id, {
			type,
			instance,
			container,
			created: Date.now(),
			metadata,
		});

		this.log(`Registered ${type}: ${id}`);
	}

	/**
	 * 获取组件
	 */
	get(id: string): UIComponent | undefined {
		return this.components.get(id);
	}

	/**
	 * 检查组件是否存在
	 */
	has(id: string): boolean {
		return this.components.has(id);
	}

	/**
	 * 获取指定类型的所有组件
	 */
	getByType(type: UIComponentType): UIComponent[] {
		return Array.from(this.components.values()).filter((c) => c.type === type);
	}

	/**
	 * 销毁指定组件
	 */
	destroy(id: string): boolean {
		const component = this.components.get(id);
		if (!component) {
			return false;
		}

		try {
			// 销毁 Svelte 组件实例
			if (component.instance?.$destroy) {
				component.instance.$destroy();
			}

			// 移除 DOM 容器
			if (component.container) {
				component.container.remove();
			}

			// 从注册表移除
			this.components.delete(id);

			this.log(`Destroyed ${component.type}: ${id}`);
			return true;
		} catch (error) {
			logger.error(`Failed to destroy ${id}:`, error);
			return false;
		}
	}

	/**
	 * 销毁指定类型的所有组件
	 */
	destroyByType(type: UIComponentType): number {
		const components = this.getByType(type);
		let count = 0;

		for (const component of components) {
			const id = this.findComponentId(component);
			if (id && this.destroy(id)) {
				count++;
			}
		}

		return count;
	}

	/**
	 * 销毁所有组件
	 */
	destroyAll(): void {
		this.log("Destroying all components...");

		const ids = Array.from(this.components.keys());
		for (const id of ids) {
			this.destroy(id);
		}

		this.log("All components destroyed");
	}

	/**
	 * 聚焦指定组件（如果支持）
	 */
	focus(id: string): boolean {
		const component = this.components.get(id);
		if (!component?.container) {
			return false;
		}

		// 滚动到视图
		component.container.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});

		// 添加闪烁效果
		applyStyleProps(component.container, { animation: "pulse 0.5s ease-in-out" });
		setTimeout(() => {
			if (component.container) {
				applyStyleProps(component.container, { animation: "" });
			}
		}, 500);

		return true;
	}

	/**
	 * 获取统计信息
	 */
	getStats() {
		const stats = {
			total: this.components.size,
			byType: {} as Record<UIComponentType, number>,
		};

		for (const component of this.components.values()) {
			stats.byType[component.type] = (stats.byType[component.type] || 0) + 1;
		}

		return stats;
	}

	/**
	 * 清理过期组件（超过指定时间未使用）
	 */
	cleanupStale(maxAge = 300000): number {
		const now = Date.now();
		let count = 0;

		for (const [id, component] of this.components.entries()) {
			if (now - component.created > maxAge) {
				this.log(`Cleaning up stale component: ${id}`);
				if (this.destroy(id)) {
					count++;
				}
			}
		}

		return count;
	}

	// ========== 辅助方法 ==========

	/**
	 * 查找组件ID
	 */
	private findComponentId(component: UIComponent): string | undefined {
		for (const [id, c] of this.components.entries()) {
			if (c === component) {
				return id;
			}
		}
		return undefined;
	}

	/**
	 * 日志输出
	 */
	private log(...args: unknown[]): void {
		if (this.config.debug) {
			logger.debug("[UIManager]", ...args);
		}
	}

	/**
	 * 重置单例（用于测试）
	 */
	static reset(): void {
		if (UIManager.instance) {
			UIManager.instance.destroyAll();
			UIManager.instance = null;
		}
	}
}
