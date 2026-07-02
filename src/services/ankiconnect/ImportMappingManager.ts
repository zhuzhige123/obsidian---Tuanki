import { logger } from "../../utils/logger";
/**
 * 导入映射管理器
 *
 * 管理Anki卡片与Weave卡片之间的映射关系
 * 用于增量同步、UUID追踪和冲突检测
 *
 * @module services/ankiconnect
 */

import { getPluginPaths } from "../../config/paths";
import type { ImportMapping } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { DirectoryUtils } from "../../utils/directory-utils";
import { isRecord, parseJsonUnknown, readNumber, readString } from "../../utils/typed-json";

function parseStoredImportMapping(value: unknown): ImportMapping | null {
	if (!isRecord(value)) {
		return null;
	}

	const id = readString(value, "id");
	const weaveCardId = readString(value, "weaveCardId");
	const uuid = readString(value, "uuid");
	const lastSyncTime = readString(value, "lastSyncTime");
	const lastModifiedInWeave = readString(value, "lastModifiedInWeave");
	const lastModifiedInAnki = readString(value, "lastModifiedInAnki");
	const ankiNoteId = readNumber(value, "ankiNoteId");
	const syncVersion = readNumber(value, "syncVersion");
	const contentHash = readString(value, "contentHash");

	if (
		!id ||
		!weaveCardId ||
		!uuid ||
		!lastSyncTime ||
		!lastModifiedInWeave ||
		!lastModifiedInAnki ||
		ankiNoteId === undefined ||
		syncVersion === undefined ||
		contentHash === undefined
	) {
		return null;
	}

	const syncStatus = readString(value, "syncStatus");
	const ankiModelId = readNumber(value, "ankiModelId");
	const ankiModelName = readString(value, "ankiModelName");

	return {
		id,
		weaveCardId,
		ankiNoteId,
		uuid,
		lastSyncTime,
		lastModifiedInWeave,
		lastModifiedInAnki,
		syncVersion,
		contentHash,
		...(ankiModelId !== undefined ? { ankiModelId } : {}),
		...(ankiModelName ? { ankiModelName } : {}),
		...(syncStatus === "synced" ||
		syncStatus === "weave_modified" ||
		syncStatus === "anki_modified"
			? { syncStatus }
			: {}),
	};
}

/**
 * 导入映射管理器
 */
export class ImportMappingManager {
	private plugin: WeavePlugin;
	private mappings: Map<string, ImportMapping>; // key: uuid
	private ankiNoteIndex: Map<number, string>; // ankiNoteId -> uuid
	private weaveCardIndex: Map<string, string>; // weaveCardId -> uuid

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
		this.mappings = new Map();
		this.ankiNoteIndex = new Map();
		this.weaveCardIndex = new Map();

		// 加载现有映射
		void this.loadFromStorage();
	}

	/**
	 * 记录新的导入映射
	 */
	async recordMapping(
		weaveCardId: string,
		ankiNoteId: number,
		uuid: string,
		contentHash = "",
		ankiModelId?: number,
		ankiModelName?: string
	): Promise<void> {
		const now = new Date().toISOString();

		const mapping: ImportMapping = {
			id: uuid,
			weaveCardId,
			ankiNoteId,
			uuid,
			lastSyncTime: now,
			lastModifiedInWeave: now,
			lastModifiedInAnki: now,
			syncVersion: 1,
			contentHash: contentHash || "",
			ankiModelId,
			ankiModelName,
			syncStatus: "synced",
		};

		this.mappings.set(uuid, mapping);
		this.ankiNoteIndex.set(ankiNoteId, uuid);
		this.weaveCardIndex.set(weaveCardId, uuid);

		await this.saveToStorage();

		logger.debug(
			`✓ 记录导入映射: Anki Note ${ankiNoteId} -> Weave Card ${weaveCardId} (UUID: ${uuid})`
		);
	}

	/**
	 * 更新现有映射
	 */
	async updateMapping(uuid: string, updates: Partial<ImportMapping>): Promise<void> {
		const mapping = this.mappings.get(uuid);
		if (!mapping) {
			throw new Error(`映射不存在: ${uuid}`);
		}

		// 合并更新
		const updated: ImportMapping = {
			...mapping,
			...updates,
			uuid, // 确保uuid不被修改
			id: uuid,
		};

		this.mappings.set(uuid, updated);
		await this.saveToStorage();

		logger.debug(`✓ 更新映射: ${uuid}`);
	}

	/**
	 * 通过Anki Note ID查找映射
	 */
	findByAnkiNoteId(ankiNoteId: number): ImportMapping | undefined {
		const uuid = this.ankiNoteIndex.get(ankiNoteId);
		if (!uuid) {
			return undefined;
		}
		return this.mappings.get(uuid);
	}

	/**
	 * 通过Weave卡片ID查找映射
	 */
	findByWeaveCardId(weaveCardId: string): ImportMapping | undefined {
		const uuid = this.weaveCardIndex.get(weaveCardId);
		if (!uuid) {
			return undefined;
		}
		return this.mappings.get(uuid);
	}

	/**
	 * 通过UUID查找映射
	 */
	findByUUID(uuid: string): ImportMapping | undefined {
		return this.mappings.get(uuid);
	}

	/**
	 * 删除映射
	 */
	async removeMapping(uuid: string): Promise<void> {
		const mapping = this.mappings.get(uuid);
		if (!mapping) {
			return;
		}

		this.mappings.delete(uuid);
		this.ankiNoteIndex.delete(mapping.ankiNoteId);
		this.weaveCardIndex.delete(mapping.weaveCardId);

		await this.saveToStorage();

		logger.debug(`✓ 删除映射: ${uuid}`);
	}

	/**
	 * 获取所有映射
	 */
	getAllMappings(): ImportMapping[] {
		return Array.from(this.mappings.values());
	}

	/**
	 * 获取指定牌组的映射
	 */
	getMappingsByDeck(_deckId: string): ImportMapping[] {
		// 需要访问DataStorage获取卡片信息
		// 暂时返回所有映射，后续可优化
		return this.getAllMappings();
	}

	/**
	 * 计算内容哈希
	 */
	static calculateContentHash(content: string): string {
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(16).padStart(8, "0");
	}

	/**
	 * 清理无效映射
	 */
	async cleanup(): Promise<number> {
		const dataStorage = this.plugin.dataStorage;
		if (!dataStorage) {
			return 0;
		}

		let cleanedCount = 0;
		const validMappings = new Map<string, ImportMapping>();

		// 获取所有现有卡片ID
		const allDecks = await dataStorage.getAllDecks();
		const allCardIds = new Set<string>();

		for (const deck of allDecks) {
			const cards = await dataStorage.getCardsByDeck(deck.id);
			for (const card of cards) {
				allCardIds.add(card.uuid);
			}
		}

		// 检查每个映射的有效性
		for (const [uuid, mapping] of this.mappings) {
			if (allCardIds.has(mapping.weaveCardId)) {
				validMappings.set(uuid, mapping);
			} else {
				cleanedCount++;
				logger.debug(`清理无效映射: ${uuid} (卡片 ${mapping.weaveCardId} 不存在)`);
			}
		}

		this.mappings = validMappings;
		this.rebuildIndices();
		await this.saveToStorage();

		logger.debug(`✓ 清理完成: 移除 ${cleanedCount} 个无效映射`);
		return cleanedCount;
	}

	/**
	 * 重建索引
	 */
	private rebuildIndices(): void {
		this.ankiNoteIndex.clear();
		this.weaveCardIndex.clear();

		for (const mapping of this.mappings.values()) {
			this.ankiNoteIndex.set(mapping.ankiNoteId, mapping.uuid);
			this.weaveCardIndex.set(mapping.weaveCardId, mapping.uuid);
		}
	}

	/**
	 * 保存到存储
	 */
	private async saveToStorage(): Promise<void> {
		try {
			const mappingsArray = Array.from(this.mappings.values());
			const mappingsData = {
				version: "1.0",
				lastUpdated: new Date().toISOString(),
				mappings: mappingsArray,
			};

			const filePath = getPluginPaths(this.plugin.app).state.importMappings;
			await DirectoryUtils.ensureDirRecursive(
				this.plugin.app.vault.adapter,
				getPluginPaths(this.plugin.app).state.root
			);

			await this.plugin.app.vault.adapter.write(filePath, JSON.stringify(mappingsData, null, 2));

			logger.debug(`✓ 导入映射已保存: ${mappingsArray.length} 条记录`);
		} catch (error) {
			logger.error("❌ 保存导入映射失败:", error);
			throw error;
		}
	}

	/**
	 * 从存储加载
	 */
	private async loadFromStorage(): Promise<void> {
		try {
			const filePath = getPluginPaths(this.plugin.app).state.importMappings;

			// 检查文件是否存在
			const exists = await this.plugin.app.vault.adapter.exists(filePath);
			if (!exists) {
				logger.debug("导入映射文件不存在，创建新映射");
				return;
			}

			const content = await this.plugin.app.vault.adapter.read(filePath);
			const data = parseJsonUnknown(content);

			// 加载映射
			if (isRecord(data) && Array.isArray(data.mappings)) {
				for (const entry of data.mappings) {
					const mapping = parseStoredImportMapping(entry);
					if (!mapping) {
						continue;
					}
					this.mappings.set(mapping.uuid, mapping);
				}

				this.rebuildIndices();

				logger.debug(`✓ 已加载 ${this.mappings.size} 条导入映射`);
			}
		} catch (error) {
			logger.error("❌ 加载导入映射失败:", error);
			// 不抛出错误，允许继续运行
		}
	}

	/**
	 * 统计信息
	 */
	getStats(): {
		totalMappings: number;
		syncedMappings: number;
		conflictMappings: number;
	} {
		const all = Array.from(this.mappings.values());

		return {
			totalMappings: all.length,
			syncedMappings: all.filter((m) => m.syncStatus === "synced").length,
			conflictMappings: all.filter((m) => (m as { syncStatus?: string }).syncStatus === "conflict").length,
		};
	}
}
