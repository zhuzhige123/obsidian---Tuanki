/**
 * AI 配置响应式 Store。
 * 负责统一读取、更新并持久化 AI 配置。
 */

import { derived, get, writable } from "svelte/store";
import { OFFICIAL_FORMAT_ACTIONS } from "../constants/official-format-actions";
import type { WeavePlugin } from "../main";
import type { AIAction } from "../types/ai-types";
import { patchCustomAIActions } from "../services/ai/AIConfigService";
import { logger } from "../utils/logger";
import type { WeaveTimerHandle } from "../types/timer-handle.js";

type PersistedAIConfig = NonNullable<WeavePlugin["settings"]["aiConfig"]>;

function createDefaultPersistedAIConfig(): PersistedAIConfig {
	return {
		apiKeys: {},
		defaultProvider: "zhipu",
		customFormatActions: [],
		customSplitActions: [],
	} as PersistedAIConfig;
}

function hasPersistableActionIdentity(action: AIAction, expectedType: string): boolean {
	return (
		action.type === expectedType &&
		typeof action.id === "string" &&
		action.id.trim().length > 0
	);
}

function isActionContentReadyForMenu(action: AIAction, expectedType: string): boolean {
	if (action.type !== expectedType) {
		return false;
	}

	const userPrompt = (action.userPromptTemplate || action.userPrompt || "").trim();

	if (!action.name.trim() || !action.systemPrompt.trim() || !userPrompt) {
		return false;
	}

	if (action.enabled === false) {
		return false;
	}

	if (expectedType === "split" && !action.splitConfig) {
		return false;
	}

	return true;
}

function normalizePersistedCustomAction(
	action: unknown,
	expectedType: "format" | "split"
): AIAction | null {
	if (!action || typeof action !== "object") {
		return null;
	}

	const candidate = action as Partial<AIAction>;
	const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
	if (!id) {
		return null;
	}

	return {
		...candidate,
		id,
		type: expectedType,
		category: "custom",
	} as AIAction;
}

function normalizePersistedCustomActions(
	actions: unknown,
	expectedType: "format" | "split"
): AIAction[] {
	if (!Array.isArray(actions)) {
		return [];
	}

	return actions
		.map((action) => normalizePersistedCustomAction(action, expectedType))
		.filter((action): action is AIAction => Boolean(action));
}


export interface AIConfigState {
	customFormatActions: AIAction[];
	customSplitActions: AIAction[];
	lastModified: number;
	version: number;
}

// ============================================================================
// Core Store Class
// ============================================================================

class AIConfigStore {
	private plugin: WeavePlugin | null = null;
	private store = writable<AIConfigState>(this.getInitialState());
	private saveDebounceTimer: WeaveTimerHandle | null = null;
	private readonly SAVE_DEBOUNCE_MS = 1000; // 1秒防抖

	// ============================================================================
	// Initialization
	// ============================================================================

	initialize(plugin: WeavePlugin) {
		this.plugin = plugin;
		this.loadFromPlugin();
		logger.info("[AIConfigStore] Store已初始化");
	}

	reloadFromPlugin() {
		this.loadFromPlugin();
	}

	private getInitialState(): AIConfigState {
		return {
			customFormatActions: [],
			customSplitActions: [],
			lastModified: Date.now(),
			version: 0,
		};
	}

	private loadFromPlugin() {
		if (!this.plugin) {
			logger.warn("[AIConfigStore] Plugin未初始化，跳过加载");
			return;
		}

		const aiConfig = this.plugin.settings.aiConfig;
		if (!aiConfig) {
			logger.warn("[AIConfigStore] aiConfig不存在，使用默认值");
			return;
		}

		try {
			this.store.set({
				customFormatActions: structuredClone(
					normalizePersistedCustomActions(aiConfig.customFormatActions, "format")
				),
				customSplitActions: structuredClone(
					normalizePersistedCustomActions(aiConfig.customSplitActions, "split")
				),
				lastModified: Date.now(),
				version: 0,
			});
		} catch (error) {
			logger.warn("[AIConfigStore] 加载时structuredClone失败，使用JSON fallback:", error);
			this.store.set({
				customFormatActions: normalizePersistedCustomActions(
					JSON.parse(JSON.stringify(aiConfig.customFormatActions ?? [])),
					"format"
				),
				customSplitActions: normalizePersistedCustomActions(
					JSON.parse(JSON.stringify(aiConfig.customSplitActions ?? [])),
					"split"
				),
				lastModified: Date.now(),
				version: 0,
			});
		}

		logger.info("[AIConfigStore] 配置已从plugin加载", {
			formatActions: aiConfig.customFormatActions?.length || 0,
			splitActions: aiConfig.customSplitActions?.length || 0,
		});
	}

	// ============================================================================
	// Read Operations
	// ============================================================================

	subscribe = this.store.subscribe;

	getState(): AIConfigState {
		return get(this.store);
	}

	// ============================================================================
	// Update Operations (Immutable)
	// ============================================================================

	/**
	 * 更新格式化功能列表
	 */
	updateFormatActions(actions: AIAction[]) {
		this.store.update((state) => ({
			...state,
			customFormatActions: this.validateAndClone(actions, "format"),
			lastModified: Date.now(),
			version: state.version + 1,
		}));
		this.scheduleSave();
		logger.debug("[AIConfigStore] 格式化功能已更新", { count: actions.length });
	}

	/**
	 * 更新AI拆分功能列表
	 */
	updateSplitActions(actions: AIAction[]) {
		this.store.update((state) => ({
			...state,
			customSplitActions: this.validateAndClone(actions, "split"),
			lastModified: Date.now(),
			version: state.version + 1,
		}));
		this.scheduleSave();
		logger.debug("[AIConfigStore] 拆分功能已更新", { count: actions.length });
	}

	/**
	 * 批量更新所有功能
	 */
	updateAllActions(formatActions: AIAction[], splitActions: AIAction[]) {
		this.store.update((state) => ({
			...state,
			customFormatActions: this.validateAndClone(formatActions, "format"),
			customSplitActions: this.validateAndClone(splitActions, "split"),
			lastModified: Date.now(),
			version: state.version + 1,
		}));
		this.scheduleSave();
		logger.debug("[AIConfigStore] 所有功能已批量更新");
	}

	// ============================================================================
	// Validation & Deep Clone
	// ============================================================================

	private validateAndClone(actions: AIAction[], expectedType: string): AIAction[] {
		const normalizedActions = normalizePersistedCustomActions(
			actions,
			expectedType === "split" ? "split" : "format"
		);
		return normalizedActions
			.filter((a) => hasPersistableActionIdentity(a, expectedType))
			.map((a) => this.deepCloneAction(a));
	}

	private deepCloneAction(action: AIAction): AIAction {
		try {
			const cloned = structuredClone(action);
			return {
				...cloned,
				provider: action.provider,
				model: action.model,
				splitConfig: action.splitConfig,
			};
		} catch (error) {
			logger.warn("[AIConfigStore] structuredClone失败，使用JSON fallback:", error);
			const cloned = JSON.parse(JSON.stringify(action)) as Partial<AIAction>;
			return {
				...cloned,
				id: action.id,
				name: action.name,
				type: action.type,
				category: action.category,
				systemPrompt: action.systemPrompt,
				userPromptTemplate: action.userPromptTemplate,
				provider: action.provider,
				model: action.model,
				splitConfig: action.splitConfig,
				description: action.description,
				icon: action.icon,
				enabled: action.enabled,
				createdAt: action.createdAt,
				updatedAt: action.updatedAt,
			} as AIAction;
		}
	}

	private ensurePluginAIConfig(): PersistedAIConfig {
		if (!this.plugin) {
			throw new Error("Plugin未初始化");
		}

		if (!this.plugin.settings.aiConfig) {
			this.plugin.settings.aiConfig = createDefaultPersistedAIConfig();
		}

		return this.plugin.settings.aiConfig;
	}

	// ============================================================================
	// Persistence (Debounced)
	// ============================================================================

	private scheduleSave() {
		if (this.saveDebounceTimer) {
			window.clearTimeout(this.saveDebounceTimer);
		}

		this.saveDebounceTimer = window.setTimeout(() => {
			void this.saveToPlugin();
		}, this.SAVE_DEBOUNCE_MS);
	}

	async saveToPlugin() {
		if (!this.plugin) {
			logger.error("[AIConfigStore] Plugin未初始化，无法保存");
			return;
		}

		const state = this.getState();
		const aiConfig = this.ensurePluginAIConfig();

		try {
			patchCustomAIActions(aiConfig, {
				customFormatActions: structuredClone(state.customFormatActions),
				customSplitActions: structuredClone(state.customSplitActions),
			});
		} catch (error) {
			logger.warn("[AIConfigStore] 保存时structuredClone失败，使用JSON fallback:", error);
			patchCustomAIActions(aiConfig, {
				customFormatActions: JSON.parse(JSON.stringify(state.customFormatActions)) as AIAction[],
				customSplitActions: JSON.parse(JSON.stringify(state.customSplitActions)) as AIAction[],
			});
		}

		try {
			await this.plugin.saveSettings();
			logger.info("[AIConfigStore] 配置已保存到磁盘", {
				version: state.version,
				formatActions: state.customFormatActions.length,
				splitActions: state.customSplitActions.length,
			});
		} catch (error) {
			logger.error("[AIConfigStore] 保存失败:", error);
			throw error;
		}
	}

	/**
	 * 强制立即保存（用于关闭时）
	 */
	async forceSave() {
		if (this.saveDebounceTimer) {
			window.clearTimeout(this.saveDebounceTimer);
			this.saveDebounceTimer = null;
		}
		await this.saveToPlugin();
	}

	/**
	 * 清理资源
	 */
	destroy() {
		if (this.saveDebounceTimer) {
			window.clearTimeout(this.saveDebounceTimer);
			this.saveDebounceTimer = null;
		}
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const aiConfigStore = new AIConfigStore();

// ============================================================================
// Derived Stores (Auto-computed)
// ============================================================================

/**
 * 所有格式化功能（官方 + 自定义）
 */
export const allFormatActions = derived(aiConfigStore, ($state) => {
	const official = OFFICIAL_FORMAT_ACTIONS.map((officialAction) => {
		return {
			...officialAction,
			type: "format" as const,
			category: "official" as const,
		};
	});

	const custom = $state.customFormatActions.map((customAction) => {
		return {
			...customAction,
			type: "format" as const,
			category: "custom" as const,
		};
	});

	return [...official, ...custom] as AIAction[];
});

/**
 * 仅自定义功能（用于AI助手菜单）
 */
export const customActionsForMenu = derived(aiConfigStore, ($state) => ({
	format: $state.customFormatActions.filter(
		(a) => hasPersistableActionIdentity(a, "format") && isActionContentReadyForMenu(a, "format")
	),
	split: $state.customSplitActions.filter(
		(a) => hasPersistableActionIdentity(a, "split") && isActionContentReadyForMenu(a, "split")
	),
}));
