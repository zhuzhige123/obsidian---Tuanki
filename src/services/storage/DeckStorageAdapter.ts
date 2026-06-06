import { logger } from "../../utils/logger";
/**
 * 牌组存储适配器
 * 实现 IDeckStorage 接口，适配现有的数据存储服务
 */

import type { WeavePlugin } from "../../main";
import { DeckInfo, IDeckStorage } from "../batch-parsing";

/**
 * 牌组存储适配器类
 */
export class DeckStorageAdapter implements IDeckStorage {
	private plugin: WeavePlugin;
	private deckCache: Map<string, DeckInfo> = new Map();

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 获取所有牌组
	 */
	async getDecks(): Promise<DeckInfo[]> {
		try {
			const dataStorage = this.plugin.dataStorage;
			if (!dataStorage) {
				logger.error("[DeckStorageAdapter] 数据存储服务不可用");
				return [];
			}

			const decks = await dataStorage.getDecks();
			const deckInfos: DeckInfo[] = decks.map((deck) => ({
				id: deck.id,
				name: deck.name,
				description: deck.description || "",
			}));

			deckInfos.forEach((deck) => this.deckCache.set(deck.id, deck));
			return deckInfos;
		} catch (error) {
			logger.error("[DeckStorageAdapter] 获取牌组列表失败:", error);
			return [];
		}
	}

	/**
	 * 根据ID获取牌组
	 */
	async getDeckById(id: string): Promise<DeckInfo | null> {
		// 先检查缓存
		if (this.deckCache.has(id)) {
			return this.deckCache.get(id)!;
		}

		// 从所有牌组中查找
		const decks = await this.getDecks();
		return decks.find((d) => d.id === id) || null;
	}

	/**
	 * 根据名称获取牌组
	 */
	async getDeckByName(name: string): Promise<DeckInfo | null> {
		const decks = await this.getDecks();
		return decks.find((d) => d.name === name) || null;
	}

	/**
	 * 创建新牌组
	 */
	async createDeck(name: string, description?: string): Promise<DeckInfo> {
		try {
			const dataStorage = this.plugin.dataStorage;
			if (!dataStorage) {
				logger.error("[DeckStorageAdapter] 创建牌组功能不可用");
				throw new Error("数据存储服务不支持创建牌组");
			}

			const savedDeck = await dataStorage.createUserMemoryDeck(name);
			if (savedDeck) {
				const deck: DeckInfo = {
					id: savedDeck.id,
					name: savedDeck.name,
					description: description || savedDeck.description || "",
				};

				this.deckCache.set(deck.id, deck);
				logger.debug(`[DeckStorageAdapter] ✅ 已创建牌组: ${deck.name} (${deck.id})`);
				return deck;
			}

			throw new Error("创建牌组失败");
		} catch (error) {
			logger.error("[DeckStorageAdapter] 创建牌组失败:", error);

			const tempDeck: DeckInfo = {
				id: this.generateDeckId(),
				name,
				description: description || "",
			};

			this.deckCache.set(tempDeck.id, tempDeck);
			return tempDeck;
		}
	}

	/**
	 * 检查牌组是否存在
	 */
	async deckExists(id: string): Promise<boolean> {
		const deck = await this.getDeckById(id);
		return deck !== null;
	}

	/**
	 * 生成牌组ID
	 */
	private generateDeckId(): string {
		return `deck_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		this.deckCache.clear();
	}
}
