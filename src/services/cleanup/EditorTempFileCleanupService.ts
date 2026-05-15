import { type App, TFile } from "obsidian";
import { normalizePath } from "obsidian";
import { logger } from "../../utils/logger";
import {
	getPluginEditorTempDir,
	getVaultEditorTempDir,
	isDetachedEditorTempFilePath,
	isModalEditorPermanentFilePath,
} from "../editor/editor-temp-file-policy";

export class EditorTempFileCleanupService {
	private app: App;
	private maxAgeMsInTempDir: number;
	private maxAgeMsInRoot: number;

	constructor(
		app: App,
		options?: {
			maxAgeMsInTempDir?: number;
			maxAgeMsInRoot?: number;
		}
	) {
		this.app = app;
		this.maxAgeMsInTempDir = options?.maxAgeMsInTempDir ?? 12 * 60 * 60 * 1000;
		this.maxAgeMsInRoot = options?.maxAgeMsInRoot ?? 24 * 60 * 60 * 1000;
	}

	async cleanupNow(): Promise<{
		scanned: number;
		deleted: number;
		skippedOpen: number;
		skippedYoung: number;
	}> {
		const now = Date.now();

		let deleted = 0;
		let skippedOpen = 0;
		let skippedYoung = 0;

		const openPaths = this.getOpenMarkdownFilePaths();
		const candidates = this.getCandidateTempFiles();

		for (const f of candidates) {
			try {
				if (openPaths.has(f.path)) {
					skippedOpen++;
					continue;
				}

				const mtime = f.stat?.mtime ?? 0;
				const age = mtime > 0 ? now - mtime : Number.POSITIVE_INFINITY;

				const maxAge = this.getMaxAgeMsForPath(f.path);
				if (age < maxAge) {
					skippedYoung++;
					continue;
				}

				await this.app.fileManager.trashFile(f);
				deleted++;
			} catch (error) {
				logger.warn("[EditorTempFileCleanup] 删除临时文件失败:", f.path, error);
			}
		}

		if (deleted > 0) {
			logger.debug("[EditorTempFileCleanup] 已清理编辑器临时文件:", {
				scanned: candidates.length,
				deleted,
				skippedOpen,
				skippedYoung,
			});
		}

		return {
			scanned: candidates.length,
			deleted,
			skippedOpen,
			skippedYoung,
		};
	}

	private getCandidateTempFiles(): TFile[] {
		try {
			const files = this.app.vault.getFiles();
			return files.filter((f) => this.isEditorTempFile(f));
		} catch (error) {
			logger.warn("[EditorTempFileCleanup] 枚举文件失败:", error);
			return [];
		}
	}

	private isEditorTempFile(f: TFile): boolean {
		try {
			const p = normalizePath(f.path || "");
			if (!p) return false;
			if (p.includes("/.trash/")) return false;
			return isDetachedEditorTempFilePath(p);
		} catch {
			return false;
		}
	}

	private getMaxAgeMsForPath(path: string): number {
		try {
			const p = normalizePath(path);
			if (this.isInAnyTempDir(p)) return this.maxAgeMsInTempDir;
			if (this.isRootFile(p)) return this.maxAgeMsInRoot;
			return this.maxAgeMsInTempDir;
		} catch {
			return this.maxAgeMsInTempDir;
		}
	}

	private isInAnyTempDir(path: string): boolean {
		try {
			const p = normalizePath(path);
			const pluginEditorTempDir = getPluginEditorTempDir(this.app);

			// 正式插件缓存目录
			if (p.startsWith(`${pluginEditorTempDir}/`)) return true;

			// 正式 vault 可见桥接目录
			if (p.includes("/weave/editor/")) return true;
			if (p.includes("/Weave/editor/")) return true;

			// 兼容任意父目录：只要包含 /weave/temp/ 或 /Weave/temp/ 都认为是旧临时目录
			if (p.includes("/weave/temp/")) return true;
			if (p.includes("/Weave/temp/")) return true;

			// 兜底：历史遗留可能落在任意 */temp/*，但为了安全只清理 weave-editor 前缀
			if (p.includes("/temp/")) return true;
			return false;
		} catch {
			return false;
		}
	}

	private isRootFile(path: string): boolean {
		try {
			const p = normalizePath(path);
			return !p.includes("/");
		} catch {
			return false;
		}
	}

	/**
	 * 启动时清理：删除所有未打开的临时文件（不受时间限制）
	 * 用于 Obsidian 重启/崩溃后清理孤儿临时文件
	 */
	async aggressiveCleanup(): Promise<{ scanned: number; deleted: number; skippedOpen: number }> {
		let deleted = 0;
		let skippedOpen = 0;

		const openPaths = this.getOpenMarkdownFilePaths();
		const candidates = this.getCandidateTempFiles();

		for (const f of candidates) {
			try {
				if (openPaths.has(f.path)) {
					skippedOpen++;
					continue;
				}
				await this.app.fileManager.trashFile(f);
				deleted++;
			} catch (error) {
				logger.warn("[EditorTempFileCleanup] 删除临时文件失败:", f.path, error);
			}
		}

		if (deleted > 0 || candidates.length > 0) {
			logger.info("[EditorTempFileCleanup] 启动清理完成:", {
				scanned: candidates.length,
				deleted,
				skippedOpen,
			});
		}

		try {
			await this.cleanupLegacyTempDirectories(openPaths);
		} catch (error) {
			logger.warn("[EditorTempFileCleanup] 清理 legacy temp 目录失败:", error);
		}

		return { scanned: candidates.length, deleted, skippedOpen };
	}

	private getLegacyTempDirectories(): string[] {
		try {
			const normalized = normalizePath(getVaultEditorTempDir(this.app));
			const rootDir = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
			if (!rootDir) {
				return [];
			}
			return [normalizePath(`${rootDir}/temp`)];
		} catch {
			return [];
		}
	}

	private async cleanupLegacyTempDirectories(openPaths: Set<string>): Promise<void> {
		const adapter: any = this.app.vault.adapter as any;
		for (const dir of this.getLegacyTempDirectories()) {
			let deletedInDir = 0;
			for (const filePath of await this.collectFilesRecursively(dir)) {
				const normalizedPath = normalizePath(filePath);
				if (openPaths.has(normalizedPath)) {
					continue;
				}

				if (!this.isLegacyEditorTempFilePath(normalizedPath)) {
					continue;
				}

				const abstractFile = this.app.vault.getAbstractFileByPath(normalizedPath);
				if (abstractFile instanceof TFile) {
					await this.app.fileManager.trashFile(abstractFile);
				} else {
					await adapter.remove(normalizedPath);
				}
				deletedInDir += 1;
			}

			await this.removeEmptyDirectoriesDeep(dir);

			if (deletedInDir > 0) {
				logger.info("[EditorTempFileCleanup] 已清理 legacy temp 目录临时文件:", {
					dir,
					deleted: deletedInDir,
				});
			}
		}
	}

	private isLegacyEditorTempFilePath(path: string): boolean {
		try {
			const normalized = normalizePath(path);
			if (isDetachedEditorTempFilePath(normalized)) return true;
			if (isModalEditorPermanentFilePath(normalized)) return true;
			return false;
		} catch {
			return false;
		}
	}

	private async collectFilesRecursively(dirPath: string): Promise<string[]> {
		const adapter: any = this.app.vault.adapter as any;
		const normalizedDirPath = normalizePath(dirPath);
		if (!(await adapter.exists(normalizedDirPath))) {
			return [];
		}

		const files: string[] = [];

		const walk = async (currentDir: string): Promise<void> => {
			let listing: any;
			try {
				listing = await adapter.list(currentDir);
			} catch {
				return;
			}

			for (const childDir of listing?.folders || []) {
				await walk(childDir);
			}

			for (const filePath of listing?.files || []) {
				files.push(filePath);
			}
		};

		await walk(normalizedDirPath);
		return files;
	}

	private async removeEmptyDirectoriesDeep(dirPath: string): Promise<void> {
		const adapter: any = this.app.vault.adapter as any;
		const normalizedPath = normalizePath(dirPath);
		if (!(await adapter.exists(normalizedPath))) {
			return;
		}

		let listing: any;
		try {
			listing = await adapter.list(normalizedPath);
		} catch {
			return;
		}

		for (const childDir of listing?.folders || []) {
			await this.removeEmptyDirectoriesDeep(childDir);
		}

		let latestListing: any;
		try {
			latestListing = await adapter.list(normalizedPath);
		} catch {
			return;
		}

		const hasFiles = (latestListing?.files || []).length > 0;
		const hasFolders = (latestListing?.folders || []).length > 0;
		if (hasFiles || hasFolders) {
			return;
		}

		try {
			if (typeof adapter.rmdir === "function") {
				await adapter.rmdir(normalizedPath, false);
			} else {
				await adapter.remove(normalizedPath);
			}
		} catch {}
	}

	private getOpenMarkdownFilePaths(): Set<string> {
		const open = new Set<string>();
		try {
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			for (const leaf of leaves) {
				try {
					const view = leaf.view as any;
					const file = view?.file as TFile | null | undefined;
					const p = file?.path;
					if (p) open.add(normalizePath(p));
				} catch {}
			}
		} catch {}
		return open;
	}
}
