import { App, TFile, normalizePath, parseYaml } from "obsidian";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import { EpubLinkService } from "./EpubLinkService";
import { getEpubRuntime } from "./epub-runtime";
import type { EpubBook } from "./types";

export const DEFAULT_EPUB_BOOKMARK_FOLDER = "weave/epub-bookmarks";
const EPUB_BOOKMARK_FILE_FORMAT = "weave-epub-bookmarks/v1";

export interface EpubBookmarkRecord {
	id: string;
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt: number;
	preview?: string;
}

export interface EpubBookmarkCreateInput {
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt?: number;
	preview?: string;
}

export interface EpubBookmarkWriteResult {
	bookmark: EpubBookmarkRecord;
	created: boolean;
	filePath: string;
}

interface EpubBookmarkFileFrontmatter {
	format: string;
	weave_epub_bookmark_file: boolean;
	stableKey: string;
	bookId: string;
	sourceId?: string;
	sourceFingerprint?: string;
	bookPath: string;
	bookTitle: string;
	bookAuthor?: string;
	updatedAt: number;
	bookmarks: EpubBookmarkRecord[];
}

export function normalizeEpubBookmarkFolderPath(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	if (!normalized) {
		return "";
	}
	return normalizePath(normalized);
}

export function getEpubBookmarkFolderDisplayPath(value: unknown): string {
	const normalized = normalizeEpubBookmarkFolderPath(value);
	return normalized || "/";
}

export class EpubBookmarkService {
	private app: App;
	private linkService: EpubLinkService;

	constructor(app: App) {
		this.app = app;
		this.linkService = new EpubLinkService(app);
	}

	getBookmarkFolder(): string {
		const runtime = getEpubRuntime();
		const pluginIds = [runtime.pluginId, ...runtime.collaboratorHostPluginIds].filter(
			(value): value is string => typeof value === "string" && value.length > 0
		);
		for (const pluginId of pluginIds) {
			const plugin = (this.app as App & {
				plugins?: { getPlugin?: (id: string) => { settings?: { bookmarkFolder?: string } } | null };
			}).plugins?.getPlugin?.(pluginId);
			const configured = normalizeEpubBookmarkFolderPath(plugin?.settings?.bookmarkFolder);
			if (configured) {
				return configured;
			}
		}
		return DEFAULT_EPUB_BOOKMARK_FOLDER;
	}

	async loadBookmarksForBook(book: EpubBook): Promise<EpubBookmarkRecord[]> {
		const fileData = await this.readBookmarkFileForBook(book);
		if (!fileData) {
			return [];
		}
		return [...fileData.bookmarks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	async getBookmarkCountForBook(book: EpubBook): Promise<number> {
		return (await this.loadBookmarksForBook(book)).length;
	}

	async addBookmark(book: EpubBook, input: EpubBookmarkCreateInput): Promise<EpubBookmarkWriteResult> {
		const filePath = await this.resolveBookmarkFilePath(book);
		const existing = (await this.readBookmarkFileByPath(filePath)) ?? this.createEmptyFileFrontmatter(book);
		const normalizedBookmark = this.normalizeBookmarkRecord(
			{
				...input,
				id: this.createBookmarkId(existing.stableKey, input.cfi, input.createdAt ?? Date.now()),
			},
			existing.stableKey
		);
		if (!normalizedBookmark) {
			throw new Error("Invalid EPUB bookmark payload");
		}

		const normalizedCfi = EpubLinkService.normalizeCfi(normalizedBookmark.cfi);
		const existingIndex = existing.bookmarks.findIndex(
			(bookmark) => EpubLinkService.normalizeCfi(bookmark.cfi) === normalizedCfi
		);
		let created = false;
		let bookmark = normalizedBookmark;

		if (existingIndex >= 0) {
			const preserved = existing.bookmarks[existingIndex];
			bookmark = {
				...normalizedBookmark,
				id: preserved.id,
				createdAt: preserved.createdAt,
			};
			existing.bookmarks[existingIndex] = bookmark;
		} else {
			created = true;
			existing.bookmarks = [bookmark, ...existing.bookmarks];
		}

		existing.bookId = String(book.id || "").trim();
		existing.sourceId = typeof book.sourceId === "string" ? book.sourceId : undefined;
		existing.sourceFingerprint =
			typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined;
		existing.bookPath = normalizePath(String(book.filePath || "").trim());
		existing.bookTitle = this.resolveBookTitle(book);
		existing.bookAuthor = this.resolveBookAuthor(book);
		existing.updatedAt = Date.now();
		existing.bookmarks = existing.bookmarks
			.filter((item) => Boolean(item.cfi))
			.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

		await this.writeBookmarkFile(filePath, existing);
		return {
			bookmark,
			created,
			filePath,
		};
	}

	async updateBookFileReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(String(oldPath || "").trim());
		const normalizedNewPath = normalizePath(String(newPath || "").trim());
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const folderPath = this.getBookmarkFolder();
		const candidates = this.app.vault
			.getFiles()
			.filter(
				(file) =>
					file.extension === "md" && this.isBookmarkFileInsideFolder(file.path, folderPath)
			);
		let updated = 0;

		for (const file of candidates) {
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData || normalizePath(fileData.bookPath) !== normalizedOldPath) {
				continue;
			}
			fileData.bookPath = normalizedNewPath;
			fileData.updatedAt = Date.now();
			await this.writeBookmarkFile(file.path, fileData);
			updated += 1;
		}

		return updated;
	}

	private async readBookmarkFileForBook(book: EpubBook): Promise<EpubBookmarkFileFrontmatter | null> {
		const filePath = await this.findExistingBookmarkFilePath(book);
		if (!filePath) {
			return null;
		}
		return await this.readBookmarkFileByPath(filePath);
	}

	private async resolveBookmarkFilePath(book: EpubBook): Promise<string> {
		return (await this.findExistingBookmarkFilePath(book)) ?? this.getPreferredBookmarkFilePath(book);
	}

	private getPreferredBookmarkFilePath(book: EpubBook): string {
		const folderPath = this.getBookmarkFolder();
		const titleSegment = sanitizeForSync(this.resolveBookTitle(book), 64);
		const stableKey = this.buildStableKey(book);
		const fileName = `${titleSegment || "EPUB"}--${stableKey}.md`;
		return folderPath ? normalizePath(`${folderPath}/${fileName}`) : fileName;
	}

	private async findExistingBookmarkFilePath(book: EpubBook): Promise<string | null> {
		const preferredPath = this.getPreferredBookmarkFilePath(book);
		if (await this.app.vault.adapter.exists(preferredPath)) {
			return preferredPath;
		}
		const stableKey = this.buildStableKey(book);
		const suffix = `--${stableKey}.md`;
		const folderPath = this.getBookmarkFolder();
		const match = this.app.vault
			.getFiles()
			.find(
				(file) =>
					file.extension === "md" &&
					this.isBookmarkFileInsideFolder(file.path, folderPath) &&
					file.name.endsWith(suffix)
			);
		return match?.path ?? null;
	}

	private isBookmarkFileInsideFolder(filePath: string, folderPath: string): boolean {
		const normalizedFilePath = normalizePath(String(filePath || "").trim());
		const normalizedFolderPath = normalizeEpubBookmarkFolderPath(folderPath);
		if (!normalizedFolderPath) {
			return !normalizedFilePath.includes("/");
		}
		const parentPath = normalizedFilePath.split("/").slice(0, -1).join("/");
		return parentPath === normalizedFolderPath;
	}

	private buildStableKey(book: EpubBook): string {
		const raw =
			String(book.sourceId || "").trim() ||
			String(book.sourceFingerprint || "").trim() ||
			String(book.id || "").trim() ||
			this.resolveBookTitle(book);
		return sanitizeForSync(raw, 56) || "epub-book";
	}

	private resolveBookTitle(book: EpubBook): string {
		return (
			String(book.metadata?.title || "").trim() ||
			EpubLinkService.extractShortBookName(String(book.filePath || "").trim()) ||
			"EPUB"
		);
	}

	private resolveBookAuthor(book: EpubBook): string | undefined {
		const author = String(book.metadata?.author || "").trim();
		return author || undefined;
	}

	private createEmptyFileFrontmatter(book: EpubBook): EpubBookmarkFileFrontmatter {
		return {
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey: this.buildStableKey(book),
			bookId: String(book.id || "").trim(),
			sourceId: typeof book.sourceId === "string" ? book.sourceId : undefined,
			sourceFingerprint:
				typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined,
			bookPath: normalizePath(String(book.filePath || "").trim()),
			bookTitle: this.resolveBookTitle(book),
			bookAuthor: this.resolveBookAuthor(book),
			updatedAt: Date.now(),
			bookmarks: [],
		};
	}

	private createBookmarkId(stableKey: string, cfi: string, createdAt: number): string {
		const seed = `${stableKey}::${createdAt}::${cfi}`;
		return `epub-bm-${this.hashString(seed).toString(36)}`;
	}

	private hashString(value: string): number {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
		}
		return hash;
	}

	private async readBookmarkFileByPath(filePath: string): Promise<EpubBookmarkFileFrontmatter | null> {
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (!(existing instanceof TFile)) {
			return null;
		}
		try {
			const content = await this.app.vault.read(existing);
			return this.parseBookmarkFileContent(content);
		} catch (error) {
			logger.warn("[EpubBookmarkService] Failed to read bookmark file:", error);
			return null;
		}
	}

	private parseBookmarkFileContent(content: string): EpubBookmarkFileFrontmatter | null {
		const match = String(content || "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
		if (!match) {
			return null;
		}
		try {
			const parsed = parseYaml(match[1]);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return null;
			}
			return this.normalizeBookmarkFileFrontmatter(parsed as Record<string, unknown>);
		} catch (error) {
			logger.warn("[EpubBookmarkService] Failed to parse bookmark frontmatter:", error);
			return null;
		}
	}

	private normalizeBookmarkFileFrontmatter(value: Record<string, unknown>): EpubBookmarkFileFrontmatter | null {
		const format = String(value.format || "").trim();
		const stableKey = String(value.stableKey || "").trim();
		const bookId = String(value.bookId || "").trim();
		const bookPath = normalizePath(String(value.bookPath || "").trim());
		const bookTitle = String(value.bookTitle || "").trim();
		if ((format && format !== EPUB_BOOKMARK_FILE_FORMAT) || !stableKey || !bookPath) {
			return null;
		}
		return {
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey,
			bookId,
			sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
			sourceFingerprint:
				typeof value.sourceFingerprint === "string" ? value.sourceFingerprint : undefined,
			bookPath,
			bookTitle,
			bookAuthor: typeof value.bookAuthor === "string" ? value.bookAuthor : undefined,
			updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
			bookmarks: this.normalizeBookmarkRecords(value.bookmarks, stableKey),
		};
	}

	private normalizeBookmarkRecords(value: unknown, stableKey: string): EpubBookmarkRecord[] {
		if (!Array.isArray(value)) {
			return [];
		}
		return value
			.map((item) => this.normalizeBookmarkRecord(item, stableKey))
			.filter((item): item is EpubBookmarkRecord => Boolean(item))
			.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	private normalizeBookmarkRecord(value: unknown, stableKey: string): EpubBookmarkRecord | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		const cfi = EpubLinkService.normalizeCfi(String(record.cfi || "").trim());
		if (!cfi) {
			return null;
		}
		const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();
		const chapterTitle = String(record.chapterTitle || "").trim();
		return {
			id:
				typeof record.id === "string" && record.id.trim().length > 0
					? record.id.trim()
					: this.createBookmarkId(stableKey, cfi, createdAt),
			cfi,
			chapterIndex: typeof record.chapterIndex === "number" ? record.chapterIndex : 0,
			percent: typeof record.percent === "number" ? record.percent : 0,
			chapterTitle,
			pageNumber: typeof record.pageNumber === "number" ? record.pageNumber : undefined,
			totalPages: typeof record.totalPages === "number" ? record.totalPages : undefined,
			createdAt,
			preview: typeof record.preview === "string" ? record.preview : undefined,
		};
	}

	private async writeBookmarkFile(filePath: string, frontmatter: EpubBookmarkFileFrontmatter): Promise<void> {
		const content = this.renderBookmarkFileContent(frontmatter);
		await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, filePath);
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			return;
		}
		await this.app.vault.create(filePath, content);
	}

	private renderBookmarkFileContent(frontmatter: EpubBookmarkFileFrontmatter): string {
		const yamlText = this.stringifyYamlObject({
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey: frontmatter.stableKey,
			bookId: frontmatter.bookId,
			sourceId: frontmatter.sourceId,
			sourceFingerprint: frontmatter.sourceFingerprint,
			bookPath: frontmatter.bookPath,
			bookTitle: frontmatter.bookTitle,
			bookAuthor: frontmatter.bookAuthor,
			updatedAt: frontmatter.updatedAt,
			bookmarks: frontmatter.bookmarks,
		});
		return `---\n${yamlText}\n---\n\n${this.renderBookmarkBody(frontmatter)}`;
	}

	private renderBookmarkBody(frontmatter: EpubBookmarkFileFrontmatter): string {
		const lines: string[] = [
			`# ${frontmatter.bookTitle || "EPUB 书签"}`,
			"",
		];
		if (frontmatter.bookmarks.length === 0) {
			lines.push("暂无书签");
			return lines.join("\n");
		}
		for (const bookmark of frontmatter.bookmarks) {
			const chapterTitle = bookmark.chapterTitle || `第 ${bookmark.chapterIndex + 1} 章`;
			const pageLabel = this.buildPageLabel(bookmark);
			const createdLabel = this.formatTimestamp(bookmark.createdAt);
			const link = this.linkService.buildEpubLink(
				frontmatter.bookPath,
				bookmark.cfi,
				bookmark.chapterTitle,
				bookmark.chapterIndex,
				bookmark.chapterTitle,
				undefined,
				frontmatter.sourceId
			);
			lines.push(`## ${chapterTitle}`);
			lines.push("");
			lines.push(`- 页位：${pageLabel}`);
			lines.push(`- 创建：${createdLabel}`);
			lines.push(`- 跳转：${link}`);
			if (bookmark.preview) {
				lines.push(`- 预览：${this.normalizeInlineText(bookmark.preview)}`);
			}
			lines.push("");
		}
		return lines.join("\n").trimEnd();
	}

	private buildPageLabel(bookmark: EpubBookmarkRecord): string {
		if (typeof bookmark.pageNumber === "number" && bookmark.pageNumber > 0) {
			if (typeof bookmark.totalPages === "number" && bookmark.totalPages >= bookmark.pageNumber) {
				return `第 ${bookmark.pageNumber} / ${bookmark.totalPages} 页`;
			}
			return `第 ${bookmark.pageNumber} 页`;
		}
		return `进度 ${this.formatPercent(bookmark.percent)}`;
	}

	private formatPercent(percent: number): string {
		const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
		return `${Math.round(safe)}%`;
	}

	private formatTimestamp(timestamp: number): string {
		if (!timestamp) {
			return "";
		}
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		return `${year}-${month}-${day} ${hours}:${minutes}`;
	}

	private normalizeInlineText(value: string): string {
		return String(value || "").replace(/\s+/g, " ").trim();
	}

	private stringifyYamlObject(value: Record<string, unknown>, indent = ""): string {
		const lines: string[] = [];
		for (const [key, entry] of Object.entries(value)) {
			if (entry === undefined) {
				continue;
			}
			this.appendYamlProperty(lines, key, entry, indent);
		}
		return lines.join("\n");
	}

	private appendYamlProperty(lines: string[], key: string, value: unknown, indent: string): void {
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${indent}${key}: []`);
				return;
			}
			lines.push(`${indent}${key}:`);
			for (const item of value) {
				this.appendYamlArrayItem(lines, item, `${indent}  `);
			}
			return;
		}
		if (value && typeof value === "object") {
			const entries = Object.entries(value as Record<string, unknown>).filter(
				([, entry]) => entry !== undefined
			);
			if (entries.length === 0) {
				lines.push(`${indent}${key}: {}`);
				return;
			}
			lines.push(`${indent}${key}:`);
			for (const [childKey, childValue] of entries) {
				this.appendYamlProperty(lines, childKey, childValue, `${indent}  `);
			}
			return;
		}
		lines.push(`${indent}${key}: ${this.formatYamlScalar(value)}`);
	}

	private appendYamlArrayItem(lines: string[], value: unknown, indent: string): void {
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${indent}- []`);
				return;
			}
			lines.push(`${indent}-`);
			for (const item of value) {
				this.appendYamlArrayItem(lines, item, `${indent}  `);
			}
			return;
		}
		if (value && typeof value === "object") {
			const entries = Object.entries(value as Record<string, unknown>).filter(
				([, entry]) => entry !== undefined
			);
			if (entries.length === 0) {
				lines.push(`${indent}- {}`);
				return;
			}
			const [firstKey, firstValue] = entries[0];
			if (Array.isArray(firstValue) || (firstValue && typeof firstValue === "object")) {
				lines.push(`${indent}- ${firstKey}:`);
				this.appendComplexYamlValue(lines, firstValue, `${indent}    `);
			} else {
				lines.push(`${indent}- ${firstKey}: ${this.formatYamlScalar(firstValue)}`);
			}
			for (const [key, entry] of entries.slice(1)) {
				this.appendYamlProperty(lines, key, entry, `${indent}  `);
			}
			return;
		}
		lines.push(`${indent}- ${this.formatYamlScalar(value)}`);
	}

	private appendComplexYamlValue(lines: string[], value: unknown, indent: string): void {
		if (Array.isArray(value)) {
			for (const item of value) {
				this.appendYamlArrayItem(lines, item, indent);
			}
			return;
		}
		if (value && typeof value === "object") {
			for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
				if (entry === undefined) {
					continue;
				}
				this.appendYamlProperty(lines, key, entry, indent);
			}
		}
	}

	private formatYamlScalar(value: unknown): string {
		if (typeof value === "number") {
			return Number.isFinite(value) ? String(value) : "0";
		}
		if (typeof value === "boolean") {
			return value ? "true" : "false";
		}
		if (value == null) {
			return "null";
		}
		return JSON.stringify(String(value));
	}
}
