import { logger } from "../../utils/logger";
/**
 * 备份管理器（重构版）
 *
 * 现在使用统一备份服务（UnifiedBackupService）
 * 保持向后兼容的 API，内部使用新的文件系统存储
 */

import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type { BackupLevel, BackupTrigger } from "../../types/backup-types";
import { isRecord } from "../../utils/typed-json";
import { BackupMigrationService } from "./backup/BackupMigrationService";
import { UnifiedBackupService } from "./backup/UnifiedBackupService";

export interface BackupInfo {
	id: string;
	timestamp: string;
	deckId: string;
	deckName: string;
	cardCount: number;
	reason: "import" | "manual";
}

export interface BackupData {
	info: BackupInfo;
	cards: Card[];
}

type StoredBackupSummary = {
	id: string;
	timestamp: number | string;
	trigger?: string;
	summary?: {
		deckId?: string;
		deckName?: string;
		cardCount?: number;
	};
};

export class BackupManager {
	private plugin: WeavePlugin;
	private maxBackups = 3;
	private unifiedService: UnifiedBackupService;
	private migrationService: BackupMigrationService;
	private initialized = false;

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
		this.unifiedService = new UnifiedBackupService(plugin);
		this.migrationService = new BackupMigrationService(plugin);
	}

	/**
	 * 初始化备份管理器
	 */
	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		await this.unifiedService.initialize();

		// 自动迁移旧备份（如果存在）
		await this.migrationService.autoMigrate();

		this.initialized = true;
	}

	/**
	 * 创建备份（使用新的统一备份服务）
	 */
	async createBackup(
		deckId: string,
		deckName: string,
		cards: Card[],
		reason: "import" | "manual" = "import"
	): Promise<string> {
		await this.ensureInitialized();

		const timestamp = new Date().toISOString();

		const backupInfo: BackupInfo = {
			id: "", // 将由统一服务生成
			timestamp,
			deckId,
			deckName,
			cardCount: cards.length,
			reason,
		};

		const backupData: BackupData = {
			info: backupInfo,
			cards: [...cards], // 深拷贝卡片数据
		};

		// 使用统一备份服务创建备份
		const result = await this.unifiedService.createBackup({
			level: "deck" as BackupLevel,
			trigger: (reason === "import" ? "auto_import" : "manual") as BackupTrigger,
			data: backupData,
			targetId: deckId,
			reason: `${reason === "import" ? "导入前自动备份" : "手动备份"}: ${deckName}`,
		});

		if (!result.success) {
			throw new Error(result.error || "创建备份失败");
		}

		logger.debug(`✅ 创建备份 ${result.backupId}:`, {
			deckName,
			cardCount: cards.length,
			reason,
			path: result.filePath,
		});

		return result.backupId;
	}

	/**
	 * 恢复备份
	 */
	async restoreBackup(backupId: string): Promise<Card[]> {
		await this.ensureInitialized();

		const result = await this.unifiedService.restoreBackup(backupId);

		if (!result.success) {
			throw new Error(result.error || "恢复备份失败");
		}

		// TODO: 从恢复结果中获取卡片数据
		// 这里需要根据实际实现调整
		return [];
	}

	/**
	 * 列出所有备份
	 */
	async listBackups(deckId?: string): Promise<BackupInfo[]> {
		await this.ensureInitialized();

		const allBackups = (await this.unifiedService.listBackups()) as StoredBackupSummary[];

		let backups = allBackups;

		// 如果指定了deckId，只返回该牌组的备份
		if (deckId) {
			backups = backups.filter((backup) => backup.summary?.deckId === deckId);
		}

		// 转换为旧格式
		return backups
			.map((backup) => ({
				id: backup.id,
				timestamp: new Date(backup.timestamp).toISOString(),
				deckId: backup.summary?.deckId || "",
				deckName: backup.summary?.deckName || "Unknown",
				cardCount: backup.summary?.cardCount || 0,
				reason: backup.trigger === "auto_import" ? ("import" as const) : ("manual" as const),
			}))
			.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	}

	/**
	 * 删除备份
	 */
	async deleteBackup(backupId: string): Promise<void> {
		await this.ensureInitialized();

		const success = await this.unifiedService.deleteBackup(backupId);

		if (!success) {
			throw new Error("删除备份失败");
		}

		logger.debug(`✅ 删除备份 ${backupId}`);
	}

	/**
	 * 获取备份统计
	 */
	async getStats(): Promise<{
		totalBackups: number;
		totalCards: number;
		oldestBackup?: string;
		newestBackup?: string;
	}> {
		await this.ensureInitialized();

		const stats = await this.unifiedService.getStats();
		const statsRecord = isRecord(stats) ? stats : {};
		const totalBackups = typeof statsRecord.totalBackups === "number" ? statsRecord.totalBackups : 0;
		const oldest =
			typeof statsRecord.oldest === "number" || typeof statsRecord.oldest === "string"
				? statsRecord.oldest
				: undefined;
		const newest =
			typeof statsRecord.newest === "number" || typeof statsRecord.newest === "string"
				? statsRecord.newest
				: undefined;

		return {
			totalBackups,
			totalCards: 0, // TODO: 从元数据中计算
			oldestBackup: oldest !== undefined ? new Date(oldest).toISOString() : undefined,
			newestBackup: newest !== undefined ? new Date(newest).toISOString() : undefined,
		};
	}

	/**
	 * 获取清理建议
	 */
	async getCleanupRecommendation() {
		await this.ensureInitialized();
		return await this.unifiedService.getCleanupRecommendation();
	}

	/**
	 * 执行智能清理
	 */
	async executeCleanup(backupIds: string[]) {
		await this.ensureInitialized();
		return await this.unifiedService.executeCleanup(backupIds);
	}

	/**
	 * 获取统一备份服务实例（用于 UI 组件）
	 */
	getUnifiedService(): UnifiedBackupService {
		return this.unifiedService;
	}
}
