import { logger } from "../utils/logger";
import { vaultStorage } from "../utils/vault-local-storage";
import { parseJsonUnknown } from "../utils/typed-json";
/**
 * 牌组选择器持久化服务
 *
 * 使用 vaultStorage 保存用户的牌组选择状态
 */

const STORAGE_KEY = "weave-deck-selector-selection";
const EXPANDED_KEY = "weave-deck-selector-expanded";

/**
 * 牌组选择器存储服务
 */
export class DeckSelectorStorage {
	/**
	 * 保存选中的牌组ID列表
	 */
	static saveSelectedDecks(deckIds: string[]): void {
		try {
			vaultStorage.setItem(STORAGE_KEY, JSON.stringify(deckIds));
		} catch (error) {
			logger.error("[DeckSelectorStorage] 保存选择失败:", error);
		}
	}

	/**
	 * 加载选中的牌组ID列表
	 */
	static loadSelectedDecks(): string[] {
		try {
			const stored = vaultStorage.getItem(STORAGE_KEY);
			if (!stored) return [];

			const parsed = parseJsonUnknown(stored);
			return Array.isArray(parsed)
				? parsed.filter((item): item is string => typeof item === "string")
				: [];
		} catch (error) {
			logger.error("[DeckSelectorStorage] 加载选择失败:", error);
			return [];
		}
	}

	/**
	 * 清除选择
	 */
	static clearSelection(): void {
		try {
			vaultStorage.removeItem(STORAGE_KEY);
		} catch (error) {
			logger.error("[DeckSelectorStorage] 清除选择失败:", error);
		}
	}

	/**
	 * 保存展开的牌组ID列表（用于层级折叠状态）
	 */
	static saveExpandedDecks(deckIds: string[]): void {
		try {
			vaultStorage.setItem(EXPANDED_KEY, JSON.stringify(deckIds));
		} catch (error) {
			logger.error("[DeckSelectorStorage] 保存展开状态失败:", error);
		}
	}

	/**
	 * 加载展开的牌组ID列表
	 */
	static loadExpandedDecks(): string[] {
		try {
			const stored = vaultStorage.getItem(EXPANDED_KEY);
			if (!stored) return [];

			const parsed = parseJsonUnknown(stored);
			return Array.isArray(parsed)
				? parsed.filter((item): item is string => typeof item === "string")
				: [];
		} catch (error) {
			logger.error("[DeckSelectorStorage] 加载展开状态失败:", error);
			return [];
		}
	}

	/**
	 * 检查是否有保存的选择
	 */
	static hasStoredSelection(): boolean {
		return vaultStorage.getItem(STORAGE_KEY) !== null;
	}

	/**
	 * 获取选择的统计信息
	 */
	static getSelectionStats(): { count: number; lastUpdated?: string } {
		try {
			const deckIds = this.loadSelectedDecks();
			return {
				count: deckIds.length,
				lastUpdated: vaultStorage.getItem(`${STORAGE_KEY}-timestamp`) || undefined,
			};
		} catch {
			return { count: 0 };
		}
	}

	/**
	 * 更新时间戳
	 */
	private static updateTimestamp(): void {
		try {
			vaultStorage.setItem(`${STORAGE_KEY}-timestamp`, new Date().toISOString());
		} catch (error) {
			logger.error("[DeckSelectorStorage] 更新时间戳失败:", error);
		}
	}

	/**
	 * 保存选择并更新时间戳
	 */
	static saveWithTimestamp(deckIds: string[]): void {
		this.saveSelectedDecks(deckIds);
		this.updateTimestamp();
	}
}
