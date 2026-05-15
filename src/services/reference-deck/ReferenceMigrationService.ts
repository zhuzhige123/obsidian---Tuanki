/**
 * 引用式牌组数据迁移服务
 *
 * 核心职责：
 * 1. 将旧的牌组内卡片文件迁移到统一卡片存储
 * 2. 为牌组生成 cardUUIDs 缓存
 * 3. 按牌组名称回写卡片 content YAML 中的 we_decks
 * 4. 兼容保留 referencedByDecks
 * 5. 支持迁移回滚
 */

import { LEGACY_PATHS, getBackupPath, getV2PathsFromApp } from "../../config/paths";
import type { Card, DataMigrationResult, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { logger } from "../../utils/logger";
import { setCardProperties } from "../../utils/yaml-utils";

export interface MigrationOptions {
	/** 是否创建备份 */
	createBackup?: boolean;
	/** 是否执行验证 */
	validate?: boolean;
	/** 是否为试运行（不实际修改数据） */
	dryRun?: boolean;
}

export class ReferenceMigrationService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 检查是否需要迁移
	 *
	 * 扫描整个 weave 文件夹，检查是否还有卡片数据停留在旧位置
	 */
	async needsMigration(): Promise<boolean> {
		try {
			const orphanedCardFiles = await this.scanForOrphanedCardFiles();

			if (orphanedCardFiles.length > 0) {
				logger.info(`[Migration] 发现 ${orphanedCardFiles.length} 个需要迁移的卡片文件`);
				return true;
			}

			return false;
		} catch (error) {
			logger.error("[Migration] 检查迁移状态失败:", error);
			return false;
		}
	}

	/**
	 * 扫描 weave/decks/ 下所有子文件夹中的 cards.json 文件
	 * 这些文件应该被迁移到 weave/cards/ 统一存储
	 */
	private async scanForOrphanedCardFiles(): Promise<string[]> {
		const orphanedFiles: string[] = [];
		const adapter = this.plugin.app.vault.adapter;

		try {
			const decksFolder = LEGACY_PATHS.decks;

			if (!(await adapter.exists(decksFolder))) {
				return [];
			}

			const listing = await adapter.list(decksFolder);

			for (const folder of listing.folders) {
				const folderName = folder.split("/").pop();
				if (!folderName || folderName === "decks") {
					continue;
				}

				const cardsFilePath = `${folder}/cards.json`;
				if (!(await adapter.exists(cardsFilePath))) {
					continue;
				}

				try {
					const content = await adapter.read(cardsFilePath);
					const data = JSON.parse(content);

					if (data.cards && Array.isArray(data.cards) && data.cards.length > 0) {
						const hasValidCards = data.cards.some(
							(card: any) => card.uuid && typeof card.uuid === "string"
						);

						if (hasValidCards) {
							orphanedFiles.push(cardsFilePath);
							logger.debug(
								`[Migration] 发现需要迁移的卡片文件: ${cardsFilePath} (${data.cards.length} 张卡片)`
							);
						}
					}
				} catch {
					logger.debug(`[Migration] 跳过无效文件: ${cardsFilePath}`);
				}
			}
		} catch (error) {
			logger.error("[Migration] 扫描卡片文件失败:", error);
		}

		return orphanedFiles;
	}

	/**
	 * 执行迁移
	 *
	 * 完全引用式架构迁移：
	 * 1. 扫描 weave/decks/ 下所有子文件夹中的 cards.json 文件
	 * 2. 将所有卡片迁移到 weave/cards/default.json
	 * 3. 为每个牌组生成 cardUUIDs 缓存
	 * 4. 为每张卡片写入 content YAML 中的 we_decks
	 * 5. 兼容保留 referencedByDecks
	 * 6. 清理旧的卡片文件
	 */
	async migrate(options: MigrationOptions = {}): Promise<DataMigrationResult> {
		const { createBackup = true, validate = true, dryRun = false } = options;

		logger.info(`[Migration] 开始迁移到完全引用式牌组架构 (dryRun: ${dryRun})...`);

		try {
			let backupPath: string | undefined;
			if (createBackup && !dryRun) {
				backupPath = await this.createBackup();
				logger.info(`[Migration] 备份完成: ${backupPath}`);
			}

			const orphanedCardFiles = await this.scanForOrphanedCardFiles();
			logger.info(`[Migration] 发现 ${orphanedCardFiles.length} 个需要迁移的卡片文件`);

			const adapter = this.plugin.app.vault.adapter;
			const allCardsToMigrate: Card[] = [];
			const cardDeckMappings: Record<string, string[]> = {};
			const deckCardMappings: Record<string, string[]> = {};
			const processedUUIDs = new Set<string>();

			for (const filePath of orphanedCardFiles) {
				try {
					const content = await adapter.read(filePath);
					const data = JSON.parse(content);

					const pathParts = filePath.split("/");
					const deckId = pathParts[pathParts.length - 2];

					if (!deckCardMappings[deckId]) {
						deckCardMappings[deckId] = [];
					}

					for (const card of data.cards) {
						if (!card.uuid || processedUUIDs.has(card.uuid)) {
							continue;
						}

						processedUUIDs.add(card.uuid);
						allCardsToMigrate.push(card);

						deckCardMappings[deckId].push(card.uuid);

						if (!cardDeckMappings[card.uuid]) {
							cardDeckMappings[card.uuid] = [];
						}
						if (!cardDeckMappings[card.uuid].includes(deckId)) {
							cardDeckMappings[card.uuid].push(deckId);
						}
					}

					logger.debug(`[Migration] 从 ${filePath} 收集了 ${data.cards.length} 张卡片`);
				} catch (error) {
					logger.warn(`[Migration] 读取文件失败: ${filePath}`, error);
				}
			}

			logger.info(`[Migration] 共收集 ${allCardsToMigrate.length} 张卡片待迁移`);

			if (dryRun) {
				logger.info("[Migration] 试运行完成，不修改数据");
				return {
					success: true,
					migratedCards: allCardsToMigrate.length,
					migratedDecks: Object.keys(deckCardMappings).length,
					details: { deckCardMappings, cardDeckMappings, orphanedCardFiles },
				};
			}

			logger.info("[Migration] 将使用当前统一存储服务保存迁移卡片，不再自动重建 legacy cards 目录");

			let migratedCards = 0;
			const now = new Date().toISOString();
			const decks = await this.plugin.dataStorage.getDecks();
			const deckNameById = new Map(
				decks
					.filter((deck): deck is Deck => Boolean(deck?.id))
					.map((deck) => [deck.id, deck.name] as const)
			);
			const migratedCardsToSave: Card[] = [];

			for (const card of allCardsToMigrate) {
				const expectedRefs = cardDeckMappings[card.uuid] || [];
				const expectedDeckNames = Array.from(
					new Set(
						expectedRefs
							.map((deckId) => deckNameById.get(deckId) || deckId)
							.filter(
								(value): value is string => typeof value === "string" && value.trim().length > 0
							)
					)
				);

				const migratedCard: Card = {
					...card,
					content: setCardProperties(card.content || "", {
						we_decks: expectedDeckNames.length > 0 ? expectedDeckNames : undefined,
					}),
					referencedByDecks: expectedRefs,
					modified: now,
				};
				(migratedCard as any).deckId = undefined;

				migratedCardsToSave.push(migratedCard);
			}

			if (migratedCardsToSave.length > 0) {
				await this.plugin.dataStorage.saveCardsBatch(migratedCardsToSave);
			}
			migratedCards = migratedCardsToSave.length;

			logger.info(
				`[Migration] 已迁移 ${migratedCards}/${allCardsToMigrate.length} 张卡片到统一存储`
			);

			let migratedDecks = 0;
			for (const deck of decks) {
				const cardUUIDs = deckCardMappings[deck.id] || [];

				const existingUUIDs = new Set(deck.cardUUIDs || []);
				for (const uuid of cardUUIDs) {
					existingUUIDs.add(uuid);
				}

				deck.cardUUIDs = Array.from(existingUUIDs);
				deck.modified = now;
				await this.plugin.dataStorage.saveDeck(deck);
				migratedDecks++;
			}

			if (migratedCards === allCardsToMigrate.length) {
				logger.info(`[Migration] 所有 ${migratedCards} 张卡片迁移成功，开始清理旧文件`);

				for (const filePath of orphanedCardFiles) {
					try {
						await adapter.write(
							filePath,
							JSON.stringify(
								{
									_migrated: true,
									_migratedAt: now,
									_originalCardCount: allCardsToMigrate.length,
									cards: [],
								},
								null,
								2
							)
						);
						logger.debug(`[Migration] 已清空旧卡片文件: ${filePath}`);
					} catch (error) {
						logger.warn(`[Migration] 清空旧文件失败: ${filePath}`, error);
					}
				}
			} else {
				logger.warn(
					`[Migration] 部分卡片迁移失败 (${migratedCards}/${allCardsToMigrate.length})，保留旧文件以防数据丢失`
				);
			}

			if (validate) {
				const { initDataConsistencyService } = await import("./DataConsistencyService");
				const consistencyService = initDataConsistencyService(this.plugin);
				const checkResult = await consistencyService.checkConsistency();

				if (!checkResult.isConsistent) {
					logger.warn("[Migration] 迁移后数据一致性检查未通过，尝试修复...");
					await consistencyService.repairConsistency();
				}
			}

			logger.info(`[Migration] 迁移完成: ${migratedDecks} 个牌组, ${migratedCards} 张卡片`);

			return {
				success: true,
				migratedCards,
				migratedDecks,
				backupPath,
				details: { deckCardMappings, cardDeckMappings, orphanedCardFiles },
			};
		} catch (error) {
			logger.error("[Migration] 迁移失败:", error);
			return {
				success: false,
				migratedCards: 0,
				migratedDecks: 0,
				error: error instanceof Error ? error.message : "迁移失败",
			};
		}
	}

	/**
	 * 创建备份
	 */
	private async createBackup(): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupFolder = `${getBackupPath()}/migration-${timestamp}`;
		const adapter = this.plugin.app.vault.adapter;

		const { DirectoryUtils } = await import("../../utils/directory-utils");
		await DirectoryUtils.ensureDirRecursive(adapter, backupFolder);

		const decksPath = `${LEGACY_PATHS.decks}/decks.json`;
		if (await adapter.exists(decksPath)) {
			const decksData = await adapter.read(decksPath);
			await adapter.write(`${backupFolder}/decks.json`, decksData);
		}

		const decks = await this.plugin.dataStorage.getDecks();
		for (const deck of decks) {
			const cardsPath = `${LEGACY_PATHS.decks}/${deck.id}/cards.json`;
			if (await adapter.exists(cardsPath)) {
				const cardsData = await adapter.read(cardsPath);
				await DirectoryUtils.ensureDirRecursive(adapter, `${backupFolder}/${deck.id}`);
				await adapter.write(`${backupFolder}/${deck.id}/cards.json`, cardsData);
			}
		}

		return backupFolder;
	}

	/**
	 * 从备份恢复
	 */
	async restoreFromBackup(backupPath: string): Promise<boolean> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const v2Paths = getV2PathsFromApp(this.plugin.app);

			const backupDecksPath = `${backupPath}/decks.json`;
			let decks: Deck[] = [];
			if (await adapter.exists(backupDecksPath)) {
				const decksData = await adapter.read(backupDecksPath);
				const parsed = JSON.parse(decksData);
				decks = Array.isArray(parsed?.decks) ? parsed.decks : [];
				await adapter.write(v2Paths.memory.decks, JSON.stringify({ decks }, null, 2));
			}

			const cardsToRestore: Card[] = [];
			for (const deck of decks) {
				const backupCardsPath = `${backupPath}/${deck.id}/cards.json`;
				if (await adapter.exists(backupCardsPath)) {
					const cardsData = await adapter.read(backupCardsPath);
					const parsed = JSON.parse(cardsData);
					if (Array.isArray(parsed?.cards)) {
						cardsToRestore.push(...(parsed.cards as Card[]));
					}
				}
			}

			if (cardsToRestore.length > 0) {
				await this.plugin.dataStorage.saveCardsBatch(cardsToRestore);
			}

			logger.info(`[Migration] 从备份恢复成功（已写入当前主路径）: ${backupPath}`);
			return true;
		} catch (error) {
			logger.error("[Migration] 恢复失败:", error);
			return false;
		}
	}
}

// 单例导出
let migrationServiceInstance: ReferenceMigrationService | null = null;

export function getReferenceMigrationService(plugin?: WeavePlugin): ReferenceMigrationService {
	if (!migrationServiceInstance && plugin) {
		migrationServiceInstance = new ReferenceMigrationService(plugin);
	}
	if (!migrationServiceInstance) {
		throw new Error("ReferenceMigrationService not initialized");
	}
	return migrationServiceInstance;
}

export function initReferenceMigrationService(plugin: WeavePlugin): ReferenceMigrationService {
	migrationServiceInstance = new ReferenceMigrationService(plugin);
	return migrationServiceInstance;
}
