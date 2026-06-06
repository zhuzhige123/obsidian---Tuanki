import { logger } from "../../../utils/logger";
/**
 * 备份数据迁移服务
 *
 * 将旧备份数据从 settings.json 迁移到文件系统
 */

import type { Plugin } from "obsidian";
import { Notice } from "obsidian";
import type { BackupData } from "../../../components/settings/types/settings-types";
import type { WeavePlugin } from "../../../main";
import { readUnknownProperty, readUnknownString } from "../../../utils/dynamic-access";
import type { BackupLevel, BackupTrigger, MigrationResult } from "../../../types/backup-types";
import { UnifiedBackupService } from "./UnifiedBackupService";

export class BackupMigrationService {
	private plugin: WeavePlugin;
	private backupService: UnifiedBackupService;

	constructor(plugin: Plugin) {
		this.plugin = plugin as WeavePlugin;
		this.backupService = new UnifiedBackupService(plugin);
	}

	private getLegacyBackups(): Record<string, BackupData> | undefined {
		return this.plugin.settings.ankiConnect?.backups;
	}

	private readLegacyDeckId(backupData: BackupData): string | undefined {
		const info = readUnknownProperty(backupData, "info");
		return readUnknownString(info, "deckId");
	}

	/**
	 * 检查是否需要迁移
	 * @returns 是否需要迁移
	 */
	async needsMigration(): Promise<boolean> {
		const backups = this.getLegacyBackups();
		if (!backups) {
			return false;
		}

		const backupCount = Object.keys(backups).length;
		if (backupCount === 0) {
			return false;
		}

		logger.debug(`📦 检测到 ${backupCount} 个旧备份需要迁移`);
		return true;
	}

	/**
	 * 从 settings.json 迁移备份到文件系统
	 * @returns 迁移结果
	 */
	async migrateBackupsFromSettings(): Promise<MigrationResult> {
		const ankiConnect = this.plugin.settings.ankiConnect;
		const backups = ankiConnect?.backups;

		if (!backups || Object.keys(backups).length === 0) {
			return {
				success: true,
				migratedCount: 0,
				message: "无需迁移，未找到旧备份数据",
			};
		}

		logger.debug("🚀 开始迁移备份数据...");

		const startTime = Date.now();
		const migrated: string[] = [];
		const failed: string[] = [];

		await this.backupService.initialize();

		const totalCount = Object.keys(backups).length;
		logger.debug(`📊 准备迁移 ${totalCount} 个备份...`);

		for (const [backupId, backupData] of Object.entries(backups)) {
			try {
				logger.debug(`  迁移备份 ${migrated.length + 1}/${totalCount}: ${backupId}`);

				const result = await this.backupService.createBackup({
					level: "deck" as BackupLevel,
					trigger: "manual" as BackupTrigger,
					data: backupData,
					targetId: this.readLegacyDeckId(backupData),
					reason: `从旧版本迁移 (原ID: ${backupId})`,
				});

				if (result.success) {
					migrated.push(backupId);
					logger.debug(`    ✅ 迁移成功 → ${result.backupId}`);
				} else {
					failed.push(backupId);
					logger.error("    ❌ 迁移失败:", result.error);
				}
			} catch (error) {
				logger.error(`  ❌ 迁移备份 ${backupId} 失败:`, error);
				failed.push(backupId);
			}
		}

		for (const backupId of migrated) {
			delete backups[backupId];
		}

		if (failed.length === 0) {
			ankiConnect.backups = undefined;
		}

		await this.plugin.saveSettings();

		const duration = Date.now() - startTime;
		const message = `
✅ 备份迁移完成
━━━━━━━━━━━━━━━━━━
✓ 成功迁移: ${migrated.length} 个
${failed.length > 0 ? `✗ 失败: ${failed.length} 个` : ""}
⏱ 耗时: ${(duration / 1000).toFixed(2)} 秒
━━━━━━━━━━━━━━━━━━
新备份位置: .obsidian/plugins/weave/backups/
    `.trim();

		logger.debug(message);

		new Notice(
			failed.length === 0
				? `✅ 成功迁移 ${migrated.length} 个备份到新位置`
				: `⚠️ 迁移完成：成功 ${migrated.length}，失败 ${failed.length}`,
			5000
		);

		return {
			success: failed.length === 0,
			migratedCount: migrated.length,
			failedCount: failed.length,
			message,
		};
	}

	/**
	 * 自动迁移（插件启动时调用）
	 */
	async autoMigrate(): Promise<void> {
		try {
			const needs = await this.needsMigration();
			if (!needs) {
				return;
			}

			logger.debug("🔄 检测到旧版本备份，开始自动迁移...");

			window.setTimeout(() => {
				void (async () => {
					const result = await this.migrateBackupsFromSettings();
					if (result.success) {
						logger.debug("✅ 自动迁移成功");
					} else {
						logger.warn("⚠️ 自动迁移部分失败，部分备份可能需要手动处理");
					}
				})();
			}, 2000);
		} catch (error) {
			logger.error("❌ 自动迁移失败:", error);
		}
	}
}
