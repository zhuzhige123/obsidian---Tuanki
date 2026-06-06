import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import {
	getPluginPaths,
	getReadableWeaveRoot,
	getV2Paths,
	normalizeWeaveParentFolder,
} from "../../config/paths";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import {
	getVaultAdapterWithDirOps,
	listVaultDirectory,
	type VaultAdapterWithDirOps,
} from "../../utils/plugin-runtime";

interface LegacyFolderMigrationOptions {
	legacyPath: string;
	targetPath: string;
	label: string;
}

export async function migrateLegacyWeaveFolders(app: App, parentFolder?: string): Promise<void> {
	const normalizedParentFolder = normalizeWeaveParentFolder(parentFolder);
	const readableRoot = getReadableWeaveRoot(normalizedParentFolder);
	const v2Paths = getV2Paths(normalizedParentFolder);

	await migrateLegacyDirectory(app, {
		legacyPath: normalizePath(`${readableRoot}/deck-graphs`),
		targetPath: normalizePath(v2Paths.memory.knowledgeGraphs),
		label: "deck-graphs",
	});

	await migrateLegacyDirectory(app, {
		legacyPath: normalizePath(`${readableRoot}/epub-reading`),
		targetPath: normalizePath(v2Paths.ir.epub),
		label: "epub-reading",
	});
}

export async function migrateLegacyDirectory(
	app: App,
	options: LegacyFolderMigrationOptions
): Promise<void> {
	const adapter = getVaultAdapterWithDirOps(app.vault.adapter);
	const legacyPath = normalizePath(options.legacyPath);
	const targetPath = normalizePath(options.targetPath);

	if (!legacyPath || !targetPath || legacyPath === targetPath) return;
	if (!(await pathExistsOrHasEntries(adapter, legacyPath))) return;

	await DirectoryUtils.ensureDirRecursive(adapter, targetPath);

	if (!adapter.list) {
		logger.warn(`[LegacyWeaveFolderMigration] 当前适配器不支持目录遍历，无法迁移 ${options.label}`);
		return;
	}

	const conflictRoot = normalizePath(
		`${getPluginPaths(app).migration.root}/legacy-folder-conflicts/${options.label}`
	);

	await moveDirectoryContents(adapter, legacyPath, targetPath, conflictRoot);
	await removeEmptyDirectoryTree(adapter, legacyPath);
}

async function pathExistsOrHasEntries(adapter: VaultAdapterWithDirOps, dirPath: string): Promise<boolean> {
	try {
		if (await adapter.exists(dirPath)) {
			return true;
		}
	} catch { /* no-op */ }

	const listing = await listVaultDirectory(adapter, dirPath);
	return Boolean(listing && (listing.files.length > 0 || listing.folders.length > 0));
}

async function moveDirectoryContents(
	adapter: VaultAdapterWithDirOps,
	fromRoot: string,
	toRoot: string,
	conflictRoot: string
): Promise<void> {
	const walk = async (currentDir: string): Promise<void> => {
		const listing = await listVaultDirectory(adapter, currentDir);
		if (!listing) {
			return;
		}

		for (const folder of listing.folders) {
			const relativeFolder = getRelativePath(fromRoot, folder);
			const targetFolder = normalizePath(`${toRoot}/${relativeFolder}`);
			await DirectoryUtils.ensureDirRecursive(adapter, targetFolder);
			await walk(folder);
		}

		for (const file of listing.files) {
			const relativeFile = getRelativePath(fromRoot, file);
			const targetFile = normalizePath(`${toRoot}/${relativeFile}`);
			await DirectoryUtils.ensureDirForFile(adapter, targetFile);

			if (!(await adapter.exists(targetFile))) {
				await copyFile(adapter, file, targetFile);
			} else {
				const sameContent = await filesHaveSameContent(adapter, file, targetFile);
				if (!sameContent) {
					const conflictFile = normalizePath(
						`${conflictRoot}/${new Date().toISOString().replace(/[:.]/g, "-")}/${relativeFile}`
					);
					await DirectoryUtils.ensureDirForFile(adapter, conflictFile);
					await copyFile(adapter, file, conflictFile);
					logger.warn(
						`[LegacyWeaveFolderMigration] 发现冲突文件，已保留旧副本: ${file} -> ${conflictFile}`
					);
				}
			}

			try {
				await adapter.remove(file);
			} catch (error) {
				logger.warn(`[LegacyWeaveFolderMigration] 删除旧文件失败: ${file}`, error);
			}
		}
	};

	await walk(fromRoot);
}

async function removeEmptyDirectoryTree(adapter: VaultAdapterWithDirOps, rootDir: string): Promise<void> {
	if (!(await adapter.exists(rootDir))) return;

	const walk = async (dir: string): Promise<void> => {
		const listing = await listVaultDirectory(adapter, dir);
		if (!listing) {
			return;
		}

		for (const folder of listing.folders) {
			await walk(folder);
		}

		try {
			const after = await listVaultDirectory(adapter, dir);
			if (after && after.files.length === 0 && after.folders.length === 0) {
				if (adapter.rmdir) {
					await adapter.rmdir(dir, false);
				} else {
					await adapter.remove(dir);
				}
			}
		} catch { /* no-op */ }
	};

	await walk(rootDir);
}

async function filesHaveSameContent(
	adapter: VaultAdapterWithDirOps,
	leftPath: string,
	rightPath: string
): Promise<boolean> {
	try {
		if (adapter.readBinary && adapter.writeBinary) {
			const [left, right] = await Promise.all([
				adapter.readBinary(leftPath),
				adapter.readBinary(rightPath),
			]);
			return compareBinary(left, right);
		}

		const [left, right] = await Promise.all([adapter.read(leftPath), adapter.read(rightPath)]);
		return left === right;
	} catch {
		return false;
	}
}

function compareBinary(left: ArrayBuffer | Uint8Array, right: ArrayBuffer | Uint8Array): boolean {
	const leftBytes = left instanceof Uint8Array ? left : new Uint8Array(left);
	const rightBytes = right instanceof Uint8Array ? right : new Uint8Array(right);
	if (leftBytes.length !== rightBytes.length) return false;

	for (let index = 0; index < leftBytes.length; index++) {
		if (leftBytes[index] !== rightBytes[index]) return false;
	}

	return true;
}

async function copyFile(
	adapter: VaultAdapterWithDirOps,
	fromPath: string,
	toPath: string
): Promise<void> {
	if (adapter.readBinary && adapter.writeBinary) {
		const content = await adapter.readBinary(fromPath);
		await adapter.writeBinary(toPath, content);
		return;
	}

	const content = await adapter.read(fromPath);
	await adapter.write(toPath, content);
}

function getRelativePath(rootDir: string, childPath: string): string {
	return childPath.startsWith(rootDir)
		? childPath.slice(rootDir.length).replace(/^\/+/, "")
		: childPath;
}
