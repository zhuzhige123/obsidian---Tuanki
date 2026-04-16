import { type App, TAbstractFile, TFile } from "obsidian";
import { Platform, normalizePath } from "obsidian";
import {
	getPluginPaths,
	getReadableWeaveRoot,
	getV2Paths,
	normalizeWeaveParentFolder,
} from "../../config/paths";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { migrateLegacyDirectory } from "../data-migration/LegacyWeaveFolderMigration";
import type {
	Bookmark,
	ConcealedText,
	EpubBook,
	EpubLastOpenBookmark,
	EpubReaderSettings,
	Highlight,
	Note,
	ReadingPosition,
} from "./types";

export interface EpubBookshelfSettings {
	lastScanAt?: number;
}

export interface EpubBookshelfIndexEntry {
	path: string;
	name: string;
	folder: string;
	size: number;
}

export interface EpubScanIndexEntry extends EpubBookshelfIndexEntry {
	mtime: number;
}

export interface EpubBookshelfMembershipEntry {
	path: string;
	addedAt: number;
}

export interface EpubSourceRegistryEntry {
	sourceId: string;
	filePath: string;
	sourceFingerprint?: string;
	sourceSize?: number;
	sourceMtime?: number;
	lastSeenAt: number;
	lastKnownPath?: string;
}

export const DEFAULT_EPUB_BOOKSHELF_SETTINGS: EpubBookshelfSettings = {
	lastScanAt: 0,
};

export class EpubStorageService {
	private app: App;
	private basePath: string;
	private _progressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _pendingProgress: { bookId: string; position: ReadingPosition } | null = null;
	private _booksCache: Record<string, EpubBook> | null = null;
	private _booksWriteLock: Promise<void> = Promise.resolve();
	private _bookStateWriteLocks = new Map<string, Promise<void>>();

	constructor(app: App) {
		this.app = app;
		const plugin: any = (app as any)?.plugins?.getPlugin?.("weave");
		const parentFolder = normalizeWeaveParentFolder(plugin?.settings?.weaveParentFolder);
		this.basePath = getV2Paths(parentFolder).ir.epub;
	}

	private markInternalWrite(): void {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		plugin?.externalSyncWatcher?.markInternalWrite?.();
	}

	async ensureDirectories(): Promise<void> {
		await this.migrateLegacyDirectoryIfNeeded();
		await Promise.all([
			DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, this.basePath),
			DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, this.getLocalReaderStateRoot()),
			DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, this.getLocalReaderArtifactsRoot()),
		]);
	}

	private getLegacyBasePath(): string {
		const plugin: any = (this.app as any)?.plugins?.getPlugin?.("weave");
		const parentFolder = normalizeWeaveParentFolder(plugin?.settings?.weaveParentFolder);
		return `${getReadableWeaveRoot(parentFolder)}/epub-reading`;
	}

	private async migrateLegacyDirectoryIfNeeded(): Promise<void> {
		const legacyPath = this.getLegacyBasePath();
		if (legacyPath === this.basePath) return;

		await migrateLegacyDirectory(this.app, {
			legacyPath,
			targetPath: this.basePath,
			label: "epub-reading",
		});
	}

	async loadBooks(): Promise<Record<string, EpubBook>> {
		if (this._booksCache) return this._booksCache;
		await this.ensureDirectories();
		const booksPath = `${this.basePath}/books.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(booksPath)) {
			try {
				const content = await adapter.read(booksPath);
				const parsed = JSON.parse(content) as Record<string, EpubBook>;
				this._booksCache = parsed;
				await this.hydrateBookStates(parsed);
				return this._booksCache!;
			} catch (e) {
				logger.warn("[EpubStorageService] Failed to parse books.json:", e);
				this._booksCache = {};
				return this._booksCache;
			}
		}

		this._booksCache = {};
		return this._booksCache;
	}

	private async writeBooksWithLock(books: Record<string, EpubBook>): Promise<void> {
		const doWrite = async () => {
			await this.ensureDirectories();
			const booksPath = `${this.basePath}/books.json`;
			this._booksCache = books;
			await this.app.vault.adapter.write(booksPath, JSON.stringify(books));
		};
		this._booksWriteLock = this._booksWriteLock.then(doWrite, doWrite);
		await this._booksWriteLock;
	}

	private getLocalReaderStateRoot(): string {
		return normalizePath(`${getPluginPaths(this.app as any).state.incrementalReading.readerState}/epub`);
	}

	private getLocalReaderArtifactsRoot(): string {
		return normalizePath(
			`${getPluginPaths(this.app as any).cache.incrementalReading.readerArtifacts}/epub`
		);
	}

	private getBookStatePath(bookId: string): string {
		return normalizePath(`${this.getLocalReaderStateRoot()}/${bookId}/state.json`);
	}

	private getLegacyBookStatePath(bookId: string): string {
		return `${this.basePath}/${bookId}/state.json`;
	}

	private getLastOpenBookmarkPath(bookId: string): string {
		return normalizePath(`${this.getLocalReaderStateRoot()}/${bookId}/last-open-bookmark.json`);
	}

	private getLegacyLastOpenBookmarkPath(bookId: string): string {
		return `${this.basePath}/${bookId}/last-open-bookmark.json`;
	}

	private getConcealedTextsPath(bookId: string): string {
		return normalizePath(`${this.getLocalReaderArtifactsRoot()}/${bookId}/concealed-texts.json`);
	}

	private getLegacyConcealedTextsPath(bookId: string): string {
		return `${this.basePath}/${bookId}/concealed-texts.json`;
	}

	private getBookshelfIndexPath(): string {
		return `${this.basePath}/bookshelf-index.json`;
	}

	private getScanIndexPath(): string {
		return `${this.basePath}/epub-scan-index.json`;
	}

	private getBookshelfMembershipPath(): string {
		return `${this.basePath}/bookshelf-membership.json`;
	}

	private getSourceRegistryPath(): string {
		return `${this.basePath}/epub-source-registry.json`;
	}

	private parseBookshelfIndexEntries(content: string): EpubBookshelfIndexEntry[] {
		try {
			const parsed = JSON.parse(content);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.filter(
				(item) =>
					item &&
					typeof item.path === "string" &&
					typeof item.name === "string" &&
					typeof item.folder === "string" &&
					typeof item.size === "number"
			);
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse bookshelf-index.json:", error);
			return [];
		}
	}

	private parseScanIndexEntries(content: string): EpubScanIndexEntry[] {
		try {
			const parsed = JSON.parse(content);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed
				.filter(
					(item) =>
						item &&
						typeof item.path === "string" &&
						typeof item.name === "string" &&
						typeof item.folder === "string" &&
						typeof item.size === "number"
				)
				.map((item) => ({
					path: normalizePath(item.path),
					name: item.name,
					folder: item.folder,
					size: item.size,
					mtime: typeof item.mtime === "number" ? item.mtime : 0,
				}));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse epub-scan-index.json:", error);
			return [];
		}
	}

	private parseBookshelfMembershipEntries(content: string): EpubBookshelfMembershipEntry[] {
		try {
			const parsed = JSON.parse(content);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed
				.filter((item) => item && typeof item.path === "string")
				.map((item) => ({
					path: normalizePath(item.path),
					addedAt: typeof item.addedAt === "number" ? item.addedAt : 0,
				}));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse bookshelf-membership.json:", error);
			return [];
		}
	}

	private parseSourceRegistryEntries(content: string): EpubSourceRegistryEntry[] {
		try {
			const parsed = JSON.parse(content);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed
				.filter(
					(item) =>
						item &&
						typeof item.sourceId === "string" &&
						typeof item.filePath === "string"
				)
				.map((item) => ({
					sourceId: item.sourceId,
					filePath: normalizePath(item.filePath),
					sourceFingerprint:
						typeof item.sourceFingerprint === "string" ? item.sourceFingerprint : undefined,
					sourceSize: typeof item.sourceSize === "number" ? item.sourceSize : undefined,
					sourceMtime: typeof item.sourceMtime === "number" ? item.sourceMtime : undefined,
					lastSeenAt: typeof item.lastSeenAt === "number" ? item.lastSeenAt : 0,
					lastKnownPath:
						typeof item.lastKnownPath === "string"
							? normalizePath(item.lastKnownPath)
							: undefined,
				}));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse epub-source-registry.json:", error);
			return [];
		}
	}

	private async readStoredBookshelfIndex(): Promise<EpubBookshelfIndexEntry[] | null> {
		await this.ensureDirectories();
		const indexPath = this.getBookshelfIndexPath();
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(indexPath))) {
			return null;
		}

		try {
			const content = await adapter.read(indexPath);
			return this.parseBookshelfIndexEntries(content);
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to read bookshelf-index.json:", error);
			return null;
		}
	}

	private async readStoredScanIndex(): Promise<EpubScanIndexEntry[] | null> {
		await this.ensureDirectories();
		const indexPath = this.getScanIndexPath();
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(indexPath))) {
			return null;
		}

		try {
			const content = await adapter.read(indexPath);
			return this.parseScanIndexEntries(content);
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to read epub-scan-index.json:", error);
			return null;
		}
	}

	private async readStoredBookshelfMembership():
		Promise<EpubBookshelfMembershipEntry[] | null> {
		await this.ensureDirectories();
		const membershipPath = this.getBookshelfMembershipPath();
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(membershipPath))) {
			return null;
		}

		try {
			const content = await adapter.read(membershipPath);
			return this.parseBookshelfMembershipEntries(content);
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to read bookshelf-membership.json:", error);
			return null;
		}
	}

	private async readStoredSourceRegistry(): Promise<EpubSourceRegistryEntry[] | null> {
		await this.ensureDirectories();
		const registryPath = this.getSourceRegistryPath();
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(registryPath))) {
			return null;
		}

		try {
			const content = await adapter.read(registryPath);
			return this.parseSourceRegistryEntries(content);
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to read epub-source-registry.json:", error);
			return null;
		}
	}

	private buildBookshelfIndexEntriesFromBooks(
		books: Record<string, EpubBook>
	): EpubBookshelfIndexEntry[] {
		return Object.values(books).map((book) => {
			const file = this.app.vault.getAbstractFileByPath(book.filePath);
			const size = file instanceof TFile ? file.stat.size : 0;
			const normalizedPath = normalizePath(book.filePath || "");
			const slashIndex = normalizedPath.lastIndexOf("/");
			return {
				path: normalizedPath,
				name:
					normalizedPath
						.split("/")
						.pop()
						?.replace(/\.epub$/i, "") ||
					book.metadata.title ||
					"EPUB",
				folder: slashIndex >= 0 ? normalizedPath.slice(0, slashIndex) || "/" : "/",
				size,
			};
		});
	}

	private buildMembershipEntriesFromLegacyData(
		books: Record<string, EpubBook>,
		legacyIndexEntries: EpubBookshelfIndexEntry[]
	): EpubBookshelfMembershipEntry[] {
		const now = Date.now();
		return Array.from(
			new Set([
				...Object.values(books).map((book) => normalizePath(book.filePath || "")),
				...legacyIndexEntries.map((entry) => normalizePath(entry.path || "")),
			].filter(Boolean))
		)
			.map((path, index) => ({
				path,
				addedAt: now + index,
			}))
			.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
	}

	private toBookshelfIndexEntry(entry: EpubScanIndexEntry): EpubBookshelfIndexEntry {
		return {
			path: entry.path,
			name: entry.name,
			folder: entry.folder,
			size: entry.size,
		};
	}

	private isEpubPath(filePath: string): boolean {
		const normalizedPath = normalizePath(filePath || "");
		return /\.epub$/i.test(normalizedPath);
	}

	private isEpubFile(file: TAbstractFile | null | undefined): boolean {
		if (!(file instanceof TFile)) {
			return false;
		}

		return this.isEpubPath(file.path) || String(file.extension || "").toLowerCase() === "epub";
	}

	private isPathWithinFolder(filePath: string, folderPath: string): boolean {
		if (!folderPath) {
			return true;
		}

		const normalizedFilePath = normalizePath(filePath || "");
		return normalizedFilePath.startsWith(`${folderPath}/`);
	}

	private normalizeScanFolderScope(folderPath?: string): string {
		const rawFolderPath = String(folderPath || "").trim();
		if (!rawFolderPath || rawFolderPath === "/" || rawFolderPath === ".") {
			return "";
		}

		const normalizedFolderPath = normalizePath(rawFolderPath);
		if (!normalizedFolderPath || normalizedFolderPath === "/" || normalizedFolderPath === ".") {
			return "";
		}

		return normalizedFolderPath;
	}

	private filterBookshelfEntriesByFolder<T extends { path: string }>(
		entries: T[],
		folderPath: string
	): T[] {
		return entries.filter((entry) => this.isPathWithinFolder(entry.path, folderPath));
	}

	private collectEpubPathsFromVaultIndex(folderPath?: string): string[] {
		const normalizedFolder = this.normalizeScanFolderScope(folderPath);

		return this.app.vault
			.getFiles()
			.filter(
				(file) => this.isEpubFile(file) && this.isPathWithinFolder(file.path, normalizedFolder)
			)
			.map((file) => normalizePath(file.path));
	}

	private async collectEpubPathsFromAdapter(folderPath?: string): Promise<string[]> {
		const adapter = this.app.vault.adapter as {
			list?: (path: string) => Promise<{ files: string[]; folders: string[] }>;
		};
		if (typeof adapter.list !== "function") {
			return [];
		}

		const normalizedFolder = this.normalizeScanFolderScope(folderPath);
		const pendingDirs = normalizedFolder ? [normalizedFolder] : [""];
		const visitedDirs = new Set<string>();
		const paths = new Set<string>();

		while (pendingDirs.length > 0) {
			const currentDir = normalizePath(pendingDirs.pop() || "");
			if (visitedDirs.has(currentDir)) {
				continue;
			}
			visitedDirs.add(currentDir);

			let listing: { files: string[]; folders: string[] };
			try {
				const listTarget = currentDir || "/";
				listing = await adapter.list(listTarget);
			} catch (error) {
				if (currentDir === normalizedFolder) {
					logger.warn("[EpubStorageService] Failed to list EPUB scan directory:", {
						dir: currentDir || "/",
						error,
					});
				}
				continue;
			}

			for (const filePath of Array.isArray(listing.files) ? listing.files : []) {
				const normalizedFilePath = normalizePath(filePath || "");
				if (!this.isEpubPath(normalizedFilePath)) {
					continue;
				}
				if (!this.isPathWithinFolder(normalizedFilePath, normalizedFolder)) {
					continue;
				}
				paths.add(normalizedFilePath);
			}

			for (const nextDir of Array.isArray(listing.folders) ? listing.folders : []) {
				const normalizedNextDir = normalizePath(nextDir || "");
				if (!normalizedNextDir) {
					continue;
				}
				pendingDirs.push(normalizedNextDir);
			}
		}

		return Array.from(paths);
	}

	private async createScanIndexEntryFromPath(filePath: string): Promise<EpubScanIndexEntry> {
		const normalizedPath = normalizePath(filePath || "");
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		const slashIndex = normalizedPath.lastIndexOf("/");
		let size = file instanceof TFile ? file.stat.size : 0;
		let mtime = file instanceof TFile ? file.stat.mtime : 0;

		if (
			(size === 0 || mtime === 0) &&
			typeof (this.app.vault.adapter as { stat?: (path: string) => Promise<{ size?: number }> })
				.stat === "function"
		) {
			try {
				const stat = await (
					this.app.vault.adapter as {
						stat: (path: string) => Promise<{ size?: number; mtime?: number }>
					}
				).stat(normalizedPath);
				if (typeof stat?.size === "number") {
					size = stat.size;
				}
				if (typeof stat?.mtime === "number") {
					mtime = stat.mtime;
				}
			} catch {
				// noop
			}
		}

		return {
			path: normalizedPath,
			name:
				file instanceof TFile
					? file.basename
					: normalizedPath
							.split("/")
							.pop()
							?.replace(/\.epub$/i, "") || "EPUB",
			folder:
				file instanceof TFile
					? file.parent?.path || "/"
					: slashIndex >= 0
					? normalizedPath.slice(0, slashIndex) || "/"
					: "/",
			size,
			mtime,
		};
	}

	private async scanVaultBookshelfEntries(folderPath?: string): Promise<EpubScanIndexEntry[]> {
		const pathSet = new Set<string>();
		for (const path of this.collectEpubPathsFromVaultIndex(folderPath)) {
			pathSet.add(path);
		}
		for (const path of await this.collectEpubPathsFromAdapter(folderPath)) {
			pathSet.add(path);
		}

		const entries = await Promise.all(
			Array.from(pathSet).map((path) => this.createScanIndexEntryFromPath(path))
		);

		return entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
	}

	private areBookshelfEntryListsEqual(
		left: EpubScanIndexEntry[],
		right: EpubScanIndexEntry[]
	): boolean {
		if (left.length !== right.length) {
			return false;
		}

		return left.every((entry, index) => {
			const other = right[index];
			return (
				entry.path === other?.path &&
				entry.name === other.name &&
				entry.folder === other.folder &&
				entry.size === other.size &&
				entry.mtime === other.mtime
			);
		});
	}

	private async syncFolderBookshelfIndex(
		folderPath: string,
		entries: EpubScanIndexEntry[],
		existingEntries?: EpubScanIndexEntry[]
	): Promise<void> {
		const normalizedFolder = this.normalizeScanFolderScope(folderPath);
		if (!normalizedFolder) {
			await this.saveScanIndex(entries);
			return;
		}

		const baseEntries = existingEntries ?? (await this.loadScanIndex());
		const nextEntries = baseEntries
			.filter((entry) => !this.isPathWithinFolder(entry.path, normalizedFolder))
			.concat(entries)
			.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

		await this.saveScanIndex(nextEntries);
	}

	private async hasExistingEpubFile(filePath: string): Promise<boolean> {
		const normalizedPath = normalizePath(filePath || "");
		if (!this.isEpubPath(normalizedPath)) {
			return false;
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (file instanceof TFile && this.isEpubFile(file)) {
			return true;
		}

		const adapter = this.app.vault.adapter as { exists?: (path: string) => Promise<boolean> };
		if (typeof adapter.exists !== "function") {
			return false;
		}

		try {
			return await adapter.exists(normalizedPath);
		} catch {
			return false;
		}
	}

	private async filterExistingBookshelfEntries(
		entries: EpubScanIndexEntry[]
	): Promise<EpubScanIndexEntry[]> {
		const results = await Promise.all(
			entries.map(async (entry) => ({
				entry,
				exists: await this.hasExistingEpubFile(entry.path),
			}))
		);

		return results.filter((item) => item.exists).map((item) => item.entry);
	}

	private async getMutableBookshelfIndexEntries(): Promise<EpubScanIndexEntry[]> {
		const storedEntries = await this.readStoredScanIndex();
		if (storedEntries !== null) {
			return storedEntries;
		}
		const books = await this.loadBooks();
		return this.buildBookshelfIndexEntriesFromBooks(books).map((entry) => ({
			...entry,
			mtime: 0,
		}));
	}

	private async readBookState(
		bookId: string
	): Promise<Pick<EpubBook, "currentPosition" | "readingStats"> | null> {
		const adapter = this.app.vault.adapter;

		for (const statePath of [this.getBookStatePath(bookId), this.getLegacyBookStatePath(bookId)]) {
			if (!(await adapter.exists(statePath))) {
				continue;
			}

			try {
				const content = await adapter.read(statePath);
				const parsed = JSON.parse(content);
				if (!parsed || typeof parsed !== "object") return null;
				return {
					currentPosition: parsed.currentPosition,
					readingStats: parsed.readingStats,
				};
			} catch (error) {
				logger.warn(
					`[EpubStorageService] Failed to read state for ${bookId} from ${statePath}:`,
					error
				);
			}
		}

		return null;
	}

	private async writeBookState(
		bookId: string,
		data: Pick<EpubBook, "currentPosition" | "readingStats">
	): Promise<void> {
		const previous = this._bookStateWriteLocks.get(bookId) || Promise.resolve();
		const next = previous.then(
			async () => {
				await this.ensureDirectories();
				await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, this.getBookStatePath(bookId));
				await this.app.vault.adapter.write(this.getBookStatePath(bookId), JSON.stringify(data));
			},
			async () => {
				await this.ensureDirectories();
				await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, this.getBookStatePath(bookId));
				await this.app.vault.adapter.write(this.getBookStatePath(bookId), JSON.stringify(data));
			}
		);
		this._bookStateWriteLocks.set(bookId, next);
		await next;
	}

	private async hydrateBookStates(books: Record<string, EpubBook>): Promise<void> {
		for (const book of Object.values(books)) {
			const state = await this.readBookState(book.id);
			if (!state) continue;
			book.currentPosition = state.currentPosition ?? book.currentPosition;
			book.readingStats = state.readingStats ?? book.readingStats;
		}
	}

	async saveBooks(books: Record<string, EpubBook>): Promise<void> {
		await this.writeBooksWithLock(books);
	}

	async saveBook(book: EpubBook): Promise<void> {
		const sourceEntry = await this.ensureSourceIdentity(book.filePath, {
			preferredSourceId: book.sourceId,
		});
		if (sourceEntry) {
			book.sourceId = sourceEntry.sourceId;
			book.sourceFingerprint = sourceEntry.sourceFingerprint;
			book.sourceSize = sourceEntry.sourceSize;
			book.sourceMtime = sourceEntry.sourceMtime;
			book.filePath = sourceEntry.filePath;
		}

		const books = await this.loadBooks();
		books[book.id] = book;
		await this.writeBooksWithLock(books);
		await this.writeBookState(book.id, {
			currentPosition: book.currentPosition,
			readingStats: book.readingStats,
		});
		await this.upsertScanIndexEntry(book.filePath);
		await this.addBooksToBookshelf([book.filePath]);
	}

	async loadScanIndex(): Promise<EpubScanIndexEntry[]> {
		let entries = await this.readStoredScanIndex();

		if (entries === null) {
			const legacyEntries = await this.readStoredBookshelfIndex();
			if (legacyEntries !== null) {
				entries = legacyEntries.map((entry) => ({ ...entry, mtime: 0 }));
				await this.saveScanIndex(entries);
			} else {
				const books = await this.loadBooks();
				entries = this.buildBookshelfIndexEntriesFromBooks(books).map((entry) => ({
					...entry,
					mtime: 0,
				}));
				if (entries.length > 0) {
					await this.saveScanIndex(entries);
				}
			}
		}

		const filteredEntries = await this.filterExistingBookshelfEntries(entries);
		if (filteredEntries.length !== entries.length) {
			await this.saveScanIndex(filteredEntries);
		}
		return filteredEntries;
	}

	async loadBookshelfIndex(): Promise<EpubBookshelfIndexEntry[]> {
		const entries = await this.loadScanIndex();
		return entries.map((entry) => this.toBookshelfIndexEntry(entry));
	}

	async saveScanIndex(entries: EpubScanIndexEntry[]): Promise<void> {
		await this.ensureDirectories();
		const normalizedEntries = Array.from(
			new Map(
				entries
					.map((entry) => ({
						path: normalizePath(entry.path || ""),
						name: entry.name,
						folder: entry.folder,
						size: entry.size,
						mtime: typeof entry.mtime === "number" ? entry.mtime : 0,
					}))
					.filter((entry) => entry.path)
					.map((entry) => [entry.path, entry] as const)
			).values()
		).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
		await this.app.vault.adapter.write(this.getScanIndexPath(), JSON.stringify(normalizedEntries));
	}

	async saveBookshelfIndex(entries: EpubBookshelfIndexEntry[]): Promise<void> {
		await this.saveScanIndex(entries.map((entry) => ({ ...entry, mtime: 0 })));
	}

	async scanVaultEpubs(): Promise<EpubScanIndexEntry[]> {
		const entries = await this.scanVaultBookshelfEntries();
		await this.saveScanIndex(entries);
		return entries;
	}

	async rebuildBookshelfIndex(folderPath?: string): Promise<EpubBookshelfIndexEntry[]> {
		const normalizedFolder = this.normalizeScanFolderScope(folderPath);
		const entries = await this.scanVaultBookshelfEntries(normalizedFolder);

		await this.syncFolderBookshelfIndex(normalizedFolder, entries);
		return entries.map((entry) => this.toBookshelfIndexEntry(entry));
	}

	async loadBookshelfEntriesForFolder(folderPath: string): Promise<EpubBookshelfIndexEntry[]> {
		const normalizedFolder = this.normalizeScanFolderScope(folderPath);
		if (!normalizedFolder) {
			return [];
		}

		const cachedEntries = await this.loadScanIndex();
		const filteredCachedEntries = this.filterBookshelfEntriesByFolder(
			cachedEntries,
			normalizedFolder
		);
		const liveEntries = await this.scanVaultBookshelfEntries(normalizedFolder);

		if (!this.areBookshelfEntryListsEqual(filteredCachedEntries, liveEntries)) {
			await this.syncFolderBookshelfIndex(normalizedFolder, liveEntries, cachedEntries);
		}

		return liveEntries.map((entry) => this.toBookshelfIndexEntry(entry));
	}

	private async upsertScanIndexEntry(filePath: string): Promise<void> {
		const normalizedFilePath = normalizePath(filePath || "");
		if (!normalizedFilePath) return;

		const file = this.app.vault.getAbstractFileByPath(normalizedFilePath);
		if (!(file instanceof TFile) || !this.isEpubFile(file)) return;

		const entries = await this.getMutableBookshelfIndexEntries();
		const nextEntry = {
			path: file.path,
			name: file.basename,
			folder: file.parent?.path || "/",
			size: file.stat.size,
			mtime: file.stat.mtime,
		};
		const existingIndex = entries.findIndex((entry) => entry.path === normalizedFilePath);
		if (existingIndex >= 0) {
			entries[existingIndex] = nextEntry;
		} else {
			entries.push(nextEntry);
			entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
		}
		await this.saveScanIndex(entries);
	}

	private async removeScanIndexEntry(filePath: string): Promise<boolean> {
		const normalizedFilePath = normalizePath(filePath || "");
		if (!normalizedFilePath) {
			return false;
		}

		const entries = await this.getMutableBookshelfIndexEntries();
		const nextEntries = entries.filter((entry) => entry.path !== normalizedFilePath);
		if (nextEntries.length === entries.length) {
			return false;
		}

		await this.saveScanIndex(nextEntries);
		return true;
	}

	async getBook(bookId: string): Promise<EpubBook | null> {
		const books = await this.loadBooks();
		return books[bookId] || null;
	}

	async loadBookshelfMembership(): Promise<EpubBookshelfMembershipEntry[]> {
		let entries = await this.readStoredBookshelfMembership();

		if (entries === null) {
			const books = await this.loadBooks();
			const legacyEntries =
				(await this.readStoredBookshelfIndex()) ?? this.buildBookshelfIndexEntriesFromBooks(books);
			entries = this.buildMembershipEntriesFromLegacyData(books, legacyEntries);
			if (entries.length > 0) {
				await this.saveBookshelfMembership(entries);
			}
		}

		const dedupedEntries = Array.from(
			new Map(
				entries
					.map((entry) => ({
						path: normalizePath(entry.path || ""),
						addedAt: typeof entry.addedAt === "number" ? entry.addedAt : 0,
					}))
					.filter((entry) => entry.path)
					.map((entry) => [entry.path, entry] as const)
			).values()
		).sort((a, b) => a.addedAt - b.addedAt || a.path.localeCompare(b.path, "zh-CN"));

		if (dedupedEntries.length !== entries.length) {
			await this.saveBookshelfMembership(dedupedEntries);
		}

		return dedupedEntries;
	}

	async saveBookshelfMembership(entries: EpubBookshelfMembershipEntry[]): Promise<void> {
		await this.ensureDirectories();
		const normalizedEntries = Array.from(
			new Map(
				entries
					.map((entry) => ({
						path: normalizePath(entry.path || ""),
						addedAt: typeof entry.addedAt === "number" ? entry.addedAt : 0,
					}))
					.filter((entry) => entry.path)
					.map((entry) => [entry.path, entry] as const)
			).values()
		).sort((a, b) => a.addedAt - b.addedAt || a.path.localeCompare(b.path, "zh-CN"));
		await this.app.vault.adapter.write(
			this.getBookshelfMembershipPath(),
			JSON.stringify(normalizedEntries)
		);
	}

	async loadSourceRegistry(): Promise<EpubSourceRegistryEntry[]> {
		const entries = await this.readStoredSourceRegistry();
		return entries ?? [];
	}

	async saveSourceRegistry(entries: EpubSourceRegistryEntry[]): Promise<void> {
		await this.ensureDirectories();
		const normalizedEntries = Array.from(
			new Map(
				entries
					.map((entry) => ({
						sourceId: String(entry.sourceId || "").trim(),
						filePath: normalizePath(entry.filePath || ""),
						sourceFingerprint:
							typeof entry.sourceFingerprint === "string"
								? entry.sourceFingerprint
								: undefined,
						sourceSize:
							typeof entry.sourceSize === "number" ? entry.sourceSize : undefined,
						sourceMtime:
							typeof entry.sourceMtime === "number" ? entry.sourceMtime : undefined,
						lastSeenAt:
							typeof entry.lastSeenAt === "number" ? entry.lastSeenAt : Date.now(),
						lastKnownPath:
							typeof entry.lastKnownPath === "string"
								? normalizePath(entry.lastKnownPath)
								: undefined,
					}))
					.filter((entry) => entry.sourceId)
					.map((entry) => [entry.sourceId, entry] as const)
			).values()
		).sort((a, b) => a.lastSeenAt - b.lastSeenAt || a.sourceId.localeCompare(b.sourceId, "zh-CN"));

		this.markInternalWrite();
		await this.app.vault.adapter.write(this.getSourceRegistryPath(), JSON.stringify(normalizedEntries));
	}

	private generateSourceId(): string {
		return `epubsrc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	}

	private async computeSourceFingerprint(filePath: string): Promise<string | undefined> {
		const normalizedPath = normalizePath(filePath || "");
		if (!normalizedPath) {
			return undefined;
		}

		const adapter = this.app.vault.adapter as {
			readBinary?: (path: string) => Promise<ArrayBuffer | Uint8Array>;
		};
		if (typeof adapter.readBinary !== "function" || typeof crypto?.subtle?.digest !== "function") {
			return undefined;
		}

		try {
			const binary = await adapter.readBinary(normalizedPath);
			const input =
				binary instanceof Uint8Array ? binary : new Uint8Array(binary as ArrayBuffer);
			const buffer = input.buffer.slice(
				input.byteOffset,
				input.byteOffset + input.byteLength
			) as ArrayBuffer;
			const digest = await crypto.subtle.digest("SHA-256", buffer);
			return Array.from(new Uint8Array(digest))
				.map((value) => value.toString(16).padStart(2, "0"))
				.join("");
		} catch (error) {
			logger.debug("[EpubStorageService] Failed to compute EPUB source fingerprint:", {
				filePath: normalizedPath,
				error,
			});
			return undefined;
		}
	}

	private async buildSourceRegistryEntry(
		filePath: string,
		sourceId: string,
		sourceFingerprint?: string
	): Promise<EpubSourceRegistryEntry | null> {
		const normalizedPath = normalizePath(filePath || "");
		if (!normalizedPath || !(await this.hasExistingEpubFile(normalizedPath))) {
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		const now = Date.now();
		let sourceSize = file instanceof TFile ? file.stat.size : undefined;
		let sourceMtime = file instanceof TFile ? file.stat.mtime : undefined;

		if (
			(sourceSize === undefined || sourceMtime === undefined) &&
			typeof (this.app.vault.adapter as {
				stat?: (path: string) => Promise<{ size?: number; mtime?: number }>;
			}).stat === "function"
		) {
			try {
				const stat = await (
					this.app.vault.adapter as {
						stat: (path: string) => Promise<{ size?: number; mtime?: number }>;
					}
				).stat(normalizedPath);
				if (sourceSize === undefined && typeof stat?.size === "number") {
					sourceSize = stat.size;
				}
				if (sourceMtime === undefined && typeof stat?.mtime === "number") {
					sourceMtime = stat.mtime;
				}
			} catch {
				// noop
			}
		}

		return {
			sourceId,
			filePath: normalizedPath,
			sourceFingerprint,
			sourceSize,
			sourceMtime,
			lastSeenAt: now,
			lastKnownPath: normalizedPath,
		};
	}

	private async getExistingEpubFileStat(
		filePath: string
	): Promise<{ size?: number; mtime?: number } | null> {
		const normalizedPath = normalizePath(filePath || "");
		if (!normalizedPath || !(await this.hasExistingEpubFile(normalizedPath))) {
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		let size = file instanceof TFile ? file.stat.size : undefined;
		let mtime = file instanceof TFile ? file.stat.mtime : undefined;

		if (
			(size === undefined || mtime === undefined) &&
			typeof (this.app.vault.adapter as {
				stat?: (path: string) => Promise<{ size?: number; mtime?: number }>;
			}).stat === "function"
		) {
			try {
				const stat = await (
					this.app.vault.adapter as {
						stat: (path: string) => Promise<{ size?: number; mtime?: number }>;
					}
				).stat(normalizedPath);
				if (size === undefined && typeof stat?.size === "number") {
					size = stat.size;
				}
				if (mtime === undefined && typeof stat?.mtime === "number") {
					mtime = stat.mtime;
				}
			} catch {
				// noop
			}
		}

		return { size, mtime };
	}

	async ensureSourceIdentity(
		filePath: string,
		options: { preferredSourceId?: string } = {}
	): Promise<EpubSourceRegistryEntry | null> {
		const normalizedPath = normalizePath(filePath || "");
		if (!normalizedPath || !(await this.hasExistingEpubFile(normalizedPath))) {
			return null;
		}

		const registry = await this.loadSourceRegistry();
		const byPath = registry.find((entry) => entry.filePath === normalizedPath);
		const byPreferredId = options.preferredSourceId
			? registry.find((entry) => entry.sourceId === options.preferredSourceId)
			: undefined;
		const currentStat = await this.getExistingEpubFileStat(normalizedPath);
		const matchesCurrentStat = (entry?: EpubSourceRegistryEntry): boolean =>
			Boolean(
				entry &&
					currentStat &&
					entry.filePath === normalizedPath &&
					entry.sourceSize === currentStat.size &&
					entry.sourceMtime === currentStat.mtime
			);

		if (matchesCurrentStat(byPreferredId)) {
			return byPreferredId || null;
		}

		if (matchesCurrentStat(byPath)) {
			return byPath || null;
		}

		const sourceFingerprint = await this.computeSourceFingerprint(normalizedPath);
		const byFingerprint =
			sourceFingerprint
				? registry.find(
						(entry) =>
							entry.sourceFingerprint &&
							entry.sourceFingerprint === sourceFingerprint
				  )
				: undefined;

		const target = byPreferredId || byPath || byFingerprint;
		const sourceId = target?.sourceId || this.generateSourceId();
		const nextEntry = await this.buildSourceRegistryEntry(normalizedPath, sourceId, sourceFingerprint);
		if (!nextEntry) {
			return null;
		}

		const unchanged =
			target &&
			target.sourceId === nextEntry.sourceId &&
			target.filePath === nextEntry.filePath &&
			target.sourceFingerprint === nextEntry.sourceFingerprint &&
			target.sourceSize === nextEntry.sourceSize &&
			target.sourceMtime === nextEntry.sourceMtime &&
			target.lastKnownPath === nextEntry.lastKnownPath;
		if (unchanged) {
			return target;
		}

		const nextRegistry = registry.filter((entry) => entry.sourceId !== sourceId);
		nextRegistry.push(nextEntry);
		await this.saveSourceRegistry(nextRegistry);
		return nextEntry;
	}

	async resolveSourceFilePath(sourceId?: string, fallbackFilePath?: string): Promise<string | null> {
		const normalizedFallback = normalizePath(fallbackFilePath || "");
		if (sourceId) {
			const registry = await this.loadSourceRegistry();
			const registryEntry = registry.find((entry) => entry.sourceId === sourceId);
			if (registryEntry?.filePath && (await this.hasExistingEpubFile(registryEntry.filePath))) {
				return registryEntry.filePath;
			}

			if (normalizedFallback && (await this.hasExistingEpubFile(normalizedFallback))) {
				await this.ensureSourceIdentity(normalizedFallback, { preferredSourceId: sourceId });
				return normalizedFallback;
			}
		}

		if (normalizedFallback && (await this.hasExistingEpubFile(normalizedFallback))) {
			return normalizedFallback;
		}

		return null;
	}

	async listBookshelfEntries(): Promise<EpubBookshelfIndexEntry[]> {
		await this.pruneMissingBooks();
		const membership = await this.loadBookshelfMembership();
		if (membership.length === 0) {
			return [];
		}

		const scanEntries = await this.loadScanIndex();
		const scanEntryMap = new Map(scanEntries.map((entry) => [entry.path, entry] as const));
		const synthesizedEntries: EpubScanIndexEntry[] = [];
		const resultEntries: EpubBookshelfIndexEntry[] = [];

		for (const membershipEntry of membership) {
			let scanEntry = scanEntryMap.get(membershipEntry.path);
			if (!scanEntry && (await this.hasExistingEpubFile(membershipEntry.path))) {
				scanEntry = await this.createScanIndexEntryFromPath(membershipEntry.path);
				scanEntryMap.set(scanEntry.path, scanEntry);
				synthesizedEntries.push(scanEntry);
			}
			if (scanEntry) {
				resultEntries.push(this.toBookshelfIndexEntry(scanEntry));
			}
		}

		if (synthesizedEntries.length > 0) {
			await this.saveScanIndex(scanEntries.concat(synthesizedEntries));
		}

		return resultEntries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
	}

	async addBooksToBookshelf(paths: string[]): Promise<EpubBookshelfMembershipEntry[]> {
		const normalizedPaths = Array.from(
			new Set(paths.map((path) => normalizePath(path || "")).filter(Boolean))
		);
		if (normalizedPaths.length === 0) {
			return [];
		}

		const membership = await this.loadBookshelfMembership();
		const membershipPaths = new Set(membership.map((entry) => entry.path));
		const nextMembership = [...membership];
		const addedEntries: EpubBookshelfMembershipEntry[] = [];
		const scanEntriesToUpsert: EpubScanIndexEntry[] = [];
		const now = Date.now();

		for (let index = 0; index < normalizedPaths.length; index += 1) {
			const path = normalizedPaths[index];
			if (membershipPaths.has(path) || !(await this.hasExistingEpubFile(path))) {
				continue;
			}

			await this.ensureSourceIdentity(path);

			const nextEntry = {
				path,
				addedAt: now + index,
			};
			nextMembership.push(nextEntry);
			addedEntries.push(nextEntry);
			membershipPaths.add(path);
			scanEntriesToUpsert.push(await this.createScanIndexEntryFromPath(path));
		}

		if (addedEntries.length === 0) {
			return [];
		}

		await this.saveBookshelfMembership(nextMembership);
		if (scanEntriesToUpsert.length > 0) {
			const existingEntries = await this.loadScanIndex();
			await this.saveScanIndex(existingEntries.concat(scanEntriesToUpsert));
		}

		return addedEntries;
	}

	async ensureBookOnBookshelf(filePath: string): Promise<void> {
		await this.addBooksToBookshelf([filePath]);
	}

	async findBookByFilePath(filePath: string): Promise<EpubBook | null> {
		const normalizedFilePath = normalizePath(filePath || "");
		const books = await this.loadBooks();
		for (const book of Object.values(books)) {
			if (normalizePath(book.filePath || "") === normalizedFilePath) {
				return book;
			}
		}
		return null;
	}

	async findBookBySourceId(sourceId: string): Promise<EpubBook | null> {
		const normalizedSourceId = String(sourceId || "").trim();
		if (!normalizedSourceId) {
			return null;
		}

		const books = await this.loadBooks();
		for (const book of Object.values(books)) {
			if (book.sourceId === normalizedSourceId) {
				return book;
			}
		}
		return null;
	}

	async updateBookFileReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(oldPath || "");
		const normalizedNewPath = normalizePath(newPath || "");
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const books = await this.loadBooks();
		let updated = 0;
		let changed = false;

		for (const book of Object.values(books)) {
			const remapped = this.remapPath(book.filePath, normalizedOldPath, normalizedNewPath);
			if (!remapped || remapped === book.filePath) {
				continue;
			}

			book.filePath = remapped;
			updated += 1;
			changed = true;
		}

		if (changed) {
			await this.writeBooksWithLock(books);
		}

		await this.updateSourceRegistryReferences(normalizedOldPath, normalizedNewPath);
		await this.updateBookshelfMembershipReferences(normalizedOldPath, normalizedNewPath);
		await this.updateBookshelfIndexReferences(normalizedOldPath, normalizedNewPath);

		return updated;
	}

	private async updateSourceRegistryReferences(oldPath: string, newPath: string): Promise<number> {
		const registry = await this.loadSourceRegistry();
		let changed = false;
		let updated = 0;

		const nextRegistry = registry.map((entry) => {
			const remappedPath = this.remapPath(entry.filePath, oldPath, newPath);
			const remappedKnownPath = this.remapPath(entry.lastKnownPath || "", oldPath, newPath);
			if (
				(!remappedPath || remappedPath === entry.filePath) &&
				(!remappedKnownPath || remappedKnownPath === entry.lastKnownPath)
			) {
				return entry;
			}

			changed = true;
			updated += 1;
			return {
				...entry,
				filePath: remappedPath || entry.filePath,
				lastKnownPath: remappedKnownPath || remappedPath || entry.lastKnownPath || entry.filePath,
			};
		});

		if (changed) {
			await this.saveSourceRegistry(nextRegistry);
		}

		return updated;
	}

	private async updateBookshelfMembershipReferences(
		oldPath: string,
		newPath: string
	): Promise<number> {
		const membership = await this.loadBookshelfMembership();
		let changed = false;
		let updated = 0;

		const nextMembership = membership.map((entry) => {
			const remappedPath = this.remapPath(entry.path, oldPath, newPath);
			if (!remappedPath || remappedPath === entry.path) {
				return entry;
			}

			changed = true;
			updated += 1;
			return {
				...entry,
				path: remappedPath,
			};
		});

		if (changed) {
			await this.saveBookshelfMembership(nextMembership);
		}

		return updated;
	}

	private async updateBookshelfIndexReferences(oldPath: string, newPath: string): Promise<number> {
		const entries = await this.getMutableBookshelfIndexEntries();
		let updated = 0;
		let changed = false;

		const nextEntries = entries.map((entry) => {
			const remappedPath = this.remapPath(entry.path, oldPath, newPath);
			if (!remappedPath || remappedPath === entry.path) {
				return entry;
			}

			updated += 1;
			changed = true;
			const file = this.app.vault.getAbstractFileByPath(remappedPath);
			const slashIndex = remappedPath.lastIndexOf("/");

			return {
				path: remappedPath,
				name:
					file instanceof TFile
						? file.basename
						: remappedPath
								.split("/")
								.pop()
								?.replace(/\.epub$/i, "") || entry.name,
				folder:
					file instanceof TFile
						? file.parent?.path || "/"
						: slashIndex >= 0
						? remappedPath.slice(0, slashIndex) || "/"
						: "/",
				size: file instanceof TFile ? file.stat.size : entry.size,
				mtime: file instanceof TFile ? file.stat.mtime : entry.mtime,
			};
		});

		if (!changed) {
			return 0;
		}

		const dedupedEntries = Array.from(
			new Map(nextEntries.map((entry) => [entry.path, entry] as const)).values()
		).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

		await this.saveScanIndex(dedupedEntries);
		return updated;
	}

	async pruneMissingBooks(): Promise<{ removedBookIds: string[]; removedPaths: string[] }> {
		const books = await this.loadBooks();
		const removedBookIds: string[] = [];
		const removedPaths: string[] = [];
		let changed = false;

		for (const [bookId, book] of Object.entries(books)) {
			if (await this.hasExistingEpubFile(book.filePath)) {
				continue;
			}

			removedBookIds.push(bookId);
			removedPaths.push(book.filePath);
			delete books[bookId];
			changed = true;
		}

		if (changed) {
			await this.writeBooksWithLock(books);

			for (const bookId of removedBookIds) {
				const bookDir = `${this.basePath}/${bookId}`;
				if (await this.app.vault.adapter.exists(bookDir)) {
					await this.app.vault.adapter.rmdir(bookDir, true);
				}
				await this.removeLocalBookState(bookId);
			}
		}

		if (removedPaths.length > 0) {
			await this.detachMissingSourceRegistryPaths(removedPaths);
			const membership = await this.loadBookshelfMembership();
			const nextMembership = membership.filter((entry) => !removedPaths.includes(entry.path));
			if (nextMembership.length !== membership.length) {
				await this.saveBookshelfMembership(nextMembership);
			}

			const scanEntries = await this.loadScanIndex();
			const nextScanEntries = scanEntries.filter((entry) => !removedPaths.includes(entry.path));
			if (nextScanEntries.length !== scanEntries.length) {
				await this.saveScanIndex(nextScanEntries);
			}
		}

		logger.info("[EpubStorageService] Pruned missing EPUB records:", {
			removedBookIds,
			removedPaths,
		});

		return { removedBookIds, removedPaths };
	}

	private async detachMissingSourceRegistryPaths(paths: string[]): Promise<void> {
		const normalizedPaths = new Set(paths.map((path) => normalizePath(path || "")).filter(Boolean));
		if (normalizedPaths.size === 0) {
			return;
		}

		const registry = await this.loadSourceRegistry();
		let changed = false;
		const nextRegistry = registry.map((entry) => {
			if (!normalizedPaths.has(normalizePath(entry.filePath || ""))) {
				return entry;
			}

			changed = true;
			return {
				...entry,
				filePath: "",
				lastKnownPath: entry.filePath || entry.lastKnownPath,
			};
		});

		if (changed) {
			await this.saveSourceRegistry(nextRegistry);
		}
	}

	private async removeLocalBookState(bookId: string): Promise<void> {
		const adapter = this.app.vault.adapter;
		for (const dir of [
			normalizePath(`${this.getLocalReaderStateRoot()}/${bookId}`),
			normalizePath(`${this.getLocalReaderArtifactsRoot()}/${bookId}`),
		]) {
			if (await adapter.exists(dir)) {
				await adapter.rmdir(dir, true);
			}
		}
	}

	private async deleteBook(bookId: string): Promise<void> {
		const books = await this.loadBooks();
		delete books[bookId];
		await this.writeBooksWithLock(books);

		const bookDir = `${this.basePath}/${bookId}`;
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(bookDir)) {
			await adapter.rmdir(bookDir, true);
		}
		await this.removeLocalBookState(bookId);
	}

	private async removeMembershipEntry(filePath: string): Promise<boolean> {
		const normalizedFilePath = normalizePath(filePath || "");
		if (!normalizedFilePath) {
			return false;
		}

		const membership = await this.loadBookshelfMembership();
		const nextMembership = membership.filter((entry) => entry.path !== normalizedFilePath);
		if (nextMembership.length === membership.length) {
			return false;
		}

		await this.saveBookshelfMembership(nextMembership);
		return true;
	}

	async removeBookFromBookshelf(
		filePath: string,
		options: { purgeCache?: boolean } = {}
	): Promise<{ removedBookId: string | null; removedMembership: boolean }> {
		const normalizedFilePath = normalizePath(filePath || "");
		if (!normalizedFilePath) {
			return { removedBookId: null, removedMembership: false };
		}

		const removedMembership = await this.removeMembershipEntry(normalizedFilePath);
		if (!options.purgeCache) {
			return { removedBookId: null, removedMembership };
		}

		const existingBook = await this.findBookByFilePath(normalizedFilePath);
		if (!existingBook) {
			return { removedBookId: null, removedMembership };
		}

		await this.deleteBook(existingBook.id);
		return {
			removedBookId: existingBook.id,
			removedMembership,
		};
	}

	async removeBookByFilePath(
		filePath: string
	): Promise<{ removedBookId: string | null; removedIndexEntry: boolean }> {
		const result = await this.removeBookFromBookshelf(filePath, { purgeCache: true });
		return {
			removedBookId: result.removedBookId,
			removedIndexEntry: result.removedMembership,
		};
	}

	async removeTrackedEpubTarget(targetPath: string): Promise<{
		removedScanEntries: number;
		removedMembershipEntries: number;
		removedBookIds: string[];
	}> {
		const normalizedTargetPath = normalizePath(targetPath || "");
		if (!normalizedTargetPath) {
			return {
				removedScanEntries: 0,
				removedMembershipEntries: 0,
				removedBookIds: [],
			};
		}

		const matchesTarget = (path: string) =>
			path === normalizedTargetPath || path.startsWith(`${normalizedTargetPath}/`);

		const books = await this.loadBooks();
		const removedBookIds: string[] = [];
		const removedBookPaths: string[] = [];
		for (const [bookId, book] of Object.entries(books)) {
			if (!matchesTarget(normalizePath(book.filePath || ""))) {
				continue;
			}
			removedBookIds.push(bookId);
			removedBookPaths.push(normalizePath(book.filePath || ""));
			delete books[bookId];
			const bookDir = `${this.basePath}/${bookId}`;
			if (await this.app.vault.adapter.exists(bookDir)) {
				await this.app.vault.adapter.rmdir(bookDir, true);
			}
			await this.removeLocalBookState(bookId);
		}
		if (removedBookIds.length > 0) {
			await this.writeBooksWithLock(books);
		}

		const scanEntries = await this.loadScanIndex();
		const nextScanEntries = scanEntries.filter((entry) => !matchesTarget(entry.path));
		if (nextScanEntries.length !== scanEntries.length) {
			await this.saveScanIndex(nextScanEntries);
		}

		const membership = await this.loadBookshelfMembership();
		const nextMembership = membership.filter((entry) => !matchesTarget(entry.path));
		if (nextMembership.length !== membership.length) {
			await this.saveBookshelfMembership(nextMembership);
		}

		await this.detachMissingSourceRegistryPaths([
			...scanEntries.filter((entry) => matchesTarget(entry.path)).map((entry) => entry.path),
			...removedBookPaths,
		]);

		return {
			removedScanEntries: scanEntries.length - nextScanEntries.length,
			removedMembershipEntries: membership.length - nextMembership.length,
			removedBookIds,
		};
	}

	async saveProgress(bookId: string, position: ReadingPosition): Promise<void> {
		this._pendingProgress = { bookId, position };
		if (this._progressDebounceTimer) return;
		this._progressDebounceTimer = setTimeout(async () => {
			this._progressDebounceTimer = null;
			const pending = this._pendingProgress;
			if (!pending) return;
			this._pendingProgress = null;
			try {
				const book = await this.getBook(pending.bookId);
				if (book) {
					book.currentPosition = pending.position;
					book.readingStats.lastReadTime = Date.now();
					await this.writeBookState(book.id, {
						currentPosition: book.currentPosition,
						readingStats: book.readingStats,
					});
				}
			} catch (e) {
				logger.warn("[EpubStorageService] saveProgress failed:", e);
			}
		}, 300);
	}

	async flushPendingProgress(): Promise<void> {
		if (this._progressDebounceTimer) {
			clearTimeout(this._progressDebounceTimer);
			this._progressDebounceTimer = null;
		}
		const pending = this._pendingProgress;
		if (pending) {
			this._pendingProgress = null;
			try {
				const book = await this.getBook(pending.bookId);
				if (book) {
					book.currentPosition = pending.position;
					book.readingStats.lastReadTime = Date.now();
					await this.writeBookState(book.id, {
						currentPosition: book.currentPosition,
						readingStats: book.readingStats,
					});
				}
			} catch (_e) {
				logger.warn("[EpubStorageService] flushPendingProgress failed:", _e);
			}
		}
	}

	async loadProgress(bookId: string): Promise<ReadingPosition | null> {
		const book = await this.getBook(bookId);
		return book?.currentPosition || null;
	}

	private async ensureBookDirectory(bookId: string): Promise<void> {
		const bookDir = `${this.basePath}/${bookId}`;
		await DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, bookDir);
	}

	async loadBookmarks(bookId: string): Promise<Bookmark[]> {
		await this.ensureBookDirectory(bookId);
		const bookmarksPath = `${this.basePath}/${bookId}/bookmarks.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(bookmarksPath)) {
			try {
				const content = await adapter.read(bookmarksPath);
				return JSON.parse(content);
			} catch (e) {
				logger.warn("[EpubStorageService] Failed to parse bookmarks.json:", e);
				return [];
			}
		}

		return [];
	}

	async loadLastOpenBookmark(bookId: string): Promise<EpubLastOpenBookmark | null> {
		await this.ensureDirectories();
		const adapter = this.app.vault.adapter;

		for (const bookmarkPath of [
			this.getLastOpenBookmarkPath(bookId),
			this.getLegacyLastOpenBookmarkPath(bookId),
		]) {
			if (!(await adapter.exists(bookmarkPath))) {
				continue;
			}

			try {
				const content = await adapter.read(bookmarkPath);
				const parsed = JSON.parse(content);
				if (!parsed || typeof parsed !== "object") {
					return null;
				}

				return {
					chapterIndex: typeof parsed.chapterIndex === "number" ? parsed.chapterIndex : 0,
					cfi: typeof parsed.cfi === "string" ? parsed.cfi : "",
					percent: typeof parsed.percent === "number" ? parsed.percent : 0,
					title: typeof parsed.title === "string" ? parsed.title : "",
					preview: typeof parsed.preview === "string" ? parsed.preview : "",
					savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
				};
			} catch (error) {
				logger.warn(
					`[EpubStorageService] Failed to parse last-open-bookmark.json from ${bookmarkPath}:`,
					error
				);
			}
		}

		return null;
	}

	async saveLastOpenBookmark(bookId: string, bookmark: EpubLastOpenBookmark): Promise<void> {
		await this.ensureDirectories();
		const bookmarkPath = this.getLastOpenBookmarkPath(bookId);
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, bookmarkPath);
		await this.app.vault.adapter.write(bookmarkPath, JSON.stringify(bookmark));
	}

	async deleteLastOpenBookmark(bookId: string): Promise<void> {
		await this.ensureDirectories();
		const adapter = this.app.vault.adapter as { remove?: (path: string) => Promise<void> };
		for (const bookmarkPath of [
			this.getLastOpenBookmarkPath(bookId),
			this.getLegacyLastOpenBookmarkPath(bookId),
		]) {
			if (!(await this.app.vault.adapter.exists(bookmarkPath))) {
				continue;
			}
			if (typeof adapter.remove === "function") {
				await adapter.remove(bookmarkPath);
				continue;
			}
			await this.app.vault.adapter.write(bookmarkPath, "null");
		}
	}

	async saveBookmarks(bookId: string, bookmarks: Bookmark[]): Promise<void> {
		await this.ensureBookDirectory(bookId);
		const bookmarksPath = `${this.basePath}/${bookId}/bookmarks.json`;
		await this.app.vault.adapter.write(bookmarksPath, JSON.stringify(bookmarks));
	}

	async addBookmark(bookId: string, bookmark: Bookmark): Promise<void> {
		const bookmarks = await this.loadBookmarks(bookId);
		bookmarks.push(bookmark);
		await this.saveBookmarks(bookId, bookmarks);
	}

	async deleteBookmark(bookId: string, bookmarkId: string): Promise<void> {
		const bookmarks = await this.loadBookmarks(bookId);
		const filtered = bookmarks.filter((b) => b.id !== bookmarkId);
		await this.saveBookmarks(bookId, filtered);
	}

	async loadHighlights(bookId: string): Promise<Highlight[]> {
		await this.ensureBookDirectory(bookId);
		const highlightsPath = `${this.basePath}/${bookId}/highlights.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(highlightsPath)) {
			try {
				const content = await adapter.read(highlightsPath);
				return this.normalizeHighlights(JSON.parse(content));
			} catch (e) {
				logger.warn("[EpubStorageService] Failed to parse highlights.json:", e);
				return [];
			}
		}

		return [];
	}

	async saveHighlights(bookId: string, highlights: Highlight[]): Promise<void> {
		await this.ensureBookDirectory(bookId);
		const highlightsPath = `${this.basePath}/${bookId}/highlights.json`;
		await this.app.vault.adapter.write(
			highlightsPath,
			JSON.stringify(this.normalizeHighlights(highlights))
		);
	}

	async addHighlight(bookId: string, highlight: Highlight): Promise<void> {
		const highlights = await this.loadHighlights(bookId);
		highlights.push({ ...highlight, color: this.normalizeHighlightColor(highlight.color) });
		await this.saveHighlights(bookId, highlights);
	}

	private normalizeHighlightColor(color?: string): Highlight["color"] {
		switch (color) {
			case "blue":
			case "green":
			case "purple":
			case "red":
				return color;
			case "pink":
				return "red";
			default:
				return "yellow";
		}
	}

	private normalizeHighlights(highlights: unknown): Highlight[] {
		if (!Array.isArray(highlights)) {
			return [];
		}
		return highlights
			.filter((item): item is Highlight => Boolean(item && typeof item === "object"))
			.map((item) => ({
				...item,
				color: this.normalizeHighlightColor((item as Highlight).color),
			}));
	}

	async deleteHighlight(bookId: string, highlightId: string): Promise<void> {
		const highlights = await this.loadHighlights(bookId);
		const filtered = highlights.filter((h) => h.id !== highlightId);
		await this.saveHighlights(bookId, filtered);
	}

	async loadConcealedTexts(bookId: string): Promise<ConcealedText[]> {
		await this.ensureDirectories();
		const adapter = this.app.vault.adapter;

		for (const concealedTextsPath of [
			this.getConcealedTextsPath(bookId),
			this.getLegacyConcealedTextsPath(bookId),
		]) {
			if (!(await adapter.exists(concealedTextsPath))) {
				continue;
			}

			try {
				const content = await adapter.read(concealedTextsPath);
				return this.normalizeConcealedTexts(JSON.parse(content));
			} catch (e) {
				logger.warn(
					`[EpubStorageService] Failed to parse concealed-texts.json from ${concealedTextsPath}:`,
					e
				);
			}
		}

		return [];
	}

	async saveConcealedTexts(bookId: string, concealedTexts: ConcealedText[]): Promise<void> {
		await this.ensureDirectories();
		const concealedTextsPath = this.getConcealedTextsPath(bookId);
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, concealedTextsPath);
		await this.app.vault.adapter.write(
			concealedTextsPath,
			JSON.stringify(this.normalizeConcealedTexts(concealedTexts))
		);
	}

	async addConcealedText(bookId: string, concealedText: ConcealedText): Promise<void> {
		const concealedTexts = await this.loadConcealedTexts(bookId);
		const existingIndex = concealedTexts.findIndex(
			(item) => item.cfiRange === concealedText.cfiRange
		);
		const normalizedItem = {
			...concealedText,
			mode: this.normalizeConcealedTextMode(concealedText.mode),
		};
		if (existingIndex >= 0) {
			concealedTexts[existingIndex] = normalizedItem;
		} else {
			concealedTexts.push(normalizedItem);
		}
		await this.saveConcealedTexts(bookId, concealedTexts);
	}

	async deleteConcealedText(bookId: string, concealedTextId: string): Promise<void> {
		const concealedTexts = await this.loadConcealedTexts(bookId);
		const filtered = concealedTexts.filter((item) => item.id !== concealedTextId);
		await this.saveConcealedTexts(bookId, filtered);
	}

	async deleteConcealedTextByCfi(bookId: string, cfiRange: string): Promise<void> {
		const concealedTexts = await this.loadConcealedTexts(bookId);
		const filtered = concealedTexts.filter((item) => item.cfiRange !== cfiRange);
		await this.saveConcealedTexts(bookId, filtered);
	}

	private normalizeConcealedTextMode(mode?: string): ConcealedText["mode"] {
		switch (mode) {
			default:
				return "mask";
		}
	}

	private normalizeConcealedTexts(concealedTexts: unknown): ConcealedText[] {
		if (!Array.isArray(concealedTexts)) {
			return [];
		}

		return concealedTexts
			.filter((item): item is ConcealedText => Boolean(item && typeof item === "object"))
			.map((item) => ({
				...item,
				mode: this.normalizeConcealedTextMode((item as ConcealedText).mode),
			}));
	}

	async loadNotes(bookId: string): Promise<Note[]> {
		await this.ensureBookDirectory(bookId);
		const notesPath = `${this.basePath}/${bookId}/notes.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(notesPath)) {
			try {
				const content = await adapter.read(notesPath);
				return JSON.parse(content);
			} catch (e) {
				logger.warn("[EpubStorageService] Failed to parse notes.json:", e);
				return [];
			}
		}

		return [];
	}

	async saveNotes(bookId: string, notes: Note[]): Promise<void> {
		await this.ensureBookDirectory(bookId);
		const notesPath = `${this.basePath}/${bookId}/notes.json`;
		await this.app.vault.adapter.write(notesPath, JSON.stringify(notes));
	}

	async addNote(bookId: string, note: Note): Promise<void> {
		const notes = await this.loadNotes(bookId);
		notes.push(note);
		await this.saveNotes(bookId, notes);
	}

	async updateNote(bookId: string, noteId: string, content: string): Promise<void> {
		const notes = await this.loadNotes(bookId);
		const note = notes.find((n) => n.id === noteId);
		if (note) {
			note.content = content;
			note.modifiedTime = Date.now();
			await this.saveNotes(bookId, notes);
		}
	}

	async deleteNote(bookId: string, noteId: string): Promise<void> {
		const notes = await this.loadNotes(bookId);
		const filtered = notes.filter((n) => n.id !== noteId);
		await this.saveNotes(bookId, filtered);
	}

	async getCanvasBinding(bookId: string): Promise<string | null> {
		const bindings = await this.loadCanvasBindings();
		return bindings[bookId] || null;
	}

	async setCanvasBinding(bookId: string, canvasPath: string): Promise<void> {
		const bindings = await this.loadCanvasBindings();
		bindings[bookId] = canvasPath;
		await this.saveCanvasBindings(bindings);
	}

	async updateCanvasBindingReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(oldPath || "");
		const normalizedNewPath = normalizePath(newPath || "");
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const bindings = await this.loadCanvasBindings();
		let updated = 0;
		let changed = false;

		for (const [bookId, canvasPath] of Object.entries(bindings)) {
			const remapped = this.remapPath(canvasPath, normalizedOldPath, normalizedNewPath);
			if (!remapped || remapped === canvasPath) {
				continue;
			}

			bindings[bookId] = remapped;
			updated += 1;
			changed = true;
		}

		if (changed) {
			await this.saveCanvasBindings(bindings);
		}

		return updated;
	}

	async removeCanvasBinding(bookId: string): Promise<void> {
		const bindings = await this.loadCanvasBindings();
		delete bindings[bookId];
		await this.saveCanvasBindings(bindings);
	}

	async loadExcerptSettings(): Promise<EpubExcerptSettings> {
		await this.ensureDirectories();
		const settingsPath = `${this.basePath}/excerpt-settings.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(settingsPath)) {
			try {
				const content = await adapter.read(settingsPath);
				return { ...DEFAULT_EXCERPT_SETTINGS, ...JSON.parse(content) };
			} catch {
				return { ...DEFAULT_EXCERPT_SETTINGS };
			}
		}
		return { ...DEFAULT_EXCERPT_SETTINGS };
	}

	async saveExcerptSettings(settings: EpubExcerptSettings): Promise<void> {
		await this.ensureDirectories();
		const settingsPath = `${this.basePath}/excerpt-settings.json`;
		await this.app.vault.adapter.write(settingsPath, JSON.stringify(settings));
	}

	async loadReaderSettings(): Promise<EpubReaderSettings> {
		await this.ensureDirectories();
		const adapter = this.app.vault.adapter;

		for (const settingsPath of [
			this.getReaderSettingsPathForCurrentDevice(),
			this.getLegacyReaderSettingsPathForCurrentDevice(),
			this.getLegacyReaderSettingsPath(),
		]) {
			if (!(await adapter.exists(settingsPath))) {
				continue;
			}

			try {
				const content = await adapter.read(settingsPath);
				return this.normalizeLoadedReaderSettings(JSON.parse(content));
			} catch {
				return { ...this.getDefaultReaderSettingsForCurrentDevice() };
			}
		}

		return { ...this.getDefaultReaderSettingsForCurrentDevice() };
	}

	async saveReaderSettings(settings: EpubReaderSettings): Promise<void> {
		await this.ensureDirectories();
		const settingsPath = this.getReaderSettingsPathForCurrentDevice();
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, settingsPath);
		await this.app.vault.adapter.write(settingsPath, JSON.stringify(settings));
	}

	private getDefaultReaderSettingsForCurrentDevice(): EpubReaderSettings {
		return Platform.isMobile
			? { ...DEFAULT_MOBILE_READER_SETTINGS }
			: { ...DEFAULT_READER_SETTINGS };
	}

	private normalizeLoadedReaderSettings(settings: Partial<EpubReaderSettings>): EpubReaderSettings {
		const mergedSettings = {
			...this.getDefaultReaderSettingsForCurrentDevice(),
			...settings,
		};

		if (!Platform.isMobile && this.matchesLegacyDesktopReaderSettings(mergedSettings)) {
			return { ...DEFAULT_READER_SETTINGS };
		}

		if (Platform.isMobile) {
			if (this.matchesLegacyForcedMobileReaderSettings(mergedSettings)) {
				return { ...DEFAULT_MOBILE_READER_SETTINGS };
			}

			return {
				...mergedSettings,
				layoutMode: "paginated",
				flowMode: "scrolled",
			};
		}

		return mergedSettings;
	}

	private matchesLegacyForcedMobileReaderSettings(settings: EpubReaderSettings): boolean {
		return (
			settings.lineHeight === LEGACY_FORCED_MOBILE_READER_SETTINGS.lineHeight &&
			settings.theme === LEGACY_FORCED_MOBILE_READER_SETTINGS.theme &&
			settings.widthMode === LEGACY_FORCED_MOBILE_READER_SETTINGS.widthMode &&
			settings.layoutMode === LEGACY_FORCED_MOBILE_READER_SETTINGS.layoutMode &&
			settings.flowMode === LEGACY_FORCED_MOBILE_READER_SETTINGS.flowMode &&
			settings.showScrolledSideNav === LEGACY_FORCED_MOBILE_READER_SETTINGS.showScrolledSideNav
		);
	}

	private matchesLegacyDesktopReaderSettings(settings: EpubReaderSettings): boolean {
		return (
			settings.lineHeight === LEGACY_DESKTOP_READER_SETTINGS.lineHeight &&
			settings.theme === LEGACY_DESKTOP_READER_SETTINGS.theme &&
			settings.widthMode === LEGACY_DESKTOP_READER_SETTINGS.widthMode &&
			settings.layoutMode === LEGACY_DESKTOP_READER_SETTINGS.layoutMode &&
			settings.flowMode === LEGACY_DESKTOP_READER_SETTINGS.flowMode &&
			settings.showScrolledSideNav === LEGACY_DESKTOP_READER_SETTINGS.showScrolledSideNav
		);
	}

	private getReaderSettingsPathForCurrentDevice(): string {
		const suffix = Platform.isMobile ? "mobile" : "desktop";
		return normalizePath(`${this.getLocalReaderStateRoot()}/reader-settings.${suffix}.json`);
	}

	private getLegacyReaderSettingsPathForCurrentDevice(): string {
		const suffix = Platform.isMobile ? "mobile" : "desktop";
		return `${this.basePath}/reader-settings.${suffix}.json`;
	}

	private getLegacyReaderSettingsPath(): string {
		return `${this.basePath}/reader-settings.json`;
	}

	private async loadCanvasBindings(): Promise<Record<string, string>> {
		await this.ensureDirectories();
		const bindingsPath = `${this.basePath}/canvas-bindings.json`;
		const adapter = this.app.vault.adapter;

		if (await adapter.exists(bindingsPath)) {
			try {
				const content = await adapter.read(bindingsPath);
				return JSON.parse(content);
			} catch {
				return {};
			}
		}
		return {};
	}

	private async saveCanvasBindings(bindings: Record<string, string>): Promise<void> {
		await this.ensureDirectories();
		const bindingsPath = `${this.basePath}/canvas-bindings.json`;
		await this.app.vault.adapter.write(bindingsPath, JSON.stringify(bindings));
	}

	private remapPath(filePath: string, oldPath: string, newPath: string): string | null {
		const normalizedFilePath = normalizePath(filePath || "");
		if (!normalizedFilePath) {
			return null;
		}

		if (normalizedFilePath === oldPath) {
			return newPath;
		}

		if (normalizedFilePath.startsWith(`${oldPath}/`)) {
			return `${newPath}${normalizedFilePath.slice(oldPath.length)}`;
		}

		return null;
	}
}

export interface EpubExcerptSettings {
	addCreationTime: boolean;
}

const DEFAULT_EXCERPT_SETTINGS: EpubExcerptSettings = {
	addCreationTime: false,
};

const DEFAULT_READER_SETTINGS: EpubReaderSettings = {
	lineHeight: 1.72,
	theme: "default",
	widthMode: "standard",
	layoutMode: "paginated",
	flowMode: "paginated",
	showScrolledSideNav: true,
};

const DEFAULT_MOBILE_READER_SETTINGS: EpubReaderSettings = {
	...DEFAULT_READER_SETTINGS,
	lineHeight: 1.66,
	widthMode: "full",
	flowMode: "scrolled",
};

const LEGACY_DESKTOP_READER_SETTINGS: EpubReaderSettings = {
	lineHeight: 1.9,
	theme: "default",
	widthMode: "full",
	layoutMode: "paginated",
	flowMode: "paginated",
	showScrolledSideNav: true,
};

const LEGACY_FORCED_MOBILE_READER_SETTINGS: EpubReaderSettings = {
	...DEFAULT_READER_SETTINGS,
	lineHeight: 1.66,
	widthMode: "full",
};
