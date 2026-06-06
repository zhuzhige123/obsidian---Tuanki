import { logger } from "../utils/logger";
/**
 * 卡片模态窗全局状态管理
 * 使用 Svelte Store 模式管理新建/编辑卡片模态窗状态
 */

import { writable } from "svelte/store";
import type { Card } from "../data/types";
import type { EmbeddableEditorManager } from "../services/editor/EmbeddableEditorManager";

export interface CardModalState {
	/** 是否打开模态窗 */
	open: boolean;

	/** 卡片数据 */
	card: Card | null;

	/** 嵌入式编辑器管理器实例 */
	editorPoolManager: EmbeddableEditorManager | null;

	/** 编辑模式 */
	mode: "create" | "edit";

	/** 是否新建卡片 */
	isNew: boolean;

	/** 保存成功回调 */
	onSave?: (card: Card) => void;

	/** 取消回调 */
	onCancel?: () => void;
}

const initialState: CardModalState = {
	open: false,
	card: null,
	editorPoolManager: null,
	mode: "create",
	isNew: false,
};

/**
 * 创建卡片模态窗 Store
 */
function createCardModalStore() {
	const { subscribe, set, update } = writable<CardModalState>(initialState);

	return {
		subscribe,

		/**
		 * 打开模态窗
		 */
		open: (state: Partial<CardModalState>) => {
			logger.debug("[CardModalStore] 打开模态窗", state);
			update((_current) => ({
				..._current,
				...state,
				open: true,
			}));
		},

		/**
		 * 关闭模态窗
		 */
		close: () => {
			logger.debug("[CardModalStore] 关闭模态窗");
			update((_current) => ({
				..._current,
				open: false,
			}));

			// 延迟清理状态，等待动画完成
			window.setTimeout(() => {
				set(initialState);
			}, 300);
		},

		/**
		 * 获取当前状态（同步）
		 */
		getState: () => {
			let currentState: CardModalState = initialState;
			subscribe((_state) => {
				currentState = _state;
			})();
			return currentState;
		},

		/**
		 * 重置状态
		 */
		reset: () => {
			logger.debug("[CardModalStore] 重置状态");
			set(initialState);
		},
	};
}

// 导出单例实例
export const cardModalStore = createCardModalStore();

/**
 * 便捷方法：打开新建卡片模态窗
 */
export function openCreateCardModal(state: Partial<CardModalState>): void {
	cardModalStore.open({
		...state,
		mode: "create",
		isNew: true,
	});
}

/**
 * 便捷方法：打开编辑卡片模态窗
 */
export function openEditCardModal(state: Partial<CardModalState>): void {
	cardModalStore.open({
		...state,
		mode: "edit",
		isNew: false,
	});
}

/**
 * 便捷方法：关闭卡片模态窗
 */
export function closeCreateCardModal(): void {
	cardModalStore.close();
}
