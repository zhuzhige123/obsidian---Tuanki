/**
 * 引用式牌组服务 (v2.0+ 平级架构)
 *
 * 核心职责：
 * 1. 管理牌组的 cardUUIDs 缓存
 * 2. 管理卡片内容 YAML 中的 we_decks 字段
 * 3. 维护兼容字段与真实数据之间的一致性
 * 4. 提供组建牌组、解散牌组、移除卡片等操作
 *
 * 设计原则：
 * - 冲突时永远以卡片 content YAML 中的 we_decks 为准
 * - deck.cardUUIDs 只是查询缓存和兼容索引，不是最终真值
 * - 支持一张卡片被多个牌组引用（类似 Obsidian 双链）
 *
 * v2.0+ 平级架构：
 * - 已移除父牌组支持（parentDeckId 已废弃）
 * - referencedByDecks 仅保留兼容用途，不能作为权威来源
 */

import { getV2PathsFromApp } from "../../config/paths";
import type { ApiResponse, Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { getCardDeckIds, setCardProperties } from "../../utils/yaml-utils";

export interface CreateDeckFromCardsOptions {
	/** 牌组名称 */
	name: string;
	/** @deprecated v2.0+ 平级架构不支持父牌组，此字段将被忽略 */
	parentDeckId?: string;
	/** 标签（单选） */
	tag?: string;
	/** 描述 */
	description?: string;
	/** 要引用的卡片 UUID 数组 */
	cardUUIDs: string[];
}

export interface AddCardsToDeckResult {
	success: boolean;
	addedCount: number;
	skippedCount: number;
	error?: string;
}

export interface RemoveCardsFromDeckResult {
	success: boolean;
	removedCount: number;
	error?: string;
	/** 变成孤儿的卡片 UUID */
	orphanedCards?: string[];
}

export interface DissolveDeckResult {
	success: boolean;
	/** 受影响的卡片数量 */
	affectedCards: number;
	/** 变成孤儿的卡片 UUID */
	orphanedCards: string[];
	error?: string;
}

export class ReferenceDeckService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 从选中的卡片创建新牌组
	 *
	 * 流程：
	 * 1. 创建新牌组并写入 cardUUIDs 缓存
	 * 2. 更新每张卡片 YAML 中的 we_decks
	 * 3. 兼容更新 referencedByDecks
	 */
	async createDeckFromCards(options: CreateDeckFromCardsOptions): Promise<ApiResponse<Deck>> {
		const { name, tag, description, cardUUIDs } = options;

		try {
			if (!cardUUIDs || cardUUIDs.length === 0) {
				return {
					success: false,
					error: "至少需要选择一张卡片",
					timestamp: new Date().toISOString(),
				};
			}

			const existingDecks = await this.plugin.dataStorage.getDecks();
			if (existingDecks.some((d) => d.name === name)) {
				return {
					success: false,
					error: `牌组名称"${name}"已存在`,
					timestamp: new Date().toISOString(),
				};
			}

			const { generateCardUUID } = await import("../identifier/WeaveIDGenerator");
			const deckId = `deck_${generateCardUUID().slice(0, 12)}`;
			const now = new Date();

			const newDeck: Deck = {
				id: deckId,
				name,
				description: description || "",
				category: tag || "",
				cardUUIDs: [...cardUUIDs],
				path: name,
				level: 0,
				order: existingDecks.length,
				inheritSettings: false,
				created: now.toISOString(),
				modified: now.toISOString(),
				settings: await this.getDefaultDeckSettings(),
				includeSubdecks: false,
				stats: {
					totalCards: cardUUIDs.length,
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
				},
				tags: tag ? [tag] : [],
				metadata: {},
			};

			const saveResult = await this.plugin.dataStorage.saveDeck(newDeck);
			if (!saveResult.success) {
				return saveResult;
			}

			await this.addDeckReferenceToCards(deckId, cardUUIDs);

			logger.info(`[ReferenceDeck] 创建牌组成功: ${name}, 引用 ${cardUUIDs.length} 张卡片`);

			return {
				success: true,
				data: newDeck,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			logger.error("[ReferenceDeck] 创建牌组失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "创建牌组失败",
				timestamp: new Date().toISOString(),
			};
		}
	}

	/**
	 * 向牌组添加卡片引用
	 */
	async addCardsToDeck(deckId: string, cardUUIDs: string[]): Promise<AddCardsToDeckResult> {
		try {
			const deck = await this.plugin.dataStorage.getDeck(deckId);
			if (!deck) {
				return { success: false, addedCount: 0, skippedCount: 0, error: "牌组不存在" };
			}

			const existingUUIDs = new Set(deck.cardUUIDs || []);
			const newUUIDs: string[] = [];
			let skippedCount = 0;

			for (const uuid of cardUUIDs) {
				if (existingUUIDs.has(uuid)) {
					skippedCount++;
				} else {
					newUUIDs.push(uuid);
					existingUUIDs.add(uuid);
				}
			}

			if (newUUIDs.length === 0) {
				return { success: true, addedCount: 0, skippedCount };
			}

			deck.cardUUIDs = Array.from(existingUUIDs);
			deck.modified = new Date().toISOString();
			await this.plugin.dataStorage.saveDeck(deck);

			await this.addDeckReferenceToCards(deckId, newUUIDs);

			logger.info(`[ReferenceDeck] 添加 ${newUUIDs.length} 张卡片到牌组 ${deck.name}`);

			return { success: true, addedCount: newUUIDs.length, skippedCount };
		} catch (error) {
			logger.error("[ReferenceDeck] 添加卡片失败:", error);
			return {
				success: false,
				addedCount: 0,
				skippedCount: 0,
				error: error instanceof Error ? error.message : "添加卡片失败",
			};
		}
	}

	/**
	 * 从牌组移除卡片引用（不删除卡片数据）
	 */
	async removeCardsFromDeck(
		deckId: string,
		cardUUIDs: string[]
	): Promise<RemoveCardsFromDeckResult> {
		try {
			const deck = await this.plugin.dataStorage.getDeck(deckId);
			if (!deck) {
				return { success: false, removedCount: 0, error: "牌组不存在" };
			}

			const existingUUIDs = new Set(deck.cardUUIDs || []);
			const removedUUIDs: string[] = [];

			for (const uuid of cardUUIDs) {
				if (existingUUIDs.has(uuid)) {
					existingUUIDs.delete(uuid);
					removedUUIDs.push(uuid);
				}
			}

			if (removedUUIDs.length === 0) {
				return { success: true, removedCount: 0 };
			}

			deck.cardUUIDs = Array.from(existingUUIDs);
			deck.modified = new Date().toISOString();
			await this.plugin.dataStorage.saveDeck(deck);

			const orphanedCards = await this.removeDeckReferenceFromCards(deckId, removedUUIDs);

			logger.info(`[ReferenceDeck] 从牌组 ${deck.name} 移除 ${removedUUIDs.length} 张卡片`);

			return {
				success: true,
				removedCount: removedUUIDs.length,
				orphanedCards,
			};
		} catch (error) {
			logger.error("[ReferenceDeck] 移除卡片失败:", error);
			return {
				success: false,
				removedCount: 0,
				error: error instanceof Error ? error.message : "移除卡片失败",
			};
		}
	}

	/**
	 * 解散牌组（删除牌组但保留卡片）
	 */
	async dissolveDeck(deckId: string): Promise<DissolveDeckResult> {
		try {
			const deck = await this.plugin.dataStorage.getDeck(deckId);
			if (!deck) {
				return { success: false, affectedCards: 0, orphanedCards: [], error: "牌组不存在" };
			}

			const deckCards = await this.plugin.dataStorage.getDeckCards(deckId);
			const cardUUIDs = deckCards.map((card) => card.uuid);

			await this.moveCardsToUnifiedStorage(deckId);

			const orphanedCards = await this.removeDeckReferenceFromCards(deckId, cardUUIDs);

			await this.deleteDeckOnly(deckId);

			const remainingDecks = await this.plugin.dataStorage.getDecks();
			if (remainingDecks.length === 0) {
				await this.ensureDefaultDeck();
			}

			logger.info(`[ReferenceDeck] 解散牌组 ${deck.name}, 影响 ${cardUUIDs.length} 张卡片`);

			return {
				success: true,
				affectedCards: cardUUIDs.length,
				orphanedCards,
			};
		} catch (error) {
			logger.error("[ReferenceDeck] 解散牌组失败:", error);
			return {
				success: false,
				affectedCards: 0,
				orphanedCards: [],
				error: error instanceof Error ? error.message : "解散牌组失败",
			};
		}
	}

	/**
	 * 获取卡片当前属于哪些牌组
	 */
	async getCardReferences(cardUUID: string): Promise<string[]> {
		try {
			const card = await this.findCardByUUID(cardUUID);
			if (!card) {
				return [];
			}

			const decks = await this.plugin.dataStorage.getDecks();
			return getCardDeckIds(card, decks, { fallbackToReferences: false }).deckIds;
		} catch (error) {
			logger.error("[ReferenceDeck] 获取卡片引用失败:", error);
			return [];
		}
	}

	/**
	 * 获取牌组引用的所有卡片
	 */
	async getDeckCards(deckId: string): Promise<Card[]> {
		try {
			return await this.plugin.dataStorage.getDeckCards(deckId);
		} catch (error) {
			logger.error("[ReferenceDeck] 获取牌组卡片失败:", error);
			return [];
		}
	}

	/**
	 * 获取孤儿卡片（不属于任何牌组的卡片）
	 */
	async getOrphanCards(): Promise<Card[]> {
		try {
			const allCards = await this.plugin.dataStorage.getCards();
			const allDecks = await this.plugin.dataStorage.getDecks();
			return allCards.filter(
				(card) =>
					getCardDeckIds(card, allDecks, { fallbackToReferences: false }).deckIds.length === 0
			);
		} catch (error) {
			logger.error("[ReferenceDeck] 获取孤儿卡片失败:", error);
			return [];
		}
	}

	/**
	 * 删除单张卡片时的级联操作
	 * 在真正删除卡片数据前，先从所有牌组缓存中移除其 UUID
	 */
	async cascadeDeleteCard(
		cardUUID: string
	): Promise<{ success: boolean; affectedDecks: number; error?: string }> {
		const result = await this.cascadeDeleteCards([cardUUID]);
		return {
			success: result.success,
			affectedDecks: result.totalAffectedDecks,
			error: result.errors[0],
		};
	}

	/**
	 * 批量级联删除卡片
	 */
	async cascadeDeleteCards(
		cardUUIDs: string[],
		options?: { skipDeckIds?: string[] }
	): Promise<{ success: boolean; totalAffectedDecks: number; errors: string[] }> {
		const errors: string[] = [];
		let totalAffectedDecks = 0;

		const deleteUUIDSet = new Set(cardUUIDs.filter(Boolean));
		if (deleteUUIDSet.size === 0) {
			return { success: true, totalAffectedDecks: 0, errors };
		}

		const skipDeckIds = new Set(options?.skipDeckIds?.filter(Boolean) || []);

		try {
			const decks = await this.plugin.dataStorage.getDecks();

			for (const deck of decks) {
				if (skipDeckIds.has(deck.id)) {
					continue;
				}

				const before = deck.cardUUIDs?.length || 0;
				if (before === 0) {
					continue;
				}

				const filteredUUIDs = (deck.cardUUIDs ?? []).filter((uuid) => !deleteUUIDSet.has(uuid));
				if (filteredUUIDs.length === before) {
					continue;
				}

				try {
					deck.cardUUIDs = filteredUUIDs;
					deck.modified = new Date().toISOString();
					await this.plugin.dataStorage.saveDeck(deck);
					totalAffectedDecks++;
					logger.debug(
						`[ReferenceDeck] 从牌组 ${deck.name} 批量移除了 ${
							before - filteredUUIDs.length
						} 个卡片引用`
					);
				} catch (deckError) {
					const message = deckError instanceof Error ? deckError.message : String(deckError);
					errors.push(`${deck.id}: ${message}`);
					logger.warn(`[ReferenceDeck] 从牌组 ${deck.id} 批量移除卡片引用失败:`, deckError);
				}
			}

			logger.info(
				`[ReferenceDeck] 批量级联删除完成，处理 ${deleteUUIDSet.size} 张卡片，影响 ${totalAffectedDecks} 个牌组`
			);
		} catch (error) {
			logger.error("[ReferenceDeck] 批量级联删除卡片失败:", error);
			errors.push(error instanceof Error ? error.message : "批量级联删除失败");
		}

		return {
			success: errors.length === 0,
			totalAffectedDecks,
			errors,
		};
	}

	// ===== 私有方法 =====

	/**
	 * 向卡片添加牌组引用
	 * 同时更新 YAML 中的 we_decks 和兼容字段 referencedByDecks
	 */
	private async addDeckReferenceToCards(deckId: string, cardUUIDs: string[]): Promise<void> {
		const allDecks = await this.plugin.dataStorage.getDecks();
		const deckById = new Map(allDecks.map((deck) => [deck.id, deck] as const));
		const targetDeck = deckById.get(deckId) || (await this.plugin.dataStorage.getDeck(deckId));
		if (!targetDeck) {
			return;
		}
		const updatedCards: Card[] = [];
		const staleDeckRemovals = new Map<string, Set<string>>();

		for (const uuid of cardUUIDs) {
			const card = await this.findCardByUUID(uuid);
			if (!card) {
				continue;
			}

			const currentDeckIds = getCardDeckIds(card, allDecks).deckIds;
			const previousFormalDeckId = currentDeckIds.find(
				(currentDeckId) => deckById.get(currentDeckId)?.purpose !== "test"
			);
			const preservedTestDeckIds = currentDeckIds.filter(
				(currentDeckId) => deckById.get(currentDeckId)?.purpose === "test"
			);
			const nextDeckIds =
				targetDeck.purpose === "test"
					? Array.from(new Set([...currentDeckIds, deckId]))
					: [deckId, ...preservedTestDeckIds.filter((currentDeckId) => currentDeckId !== deckId)];
			const nextDeckNames = nextDeckIds.map(
				(currentDeckId) => deckById.get(currentDeckId)?.name || currentDeckId
			);
			card.content = setCardProperties(card.content || "", {
				we_decks: nextDeckNames.length > 0 ? nextDeckNames : undefined,
			});
			card.referencedByDecks = nextDeckIds;
			if (nextDeckIds.length > 0) {
				card.deckId = nextDeckIds[0];
			} else {
				(card as Partial<Card>).deckId = undefined;
			}

			card.modified = new Date().toISOString();
			updatedCards.push(card);

			if (
				targetDeck.purpose !== "test" &&
				previousFormalDeckId &&
				previousFormalDeckId !== deckId
			) {
				const removalSet = staleDeckRemovals.get(previousFormalDeckId) || new Set<string>();
				removalSet.add(uuid);
				staleDeckRemovals.set(previousFormalDeckId, removalSet);
			}
		}

		if (updatedCards.length > 0) {
			const cardsToSave = updatedCards.map((card) => {
				const cloned: any = { ...card };
				return cloned as Card;
			});
			await this.plugin.dataStorage.saveCardsBatch(cardsToSave);
		}

		for (const [staleDeckId, removalSet] of staleDeckRemovals.entries()) {
			const staleDeck = deckById.get(staleDeckId);
			if (!staleDeck) {
				continue;
			}

			const nextCardUUIDs = (staleDeck.cardUUIDs || []).filter((uuid) => !removalSet.has(uuid));
			if (nextCardUUIDs.length === (staleDeck.cardUUIDs || []).length) {
				continue;
			}

			staleDeck.cardUUIDs = nextCardUUIDs;
			staleDeck.modified = new Date().toISOString();
			await this.plugin.dataStorage.saveDeck(staleDeck);
		}

		logger.debug(`[ReferenceDeck] 批量更新了 ${updatedCards.length} 张卡片的牌组引用`);
	}

	/**
	 * 从卡片移除牌组引用
	 * 同时更新 YAML 中的 we_decks 和兼容字段 referencedByDecks
	 * @returns 变成孤儿的卡片 UUID 数组
	 */
	private async removeDeckReferenceFromCards(
		deckId: string,
		cardUUIDs: string[]
	): Promise<string[]> {
		const allDecks = await this.plugin.dataStorage.getDecks();
		const deckById = new Map(allDecks.map((deck) => [deck.id, deck] as const));
		const targetDeck = deckById.get(deckId) || (await this.plugin.dataStorage.getDeck(deckId));
		if (!targetDeck) {
			return [];
		}
		const orphanedCards: string[] = [];
		const updatedCards: Card[] = [];

		for (const uuid of cardUUIDs) {
			const card = await this.findCardByUUID(uuid);
			if (!card) {
				continue;
			}

			const currentDeckIds = getCardDeckIds(card, allDecks).deckIds;
			const remainingDeckIds =
				targetDeck.purpose === "test"
					? currentDeckIds.filter((currentDeckId) => currentDeckId !== deckId)
					: currentDeckIds.filter((currentDeckId) => deckById.get(currentDeckId)?.purpose === "test");
			const remainingDeckNames = remainingDeckIds.map(
				(currentDeckId) => deckById.get(currentDeckId)?.name || currentDeckId
			);
			card.content = setCardProperties(card.content || "", {
				we_decks: remainingDeckNames.length > 0 ? remainingDeckNames : undefined,
			});
			card.referencedByDecks = remainingDeckIds;
			if (remainingDeckIds.length > 0) {
				card.deckId = remainingDeckIds[0];
			} else {
				(card as Partial<Card>).deckId = undefined;
			}

			card.modified = new Date().toISOString();

			if (remainingDeckIds.length === 0) {
				orphanedCards.push(uuid);
			}

			updatedCards.push(card);
		}

		if (updatedCards.length > 0) {
			const cardsToSave = updatedCards.map((card) => {
				const cloned: any = { ...card };
				return cloned as Card;
			});
			await this.plugin.dataStorage.saveCardsBatch(cardsToSave);
		}

		logger.debug(
			`[ReferenceDeck] 批量移除了 ${updatedCards.length} 张卡片的牌组引用，其中 ${orphanedCards.length} 张变成孤儿`
		);

		return orphanedCards;
	}

	/**
	 * 通过 UUID 查找卡片
	 * 优先利用索引定位候选牌组，找不到时再回退全量扫描
	 */
	private async findCardByUUID(uuid: string): Promise<Card | null> {
		if (this.plugin.cardIndexService) {
			const deckId = this.plugin.cardIndexService.getDeckIdByUUID(uuid);
			if (deckId) {
				const cards = await this.plugin.dataStorage.getDeckCards(deckId);
				const matched = cards.find((card) => card.uuid === uuid);
				if (matched) {
					return matched;
				}
			}
		}

		const allCards = await this.plugin.dataStorage.getCards();
		return allCards.find((card) => card.uuid === uuid) || null;
	}

	/**
	 * 将牌组中的卡片迁移到统一卡片存储
	 */
	private async moveCardsToUnifiedStorage(deckId: string): Promise<void> {
		try {
			const cardsToMove = await this.plugin.dataStorage.getDeckCards(deckId);
			if (cardsToMove.length === 0) {
				logger.debug(`[ReferenceDeck] 牌组 ${deckId} 没有卡片需要迁移`);
				return;
			}

			const now = new Date().toISOString();
			const updatedCards = cardsToMove.map((_card) => {
				const updatedCard: Card = {
					..._card,
					modified: now,
				};
				(updatedCard as any).deckId = undefined;
				return updatedCard;
			});

			await this.plugin.dataStorage.saveCardsBatch(updatedCards);

			logger.info(
				`[ReferenceDeck] 已将 ${updatedCards.length} 张卡片从牌组 ${deckId} 转入统一卡片存储`
			);
		} catch (error) {
			logger.error("[ReferenceDeck] 移动卡片到统一存储失败:", error);
		}
	}

	/**
	 * 仅删除牌组（不删除卡片数据）
	 */
	private async deleteDeckOnly(deckId: string): Promise<void> {
		const decks = await this.plugin.dataStorage.getDecks();
		const filteredDecks = decks.filter((d) => d.id !== deckId);

		const adapter = this.plugin.app.vault.adapter;
		const v2Paths = getV2PathsFromApp(this.plugin.app);
		await DirectoryUtils.ensureDirRecursive(adapter, v2Paths.memory.root);
		await adapter.write(v2Paths.memory.decks, JSON.stringify({ decks: filteredDecks }));
	}

	/**
	 * 确保存在默认牌组
	 */
	private async ensureDefaultDeck(): Promise<void> {
		const { generateCardUUID } = await import("../identifier/WeaveIDGenerator");
		const now = new Date();

		const defaultDeck: Deck = {
			id: `deck_${generateCardUUID().slice(0, 12)}`,
			name: "默认牌组",
			description: "自动创建的默认牌组",
			category: "默认",
			cardUUIDs: [],
			path: "默认牌组",
			level: 0,
			order: 0,
			inheritSettings: false,
			created: now.toISOString(),
			modified: now.toISOString(),
			settings: await this.getDefaultDeckSettings(),
			includeSubdecks: false,
			stats: {
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
			},
			tags: [],
			metadata: { autoCreated: true },
		};

		await this.plugin.dataStorage.saveDeck(defaultDeck);
		logger.info("[ReferenceDeck] 自动创建默认牌组");
	}

	/**
	 * 获取默认牌组设置
	 */
	private async getDefaultDeckSettings() {
		return this.plugin.dataStorage.getCurrentDefaultDeckSettings({
			newCardsPerDay: 20,
			maxReviewsPerDay: 100,
			enableAutoAdvance: true,
			showAnswerTime: 0,
		});
	}
}

// 单例导出
let referenceDeckServiceInstance: ReferenceDeckService | null = null;

export function getReferenceDeckService(plugin?: WeavePlugin): ReferenceDeckService {
	if (!referenceDeckServiceInstance && plugin) {
		referenceDeckServiceInstance = new ReferenceDeckService(plugin);
	}
	if (!referenceDeckServiceInstance) {
		throw new Error("ReferenceDeckService not initialized");
	}
	return referenceDeckServiceInstance;
}

export function initReferenceDeckService(plugin: WeavePlugin): ReferenceDeckService {
	referenceDeckServiceInstance = new ReferenceDeckService(plugin);
	return referenceDeckServiceInstance;
}
