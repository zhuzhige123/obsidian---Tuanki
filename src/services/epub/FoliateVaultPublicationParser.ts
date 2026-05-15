import JSZip from "jszip";
import { type App, TFile } from "obsidian";
import { logger } from "../../utils/logger";
import { readVaultBinaryData } from "./EpubBinaryData";
import {
	getBookExtensionFromPath,
	stripSupportedBookExtension,
	usesFoliateGenericBookLoader,
	usesPlainTextBookAdapter,
} from "./book-format";
import { EpubError } from "./epub-error";
import { makePlainTextBook } from "./plain-text-book";
import * as EpubCfi from "./vendor/epubcfi";
import type { TocItem } from "./types";

const POSITION_CHAR_BUCKET = 1800;
const CONTEXT_SIZE = 48;
const MAX_SEARCH_RESULTS = 120;
const TEXT_NODE_TAG_BLACKLIST = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const COMPACT_READIUM_MARKER = "loc";
const COMPACT_READIUM_SEPARATOR = "~";
const REMOTE_RESOURCE_URL_PATTERN = /^(?:https?:)?\/\//i;
const ACTIVE_CONTENT_SELECTOR = "script, iframe, object, embed";
const SCRIPT_PROTOCOL_PATTERN = /^\s*(?:javascript|vbscript)\s*:/i;
const DANGEROUS_URL_ATTRIBUTES = ["href", "src", "xlink:href", "formaction"];
const MARKDOWN_SKIPPED_TAGS = new Set([
	"script",
	"style",
	"noscript",
	"iframe",
	"object",
	"embed",
	"meta",
	"link",
	"head",
]);
const MARKDOWN_CONTAINER_TAGS = new Set([
	"body",
	"main",
	"article",
	"section",
	"div",
	"aside",
	"header",
	"footer",
	"nav",
]);
const MARKDOWN_BLOCK_TAGS = new Set([
	...MARKDOWN_CONTAINER_TAGS,
	"address",
	"blockquote",
	"details",
	"dl",
	"figure",
	"figcaption",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"li",
	"ol",
	"p",
	"pre",
	"summary",
	"table",
	"tbody",
	"thead",
	"tfoot",
	"tr",
	"td",
	"th",
	"ul",
	"img",
]);

function createCssDataUrl(cssText: string): string {
	return `data:text/css;charset=utf-8,${encodeURIComponent(cssText)}`;
}

type TextQuote = {
	highlight?: string;
	before?: string;
	after?: string;
};

type TextNodeSegment = {
	node: Text;
	start: number;
	end: number;
	text: string;
};

type SectionDescriptor = {
	index: number;
	href: string;
	title: string;
	linear: boolean;
	textLength: number;
	wordCount: number;
	positionCount: number;
	positionStart: number;
};

export interface FoliateSectionReadingMetrics {
	index: number;
	href: string;
	title: string;
	textLength: number;
	wordCount: number;
	positionCount: number;
	positionStart: number;
}

type LegacyStoredLocationPayload = {
	href?: string;
	locations?: {
		fragments?: string[];
		totalProgression?: number;
	};
	text?: {
		highlight?: string;
		before?: string;
		after?: string;
	};
};

type CompactReadiumLocation = {
	href: string;
	fragment?: string;
	text?: string;
};

type FoliateSection = {
	id?: string | number;
	cfi?: string;
	linear?: string;
	size?: number;
	load?: () => Promise<string> | string;
	createDocument?: () => Promise<Document>;
	resolveHref?: (href: string) => string;
};

type FoliateBook = {
	sections: FoliateSection[];
	toc?: unknown[];
	pageList?: unknown[];
	metadata?: Record<string, unknown>;
	rendition?: { layout?: string };
	dir?: string;
	transformTarget?: EventTarget;
	resolveCFI?: (cfi: string) => { index: number; anchor: (doc: Document) => unknown } | null;
	resolveHref: (
		href: string
	) =>
		| { index: number; anchor: (doc: Document) => unknown }
		| Promise<{ index: number; anchor: (doc: Document) => unknown } | null>
		| null;
	getCover?: () => Promise<Blob | null>;
	destroy?: () => void;
};

export interface FoliateLoadedPublication {
	filePath: string;
	fileName: string;
	book: FoliateBook;
	tocItems: TocItem[];
	coverImage?: string;
	metadata: {
		title: string;
		author: string;
		publisher?: string;
		language?: string;
		identifier?: string;
		wordCount?: number;
		chapterCount: number;
		isFixedLayout: boolean;
	};
	totalPositions: number;
}

export interface FoliateResolvedTarget {
	cfi: string | null;
	index: number;
	href: string;
	doc: Document | null;
	range: Range | null;
	textHint?: string;
}

export interface FoliateSectionReadingPointDraft {
	title: string;
	text: string;
	cfi: string;
	chapterIndex: number;
	chapterHref: string;
	markdown?: string;
	assets?: FoliateChapterExportAsset[];
}

export interface FoliateChapterExportAsset {
	placeholder: string;
	suggestedName: string;
	data: Uint8Array;
	mimeType: string;
	originalHref?: string;
}

type MarkdownExportContext = {
	baseHref: string;
	assets: FoliateChapterExportAsset[];
	assetBySource: Map<string, FoliateChapterExportAsset>;
};

export class FoliateVaultPublicationParser {
	private readonly app: App;
	private archive: JSZip | null = null;
	private archiveEntryLookup = new Map<string, string>();
	private manifestMediaTypeByHref = new Map<string, string>();
	private packageDocumentPath = "";
	private currentBook: FoliateBook | null = null;
	private filePath = "";
	private fileName = "";
	private tocItems: TocItem[] = [];
	private sectionDescriptors: SectionDescriptor[] = [];
	private sectionTitleByHref = new Map<string, string>();
	private rawDocumentCache = new Map<string, Document>();
	private metadata: FoliateLoadedPublication["metadata"] = {
		title: "",
		author: "",
		wordCount: 0,
		chapterCount: 0,
		isFixedLayout: false,
	};
	private totalPositions = 0;
	private transformCleanup: (() => void) | null = null;

	constructor(app: App) {
		this.app = app;
	}

	async load(filePath: string): Promise<FoliateLoadedPublication> {
		this.dispose();
		this.filePath = filePath;
		this.fileName = filePath.split("/").pop() || "book";

		const vaultFile = this.app.vault.getAbstractFileByPath(filePath);
		if (!(vaultFile instanceof TFile)) {
			throw new EpubError("file_not_found", `书籍文件不存在: ${filePath}`, { filePath });
		}

		const extension = getBookExtensionFromPath(filePath);
		if (extension === "epub") {
			const normalizedBinary = await readVaultBinaryData(this.app, vaultFile, filePath, {
				requireZipSignature: true,
				failureLabel: "EPUB",
			});
			try {
				this.archive = await JSZip.loadAsync(normalizedBinary, {
					checkCRC32: false,
				});
			} catch (error) {
				throw new EpubError(
					"invalid_archive",
					error instanceof Error ? error.message : `EPUB ZIP parse failed: ${filePath}`,
					{
						filePath,
						byteLength: normalizedBinary.byteLength,
					}
				);
			}
			this.rebuildArchiveEntryLookup();
			this.packageDocumentPath = await this.findPackageDocumentPath();
			await this.buildManifestMediaTypeLookup();

			const { EPUB } = await import("foliate-js/epub.js");
			const loader = this.createFoliateLoader();
			this.currentBook = (await new EPUB(loader).init()) as FoliateBook;
		} else if (usesPlainTextBookAdapter(extension)) {
			this.archive = null;
			this.archiveEntryLookup.clear();
			this.manifestMediaTypeByHref.clear();
			this.packageDocumentPath = "";
			const text = await this.app.vault.read(vaultFile);
			this.currentBook = makePlainTextBook({
				fileName: vaultFile.name,
				text,
			}) as FoliateBook;
		} else if (usesFoliateGenericBookLoader(extension)) {
			this.archive = null;
			this.archiveEntryLookup.clear();
			this.manifestMediaTypeByHref.clear();
			this.packageDocumentPath = "";
			const normalizedBinary = await readVaultBinaryData(this.app, vaultFile, filePath, {
				requireZipSignature: false,
				failureLabel: "Book",
			});
			const file = new File([normalizedBinary], vaultFile.name, {
				type: this.getGenericPublicationMimeType(extension),
			});
			const viewModule = (await import("foliate-js/view.js")) as unknown as {
				makeBook: (input: File) => Promise<FoliateBook>;
			};
			this.currentBook = await viewModule.makeBook(file);
		} else {
			throw new EpubError("unknown", `暂不支持的书籍格式: ${filePath}`, { filePath });
		}

		this.attachHtmlTransformPipeline(this.currentBook);
		this.buildMetadata();
		this.buildTocItems();
		await this.buildSectionDescriptors();
		await this.hydrateTocPageNumbers();

		return {
			filePath,
			fileName: this.fileName,
			book: this.currentBook,
			tocItems: this.tocItems,
			coverImage: (await this.extractCoverDataUrl()) || undefined,
			metadata: this.metadata,
			totalPositions: this.totalPositions,
		};
	}

	getBook(): FoliateBook {
		if (!this.currentBook) {
			throw new Error("Foliate publication 尚未加载");
		}
		return this.currentBook;
	}

	getTocItems(): TocItem[] {
		return this.tocItems;
	}

	getMetadata(): FoliateLoadedPublication["metadata"] {
		return this.metadata;
	}

	getTotalPositions(): number {
		return this.totalPositions;
	}

	getTotalWordCount(): number {
		return this.metadata.wordCount || 0;
	}

	getSectionReadingMetrics(index: number): FoliateSectionReadingMetrics | null {
		const section = this.sectionDescriptors[index];
		if (!section) {
			return null;
		}
		return {
			index: section.index,
			href: section.href,
			title: section.title,
			textLength: section.textLength,
			wordCount: section.wordCount,
			positionCount: section.positionCount,
			positionStart: section.positionStart,
		};
	}

	isFixedLayout(): boolean {
		return this.metadata.isFixedLayout;
	}

	getSectionIndexForHref(href: string): number {
		const normalized = this.normalizeSectionHref(href);
		return this.sectionDescriptors.findIndex((section) => section.href === normalized);
	}

	getSectionTitleByHref(href: string): string {
		const normalized = this.normalizeSectionHref(href);
		return (
			this.sectionTitleByHref.get(normalized) ||
			this.sectionDescriptors.find((section) => section.href === normalized)?.title ||
			""
		);
	}

	getSectionTitleByIndex(index: number): string {
		return this.sectionDescriptors[index]?.title || "";
	}

	getSectionHrefByIndex(index: number): string {
		return this.sectionDescriptors[index]?.href || "";
	}

	resolveHrefAgainst(baseHref: string, rawHref: string): string {
		return this.normalizeInternalHref(baseHref, rawHref);
	}

	async getSectionReadingPointDraft(
		href: string,
		titleHint?: string
	): Promise<FoliateSectionReadingPointDraft | null> {
		const resolved = await this.resolveHrefTarget(href);
		if (!resolved?.doc) {
			return null;
		}

		const title = this.normalizeReadingPointTitle(
			titleHint ||
				this.getSectionTitleByHref(resolved.href) ||
				this.getSectionTitleByIndex(resolved.index) ||
				`章节 ${resolved.index + 1}`
		);
		const root = resolved.doc.body || resolved.doc.documentElement;
		const markdownExport = await this.buildSectionMarkdownExport(root, resolved.href, title);
		const extractedText = markdownExport.plainText || this.extractReadableSectionText(root);
		const text = this.stripLeadingSectionTitle(extractedText, title);
		if (!text) {
			return null;
		}

		return {
			title,
			text,
			cfi: resolved.cfi || this.getBaseSectionCfi(resolved.index),
			chapterIndex: resolved.index,
			chapterHref: resolved.href,
			markdown: markdownExport.markdown || text,
			assets: markdownExport.assets,
		};
	}

	getSectionHrefForCfi(cfi: string): string | null {
		const index = this.getSectionIndexForCfi(cfi);
		return typeof index === "number" ? this.getSectionHrefByIndex(index) : null;
	}

	async getRawDocumentByHref(href: string): Promise<Document | null> {
		return this.loadRawDocumentByHref(href);
	}

	getSectionIndexForCfi(cfi: string): number | null {
		const resolved = this.resolveCfiTarget(cfi);
		return typeof resolved?.index === "number" ? resolved.index : null;
	}

	createCfiFromRange(index: number, range: Range): string {
		const baseCfi = this.getBaseSectionCfi(index);
		return EpubCfi.joinIndir(baseCfi, EpubCfi.fromRange(range));
	}

	async getRawDocumentByIndex(index: number): Promise<Document | null> {
		const href = this.sectionDescriptors[index]?.href || this.getSectionIdentifier(this.getBook().sections[index]);
		return href ? this.loadRawDocumentByHref(href) : null;
	}

	private getSectionIdentifier(section: FoliateSection | undefined): string {
		return String(section?.id ?? "").trim();
	}

	private resolveSectionHref(section: FoliateSection | undefined): string {
		const sectionId = this.getSectionIdentifier(section);
		if (!sectionId) {
			return "";
		}
		if (!this.archive && /^\d+$/.test(sectionId)) {
			return "";
		}
		return this.normalizeInternalHref(this.packageDocumentPath || sectionId, sectionId);
	}

	private async resolveDescriptorHref(
		section: FoliateSection | undefined,
		index: number
	): Promise<string> {
		const directHref = this.resolveSectionHref(section);
		if (directHref) {
			return directHref;
		}
		return (await this.findTocHrefForSection(index)) || "";
	}

	resolveRangeInLoadedSection(
		target: string,
		doc: Document,
		sectionIndex: number,
		textHint?: string
	): Range | null {
		const normalizedTarget = this.normalizeLocationString(target);
		const currentHref = this.getSectionHrefByIndex(sectionIndex);
		const currentRoot = doc.body || doc.documentElement;
		const currentTextHint = textHint?.trim();

		if (this.isCfiLike(normalizedTarget)) {
			const resolved = this.resolveCfiTarget(normalizedTarget);
			if (!resolved || resolved.index !== sectionIndex) {
				return null;
			}
			return this.resolveAnchorAsRange(
				doc,
				this.executeResolvedAnchor(resolved.anchor, doc, normalizedTarget),
				currentRoot
			);
		}

		const legacyReadium = this.parseAnyLegacyReadiumLocation(normalizedTarget);
		if (legacyReadium) {
			const hrefTarget = this.buildHrefTargetFromReadiumLocation(legacyReadium);
			return this.resolveRangeInLoadedSection(
				hrefTarget,
				doc,
				sectionIndex,
				currentTextHint || legacyReadium.text
			);
		}

		if (!this.isDocumentHrefLike(normalizedTarget)) {
			return currentTextHint
				? this.findRangeByTextQuote(currentRoot, { highlight: currentTextHint })
				: null;
		}

		const normalizedHref = this.normalizeInternalHref(this.packageDocumentPath || currentHref, normalizedTarget);
		if (this.normalizeSectionHref(normalizedHref) !== currentHref) {
			return null;
		}

		if (currentTextHint) {
			const quoteRange = this.findRangeByTextQuote(currentRoot, { highlight: currentTextHint });
			if (quoteRange) {
				return quoteRange;
			}
		}

		const fragment = this.extractHrefFragment(normalizedHref);
		if (fragment) {
			return this.createRangeForFragment(doc, fragment);
		}

		return this.createDocumentStartRange(doc);
	}

	async resolveNavigationTarget(target: string, textHint?: string): Promise<FoliateResolvedTarget | null> {
		const normalizedTarget = this.normalizeLocationString(target);
		if (!normalizedTarget) {
			return null;
		}

		const legacyReadium = this.parseAnyLegacyReadiumLocation(normalizedTarget);
		if (legacyReadium) {
			const nextTextHint = textHint?.trim() || legacyReadium.text?.trim();
			return this.resolveHrefTarget(
				this.buildHrefTargetFromReadiumLocation(legacyReadium),
				nextTextHint || undefined
			);
		}

		if (this.isCfiLike(normalizedTarget)) {
			return this.resolveCfiNavigationTarget(normalizedTarget);
		}

		const resolvedHrefTarget = await this.resolveHrefTarget(normalizedTarget, textHint);
		if (resolvedHrefTarget) {
			return resolvedHrefTarget;
		}

		return null;
	}

	async canonicalizeLocation(value: string, textHint?: string): Promise<string | null> {
		const normalized = this.normalizeLocationString(value);
		if (!normalized) {
			return null;
		}

		if (this.isCfiLike(normalized)) {
			return (await this.resolveCfiNavigationTarget(this.wrapCfi(normalized)))?.cfi || null;
		}

		const resolved = await this.resolveNavigationTarget(normalized, textHint);
		return resolved?.cfi || null;
	}

	async search(query: string): Promise<Array<{ cfi: string; excerpt: string; chapterTitle: string }>> {
		const needle = query.trim().toLowerCase();
		if (!needle) {
			return [];
		}

		const results: Array<{ cfi: string; excerpt: string; chapterTitle: string }> = [];
		for (const section of this.sectionDescriptors) {
			if (results.length >= MAX_SEARCH_RESULTS) {
				break;
			}
			const doc = await this.getRawDocumentByIndex(section.index);
			if (!doc) {
				continue;
			}
			const root = doc.body || doc.documentElement;
			const segments = this.collectTextSegments(root);
			if (segments.length === 0) {
				continue;
			}
			const combined = segments.map((segment) => segment.text).join("");
			let searchFrom = 0;
			while (searchFrom < combined.length && results.length < MAX_SEARCH_RESULTS) {
				const foundAt = combined.toLowerCase().indexOf(needle, searchFrom);
				if (foundAt < 0) {
					break;
				}
				const range = this.createRangeFromTextOffsets(
					doc,
					segments,
					foundAt,
					foundAt + needle.length
				);
				if (range) {
					results.push({
						cfi: this.createCfiFromRange(section.index, range),
						excerpt: this.buildSearchSnippet(combined, foundAt, needle.length),
						chapterTitle: section.title,
					});
				}
				searchFrom = foundAt + Math.max(needle.length, 1);
			}
		}
		return results;
	}

	async resolvePageNumber(cfi: string): Promise<number | undefined> {
		const resolved = await this.resolveNavigationTarget(cfi);
		if (!resolved) {
			return undefined;
		}
		return this.resolveResolvedTargetPageNumber(resolved);
	}

	async resolveCfiForPage(pageNumber: number): Promise<string | null> {
		if (this.sectionDescriptors.length === 0 || this.totalPositions <= 0) {
			return null;
		}

		const normalizedPage = this.clamp(Math.round(pageNumber), 1, this.totalPositions);
		const targetPosition = normalizedPage - 1;
		const section = this.sectionDescriptors.find(
			(item) => targetPosition >= item.positionStart && targetPosition < item.positionStart + item.positionCount
		) || this.sectionDescriptors[this.sectionDescriptors.length - 1];
		if (!section) {
			return null;
		}

		if (section.positionCount <= 1) {
			return this.getBaseSectionCfi(section.index);
		}

		const doc = await this.loadRawDocumentByHref(section.href);
		if (!doc) {
			return this.getBaseSectionCfi(section.index);
		}

		const root = doc.body || doc.documentElement;
		const segments = this.collectTextSegments(root);
		if (segments.length === 0) {
			return this.getBaseSectionCfi(section.index);
		}

		const totalLength = segments[segments.length - 1]?.end || 0;
		if (totalLength <= 0) {
			return this.getBaseSectionCfi(section.index);
		}

		const positionOffset = targetPosition - section.positionStart;
		const progression = positionOffset / Math.max(section.positionCount - 1, 1);
		const targetOffset = Math.round(progression * Math.max(totalLength - 1, 0));
		const range = this.createCollapsedRangeFromTextOffset(
			doc,
			segments,
			this.clamp(targetOffset, 0, Math.max(totalLength - 1, 0))
		);
		return this.createCanonicalCfiForRange(section.index, range, section.href);
	}

	private resolveResolvedTargetPageNumber(resolved: FoliateResolvedTarget): number | undefined {
		const section = this.sectionDescriptors[resolved.index];
		if (!section) {
			return undefined;
		}
		if (!resolved.range || !resolved.doc || section.positionCount <= 1) {
			return section.positionStart + 1;
		}
		const progression = this.computeProgressionForRange(resolved.doc, resolved.range);
		const positionOffset = Math.min(
			section.positionCount - 1,
			Math.max(0, Math.round(progression * Math.max(section.positionCount - 1, 0)))
		);
		return section.positionStart + positionOffset + 1;
	}

	private async hydrateTocPageNumbers(): Promise<void> {
		if (this.tocItems.length === 0 || this.sectionDescriptors.length === 0) {
			return;
		}

		await Promise.all(this.tocItems.map((item) => this.hydrateTocItemPageNumber(item)));
	}

	private async hydrateTocItemPageNumber(item: TocItem): Promise<void> {
		const pageNumber = await this.resolveHrefPageNumber(item.href);
		if (typeof pageNumber === "number" && Number.isFinite(pageNumber) && pageNumber > 0) {
			item.pageNumber = pageNumber;
		} else {
			delete item.pageNumber;
		}

		if (item.subitems?.length) {
			await Promise.all(item.subitems.map((child) => this.hydrateTocItemPageNumber(child)));
		}
	}

	private async resolveHrefPageNumber(href: string): Promise<number | undefined> {
		const resolved = await this.resolveHrefTarget(href);
		if (!resolved) {
			return undefined;
		}

		return this.resolveResolvedTargetPageNumber(resolved);
	}

	dispose(): void {
		this.transformCleanup?.();
		this.transformCleanup = null;
		this.currentBook?.destroy?.();
		this.currentBook = null;
		this.archive = null;
		this.archiveEntryLookup.clear();
		this.manifestMediaTypeByHref.clear();
		this.packageDocumentPath = "";
		this.filePath = "";
		this.fileName = "";
		this.tocItems = [];
		this.sectionDescriptors = [];
		this.sectionTitleByHref.clear();
		this.rawDocumentCache.clear();
		this.metadata = {
			title: "",
			author: "",
			chapterCount: 0,
			isFixedLayout: false,
		};
		this.totalPositions = 0;
	}

	private createFoliateLoader(): {
		loadText: (name: string) => Promise<string | null>;
		loadBlob: (name: string, type?: string) => Promise<Blob | null>;
		getSize: (name: string) => number;
	} {
		return {
			loadText: async (name: string) => {
				const normalizedHref = this.normalizeSectionHref(name);
				const entry = this.findArchiveEntry(normalizedHref);
				if (!entry) {
					return null;
				}
				const raw = await entry.async("text");
				const mediaType = this.inferMimeType(normalizedHref);
				if (this.isRewritableDocumentMediaType(mediaType)) {
					return this.repairMarkupText(raw, mediaType, normalizedHref);
				}
				return raw;
			},
			loadBlob: async (name: string, type?: string) => {
				const normalizedHref = this.normalizeSectionHref(name);
				const entry = this.findArchiveEntry(normalizedHref);
				if (!entry) {
					return null;
				}
				const bytes = await entry.async("uint8array");
				const normalizedBytes = new Uint8Array(bytes);
				return new Blob([normalizedBytes], { type: type || this.inferMimeType(normalizedHref) });
			},
			getSize: (name: string) => {
				const normalizedHref = this.normalizeSectionHref(name);
				const entry = this.findArchiveEntry(normalizedHref);
				return (entry as { _data?: { uncompressedSize?: number } } | null)?._data?.uncompressedSize || 0;
			},
		};
	}

	private async findPackageDocumentPath(): Promise<string> {
		const containerEntry = this.findArchiveEntry("META-INF/container.xml");
		if (!containerEntry) {
			throw new EpubError("missing_container", "EPUB 缺少 META-INF/container.xml", {
				filePath: this.filePath,
			});
		}
		const raw = await containerEntry.async("text");
		const doc = this.parseMarkupDocument(raw, "application/xml", "META-INF/container.xml");
		const rootfile = doc.querySelector("rootfile");
		const fullPath = rootfile?.getAttribute("full-path")?.trim();
		if (!fullPath) {
			throw new EpubError("missing_package_document", "EPUB 缺少 package 文档路径", {
				filePath: this.filePath,
			});
		}
		return this.normalizePath(fullPath);
	}

	private async buildManifestMediaTypeLookup(): Promise<void> {
		this.manifestMediaTypeByHref.clear();
		if (!this.packageDocumentPath) {
			return;
		}

		const packageEntry = this.findArchiveEntry(this.packageDocumentPath);
		if (!packageEntry) {
			return;
		}

		const raw = await packageEntry.async("text");
		const doc = this.parseMarkupDocument(raw, "application/xml", this.packageDocumentPath);
		for (const item of Array.from(doc.getElementsByTagNameNS("*", "item"))) {
			const href = item.getAttribute("href")?.trim();
			const mediaType = item.getAttribute("media-type")?.trim().toLowerCase();
			if (!href || !mediaType) {
				continue;
			}

			const normalizedHref = this.normalizeSectionHref(
				this.normalizeInternalHref(this.packageDocumentPath, href)
			);
			if (!normalizedHref) {
				continue;
			}

			this.manifestMediaTypeByHref.set(normalizedHref, mediaType);
		}
	}

	private buildMetadata(): void {
		const book = this.getBook();
		const metadata = book.metadata || {};
		this.metadata = {
			title: this.readFoliateMetadataValue(metadata.title) || stripSupportedBookExtension(this.fileName),
			author:
				this.readFoliateMetadataValue(metadata.author) ||
				this.readFoliateMetadataValue(metadata.creator) ||
				"未知作者",
			publisher: this.readFoliateMetadataValue(metadata.publisher) || undefined,
			language: this.readFoliateMetadataValue(metadata.language) || undefined,
			identifier: this.readFoliateMetadataValue(metadata.identifier) || undefined,
			chapterCount: book.sections.length,
			isFixedLayout: book.rendition?.layout === "pre-paginated",
		};
	}

	private buildTocItems(): void {
		const book = this.getBook();
		this.sectionTitleByHref.clear();
		const toc = Array.isArray(book.toc) ? book.toc : [];
		if (toc.length > 0) {
			this.tocItems = this.convertFoliateTocEntries(toc, 1);
			return;
		}
		this.tocItems = book.sections.map((section, index) => {
			const href = this.resolveSectionHref(section);
			const label = this.readableTitleFromHref(href) || `章节 ${index + 1}`;
			this.sectionTitleByHref.set(href, label);
			return {
				id: `${index}-${href}`,
				label,
				href,
				level: 1,
			};
		});
	}

	private convertFoliateTocEntries(entries: unknown[], level: number): TocItem[] {
		return entries
			.map((entry, index) => this.convertSingleFoliateTocEntry(entry, level, index))
			.filter((entry): entry is TocItem => Boolean(entry));
	}

	private convertSingleFoliateTocEntry(entry: unknown, level: number, index: number): TocItem | null {
		if (!entry || typeof entry !== "object") {
			return null;
		}
		const tocEntry = entry as Record<string, unknown>;
		const rawHref = this.readFoliateMetadataValue(tocEntry.href);
		if (!rawHref) {
			return null;
		}
		const href = this.normalizeInternalHref(this.packageDocumentPath || rawHref, rawHref);
		const label =
			this.readFoliateMetadataValue(tocEntry.label) ||
			this.readFoliateMetadataValue(tocEntry.title) ||
			this.readableTitleFromHref(href) ||
			`章节 ${index + 1}`;
		const sectionHref = this.normalizeSectionHref(href);
		if (sectionHref) {
			this.sectionTitleByHref.set(sectionHref, label);
		}
		const children = Array.isArray(tocEntry.subitems)
			? tocEntry.subitems
			: Array.isArray(tocEntry.children)
			? tocEntry.children
			: [];
		return {
			id: `${level}-${index}-${href}`,
			label,
			href,
			level,
			subitems: children.length > 0 ? this.convertFoliateTocEntries(children, level + 1) : undefined,
		};
	}

	private async buildSectionDescriptors(): Promise<void> {
		const sections = this.getBook().sections;
		this.sectionDescriptors = [];
		let positionStart = 0;
		let totalWordCount = 0;
		for (const [index, section] of sections.entries()) {
			const href = await this.resolveDescriptorHref(section, index);
			const doc = await this.getRawDocumentByHref(href);
			const textLength = this.extractReadableSectionText(doc?.body || doc?.documentElement || null).length;
			const wordCount = this.estimateWordCount(
				this.extractReadableSectionText(doc?.body || doc?.documentElement || null)
			);
			const title =
				this.getSectionTitleByHref(href) ||
				this.readableTitleFromHref(href) ||
				`章节 ${index + 1}`;
			this.sectionTitleByHref.set(href, title);
			const positionCount = this.metadata.isFixedLayout
				? 1
				: Math.max(1, Math.ceil(Math.max(textLength, 1) / POSITION_CHAR_BUCKET));
			this.sectionDescriptors.push({
				index,
				href,
				title,
				linear: (section.linear || "yes").toLowerCase() !== "no",
				textLength,
				wordCount,
				positionCount,
				positionStart,
			});
			positionStart += positionCount;
			totalWordCount += wordCount;
		}
		this.totalPositions = positionStart;
		this.metadata.wordCount = totalWordCount;
		this.metadata.chapterCount = this.sectionDescriptors.length;
	}

	private estimateWordCount(text: string): number {
		const normalized = String(text || "").trim();
		if (!normalized) {
			return 0;
		}
		const latinWords = normalized.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
		const cjkUnits = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
		return latinWords + cjkUnits;
	}

	private async extractCoverDataUrl(): Promise<string | null> {
		try {
			const coverBlob = await this.getBook().getCover?.();
			return coverBlob ? await this.blobToDataUrl(coverBlob) : null;
		} catch (error) {
			logger.warn("[FoliateVaultPublicationParser] Failed to extract cover image:", error);
			return null;
		}
	}

	private async resolveCfiNavigationTarget(cfi: string): Promise<FoliateResolvedTarget | null> {
		const resolved = this.resolveCfiTarget(cfi);
		if (!resolved) {
			return null;
		}
		const doc = await this.getRawDocumentByIndex(resolved.index);
		const root = doc?.body || doc?.documentElement || null;
		const range = doc
			? this.resolveAnchorAsRange(doc, this.executeResolvedAnchor(resolved.anchor, doc, cfi), root)
			: null;
		return {
			cfi: this.createCanonicalCfiForRange(resolved.index, range),
			index: resolved.index,
			href: this.getSectionHrefByIndex(resolved.index),
			doc,
			range,
		};
	}

	private async resolveHrefTarget(href: string, textHint?: string): Promise<FoliateResolvedTarget | null> {
		const normalizedHref = this.normalizeInternalHref(this.packageDocumentPath || href, href);
		const resolved = await Promise.resolve(this.getBook().resolveHref(normalizedHref));
		if (!resolved || typeof resolved.index !== "number") {
			return null;
		}
		const doc = await this.getRawDocumentByIndex(resolved.index);
		const root = doc?.body || doc?.documentElement || null;
		let range =
			doc && textHint?.trim()
				? this.findRangeByTextQuote(root, { highlight: textHint.trim() })
				: null;
		if (!range && doc) {
			range = this.resolveAnchorAsRange(
				doc,
				this.executeResolvedAnchor(resolved.anchor, doc, normalizedHref),
				root
			);
		}
		if (!range && doc) {
			const fragment = this.extractHrefFragment(normalizedHref);
			range = fragment ? this.createRangeForFragment(doc, fragment) : null;
		}
		if (!range && doc) {
			range = this.createDocumentStartRange(doc);
		}
		return {
			cfi: this.createCanonicalCfiForRange(resolved.index, range, normalizedHref),
			index: resolved.index,
			href: this.getSectionHrefByIndex(resolved.index) || normalizedHref,
			doc,
			range,
			textHint: textHint?.trim() || undefined,
		};
	}

	private resolveCfiTarget(cfi: string): { index: number; anchor: (doc: Document) => unknown } | null {
		try {
			const wrapped = this.wrapCfi(cfi);
			const resolved = this.getBook().resolveCFI?.(wrapped);
			if (resolved) {
				return resolved;
			}

			const parsed = EpubCfi.parse(wrapped) as EpubCfi.ParsedCfi;
			const indexedByPrefix = this.findSectionIndexFromCfiPrefix(wrapped);
			if (indexedByPrefix !== null) {
				return {
					index: indexedByPrefix,
					anchor: (doc: Document) => EpubCfi.toRange(doc, parsed),
				};
			}
			const parentPath = Array.isArray((parsed as EpubCfi.ParsedCfiRange).parent)
				? [...(parsed as EpubCfi.ParsedCfiRange).parent]
				: [...(parsed as EpubCfi.ParsedCfiPath)];
			const sectionPart = parentPath.shift();
			const index = EpubCfi.fake.toIndex(sectionPart);
			if (typeof index !== "number" || index < 0) {
				return null;
			}
			return {
				index,
				anchor: (doc: Document) => EpubCfi.toRange(doc, parsed),
			};
		} catch (error) {
			logger.debugWithTag("FoliateVaultPublicationParser", "Failed to resolve CFI target", {
				cfi,
				error,
			});
			return null;
		}
	}

	private findSectionIndexFromCfiPrefix(cfi: string): number | null {
		let bestMatchIndex: number | null = null;
		let bestMatchLength = -1;
		for (const section of this.getBook().sections.map((_, index) => ({ index, cfi: this.getBaseSectionCfi(index) }))) {
			const baseCfi = this.wrapCfi(section.cfi);
			if (!baseCfi) {
				continue;
			}
			const normalizedBase = baseCfi.endsWith(")") ? baseCfi.slice(0, -1) : baseCfi;
			const matches =
				cfi === baseCfi ||
				cfi.startsWith(`${normalizedBase}!)`) ||
				cfi.startsWith(`${normalizedBase}!`) ||
				cfi.startsWith(normalizedBase);
			if (matches && normalizedBase.length > bestMatchLength) {
				bestMatchIndex = section.index;
				bestMatchLength = normalizedBase.length;
			}
		}
		return bestMatchIndex;
	}

	private getBaseSectionCfi(index: number): string {
		return this.getBook().sections[index]?.cfi || EpubCfi.fake.fromIndex(index);
	}

	private resolveAnchorAsRange(
		doc: Document,
		anchor: unknown,
		scopeRoot: Element | null
	): Range | null {
		if (anchor instanceof Range) {
			return anchor;
		}
		if (anchor instanceof Node) {
			return this.createRangeForNode(anchor);
		}
		if (typeof anchor === "number") {
			return scopeRoot ? this.createDocumentStartRange(doc) : null;
		}
		return scopeRoot ? this.createDocumentStartRange(doc) : null;
	}

	private executeResolvedAnchor(
		anchorResolver: ((doc: Document) => unknown) | undefined,
		doc: Document,
		target: string
	): unknown {
		if (typeof anchorResolver !== "function") {
			return null;
		}
		try {
			return anchorResolver(doc);
		} catch (error) {
			logger.debugWithTag("FoliateVaultPublicationParser", "Failed to execute EPUB anchor resolver", {
				target,
				error,
			});
			return null;
		}
	}

	private createCanonicalCfiForRange(index: number, range: Range | null, fallbackHref?: string): string {
		if (!this.supportsEpubCfiNavigation()) {
			return fallbackHref || this.getSectionHrefByIndex(index);
		}
		if (!range) {
			return this.getBaseSectionCfi(index);
		}
		try {
			return this.createCfiFromRange(index, range);
		} catch (error) {
			logger.debugWithTag(
				"FoliateVaultPublicationParser",
				"Failed to canonicalize EPUB range back to CFI",
				{
					index,
					error,
				}
			);
			return this.getBaseSectionCfi(index);
		}
	}

	private supportsEpubCfiNavigation(): boolean {
		return Boolean(this.archive || typeof this.getBook().resolveCFI === "function");
	}

	private async findTocHrefForSection(targetIndex: number): Promise<string> {
		for (const href of this.collectTocHrefs(this.tocItems)) {
			try {
				const resolved = await Promise.resolve(this.getBook().resolveHref(href));
				if (resolved?.index === targetIndex) {
					return this.normalizeInternalHref(this.packageDocumentPath || href, href);
				}
			} catch {
			}
		}
		return "";
	}

	private collectTocHrefs(items: TocItem[]): string[] {
		const results: string[] = [];
		const visit = (entries: TocItem[]) => {
			for (const entry of entries) {
				if (entry.href) {
					results.push(entry.href);
				}
				if (entry.subitems?.length) {
					visit(entry.subitems);
				}
			}
		};
		visit(items);
		return Array.from(new Set(results));
	}

	private async loadRawDocumentByHref(href: string): Promise<Document | null> {
		const normalizedHref = this.normalizeSectionHref(href);
		if (!normalizedHref) {
			return null;
		}
		if (this.rawDocumentCache.has(normalizedHref)) {
			return this.rawDocumentCache.get(normalizedHref) || null;
		}
		if (!this.archive) {
			const sectionIndex = this.getSectionIndexForHref(normalizedHref);
			if (sectionIndex < 0) {
				return null;
			}
			const doc = await this.getRawDocumentFromGenericSection(sectionIndex);
			if (doc) {
				this.rawDocumentCache.set(normalizedHref, doc);
			}
			return doc;
		}
		const entry = this.findArchiveEntry(normalizedHref);
		if (!entry) {
			return null;
		}
		const raw = await entry.async("text");
		const mediaType = this.inferMimeType(normalizedHref);
		const repaired = this.isRewritableDocumentMediaType(mediaType)
			? this.repairMarkupText(raw, mediaType, normalizedHref)
			: raw;
		const doc = this.parseMarkupDocument(
			repaired,
			this.getMarkupParserType(mediaType),
			normalizedHref,
			true
		);
		this.rawDocumentCache.set(normalizedHref, doc);
		return doc;
	}

	private async getRawDocumentFromGenericSection(index: number): Promise<Document | null> {
		const section = this.getBook().sections[index];
		if (!section) {
			return null;
		}
		if (typeof section.createDocument === "function") {
			return section.createDocument();
		}
		return null;
	}

	private attachHtmlTransformPipeline(book: FoliateBook): void {
		const target = book.transformTarget;
		if (!target) {
			return;
		}
		const listener = (event: Event) => {
			const detail = (event as CustomEvent<{ data?: Promise<string> | string; type?: string }>).detail;
			if (!detail?.data) {
				return;
			}
			const mimeType = String(detail.type || "").toLowerCase();
			if (!mimeType.includes("html") && !mimeType.includes("svg") && !mimeType.includes("xml")) {
				return;
			}
			detail.data = Promise.resolve(detail.data)
				.then(async (rawMarkup) => {
					if (typeof rawMarkup !== "string") {
						return rawMarkup;
					}
					return this.inlineFoliateBlobStylesheets(rawMarkup, mimeType);
				})
				.catch((error) => {
					logger.warn("[FoliateVaultPublicationParser] Failed to transform foliate HTML payload:", error);
					return "";
				});
		};
		target.addEventListener("data", listener as EventListener);
		this.transformCleanup = () => target.removeEventListener("data", listener as EventListener);
	}

	private async inlineFoliateBlobStylesheets(markup: string, mediaType: string): Promise<string> {
		const parserType = this.getMarkupParserType(mediaType);
		let doc: Document;
		try {
			doc = this.parseMarkupDocument(markup, parserType, "foliate-transformed", true);
		} catch {
			return markup;
		}

		this.sanitizeFoliateDocument(doc);

		for (const styleElement of Array.from(doc.querySelectorAll("style"))) {
			if (styleElement.textContent) {
				styleElement.textContent = await this.normalizeFoliateCssText(styleElement.textContent);
			}
		}

		for (const linkElement of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
			const href = linkElement.getAttribute("href") || "";
			if (this.isRemoteResourceUrl(href)) {
				linkElement.remove();
				continue;
			}
			if (!href.startsWith("blob:")) {
				continue;
			}
			const cssText = await this.readTextResource(href);
			if (!cssText) {
				continue;
			}
			const inlinedCss = await this.normalizeFoliateCssText(cssText);
			linkElement.replaceWith(this.createInlineStylesheetElement(doc, inlinedCss, linkElement));
		}

		return parserType === "text/html"
			? doc.documentElement.outerHTML
			: new XMLSerializer().serializeToString(doc);
	}

	private sanitizeFoliateDocument(doc: Document): void {
		for (const element of Array.from(doc.querySelectorAll(ACTIVE_CONTENT_SELECTOR))) {
			element.remove();
		}

		for (const metaElement of Array.from(doc.querySelectorAll("meta[http-equiv]"))) {
			const httpEquiv = metaElement.getAttribute("http-equiv") || "";
			if (httpEquiv.trim().toLowerCase() === "refresh") {
				metaElement.remove();
			}
		}

		for (const element of Array.from(doc.querySelectorAll("*"))) {
			for (const attribute of Array.from(element.attributes)) {
				const attributeName = attribute.name;
				const attributeValue = attribute.value || "";
				if (/^on/i.test(attributeName)) {
					element.removeAttribute(attributeName);
					continue;
				}
				if (
					DANGEROUS_URL_ATTRIBUTES.includes(attributeName.toLowerCase()) &&
					SCRIPT_PROTOCOL_PATTERN.test(attributeValue)
				) {
					element.removeAttribute(attributeName);
				}
			}
		}

		// Remove problematic inline color styles that conflict with dark mode
		this.sanitizeInlineColorStyles(doc);
	}

	private sanitizeInlineColorStyles(doc: Document): void {
		const textElements = doc.querySelectorAll(
			"p, div, span, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, td, th, caption, label, legend"
		);

		for (const element of Array.from(textElements)) {
			const style = element.getAttribute("style");
			if (!style) {
				continue;
			}

			// Remove color and background-color from inline styles
			// This allows our reader styles to take precedence
			const sanitized = style
				.replace(/\bcolor\s*:\s*[^;]+;?/gi, "")
				.replace(/\bbackground-color\s*:\s*[^;]+;?/gi, "")
				.trim();

			if (sanitized) {
				element.setAttribute("style", sanitized);
			} else {
				element.removeAttribute("style");
			}
		}
	}

	private async normalizeFoliateCssText(cssText: string): Promise<string> {
		const inlinedCss = await this.inlineBlobCssImports(cssText);
		return this.stripUnsupportedExternalCss(inlinedCss);
	}

	private async inlineBlobCssImports(cssText: string, visited = new Set<string>()): Promise<string> {
		const importPattern = /@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?\s*;/gi;
		let output = cssText;
		for (const match of Array.from(cssText.matchAll(importPattern))) {
			const importHref = (match[1] || "").trim();
			if (!importHref.startsWith("blob:") || visited.has(importHref)) {
				continue;
			}
			visited.add(importHref);
			const importedCss = await this.readTextResource(importHref);
			if (!importedCss) {
				continue;
			}
			const expanded = await this.inlineBlobCssImports(importedCss, visited);
			output = output.replace(match[0], expanded);
		}
		return output;
	}

	private stripUnsupportedExternalCss(cssText: string): string {
		let output = cssText.replace(
			/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?\s*;/gi,
			(match, href: string) => (this.isRemoteResourceUrl(href) ? "" : match)
		);

		output = output.replace(/@font-face\s*{[\s\S]*?}/gi, (block) => {
			const sanitizedBlock = block.replace(/src\s*:\s*([^;]+);/gi, (_match, sources: string) => {
				const sanitizedSources = sources
					.replace(
						/\s*,?\s*url\((['"]?)(?:https?:)?\/\/[^)]+?\1\)(?:\s+format\((?:[^)]+)\))?\s*,?/gi,
						", "
					)
					.replace(/\s*,\s*,+/g, ", ")
					.replace(/^\s*,\s*|\s*,\s*$/g, "")
					.trim();
				return sanitizedSources ? `src: ${sanitizedSources};` : "";
			});

			return /src\s*:/.test(sanitizedBlock) ? sanitizedBlock : "";
		});

		return output;
	}

	private createInlineStylesheetElement(
		doc: Document,
		cssText: string,
		linkElement?: Element | null
	): HTMLLinkElement | Element {
		const styleElement = doc.createElement("style");
		styleElement.setAttribute("type", "text/css");
		styleElement.setAttribute("data-weave-inline-stylesheet", "true");
		const media = linkElement?.getAttribute("media");
		if (media) {
			styleElement.setAttribute("media", media);
		}
		styleElement.textContent = cssText;
		return styleElement;
	}

	private isRemoteResourceUrl(value: string): boolean {
		return REMOTE_RESOURCE_URL_PATTERN.test(String(value || "").trim());
	}

	private async readTextResource(href: string): Promise<string> {
		try {
			if (href.startsWith("blob:") || href.startsWith("data:")) {
				return await readTextResourceViaFetch(href);
			}
			return await readTextResourceViaXhr(href);
		} catch (error) {
			logger.warn("[FoliateVaultPublicationParser] Failed to read transformed resource:", {
				href,
				error,
			});
			return "";
		}
	}

	private async readBinaryResource(href: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
		try {
			return await readBinaryResourceViaFetch(href);
		} catch (error) {
			logger.warn("[FoliateVaultPublicationParser] Failed to read transformed binary resource:", {
				href,
				error,
			});
			return null;
		}
	}

	private parseAnyLegacyReadiumLocation(value: string): CompactReadiumLocation | null {
		const normalized = this.normalizeLocationString(value);
		if (!normalized.startsWith("readium:")) {
			return null;
		}
		const compact = this.parseCompactReadiumLocation(normalized);
		if (compact) {
			return compact;
		}
		const payload = this.parseLegacyStoredLocation(normalized);
		if (!payload?.href) {
			return null;
		}
		return {
			href: this.buildLegacyHrefTarget(payload),
			text: payload.text?.highlight,
		};
	}

	private parseCompactReadiumLocation(value: string): CompactReadiumLocation | null {
		const raw = value.startsWith("readium:") ? value.slice("readium:".length) : value;
		if (!raw.startsWith(`${COMPACT_READIUM_MARKER}${COMPACT_READIUM_SEPARATOR}`)) {
			return null;
		}
		const parts = raw.split(COMPACT_READIUM_SEPARATOR);
		if (parts[0] !== COMPACT_READIUM_MARKER || parts.length < 2) {
			return null;
		}
		const href = this.decodeCompactField(parts[1]);
		if (!href) {
			return null;
		}
		const fragment = this.decodeCompactField(parts[3]);
		const text = this.decodeCompactField(parts[5]);
		return { href, fragment, text };
	}

	private decodeCompactField(value?: string): string | undefined {
		if (!value) {
			return undefined;
		}
		try {
			const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
			const paddingLength = (4 - (normalized.length % 4)) % 4;
			const binary = atob(`${normalized}${"=".repeat(paddingLength)}`);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch {
			return undefined;
		}
	}

	private parseLegacyStoredLocation(value: string): LegacyStoredLocationPayload | null {
		try {
			return JSON.parse(decodeURIComponent(value.slice("readium:".length))) as LegacyStoredLocationPayload;
		} catch {
			return null;
		}
	}

	private buildLegacyHrefTarget(payload: LegacyStoredLocationPayload): string {
		const href = payload.href || "";
		const fragment = payload.locations?.fragments?.find(Boolean);
		if (fragment && href && !href.includes("#")) {
			return `${href}#${fragment}`;
		}
		return href;
	}

	private buildHrefTargetFromReadiumLocation(location: CompactReadiumLocation): string {
		if (location.fragment && !location.href.includes("#")) {
			return `${location.href}#${location.fragment}`;
		}
		return location.href;
	}

	private stripCfiAssertions(value: string): string {
		return String(value || "").replace(/\[[^\]]*]/g, "");
	}

	private wrapCfi(value: string): string {
		const normalizedValue = this.stripCfiAssertions(this.normalizeLocationString(value));
		return EpubCfi.isCFI.test(normalizedValue) ? normalizedValue : `epubcfi(${normalizedValue})`;
	}

	private isCfiLike(value: string): boolean {
		const normalized = this.normalizeLocationString(value);
		return normalized.startsWith("epubcfi(") || /^\/\d+/.test(normalized);
	}

	private findRangeByTextQuote(root: Element | null, text: TextQuote): Range | null {
		if (!root) {
			return null;
		}
		const highlight = text.highlight?.trim();
		if (!highlight) {
			return null;
		}
		const segments = this.collectTextSegments(root);
		if (segments.length === 0) {
			return null;
		}
		const combined = segments.map((segment) => segment.text).join("");
		let searchFrom = 0;
		let bestIndex = -1;
		let bestScore = -Infinity;
		while (searchFrom <= combined.length) {
			const foundAt = combined.indexOf(highlight, searchFrom);
			if (foundAt < 0) {
				break;
			}
			const score = this.scoreTextQuoteCandidate(
				combined,
				foundAt,
				highlight.length,
				text.before,
				text.after
			);
			if (score > bestScore) {
				bestScore = score;
				bestIndex = foundAt;
			}
			searchFrom = foundAt + Math.max(highlight.length, 1);
		}
		if (bestIndex < 0) {
			return null;
		}
		return this.createRangeFromTextOffsets(
			root.ownerDocument,
			segments,
			bestIndex,
			bestIndex + highlight.length
		);
	}

	private scoreTextQuoteCandidate(
		combined: string,
		index: number,
		highlightLength: number,
		before?: string,
		after?: string
	): number {
		let score = 0;
		if (before) {
			const actualBefore = combined.slice(Math.max(0, index - before.length), index);
			if (actualBefore === before) {
				score += before.length + 10;
			}
		}
		if (after) {
			const actualAfter = combined.slice(index + highlightLength, index + highlightLength + after.length);
			if (actualAfter === after) {
				score += after.length + 10;
			}
		}
		if (!before && !after) {
			score += 1;
		}
		return score;
	}

	private findFragmentTargetElement(doc: Document, fragment: string): Element | null {
		const normalizedFragment = String(fragment || "").trim();
		if (!normalizedFragment) {
			return null;
		}

		const byId = doc.getElementById(normalizedFragment);
		if (byId) {
			return byId;
		}

		try {
			const bySelector = doc.querySelector(
				`[id="${CSS.escape(normalizedFragment)}"],[name="${CSS.escape(normalizedFragment)}"]`
			);
			if (bySelector) {
				return bySelector;
			}
		} catch {
		}

		for (const element of Array.from(doc.getElementsByTagName("*"))) {
			if (
				element.getAttribute("xml:id") === normalizedFragment
				|| element.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") === normalizedFragment
			) {
				return element;
			}
		}

		return null;
	}

	private createRangeForFragment(doc: Document, fragment: string): Range | null {
		const target = this.findFragmentTargetElement(doc, fragment);
		return this.createRangeForNode(target);
	}

	private createRangeForNode(node: Element | Node | null | undefined): Range | null {
		if (!node?.ownerDocument) {
			return null;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = node as Text;
			const range = textNode.ownerDocument.createRange();
			range.setStart(textNode, 0);
			range.setEnd(textNode, Math.min(textNode.textContent?.length || 0, 1));
			return range;
		}
		if (node instanceof Element) {
			const textSegments = this.collectTextSegments(node);
			if (textSegments.length > 0) {
				const range = node.ownerDocument.createRange();
				range.setStart(textSegments[0].node, 0);
				range.setEnd(textSegments[0].node, Math.min(1, textSegments[0].text.length));
				return range;
			}
		}
		const range = node.ownerDocument.createRange();
		range.selectNode(node);
		return range;
	}

	private createDocumentStartRange(doc: Document): Range | null {
		const root = doc.body || doc.documentElement;
		const segments = this.collectTextSegments(root);
		if (segments.length > 0) {
			const range = doc.createRange();
			range.setStart(segments[0].node, 0);
			range.setEnd(segments[0].node, Math.min(1, segments[0].text.length));
			return range;
		}
		return this.createRangeForNode(root);
	}

	private collectTextSegments(root: Element): TextNodeSegment[] {
		const segments: TextNodeSegment[] = [];
		const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				const parent = node.parentElement;
				if (!parent || TEXT_NODE_TAG_BLACKLIST.has(parent.tagName.toUpperCase())) {
					return NodeFilter.FILTER_REJECT;
				}
				return (node.textContent || "").length > 0
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT;
			},
		});
		let offset = 0;
		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			const text = node.textContent || "";
			segments.push({ node, start: offset, end: offset + text.length, text });
			offset += text.length;
		}
		return segments;
	}

	private computeTextOffsetForBoundary(segments: TextNodeSegment[], node: Node, offset: number): number {
		if (node.nodeType === Node.TEXT_NODE) {
			const segment = segments.find((item) => item.node === node);
			if (segment) {
				return segment.start + Math.min(offset, segment.text.length);
			}
		}
		const rangeDoc = node.ownerDocument || document;
		const probe = rangeDoc.createRange();
		try {
			probe.setStart(segments[0].node, 0);
			probe.setEnd(node, offset);
			return probe.toString().length;
		} catch {
			return 0;
		}
	}

	private createRangeFromTextOffsets(
		doc: Document,
		segments: TextNodeSegment[],
		startOffset: number,
		endOffset: number
	): Range | null {
		const startSegment = segments.find(
			(segment) => startOffset >= segment.start && startOffset <= segment.end
		);
		const endSegment = segments.find((segment) => endOffset >= segment.start && endOffset <= segment.end);
		if (!startSegment || !endSegment) {
			return null;
		}
		const range = doc.createRange();
		range.setStart(startSegment.node, Math.max(0, startOffset - startSegment.start));
		range.setEnd(endSegment.node, Math.max(0, endOffset - endSegment.start));
		return range;
	}

	private createCollapsedRangeFromTextOffset(
		doc: Document,
		segments: TextNodeSegment[],
		offset: number
	): Range | null {
		const targetSegment = segments.find(
			(segment) => offset >= segment.start && offset <= segment.end
		) || segments[segments.length - 1];
		if (!targetSegment) {
			return null;
		}
		const textOffset = this.clamp(offset - targetSegment.start, 0, targetSegment.text.length);
		const range = doc.createRange();
		range.setStart(targetSegment.node, textOffset);
		range.setEnd(targetSegment.node, textOffset);
		return range;
	}

	private computeProgressionForRange(doc: Document, range: Range): number {
		const root = doc.body || doc.documentElement;
		const segments = this.collectTextSegments(root);
		if (segments.length === 0) {
			return 0;
		}
		const totalLength = segments[segments.length - 1]?.end || 0;
		if (totalLength <= 0) {
			return 0;
		}
		const startOffset = this.computeTextOffsetForBoundary(segments, range.startContainer, range.startOffset);
		return this.clamp(startOffset / totalLength, 0, 1);
	}

	private buildSearchSnippet(source: string, index: number, length: number): string {
		const start = Math.max(0, index - 40);
		const end = Math.min(source.length, index + length + 40);
		let snippet = source.slice(start, end).replace(/\s+/g, " ").trim();
		if (start > 0) {
			snippet = `...${snippet}`;
		}
		if (end < source.length) {
			snippet = `${snippet}...`;
		}
		return snippet;
	}

	private extractReadableSectionText(root: Element | null): string {
		if (!root) {
			return "";
		}

		const candidate = root as HTMLElement & { innerText?: string };
		const rawText = String(candidate.innerText || root.textContent || "")
			.replace(/\r\n?/g, "\n")
			.replace(/\u00a0/g, " ");
		const lines: string[] = [];
		let previousBlank = false;

		for (const line of rawText.split("\n")) {
			const normalizedLine = line.replace(/[ \t]+/g, " ").trim();
			if (!normalizedLine) {
				if (lines.length > 0 && !previousBlank) {
					lines.push("");
					previousBlank = true;
				}
				continue;
			}

			lines.push(normalizedLine);
			previousBlank = false;
		}

		return lines.join("\n").trim();
	}

	private async buildSectionMarkdownExport(
		root: Element | null,
		baseHref: string,
		title: string
	): Promise<{
		markdown: string;
		assets: FoliateChapterExportAsset[];
		plainText: string;
	}> {
		const plainText = this.extractReadableSectionText(root);
		if (!root) {
			return { markdown: "", assets: [], plainText };
		}

		const context: MarkdownExportContext = {
			baseHref,
			assets: [],
			assetBySource: new Map<string, FoliateChapterExportAsset>(),
		};

		let markdown = await this.renderBlockNodesToMarkdown(Array.from(root.childNodes), context);
		markdown = this.stripLeadingMarkdownHeading(this.normalizeExportedMarkdown(markdown), title);
		if (!markdown) {
			markdown = this.normalizeExportedMarkdown(this.stripLeadingSectionTitle(plainText, title));
		}

		return {
			markdown,
			assets: context.assets,
			plainText,
		};
	}

	private async renderBlockNodesToMarkdown(
		nodes: Node[],
		context: MarkdownExportContext
	): Promise<string> {
		const chunks: string[] = [];
		for (const node of nodes) {
			const rendered = this.normalizeExportedMarkdown(await this.renderNodeAsBlockMarkdown(node, context));
			if (rendered) {
				chunks.push(rendered);
			}
		}
		return chunks.join("\n\n");
	}

	private async renderNodeAsBlockMarkdown(
		node: Node,
		context: MarkdownExportContext
	): Promise<string> {
		if (node.nodeType === Node.TEXT_NODE) {
			return this.normalizeInlineMarkdown(this.normalizeInlineTextFragment(node.textContent || ""));
		}
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return "";
		}

		const element = node as Element;
		const tag = this.getNodeLocalName(element);
		if (!tag || MARKDOWN_SKIPPED_TAGS.has(tag)) {
			return "";
		}

		if (/^h[1-6]$/.test(tag)) {
			const level = Number(tag.slice(1));
			const text = this.normalizeInlineMarkdown(
				await this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context)
			);
			return text ? `${"#".repeat(level)} ${text}` : "";
		}

		if (tag === "blockquote") {
			const inner = this.normalizeExportedMarkdown(
				await this.renderBlockNodesToMarkdown(Array.from(element.childNodes), context)
			);
			return inner ? this.prefixMarkdownLines(inner, "> ") : "";
		}

		if (tag === "pre") {
			return this.renderPreformattedElementAsMarkdown(element);
		}

		if (tag === "hr") {
			return "---";
		}

		if (tag === "ul" || tag === "ol") {
			return this.renderListElementAsMarkdown(element, context, 0);
		}

		if (tag === "img") {
			return this.renderImageElementAsMarkdown(element, context);
		}

		if (tag === "figure") {
			return this.renderFigureElementAsMarkdown(element, context);
		}

		if (tag === "table") {
			return this.renderTableElementAsMarkdown(element, context);
		}

		if (tag === "p" || tag === "summary" || tag === "figcaption" || tag === "td" || tag === "th") {
			return this.normalizeInlineMarkdown(
				await this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context)
			);
		}

		const childNodes = Array.from(element.childNodes);
		if (childNodes.length === 0) {
			return this.normalizeInlineMarkdown(this.normalizeInlineTextFragment(element.textContent || ""));
		}

		if (MARKDOWN_CONTAINER_TAGS.has(tag) || childNodes.some((child) => this.nodeProducesBlockMarkdown(child))) {
			return this.renderBlockNodesToMarkdown(childNodes, context);
		}

		return this.normalizeInlineMarkdown(await this.renderInlineNodesToMarkdown(childNodes, context));
	}

	private async renderInlineNodesToMarkdown(
		nodes: Node[],
		context: MarkdownExportContext
	): Promise<string> {
		let result = "";
		for (const node of nodes) {
			result += await this.renderInlineNodeToMarkdown(node, context);
		}
		return result;
	}

	private async renderInlineNodeToMarkdown(
		node: Node,
		context: MarkdownExportContext
	): Promise<string> {
		if (node.nodeType === Node.TEXT_NODE) {
			return this.normalizeInlineTextFragment(node.textContent || "");
		}
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return "";
		}

		const element = node as Element;
		const tag = this.getNodeLocalName(element);
		if (!tag || MARKDOWN_SKIPPED_TAGS.has(tag)) {
			return "";
		}

		if (tag === "br") {
			return "\n";
		}

		if (tag === "code") {
			return this.renderInlineCodeSpan(element.textContent || "");
		}

		if (tag === "strong" || tag === "b") {
			const text = this.normalizeInlineMarkdown(
				await this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context)
			);
			return text ? `**${text}**` : "";
		}

		if (tag === "em" || tag === "i") {
			const text = this.normalizeInlineMarkdown(
				await this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context)
			);
			return text ? `*${text}*` : "";
		}

		if (tag === "s" || tag === "del" || tag === "strike") {
			const text = this.normalizeInlineMarkdown(
				await this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context)
			);
			return text ? `~~${text}~~` : "";
		}

		if (tag === "a") {
			const href = String(
				element.getAttribute("href") || element.getAttribute("xlink:href") || ""
			).trim();
			const text = this.normalizeInlineMarkdown(
				await this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context)
			);
			if (!href || !text) {
				return text;
			}
			if (text.includes("{{WEAVE_EPUB_ASSET_")) {
				return text;
			}
			if (href.startsWith("#")) {
				return text;
			}
			if (this.shouldKeepOriginalUrl(href)) {
				return `[${text}](${href})`;
			}
			return text;
		}

		if (tag === "img") {
			const image = await this.renderImageElementAsMarkdown(element, context);
			return image ? `\n${image}\n` : "";
		}

		if (this.nodeProducesBlockMarkdown(element)) {
			const block = this.normalizeExportedMarkdown(await this.renderNodeAsBlockMarkdown(element, context));
			return block ? `\n${block}\n` : "";
		}

		return this.renderInlineNodesToMarkdown(Array.from(element.childNodes), context);
	}

	private renderPreformattedElementAsMarkdown(element: Element): string {
		const rawText = String(element.textContent || "").replace(/\r\n?/g, "\n").trimEnd();
		if (!rawText.trim()) {
			return "";
		}

		const codeElement = Array.from(element.children).find(
			(child) => this.getNodeLocalName(child) === "code"
		);
		const className = String(codeElement?.getAttribute("class") || "");
		const languageMatch = className.match(/(?:language-|lang-)([A-Za-z0-9_-]+)/);
		const language = languageMatch?.[1] || "";
		const fence = rawText.includes("```") ? "````" : "```";
		return `${fence}${language}\n${rawText}\n${fence}`;
	}

	private async renderListElementAsMarkdown(
		listElement: Element,
		context: MarkdownExportContext,
		depth: number
	): Promise<string> {
		const ordered = this.getNodeLocalName(listElement) === "ol";
		const items = Array.from(listElement.children).filter(
			(child) => this.getNodeLocalName(child) === "li"
		);
		const renderedItems: string[] = [];

		for (const [index, item] of items.entries()) {
			const contentNodes = Array.from(item.childNodes).filter((child) => {
				if (child.nodeType !== Node.ELEMENT_NODE) {
					return true;
				}
				const childTag = this.getNodeLocalName(child as Element);
				return childTag !== "ul" && childTag !== "ol";
			});
			const nestedLists = Array.from(item.children).filter((child) => {
				const childTag = this.getNodeLocalName(child);
				return childTag === "ul" || childTag === "ol";
			});

			const itemContent = this.normalizeExportedMarkdown(
				await this.renderBlockNodesToMarkdown(contentNodes, context)
			);
			const bullet = ordered ? `${index + 1}. ` : "- ";
			const indent = "  ".repeat(depth);
			const continuationIndent = `${indent}  `;
			const prefixedContent = this.prefixListItemMarkdown(
				itemContent || this.normalizeInlineMarkdown(this.normalizeInlineTextFragment(item.textContent || "")),
				`${indent}${bullet}`,
				continuationIndent
			);

			const nestedMarkdownChunks: string[] = [];
			for (const nestedList of nestedLists) {
				const nestedMarkdown = this.normalizeExportedMarkdown(
					await this.renderListElementAsMarkdown(nestedList, context, depth + 1)
				);
				if (nestedMarkdown) {
					nestedMarkdownChunks.push(nestedMarkdown);
				}
			}

			renderedItems.push(
				[prefixedContent, ...nestedMarkdownChunks].filter(Boolean).join("\n")
			);
		}

		return renderedItems.join("\n");
	}

	private async renderFigureElementAsMarkdown(
		figureElement: Element,
		context: MarkdownExportContext
	): Promise<string> {
		const captionElement = Array.from(figureElement.children).find(
			(child) => this.getNodeLocalName(child) === "figcaption"
		);
		const bodyNodes = Array.from(figureElement.childNodes).filter((child) => child !== captionElement);
		const body = this.normalizeExportedMarkdown(await this.renderBlockNodesToMarkdown(bodyNodes, context));
		const caption = captionElement
			? this.normalizeInlineMarkdown(
					await this.renderInlineNodesToMarkdown(Array.from(captionElement.childNodes), context)
			  )
			: "";
		return [body, caption ? `*${caption}*` : ""].filter(Boolean).join("\n\n");
	}

	private async renderTableElementAsMarkdown(
		tableElement: Element,
		context: MarkdownExportContext
	): Promise<string> {
		const rowElements = Array.from(tableElement.querySelectorAll("tr"));
		if (rowElements.length === 0) {
			return "";
		}

		const matrix: string[][] = [];
		for (const row of rowElements) {
			const cells = Array.from(row.children).filter((cell) => {
				const tag = this.getNodeLocalName(cell);
				return tag === "th" || tag === "td";
			});
			if (cells.length === 0) {
				continue;
			}
			const rowCells: string[] = [];
			for (const cell of cells) {
				const content = this.normalizeInlineMarkdown(
					await this.renderInlineNodesToMarkdown(Array.from(cell.childNodes), context)
				);
				rowCells.push(
					(content || this.normalizeInlineMarkdown(this.normalizeInlineTextFragment(cell.textContent || "")))
						.replace(/\n+/g, " <br> ")
						.replace(/\|/g, "\\|")
				);
			}
			matrix.push(rowCells);
		}

		if (matrix.length === 0) {
			return "";
		}

		const columnCount = Math.max(...matrix.map((row) => row.length));
		const padded = matrix.map((row) =>
			Array.from({ length: columnCount }, (_, index) => row[index] || "")
		);
		const hasHeader = Array.from(rowElements[0]?.children || []).some(
			(cell) => this.getNodeLocalName(cell) === "th"
		);
		const header = hasHeader ? padded[0] : padded[0].map((cell, index) => cell || `列 ${index + 1}`);
		const bodyRows = hasHeader ? padded.slice(1) : padded;

		const lines = [
			`| ${header.join(" | ")} |`,
			`| ${header.map(() => "---").join(" | ")} |`,
			...bodyRows.map((row) => `| ${row.join(" | ")} |`),
		];
		return lines.join("\n");
	}

	private async renderImageElementAsMarkdown(
		imageElement: Element,
		context: MarkdownExportContext
	): Promise<string> {
		const src = String(
			imageElement.getAttribute("src") || imageElement.getAttribute("xlink:href") || ""
		).trim();
		const altText = this.normalizeInlineMarkdown(
			String(imageElement.getAttribute("alt") || imageElement.getAttribute("title") || "")
		);
		if (!src) {
			return altText;
		}
		if (this.isRemoteResourceUrl(src) || src.startsWith("//")) {
			const alt = altText || "image";
			return `![${alt}](${src})`;
		}

		const asset = await this.getOrCreateMarkdownAsset(src, context);
		return asset?.placeholder || altText;
	}

	private async getOrCreateMarkdownAsset(
		rawSrc: string,
		context: MarkdownExportContext
	): Promise<FoliateChapterExportAsset | null> {
		const normalizedSrc = String(rawSrc || "").trim();
		if (!normalizedSrc) {
			return null;
		}

		const sourceKey = normalizedSrc.startsWith("data:")
			? normalizedSrc
			: this.normalizeInternalHref(context.baseHref || normalizedSrc, normalizedSrc);
		if (!sourceKey) {
			return null;
		}

		const cached = context.assetBySource.get(sourceKey);
		if (cached) {
			return cached;
		}

		let bytes: Uint8Array | null = null;
		let mimeType = "application/octet-stream";
		if (sourceKey.startsWith("data:")) {
			const decoded = this.decodeDataUrl(sourceKey);
			if (!decoded) {
				return null;
			}
			bytes = decoded.bytes;
			mimeType = decoded.mimeType;
		} else if (sourceKey.startsWith("blob:")) {
			const blobResource = await this.readBinaryResource(sourceKey);
			if (!blobResource) {
				return null;
			}
			bytes = blobResource.bytes;
			mimeType = blobResource.mimeType || mimeType;
		} else {
			const entry = this.findArchiveEntry(sourceKey);
			if (entry) {
				bytes = new Uint8Array(await entry.async("uint8array"));
				mimeType = this.inferMimeType(sourceKey);
			} else {
				const blobResource = await this.readBinaryResource(sourceKey);
				if (!blobResource) {
					return null;
				}
				bytes = blobResource.bytes;
				mimeType = blobResource.mimeType || this.inferMimeType(sourceKey);
			}
		}

		if (!bytes || bytes.length === 0) {
			return null;
		}

		const asset: FoliateChapterExportAsset = {
			placeholder: `{{WEAVE_EPUB_ASSET_${context.assets.length}}}`,
			suggestedName: this.buildMarkdownAssetFileName(sourceKey, context.assets.length, mimeType),
			data: bytes,
			mimeType,
			originalHref: sourceKey.startsWith("data:") ? undefined : sourceKey,
		};
		context.assets.push(asset);
		context.assetBySource.set(sourceKey, asset);
		return asset;
	}

	private decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
		const match = String(dataUrl || "").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(?:;(base64))?,(.*)$/i);
		if (!match) {
			return null;
		}
		const mimeType = String(match[1] || "application/octet-stream").trim().toLowerCase();
		const isBase64 = Boolean(match[2]);
		const payload = match[3] || "";
		try {
			if (isBase64) {
				const binary = atob(payload);
				const bytes = new Uint8Array(binary.length);
				for (let index = 0; index < binary.length; index += 1) {
					bytes[index] = binary.charCodeAt(index);
				}
				return { bytes, mimeType };
			}
			return {
				bytes: new TextEncoder().encode(decodeURIComponent(payload)),
				mimeType,
			};
		} catch {
			return null;
		}
	}

	private buildMarkdownAssetFileName(source: string, index: number, mimeType: string): string {
		const sourcePath = source.startsWith("data:") ? "" : this.stripFragmentAndQuery(source);
		const rawFileName = sourcePath.split("/").pop() || "";
		const dotIndex = rawFileName.lastIndexOf(".");
		const rawBaseName =
			dotIndex > 0 ? rawFileName.slice(0, dotIndex) : rawFileName || `image-${index + 1}`;
		const rawExtension =
			dotIndex > 0 ? rawFileName.slice(dotIndex + 1).toLowerCase() : this.getDefaultExtensionForMimeType(mimeType);
		const baseName = rawBaseName.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
		const extension = rawExtension.replace(/[^A-Za-z0-9_-]/g, "");
		return extension ? `${baseName || `image-${index + 1}`}.${extension}` : baseName || `image-${index + 1}`;
	}

	private getDefaultExtensionForMimeType(mimeType: string): string {
		switch (String(mimeType || "").trim().toLowerCase()) {
			case "image/png":
				return "png";
			case "image/jpeg":
				return "jpg";
			case "image/gif":
				return "gif";
			case "image/webp":
				return "webp";
			case "image/avif":
				return "avif";
			case "image/svg+xml":
				return "svg";
			default:
				return "bin";
		}
	}

	private stripLeadingMarkdownHeading(markdown: string, title: string): string {
		const normalizedMarkdown = this.normalizeExportedMarkdown(markdown);
		const normalizedTitle = this.normalizeComparableReadingPointTitle(title);
		if (!normalizedMarkdown || !normalizedTitle) {
			return normalizedMarkdown;
		}

		const headingMatch = normalizedMarkdown.match(/^#\s+(.+?)\n+/);
		if (!headingMatch) {
			return normalizedMarkdown;
		}

		if (this.normalizeComparableReadingPointTitle(headingMatch[1] || "") !== normalizedTitle) {
			return normalizedMarkdown;
		}

		return this.normalizeExportedMarkdown(normalizedMarkdown.slice(headingMatch[0].length));
	}

	private prefixMarkdownLines(markdown: string, prefix: string): string {
		return markdown
			.split("\n")
			.map((line) => (line.trim().length > 0 ? `${prefix}${line}` : prefix.trimEnd()))
			.join("\n");
	}

	private prefixListItemMarkdown(content: string, firstPrefix: string, continuationPrefix: string): string {
		const normalizedContent = this.normalizeExportedMarkdown(content);
		if (!normalizedContent) {
			return firstPrefix.trimEnd();
		}
		const lines = normalizedContent.split("\n");
		return lines
			.map((line, index) => {
				if (index === 0) {
					return `${firstPrefix}${line}`;
				}
				return line ? `${continuationPrefix}${line}` : "";
			})
			.join("\n");
	}

	private renderInlineCodeSpan(text: string): string {
		const normalized = String(text || "").replace(/\r\n?/g, " ").trim();
		if (!normalized) {
			return "";
		}
		const tickCount = (normalized.match(/`+/g) || []).reduce(
			(max, current) => Math.max(max, current.length),
			1
		);
		const fence = "`".repeat(tickCount + 1);
		return `${fence}${normalized}${fence}`;
	}

	private normalizeInlineTextFragment(text: string): string {
		return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
	}

	private normalizeInlineMarkdown(markdown: string): string {
		return String(markdown || "")
			.replace(/\r\n?/g, "\n")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n[ \t]+/g, "\n")
			.replace(/[ \t]{2,}/g, " ")
			.trim();
	}

	private normalizeExportedMarkdown(markdown: string): string {
		return String(markdown || "")
			.replace(/\r\n?/g, "\n")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n[ \t]+/g, "\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	private nodeProducesBlockMarkdown(node: Node): boolean {
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return false;
		}
		const tag = this.getNodeLocalName(node as Element);
		return Boolean(tag) && MARKDOWN_BLOCK_TAGS.has(tag);
	}

	private getNodeLocalName(node: Element): string {
		return String(node.localName || node.tagName || "").toLowerCase();
	}

	private stripLeadingSectionTitle(text: string, title: string): string {
		const normalizedTitle = this.normalizeComparableReadingPointTitle(title);
		if (!normalizedTitle) {
			return text.trim();
		}

		const lines = text.split("\n");
		const firstMeaningfulIndex = lines.findIndex((line) => line.trim().length > 0);
		if (firstMeaningfulIndex < 0) {
			return "";
		}

		if (
			this.normalizeComparableReadingPointTitle(lines[firstMeaningfulIndex] || "") !== normalizedTitle
		) {
			return text.trim();
		}

		const remaining = lines.slice(firstMeaningfulIndex + 1);
		while (remaining.length > 0 && !remaining[0]?.trim()) {
			remaining.shift();
		}
		return remaining.join("\n").trim();
	}

	private normalizeReadingPointTitle(value: string): string {
		const normalized = String(value || "").replace(/\s+/g, " ").trim();
		return normalized || "未命名章节";
	}

	private normalizeComparableReadingPointTitle(value: string): string {
		return this.normalizeReadingPointTitle(value).replace(/^#{1,6}\s+/, "").toLowerCase();
	}

	private repairMarkupText(raw: string, mediaType: string, path: string): string {
		try {
			const parserType = this.getMarkupParserType(mediaType);
			const doc = this.parseMarkupDocument(raw, parserType, path, true);
			return parserType === "text/html"
				? doc.documentElement.outerHTML
				: new XMLSerializer().serializeToString(doc);
		} catch {
			return raw;
		}
	}

	private parseMarkupDocument(
		raw: string,
		parserType: DOMParserSupportedType,
		path: string,
		allowHtmlFallback = false
	): Document {
		const primaryDoc = new DOMParser().parseFromString(raw, parserType);
		if (!this.hasParserError(primaryDoc)) {
			return primaryDoc;
		}
		if (!allowHtmlFallback || parserType === "text/html") {
			throw new EpubError("invalid_markup", `EPUB XML parse failed: ${path}`, {
				filePath: this.filePath,
				path,
				parserType,
			});
		}

		const htmlDoc = new DOMParser().parseFromString(raw, "text/html");
		const expectedRootNames = this.getExpectedRootLocalNames(path);
		const hasExpectedRoot =
			expectedRootNames.length === 0 ||
			expectedRootNames.some((localName) => Boolean(this.findFirstElementByLocalName(htmlDoc, localName)));
		if (!hasExpectedRoot) {
			throw new EpubError("invalid_markup", `EPUB XML parse failed: ${path}`, {
				filePath: this.filePath,
				path,
				parserType,
			});
		}
		return htmlDoc;
	}

	private hasParserError(doc: Document): boolean {
		return Boolean(this.findFirstElementByLocalName(doc, "parsererror")?.textContent?.trim());
	}

	private getExpectedRootLocalNames(path: string): string[] {
		const normalizedPath = this.stripFragmentAndQuery(path).toLowerCase();
		if (normalizedPath.endsWith("container.xml")) {
			return ["container"];
		}
		if (normalizedPath.endsWith(".opf")) {
			return ["package"];
		}
		if (normalizedPath.endsWith(".ncx")) {
			return ["ncx"];
		}
		if (
			normalizedPath.endsWith(".xhtml") ||
			normalizedPath.endsWith(".html") ||
			normalizedPath.endsWith(".htm")
		) {
			return ["html"];
		}
		if (normalizedPath.endsWith(".svg")) {
			return ["svg"];
		}
		return [];
	}

	private getMarkupParserType(mediaType: string): DOMParserSupportedType {
		const normalizedMediaType = String(mediaType || "").trim().toLowerCase();
		if (normalizedMediaType.includes("svg")) {
			return "image/svg+xml";
		}
		if (normalizedMediaType.includes("xhtml")) {
			return "application/xhtml+xml";
		}
		return normalizedMediaType.includes("html") ? "text/html" : "application/xhtml+xml";
	}

	private blobToDataUrl(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result || ""));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(blob);
		});
	}

	private readFoliateMetadataValue(value: unknown): string {
		if (typeof value === "string") {
			return value.trim();
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				const next = this.readFoliateMetadataValue(item);
				if (next) {
					return next;
				}
			}
			return "";
		}
		if (value && typeof value === "object") {
			if ("name" in value) {
				return this.readFoliateMetadataValue((value as { name?: unknown }).name);
			}
			for (const entryValue of Object.values(value as Record<string, unknown>)) {
				const next = this.readFoliateMetadataValue(entryValue);
				if (next) {
					return next;
				}
			}
		}
		return "";
	}

	private findFirstElementByLocalName(
		root: Element | Document | null | undefined,
		localName: string
	): Element | null {
		if (!root) {
			return null;
		}
		const normalizedLocalName = localName.toLowerCase();
		if (
			root instanceof Element &&
			(root.localName || root.tagName).toLowerCase() === normalizedLocalName
		) {
			return root;
		}
		const elements = Array.from(root.getElementsByTagNameNS("*", localName)).filter(
			(element) => (element.localName || element.tagName).toLowerCase() === normalizedLocalName
		);
		return elements[0] || null;
	}

	private normalizeInternalHref(baseHref: string, rawHref: string): string {
		const normalizedRawHref = this.normalizeLocationString(rawHref);
		if (!normalizedRawHref) {
			return this.normalizeSectionHref(baseHref);
		}
		if (this.shouldKeepOriginalUrl(normalizedRawHref) && !normalizedRawHref.startsWith("#")) {
			return normalizedRawHref;
		}
		const target = this.splitHrefComponents(normalizedRawHref);
		const basePath = this.stripFragmentAndQuery(baseHref);
		const baseDirectory = this.dirname(basePath);
		const directPath = target.path ? this.normalizePath(target.path.replace(/^\/+/, "")) : "";
		if (directPath && !target.path.startsWith("/") && Boolean(this.findArchiveEntry(directPath))) {
			return `${directPath}${target.query}${target.fragment}`;
		}
		const resolvedPath = target.path
			? target.path.startsWith("/")
				? this.normalizePath(target.path.replace(/^\/+/, ""))
				: this.normalizePath(baseDirectory ? `${baseDirectory}/${target.path}` : target.path)
			: this.normalizePath(basePath);
		return `${resolvedPath}${target.query}${target.fragment}`;
	}

	private normalizeSectionHref(href: string): string {
		const normalizedHref = this.normalizeLocationString(href);
		if (!normalizedHref) {
			return "";
		}
		if (this.shouldKeepOriginalUrl(normalizedHref) && !normalizedHref.startsWith("#")) {
			return normalizedHref;
		}
		const strippedHref = this.stripFragmentAndQuery(normalizedHref);
		if (!strippedHref) {
			return "";
		}
		if (
			strippedHref.startsWith("/") ||
			strippedHref === this.packageDocumentPath ||
			Boolean(this.findArchiveEntry(strippedHref))
		) {
			return strippedHref;
		}
		return this.stripFragmentAndQuery(
			this.normalizeInternalHref(this.packageDocumentPath || normalizedHref, normalizedHref)
		);
	}

	private stripFragmentAndQuery(href: string): string {
		return this.normalizePath(this.splitHrefComponents(href).path);
	}

	private findArchiveEntry(path: string): JSZip.JSZipObject | null {
		if (!this.archive) {
			return null;
		}
		for (const candidate of this.getArchivePathCandidates(path)) {
			const entry = this.archive.file(candidate);
			if (entry) {
				return entry;
			}
		}
		for (const candidate of this.getArchivePathCandidates(path)) {
			const matchedPath = this.archiveEntryLookup.get(candidate.toLowerCase());
			if (!matchedPath) {
				continue;
			}
			const entry = this.archive.file(matchedPath);
			if (entry) {
				return entry;
			}
		}
		return null;
	}

	private rebuildArchiveEntryLookup(): void {
		this.archiveEntryLookup.clear();
		if (!this.archive) {
			return;
		}
		this.archive.forEach((relativePath, entry) => {
			if (entry.dir) {
				return;
			}
			const normalizedPath = this.normalizePath(relativePath);
			if (!normalizedPath) {
				return;
			}
			this.archiveEntryLookup.set(normalizedPath.toLowerCase(), relativePath);
			this.archiveEntryLookup.set(`/${normalizedPath}`.toLowerCase(), relativePath);
		});
	}

	private getArchivePathCandidates(path: string): string[] {
		const normalized = this.normalizePath(path);
		if (!normalized) {
			return [];
		}
		const candidates = new Set<string>([normalized]);
		if (normalized.startsWith("/")) {
			candidates.add(normalized.slice(1));
		} else {
			candidates.add(`/${normalized}`);
		}
		return Array.from(candidates).filter(Boolean);
	}

	private extractHrefFragment(href: string): string | null {
		const fragment = this.splitHrefComponents(href).fragment.replace(/^#/, "").trim();
		if (!fragment) {
			return null;
		}
		try {
			return decodeURIComponent(fragment);
		} catch {
			return fragment;
		}
	}

	private dirname(path: string): string {
		const normalized = this.normalizePath(path);
		const lastSlashIndex = normalized.lastIndexOf("/");
		return lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex) : "";
	}

	private normalizePath(path: string): string {
		const normalized = String(path || "").replace(/\\/g, "/");
		const isAbsolute = normalized.startsWith("/");
		const parts = normalized.split("/");
		const output: string[] = [];
		for (const part of parts) {
			if (!part || part === ".") {
				continue;
			}
			if (part === "..") {
				if (output.length > 0) {
					output.pop();
				}
				continue;
			}
			output.push(part);
		}
		return `${isAbsolute ? "/" : ""}${output.join("/")}`;
	}

	private normalizeLocationString(value: string): string {
		let normalized = String(value || "")
			.replace(/%5B/gi, "[")
			.replace(/%5D/gi, "]")
			.replace(/%7C/gi, "|");
		if (normalized.includes("%")) {
			try {
				normalized = decodeURIComponent(normalized);
			} catch {
				// Keep original value when decoding fails.
			}
		}
		return normalized.trim();
	}

	private shouldKeepOriginalUrl(value: string): boolean {
		const normalized = value.trim().toLowerCase();
		return (
			normalized.startsWith("data:") ||
			normalized.startsWith("blob:") ||
			normalized.startsWith("//") ||
			/^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
			normalized.startsWith("#")
		);
	}

	private isDocumentHrefLike(value: string): boolean {
		const path = this.stripFragmentAndQuery(value).toLowerCase();
		return (
			path.endsWith(".xhtml") ||
			path.endsWith(".html") ||
			path.endsWith(".htm") ||
			path.endsWith(".svg")
		);
	}

	private isRewritableDocumentMediaType(mediaType: string): boolean {
		const normalizedMediaType = String(mediaType || "").trim().toLowerCase();
		return normalizedMediaType.includes("html") || normalizedMediaType.includes("svg");
	}

	private inferMimeType(href: string): string {
		const path = this.stripFragmentAndQuery(href).toLowerCase();
		const manifestMediaType = this.manifestMediaTypeByHref.get(path);
		if (manifestMediaType) {
			return manifestMediaType;
		}
		if (path.endsWith(".xhtml") || path.endsWith(".html") || path.endsWith(".htm")) {
			return "application/xhtml+xml";
		}
		if (path.endsWith(".css")) {
			return "text/css";
		}
		if (path.endsWith(".js") || path.endsWith(".mjs")) {
			return "text/javascript";
		}
		if (path.endsWith(".svg")) {
			return "image/svg+xml";
		}
		if (path.endsWith(".png")) {
			return "image/png";
		}
		if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
			return "image/jpeg";
		}
		if (path.endsWith(".gif")) {
			return "image/gif";
		}
		if (path.endsWith(".webp")) {
			return "image/webp";
		}
		if (path.endsWith(".avif")) {
			return "image/avif";
		}
		if (path.endsWith(".mp3")) {
			return "audio/mpeg";
		}
		if (path.endsWith(".m4a")) {
			return "audio/mp4";
		}
		if (path.endsWith(".ogg") || path.endsWith(".oga")) {
			return "audio/ogg";
		}
		if (path.endsWith(".mp4") || path.endsWith(".m4v")) {
			return "video/mp4";
		}
		if (path.endsWith(".webm")) {
			return "video/webm";
		}
		if (path.endsWith(".ttf")) {
			return "font/ttf";
		}
		if (path.endsWith(".otf")) {
			return "font/otf";
		}
		if (path.endsWith(".woff")) {
			return "font/woff";
		}
		if (path.endsWith(".woff2")) {
			return "font/woff2";
		}
		if (path.endsWith(".xml")) {
			return "application/xml";
		}
		return "application/octet-stream";
	}

	private getGenericPublicationMimeType(extension: string): string {
		switch (extension) {
			case "mobi":
				return "application/x-mobipocket-ebook";
			case "azw3":
				return "application/vnd.amazon.mobi8-ebook";
			case "fb2":
				return "application/x-fictionbook+xml";
			case "fbz":
				return "application/x-zip-compressed-fb2";
			case "cbz":
				return "application/vnd.comicbook+zip";
			default:
				return "application/octet-stream";
		}
	}

	private readableTitleFromHref(href: string): string {
		const path = this.stripFragmentAndQuery(href);
		const lastSegment = path.split("/").pop() || path;
		const withoutExtension = lastSegment.replace(/\.[^.]+$/, "");
		const normalized = withoutExtension.replace(/[_-]+/g, " ").trim();
		if (!normalized) {
			return "章节";
		}
		try {
			return decodeURIComponent(normalized);
		} catch {
			return normalized;
		}
	}

	private splitHrefComponents(value: string): { path: string; query: string; fragment: string } {
		const normalized = this.normalizeLocationString(value);
		const hashIndex = normalized.indexOf("#");
		const queryIndex = normalized.indexOf("?");
		let pathEnd = normalized.length;
		if (queryIndex >= 0) {
			pathEnd = Math.min(pathEnd, queryIndex);
		}
		if (hashIndex >= 0) {
			pathEnd = Math.min(pathEnd, hashIndex);
		}
		const path = normalized.slice(0, pathEnd);
		const query =
			queryIndex >= 0
				? normalized.slice(
						queryIndex,
						hashIndex >= 0 && queryIndex < hashIndex ? hashIndex : undefined
				  )
				: "";
		const fragment = hashIndex >= 0 ? normalized.slice(hashIndex) : "";
		return { path, query, fragment };
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.min(Math.max(value, min), max);
	}
}

function readTextResourceViaXhr(href: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("GET", href, true);
		request.responseType = "text";
		request.onload = () => {
			if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
				resolve(request.responseText || "");
				return;
			}
			reject(
				new Error(
					`Failed to load text resource: ${request.status} ${request.statusText || "Unknown error"}`
				)
			);
		};
		request.onerror = async () => {
			try {
				resolve(await readTextResourceViaFetch(href));
			} catch (error) {
				reject(error);
			}
		};
		request.send();
	});
}

async function readTextResourceViaFetch(href: string): Promise<string> {
	if (typeof globalThis.fetch !== "function") {
		throw new Error("Failed to load text resource");
	}

	const response = await globalThis.fetch(href);
	if (!response.ok) {
		throw new Error(`Failed to load text resource: ${response.status} ${response.statusText}`);
	}
	return response.text();
}

async function readBinaryResourceViaFetch(href: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
	if (typeof globalThis.fetch !== "function") {
		throw new Error("Failed to load binary resource");
	}

	const response = await globalThis.fetch(href);
	if (!response.ok) {
		throw new Error(`Failed to load binary resource: ${response.status} ${response.statusText}`);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		bytes,
		mimeType: String(response.headers.get("content-type") || "application/octet-stream")
			.trim()
			.toLowerCase(),
	};
}
