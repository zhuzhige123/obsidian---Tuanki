/**
 * 备份管理服务
 * 委托 WeaveBackupService 双槽位（auto / manual）实现
 */

import type { WeavePlugin } from "../main";
import type {
	BackupInfo,
	BackupPreview,
	BackupResult,
	PruneResult,
	RestoreOptions,
	RestoreResult,
	ValidationResult,
} from "../types/data-management-types";
import { logger } from "../utils/logger";

import { BackupTrigger as BackupOptionTrigger } from "../types/backup-types";
import {
	BACKUP_SLOT_AUTO,
	BACKUP_SLOT_MANUAL,
	type BackupUserSlot,
	getWeaveBackupService,
} from "./backup/WeaveBackupService";
import { DataType } from "../types/data-management-types";

export class BackupManagementService {
	private plugin: WeavePlugin;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	private get backupService() {
		return getWeaveBackupService(this.plugin);
	}

	async createManualBackup(description?: string): Promise<BackupResult> {
		const startTime = Date.now();

		try {
			const backupInfo = await this.backupService.createBackup({
				type: "manual",
				trigger: BackupOptionTrigger.MANUAL,
				reason: description || "手动备份",
			});

			return {
				success: true,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				backupInfo,
				backupPath: backupInfo.path,
				prunedCount: 0,
			};
		} catch (error) {
			logger.error("手动备份失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
			};
		}
	}

	async pruneBackups(): Promise<PruneResult> {
		const startTime = Date.now();

		try {
			const beforeFolders = await this.backupService.listLegacyTimestampBackupFolders();
			const cleanup = await this.backupService.cleanupLegacyTimestampBackups();
			const afterFolders = await this.backupService.listLegacyTimestampBackupFolders();

			return {
				success: true,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				beforeCount: beforeFolders.length,
				afterCount: afterFolders.length,
				prunedBackups: cleanup.removedFolders,
				retainedBackups: [BACKUP_SLOT_AUTO, BACKUP_SLOT_MANUAL],
			};
		} catch (error) {
			logger.error("备份清理失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				beforeCount: 0,
				afterCount: 0,
				prunedBackups: [],
				retainedBackups: [],
			};
		}
	}

	async validateBackupIntegrity(backupId: string): Promise<ValidationResult> {
		const startTime = Date.now();

		try {
			const slotResult = await this.backupService.validateBackup(backupId);
			const issues = slotResult.issues?.map((issue, index) => ({
				id: `backup_issue_${index}`,
				type: "corrupted_data" as const,
				description: typeof issue === "string" ? issue : String(issue),
				severity: "error" as const,
			}));

			return {
				success: slotResult.passed ?? false,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				validatedCount: slotResult.passed ? 1 : 0,
				issueCount: issues?.length ?? 0,
				issues,
			};
		} catch (error) {
			logger.error("备份验证失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				validatedCount: 0,
				issueCount: 1,
				issues: [
					{
						id: "validation_error",
						type: "corrupted_data",
						description: error instanceof Error ? error.message : String(error),
						severity: "critical",
					},
				],
			};
		}
	}

	async previewBackupContent(backupId: string): Promise<BackupPreview> {
		const backup = await this.getBackupById(backupId);
		if (!backup) {
			throw new Error(`备份不存在: ${backupId}`);
		}

		const preview = await this.backupService.previewBackup(backupId);
		const adapter = this.plugin.app.vault.adapter;
		const listing = await adapter.list(backup.path);

		return {
			backupInfo: backup,
			files: listing.files || [],
			statistics: {
				deckCount: preview.deckCount,
				cardCount: preview.cardCount,
				sessionCount: 0,
				templateCount: 0,
			},
		};
	}

	async restoreFromBackup(backupId: string, options: RestoreOptions): Promise<RestoreResult> {
		const startTime = Date.now();

		try {
			const backup = await this.getBackupById(backupId);
			if (!backup) {
				throw new Error(`备份不存在: ${backupId}`);
			}

			if (backupId !== BACKUP_SLOT_AUTO && backupId !== BACKUP_SLOT_MANUAL) {
				throw new Error(`无效的备份槽位: ${backupId}`);
			}

			if (options.conflictStrategy === "merge") {
				throw new Error(
					"双槽位备份恢复仅支持 overwrite；merge 不适用于整库结构化数据恢复"
				);
			}

			const validation = await this.validateBackupIntegrity(backupId);
			if (!validation.success) {
				const firstIssue = validation.issues?.[0];
				const issueDescription =
					typeof firstIssue === "string" ? firstIssue : firstIssue?.description;
				throw new Error(`备份验证失败: ${issueDescription}`);
			}

			let preRestoreBackupId: string | undefined;
			if (options.createPreRestoreBackup) {
				const preBackupResult = await this.createManualBackup("恢复前备份");
				preRestoreBackupId = preBackupResult.backupInfo?.id;
			}

			const slot = backupId;
			const restoreProfile = options.dataTypes.includes(DataType.PROFILE);
			const restoreResult = await this.backupService.restoreFromSlot(slot, {
				restoreProfile,
				restoreBindings: true,
			});

			const restoredDataTypes: DataType[] = [DataType.DECKS, DataType.CARDS];
			if (restoreProfile) {
				restoredDataTypes.push(DataType.PROFILE);
			}

			return {
				success: true,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				restoredFileCount: restoreResult.deckCount + restoreResult.cardCount,
				restoredDataTypes,
				preRestoreBackupId,
			};
		} catch (error) {
			logger.error("备份恢复失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				restoredFileCount: 0,
				restoredDataTypes: [],
			};
		}
	}

	async getBackupHistory(): Promise<BackupInfo[]> {
		return this.backupService.listBackups();
	}

	private async getBackupById(backupId: string): Promise<BackupInfo | null> {
		const backups = await this.getBackupHistory();
		return backups.find((b) => b.id === backupId) || null;
	}
}
