/**
 * 卡片内容迁移服务
 *
 * 负责迁移旧格式的卡片 YAML：
 * - 旧格式：we_source (文档) + we_block (块链接) 分离
 * - 新格式：we_source 合并为 ![[文档#^blockId]] 格式
 *
 * @module services/migration/CardContentMigrationService
 * @version 2.1.3
 */

import { Notice } from "obsidian";
import type { WeaveDataStorage } from "../../data/storage";
import { logger } from "../../utils/logger";
import { migrateSourceFields, needsSourceMigration } from "../../utils/yaml-utils";

export interface MigrationResult {
	total: number;
	migrated: number;
	failed: number;
	skipped: number;
}

export class CardContentMigrationService {
	private storage: WeaveDataStorage;

	constructor(storage: WeaveDataStorage) {
		this.storage = storage;
	}

	/**
	 * 检查是否有卡片需要迁移
	 */
	async needsMigration(): Promise<boolean> {
		try {
			const allCards = await this.storage.getAllCards();
			return allCards.some((card) => card.content && needsSourceMigration(card.content));
		} catch (error) {
			logger.error("[CardContentMigration] 检查迁移状态失败:", error);
			return false;
		}
	}

	/**
	 * 执行批量迁移
	 * @param showNotice 是否显示通知
	 */
	async migrate(showNotice = true): Promise<MigrationResult> {
		const result: MigrationResult = {
			total: 0,
			migrated: 0,
			failed: 0,
			skipped: 0,
		};

		try {
			logger.info("[CardContentMigration] 开始卡片内容迁移...");

			const allCards = await this.storage.getAllCards();
			result.total = allCards.length;

			const cardsNeedingMigration = allCards.filter(
				(card) => card.content && needsSourceMigration(card.content)
			);

			if (cardsNeedingMigration.length === 0) {
				logger.info("[CardContentMigration] 没有卡片需要迁移");
				return result;
			}

			logger.info(`[CardContentMigration] 发现 ${cardsNeedingMigration.length} 张卡片需要迁移`);

			if (showNotice) {
				new Notice(`正在迁移 ${cardsNeedingMigration.length} 张卡片的来源信息格式...`);
			}

			// 批量迁移
			for (const card of cardsNeedingMigration) {
				try {
					const migrationResult = migrateSourceFields(card.content!);

					if (migrationResult.migrated) {
						// 更新卡片内容
						card.content = migrationResult.content;
						await this.storage.updateCard(card);
						result.migrated++;

						logger.debug(`[CardContentMigration] ✅ 迁移成功: ${card.uuid}`);
					} else {
						result.skipped++;
						logger.debug(`[CardContentMigration] ⊘ 跳过: ${card.uuid}`);
					}
				} catch (error) {
					result.failed++;
					logger.error(`[CardContentMigration] ❌ 迁移失败: ${card.uuid}`, error);
				}
			}

			logger.info(
				`[CardContentMigration] 迁移完成: 成功 ${result.migrated}, 失败 ${result.failed}, 跳过 ${result.skipped}`
			);

			if (showNotice) {
				if (result.failed > 0) {
					new Notice(`卡片迁移完成：成功 ${result.migrated} 张，失败 ${result.failed} 张`);
				} else {
					new Notice(`成功迁移 ${result.migrated} 张卡片的来源信息格式`);
				}
			}
		} catch (error) {
			logger.error("[CardContentMigration] 迁移过程失败:", error);
			if (showNotice) {
				new Notice("卡片内容迁移失败，请查看控制台");
			}
		}

		return result;
	}
}
