/**
 * 阅读材料兼容存储服务
 *
 * 当前正式增量阅读真源已经切到 point-only 结构。
 * 这个服务只保留给旧阅读材料管理链路做兼容运行时状态，
 * 并将状态写入插件本地单文件，不再污染 vault 中的同步目录。
 *
 * @module services/incremental-reading/ReadingMaterialStorage
 * @version 2.0.0
 */

import type { App } from "obsidian";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import type {
	AnchorRecord,
	AnchorsCache,
	ReadingMaterial,
	ReadingMaterialsIndex,
	ReadingSession,
} from "../../types/incremental-reading-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import {
	getReadingMaterialDueAt,
	normalizeReadingMaterialForRuntime,
	serializeReadingMaterialForStorage,
} from "../../utils/ir-topic-compat";
import { logger } from "../../utils/logger";
import { remapAssociatedNotePaths, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";

type ReadingMaterialRuntimeStore = {
	version: string;
	lastUpdated: string;
	materials: Record<string, ReadingMaterial>;
	sessionsByMaterial: Record<string, ReadingSession[]>;
};

function createEmptyRuntimeStore(): ReadingMaterialRuntimeStore {
	return {
		version: "2.0.0",
		lastUpdated: new Date(0).toISOString(),
		materials: {},
		sessionsByMaterial: {},
	};
}

/**
 * 阅读材料存储服务
 */
export class ReadingMaterialStorage {
	private app: App;
	private materialsCache: Map<string, ReadingMaterial> = new Map();
	private sessionsCache: Map<string, ReadingSession[]> = new Map();
	private initialized = false;

	private get storagePaths() {
		const v2Paths = getV2PathsFromApp(this.app);
		const pluginPaths = getPluginPaths(this.app);
		return {
			RUNTIME_STATE: pluginPaths.state.incrementalReading.readingMaterialsRuntime,
			PLUGIN_STATE_ROOT: pluginPaths.state.root,
			PLUGIN_IR_STATE_ROOT: pluginPaths.state.incrementalReading.root,
			ANCHORS_CACHE: pluginPaths.cache.anchors,
			CACHE_ROOT: pluginPaths.cache.root,
			LEGACY_MATERIALS_INDEX: v2Paths.ir.materials.index,
			LEGACY_SESSIONS_DIR: v2Paths.ir.materials.sessions,
		} as const;
	}

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 初始化存储
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			logger.info("[ReadingMaterialStorage] 初始化存储...");

			// 仅确保插件本地状态目录存在，不再创建旧 vault materials 目录
			await this.ensureDirectories();

			// 加载插件本地兼容运行时状态
			await this.loadRuntimeStore();

			this.initialized = true;
			logger.info("[ReadingMaterialStorage] 存储初始化完成");
		} catch (error) {
			logger.error("[ReadingMaterialStorage] 初始化失败:", error);
			throw error;
		}
	}

	/**
	 * 确保存储目录存在
	 */
	private async ensureDirectories(): Promise<void> {
		const adapter = this.app.vault.adapter;

		const storagePaths = this.storagePaths;

		const directories = [
			storagePaths.PLUGIN_STATE_ROOT,
			storagePaths.PLUGIN_IR_STATE_ROOT,
			storagePaths.CACHE_ROOT,
		];

		for (const dir of directories) {
			try {
				await DirectoryUtils.ensureDirRecursive(adapter, dir);
				logger.debug(`[ReadingMaterialStorage] 目录已确保存在: ${dir}`);
			} catch (error) {
				logger.warn(`[ReadingMaterialStorage] 创建目录失败: ${dir}`, error);
			}
		}
	}

	/**
	 * 加载插件本地兼容运行时状态
	 */
	private async loadRuntimeStore(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const storagePaths = this.storagePaths;

		try {
			const exists = await adapter.exists(storagePaths.RUNTIME_STATE);

			if (exists) {
				const content = await adapter.read(storagePaths.RUNTIME_STATE);
				this.applyRuntimeStore(JSON.parse(content));
				logger.info(
					`[ReadingMaterialStorage] 已从插件本地状态加载 ${this.materialsCache.size} 个阅读材料`
				);
				return;
			}

			const legacyStore = await this.loadLegacyRuntimeStore();
			this.applyRuntimeStore(legacyStore);

			if (this.materialsCache.size > 0 || this.sessionsCache.size > 0) {
				await this.saveRuntimeStore();
				logger.info(
					`[ReadingMaterialStorage] 已将旧材料兼容状态迁入插件本地单文件: ${storagePaths.RUNTIME_STATE}`
				);
				return;
			}

			logger.info("[ReadingMaterialStorage] 未检测到兼容材料状态，已使用空运行时缓存");
		} catch (error) {
			logger.error("[ReadingMaterialStorage] 加载兼容运行时状态失败:", error);
			this.materialsCache.clear();
			this.sessionsCache.clear();
		}
	}

	/**
	 * 从旧 vault materials.json / sessions 目录导入兼容状态
	 */
	private async loadLegacyRuntimeStore(): Promise<ReadingMaterialRuntimeStore> {
		const adapter = this.app.vault.adapter;
		const storagePaths = this.storagePaths;
		const store = createEmptyRuntimeStore();

		try {
			if (await adapter.exists(storagePaths.LEGACY_MATERIALS_INDEX)) {
				const content = await adapter.read(storagePaths.LEGACY_MATERIALS_INDEX);
				const index: ReadingMaterialsIndex = JSON.parse(content);
				for (const [uuid, material] of Object.entries(index.materials || {})) {
					store.materials[uuid] = normalizeReadingMaterialForRuntime(material);
				}
			}

			if (await adapter.exists(storagePaths.LEGACY_SESSIONS_DIR)) {
				const listing = await adapter.list(storagePaths.LEGACY_SESSIONS_DIR);
				for (const filePath of listing.files || []) {
					if (!filePath.toLowerCase().endsWith(".json")) {
						continue;
					}

					try {
						const content = await adapter.read(filePath);
						const parsed = JSON.parse(content) as { sessions?: ReadingSession[] };
						const fileName = filePath.split("/").pop() || "";
						const materialId = fileName.replace(/\.json$/i, "").trim();
						if (!materialId) {
							continue;
						}
						store.sessionsByMaterial[materialId] = Array.isArray(parsed.sessions)
							? parsed.sessions
							: [];
					} catch (error) {
						logger.warn(`[ReadingMaterialStorage] 导入旧会话文件失败: ${filePath}`, error);
					}
				}
			}
		} catch (error) {
			logger.warn("[ReadingMaterialStorage] 导入旧 vault 兼容状态失败，将退回空缓存", error);
		}

		return store;
	}

	private applyRuntimeStore(raw: unknown): void {
		const store = this.normalizeRuntimeStore(raw);
		this.materialsCache.clear();
		for (const [uuid, material] of Object.entries(store.materials)) {
			this.materialsCache.set(uuid, normalizeReadingMaterialForRuntime(material));
		}

		this.sessionsCache.clear();
		for (const [materialId, sessions] of Object.entries(store.sessionsByMaterial)) {
			this.sessionsCache.set(materialId, Array.isArray(sessions) ? sessions : []);
		}
	}

	private normalizeRuntimeStore(raw: unknown): ReadingMaterialRuntimeStore {
		if (!raw || typeof raw !== "object") {
			return createEmptyRuntimeStore();
		}

		const candidate = raw as Partial<ReadingMaterialRuntimeStore>;
		return {
			version:
				typeof candidate.version === "string" && candidate.version.trim()
					? candidate.version
					: "2.0.0",
			lastUpdated:
				typeof candidate.lastUpdated === "string" && candidate.lastUpdated.trim()
					? candidate.lastUpdated
					: new Date().toISOString(),
			materials:
				candidate.materials && typeof candidate.materials === "object"
					? (candidate.materials as Record<string, ReadingMaterial>)
					: {},
			sessionsByMaterial:
				candidate.sessionsByMaterial && typeof candidate.sessionsByMaterial === "object"
					? (candidate.sessionsByMaterial as Record<string, ReadingSession[]>)
					: {},
		};
	}

	/**
	 * 保存插件本地兼容运行时状态
	 */
	private async saveRuntimeStore(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const store: ReadingMaterialRuntimeStore = {
			version: "2.0.0",
			lastUpdated: new Date().toISOString(),
			materials: Object.fromEntries(
				Array.from(this.materialsCache.entries()).map(([uuid, material]) => [
					uuid,
					serializeReadingMaterialForStorage(material),
				])
			),
			sessionsByMaterial: Object.fromEntries(this.sessionsCache.entries()),
		};

		try {
			await adapter.write(this.storagePaths.RUNTIME_STATE, JSON.stringify(store));
			logger.debug("[ReadingMaterialStorage] 插件本地兼容状态已保存");
		} catch (error) {
			logger.error("[ReadingMaterialStorage] 保存插件本地兼容状态失败:", error);
			throw error;
		}
	}

	// ===== 材料 CRUD 操作 =====

	/**
	 * 获取所有阅读材料
	 */
	getAllMaterials(): ReadingMaterial[] {
		return Array.from(this.materialsCache.values());
	}

	/**
	 * 通过UUID获取阅读材料
	 */
	getMaterialById(uuid: string): ReadingMaterial | null {
		return this.materialsCache.get(uuid) || null;
	}

	/**
	 * 通过文件路径获取阅读材料
	 */
	getMaterialByPath(filePath: string): ReadingMaterial | null {
		for (const material of this.materialsCache.values()) {
			if (material.filePath === filePath) {
				return material;
			}
		}
		return null;
	}

	/**
	 * 保存阅读材料
	 */
	async saveMaterial(material: ReadingMaterial): Promise<void> {
		material.modified = new Date().toISOString();
		this.materialsCache.set(material.uuid, normalizeReadingMaterialForRuntime(material));
		await this.saveRuntimeStore();
		logger.debug(`[ReadingMaterialStorage] 保存材料: ${material.uuid}`);
	}

	/**
	 * 删除阅读材料
	 */
	async deleteMaterial(uuid: string): Promise<boolean> {
		const deleted = this.materialsCache.delete(uuid);
		if (deleted) {
			this.sessionsCache.delete(uuid);
			await this.saveRuntimeStore();
			logger.debug(`[ReadingMaterialStorage] 删除材料: ${uuid}`);
		}
		return deleted;
	}

	/**
	 * 批量保存阅读材料
	 */
	async saveMaterials(materials: ReadingMaterial[]): Promise<void> {
		const now = new Date().toISOString();
		for (const material of materials) {
			material.modified = now;
			this.materialsCache.set(material.uuid, normalizeReadingMaterialForRuntime(material));
		}
		await this.saveRuntimeStore();
		logger.debug(`[ReadingMaterialStorage] 批量保存 ${materials.length} 个材料`);
	}

	async remapAssociatedNoteFileReferences(oldPath: string, newPath: string): Promise<number> {
		const updates: ReadingMaterial[] = [];

		for (const material of this.materialsCache.values()) {
			const currentPaths = resolveAssociatedNotePaths({
				associatedNotePath: material.primaryAssociatedNotePath || material.associatedNotePath,
				associatedNotePaths: material.associatedNotePaths,
			});
			if (currentPaths.length === 0) {
				continue;
			}

			const nextPaths = remapAssociatedNotePaths(currentPaths, oldPath, newPath);
			if (
				nextPaths.length === currentPaths.length &&
				nextPaths.every((path, index) => path === currentPaths[index])
			) {
				continue;
			}

			updates.push({
				...material,
				primaryAssociatedNotePath: nextPaths[0] || undefined,
				associatedNotePath: nextPaths[0] || undefined,
				associatedNotePaths: nextPaths,
			});
		}

		if (updates.length === 0) {
			return 0;
		}

		await this.saveMaterials(updates);
		logger.debug(
			`[ReadingMaterialStorage] 已重映射 ${updates.length} 个材料的关联笔记路径: ${oldPath} -> ${newPath}`
		);
		return updates.length;
	}

	// ===== 会话记录操作 =====

	/**
	 * 获取材料的所有会话记录
	 */
	async getSessionsForMaterial(materialId: string): Promise<ReadingSession[]> {
		return [...(this.sessionsCache.get(materialId) || [])];
	}

	/**
	 * 保存会话记录
	 */
	async saveSession(session: ReadingSession): Promise<void> {
		const sessions = [...(this.sessionsCache.get(session.materialId) || [])];
		const existingIndex = sessions.findIndex((item) => item.uuid === session.uuid);
		if (existingIndex >= 0) {
			sessions[existingIndex] = session;
		} else {
			sessions.push(session);
		}

		this.sessionsCache.set(session.materialId, sessions);
		await this.saveRuntimeStore();
		logger.debug(`[ReadingMaterialStorage] 保存会话: ${session.uuid}`);
	}

	// ===== 锚点缓存操作（可选优化）=====

	/**
	 * 获取锚点缓存
	 */
	async getAnchorsCache(): Promise<AnchorsCache | null> {
		const adapter = this.app.vault.adapter;

		try {
			const exists = await adapter.exists(this.storagePaths.ANCHORS_CACHE);
			if (!exists) {
				return null;
			}

			const content = await adapter.read(this.storagePaths.ANCHORS_CACHE);
			return JSON.parse(content);
		} catch (error) {
			logger.warn("[ReadingMaterialStorage] 加载锚点缓存失败:", error);
			return null;
		}
	}

	/**
	 * 更新锚点缓存
	 */
	async updateAnchorsCache(filePath: string, anchors: AnchorRecord[]): Promise<void> {
		const adapter = this.app.vault.adapter;

		try {
			let cache = await this.getAnchorsCache();
			if (!cache) {
				cache = {
					version: "1.0.0",
					lastUpdated: new Date().toISOString(),
					anchors: {},
				};
			}

			cache.anchors[filePath] = anchors;
			cache.lastUpdated = new Date().toISOString();

			await adapter.write(this.storagePaths.ANCHORS_CACHE, JSON.stringify(cache));
		} catch (error) {
			logger.warn("[ReadingMaterialStorage] 更新锚点缓存失败:", error);
		}
	}

	/**
	 * 获取文件的缓存锚点
	 */
	async getCachedAnchors(filePath: string): Promise<AnchorRecord[] | null> {
		const cache = await this.getAnchorsCache();
		return cache?.anchors[filePath] || null;
	}

	/**
	 * 清除锚点缓存
	 */
	async clearAnchorsCache(): Promise<void> {
		const adapter = this.app.vault.adapter;

		try {
			const exists = await adapter.exists(this.storagePaths.ANCHORS_CACHE);
			if (exists) {
				await adapter.remove(this.storagePaths.ANCHORS_CACHE);
				logger.debug("[ReadingMaterialStorage] 锚点缓存已清除");
			}
		} catch (error) {
			logger.warn("[ReadingMaterialStorage] 清除锚点缓存失败:", error);
		}
	}

	// ===== 查询方法 =====

	/**
	 * 按分类获取材料
	 */
	getMaterialsByCategory(category: string): ReadingMaterial[] {
		return Array.from(this.materialsCache.values()).filter((m) => m.category === category);
	}

	/**
	 * 获取今日到期的材料
	 */
	getTodayDueMaterials(): ReadingMaterial[] {
		const today = new Date();
		today.setHours(23, 59, 59, 999);

		return Array.from(this.materialsCache.values())
			.filter((_m) => {
				const dueAt = getReadingMaterialDueAt(_m);
				if (!dueAt) return false;
				const dueDate = new Date(dueAt);
				return dueDate <= today;
			})
			.sort((a, b) => {
				// 按优先级排序
				return (b.priority || 0) - (a.priority || 0);
			});
	}

	/**
	 * 获取指定日期范围的材料
	 */
	async getMaterialsInDateRange(startDate: Date, endDate: Date): Promise<ReadingMaterial[]> {
		return Array.from(this.materialsCache.values()).filter((_m) => {
			const dueAt = getReadingMaterialDueAt(_m);
			if (!dueAt) return false;
			const dueDate = new Date(dueAt);
			return dueDate >= startDate && dueDate <= endDate;
		});
	}

	/**
	 * 获取最近访问的材料
	 */
	getRecentMaterials(limit = 5): ReadingMaterial[] {
		return Array.from(this.materialsCache.values())
			.filter((m) => m.lastAccessed)
			.sort((a, b) => {
				const dateA = new Date(a.lastAccessed).getTime();
				const dateB = new Date(b.lastAccessed).getTime();
				return dateB - dateA;
			})
			.slice(0, limit);
	}

	/**
	 * 获取材料统计
	 */
	getStatistics(): {
		total: number;
		byCategory: Record<string, number>;
		todayDue: number;
		averageProgress: number;
	} {
		const materials = Array.from(this.materialsCache.values());
		const today = new Date();
		today.setHours(23, 59, 59, 999);

		const byCategory: Record<string, number> = {};
		let totalProgress = 0;
		let todayDue = 0;

		for (const material of materials) {
			// 按分类统计
			byCategory[material.category] = (byCategory[material.category] || 0) + 1;

			// 进度统计
			totalProgress += material.progress.percentage;

			// 今日到期
			const dueAt = getReadingMaterialDueAt(material);
			if (dueAt) {
				const dueDate = new Date(dueAt);
				if (dueDate <= today) {
					todayDue++;
				}
			}
		}

		return {
			total: materials.length,
			byCategory,
			todayDue,
			averageProgress: materials.length > 0 ? totalProgress / materials.length : 0,
		};
	}
}

/**
 * 创建阅读材料存储实例
 */
export function createReadingMaterialStorage(app: App): ReadingMaterialStorage {
	return new ReadingMaterialStorage(app);
}
