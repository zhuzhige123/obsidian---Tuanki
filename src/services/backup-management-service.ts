/**
 * 备份管理服务
 * 提供智能备份策略、备份清理、备份恢复等功能
 */

import type { WeaveDataStorage } from "../data/storage";
import type { WeavePlugin } from "../main";
import type {
	BackupInfo,
	BackupPreview,
	BackupResult,
	PruneResult,
	RestoreOptions,
	RestoreResult,
	ValidationIssue,
	ValidationResult,
} from "../types/data-management-types";
import { logger } from "../utils/logger";
import { parseJsonUnknown } from "../utils/typed-json";

import { getBackupPath, getPluginPaths, getV2PathsFromApp } from "../config/paths";
// BackupPreview 类型定义
import { BackupTrigger, BackupType, DataType } from "../types/data-management-types";
import { DirectoryUtils } from "../utils/directory-utils";

type VaultAdapter = WeavePlugin["app"]["vault"]["adapter"];

interface RestoreExecutionResult {
	fileCount: number;
	dataTypes: DataType[];
}

export class BackupManagementService {
	private dataStorage: WeaveDataStorage;
	private plugin: WeavePlugin;
	private readonly MAX_BACKUPS = 3;

	constructor(dataStorage: WeaveDataStorage, plugin: WeavePlugin) {
		this.dataStorage = dataStorage;
		this.plugin = plugin;
	}

	/**
	 * 创建手动备份
	 */
	async createManualBackup(description?: string): Promise<BackupResult> {
		const startTime = Date.now();

		try {
			// 创建备份
			const backupPath = await this.dataStorage.createBackup();
			const backupInfo = await this.createBackupInfo(
				backupPath,
				BackupType.MANUAL,
				BackupTrigger.MANUAL_REQUEST,
				description
			);

			// 清理旧备份（手动备份优先保留）
			const pruneResult = await this.pruneBackups();

			return {
				success: true,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				backupInfo,
				backupPath,
				prunedCount: pruneResult.beforeCount - pruneResult.afterCount,
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

	/**
	 * 清理备份（保留最重要的3个）
	 */
	async pruneBackups(): Promise<PruneResult> {
		const startTime = Date.now();

		try {
			const backups = await this.getBackupHistory();
			const beforeCount = backups.length;

			if (beforeCount <= this.MAX_BACKUPS) {
				return {
					success: true,
					timestamp: new Date().toISOString(),
					duration: Date.now() - startTime,
					beforeCount,
					afterCount: beforeCount,
					prunedBackups: [],
					retainedBackups: backups.map((b) => b.id),
				};
			}

			// 智能选择要保留的备份
			const toRetain = this.selectBackupsToRetain(backups);
			const toDelete = backups.filter((b) => !toRetain.some((r) => r.id === b.id));

			// 删除多余的备份
			const prunedBackups: string[] = [];
			for (const backup of toDelete) {
				try {
					await this.deleteBackupFiles(backup);
					prunedBackups.push(backup.id);
				} catch (error) {
					logger.warn(`删除备份失败: ${backup.id}`, error);
				}
			}

			return {
				success: true,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				beforeCount,
				afterCount: beforeCount - prunedBackups.length,
				prunedBackups,
				retainedBackups: toRetain.map((b) => b.id),
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

	/**
	 * 验证备份完整性
	 */
	async validateBackupIntegrity(backupId: string): Promise<ValidationResult> {
		const startTime = Date.now();

		try {
			const backup = await this.getBackupById(backupId);
			if (!backup) {
				throw new Error(`备份不存在: ${backupId}`);
			}

			const issues: ValidationIssue[] = [];
			let validatedCount = 0;

			// 验证备份文件夹存在
			const adapter = this.plugin.app.vault.adapter;
			const exists = await adapter.exists(backup.path);
			if (!exists) {
				issues.push({
					id: "missing_backup_folder",
					type: "missing_file",
					description: `备份文件夹不存在: ${backup.path}`,
					severity: "critical",
				});
			} else {
				validatedCount++;

				// 验证备份内容
				const listing = await adapter.list(backup.path);
				const expectedFiles = ["decks.json", "profile.json"];

				for (const expectedFile of expectedFiles) {
					const filePath = `${backup.path}/${expectedFile}`;
					const fileExists = (listing.files || []).includes(filePath);

					if (!fileExists) {
						issues.push({
							id: `missing_${expectedFile}`,
							type: "missing_file",
							description: `缺少备份文件: ${expectedFile}`,
							severity: "error",
						});
					} else {
						validatedCount++;

						// 验证文件内容
						try {
							const content = await adapter.read(filePath);
							JSON.parse(content); // 验证JSON格式
						} catch (_error) {
							issues.push({
								id: `corrupted_${expectedFile}`,
								type: "corrupted_data",
								description: `备份文件损坏: ${expectedFile}`,
								severity: "error",
							});
						}
					}
				}
			}

			return {
				success: issues.filter((i) => i.severity === "critical").length === 0,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				validatedCount,
				issueCount: issues.length,
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

	/**
	 * 预览备份内容
	 */
	async previewBackupContent(backupId: string): Promise<BackupPreview> {
		try {
			const backup = await this.getBackupById(backupId);
			if (!backup) {
				throw new Error(`备份不存在: ${backupId}`);
			}

			const adapter = this.plugin.app.vault.adapter;
			const listing = await adapter.list(backup.path);
			const files = listing.files || [];

			// 读取统计信息
			const statistics = await this.calculateBackupStatistics(backup.path);

			return {
				backupInfo: backup,
				files,
				statistics,
			};
		} catch (error) {
			logger.error("预览备份内容失败:", error);
			throw new Error(
				`预览备份内容失败: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * 从备份恢复
	 */
	async restoreFromBackup(backupId: string, options: RestoreOptions): Promise<RestoreResult> {
		const startTime = Date.now();

		try {
			const backup = await this.getBackupById(backupId);
			if (!backup) {
				throw new Error(`备份不存在: ${backupId}`);
			}

			// 验证备份完整性
			const validation = await this.validateBackupIntegrity(backupId);
			if (!validation.success) {
				const firstIssue = validation.issues?.[0];
				const issueDescription =
					typeof firstIssue === "string" ? firstIssue : firstIssue?.description;
				throw new Error(`备份验证失败: ${issueDescription}`);
			}

			// 创建恢复前备份
			let preRestoreBackupId: string | undefined;
			if (options.createPreRestoreBackup) {
				const preBackupResult = await this.createManualBackup("恢复前自动备份");
				preRestoreBackupId = preBackupResult.backupInfo?.id;
			}

			// 执行恢复
			const restoreResult = await this.executeRestore(backup, options);

			return {
				success: true,
				timestamp: new Date().toISOString(),
				duration: Date.now() - startTime,
				restoredFileCount: restoreResult.fileCount,
				restoredDataTypes: restoreResult.dataTypes,
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

	/**
	 * 获取备份历史
	 *  使用独立备份路径（防止误删）
	 */
	async getBackupHistory(): Promise<BackupInfo[]> {
		try {
			// 使用新的独立备份路径
			const backupsFolder = getBackupPath(this.plugin.app);
			if (!backupsFolder) {
				logger.warn("[getBackupHistory] 备份路径未定义");
				return [];
			}

			const adapter = this.plugin.app.vault.adapter;

			const exists = await adapter.exists(backupsFolder);
			if (!exists) {
				logger.debug(`[getBackupHistory] 备份文件夹不存在: ${backupsFolder}`);
				return [];
			}

			const listing = await adapter.list(backupsFolder);
			const backupFolders = listing.folders || [];

			const backups: BackupInfo[] = [];
			for (const folder of backupFolders) {
				try {
					const backupInfo = await this.loadBackupInfo(folder);
					if (backupInfo) {
						backups.push(backupInfo);
					}
				} catch (error) {
					logger.warn(`加载备份信息失败: ${folder}`, error);
				}
			}

			// 按时间倒序排列
			return backups.sort(
				(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
			);
		} catch (error) {
			logger.error("获取备份历史失败:", error);
			return [];
		}
	}

	// ==================== 私有辅助方法 ====================

	private getDataFolderPath(): string {
		return getV2PathsFromApp(this.plugin.app).root;
	}

	private async shouldCreateAutoBackup(trigger: BackupTrigger): Promise<boolean> {
		// 根据触发条件判断是否需要创建备份
		switch (trigger) {
			case BackupTrigger.STARTUP:
				return this.shouldCreateStartupBackup();
			case BackupTrigger.CARD_COUNT_THRESHOLD:
				return this.shouldCreateThresholdBackup();
			default:
				return true;
		}
	}

	private shouldCreateStartupBackup(): boolean {
		// 检查上次启动备份时间
		const autoBackupConfig = this.plugin.settings?.autoBackupConfig;
		const lastBackup = autoBackupConfig?.lastAutoBackupTime;
		if (!lastBackup) return true;

		const lastBackupTime = new Date(lastBackup).getTime();
		const now = Date.now();
		const intervalHours = autoBackupConfig?.intervalHours ?? 24;
		const intervalMs = intervalHours * 60 * 60 * 1000;

		return now - lastBackupTime >= intervalMs;
	}

	private async shouldCreateThresholdBackup(): Promise<boolean> {
		// 检查卡片数量变化
		const threshold = this.plugin.settings?.autoBackupConfig?.triggers?.cardThresholdCount ?? 100;
		if (threshold <= 0) {
			return false;
		}

		const cards = await this.dataStorage.getCards();
		const currentCardCount = Array.isArray(cards) ? cards.length : 0;
		const latestBackup = (await this.getBackupHistory())[0];
		if (!latestBackup) {
			return currentCardCount >= threshold;
		}

		const latestStats = await this.calculateBackupStatistics(latestBackup.path);
		const lastCardCount = latestStats.cardCount ?? 0;
		return Math.abs(currentCardCount - lastCardCount) >= threshold;
	}

	private async createBackupInfo(
		backupPath: string,
		type: BackupType,
		trigger?: BackupTrigger,
		description?: string
	): Promise<BackupInfo> {
		const adapter = this.plugin.app.vault.adapter;
		const timestamp = new Date().toISOString();
		const id = this.generateBackupId(timestamp);

		// 计算备份大小
		let size = 0;
		try {
			const listing = await adapter.list(backupPath);
			for (const file of listing.files || []) {
				const stat = await adapter.stat(file);
				size += stat?.size || 0;
			}
		} catch (error) {
			logger.warn("计算备份大小失败:", error);
		}

		const backupInfo: BackupInfo = {
			id,
			timestamp,
			type,
			size,
			description,
			trigger,
			path: backupPath,
			isValid: true,
			dataTypes: [DataType.DECKS, DataType.CARDS, DataType.SESSIONS, DataType.PROFILE],
		};

		// 保存备份信息
		await this.saveBackupInfo(backupInfo);

		return backupInfo;
	}

	private generateBackupId(timestamp: string): string {
		// 与storage.ts中的格式保持一致: timestamp.replace(/[:.]/g, '-')
		// 例如：2025-12-13T08:58:13.955Z → 2025-12-13T08-58-13-955Z
		return timestamp.replace(/[:.]/g, "-");
	}

	private async saveBackupInfo(backupInfo: BackupInfo): Promise<void> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const infoPath = `${backupInfo.path}/.backup-info.json`;
			await adapter.write(infoPath, JSON.stringify(backupInfo, null, 2));
		} catch (error) {
			logger.warn("保存备份信息失败:", error);
		}
	}

	private async loadBackupInfo(backupPath: string): Promise<BackupInfo | null> {
		try {
			const adapter = this.plugin.app.vault.adapter;
			const infoPath = `${backupPath}/.backup-info.json`;

			const exists = await adapter.exists(infoPath);
			if (!exists) {
				// 尝试从路径推断备份信息
				return this.inferBackupInfo(backupPath);
			}

			const content = await adapter.read(infoPath);
			return parseJsonUnknown(content) as BackupInfo;
		} catch (error) {
			logger.warn(`加载备份信息失败: ${backupPath}`, error);
			return null;
		}
	}

	private inferBackupInfo(backupPath: string): BackupInfo {
		const folderName = backupPath.split("/").pop() || "";
		// 新格式：2025-12-13T08-58-13-955Z
		// 需要恢复为：2025-12-13T08:58:13.955Z
		let timestamp = folderName;

		// 如果包含T，说明是新格式
		if (folderName.includes("T")) {
			const parts = folderName.split("T");
			if (parts.length === 2) {
				const datePart = parts[0]; // 2025-12-13
				const timePart = parts[1]; // 08-58-13-955Z

				// 将时间部分的前两个'-'替换为':'
				const timeSegments = timePart.split("-");
				if (timeSegments.length >= 3) {
					const hours = timeSegments[0];
					const minutes = timeSegments[1];
					const secondsAndMs = timeSegments.slice(2).join("-").replace("-", ".");
					timestamp = `${datePart}T${hours}:${minutes}:${secondsAndMs}`;
				}
			}
		}

		return {
			id: folderName,
			timestamp: timestamp,
			type: BackupType.AUTO,
			size: 0,
			path: backupPath,
			isValid: true,
			dataTypes: [DataType.DECKS, DataType.CARDS],
		};
	}

	private selectBackupsToRetain(backups: BackupInfo[]): BackupInfo[] {
		// 智能选择策略：
		// 1. 最新的备份
		// 2. 最新的手动备份
		// 3. 最新的操作前备份

		const sorted = [...backups].sort(
			(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);

		const toRetain: BackupInfo[] = [];

		// 1. 最新备份
		if (sorted.length > 0) {
			toRetain.push(sorted[0]);
		}

		// 2. 最新手动备份
		const latestManual = sorted.find((b) => b.type === BackupType.MANUAL && !toRetain.includes(b));
		if (latestManual) {
			toRetain.push(latestManual);
		}

		// 3. 最新操作前备份
		const latestPreOp = sorted.find(
			(b) => b.type === BackupType.PRE_OPERATION && !toRetain.includes(b)
		);
		if (latestPreOp) {
			toRetain.push(latestPreOp);
		}

		// 如果还不够3个，补充最新的备份
		while (toRetain.length < this.MAX_BACKUPS && toRetain.length < sorted.length) {
			const next = sorted.find((b) => !toRetain.includes(b));
			if (next) {
				toRetain.push(next);
			} else {
				break;
			}
		}

		return toRetain.slice(0, this.MAX_BACKUPS);
	}

	private async deleteBackupFiles(backup: BackupInfo): Promise<void> {
		try {
			const adapter = this.plugin.app.vault.adapter;

			// 删除备份文件夹
			const exists = await adapter.exists(backup.path);
			if (exists) {
				await this.deleteRecursively(backup.path, adapter);
			}
		} catch (error) {
			logger.error(`删除备份文件失败: ${backup.id}`, error);
			throw error;
		}
	}

	private async deleteRecursively(path: string, adapter: VaultAdapter): Promise<void> {
		const listing = await adapter.list(path);

		// 删除文件
		for (const file of listing.files || []) {
			await adapter.remove(file);
		}

		// 递归删除子文件夹
		for (const folder of listing.folders || []) {
			await this.deleteRecursively(folder, adapter);
		}

		// 删除空文件夹
		await adapter.rmdir(path, false);
	}

	private async getBackupById(backupId: string): Promise<BackupInfo | null> {
		const backups = await this.getBackupHistory();
		return backups.find((b) => b.id === backupId) || null;
	}

	private async calculateBackupStatistics(
		backupPath: string
	): Promise<BackupPreview["statistics"]> {
		try {
			const adapter = this.plugin.app.vault.adapter;

			const stats = {
				deckCount: 0,
				cardCount: 0,
				sessionCount: 0,
				templateCount: 0,
			};

			// 读取各种数据文件并统计
			try {
				const decksContent = await adapter.read(`${backupPath}/decks.json`);
				const decks = parseJsonUnknown(decksContent);
				stats.deckCount = Array.isArray(decks) ? decks.length : 0;
			} catch { /* no-op */ }

			try {
				const cardsContent = await adapter.read(`${backupPath}/cards.json`);
				const cards = parseJsonUnknown(cardsContent);
				stats.cardCount = Array.isArray(cards) ? cards.length : 0;
			} catch { /* no-op */ }

			return stats;
		} catch (error) {
			logger.warn("计算备份统计失败:", error);
			return {
				deckCount: 0,
				cardCount: 0,
				sessionCount: 0,
				templateCount: 0,
			};
		}
	}

	private async executeRestore(
		backup: BackupInfo,
		options: RestoreOptions
	): Promise<RestoreExecutionResult> {
		const adapter = this.plugin.app.vault.adapter;

		let fileCount = 0;
		const restoredDataTypes: DataType[] = [];

		// 恢复各种数据类型
		for (const dataType of options.dataTypes) {
			try {
				switch (dataType) {
					case DataType.DECKS:
						await this.restoreDataFile(
							backup.path,
							getV2PathsFromApp(this.plugin.app).memory.decks,
							"decks.json",
							adapter
						);
						restoredDataTypes.push(DataType.DECKS);
						fileCount++;
						break;
					case DataType.CARDS:
						logger.warn(
							"[BackupManagement] v2.0+ 不支持从 cards.json 直接恢复卡片（卡片为分片文件），已跳过"
						);
						break;
					case DataType.SESSIONS:
						logger.warn(
							"[BackupManagement] v2.0+ 不支持从 sessions.json 直接恢复会话（会话为分片目录），已跳过"
						);
						break;
					case DataType.PROFILE:
						await this.restoreDataFile(
							backup.path,
							getPluginPaths(this.plugin.app).state.userProfile,
							"profile.json",
							adapter
						);
						restoredDataTypes.push(DataType.PROFILE);
						fileCount++;
						break;
				}
			} catch (error) {
				logger.warn(`恢复数据类型失败: ${dataType}`, error);
			}
		}

		return {
			fileCount,
			dataTypes: restoredDataTypes,
		};
	}

	private async restoreDataFile(
		backupPath: string,
		targetPath: string,
		fileName: string,
		adapter: VaultAdapter
	): Promise<void> {
		const sourcePath = `${backupPath}/${fileName}`;

		const exists = await adapter.exists(sourcePath);
		if (exists) {
			const content = await adapter.read(sourcePath);
			await DirectoryUtils.ensureDirForFile(adapter, targetPath);
			await adapter.write(targetPath, content);
		}
	}
}
