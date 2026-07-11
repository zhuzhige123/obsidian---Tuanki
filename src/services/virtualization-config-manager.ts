import { logger } from "../utils/logger";
import { vaultStorage } from "../utils/vault-local-storage";

import type {
	KanbanVirtualizationConfig,
	RenderStrategy,
	TableVirtualizationConfig,
	VirtualizationConfig,
} from "../types/virtualization-types";

/**
 * 虚拟化配置管理器
 *
 * 提供虚拟化配置的读取、存储和策略选择能力。
 */

const STORAGE_KEY = "weave-virtualization-config";

const DEFAULT_KANBAN_CONFIG: KanbanVirtualizationConfig = {
	enabled: true,
	strategy: "virtual",
	estimatedItemSize: 200,
	overscan: 5,
	measurementCache: true,
	autoTriggerThreshold: 200,
	initialCardsPerColumn: 30,
	batchSize: 20,
	enableColumnVirtualization: true,
	releaseThreshold: 1000,
	columnScrollBehavior: "independent",
};

const DEFAULT_TABLE_CONFIG: TableVirtualizationConfig = {
	enabled: false,
	strategy: "none",
	estimatedItemSize: 60,
	overscan: 5,
	measurementCache: true,
	autoTriggerThreshold: 200,
	rowHeight: "dynamic",
	enableVirtualScroll: false,
	fallbackToPagination: true,
	paginationThreshold: 500,
};

type VirtualizationStorageConfig = {
	kanban?: Partial<KanbanVirtualizationConfig>;
	table?: Partial<TableVirtualizationConfig>;
};

function loadFromStorage(): VirtualizationStorageConfig | null {
	try {
		const stored = vaultStorage.getItem(STORAGE_KEY);
		if (!stored) {
			return null;
		}

		const parsed: unknown = JSON.parse(stored);
		if (!parsed || typeof parsed !== "object") {
			return null;
		}

		return parsed;
	} catch (error) {
		logger.error("[VirtualizationConfigManager] 加载配置失败:", error);
		return null;
	}
}

function saveToStorage(config: VirtualizationStorageConfig): void {
	try {
		vaultStorage.setItem(STORAGE_KEY, JSON.stringify(config));
		logger.debug("[VirtualizationConfigManager] 配置已保存");
	} catch (error) {
		logger.error("[VirtualizationConfigManager] 保存配置失败:", error);
	}
}

function getKanbanConfig(): KanbanVirtualizationConfig {
	const stored = loadFromStorage();

	if (stored?.kanban) {
		return {
			...DEFAULT_KANBAN_CONFIG,
			...stored.kanban,
		};
	}

	return { ...DEFAULT_KANBAN_CONFIG };
}

function getTableConfig(): TableVirtualizationConfig {
	const stored = loadFromStorage();

	if (stored?.table) {
		return {
			...DEFAULT_TABLE_CONFIG,
			...stored.table,
		};
	}

	return { ...DEFAULT_TABLE_CONFIG };
}

function shouldEnableVirtualization(
	itemCount: number,
	viewType: "table" | "kanban" | "grid"
): boolean {
	const config = viewType === "kanban" ? getKanbanConfig() : getTableConfig();

	if (!config.enabled) {
		return false;
	}

	switch (viewType) {
		case "kanban":
			return itemCount > 200;
		case "table":
			return itemCount > 500;
		case "grid":
			return itemCount > 300;
		default:
			return false;
	}
}

function getOptimalStrategy(itemCount: number): RenderStrategy {
	if (itemCount < 100) {
		return "immediate";
	}
	if (itemCount < 500) {
		return "progressive";
	}
	return "virtual";
}

function updateKanbanConfig(config: Partial<KanbanVirtualizationConfig>): void {
	const updated = { ...getKanbanConfig(), ...config };
	const allConfigs = loadFromStorage() ?? {};

	allConfigs.kanban = updated;
	saveToStorage(allConfigs);
}

function updateTableConfig(config: Partial<TableVirtualizationConfig>): void {
	const updated = { ...getTableConfig(), ...config };
	const allConfigs = loadFromStorage() ?? {};

	allConfigs.table = updated;
	saveToStorage(allConfigs);
}

function resetToDefaults(): void {
	saveToStorage({
		kanban: { ...DEFAULT_KANBAN_CONFIG },
		table: { ...DEFAULT_TABLE_CONFIG },
	});
}

function getAllConfigs(): {
	kanban: KanbanVirtualizationConfig;
	table: TableVirtualizationConfig;
} {
	return {
		kanban: getKanbanConfig(),
		table: getTableConfig(),
	};
}

function calculateRecommendedOverscan(
	_itemCount: number,
	viewportHeight: number,
	estimatedItemSize: number
): number {
	const visibleCount = Math.ceil(viewportHeight / estimatedItemSize);
	return Math.max(3, Math.min(10, Math.ceil(visibleCount * 0.5)));
}

function validateConfig(config: VirtualizationConfig): boolean {
	if (typeof config.enabled !== "boolean") {
		return false;
	}
	if (!["none", "progressive", "virtual"].includes(config.strategy)) {
		return false;
	}
	if (typeof config.estimatedItemSize !== "number" || config.estimatedItemSize <= 0) {
		return false;
	}
	if (typeof config.overscan !== "number" || config.overscan < 0) {
		return false;
	}

	return true;
}

export const VirtualizationConfigManager = {
	getKanbanConfig,
	getTableConfig,
	shouldEnableVirtualization,
	getOptimalStrategy,
	updateKanbanConfig,
	updateTableConfig,
	resetToDefaults,
	getAllConfigs,
	calculateRecommendedOverscan,
	validateConfig,
};

export const DEFAULT_CONFIGS = {
	kanban: DEFAULT_KANBAN_CONFIG,
	table: DEFAULT_TABLE_CONFIG,
};
