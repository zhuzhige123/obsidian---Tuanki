import { logger } from "../utils/logger";
import { vaultStorage } from "../utils/vault-local-storage";
/**
 * 全局筛选状态服务
 * 管理跨视图的筛选状态同步
 */

import { CardType } from "../data/types";
import type { WeavePlugin } from "../main";
import type { TimeFilterType } from "../types/time-filter-types";
import { isRecord, parseJsonUnknown } from "../utils/typed-json";

export interface FilterState {
	selectedDeckId: string | null;
	selectedCardTypes: Set<CardType>;
	selectedPriority: number | null;
	selectedTags: Set<string>;
	selectedTimeFilter: TimeFilterType; // 时间筛选
	activeDocumentFilter: string | null;
	dataSource: "memory" | "questionBank" | "incremental-reading"; // 数据源类型
	showOrphanCards: boolean; // 孤儿卡片筛选
}

const VALID_TIME_FILTERS = new Set<Exclude<TimeFilterType, null>>([
	"today",
	"due-today",
	"added-today",
	"edited-today",
	"reviewed-today",
	"first-review",
	"retry-today",
	"never-reviewed",
]);

const VALID_DATA_SOURCES = new Set<FilterState["dataSource"]>([
	"memory",
	"questionBank",
	"incremental-reading",
]);

function parseStoredStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseStoredCardTypes(value: unknown): Set<CardType> {
	const validTypes = new Set<string>(Object.values(CardType));
	return new Set(
		parseStoredStringArray(value).filter((item): item is CardType => validTypes.has(item))
	);
}

function parseStoredTimeFilter(value: unknown): TimeFilterType {
	if (value === null || value === undefined) {
		return null;
	}
	return typeof value === "string" && VALID_TIME_FILTERS.has(value as Exclude<TimeFilterType, null>)
		? (value as TimeFilterType)
		: null;
}

function parseStoredDataSource(value: unknown): FilterState["dataSource"] {
	if (value === "incremental-reading") {
		return "memory";
	}
	return typeof value === "string" && VALID_DATA_SOURCES.has(value as FilterState["dataSource"])
		? (value as FilterState["dataSource"])
		: "memory";
}

function parseStoredFilterState(raw: unknown): FilterState | null {
	if (!isRecord(raw)) {
		return null;
	}

	const selectedDeckId =
		typeof raw.selectedDeckId === "string" && raw.selectedDeckId.trim().length > 0
			? raw.selectedDeckId
			: null;
	const selectedPriority =
		typeof raw.selectedPriority === "number" && Number.isFinite(raw.selectedPriority)
			? raw.selectedPriority
			: null;

	return {
		selectedDeckId,
		selectedCardTypes: parseStoredCardTypes(raw.selectedCardTypes),
		selectedPriority,
		selectedTags: new Set(parseStoredStringArray(raw.selectedTags)),
		selectedTimeFilter: parseStoredTimeFilter(raw.selectedTimeFilter),
		activeDocumentFilter:
			typeof raw.activeDocumentFilter === "string" && raw.activeDocumentFilter.trim().length > 0
				? raw.activeDocumentFilter
				: null,
		dataSource: parseStoredDataSource(raw.dataSource),
		showOrphanCards: raw.showOrphanCards === true,
	};
}

export class FilterStateService {
	private state: FilterState;
	private listeners: Set<(state: FilterState) => void> = new Set();
	private plugin: WeavePlugin;
	private isUpdating = false; // 防止循环更新

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;

		// 初始化默认状态
		this.state = {
			selectedDeckId: null,
			selectedCardTypes: new Set(),
			selectedPriority: null,
			selectedTags: new Set(),
			selectedTimeFilter: null, // 时间筛选默认为 null（全部）
			activeDocumentFilter: null,
			dataSource: "memory", // 默认为记忆学习模式
			showOrphanCards: false, // 孤儿卡片筛选默认关闭
		};

		// 从LocalStorage加载状态
		this.loadFromStorage();
	}

	/**
	 * 获取当前筛选状态
	 */
	getState(): FilterState {
		return {
			...this.state,
			// 返回Set的副本，避免外部修改
			selectedCardTypes: new Set(this.state.selectedCardTypes),
			selectedTags: new Set(this.state.selectedTags),
		};
	}

	/**
	 * 更新筛选状态（支持部分更新）
	 */
	updateFilter(updates: Partial<FilterState>): void {
		if (this.isUpdating) {
			return; // 防止循环更新
		}

		this.isUpdating = true;

		// 合并更新
		this.state = {
			...this.state,
			...updates,
			// 确保Set类型正确复制
			selectedCardTypes: updates.selectedCardTypes
				? new Set(updates.selectedCardTypes)
				: this.state.selectedCardTypes,
			selectedTags: updates.selectedTags ? new Set(updates.selectedTags) : this.state.selectedTags,
		};

		// 持久化到LocalStorage
		this.saveToStorage();

		// 通知所有订阅者
		this.notifyListeners();

		this.isUpdating = false;
	}

	/**
	 * 订阅状态变化
	 * @returns 取消订阅的函数
	 */
	subscribe(listener: (state: FilterState) => void): () => void {
		this.listeners.add(listener);

		// 立即调用一次，同步当前状态
		listener(this.getState());

		// 返回取消订阅函数
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * 清除所有筛选
	 */
	clearAll(): void {
		this.updateFilter({
			selectedDeckId: null,
			selectedCardTypes: new Set(),
			selectedPriority: null,
			selectedTags: new Set(),
			selectedTimeFilter: null, // 清除时间筛选
			activeDocumentFilter: null,
			showOrphanCards: false, // 清除孤儿卡片筛选
			// 注意：不清除 dataSource，保持当前数据源
		});
	}

	/**
	 * 通知所有订阅者
	 */
	private notifyListeners(): void {
		const currentState = this.getState();
		this.listeners.forEach((_listener) => {
			try {
				_listener(currentState);
			} catch (error) {
				logger.error("[FilterStateService] Listener error:", error);
			}
		});
	}

	/**
	 * 保存状态到LocalStorage
	 */
	private saveToStorage(): void {
		try {
			const serialized = {
				selectedDeckId: this.state.selectedDeckId,
				selectedCardTypes: Array.from(this.state.selectedCardTypes),
				selectedPriority: this.state.selectedPriority,
				selectedTags: Array.from(this.state.selectedTags),
				selectedTimeFilter: this.state.selectedTimeFilter, // 保存时间筛选
				activeDocumentFilter: this.state.activeDocumentFilter,
				dataSource: this.state.dataSource, // 保存数据源
				showOrphanCards: this.state.showOrphanCards, // 保存孤儿卡片筛选
			};

			vaultStorage.setItem("weave-global-filter-state", JSON.stringify(serialized));
		} catch (error) {
			logger.error("[FilterStateService] Failed to save state:", error);
		}
	}

	/**
	 * 从LocalStorage加载状态
	 */
	private loadFromStorage(): void {
		try {
			const saved = vaultStorage.getItem("weave-global-filter-state");
			if (!saved) return;

			const parsed = parseStoredFilterState(parseJsonUnknown(saved));
			if (!parsed) {
				return;
			}

			this.state = parsed;

			logger.debug("[FilterStateService] State loaded from storage");
		} catch (error) {
			logger.error("[FilterStateService] Failed to load state:", error);
		}
	}

	/**
	 * 获取筛选摘要（用于显示）
	 */
	getFilterSummary(): string {
		const parts: string[] = [];

		if (this.state.selectedDeckId) {
			parts.push("牌组");
		}

		if (this.state.selectedCardTypes.size > 0) {
			parts.push(`${this.state.selectedCardTypes.size}种题型`);
		}

		if (this.state.selectedPriority !== null) {
			parts.push("优先级");
		}

		if (this.state.selectedTags.size > 0) {
			parts.push(`${this.state.selectedTags.size}个标签`);
		}

		if (this.state.activeDocumentFilter) {
			parts.push("文档");
		}

		return parts.length > 0 ? parts.join(" · ") : "无筛选";
	}

	/**
	 * 检查是否有任何激活的筛选
	 */
	hasActiveFilters(): boolean {
		return !!(
			(
				this.state.selectedDeckId ||
				this.state.selectedCardTypes.size > 0 ||
				this.state.selectedPriority !== null ||
				this.state.selectedTags.size > 0 ||
				this.state.activeDocumentFilter ||
				this.state.showOrphanCards
			) // 孤儿卡片筛选
		);
	}
}
