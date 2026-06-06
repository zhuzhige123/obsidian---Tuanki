import { logger } from "../../utils/logger";
/**
 * 智能备份引擎
 * 提供备份创建、验证、修复等核心功能
 * 采用纯函数设计，易于测试
 */

import type { Plugin } from "obsidian";
import { getBackupPath } from "../../config/paths";
import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck } from "../../data/types";
import type { BackupOptions } from "../../types/backup-types";
import { BackupLevel, BackupTrigger as BackupOptionTrigger } from "../../types/backup-types";
import type {
	BackupInfo,
	DataType,
	RepairResult,
	ValidationResult,
} from "../../types/data-management-types";
import { BackupTrigger as BackupInfoTrigger, BackupType } from "../../types/data-management-types";
import { isRecord, parseJsonUnknown, readString } from "../../utils/typed-json";

function formatValidationIssue(
	issue: string | import("../../types/data-management-types").ValidationIssue
): string {
	return typeof issue === "string" ? issue : issue.description;
}

function formatValidationIssues(issues: ValidationResult["issues"]): string {
	if (!issues || issues.length === 0) {
		return "未知错误";
	}
	return formatValidationIssue(issues[0]);
}

function formatValidationIssuesJoined(issues: ValidationResult["issues"]): string {
	if (!issues || issues.length === 0) {
		return "未知错误";
	}
	return issues.map((issue) => formatValidationIssue(issue)).join(", ");
}

function parseStoredBackupInfo(value: unknown): BackupInfo | null {
	if (!isRecord(value)) {
		return null;
	}

	const id = readString(value, "id");
	const timestamp = readString(value, "timestamp");
	const type = readString(value, "type");
	const path = readString(value, "path");
	const size = value.size;

	if (!id || !timestamp || !path || typeof size !== "number") {
		return null;
	}

	if (type !== BackupType.AUTO && type !== BackupType.MANUAL && type !== BackupType.PRE_OPERATION && type !== BackupType.SCHEDULED) {
		return null;
	}

	return value as BackupInfo;
}

export interface ProgressCallback {
	percentage: number;
	message: string;
}

type PluginWithDataStorage = Plugin & {
	dataStorage?: WeaveDataStorage;
};

function mapBackupTrigger(trigger: BackupOptionTrigger | undefined): BackupInfoTrigger | undefined {
	switch (trigger) {
		case BackupOptionTrigger.AUTO_IMPORT:
			return BackupInfoTrigger.BEFORE_IMPORT;
		case BackupOptionTrigger.AUTO_SYNC:
			return BackupInfoTrigger.STARTUP;
		case BackupOptionTrigger.SCHEDULED:
			return BackupInfoTrigger.SCHEDULED_TIME;
		case BackupOptionTrigger.PRE_UPDATE:
			return BackupInfoTrigger.BEFORE_RESET;
		default:
			return BackupInfoTrigger.MANUAL_REQUEST;
	}
}

const MAX_AUTO_BACKUPS = 3; // 自动备份保留数量
const MAX_MANUAL_BACKUPS = 3; // 手动备份保留数量

export class SmartBackupEngine {
	private progressCallbacks: ((progress: ProgressCallback) => void)[] = [];

	constructor(private plugin: Plugin) {}

	/**
	 * 注册进度回调
	 */
	onProgress(callback: (progress: ProgressCallback) => void): void {
		this.progressCallbacks.push(callback);
	}

	/**
	 * 发送进度通知
	 */
	private emitProgress(percentage: number, message: string): void {
		for (const callback of this.progressCallbacks) {
			callback({ percentage, message });
		}
	}

	/**
	 * 获取备份文件夹路径
	 *  使用独立备份路径（防止误删）
	 */
	private getBackupsPath(): string {
		return getBackupPath(this.plugin.app);
	}

	/**
	 * 创建备份
	 */
	async createBackup(options: Partial<BackupOptions> = {}): Promise<BackupInfo> {
		// 提供默认的BackupOptions
		const defaultOptions: BackupOptions = {
			level: BackupLevel.GLOBAL,
			trigger: BackupOptionTrigger.MANUAL,
			data: null,
		};
		const finalOptions = { ...defaultOptions, ...options };
		this.emitProgress(0, "准备创建备份...");

		try {
			const dataStorage = (this.plugin as PluginWithDataStorage).dataStorage;
			if (!dataStorage) {
				throw new Error("DataStorage not available");
			}

			// 创建备份文件夹
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupsFolder = this.getBackupsPath();
			const backupPath = `${backupsFolder}/${timestamp}`;

			this.emitProgress(10, "创建备份文件夹...");
			const adapter = this.plugin.app.vault.adapter;

			// 确保备份根目录存在
			if (!(await adapter.exists(backupsFolder))) {
				await adapter.mkdir(backupsFolder);
			}

			// 创建此次备份的文件夹
			await adapter.mkdir(backupPath);

			this.emitProgress(30, "备份牌组数据...");
			// 直接备份文件，不要创建子目录
			const decks = await dataStorage.getDecks();
			await adapter.write(`${backupPath}/decks.json`, JSON.stringify(decks, null, 2));

			this.emitProgress(50, "备份卡片数据...");
			const cards = await dataStorage.getCards();
			await adapter.write(`${backupPath}/cards.json`, JSON.stringify(cards, null, 2));

			this.emitProgress(60, "创建备份元数据...");
			const metadata = await this.createBackupMetadata(backupPath, finalOptions);

			this.emitProgress(80, "验证备份完整性...");
			const validation = await this.validateBackup(metadata.id);

			if (!validation.passed) {
				throw new Error(`备份验证失败: ${formatValidationIssues(validation.issues)}`);
			}

			this.emitProgress(90, "保存元数据...");
			await this.saveMetadata(metadata);

			if (finalOptions.autoCleanup) {
				this.emitProgress(95, "清理旧备份...");
				await this.cleanupOldBackups();
			}

			this.emitProgress(100, "备份完成");
			return metadata;
		} catch (error) {
			logger.error("创建备份失败:", error);
			throw error;
		}
	}

	/**
	 * 列出所有备份
	 */
	async listBackups(): Promise<BackupInfo[]> {
		const backupsFolder = this.getBackupsPath();
		const adapter = this.plugin.app.vault.adapter;

		// 确保备份文件夹存在
		if (!(await adapter.exists(backupsFolder))) {
			await adapter.mkdir(backupsFolder);
			return [];
		}

		const listing = await adapter.list(backupsFolder);
		const backups: BackupInfo[] = [];

		for (const folder of listing.folders || []) {
			try {
				const metadata = await this.loadMetadata(folder);
				if (metadata) {
					backups.push(metadata);
				} else {
					// 尝试推断并修复
					const inferred = this.inferBackupMetadata(folder);
					const validation = await this.validateBackup(inferred.id);

					if (validation.passed) {
						await this.saveMetadata(inferred);
						backups.push(inferred);
					} else {
						// 标记为无效
						inferred.isValid = false;
						backups.push(inferred);
					}
				}
			} catch (error) {
				logger.warn(`加载备份失败: ${folder}`, error);
			}
		}

		// 按时间倒序排序
		return backups.sort(
			(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);
	}

	/**
	 * 验证备份完整性
	 */
	async validateBackup(backupId: string): Promise<ValidationResult> {
		try {
			const backupsFolder = this.getBackupsPath();
			const backupPath = `${backupsFolder}/${backupId}`;
			const adapter = this.plugin.app.vault.adapter;

			// 检查备份文件夹是否存在
			if (!(await adapter.exists(backupPath))) {
				return {
					success: false,
					timestamp: new Date().toISOString(),
					passed: false,
					issues: ["备份文件夹不存在"],
				};
			}

			// 验证必需文件
			const requiredFiles = ["decks.json", "cards.json"];
			const issues: string[] = [];

			for (const file of requiredFiles) {
				const filePath = `${backupPath}/${file}`;
				const exists = await adapter.exists(filePath);

				if (!exists) {
					issues.push(`缺少文件: ${file}`);
				} else {
					// 验证JSON格式
					try {
						const content = await adapter.read(filePath);
						JSON.parse(content);
					} catch {
						issues.push(`文件损坏: ${file}`);
					}
				}
			}

			return {
				success: issues.length === 0,
				timestamp: new Date().toISOString(),
				passed: issues.length === 0,
				issues: issues.length > 0 ? issues : undefined,
			};
		} catch (error) {
			logger.error("验证备份失败:", error);
			return {
				success: false,
				timestamp: new Date().toISOString(),
				passed: false,
				issues: [error instanceof Error ? error.message : "验证失败"],
			};
		}
	}

	/**
	 * 自动修复备份
	 */
	async autoRepair(backupId: string): Promise<RepairResult> {
		try {
			const validation = await this.validateBackup(backupId);

			if (validation.passed) {
				return {
					success: true,
					timestamp: new Date().toISOString(),
					repairedCount: 0,
				};
			}

			const repairs: string[] = [];
			const backupsFolder = this.getBackupsPath();
			const backupPath = `${backupsFolder}/${backupId}`;
			const adapter = this.plugin.app.vault.adapter;

			// 尝试修复缺失的文件
			for (const issue of validation.issues || []) {
				const issueStr = typeof issue === "string" ? issue : issue.description;
				if (issueStr.includes("缺少文件")) {
					const fileName = issueStr.split(": ")[1];
					const filePath = `${backupPath}/${fileName}`;

					// 创建空的JSON文件
					const emptyData = fileName.includes("deck") ? "[]" : "[]";
					await adapter.write(filePath, emptyData);
					repairs.push(`已修复: ${fileName}`);
				}
			}

			if (repairs.length > 0) {
				// 更新元数据，标记为有效
				const metadata = await this.loadMetadata(backupPath);
				if (metadata) {
					metadata.isValid = true;
					metadata.description = `${metadata.description || ""} (已修复)`;
					await this.saveMetadata(metadata);
				}

				return {
					success: true,
					timestamp: new Date().toISOString(),
					repairedCount: repairs.length,
					repairs,
				};
			}

			return {
				success: false,
				timestamp: new Date().toISOString(),
				error: "无法自动修复此备份",
				repairedCount: 0,
			};
		} catch (error) {
			logger.error("自动修复失败:", error);
			return {
				success: false,
				timestamp: new Date().toISOString(),
				error: error instanceof Error ? error.message : "修复失败",
				repairedCount: 0,
			};
		}
	}

	/**
	 * 删除备份
	 */
	async deleteBackup(backupId: string): Promise<void> {
		const backupsFolder = this.getBackupsPath();
		const backupPath = `${backupsFolder}/${backupId}`;
		const adapter = this.plugin.app.vault.adapter;

		if (await adapter.exists(backupPath)) {
			await this.deleteRecursively(backupPath);
		}
	}

	/**
	 * 递归删除文件夹
	 */
	private async deleteRecursively(path: string): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const listing = await adapter.list(path);

		// 删除所有文件
		for (const file of listing.files || []) {
			await adapter.remove(file);
		}

		// 递归删除子文件夹
		for (const folder of listing.folders || []) {
			await this.deleteRecursively(folder);
		}

		// 删除空文件夹
		await adapter.rmdir(path, false);
	}

	/**
	 * 清理旧备份（分别保留自动和手动备份）
	 * 自动备份保留3个，手动备份保留3个
	 */
	private async cleanupOldBackups(): Promise<void> {
		const allBackups = await this.listBackups();

		// 按类型分组
		const autoBackups = allBackups.filter((b) => b.type === BackupType.AUTO);
		const manualBackups = allBackups.filter((b) => b.type === BackupType.MANUAL);

		// 清理自动备份
		if (autoBackups.length > MAX_AUTO_BACKUPS) {
			const toDeleteAuto = autoBackups.slice(MAX_AUTO_BACKUPS);
			for (const backup of toDeleteAuto) {
				try {
					await this.deleteBackup(backup.id);
					logger.debug(`已清理旧自动备份: ${backup.id}`);
				} catch (error) {
					logger.warn(`清理自动备份失败: ${backup.id}`, error);
				}
			}
		}

		// 清理手动备份
		if (manualBackups.length > MAX_MANUAL_BACKUPS) {
			const toDeleteManual = manualBackups.slice(MAX_MANUAL_BACKUPS);
			for (const backup of toDeleteManual) {
				try {
					await this.deleteBackup(backup.id);
					logger.debug(`已清理旧手动备份: ${backup.id}`);
				} catch (error) {
					logger.warn(`清理手动备份失败: ${backup.id}`, error);
				}
			}
		}
	}

	/**
	 * 创建备份元数据
	 */
	private async createBackupMetadata(
		backupPath: string,
		options: BackupOptions
	): Promise<BackupInfo> {
		const adapter = this.plugin.app.vault.adapter;
		const timestamp = new Date().toISOString();
		const folderName = backupPath.split("/").pop() || timestamp;

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

		return {
			id: folderName,
			timestamp,
			type: options.type === "auto" ? BackupType.AUTO : BackupType.MANUAL,
			size,
			description: options.reason || "智能备份",
			trigger: mapBackupTrigger(options.trigger),
			path: backupPath,
			isValid: true,
			dataTypes: ["decks", "cards", "sessions", "profile"] as DataType[],
		};
	}

	/**
	 * 保存元数据
	 */
	private async saveMetadata(metadata: BackupInfo): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const metadataPath = `${metadata.path}/.backup-info.json`;

		try {
			await adapter.write(metadataPath, JSON.stringify(metadata, null, 2));
		} catch (error) {
			logger.warn("保存备份元数据失败:", error);
		}
	}

	/**
	 * 加载元数据
	 */
	private async loadMetadata(backupPath: string): Promise<BackupInfo | null> {
		const adapter = this.plugin.app.vault.adapter;
		const metadataPath = `${backupPath}/.backup-info.json`;

		try {
			if (await adapter.exists(metadataPath)) {
				const content = await adapter.read(metadataPath);
				return parseStoredBackupInfo(parseJsonUnknown(content));
			}
		} catch (error) {
			logger.warn(`加载元数据失败: ${backupPath}`, error);
		}

		return null;
	}

	/**
	 * 推断备份元数据（用于修复缺失元数据的备份）
	 */
	private inferBackupMetadata(backupPath: string): BackupInfo {
		const folderName = backupPath.split("/").pop() || "";

		// 智能解析时间戳
		let timestamp: string;

		try {
			if (folderName.includes("T")) {
				// ISO格式变体: 2025-10-17T05-00-05-766Z
				timestamp = folderName
					.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3")
					.replace(/-(\d{3})Z$/, ".$1Z");
			} else if (folderName.includes("_")) {
				// 下划线格式: 2025-10-17_05-00-05
				const parts = folderName.split("_");
				const datePart = parts[0];
				const timePart = parts[1]?.replace(/-/g, ":") || "00:00:00";
				timestamp = `${datePart}T${timePart}Z`;
			} else if (/^\d{14}$/.test(folderName)) {
				// 纯数字格式: 20251017050005
				timestamp = `${folderName.slice(0, 4)}-${folderName.slice(4, 6)}-${folderName.slice(
					6,
					8
				)}T${folderName.slice(8, 10)}:${folderName.slice(10, 12)}:${folderName.slice(12, 14)}Z`;
			} else {
				// 无法解析，使用当前时间
				timestamp = new Date().toISOString();
			}

			// 验证时间戳有效性
			const date = new Date(timestamp);
			if (Number.isNaN(date.getTime())) {
				timestamp = new Date().toISOString();
			}
		} catch {
			timestamp = new Date().toISOString();
		}

		return {
			id: folderName,
			timestamp,
			type: BackupType.AUTO,
			size: 0,
			path: backupPath,
			isValid: false, // 需要验证
			dataTypes: ["decks", "cards"] as DataType[],
			description: "(推断的备份信息)",
		};
	}

	/**
	 * 批量删除所有无效备份
	 * @returns 删除结果
	 */
	async cleanupInvalidBackups(): Promise<{ deleted: number; failed: number }> {
		const backups = await this.listBackups();
		let deleted = 0;
		let failed = 0;

		for (const backup of backups) {
			if (!backup.isValid) {
				try {
					await this.deleteBackup(backup.id);
					deleted++;
					logger.debug(`✅ 已删除无效备份: ${backup.id}`);
				} catch (error) {
					logger.error(`❌ 删除无效备份失败: ${backup.id}`, error);
					failed++;
				}
			}
		}

		return { deleted, failed };
	}

	/**
	 * 预览备份内容
	 * @param backupId 备份ID
	 * @returns 备份内容预览
	 */
	async previewBackup(backupId: string): Promise<{
		decks: Deck[];
		cards: Card[];
		deckCount: number;
		cardCount: number;
	}> {
		const backupsFolder = this.getBackupsPath();
		const backupPath = `${backupsFolder}/${backupId}`;
		const adapter = this.plugin.app.vault.adapter;

		try {
			//  第2层防护：先验证备份完整性
			const validation = await this.validateBackup(backupId);
			if (!validation.passed) {
				const issues = formatValidationIssuesJoined(validation.issues);
				throw new Error(`备份无效或已损坏: ${issues}`);
			}

			// 读取牌组数据
			const decksPath = `${backupPath}/decks.json`;
			const decksContent = await adapter.read(decksPath);
			const decks = JSON.parse(decksContent) as unknown;

			// 读取卡片数据
			const cardsPath = `${backupPath}/cards.json`;
			const cardsContent = await adapter.read(cardsPath);
			const cards = JSON.parse(cardsContent) as unknown;

			return {
				decks: Array.isArray(decks) ? (decks as Deck[]) : [],
				cards: Array.isArray(cards) ? (cards as Card[]) : [],
				deckCount: Array.isArray(decks) ? decks.length : 0,
				cardCount: Array.isArray(cards) ? cards.length : 0,
			};
		} catch (error) {
			logger.error("预览备份失败:", error);
			// 如果是我们自己抛出的验证错误，直接传递
			if (error instanceof Error && error.message.includes("备份无效")) {
				throw error;
			}
			throw new Error("无法读取备份内容");
		}
	}
}
