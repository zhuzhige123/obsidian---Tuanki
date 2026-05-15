import { App, normalizePath } from "obsidian";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import { safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import { normalizeChunkForRuntime } from "../../utils/ir-topic-compat";
import { parseYAMLFromContent } from "../../utils/yaml-utils";
import { remapAssociatedNotePaths, resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import {
	deriveLegacyBlockTitle,
	getLegacyBlocksData,
	getLegacyChunkData,
	getLegacyDecks,
	getLegacyMaterials,
	getLegacySources,
	getLegacyTopicsMap,
	readLegacyBookmarkTaskStores,
	resolveLegacyBlockTopicIds,
	resolveLegacyTopicName,
	type IRLegacyReadApi,
} from "./IRPointStorageLegacyMigration";
import type { ReadingMaterial, ReadingMaterialsIndex } from "../../types/incremental-reading-types";
import type {
	IRBlock,
	IRChunkFileData,
	IRDeck,
	IRSourceFileMeta,
	IRTagGroup,
	IRTagGroupProfile,
} from "../../types/ir-types";
import {
	DEFAULT_IR_DECK_SETTINGS,
	DEFAULT_TAG_GROUP,
	DEFAULT_TAG_GROUP_PROFILE,
} from "../../types/ir-types";
import type {
	IRLegacyMigrationIssue,
	IRLegacyPointInput,
	IRMaterialRecord,
	IRMaterialsIndex,
	IRParameterContext,
	IRPoint,
	IRPointDeckRecord,
	IRPointFileCatalogEntry,
	IRPointFileData,
	IRPointFileIndex,
	IRPointSnapshot,
	IRPointSourceRecord,
	IRPointStorageMigrationReport,
	IRReaderStateRecord,
} from "../../types/ir-point-storage-types";
import { IR_POINT_STORAGE_VERSION } from "../../types/ir-point-storage-types";

type AdapterLike = App["vault"]["adapter"];

type MigrationInspection = {
	pendingCount: number;
	pendingItems: string[];
	legacyReaderStateCount: number;
	pendingReaderStateFileCount: number;
	legacyChunkStorageFileCount: number;
	legacyRegistryFileCount: number;
	legacyTopicStoreFileCount: number;
	pendingEmbeddedSourceCount: number;
	pendingPdfTaskCount: number;
	pendingEpubTaskCount: number;
	pendingChunkPointCount: number;
	pendingLegacyBlockCount: number;
	legacyMaterialRecordFileCount: number;
	legacyMaterialsIndexFileCount: number;
	legacyMaterialsFileCount: number;
	emptyLegacyMaterialDirCount: number;
	missingEmbeddedSourceTargetCount: number;
};

type MigrationExecutionOptions = {
	cleanupLegacyReaderStateFiles?: boolean;
	cleanupLegacyBookmarkTaskFiles?: boolean;
	cleanupLegacyChunkStorageFiles?: boolean;
	cleanupLegacyMaterialFiles?: boolean;
	cleanupLegacyRegistryFiles?: boolean;
	cleanupLegacyTopicStoreFiles?: boolean;
};

type LegacyCleanupResult = {
	removedCount: number;
	failures: IRLegacyMigrationIssue[];
};

type MaterialRecordDescriptor = {
	id: string;
	path: string;
	relativeFile: string;
	record: IRMaterialRecord;
	indexed: boolean;
	sourceKey: string;
};

type ResolvedPointFilePath = {
	absolutePath: string;
	relativePath: string;
	isLegacyRelative: boolean;
};

type MaterialStorageInspection = {
	issueCount: number;
	items: string[];
	pendingEmbeddedSourceCount: number;
	legacyMaterialRecordFileCount: number;
	legacyMaterialsIndexFileCount: number;
	legacyMaterialsFileCount: number;
	emptyLegacyMaterialDirCount: number;
	missingEmbeddedSourceTargetCount: number;
};

type MaterialStorageCleanupResult = {
	backfilledPointSourceCount: number;
	removedMissingTargetPointCount: number;
	removedLegacyMaterialRecordCount: number;
	removedLegacyMaterialsIndexCount: number;
	removedLegacyMaterialsFileCount: number;
	removedEmptyLegacyMaterialDirCount: number;
	failures: IRLegacyMigrationIssue[];
};

type MaterialCleanupPlan = {
	pointSourceBackfills: Array<{
		filePath: string;
		topicId: string;
		topicName: string;
		pointIndex: number;
		point: IRPoint;
		source: IRPointSourceRecord;
	}>;
	missingTargetPoints: Array<{
		filePath: string;
		topicId: string;
		topicName: string;
		pointIndex: number;
		pointId: string;
		sourcePath: string;
	}>;
	legacyMaterialDescriptors: MaterialRecordDescriptor[];
	pendingEmbeddedSourceCount: number;
	legacyMaterialsIndexFileCount: number;
	legacyMaterialsFileCount: number;
	emptyLegacyMaterialDirCount: number;
	missingEmbeddedSourceTargetCount: number;
	items: string[];
};

const DEFAULT_TOPIC_ID = "ungrouped-ir";
const DEFAULT_TOPIC_NAME = "未归类增量阅读";
const IR_DECK_FILE_EXTENSION = ".irdeck";
const LEGACY_POINT_FILE_PATTERN = /\.points-\d{3}\.json$/i;
const MATERIALS_INDEX_DEFAULT: IRMaterialsIndex = {
	schemaVersion: IR_POINT_STORAGE_VERSION,
	updatedAt: new Date(0).toISOString(),
	materials: [],
};
const POINT_FILES_INDEX_DEFAULT: IRPointFileIndex = {
	schemaVersion: IR_POINT_STORAGE_VERSION,
	updatedAt: new Date(0).toISOString(),
	files: [],
};
const runtimeBaselineByApp = new WeakMap<App, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIsoString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) {
		return value;
	}

	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return new Date(value).toISOString();
	}

	return undefined;
}

function stableHash(input: string): string {
	let hash = 0;
	for (let index = 0; index < input.length; index += 1) {
		hash = (hash * 31 + input.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function normalizeStringArray(values: unknown): string[] {
	return Array.from(
		new Set(
			(Array.isArray(values) ? values : [])
				.map((value) => String(value || "").trim())
				.filter(Boolean)
		)
	);
}

function normalizeReadingTags(values: unknown): string[] {
	const normalized = new Map<string, string>();
	for (const value of Array.isArray(values) ? values : []) {
		const tag = String(value || "").trim();
		if (!tag) {
			continue;
		}
		const key = tag.toLowerCase();
		if (!normalized.has(key)) {
			normalized.set(key, tag);
		}
	}
	return Array.from(normalized.values());
}

function toReadingTimeMs(stats: IRLegacyPointInput["stats"] | undefined): number | undefined {
	if (!stats) {
		return undefined;
	}

	if (typeof stats.totalReadingTimeMs === "number" && Number.isFinite(stats.totalReadingTimeMs)) {
		return Math.max(0, Math.round(stats.totalReadingTimeMs));
	}

	if (typeof stats.totalReadingTimeSec === "number" && Number.isFinite(stats.totalReadingTimeSec)) {
		return Math.max(0, Math.round(stats.totalReadingTimeSec * 1000));
	}

	return undefined;
}

function normalizeMaterialSourcePath(path: unknown): string {
	const normalized = normalizePath(String(path || "").trim());
	return normalized ? normalized.toLowerCase() : "";
}

export class IRPointStorageService {
	private readonly app: App;
	private readonly adapter: AdapterLike;
	private initialized = false;

	constructor(app: App) {
		this.app = app;
		this.adapter = app.vault.adapter;
	}

	normalizePointFileDataForPersistence(
		fileData: (Partial<IRPointFileData> & Record<string, unknown>) | null | undefined,
		filePathOrName = ""
	): IRPointFileData {
		const normalizedName = normalizePath(String(filePathOrName || "").trim())
			.split("/")
			.pop()
			?.replace(/\.irdeck$/i, "")
			?.trim();
		const fallbackTopicId =
			typeof fileData?.topicId === "string" && fileData.topicId.trim()
				? fileData.topicId.trim()
				: normalizedName || DEFAULT_TOPIC_ID;
		const fallbackTopicName =
			typeof fileData?.topicName === "string" && fileData.topicName.trim()
				? fileData.topicName.trim()
				: normalizedName || DEFAULT_TOPIC_NAME;
		return this.normalizePointFileData(fileData, fallbackTopicId, fallbackTopicName);
	}

	private getV2Paths() {
		return getV2PathsFromApp(this.app as any);
	}

	private getPluginPaths() {
		return getPluginPaths(this.app as any);
	}

	private getLegacyReadApi(): IRLegacyReadApi {
		const v2Paths = this.getV2Paths();
		const readJson = async <T>(path: string, fallback: T): Promise<T> =>
			await this.readJson(path, fallback);
		return {
			readJson,
			paths: {
				legacyTopics: v2Paths.ir.legacyTopics,
				legacyDecks: v2Paths.ir.legacyDecks,
				materialsIndex: v2Paths.ir.materials.index,
				chunks: v2Paths.ir.chunks,
				blocks: v2Paths.ir.blocks,
				sources: v2Paths.ir.sources,
				pdfBookmarkTasks: v2Paths.ir.pdfBookmarkTasks,
				epubBookmarkTasks: v2Paths.ir.epubBookmarkTasks,
			},
		};
	}

	private getMigrationReportPath(): string {
		return `${this.getPluginPaths().migration.root}/ir-point-storage-migration-report.json`;
	}

	private getLegacyRegistryDir(): string {
		return this.getV2Paths().ir.registry;
	}

	private getPointFilesIndexPath(): string {
		return this.getPluginPaths().cache.incrementalReading.pointFilesIndex;
	}

	private getLegacyPointFilesIndexPath(): string {
		return this.getV2Paths().ir.pointFilesIndex;
	}

	private getLegacyScheduleProfilesPath(): string {
		return this.getV2Paths().ir.scheduleProfiles;
	}

	private getPointsDir(): string {
		return this.getV2Paths().ir.pointsDir;
	}

	private getMaterialsDir(): string {
		return this.getV2Paths().ir.materialRecordsDir;
	}

	private getReaderStateDir(): string {
		return this.getPluginPaths().state.incrementalReading.readerState;
	}

	private getReaderArtifactsDir(): string {
		return this.getPluginPaths().cache.incrementalReading.readerArtifacts;
	}

	private async ensureFile(path: string, content: string): Promise<void> {
		await DirectoryUtils.ensureDirForFile(this.adapter as any, path);
		if (!(await this.adapter.exists(path))) {
			await this.adapter.write(path, content);
		}
	}

	private async readJson<T>(path: string, fallback: T): Promise<T> {
		const value = await safeReadJson<T>(this.adapter as any, path, this.app as any);
		return value ?? fallback;
	}

	private async writeJson(path: string, payload: unknown): Promise<void> {
		await DirectoryUtils.ensureDirForFile(this.adapter as any, path);
		await safeWriteJson(
			this.adapter as any,
			path,
			JSON.stringify(payload, null, 2),
			this.app as any
		);
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		await Promise.all([
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getPointsDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getReaderStateDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getReaderArtifactsDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getPluginPaths().migration.root),
		]);

		await Promise.all([
			this.ensureFile(
				this.getPointFilesIndexPath(),
				JSON.stringify(POINT_FILES_INDEX_DEFAULT, null, 2)
			),
		]);

		await this.normalizePointFileNaming();

		this.initialized = true;
	}

	async ensureRuntimeBaseline(): Promise<void> {
		const inflight = runtimeBaselineByApp.get(this.app);
		if (inflight) {
			await inflight;
			return;
		}

		const task = (async () => {
			await this.initialize();
			const inspection = await this.inspectMigrationStatus();
			const hasAutoMigrationWork =
				inspection.pendingEmbeddedSourceCount > 0 ||
				inspection.pendingPdfTaskCount > 0 ||
				inspection.pendingEpubTaskCount > 0 ||
				inspection.pendingChunkPointCount > 0 ||
				inspection.pendingLegacyBlockCount > 0 ||
				inspection.pendingReaderStateFileCount > 0 ||
				inspection.legacyMaterialRecordFileCount > 0 ||
				inspection.legacyMaterialsIndexFileCount > 0 ||
				inspection.legacyMaterialsFileCount > 0 ||
				inspection.emptyLegacyMaterialDirCount > 0 ||
				inspection.legacyRegistryFileCount > 0 ||
				inspection.legacyTopicStoreFileCount > 0;
			if (!hasAutoMigrationWork && inspection.legacyReaderStateCount <= 0) {
				return;
			}

			logger.info("[IRPointStorageService] 检测到旧增量阅读数据，开始自动迁移到新 points 存储", {
				pendingCount: inspection.pendingCount,
				legacyReaderStateCount: inspection.legacyReaderStateCount,
				pendingItems: inspection.pendingItems,
			});

			const report = await this.executeMigration();
			if (report.summary.failures.length > 0) {
				logger.warn("[IRPointStorageService] 自动迁移存在失败项，请在数据管理中查看迁移报告", {
					failureCount: report.summary.failures.length,
				});
			}
		})();

		runtimeBaselineByApp.set(this.app, task);
		try {
			await task;
		} catch (error) {
			runtimeBaselineByApp.delete(this.app);
			throw error;
		}
	}

	private inferMaterialClass(sourceType: string, sourcePath: string): string {
		const normalizedPath = normalizePath(sourcePath || "").toLowerCase();
		if (sourceType === "pdf-bookmark" || sourceType === "pdf") {
			return "academic-paper";
		}
		if (sourceType === "epub-bookmark" || sourceType === "epub") {
			return "academic-book";
		}
		if (normalizedPath.endsWith(".md")) {
			return "reference-note";
		}
		return "reference-note";
	}

	private buildParameterContext(materialClass: string): IRParameterContext {
		return {
			materialClass,
			scheduleProfileRef: `profile-${materialClass}`,
			classificationSource: "inherited-from-material",
			isOverride: false,
		};
	}

	private normalizePointSourceType(
		sourceType: unknown,
		sourcePath: string
	): IRPointSourceRecord["type"] {
		const normalizedType = String(sourceType || "").trim().toLowerCase();
		if (normalizedType === "epub" || normalizedType === "epub-bookmark") {
			return "epub";
		}
		if (normalizedType === "pdf" || normalizedType === "pdf-bookmark") {
			return "pdf";
		}

		const normalizedPath = normalizePath(sourcePath || "").toLowerCase();
		if (normalizedPath.endsWith(".epub")) {
			return "epub";
		}
		if (normalizedPath.endsWith(".pdf")) {
			return "pdf";
		}
		return "markdown";
	}

	private getSourceTitleFallback(path: string, fallbackId: string): string {
		const normalizedPath = normalizePath(String(path || "").trim());
		const fileName = normalizedPath.split("/").pop() || "";
		const withoutExtension = fileName.replace(/\.[^.]+$/u, "").trim();
		return withoutExtension || fallbackId || "未命名材料";
	}

	private readPointMetadataString(point: IRPoint | undefined, key: string): string {
		const value = point?.metadata?.[key];
		return typeof value === "string" && value.trim() ? value.trim() : "";
	}

	private readPointLocatorString(point: IRPoint | undefined, key: string): string {
		const locator = point?.trace?.locator;
		if (!isRecord(locator)) {
			return "";
		}
		const value = locator[key];
		return typeof value === "string" && value.trim() ? value.trim() : "";
	}

	private hasEmbeddedPointSource(point: IRPoint | undefined): boolean {
		if (!point || !isRecord(point.source)) {
			return false;
		}

		const id = typeof point.source.id === "string" ? point.source.id.trim() : "";
		const path = typeof point.source.path === "string" ? point.source.path.trim() : "";
		const title = typeof point.source.title === "string" ? point.source.title.trim() : "";
		const type = this.normalizePointSourceType(point.source.type, path);
		return Boolean(id && path && title && type);
	}

	private buildPointSourceRecord(input: {
		materialId?: string;
		sourceType?: unknown;
		sourcePath?: string;
		title?: string;
		existingSource?: IRPointSourceRecord | null;
		legacyMaterialRecord?: IRMaterialRecord | null;
		legacyMaterial?: ReadingMaterial;
		point?: IRPoint;
	}): IRPointSourceRecord {
		const fallbackPath =
			normalizePath(String(input.sourcePath || "").trim()) ||
			normalizePath(String(input.existingSource?.path || "").trim()) ||
			normalizePath(String(input.legacyMaterialRecord?.source?.path || "").trim()) ||
			normalizePath(String(input.legacyMaterial?.filePath || "").trim()) ||
			normalizePath(this.readPointMetadataString(input.point, "sourcePath")) ||
			normalizePath(this.readPointMetadataString(input.point, "rawFilePath")) ||
			normalizePath(this.readPointMetadataString(input.point, "chunkFilePath")) ||
			normalizePath(this.readPointLocatorString(input.point, "pdfPath")) ||
			normalizePath(this.readPointLocatorString(input.point, "sourcePath")) ||
			normalizePath(this.readPointLocatorString(input.point, "chunkFilePath"));
		const materialId =
			String(input.materialId || "").trim() ||
			String(input.existingSource?.id || "").trim() ||
			String(input.legacyMaterialRecord?.id || "").trim() ||
			String(input.legacyMaterial?.uuid || "").trim() ||
			this.deriveMaterialId(
				String(input.sourceType || input.legacyMaterialRecord?.source?.type || "file"),
				fallbackPath || this.readPointMetadataString(input.point, "sourcePath"),
				undefined
			);
		const type = this.normalizePointSourceType(
			input.sourceType ||
				input.existingSource?.type ||
				input.legacyMaterialRecord?.source?.type ||
				(fallbackPath.toLowerCase().endsWith(".epub")
					? "epub"
					: fallbackPath.toLowerCase().endsWith(".pdf")
						? "pdf"
						: "markdown"),
			fallbackPath
		);
		const title =
			String(input.title || "").trim() ||
			String(input.existingSource?.title || "").trim() ||
			String(input.legacyMaterialRecord?.bibliography?.title || "").trim() ||
			String(input.legacyMaterial?.title || "").trim() ||
			this.readPointMetadataString(input.point, "sourceTitle") ||
			this.getSourceTitleFallback(fallbackPath, materialId);

		return {
			id: materialId,
			type,
			path: fallbackPath,
			title,
			hash:
				String(input.existingSource?.hash || "").trim() ||
				String(input.legacyMaterialRecord?.source?.hash || "").trim() ||
				undefined,
			author:
				String(input.existingSource?.author || "").trim() ||
				String(input.legacyMaterialRecord?.bibliography?.author || "").trim() ||
				undefined,
			language:
				String(input.existingSource?.language || "").trim() ||
				String(input.legacyMaterialRecord?.bibliography?.language || "").trim() ||
				undefined,
		};
	}

	private buildSyntheticMaterialRecord(point: IRPoint): IRMaterialRecord | null {
		if (!this.hasEmbeddedPointSource(point)) {
			return null;
		}

		const source = point.source;
		const parameterContext =
			point.parameterContext ||
			this.buildParameterContext(this.inferMaterialClass(source.type, source.path));
		return {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			id: point.materialId || source.id,
			createdAt: point.timestamps?.createdAt || new Date(0).toISOString(),
			updatedAt: point.timestamps?.updatedAt || point.timestamps?.createdAt || new Date().toISOString(),
			source: {
				type: source.type,
				path: source.path,
				hash: source.hash,
			},
			bibliography: {
				title: source.title,
				author: source.author,
				language: source.language,
			},
			contentStorage: {
				mode: "external-source",
				ownedByPlugin: false,
			},
			defaultParameterContext: parameterContext,
			metadata: {
				pointSourceId: source.id,
			},
		};
	}

	private normalizeStoredPoint(
		point: IRPoint,
		legacyMaterialRecord?: IRMaterialRecord | null,
		legacyMaterial?: ReadingMaterial
	): IRPoint {
		const nextMaterialId =
			String(point.materialId || "").trim() ||
			String(point.source?.id || "").trim() ||
			String(legacyMaterialRecord?.id || "").trim() ||
			String(legacyMaterial?.uuid || "").trim() ||
			this.deriveMaterialId(
				String(point.audit?.origin?.type || legacyMaterialRecord?.source?.type || "file"),
				this.readPointMetadataString(point, "sourcePath") ||
					this.readPointLocatorString(point, "pdfPath"),
				undefined
			);
		const nextSource = this.buildPointSourceRecord({
			materialId: nextMaterialId,
			sourceType:
				point.source?.type ||
				point.audit?.origin?.type ||
				legacyMaterialRecord?.source?.type,
			sourcePath:
				point.source?.path ||
				legacyMaterialRecord?.source?.path ||
				legacyMaterial?.filePath,
			title:
				point.source?.title ||
				legacyMaterialRecord?.bibliography?.title ||
				legacyMaterial?.title ||
				this.readPointMetadataString(point, "sourceTitle"),
			existingSource: isRecord(point.source) ? point.source : null,
			legacyMaterialRecord,
			legacyMaterial,
			point,
		});
		const parameterContext =
			point.parameterContext ||
			this.buildParameterContext(this.inferMaterialClass(nextSource.type, nextSource.path));

		return {
			...point,
			materialId: nextMaterialId,
			source: nextSource,
			parameterContext,
		};
	}

	private deriveMaterialId(sourceType: string, sourcePath: string, preferredId?: string): string {
		if (preferredId && preferredId.trim()) {
			return preferredId.trim();
		}

		const safePath = sanitizeForSync(normalizePath(sourcePath || "").replace(/\//g, "-"), 48);
		return `mat-${sourceType}-${safePath}-${stableHash(sourcePath || sourceType)}`;
	}

	private async readMaterialsIndex(): Promise<IRMaterialsIndex> {
		await this.initialize();
		return this.readJson(this.getV2Paths().ir.materialsIndex, MATERIALS_INDEX_DEFAULT);
	}

	private normalizePointFilesIndex(index: IRPointFileIndex | null | undefined): IRPointFileIndex {
		const files = Array.isArray(index?.files)
			? index.files
					.filter((entry) => entry && typeof entry === "object")
					.map((entry) => {
						const resolvedPath = this.resolveIndexedPointFilePath(entry.file);
						return {
							topicId: String(entry.topicId || "").trim() || DEFAULT_TOPIC_ID,
							topicName: String(entry.topicName || "").trim() || DEFAULT_TOPIC_NAME,
							file:
								resolvedPath?.absolutePath ||
								this.buildDefaultPointFileAbsolutePath(DEFAULT_TOPIC_NAME),
							pointCount: Number.isFinite(entry.pointCount) ? Number(entry.pointCount) : 0,
							updatedAt:
								typeof entry.updatedAt === "string" && entry.updatedAt.trim()
									? entry.updatedAt
									: new Date(0).toISOString(),
						};
					})
			: [];
		return {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			updatedAt:
				typeof index?.updatedAt === "string" && index.updatedAt.trim()
					? index.updatedAt
					: new Date(0).toISOString(),
			files,
		};
	}

	private async loadPointFilesIndexSnapshot(): Promise<IRPointFileIndex> {
		const localIndex = this.normalizePointFilesIndex(
			await this.readJson<IRPointFileIndex | null>(this.getPointFilesIndexPath(), null)
		);
		if (localIndex.files.length > 0) {
			return localIndex;
		}

		const legacyIndex = this.normalizePointFilesIndex(
			await this.readJson<IRPointFileIndex | null>(this.getLegacyPointFilesIndexPath(), null)
		);
		if (legacyIndex.files.length > 0) {
			await this.writePointFilesIndex(legacyIndex);
			return legacyIndex;
		}

		return localIndex;
	}

	private async readPointFilesIndex(): Promise<IRPointFileIndex> {
		await this.initialize();
		return this.loadPointFilesIndexSnapshot();
	}

	private async writePointFilesIndex(index: IRPointFileIndex): Promise<void> {
		await this.writeJson(this.getPointFilesIndexPath(), {
			...this.normalizePointFilesIndex(index),
			updatedAt: new Date().toISOString(),
		});
	}

	async getPointFileEntryByPath(filePath: string): Promise<{
		topicId: string;
		topicName: string;
		relativePath: string;
		absolutePath: string;
	} | null> {
		await this.initialize();
		const normalizedInput = normalizePath(String(filePath || "").trim());
		if (!normalizedInput) {
			return null;
		}

		const pointIndex = await this.readPointFilesIndex();
		for (const entry of pointIndex.files || []) {
			const resolvedPath = this.resolveIndexedPointFilePath(entry?.file);
			if (!resolvedPath) {
				continue;
			}

			if (
				normalizedInput === resolvedPath.absolutePath ||
				normalizedInput === resolvedPath.relativePath ||
				normalizedInput.endsWith(`/${resolvedPath.relativePath}`) ||
				normalizedInput.split("/").pop() === resolvedPath.absolutePath.split("/").pop()
			) {
				return {
					topicId: String(entry.topicId || "").trim() || DEFAULT_TOPIC_ID,
					topicName: String(entry.topicName || "").trim() || DEFAULT_TOPIC_NAME,
					relativePath: resolvedPath.relativePath,
					absolutePath: resolvedPath.absolutePath,
				};
			}
		}

		if (!(await this.adapter.exists(normalizedInput))) {
			return null;
		}

		const fallbackFileData = await this.readPointFile(
			normalizedInput,
			DEFAULT_TOPIC_ID,
			DEFAULT_TOPIC_NAME
		);
		return {
			topicId: String(fallbackFileData.topicId || "").trim() || DEFAULT_TOPIC_ID,
			topicName: String(fallbackFileData.topicName || "").trim() || DEFAULT_TOPIC_NAME,
			relativePath: normalizedInput,
			absolutePath: normalizedInput,
		};
	}

	private async listKnownPointFileDescriptors(): Promise<
		Array<{ topicId: string; topicName: string; relativePath: string; absolutePath: string }>
	> {
		await this.initialize();
		const index = await this.readPointFilesIndex();
		const descriptors: Array<{
			topicId: string;
			topicName: string;
			relativePath: string;
			absolutePath: string;
		}> = [];
		const seenFiles = new Set<string>();

		for (const entry of index.files || []) {
			const resolvedPath = this.resolveIndexedPointFilePath(entry?.file);
			if (!resolvedPath) {
				continue;
			}
			if (
				seenFiles.has(resolvedPath.absolutePath) ||
				!(await this.adapter.exists(resolvedPath.absolutePath))
			) {
				continue;
			}

			seenFiles.add(resolvedPath.absolutePath);
			descriptors.push({
				topicId: String(entry?.topicId || "").trim() || DEFAULT_TOPIC_ID,
				topicName: String(entry?.topicName || "").trim() || DEFAULT_TOPIC_NAME,
				relativePath: resolvedPath.relativePath,
				absolutePath: resolvedPath.absolutePath,
			});
		}

		for (const absolutePath of await this.scanVaultForPointFiles()) {
			if (seenFiles.has(absolutePath)) {
				continue;
			}

			const fileData = await this.readPointFile(absolutePath, DEFAULT_TOPIC_ID, DEFAULT_TOPIC_NAME);
			seenFiles.add(absolutePath);
			descriptors.push({
				topicId: String(fileData.topicId || "").trim() || DEFAULT_TOPIC_ID,
				topicName: String(fileData.topicName || "").trim() || DEFAULT_TOPIC_NAME,
				relativePath: absolutePath,
				absolutePath,
			});
		}

		return descriptors.sort(
			(left, right) =>
				left.topicName.localeCompare(right.topicName, "zh-CN") ||
				left.topicId.localeCompare(right.topicId, "zh-CN")
		);
	}

	async listPointFileCatalogEntries(): Promise<IRPointFileCatalogEntry[]> {
		const descriptors = await this.listKnownPointFileDescriptors();
		const catalog: IRPointFileCatalogEntry[] = [];

		for (const descriptor of descriptors) {
			catalog.push({
				...descriptor,
				fileData: await this.readPointFile(
					descriptor.absolutePath,
					descriptor.topicId,
					descriptor.topicName
				),
			});
		}

		return catalog;
	}

	async remapAssociatedNoteFileReferences(oldPath: string, newPath: string): Promise<number> {
		const catalog = await this.listPointFileCatalogEntries();
		const pointFilesIndex = await this.readPointFilesIndex();
		const nowIso = new Date().toISOString();
		let updatedPointCount = 0;
		let updatedFileCount = 0;

		for (const entry of catalog) {
			let fileChanged = false;
			const nextPoints = (entry.fileData.points || []).map((point) => {
				const currentPaths = Array.isArray(point.relations?.linkedNotePaths)
					? point.relations.linkedNotePaths
					: [];
				const nextPaths = remapAssociatedNotePaths(currentPaths, oldPath, newPath);
				if (
					nextPaths.length === currentPaths.length &&
					nextPaths.every((path, index) => path === currentPaths[index])
				) {
					return point;
				}

				fileChanged = true;
				updatedPointCount += 1;
				return {
					...point,
					timestamps: {
						...point.timestamps,
						updatedAt: nowIso,
					},
					relations: {
						...point.relations,
						linkedNotePaths: nextPaths,
					},
				};
			});

			if (!fileChanged) {
				continue;
			}

			await this.persistPointFileData(entry.absolutePath, {
				...entry.fileData,
				updatedAt: nowIso,
				points: nextPoints,
			});
			const indexEntry = pointFilesIndex.files.find(
				(item) => String(item.topicId || "").trim() === String(entry.topicId || "").trim()
			);
			if (indexEntry) {
				indexEntry.updatedAt = nowIso;
			}
			updatedFileCount += 1;
		}

		if (updatedFileCount > 0) {
			await this.writePointFilesIndex(pointFilesIndex);
			logger.debug(
				`[IRPointStorageService] 已重映射 ${updatedPointCount} 个阅读点的关联笔记路径: ${oldPath} -> ${newPath}`
			);
		}

		return updatedPointCount;
	}

	private isLegacyDeckBlockPoint(point: Partial<IRPoint> | null | undefined): boolean {
		if (!point || point.source?.type !== "markdown") {
			return false;
		}
		if (point.pointType === "chunk-entry") {
			return false;
		}
		if (point.audit?.origin?.type === "ir-chunk") {
			return false;
		}
		return point.trace?.locatorType !== "markdown-chunk";
	}

	private buildDeckFromPointFile(entry: IRPointFileCatalogEntry): IRDeck {
		const fileData = this.normalizePointFileData(entry.fileData, entry.topicId, entry.topicName);
		const deckMeta = this.normalizePointDeckRecord(fileData.deck, entry.topicName, fileData.updatedAt);
		const blockIds = fileData.points
			.filter((point) => this.isLegacyDeckBlockPoint(point))
			.map((point) => String(point.id || "").trim())
			.filter(Boolean);
		const sourceFiles = Array.from(
			new Set(
				fileData.points
					.map((point) => normalizePath(String(point.source?.path || "").trim()))
					.filter(Boolean)
			)
		).sort((left, right) => left.localeCompare(right, "zh-CN"));

		return {
			id: entry.topicId,
			name: entry.topicName,
			description: deckMeta.description,
			icon: deckMeta.icon,
			color: deckMeta.color,
			blockIds,
			sourceFiles,
			settings: { ...deckMeta.settings },
			tags: deckMeta.tags && deckMeta.tags.length > 0 ? [...deckMeta.tags] : undefined,
			createdAt: deckMeta.createdAt,
			updatedAt: deckMeta.updatedAt,
			archivedAt: deckMeta.archivedAt,
			path: entry.topicId,
		};
	}

	async listPointDecks(): Promise<Record<string, IRDeck>> {
		await this.initialize();
		const catalog = await this.listPointFileCatalogEntries();
		const decks: Record<string, IRDeck> = {};

		for (const entry of catalog) {
			decks[entry.topicId] = this.buildDeckFromPointFile(entry);
		}

		return decks;
	}

	async upsertPointDeck(deck: IRDeck): Promise<IRDeck> {
		await this.initialize();
		const topicId = String(deck.id || deck.path || "").trim();
		const topicName = String(deck.name || "").trim();
		if (!topicId) {
			throw new Error("IR 专题保存失败：缺少稳定专题 ID");
		}
		if (!topicName) {
			throw new Error("IR 专题保存失败：专题名称不能为空");
		}

		const index = await this.readPointFilesIndex();
		const existing = index.files.find((item) => String(item.topicId || "").trim() === topicId);
		const previousAbsolutePath = this.resolveIndexedPointFilePath(existing?.file)?.absolutePath || null;
		const { relativePath, absolutePath } = await this.resolvePointFilePath(index, topicId, topicName);
		await this.renameTopicFileIfNeeded(previousAbsolutePath, absolutePath);

		const fileData = await this.readPointFile(absolutePath, topicId, topicName);
		const nowIso = new Date().toISOString();
		const nextDeck = this.normalizePointDeckRecord(
			{
				...this.projectLegacyDeckRecord(this.buildDeckFromPointFile({
					...existing,
					topicId,
					topicName,
					relativePath,
					absolutePath,
					fileData,
				} as IRPointFileCatalogEntry)),
				...this.projectLegacyDeckRecord(deck),
				updatedAt: nowIso,
			},
			topicName,
			nowIso
		);

		await this.persistPointFileData(absolutePath, {
			...fileData,
			topicId,
			topicName,
			updatedAt: nowIso,
			deck: nextDeck,
		});

		const pointCount = Array.isArray(fileData.points) ? fileData.points.length : 0;
		if (existing) {
			existing.file = absolutePath;
			existing.topicName = topicName;
			existing.pointCount = pointCount;
			existing.updatedAt = nowIso;
		} else {
			index.files.push({
				topicId,
				topicName,
				file: absolutePath,
				pointCount,
				updatedAt: nowIso,
			});
		}
		await this.writePointFilesIndex(index);

		return this.buildDeckFromPointFile({
			topicId,
			topicName,
			relativePath,
			absolutePath,
			fileData: await this.readPointFile(absolutePath, topicId, topicName),
		});
	}

	async deletePointDeck(topicId: string): Promise<{
		removed: boolean;
		topicName: string;
		pointIds: string[];
		sourceFiles: string[];
	}> {
		await this.initialize();
		const normalizedTopicId = String(topicId || "").trim();
		if (!normalizedTopicId) {
			return { removed: false, topicName: "", pointIds: [], sourceFiles: [] };
		}

		const index = await this.readPointFilesIndex();
		const entryIndex = index.files.findIndex(
			(item) => String(item?.topicId || "").trim() === normalizedTopicId
		);
		if (entryIndex < 0) {
			return { removed: false, topicName: "", pointIds: [], sourceFiles: [] };
		}

		const entry = index.files[entryIndex];
		const absolutePath = this.resolveIndexedPointFilePath(entry.file)?.absolutePath;
		if (!absolutePath) {
			index.files.splice(entryIndex, 1);
			await this.writePointFilesIndex(index);
			return { removed: false, topicName: "", pointIds: [], sourceFiles: [] };
		}
		const fileData = await this.readPointFile(absolutePath, entry.topicId, entry.topicName);
		const pointIds = (fileData.points || [])
			.map((point) => String(point.id || "").trim())
			.filter(Boolean);
		const sourceFiles = Array.from(
			new Set(
				(fileData.points || [])
					.map((point) => normalizePath(String(point.source?.path || "").trim()))
					.filter(Boolean)
			)
		);

		if (await this.adapter.exists(absolutePath)) {
			await this.adapter.remove(absolutePath);
		}
		index.files.splice(entryIndex, 1);
		await this.writePointFilesIndex(index);

		return {
			removed: true,
			topicName: String(fileData.topicName || entry.topicName || "").trim(),
			pointIds,
			sourceFiles,
		};
	}

	async mergeTagGroupCatalogIntoPointFiles(options: {
		groups?: Record<string, IRTagGroup>;
		profiles?: Record<string, IRTagGroupProfile>;
		targetTopicIds?: string[];
	}): Promise<string[]> {
		await this.initialize();
		const catalog = await this.listPointFileCatalogEntries();
		const targetTopicIds = new Set(
			(options.targetTopicIds || []).map((value) => String(value || "").trim()).filter(Boolean)
		);
		const targetAll = targetTopicIds.size === 0;
		const normalizedGroups = options.groups || {};
		const normalizedProfiles = options.profiles || {};
		const affected: string[] = [];

		for (const entry of catalog) {
			if (!targetAll && !targetTopicIds.has(entry.topicId)) {
				continue;
			}

			const nextGroups = {
				...entry.fileData.tagGroups,
			};
			const nextProfiles = {
				...entry.fileData.tagGroupProfiles,
			};
			let changed = false;

			for (const [groupId, group] of Object.entries(normalizedGroups)) {
				const normalizedGroupId = String(group.id || groupId || "").trim();
				if (!normalizedGroupId) {
					continue;
				}
				nextGroups[normalizedGroupId] = this.cloneTagGroup({
					...group,
					id: normalizedGroupId,
				});
				const nextProfile = normalizedProfiles[normalizedGroupId] || {
					...DEFAULT_TAG_GROUP_PROFILE,
					groupId: normalizedGroupId,
				};
				nextProfiles[normalizedGroupId] = this.cloneTagGroupProfile({
					...nextProfile,
					groupId: normalizedGroupId,
				});
				changed = true;
			}

			if (!changed) {
				continue;
			}

			await this.persistPointFileData(entry.absolutePath, {
				...entry.fileData,
				tagGroups: nextGroups,
				tagGroupProfiles: nextProfiles,
				updatedAt: new Date().toISOString(),
			});
			affected.push(entry.topicId);
		}

		return affected;
	}

	async removeTagGroupFromPointFiles(groupId: string, targetTopicIds?: string[]): Promise<string[]> {
		await this.initialize();
		const normalizedGroupId = String(groupId || "").trim();
		if (!normalizedGroupId || normalizedGroupId === DEFAULT_TAG_GROUP.id) {
			return [];
		}

		const catalog = await this.listPointFileCatalogEntries();
		const targetSet = new Set((targetTopicIds || []).map((value) => String(value || "").trim()).filter(Boolean));
		const targetAll = targetSet.size === 0;
		const affected: string[] = [];

		for (const entry of catalog) {
			if (!targetAll && !targetSet.has(entry.topicId)) {
				continue;
			}

			let changed = false;
			const nextGroups = { ...entry.fileData.tagGroups };
			const nextProfiles = { ...entry.fileData.tagGroupProfiles };
			if (nextGroups[normalizedGroupId]) {
				delete nextGroups[normalizedGroupId];
				changed = true;
			}
			if (nextProfiles[normalizedGroupId]) {
				delete nextProfiles[normalizedGroupId];
				changed = true;
			}

			const nextPoints = entry.fileData.points.map((point) => {
				const metadata =
					point.metadata && typeof point.metadata === "object"
						? { ...point.metadata }
						: undefined;
				if (metadata?.tagGroupId !== normalizedGroupId) {
					return point;
				}
				changed = true;
				return {
					...point,
					metadata: {
						...metadata,
						tagGroupId: DEFAULT_TAG_GROUP.id,
					},
				};
			});

			if (!changed) {
				continue;
			}

			await this.persistPointFileData(entry.absolutePath, {
				...entry.fileData,
				tagGroups: nextGroups,
				tagGroupProfiles: nextProfiles,
				points: nextPoints,
				updatedAt: new Date().toISOString(),
			});
			affected.push(entry.topicId);
		}

		return affected;
	}

	private buildMaterialSourceKey(
		source: Partial<IRMaterialRecord["source"]> | null | undefined,
		fallbackId = ""
	): string {
		const type = String(source?.type || "file").trim().toLowerCase() || "file";
		const hash = String(source?.hash || "").trim().toLowerCase();
		if (hash) {
			return `${type}#${hash}`;
		}

		const normalizedPath = normalizeMaterialSourcePath(source?.path);
		if (normalizedPath) {
			return `${type}:${normalizedPath}`;
		}

		return `id:${String(fallbackId || "").trim()}`;
	}


	private async listMaterialDescriptors(): Promise<MaterialRecordDescriptor[]> {
		await this.initialize();
		const index = await this.readMaterialsIndex();
		const indexedFiles = new Set<string>();
		const descriptors: MaterialRecordDescriptor[] = [];
		const materialsDir = this.getMaterialsDir();

		for (const entry of index.materials || []) {
			if (!entry?.file) {
				continue;
			}

			const absolutePath = normalizePath(`${this.getV2Paths().ir.root}/${entry.file}`);
			indexedFiles.add(absolutePath);
			if (!(await this.adapter.exists(absolutePath))) {
				continue;
			}

			const record = await this.readJson<IRMaterialRecord | null>(absolutePath, null);
			const recordId =
				(typeof record?.id === "string" && record.id.trim()) ||
				(typeof entry.id === "string" && entry.id.trim()) ||
				"";
			if (!record || !recordId) {
				continue;
			}

			descriptors.push({
				id: recordId,
				path: absolutePath,
				relativeFile: entry.file,
				record,
				indexed: true,
				sourceKey: this.buildMaterialSourceKey(record.source, recordId),
			});
		}

		if (!(await this.adapter.exists(materialsDir))) {
			return descriptors;
		}

		const listing = await this.adapter.list(materialsDir);
		for (const filePath of listing.files || []) {
			const normalizedFile = normalizePath(filePath);
			if (!normalizedFile.endsWith(".material.json") || indexedFiles.has(normalizedFile)) {
				continue;
			}

			const record = await this.readJson<IRMaterialRecord | null>(normalizedFile, null);
			const recordId = typeof record?.id === "string" ? record.id.trim() : "";
			if (!record || !recordId) {
				continue;
			}

			descriptors.push({
				id: recordId,
				path: normalizedFile,
				relativeFile: normalizePath(normalizedFile).startsWith(`${materialsDir}/`)
					? `materials/${normalizedFile.slice(`${materialsDir}/`.length)}`
					: `materials/${sanitizeForSync(recordId, 100)}.material.json`,
				record,
				indexed: false,
				sourceKey: this.buildMaterialSourceKey(record.source, recordId),
			});
		}

		return descriptors;
	}

	private async buildMaterialCleanupPlan(): Promise<MaterialCleanupPlan> {
		const legacyReadApi = this.getLegacyReadApi();
		const [descriptors, legacyMaterials, pointIndex] = await Promise.all([
			this.listMaterialDescriptors(),
			getLegacyMaterials(legacyReadApi),
			this.readPointFilesIndex(),
		]);
		const items: string[] = [];
		const descriptorsById = new Map<string, IRMaterialRecord>();
		for (const descriptor of descriptors) {
			if (!descriptorsById.has(descriptor.id)) {
				descriptorsById.set(descriptor.id, descriptor.record);
			}
		}

		const pointSourceBackfills: MaterialCleanupPlan["pointSourceBackfills"] = [];
		const missingTargetPoints: MaterialCleanupPlan["missingTargetPoints"] = [];
		let pendingEmbeddedSourceCount = 0;
		let missingEmbeddedSourceTargetCount = 0;

		for (const entry of pointIndex.files || []) {
			if (!entry?.file) {
				continue;
			}

			const filePath = this.resolveIndexedPointFilePath(entry.file)?.absolutePath;
			if (!filePath) {
				continue;
			}
			if (!(await this.adapter.exists(filePath))) {
				continue;
			}

			const fileData = await this.readPointFile(filePath, entry.topicId, entry.topicName);
			for (let pointIndexInFile = 0; pointIndexInFile < (fileData.points || []).length; pointIndexInFile += 1) {
				const point = fileData.points[pointIndexInFile];
				if (!point?.id) {
					continue;
				}

				const normalizedPoint = this.normalizeStoredPoint(
					point,
					descriptorsById.get(String(point.materialId || "").trim()) || null,
					legacyMaterials.get(String(point.materialId || "").trim())
				);
				const hasStoredSource = this.hasEmbeddedPointSource(point);
				const hasResolvedSource = this.hasEmbeddedPointSource(normalizedPoint);
				if (!hasStoredSource) {
					pendingEmbeddedSourceCount += 1;
					if (hasResolvedSource) {
						pointSourceBackfills.push({
							filePath,
							topicId: entry.topicId,
							topicName: entry.topicName,
							pointIndex: pointIndexInFile,
							point,
							source: normalizedPoint.source,
						});
					}
				}

				const sourcePath = normalizePath(String(normalizedPoint.source?.path || "").trim());
				if (!sourcePath) {
					continue;
				}
				const sourceFile =
					typeof this.app.vault.getAbstractFileByPath === "function"
						? this.app.vault.getAbstractFileByPath(sourcePath)
						: await this.adapter.exists(sourcePath)
							? { path: sourcePath }
							: null;
				if (!sourceFile) {
					missingEmbeddedSourceTargetCount += 1;
					missingTargetPoints.push({
						filePath,
						topicId: entry.topicId,
						topicName: entry.topicName,
						pointIndex: pointIndexInFile,
						pointId: String(normalizedPoint.id || point.id || "").trim(),
						sourcePath,
					});
				}
			}
		}

		const legacyMaterialsIndexFileCount = (await this.adapter.exists(this.getV2Paths().ir.materialsIndex))
			? 1
			: 0;
		const legacyMaterialsFileCount = (await this.adapter.exists(this.getV2Paths().ir.materials.index))
			? 1
			: 0;
		let emptyLegacyMaterialDirCount = 0;
		if (await this.adapter.exists(this.getV2Paths().ir.materials.sessions)) {
			emptyLegacyMaterialDirCount = 1;
		}

		if (pendingEmbeddedSourceCount > 0) {
			items.push(`阅读点缺少内嵌溯源信息 ${pendingEmbeddedSourceCount} 个`);
		}
		if (descriptors.length > 0) {
			items.push(`旧 .material.json 文件残留 ${descriptors.length} 个`);
		}
		if (legacyMaterialsIndexFileCount > 0) {
			items.push("旧 materials-index.json 仍残留在同步目录");
		}
		if (legacyMaterialsFileCount > 0) {
			items.push("旧 materials.json 仍残留在同步目录");
		}
		if (emptyLegacyMaterialDirCount > 0) {
			items.push("旧 materials/sessions 目录仍残留");
		}
		if (missingEmbeddedSourceTargetCount > 0) {
			items.push(`阅读点溯源目标文件缺失 ${missingEmbeddedSourceTargetCount} 个`);
		}

		return {
			pointSourceBackfills,
			missingTargetPoints,
			legacyMaterialDescriptors: descriptors,
			pendingEmbeddedSourceCount,
			legacyMaterialsIndexFileCount,
			legacyMaterialsFileCount,
			emptyLegacyMaterialDirCount,
			missingEmbeddedSourceTargetCount,
			items,
		};
	}

	private async applyPointSourceBackfills(
		plan: MaterialCleanupPlan,
		failures: IRLegacyMigrationIssue[]
	): Promise<number> {
		if (plan.pointSourceBackfills.length === 0) {
			return 0;
		}

		const backfillsByFile = new Map<
			string,
			{
				topicId: string;
				topicName: string;
				entries: typeof plan.pointSourceBackfills;
			}
		>();
		for (const backfill of plan.pointSourceBackfills) {
			const group = backfillsByFile.get(backfill.filePath);
			if (group) {
				group.entries.push(backfill);
				continue;
			}
			backfillsByFile.set(backfill.filePath, {
				topicId: backfill.topicId,
				topicName: backfill.topicName,
				entries: [backfill],
			});
		}

		let backfilledPointSourceCount = 0;
		for (const [filePath, group] of backfillsByFile.entries()) {
			try {
				const fileData = await this.readPointFile(filePath, group.topicId, group.topicName);
				const nextPoints = [...fileData.points];
				for (const backfill of group.entries) {
					const currentPoint = nextPoints[backfill.pointIndex];
					if (!currentPoint) {
						continue;
					}
					const normalizedPoint = this.normalizeStoredPoint(currentPoint);
					nextPoints[backfill.pointIndex] = {
						...normalizedPoint,
						materialId: normalizedPoint.materialId || backfill.source.id,
						source: backfill.source,
						parameterContext:
							normalizedPoint.parameterContext ||
							this.buildParameterContext(
								this.inferMaterialClass(backfill.source.type, backfill.source.path)
							),
					};
					backfilledPointSourceCount += 1;
				}

				await this.writeJson(filePath, {
					...fileData,
					updatedAt: new Date().toISOString(),
					points: nextPoints,
				} satisfies IRPointFileData);
			} catch (error) {
				failures.push({
					id: filePath,
					type: "point-source-backfill",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return backfilledPointSourceCount;
	}

	private async applyMissingTargetPointCleanup(
		plan: MaterialCleanupPlan,
		failures: IRLegacyMigrationIssue[]
	): Promise<number> {
		if (plan.missingTargetPoints.length === 0) {
			return 0;
		}

		const removalsByFile = new Map<
			string,
			{
				topicId: string;
				topicName: string;
				entries: typeof plan.missingTargetPoints;
			}
		>();
		for (const removal of plan.missingTargetPoints) {
			const group = removalsByFile.get(removal.filePath);
			if (group) {
				group.entries.push(removal);
				continue;
			}

			removalsByFile.set(removal.filePath, {
				topicId: removal.topicId,
				topicName: removal.topicName,
				entries: [removal],
			});
		}

		const pointFilesIndex = await this.readPointFilesIndex();
		let removedMissingTargetPointCount = 0;

		for (const [filePath, group] of removalsByFile.entries()) {
			try {
				const fileData = await this.readPointFile(filePath, group.topicId, group.topicName);
				const removalIndexes = new Set(group.entries.map((entry) => entry.pointIndex));
				const nextPoints = fileData.points.filter((_point, index) => !removalIndexes.has(index));
				const removedCount = fileData.points.length - nextPoints.length;
				if (removedCount <= 0) {
					continue;
				}

				removedMissingTargetPointCount += removedCount;
				await this.writeJson(filePath, {
					...fileData,
					updatedAt: new Date().toISOString(),
					points: nextPoints,
				} satisfies IRPointFileData);

				const normalizedFilePath = normalizePath(filePath);
				const indexEntry = (pointFilesIndex.files || []).find(
					(entry) => this.resolveIndexedPointFilePath(entry.file)?.absolutePath === normalizedFilePath
				);
				if (indexEntry) {
					indexEntry.pointCount = nextPoints.length;
					indexEntry.updatedAt = new Date().toISOString();
				}
			} catch (error) {
				for (const entry of group.entries) {
					failures.push({
						id: entry.pointId || filePath,
						type: "missing-source-target-cleanup",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		if (removedMissingTargetPointCount > 0) {
			await this.writePointFilesIndex(pointFilesIndex);
		}

		return removedMissingTargetPointCount;
	}

	async inspectMaterialStorageConsistency(): Promise<MaterialStorageInspection> {
		await this.initialize();
		const plan = await this.buildMaterialCleanupPlan();
		return {
			issueCount:
				plan.pendingEmbeddedSourceCount +
				plan.legacyMaterialDescriptors.length +
				plan.legacyMaterialsIndexFileCount +
				plan.legacyMaterialsFileCount +
				plan.emptyLegacyMaterialDirCount +
				plan.missingEmbeddedSourceTargetCount,
			items: plan.items,
			pendingEmbeddedSourceCount: plan.pendingEmbeddedSourceCount,
			legacyMaterialRecordFileCount: plan.legacyMaterialDescriptors.length,
			legacyMaterialsIndexFileCount: plan.legacyMaterialsIndexFileCount,
			legacyMaterialsFileCount: plan.legacyMaterialsFileCount,
			emptyLegacyMaterialDirCount: plan.emptyLegacyMaterialDirCount,
			missingEmbeddedSourceTargetCount: plan.missingEmbeddedSourceTargetCount,
		};
	}

	async cleanupMaterialStorageResidue(
		options: {
			removeMissingTargetPoints?: boolean;
			reportMissingTargetFailures?: boolean;
			blockLegacyCleanupOnMissingTargets?: boolean;
		} = {}
	): Promise<MaterialStorageCleanupResult> {
		await this.initialize();
		let plan = await this.buildMaterialCleanupPlan();
		const failures: IRLegacyMigrationIssue[] = [];
		const removeMissingTargetPoints = options.removeMissingTargetPoints !== false;
		const reportMissingTargetFailures = options.reportMissingTargetFailures !== false;
		const blockLegacyCleanupOnMissingTargets =
			options.blockLegacyCleanupOnMissingTargets !== false;
		let backfilledPointSourceCount = 0;
		let removedMissingTargetPointCount = 0;
		let removedLegacyMaterialRecordCount = 0;
		let removedLegacyMaterialsIndexCount = 0;
		let removedLegacyMaterialsFileCount = 0;
		let removedEmptyLegacyMaterialDirCount = 0;

		if (plan.pointSourceBackfills.length > 0) {
			backfilledPointSourceCount = await this.applyPointSourceBackfills(plan, failures);
			plan = await this.buildMaterialCleanupPlan();
		}

		if (removeMissingTargetPoints && plan.missingTargetPoints.length > 0) {
			removedMissingTargetPointCount = await this.applyMissingTargetPointCleanup(plan, failures);
			plan = await this.buildMaterialCleanupPlan();
		}

		if (plan.pendingEmbeddedSourceCount > 0) {
			failures.push({
				id: "point-source-backfill",
				type: "point-source-backfill",
				message: `仍有 ${plan.pendingEmbeddedSourceCount} 个阅读点缺少内嵌溯源信息，已保留旧材料文件以防数据丢失`,
			});
		}
		if (reportMissingTargetFailures && plan.missingEmbeddedSourceTargetCount > 0) {
			failures.push({
				id: "missing-source-target",
				type: "missing-source-target-cleanup",
				message: `仍有 ${plan.missingEmbeddedSourceTargetCount} 个阅读点溯源目标文件缺失，自动清理未完成`,
			});
		}

		if (
			plan.pendingEmbeddedSourceCount <= 0 &&
			(!blockLegacyCleanupOnMissingTargets || plan.missingEmbeddedSourceTargetCount <= 0)
		) {
			for (const descriptor of plan.legacyMaterialDescriptors) {
				try {
					if (await this.adapter.exists(descriptor.path)) {
						await this.adapter.remove(descriptor.path);
						removedLegacyMaterialRecordCount += 1;
					}
				} catch (error) {
					failures.push({
						id: descriptor.id,
						type: "material-record-cleanup",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}

			if (plan.legacyMaterialsIndexFileCount > 0) {
				try {
					await this.adapter.remove(this.getV2Paths().ir.materialsIndex);
					removedLegacyMaterialsIndexCount = 1;
				} catch (error) {
					failures.push({
						id: this.getV2Paths().ir.materialsIndex,
						type: "materials-index-cleanup",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}

			if (plan.legacyMaterialsFileCount > 0) {
				try {
					await this.adapter.remove(this.getV2Paths().ir.materials.index);
					removedLegacyMaterialsFileCount = 1;
				} catch (error) {
					failures.push({
						id: this.getV2Paths().ir.materials.index,
						type: "legacy-materials-cleanup",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}

			if (plan.emptyLegacyMaterialDirCount > 0) {
				try {
					if (
						typeof (this.adapter as { rmdir?: (path: string, recursive?: boolean) => Promise<void> })
							.rmdir === "function"
					) {
						await (
							this.adapter as {
								rmdir: (path: string, recursive?: boolean) => Promise<void>;
							}
						).rmdir(this.getV2Paths().ir.materials.sessions, true);
					} else {
						await this.adapter.remove(this.getV2Paths().ir.materials.sessions);
					}
					removedEmptyLegacyMaterialDirCount = 1;
				} catch (error) {
					failures.push({
						id: this.getV2Paths().ir.materials.sessions,
						type: "legacy-material-dir-cleanup",
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		} else if (
			plan.pendingEmbeddedSourceCount > 0 ||
			(blockLegacyCleanupOnMissingTargets && plan.missingEmbeddedSourceTargetCount > 0)
		) {
			logger.warn("[IRPointStorageService] 材料残留清理被阻止，仍存在未解决的阅读点溯源问题", {
				pendingEmbeddedSourceCount: plan.pendingEmbeddedSourceCount,
				missingEmbeddedSourceTargetCount: plan.missingEmbeddedSourceTargetCount,
			});
		}

		await DirectoryUtils.pruneEmptyDirsUnder(this.adapter as any, this.getV2Paths().ir.root, {
			preserveRoot: true,
		});

		return {
			backfilledPointSourceCount,
			removedMissingTargetPointCount,
			removedLegacyMaterialRecordCount,
			removedLegacyMaterialsIndexCount,
			removedLegacyMaterialsFileCount,
			removedEmptyLegacyMaterialDirCount,
			failures,
		};
	}

	private cloneTagGroup(group: IRTagGroup): IRTagGroup {
		return {
			...group,
			matchAnyTags: Array.isArray(group.matchAnyTags) ? [...group.matchAnyTags] : [],
			matchSource: group.matchSource
				? {
						yamlTags: group.matchSource.yamlTags !== false,
						inlineTags: group.matchSource.inlineTags !== false,
						customProperties: Array.isArray(group.matchSource.customProperties)
							? [...group.matchSource.customProperties]
							: [],
				  }
				: undefined,
		};
	}

	private cloneTagGroupProfile(profile: IRTagGroupProfile): IRTagGroupProfile {
		return {
			...profile,
			history: Array.isArray(profile.history)
				? profile.history.map((entry) => ({ ...entry }))
				: undefined,
		};
	}

	private createDefaultPointDeckRecord(topicName: string, timestamp: string): IRPointDeckRecord {
		return {
			description: "",
			icon: "📖",
			color: "#f97316",
			settings: { ...DEFAULT_IR_DECK_SETTINGS },
			createdAt: timestamp,
			updatedAt: timestamp,
			archivedAt: null,
		};
	}

	private normalizePointDeckRecord(
		deck: Partial<IRPointDeckRecord> | null | undefined,
		topicName: string,
		timestamp: string
	): IRPointDeckRecord {
		const fallback = this.createDefaultPointDeckRecord(topicName, timestamp);
		const rawSettings =
			deck?.settings && typeof deck.settings === "object" ? deck.settings : undefined;
		return {
			description: typeof deck?.description === "string" ? deck.description : fallback.description,
			icon:
				typeof deck?.icon === "string" && deck.icon.trim() ? deck.icon : fallback.icon,
			color:
				typeof deck?.color === "string" && deck.color.trim() ? deck.color : fallback.color,
			settings: {
				defaultPriority:
					typeof rawSettings?.defaultPriority === "number"
						? rawSettings.defaultPriority
						: fallback.settings.defaultPriority,
				splitMode:
					typeof rawSettings?.splitMode === "string" && rawSettings.splitMode.trim()
						? rawSettings.splitMode
						: fallback.settings.splitMode,
				splitLevel:
					typeof rawSettings?.splitLevel === "number"
						? rawSettings.splitLevel
						: fallback.settings.splitLevel,
				customSplitMarker:
					typeof rawSettings?.customSplitMarker === "string"
						? rawSettings.customSplitMarker
						: fallback.settings.customSplitMarker,
				defaultIntervalFactor:
					typeof rawSettings?.defaultIntervalFactor === "number"
						? rawSettings.defaultIntervalFactor
						: fallback.settings.defaultIntervalFactor,
				dailyNewLimit:
					typeof rawSettings?.dailyNewLimit === "number"
						? rawSettings.dailyNewLimit
						: fallback.settings.dailyNewLimit,
				dailyReviewLimit:
					typeof rawSettings?.dailyReviewLimit === "number"
						? rawSettings.dailyReviewLimit
						: fallback.settings.dailyReviewLimit,
				interleaveMode:
					typeof rawSettings?.interleaveMode === "boolean"
						? rawSettings.interleaveMode
						: fallback.settings.interleaveMode,
			},
			tags: Array.isArray(deck?.tags)
				? deck.tags.map((tag) => String(tag)).filter(Boolean)
				: undefined,
			createdAt:
				typeof deck?.createdAt === "string" && deck.createdAt.trim()
					? deck.createdAt
					: fallback.createdAt,
			updatedAt:
				typeof deck?.updatedAt === "string" && deck.updatedAt.trim()
					? deck.updatedAt
					: timestamp,
			archivedAt:
				typeof deck?.archivedAt === "string" && deck.archivedAt.trim()
					? deck.archivedAt
					: null,
		};
	}

	private projectLegacyDeckRecord(deck: Partial<IRDeck> | null | undefined): Partial<IRPointDeckRecord> {
		if (!deck || typeof deck !== "object") {
			return {};
		}
		return {
			description: typeof deck.description === "string" ? deck.description : "",
			icon: typeof deck.icon === "string" ? deck.icon : undefined,
			color: typeof deck.color === "string" ? deck.color : undefined,
			settings:
				deck.settings && typeof deck.settings === "object"
					? { ...deck.settings }
					: undefined,
			tags: Array.isArray(deck.tags)
				? deck.tags.map((tag) => String(tag)).filter(Boolean)
				: undefined,
			createdAt:
				typeof deck.createdAt === "string" && deck.createdAt.trim()
					? deck.createdAt
					: undefined,
			updatedAt:
				typeof deck.updatedAt === "string" && deck.updatedAt.trim()
					? deck.updatedAt
					: undefined,
			archivedAt:
				typeof deck.archivedAt === "string" && deck.archivedAt.trim()
					? deck.archivedAt
					: null,
		};
	}

	private normalizePointFileData(
		fileData: Partial<IRPointFileData> | null | undefined,
		fallbackTopicId: string,
		fallbackTopicName: string
	): IRPointFileData {
		const topicId =
			typeof fileData?.topicId === "string" && fileData.topicId.trim()
				? fileData.topicId.trim()
				: fallbackTopicId;
		const topicName =
			typeof fileData?.topicName === "string" && fileData.topicName.trim()
				? fileData.topicName.trim()
				: fallbackTopicName;
		const updatedAt =
			typeof fileData?.updatedAt === "string" && fileData.updatedAt.trim()
				? fileData.updatedAt
				: new Date(0).toISOString();
		const normalizedGroups: Record<string, IRTagGroup> = {};
		const rawGroups =
			fileData?.tagGroups && typeof fileData.tagGroups === "object" ? fileData.tagGroups : {};
		for (const [groupId, group] of Object.entries(rawGroups)) {
			if (!group || typeof group !== "object") {
				continue;
			}
			const rawMatchSource =
				group.matchSource && typeof group.matchSource === "object"
					? (group.matchSource as {
							yamlTags?: unknown;
							inlineTags?: unknown;
							customProperties?: unknown;
					  })
					: null;
			const normalizedGroupId = String(group.id || groupId || "").trim();
			if (!normalizedGroupId) {
				continue;
			}
			normalizedGroups[normalizedGroupId] = this.cloneTagGroup({
				...group,
				id: normalizedGroupId,
				name:
					typeof group.name === "string" && group.name.trim()
						? group.name.trim()
						: normalizedGroupId,
				description: typeof group.description === "string" ? group.description : "",
				matchAnyTags: Array.isArray(group.matchAnyTags)
					? group.matchAnyTags.map((tag) => String(tag))
					: [],
				matchPriority: Number.isFinite(group.matchPriority) ? Number(group.matchPriority) : 999,
				matchSource:
					rawMatchSource
						? {
								yamlTags: rawMatchSource.yamlTags !== false,
								inlineTags: rawMatchSource.inlineTags !== false,
								customProperties: Array.isArray(rawMatchSource.customProperties)
									? rawMatchSource.customProperties.map((value) => String(value))
									: [],
						  }
						: undefined,
				createdAt:
					typeof group.createdAt === "string" && group.createdAt.trim()
						? group.createdAt
						: new Date(0).toISOString(),
				updatedAt:
					typeof group.updatedAt === "string" && group.updatedAt.trim()
						? group.updatedAt
						: new Date(0).toISOString(),
			});
		}
		if (!normalizedGroups.default) {
			normalizedGroups.default = this.cloneTagGroup(DEFAULT_TAG_GROUP);
		}

		const normalizedProfiles: Record<string, IRTagGroupProfile> = {};
		const rawProfiles =
			fileData?.tagGroupProfiles && typeof fileData.tagGroupProfiles === "object"
				? fileData.tagGroupProfiles
				: {};
		for (const [groupId, profile] of Object.entries(rawProfiles)) {
			if (!profile || typeof profile !== "object") {
				continue;
			}
			const normalizedGroupId = String(profile.groupId || groupId || "").trim();
			if (!normalizedGroupId) {
				continue;
			}
			normalizedProfiles[normalizedGroupId] = this.cloneTagGroupProfile({
				...profile,
				groupId: normalizedGroupId,
				intervalFactorBase: Number.isFinite(profile.intervalFactorBase)
					? Number(profile.intervalFactorBase)
					: DEFAULT_TAG_GROUP_PROFILE.intervalFactorBase,
				initialIntervalMultiplier: Number.isFinite(profile.initialIntervalMultiplier)
					? Number(profile.initialIntervalMultiplier)
					: DEFAULT_TAG_GROUP_PROFILE.initialIntervalMultiplier,
				loadHalfLifeDays: Number.isFinite(profile.loadHalfLifeDays)
					? Number(profile.loadHalfLifeDays)
					: undefined,
				sampleCount: Number.isFinite(profile.sampleCount) ? Number(profile.sampleCount) : 0,
				updatedAt:
					typeof profile.updatedAt === "string" && profile.updatedAt.trim()
						? profile.updatedAt
						: new Date(0).toISOString(),
				history: Array.isArray(profile.history)
					? profile.history
							.filter((entry) => entry && typeof entry === "object")
							.map((entry) => ({
								timestamp:
									typeof entry.timestamp === "string" && entry.timestamp.trim()
										? entry.timestamp
										: new Date(0).toISOString(),
								value: Number.isFinite(entry.value) ? Number(entry.value) : 0,
								sampleCount: Number.isFinite(entry.sampleCount)
									? Number(entry.sampleCount)
									: 0,
							}))
					: undefined,
			});
		}
		for (const groupId of Object.keys(normalizedGroups)) {
			if (!normalizedProfiles[groupId]) {
				normalizedProfiles[groupId] = this.cloneTagGroupProfile({
					...DEFAULT_TAG_GROUP_PROFILE,
					groupId,
				});
			}
		}

		return {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			topicId,
			topicName,
			updatedAt,
			deck: this.normalizePointDeckRecord(fileData?.deck, topicName, updatedAt),
			tagGroups: normalizedGroups,
			tagGroupProfiles: normalizedProfiles,
			points: Array.isArray(fileData?.points) ? fileData.points : [],
		};
	}

	private async persistPointFileData(path: string, fileData: IRPointFileData): Promise<void> {
		await this.writeJson(
			path,
			this.normalizePointFileData(fileData, fileData.topicId, fileData.topicName)
		);
	}

	private async readPointFile(path: string, topicId: string, topicName: string): Promise<IRPointFileData> {
		const fallback: IRPointFileData = {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			topicId,
			topicName,
			updatedAt: new Date(0).toISOString(),
			deck: this.createDefaultPointDeckRecord(topicName, new Date(0).toISOString()),
			tagGroups: {
				default: this.cloneTagGroup(DEFAULT_TAG_GROUP),
			},
			tagGroupProfiles: {
				default: this.cloneTagGroupProfile(DEFAULT_TAG_GROUP_PROFILE),
			},
			points: [],
		};
		const fileData = await this.readJson(path, fallback);
		return this.normalizePointFileData(fileData, topicId, topicName);
	}

	private async listStoredPointSnapshots(): Promise<IRPointSnapshot[]> {
		await this.initialize();
		const legacyReadApi = this.getLegacyReadApi();
		const [pointIndex, legacyMaterials, descriptors] = await Promise.all([
			this.readPointFilesIndex(),
			getLegacyMaterials(legacyReadApi),
			this.listMaterialDescriptors(),
		]);
		const materialRecords = new Map<string, IRMaterialRecord>();
		for (const descriptor of descriptors) {
			if (!materialRecords.has(descriptor.id)) {
				materialRecords.set(descriptor.id, descriptor.record);
			}
		}
		const snapshots: IRPointSnapshot[] = [];

		for (const entry of pointIndex.files || []) {
			if (!entry?.file) {
				continue;
			}

			const filePath = this.resolveIndexedPointFilePath(entry.file)?.absolutePath;
			if (!filePath) {
				continue;
			}
			if (!(await this.adapter.exists(filePath))) {
				continue;
			}

			const fileData = await this.readPointFile(filePath, entry.topicId, entry.topicName);
			for (const point of fileData.points || []) {
				if (!point?.id) {
					continue;
				}
				const normalizedPoint = this.normalizeStoredPoint(
					point,
					materialRecords.get(String(point.materialId || "").trim()) || null,
					legacyMaterials.get(String(point.materialId || "").trim())
				);

				snapshots.push({
					point: normalizedPoint,
					material: this.buildSyntheticMaterialRecord(normalizedPoint),
					topicId: entry.topicId,
					topicName: entry.topicName,
				});
			}
		}

		return snapshots.sort((left, right) => left.point.id.localeCompare(right.point.id));
	}

	async listPointSnapshots(): Promise<IRPointSnapshot[]> {
		await this.ensureRuntimeBaseline();
		return await this.listStoredPointSnapshots();
	}

	private async getStoredPointSnapshotById(pointId: string): Promise<IRPointSnapshot | null> {
		await this.initialize();
		const normalizedId = String(pointId || "").trim();
		if (!normalizedId) {
			return null;
		}

		const legacyReadApi = this.getLegacyReadApi();
		const [pointIndex, legacyMaterials, descriptors] = await Promise.all([
			this.readPointFilesIndex(),
			getLegacyMaterials(legacyReadApi),
			this.listMaterialDescriptors(),
		]);
		const materialRecords = new Map<string, IRMaterialRecord>();
		for (const descriptor of descriptors) {
			if (!materialRecords.has(descriptor.id)) {
				materialRecords.set(descriptor.id, descriptor.record);
			}
		}

		for (const entry of pointIndex.files || []) {
			if (!entry?.file) {
				continue;
			}

			const filePath = this.resolveIndexedPointFilePath(entry.file)?.absolutePath;
			if (!filePath) {
				continue;
			}
			if (!(await this.adapter.exists(filePath))) {
				continue;
			}

			const fileData = await this.readPointFile(filePath, entry.topicId, entry.topicName);
			const point = fileData.points.find((candidate) => String(candidate?.id || "").trim() === normalizedId);
			if (!point) {
				continue;
			}
			const normalizedPoint = this.normalizeStoredPoint(
				point,
				materialRecords.get(String(point.materialId || "").trim()) || null,
				legacyMaterials.get(String(point.materialId || "").trim())
			);

			return {
				point: normalizedPoint,
				material: this.buildSyntheticMaterialRecord(normalizedPoint),
				topicId: entry.topicId,
				topicName: entry.topicName,
			};
		}

		return null;
	}

	async getPointSnapshotById(pointId: string): Promise<IRPointSnapshot | null> {
		await this.ensureRuntimeBaseline();
		return await this.getStoredPointSnapshotById(pointId);
	}

	async getPointTopicIds(pointId: string): Promise<string[]> {
		const snapshot = await this.getPointSnapshotById(pointId);
		if (!snapshot) {
			return [];
		}

		const topicIds = normalizeStringArray(snapshot.point.relations?.topicIds);
		if (topicIds.length > 0) {
			return topicIds;
		}

		const fallbackTopicId = String(snapshot.topicId || "").trim();
		return fallbackTopicId ? [fallbackTopicId] : [DEFAULT_TOPIC_ID];
	}

	private async resolveTopicNameFromCurrentState(
		topicId: string,
		index: IRPointFileIndex,
		topicNamesById?: Map<string, string>
	): Promise<string> {
		const mappedName = topicNamesById?.get(topicId);
		if (mappedName && mappedName.trim()) {
			return mappedName.trim();
		}

		const indexedName = index.files.find((item) => String(item?.topicId || "").trim() === topicId)?.topicName;
		if (indexedName && indexedName.trim()) {
			return indexedName.trim();
		}

		if (topicId === DEFAULT_TOPIC_ID) {
			return DEFAULT_TOPIC_NAME;
		}

		return topicId || DEFAULT_TOPIC_NAME;
	}

	async updatePointTopicIds(
		pointId: string,
		nextTopicIdsInput: string[],
		options?: { topicNamesById?: Map<string, string> }
	): Promise<boolean> {
		await this.initialize();
		const normalizedPointId = String(pointId || "").trim();
		if (!normalizedPointId) {
			return false;
		}

		const index = await this.readPointFilesIndex();
		const nextTopicIds = normalizeStringArray(nextTopicIdsInput);
		if (nextTopicIds.length === 0) {
			nextTopicIds.push(DEFAULT_TOPIC_ID);
		}

		for (const entry of index.files) {
			const absolutePath = this.resolveIndexedPointFilePath(entry.file)?.absolutePath;
			if (!absolutePath) {
				continue;
			}
			const fileData = await this.readPointFile(absolutePath, entry.topicId, entry.topicName);
			const pointIndex = fileData.points.findIndex(
				(point) => String(point?.id || "").trim() === normalizedPointId
			);
			if (pointIndex < 0) {
				continue;
			}

			const existingPoint = fileData.points[pointIndex];
			const nextPrimaryTopicId = nextTopicIds[0] || DEFAULT_TOPIC_ID;
			const nextPrimaryTopicName = await this.resolveTopicNameFromCurrentState(
				nextPrimaryTopicId,
				index,
				options?.topicNamesById
			);
			const nextPoint: IRPoint = {
				...existingPoint,
				relations: {
					...existingPoint.relations,
					topicIds: nextTopicIds,
				},
				timestamps: {
					...existingPoint.timestamps,
					updatedAt: new Date().toISOString(),
				},
			};

			if (entry.topicId === nextPrimaryTopicId) {
				const nextPoints = [...fileData.points];
				nextPoints[pointIndex] = nextPoint;
				await this.persistPointFileData(absolutePath, {
					...fileData,
					topicId: entry.topicId,
					topicName: entry.topicName,
					updatedAt: new Date().toISOString(),
					points: nextPoints,
				});
				entry.pointCount = nextPoints.length;
				entry.updatedAt = new Date().toISOString();
				await this.writePointFilesIndex(index);
				return true;
			}

			const nextSourcePoints = fileData.points.filter(
				(_, candidateIndex) => candidateIndex !== pointIndex
			);
			await this.persistPointFileData(absolutePath, {
				...fileData,
				topicId: entry.topicId,
				topicName: entry.topicName,
				updatedAt: new Date().toISOString(),
				points: nextSourcePoints,
			});
			entry.pointCount = nextSourcePoints.length;
			entry.updatedAt = new Date().toISOString();

			const targetEntry = index.files.find(
				(item) => String(item?.topicId || "").trim() === nextPrimaryTopicId
			);
			const targetPreviousAbsolutePath =
				this.resolveIndexedPointFilePath(targetEntry?.file)?.absolutePath || null;
			const { absolutePath: targetAbsolutePath } = await this.resolvePointFilePath(
				index,
				nextPrimaryTopicId,
				nextPrimaryTopicName
			);
			await this.renameTopicFileIfNeeded(targetPreviousAbsolutePath, targetAbsolutePath);
			const targetFileData = await this.readPointFile(
				targetAbsolutePath,
				nextPrimaryTopicId,
				nextPrimaryTopicName
			);
			const nextTargetPoints = targetFileData.points.filter(
				(point) => String(point?.id || "").trim() !== normalizedPointId
			);
			nextTargetPoints.push(nextPoint);
			await this.persistPointFileData(targetAbsolutePath, {
				...targetFileData,
				topicId: nextPrimaryTopicId,
				topicName: nextPrimaryTopicName,
				updatedAt: new Date().toISOString(),
				points: nextTargetPoints,
			});

			if (targetEntry) {
				targetEntry.file = targetAbsolutePath;
				targetEntry.topicName = nextPrimaryTopicName;
				targetEntry.pointCount = nextTargetPoints.length;
				targetEntry.updatedAt = new Date().toISOString();
			} else {
				index.files.push({
					topicId: nextPrimaryTopicId,
					topicName: nextPrimaryTopicName,
					file: targetAbsolutePath,
					pointCount: nextTargetPoints.length,
					updatedAt: new Date().toISOString(),
				});
			}
			await this.writePointFilesIndex(index);
			return true;
		}

		return false;
	}

	private getTopicFileBaseName(topicName: string): string {
		const safeBase = sanitizeForSync(topicName || DEFAULT_TOPIC_NAME, 80);
		return safeBase || sanitizeForSync(DEFAULT_TOPIC_NAME, 80) || "incremental-reading";
	}

	private buildTopicFileName(topicName: string, duplicateOrdinal = 1): string {
		const safeBase = this.getTopicFileBaseName(topicName);
		const readableBase = duplicateOrdinal > 1 ? `${safeBase}(${duplicateOrdinal})` : safeBase;
		return `${readableBase}${IR_DECK_FILE_EXTENSION}`;
	}

	private buildLegacyTopicFileName(topicName: string, suffix = "001"): string {
		const safeBase = this.getTopicFileBaseName(topicName);
		return `${safeBase}.points-${suffix}.json`;
	}

	private getPointFilesRootPrefix(): string {
		return `${normalizePath(this.getV2Paths().ir.root)}/`;
	}

	private getNormalizedLegacyPointRelativePath(relativePath: string | null | undefined): string | null {
		const normalized = normalizePath(String(relativePath || "").trim());
		if (!normalized) {
			return null;
		}
		if (normalized.startsWith("points/")) {
			return normalized;
		}
		const fileName = normalized.split("/").pop() || "";
		if (fileName.endsWith(IR_DECK_FILE_EXTENSION) || LEGACY_POINT_FILE_PATTERN.test(fileName)) {
			return `points/${fileName}`;
		}
		return null;
	}

	private isLegacyIndexedPointFilePath(path: string | null | undefined): boolean {
		const normalized = normalizePath(String(path || "").trim());
		if (!normalized) {
			return false;
		}
		if (normalized.startsWith(this.getPointFilesRootPrefix())) {
			return false;
		}
		return this.getNormalizedLegacyPointRelativePath(normalized) !== null;
	}

	private buildDefaultPointFileAbsolutePath(topicName: string, duplicateOrdinal = 1): string {
		return normalizePath(
			`${this.getPointsDir()}/${this.buildTopicFileName(topicName, duplicateOrdinal)}`
		);
	}

	private resolveIndexedPointFilePath(
		filePath: string | null | undefined
	): ResolvedPointFilePath | null {
		const normalized = normalizePath(String(filePath || "").trim());
		if (!normalized) {
			return null;
		}
		if (this.isLegacyIndexedPointFilePath(normalized)) {
			const legacyRelativePath = this.getNormalizedLegacyPointRelativePath(normalized);
			if (!legacyRelativePath) {
				return null;
			}
			const absolutePath = normalizePath(`${this.getV2Paths().ir.root}/${legacyRelativePath}`);
			return {
				absolutePath,
				relativePath: absolutePath,
				isLegacyRelative: true,
			};
		}
		return {
			absolutePath: normalized,
			relativePath: normalized,
			isLegacyRelative: false,
		};
	}

	private getPointFileOrdinal(index: IRPointFileIndex, topicId: string, topicName: string): number {
		const baseName = this.getTopicFileBaseName(topicName);
		const relatedTopicIds = new Set<string>();

		for (const entry of index.files || []) {
			const candidateTopicId = String(entry?.topicId || "").trim();
			if (!candidateTopicId) {
				continue;
			}
			const candidateTopicName =
				candidateTopicId === topicId
					? topicName
					: String(entry.topicName || "").trim() || DEFAULT_TOPIC_NAME;
			if (this.getTopicFileBaseName(candidateTopicName) === baseName) {
				relatedTopicIds.add(candidateTopicId);
			}
		}

		relatedTopicIds.add(topicId);
		return (
			Array.from(relatedTopicIds)
				.sort((left, right) => left.localeCompare(right, "zh-CN"))
				.indexOf(topicId) + 1
		);
	}

	private async resolveCanonicalPointFilePath(
		index: IRPointFileIndex,
		topicId: string,
		topicName: string
	): Promise<{ relativePath: string; absolutePath: string }> {
		const existingEntry = index.files.find((entry) => String(entry?.topicId || "").trim() === topicId);
		const existingResolved = this.resolveIndexedPointFilePath(existingEntry?.file);
		const targetDir =
			existingResolved?.absolutePath.split("/").slice(0, -1).join("/") || this.getPointsDir();
		let ordinal = Math.max(1, this.getPointFileOrdinal(index, topicId, topicName));

		while (true) {
			const absolutePath = normalizePath(`${targetDir}/${this.buildTopicFileName(topicName, ordinal)}`);
			const claimedByOther = (index.files || []).some(
				(entry) =>
					String(entry?.topicId || "").trim() !== topicId &&
					this.resolveIndexedPointFilePath(entry?.file)?.absolutePath === absolutePath
			);

			if (!claimedByOther) {
				return { relativePath: absolutePath, absolutePath };
			}

			ordinal += 1;
		}
	}

	private async findLegacyPointFilePath(topicName: string): Promise<string | null> {
		const pointsDir = this.getV2Paths().ir.pointsDir;
		if (!(await this.adapter.exists(pointsDir))) {
			return null;
		}
		const baseName = this.getTopicFileBaseName(topicName);
		const listing = await this.adapter.list(pointsDir);
		const legacyFilePath = listing.files
			.map((filePath) => normalizePath(filePath))
			.find((filePath) => {
				const fileName = filePath.split("/").pop() || "";
				return fileName.startsWith(`${baseName}.points-`) && LEGACY_POINT_FILE_PATTERN.test(fileName);
			});
		if (legacyFilePath) {
			return legacyFilePath;
		}

		const legacyRelativePath = `points/${this.buildLegacyTopicFileName(topicName)}`;
		const legacyAbsolutePath = normalizePath(`${this.getV2Paths().ir.root}/${legacyRelativePath}`);
		return (await this.adapter.exists(legacyAbsolutePath)) ? legacyAbsolutePath : null;
	}

	private async normalizePointFileNaming(): Promise<void> {
		const index = await this.loadPointFilesIndexSnapshot();
		if (!Array.isArray(index.files) || index.files.length === 0) {
			return;
		}

		let changed = false;

		for (const entry of index.files) {
			const topicId = String(entry?.topicId || "").trim();
			if (!topicId) {
				continue;
			}

			const topicName = String(entry.topicName || "").trim() || DEFAULT_TOPIC_NAME;
			const previousResolved = this.resolveIndexedPointFilePath(entry.file);
			const previousAbsolutePath = previousResolved?.absolutePath || null;
			const { relativePath, absolutePath } = await this.resolveCanonicalPointFilePath(
				index,
				topicId,
				topicName
			);

			if (previousAbsolutePath && previousAbsolutePath !== absolutePath) {
				await this.renameTopicFileIfNeeded(previousAbsolutePath, absolutePath);
				changed = true;
			} else if (!previousAbsolutePath || !(await this.adapter.exists(previousAbsolutePath))) {
				const legacyAbsolutePath = await this.findLegacyPointFilePath(topicName);
				if (legacyAbsolutePath && legacyAbsolutePath !== absolutePath) {
					await this.renameTopicFileIfNeeded(legacyAbsolutePath, absolutePath);
					changed = true;
				}
			}

			if (entry.file !== absolutePath) {
				entry.file = absolutePath;
				changed = true;
			}
			if (entry.topicName !== topicName) {
				entry.topicName = topicName;
				changed = true;
			}
		}

		if (changed) {
			await this.writePointFilesIndex({
				...index,
				updatedAt: new Date().toISOString(),
			});
		}
	}

	private async readChunkTags(chunkFilePath: string): Promise<string[]> {
		const normalizedPath = normalizePath(String(chunkFilePath || "").trim());
		if (!normalizedPath || !(await this.adapter.exists(normalizedPath))) {
			return [];
		}

		try {
			const content = await this.adapter.read(normalizedPath);
			const yaml = parseYAMLFromContent(content);
			const rawTags = yaml?.tags;
			if (Array.isArray(rawTags)) {
				return normalizeReadingTags(
					rawTags.map((tag) => String(tag || "").trim()).filter(Boolean)
				);
			}
			if (typeof rawTags === "string" && rawTags.trim()) {
				return normalizeReadingTags(
					rawTags
						.split(",")
						.map((tag) => tag.trim())
						.filter(Boolean)
				);
			}
		} catch (error) {
			logger.warn(`[IRPointStorageService] 读取 chunk 标签失败: ${normalizedPath}`, error);
		}

		return [];
	}

	private deriveChunkPointTitle(chunk: IRChunkFileData): string {
		const chunkMeta = chunk.meta as unknown as Record<string, unknown> | undefined;
		const metaTitle =
			typeof chunkMeta?.pointTitle === "string"
				? String(chunkMeta.pointTitle || "").trim()
				: "";
		if (metaTitle) {
			return metaTitle;
		}

		const normalizedPath = normalizePath(String(chunk.filePath || "").trim());
		const fileName = normalizedPath.split("/").pop() || chunk.chunkId || "未命名阅读点";
		return fileName.replace(/\.md$/i, "").replace(/^\d+_/, "") || chunk.chunkId || "未命名阅读点";
	}

	private async resolvePointFilePath(
		index: IRPointFileIndex,
		topicId: string,
		topicName: string
	): Promise<{ relativePath: string; absolutePath: string }> {
		const existing = index.files.find((item) => item.topicId === topicId);
		const canonical = await this.resolveCanonicalPointFilePath(index, topicId, topicName);
		if (existing) {
			if (existing.file !== canonical.absolutePath) {
				existing.file = canonical.absolutePath;
				existing.topicName = topicName;
			}
			return canonical;
		}

		return canonical;
	}

	private async renameTopicFileIfNeeded(
		previousAbsolutePath: string | null,
		nextAbsolutePath: string
	): Promise<void> {
		if (!previousAbsolutePath || previousAbsolutePath === nextAbsolutePath) {
			return;
		}
		if (!(await this.adapter.exists(previousAbsolutePath))) {
			return;
		}
		const raw = await this.adapter.read(previousAbsolutePath);
		await this.writeJson(nextAbsolutePath, JSON.parse(raw));
		await this.adapter.remove(previousAbsolutePath);
	}

	private async scanVaultForPointFiles(rootDir = ""): Promise<string[]> {
		const normalizedRoot = normalizePath(String(rootDir || "").trim());
		const listing = await this.adapter.list(normalizedRoot);
		const files: string[] = [];

		for (const filePath of listing.files || []) {
			const normalizedFile = normalizePath(filePath);
			const fileName = normalizedFile.split("/").pop() || "";
			if (
				fileName.endsWith(IR_DECK_FILE_EXTENSION) ||
				LEGACY_POINT_FILE_PATTERN.test(fileName)
			) {
				files.push(normalizedFile);
			}
		}

		for (const folderPath of listing.folders || []) {
			files.push(...(await this.scanVaultForPointFiles(folderPath)));
		}

		return files.sort((left, right) => left.localeCompare(right, "zh-CN"));
	}

	private buildPointFromLegacyInput(
		input: IRLegacyPointInput,
		materialId: string,
		source: IRPointSourceRecord,
		topicId: string,
		parameterContext: IRParameterContext,
		existingPoint?: IRPoint,
		options?: { preserveExisting?: boolean }
	): IRPoint {
		const inputTopicIds = normalizeStringArray(
			Array.isArray(input.topicIds) && input.topicIds.length > 0
				? input.topicIds
				: topicId
					? [topicId]
					: []
		);

		if (options?.preserveExisting && existingPoint) {
			const topicIds =
				inputTopicIds.length > 0
					? inputTopicIds
					: Array.isArray(existingPoint.relations.topicIds) &&
						  existingPoint.relations.topicIds.length > 0
						? [...existingPoint.relations.topicIds]
					: topicId
						? [topicId]
						: [];

			return {
				...existingPoint,
				materialId: existingPoint.materialId || materialId,
				source: this.hasEmbeddedPointSource(existingPoint)
					? existingPoint.source
					: this.buildPointSourceRecord({
							materialId: existingPoint.materialId || materialId,
							sourceType: source.type,
							sourcePath: source.path,
							title: source.title,
							existingSource: existingPoint.source,
							point: existingPoint,
					  }),
				parameterContext: existingPoint.parameterContext || parameterContext,
				relations: {
					...existingPoint.relations,
					topicIds,
				},
				audit:
					existingPoint.audit || {
						createdBy: "legacy-migration",
						origin: {
							type: input.sourceType,
							id: input.id,
						},
					},
			};
		}

		const now = new Date().toISOString();
		const createdAt = existingPoint?.timestamps.createdAt || toIsoString(input.createdAt) || now;
		const updatedAt = toIsoString(input.updatedAt) || existingPoint?.timestamps.updatedAt || createdAt;
		const lastInteractionAt =
			toIsoString(input.lastInteractionAt ?? input.stats?.lastInteractionAt) ||
			existingPoint?.timestamps.lastInteractionAt ||
			updatedAt;
		const readingTimeMs = toReadingTimeMs(input.stats);
		const linkedNotePaths =
			input.linkedNotePaths !== undefined
				? normalizeStringArray(input.linkedNotePaths)
				: normalizeStringArray(existingPoint?.relations.linkedNotePaths);
		const metadata: Record<string, unknown> = {
			...(existingPoint?.metadata || {}),
			...(input.metadata || {}),
		};
		if (typeof input.explicitTagGroupId === "string" && input.explicitTagGroupId.trim()) {
			metadata.tagGroupId = input.explicitTagGroupId.trim();
		}
		if (!metadata.tagGroupId) {
			delete metadata.tagGroupId;
		}

		return {
			id: input.id,
			pointType:
				input.pointType ||
				existingPoint?.pointType ||
				(input.sourceType === "epub-bookmark"
					? "chapter-entry"
					: input.sourceType === "ir-chunk"
						? "chunk-entry"
						: "selection-entry"),
			materialId,
			source: this.buildPointSourceRecord({
				materialId,
				sourceType: source.type,
				sourcePath: source.path,
				title: source.title,
				existingSource: existingPoint?.source,
				point: existingPoint,
			}),
			timestamps: {
				createdAt,
				updatedAt,
				lastInteractionAt,
			},
			trace: {
				locatorType: input.locatorType,
				locator: input.locator,
				traceState: existingPoint?.trace.traceState || "verified",
				traceConfidence:
					existingPoint?.trace.traceConfidence ??
					(input.sourceType === "epub-bookmark" ? 1 : 0.95),
				fallbackLocators: [...(existingPoint?.trace.fallbackLocators || [])],
				lastVerifiedAt: existingPoint?.trace.lastVerifiedAt || updatedAt,
				repairStrategy: existingPoint?.trace.repairStrategy,
			},
			parameterContext: existingPoint?.parameterContext || parameterContext,
			schedule: {
				status: input.status || existingPoint?.schedule.status || "new",
				priorityScore:
					input.priorityEff ??
					input.priorityUi ??
					existingPoint?.schedule.priorityScore ??
					0,
				manualPriority: input.priorityUi ?? existingPoint?.schedule.manualPriority ?? 0,
				nextReviewAt:
					toIsoString(input.nextRepDate) ?? existingPoint?.schedule.nextReviewAt ?? null,
				lastReviewedAt: existingPoint?.schedule.lastReviewedAt ?? null,
				intervalDays: input.intervalDays ?? existingPoint?.schedule.intervalDays ?? 0,
				snoozeUntil: existingPoint?.schedule.snoozeUntil ?? null,
				doneReason: existingPoint?.schedule.doneReason ?? null,
			},
			relations: {
				topicIds:
					inputTopicIds.length > 0
						? inputTopicIds
						: topicId
							? [topicId]
							: [...(existingPoint?.relations.topicIds || [])],
				parentPointId: existingPoint?.relations.parentPointId ?? null,
				linkedCardIds: [...(existingPoint?.relations.linkedCardIds || [])],
				linkedNotePaths,
			},
			userData: {
				title: input.title || existingPoint?.userData.title || input.id,
				note:
					input.note !== undefined ? input.note : existingPoint?.userData.note,
				tags:
					Array.isArray(input.tags)
						? normalizeStringArray(input.tags)
						: [...(existingPoint?.userData.tags || [])],
				isStarred:
					typeof input.isStarred === "boolean"
						? input.isStarred
						: Boolean(existingPoint?.userData.isStarred),
			},
			stats: {
				impressionCount:
					input.stats?.impressions ?? existingPoint?.stats.impressionCount ?? 0,
				reviewCount:
					input.stats?.reviewCount ??
					input.stats?.impressions ??
					existingPoint?.stats.reviewCount ??
					existingPoint?.stats.impressionCount ??
					0,
				extractCount: input.stats?.extracts ?? existingPoint?.stats.extractCount ?? 0,
				cardCreatedCount:
					input.stats?.cardsCreated ?? existingPoint?.stats.cardCreatedCount ?? 0,
				noteCreatedCount:
					input.stats?.notesWritten ?? existingPoint?.stats.noteCreatedCount ?? 0,
				totalReadingTimeMs:
					readingTimeMs ?? existingPoint?.stats.totalReadingTimeMs ?? 0,
			},
			audit:
				existingPoint?.audit || {
					createdBy: "legacy-migration",
					origin: {
						type: input.sourceType,
						id: input.id,
					},
				},
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
		};
	}

	async syncLegacyPoint(
		input: IRLegacyPointInput,
		options?: { preserveExisting?: boolean }
	): Promise<IRPoint> {
		await this.initialize();
		const legacyMaterials = await getLegacyMaterials(this.getLegacyReadApi());
		const index = await this.readPointFilesIndex();
		const topicId = input.topicId?.trim() || DEFAULT_TOPIC_ID;
		const topicName =
			(typeof input.topicName === "string" && input.topicName.trim()) ||
			(await this.resolveTopicNameFromCurrentState(topicId, index));
		const legacyMaterial = input.materialId ? legacyMaterials.get(input.materialId) : undefined;
		const previous = index.files.find((item) => item.topicId === topicId);
		const previousAbsolutePath = this.resolveIndexedPointFilePath(previous?.file)?.absolutePath || null;
		const { relativePath, absolutePath } = await this.resolvePointFilePath(index, topicId, topicName);
		await this.renameTopicFileIfNeeded(previousAbsolutePath, absolutePath);

		const fileData = await this.readPointFile(absolutePath, topicId, topicName);
		const nextPoints = [...fileData.points];
		const existingIndex = nextPoints.findIndex((item) => item.id === input.id);
		const existingPoint = existingIndex >= 0 ? nextPoints[existingIndex] : undefined;
		const materialId =
			String(existingPoint?.materialId || "").trim() ||
			String(input.materialId || "").trim() ||
			this.deriveMaterialId(input.sourceType, input.sourcePath, undefined);
		const source = this.buildPointSourceRecord({
			materialId,
			sourceType: input.sourceType,
			sourcePath: input.sourcePath,
			title: input.materialTitle || legacyMaterial?.title || input.title,
			existingSource: existingPoint?.source,
			legacyMaterial,
			point: existingPoint,
		});
		const parameterContext =
			existingPoint?.parameterContext ||
			this.buildParameterContext(this.inferMaterialClass(source.type, source.path));
		const point = this.buildPointFromLegacyInput(
			input,
			materialId,
			source,
			topicId,
			parameterContext,
			existingPoint,
			options
		);
		const pointIndex = nextPoints.findIndex((item) => item.id === point.id);
		if (pointIndex >= 0) {
			nextPoints[pointIndex] = point;
		} else {
			nextPoints.push(point);
		}

		const nowIso = new Date().toISOString();
		await this.persistPointFileData(absolutePath, {
			...fileData,
			topicId,
			topicName,
			updatedAt: nowIso,
			deck: this.normalizePointDeckRecord(
				fileData.deck && typeof fileData.deck === "object" ? fileData.deck : undefined,
				topicName,
				nowIso
			),
			points: nextPoints,
		} satisfies IRPointFileData);

		const entry = index.files.find((item) => item.topicId === topicId);
		if (entry) {
			entry.file = absolutePath;
			entry.topicName = topicName;
			entry.pointCount = nextPoints.length;
			entry.updatedAt = nowIso;
		} else {
			index.files.push({
				topicId,
				topicName,
				file: absolutePath,
				pointCount: nextPoints.length,
				updatedAt: nowIso,
			});
		}
		await this.writePointFilesIndex(index);

		return point;
	}

	async syncChunkPoint(
		chunk: IRChunkFileData,
		options?: {
			preserveExisting?: boolean;
			source?: IRSourceFileMeta | null;
			topicNamesById?: Map<string, string>;
		}
	): Promise<IRPoint> {
		await this.initialize();
		const normalizedChunk = normalizeChunkForRuntime({
			...chunk,
			chunkId:
				typeof chunk.chunkId === "string" && chunk.chunkId.trim()
					? chunk.chunkId
					: String((chunk as { id?: string }).id || ""),
		} as IRChunkFileData);
		if (!normalizedChunk.chunkId) {
			throw new Error("chunk 点缺少稳定 ID");
		}

		const topicIds = normalizeStringArray(normalizedChunk.topicIds || normalizedChunk.deckIds);
		const primaryTopicId = topicIds[0] || DEFAULT_TOPIC_ID;
		const topicName = await this.resolveTopicNameFromCurrentState(
			primaryTopicId,
			await this.readPointFilesIndex(),
			options?.topicNamesById
		);
		const source =
			options?.source ||
			(await getLegacySources(this.getLegacyReadApi())).get(
				String(normalizedChunk.sourceId || "").trim()
			) ||
			null;
		const sourcePath = normalizePath(
			String(source?.originalPath || source?.rawFilePath || normalizedChunk.filePath || "").trim()
		);
		const chunkMeta = (normalizedChunk.meta as unknown as Record<string, unknown> | undefined) || {};
		const linkedNotePaths = resolveAssociatedNotePaths({
			associatedNotePath:
				(typeof chunkMeta.primaryAssociatedNotePath === "string"
					? chunkMeta.primaryAssociatedNotePath
					: undefined) || normalizedChunk.meta?.associatedNotePath,
			associatedNotePaths: Array.isArray(chunkMeta.associatedNotePaths)
				? chunkMeta.associatedNotePaths
						.map((value) => (typeof value === "string" ? value : undefined))
						.filter((value): value is string => Boolean(value))
				: undefined,
		});
		const tags = await this.readChunkTags(normalizedChunk.filePath);
		const title = this.deriveChunkPointTitle(normalizedChunk);
		const rawStats =
			normalizedChunk.stats && isRecord(normalizedChunk.stats) ? normalizedChunk.stats : undefined;

		return await this.syncLegacyPoint(
			{
				id: normalizedChunk.chunkId,
				topicId: primaryTopicId,
				topicIds,
				topicName,
				title,
				materialTitle: source?.title || title,
				tags,
				status: normalizedChunk.scheduleStatus || "new",
				priorityUi:
					typeof normalizedChunk.priorityUi === "number"
						? normalizedChunk.priorityUi
						: undefined,
				priorityEff:
					typeof normalizedChunk.priorityEff === "number"
						? normalizedChunk.priorityEff
						: undefined,
				intervalDays:
					typeof normalizedChunk.intervalDays === "number"
						? normalizedChunk.intervalDays
						: undefined,
				nextRepDate:
					typeof normalizedChunk.nextRepDate === "number"
						? normalizedChunk.nextRepDate
						: undefined,
				createdAt:
					typeof normalizedChunk.createdAt === "number"
						? normalizedChunk.createdAt
						: undefined,
				updatedAt:
					typeof normalizedChunk.updatedAt === "number"
						? normalizedChunk.updatedAt
						: undefined,
				lastInteractionAt:
					rawStats && typeof rawStats.lastInteraction === "number"
						? rawStats.lastInteraction
						: undefined,
				sourceType: "ir-chunk",
				materialId:
					typeof normalizedChunk.sourceId === "string" && normalizedChunk.sourceId.trim()
						? normalizedChunk.sourceId
						: undefined,
				sourcePath,
				pointType: "chunk-entry",
				locatorType: "markdown-chunk",
				locator: {
					chunkId: normalizedChunk.chunkId,
					sourceId: normalizedChunk.sourceId,
					chunkFilePath: normalizedChunk.filePath,
					sourcePath,
				},
				note:
					typeof chunkMeta.notes === "string"
						? String(chunkMeta.notes || "")
						: undefined,
				isStarred: Boolean(normalizedChunk.favorite),
				linkedNotePaths,
				explicitTagGroupId:
					typeof source?.tagGroup === "string" ? source.tagGroup : undefined,
				stats: rawStats
					? {
							impressions:
								typeof rawStats.impressions === "number"
									? rawStats.impressions
									: undefined,
							reviewCount:
								typeof rawStats.impressions === "number"
									? rawStats.impressions
									: undefined,
							extracts:
								typeof rawStats.extracts === "number" ? rawStats.extracts : undefined,
							cardsCreated:
								typeof rawStats.cardsCreated === "number"
									? rawStats.cardsCreated
									: undefined,
							notesWritten:
								typeof rawStats.notesWritten === "number"
									? rawStats.notesWritten
									: undefined,
							totalReadingTimeSec:
								typeof rawStats.totalReadingTimeSec === "number"
									? rawStats.totalReadingTimeSec
									: undefined,
							lastInteractionAt:
								typeof rawStats.lastInteraction === "number"
									? rawStats.lastInteraction
									: undefined,
					  }
					: undefined,
				metadata: {
					sourceTitle: source?.title || title,
					chunkFilePath: normalizedChunk.filePath,
					sourcePath,
					rawFilePath:
						typeof source?.rawFilePath === "string" && source.rawFilePath.trim()
							? source.rawFilePath
							: undefined,
					indexFilePath:
						typeof source?.indexFilePath === "string" && source.indexFilePath.trim()
							? source.indexFilePath
							: undefined,
					sourceSequenceGroup:
						typeof chunkMeta.sourceSequenceGroup === "string" && chunkMeta.sourceSequenceGroup.trim()
							? chunkMeta.sourceSequenceGroup.trim()
							: undefined,
					sourceSequenceOrder:
						typeof chunkMeta.sourceSequenceOrder === "number" &&
						Number.isFinite(chunkMeta.sourceSequenceOrder)
							? chunkMeta.sourceSequenceOrder
							: undefined,
					sourceSequenceLocked:
						typeof chunkMeta.sourceSequenceLocked === "boolean"
							? chunkMeta.sourceSequenceLocked
							: undefined,
					sourceSequenceAnchorDateKey:
						typeof chunkMeta.sourceSequenceAnchorDateKey === "string" &&
						chunkMeta.sourceSequenceAnchorDateKey.trim()
							? chunkMeta.sourceSequenceAnchorDateKey.trim()
							: undefined,
					autoSubscribedAt:
						typeof chunkMeta.autoSubscribedAt === "string" && chunkMeta.autoSubscribedAt.trim()
							? chunkMeta.autoSubscribedAt.trim()
							: undefined,
					autoSubscribedFolderPath:
						typeof chunkMeta.autoSubscribedFolderPath === "string" &&
						chunkMeta.autoSubscribedFolderPath.trim()
							? chunkMeta.autoSubscribedFolderPath.trim()
							: undefined,
					autoSubscribedBadgeUntil:
						typeof chunkMeta.autoSubscribedBadgeUntil === "string" &&
						chunkMeta.autoSubscribedBadgeUntil.trim()
							? chunkMeta.autoSubscribedBadgeUntil.trim()
							: undefined,
					externalDocument: Boolean(chunkMeta.externalDocument) || undefined,
					pointTitle:
						typeof chunkMeta.pointTitle === "string" && chunkMeta.pointTitle.trim()
							? chunkMeta.pointTitle.trim()
							: undefined,
					resumeLink:
						typeof chunkMeta.resumeLink === "string" && chunkMeta.resumeLink.trim()
							? chunkMeta.resumeLink.trim()
							: undefined,
					canvasNodeId:
						typeof chunkMeta.canvasNodeId === "string" && chunkMeta.canvasNodeId.trim()
							? chunkMeta.canvasNodeId.trim()
							: undefined,
					canvasTextCandidates:
						Array.isArray(chunkMeta.canvasTextCandidates) && chunkMeta.canvasTextCandidates.length > 0
							? chunkMeta.canvasTextCandidates
									.map((value) => String(value || "").trim())
									.filter(Boolean)
							: undefined,
				},
			},
			{ preserveExisting: options?.preserveExisting }
		);
	}

	async deletePointByLegacyId(pointId: string): Promise<boolean> {
		await this.initialize();
		const index = await this.readPointFilesIndex();
		let deleted = false;

		for (const entry of index.files) {
			const absolutePath = this.resolveIndexedPointFilePath(entry.file)?.absolutePath;
			if (!absolutePath) {
				continue;
			}
			const fileData = await this.readPointFile(absolutePath, entry.topicId, entry.topicName);
			const nextPoints = fileData.points.filter((point) => point.id !== pointId);
			if (nextPoints.length === fileData.points.length) {
				continue;
			}

			deleted = true;
			entry.pointCount = nextPoints.length;
			entry.updatedAt = new Date().toISOString();
			await this.writeJson(absolutePath, {
				...fileData,
				points: nextPoints,
				updatedAt: new Date().toISOString(),
			});
		}

		if (deleted) {
			await this.writePointFilesIndex(index);
		}

		return deleted;
	}

	async saveReaderState(
		materialId: string,
		device: string,
		payload: Omit<IRReaderStateRecord, "schemaVersion" | "materialId" | "device" | "updatedAt">
	): Promise<void> {
		await this.initialize();
		const filePath = normalizePath(`${this.getReaderStateDir()}/${sanitizeForSync(materialId)}.${sanitizeForSync(device)}.json`);
		await this.writeJson(filePath, {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			materialId,
			device,
			updatedAt: new Date().toISOString(),
			...payload,
		} satisfies IRReaderStateRecord);
	}

	private async collectLegacyReaderStateFiles(): Promise<string[]> {
		const epubRoot = this.getV2Paths().ir.epub;
		const legacyFiles: string[] = [];

		const walk = async (dir: string): Promise<void> => {
			if (!(await this.adapter.exists(dir))) {
				return;
			}
			const listing = await this.adapter.list(dir);
			for (const file of listing.files || []) {
				const name = file.split("/").pop() || "";
				if (
					/^reader-settings.*\.json$/i.test(name) ||
					name === "concealed-texts.json" ||
					name === "state.json" ||
					name === "last-open-bookmark.json"
				) {
					legacyFiles.push(file);
				}
			}
			for (const folder of listing.folders || []) {
				await walk(folder);
			}
		};

		await walk(epubRoot);
		return legacyFiles.sort();
	}

	private getRelocatedReaderStatePath(legacyFile: string): string {
		const name = legacyFile.split("/").pop() || "state.json";
		const parentName = legacyFile.split("/").slice(-2, -1)[0] || "global";

		if (/^reader-settings.*\.json$/i.test(name)) {
			return normalizePath(`${this.getReaderStateDir()}/epub/${name}`);
		}

		if (name === "concealed-texts.json") {
			return normalizePath(
				`${this.getReaderArtifactsDir()}/epub/${sanitizeForSync(parentName)}/${name}`
			);
		}

		return normalizePath(
			`${this.getReaderStateDir()}/epub/${sanitizeForSync(parentName)}/${name}`
		);
	}

	private getLegacyBookmarkTaskPaths(): string[] {
		return [this.getV2Paths().ir.pdfBookmarkTasks, this.getV2Paths().ir.epubBookmarkTasks];
	}

	private getLegacyChunkStoragePaths(): string[] {
		return [this.getV2Paths().ir.chunks, this.getV2Paths().ir.sources, this.getV2Paths().ir.blocks];
	}

	private getLegacyTopicStorePaths(): string[] {
		return [this.getV2Paths().ir.legacyTopics, this.getV2Paths().ir.legacyDecks];
	}

	private getParentDir(path: string): string {
		const normalized = normalizePath(path);
		const lastSlash = normalized.lastIndexOf("/");
		return lastSlash > 0 ? normalized.slice(0, lastSlash) : "";
	}

	private async pruneEmptyLegacyReaderStateDirectories(legacyFile: string): Promise<void> {
		const epubRoot = normalizePath(this.getV2Paths().ir.epub);
		let currentDir = this.getParentDir(legacyFile);

		while (currentDir && currentDir.startsWith(epubRoot) && currentDir !== epubRoot) {
			try {
				const listing = await this.adapter.list(currentDir);
				if ((listing.files || []).length > 0 || (listing.folders || []).length > 0) {
					break;
				}

				await this.adapter.remove(currentDir);
				currentDir = this.getParentDir(currentDir);
			} catch {
				break;
			}
		}
	}

	private async collectMigratedPointIds(): Promise<Set<string>> {
		const index = await this.readPointFilesIndex();
		const migratedIds = new Set<string>();
		const seenFiles = new Set<string>();
		const pointFiles: Array<{ filePath: string; topicId: string; topicName: string }> = [];

		for (const entry of index.files || []) {
			const resolvedPath = this.resolveIndexedPointFilePath(entry?.file);
			if (!resolvedPath) {
				continue;
			}
			const filePath = resolvedPath.absolutePath;
			if (seenFiles.has(filePath) || !(await this.adapter.exists(filePath))) {
				continue;
			}
			seenFiles.add(filePath);
			pointFiles.push({
				filePath,
				topicId: String(entry?.topicId || "").trim() || DEFAULT_TOPIC_ID,
				topicName: String(entry?.topicName || "").trim() || DEFAULT_TOPIC_NAME,
			});
		}

		for (const filePath of await this.scanVaultForPointFiles()) {
			if (seenFiles.has(filePath)) {
				continue;
			}
			seenFiles.add(filePath);
			pointFiles.push({
				filePath,
				topicId: DEFAULT_TOPIC_ID,
				topicName: DEFAULT_TOPIC_NAME,
			});
		}

		for (const entry of pointFiles) {
			const fileData = await this.readPointFile(entry.filePath, entry.topicId, entry.topicName);
			for (const point of fileData.points || []) {
				for (const alias of this.collectMigratedLegacyIdsFromPoint(point)) {
					migratedIds.add(alias);
				}
			}
		}

		return migratedIds;
	}

	private collectMigratedLegacyIdsFromPoint(point: Partial<IRPoint> | null | undefined): string[] {
		if (!point) {
			return [];
		}

		const ids = new Set<string>();
		const pointId = String(point.id || "").trim();
		if (pointId) {
			ids.add(pointId);
		}

		const origin = isRecord(point.audit?.origin) ? point.audit.origin : null;
		const originId = String(origin?.id || "").trim();
		const originType = String(origin?.type || "").trim();
		if (
			originId &&
			(originType === "ir-chunk" ||
				originType === "chunk-point" ||
				originType === "legacy-block" ||
				originType === "pdf-bookmark" ||
				originType === "epub-bookmark")
		) {
			ids.add(originId);
		}

		const trace = isRecord(point.trace) ? point.trace : null;
		const locator = isRecord(trace?.locator) ? trace.locator : null;
		const chunkId = String(locator?.chunkId || "").trim();
		if (chunkId) {
			ids.add(chunkId);
		}

		return Array.from(ids);
	}

	private async relocateLegacyReaderStateFiles(): Promise<number> {
		const legacyFiles = await this.collectLegacyReaderStateFiles();
		let movedCount = 0;

		for (const legacyFile of legacyFiles) {
			const targetPath = this.getRelocatedReaderStatePath(legacyFile);
			const content = await this.adapter.read(legacyFile);
			await this.writeJson(targetPath, JSON.parse(content));
			movedCount += 1;
		}

		return movedCount;
	}

	async cleanupLegacyReaderStateFiles(): Promise<LegacyCleanupResult> {
		await this.initialize();
		const legacyFiles = await this.collectLegacyReaderStateFiles();
		const failures: IRLegacyMigrationIssue[] = [];
		let removedCount = 0;

		for (const legacyFile of legacyFiles) {
			const targetPath = this.getRelocatedReaderStatePath(legacyFile);
			if (!(await this.adapter.exists(targetPath))) {
				failures.push({
					id: legacyFile,
					type: "reader-state-cleanup",
					message: "对应插件本地状态文件不存在，已跳过删除旧同步文件",
				});
				continue;
			}

			try {
				await this.adapter.remove(legacyFile);
				removedCount += 1;
				await this.pruneEmptyLegacyReaderStateDirectories(legacyFile);
			} catch (error) {
				failures.push({
					id: legacyFile,
					type: "reader-state-cleanup",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			removedCount,
			failures,
		};
	}

	private async cleanupLegacyBookmarkTaskFiles(): Promise<LegacyCleanupResult> {
		await this.initialize();
		const existingPaths: string[] = [];
		for (const path of this.getLegacyBookmarkTaskPaths()) {
			if (await this.adapter.exists(path)) {
				existingPaths.push(path);
			}
		}

		if (existingPaths.length === 0) {
			return { removedCount: 0, failures: [] };
		}

		const inspection = await this.inspectMigrationStatus();
		const pendingLegacyTaskCount =
			inspection.pendingPdfTaskCount + inspection.pendingEpubTaskCount;
		if (pendingLegacyTaskCount > 0) {
			return {
				removedCount: 0,
				failures: [
					{
						id: "legacy-bookmark-cleanup",
						type: "bookmark-cleanup",
						message: `仍有 ${pendingLegacyTaskCount} 条旧书签任务未迁移，已保留旧书签文件`,
					},
				],
			};
		}

		const failures: IRLegacyMigrationIssue[] = [];
		let removedCount = 0;

		for (const path of existingPaths) {
			try {
				await this.adapter.remove(path);
				removedCount += 1;
			} catch (error) {
				failures.push({
					id: path,
					type: "bookmark-cleanup",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			removedCount,
			failures,
		};
	}

	private async listLegacyRegistryFiles(): Promise<string[]> {
		const existingPaths: string[] = [];
		for (const path of [this.getLegacyPointFilesIndexPath(), this.getLegacyScheduleProfilesPath()]) {
			if (await this.adapter.exists(path)) {
				existingPaths.push(path);
			}
		}
		return existingPaths;
	}

	private async cleanupLegacyRegistryFiles(): Promise<LegacyCleanupResult> {
		await this.initialize();
		const existingPaths = await this.listLegacyRegistryFiles();
		if (existingPaths.length === 0) {
			return { removedCount: 0, failures: [] };
		}

		const failures: IRLegacyMigrationIssue[] = [];
		let removedCount = 0;

		for (const path of existingPaths) {
			try {
				await this.adapter.remove(path);
				removedCount += 1;
			} catch (error) {
				failures.push({
					id: path,
					type: "registry-cleanup",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			removedCount,
			failures,
		};
	}

	private async listLegacyTopicStoreFiles(): Promise<string[]> {
		const existingPaths: string[] = [];
		for (const path of this.getLegacyTopicStorePaths()) {
			if (await this.adapter.exists(path)) {
				existingPaths.push(path);
			}
		}
		return existingPaths;
	}

	private async cleanupLegacyTopicStoreFiles(): Promise<LegacyCleanupResult> {
		await this.initialize();
		const existingPaths = await this.listLegacyTopicStoreFiles();
		if (existingPaths.length === 0) {
			return { removedCount: 0, failures: [] };
		}

		const pointDecks = await this.listPointDecks();
		if (Object.keys(pointDecks).length === 0) {
			return { removedCount: 0, failures: [] };
		}

		const inspection = await this.inspectMigrationStatus();
		if (
			inspection.pendingPdfTaskCount > 0 ||
			inspection.pendingEpubTaskCount > 0 ||
			inspection.pendingChunkPointCount > 0 ||
			inspection.pendingLegacyBlockCount > 0
		) {
			return {
				removedCount: 0,
				failures: [
					{
						id: "legacy-topic-store-cleanup",
						type: "topic-store-cleanup",
						message: `仍有 ${inspection.pendingChunkPointCount} 个旧 chunk 阅读点、${inspection.pendingLegacyBlockCount} 个旧 blocks 内容块、${inspection.pendingPdfTaskCount} 条 PDF 书签或 ${inspection.pendingEpubTaskCount} 条 EPUB 书签未迁移，已保留旧 topics/decks 文件`,
					},
				],
			};
		}

		const failures: IRLegacyMigrationIssue[] = [];
		let removedCount = 0;
		for (const path of existingPaths) {
			try {
				await this.adapter.remove(path);
				removedCount += 1;
			} catch (error) {
				failures.push({
					id: path,
					type: "topic-store-cleanup",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			removedCount,
			failures,
		};
	}

	private async cleanupLegacyChunkStorageFiles(): Promise<LegacyCleanupResult> {
		await this.initialize();
		const existingPaths: string[] = [];
		for (const path of this.getLegacyChunkStoragePaths()) {
			if (await this.adapter.exists(path)) {
				existingPaths.push(path);
			}
		}

		if (existingPaths.length === 0) {
			return { removedCount: 0, failures: [] };
		}

		const inspection = await this.inspectMigrationStatus();
		if (inspection.pendingChunkPointCount > 0 || inspection.pendingLegacyBlockCount > 0) {
			return {
				removedCount: 0,
				failures: [
					{
						id: "legacy-chunk-storage-cleanup",
						type: "chunk-storage-cleanup",
						message: `仍有 ${inspection.pendingChunkPointCount} 个旧 chunk 阅读点和 ${inspection.pendingLegacyBlockCount} 个旧 blocks 内容块未迁移，已保留 chunks/sources/blocks 文件`,
					},
				],
			};
		}

		const failures: IRLegacyMigrationIssue[] = [];
		let removedCount = 0;

		for (const path of existingPaths) {
			try {
				await this.adapter.remove(path);
				removedCount += 1;
			} catch (error) {
				failures.push({
					id: path,
					type: "chunk-storage-cleanup",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return {
			removedCount,
			failures,
		};
	}

	async inspectMigrationStatus(): Promise<MigrationInspection> {
		await this.initialize();
		const legacyReadApi = this.getLegacyReadApi();
		const [legacyChunks, legacyBlocks, { pdfStore, epubStore }] = await Promise.all([
			getLegacyChunkData(legacyReadApi),
			getLegacyBlocksData(legacyReadApi),
			readLegacyBookmarkTaskStores(legacyReadApi),
		]);
		const migratedPointIds = await this.collectMigratedPointIds();
		const materialPlan = await this.buildMaterialCleanupPlan();
		const pdfTasks = isRecord(pdfStore.tasks) ? Object.values(pdfStore.tasks) : [];
		const epubTasks = isRecord(epubStore.tasks) ? Object.values(epubStore.tasks) : [];
		const readerStateFiles = await this.collectLegacyReaderStateFiles();
		const legacyRegistryFiles = await this.listLegacyRegistryFiles();
		const pointDecks = await this.listPointDecks();
		const legacyTopicStoreFiles =
			Object.keys(pointDecks).length > 0 ? await this.listLegacyTopicStoreFiles() : [];
		let legacyChunkStorageFileCount = 0;
		const pendingItems: string[] = materialPlan.items.filter(
			(item) => !item.startsWith("阅读点溯源目标文件缺失 ")
		);
		let pendingPdfTasks = 0;
		let pendingEpubTasks = 0;
		let pendingChunkPoints = 0;
		let pendingLegacyBlocks = 0;
		let pendingReaderStateFiles = 0;

		for (const legacyPath of this.getLegacyChunkStoragePaths()) {
			if (await this.adapter.exists(legacyPath)) {
				legacyChunkStorageFileCount += 1;
			}
		}

		for (const task of pdfTasks) {
			if (!isRecord(task) || typeof task.id !== "string") {
				continue;
			}
			if (!migratedPointIds.has(task.id)) {
				pendingPdfTasks += 1;
			}
		}

		for (const task of epubTasks) {
			if (!isRecord(task) || typeof task.id !== "string") {
				continue;
			}
			if (!migratedPointIds.has(task.id)) {
				pendingEpubTasks += 1;
			}
		}

		for (const chunkId of legacyChunks.keys()) {
			if (!migratedPointIds.has(chunkId)) {
				pendingChunkPoints += 1;
			}
		}

		for (const blockId of legacyBlocks.keys()) {
			if (!migratedPointIds.has(blockId)) {
				pendingLegacyBlocks += 1;
			}
		}

		for (const legacyFile of readerStateFiles) {
			const targetPath = this.getRelocatedReaderStatePath(legacyFile);
			if (!(await this.adapter.exists(targetPath))) {
				pendingReaderStateFiles += 1;
			}
		}

		if (pendingPdfTasks > 0) {
			pendingItems.push(`旧 PDF 书签任务 ${pendingPdfTasks}`);
		}
		if (pendingEpubTasks > 0) {
			pendingItems.push(`旧 EPUB 书签任务 ${pendingEpubTasks}`);
		}
		if (pendingChunkPoints > 0) {
			pendingItems.push(`旧块阅读点 ${pendingChunkPoints}`);
		}
		if (pendingLegacyBlocks > 0) {
			pendingItems.push(`旧 blocks 内容块 ${pendingLegacyBlocks}`);
		}
		if (pendingReaderStateFiles > 0) {
			pendingItems.push(`旧阅读器状态文件 ${pendingReaderStateFiles}`);
		}
		if (legacyRegistryFiles.length > 0) {
			pendingItems.push(
				`旧同步目录 registry 文件 ${legacyRegistryFiles.length} 个已退出真源但仍残留在仓库目录`
			);
			pendingItems.push(...legacyRegistryFiles);
		}
		if (legacyTopicStoreFiles.length > 0) {
			pendingItems.push(
				`旧专题元数据文件 ${legacyTopicStoreFiles.length} 个已退出真源但仍残留在仓库目录`
			);
			pendingItems.push(...legacyTopicStoreFiles);
		}

		return {
			pendingCount:
				materialPlan.pendingEmbeddedSourceCount +
				pendingPdfTasks +
				pendingEpubTasks +
				pendingChunkPoints +
				pendingLegacyBlocks +
				materialPlan.legacyMaterialDescriptors.length +
				materialPlan.legacyMaterialsIndexFileCount +
				materialPlan.legacyMaterialsFileCount +
				materialPlan.emptyLegacyMaterialDirCount +
				legacyRegistryFiles.length +
				legacyTopicStoreFiles.length,
			pendingItems,
			legacyReaderStateCount: readerStateFiles.length,
			pendingReaderStateFileCount: pendingReaderStateFiles,
			legacyChunkStorageFileCount,
			legacyRegistryFileCount: legacyRegistryFiles.length,
			legacyTopicStoreFileCount: legacyTopicStoreFiles.length,
			pendingEmbeddedSourceCount: materialPlan.pendingEmbeddedSourceCount,
			pendingPdfTaskCount: pendingPdfTasks,
			pendingEpubTaskCount: pendingEpubTasks,
			pendingChunkPointCount: pendingChunkPoints,
			pendingLegacyBlockCount: pendingLegacyBlocks,
			legacyMaterialRecordFileCount: materialPlan.legacyMaterialDescriptors.length,
			legacyMaterialsIndexFileCount: materialPlan.legacyMaterialsIndexFileCount,
			legacyMaterialsFileCount: materialPlan.legacyMaterialsFileCount,
			emptyLegacyMaterialDirCount: materialPlan.emptyLegacyMaterialDirCount,
			missingEmbeddedSourceTargetCount: materialPlan.missingEmbeddedSourceTargetCount,
		};
	}

	private async migrateLegacyMaterialsOnly(issues: IRLegacyMigrationIssue[]): Promise<number> {
		const plan = await this.buildMaterialCleanupPlan();
		return await this.applyPointSourceBackfills(plan, issues);
	}

	private async migrateLegacyBlocks(
		issues: IRLegacyMigrationIssue[]
	): Promise<{ migratedPoints: number }> {
		const legacyReadApi = this.getLegacyReadApi();
		const legacyBlocks = await getLegacyBlocksData(legacyReadApi);
		if (legacyBlocks.size === 0) {
			return { migratedPoints: 0 };
		}

		const legacyDecks = await getLegacyDecks(legacyReadApi);
		const topicsMap = await getLegacyTopicsMap(legacyReadApi, DEFAULT_TOPIC_NAME);
		let migratedPoints = 0;

		for (const block of legacyBlocks.values()) {
			try {
				const topicIds = resolveLegacyBlockTopicIds(block, legacyDecks, DEFAULT_TOPIC_ID);
				const primaryTopicId = topicIds[0] || DEFAULT_TOPIC_ID;
				const topicName = resolveLegacyTopicName(primaryTopicId, topicsMap, DEFAULT_TOPIC_NAME);
				await this.syncLegacyPoint(
					{
						id: block.id,
						topicId: primaryTopicId,
						topicIds,
						topicName,
						title: deriveLegacyBlockTitle(block),
						tags: Array.isArray(block.tags) ? [...block.tags] : [],
						status: typeof block.state === "string" ? block.state : "new",
						priorityUi:
							typeof block.priorityUi === "number"
								? block.priorityUi
								: typeof block.priorityEff === "number"
									? block.priorityEff
									: undefined,
						priorityEff:
							typeof block.priorityEff === "number"
								? block.priorityEff
								: typeof block.priorityUi === "number"
									? block.priorityUi
									: undefined,
						intervalDays: typeof block.interval === "number" ? block.interval : undefined,
						nextRepDate:
							typeof block.nextReview === "string" && block.nextReview.trim()
								? Date.parse(block.nextReview)
								: undefined,
						createdAt:
							typeof block.createdAt === "string" && block.createdAt.trim()
								? Date.parse(block.createdAt)
								: undefined,
						updatedAt:
							typeof block.updatedAt === "string" && block.updatedAt.trim()
								? Date.parse(block.updatedAt)
								: undefined,
						lastInteractionAt:
							typeof block.lastReview === "string" && block.lastReview.trim()
								? Date.parse(block.lastReview)
								: undefined,
						sourceType: "legacy-block",
						sourcePath: normalizePath(String(block.filePath || "").trim()),
						pointType: "legacy-block-entry",
						locatorType: "markdown-block",
						locator: {
							filePath: normalizePath(String(block.filePath || "").trim()),
							sourcePath: normalizePath(String(block.filePath || "").trim()),
							headingPath: Array.isArray(block.headingPath) ? [...block.headingPath] : [],
							headingLevel:
								typeof block.headingLevel === "number" ? block.headingLevel : 1,
							startLine:
								typeof block.startLine === "number"
									? block.startLine
									: typeof block.blockIndex === "number"
										? block.blockIndex
										: 0,
							endLine:
								typeof block.endLine === "number"
									? block.endLine
									: typeof block.startLine === "number"
										? block.startLine
										: 0,
							contentPreview:
								typeof block.contentPreview === "string"
									? block.contentPreview
									: undefined,
						},
						note: typeof block.notes === "string" ? block.notes : undefined,
						isStarred: Boolean(block.favorite),
						linkedNotePaths: normalizeStringArray([
							(block as { primaryAssociatedNotePath?: string }).primaryAssociatedNotePath,
							(block as { associatedNotePath?: string }).associatedNotePath,
							...(((block as { associatedNotePaths?: string[] }).associatedNotePaths || []) as string[]),
						]),
						explicitTagGroupId:
							typeof block.tagGroupId === "string" ? block.tagGroupId : undefined,
						stats: {
							impressions:
								typeof block.reviewCount === "number" ? block.reviewCount : undefined,
							reviewCount:
								typeof block.reviewCount === "number" ? block.reviewCount : undefined,
							cardsCreated: Array.isArray(block.extractedCards)
								? block.extractedCards.length
								: undefined,
							totalReadingTimeSec:
								typeof block.totalReadingTime === "number"
									? block.totalReadingTime
									: undefined,
							lastInteractionAt:
								typeof block.lastReview === "string" && block.lastReview.trim()
									? Date.parse(block.lastReview)
									: undefined,
						},
						metadata: {
							headingPath: Array.isArray(block.headingPath) ? [...block.headingPath] : [],
							headingText:
								typeof block.headingText === "string"
									? block.headingText
									: deriveLegacyBlockTitle(block),
							headingLevel:
								typeof block.headingLevel === "number" ? block.headingLevel : 1,
							startLine:
								typeof block.startLine === "number"
									? block.startLine
									: typeof block.blockIndex === "number"
										? block.blockIndex
										: 0,
							endLine:
								typeof block.endLine === "number"
									? block.endLine
									: typeof block.startLine === "number"
										? block.startLine
										: 0,
							contentPreview:
								typeof block.contentPreview === "string"
									? block.contentPreview
									: undefined,
							tagGroupId:
								typeof block.tagGroupId === "string" ? block.tagGroupId : undefined,
							intervalFactor:
								typeof block.intervalFactor === "number"
									? block.intervalFactor
									: undefined,
						},
					},
					{ preserveExisting: true }
				);
				migratedPoints += 1;
			} catch (error) {
				issues.push({
					id: String(block.id || "legacy-block"),
					type: "legacy-block",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return { migratedPoints };
	}

	private async migrateLegacyTasks(
		issues: IRLegacyMigrationIssue[]
	): Promise<{ migratedPoints: number }> {
		const legacyReadApi = this.getLegacyReadApi();
		const [{ pdfStore, epubStore }, legacyChunks, legacySources, topicsMap] = await Promise.all([
			readLegacyBookmarkTaskStores(legacyReadApi),
			getLegacyChunkData(legacyReadApi),
			getLegacySources(legacyReadApi),
			getLegacyTopicsMap(legacyReadApi, DEFAULT_TOPIC_NAME),
		]);
		const topicNamesById = new Map(
			Array.from(topicsMap.entries()).map(([id, topic]) => [id, topic.name] as const)
		);
		const pdfTasks = isRecord(pdfStore.tasks) ? Object.values(pdfStore.tasks) : [];
		const epubTasks = isRecord(epubStore.tasks) ? Object.values(epubStore.tasks) : [];
		let migratedPoints = 0;

		for (const rawTask of pdfTasks) {
			if (!isRecord(rawTask) || typeof rawTask.id !== "string" || typeof rawTask.pdfPath !== "string") {
				continue;
			}
			try {
				const topicId =
					typeof rawTask.topicId === "string"
						? rawTask.topicId
						: typeof rawTask.deckId === "string"
							? rawTask.deckId
							: undefined;
				const rawMeta = isRecord(rawTask.meta) ? rawTask.meta : {};
				const rawStats = isRecord(rawTask.stats) ? rawTask.stats : null;
				await this.syncLegacyPoint({
					id: rawTask.id,
					topicId,
					topicName: topicId ? topicNamesById.get(topicId) : undefined,
					title: typeof rawTask.title === "string" ? rawTask.title : rawTask.id,
					tags: Array.isArray(rawTask.tags) ? rawTask.tags.filter((item): item is string => typeof item === "string") : [],
					status: typeof rawTask.status === "string" ? rawTask.status : "new",
					priorityUi: typeof rawTask.priorityUi === "number" ? rawTask.priorityUi : undefined,
					priorityEff: typeof rawTask.priorityEff === "number" ? rawTask.priorityEff : undefined,
					intervalDays: typeof rawTask.intervalDays === "number" ? rawTask.intervalDays : undefined,
					nextRepDate: typeof rawTask.nextRepDate === "number" ? rawTask.nextRepDate : undefined,
					createdAt: typeof rawTask.createdAt === "number" ? rawTask.createdAt : undefined,
					updatedAt: typeof rawTask.updatedAt === "number" ? rawTask.updatedAt : undefined,
					sourceType: "pdf-bookmark",
					materialId: typeof rawTask.materialId === "string" ? rawTask.materialId : undefined,
					sourcePath: rawTask.pdfPath,
					locatorType: "pdf-selection",
					locator: {
						link: rawTask.link,
						annotationId: rawTask.annotationId,
						pdfPath: rawTask.pdfPath,
					},
					note: undefined,
					isStarred: Boolean(rawTask.favorite),
					linkedNotePaths: normalizeStringArray(rawMeta.associatedNotePaths).length
						? normalizeStringArray(rawMeta.associatedNotePaths)
						: normalizeStringArray([
								rawMeta.primaryAssociatedNotePath,
								rawMeta.associatedNotePath,
							]),
					explicitTagGroupId:
						typeof rawMeta.tagGroup === "string" ? rawMeta.tagGroup : undefined,
					stats: rawStats
						? {
								impressions:
									typeof rawStats.impressions === "number"
										? rawStats.impressions
										: undefined,
								extracts:
									typeof rawStats.extracts === "number"
										? rawStats.extracts
										: undefined,
								cardsCreated:
									typeof rawStats.cardsCreated === "number"
										? rawStats.cardsCreated
										: undefined,
								notesWritten:
									typeof rawStats.notesWritten === "number"
										? rawStats.notesWritten
										: undefined,
								totalReadingTimeSec:
									typeof rawStats.totalReadingTimeSec === "number"
										? rawStats.totalReadingTimeSec
										: undefined,
								lastInteractionAt:
									typeof rawStats.lastInteraction === "number"
										? rawStats.lastInteraction
										: undefined,
						  }
						: undefined,
				}, { preserveExisting: true });
				migratedPoints += 1;
			} catch (error) {
				issues.push({
					id: String(rawTask.id || "pdf-task"),
					type: "pdf-bookmark",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		for (const rawTask of epubTasks) {
			if (!isRecord(rawTask) || typeof rawTask.id !== "string" || typeof rawTask.epubFilePath !== "string") {
				continue;
			}
			try {
				const topicId =
					typeof rawTask.topicId === "string"
						? rawTask.topicId
						: typeof rawTask.deckId === "string"
							? rawTask.deckId
							: undefined;
				const rawMeta = isRecord(rawTask.meta) ? rawTask.meta : {};
				const rawStats = isRecord(rawTask.stats) ? rawTask.stats : null;
				await this.syncLegacyPoint({
					id: rawTask.id,
					topicId,
					topicName: topicId ? topicNamesById.get(topicId) : undefined,
					title: typeof rawTask.title === "string" ? rawTask.title : rawTask.id,
					tags: Array.isArray(rawTask.tags) ? rawTask.tags.filter((item): item is string => typeof item === "string") : [],
					status: typeof rawTask.status === "string" ? rawTask.status : "new",
					priorityUi: typeof rawTask.priorityUi === "number" ? rawTask.priorityUi : undefined,
					priorityEff: typeof rawTask.priorityEff === "number" ? rawTask.priorityEff : undefined,
					intervalDays: typeof rawTask.intervalDays === "number" ? rawTask.intervalDays : undefined,
					nextRepDate: typeof rawTask.nextRepDate === "number" ? rawTask.nextRepDate : undefined,
					createdAt: typeof rawTask.createdAt === "number" ? rawTask.createdAt : undefined,
					updatedAt: typeof rawTask.updatedAt === "number" ? rawTask.updatedAt : undefined,
					lastInteractionAt: typeof rawTask.resumeUpdatedAt === "number" ? rawTask.resumeUpdatedAt : undefined,
					sourceType: "epub-bookmark",
					sourcePath: rawTask.epubFilePath,
					materialId: typeof rawTask.sourceId === "string" ? rawTask.sourceId : undefined,
					locatorType: "epub-chapter",
					locator: {
						tocHref: rawTask.tocHref,
						tocLevel: rawTask.tocLevel,
						resumeCfi: rawTask.resumeCfi,
					},
					note: undefined,
					isStarred: false,
					linkedNotePaths: normalizeStringArray(rawMeta.associatedNotePaths).length
						? normalizeStringArray(rawMeta.associatedNotePaths)
						: normalizeStringArray([
								rawMeta.primaryAssociatedNotePath,
								rawMeta.associatedNotePath,
							]),
					explicitTagGroupId:
						typeof rawMeta.tagGroup === "string" ? rawMeta.tagGroup : undefined,
					stats: rawStats
						? {
								impressions:
									typeof rawStats.impressions === "number"
										? rawStats.impressions
										: undefined,
								extracts:
									typeof rawStats.extracts === "number"
										? rawStats.extracts
										: undefined,
								cardsCreated:
									typeof rawStats.cardsCreated === "number"
										? rawStats.cardsCreated
										: undefined,
								notesWritten:
									typeof rawStats.notesWritten === "number"
										? rawStats.notesWritten
										: undefined,
								totalReadingTimeSec:
									typeof rawStats.totalReadingTimeSec === "number"
										? rawStats.totalReadingTimeSec
										: undefined,
								lastInteractionAt:
									typeof rawTask.resumeUpdatedAt === "number"
										? rawTask.resumeUpdatedAt
										: typeof rawStats.lastInteraction === "number"
											? rawStats.lastInteraction
											: undefined,
						  }
						: undefined,
				}, { preserveExisting: true });
				migratedPoints += 1;
			} catch (error) {
				issues.push({
					id: String(rawTask.id || "epub-task"),
					type: "epub-bookmark",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		for (const chunk of legacyChunks.values()) {
			try {
				await this.syncChunkPoint(chunk, {
					preserveExisting: true,
					source: legacySources.get(String(chunk.sourceId || "").trim()) || null,
					topicNamesById,
				});
				migratedPoints += 1;
			} catch (error) {
				issues.push({
					id: String(chunk.chunkId || "chunk-point"),
					type: "chunk-point",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return { migratedPoints };
	}

	async executeMigration(
		options: MigrationExecutionOptions = {}
	): Promise<IRPointStorageMigrationReport> {
		await this.initialize();
		const issues: IRLegacyMigrationIssue[] = [];
		const migratedMaterials = await this.migrateLegacyMaterialsOnly(issues);
		const { migratedPoints: migratedLegacyBlocks } = await this.migrateLegacyBlocks(issues);
		const { migratedPoints: migratedLegacyTasks } = await this.migrateLegacyTasks(issues);
		const migratedPoints = migratedLegacyBlocks + migratedLegacyTasks;
		const migratedReaderStateFiles = await this.relocateLegacyReaderStateFiles();
		let removedLegacyReaderStateFiles = 0;
		let removedLegacyBookmarkTaskFiles = 0;
		let removedLegacyChunkStorageFiles = 0;
		let removedLegacyMaterialRecordFiles = 0;
		let removedLegacyMaterialsIndexCount = 0;
		let removedLegacyMaterialsFileCount = 0;
		let removedEmptyLegacyMaterialDirs = 0;
		let removedLegacyRegistryFiles = 0;
		let removedLegacyTopicStoreFiles = 0;

		if (options.cleanupLegacyReaderStateFiles) {
			const cleanup = await this.cleanupLegacyReaderStateFiles();
			removedLegacyReaderStateFiles = cleanup.removedCount;
			issues.push(...cleanup.failures);
		}

		if (options.cleanupLegacyBookmarkTaskFiles) {
			const cleanup = await this.cleanupLegacyBookmarkTaskFiles();
			removedLegacyBookmarkTaskFiles = cleanup.removedCount;
			issues.push(...cleanup.failures);
		}

		if (options.cleanupLegacyChunkStorageFiles) {
			const cleanup = await this.cleanupLegacyChunkStorageFiles();
			removedLegacyChunkStorageFiles = cleanup.removedCount;
			issues.push(...cleanup.failures);
		}

		if (options.cleanupLegacyMaterialFiles) {
			const cleanup = await this.cleanupMaterialStorageResidue({
				removeMissingTargetPoints: false,
				reportMissingTargetFailures: false,
				blockLegacyCleanupOnMissingTargets: false,
			});
			removedLegacyMaterialRecordFiles = cleanup.removedLegacyMaterialRecordCount;
			removedLegacyMaterialsIndexCount = cleanup.removedLegacyMaterialsIndexCount;
			removedLegacyMaterialsFileCount = cleanup.removedLegacyMaterialsFileCount;
			removedEmptyLegacyMaterialDirs = cleanup.removedEmptyLegacyMaterialDirCount;
			issues.push(...cleanup.failures);
		}

		if (options.cleanupLegacyRegistryFiles) {
			const cleanup = await this.cleanupLegacyRegistryFiles();
			removedLegacyRegistryFiles = cleanup.removedCount;
			issues.push(...cleanup.failures);
		}

		if (options.cleanupLegacyTopicStoreFiles !== false) {
			const cleanup = await this.cleanupLegacyTopicStoreFiles();
			removedLegacyTopicStoreFiles = cleanup.removedCount;
			issues.push(...cleanup.failures);
		}

		await DirectoryUtils.pruneEmptyDirsUnder(this.adapter as any, this.getV2Paths().ir.root, {
			preserveRoot: true,
		});

		const report: IRPointStorageMigrationReport = {
			status: issues.length > 0 ? "failed" : "completed",
			summary: {
				structureVersion: IR_POINT_STORAGE_VERSION,
				targetRoot: this.getV2Paths().ir.root,
				migratedMaterials,
				migratedPoints,
				migratedReaderStateFiles,
				removedLegacyReaderStateFiles,
				removedLegacyBookmarkTaskFiles,
				removedLegacyChunkStorageFiles,
				removedLegacyMaterialRecordFiles,
				removedLegacyMaterialsIndexCount,
				removedLegacyMaterialsFileCount,
				removedEmptyLegacyMaterialDirs,
				removedLegacyRegistryFiles,
				removedLegacyTopicStoreFiles,
				failures: issues,
				completedAt: new Date().toISOString(),
			},
		};

		await this.writeJson(this.getMigrationReportPath(), report);
		return report;
	}

	async getLatestMigrationReport(): Promise<IRPointStorageMigrationReport | null> {
		await this.initialize();
		return this.readJson<IRPointStorageMigrationReport | null>(this.getMigrationReportPath(), null);
	}
}
