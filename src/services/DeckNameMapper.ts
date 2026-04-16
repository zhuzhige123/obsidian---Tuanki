/**
 * 牌组名称/ID 映射服务
 *
 * 提供牌组名称与 ID 之间的双向映射功能
 * 用于 YAML 属性栏卡片元数据方案中的 `we_decks` 字段处理
 */

import type { Deck } from "../data/types";
import type { WeavePlugin } from "../main";
import { logger } from "../utils/logger";

export class DeckNameMapper {
	private plugin: WeavePlugin;
	private nameToIdMap: Map<string, string> = new Map();
	private idToNameMap: Map<string, string> = new Map();
	private deckByIdMap: Map<string, Deck> = new Map();
	private initialized = false;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			const decks = await (this.plugin as any).dataStorage.getDecks();
			this.rebuildMaps(decks);
			this.initialized = true;
			logger.info(`[DeckNameMapper] ✅ 初始化完成，已映射 ${this.nameToIdMap.size} 个牌组`);
		} catch (error) {
			logger.error("[DeckNameMapper] ❌ 初始化失败:", error);
			throw error;
		}
	}

	rebuildMaps(decks: Deck[]): void {
		this.nameToIdMap.clear();
		this.idToNameMap.clear();
		this.deckByIdMap.clear();

		for (const deck of decks) {
			this.nameToIdMap.set(deck.name, deck.id);
			this.idToNameMap.set(deck.id, deck.name);
			this.deckByIdMap.set(deck.id, deck);
		}

		logger.debug(`[DeckNameMapper] 重建映射表: ${decks.length} 个牌组`);
	}

	getDeckIdByName(deckName: string): string | undefined {
		return this.nameToIdMap.get(deckName);
	}

	getDeckNameById(deckId: string): string | undefined {
		return this.idToNameMap.get(deckId);
	}

	getDeckById(deckId: string): Deck | undefined {
		return this.deckByIdMap.get(deckId);
	}

	getDeckByName(deckName: string): Deck | undefined {
		const deckId = this.nameToIdMap.get(deckName);
		return deckId ? this.deckByIdMap.get(deckId) : undefined;
	}

	getAllDecks(): Deck[] {
		return Array.from(this.deckByIdMap.values());
	}

	getDeckIdsByNames(deckNames: string[]): string[] {
		const ids: string[] = [];
		const seen = new Set<string>();

		for (const value of deckNames) {
			const normalized =
				this.nameToIdMap.get(value) || (this.idToNameMap.has(value) ? value : undefined) || value;
			if (!seen.has(normalized)) {
				seen.add(normalized);
				ids.push(normalized);
			}
		}

		return ids;
	}

	getDeckNamesByIds(deckIds: string[]): string[] {
		const names: string[] = [];
		const seen = new Set<string>();

		for (const value of deckIds) {
			const normalized =
				this.idToNameMap.get(value) || (this.nameToIdMap.has(value) ? value : undefined) || value;
			if (!seen.has(normalized)) {
				seen.add(normalized);
				names.push(normalized);
			}
		}

		return names;
	}

	hasDeckName(deckName: string): boolean {
		return this.nameToIdMap.has(deckName);
	}

	hasDeckId(deckId: string): boolean {
		return this.idToNameMap.has(deckId);
	}

	getAllDeckNames(): Set<string> {
		return new Set(this.nameToIdMap.keys());
	}

	getAllDeckIds(): Set<string> {
		return new Set(this.idToNameMap.keys());
	}

	validateDeckNames(deckNames: string[]): {
		valid: boolean;
		validNames: string[];
		invalidNames: string[];
	} {
		const validNames: string[] = [];
		const invalidNames: string[] = [];

		for (const name of deckNames) {
			if (this.nameToIdMap.has(name)) {
				validNames.push(name);
			} else {
				invalidNames.push(name);
			}
		}

		return {
			valid: invalidNames.length === 0,
			validNames,
			invalidNames,
		};
	}

	onDeckCreated(deck: Deck): void {
		this.nameToIdMap.set(deck.name, deck.id);
		this.idToNameMap.set(deck.id, deck.name);
		this.deckByIdMap.set(deck.id, deck);
		logger.debug(`[DeckNameMapper] 添加牌组映射: ${deck.name} -> ${deck.id}`);
	}

	onDeckDeleted(deckId: string): void {
		const name = this.idToNameMap.get(deckId);
		if (name) {
			this.nameToIdMap.delete(name);
			this.idToNameMap.delete(deckId);
			this.deckByIdMap.delete(deckId);
			logger.debug(`[DeckNameMapper] 删除牌组映射: ${name} -> ${deckId}`);
		}
	}

	onDeckRenamed(deckId: string, oldName: string, newName: string): void {
		this.nameToIdMap.delete(oldName);
		this.nameToIdMap.set(newName, deckId);
		this.idToNameMap.set(deckId, newName);

		const existingDeck = this.deckByIdMap.get(deckId);
		if (existingDeck) {
			this.deckByIdMap.set(deckId, {
				...existingDeck,
				name: newName,
			});
		}

		logger.debug(`[DeckNameMapper] 重命名牌组映射: ${oldName} -> ${newName} (${deckId})`);
	}

	async refresh(): Promise<void> {
		try {
			const decks = await (this.plugin as any).dataStorage.getDecks();
			this.rebuildMaps(decks);
			logger.debug("[DeckNameMapper] 映射表已刷新");
		} catch (error) {
			logger.error("[DeckNameMapper] 刷新映射表失败:", error);
		}
	}

	clear(): void {
		this.nameToIdMap.clear();
		this.idToNameMap.clear();
		this.deckByIdMap.clear();
		this.initialized = false;
		logger.debug("[DeckNameMapper] 映射表已清除");
	}
}

let deckNameMapperInstance: DeckNameMapper | null = null;

export function getDeckNameMapper(plugin?: WeavePlugin): DeckNameMapper {
	if (!deckNameMapperInstance && plugin) {
		deckNameMapperInstance = new DeckNameMapper(plugin);
	}
	if (!deckNameMapperInstance) {
		throw new Error("DeckNameMapper not initialized. Call with plugin first.");
	}
	return deckNameMapperInstance;
}

export async function initDeckNameMapper(plugin: WeavePlugin): Promise<DeckNameMapper> {
	deckNameMapperInstance = new DeckNameMapper(plugin);
	await deckNameMapperInstance.initialize();
	return deckNameMapperInstance;
}

export function destroyDeckNameMapper(): void {
	if (deckNameMapperInstance) {
		deckNameMapperInstance.clear();
		deckNameMapperInstance = null;
	}
}

let _loggedNotInitialized = false;

export function getDeckIdByName(deckName: string): string | undefined {
	if (!deckNameMapperInstance) {
		if (!_loggedNotInitialized) {
			_loggedNotInitialized = true;
			logger.debug("[DeckNameMapper] 服务未初始化，无法获取牌组ID（后续相同警告已静默）");
		}
		return undefined;
	}
	_loggedNotInitialized = false;
	return deckNameMapperInstance.getDeckIdByName(deckName);
}

export function getDeckNameById(deckId: string): string | undefined {
	if (!deckNameMapperInstance) {
		return undefined;
	}
	return deckNameMapperInstance.getDeckNameById(deckId);
}
