import { logger } from "../utils/logger";
/**
 * 目录管理工具类
 * 提供统一的目录操作接口，支持隐藏文件夹
 */

import { normalizePath, type DataAdapter } from "obsidian";

export class DirectoryUtils {
	/**
	 * 确保目录存在（支持隐藏文件夹）
	 *
	 * @param adapter - Vault adapter
	 * @param path - 目录路径（支持 .开头的隐藏目录）
	 * @throws 如果创建失败（非"已存在"错误）
	 *
	 * @example
	 * ```ts
	 * await DirectoryUtils.ensureDir(vault.adapter, '.weave/data');
	 * ```
	 */
	static async ensureDir(adapter: DataAdapter, path: string): Promise<void> {
		// 🔥 输入验证
		if (!path || typeof path !== "string" || path.trim() === "") {
			throw new Error("目录路径不能为空");
		}

		const normalizedPath = path.trim();
		const exists = await adapter.exists(normalizedPath);

		if (!exists) {
			try {
				await adapter.mkdir(normalizedPath);
				logger.debug(`✅ 目录已创建: ${normalizedPath}`);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);

				// 静默处理"已存在"错误（可能是并发创建导致）
				if (errorMsg.toLowerCase().includes("exist")) {
					logger.debug(`ℹ️ 目录已存在: ${normalizedPath}`);
					return;
				}

				// 其他错误抛出
				throw new Error(`创建目录失败 ${normalizedPath}: ${errorMsg}`);
			}
		}
	}

	/**
	 * 递归创建目录（支持隐藏文件夹）
	 *
	 * @param adapter - Vault adapter
	 * @param path - 目录路径（如 '.weave/data/subfolder'）
	 *
	 * @example
	 * ```ts
	 * await DirectoryUtils.ensureDirRecursive(vault.adapter, '.weave/indices/cards');
	 * ```
	 */
	static async ensureDirRecursive(adapter: DataAdapter, path: string): Promise<void> {
		// 🔥 输入验证
		if (!path || typeof path !== "string" || path.trim() === "") {
			throw new Error("目录路径不能为空");
		}

		const normalizedPath = path.trim();
		const parts = normalizedPath.split("/").filter((p) => p && p.trim() !== "");

		if (parts.length === 0) {
			throw new Error("无效的目录路径");
		}

		let currentPath = "";

		for (const part of parts) {
			currentPath += (currentPath ? "/" : "") + part;
			await this.ensureDir(adapter, currentPath);
		}
	}

	/**
	 * 检查目录是否存在
	 *
	 * @param adapter - Vault adapter
	 * @param path - 目录路径
	 * @returns 是否存在
	 */
	static async exists(adapter: DataAdapter, path: string): Promise<boolean> {
		// 🔥 输入验证
		if (!path || typeof path !== "string" || path.trim() === "") {
			return false; // 空路径视为不存在
		}

		return await adapter.exists(path.trim());
	}

	/**
	 * 确保文件所在目录存在
	 *
	 * @param adapter - Vault adapter
	 * @param filePath - 文件完整路径
	 *
	 * @example
	 * ```ts
	 * await DirectoryUtils.ensureDirForFile(vault.adapter, '.weave/data/file.json');
	 * // 会创建 .weave 和 .weave/data
	 * ```
	 */
	static async ensureDirForFile(adapter: DataAdapter, filePath: string): Promise<void> {
		// 🔥 输入验证
		if (!filePath || typeof filePath !== "string" || filePath.trim() === "") {
			throw new Error("文件路径不能为空");
		}

		const normalizedPath = filePath.trim();
		const lastSlash = normalizedPath.lastIndexOf("/");

		if (lastSlash === -1) {
			// 文件在根目录，无需创建目录
			return;
		}

		const dirPath = normalizedPath.substring(0, lastSlash);
		await this.ensureDirRecursive(adapter, dirPath);
	}

	/**
	 * 递归清理指定根目录下的空目录，仅删除空目录，不删除任何文件。
	 * 默认保留根目录本身。
	 */
	static async pruneEmptyDirsUnder(
		adapter: DataAdapter,
		rootPath: string,
		options: { preserveRoot?: boolean } = {}
	): Promise<number> {
		const normalizedRoot = normalizePath(String(rootPath || "").trim());
		if (!normalizedRoot) {
			return 0;
		}

		const adapterWithDirOps = adapter as DataAdapter & {
			list?: (path: string) => Promise<{ files?: string[]; folders?: string[] }>;
			rmdir?: (path: string, recursive?: boolean) => Promise<void>;
			remove?: (path: string) => Promise<void>;
		};

		if (typeof adapterWithDirOps.list !== "function") {
			return 0;
		}

		const preserveRoot = options.preserveRoot !== false;
		let removedCount = 0;

		const tryRemoveDir = async (dir: string): Promise<boolean> => {
			try {
				if (typeof adapterWithDirOps.rmdir === "function") {
					await adapterWithDirOps.rmdir(dir, false);
				} else if (typeof adapterWithDirOps.remove === "function") {
					await adapterWithDirOps.remove(dir);
				} else {
					return false;
				}
				return true;
			} catch {
				try {
					if (typeof adapterWithDirOps.remove === "function") {
						await adapterWithDirOps.remove(dir);
						return true;
					}
				} catch {
					// noop
				}
				return false;
			}
		};

		const visit = async (dir: string): Promise<void> => {
			if (!(await adapter.exists(dir))) {
				return;
			}

			let listing: { files?: string[]; folders?: string[] };
			try {
				listing = await adapterWithDirOps.list(dir);
			} catch {
				return;
			}

			for (const childDir of Array.isArray(listing.folders) ? listing.folders : []) {
				await visit(normalizePath(childDir));
			}

			try {
				listing = await adapterWithDirOps.list(dir);
			} catch {
				return;
			}

			const files = Array.isArray(listing.files) ? listing.files : [];
			const folders = Array.isArray(listing.folders) ? listing.folders : [];
			if (files.length > 0 || folders.length > 0) {
				return;
			}

			if (preserveRoot && dir === normalizedRoot) {
				return;
			}

			if (await tryRemoveDir(dir)) {
				removedCount += 1;
			}
		};

		await visit(normalizedRoot);
		return removedCount;
	}
}
