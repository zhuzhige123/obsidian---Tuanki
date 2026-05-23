/**
 * 设置界面相关的类型定义
 * 消除 any 类型，提供严格的类型安全
 */

import type WeavePlugin from "../../../main";
import type { RatingLabelStyle } from "../../study/rating-label-style";
import type { NoteTypeConfig } from "../../../types/extract-types";
import type { LicenseInfo as UnifiedLicenseInfo, LicenseStore as UnifiedLicenseStore } from "../../../types/license";
import type { SimplifiedParsingSettings } from "../../../types/newCardParsingTypes";

// 基础设置接口扩展
export interface EditorSettings {
	linkStyle?: "wikilink" | "markdown";
	linkPath?: "short" | "relative" | "absolute";
	preferAlias?: boolean;
	attachmentDir?: string;
	embedImages?: boolean;
}

// 学习界面视图偏好设置
export interface StudyInterfaceViewPreferences {
	/** 侧边栏显示状态 */
	showSidebar: boolean;
	/** 侧边栏紧凑模式设置：auto(自动) | fixed(图标显示) */
	sidebarCompactModeSetting: "auto" | "fixed";
	/** 统计卡片折叠状态 */
	statsCollapsed: boolean;
	/** 卡片学习顺序：sequential（正序）| random（乱序） */
	cardOrder: "sequential" | "random";
	/** 选择题选项顺序：sequential（正序）| random（乱序） */
	choiceOptionOrder: "sequential" | "random";
	/** 侧边栏位置：right（右侧）| bottom（底部） */
	sidebarPosition: "right" | "bottom";
	/** 底部回忆按钮文案风格 */
	ratingLabelStyle: RatingLabelStyle;
	/** 是否在评分按钮内部直接显示下次复习时间 */
	showRatingIntervalOnButtons?: boolean;
	/** 学习界面侧边栏：图谱联动默认开关 */
	graphLinkEnabled?: boolean;
}

// 卡片管理界面视图偏好设置
export interface CardManagementViewPreferences {
	/** 当前视图类型 */
	currentView: "table" | "grid" | "kanban" | "basic" | "review" | "questionBank";
	/** 网格布局模式 */
	gridLayout: "fixed" | "masonry" | "timeline";
	/** 网格卡片边框显示风格 */
	gridCardBorderStyle?: "solid" | "dashed";
	/** 网格卡片显示属性 */
	gridCardAttribute:
		| "none"
		| "uuid"
		| "source"
		| "priority"
		| "retention"
		| "modified"
		| "accuracy"
		| "question_type"
		| "ir_state"
		| "ir_priority";
	/** 看板分组方式 */
	kanbanGroupBy?: "status" | "type" | "priority" | "deck" | "createTime" | "tag" | "tagGroup" | "ir_tag_group";
	/** 按数据源分别保存的看板分组方式 */
	kanbanGroupByBySource?: {
		memory?: "status" | "type" | "priority" | "deck" | "createTime" | "tag" | "tagGroup" | "ir_tag_group";
		questionBank?: "status" | "type" | "priority" | "deck" | "createTime" | "tag" | "tagGroup" | "ir_tag_group";
		"incremental-reading"?: "status" | "type" | "priority" | "deck" | "createTime" | "tag" | "tagGroup" | "ir_tag_group";
	};
	/** 按数据源分别保存的看板标签组选择 */
	kanbanSelectedTagGroupIdBySource?: {
		memory?: string | null;
		questionBank?: string | null;
		"incremental-reading"?: string | null;
	};
	/** 看板布局模式 */
	kanbanLayoutMode: "compact" | "comfortable" | "spacious";
	/** 表格视图模式 */
	tableViewMode: "basic" | "review" | "questionBank" | "irContent";
	/** 启用关联卡片筛选模式 */
	enableCardRelationFilterMode?: boolean;
	/** 启用卡片位置跳转 */
	enableCardLocationJump: boolean;
	/** 表格网格边框显示 */
	showTableGridBorders?: boolean;
}

export interface SettingsWithEditor {
	editor?: EditorSettings;
	enableDebugMode?: boolean;
	dataFolder?: string;
	weaveParentFolder?: string;
	// 基础学习设置
	reviewsPerDay?: number;
	newCardsPerDay?: number;
	enableNotifications?: boolean;
	autoShowAnswerSeconds?: number;
	learningSteps?: number[];
	relearningSteps?: number[];
	graduatingInterval?: number;
	easyInterval?: number;

	// 界面设置
	enableShortcuts?: boolean;
	showFloatingCreateButton?: boolean;
	theme?: "dark" | "light" | "auto";
	/** 默认牌组名称 */
	defaultDeck?: string;
	backupRetentionCount?: number;
	// 自动备份配置
	autoBackupConfig?: import("../../../types/data-management-types").AutoBackupConfig;
	fsrsParams: import("../../../data/types").FSRSParameters;
	license: LicenseInfo;
	licenseState?: LicenseStore;
	clozeSettings?: {
		enabled: boolean;
		openDelimiter: string;
		closeDelimiter: string;
		placeholder: string;
	};
	// 简化卡片解析设置
	simplifiedParsing?: SimplifiedParsingSettings;
	// 导航显示设置
	showReviewButton?: boolean;
	showBrowseButton?: boolean;
	showStatsButton?: boolean;
	showSyncButton?: boolean;
	showSettingsButton?: boolean;
	// 导航项显示控制
	navigationVisibility?: {
		deckStudy?: boolean;
		cardManagement?: boolean;
		incrementalReading?: boolean;
		aiAssistant?: boolean;
		apkgImport?: boolean;
		csvImport?: boolean;
	};
	// 编辑器模态窗尺寸设置
	editorModalSize?: {
		preset?: "small" | "medium" | "large" | "extra-large" | "custom";
		customWidth?: number;
		customHeight?: number;
		rememberLastSize?: boolean;
		enableResize?: boolean;
	};
	// AnkiConnect 同步设置
	ankiConnect?: AnkiConnectSettings;
	// FSRS6 个性化优化设置
	/** @deprecated 已移除插件内自研智能优化，保留字段仅为兼容旧配置 */
	enablePersonalization?: boolean;
	personalizationSettings?: PersonalizationSettings;
	// 卡片管理界面视图偏好设置
	cardManagementViewPreferences?: CardManagementViewPreferences;
	// 学习界面视图偏好设置
	studyInterfaceViewPreferences?: StudyInterfaceViewPreferences;
	// 笔记类型配置
	noteTypeConfig?: NoteTypeConfig;
	showClozeModeSwitchButton?: boolean;
	tutorialHints?: import("../../../services/tutorial/GlobalTutorialHints").GlobalTutorialHintState;
}

// FSRS6个性化优化设置
export interface PersonalizationSettings {
	enabled: boolean; // 总开关
	minDataPoints: number; // 最小数据点要求（默认50）
	enableBacktracking: boolean; // 启用回溯策略
	checkpointInterval: number; // 检查点间隔（默认50次复习）
	performanceThreshold: number; // 性能下降阈值（默认10%）
	autoOptimization: boolean; // 自动优化（无需用户干预）
}

// FSRS相关类型已移至 src/data/types.ts 统一管理
// 此处保留导出以保持向后兼容
export type {
	FSRSParameters,
	OptimizationHistoryEntry,
	PendingOptimization,
} from "../../../data/types";

// 许可证信息类型（使用统一定义）
export type LicenseInfo = UnifiedLicenseInfo;
export type LicenseStore = UnifiedLicenseStore;

export interface DataStorageInterface {
	dataFolder?: string;
	createBackup?: () => Promise<string>;
	exportData?: () => Promise<any>;
	importData?: (data: any) => Promise<any>;
	rebuildStatesFromLogs?: () => Promise<void>;
}

// 使用类型别名而非接口，确保与WeavePlugin完全兼容
export type PluginExtended = WeavePlugin & {};

// 许可证状态类型
export interface LicenseStatus {
	status: "active" | "inactive" | "expired" | "trial";
	text: string;
	color: string;
	icon: string;
}

// 激活码验证结果类型
export interface ActivationValidation {
	isValid: boolean;
	isComplete: boolean;
	warnings: string[];
	errors: string[];
}

// 通知类型
export interface NotificationOptions {
	message: string;
	type?: "success" | "error" | "info" | "warning";
	duration?: number;
}

// 窗口扩展接口（用于 Notice）
export interface WindowWithNotice extends Window {
	Notice?: new (_message: string, _duration?: number) => unknown;
}

// 标签页定义
export interface SettingsTab {
	id: string;
	label: string;
}

// 错误处理类型
export interface ErrorContext {
	operation: string;
	component: string;
	timestamp: number;
}

export interface ErrorResult {
	success: boolean;
	error?: string;
	data?: any;
}

// 备份相关类型
export interface BackupInfo {
	folder: string;
	timestamp: number;
	files: string[];
}

export interface RestoreResult {
	success: boolean;
	restoredFiles: number;
	errors: string[];
}

// 表单验证类型
export interface ValidationRule {
	required?: boolean;
	minLength?: number;
	maxLength?: number;
	pattern?: RegExp;
	custom?: (value: any) => boolean;
}

export interface FieldValidation {
	field: string;
	rules: ValidationRule[];
	message: string;
}

// 设置更新事件类型
export interface SettingsUpdateEvent {
	section: string;
	field: string;
	oldValue: any;
	newValue: any;
	timestamp: number;
}

// AnkiConnect 同步设置类型
export interface AnkiConnectSettings {
	// 连接配置
	enabled: boolean;
	endpoint: string;
	apiKey?: string;

	// 媒体同步配置
	mediaSync: {
		enabled: boolean;
		largeFileThresholdMB: number;
		supportedTypes: string[];
		createBacklinks: boolean;
	};

	// 自动同步配置
	autoSync: {
		enabled: boolean;
		intervalMinutes: number;
		syncOnStartup: boolean;
		onlyWhenAnkiRunning: boolean;
		maxCardsPerSync?: number;
		prioritizeRecent: boolean;
		enableFileWatcher?: boolean; // 启用文件变更检测同步
	};

	// 增量同步状态（由 IncrementalSyncTracker 管理）
	incrementalSyncState?: import("../../../services/ankiconnect/IncrementalSyncTracker").IncrementalSyncState;

	// 牌组映射
	deckMappings: Record<string, DeckSyncMapping>;

	// 模板映射
	templateMappings: Record<string, TemplateSyncMapping>;

	// 导入映射现在存储在独立文件 state/import-mappings.json
	// syncMetadata 已移除，由 ImportMappingManager 管理

	// 备份数据
	backups?: Record<string, BackupData>;

	// 教程状态
	tutorialCompleted: boolean;
	tutorialStep: number;

	// UI 状态缓存
	uiCache?: {
		ankiDecks: import("../../../types/ankiconnect-types").AnkiDeckInfo[];
		ankiModels: import("../../../types/ankiconnect-types").AnkiModelInfo[];
		lastFetchTime: string;
		lastConnectionStatus?: import("../../../types/ankiconnect-types").ConnectionStatus;
	};

	// 快速操作配置
	quickActions?: {
		showInCommandPalette: boolean;
		enableKeyboardShortcuts: boolean;
	};
}

// 牌组同步映射
export interface DeckSyncMapping {
	weaveDeckId: string;
	weaveDeckName: string;
	ankiDeckName: string;
	syncDirection: "to_anki";
	enabled: boolean;
	lastSyncTime?: string;
	contentConversion?: "standard" | "preserve_style" | "minimal";
	cardTypeMappings?: Partial<Record<AnkiSyncCardType, CardTypeTemplateMapping>>;
}

export type AnkiSyncCardType = "basic-qa" | "single-choice" | "multiple-choice" | "cloze-deletion";

export interface CardTypeTemplateMapping {
	enabled: boolean;
	ankiModelName: string;
	fieldMappings: Record<string, string>;
	lastValidatedAt?: string;
}

// 模板同步映射
export interface TemplateSyncMapping {
	weaveTemplateId: string;
	weaveTemplateName: string;
	ankiModelName: string;
	fieldMappings: Record<string, string>;
	lastSyncTime?: string;
}

// 同步日志条目
export interface SyncLogEntry {
	id: string;
	timestamp: string;
	direction: "to_anki";
	summary: {
		totalCards: number;
		successCount: number;
		failedCount: number;
		skippedCount: number;
	};
	duration: number;
	errors?: string[];
	details?: SyncItemDetail[];
}

// 同步项详情
export interface SyncItemDetail {
	cardId: string;
	cardTitle: string;
	status: "success" | "failed" | "skipped";
	reason?: string;
}

// 卡片同步元数据
export interface CardSyncMetadata {
	cardId: string;
	uuid: string;
	lastSyncTime: string;
	lastModifiedInWeave: string;
	lastModifiedInAnki?: string;
	syncVersion: number;
	contentHash: string;
	mediaHash?: string;
	ankiNoteId?: number;
}

// 备份数据类型
export interface BackupData {
	timestamp: string;
	cards: any[];
	decks: any[];
	settings?: any;
	version?: string;
}

// 导出所有类型
export type { WeavePlugin, SettingsWithEditor as Settings };
