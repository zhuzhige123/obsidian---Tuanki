/**
 * AnkiConnect API 类型定义
 * 基于 AnkiConnect v6 API 规范
 */

/**
 * AnkiConnect 请求结构
 */
export interface AnkiConnectRequest {
	action: string;
	version: number;
	params?: Record<string, unknown>;
}

/**
 * AnkiConnect 响应结构
 */
export interface AnkiConnectResponse<T = unknown> {
	result: T;
	error: string | null;
}

/**
 * Anki 牌组信息
 */
export interface AnkiDeckInfo {
	id: number;
	name: string;
	cardCount: number;
	newCount: number;
	learnCount: number;
	reviewCount: number;
}

/**
 * Anki 模型（笔记类型）信息
 */
export interface AnkiModelInfo {
	id: number;
	name: string;
	fields: string[];
	templates: AnkiTemplateInfo[];
	css: string;
}

/**
 * Anki 卡片模板信息
 */
export interface AnkiTemplateInfo {
	Name: string;
	Front: string;
	Back: string;
}

/**
 * Anki 笔记信息
 */
export interface AnkiNoteInfo {
	noteId: number;
	modelName: string;
	tags: string[];
	fields: Record<string, string>;
	cards: number[];
	mod: number; // 修改时间戳（秒）
}

/**
 * Anki 笔记添加请求
 */
export interface AnkiNote {
	deckName: string;
	modelName: string;
	fields: Record<string, string>;
	tags: string[];
	options?: {
		allowDuplicate?: boolean;
		duplicateScope?: string;
	};
	audio?: AnkiMedia[];
	video?: AnkiMedia[];
	picture?: AnkiMedia[];
}

/**
 * Anki 媒体文件
 */
export interface AnkiMedia {
	url?: string;
	filename: string;
	skipHash?: string;
	fields: string[];
	data?: string; // Base64 编码
}

/**
 * Anki 媒体文件信息
 */
export interface AnkiMediaFile {
	filename: string;
	data: string; // Base64 编码
}

/**
 * Anki 模型定义（用于创建新模型）
 */
export interface AnkiModelDefinition {
	modelName: string;
	inOrderFields: string[];
	css: string;
	cardTemplates: AnkiCardTemplateDefinition[];
	isCloze?: boolean;
}

/**
 * Anki 卡片模板定义
 */
export interface AnkiCardTemplateDefinition {
	Name: string;
	Front: string;
	Back: string;
}

/**
 * 连接状态
 */
export interface ConnectionStatus {
	isConnected: boolean;
	lastCheckTime: string;
	ankiVersion?: string;
	apiVersion?: number;
	error?: ConnectionError;
}

/**
 * 连接错误信息
 */
export interface ConnectionError {
	type: ConnectionErrorType;
	message: string;
	suggestion: string;
}

/**
 * 连接错误类型
 */
export enum ConnectionErrorType {
	NOT_RUNNING = "not_running",
	PERMISSION = "permission",
	NETWORK = "network",
	VERSION_MISMATCH = "version_mismatch",
	UNKNOWN = "unknown",
}

/**
 * 同步状态
 */
export enum SyncStatus {
	IDLE = "idle",
	PREPARING = "preparing",
	SYNCING = "syncing",
	COMPLETED = "completed",
	FAILED = "failed",
	CANCELLED = "cancelled",
}

/**
 * 同步进度
 */
export interface SyncProgress {
	status: SyncStatus;
	current: number;
	total: number;
	percentage: number;
	currentBatch?: number;
	totalBatches?: number;
	message?: string;
}

/**
 * 同步方向
 */
export type SyncDirection = "to_anki";

/**
 * AnkiConnect 错误类
 */
export class AnkiConnectError extends Error {
	constructor(
		message: string,
		public type: ConnectionErrorType = ConnectionErrorType.UNKNOWN,
		public suggestion?: string
	) {
		super(message);
		this.name = "AnkiConnectError";
	}
}

/**
 * UI 状态接口
 */
export interface AnkiConnectUIState {
	isInitialized: boolean;
	isFetchingDecks: boolean;
	isFetchingModels: boolean;
	lastRefreshTime: string | null;
}

/**
 * 牌组映射扩展（带状态）
 */
export interface DeckMappingWithStatus {
	id: string;
	weaveDeckId: string;
	weaveDeckName: string;
	ankiDeckName: string;
	syncDirection: SyncDirection;
	enabled: boolean;
	lastSyncTime?: string;
	weaveDeckExists: boolean;
	ankiDeckExists: boolean;
	cardCount: number;
	lastSyncStatus: "success" | "failed" | "pending" | "never";
}

/**
 * 模板映射详情
 */
export interface TemplateMappingDetail {
	id: string;
	weaveTemplateId: string;
	weaveTemplateName: string;
	ankiModelName: string;
	weaveFields: string[];
	ankiFields: string[];
	fieldMappings: Record<string, string>;
	isBidirectionalCapable: boolean;
	isComplete: boolean;
	lastSyncTime?: string;
}

/**
 * 同步操作选项
 */
export interface SyncOperationOptions {
	mode: SyncDirection;
	deckIds: string[];
	forceFullSync: boolean;
	skipMedia: boolean;
	dryRun: boolean;
}

/**
 * 导入结果
 */
export interface ImportResult {
	success: boolean;
	importedCards: number;
	importedTemplates: number;
	skippedCards: number;
	errors: ImportError[];
	templates: import("../types/newCardParsingTypes").ParseTemplate[];
	cards: import("../data/types").Card[];
}

/**
 * 导入错误
 */
export interface ImportError {
	type: "template_conversion" | "card_conversion" | "storage";
	message: string;
	ankiNoteId?: number;
	templateName?: string;
}

/**
 * 导出结果
 */
export type SyncItemOutcome = "created" | "updated" | "unchanged" | "duplicate" | "failed";

export type SyncFailureReason =
	| "empty_content"
	| "missing_primary_field"
	| "template_not_found"
	| "model_creation_failed"
	| "model_unavailable"
	| "model_mismatch"
	| "lookup_failed"
	| "duplicate_content"
	| "upload_failed"
	| "unknown";

export type SyncWarningReason = "missing_source_file";

export interface SyncItemWarning {
	reason: SyncWarningReason;
	message: string;
}

export interface SyncItemResult {
	cardId: string;
	preview: string;
	outcome: SyncItemOutcome;
	deckName?: string;
	noteId?: number;
	modelName?: string;
	existingModelName?: string;
	targetModelName?: string;
	reason?: SyncFailureReason;
	message?: string;
	warnings?: SyncItemWarning[];
}

export interface ExportSummary {
	totalCards: number;
	exportedCards: number;
	skippedCards: number;
	createdCards: number;
	updatedCards: number;
	unchangedCards: number;
	duplicateCards: number;
	failedCards: number;
	warningCards: number;
	failureReasons: Partial<Record<SyncFailureReason, number>>;
	warningReasons: Partial<Record<SyncWarningReason, number>>;
}

export interface ExportResult {
	success: boolean;
	totalCards: number;
	exportedCards: number;
	createdModels: number;
	createdCards: number;
	updatedCards: number;
	unchangedCards: number;
	duplicateCards: number;
	skippedCards: number;
	failedCards: number;
	warningCards: number;
	errors: ExportError[];
	items: SyncItemResult[];
	summary: ExportSummary;
}

/**
 * 导出错误
 */
export interface ExportError {
	type:
		| "model_creation"
		| "note_creation"
		| "upload"
		| "template_not_found"
		| "lookup"
		| "model_mismatch";
	message: string;
	cardId?: string;
	templateId?: string;
	noteId?: number;
	reason?: SyncFailureReason;
}

/**
 * 增量同步结果
 */
export interface IncrementalSyncResult {
	totalCards: number;
	changedCards: number;
	skippedCards: number;
	importedCards: number;
	exportedCards: number;
	createdCards: number;
	updatedCards: number;
	unchangedCards: number;
	duplicateCards: number;
	failedCards: number;
	warningCards: number;
	summary: ExportSummary;
	deckResults: Array<{
		deckName: string;
		direction: SyncDirection;
		exportResult?: ExportResult;
	}>;
	errors: string[];
	duration: number; // 同步耗时（毫秒）
}

export type ModelMismatchRepairItemOutcome = "fixed" | "archived_only" | "failed";

export interface ModelMismatchRepairItemResult {
	cardId: string;
	preview: string;
	deckName?: string;
	originalNoteId?: number;
	archivedNoteId?: number;
	recreatedNoteId?: number;
	existingModelName?: string;
	targetModelName?: string;
	outcome: ModelMismatchRepairItemOutcome;
	message: string;
}

export interface ModelMismatchRepairResult {
	success: boolean;
	totalItems: number;
	archivedCards: number;
	fixedCards: number;
	archivedOnlyCards: number;
	failedCards: number;
	archiveDeckName: string;
	items: ModelMismatchRepairItemResult[];
	errors: string[];
}

/**
 * 自动同步配置
 */
export interface AutoSyncConfig {
	enabled: boolean;
	mode: "scheduled" | "on_change" | "both";
	intervalMinutes: number;
}

/**
 * 连接状态（扩展版，用于 ConnectionManager）
 */
export interface ConnectionState {
	status: "connected" | "disconnected" | "reconnecting";
	lastHeartbeat: number;
	reconnectAttempts: number;
	error?: string;
}

/**
 * Obsidian → Anki 内容转换结果
 */
export interface ConversionResult {
	convertedContent: string; // 转换后的内容
	mediaFiles: MediaFileInfo[]; // 提取的媒体文件
	backlinks: BacklinkInfo[]; // 生成的回链
	warnings: string[]; // 转换警告
}

/**
 * 媒体文件信息
 */
export interface MediaFileInfo {
	type: "image" | "audio" | "video";
	originalRef: string; // 原始引用 (如 ![[file.jpg]])
	filename: string; // 文件名
	vaultPath: string; // Vault 中的路径
	ankiFormat: string; // Anki 格式 (<img> 或 [sound:])
	fileExists: boolean; // 文件是否存在
	uploaded?: boolean; // 是否已上传
}

/**
 * 回链信息
 */
export interface BacklinkInfo {
	type: "source_file" | "source_block";
	label: string; // 显示文本
	url: string; // obsidian:// URL
	html: string; // HTML 代码
}

/**
 * Obsidian → Anki 转换选项
 */
export interface ObsidianToAnkiOptions {
	vaultName: string; // Vault 名称
	uploadMedia: boolean; // 是否上传媒体
	generateBacklinks: boolean; // 是否生成回链
	backlinkPosition: "append" | "separate"; // 回链位置（追加到内容或独立字段）
	mediaPosition: "inline" | "end"; // 媒体位置
	formatConversion?: FormatConversionOptions; // 格式转换选项
}

/**
 * 格式转换选项
 */
export interface FormatConversionOptions {
	/** 是否启用格式转换 */
	enabled: boolean;

	/** 公式转换模式 */
	mathConversion: {
		enabled: boolean;
		targetFormat: "keep-dollar" | "latex-parens"; // $ 或 \(
		detectCurrencySymbol: boolean; // 是否检测货币符号避免误转换
	};

	/** 双链转换模式 */
	wikiLinkConversion: {
		enabled: boolean;
		mode: "text-only" | "obsidian-link"; // 纯文本或 Obsidian 协议链接
	};

	/** Callout 转换 */
	calloutConversion: {
		enabled: boolean;
		injectStyles: boolean; // 是否注入样式到 Anki 模板
	};

	/** 高亮和删除线转换 */
	highlightConversion: {
		enabled: boolean;
	};
}

/**
 * 转换上下文
 */
export interface ConversionContext {
	vaultName: string;
	sourceFile?: string;
	options: FormatConversionOptions;
}

/**
 * 格式转换结果
 */
export interface FormatConversionResult {
	content: string;
	appliedLayers: string[];
	warnings: string[];
	conversionDetails: Record<string, unknown>;
}

/**
 * 转换层结果
 */
export interface LayerConversionResult {
	content: string;
	changeCount?: number;
	warnings?: string[];
}
