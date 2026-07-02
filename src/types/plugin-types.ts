/**
 * Weave 插件核心接口类型定义
 * 用于消除 `any` 类型，提供完整的类型支持
 */

import type { App, Notice, Plugin } from "obsidian";
import type { FSRS } from "../algorithms/fsrs";
import type { SettingsWithEditor } from "../components/settings/types/settings-types";
import type { WeaveDataStorage } from "../data/storage";
import type { AnkiConnectClient } from "../services/ankiconnect/AnkiConnectClient";
import type { BlockLinkCleanupService } from "../services/cleanup/BlockLinkCleanupService";
import type { DirectFileCardReader } from "../services/data/DirectFileCardReader";
import type { EmbeddableEditorManager } from "../services/editor/EmbeddableEditorManager";

/**
 * Weave 插件主接口（内部名称）
 * 对外展示名称: Weave（当前阶段）
 * 定义插件实例的完整类型结构
 */
export interface WeavePlugin extends Plugin {
	/** Obsidian App 实例 */
	app: App;

	/** 插件设置 */
	settings: SettingsWithEditor;

	/** FSRS 算法实例 */
	fsrs: FSRS;

	/** 数据存储服务 */
	dataStorage: WeaveDataStorage;

	/** AnkiConnect 客户端 */
	ankiConnectClient?: AnkiConnectClient;

	/** 嵌入式编辑器管理器（v3 - 零闪烁） */
	editorPoolManager: EmbeddableEditorManager;

	/** 模板服务 */

	/** 高性能数据读取服务 */
	directFileReader?: DirectFileCardReader;

	/** 块链接清理服务 */
	blockLinkCleanupService?: BlockLinkCleanupService;

	/** 调试模式标志 */
	enableDebugMode?: boolean;

	/** 加载插件设置 */
	loadSettings(): Promise<void>;

	/** 保存插件设置 */
	saveSettings(): Promise<void>;
}

/**
 * Notice 扩展接口
 * 用于访问 Notice 内部元素
 */
export interface ExtendedNotice extends Notice {
	/** Notice 实例本身 (用于访问内部属性) */
	notice?: {
		/** Notice DOM 元素 */
		noticeEl?: HTMLElement;
	};
}

/**
 * 导出设置类型别名
 */
export type WeaveSettings = SettingsWithEditor;

/**
 * 插件生命周期钩子类型
 */
export interface PluginLifecycleHooks {
	/** 插件加载完成回调 */
	onLoad?: () => Promise<void>;

	/** 插件卸载回调 */
	onUnload?: () => void;

	/** 设置更改回调 */
	onSettingsChange?: (settings: SettingsWithEditor) => void;
}

/**
 * 服务注册接口
 */
export interface ServiceRegistry {
	/** 注册服务 */
	register<T>(key: string, service: T): void;

	/** 获取服务 */
	get<T>(key: string): T | undefined;

	/** 检查服务是否存在 */
	has(key: string): boolean;
}
