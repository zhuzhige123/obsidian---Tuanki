import { type App, type EventRef, type TFile, normalizePath } from "obsidian";
import { getPluginPathsById, getV2PathsFromApp } from "../../config/paths";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { EpubLinkService } from "./EpubLinkService";
import { EpubStorageService } from "./EpubStorageService";
import { getEpubRuntime } from "./epub-runtime";
import type { HighlightSourceLocator } from "./reader-engine-types";
import type { EpubHighlightStyle } from "./types";

export interface BacklinkHighlight {
	cfiRange: string;
	color: string;
	style?: EpubHighlightStyle;
	text: string;
	chapterIndex?: number;
	chapterTitle?: string;
	sourceFile: string;
	sourceRef?: string;
	excerptId?: string;
	sourceLocators?: HighlightSourceLocator[];
	createdTime?: number;
}

export interface BacklinkSourceMatch {
	sourceFile: string;
	sourceRef?: string;
	excerptId?: string;
}

export interface BacklinkSourceHint {
	text?: string;
	createdTime?: number;
}

interface ParsedEpubCallout {
	color: string;
	style?: EpubHighlightStyle;
	linkMarkup: string;
	quotedText: string;
	chapterTitle?: string;
	fullMatch: string;
	createdTime?: number;
}

type JsonCardLike = {
	uuid?: string;
	content?: string;
	modified?: string;
};

type CanvasNodeLike = {
	id?: string;
	type?: string;
	text?: string;
	file?: string;
	subpath?: string;
};

type ResolvedCalloutLink = {
	filePath: string;
	cfi: string;
	chapter?: number;
	sourceId?: string;
	excerptId?: string;
};

type EpubTargetIdentity = {
	filePath: string;
	fileName: string;
	sourceId?: string;
};

type OpenMarkdownViewLike = {
	file?: { path?: string };
	editor?: {
		getValue?: () => string;
		setValue?: (value: string) => void;
	};
	save?: () => Promise<void>;
};

type HighlightSourceFileStamp = {
	path: string;
	mtime: number;
	size: number;
};

interface EpubBacklinkHighlightsCacheManifest {
	markdownSources: HighlightSourceFileStamp[];
	canvasSources: HighlightSourceFileStamp[];
	cardDataSources: HighlightSourceFileStamp[];
	boundCanvasPath?: string;
}

interface EpubBacklinkHighlightsCacheEntry {
	manifestFingerprint: string;
	savedAt: string;
	highlights: BacklinkHighlight[];
}

interface EpubBacklinkHighlightsCacheStore {
	version: string;
	lastUpdated: string;
	entries: Record<string, EpubBacklinkHighlightsCacheEntry>;
	sourceIndex?: EpubBacklinkSourceIndexSnapshot;
}

type EpubBacklinkSourceIndexFileKind = "markdown" | "canvas" | "cardData";

interface IndexedBacklinkTargetIdentity {
	filePath: string;
	fileName: string;
	sourceId?: string;
}

interface IndexedBacklinkHighlightEntry {
	target: IndexedBacklinkTargetIdentity;
	highlight: BacklinkHighlight;
}

interface IndexedCanvasFileNodeBinding {
	targetPath: string;
	nodeId: string;
}

interface EpubBacklinkSourceIndexFileRecord {
	path: string;
	kind: EpubBacklinkSourceIndexFileKind;
	mtime: number;
	size: number;
	directHighlights: IndexedBacklinkHighlightEntry[];
	canvasFileNodeBindings?: IndexedCanvasFileNodeBinding[];
}

interface EpubBacklinkSourceIndexSnapshot {
	version: string;
	updatedAt: string;
	files: EpubBacklinkSourceIndexFileRecord[];
}

const STRUCTURED_CARD_DATA_FILE_EXTENSIONS = new Set(["json", "wdeck"]);
const EPUB_BACKLINK_HIGHLIGHTS_CACHE_VERSION = "1.0.0";
const EPUB_BACKLINK_SOURCE_INDEX_VERSION = "1.0.0";

export class EpubBacklinkHighlightService {
	private app: App;
	private storageService: EpubStorageService;
	private localPluginId: string;
	private diskCacheStore: EpubBacklinkHighlightsCacheStore | null = null;
	private diskCacheLoaded = false;
	private inflightDiskCacheLoad: Promise<EpubBacklinkHighlightsCacheStore> | null = null;
	private inflightDiskCacheWrite: Promise<void> | null = null;
	private sourceIndexPrimed = false;
	private touchedSourceIndexPaths = new Set<string>();
	private sourceIndexVaultEventRefs: EventRef[] = [];

	constructor(app: App) {
		this.app = app;
		this.storageService = new EpubStorageService(app);
		this.localPluginId = getEpubRuntime().pluginDirName;
		this.setupSourceIndexFileWatchers();
	}

	destroy(): void {
		const offref = (this.app.vault as typeof this.app.vault & {
			offref?: (ref: EventRef) => void;
		}).offref;
		if (typeof offref === "function") {
			for (const ref of this.sourceIndexVaultEventRefs) {
				offref.call(this.app.vault, ref);
			}
		}
		this.sourceIndexVaultEventRefs = [];
		this.touchedSourceIndexPaths.clear();
	}

	async collectHighlights(
		epubFilePath: string,
		boundCanvasPath?: string | null
	): Promise<BacklinkHighlight[]> {
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		const sourceIndex = await this.ensureSourceIndexSnapshotUpToDate();
		const manifest = this.buildHighlightSourceManifestFromSourceIndex(
			sourceIndex,
			targetIdentity,
			boundCanvasPath
		);
		const cachedHighlights = await this.readCachedHighlights(targetIdentity, manifest, boundCanvasPath);
		if (cachedHighlights) {
			logger.debug(
				`[EpubBacklinkHighlightService] Cache hit for ${epubFilePath} ` +
					`(markdown=${manifest.markdownSources.length}, canvas=${manifest.canvasSources.length}, cardData=${manifest.cardDataSources.length})`
			);
			return cachedHighlights;
		}

		const highlights = this.collectHighlightsFromSourceIndexSnapshot(
			sourceIndex,
			targetIdentity,
			boundCanvasPath
		);
		const normalizedHighlights = this.cloneHighlightsForCache(highlights);
		await this.persistCachedHighlights(targetIdentity, manifest, normalizedHighlights, boundCanvasPath);

		logger.debug(
			`[EpubBacklinkHighlightService] Found ${highlights.length} highlights for ${epubFilePath} ` +
				`(markdown=${manifest.markdownSources.length}, canvas=${manifest.canvasSources.length}, cardData=${manifest.cardDataSources.length})`
		);
		return normalizedHighlights;
	}

	async mayFileAffectHighlights(
		sourcePath: string,
		epubFilePath: string,
		boundCanvasPath?: string | null
	): Promise<boolean> {
		const normalizedSourcePath = normalizePath(String(sourcePath || "").trim());
		if (!normalizedSourcePath) {
			return false;
		}
		const normalizedBoundCanvasPath = normalizePath(String(boundCanvasPath || "").trim());
		if (normalizedBoundCanvasPath && normalizedSourcePath === normalizedBoundCanvasPath) {
			return true;
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedSourcePath);
		if (!(file && this.isTFile(file))) {
			return false;
		}

		if (file.extension === "canvas") {
			const content = await this.app.vault.cachedRead(file);
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return this.contentMayReferenceTarget(content, targetIdentity);
		}

		if (file.extension === "md") {
			const content = await this.app.vault.cachedRead(file);
			if (!content.includes("[!EPUB")) {
				return false;
			}
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return this.contentMayReferenceTarget(content, targetIdentity);
		}

		if (this.isRelevantCardDataFile(file)) {
			const content = await this.app.vault.cachedRead(file);
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return this.contentMayReferenceTarget(content, targetIdentity);
		}

		return false;
	}

	private async ensureSourceIndexSnapshotUpToDate(): Promise<EpubBacklinkSourceIndexSnapshot> {
		this.setupSourceIndexFileWatchers();
		const store = this.diskCacheLoaded
			? this.diskCacheStore || this.createEmptyDiskCacheStore()
			: await this.loadDiskCacheStore();
		const cachedSnapshot = store.sourceIndex;
		if (cachedSnapshot && this.sourceIndexPrimed && this.sourceIndexVaultEventRefs.length > 0) {
			const incrementallyUpdated = await this.updateSourceIndexSnapshotIncrementally(cachedSnapshot);
			if (incrementallyUpdated) {
				return incrementallyUpdated;
			}
		}
		const candidates = this.getSourceIndexCandidateFiles();
		const cachedByPath = new Map((cachedSnapshot?.files || []).map((file) => [file.path, file] as const));
		const nextFiles: EpubBacklinkSourceIndexFileRecord[] = [];
		let changed = !cachedSnapshot;

		for (const candidate of candidates) {
			const currentStamp = await this.buildFileStamp(candidate.file.path);
			const currentMTime = currentStamp?.mtime ?? 0;
			const currentSize = currentStamp?.size ?? 0;
			const cachedRecord = cachedByPath.get(candidate.file.path);
			if (
				cachedRecord &&
				cachedRecord.kind === candidate.kind &&
				cachedRecord.mtime === currentMTime &&
				cachedRecord.size === currentSize
			) {
				nextFiles.push(cachedRecord);
				continue;
			}

			changed = true;
			nextFiles.push(
				await this.readSourceIndexFileRecord(candidate.file, candidate.kind, currentMTime, currentSize)
			);
		}

		if (!changed && cachedSnapshot && cachedSnapshot.files.length !== candidates.length) {
			changed = true;
		}

		if (!changed && cachedSnapshot) {
			this.sourceIndexPrimed = true;
			this.touchedSourceIndexPaths.clear();
			return cachedSnapshot;
		}

		const snapshot: EpubBacklinkSourceIndexSnapshot = {
			version: EPUB_BACKLINK_SOURCE_INDEX_VERSION,
			updatedAt: new Date().toISOString(),
			files: nextFiles.sort((left, right) => left.path.localeCompare(right.path, "zh-CN")),
		};
		await this.persistSourceIndexSnapshot(snapshot);
		this.sourceIndexPrimed = true;
		this.touchedSourceIndexPaths.clear();
		return snapshot;
	}

	private async updateSourceIndexSnapshotIncrementally(
		cachedSnapshot: EpubBacklinkSourceIndexSnapshot
	): Promise<EpubBacklinkSourceIndexSnapshot | null> {
		const touchedPaths = Array.from(this.touchedSourceIndexPaths).filter((path) => this.isPotentialSourceIndexPath(path));
		if (touchedPaths.length === 0) {
			return cachedSnapshot;
		}

		const currentCandidates = this.getSourceIndexCandidateFiles();
		const currentByPath = new Map(currentCandidates.map((candidate) => [candidate.file.path, candidate] as const));
		const cachedPaths = new Set(cachedSnapshot.files.map((file) => file.path));
		const touchedSet = new Set(touchedPaths);
		const nextFiles: EpubBacklinkSourceIndexFileRecord[] = [];

		for (const cachedRecord of cachedSnapshot.files) {
			const currentCandidate = currentByPath.get(cachedRecord.path);
			if (!currentCandidate) {
				if (!touchedSet.has(cachedRecord.path)) {
					return null;
				}
				continue;
			}

			if (touchedSet.has(cachedRecord.path)) {
				continue;
			}

			const currentStamp = await this.buildFileStamp(currentCandidate.file.path);
			if (!currentStamp) {
				return null;
			}

			if (
				cachedRecord.kind === currentCandidate.kind &&
				cachedRecord.mtime === currentStamp.mtime &&
				cachedRecord.size === currentStamp.size
			) {
				nextFiles.push(cachedRecord);
				continue;
			}

			nextFiles.push(
				await this.readSourceIndexFileRecord(
					currentCandidate.file,
					currentCandidate.kind,
					currentStamp.mtime,
					currentStamp.size
				)
			);
		}

		for (const touchedPath of touchedSet) {
			const currentCandidate = currentByPath.get(touchedPath);
			if (!currentCandidate) {
				continue;
			}
			const currentStamp = await this.buildFileStamp(currentCandidate.file.path);
			if (!currentStamp) {
				return null;
			}
			nextFiles.push(
				await this.readSourceIndexFileRecord(
					currentCandidate.file,
					currentCandidate.kind,
					currentStamp.mtime,
					currentStamp.size
				)
			);
		}

		for (const candidate of currentCandidates) {
			if (cachedPaths.has(candidate.file.path) || touchedSet.has(candidate.file.path)) {
				continue;
			}
			return null;
		}

		nextFiles.sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
		const snapshot: EpubBacklinkSourceIndexSnapshot = {
			version: EPUB_BACKLINK_SOURCE_INDEX_VERSION,
			updatedAt: new Date().toISOString(),
			files: nextFiles,
		};
		await this.persistSourceIndexSnapshot(snapshot);
		this.touchedSourceIndexPaths.clear();
		return snapshot;
	}

	private setupSourceIndexFileWatchers(): void {
		if (this.sourceIndexVaultEventRefs.length > 0) {
			return;
		}
		const on = (this.app.vault as typeof this.app.vault & {
			on?: (event: string, callback: (...args: any[]) => void) => EventRef;
		}).on;
		if (typeof on !== "function") {
			return;
		}
		this.sourceIndexVaultEventRefs = [
			on.call(this.app.vault, "modify", (file: TFile) => {
				this.markSourceIndexPathTouched(file?.path);
			}),
			on.call(this.app.vault, "create", (file: TFile) => {
				this.markSourceIndexPathTouched(file?.path);
			}),
			on.call(this.app.vault, "delete", (file: TFile) => {
				this.markSourceIndexPathTouched(file?.path);
			}),
			on.call(this.app.vault, "rename", (file: TFile, oldPath: string) => {
				this.markSourceIndexPathTouched(oldPath);
				this.markSourceIndexPathTouched(file?.path);
			}),
		].filter(Boolean);
	}

	private markSourceIndexPathTouched(path?: string | null): void {
		const normalizedPath = normalizePath(String(path || "").trim());
		if (!normalizedPath || !this.isPotentialSourceIndexPath(normalizedPath)) {
			return;
		}
		this.touchedSourceIndexPaths.add(normalizedPath);
	}

	private isPotentialSourceIndexPath(path: string): boolean {
		const normalizedPath = normalizePath(String(path || "").trim());
		if (!normalizedPath) {
			return false;
		}
		if (normalizedPath.endsWith(".md") || normalizedPath.endsWith(".canvas")) {
			return true;
		}
		const extension = normalizedPath.split(".").pop();
		if (!this.isStructuredCardDataExtension(extension)) {
			return false;
		}
		const v2Paths = getV2PathsFromApp(this.app);
		return (
			normalizedPath.startsWith(`${v2Paths.memory.cards}/`) ||
			normalizedPath.startsWith(`${v2Paths.memory.root}/deck-files/`)
		);
	}

	private getSourceIndexCandidateFiles(): Array<{
		file: TFile;
		kind: EpubBacklinkSourceIndexFileKind;
	}> {
		const candidates = new Map<string, { file: TFile; kind: EpubBacklinkSourceIndexFileKind }>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			candidates.set(file.path, { file, kind: "markdown" });
		}
		for (const file of this.app.vault.getFiles()) {
			if (file.extension === "canvas") {
				candidates.set(file.path, { file, kind: "canvas" });
				continue;
			}
			if (this.isRelevantCardDataFile(file)) {
				candidates.set(file.path, { file, kind: "cardData" });
			}
		}
		return Array.from(candidates.values()).sort((left, right) =>
			left.file.path.localeCompare(right.file.path, "zh-CN")
		);
	}

	private async readSourceIndexFileRecord(
		file: TFile,
		kind: EpubBacklinkSourceIndexFileKind,
		mtime: number,
		size: number
	): Promise<EpubBacklinkSourceIndexFileRecord> {
		let directHighlights: IndexedBacklinkHighlightEntry[] = [];
		let canvasFileNodeBindings: IndexedCanvasFileNodeBinding[] | undefined;
		try {
			const content = await this.app.vault.cachedRead(file);
			if (kind === "markdown") {
				directHighlights = this.parseIndexedHighlightsFromTextContent(content, file.path);
			} else if (kind === "cardData") {
				directHighlights = this.parseIndexedHighlightsFromCardDataContent(content, file.path);
			} else {
				const parsed = this.parseIndexedCanvasContent(content, file.path);
				directHighlights = parsed.directHighlights;
				canvasFileNodeBindings = parsed.canvasFileNodeBindings;
			}
		} catch (error) {
			logger.debug("[EpubBacklinkHighlightService] Failed to index source file:", {
				path: file.path,
				kind,
				error,
			});
		}

		return {
			path: file.path,
			kind,
			mtime,
			size,
			directHighlights,
			...(canvasFileNodeBindings?.length ? { canvasFileNodeBindings } : {}),
		};
	}

	private parseIndexedHighlightsFromTextContent(
		content: string,
		sourceFile: string,
		sourceRef?: string
	): IndexedBacklinkHighlightEntry[] {
		if (!String(content || "").includes("[!EPUB")) {
			return [];
		}
		const results: IndexedBacklinkHighlightEntry[] = [];
		for (const callout of this.extractEpubCallouts(content)) {
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink) continue;
			const text = this.normalizeQuotedHighlightText(
				callout.quotedText
				.split("\n")
				.map((line) => line.replace(/^>\s?/, ""))
				.join("\n")
				,
				callout.style
			);
			results.push({
				target: this.toIndexedTargetIdentity(resolvedLink),
				highlight: {
					cfiRange: resolvedLink.cfi,
					color: callout.color,
					style: callout.style,
					text,
					chapterIndex: resolvedLink.chapter,
					chapterTitle: callout.chapterTitle,
					sourceFile,
					sourceRef,
					excerptId: resolvedLink.excerptId,
					createdTime: callout.createdTime,
				},
			});
		}
		return results;
	}

	private parseIndexedHighlightsFromCardDataContent(
		content: string,
		sourceFile: string
	): IndexedBacklinkHighlightEntry[] {
		try {
			const parsed = JSON.parse(content);
			const cardArrays = this.extractCardArraysFromJson(parsed);
			const results: IndexedBacklinkHighlightEntry[] = [];
			for (const cards of cardArrays) {
				for (const card of cards) {
					if (!card || typeof card.content !== "string") continue;
					const sourceRef =
						typeof card.uuid === "string" && card.uuid.length > 0 ? `card:${card.uuid}` : undefined;
					results.push(...this.parseIndexedHighlightsFromTextContent(card.content, sourceFile, sourceRef));
				}
			}
			return results;
		} catch (_error) {
			return [];
		}
	}

	private parseIndexedCanvasContent(
		content: string,
		sourceFile: string
	): {
		directHighlights: IndexedBacklinkHighlightEntry[];
		canvasFileNodeBindings: IndexedCanvasFileNodeBinding[];
	} {
		try {
			const parsed = JSON.parse(content) as { nodes?: CanvasNodeLike[] };
			const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
			const directHighlights: IndexedBacklinkHighlightEntry[] = [];
			const bindingMap = new Map<string, IndexedCanvasFileNodeBinding>();
			for (const node of nodes) {
				if (node?.type === "text" && typeof node.text === "string" && node.text.length > 0) {
					directHighlights.push(...this.parseIndexedHighlightsFromTextContent(node.text, sourceFile, node.id));
					continue;
				}
				if (
					node?.type !== "file" ||
					typeof node.file !== "string" ||
					node.file.length === 0 ||
					typeof node.id !== "string" ||
					node.id.length === 0
				) {
					continue;
				}
				const normalizedTargetPath = normalizePath(node.file);
				if (!normalizedTargetPath) {
					continue;
				}
				const key = `${normalizedTargetPath}::${node.id}`;
				if (!bindingMap.has(key)) {
					bindingMap.set(key, {
						targetPath: normalizedTargetPath,
						nodeId: node.id,
					});
				}
			}
			return {
				directHighlights,
				canvasFileNodeBindings: Array.from(bindingMap.values()),
			};
		} catch (_error) {
			return {
				directHighlights: [],
				canvasFileNodeBindings: [],
			};
		}
	}

	private toIndexedTargetIdentity(resolvedLink: ResolvedCalloutLink): IndexedBacklinkTargetIdentity {
		const filePath = normalizePath(String(resolvedLink.filePath || ""));
		return {
			filePath,
			fileName: filePath.split("/").pop() || "",
			...(resolvedLink.sourceId ? { sourceId: resolvedLink.sourceId } : {}),
		};
	}

	private isSameIndexedTarget(
		target: IndexedBacklinkTargetIdentity,
		targetIdentity: EpubTargetIdentity
	): boolean {
		if (target.sourceId && targetIdentity.sourceId) {
			return target.sourceId === targetIdentity.sourceId;
		}
		return normalizePath(target.filePath || "") === targetIdentity.filePath;
	}

	private collectHighlightsFromSourceIndexSnapshot(
		sourceIndex: EpubBacklinkSourceIndexSnapshot,
		targetIdentity: EpubTargetIdentity,
		boundCanvasPath?: string | null
	): BacklinkHighlight[] {
		const normalizedBoundCanvasPath = normalizePath(String(boundCanvasPath || ""));
		const recordsByPath = new Map(sourceIndex.files.map((record) => [record.path, record] as const));
		const results: BacklinkHighlight[] = [];

		for (const record of sourceIndex.files) {
			for (const entry of record.directHighlights) {
				if (this.isSameIndexedTarget(entry.target, targetIdentity)) {
					results.push(this.cloneHighlightsForCache([entry.highlight])[0]);
				}
			}
		}

		if (normalizedBoundCanvasPath) {
			const boundCanvasRecord = recordsByPath.get(normalizedBoundCanvasPath);
			if (boundCanvasRecord?.kind === "canvas") {
				for (const binding of boundCanvasRecord.canvasFileNodeBindings || []) {
					const boundSourceRecord = recordsByPath.get(binding.targetPath);
					if (!boundSourceRecord) {
						continue;
					}
					const locator = this.buildCanvasFileNodeLocator(boundCanvasRecord.path, binding.nodeId);
					for (const entry of boundSourceRecord.directHighlights) {
						if (!this.isSameIndexedTarget(entry.target, targetIdentity)) {
							continue;
						}
						results.push(this.withAdditionalSourceLocator(this.cloneHighlightsForCache([entry.highlight])[0], locator));
					}
				}
			}
		}

		return results;
	}

	private buildHighlightSourceManifestFromSourceIndex(
		sourceIndex: EpubBacklinkSourceIndexSnapshot,
		targetIdentity: EpubTargetIdentity,
		boundCanvasPath?: string | null
	): EpubBacklinkHighlightsCacheManifest {
		const normalizedBoundCanvasPath = normalizePath(String(boundCanvasPath || ""));
		const recordsByPath = new Map(sourceIndex.files.map((record) => [record.path, record] as const));
		const markdownSources = new Map<string, HighlightSourceFileStamp>();
		const canvasSources = new Map<string, HighlightSourceFileStamp>();
		const cardDataSources = new Map<string, HighlightSourceFileStamp>();

		for (const record of sourceIndex.files) {
			const hasDirectMatch = record.directHighlights.some((entry) => this.isSameIndexedTarget(entry.target, targetIdentity));
			if (!hasDirectMatch) {
				continue;
			}
			this.addRecordToHighlightManifestBucket(record, markdownSources, canvasSources, cardDataSources);
		}

		if (normalizedBoundCanvasPath) {
			const boundCanvasRecord = recordsByPath.get(normalizedBoundCanvasPath);
			if (boundCanvasRecord?.kind === "canvas") {
				this.addRecordToHighlightManifestBucket(boundCanvasRecord, markdownSources, canvasSources, cardDataSources);
				for (const binding of boundCanvasRecord.canvasFileNodeBindings || []) {
					const sourceRecord = recordsByPath.get(binding.targetPath);
					if (!sourceRecord) {
						continue;
					}
					const hasBoundMatch = sourceRecord.directHighlights.some((entry) => this.isSameIndexedTarget(entry.target, targetIdentity));
					if (!hasBoundMatch) {
						continue;
					}
					this.addRecordToHighlightManifestBucket(sourceRecord, markdownSources, canvasSources, cardDataSources);
				}
			}
		}

		return {
			markdownSources: Array.from(markdownSources.values()).sort((left, right) => left.path.localeCompare(right.path)),
			canvasSources: Array.from(canvasSources.values()).sort((left, right) => left.path.localeCompare(right.path)),
			cardDataSources: Array.from(cardDataSources.values()).sort((left, right) => left.path.localeCompare(right.path)),
			boundCanvasPath: normalizedBoundCanvasPath || undefined,
		};
	}

	private addRecordToHighlightManifestBucket(
		record: EpubBacklinkSourceIndexFileRecord,
		markdownSources: Map<string, HighlightSourceFileStamp>,
		canvasSources: Map<string, HighlightSourceFileStamp>,
		cardDataSources: Map<string, HighlightSourceFileStamp>
	): void {
		const stamp: HighlightSourceFileStamp = {
			path: record.path,
			mtime: record.mtime,
			size: record.size,
		};
		if (record.kind === "markdown") {
			markdownSources.set(record.path, stamp);
			return;
		}
		if (record.kind === "canvas") {
			canvasSources.set(record.path, stamp);
			return;
		}
		cardDataSources.set(record.path, stamp);
	}

	private normalizeSourceIndexSnapshot(raw: unknown): EpubBacklinkSourceIndexSnapshot | undefined {
		if (!raw || typeof raw !== "object") {
			return undefined;
		}
		const candidate = raw as Partial<EpubBacklinkSourceIndexSnapshot>;
		if (!Array.isArray(candidate.files)) {
			return undefined;
		}
		const files = candidate.files
			.filter((record): record is EpubBacklinkSourceIndexFileRecord => {
				return !!record && typeof record === "object" && typeof record.path === "string" && typeof record.kind === "string" && Array.isArray(record.directHighlights);
			})
			.map((record) => ({
				path: normalizePath(String(record.path || "")),
				kind: record.kind,
				mtime: typeof record.mtime === "number" ? record.mtime : 0,
				size: typeof record.size === "number" ? record.size : 0,
				directHighlights: record.directHighlights
					.filter((entry): entry is IndexedBacklinkHighlightEntry => !!entry && typeof entry === "object" && !!entry.target && !!entry.highlight)
					.map((entry) => ({
						target: {
							filePath: normalizePath(String(entry.target.filePath || "")),
							fileName: String(entry.target.fileName || ""),
							...(entry.target.sourceId ? { sourceId: String(entry.target.sourceId) } : {}),
						},
						highlight: this.cloneHighlightsForCache([entry.highlight])[0],
					})),
				...(Array.isArray(record.canvasFileNodeBindings)
					? {
						canvasFileNodeBindings: record.canvasFileNodeBindings
							.filter((binding): binding is IndexedCanvasFileNodeBinding => !!binding && typeof binding === "object")
							.map((binding) => ({
								targetPath: normalizePath(String(binding.targetPath || "")),
								nodeId: String(binding.nodeId || ""),
							}))
							.filter((binding) => binding.targetPath && binding.nodeId),
					}
					: {}),
			}))
			.filter((record) => record.path.length > 0);
		return {
			version:
				typeof candidate.version === "string" && candidate.version.trim()
					? candidate.version
					: EPUB_BACKLINK_SOURCE_INDEX_VERSION,
			updatedAt:
				typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
					? candidate.updatedAt
					: new Date(0).toISOString(),
			files,
		};
	}

	private async persistSourceIndexSnapshot(sourceIndex: EpubBacklinkSourceIndexSnapshot): Promise<void> {
		const store = this.diskCacheLoaded
			? this.diskCacheStore || this.createEmptyDiskCacheStore()
			: await this.loadDiskCacheStore();
		const nextStore: EpubBacklinkHighlightsCacheStore = {
			...store,
			version: EPUB_BACKLINK_HIGHLIGHTS_CACHE_VERSION,
			lastUpdated: new Date().toISOString(),
			sourceIndex,
		};
		const previousWrite = this.inflightDiskCacheWrite ?? Promise.resolve();
		const writePromise = previousWrite
			.catch(() => undefined)
			.then(async () => {
				await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, this.getDiskCachePath());
				await this.app.vault.adapter.write(this.getDiskCachePath(), JSON.stringify(nextStore));
				this.diskCacheStore = nextStore;
				this.diskCacheLoaded = true;
			});
		this.inflightDiskCacheWrite = writePromise;
		try {
			await writePromise;
		} finally {
			if (this.inflightDiskCacheWrite === writePromise) {
				this.inflightDiskCacheWrite = null;
			}
		}
	}

	async findSourceForCfi(
		cfiRange: string,
		epubFilePath: string,
		preferredSourceFile?: string,
		hint?: BacklinkSourceHint
	): Promise<BacklinkSourceMatch | null> {
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		const allHighlights = await this.collectHighlights(epubFilePath);
		let matchedHighlights = allHighlights.filter(
			(highlight) => EpubLinkService.normalizeCfi(highlight.cfiRange) === normalizedTargetCfi
		);
		if (matchedHighlights.length === 0) {
			matchedHighlights = this.findHighlightsByHint(allHighlights, hint);
		}
		if (matchedHighlights.length === 0) {
			return null;
		}

		const normalizedPreferredPath = preferredSourceFile
			? normalizePath(preferredSourceFile)
			: "";
		if (normalizedPreferredPath) {
			const sameSourceMatches = matchedHighlights.filter(
				(highlight) => normalizePath(highlight.sourceFile || "") === normalizedPreferredPath
			);
			const preferredMatch = this.pickPreferredSourceMatch(sameSourceMatches);
			if (preferredMatch) {
				return {
					sourceFile: preferredMatch.sourceFile,
					sourceRef: preferredMatch.sourceRef,
					excerptId: preferredMatch.excerptId,
				};
			}
		}

		const matched = this.pickPreferredSourceMatch(matchedHighlights);
		if (!matched) {
			return null;
		}

		return {
			sourceFile: matched.sourceFile,
			sourceRef: matched.sourceRef,
			excerptId: matched.excerptId,
		};
	}

	private findHighlightsByHint(
		highlights: BacklinkHighlight[],
		hint?: BacklinkSourceHint
	): BacklinkHighlight[] {
		const normalizedTargetText = this.normalizeHighlightText(hint?.text);
		if (!normalizedTargetText) {
			return [];
		}

		const textMatches = highlights.filter(
			(highlight) => this.normalizeHighlightText(highlight.text) === normalizedTargetText
		);
		if (textMatches.length <= 1) {
			return textMatches;
		}

		if (typeof hint?.createdTime === "number" && Number.isFinite(hint.createdTime) && hint.createdTime > 0) {
			const sameTimestampMatches = textMatches.filter((highlight) =>
				this.isSameHighlightTimestamp(highlight.createdTime, hint.createdTime)
			);
			if (sameTimestampMatches.length > 0) {
				return sameTimestampMatches;
			}
		}

		return textMatches;
	}

	private normalizeHighlightText(text?: string): string {
		return String(text || "")
			.replace(/\r\n/g, "\n")
			.replace(/\u00a0/g, " ")
			.replace(/[ \t]+/g, " ")
			.replace(/\n{2,}/g, "\n")
			.trim();
	}

	private normalizeQuotedHighlightText(text: string, style?: EpubHighlightStyle): string {
		const normalizedText = style === "strikethrough"
			? text
				.split("\n")
				.map((line) => {
					const trimmed = line.trim();
					const match = trimmed.match(/^~~([\s\S]*)~~$/);
					if (!match) {
						return line;
					}
					const leadingWhitespace = line.match(/^\s*/)?.[0] || "";
					const trailingWhitespace = line.match(/\s*$/)?.[0] || "";
					return `${leadingWhitespace}${match[1]}${trailingWhitespace}`;
				})
				.join("\n")
			: text;

		return normalizedText.trim();
	}

	private reformatQuotedHighlightTextForStyle(quotedText: string, currentStyle?: EpubHighlightStyle, nextStyle?: EpubHighlightStyle): string {
		if (!quotedText) {
			return quotedText;
		}

		const normalizedText = this.normalizeQuotedHighlightText(
			quotedText
				.split("\n")
				.map((line) => line.replace(/^>\s?/, ""))
				.join("\n"),
			currentStyle
		);
		const formattedText = EpubLinkService.formatQuotedExcerptText(normalizedText, nextStyle);
		return formattedText
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
	}

	private isSameHighlightTimestamp(left?: number, right?: number): boolean {
		if (
			typeof left !== "number" ||
			!Number.isFinite(left) ||
			left <= 0 ||
			typeof right !== "number" ||
			!Number.isFinite(right) ||
			right <= 0
		) {
			return false;
		}

		return Math.abs(left - right) < 60_000;
	}

	async findSourceFileForCfi(cfiRange: string, epubFilePath: string): Promise<string | null> {
		const matchedSource = await this.findSourceForCfi(cfiRange, epubFilePath);
		if (matchedSource?.sourceFile) {
			return matchedSource.sourceFile;
		}

		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		const encodedCfi = EpubLinkService.encodeCfiForWikilink(cfiRange);
		const normalizedCfi = EpubLinkService.normalizeCfi(cfiRange);

		const allFiles = this.app.vault.getMarkdownFiles();
		for (const file of allFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				if (content.includes(encodedCfi) || content.includes(cfiRange)) {
					return file.path;
				}
				const parsed = this.parseEpubCallouts(content, targetIdentity, file.path);
				for (const p of parsed) {
					if (EpubLinkService.normalizeCfi(p.cfiRange) === normalizedCfi) {
						return file.path;
					}
				}
			} catch {
				/* skip */
			}
		}

		const canvasFiles = this.app.vault.getFiles().filter((f) => f.extension === "canvas");
		for (const file of canvasFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				if (content.includes(encodedCfi) || content.includes(cfiRange)) {
					return file.path;
				}

				const parsed = await this.parseHighlightsFromCanvasContent(
					content,
					targetIdentity,
					file.path,
					false
				);
				for (const p of parsed) {
					if (EpubLinkService.normalizeCfi(p.cfiRange) === normalizedCfi) {
						return p.sourceFile || file.path;
					}
				}
			} catch {
				/* skip */
			}
		}

		const cardDataFiles = this.getRelevantCardDataFiles();
		for (const file of cardDataFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				if (!this.contentMayReferenceTarget(content, targetIdentity)) continue;
				const parsed = this.parseHighlightsFromCardJsonContent(content, targetIdentity, file.path);
				for (const highlight of parsed) {
					if (EpubLinkService.normalizeCfi(highlight.cfiRange) === normalizedCfi) {
						return file.path;
					}
				}
			} catch {
				/* skip */
			}
		}

		return null;
	}

	private pickPreferredSourceMatch(highlights: BacklinkHighlight[]): BacklinkHighlight | null {
		if (highlights.length === 0) {
			return null;
		}

		const cardMatch = highlights.find(
			(highlight) =>
				typeof highlight.sourceRef === "string" && highlight.sourceRef.startsWith("card:")
		);
		if (cardMatch) {
			return cardMatch;
		}

		const referencedMatch = highlights.find(
			(highlight) =>
				typeof highlight.sourceRef === "string" && highlight.sourceRef.trim().length > 0
		);
		if (referencedMatch) {
			return referencedMatch;
		}

		const markdownMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".md"));
		if (markdownMatch) {
			return markdownMatch;
		}

		const canvasMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".canvas"));
		if (canvasMatch) {
			return canvasMatch;
		}

		const wdeckMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".wdeck"));
		if (wdeckMatch) {
			return wdeckMatch;
		}

		const jsonMatch = highlights.find((highlight) => highlight.sourceFile.endsWith(".json"));
		if (jsonMatch) {
			return jsonMatch;
		}

		return highlights[0] || null;
	}

	async deleteHighlight(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		if (sourceFile.endsWith(".canvas")) {
			return this.deleteHighlightFromCanvas(sourceFile, cfiRange, epubFilePath, sourceRef, excerptId);
		}

		if (this.isStructuredCardDataSourcePath(sourceFile)) {
			return this.deleteHighlightFromCardData(sourceFile, cfiRange, epubFilePath, sourceRef, excerptId);
		}

		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return await this.processVaultTextFile(sourceFile, (content) =>
				this.removeCallout(content, cfiRange, targetIdentity, excerptId)
			);
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] deleteHighlight failed:", _e);
			return false;
		}
	}

	async changeHighlightColor(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newColor: string,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		if (sourceFile.endsWith(".canvas")) {
			return this.changeCanvasHighlightColor(
				sourceFile,
				cfiRange,
				epubFilePath,
				newColor,
				sourceRef,
				excerptId
			);
		}

		if (this.isStructuredCardDataSourcePath(sourceFile)) {
			return this.changeCardDataHighlightColor(
				sourceFile,
				cfiRange,
				epubFilePath,
				newColor,
				sourceRef,
				excerptId
			);
		}

		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return await this.processVaultTextFile(sourceFile, (content) =>
				this.updateCalloutColor(content, cfiRange, targetIdentity, newColor, excerptId)
			);
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] changeHighlightColor failed:", _e);
			return false;
		}
	}

	async changeHighlightStyle(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newStyle: EpubHighlightStyle | undefined,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		if (sourceFile.endsWith(".canvas")) {
			return this.changeCanvasHighlightStyle(
				sourceFile,
				cfiRange,
				epubFilePath,
				newStyle,
				sourceRef,
				excerptId
			);
		}

		if (this.isStructuredCardDataSourcePath(sourceFile)) {
			return this.changeCardDataHighlightStyle(
				sourceFile,
				cfiRange,
				epubFilePath,
				newStyle,
				sourceRef,
				excerptId
			);
		}

		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			return await this.processVaultTextFile(sourceFile, (content) =>
				this.updateCalloutAppearance(content, cfiRange, targetIdentity, undefined, newStyle, excerptId, true)
			);
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] changeHighlightStyle failed:", _e);
			return false;
		}
	}

	private getRelevantCardDataFiles() {
		return this.app.vault.getFiles().filter((file) => this.isRelevantCardDataFile(file));
	}

	private isRelevantCardDataFile(file: TFile): boolean {
		const v2Paths = getV2PathsFromApp(this.app);
		const deckFilesRoot = `${v2Paths.memory.root}/deck-files/`;
		const extension = String(file.extension || "").toLowerCase();
		if (
			extension === "json" &&
			file.path.startsWith(`${v2Paths.memory.cards}/`) &&
			file.name !== "card-files-index.json"
		) {
			return true;
		}
		if (extension === "wdeck" && file.path.startsWith(deckFilesRoot)) {
			return true;
		}
		return false;
	}

	private isStructuredCardDataExtension(extension?: string): boolean {
		return STRUCTURED_CARD_DATA_FILE_EXTENSIONS.has(String(extension || "").toLowerCase());
	}

	private isStructuredCardDataSourcePath(sourcePath: string): boolean {
		const normalizedPath = normalizePath(String(sourcePath || ""));
		const extension = normalizedPath.split(".").pop();
		return this.isStructuredCardDataExtension(extension);
	}

	private async mutateCardDataHighlights(
		sourceFile: string,
		sourceRef: string | undefined,
		mutator: (content: string) => string
	): Promise<boolean> {
		try {
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const cardArrays = this.extractCardArraysFromJson(parsed);
				const targetCardUuid = sourceRef?.startsWith("card:") ? sourceRef.slice(5) : null;
				let changed = false;

				for (const cards of cardArrays) {
					for (const card of cards) {
						if (!card || typeof card.content !== "string") continue;
						if (targetCardUuid && card.uuid !== targetCardUuid) continue;

						const updatedContent = mutator(card.content);
						if (updatedContent !== card.content) {
							card.content = updatedContent;
							card.modified = new Date().toISOString();
							changed = true;
							if (targetCardUuid) break;
						}
					}
					if (changed && targetCardUuid) break;
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] mutateCardDataHighlights failed:", _e);
			return false;
		}
	}

	private async parseHighlightsFromCanvasContent(
		content: string,
		targetIdentity: EpubTargetIdentity,
		sourceFile: string,
		includeFileNodes: boolean
	): Promise<BacklinkHighlight[]> {
		try {
			const parsed = JSON.parse(content) as { nodes?: CanvasNodeLike[] };
			const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
			const results: BacklinkHighlight[] = [];

			for (const node of nodes) {
				if (node?.type === "text" && typeof node.text === "string" && node.text.length > 0) {
					results.push(...this.parseEpubCallouts(node.text, targetIdentity, sourceFile, node.id));
					continue;
				}

				if (
					!includeFileNodes ||
					node?.type !== "file" ||
					typeof node.file !== "string" ||
					node.file.length === 0
				) {
					continue;
				}

				results.push(
					...(await this.collectHighlightsFromCanvasFileNode(node, targetIdentity, sourceFile))
				);
			}

			return results;
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] Failed to parse canvas json:", sourceFile);
			return [];
		}
	}

	private async collectHighlightsFromCanvasFileNode(
		node: CanvasNodeLike,
		targetIdentity: EpubTargetIdentity,
		canvasPath: string
	): Promise<BacklinkHighlight[]> {
		const target = this.app.vault.getAbstractFileByPath(node.file!);
		if (!(target && this.isTFile(target))) {
			return [];
		}

		try {
			const content = await this.app.vault.cachedRead(target);
			const canvasLocator = this.buildCanvasFileNodeLocator(canvasPath, node.id);
			if (target.extension === "md") {
				return this.parseEpubCallouts(content, targetIdentity, target.path).map((highlight) =>
					this.withAdditionalSourceLocator(highlight, canvasLocator)
				);
			}
			if (this.isStructuredCardDataExtension(target.extension)) {
				return this.parseHighlightsFromCardJsonContent(content, targetIdentity, target.path).map(
					(highlight) => this.withAdditionalSourceLocator(highlight, canvasLocator)
				);
			}
		} catch (_e) {
			logger.debug(
				"[EpubBacklinkHighlightService] Failed to read canvas file node target:",
				node.file
			);
		}

		return [];
	}

	private buildCanvasFileNodeLocator(
		canvasPath: string,
		nodeId?: string
	): HighlightSourceLocator | null {
		const normalizedCanvasPath = String(canvasPath || "").trim();
		const normalizedNodeId = String(nodeId || "").trim();
		if (!normalizedCanvasPath || !normalizedNodeId) {
			return null;
		}
		return {
			sourceFile: normalizedCanvasPath,
			sourceRef: `canvas-file-node:${normalizedNodeId}`,
		};
	}

	private withAdditionalSourceLocator(
		highlight: BacklinkHighlight,
		locator: HighlightSourceLocator | null
	): BacklinkHighlight {
		if (!locator) {
			return highlight;
		}

		const sourceLocators = this.mergeSourceLocators(highlight.sourceLocators || [], [
			{
				...locator,
				excerptId: highlight.excerptId || locator.excerptId,
			},
		]);
		return {
			...highlight,
			sourceLocators,
		};
	}

	private mergeSourceLocators(
		existing: HighlightSourceLocator[],
		incoming: HighlightSourceLocator[]
	): HighlightSourceLocator[] {
		const merged = new Map<string, HighlightSourceLocator>();
		for (const locator of [...existing, ...incoming]) {
			const sourceFile = String(locator?.sourceFile || "").trim();
			if (!sourceFile) {
				continue;
			}
			const sourceRef = String(locator?.sourceRef || "").trim();
			const excerptId = String(locator?.excerptId || "").trim();
			const key = `${sourceFile}::${sourceRef}::${excerptId}`;
			if (!merged.has(key)) {
				merged.set(key, {
					sourceFile,
					sourceRef: sourceRef || undefined,
					...(excerptId ? { excerptId } : {}),
				});
			}
		}
		return Array.from(merged.values());
	}

	private async deleteHighlightFromCanvas(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			const targetNodeId = this.normalizeCanvasSourceRef(sourceRef);
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const nodes = Array.isArray(parsed?.nodes) ? (parsed.nodes as CanvasNodeLike[]) : [];
				let changed = false;

				for (const node of nodes) {
					if (node?.type !== "text" || typeof node.text !== "string") continue;
					if (targetNodeId && node.id !== targetNodeId) continue;

					const updatedText = this.removeCallout(node.text, cfiRange, targetIdentity, excerptId);
					if (updatedText !== node.text) {
						node.text = updatedText;
						changed = true;
						if (targetNodeId) break;
					}
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] deleteHighlightFromCanvas failed:", _e);
			return false;
		}
	}

	private async changeCanvasHighlightColor(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newColor: string,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			const targetNodeId = this.normalizeCanvasSourceRef(sourceRef);
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const nodes = Array.isArray(parsed?.nodes) ? (parsed.nodes as CanvasNodeLike[]) : [];
				let changed = false;

				for (const node of nodes) {
					if (node?.type !== "text" || typeof node.text !== "string") continue;
					if (targetNodeId && node.id !== targetNodeId) continue;

					const updatedText = this.updateCalloutColor(
						node.text,
						cfiRange,
						targetIdentity,
						newColor,
						excerptId
					);
					if (updatedText !== node.text) {
						node.text = updatedText;
						changed = true;
						if (targetNodeId) break;
					}
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] changeCanvasHighlightColor failed:", _e);
			return false;
		}
	}

	private async changeCanvasHighlightStyle(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newStyle: EpubHighlightStyle | undefined,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		try {
			const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
			const targetNodeId = this.normalizeCanvasSourceRef(sourceRef);
			return await this.processVaultJsonFile(sourceFile, (parsed) => {
				const nodes = Array.isArray(parsed?.nodes) ? (parsed.nodes as CanvasNodeLike[]) : [];
				let changed = false;

				for (const node of nodes) {
					if (node?.type !== "text" || typeof node.text !== "string") continue;
					if (targetNodeId && node.id !== targetNodeId) continue;

					const updatedText = this.updateCalloutAppearance(
						node.text,
						cfiRange,
						targetIdentity,
						undefined,
						newStyle,
						excerptId,
						true
					);
					if (updatedText !== node.text) {
						node.text = updatedText;
						changed = true;
						if (targetNodeId) break;
					}
				}

				return changed ? parsed : null;
			});
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] changeCanvasHighlightStyle failed:", _e);
			return false;
		}
	}

	private async deleteHighlightFromCardData(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		return this.mutateCardDataHighlights(sourceFile, sourceRef, (content) =>
			this.removeCallout(content, cfiRange, targetIdentity, excerptId)
		);
	}

	private async changeCardDataHighlightColor(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newColor: string,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		return this.mutateCardDataHighlights(sourceFile, sourceRef, (content) =>
			this.updateCalloutColor(content, cfiRange, targetIdentity, newColor, excerptId)
		);
	}

	private async changeCardDataHighlightStyle(
		sourceFile: string,
		cfiRange: string,
		epubFilePath: string,
		newStyle: EpubHighlightStyle | undefined,
		sourceRef?: string,
		excerptId?: string
	): Promise<boolean> {
		const targetIdentity = await this.resolveTargetIdentity(epubFilePath);
		return this.mutateCardDataHighlights(sourceFile, sourceRef, (content) =>
			this.updateCalloutAppearance(content, cfiRange, targetIdentity, undefined, newStyle, excerptId, true)
		);
	}

	private parseHighlightsFromCardJsonContent(
		content: string,
		targetIdentity: EpubTargetIdentity,
		sourceFile: string
	): BacklinkHighlight[] {
		try {
			const parsed = JSON.parse(content);
			const cardArrays = this.extractCardArraysFromJson(parsed);
			const results: BacklinkHighlight[] = [];

			for (const cards of cardArrays) {
				for (const card of cards) {
					if (!card || typeof card.content !== "string") continue;
					const sourceRef =
						typeof card.uuid === "string" && card.uuid.length > 0 ? `card:${card.uuid}` : undefined;
					results.push(
						...this.parseEpubCallouts(card.content, targetIdentity, sourceFile, sourceRef)
					);
				}
			}

			return results;
		} catch (_e) {
			logger.debug("[EpubBacklinkHighlightService] Failed to parse card json:", sourceFile);
			return [];
		}
	}

	private extractCardArraysFromJson(parsed: unknown): JsonCardLike[][] {
		if (Array.isArray(parsed)) {
			return [parsed as JsonCardLike[]];
		}

		if (!parsed || typeof parsed !== "object") {
			return [];
		}

		const container = parsed as Record<string, unknown>;
		const arrays: JsonCardLike[][] = [];

		if (Array.isArray(container.cards)) {
			arrays.push(container.cards as JsonCardLike[]);
		}

		if (Array.isArray(container.questions)) {
			arrays.push(container.questions as JsonCardLike[]);
		}

		return arrays;
	}

	private isTFile(file: unknown): file is TFile {
		return !!file && typeof file === "object" && "path" in file && "extension" in file;
	}

	private getDiskCachePath(): string {
		return getPluginPathsById(this.app as any, this.localPluginId).cache.incrementalReading.epubBacklinkHighlightsCache;
	}

	private createEmptyDiskCacheStore(): EpubBacklinkHighlightsCacheStore {
		return {
			version: EPUB_BACKLINK_HIGHLIGHTS_CACHE_VERSION,
			lastUpdated: new Date(0).toISOString(),
			entries: {},
		};
	}

	private normalizeDiskCacheStore(raw: unknown): EpubBacklinkHighlightsCacheStore {
		if (!raw || typeof raw !== "object") {
			return this.createEmptyDiskCacheStore();
		}
		const candidate = raw as Partial<EpubBacklinkHighlightsCacheStore>;
		return {
			version:
				typeof candidate.version === "string" && candidate.version.trim()
					? candidate.version
					: EPUB_BACKLINK_HIGHLIGHTS_CACHE_VERSION,
			lastUpdated:
				typeof candidate.lastUpdated === "string" && candidate.lastUpdated.trim()
					? candidate.lastUpdated
					: new Date().toISOString(),
			entries:
				candidate.entries && typeof candidate.entries === "object"
					? (candidate.entries as Record<string, EpubBacklinkHighlightsCacheEntry>)
					: {},
			...(this.normalizeSourceIndexSnapshot(candidate.sourceIndex)
				? { sourceIndex: this.normalizeSourceIndexSnapshot(candidate.sourceIndex) }
				: {}),
		};
	}

	private async loadDiskCacheStore(): Promise<EpubBacklinkHighlightsCacheStore> {
		if (this.diskCacheStore) {
			return this.diskCacheStore;
		}
		if (this.inflightDiskCacheLoad) {
			return this.inflightDiskCacheLoad;
		}
		const loadPromise = (async () => {
			const adapter = this.app.vault.adapter;
			const cachePath = this.getDiskCachePath();
			try {
				if (!(await adapter.exists(cachePath))) {
					const emptyStore = this.createEmptyDiskCacheStore();
					this.diskCacheStore = emptyStore;
					this.diskCacheLoaded = true;
					return emptyStore;
				}
				const content = await adapter.read(cachePath);
				const store = this.normalizeDiskCacheStore(JSON.parse(content));
				this.diskCacheStore = store;
				this.diskCacheLoaded = true;
				return store;
			} catch (error) {
				logger.warn("[EpubBacklinkHighlightService] 读取高亮汇总缓存失败", error);
				const emptyStore = this.createEmptyDiskCacheStore();
				this.diskCacheStore = emptyStore;
				this.diskCacheLoaded = true;
				return emptyStore;
			}
		})();
		this.inflightDiskCacheLoad = loadPromise;
		try {
			return await loadPromise;
		} finally {
			if (this.inflightDiskCacheLoad === loadPromise) {
				this.inflightDiskCacheLoad = null;
			}
		}
	}

	private async readCachedHighlights(
		targetIdentity: EpubTargetIdentity,
		manifest: EpubBacklinkHighlightsCacheManifest,
		boundCanvasPath?: string | null
	): Promise<BacklinkHighlight[] | null> {
		const cacheKey = this.buildCacheKey(targetIdentity, boundCanvasPath);
		const manifestFingerprint = this.hashStableValue(manifest);
		const store = this.diskCacheLoaded
			? this.diskCacheStore || this.createEmptyDiskCacheStore()
			: await this.loadDiskCacheStore();
		const entry = store.entries[cacheKey];
		if (!entry || entry.manifestFingerprint !== manifestFingerprint) {
			return null;
		}
		return this.cloneHighlightsForCache(entry.highlights || []);
	}

	private async persistCachedHighlights(
		targetIdentity: EpubTargetIdentity,
		manifest: EpubBacklinkHighlightsCacheManifest,
		highlights: BacklinkHighlight[],
		boundCanvasPath?: string | null
	): Promise<void> {
		try {
			const cacheKey = this.buildCacheKey(targetIdentity, boundCanvasPath);
			const store = this.diskCacheLoaded
				? this.diskCacheStore || this.createEmptyDiskCacheStore()
				: await this.loadDiskCacheStore();
			const nextStore: EpubBacklinkHighlightsCacheStore = {
				...store,
				version: EPUB_BACKLINK_HIGHLIGHTS_CACHE_VERSION,
				lastUpdated: new Date().toISOString(),
				entries: {
					...store.entries,
					[cacheKey]: {
						manifestFingerprint: this.hashStableValue(manifest),
						savedAt: new Date().toISOString(),
						highlights: this.cloneHighlightsForCache(highlights),
					},
				},
			};
			const previousWrite = this.inflightDiskCacheWrite ?? Promise.resolve();
			const writePromise = previousWrite
				.catch(() => undefined)
				.then(async () => {
					await DirectoryUtils.ensureDirForFile(this.app.vault.adapter, this.getDiskCachePath());
					await this.app.vault.adapter.write(this.getDiskCachePath(), JSON.stringify(nextStore));
					this.diskCacheStore = nextStore;
					this.diskCacheLoaded = true;
				});
			this.inflightDiskCacheWrite = writePromise;
			try {
				await writePromise;
			} finally {
				if (this.inflightDiskCacheWrite === writePromise) {
					this.inflightDiskCacheWrite = null;
				}
			}
		} catch (error) {
			logger.warn("[EpubBacklinkHighlightService] 写入高亮汇总缓存失败", error);
		}
	}

	private async buildFileStamp(path: string): Promise<HighlightSourceFileStamp | null> {
		const normalizedPath = normalizePath(String(path || "").trim());
		if (!normalizedPath) {
			return null;
		}
		try {
			const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
				stat?: (path: string) => Promise<{ mtime?: number; size?: number }>;
			};
			if (typeof adapter.stat === "function") {
				const stat = await adapter.stat(normalizedPath);
				return {
					path: normalizedPath,
					mtime: typeof stat?.mtime === "number" ? stat.mtime : 0,
					size: typeof stat?.size === "number" ? stat.size : 0,
				};
			}
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);
			if (!(file && this.isTFile(file))) {
				return null;
			}
			return {
				path: file.path,
				mtime: typeof file.stat?.mtime === "number" ? file.stat.mtime : 0,
				size: typeof file.stat?.size === "number" ? file.stat.size : 0,
			};
		} catch {
			return null;
		}
	}

	private buildCacheKey(targetIdentity: EpubTargetIdentity, boundCanvasPath?: string | null): string {
		return this.hashStableValue({
			filePath: targetIdentity.filePath,
			sourceId: targetIdentity.sourceId || null,
			boundCanvasPath: normalizePath(String(boundCanvasPath || "").trim()),
		});
	}

	private cloneHighlightsForCache(highlights: BacklinkHighlight[]): BacklinkHighlight[] {
		return highlights.map((highlight) => {
			const sourceLocators = (highlight.sourceLocators || []).map((locator) => ({ ...locator }));
			return {
				...highlight,
				...(sourceLocators.length > 0 ? { sourceLocators } : {}),
			};
		});
	}

	private hashStableValue(value: unknown): string {
		return this.hashString(this.stableStringify(value));
	}

	private stableStringify(value: unknown): string {
		if (value === null || value === undefined) {
			return "null";
		}
		if (typeof value === "number") {
			return Number.isFinite(value) ? String(value) : "null";
		}
		if (typeof value === "boolean") {
			return value ? "true" : "false";
		}
		if (typeof value === "string") {
			return JSON.stringify(value);
		}
		if (Array.isArray(value)) {
			return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
		}
		if (value instanceof Date) {
			return JSON.stringify(value.toISOString());
		}
		if (typeof value === "object") {
			const record = value as Record<string, unknown>;
			return `{${Object.keys(record)
				.sort((left, right) => left.localeCompare(right))
				.map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
				.join(",")}}`;
		}
		return JSON.stringify(String(value));
	}

	private hashString(input: string): string {
		let hash = 2166136261;
		for (let index = 0; index < input.length; index += 1) {
			hash ^= input.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
	}

	private removeCallout(
		content: string,
		cfiRange: string,
		targetIdentity: EpubTargetIdentity,
		excerptId?: string
	): string {
		let result = content;
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		for (const callout of this.extractEpubCallouts(content)) {
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink || !this.isSameEpubTarget(resolvedLink, targetIdentity)) continue;
			if (this.isSameExcerptTarget(resolvedLink, normalizedTargetCfi, excerptId)) {
				result = result.replace(callout.fullMatch, "");
				result = result.replace(/\n{3,}/g, "\n\n");
				result = result.replace(/^\n+/, "");
				break;
			}
		}
		return result;
	}

	private updateCalloutColor(
		content: string,
		cfiRange: string,
		targetIdentity: EpubTargetIdentity,
		newColor: string,
		excerptId?: string
	): string {
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		return this.updateCalloutAppearance(
			content,
			cfiRange,
			targetIdentity,
			newColor,
			undefined,
			excerptId
		);
	}

	private updateCalloutAppearance(
		content: string,
		cfiRange: string,
		targetIdentity: EpubTargetIdentity,
		newColor?: string,
		newStyle?: EpubHighlightStyle,
		excerptId?: string,
		applyStyle = false
	): string {
		const normalizedTargetCfi = EpubLinkService.normalizeCfi(cfiRange);
		for (const callout of this.extractEpubCallouts(content)) {
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink || !this.isSameEpubTarget(resolvedLink, targetIdentity)) continue;
			if (this.isSameExcerptTarget(resolvedLink, normalizedTargetCfi, excerptId)) {
				const oldCalloutBlock = callout.fullMatch;
				const oldCalloutHeader = oldCalloutBlock.split("\n")[0];
				const nextStyle = applyStyle ? newStyle : callout.style;
				const metaValue = EpubLinkService.buildHighlightCalloutMeta(
					newColor ?? callout.color,
					nextStyle
				);
				const newCalloutHeader = oldCalloutHeader.replace(
					/> \[!EPUB(?:\|[^\]]+)?\]/,
					metaValue ? `> [!EPUB|${metaValue}]` : "> [!EPUB]"
				);
				const newQuotedText = applyStyle
					? this.reformatQuotedHighlightTextForStyle(callout.quotedText, callout.style, nextStyle)
					: callout.quotedText;
				const newCalloutBlock = [newCalloutHeader, newQuotedText]
					.filter((part) => part.length > 0)
					.join("\n");
				return content.replace(
					oldCalloutBlock,
					`${newCalloutBlock}${oldCalloutBlock.endsWith("\n") ? "\n" : ""}`
				);
			}
		}
		return content;
	}

	private isSameExcerptTarget(
		resolvedLink: ResolvedCalloutLink,
		normalizedTargetCfi: string,
		excerptId?: string
	): boolean {
		if (excerptId && resolvedLink.excerptId) {
			return resolvedLink.excerptId === excerptId;
		}
		return EpubLinkService.normalizeCfi(resolvedLink.cfi) === normalizedTargetCfi;
	}

	private normalizeCanvasSourceRef(sourceRef?: string): string | undefined {
		if (!sourceRef) return undefined;
		return sourceRef.startsWith("canvas:") ? sourceRef.slice(7) : sourceRef;
	}

	private async processVaultTextFile(
		sourcePath: string,
		mutator: (content: string) => string
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file && this.isTFile(file))) {
			return false;
		}

		const updatedInOpenEditor = await this.tryProcessOpenMarkdownFile(sourcePath, mutator);
		if (updatedInOpenEditor !== null) {
			return updatedInOpenEditor;
		}

		const current = await this.readVaultFileText(file);
		const updated = mutator(current);
		if (updated === current) {
			return false;
		}

		await this.writeVaultFileText(file, updated);
		return true;
	}

	private async processVaultJsonFile(
		sourcePath: string,
		mutator: (parsed: any) => any | null
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file && this.isTFile(file))) {
			return false;
		}

		const content = await this.readVaultFileText(file);
		const parsed = JSON.parse(content);
		const updatedParsed = mutator(parsed);
		if (!updatedParsed) {
			return false;
		}
		const updated = JSON.stringify(updatedParsed);
		if (updated === content) {
			return false;
		}

		await this.writeVaultFileText(file, updated);
		return true;
	}

	private async tryProcessOpenMarkdownFile(
		sourcePath: string,
		mutator: (content: string) => string
	): Promise<boolean | null> {
		const views = this.getOpenMarkdownViewsForPath(sourcePath);
		if (views.length === 0) {
			return null;
		}

		let changed = false;
		for (const view of views) {
			const editor = view.editor;
			const current = editor?.getValue?.();
			if (typeof current !== "string") {
				continue;
			}

			const updated = mutator(current);
			if (updated === current) {
				continue;
			}

			editor?.setValue?.(updated);
			changed = true;
		}

		if (!changed) {
			return false;
		}

		for (const view of views) {
			if (typeof view.save === "function") {
				await view.save();
			}
		}

		return true;
	}

	private getOpenMarkdownViewsForPath(sourcePath: string): OpenMarkdownViewLike[] {
		const getLeavesOfType = (this.app.workspace as any)?.getLeavesOfType;
		if (typeof getLeavesOfType !== "function") {
			return [];
		}

		const normalizedSourcePath = normalizePath(sourcePath);
		return getLeavesOfType
			.call(this.app.workspace, "markdown")
			.map((leaf: any) => leaf?.view as OpenMarkdownViewLike | undefined)
			.filter((view: OpenMarkdownViewLike | undefined): view is OpenMarkdownViewLike => {
				if (!view) {
					return false;
				}
				const path = typeof view?.file?.path === "string" ? normalizePath(view.file.path) : "";
				return (
					path === normalizedSourcePath &&
					typeof view.editor?.getValue === "function" &&
					typeof view.editor?.setValue === "function"
				);
			});
	}

	private async readVaultFileText(file: TFile): Promise<string> {
		const adapter = this.app.vault.adapter;
		if (adapter && typeof adapter.read === "function") {
			return await adapter.read(file.path);
		}
		return await this.app.vault.cachedRead(file);
	}

	private async writeVaultFileText(file: TFile, updated: string): Promise<void> {
		const vault = this.app.vault as typeof this.app.vault & {
			modify?: (file: TFile, data: string) => Promise<void>;
			process?: (file: TFile, fn: () => string) => Promise<void>;
		};
		if (typeof vault.modify === "function") {
			await vault.modify(file, updated);
			return;
		}

		if (typeof vault.process === "function") {
			await vault.process(file, () => updated);
			return;
		}

		const adapter = this.app.vault.adapter;
		if (adapter && typeof adapter.write === "function") {
			await adapter.write(file.path, updated);
			return;
		}

		throw new Error(`Unable to write vault file: ${file.path}`);
	}

	private parseEpubCallouts(
		content: string,
		targetIdentity: EpubTargetIdentity,
		sourceFile: string,
		sourceRef?: string
	): BacklinkHighlight[] {
		const results: BacklinkHighlight[] = [];
		for (const callout of this.extractEpubCallouts(content)) {
			const quotedBody = callout.quotedText;
			const resolvedLink = this.resolveCalloutLink(callout);
			if (!resolvedLink || !this.isSameEpubTarget(resolvedLink, targetIdentity)) continue;

			const text = quotedBody
				.split("\n")
				.map((line: string) => line.replace(/^>\s?/, ""))
				.join("\n")
			;

			results.push({
				cfiRange: resolvedLink.cfi,
				color: callout.color,
				style: callout.style,
				text: this.normalizeQuotedHighlightText(text, callout.style),
				chapterIndex: resolvedLink.chapter,
				chapterTitle: callout.chapterTitle,
				sourceFile,
				sourceRef,
				excerptId: resolvedLink.excerptId,
				createdTime: callout.createdTime,
			});
		}

		return results;
	}

	private normalizeHighlightColor(color?: string): string {
		return EpubLinkService.normalizeHighlightColorToken(color) || "yellow";
	}

	private extractEpubCallouts(content: string): ParsedEpubCallout[] {
		const results: ParsedEpubCallout[] = [];
		const normalized = content.replace(/\r\n/g, "\n");
		const lines = normalized.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const header = lines[i];
			const headerMatch = header.match(/^> \[!EPUB(?:\|([^\]]+))?\]\s*(.*)$/);
			if (!headerMatch) continue;

			const rest = headerMatch[2] || "";
			const linkMarkup = EpubLinkService.extractFirstEpubLinkMarkup(rest);
			if (!linkMarkup) continue;
			const linkStart = rest.indexOf(linkMarkup);
			if (linkStart === -1) continue;
			const linkEnd = linkStart + linkMarkup.length;

			const bodyLines: string[] = [];
			let j = i + 1;
			while (j < lines.length && lines[j].startsWith(">")) {
				bodyLines.push(lines[j]);
				j++;
			}

			const blockLines = [header, ...bodyLines];
			const fullMatch = `${blockLines.join("\n")}${j < lines.length ? "\n" : ""}`;
			const appearance = EpubLinkService.parseHighlightCalloutMeta(headerMatch[1] || "");
			results.push({
				color: this.normalizeHighlightColor(appearance.color),
				style: appearance.style,
				linkMarkup,
				quotedText: bodyLines.join("\n"),
				chapterTitle: this.parseCalloutChapterTitle(rest.slice(linkEnd).trim()),
				fullMatch,
				createdTime: this.parseCalloutTimestamp(rest.slice(linkEnd).trim()),
			});
			i = j - 1;
		}

		return results;
	}

	private parseCalloutTimestamp(raw: string): number | undefined {
		if (!raw) return undefined;
		const match = raw.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})(?::\d{2})?$/);
		if (!match) return undefined;
		const parsed = new Date(match[1].replace(" ", "T"));
		const time = parsed.getTime();
		return Number.isFinite(time) ? time : undefined;
	}

	private parseCalloutChapterTitle(raw: string): string | undefined {
		if (!raw) return undefined;
		const match = raw.match(/\[([^\]]+)\](?:\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)?$/);
		const title = String(match?.[1] || "").trim();
		return title || undefined;
	}

	private resolveCalloutLink(callout: ParsedEpubCallout): ResolvedCalloutLink | null {
		const parsed = EpubLinkService.parseLinkMarkup(callout.linkMarkup);
		return parsed?.cfi
			? {
					filePath: parsed.filePath,
					cfi: parsed.cfi,
					chapter: parsed.chapter,
					sourceId: parsed.sourceId,
					excerptId: parsed.excerptId,
			  }
			: null;
	}

	private isSameEpubTarget(link: ResolvedCalloutLink, targetIdentity: EpubTargetIdentity): boolean {
		if (link.sourceId && targetIdentity.sourceId) {
			return link.sourceId === targetIdentity.sourceId;
		}

		return normalizePath(link.filePath || "") === targetIdentity.filePath;
	}

	private textMayReferenceTarget(text: string, targetIdentity: EpubTargetIdentity): boolean {
		const normalizedText = String(text || "");
		if (!normalizedText) {
			return false;
		}

		if (targetIdentity.fileName && normalizedText.includes(targetIdentity.fileName)) {
			return true;
		}

		return !!(targetIdentity.sourceId && normalizedText.includes(`sid=${targetIdentity.sourceId}`));
	}

	private contentMayReferenceTarget(content: string, targetIdentity: EpubTargetIdentity): boolean {
		return this.textMayReferenceTarget(content, targetIdentity);
	}

	private async resolveTargetIdentity(epubFilePath: string): Promise<EpubTargetIdentity> {
		const normalizedPath = normalizePath(epubFilePath || "");
		let sourceId: string | undefined;

		if (normalizedPath) {
			try {
				sourceId = (await this.storageService.ensureSourceIdentity(normalizedPath))?.sourceId;
			} catch (error) {
				logger.debug("[EpubBacklinkHighlightService] Failed to resolve EPUB source identity:", {
					epubFilePath: normalizedPath,
					error,
				});
			}
		}

		return {
			filePath: normalizedPath,
			fileName: normalizedPath.split("/").pop() || "",
			sourceId,
		};
	}
}
