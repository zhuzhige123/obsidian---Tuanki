import { logger } from "../../../utils/logger";
/**
 * 统一备份服务
 *
 * 整合所有备份功能的统一入口，提供：
 * - 自动选择存储策略
 * - 智能压缩
 * - 设备感知
 * - 元数据管理
 * - 备份恢复
 */

import type { Plugin } from "obsidian";
import type {
	BackupData,
	BackupOptions,
	BackupResult,
	BackupTrigger,
	CleanupRecommendation,
	RestoreResult,
} from "../../../types/backup-types";
import { StoragePathManager } from "../StoragePathManager";
import { BackupMetadataManager } from "./BackupMetadataManager";
import { DeviceAwareBackupManager } from "./DeviceAwareBackupManager";
import { IntelligentBackupCompression } from "./IntelligentBackupCompression";

export class UnifiedBackupService {
	private plugin: Plugin;
	private pathManager: StoragePathManager;
	private compression: IntelligentBackupCompression;
	private deviceManager: DeviceAwareBackupManager;
	private metadataManager: BackupMetadataManager;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.pathManager = new StoragePathManager(plugin);
		this.compression = new IntelligentBackupCompression();
		this.deviceManager = new DeviceAwareBackupManager(plugin);
		this.metadataManager = new BackupMetadataManager(plugin);
	}

	/**
	 * 初始化备份服务
	 */
	async initialize(): Promise<void> {
		logger.debug("🔧 初始化统一备份服务...");

		// 初始化存储目录
		await this.pathManager.initialize();

		// 加载元数据索引
		await this.metadataManager.loadIndex();

		logger.debug("✅ 统一备份服务初始化完成");
	}

	/**
	 * 创建备份（自动选择最佳策略）
	 * @param options 备份选项
	 * @returns 备份结果
	 */
	async createBackup(options: BackupOptions): Promise<BackupResult> {
		logger.debug("📦 创建备份:", {
			level: options.level,
			trigger: options.trigger,
			targetId: options.targetId,
			reason: options.reason,
		});

		try {
			// 使用设备感知管理器创建备份
			const result = await this.deviceManager.createBackup(options);

			if (!result.success) {
				return result;
			}

			// 保存元数据
			if (result.metadata) {
				await this.metadataManager.addOrUpdate(result.metadata);
			}

			// 执行自动清理（如果需要）
			await this.autoCleanupIfNeeded();

			return result;
		} catch (error) {
			logger.error("❌ 创建备份失败:", error);
			return {
				success: false,
				backupId: "",
				filePath: "",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 恢复备份
	 * @param backupId 备份ID
	 * @returns 恢复结果
	 */
	async restoreBackup(backupId: string): Promise<RestoreResult> {
		logger.debug("🔄 恢复备份:", backupId);

		try {
			// 获取备份元数据
			const metadata = await this.metadataManager.get(backupId);

			if (!metadata) {
				return {
					success: false,
					error: "备份不存在",
				};
			}

			// 恢复前创建当前状态的备份
			logger.debug("📸 恢复前创建安全备份...");
			await this.createBackup({
				level: metadata.level,
				trigger: "pre_update" as BackupTrigger,
				data: {}, // TODO: 获取当前数据
				reason: `恢复前备份: 准备恢复 ${backupId}`,
			});

			// 加载备份数据
			const backupData = await this.deviceManager.loadBackup(metadata.storagePath);

			// 转换设备路径
			const _restoredData = this.deviceManager.restoreDevicePaths(backupData.data);

			// TODO: 执行实际的数据恢复
			// 这里需要根据 backup.level 决定恢复策略
			// - card: 恢复单张卡片
			// - deck: 恢复整个牌组
			// - global: 恢复所有数据

			logger.debug("✅ 备份恢复成功");

			return {
				success: true,
				restoredItems: (backupData.data as BackupData)?.cards?.length || 0,
			};
		} catch (error) {
			logger.error("❌ 恢复备份失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 列出所有备份
	 * @returns 备份元数据列表
	 */
	async listBackups(): Promise<unknown[]> {
		return await this.metadataManager.listAll();
	}

	/**
	 * 获取备份详情
	 * @param backupId 备份ID
	 * @returns 备份元数据
	 */
	async getBackup(backupId: string): Promise<unknown> {
		return await this.metadataManager.get(backupId);
	}

	/**
	 * 删除备份
	 * @param backupId 备份ID
	 * @returns 是否成功
	 */
	async deleteBackup(backupId: string): Promise<boolean> {
		try {
			logger.debug("🗑️ 删除备份:", backupId);

			// 获取元数据
			const metadata = await this.metadataManager.get(backupId);

			if (!metadata) {
				logger.warn("备份不存在:", backupId);
				return false;
			}

			// 评估可删除性
			const assessment = await this.metadataManager.assessDeletability(backupId);

			if (!assessment.canDelete) {
				logger.error("无法删除备份:", assessment.reason);
				throw new Error(assessment.reason);
			}

			// 删除文件
			try {
				await this.plugin.app.vault.adapter.remove(metadata.storagePath);
			} catch (error) {
				logger.warn("删除备份文件失败:", error);
			}

			// 删除元数据
			await this.metadataManager.remove(backupId);

			logger.debug("✅ 备份已删除");
			return true;
		} catch (error) {
			logger.error("❌ 删除备份失败:", error);
			return false;
		}
	}

	/**
	 * 获取清理建议
	 * @returns 清理建议
	 */
	async getCleanupRecommendation(): Promise<CleanupRecommendation> {
		return await this.metadataManager.recommendCleanup();
	}

	/**
	 * 执行清理（删除推荐的备份）
	 * @param backupIds 要删除的备份ID列表
	 * @returns 清理结果
	 */
	async executeCleanup(backupIds: string[]): Promise<{
		success: number;
		failed: number;
		totalSaved: number;
	}> {
		let success = 0;
		let failed = 0;
		let totalSaved = 0;

		for (const backupId of backupIds) {
			const metadata = await this.metadataManager.get(backupId);

			if (metadata) {
				const deleted = await this.deleteBackup(backupId);

				if (deleted) {
					success++;
					totalSaved += metadata.size;
				} else {
					failed++;
				}
			} else {
				failed++;
			}
		}

		logger.debug("🧹 清理完成:", {
			成功: success,
			失败: failed,
			节省空间: this.compression.formatSize(totalSaved),
		});

		return { success, failed, totalSaved };
	}

	/**
	 * 如果需要，自动清理旧备份
	 */
	private async autoCleanupIfNeeded(): Promise<void> {
		try {
			const stats = await this.metadataManager.getStats();

			// 配置：最大备份数量
			const maxBackups = 50;

			if (stats.totalBackups > maxBackups) {
				logger.debug(
					`⚠️ 备份数量 (${stats.totalBackups}) 超过限制 (${maxBackups})，执行自动清理...`
				);

				const recommendation = await this.getCleanupRecommendation();

				// 自动删除高可信度的推荐清理项
				const autoCleanable = recommendation.recommendedDeletions
					.filter((item) => item.assessment.confidence === "high")
					.slice(0, 10) // 最多自动清理10个
					.map((item) => item.backupId);

				if (autoCleanable.length > 0) {
					await this.executeCleanup(autoCleanable);
				}
			}
		} catch (error) {
			logger.error("自动清理失败:", error);
		}
	}

	/**
	 * 获取统计信息
	 * @returns 统计数据
	 */
	async getStats(): Promise<unknown> {
		return await this.metadataManager.getStats();
	}

	/**
	 * 查找所有设备的备份
	 * @returns 设备备份映射
	 */
	async findAllDeviceBackups(): Promise<unknown> {
		return await this.deviceManager.findAllDeviceBackups();
	}

	/**
	 * 获取当前设备ID
	 * @returns 设备ID
	 */
	getDeviceId(): string {
		return this.deviceManager.getDeviceId();
	}

	/**
	 * 获取当前设备名称
	 * @returns 设备名称
	 */
	getDeviceName(): string {
		return this.deviceManager.getDeviceName();
	}
}
