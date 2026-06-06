/**
 * Schema V2 数据迁移服务
 *
 * 基于文件内容检测的安全数据迁移，将 V1.x 数据结构迁移到 V2 规范化结构。
 *
 * 迁移流程：
 * 1. 检查 .schema-version 文件判断是否需要迁移
 * 2. 扫描 weave/ 目录，基于文件内容识别数据类型
 * 3. 创建迁移前备份
 * 4. 按数据类型移动文件到新路径
 * 5. 写入 .schema-version 标记迁移完成
 *
 * @module services/data-migration/SchemaV2MigrationService
 */

import { App, Notice } from "obsidian";
import { SCHEMA_VERSION, WEAVE_DATA, getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import { logger } from "../../utils/logger";
import {
	getVaultAdapterWithDirOps,
	listVaultDirectory,
	type VaultAdapterWithDirOps,
} from "../../utils/plugin-runtime";
import { isRecord, parseJsonUnknown } from "../../utils/typed-json";
import { DataFileType, FileDetectionResult, FileTypeDetector } from "./FileTypeDetector";

/**
 * 迁移项
 */
export interface MigrationItem {
	source: string;
	target: string;
	type: DataFileType;
	action: "move" | "merge" | "copy";
}

/**
 * 迁移状态
 */
export interface MigrationState {
	version: string;
	startedAt: string;
	completedAt?: string;
	status: "pending" | "in-progress" | "completed" | "failed";
	completedItems: string[];
	failedItems: Array<{ path: string; error: string }>;
	backupPath?: string;
}

/**
 * 迁移结果
 */
export interface MigrationResult {
	success: boolean;
	migratedCount: number;
	failedCount: number;
	skippedCount: number;
	errors: string[];
}

/**
 * Schema V2 迁移服务
 */
export class SchemaV2MigrationService {
	private app: App;
	private detector: FileTypeDetector;
	private v2Paths = getV2PathsFromApp(undefined);

	constructor(app: App) {
		this.app = app;
		this.detector = new FileTypeDetector(app);
		this.v2Paths = getV2PathsFromApp(app);
	}

	private getLegacyRootJsonCandidates(): string[] {
		return ["cards.json", "questions.json", "banks.json", "decks.json"];
	}

	private normalizeSchemaVersion(raw: string): string {
		const trimmed = raw.trim();
		if (!trimmed) return trimmed;

		try {
			const parsed = parseJsonUnknown(trimmed);
			if (typeof parsed === "string") {
				return parsed.trim();
			}
			if (isRecord(parsed) && typeof parsed.version === "string") {
				return parsed.version.trim();
			}
		} catch {
			// 兼容旧版纯文本格式
		}

		return trimmed;
	}

	/**
	 * 检查是否需要迁移
	 */
	async needsMigration(options?: { allowWhenSchemaUpToDate?: boolean }): Promise<boolean> {
		const adapter = this.app.vault.adapter;

		// 兼容旧版无扩展名的 schema-version 文件，自动迁移到 schema-version.json
		const schemaVersionPath = this.v2Paths.schemaVersion;
		const legacySchemaVersionPath = schemaVersionPath.replace(/\.json$/, "");
		if (
			legacySchemaVersionPath !== schemaVersionPath &&
			(await adapter.exists(legacySchemaVersionPath))
		) {
			try {
				const content = await adapter.read(legacySchemaVersionPath);
				if (!(await adapter.exists(schemaVersionPath))) {
					await adapter.write(schemaVersionPath, content);
				}
				await adapter.remove(legacySchemaVersionPath);
				logger.info("[Migration] 旧 schema-version 文件已迁移为 schema-version.json");
			} catch (error) {
				logger.warn("[Migration] 迁移旧 schema-version 文件失败", error);
			}
		}

		if (await adapter.exists(schemaVersionPath)) {
			try {
				const content = await adapter.read(schemaVersionPath);
				const version = this.normalizeSchemaVersion(content);
				if (this.compareVersions(version, SCHEMA_VERSION) >= 0) {
					const hasLegacyData = await this.hasLegacyData();
					if (!hasLegacyData) {
						logger.info(
							`[Migration] Schema版本 ${version} >= ${SCHEMA_VERSION}，且无旧数据，无需迁移`
						);
						return false;
					}
					if (options?.allowWhenSchemaUpToDate) {
						logger.info(
							`[Migration] Schema版本已是最新 (${version})，但仍检测到旧数据，需要迁移/清理`
						);
						return true;
					}

					logger.warn(
						`[Migration] Schema版本已是最新 (${version})，但仍检测到旧数据；为避免启动时重复迁移，将跳过自动迁移。请在数据管理中手动触发迁移/清理。`
					);
					return false;
				}
			} catch (error) {
				logger.warn("[Migration] 读取schema-version失败", error);
			}
		}

		// 检查是否存在旧路径数据
		const hasLegacyData = await this.hasLegacyData();
		if (!hasLegacyData) {
			// 没有旧数据，可能是全新安装，直接写入版本号
			logger.info("[Migration] 未检测到旧版本数据，标记为新安装");
			await this.writeSchemaVersion();
			return false;
		}

		logger.info("[Migration] 检测到旧版本数据，需要迁移");
		return true;
	}

	/**
	 * 检查是否存在需要迁移的数据
	 * 通过扫描 weave/ 目录下的文件并检测内容类型来判断
	 */
	private async hasLegacyData(): Promise<boolean> {
		const adapter = this.app.vault.adapter;

		// 检查旧版本可能存在的目录
		const legacyDirs = [
			`${WEAVE_DATA}/flashcards`,
			`${WEAVE_DATA}/decks`,
			`${WEAVE_DATA}/cards`,
			`${WEAVE_DATA}/profile`,
			`${WEAVE_DATA}/_shared`,
			`${WEAVE_DATA}/indices`,
			`${WEAVE_DATA}/learning`,
			`${WEAVE_DATA}/reading-materials`,
		];

		for (const dir of legacyDirs) {
			if (!(await adapter.exists(dir))) continue;
			if (await this.isNonEmptyDirectory(dir)) {
				return true;
			}
		}

		for (const filePath of this.getLegacyRootJsonCandidates()) {
			try {
				if (await adapter.exists(filePath)) return true;
			} catch { /* no-op */ }
		}

		return false;
	}

	private getVaultAdapter(): VaultAdapterWithDirOps {
		return getVaultAdapterWithDirOps(this.app.vault.adapter);
	}

	private async isNonEmptyDirectory(path: string): Promise<boolean> {
		const adapter = this.getVaultAdapter();
		if (!adapter.list) {
			return true;
		}

		const check = async (dir: string, depth: number): Promise<boolean> => {
			if (depth <= 0) return false;

			const listing = await listVaultDirectory(adapter, dir);
			if (!listing) {
				return true;
			}

			if (listing.files.length > 0) return true;

			for (const folder of listing.folders) {
				if (await check(folder, depth - 1)) return true;
			}

			return false;
		};

		return check(path, 5);
	}

	/**
	 * 执行迁移
	 */
	async migrate(): Promise<MigrationResult> {
		const result: MigrationResult = {
			success: false,
			migratedCount: 0,
			failedCount: 0,
			skippedCount: 0,
			errors: [],
		};

		try {
			logger.info("[Migration] ========== 开始 Schema V2 迁移 ==========");

			// 1. 创建迁移状态
			const state = await this.initMigrationState();

			// 2. 创建备份
			new Notice("Weave: 正在创建迁移前备份...");
			const backupPath = await this.createBackup();
			state.backupPath = backupPath;
			await this.saveMigrationState(state);

			// 3. 扫描并检测文件类型
			new Notice("Weave: 正在扫描数据文件...");
			const detectionResults = await this.detector.detectDirectory(WEAVE_DATA);

			for (const candidate of this.getLegacyRootJsonCandidates()) {
				try {
					const exists = await this.app.vault.adapter.exists(candidate);
					if (!exists) continue;
					const detected = await this.detector.detectFileType(candidate);
					detectionResults.push(detected);
				} catch { /* no-op */ }
			}
			logger.info(`[Migration] 扫描到 ${detectionResults.length} 个JSON文件`);

			// 4. 生成迁移计划
			const migrationItems = this.generateMigrationPlan(detectionResults);
			logger.info(`[Migration] 生成 ${migrationItems.length} 个迁移任务`);

			// 5. 确保目标目录存在
			await this.ensureDirectories();

			// 6. 执行迁移
			new Notice("Weave: 正在迁移数据...");
			state.status = "in-progress";
			await this.saveMigrationState(state);

			for (const item of migrationItems) {
				try {
					await this.executeMigrationItem(item);
					state.completedItems.push(item.source);
					result.migratedCount++;
					logger.debug(`[Migration] ✅ ${item.source} -> ${item.target}`);
				} catch (error) {
					const errorMsg = String(error);
					state.failedItems.push({ path: item.source, error: errorMsg });
					result.failedCount++;
					result.errors.push(`${item.source}: ${errorMsg}`);
					logger.error(`[Migration] ❌ ${item.source}`, error);
				}
			}

			// 7. 迁移目录（整体移动）
			await this.migrateDirectories();

			// 8. 写入版本标记
			await this.writeSchemaVersion();

			// 9. 更新迁移状态
			state.status = "completed";
			state.completedAt = new Date().toISOString();
			await this.saveMigrationState(state);

			result.success = result.failedCount === 0;

			logger.info("[Migration] ========== 迁移完成 ==========");
			logger.info(`[Migration] 成功: ${result.migratedCount}, 失败: ${result.failedCount}`);

			new Notice(`Weave: 数据迁移完成！成功 ${result.migratedCount} 项`);
		} catch (error) {
			logger.error("[Migration] 迁移过程发生错误", error);
			result.errors.push(String(error));
			new Notice("Weave: 数据迁移失败，请查看控制台日志");
		}

		return result;
	}

	/**
	 * 生成迁移计划
	 * 使用 FileTypeDetector 返回的 targetPath 字段
	 */
	private generateMigrationPlan(detections: FileDetectionResult[]): MigrationItem[] {
		const items: MigrationItem[] = [];

		for (const detection of detections) {
			// 跳过未知类型或无目标路径的文件
			if (detection.type === "unknown" || !detection.targetPath) {
				continue;
			}

			// 跳过已在正确位置的文件
			if (detection.path === detection.targetPath) {
				continue;
			}

			// 跳过已存在于目标路径的文件（避免覆盖）
			// 这会在 executeMigrationItem 中再次检查

			items.push({
				source: detection.path,
				target: detection.targetPath,
				type: detection.type,
				action: "move",
			});
		}

		return items;
	}

	/**
	 * 执行单个迁移项
	 */
	private async executeMigrationItem(item: MigrationItem): Promise<void> {
		const adapter = this.app.vault.adapter;

		// 确保源文件存在
		if (!(await adapter.exists(item.source))) {
			throw new Error(`源文件不存在: ${item.source}`);
		}

		// 确保目标目录存在
		const targetDir = item.target.substring(0, item.target.lastIndexOf("/"));
		await this.ensureDir(targetDir);

		// 读取源文件内容
		const content = await adapter.read(item.source);

		if (await adapter.exists(item.target)) {
			try {
				const existing = await adapter.read(item.target);
				if (existing === content) {
					try {
						await adapter.remove(item.source);
					} catch (error) {
						logger.warn(`[Migration] 删除源文件失败（可能被占用，可忽略）: ${item.source}`, error);
					}
					return;
				}
			} catch { /* no-op */ }

			const conflictDir = `${getPluginPaths(this.app).migration.root}/conflicts`;
			await this.ensureDir(conflictDir);
			const safeName = item.source.replace(/[\\/:]/g, "_");
			const conflictPath = `${conflictDir}/${safeName}-${Date.now()}.json`;
			await adapter.write(conflictPath, content);
			logger.warn(`[Migration] 目标已存在，已保存冲突副本: ${conflictPath}`);

			try {
				await adapter.remove(item.source);
			} catch (error) {
				logger.warn(`[Migration] 删除源文件失败（可能被占用，可忽略）: ${item.source}`, error);
			}
			return;
		}

		// 写入目标位置
		await adapter.write(item.target, content);

		// 写入成功后删除源文件，确保旧目录可被清理
		try {
			await adapter.remove(item.source);
		} catch (error) {
			logger.warn(`[Migration] 删除源文件失败（可能被占用，可忽略）: ${item.source}`, error);
		}
		logger.info(`[Migration] 迁移: ${item.source} -> ${item.target}`);
	}

	/**
	 * 迁移整个目录并清理旧目录
	 */
	private async migrateDirectories(): Promise<void> {
		const adapter = this.app.vault.adapter;

		// legacy reading-materials -> V2 incremental-reading/materials
		const legacyReadingMaterials = `${WEAVE_DATA}/reading-materials`;
		if (await adapter.exists(legacyReadingMaterials)) {
			await this.moveDirectory(legacyReadingMaterials, `${WEAVE_DATA}/IR`);
			logger.info("[Migration] reading-materials 目录迁移完成");
		}

		// 清理旧目录
		await this.cleanupLegacyDirectories();
	}

	/**
	 * 清理旧目录（迁移完成后删除空目录）
	 */
	private async cleanupLegacyDirectories(): Promise<void> {
		const adapter = this.getVaultAdapter();

		// 需要删除的旧目录（按深度从深到浅删除）
		const legacyDirs = [
			`${WEAVE_DATA}/flashcards/decks`,
			`${WEAVE_DATA}/flashcards/cards`,
			`${WEAVE_DATA}/flashcards/learning/sessions`,
			`${WEAVE_DATA}/flashcards/learning`,
			`${WEAVE_DATA}/flashcards`,
			`${WEAVE_DATA}/decks`,
			`${WEAVE_DATA}/cards`,
			`${WEAVE_DATA}/profile`,
			`${WEAVE_DATA}/_shared/profile`,
			`${WEAVE_DATA}/_shared`,
			`${WEAVE_DATA}/indices`,
			`${WEAVE_DATA}/learning/sessions`,
			`${WEAVE_DATA}/learning`,
			`${WEAVE_DATA}/temp`,
		];

		const deepRemove = async (path: string): Promise<void> => {
			if (!(await adapter.exists(path))) return;

			const listing = await listVaultDirectory(adapter, path);

			for (const folder of listing?.folders ?? []) {
				await deepRemove(folder);
			}

			for (const file of listing?.files ?? []) {
				try {
					await adapter.remove(file);
				} catch (error) {
					logger.debug(`[Migration] 删除文件失败（可忽略）: ${file}`, error);
				}
			}

			try {
				if (adapter.rmdir) {
					await adapter.rmdir(path, false);
				} else {
					await adapter.remove(path);
				}
			} catch (error) {
				logger.debug(`[Migration] 删除目录失败（可忽略）: ${path}`, error);
			}
		};

		for (const dir of legacyDirs) {
			try {
				if (await adapter.exists(dir)) {
					await deepRemove(dir);
					logger.info(`[Migration] 删除旧目录: ${dir}`);
				}
			} catch (error) {
				logger.debug(`[Migration] 清理目录失败（可忽略）: ${dir}`, error);
			}
		}
	}

	/**
	 * 复制目录
	 */
	private async copyDirectory(source: string, target: string): Promise<void> {
		const adapter = this.getVaultAdapter();

		if (!(await adapter.exists(source))) {
			return;
		}

		await this.ensureDir(target);

		const listing = await listVaultDirectory(adapter, source);
		if (!listing) {
			return;
		}

		for (const file of listing.files) {
			const fileName = file.split("/").pop() ?? file;
			const targetFilePath = `${target}/${fileName}`;
			if (await adapter.exists(targetFilePath)) {
				continue;
			}
			const content = await adapter.read(file);
			await adapter.write(targetFilePath, content);
		}

		for (const folder of listing.folders) {
			const folderName = folder.split("/").pop() ?? folder;
			await this.copyDirectory(folder, `${target}/${folderName}`);
		}
	}

	/**
	 * 移动目录（先复制内容到目标，再删除源文件）
	 * 说明：Obsidian adapter 没有跨目录 rename 的统一保证，这里用 copy + remove 实现 move 语义。
	 */
	private async moveDirectory(source: string, target: string): Promise<void> {
		const adapter = this.getVaultAdapter();

		if (!(await adapter.exists(source))) {
			return;
		}

		await this.ensureDir(target);

		const listing = await listVaultDirectory(adapter, source);
		if (!listing) {
			return;
		}

		for (const folder of listing.folders) {
			const folderName = folder.split("/").pop() ?? folder;
			await this.moveDirectory(folder, `${target}/${folderName}`);
		}

		for (const file of listing.files) {
			const fileName = file.split("/").pop() ?? file;
			const targetFilePath = `${target}/${fileName}`;
			if (await adapter.exists(targetFilePath)) {
				continue;
			}
			const content = await adapter.read(file);
			await adapter.write(targetFilePath, content);
			try {
				await adapter.remove(file);
			} catch (error) {
				logger.warn(`[Migration] 删除源文件失败（可忽略）: ${file}`, error);
			}
		}

		try {
			const listingAfter = await listVaultDirectory(adapter, source);
			if (listingAfter && listingAfter.files.length === 0 && listingAfter.folders.length === 0) {
				if (adapter.rmdir) {
					await adapter.rmdir(source, false);
				}
			}
		} catch { /* no-op */ }
	}

	/**
	 * 确保所有目标目录存在
	 */
	private async ensureDirectories(): Promise<void> {
		const pluginPaths = getPluginPaths(this.app);
		const dirs = [
			// Vault 数据目录
			this.v2Paths.memory.root,
			this.v2Paths.memory.learning.root,
			this.v2Paths.memory.learning.sessions,
			this.v2Paths.memory.media,
			this.v2Paths.ir.root,
			this.v2Paths.ir.materials.root,
			this.v2Paths.ir.materials.sessions,
			this.v2Paths.questionBank.root,
			this.v2Paths.questionBank.banksDir,
			// 插件目录
			pluginPaths.indices.root,
			pluginPaths.cache.root,
			pluginPaths.backups,
			pluginPaths.migration.root,
		];

		for (const dir of dirs) {
			await this.ensureDir(dir);
		}
	}

	/**
	 * 确保目录存在
	 */
	private async ensureDir(dir: string): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(dir))) {
			// 适配器的 mkdir 可能不支持多级目录，使用递归创建
			const { DirectoryUtils } = await import("../../utils/directory-utils");
			await DirectoryUtils.ensureDirRecursive(adapter, dir);
		}
	}

	/**
	 * 创建迁移前备份
	 */
	private async createBackup(): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupPath = `${getPluginPaths(this.app).backups}/pre-v2-${timestamp}`;

		await this.ensureDir(backupPath);
		await this.copyDirectory(WEAVE_DATA, backupPath);

		const adapter = this.app.vault.adapter;
		const rootBackupDir = `${backupPath}/_vault_root`;
		await this.ensureDir(rootBackupDir);
		for (const candidate of this.getLegacyRootJsonCandidates()) {
			try {
				if (!(await adapter.exists(candidate))) continue;
				const content = await adapter.read(candidate);
				await adapter.write(`${rootBackupDir}/${candidate}`, content);
			} catch { /* no-op */ }
		}

		logger.info(`[Migration] 备份创建完成: ${backupPath}`);
		return backupPath;
	}

	/**
	 * 初始化迁移状态
	 */
	private async initMigrationState(): Promise<MigrationState> {
		const state: MigrationState = {
			version: SCHEMA_VERSION,
			startedAt: new Date().toISOString(),
			status: "pending",
			completedItems: [],
			failedItems: [],
		};

		await this.saveMigrationState(state);
		return state;
	}

	/**
	 * 保存迁移状态
	 */
	private async saveMigrationState(state: MigrationState): Promise<void> {
		const adapter = this.app.vault.adapter;
		const pluginPaths = getPluginPaths(this.app);
		await this.ensureDir(pluginPaths.migration.root);
		await adapter.write(pluginPaths.migration.state, JSON.stringify(state, null, 2));
	}

	/**
	 * 写入 Schema 版本标记
	 */
	private async writeSchemaVersion(): Promise<void> {
		const adapter = this.app.vault.adapter;
		await this.ensureDir(this.v2Paths.root);
		await adapter.write(this.v2Paths.schemaVersion, JSON.stringify(SCHEMA_VERSION));
		logger.info(`[Migration] Schema版本标记写入: ${SCHEMA_VERSION}`);
	}

	/**
	 * 比较版本号
	 * @returns -1: a < b, 0: a == b, 1: a > b
	 */
	private compareVersions(a: string, b: string): number {
		const partsA = a.split(".").map(Number);
		const partsB = b.split(".").map(Number);

		for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
			const numA = partsA[i] || 0;
			const numB = partsB[i] || 0;
			if (numA < numB) return -1;
			if (numA > numB) return 1;
		}

		return 0;
	}
}
