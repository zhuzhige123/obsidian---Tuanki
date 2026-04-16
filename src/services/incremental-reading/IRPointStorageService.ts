import { App, normalizePath } from "obsidian";
import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import { safeReadJson, safeWriteJson } from "../../utils/safe-json-io";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import type { ReadingMaterial, ReadingMaterialsIndex } from "../../types/incremental-reading-types";
import type {
	IRLegacyMigrationIssue,
	IRLegacyPointInput,
	IRMaterialRecord,
	IRMaterialsIndex,
	IRParameterContext,
	IRPoint,
	IRPointFileData,
	IRPointFileIndex,
	IRPointStorageMigrationReport,
	IRReaderStateRecord,
	IRScheduleProfile,
	IRScheduleProfilesStore,
} from "../../types/ir-point-storage-types";
import { IR_POINT_STORAGE_VERSION } from "../../types/ir-point-storage-types";

type AdapterLike = App["vault"]["adapter"];

type LegacyTopicRecord = {
	id: string;
	name: string;
};

type MigrationInspection = {
	pendingCount: number;
	pendingItems: string[];
	legacyReaderStateCount: number;
};

const DEFAULT_TOPIC_ID = "ungrouped-ir";
const DEFAULT_TOPIC_NAME = "未归类增量阅读";
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

const BUILTIN_SCHEDULE_PROFILES: IRScheduleProfile[] = [
	{
		id: "profile-academic-book",
		label: "学术书籍",
		materialClass: "academic-book",
		source: "builtin",
		weights: {
			importance: 1.1,
			continuity: 1.2,
			urgency: 1,
		},
	},
	{
		id: "profile-academic-paper",
		label: "学术论文",
		materialClass: "academic-paper",
		source: "builtin",
		weights: {
			importance: 1.25,
			continuity: 1.15,
			difficultyPenalty: 0.8,
		},
	},
	{
		id: "profile-reference-note",
		label: "参考资料",
		materialClass: "reference-note",
		source: "builtin",
		weights: {
			importance: 0.95,
			urgency: 0.8,
			staleness: 0.7,
		},
	},
];

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

export class IRPointStorageService {
	private readonly app: App;
	private readonly adapter: AdapterLike;
	private initialized = false;

	constructor(app: App) {
		this.app = app;
		this.adapter = app.vault.adapter;
	}

	private getV2Paths() {
		return getV2PathsFromApp(this.app as any);
	}

	private getPluginPaths() {
		return getPluginPaths(this.app as any);
	}

	private getMigrationReportPath(): string {
		return `${this.getPluginPaths().migration.root}/ir-point-storage-migration-report.json`;
	}

	private getRegistryDir(): string {
		return this.getV2Paths().ir.registry;
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
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getRegistryDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getPointsDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getMaterialsDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getReaderStateDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getReaderArtifactsDir()),
			DirectoryUtils.ensureDirRecursive(this.adapter as any, this.getPluginPaths().migration.root),
		]);

		await Promise.all([
			this.ensureFile(
				this.getV2Paths().ir.materialsIndex,
				JSON.stringify(MATERIALS_INDEX_DEFAULT, null, 2)
			),
			this.ensureFile(
				this.getV2Paths().ir.pointFilesIndex,
				JSON.stringify(POINT_FILES_INDEX_DEFAULT, null, 2)
			),
			this.ensureFile(
				this.getV2Paths().ir.scheduleProfiles,
				JSON.stringify(
					{
						schemaVersion: IR_POINT_STORAGE_VERSION,
						updatedAt: new Date().toISOString(),
						profiles: BUILTIN_SCHEDULE_PROFILES,
					} satisfies IRScheduleProfilesStore,
					null,
					2
				)
			),
		]);

		this.initialized = true;
	}

	private inferMaterialClass(sourceType: string, sourcePath: string): string {
		const normalizedPath = normalizePath(sourcePath || "").toLowerCase();
		if (sourceType === "pdf-bookmark") {
			return "academic-paper";
		}
		if (sourceType === "epub-bookmark") {
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

	private async writeMaterialsIndex(index: IRMaterialsIndex): Promise<void> {
		await this.writeJson(this.getV2Paths().ir.materialsIndex, {
			...index,
			updatedAt: new Date().toISOString(),
		});
	}

	private async readPointFilesIndex(): Promise<IRPointFileIndex> {
		await this.initialize();
		return this.readJson(this.getV2Paths().ir.pointFilesIndex, POINT_FILES_INDEX_DEFAULT);
	}

	private async writePointFilesIndex(index: IRPointFileIndex): Promise<void> {
		await this.writeJson(this.getV2Paths().ir.pointFilesIndex, {
			...index,
			updatedAt: new Date().toISOString(),
		});
	}

	private async readPointFile(path: string, topicId: string, topicName: string): Promise<IRPointFileData> {
		const fallback: IRPointFileData = {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			topicId,
			topicName,
			updatedAt: new Date(0).toISOString(),
			points: [],
		};
		return this.readJson(path, fallback);
	}

	private buildTopicFileName(topicName: string, suffix = "001"): string {
		const safeBase = sanitizeForSync(topicName || DEFAULT_TOPIC_NAME, 80);
		return `${safeBase}.points-${suffix}.json`;
	}

	private async getLegacyTopicsMap(): Promise<Map<string, LegacyTopicRecord>> {
		const topicsFile = await this.readJson<Record<string, unknown>>(
			this.getV2Paths().ir.topics,
			{} as Record<string, unknown>
		);
		const topicsRoot = isRecord(topicsFile) && isRecord(topicsFile.topics) ? topicsFile.topics : {};
		const map = new Map<string, LegacyTopicRecord>();

		for (const [topicId, value] of Object.entries(topicsRoot)) {
			if (!isRecord(value)) {
				continue;
			}
			map.set(topicId, {
				id: topicId,
				name:
					(typeof value.name === "string" && value.name.trim()) || topicId || DEFAULT_TOPIC_NAME,
			});
		}

		return map;
	}

	private async getLegacyMaterials(): Promise<Map<string, ReadingMaterial>> {
		const legacyIndex = await this.readJson<ReadingMaterialsIndex>(
			this.getV2Paths().ir.materials.index,
			{ version: "1.0.0", lastUpdated: "", materials: {} }
		);
		return new Map(Object.entries(legacyIndex.materials || {}));
	}

	private async upsertMaterialRecord(input: {
		materialId?: string;
		sourceType: string;
		sourcePath: string;
		title: string;
		legacyMaterial?: ReadingMaterial;
	}): Promise<string> {
		await this.initialize();

		const materialId = this.deriveMaterialId(input.sourceType, input.sourcePath, input.materialId);
		const materialClass = this.inferMaterialClass(input.sourceType, input.sourcePath);
		const fileName = `${sanitizeForSync(materialId, 100)}.material.json`;
		const filePath = normalizePath(`${this.getMaterialsDir()}/${fileName}`);
		const now = new Date().toISOString();
		const current = await this.readJson<IRMaterialRecord | null>(filePath, null);
		const parameterContext = current?.defaultParameterContext || this.buildParameterContext(materialClass);
		const record: IRMaterialRecord = {
			schemaVersion: IR_POINT_STORAGE_VERSION,
			id: materialId,
			createdAt: current?.createdAt || toIsoString(input.legacyMaterial?.created) || now,
			updatedAt: now,
			source: {
				type:
					input.sourceType === "epub-bookmark"
						? "epub"
						: input.sourceType === "pdf-bookmark"
							? "pdf"
							: "file",
				path: input.sourcePath,
			},
			bibliography: {
				title: input.title,
			},
			contentStorage: {
				mode: "external-source",
				ownedByPlugin: false,
			},
			defaultParameterContext: parameterContext,
			metadata: {
				status: "active",
			},
		};

		await this.writeJson(filePath, record);

		const index = await this.readMaterialsIndex();
		const entry = index.materials.find((item) => item.id === materialId);
		if (entry) {
			entry.type = record.source.type;
			entry.file = `materials/${fileName}`;
			entry.status = "active";
		} else {
			index.materials.push({
				id: materialId,
				type: record.source.type,
				file: `materials/${fileName}`,
				status: "active",
			});
		}
		await this.writeMaterialsIndex(index);

		return materialId;
	}

	private resolveTopicName(
		topicId: string | undefined,
		topicsMap: Map<string, LegacyTopicRecord>
	): string {
		if (topicId && topicsMap.has(topicId)) {
			return topicsMap.get(topicId)?.name || DEFAULT_TOPIC_NAME;
		}
		return topicId || DEFAULT_TOPIC_NAME;
	}

	private resolvePointFilePath(
		index: IRPointFileIndex,
		topicId: string,
		topicName: string
	): { relativePath: string; absolutePath: string } {
		const existing = index.files.find((item) => item.topicId === topicId);
		if (existing) {
			const desiredRelative = `points/${this.buildTopicFileName(topicName)}`;
			if (existing.file !== desiredRelative) {
				existing.file = desiredRelative;
				existing.topicName = topicName;
			}
			return {
				relativePath: existing.file,
				absolutePath: normalizePath(`${this.getV2Paths().ir.root}/${existing.file}`),
			};
		}

		const relativePath = `points/${this.buildTopicFileName(topicName)}`;
		return {
			relativePath,
			absolutePath: normalizePath(`${this.getV2Paths().ir.root}/${relativePath}`),
		};
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

	private buildPointFromLegacyInput(
		input: IRLegacyPointInput,
		materialId: string,
		topicId: string,
		parameterContext: IRParameterContext
	): IRPoint {
		const now = new Date().toISOString();
		const createdAt = toIsoString(input.createdAt) || now;
		const updatedAt = toIsoString(input.updatedAt) || createdAt;
		return {
			id: input.id,
			pointType: input.sourceType === "epub-bookmark" ? "chapter-entry" : "selection-entry",
			materialId,
			timestamps: {
				createdAt,
				updatedAt,
				lastInteractionAt: toIsoString(input.lastInteractionAt) || updatedAt,
			},
			trace: {
				locatorType: input.locatorType,
				locator: input.locator,
				traceState: "verified",
				traceConfidence: input.sourceType === "epub-bookmark" ? 1 : 0.95,
				fallbackLocators: [],
				lastVerifiedAt: updatedAt,
			},
			parameterContext,
			schedule: {
				status: input.status,
				priorityScore: input.priorityEff ?? input.priorityUi ?? 0,
				manualPriority: input.priorityUi ?? 0,
				nextReviewAt: toIsoString(input.nextRepDate) || null,
				lastReviewedAt: null,
				intervalDays: input.intervalDays ?? 0,
				snoozeUntil: null,
				doneReason: null,
			},
			relations: {
				topicIds: [topicId],
				parentPointId: null,
				linkedCardIds: [],
				linkedNotePaths: [],
			},
			userData: {
				title: input.title,
				note: input.note,
				tags: Array.isArray(input.tags) ? [...input.tags] : [],
				isStarred: Boolean(input.isStarred),
			},
			stats: {
				impressionCount: 0,
				reviewCount: 0,
				extractCount: 0,
				cardCreatedCount: 0,
				noteCreatedCount: 0,
				totalReadingTimeMs: 0,
			},
			audit: {
				createdBy: "legacy-migration",
				origin: {
					type: input.sourceType,
					id: input.id,
				},
			},
		};
	}

	async syncLegacyPoint(input: IRLegacyPointInput): Promise<IRPoint> {
		await this.initialize();
		const topicsMap = await this.getLegacyTopicsMap();
		const legacyMaterials = await this.getLegacyMaterials();
		const topicId = input.topicId?.trim() || DEFAULT_TOPIC_ID;
		const topicName = this.resolveTopicName(topicId, topicsMap);
		const legacyMaterial = input.materialId ? legacyMaterials.get(input.materialId) : undefined;
		const materialId = await this.upsertMaterialRecord({
			materialId: input.materialId,
			sourceType: input.sourceType,
			sourcePath: input.sourcePath,
			title: legacyMaterial?.title || input.title,
			legacyMaterial,
		});

		const materialFile = await this.readJson<IRMaterialRecord | null>(
			normalizePath(`${this.getMaterialsDir()}/${sanitizeForSync(materialId, 100)}.material.json`),
			null
		);
		const parameterContext =
			materialFile?.defaultParameterContext ||
			this.buildParameterContext(this.inferMaterialClass(input.sourceType, input.sourcePath));
		const point = this.buildPointFromLegacyInput(input, materialId, topicId, parameterContext);

		const index = await this.readPointFilesIndex();
		const previous = index.files.find((item) => item.topicId === topicId);
		const previousAbsolutePath = previous
			? normalizePath(`${this.getV2Paths().ir.root}/${previous.file}`)
			: null;
		const { relativePath, absolutePath } = this.resolvePointFilePath(index, topicId, topicName);
		await this.renameTopicFileIfNeeded(previousAbsolutePath, absolutePath);

		const fileData = await this.readPointFile(absolutePath, topicId, topicName);
		const nextPoints = [...fileData.points];
		const existingIndex = nextPoints.findIndex((item) => item.id === point.id);
		if (existingIndex >= 0) {
			nextPoints[existingIndex] = point;
		} else {
			nextPoints.push(point);
		}

		await this.writeJson(absolutePath, {
			...fileData,
			topicId,
			topicName,
			updatedAt: new Date().toISOString(),
			points: nextPoints,
		} satisfies IRPointFileData);

		const entry = index.files.find((item) => item.topicId === topicId);
		if (entry) {
			entry.file = relativePath;
			entry.topicName = topicName;
			entry.pointCount = nextPoints.length;
			entry.updatedAt = new Date().toISOString();
		} else {
			index.files.push({
				topicId,
				topicName,
				file: relativePath,
				pointCount: nextPoints.length,
				updatedAt: new Date().toISOString(),
			});
		}
		await this.writePointFilesIndex(index);

		return point;
	}

	async deletePointByLegacyId(pointId: string): Promise<boolean> {
		await this.initialize();
		const index = await this.readPointFilesIndex();
		let deleted = false;

		for (const entry of index.files) {
			const absolutePath = normalizePath(`${this.getV2Paths().ir.root}/${entry.file}`);
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

	private async relocateLegacyReaderStateFiles(): Promise<number> {
		const legacyFiles = await this.collectLegacyReaderStateFiles();
		let movedCount = 0;

		for (const legacyFile of legacyFiles) {
			const name = legacyFile.split("/").pop() || "state.json";
			const parentName = legacyFile.split("/").slice(-2, -1)[0] || "global";
			const targetPath = /^reader-settings.*\.json$/i.test(name)
				? normalizePath(`${this.getReaderStateDir()}/epub/${name}`)
				: name === "concealed-texts.json"
					? normalizePath(
							`${this.getReaderArtifactsDir()}/epub/${sanitizeForSync(parentName)}/${name}`
					  )
					: normalizePath(
							`${this.getReaderStateDir()}/epub/${sanitizeForSync(parentName)}/${name}`
					  );
			const content = await this.adapter.read(legacyFile);
			await this.writeJson(targetPath, JSON.parse(content));
			movedCount += 1;
		}

		return movedCount;
	}

	async inspectMigrationStatus(): Promise<MigrationInspection> {
		await this.initialize();
		const legacyMaterials = await this.getLegacyMaterials();
		const pdfStore = await this.readJson<Record<string, unknown>>(this.getV2Paths().ir.pdfBookmarkTasks, {});
		const epubStore = await this.readJson<Record<string, unknown>>(this.getV2Paths().ir.epubBookmarkTasks, {});
		const pdfTasks = isRecord(pdfStore.tasks) ? Object.keys(pdfStore.tasks).length : 0;
		const epubTasks = isRecord(epubStore.tasks) ? Object.keys(epubStore.tasks).length : 0;
		const readerStateFiles = await this.collectLegacyReaderStateFiles();
		const pendingItems: string[] = [];

		if (legacyMaterials.size > 0) {
			pendingItems.push(`旧阅读材料 ${legacyMaterials.size}`);
		}
		if (pdfTasks > 0) {
			pendingItems.push(`旧 PDF 书签任务 ${pdfTasks}`);
		}
		if (epubTasks > 0) {
			pendingItems.push(`旧 EPUB 书签任务 ${epubTasks}`);
		}
		if (readerStateFiles.length > 0) {
			pendingItems.push(`旧阅读器状态文件 ${readerStateFiles.length}`);
		}

		return {
			pendingCount: legacyMaterials.size + pdfTasks + epubTasks,
			pendingItems,
			legacyReaderStateCount: readerStateFiles.length,
		};
	}

	private async migrateLegacyMaterialsOnly(issues: IRLegacyMigrationIssue[]): Promise<number> {
		const legacyMaterials = await this.getLegacyMaterials();
		let migrated = 0;

		for (const material of legacyMaterials.values()) {
			try {
				await this.upsertMaterialRecord({
					materialId: material.uuid,
					sourceType: normalizePath(material.filePath || "").toLowerCase().endsWith(".epub")
						? "epub-bookmark"
						: normalizePath(material.filePath || "").toLowerCase().endsWith(".pdf")
							? "pdf-bookmark"
							: "legacy-material",
					sourcePath: material.filePath,
					title: material.title,
					legacyMaterial: material,
				});
				migrated += 1;
			} catch (error) {
				issues.push({
					id: material.uuid,
					type: "material",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return migrated;
	}

	private async migrateLegacyTasks(
		issues: IRLegacyMigrationIssue[]
	): Promise<{ migratedPoints: number }> {
		const pdfStore = await this.readJson<Record<string, unknown>>(this.getV2Paths().ir.pdfBookmarkTasks, {});
		const epubStore = await this.readJson<Record<string, unknown>>(this.getV2Paths().ir.epubBookmarkTasks, {});
		const pdfTasks = isRecord(pdfStore.tasks) ? Object.values(pdfStore.tasks) : [];
		const epubTasks = isRecord(epubStore.tasks) ? Object.values(epubStore.tasks) : [];
		let migratedPoints = 0;

		for (const rawTask of pdfTasks) {
			if (!isRecord(rawTask) || typeof rawTask.id !== "string" || typeof rawTask.pdfPath !== "string") {
				continue;
			}
			try {
				await this.syncLegacyPoint({
					id: rawTask.id,
					topicId: typeof rawTask.topicId === "string" ? rawTask.topicId : typeof rawTask.deckId === "string" ? rawTask.deckId : undefined,
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
				});
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
				await this.syncLegacyPoint({
					id: rawTask.id,
					topicId: typeof rawTask.topicId === "string" ? rawTask.topicId : typeof rawTask.deckId === "string" ? rawTask.deckId : undefined,
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
				});
				migratedPoints += 1;
			} catch (error) {
				issues.push({
					id: String(rawTask.id || "epub-task"),
					type: "epub-bookmark",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return { migratedPoints };
	}

	async executeMigration(): Promise<IRPointStorageMigrationReport> {
		await this.initialize();
		const issues: IRLegacyMigrationIssue[] = [];
		const migratedMaterials = await this.migrateLegacyMaterialsOnly(issues);
		const { migratedPoints } = await this.migrateLegacyTasks(issues);
		const migratedReaderStateFiles = await this.relocateLegacyReaderStateFiles();
		const report: IRPointStorageMigrationReport = {
			status: issues.length > 0 ? "failed" : "completed",
			summary: {
				structureVersion: IR_POINT_STORAGE_VERSION,
				targetRoot: this.getV2Paths().ir.root,
				migratedMaterials,
				migratedPoints,
				migratedReaderStateFiles,
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
