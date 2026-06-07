import { type App, TAbstractFile, TFile } from "obsidian";
import { Platform, normalizePath } from "obsidian";
import {
	getPluginPathsById,
	LEGACY_PATHS,
	getV2Paths,
	normalizeWeaveParentFolder,
} from "../../config/paths";
import { DirectoryUtils } from "../../utils/directory-utils";
import { readUnknownProperty, readUnknownString } from "../../utils/dynamic-access";
import { logger } from "../../utils/logger";
import { getPluginInstance } from "../../utils/plugin-runtime";
import { isRecord } from "../../utils/typed-json";
import {
	DEFAULT_MOBILE_READER_SETTINGS,
	DEFAULT_READER_SETTINGS,
	getDefaultEpubReaderSettings,
	normalizeEpubReaderSettingsForDevice,
	type EpubReaderSettingsDeviceKind,
} from "./reader-settings";
import {
	isSupportedBookFile,
	isSupportedBookPath,
	stripSupportedBookExtension,
} from "./book-format";
import type {
	BookMetadata,
	ConcealedText,
	EpubBook,
	EpubLastOpenBookmark,
	EpubReadingReferencePoint,
	EpubReaderSettings,
	ReadingPosition,
	ReadingStats,
	EpubStrikethroughDisplayMode,
} from "./types";
import { getEpubRuntime } from "./epub-runtime";

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

interface EpubStoredBookDescriptor {
	id: string;
	filePath: string;
	sourceId?: string;
	sourceFingerprint?: string;
	sourceMtime?: number;
	sourceSize?: number;
	metadata: BookMetadata;
}

interface EpubReaderLocalBookRecord {
	descriptor?: EpubStoredBookDescriptor;
	state?: Pick<EpubBook, "currentPosition" | "readingStats">;
	lastOpenBookmark?: EpubLastOpenBookmark | null;
	readingReferencePoint?: EpubReadingReferencePoint | null;
	concealedTexts?: ConcealedText[];
}

interface EpubReaderLocalDataFile {
	version: 1;
	updatedAt: number;
	bookCatalogStoredLocally?: boolean;
	readerSettings?: Partial<Record<EpubReaderSettingsDeviceKind, EpubReaderSettings>>;
	excerptSettings?: EpubExcerptSettings;
	scanIndex?: EpubScanIndexEntry[];
	bookshelfMembership?: EpubBookshelfMembershipEntry[];
	sourceRegistry?: EpubSourceRegistryEntry[];
	canvasBindings?: Record<string, string>;
	books?: Record<string, EpubReaderLocalBookRecord>;
}

export interface EpubLocalDataMigrationInspection {
	hasUnifiedDataFile: boolean;
	legacyFileCount: number;
	legacyFiles: string[];
}

export interface EpubLocalDataMigrationReport {
	migratedSectionCount: number;
	removedLegacyFileCount: number;
	remainingLegacyFiles: string[];
	failures: Array<{ path: string; message: string }>;
}

export const DEFAULT_EPUB_BOOKSHELF_SETTINGS: EpubBookshelfSettings = {
	lastScanAt: 0,
};

export class EpubStorageService {
	private app: App;
	private basePath: string;
	private localPluginId: string;
	private _progressDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _pendingProgress: { bookId: string; position: ReadingPosition } | null = null;
	private _booksCache: Record<string, EpubBook> | null = null;
	private _booksWriteLock: Promise<void> = Promise.resolve();
	private _bookStateWriteLocks = new Map<string, Promise<void>>();
	private _localReaderDataCache: EpubReaderLocalDataFile | null = null;
	private _localReaderDataWriteLock: Promise<void> = Promise.resolve();

	constructor(app: App) {
		this.app = app;
		const runtime = getEpubRuntime();
		this.localPluginId = runtime.pluginDirName;
		const pluginCandidates = [...runtime.collaboratorHostPluginIds, runtime.pluginId]
			.filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index)
			.map((pluginId) => getPluginInstance(app, pluginId));
		const parentFolder = normalizeWeaveParentFolder(
			pluginCandidates
				.map((plugin) => {
					const settings = readUnknownProperty(plugin, "settings");
					return isRecord(settings) ? readUnknownString(settings, "weaveParentFolder") : undefined;
				})
				.find((folder): folder is string => Boolean(folder))
		);
		this.basePath = getV2Paths(parentFolder).ir.epub;
	}

	getApp(): App {
		return this.app;
	}

	async ensureDirectories(): Promise<void> {
		await Promise.all([this.ensureSyncBaseDirectory(), this.ensureUnifiedLocalDataDirectory()]);
	}

	private async ensureSyncBaseDirectory(): Promise<void> {
		await DirectoryUtils.ensureDirRecursive(this.app.vault.adapter, this.basePath);
	}

	private async ensureUnifiedLocalDataDirectory(): Promise<void> {
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, this.getUnifiedLocalDataPath());
	}

	async loadBooks(): Promise<Record<string, EpubBook>> {
		if (this._booksCache) return this._booksCache;
		const { books: localBooks, authoritative } = await this.readBooksFromUnifiedLocalData();
		if (authoritative) {
			this._booksCache = localBooks;
			await this.hydrateBookStates(localBooks);
			return this._booksCache;
		}
		const legacyBooks = await this.readLegacyBooks();
		const books = {
			...legacyBooks,
			...localBooks,
		};

		if (Object.keys(books).length > 0) {
			this._booksCache = books;
			await this.hydrateBookStates(books);
			return this._booksCache;
		}

		this._booksCache = {};
		return this._booksCache;
	}

	private async writeBooksWithLock(books: Record<string, EpubBook>): Promise<void> {
		const doWrite = async () => {
			this._booksCache = books;
			await this.updateUnifiedLocalReaderData((localData) => {
				const existingRecords = localData.books || {};
				const nextRecords: Record<string, EpubReaderLocalBookRecord> = {};

				for (const [bookId, record] of Object.entries(existingRecords)) {
					if (Object.prototype.hasOwnProperty.call(books, bookId)) {
						continue;
					}

					const retained: EpubReaderLocalBookRecord = { ...record };
					delete retained.descriptor;
					if (this.hasRetainedLocalBookData(retained)) {
						nextRecords[bookId] = retained;
					}
				}

				for (const [bookId, book] of Object.entries(books)) {
					const current = existingRecords[bookId] || {};
					nextRecords[bookId] = {
						...current,
						descriptor: this.toStoredBookDescriptor(book),
						state: {
							currentPosition: book.currentPosition,
							readingStats: book.readingStats,
						},
					};
				}

				localData.bookCatalogStoredLocally = true;
				localData.books = nextRecords;
			});
		};
		this._booksWriteLock = this._booksWriteLock.then(doWrite, doWrite);
		await this._booksWriteLock;
	}

	private getLocalReaderStateRoot(): string {
		return normalizePath(
			`${getPluginPathsById(this.app as unknown, this.localPluginId).state.incrementalReading.readerState}/epub`
		);
	}

	private getUnifiedLocalDataPath(): string {
		return normalizePath(
			`${getPluginPathsById(this.app as unknown, this.localPluginId).state.incrementalReading.epubReaderData}`
		);
	}

	private getLocalReaderArtifactsRoot(): string {
		return normalizePath(
			`${getPluginPathsById(this.app as unknown, this.localPluginId).cache.incrementalReading.readerArtifacts}/epub`
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

	private getLegacyEpubBasePaths(): string[] {
		return Array.from(
			new Set([
				normalizePath(this.basePath),
				normalizePath(LEGACY_PATHS.epubReading),
			])
		).filter(Boolean);
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

	private getCurrentDeviceKind(): EpubReaderSettingsDeviceKind {
		return Platform.isMobile ? "mobile" : "desktop";
	}

	private createEmptyLocalReaderData(): EpubReaderLocalDataFile {
		return {
			version: 1,
			updatedAt: 0,
			bookCatalogStoredLocally: false,
			readerSettings: {},
			canvasBindings: {},
			books: {},
		};
	}

	private cloneLocalReaderData(data: EpubReaderLocalDataFile): EpubReaderLocalDataFile {
		return JSON.parse(JSON.stringify(data)) as EpubReaderLocalDataFile;
	}

	private normalizeReadingPosition(value: unknown): ReadingPosition | undefined {
		if (!value || typeof value !== "object") {
			return undefined;
		}

		const position = value as Partial<ReadingPosition>;
		return {
			chapterIndex: typeof position.chapterIndex === "number" ? position.chapterIndex : 0,
			cfi: typeof position.cfi === "string" ? position.cfi : "",
			percent: typeof position.percent === "number" ? position.percent : 0,
		};
	}

	private normalizeReadingStats(value: unknown): ReadingStats | undefined {
		if (!value || typeof value !== "object") {
			return undefined;
		}

		const stats = value as Partial<ReadingStats>;
		return {
			totalReadTime: typeof stats.totalReadTime === "number" ? stats.totalReadTime : 0,
			lastReadTime: typeof stats.lastReadTime === "number" ? stats.lastReadTime : 0,
			createdTime: typeof stats.createdTime === "number" ? stats.createdTime : 0,
			completedTime:
				typeof stats.completedTime === "number" ? stats.completedTime : undefined,
		};
	}

	private normalizeBookState(
		value: unknown
	): Pick<EpubBook, "currentPosition" | "readingStats"> | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const record = value as Record<string, unknown>;
		const currentPosition = this.normalizeReadingPosition(record.currentPosition);
		const readingStats = this.normalizeReadingStats(record.readingStats);
		if (!currentPosition && !readingStats) {
			return null;
		}

		return {
			currentPosition: currentPosition ?? { chapterIndex: 0, cfi: "", percent: 0 },
			readingStats:
				readingStats ?? { totalReadTime: 0, lastReadTime: 0, createdTime: 0 },
		};
	}

	private normalizeLastOpenBookmark(value: unknown): EpubLastOpenBookmark | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const bookmark = value as Partial<EpubLastOpenBookmark>;
		return {
			chapterIndex: typeof bookmark.chapterIndex === "number" ? bookmark.chapterIndex : 0,
			cfi: typeof bookmark.cfi === "string" ? bookmark.cfi : "",
			percent: typeof bookmark.percent === "number" ? bookmark.percent : 0,
			title: typeof bookmark.title === "string" ? bookmark.title : "",
			preview: typeof bookmark.preview === "string" ? bookmark.preview : "",
			savedAt: typeof bookmark.savedAt === "number" ? bookmark.savedAt : 0,
		};
	}

	private normalizeReadingReferencePoint(value: unknown): EpubReadingReferencePoint | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const point = value as Partial<EpubReadingReferencePoint>;
		return {
			chapterIndex: typeof point.chapterIndex === "number" ? point.chapterIndex : 0,
			cfi: typeof point.cfi === "string" ? point.cfi : "",
			percent: typeof point.percent === "number" ? point.percent : 0,
			title: typeof point.title === "string" ? point.title : "",
			savedAt: typeof point.savedAt === "number" ? point.savedAt : 0,
		};
	}

	private normalizeScanIndexEntries(value: unknown): EpubScanIndexEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.filter((entry): entry is Partial<EpubScanIndexEntry> => Boolean(entry && typeof entry === "object"))
			.map((entry) => ({
				path: normalizePath(String(entry.path || "").trim()),
				name: String(entry.name || "").trim(),
				folder: String(entry.folder || "/").trim() || "/",
				size: typeof entry.size === "number" ? entry.size : 0,
				mtime: typeof entry.mtime === "number" ? entry.mtime : 0,
			}))
			.filter((entry) => Boolean(entry.path));
	}

	private normalizeBookshelfIndexEntries(value: unknown): EpubBookshelfIndexEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.filter((entry): entry is Partial<EpubBookshelfIndexEntry> => Boolean(entry && typeof entry === "object"))
			.map((entry) => ({
				path: normalizePath(String(entry.path || "").trim()),
				name: String(entry.name || "").trim(),
				folder: String(entry.folder || "/").trim() || "/",
				size: typeof entry.size === "number" ? entry.size : 0,
			}))
			.filter((entry) => Boolean(entry.path));
	}

	private normalizeBookshelfMembershipEntries(value: unknown): EpubBookshelfMembershipEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.filter((entry): entry is Partial<EpubBookshelfMembershipEntry> => Boolean(entry && typeof entry === "object"))
			.map((entry) => ({
				path: normalizePath(String(entry.path || "").trim()),
				addedAt: typeof entry.addedAt === "number" ? entry.addedAt : 0,
			}))
			.filter((entry) => Boolean(entry.path));
	}

	private normalizeSourceRegistryEntries(value: unknown): EpubSourceRegistryEntry[] {
		if (!Array.isArray(value)) {
			return [];
		}

		return value
			.filter((entry): entry is Partial<EpubSourceRegistryEntry> => Boolean(entry && typeof entry === "object"))
			.map((entry) => ({
				sourceId: String(entry.sourceId || "").trim(),
				filePath: normalizePath(String(entry.filePath || "").trim()),
				sourceFingerprint: typeof entry.sourceFingerprint === "string" ? entry.sourceFingerprint : undefined,
				sourceSize: typeof entry.sourceSize === "number" ? entry.sourceSize : undefined,
				sourceMtime: typeof entry.sourceMtime === "number" ? entry.sourceMtime : undefined,
				lastSeenAt: typeof entry.lastSeenAt === "number" ? entry.lastSeenAt : 0,
				lastKnownPath: typeof entry.lastKnownPath === "string" ? normalizePath(String(entry.lastKnownPath).trim()) : undefined,
			}))
			.filter((entry) => Boolean(entry.sourceId));
	}

	private normalizeBookMetadata(value: unknown): BookMetadata | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const metadata = value as Partial<BookMetadata>;
		return {
			title: typeof metadata.title === "string" ? metadata.title : "",
			author: typeof metadata.author === "string" ? metadata.author : "",
			publisher: typeof metadata.publisher === "string" ? metadata.publisher : undefined,
			language: typeof metadata.language === "string" ? metadata.language : undefined,
			isbn: typeof metadata.isbn === "string" ? metadata.isbn : undefined,
			coverImage: typeof metadata.coverImage === "string" ? metadata.coverImage : undefined,
			wordCount: typeof metadata.wordCount === "number" ? metadata.wordCount : undefined,
			chapterCount: typeof metadata.chapterCount === "number" ? metadata.chapterCount : 0,
		};
	}

	private normalizeStoredBookDescriptor(value: unknown): EpubStoredBookDescriptor | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const record = value as Record<string, unknown>;
		const id = typeof record.id === "string" ? record.id.trim() : "";
		const filePath =
			typeof record.filePath === "string" ? normalizePath(record.filePath || "") : "";
		const metadata = this.normalizeBookMetadata(record.metadata);
		if (!id || !filePath || !metadata) {
			return null;
		}

		return {
			id,
			filePath,
			sourceId: typeof record.sourceId === "string" ? record.sourceId : undefined,
			sourceFingerprint:
				typeof record.sourceFingerprint === "string" ? record.sourceFingerprint : undefined,
			sourceMtime: typeof record.sourceMtime === "number" ? record.sourceMtime : undefined,
			sourceSize: typeof record.sourceSize === "number" ? record.sourceSize : undefined,
			metadata,
		};
	}

	private toStoredBookDescriptor(book: EpubBook): EpubStoredBookDescriptor {
		return {
			id: String(book.id || "").trim(),
			filePath: normalizePath(book.filePath || ""),
			sourceId: typeof book.sourceId === "string" ? book.sourceId : undefined,
			sourceFingerprint:
				typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined,
			sourceMtime: typeof book.sourceMtime === "number" ? book.sourceMtime : undefined,
			sourceSize: typeof book.sourceSize === "number" ? book.sourceSize : undefined,
			metadata: this.normalizeBookMetadata(book.metadata) ?? {
				title: "",
				author: "",
				chapterCount: 0,
			},
		};
	}

	private toBookFromDescriptor(
		descriptor: EpubStoredBookDescriptor,
		state?: Pick<EpubBook, "currentPosition" | "readingStats"> | null
	): EpubBook {
		return {
			id: descriptor.id,
			filePath: descriptor.filePath,
			sourceId: descriptor.sourceId,
			sourceFingerprint: descriptor.sourceFingerprint,
			sourceMtime: descriptor.sourceMtime,
			sourceSize: descriptor.sourceSize,
			metadata: descriptor.metadata,
			currentPosition: state?.currentPosition ?? { chapterIndex: 0, cfi: "", percent: 0 },
			readingStats:
				state?.readingStats ?? { totalReadTime: 0, lastReadTime: 0, createdTime: 0 },
		};
	}

	private normalizeLegacyBook(value: unknown, fallbackId: string): EpubBook | null {
		if (!value || typeof value !== "object") {
			return null;
		}

		const record = value as Record<string, unknown>;
		const descriptor = this.normalizeStoredBookDescriptor({
			...record,
			id: typeof record.id === "string" && record.id.trim().length > 0 ? record.id : fallbackId,
		});
		if (!descriptor) {
			return null;
		}

		const state = this.normalizeBookState(record) ?? {
			currentPosition: { chapterIndex: 0, cfi: "", percent: 0 },
			readingStats: { totalReadTime: 0, lastReadTime: 0, createdTime: 0 },
		};
		return this.toBookFromDescriptor(descriptor, state);
	}

	private hasRetainedLocalBookData(record: EpubReaderLocalBookRecord): boolean {
		return Boolean(
			record.state ||
				Object.prototype.hasOwnProperty.call(record, "lastOpenBookmark") ||
				Object.prototype.hasOwnProperty.call(record, "readingReferencePoint") ||
				Object.prototype.hasOwnProperty.call(record, "concealedTexts")
		);
	}

	private normalizeLocalBookRecord(value: unknown): EpubReaderLocalBookRecord {
		if (!value || typeof value !== "object") {
			return {};
		}

		const record = value as Record<string, unknown>;
		const normalized: EpubReaderLocalBookRecord = {};
		if (Object.prototype.hasOwnProperty.call(record, "descriptor")) {
			normalized.descriptor =
				this.normalizeStoredBookDescriptor(record.descriptor) ?? undefined;
		}
		if (Object.prototype.hasOwnProperty.call(record, "state")) {
			normalized.state = this.normalizeBookState(record.state) ?? undefined;
		}
		if (Object.prototype.hasOwnProperty.call(record, "lastOpenBookmark")) {
			normalized.lastOpenBookmark = this.normalizeLastOpenBookmark(record.lastOpenBookmark);
		}
		if (Object.prototype.hasOwnProperty.call(record, "readingReferencePoint")) {
			normalized.readingReferencePoint = this.normalizeReadingReferencePoint(
				record.readingReferencePoint
			);
		}
		if (Object.prototype.hasOwnProperty.call(record, "concealedTexts")) {
			normalized.concealedTexts = this.normalizeConcealedTexts(record.concealedTexts);
		}
		return normalized;
	}

	private async readBooksFromUnifiedLocalData(): Promise<{
		books: Record<string, EpubBook>;
		authoritative: boolean;
	}> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		const books: Record<string, EpubBook> = {};
		for (const [bookId, record] of Object.entries(unifiedData.books || {})) {
			const descriptor = record.descriptor;
			if (!descriptor) {
				continue;
			}
			books[descriptor.id || bookId] = this.toBookFromDescriptor(descriptor, record.state);
		}
		return {
			books,
			authoritative: unifiedData.bookCatalogStoredLocally === true,
		};
	}

	private async readLegacyBooks(): Promise<Record<string, EpubBook>> {
		const adapter = this.app.vault.adapter;
		const currentBooksPath = `${this.basePath}/books.json`;
		for (const booksPath of this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/books.json`)) {
			if (!(await adapter.exists(booksPath))) {
				continue;
			}

			try {
				const content = await adapter.read(booksPath);
				if (booksPath !== currentBooksPath && !(await adapter.exists(currentBooksPath))) {
					await this.ensureSyncBaseDirectory();
					await adapter.write(currentBooksPath, content);
				}
				const parsed = JSON.parse(content) as Record<string, unknown>;
				const books: Record<string, EpubBook> = {};
				for (const [bookId, bookData] of Object.entries(parsed || {})) {
					const normalizedBook = this.normalizeLegacyBook(bookData, bookId);
					if (!normalizedBook) {
						continue;
					}
					books[normalizedBook.id || bookId] = normalizedBook;
				}
				return books;
			} catch (error) {
				logger.warn(`[EpubStorageService] Failed to parse books.json from ${booksPath}:`, error);
			}
		}

		return {};
	}

	private normalizeLocalReaderData(value: unknown): EpubReaderLocalDataFile {
		const empty = this.createEmptyLocalReaderData();
		if (!value || typeof value !== "object") {
			return empty;
		}

		const record = value as Record<string, unknown>;
		const books: Record<string, EpubReaderLocalBookRecord> = {};
		if (record.books && typeof record.books === "object" && !Array.isArray(record.books)) {
			for (const [bookId, bookData] of Object.entries(record.books as Record<string, unknown>)) {
				if (!bookId) {
					continue;
				}
				books[bookId] = this.normalizeLocalBookRecord(bookData);
			}
		}

		const readerSettingsRecord =
			record.readerSettings && typeof record.readerSettings === "object" && !Array.isArray(record.readerSettings)
				? (record.readerSettings as Record<string, unknown>)
				: {};

		const normalized: EpubReaderLocalDataFile = {
			version: 1,
			updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
			bookCatalogStoredLocally: record.bookCatalogStoredLocally === true,
			readerSettings: {},
			books,
		};

		if (Object.prototype.hasOwnProperty.call(readerSettingsRecord, "desktop")) {
			normalized.readerSettings = normalized.readerSettings || {};
			normalized.readerSettings.desktop = this.normalizeReaderSettingsForDevice(
				"desktop",
				readerSettingsRecord.desktop as Partial<EpubReaderSettings>
			);
		}
		if (Object.prototype.hasOwnProperty.call(readerSettingsRecord, "mobile")) {
			normalized.readerSettings = normalized.readerSettings || {};
			normalized.readerSettings.mobile = this.normalizeReaderSettingsForDevice(
				"mobile",
				readerSettingsRecord.mobile as Partial<EpubReaderSettings>
			);
		}
		if (Object.prototype.hasOwnProperty.call(record, "excerptSettings")) {
			normalized.excerptSettings = this.normalizeExcerptSettings(record.excerptSettings);
		}
		if (Object.prototype.hasOwnProperty.call(record, "scanIndex")) {
			normalized.scanIndex = this.normalizeScanIndexEntries(record.scanIndex);
		}
		if (Object.prototype.hasOwnProperty.call(record, "bookshelfMembership")) {
			normalized.bookshelfMembership = this.normalizeBookshelfMembershipEntries(
				record.bookshelfMembership
			);
		}
		if (Object.prototype.hasOwnProperty.call(record, "sourceRegistry")) {
			normalized.sourceRegistry = this.normalizeSourceRegistryEntries(record.sourceRegistry);
		}
		if (record.canvasBindings && typeof record.canvasBindings === "object" && !Array.isArray(record.canvasBindings)) {
			normalized.canvasBindings = Object.fromEntries(
				Object.entries(record.canvasBindings as Record<string, unknown>)
					.map(([bookId, canvasPath]) => [
						EpubStorageService.normalizeCanvasBindingKey(bookId),
						EpubStorageService.normalizeCanvasBindingPath(canvasPath),
					] as const)
					.filter(([bookId, canvasPath]) => Boolean(bookId) && Boolean(canvasPath))
			);
		}

		return normalized;
	}

	private async readUnifiedLocalReaderData(): Promise<EpubReaderLocalDataFile> {
		if (this._localReaderDataCache) {
			return this._localReaderDataCache;
		}

		const adapter = this.app.vault.adapter;
		const path = this.getUnifiedLocalDataPath();
		if (!(await adapter.exists(path))) {
			this._localReaderDataCache = this.createEmptyLocalReaderData();
			return this._localReaderDataCache;
		}

		try {
			const content = await adapter.read(path);
			this._localReaderDataCache = this.normalizeLocalReaderData(JSON.parse(content));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse epub-reader-data.json:", error);
			this._localReaderDataCache = this.createEmptyLocalReaderData();
		}

		return this._localReaderDataCache;
	}

	private async hasUnifiedLocalDataFile(): Promise<boolean> {
		return this.app.vault.adapter.exists(this.getUnifiedLocalDataPath());
	}

	private async writeUnifiedLocalReaderData(data: EpubReaderLocalDataFile): Promise<void> {
		await this.ensureUnifiedLocalDataDirectory();
		const normalizedData = this.normalizeLocalReaderData({
			...data,
			version: 1,
			updatedAt: Date.now(),
		});
		this._localReaderDataCache = normalizedData;
		await this.app.vault.adapter.write(
			this.getUnifiedLocalDataPath(),
			JSON.stringify(normalizedData)
		);
	}

	private async updateUnifiedLocalReaderData(
		updater: (data: EpubReaderLocalDataFile) => void
	): Promise<void> {
		const doWrite = async () => {
			const current = this.cloneLocalReaderData(await this.readUnifiedLocalReaderData());
			updater(current);
			await this.writeUnifiedLocalReaderData(current);
		};

		this._localReaderDataWriteLock = this._localReaderDataWriteLock.then(doWrite, doWrite);
		await this._localReaderDataWriteLock;
	}

	private parseBookshelfIndexEntries(content: string): EpubBookshelfIndexEntry[] {
		try {
			return this.normalizeBookshelfIndexEntries(JSON.parse(content));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse bookshelf-index.json:", error);
			return [];
		}
	}

	private parseScanIndexEntries(content: string): EpubScanIndexEntry[] {
		try {
			return this.normalizeScanIndexEntries(JSON.parse(content));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse epub-scan-index.json:", error);
			return [];
		}
	}

	private parseBookshelfMembershipEntries(content: string): EpubBookshelfMembershipEntry[] {
		try {
			return this.normalizeBookshelfMembershipEntries(JSON.parse(content));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse bookshelf-membership.json:", error);
			return [];
		}
	}

	private parseSourceRegistryEntries(content: string): EpubSourceRegistryEntry[] {
		try {
			return this.normalizeSourceRegistryEntries(JSON.parse(content));
		} catch (error) {
			logger.warn("[EpubStorageService] Failed to parse epub-source-registry.json:", error);
			return [];
		}
	}

	private async readStoredBookshelfIndex(): Promise<EpubBookshelfIndexEntry[] | null> {
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

	private static normalizeCanvasBindingKey(value: unknown): string {
		return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
	}

	private static normalizeCanvasBindingPath(value: unknown): string {
		return typeof value === "string" ? normalizePath(value.trim()) : "";
	}

	private async readJsonObjectFromPath(path: string): Promise<unknown> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			return null;
		}

		try {
			return JSON.parse(await adapter.read(path));
		} catch (error) {
			logger.warn(`[EpubStorageService] Failed to parse JSON from ${path}:`, error);
			return null;
		}
	}

	private async readLegacyBookState(
		bookId: string
	): Promise<Pick<EpubBook, "currentPosition" | "readingStats"> | null> {
		for (const statePath of [
			this.getBookStatePath(bookId),
			...this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/${bookId}/state.json`),
		]) {
			const parsed = await this.readJsonObjectFromPath(statePath);
			const normalized = this.normalizeBookState(parsed);
			if (normalized) {
				return normalized;
			}
		}

		return null;
	}

	private async readLegacyLastOpenBookmark(bookId: string): Promise<EpubLastOpenBookmark | null> {
		for (const bookmarkPath of [
			this.getLastOpenBookmarkPath(bookId),
			...this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/${bookId}/last-open-bookmark.json`),
		]) {
			const parsed = await this.readJsonObjectFromPath(bookmarkPath);
			if (parsed == null) {
				continue;
			}
			return this.normalizeLastOpenBookmark(parsed);
		}

		return null;
	}

	private async readLegacyConcealedTexts(bookId: string): Promise<ConcealedText[] | null> {
		for (const concealedTextsPath of [
			this.getConcealedTextsPath(bookId),
			...this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/${bookId}/concealed-texts.json`),
		]) {
			const parsed = await this.readJsonObjectFromPath(concealedTextsPath);
			if (parsed == null) {
				continue;
			}
			return this.normalizeConcealedTexts(parsed);
		}

		return null;
	}

	private async readLegacyReaderSettings(
		deviceKind: EpubReaderSettingsDeviceKind
	): Promise<EpubReaderSettings | null> {
		const suffix = deviceKind === "mobile" ? "mobile" : "desktop";
		for (const settingsPath of [
			normalizePath(`${this.getLocalReaderStateRoot()}/reader-settings.${suffix}.json`),
			...this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/reader-settings.${suffix}.json`),
			...(deviceKind === this.getCurrentDeviceKind()
				? this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/reader-settings.json`)
				: []),
		].filter(Boolean)) {
			const parsed = await this.readJsonObjectFromPath(settingsPath);
			if (parsed == null) {
				continue;
			}
			return this.normalizeReaderSettingsForDevice(
				deviceKind,
				parsed as Partial<EpubReaderSettings>
			);
		}

		return null;
	}

	private async readLegacyExcerptSettings(): Promise<EpubExcerptSettings | null> {
		for (const settingsPath of this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/excerpt-settings.json`)) {
			const parsed = await this.readJsonObjectFromPath(settingsPath);
			if (parsed == null) {
				continue;
			}
			return this.normalizeExcerptSettings(parsed);
		}
		return null;
	}

	private async readLegacyCanvasBindings(): Promise<Record<string, string> | null> {
		for (const bindingsPath of this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/canvas-bindings.json`)) {
			const parsed = await this.readJsonObjectFromPath(bindingsPath);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				continue;
			}

			const normalized = Object.fromEntries(
				Object.entries(parsed as Record<string, unknown>)
					.map(([bookId, canvasPath]) => [
						EpubStorageService.normalizeCanvasBindingKey(bookId),
						EpubStorageService.normalizeCanvasBindingPath(canvasPath),
					] as const)
					.filter(([bookId, canvasPath]) => Boolean(bookId) && Boolean(canvasPath))
			);
			if (Object.keys(normalized).length > 0) {
				return normalized;
			}
		}
		return null;
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
					stripSupportedBookExtension(normalizedPath.split("/").pop() || "") ||
					book.metadata.title ||
					"书籍",
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
		return isSupportedBookPath(normalizedPath);
	}

	private isEpubFile(file: TAbstractFile | null | undefined): boolean {
		return isSupportedBookFile(file);
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
					logger.warn("[EpubStorageService] Failed to list book scan directory:", {
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
					: stripSupportedBookExtension(normalizedPath.split("/").pop() || "") ||
					  "书籍",
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
		const unifiedData = await this.readUnifiedLocalReaderData();
		const bookRecord = unifiedData.books?.[bookId];
		if (bookRecord && Object.prototype.hasOwnProperty.call(bookRecord, "state")) {
			const state = bookRecord.state;
			if (!state) {
				return null;
			}
			return {
				currentPosition: state.currentPosition ?? { chapterIndex: 0, cfi: "", percent: 0 },
				readingStats:
					state.readingStats ?? { totalReadTime: 0, lastReadTime: 0, createdTime: 0 },
			};
		}

		return this.readLegacyBookState(bookId);
	}

	private async writeBookState(
		bookId: string,
		data: Pick<EpubBook, "currentPosition" | "readingStats">
	): Promise<void> {
		const previous = this._bookStateWriteLocks.get(bookId) || Promise.resolve();
		const next = previous.then(
			async () => {
				await this.updateUnifiedLocalReaderData((localData) => {
					localData.books = localData.books || {};
					const current = localData.books[bookId] || {};
					localData.books[bookId] = {
						...current,
						state: {
							currentPosition: data.currentPosition,
							readingStats: data.readingStats,
						},
					};
				});
			},
			async () => {
				await this.updateUnifiedLocalReaderData((localData) => {
					localData.books = localData.books || {};
					const current = localData.books[bookId] || {};
					localData.books[bookId] = {
						...current,
						state: {
							currentPosition: data.currentPosition,
							readingStats: data.readingStats,
						},
					};
				});
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
		await this.upsertScanIndexEntry(book.filePath);
		await this.addBooksToBookshelf([book.filePath]);
	}

	async loadScanIndex(): Promise<EpubScanIndexEntry[]> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		const hasUnifiedData = await this.hasUnifiedLocalDataFile();
		let entries =
			hasUnifiedData && Array.isArray(unifiedData.scanIndex)
				? unifiedData.scanIndex
				: await this.readStoredScanIndex();

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
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.scanIndex = normalizedEntries;
		});
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
		const unifiedData = await this.readUnifiedLocalReaderData();
		const hasUnifiedData = await this.hasUnifiedLocalDataFile();
		let entries =
			hasUnifiedData && Array.isArray(unifiedData.bookshelfMembership)
				? unifiedData.bookshelfMembership
				: await this.readStoredBookshelfMembership();

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
		const normalizedEntries = this.normalizeBookshelfMembershipEntries(entries);
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.bookshelfMembership = normalizedEntries;
		});
	}

	async loadSourceRegistry(): Promise<EpubSourceRegistryEntry[]> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		if (
			(await this.hasUnifiedLocalDataFile()) &&
			Array.isArray(unifiedData.sourceRegistry)
		) {
			return unifiedData.sourceRegistry;
		}

		const entries = await this.readStoredSourceRegistry();
		return entries ?? [];
	}

	async saveSourceRegistry(entries: EpubSourceRegistryEntry[]): Promise<void> {
		const normalizedEntries = this.normalizeSourceRegistryEntries(entries);
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.sourceRegistry = normalizedEntries;
		});
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
				binary instanceof Uint8Array ? binary : new Uint8Array(binary);
			const buffer = input.buffer.slice(
				input.byteOffset,
				input.byteOffset + input.byteLength
			) as ArrayBuffer;
			const digest = await crypto.subtle.digest("SHA-256", buffer);
			return Array.from(new Uint8Array(digest))
				.map((value) => value.toString(16).padStart(2, "0"))
				.join("");
		} catch (error) {
			logger.debug("[EpubStorageService] Failed to compute book source fingerprint:", {
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
								?.replace(/\.epub$/i, "") ||
							entry.name,
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
			await this.detachMissingSourceRegistryPaths([
				...removedPaths,
			]);

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
		await this.updateUnifiedLocalReaderData((localData) => {
			if (localData.books) {
				delete localData.books[bookId];
			}
		});

		const adapter = this.app.vault.adapter;
		for (const dir of [
			normalizePath(`${this.getLocalReaderStateRoot()}/${bookId}`),
			normalizePath(`${this.getLocalReaderArtifactsRoot()}/${bookId}`),
		]) {
			if (await adapter.exists(dir)) {
				await adapter.rmdir(dir, true);
			}
		}

		await Promise.all([
			DirectoryUtils.pruneEmptyDirsUnder(adapter as unknown, this.getLocalReaderStateRoot(), {
				preserveRoot: false,
			}),
			DirectoryUtils.pruneEmptyDirsUnder(adapter as unknown, this.getLocalReaderArtifactsRoot(), {
				preserveRoot: false,
			}),
		]);
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
		this._progressDebounceTimer = window.setTimeout(() => {
			this._progressDebounceTimer = null;
			void this.flushPendingProgress();
		}, 300);
	}

	async flushPendingProgress(): Promise<void> {
		if (this._progressDebounceTimer) {
			window.clearTimeout(this._progressDebounceTimer);
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
			} catch (error) {
				logger.warn("[EpubStorageService] flushPendingProgress failed:", error);
			}
		}
	}

	async loadProgress(bookId: string): Promise<ReadingPosition | null> {
		const book = await this.getBook(bookId);
		return book?.currentPosition || null;
	}

	async loadConcealedTexts(bookId: string): Promise<ConcealedText[]> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		const bookRecord = unifiedData.books?.[bookId];
		if (
			(await this.hasUnifiedLocalDataFile()) &&
			bookRecord &&
			Object.prototype.hasOwnProperty.call(bookRecord, "concealedTexts")
		) {
			return [...(bookRecord.concealedTexts || [])];
		}

		return (await this.readLegacyConcealedTexts(bookId)) ?? [];
	}

	async saveConcealedTexts(bookId: string, concealedTexts: ConcealedText[]): Promise<void> {
		const normalizedConcealedTexts = this.normalizeConcealedTexts(concealedTexts);
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.books = localData.books || {};
			const current = localData.books[bookId] || {};
			localData.books[bookId] = {
				...current,
				concealedTexts: normalizedConcealedTexts,
			};
		});
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
				mode: this.normalizeConcealedTextMode((item).mode),
			}));
	}

	async loadLastOpenBookmark(bookId: string): Promise<EpubLastOpenBookmark | null> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		const bookRecord = unifiedData.books?.[bookId];
		if (
			(await this.hasUnifiedLocalDataFile()) &&
			bookRecord &&
			Object.prototype.hasOwnProperty.call(bookRecord, "lastOpenBookmark")
		) {
			return bookRecord.lastOpenBookmark ?? null;
		}

		return await this.readLegacyLastOpenBookmark(bookId);
	}

	async saveLastOpenBookmark(bookId: string, bookmark: EpubLastOpenBookmark): Promise<void> {
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.books = localData.books || {};
			const current = localData.books[bookId] || {};
			localData.books[bookId] = {
				...current,
				lastOpenBookmark: this.normalizeLastOpenBookmark(bookmark),
			};
		});
	}

	async loadReadingReferencePoint(bookId: string): Promise<EpubReadingReferencePoint | null> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		const bookRecord = unifiedData.books?.[bookId];
		if (
			(await this.hasUnifiedLocalDataFile()) &&
			bookRecord &&
			Object.prototype.hasOwnProperty.call(bookRecord, "readingReferencePoint")
		) {
			return bookRecord.readingReferencePoint ?? null;
		}

		return null;
	}

	async saveReadingReferencePoint(bookId: string, point: EpubReadingReferencePoint): Promise<void> {
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.books = localData.books || {};
			const current = localData.books[bookId] || {};
			localData.books[bookId] = {
				...current,
				readingReferencePoint: this.normalizeReadingReferencePoint(point),
			};
		});
	}

	async deleteReadingReferencePoint(bookId: string): Promise<void> {
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.books = localData.books || {};
			const current = localData.books[bookId];
			if (!current) {
				return;
			}
			localData.books[bookId] = {
				...current,
				readingReferencePoint: null,
			};
		});
	}

	async deleteLastOpenBookmark(bookId: string): Promise<void> {
		const adapter = this.app.vault.adapter as { remove?: (path: string) => Promise<void> };
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.books = localData.books || {};
			const current = localData.books[bookId];
			if (!current) {
				return;
			}
			localData.books[bookId] = {
				...current,
				lastOpenBookmark: null,
			};
		});
		for (const bookmarkPath of [
			this.getLastOpenBookmarkPath(bookId),
			...this.getLegacyEpubBasePaths().map((basePath) => `${basePath}/${bookId}/last-open-bookmark.json`),
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

	async removeLegacyHighlights(bookId: string): Promise<void> {
		const highlightsPath = `${this.basePath}/${bookId}/highlights.json`;
		const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
			remove?: (path: string) => Promise<void>;
		};
		if (typeof adapter.remove !== "function") {
			return;
		}
		if (await adapter.exists(highlightsPath)) {
			await adapter.remove(highlightsPath);
		}
	}

	async removeLegacyNotes(bookId: string): Promise<void> {
		const notesPath = `${this.basePath}/${bookId}/notes.json`;
		const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
			remove?: (path: string) => Promise<void>;
		};
		if (typeof adapter.remove !== "function") {
			return;
		}
		if (await adapter.exists(notesPath)) {
			await adapter.remove(notesPath);
		}
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
		const unifiedData = await this.readUnifiedLocalReaderData();
		if (
			(await this.hasUnifiedLocalDataFile()) &&
			Object.prototype.hasOwnProperty.call(unifiedData, "excerptSettings")
		) {
			return this.normalizeExcerptSettings(unifiedData.excerptSettings);
		}

		return (await this.readLegacyExcerptSettings()) ?? { ...DEFAULT_EXCERPT_SETTINGS };
	}

	async saveExcerptSettings(settings: EpubExcerptSettings): Promise<void> {
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.excerptSettings = this.normalizeExcerptSettings(settings);
		});
	}

	async loadReaderSettings(): Promise<EpubReaderSettings> {
		const deviceKind = this.getCurrentDeviceKind();
		const unifiedData = await this.readUnifiedLocalReaderData();
		const unifiedSettings = unifiedData.readerSettings?.[deviceKind];
		if (
			(await this.hasUnifiedLocalDataFile()) &&
			Object.prototype.hasOwnProperty.call(unifiedData.readerSettings || {}, deviceKind)
		) {
			return unifiedSettings ?? this.getDefaultReaderSettingsForCurrentDevice();
		}

		return (
			(await this.readLegacyReaderSettings(deviceKind)) ??
			({ ...this.getDefaultReaderSettingsForCurrentDevice() } as EpubReaderSettings)
		);
	}

	async saveReaderSettings(settings: EpubReaderSettings): Promise<void> {
		const deviceKind = this.getCurrentDeviceKind();
		const normalizedSettings = this.normalizeReaderSettingsForDevice(deviceKind, settings);
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.readerSettings = localData.readerSettings || {};
			localData.readerSettings[deviceKind] = normalizedSettings;
		});
	}

	private getDefaultReaderSettingsForCurrentDevice(): EpubReaderSettings {
		return getDefaultEpubReaderSettings(this.getCurrentDeviceKind());
	}

	private getDefaultReaderSettingsForDevice(
		deviceKind: EpubReaderSettingsDeviceKind
	): EpubReaderSettings {
		return getDefaultEpubReaderSettings(deviceKind);
	}

	private normalizeExcerptSettings(value: unknown): EpubExcerptSettings {
		if (!value || typeof value !== "object") {
			return { ...DEFAULT_EXCERPT_SETTINGS };
		}

		const settings = value as Partial<EpubExcerptSettings>;
		return {
			addCreationTime:
				typeof settings.addCreationTime === "boolean"
					? settings.addCreationTime
					: DEFAULT_EXCERPT_SETTINGS.addCreationTime,
			strikethroughDisplayMode:
				settings.strikethroughDisplayMode === "conceal"
					? "conceal"
					: DEFAULT_EXCERPT_SETTINGS.strikethroughDisplayMode,
			showStrikethroughInSidebar:
				typeof settings.showStrikethroughInSidebar === "boolean"
					? settings.showStrikethroughInSidebar
					: DEFAULT_EXCERPT_SETTINGS.showStrikethroughInSidebar,
		};
	}

	private normalizeReaderSettingsForDevice(
		deviceKind: EpubReaderSettingsDeviceKind,
		settings: Partial<EpubReaderSettings>
	): EpubReaderSettings {
		const mergedSettings: EpubReaderSettings = {
			...this.getDefaultReaderSettingsForDevice(deviceKind),
			...settings,
		};

		if (deviceKind === "desktop" && this.matchesLegacyDesktopReaderSettings(mergedSettings)) {
			return { ...DEFAULT_READER_SETTINGS };
		}

		if (deviceKind === "mobile") {
			if (this.matchesLegacyForcedMobileReaderSettings(mergedSettings)) {
				return { ...DEFAULT_MOBILE_READER_SETTINGS };
			}
		}

		return normalizeEpubReaderSettingsForDevice(deviceKind, settings);
	}

	private normalizeLoadedReaderSettings(settings: Partial<EpubReaderSettings>): EpubReaderSettings {
		return this.normalizeReaderSettingsForDevice(this.getCurrentDeviceKind(), settings);
	}

	private matchesLegacyForcedMobileReaderSettings(settings: EpubReaderSettings): boolean {
		return (
			settings.lineHeight === LEGACY_FORCED_MOBILE_READER_SETTINGS.lineHeight &&
			settings.widthMode === LEGACY_FORCED_MOBILE_READER_SETTINGS.widthMode &&
			settings.layoutMode === LEGACY_FORCED_MOBILE_READER_SETTINGS.layoutMode &&
			settings.flowMode === LEGACY_FORCED_MOBILE_READER_SETTINGS.flowMode &&
			settings.showScrolledSideNav === LEGACY_FORCED_MOBILE_READER_SETTINGS.showScrolledSideNav
		);
	}

	private matchesLegacyDesktopReaderSettings(settings: EpubReaderSettings): boolean {
		return (
			settings.lineHeight === LEGACY_DESKTOP_READER_SETTINGS.lineHeight &&
			settings.viewportSidePadding === LEGACY_DESKTOP_READER_SETTINGS.viewportSidePadding &&
			settings.widthMode === LEGACY_DESKTOP_READER_SETTINGS.widthMode &&
			settings.layoutMode === LEGACY_DESKTOP_READER_SETTINGS.layoutMode &&
			settings.flowMode === LEGACY_DESKTOP_READER_SETTINGS.flowMode &&
			settings.showScrolledSideNav === LEGACY_DESKTOP_READER_SETTINGS.showScrolledSideNav
		);
	}

	private getLegacyReaderSettingsPath(): string {
		return `${this.basePath}/reader-settings.json`;
	}

	private mergeArrayByKey<T>(
		current: T[] | undefined,
		incoming: T[],
		getKey: (item: T, index: number) => string
	): { merged: T[]; changed: boolean } {
		const existing = Array.isArray(current) ? current : [];
		if (incoming.length === 0) {
			return {
				merged: existing,
				changed: false,
			};
		}

		const merged = [...existing];
		const keys = new Set(existing.map((item, index) => getKey(item, index)));
		let changed = current === undefined && incoming.length > 0;

		for (const [index, item] of incoming.entries()) {
			const key = getKey(item, index);
			if (keys.has(key)) {
				continue;
			}
			keys.add(key);
			merged.push(item);
			changed = true;
		}

		return { merged, changed };
	}

	private async collectLegacyScopedFiles(
		rootPath: string,
		fileNames: string[]
	): Promise<string[]> {
		const normalizedRoot = normalizePath(rootPath);
		const adapter = this.app.vault.adapter as {
			list?: (path: string) => Promise<{ files?: string[]; folders?: string[] }>;
		};
		if (!normalizedRoot || typeof adapter.list !== "function") {
			return [];
		}

		if (!(await this.app.vault.adapter.exists(normalizedRoot))) {
			return [];
		}

		const result: string[] = [];
		const rootListing = await adapter.list(normalizedRoot);
		for (const filePath of rootListing.files || []) {
			const fileName = filePath.split("/").pop() || "";
			if (fileNames.includes(fileName)) {
				result.push(normalizePath(filePath));
			}
		}

		for (const folderPath of rootListing.folders || []) {
			const listing = await adapter.list(folderPath);
			for (const filePath of listing.files || []) {
				const fileName = filePath.split("/").pop() || "";
				if (fileNames.includes(fileName)) {
					result.push(normalizePath(filePath));
				}
			}
		}

		return result;
	}

	private async listLegacyLocalDataFiles(): Promise<string[]> {
		const adapter = this.app.vault.adapter;
		const files = new Set<string>();
		const tryAdd = async (path: string) => {
			const normalizedPath = normalizePath(path);
			if (normalizedPath && (await adapter.exists(normalizedPath))) {
				files.add(normalizedPath);
			}
		};

		for (const path of [
			`${this.basePath}/books.json`,
			`${this.basePath}/reader-settings.json`,
			`${this.basePath}/reader-settings.desktop.json`,
			`${this.basePath}/reader-settings.mobile.json`,
			`${this.basePath}/excerpt-settings.json`,
			`${this.basePath}/canvas-bindings.json`,
			`${this.basePath}/epub-source-registry.json`,
			`${this.basePath}/epub-scan-index.json`,
			`${this.basePath}/bookshelf-index.json`,
			`${this.basePath}/bookshelf-membership.json`,
			normalizePath(`${this.getLocalReaderStateRoot()}/reader-settings.desktop.json`),
			normalizePath(`${this.getLocalReaderStateRoot()}/reader-settings.mobile.json`),
		]) {
			await tryAdd(path);
		}

		for (const scopedPath of await this.collectLegacyScopedFiles(this.basePath, [
			"bookmarks.json",
			"highlights.json",
			"notes.json",
			"state.json",
			"last-open-bookmark.json",
			"concealed-texts.json",
		])) {
			files.add(scopedPath);
		}

		for (const scopedPath of await this.collectLegacyScopedFiles(this.getLocalReaderStateRoot(), [
			"state.json",
			"last-open-bookmark.json",
		])) {
			files.add(scopedPath);
		}

		for (const scopedPath of await this.collectLegacyScopedFiles(
			this.getLocalReaderArtifactsRoot(),
			["concealed-texts.json"]
		)) {
			files.add(scopedPath);
		}

		return Array.from(files).sort();
	}

	private extractLegacyBookId(filePath: string): string | null {
		const normalizedPath = normalizePath(filePath);
		const mappings = [
			normalizePath(`${this.basePath}/`),
			normalizePath(`${this.getLocalReaderStateRoot()}/`),
			normalizePath(`${this.getLocalReaderArtifactsRoot()}/`),
		];

		for (const prefix of mappings) {
			if (!normalizedPath.startsWith(prefix)) {
				continue;
			}
			const relativePath = normalizedPath.slice(prefix.length);
			const segments = relativePath.split("/").filter(Boolean);
			if (segments.length >= 2) {
				return segments[0] || null;
			}
		}

		return null;
	}

	async inspectLocalDataMigrationStatus(): Promise<EpubLocalDataMigrationInspection> {
		const legacyFiles = await this.listLegacyLocalDataFiles();
		return {
			hasUnifiedDataFile: await this.hasUnifiedLocalDataFile(),
			legacyFileCount: legacyFiles.length,
			legacyFiles,
		};
	}

	async migrateLegacyLocalData(
		options: { cleanupLegacyFiles?: boolean } = {}
	): Promise<EpubLocalDataMigrationReport> {
		const cleanupLegacyFiles = options.cleanupLegacyFiles === true;
		const failures: Array<{ path: string; message: string }> = [];
		const unifiedData = this.cloneLocalReaderData(await this.readUnifiedLocalReaderData());
		let migratedSectionCount = 0;
		let changed = false;

		const markChanged = () => {
			changed = true;
			migratedSectionCount += 1;
		};

		const legacyBooks = await this.readLegacyBooks();
		if (Object.keys(legacyBooks).length > 0) {
			unifiedData.bookCatalogStoredLocally = true;
		}
		for (const [bookId, book] of Object.entries(legacyBooks)) {
			unifiedData.books = unifiedData.books || {};
			const current = unifiedData.books[bookId] || {};
			let bookChanged = false;

			if (!current.descriptor) {
				current.descriptor = this.toStoredBookDescriptor(book);
				bookChanged = true;
			}

			if (!current.state) {
				current.state = {
					currentPosition: book.currentPosition,
					readingStats: book.readingStats,
				};
				bookChanged = true;
			}

			if (bookChanged) {
				unifiedData.books[bookId] = current;
				markChanged();
			}
		}

		for (const deviceKind of ["desktop", "mobile"] as const) {
			const legacySettings = await this.readLegacyReaderSettings(deviceKind);
			if (
				legacySettings &&
				!Object.prototype.hasOwnProperty.call(unifiedData.readerSettings || {}, deviceKind)
			) {
				unifiedData.readerSettings = unifiedData.readerSettings || {};
				unifiedData.readerSettings[deviceKind] = legacySettings;
				markChanged();
			}
		}

		const legacyExcerptSettings = await this.readLegacyExcerptSettings();
		if (
			!Object.prototype.hasOwnProperty.call(unifiedData, "excerptSettings") &&
			legacyExcerptSettings
		) {
			unifiedData.excerptSettings = legacyExcerptSettings;
			markChanged();
		}

		const legacyCanvasBindings = await this.readLegacyCanvasBindings();
		if (
			legacyCanvasBindings &&
			Object.keys(legacyCanvasBindings).length > 0 &&
			(!unifiedData.canvasBindings || Object.keys(unifiedData.canvasBindings).length === 0)
		) {
			unifiedData.canvasBindings = legacyCanvasBindings;
			markChanged();
		}

		const legacyScanIndex = await this.readStoredScanIndex();
		if (legacyScanIndex) {
			const mergeResult = this.mergeArrayByKey(
				unifiedData.scanIndex,
				legacyScanIndex,
				(entry) => normalizePath(entry.path || "")
			);
			if (mergeResult.changed) {
				unifiedData.scanIndex = mergeResult.merged;
				markChanged();
			}
		}

		const legacyMembership = await this.readStoredBookshelfMembership();
		if (legacyMembership) {
			const mergeResult = this.mergeArrayByKey(
				unifiedData.bookshelfMembership,
				legacyMembership,
				(entry) => normalizePath(entry.path || "")
			);
			if (mergeResult.changed) {
				unifiedData.bookshelfMembership = mergeResult.merged;
				markChanged();
			}
		}

		const legacyRegistry = await this.readStoredSourceRegistry();
		if (legacyRegistry) {
			const mergeResult = this.mergeArrayByKey(
				unifiedData.sourceRegistry,
				legacyRegistry,
				(entry) => entry.sourceId
			);
			if (mergeResult.changed) {
				unifiedData.sourceRegistry = mergeResult.merged;
				markChanged();
			}
		}

		const legacyBookIds = Array.from(
			new Set(
				(await this.listLegacyLocalDataFiles())
					.map((path) => this.extractLegacyBookId(path))
					.filter((bookId): bookId is string => Boolean(bookId))
			)
		).sort();

		for (const bookId of legacyBookIds) {
			unifiedData.books = unifiedData.books || {};
			const current = unifiedData.books[bookId] || {};
			let bookChanged = false;

			const legacyState = await this.readLegacyBookState(bookId);
			const legacyBook = legacyBooks[bookId];
			const bookStateFromBooksFile = legacyBook
				? {
						currentPosition: legacyBook.currentPosition,
						readingStats: legacyBook.readingStats,
					}
				: null;
			const canOverrideExistingState =
				!Object.prototype.hasOwnProperty.call(current, "state") ||
				(Boolean(legacyState) &&
					Boolean(bookStateFromBooksFile) &&
					JSON.stringify(current.state || null) === JSON.stringify(bookStateFromBooksFile));
			if (legacyState && canOverrideExistingState) {
				current.state = legacyState;
				bookChanged = true;
			}

			if (!Object.prototype.hasOwnProperty.call(current, "lastOpenBookmark")) {
				const legacyLastOpen = await this.readLegacyLastOpenBookmark(bookId);
				if (legacyLastOpen) {
					current.lastOpenBookmark = legacyLastOpen;
					bookChanged = true;
				}
			}

			const legacyConcealedTexts = await this.readLegacyConcealedTexts(bookId);
			if (legacyConcealedTexts && legacyConcealedTexts.length > 0) {
				const mergeResult = this.mergeArrayByKey(
					current.concealedTexts,
					legacyConcealedTexts,
					(entry, index) =>
						entry.id || `${entry.cfiRange || ""}:${entry.createdTime || 0}:${index}`
				);
				if (mergeResult.changed) {
					current.concealedTexts = mergeResult.merged;
					bookChanged = true;
				}
			}

			if (bookChanged) {
				unifiedData.books[bookId] = current;
				markChanged();
			}
		}

		if (changed) {
			await this.writeUnifiedLocalReaderData(unifiedData);
		}

		let removedLegacyFileCount = 0;
		if (cleanupLegacyFiles) {
			const adapter = this.app.vault.adapter as {
				remove?: (path: string) => Promise<void>;
			};
			for (const legacyPath of await this.listLegacyLocalDataFiles()) {
				if (typeof adapter.remove !== "function") {
					failures.push({
						path: legacyPath,
						message: "当前适配器不支持删除旧 EPUB 本地数据文件。",
					});
					continue;
				}

				try {
					if (await this.app.vault.adapter.exists(legacyPath)) {
						await adapter.remove(legacyPath);
						removedLegacyFileCount += 1;
					}
				} catch (error) {
					failures.push({
						path: legacyPath,
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}

			await Promise.all([
				DirectoryUtils.pruneEmptyDirsUnder(this.app.vault.adapter as unknown, this.basePath, {
					preserveRoot: false,
				}),
				DirectoryUtils.pruneEmptyDirsUnder(
					this.app.vault.adapter as unknown,
					this.getLocalReaderStateRoot(),
					{ preserveRoot: false }
				),
				DirectoryUtils.pruneEmptyDirsUnder(
					this.app.vault.adapter as unknown,
					this.getLocalReaderArtifactsRoot(),
					{ preserveRoot: false }
				),
			]);
		}

		return {
			migratedSectionCount,
			removedLegacyFileCount,
			remainingLegacyFiles: await this.listLegacyLocalDataFiles(),
			failures,
		};
	}

	private async loadCanvasBindings(): Promise<Record<string, string>> {
		const unifiedData = await this.readUnifiedLocalReaderData();
		if (unifiedData.canvasBindings && typeof unifiedData.canvasBindings === "object") {
			return { ...unifiedData.canvasBindings };
		}

		return (await this.readLegacyCanvasBindings()) ?? {};
	}

	private async saveCanvasBindings(bindings: Record<string, string>): Promise<void> {
		const normalizedBindings = Object.fromEntries(
			Object.entries(bindings || {})
				.map(([bookId, canvasPath]) => [
					String(bookId || "").trim(),
					normalizePath(String(canvasPath || "").trim()),
				] as const)
				.filter(([bookId, canvasPath]) => Boolean(bookId) && Boolean(canvasPath))
		);
		await this.updateUnifiedLocalReaderData((localData) => {
			localData.canvasBindings = normalizedBindings;
		});
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
	strikethroughDisplayMode: EpubStrikethroughDisplayMode;
	showStrikethroughInSidebar: boolean;
}

const DEFAULT_EXCERPT_SETTINGS: EpubExcerptSettings = {
	addCreationTime: false,
	strikethroughDisplayMode: "conceal",
	showStrikethroughInSidebar: false,
};

const LEGACY_DESKTOP_READER_SETTINGS: EpubReaderSettings = {
	lineHeight: 1.9,
	letterSpacing: 0,
	pageMargin: 48,
	viewportSidePadding: 24,
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
