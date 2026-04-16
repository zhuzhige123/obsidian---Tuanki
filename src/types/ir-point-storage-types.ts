export const IR_POINT_STORAGE_VERSION = 1;

export type IRTraceState = "verified" | "degraded" | "broken";

export type IRPointClassificationSource =
	| "inherited-from-material"
	| "manual"
	| "rule-derived";

export interface IRFallbackLocator {
	type: string;
	[key: string]: unknown;
}

export interface IRTraceRecord {
	locatorType: string;
	locator: Record<string, unknown>;
	traceState: IRTraceState;
	traceConfidence: number;
	fallbackLocators: IRFallbackLocator[];
	lastVerifiedAt?: string;
	repairStrategy?: string;
}

export interface IRParameterContext {
	materialClass: string;
	scheduleProfileRef: string;
	classificationSource: IRPointClassificationSource;
	isOverride: boolean;
}

export interface IRPointTimestamps {
	createdAt: string;
	updatedAt: string;
	lastInteractionAt?: string;
}

export interface IRPointSchedule {
	status: string;
	priorityScore: number;
	manualPriority: number;
	nextReviewAt?: string | null;
	lastReviewedAt?: string | null;
	intervalDays: number;
	snoozeUntil?: string | null;
	doneReason?: string | null;
}

export interface IRPointRelations {
	topicIds: string[];
	parentPointId?: string | null;
	linkedCardIds: string[];
	linkedNotePaths: string[];
}

export interface IRPointUserData {
	title: string;
	note?: string;
	tags: string[];
	isStarred: boolean;
}

export interface IRPointStats {
	impressionCount: number;
	reviewCount: number;
	extractCount: number;
	cardCreatedCount: number;
	noteCreatedCount: number;
	totalReadingTimeMs: number;
}

export interface IRPointAudit {
	createdBy: string;
	origin?: {
		type: string;
		id?: string;
	};
}

export interface IRPoint {
	id: string;
	pointType: string;
	materialId: string;
	timestamps: IRPointTimestamps;
	trace: IRTraceRecord;
	parameterContext: IRParameterContext;
	schedule: IRPointSchedule;
	relations: IRPointRelations;
	userData: IRPointUserData;
	stats: IRPointStats;
	audit: IRPointAudit;
	metadata?: Record<string, unknown>;
}

export interface IRPointFileData {
	schemaVersion: number;
	topicId: string;
	topicName: string;
	updatedAt: string;
	points: IRPoint[];
}

export interface IRPointFileIndexEntry {
	topicId: string;
	topicName: string;
	file: string;
	pointCount: number;
	updatedAt: string;
}

export interface IRPointFileIndex {
	schemaVersion: number;
	updatedAt: string;
	files: IRPointFileIndexEntry[];
}

export interface IRMaterialSourceRecord {
	type: string;
	path: string;
	hash?: string;
}

export interface IRMaterialStructureRecord {
	toc?: Array<{
		id: string;
		label: string;
		locator: Record<string, unknown>;
	}>;
}

export interface IRMaterialRecord {
	schemaVersion: number;
	id: string;
	createdAt: string;
	updatedAt: string;
	source: IRMaterialSourceRecord;
	bibliography: {
		title: string;
		author?: string;
		language?: string;
	};
	structure?: IRMaterialStructureRecord;
	contentStorage: {
		mode: "external-source" | "plugin-owned";
		ownedByPlugin: boolean;
		contentFile?: string;
	};
	defaultParameterContext: IRParameterContext;
	metadata?: Record<string, unknown>;
}

export interface IRMaterialsIndexEntry {
	id: string;
	type: string;
	file: string;
	status: string;
}

export interface IRMaterialsIndex {
	schemaVersion: number;
	updatedAt: string;
	materials: IRMaterialsIndexEntry[];
}

export interface IRScheduleProfile {
	id: string;
	label: string;
	materialClass: string;
	source: "builtin" | "user";
	weights: Record<string, number>;
}

export interface IRScheduleProfilesStore {
	schemaVersion: number;
	updatedAt: string;
	profiles: IRScheduleProfile[];
}

export interface IRReaderStateRecord {
	schemaVersion: number;
	materialId: string;
	device: string;
	updatedAt: string;
	position?: Record<string, unknown>;
	view?: Record<string, unknown>;
	uiState?: Record<string, unknown>;
}

export interface IRLegacyMigrationIssue {
	id: string;
	type: string;
	message: string;
}

export interface IRPointStorageMigrationSummary {
	structureVersion: number;
	targetRoot: string;
	migratedMaterials: number;
	migratedPoints: number;
	migratedReaderStateFiles: number;
	failures: IRLegacyMigrationIssue[];
	completedAt: string;
}

export interface IRPointStorageMigrationReport {
	status: "completed" | "failed";
	summary: IRPointStorageMigrationSummary;
}

export interface IRLegacyPointInput {
	id: string;
	topicId?: string;
	title: string;
	tags?: string[];
	status: string;
	priorityUi?: number;
	priorityEff?: number;
	intervalDays?: number;
	nextRepDate?: number;
	createdAt?: number;
	updatedAt?: number;
	lastInteractionAt?: number;
	sourceType: "pdf-bookmark" | "epub-bookmark";
	materialId?: string;
	sourcePath: string;
	locatorType: string;
	locator: Record<string, unknown>;
	note?: string;
	isStarred?: boolean;
}
