/**
 * Weave 双槽位数据备份服务
 *
 * - 自动备份槽位：backups/auto/（每次覆盖）
 * - 手动备份槽位：backups/manual/（每次覆盖）
 * - 不包含附件（media/）；仅结构化 JSON 学习数据
 * - json-recovery / config-recovery / sync-conflicts 等内部目录不受用户备份清理影响
 */

import type { Plugin, App } from "obsidian";
import { getBackupPath, getV2PathsFromApp } from "../../config/paths";
import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck, UserProfile } from "../../data/types";
import type { BackupOptions } from "../../types/backup-types";
import { BackupTrigger as BackupOptionTrigger } from "../../types/backup-types";
import type {
	BackupInfo,
	RepairResult,
	ValidationResult,
} from "../../types/data-management-types";
import { DataType } from "../../types/data-management-types";
import { BackupTrigger as BackupInfoTrigger, BackupType } from "../../types/data-management-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { isRecord, parseJsonUnknown, readString } from "../../utils/typed-json";

export const BACKUP_SLOT_AUTO = "auto";
export const BACKUP_SLOT_MANUAL = "manual";

/** 用户可见备份槽位 */
export const BACKUP_USER_SLOTS = [BACKUP_SLOT_AUTO, BACKUP_SLOT_MANUAL] as const;

export type BackupUserSlot = typeof BACKUP_USER_SLOTS[number];

export interface LegacyBackupCleanupResult {
	removed: number;
	removedFolders: string[];
}

const weaveBackupServiceInstances = new WeakMap<App, WeaveBackupService>();

/** 备份目录内受保护的子目录（不参与用户备份清理） */
export const BACKUP_PROTECTED_SUBDIRS = [
	"json-recovery",
	"config-recovery",
	"sync-conflicts",
	BACKUP_SLOT_AUTO,
	BACKUP_SLOT_MANUAL,
] as const;

const BACKUP_INFO_FILE = ".backup-info.json";
const REQUIRED_BACKUP_FILES = ["decks.json", "cards.json"] as const;

type PluginWithDataStorage = Plugin & {
	dataStorage?: WeaveDataStorage;
};

export interface BackupProgressCallback {
	percentage: number;
	message: string;
}

function formatValidationIssue(
	issue: string | import("../../types/data-management-types").ValidationIssue
): string {
	return typeof issue === "string" ? issue : issue.description;
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

	if (
		type !== BackupType.AUTO &&
		type !== BackupType.MANUAL &&
		type !== BackupType.PRE_OPERATION &&
		type !== BackupType.SCHEDULED
	) {
		return null;
	}

	return value as unknown as BackupInfo;
}

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

function slotFromBackupType(type: BackupOptions["type"]): BackupUserSlot {
	return type === "auto" ? BACKUP_SLOT_AUTO : BACKUP_SLOT_MANUAL;
}

function backupTypeFromSlot(slot: string): BackupType {
	return slot === BACKUP_SLOT_AUTO ? BackupType.AUTO : BackupType.MANUAL;
}

function isUserSlot(id: string): id is BackupUserSlot {
	return id === BACKUP_SLOT_AUTO || id === BACKUP_SLOT_MANUAL;
}

export function isProtectedBackupSubdir(folderName: string): boolean {
	return (BACKUP_PROTECTED_SUBDIRS as readonly string[]).includes(folderName);
}

export class WeaveBackupService {
	private progressCallback: ((progress: BackupProgressCallback) => void) | null = null;
	private legacyCleanupDone = false;

	constructor(private plugin: Plugin) {}

	onProgress(callback: (progress: BackupProgressCallback) => void): void {
		this.progressCallback = callback;
	}

	clearProgress(): void {
		this.progressCallback = null;
	}

	private emitProgress(percentage: number, message: string): void {
		this.progressCallback?.({ percentage, message });
	}

	private getBackupsRoot(): string {
		return getBackupPath(this.plugin.app);
	}

	private getSlotPath(slot: BackupUserSlot): string {
		return `${this.getBackupsRoot()}/${slot}`;
	}

	private getDataStorage(): WeaveDataStorage {
		const dataStorage = (this.plugin as PluginWithDataStorage).dataStorage;
		if (!dataStorage) {
			throw new Error("DataStorage not available");
		}
		return dataStorage;
	}

	private getAdapter() {
		return this.plugin.app.vault.adapter;
	}

	/**
	 * 创建备份（覆盖对应槽位）
	 */
	async createBackup(options: Partial<BackupOptions> = {}): Promise<BackupInfo> {
		const slot = slotFromBackupType(options.type ?? "manual");
		this.emitProgress(0, "准备创建备份...");

		try {
			await this.ensureLegacyCleanup();

			const dataStorage = this.getDataStorage();
			const adapter = this.getAdapter();
			const slotPath = this.getSlotPath(slot);
			const backupsRoot = this.getBackupsRoot();

			if (!(await adapter.exists(backupsRoot))) {
				await adapter.mkdir(backupsRoot);
			}

			this.emitProgress(15, "清理旧备份槽位...");
			await this.clearSlotDirectory(slotPath);

			this.emitProgress(30, "备份牌组与卡片数据...");
			const [decks, cards, userProfile] = await Promise.all([
				dataStorage.getDecks(),
				dataStorage.getCards(),
				dataStorage.getUserProfile(),
			]);

			await adapter.write(`${slotPath}/decks.json`, JSON.stringify(decks, null, 2));
			await adapter.write(`${slotPath}/cards.json`, JSON.stringify(cards, null, 2));
			await adapter.write(`${slotPath}/profile.json`, JSON.stringify(userProfile, null, 2));

			this.emitProgress(55, "备份附加结构化数据...");
			const v2Paths = getV2PathsFromApp(this.plugin.app);
			const bindingsPath = v2Paths.memory.formalDeckBindings;
			if (await adapter.exists(bindingsPath)) {
				const bindingsContent = await adapter.read(bindingsPath);
				await adapter.write(`${slotPath}/formal-deck-bindings.json`, bindingsContent);
			}

			this.emitProgress(70, "创建备份元数据...");
			const metadata = await this.buildBackupMetadata(slotPath, slot, options);

			this.emitProgress(85, "验证备份完整性...");
			const validation = await this.validateBackup(slot);
			if (!validation.passed) {
				throw new Error(`备份验证失败: ${formatValidationIssuesJoined(validation.issues)}`);
			}

			await this.saveMetadata(metadata);

			this.emitProgress(100, "备份完成");
			return metadata;
		} catch (error) {
			logger.error("创建备份失败:", error);
			throw error;
		}
	}

	/**
	 * 列出用户可见备份（固定 auto + manual 两个槽位，仅有内容的才返回）
	 */
	async listBackups(): Promise<BackupInfo[]> {
		await this.ensureLegacyCleanup();

		const backups: BackupInfo[] = [];
		for (const slot of BACKUP_USER_SLOTS) {
			const info = await this.loadSlotBackupInfo(slot);
			if (info) {
				backups.push(info);
			}
		}

		return backups.sort(
			(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);
	}

	async validateBackup(backupId: string): Promise<ValidationResult> {
		try {
			if (!isUserSlot(backupId)) {
				return {
					success: false,
					timestamp: new Date().toISOString(),
					passed: false,
					issues: ["无效的备份槽位"],
				};
			}

			const backupPath = this.getSlotPath(backupId);
			const adapter = this.getAdapter();

			if (!(await adapter.exists(backupPath))) {
				return {
					success: false,
					timestamp: new Date().toISOString(),
					passed: false,
					issues: ["备份文件夹不存在"],
				};
			}

			const issues: string[] = [];

			for (const file of REQUIRED_BACKUP_FILES) {
				const filePath = `${backupPath}/${file}`;
				if (!(await adapter.exists(filePath))) {
					issues.push(`缺少文件: ${file}`);
					continue;
				}
				try {
					const content = await adapter.read(filePath);
					JSON.parse(content);
				} catch {
					issues.push(`文件损坏: ${file}`);
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

			if (!isUserSlot(backupId)) {
				return {
					success: false,
					timestamp: new Date().toISOString(),
					error: "无法修复此备份",
					repairedCount: 0,
				};
			}

			const repairs: string[] = [];
			const backupPath = this.getSlotPath(backupId);
			const adapter = this.getAdapter();

			for (const issue of validation.issues || []) {
				const issueStr = typeof issue === "string" ? issue : issue.description;
				if (issueStr.includes("缺少文件")) {
					const fileName = issueStr.split(": ")[1];
					if (fileName) {
						await adapter.write(`${backupPath}/${fileName}`, "[]");
						repairs.push(`已修复: ${fileName}`);
					}
				}
			}

			if (repairs.length > 0) {
				const metadata = await this.loadMetadataFromPath(backupPath);
				if (metadata) {
					metadata.isValid = true;
					metadata.description = `${metadata.description || ""} (已修复)`.trim();
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

	async deleteBackup(backupId: string): Promise<void> {
		if (!isUserSlot(backupId)) {
			throw new Error("只能删除自动或手动备份槽位");
		}

		const slotPath = this.getSlotPath(backupId);
		const adapter = this.getAdapter();
		if (await adapter.exists(slotPath)) {
			await this.deleteRecursively(slotPath);
		}
	}

	async cleanupInvalidBackups(): Promise<{ deleted: number; failed: number }> {
		let deleted = 0;
		let failed = 0;

		for (const slot of BACKUP_USER_SLOTS) {
			const info = await this.loadSlotBackupInfo(slot);
			if (info && info.isValid === false) {
				try {
					await this.deleteBackup(slot);
					deleted++;
				} catch (error) {
					logger.error(`删除无效备份失败: ${slot}`, error);
					failed++;
				}
			}
		}

		return { deleted, failed };
	}

	async previewBackup(backupId: string): Promise<{
		decks: Deck[];
		cards: Card[];
		deckCount: number;
		cardCount: number;
	}> {
		if (!isUserSlot(backupId)) {
			throw new Error("无效的备份槽位");
		}

		const validation = await this.validateBackup(backupId);
		if (!validation.passed) {
			throw new Error(
				`备份无效或已损坏: ${formatValidationIssuesJoined(validation.issues)}`
			);
		}

		const adapter = this.getAdapter();
		const backupPath = this.getSlotPath(backupId);

		const decksContent = await adapter.read(`${backupPath}/decks.json`);
		const cardsContent = await adapter.read(`${backupPath}/cards.json`);
		const decks = JSON.parse(decksContent) as unknown;
		const cards = JSON.parse(cardsContent) as unknown;

		return {
			decks: Array.isArray(decks) ? (decks as Deck[]) : [],
			cards: Array.isArray(cards) ? (cards as Card[]) : [],
			deckCount: Array.isArray(decks) ? decks.length : 0,
			cardCount: Array.isArray(cards) ? cards.length : 0,
		};
	}

	/**
	 * 从槽位恢复学习数据（不含附件）
	 */
	async restoreFromSlot(
		slot: BackupUserSlot,
		options?: { restoreProfile?: boolean; restoreBindings?: boolean }
	): Promise<{ deckCount: number; cardCount: number }> {
		const validation = await this.validateBackup(slot);
		if (!validation.passed) {
			throw new Error(`备份验证失败: ${formatValidationIssuesJoined(validation.issues)}`);
		}

		const adapter = this.getAdapter();
		const dataStorage = this.getDataStorage();
		const backupPath = this.getSlotPath(slot);
		const restoreProfile = options?.restoreProfile ?? true;
		const restoreBindings = options?.restoreBindings ?? true;

		const decksRaw = parseJsonUnknown(await adapter.read(`${backupPath}/decks.json`));
		const cardsRaw = parseJsonUnknown(await adapter.read(`${backupPath}/cards.json`));
		const decks = Array.isArray(decksRaw) ? (decksRaw as Deck[]) : [];
		const cards = Array.isArray(cardsRaw) ? (cardsRaw as Card[]) : [];

		const importedDeckIdMap = new Map<string, string>();
		for (const deck of decks) {
			const result = await dataStorage.saveDeck(deck);
			if (!result.success || !result.data) {
				throw new Error(result.error || `恢复牌组失败: ${deck.name || deck.id}`);
			}
			importedDeckIdMap.set(deck.id, result.data.id);
		}

		const byDeck = new Map<string, Card[]>();
		for (const card of cards) {
			const deckKey = importedDeckIdMap.get(card.deckId || "") || card.deckId || "";
			const list = byDeck.get(deckKey) || [];
			list.push(card);
			byDeck.set(deckKey, list);
		}
		for (const [deckId, list] of byDeck.entries()) {
			await dataStorage.saveDeckCards(deckId, list);
		}

		if (restoreProfile && (await adapter.exists(`${backupPath}/profile.json`))) {
			const profileRaw = parseJsonUnknown(await adapter.read(`${backupPath}/profile.json`));
			await dataStorage.saveUserProfile(profileRaw as UserProfile);
		}

		if (restoreBindings && (await adapter.exists(`${backupPath}/formal-deck-bindings.json`))) {
			const bindingsPath = getV2PathsFromApp(this.plugin.app).memory.formalDeckBindings;
			const content = await adapter.read(`${backupPath}/formal-deck-bindings.json`);
			await DirectoryUtils.ensureDirForFile(adapter, bindingsPath);
			await adapter.write(bindingsPath, content);
		}

		return { deckCount: decks.length, cardCount: cards.length };
	}

	/** 清理旧时间戳备份目录，仅保留受保护子目录 */
	async cleanupLegacyTimestampBackups(): Promise<LegacyBackupCleanupResult> {
		const adapter = this.getAdapter();
		const backupsRoot = this.getBackupsRoot();

		if (!(await adapter.exists(backupsRoot))) {
			return { removed: 0, removedFolders: [] };
		}

		const listing = await adapter.list(backupsRoot);
		const removedFolders: string[] = [];

		for (const folder of listing.folders || []) {
			const folderName = folder.split("/").pop() || "";
			if (isProtectedBackupSubdir(folderName)) {
				continue;
			}

			try {
				await this.deleteRecursively(folder);
				removedFolders.push(folderName);
				logger.debug(`[WeaveBackup] 已清理旧备份目录: ${folderName}`);
			} catch (error) {
				logger.warn(`[WeaveBackup] 清理旧备份目录失败: ${folderName}`, error);
			}
		}

		return { removed: removedFolders.length, removedFolders };
	}

	/** 列出尚未清理的旧时间戳备份目录名（不含 auto/manual 等受保护目录） */
	async listLegacyTimestampBackupFolders(): Promise<string[]> {
		const adapter = this.getAdapter();
		const backupsRoot = this.getBackupsRoot();

		if (!(await adapter.exists(backupsRoot))) {
			return [];
		}

		const listing = await adapter.list(backupsRoot);
		const legacyFolders: string[] = [];

		for (const folder of listing.folders || []) {
			const folderName = folder.split("/").pop() || "";
			if (!isProtectedBackupSubdir(folderName)) {
				legacyFolders.push(folderName);
			}
		}

		return legacyFolders;
	}

	private async ensureLegacyCleanup(): Promise<void> {
		if (this.legacyCleanupDone) {
			return;
		}
		await this.cleanupLegacyTimestampBackups();
		this.legacyCleanupDone = true;
	}

	private async clearSlotDirectory(slotPath: string): Promise<void> {
		const adapter = this.getAdapter();
		if (await adapter.exists(slotPath)) {
			await this.deleteRecursively(slotPath);
		}
		await adapter.mkdir(slotPath);
	}

	private async buildBackupMetadata(
		slotPath: string,
		slot: BackupUserSlot,
		options: Partial<BackupOptions>
	): Promise<BackupInfo> {
		const timestamp = new Date().toISOString();
		const size = await this.calculateDirectorySize(slotPath);
		const backupType = backupTypeFromSlot(slot);

		return {
			id: slot,
			timestamp,
			type: backupType,
			size,
			description: options.reason || (slot === BACKUP_SLOT_AUTO ? "自动备份" : "手动备份"),
			trigger: mapBackupTrigger(options.trigger),
			path: slotPath,
			isValid: true,
			dataTypes: [
				DataType.DECKS,
				DataType.CARDS,
				DataType.PROFILE,
			] as DataType[],
		};
	}

	private async calculateDirectorySize(path: string): Promise<number> {
		const adapter = this.getAdapter();
		let size = 0;
		try {
			const listing = await adapter.list(path);
			for (const file of listing.files || []) {
				const stat = await adapter.stat(file);
				size += stat?.size || 0;
			}
		} catch (error) {
			logger.warn("计算备份大小失败:", error);
		}
		return size;
	}

	private async saveMetadata(metadata: BackupInfo): Promise<void> {
		const adapter = this.getAdapter();
		const metadataPath = `${metadata.path}/${BACKUP_INFO_FILE}`;
		try {
			await adapter.write(metadataPath, JSON.stringify(metadata, null, 2));
		} catch (error) {
			logger.warn("保存备份元数据失败:", error);
		}
	}

	private async readBackupTimestamp(
		slotPath: string,
		adapter: ReturnType<WeaveBackupService["getAdapter"]>
	): Promise<string | null> {
		const metadata = await this.loadMetadataFromPath(slotPath);
		if (metadata?.timestamp) {
			return metadata.timestamp;
		}

		const decksPath = `${slotPath}/decks.json`;
		if (await adapter.exists(decksPath)) {
			const stat = await adapter.stat(decksPath);
			if (stat?.mtime) {
				return new Date(stat.mtime).toISOString();
			}
		}

		return null;
	}

	private async loadMetadataFromPath(backupPath: string): Promise<BackupInfo | null> {
		const adapter = this.getAdapter();
		const metadataPath = `${backupPath}/${BACKUP_INFO_FILE}`;

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

	private async loadSlotBackupInfo(slot: BackupUserSlot): Promise<BackupInfo | null> {
		const slotPath = this.getSlotPath(slot);
		const adapter = this.getAdapter();

		if (!(await adapter.exists(slotPath))) {
			return null;
		}

		const hasDecks = await adapter.exists(`${slotPath}/decks.json`);
		const hasCards = await adapter.exists(`${slotPath}/cards.json`);
		if (!hasDecks && !hasCards) {
			return null;
		}

		const metadata = await this.loadMetadataFromPath(slotPath);
		if (metadata) {
			metadata.size = await this.calculateDirectorySize(slotPath);
			const validation = await this.validateBackup(slot);
			metadata.isValid = validation.passed;
			return metadata;
		}

		const validation = await this.validateBackup(slot);
		const timestamp =
			(await this.readBackupTimestamp(slotPath, adapter)) ?? new Date().toISOString();
		return {
			id: slot,
			timestamp,
			type: backupTypeFromSlot(slot),
			size: await this.calculateDirectorySize(slotPath),
			path: slotPath,
			isValid: validation.passed,
			dataTypes: [DataType.DECKS, DataType.CARDS, DataType.PROFILE],
			description: slot === BACKUP_SLOT_AUTO ? "自动备份" : "手动备份",
		};
	}

	private async deleteRecursively(path: string): Promise<void> {
		const adapter = this.getAdapter();
		const listing = await adapter.list(path);

		for (const file of listing.files || []) {
			await adapter.remove(file);
		}

		for (const folder of listing.folders || []) {
			await this.deleteRecursively(folder);
		}

		await adapter.rmdir(path, false);
	}
}

/** 插件内共享的 Weave 双槽位备份服务（按 App 单例） */
export function getWeaveBackupService(plugin: Plugin): WeaveBackupService {
	const existing = weaveBackupServiceInstances.get(plugin.app);
	if (existing) {
		return existing;
	}

	const service = new WeaveBackupService(plugin);
	weaveBackupServiceInstances.set(plugin.app, service);
	return service;
}

/** 已填充的用户备份槽位数量（0–2） */
export async function countFilledBackupSlots(plugin: Plugin): Promise<number> {
	const service = getWeaveBackupService(plugin);
	const backups = await service.listBackups();
	return backups.length;
}

/** 插件启动时清理旧时间戳备份并确保双槽位目录结构 */
export async function runWeaveBackupMaintenance(plugin: Plugin): Promise<LegacyBackupCleanupResult> {
	const service = getWeaveBackupService(plugin);
	return service.cleanupLegacyTimestampBackups();
}

export async function createAutoDataBackup(plugin: Plugin): Promise<string> {
	const service = getWeaveBackupService(plugin);
	const info = await service.createBackup({
		type: "auto",
		trigger: BackupOptionTrigger.AUTO_IMPORT,
		reason: "自动备份",
	});
	return info.path;
}
