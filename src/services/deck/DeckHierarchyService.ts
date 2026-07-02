import { logger } from "../../utils/logger";
/**
 * 牌组管理服务（平级架构）
 *
 * @description Weave v2.0+ 采用平级牌组架构，所有牌组都是平级的，无父子层级关系。
 *
 * ℹ 历史说明：
 * - 旧版本支持父子牌组层级（parentId, level, path 等）
 * - v2.0+ 已废弃层级结构，相关方法已标记 Compatibility note:
 * - 保留服务名称 DeckHierarchyService 仅为向后兼容
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck, DeckSettings, DeckStats } from "../../data/types";
import { normalizeWDeckLogicalDeckId } from "../wdeck/WDeckService";
import { getCardMetadata, setCardProperty } from "../../utils/yaml-utils";

/**
 * Compatibility note: 平级架构不再需要树节点结构，保留仅为向后兼容
 * 平级架构下 children 始终为空数组
 */
export interface DeckTreeNode {
	deck: Deck;
	/** Compatibility note: 平级架构下始终为 [] */
	children: DeckTreeNode[];
}

/**
 * 牌组管理服务（平级架构）
 *
 * 核心功能：
 * - 创建牌组
 * - 重命名牌组（联动更新卡片 we_decks）
 * - 删除牌组
 * - 排序牌组
 *
 * Compatibility note: 父子牌组层级功能已废弃：
 * - getDeckTree() - 返回平级列表（children 始终为空）
 */
export class DeckHierarchyService {
	private storage: WeaveDataStorage;
	private syncHooks: Array<{
		onMove?: (deckId: string, newParentId: string | null) => Promise<void>;
		onRename?: (deckId: string, newName: string) => Promise<void>;
		onDelete?: (deckId: string) => Promise<void>;
	}> = [];

	constructor(storage: WeaveDataStorage) {
		this.storage = storage;
	}

	/**
	 * 注册同步钩子
	 * 用于在牌组操作时触发其他系统的同步逻辑（如考试牌组同步）
	 */
	registerSyncHook(hooks: {
		onMove?: (deckId: string, newParentId: string | null) => Promise<void>;
		onRename?: (deckId: string, newName: string) => Promise<void>;
		onDelete?: (deckId: string) => Promise<void>;
	}): void {
		this.syncHooks.push(hooks);
	}

	/**
	 * 校验牌组名称唯一性
	 * @param name 新名称
	 * @param excludeDeckId 排除的牌组ID（重命名时使用）
	 * @throws Error 如果名称已存在
	 */
	async validateDeckName(name: string, excludeDeckId?: string): Promise<void> {
		if (!name || name.trim().length === 0) {
			throw new Error("牌组名称不能为空");
		}

		const normalizedName = name.trim();
		const excludedDeckIds = new Set<string>();
		const normalizedExclude = String(excludeDeckId || "").trim();
		if (normalizedExclude) {
			excludedDeckIds.add(normalizedExclude);
			excludedDeckIds.add(normalizeWDeckLogicalDeckId(normalizedExclude));
		}

		const allDecks = await this.storage.getDecks();
		const isDuplicate = allDecks.some((deck) => {
			if (String(deck.name || "").trim() !== normalizedName) {
				return false;
			}

			const deckId = String(deck.id || "").trim();
			if (!deckId) {
				return true;
			}

			if (excludedDeckIds.has(deckId)) {
				return false;
			}

			if (
				normalizedExclude &&
				excludedDeckIds.has(normalizeWDeckLogicalDeckId(deck.id, deck.name))
			) {
				return false;
			}

			return true;
		});

		if (isDuplicate) {
			throw new Error(`牌组名称「${normalizedName}」已存在`);
		}
	}

	/**
	 * 创建牌组
	 *
	 * @param name 牌组名称（必须唯一）
	 * @param settings 可选的牌组设置
	 * @returns 创建的牌组对象
	 */
	async createDeck(name: string, settings?: Partial<DeckSettings>): Promise<Deck> {
		// 校验名称唯一性
		await this.validateDeckName(name);

		const now = new Date().toISOString();
		const profile = await this.storage.getUserProfile();

		const deck: Deck = {
			id: this.generateDeckId(),
			name,
			description: "",
			category: "默认",

			// 层级结构
			parentId: undefined,
			path: name,
			level: 0,
			order: await this.getNextOrder(null),

			// 设置
			inheritSettings: false,
			settings: settings
				? { ...profile.globalSettings.defaultDeckSettings, ...settings }
				: profile.globalSettings.defaultDeckSettings,

			// 统计
			stats: this.createEmptyStats(),
			includeSubdecks: false,

			// 牌组类型
			deckType: "mixed",

			// 时间戳
			created: now,
			modified: now,

			// 元数据
			tags: [],
			metadata: {},
		};

		await this.storage.saveDeck(deck);
		logger.debug(`✅ Created deck: ${deck.name}`);
		return deck;
	}

	/**
	 * 重命名牌组
	 *
	 * 流程：
	 * 1. 校验新名称唯一性
	 * 2. 更新牌组名称和路径
	 * 3. 联动更新引用该牌组的卡片的 we_decks 字段
	 */
	async renameDeck(deckId: string, newName: string): Promise<void> {
		const deck = await this.storage.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck not found: ${deckId}`);
		}

		// 1. 校验新名称唯一性
		await this.validateDeckName(newName, deckId);

		const oldName = deck.name;

		// 如果名称没变化，直接返回
		if (oldName === newName) {
			return;
		}

		deck.name = newName;
		// 平级架构：path 始终等于 name
		deck.path = newName;

		deck.modified = new Date().toISOString();
		await this.storage.saveDeck(deck);

		// 2. 联动更新卡片的 we_decks 字段
		await this.updateCardsWeDecksByRename(oldName, newName);

		// 触发同步钩子
		for (const hook of this.syncHooks) {
			if (hook.onRename) {
				try {
					await hook.onRename(deckId, newName);
				} catch (error) {
					logger.error("[DeckHierarchyService] 同步钩子执行失败 (onRename):", error);
				}
			}
		}

		logger.info(`✅ Renamed deck from "${oldName}" to "${newName}"`);
	}

	/**
	 * 删除牌组
	 *
	 * 平级架构：直接删除指定牌组，无子牌组
	 */
	async deleteDeck(deckId: string, options?: { skipCardDeletion?: boolean }): Promise<void> {
		await this.storage.deleteDeck(deckId, options);

		// 触发同步钩子
		for (const hook of this.syncHooks) {
			if (hook.onDelete) {
				try {
					await hook.onDelete(deckId);
				} catch (error) {
					logger.error("[DeckHierarchyService] 同步钩子执行失败 (onDelete):", error);
				}
			}
		}

		logger.debug(`✅ Deleted deck: ${deckId}`);
	}

	/**
	 * 获取所有牌组（平级列表）
	 */
	async getAllDecks(): Promise<Deck[]> {
		const allDecks = await this.storage.getDecks();
		// 按order排序
		allDecks.sort((a, b) => (a.order || 0) - (b.order || 0));
		return allDecks;
	}

	/**
	 * 获取牌组树
	 *
	 * Compatibility note: 平级架构下返回的树节点 children 始终为空数组
	 * 请使用 getAllDecks() 获取平级列表
	 */
	async getDeckTree(): Promise<DeckTreeNode[]> {
		const allDecks = await this.getAllDecks();
		// 平级架构：所有牌组都是根节点，children 始终为空
		return allDecks.map((_d) => ({ deck: _d, children: [] }));
	}

	/**
	 * 更新牌组排序
	 */
	async updateOrder(deckId: string, newOrder: number): Promise<void> {
		const deck = await this.storage.getDeck(deckId);
		if (!deck) {
			throw new Error(`Deck not found: ${deckId}`);
		}

		deck.order = newOrder;
		deck.modified = new Date().toISOString();
		await this.storage.saveDeck(deck);
	}

	/**
	 * 重新排序牌组
	 *
	 * @param orderedDeckIds 排序后的牌组ID数组
	 */
	async reorderDecks(orderedDeckIds: string[]): Promise<void> {
		for (let i = 0; i < orderedDeckIds.length; i++) {
			await this.updateOrder(orderedDeckIds[i], i);
		}
	}

	// ===== 私有辅助方法 =====

	/**
	 * 牌组重命名时，联动更新所有引用该牌组的卡片的 we_decks 字段
	 *
	 * @param oldName 旧牌组名称
	 * @param newName 新牌组名称
	 */
	private async updateCardsWeDecksByRename(oldName: string, newName: string): Promise<void> {
		try {
			// 获取所有卡片
			const allDecks = await this.storage.getDecks();
			const allCards: Card[] = [];

			for (const deck of allDecks) {
				try {
					const deckCards = await this.storage.getDeckCards(deck.id);
					allCards.push(...deckCards);
				} catch {
					// 忽略空牌组
				}
			}

			// 去重（同一张卡片可能被多个牌组引用）
			const uniqueCards = new Map<string, Card>();
			for (const card of allCards) {
				if (!uniqueCards.has(card.uuid)) {
					uniqueCards.set(card.uuid, card);
				}
			}

			// 筛选出引用了旧牌组名称的卡片
			const affectedCards: Card[] = [];
			for (const card of uniqueCards.values()) {
				if (!card.content) continue;

				try {
					const metadata = getCardMetadata(card.content);
					if (metadata.we_decks?.includes(oldName)) {
						affectedCards.push(card);
					}
				} catch {
					// 忽略解析失败的卡片
				}
			}

			if (affectedCards.length === 0) {
				logger.debug(`[DeckHierarchyService] 没有卡片引用牌组「${oldName}」，无需更新`);
				return;
			}

			logger.info(`[DeckHierarchyService] 开始更新 ${affectedCards.length} 张卡片的 we_decks...`);

			// 批量更新卡片
			let updatedCount = 0;
			for (const card of affectedCards) {
				try {
					const metadata = getCardMetadata(card.content);
					const updatedDecks = metadata.we_decks?.map((_name) =>
						_name === oldName ? newName : _name
					);

					card.content = setCardProperty(card.content, "we_decks", updatedDecks);
					card.modified = new Date().toISOString();

					await this.storage.saveCard(card);
					updatedCount++;
				} catch (e) {
					logger.warn(`[DeckHierarchyService] 更新卡片 ${card.uuid} 的 we_decks 失败:`, e);
				}
			}

			logger.info(
				`[DeckHierarchyService] 已更新 ${updatedCount}/${affectedCards.length} 张卡片的 we_decks`
			);
		} catch (error) {
			logger.error("[DeckHierarchyService] 联动更新卡片 we_decks 失败:", error);
			// 不抛出错误，避免阻断重命名流程
		}
	}

	/**
	 * 获取下一个排序号（平级架构）
	 */
	private async getNextOrder(_parentId?: string | null): Promise<number> {
		const allDecks = await this.storage.getDecks();

		if (allDecks.length === 0) {
			return 0;
		}

		const maxOrder = Math.max(...allDecks.map((d) => d.order || 0));
		return maxOrder + 1;
	}

	/**
	 * 生成牌组ID
	 */
	private generateDeckId(): string {
		return `deck_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	/**
	 * 创建空统计对象
	 */
	private createEmptyStats(): DeckStats {
		return {
			totalCards: 0,
			newCards: 0,
			learningCards: 0,
			reviewCards: 0,
			todayNew: 0,
			todayReview: 0,
			todayTime: 0,
			totalReviews: 0,
			totalTime: 0,
			memoryRate: 0,
			averageEase: 0,
			forecastDays: {},
		};
	}
}
