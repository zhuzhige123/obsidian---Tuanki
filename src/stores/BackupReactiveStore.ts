import { logger } from "../utils/logger";
/**
 * 响应式备份存储
 * 普通 TypeScript 类，用于在 Svelte 组件中管理备份状态
 */

import type { Plugin } from "obsidian";
import type { Card, Deck } from "../data/types";
import { getWeaveBackupService, type WeaveBackupService } from "../services/backup/WeaveBackupService";
import type { BackupInfo, OperationType } from "../types/data-management-types";

export class BackupReactiveStore {
	public backups: BackupInfo[] = [];
	public isLoading = false;
	public error: string | null = null;
	public currentOperation: {
		type: OperationType;
		progress: number;
		status: string;
	} | null = null;

	private service: WeaveBackupService;
	private onStateChange: (() => void) | null = null;

	constructor(private plugin: Plugin) {
		this.service = getWeaveBackupService(plugin);
	}

	subscribe(callback: () => void) {
		this.onStateChange = callback;
	}

	private notifyStateChange() {
		if (this.onStateChange) {
			this.onStateChange();
		}
	}

	get stats() {
		const total = this.backups.length;
		const totalSize = this.backups.reduce((sum, b) => sum + b.size, 0);
		const validCount = this.backups.filter((b) => b.isValid).length;
		const invalidBackups = this.backups.filter((b) => !b.isValid);

		return {
			total,
			totalSize,
			validCount,
			invalidCount: total - validCount,
			invalidBackups,
			needsCleanup: invalidBackups.length > 0,
			oldestBackup: this.backups[this.backups.length - 1],
			newestBackup: this.backups[0],
		};
	}

	async loadBackups(): Promise<void> {
		this.isLoading = true;
		this.error = null;
		this.notifyStateChange();

		try {
			const backups = await this.service.listBackups();
			this.backups = backups.filter((b) => b.isValid !== false);
		} catch (error) {
			logger.error("加载备份列表失败:", error);
			this.error = error instanceof Error ? error.message : "加载失败";
			this.backups = [];
		} finally {
			this.isLoading = false;
			this.notifyStateChange();
		}
	}

	async createBackup(description?: string): Promise<BackupInfo | null> {
		this.currentOperation = {
			type: "backup" as OperationType,
			progress: 0,
			status: "准备创建备份...",
		};
		this.error = null;
		this.notifyStateChange();

		try {
			this.service.onProgress((progress) => {
				if (this.currentOperation) {
					this.currentOperation = {
						...this.currentOperation,
						progress: progress.percentage,
						status: progress.message,
					};
					this.notifyStateChange();
				}
			});

			const backup = await this.service.createBackup({
				reason: description,
				type: "manual",
			});

			await this.loadBackups();

			this.currentOperation = null;
			this.notifyStateChange();
			return backup;
		} catch (error) {
			logger.error("创建备份失败:", error);
			this.error = error instanceof Error ? error.message : "创建备份失败";
			this.currentOperation = null;
			this.notifyStateChange();
			return null;
		} finally {
			this.service.clearProgress();
		}
	}

	async deleteBackup(backupId: string): Promise<boolean> {
		this.error = null;

		try {
			await this.service.deleteBackup(backupId);
			this.backups = this.backups.filter((b) => b.id !== backupId);
			this.notifyStateChange();
			return true;
		} catch (error) {
			logger.error("删除备份失败:", error);
			this.error = error instanceof Error ? error.message : "删除备份失败";
			this.notifyStateChange();
			return false;
		}
	}

	async autoRepairBackup(backupId: string): Promise<boolean> {
		this.error = null;

		try {
			const result = await this.service.autoRepair(backupId);

			if (result.success) {
				const index = this.backups.findIndex((b) => b.id === backupId);
				if (index !== -1) {
					this.backups[index] = {
						...this.backups[index],
						isValid: true,
					};
					this.backups = [...this.backups];
					this.notifyStateChange();
				}
				return true;
			}

			this.error = result.error || "修复失败";
			this.notifyStateChange();
			return false;
		} catch (error) {
			logger.error("自动修复失败:", error);
			this.error = error instanceof Error ? error.message : "修复失败";
			this.notifyStateChange();
			return false;
		}
	}

	async autoRepairAll(): Promise<{ success: number; failed: number }> {
		const invalidBackups = this.backups.filter((b) => !b.isValid);
		let success = 0;
		let failed = 0;

		for (const backup of invalidBackups) {
			const result = await this.autoRepairBackup(backup.id);
			if (result) {
				success++;
			} else {
				failed++;
			}
		}

		return { success, failed };
	}

	async refreshBackupValidation(backupId: string): Promise<void> {
		try {
			const validation = await this.service.validateBackup(backupId);

			const index = this.backups.findIndex((b) => b.id === backupId);
			if (index !== -1) {
				this.backups[index] = {
					...this.backups[index],
					isValid: validation.passed,
				};
				this.backups = [...this.backups];
				this.notifyStateChange();
			}
		} catch (error) {
			logger.error("刷新验证状态失败:", error);
		}
	}

	async cleanupInvalidBackups(): Promise<{ deleted: number; failed: number } | null> {
		this.currentOperation = {
			type: "cleanup" as OperationType,
			progress: 0,
			status: "正在清理无效备份...",
		};
		this.error = null;
		this.notifyStateChange();

		try {
			const result = await this.service.cleanupInvalidBackups();
			await this.loadBackups();

			this.currentOperation = null;
			this.notifyStateChange();
			return result;
		} catch (error) {
			logger.error("清理无效备份失败:", error);
			this.error = error instanceof Error ? error.message : "清理无效备份失败";
			this.currentOperation = null;
			this.notifyStateChange();
			return null;
		}
	}

	async previewBackup(backupId: string): Promise<{
		decks: Deck[];
		cards: Card[];
		deckCount: number;
		cardCount: number;
	} | null> {
		try {
			return await this.service.previewBackup(backupId);
		} catch (error) {
			logger.error("预览备份失败:", error);
			this.error = error instanceof Error ? error.message : "预览备份失败";
			this.notifyStateChange();
			return null;
		}
	}

	clearError(): void {
		this.error = null;
		this.notifyStateChange();
	}

	reset(): void {
		this.backups = [];
		this.isLoading = false;
		this.error = null;
		this.currentOperation = null;
		this.notifyStateChange();
	}
}
