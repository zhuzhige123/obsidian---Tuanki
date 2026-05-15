import {
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	Menu,
	Notice,
	Platform,
	Plugin,
	SuggestModal,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import { FSRS } from "./algorithms/fsrs";
import { AnkiSettingsTab } from "./components/settings/SettingsTab";
import { WeaveDataStorage } from "./data/storage";
import { destroyCardQualityInboxService } from "./services/card-quality/CardQualityInboxService";
import {
	DataManagementService,
	resetDataManagementService,
} from "./services/data-management/DataManagementService";
import EditorContextManager from "./services/editor/EditorContextManager";
import type { EmbeddableEditorManager } from "./services/editor/EmbeddableEditorManager";
import type { LicenseInfo } from "./types/license";
import { DEFAULT_LICENSE_INFO } from "./types/license";
import type { CreateCardOptions } from "./types/modal-types";
import { focusManager } from "./utils/focus-manager"; // 导入焦点管理器以启用全局监控
import { licenseManager } from "./utils/licenseManager";
import { initMediaDebug } from "./utils/mediaDebugHelper";
import { createSafeNotice, safeOpenSettings } from "./utils/obsidian-api-safe";
import type { SafeNotice } from "./utils/obsidian-api-safe";
import {
	EpubBookshelfSidebarView,
	VIEW_TYPE_EPUB_BOOKSHELF_SIDEBAR,
} from "./views/EpubBookshelfSidebarView";
import { EpubSidebarView, VIEW_TYPE_EPUB_SIDEBAR } from "./views/EpubSidebarView";
import { EpubView, VIEW_TYPE_EPUB } from "./views/EpubView";
import { IRCalendarView, VIEW_TYPE_IR_CALENDAR } from "./views/IRCalendarView"; // 📅 增量阅读日历视图
import { IRFocusView, VIEW_TYPE_IR_FOCUS } from "./views/IRFocusView"; // 📖 增量阅读聚焦视图
import { QuestionBankView, VIEW_TYPE_QUESTION_BANK } from "./views/QuestionBankView"; // 🆕 考试学习视图
import { StudyView, VIEW_TYPE_STUDY } from "./views/StudyView";
import { VIEW_TYPE_WEAVE, WeaveView } from "./views/WeaveView";

import { DEFAULT_AI_CONFIG } from "./components/settings/constants/settings-constants";
import type {
	SettingsWithEditor,
	StudyInterfaceViewPreferences,
} from "./components/settings/types/settings-types";
import {
	createDefaultAnkiConnectSettings,
	normalizeAnkiConnectSettings,
} from "./services/ankiconnect/anki-connect-settings";
import {
	type AIAssistantLocalPreferences,
	type AIGenerationHistoryEntry,
	type CreateCardPreferencesState,
	type EditorModalSizeState,
	PluginLocalStateService,
	migrateLegacyPluginRuntimeState,
} from "./services/plugin-state/PluginLocalStateService";
import { DEFAULT_SIMPLIFIED_PARSING_SETTINGS } from "./types/newCardParsingTypes";

import {
	LEGACY_DOT_TUANKI,
	getMachineWeaveRoot,
	getReadableWeaveRoot,
	getV2PathsFromApp,
	normalizeWeaveParentFolder,
	resolveIRImportFolder,
} from "./config/paths";
import { BatchParsingFileWatcher } from "./services/BatchParsingFileWatcher";
import { GlobalDataCache } from "./services/GlobalDataCache";
import { BatchCardSaver } from "./services/batch/BatchCardSaver";
import { ParsedCardConverter } from "./services/converter/ParsedCardConverter";
import { MaskDataParser } from "./services/image-mask/MaskDataParser";
import { replaceSelectionInMarkdownContent } from "./services/incremental-reading/SelectionQuickCreateSourceTransform";
import { createWeaveDeckCodeBlockProcessor } from "./services/markdown/WeaveDeckCodeBlockProcessor";
import { WEAVE_DECKS_CODE_BLOCK_LANGUAGE } from "./services/markdown/weaveDeckCodeBlock";
import { ReadingCategory } from "./types/incremental-reading-types";
import type { ParsedCard } from "./types/newCardParsingTypes";
import { registerMobileCanvasPaneMenuPatch } from "./utils/canvas-pane-menu-mobile";
import { DirectoryUtils } from "./utils/directory-utils";
import { getPreferredEpubLeaf } from "./utils/epub-leaf-utils";
import { initI18n } from "./utils/i18n";
import { logger } from "./utils/logger";
import { SimplifiedCardParser } from "./utils/simplifiedParser/SimplifiedCardParser";
import { tabletDebugger } from "./utils/tablet-debug";
import { createContentWithMetadata } from "./utils/yaml-utils";
// 🆕 平板端支持
import { applyDeviceClasses, detectDevice } from "./utils/tablet-detection";
import { vaultStorage } from "./utils/vault-local-storage";
import { openFileWithExistingLeaf, openLinkWithExistingLeaf } from "./utils/workspace-navigation";

import { get } from "svelte/store";
// AI
import { aiConfigStore } from "./stores/ai-config.store";
import { customActionsForMenu } from "./stores/ai-config.store";

import { BatchParsingManager } from "./services/batch-parsing";
import { DeckStorageAdapter } from "./services/storage/DeckStorageAdapter";
import { UUIDStorageImpl } from "./services/storage/UUIDStorageImpl";

// 🆕 v0.8: 统一标识符系统
import { generateUUID } from "./utils/helpers";

import { DataSyncService } from "./services/DataSyncService"; // 🆕 全局数据同步服务
import { ExternalSyncWatcher } from "./services/ExternalSyncWatcher"; // 🆕 外部同步文件变更监听
import { FilterStateService } from "./services/FilterStateService"; // 🆕 全局筛选状态服务
import { DeckHierarchyService } from "./services/deck/DeckHierarchyService";
import { IndexManagerService } from "./services/index/IndexManagerService";
import { MediaManagementService } from "./services/media/MediaManagementService";

// 高级功能守卫
import { PREMIUM_FEATURES, PremiumFeatureGuard } from "./services/premium/PremiumFeatureGuard";

// 学习会话管理
import { StudySessionManager } from "./services/StudySessionManager";

// 🌍 国际化系统
import { i18n } from "./utils/i18n";
import type { SupportedLanguage } from "./utils/i18n";

// 🆕 学习模式类型
import {
	type PersistedStudySession,
	type StudyMode,
	isPersistedStudySession,
} from "./types/study-types";

import type { Deck, FSRSParameters } from "./data/types";
// 类型扩展
import type { ExtendedNotice } from "./types/plugin-types";

import { CleanupProgressModal } from "./components/modals/CleanupProgressModal";
import { IRDeckSelectorModal } from "./modals/IRDeckSelectorModal";
// 块链接清理系统
import { BlockLinkCleanupService } from "./services/cleanup/BlockLinkCleanupService";
import { EditorTempFileCleanupService } from "./services/cleanup/EditorTempFileCleanupService";
import { GlobalCleanupScanner } from "./services/cleanup/GlobalCleanupScanner";
import { migrateLegacyWeaveFolders } from "./services/data-migration/LegacyWeaveFolderMigration";
import { UnifiedDataMigrationService } from "./services/data-migration/UnifiedDataMigrationService";
import { IREpubBookmarkTaskService } from "./services/incremental-reading/IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "./services/incremental-reading/IRPdfBookmarkTaskService";
import { recomputeAndBroadcastIRData } from "./services/incremental-reading/IRScheduleRefreshService";
import { IRStorageService } from "./services/incremental-reading/IRStorageService";
import { getWeaveOperationsSubmenu } from "./services/menu/WeaveContextMenuBuilder";
import { createDefaultChunkFileData, generateChunkId, generateSourceId } from "./types/ir-types";
import { showObsidianConfirm } from "./utils/obsidian-confirm";

import { EditorAIToolbarManager } from "./services/editor/EditorAIToolbarManager";
import { SelectedTextAICardPanelManager } from "./services/editor/SelectedTextAICardPanelManager";

import { CardIndexService } from "./services/data/CardIndexService";
// DirectFileCardReader - 高性能数据读取服务
import { DirectFileCardReader } from "./services/data/DirectFileCardReader";

// 优化后的CSS导入 - 减少重复，使用global.css统一管理
import "./styles/fonts.css"; // 字体文件（独立）
import "./styles/global.css"; // 全局样式（包含核心@import）
import "virtual:uno.css";

// 专用功能样式（global.css未包含）
import "./styles/card-animations.css"; // 卡片动画
import "./styles/card-base.css"; // 卡片基础样式
import "./styles/drag-drop-indicator.css"; // 拖拽指示器
import "./styles/dynamic-injected.css"; // 原动态注入样式
import "./styles/image-mask.css"; // 图片遮罩
import "./styles/inline-card-editor.css"; // 内联编辑器
import "./styles/progressive-cloze.css"; // 渐进式挖空
import "./styles/study-interface.css"; // 学习界面
import "./styles/study-view-layout.css"; // 学习视图布局（三界面共享）

/**
 * ========================================
 * 插件设置接口
 *    ├─ 核心功能：
 *    │  ├─ 监听 vault.on('modify') 事件
 *    │  ├─ 防抖处理（避免频繁触发）
 *    │  ├─ 文件夹过滤（includeFolders / excludeFolders）
 *    │  └─ 自动调用 SimplifiedCardParser 解析
 *    └─ 适用场景：边写边同步，实时更新卡片
 *
 * 2️⃣ 手动触发系统（BatchParsingManager）
 *    ├─ 职责：用户主动执行批量解析命令
 *    ├─ 触发方式：命令面板或快捷键
 *    ├─ 相关命令：
 *    │  ├─ "batch-parse-current-file"（解析当前文件）
 *    │  └─ "batch-parse-all-mappings"（解析所有映射文件）
 *    ├─ 核心功能：
 *    │  ├─ 文件选择服务（SimpleFileSelectorService）
 *    │  ├─ 牌组映射服务（DeckMappingService）
 *    │  ├─ UUID管理服务（UUIDManager）
 *    │  └─ 三方合并引擎（ThreeWayMergeEngine）
 *    └─ 适用场景：批量处理，一键解析多个文件
 *
 * 🔗 两者关系：
 *    ├─ 互补协作：自动触发处理单文件实时同步，手动触发处理批量操作
 *    ├─ 共享组件：都使用 SimplifiedCardParser 进行解析
 *    ├─ 独立开关：可以单独启用/禁用任一系统
 *    └─ 数据流统一：都通过 addCardsToDB() 保存到数据库
 *
 * ⚙️ 核心解析引擎：SimplifiedCardParser
 *    └─ 基于可配置符号的 Markdown 卡片解析
 *       ├─ 卡片分隔符：settings.simplifiedParsing.symbols.cardDelimiter
 *       ├─ 正反面分隔符：settings.simplifiedParsing.symbols.faceDelimiter
 *       └─ 挖空标记：settings.simplifiedParsing.symbols.clozeMarker
 *
 * ========================================
 */

export interface WeaveSettings extends SettingsWithEditor {
	defaultDeck: string;
	reviewsPerDay: number;
	newCardsPerDay: number; // 🆕 每日新卡片限额（默认20）
	enableNotifications: boolean;
	theme: "dark" | "light" | "auto";
	language?: SupportedLanguage; // 🌍 界面语言设置

	// 学习行为
	autoShowAnswerSeconds: number; // 0 表示手动
	learningSteps: number[]; // 分钟
	graduatingInterval: number; // 天
	maxAdvanceDays: number; // 🆕 提前学习最多提前天数（默认7天，避免影响记忆效果）

	// 🆕 渐进式挖空设置
	progressiveCloze?: {
		enableAutoSplit?: boolean; // 是否自动拆分渐进式挖空（默认true）
		historyInheritance?: "first" | "proportional" | "reset" | "prompt"; // 历史数据继承策略（默认'first'）
	};

	// 🆕 学习配置（包含兄弟卡片分散等高级功能）
	studyConfig?: {
		newCardsPerDay?: number;
		reviewsPerDay?: number;
		fsrs?: any;
		// 🆕 兄弟卡片分散配置（渐进式挖空优化）
		siblingDispersion?: import("./types/plugin-settings").SiblingDispersionConfig;
		showAnswerButtons?: boolean;
		enableKeyboardShortcuts?: boolean;
	};

	// 界面与交互
	enableShortcuts: boolean;
	showFloatingCreateButton: boolean;
	backupRetentionCount?: number; // 备份保留数量

	// 🆕 自动备份配置
	autoBackupConfig?: import("./types/data-management-types").AutoBackupConfig;

	// 选择题统计
	multipleChoiceStats?: {
		totalQuestions: number;
		correctAnswers: number;
		totalAttempts: number;
		lastUpdated: string;
	};

	// 导航项显示控制
	navigationVisibility?: {
		deckStudy?: boolean;
		cardManagement?: boolean;
		incrementalReading?: boolean;
		aiAssistant?: boolean;
		apkgImport?: boolean;
		csvImport?: boolean;
		clipboardImport?: boolean;
		settingsEntry?: boolean;
	};

	// 导航栏设置按钮显示控制
	showSettingsButton?: boolean;

	epubBookshelf?: {
		sourceMode: "cache-first" | "folder-only";
		sourceFolder: string;
	};

	// 🆕 v1.0.0: 数据文件夹可见性配置
	dataFolderVisibility?: {
		hideInFileExplorer: boolean; // 是否在文件浏览器中隐藏数据文件夹（默认true）
		folderName: string; // 数据文件夹名称（固定为'weave'）
		userAcknowledgedRisk: boolean; // 用户是否已确认理解CSS隐藏的风险
	};

	weaveParentFolder?: string;

	// 是否跳过指南牌组自动创建（用户删除后不再自动恢复）
	skipGuideDeck?: boolean;

	// 🆕 卡片管理页面视图偏好设置
	cardManagementViewPreferences?: {
		currentView: "table" | "grid" | "kanban";
		gridLayout: "fixed" | "masonry" | "timeline";
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
		kanbanLayoutMode: "compact" | "comfortable" | "spacious";
		tableViewMode: "basic" | "review" | "questionBank" | "irContent";
		enableCardLocationJump: boolean;
		showTableGridBorders: boolean;
	};

	// 学习视图间距模式
	studyViewSpacing?: "compact" | "default" | "comfortable";

	// 🆕 学习界面视图偏好设置
	studyInterfaceViewPreferences?: {
		showSidebar: boolean;
		sidebarCompactModeSetting: "auto" | "fixed";
		statsCollapsed: boolean;
		cardOrder: "sequential" | "random"; // 🆕 卡片学习顺序
		sidebarPosition: "right" | "bottom"; // 🆕 侧边栏位置
	};

	// 🆕 牌组标签组配置
	// 用于看板视图按标签组分组
	deckTagGroups?: import("./types/deck-kanban-types").DeckTagGroup[];

	// 🆕 队列优化系统配置（v2.0）
	queueOptimization?: import("./types/queue-optimization-types").QueueOptimizationSettings;

	// 🆕 删除功能设置
	enableDirectDelete?: boolean;

	// 🆕 教程按钮显示设置
	showTutorialButton?: boolean;

	// 编辑器模态窗尺寸设置
	editorModalSize?: {
		preset: "small" | "medium" | "large" | "extra-large" | "custom";
		customWidth?: number; // 像素值
		customHeight?: number; // 像素值
		rememberLastSize?: boolean; // 是否记住上次调整的尺寸
		enableResize?: boolean; // 是否启用拖拽调整
	};

	// 🔒 激活码相关（使用统一的类型定义）
	license: LicenseInfo;

	// FSRS 参数
	fsrsParams: FSRSParameters;

	// 🎯 FSRS6优化历史显示状态
	showOptimizationHistory?: boolean; // 优化历史记录展开/折叠状态

	// 🎯 FSRS6个性化优化设置
	enablePersonalization?: boolean; // 启用个性化算法优化
	personalizationSettings?: {
		enabled: boolean;
		minDataPoints: number;
		enableBacktracking: boolean;
		checkpointInterval: number;
		performanceThreshold: number;
		autoOptimization: boolean;
	};

	// 🔥 数据迁移标记
	migrationCompleted?: boolean;

	// 编辑器与链接/附件配置
	editor?: {
		linkStyle: "wikilink" | "markdown";
		linkPath: "short" | "relative" | "absolute";
		preferAlias: boolean;
		attachmentDir: string;
		embedImages: boolean;
	};

	// 卡片管理视图偏好
	cardManager?: {
		visibleFields?: {
			table?: Record<string, boolean>;
			grid?: Record<string, boolean>;
		};
		sort?: {
			primary?: { field: string; order: "asc" | "desc" };
			secondary?: { field: string; order: "asc" | "desc" } | null;
		};
		defaultFilters?: {
			tag?: string;
			status?: number | "";
		};
	};

	// 挖空功能设置
	clozeSettings?: {
		enabled: boolean;
		openDelimiter: string;
		closeDelimiter: string;
		placeholder: string;
	};

	// 媒体自动播放设置
	mediaAutoPlay?: {
		enabled: boolean; // 是否启用自动播放
		mode: "first" | "all"; // 播放模式：仅第一个/全部
		timing: "cardChange" | "showAnswer"; // 播放时机：切换卡片/显示答案
		playbackInterval: number; // 播放间隔（毫秒）
	};

	// 调试
	enableDebugMode?: boolean;

	// 🆕 显示性能优化设置标签页
	showPerformanceSettings?: boolean;

	// 🆕 显示高级功能预览（开启后，未激活的高级功能将以锁定状态显示）
	showPremiumFeaturesPreview?: boolean;

	// 🆕 牌组卡片设计样式
	deckCardStyle?: "default" | "chinese-elegant";

	// 🆕 主界面打开位置偏好（通过侧边栏图标打开时）
	mainInterfaceOpenLocation?: "content" | "sidebar";

	// 新版简化解析设置
	simplifiedParsing?: import("./types/newCardParsingTypes").SimplifiedParsingSettings;

	// 修复工具设置
	repairTool?: {
		repairScope?: "current-file" | "open-files" | "all-files";
		repairMissingBlockIds?: boolean;
		repairMissingUUIDs?: boolean;
		repairMissingTimestamps?: boolean;
		repairMalformedCallouts?: boolean;
		createBackupBeforeRepair?: boolean;
		confirmBeforeBatchRepair?: boolean;
		blockIdGenerationStrategy?: "random" | "sequential" | "content-based";
		timestampStrategy?: "current" | "file-modified" | "preserve-existing";
	};

	// AnkiConnect 同步设置
	ankiConnect?: import("./components/settings/types/settings-types").AnkiConnectSettings;

	// ✅ Phase 3: APKG 导入配置（字段显示面配置持久化）
	// 暂时注释，等待实现
	// apkgImportConfig?: import('./importers/apkg-config-manager').APKGImportConfiguration;

	// AI配置
	aiConfig?: {
		// API密钥配置（加密存储）
		apiKeys?: {
			openai?: {
				apiKey: string;
				model: string;
				verified: boolean;
				lastVerified?: string;
			};
			gemini?: {
				apiKey: string;
				model: string;
				verified: boolean;
				lastVerified?: string;
			};
			xai?: {
				apiKey: string;
				model: string;
				verified: boolean;
				lastVerified?: string;
			};
		};

		// 默认AI服务
		defaultProvider?:
			| "openai"
			| "gemini"
			| "anthropic"
			| "deepseek"
			| "zhipu"
			| "siliconflow"
			| "xai";

		// 🆕 上次使用的AI服务提供商（用于持久化用户选择）
		lastUsedProvider?: string;

		// 🆕 上次使用的AI模型（用于持久化用户选择）
		lastUsedModel?: string;

		// AI格式化开关
		formatting?: {
			enabled: boolean;
		};

		// 🆕 AI卡片拆分配置
		cardSplitting?: {
			enabled: boolean;
			defaultTargetCount: number;
			minContentLength: number;
			maxContentLength: number;
			autoInheritTags: boolean;
			autoInheritSource: boolean;
			requireConfirmation: boolean;
			defaultInstruction?: string;
		};

		// 全局AI参数
		globalParams?: {
			temperature: number;
			maxTokens: number;
			requestTimeout: number;
			concurrentLimit: number;
		};

		// 🆕 全局系统提示词配置
		systemPromptConfig?: {
			useBuiltin: boolean;
			customPrompt: string;
			lastModified?: string;
			// 🆕 自定义系统提示词列表
			customSystemPrompts?: import("./types/ai-types").CustomSystemPrompt[];
			selectedSystemPromptId?: string;
		};

		// 提示词模板
		promptTemplates?: {
			official: Array<{
				id: string;
				name: string;
				prompt: string;
				systemPrompt?: string;
				useBuiltinSystemPrompt?: boolean;
				description?: string;
				variables: string[];
				category?: "official" | "custom";
				createdAt: string;
				updatedAt?: string;
			}>;
			custom: import("./types/ai-types").PromptTemplate[];
		};

		// 自定义AI功能列表
		customFormatActions?: import("./types/ai-types").CustomFormatAction[];
		customSplitActions?: import("./types/ai-types").AIAction[];

		/** @deprecated 已弃用。仅为向后兼容保留 */
		officialFormatActions?: {
			choice: { enabled: boolean };
			mathFormula: { enabled: boolean };
			memoryAid: { enabled: boolean };
		};

		/** @deprecated 已弃用。仅为向后兼容保留 */

		// 持久化的AI制卡生成配置
		savedGenerationConfig?: {
			cardCount?: number;
			difficulty?: "easy" | "medium" | "hard" | "mixed";
			typeDistribution?: {
				qa: number;
				cloze: number;
				choice: number;
			};
			autoTags?: string[];
			enableHints?: boolean;
			temperature?: number;
			maxTokens?: number;
		};
		generationHistory?: Array<{
			id: string;
			createdAt: string;
			sourceFile: {
				path: string;
				name: string;
				size: number;
				extension: string;
			} | null;
			sourceContent: string;
			cards: import("./types/ai-types").GeneratedCard[];
			config: import("./types/ai-types").GenerationConfig;
			selectedPrompt: import("./types/ai-types").PromptTemplate | null;
			customPrompt: string;
		}>;
	};

	// 负荷控制管理配置
	loadBalance?: {
		dailyCapacity: number;
		thresholds: {
			low: number;
			normal: number;
			high: number;
		};
		fuzzMethod: "uniform" | "gaussian" | "loadBased";
		fuzzRangeDays: number;
		forecast: {
			defaultDays: number;
			maxDays: number;
		};
	};

	// 🆕 笔记类型配置
	noteTypeConfig?: import("./types/extract-types").NoteTypeConfig;

	// 🆕 v2.0 引用式牌组系统设置
	autoCheckDataConsistency?: boolean; // 启动时自动检查数据一致性（默认关闭）

	// 🆕 增量阅读全局设置（使用统一的类型定义）
	incrementalReading?: import("./types/plugin-settings").IncrementalReadingSettings;

	// 🆕 置顶牌组列表（用于热门牌组识别）
	pinnedDecks?: string[];
	createCardPreferences?: {
		lastSelectedDeckId?: string;
		lastSelectedDeckNames?: string[];
	};

	// 超时自动暂停计时（秒）
	timerAutoPauseSeconds?: number;
	// 提示功能每次学习会话最大使用次数
	hintMaxUses?: number;
	showClozeModeSwitchButton?: boolean;
	tutorialHints?: import("./services/tutorial/GlobalTutorialHints").GlobalTutorialHintState;
}

const DEFAULT_SETTINGS: WeaveSettings = {
	defaultDeck: "默认牌组",
	reviewsPerDay: 20,
	newCardsPerDay: 20, // 🆕 默认每天20张新卡片（参考Anki）
	enableNotifications: true,
	theme: "auto",
	language: "zh-CN", // 🌍 默认语言为简体中文

	autoShowAnswerSeconds: 0,
	learningSteps: [1, 10],
	relearningSteps: [10],
	graduatingInterval: 1,
	maxAdvanceDays: 7, // 🆕 默认提前学习最多7天（基于FSRS研究建议）

	enableShortcuts: true,
	showFloatingCreateButton: true,

	// 🆕 自动备份配置
	autoBackupConfig: {
		enabled: true,
		intervalHours: 24,
		triggers: {
			onStartup: true,
			onCardThreshold: true,
			cardThresholdCount: 100,
		},
		notifications: {
			onSuccess: true,
			onFailure: true,
		},
		lastAutoBackupTime: undefined,
		autoBackupCount: 0,
	},

	multipleChoiceStats: {
		totalQuestions: 0,
		correctAnswers: 0,
		totalAttempts: 0,
		lastUpdated: new Date().toISOString(),
	},

	navigationVisibility: {
		deckStudy: true,
		cardManagement: true,
		incrementalReading: true,
		aiAssistant: true,
		apkgImport: true,
		csvImport: true,
		clipboardImport: true,
		settingsEntry: true,
	},

	showSettingsButton: true,
	epubBookshelf: {
		sourceMode: "cache-first",
		sourceFolder: "",
	},

	studyViewSpacing: "compact",

	weaveParentFolder: "",

	// 🎯 FSRS6个性化优化设置
	enablePersonalization: true, // 默认启用
	personalizationSettings: {
		enabled: true,
		minDataPoints: 50,
		enableBacktracking: true,
		checkpointInterval: 50,
		performanceThreshold: 0.1,
		autoOptimization: true,
	},

	// 编辑器模态窗尺寸默认设置（🔑 默认启用尺寸记忆）
	editorModalSize: {
		preset: "large",
		customWidth: 800,
		customHeight: 600,
		rememberLastSize: true, // 默认启用尺寸持久化
		enableResize: true, // 默认启用拖拽调整
	},

	// 🆕 卡片管理页面视图偏好默认设置
	cardManagementViewPreferences: {
		currentView: "table",
		gridLayout: "fixed",
		gridCardAttribute: "uuid",
		kanbanLayoutMode: "comfortable",
		tableViewMode: "basic",
		enableCardLocationJump: false,
		showTableGridBorders: false,
	},

	// 🆕 学习界面视图偏好默认设置
	studyInterfaceViewPreferences: {
		showSidebar: true,
		sidebarCompactModeSetting: "auto",
		statsCollapsed: true,
		cardOrder: "sequential",
		sidebarPosition: "right",
	},

	// 🆕 牌组卡片设计样式
	deckCardStyle: "default",

	// 🆕 主界面打开位置偏好（默认在主内容区打开）
	mainInterfaceOpenLocation: "content",

	// 🆕 队列优化系统配置（v2.0）
	queueOptimization: {
		learningSteps: {
			enabled: true,
			steps: [1, 10],
			maxFailures: 5,
			showProgressIndicator: true,
		},
		interleaving: {
			enabled: true,
			mode: "smart",
			respectPriority: true,
			minGroupSize: 3,
			maxConsecutiveSameTag: 2,
		},
		difficultyTracking: {
			enabled: true,
			showIndicator: true,
			autoTag: true,
			interventionThreshold: 2,
			trendAnalysisWindow: 5,
		},
		priority: {
			enableUserPriority: true,
			enableDifficultyAdjustment: true,
			enableLeechBoost: true,
		},
	},

	// 🆕 删除功能默认设置
	enableDirectDelete: false,

	// 🆕 教程按钮默认显示
	createCardPreferences: {
		lastSelectedDeckId: "",
		lastSelectedDeckNames: [],
	},

	showTutorialButton: true,
	showClozeModeSwitchButton: true,

	// 提示功能每次学习会话最大使用次数
	hintMaxUses: 5,

	license: {
		activationCode: "",
		isActivated: false,
		activatedAt: "",
		deviceFingerprint: "",
		expiresAt: "",
		productVersion: "",
		licenseType: "lifetime",
	},

	fsrsParams: {
		// FSRS6 官方默认参数 (21个权重参数)
		w: [
			0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
			0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
		],
		requestRetention: 0.9,
		maximumInterval: 365, // 默认1年，用户可在设置中调整至5年
		enableFuzz: true,

		// 🎯 优化历史记录和待确认优化建议（默认为空）
		optimizationHistory: [],
		pendingOptimization: undefined,
	},

	// 新版简化解析设置
	simplifiedParsing: DEFAULT_SIMPLIFIED_PARSING_SETTINGS,

	// 🔥 数据迁移标记
	migrationCompleted: false,

	editor: {
		linkStyle: "wikilink",
		linkPath: "short",
		preferAlias: true,
		attachmentDir: "Weave Assets",
		embedImages: true,
	},

	cardManager: {
		visibleFields: {
			table: {
				front: true,
				back: true,
				status: true,
				due: true,
				difficulty: true,
				priority: true,
				tags: true,
				deck: true,
				backlink: true,
				actions: true,
			},
			grid: { tags: true, priority: true, deck: true, backlink: true },
		},
		sort: {
			primary: { field: "due", order: "asc" },
			secondary: null,
		},
		defaultFilters: { tag: "", status: "" },
	},

	clozeSettings: {
		enabled: true,
		openDelimiter: "==",
		closeDelimiter: "==",
		placeholder: "[...]",
	},

	// 媒体自动播放默认设置
	mediaAutoPlay: {
		enabled: false, // 默认关闭，用户按需启用
		mode: "first", // 默认只播放第一个媒体文件
		timing: "cardChange", // 默认在切换卡片时播放
		playbackInterval: 2000, // 默认播放间隔2秒（毫秒）
	},

	enableDebugMode: false,
	showPerformanceSettings: false, // 🆕 默认隐藏性能优化设置

	// 修复工具默认设置
	repairTool: {
		repairScope: "current-file",
		repairMissingBlockIds: true,
		repairMissingUUIDs: true,
		repairMissingTimestamps: true,
		repairMalformedCallouts: true,
		createBackupBeforeRepair: false,
		confirmBeforeBatchRepair: true,
		blockIdGenerationStrategy: "random",
		timestampStrategy: "current",
	},

	// AnkiConnect 同步设置默认配置
	ankiConnect: createDefaultAnkiConnectSettings(),

	// AI配置默认设置（单一事实源：settings-constants.ts 的 DEFAULT_AI_CONFIG）
	aiConfig: { ...DEFAULT_AI_CONFIG },

	// 🆕 牌组标签组配置（用于看板视图按标签组分组）
	deckTagGroups: [],

	// 📊 负荷控制管理默认配置
	loadBalance: {
		dailyCapacity: 100,
		thresholds: {
			low: 0.5,
			normal: 0.8,
			high: 1.2,
		},
		fuzzMethod: "uniform",
		fuzzRangeDays: 2,
		forecast: {
			defaultDays: 14,
			maxDays: 30,
		},
	},

	// 🆕 笔记类型配置（默认使用内置类型）
	noteTypeConfig: undefined, // 首次使用时会自动使用 DEFAULT_NOTE_TYPE_CONFIG
};

type IRQuickCreateSelectionRange = {
	from: { line: number; ch: number };
	to: { line: number; ch: number };
};

type IRQuickCreateContext = {
	file: TFile;
	editor: Editor | null;
	selectedText: string;
	selectionRange: IRQuickCreateSelectionRange | null;
	sourceLink?: string;
	replaceSourceSelection?: boolean;
	successNotice?: string;
	initialTitle?: string;
};

export class WeavePlugin extends Plugin {
	settings!: WeaveSettings;
	dataStorage!: WeaveDataStorage;
	fsrs!: FSRS;
	private irEpubBookmarkTaskService: IREpubBookmarkTaskService | null = null;
	private irPdfBookmarkTaskService: IRPdfBookmarkTaskService | null = null;
	private lastIRSidebarRedirectNoticeAt = 0;
	wasmUrl!: string;
	private legacyApkgRuntimePath: string | null = null;
	private legacyApkgImportAvailable = false;
	editorPoolManager!: EmbeddableEditorManager;
	cardRelationService!: any; // v0.9 卡片关系服务（支持渐进式挖空）
	deckHierarchy!: DeckHierarchyService;
	mediaManager!: MediaManagementService;
	indexManager!: IndexManagerService;
	filterStateService!: FilterStateService; // 🆕 全局筛选状态服务
	dataSyncService!: DataSyncService; // 🆕 全局数据同步服务
	externalSyncWatcher?: ExternalSyncWatcher; // 🆕 外部同步文件变更监听
	deckMembershipIndexService?: import("./services/index/DeckMembershipIndexService").DeckMembershipIndexService;

	// 🆕 v2.1 YAML 元数据服务
	deckNameMapper?: import("./services/DeckNameMapper").DeckNameMapper;
	cardMetadataCache?: import("./services/CardMetadataCache").CardMetadataCache;

	// 🆕 v0.10 题库功能服务
	questionBankStorage?: import("./services/question-bank/QuestionBankStorage").QuestionBankStorage;
	questionBankService?: import("./services/question-bank/QuestionBankService").QuestionBankService;
	questionBankHierarchy?: import("./services/question-bank/QuestionBankHierarchyService").QuestionBankHierarchyService;

	// 🎨 UI管理器 - 统一管理所有全局UI组件的生命周期
	public uiManager!: import("./services/ui/UIManager").UIManager;

	// 🧹 块链接清理系统
	public blockLinkCleanupService!: BlockLinkCleanupService;
	private editorTempFileCleanupService?: EditorTempFileCleanupService;
	private selectedTextAICardPanelManager?: SelectedTextAICardPanelManager;
	private editorAIToolbarManager?: EditorAIToolbarManager;

	// 🚀 高性能数据读取服务
	public directFileReader!: DirectFileCardReader;
	public cardIndexService!: CardIndexService;

	// 📚 增量阅读服务
	public readingMaterialStorage?: import("./services/incremental-reading/ReadingMaterialStorage").ReadingMaterialStorage;
	public readingMaterialManager?: import("./services/incremental-reading/ReadingMaterialManager").ReadingMaterialManager;
	public readingSessionManager?: import("./services/incremental-reading/ReadingSessionManager").ReadingSessionManager;
	public anchorManager?: import("./services/incremental-reading/AnchorManager").AnchorManager;
	public extractCardService?: import("./services/incremental-reading/ExtractCardService").ExtractCardService;
	private irStorageServiceForRename?: IRStorageService;
	// 🆕 v3.0 增量阅读标签组服务
	public irTagGroupService?: import("./services/incremental-reading/IRTagGroupService").IRTagGroupService;

	// 🔄 批量解析自动触发系统（监听文件变更，实时解析）
	// 功能：监听 Markdown 文件的保存事件，自动检测并解析卡片标记，同步到数据库
	// 配置开关：settings.simplifiedParsing.batchParsing.autoTrigger
	// 触发时机：用户保存文件时（带防抖机制）
	private batchParsingWatcher?: BatchParsingFileWatcher;

	// 🆕 批量解析卡片转换器和保存器
	private cardConverter?: ParsedCardConverter;
	private batchCardSaver?: BatchCardSaver;

	// 📋 批量解析手动触发系统（执行批量解析命令，按需处理）
	// 功能：用户主动执行批量解析命令时，扫描指定文件/文件夹，批量创建/更新卡片
	// 相关命令："batch-parse-current-file"（解析当前文件）, "batch-parse-all-mappings"（解析所有映射文件）
	// 核心职责：文件选择、牌组映射、UUID管理、三方合并
	public batchParsingManager?: BatchParsingManager;
	private simplifiedCardParser?: SimplifiedCardParser;

	// ✅ 新建卡片模态窗单例控制（由 UIManager 管理DOM，这里仅保留业务逻辑引用）
	private currentCreateCardModal: {
		instance: any;
		container: HTMLElement;
		updateContent: (content: string, metadata: any) => Promise<void>;
	} | null = null;

	// 🆕 编辑卡片模态窗单例控制（全局显示）
	private currentEditCardModal: {
		instance: any;
		container: HTMLElement;
	} | null = null;

	// 🆕 查看卡片详情模态窗单例控制（Obsidian 原生 modal）
	private currentViewCardModal: { close: () => void } | null = null;

	// AnkiConnect 服务（插件级别持久化）
	public ankiConnectService:
		| import("./services/ankiconnect/AnkiConnectService").AnkiConnectService
		| null = null;

	// 自动备份调度器
	private autoBackupScheduler:
		| import("./services/backup/AutoBackupScheduler").AutoBackupScheduler
		| null = null;

	// 队列优化系统
	public queueOptimizationSystem!: import("./services/queue/QueueOptimizationFactory").QueueOptimizationSystem;

	// 性能优化：牌组数据缓存（避免编辑卡片时重复加载）
	private cachedDecks: import("./data/types").Deck[] = [];

	private sourceTraceNoticeTimer: ReturnType<typeof setTimeout> | null = null;
	private sourceTraceNotice: SafeNotice | null = null;
	private pendingSourceTraceNotice = {
		files: 0,
		links: 0,
		invalidCards: 0,
		epubFiles: 0,
		epubLinks: 0,
	};

	// 引用式牌组系统服务
	public referenceDeckService?: import("./services/reference-deck").ReferenceDeckService;
	public dataConsistencyService?: import("./services/reference-deck").DataConsistencyService;
	public referenceMigrationService?: import("./services/reference-deck").ReferenceMigrationService;
	public cardFileService?: import("./services/reference-deck").CardFileService;
	private workspaceViewsRegistered = false;
	private pluginLocalStateService?: PluginLocalStateService;
	private deckViewPreferenceCache: string | null = null;
	private studyInterfaceViewPreferencesCache: StudyInterfaceViewPreferences | null = null;
	private aiAssistantPreferencesCache: AIAssistantLocalPreferences | null = null;
	private createCardPreferencesCache: CreateCardPreferencesState | null = null;
	private editorModalSizeStateCache: EditorModalSizeState | null = null;
	private aiGenerationHistoryCache: AIGenerationHistoryEntry[] | null = null;

	async refreshLegacyApkgImportRuntimeStatus(): Promise<void> {
		const runtimePath = `${this.manifest.dir}/sql-wasm.wasm`;
		this.legacyApkgRuntimePath = runtimePath;

		const adapter = this.app.vault.adapter;
		const runtimeAvailable =
			typeof adapter.exists === "function" ? await adapter.exists(runtimePath) : false;

		this.legacyApkgImportAvailable = runtimeAvailable;
		this.wasmUrl =
			runtimeAvailable && typeof adapter.getResourcePath === "function"
				? adapter.getResourcePath(runtimePath)
				: "";
	}

	hasLegacyApkgImportRuntime(): boolean {
		return this.legacyApkgImportAvailable;
	}

	getLegacyApkgImportUnavailableMessage(): string {
		return "当前安装包未包含旧版 APKG 导入运行时。社区市场版不提供该附加资源；如需导入旧版 APKG，请改用手动增强安装包并补充 sql-wasm.wasm。";
	}

	async loadSettings() {
		const loadedData = await this.loadData();

		// 深度合并设置，确保嵌套对象正确合并
		this.settings = this.deepMerge(DEFAULT_SETTINGS, loadedData);
		let needsSave = false;

		// 更名迁移：将旧字段名 tuankiParentFolder 映射到 weaveParentFolder
		if ((loadedData as any)?.tuankiParentFolder && !this.settings.weaveParentFolder) {
			this.settings.weaveParentFolder = (loadedData as any).tuankiParentFolder;
			needsSave = true;
		}
		if (this.cleanupLegacyParentFolderSetting(loadedData)) {
			needsSave = true;
		}
		if (this.cleanupLegacyBackupSettings(loadedData)) {
			needsSave = true;
		}
		const normalizedAnkiConnect = normalizeAnkiConnectSettings(this.settings.ankiConnect);
		const hadLegacyAnkiConnectLogFields =
			(normalizedAnkiConnect as any).syncLogs !== undefined ||
			(normalizedAnkiConnect as any).maxLogEntries !== undefined;
		if (hadLegacyAnkiConnectLogFields) {
			delete (normalizedAnkiConnect as any).syncLogs;
			delete (normalizedAnkiConnect as any).maxLogEntries;
			needsSave = true;
		}
		const shouldPersistAnkiConnect =
			JSON.stringify(this.settings.ankiConnect) !== JSON.stringify(normalizedAnkiConnect);
		this.settings.ankiConnect = normalizedAnkiConnect;

		if (shouldPersistAnkiConnect) {
			needsSave = true;
		}

		// 🔥 确保 simplifiedParsing 结构存在（防御性代码）
		if (!this.settings.simplifiedParsing) {
			logger.warn("[Plugin] settings.simplifiedParsing 不存在，使用默认值");
			this.settings.simplifiedParsing = DEFAULT_SIMPLIFIED_PARSING_SETTINGS;
			needsSave = true;
		}

		// 确保 simplifiedParsing.batchParsing 结构存在
		if (!this.settings.simplifiedParsing.batchParsing) {
			logger.warn("[Plugin] settings.simplifiedParsing.batchParsing 不存在，使用默认值");
			this.settings.simplifiedParsing.batchParsing =
				DEFAULT_SIMPLIFIED_PARSING_SETTINGS.batchParsing;
			needsSave = true;
		}

		if (!this.settings.createCardPreferences) {
			this.settings.createCardPreferences = {
				lastSelectedDeckId: "",
				lastSelectedDeckNames: [],
			};
		} else if (!Array.isArray(this.settings.createCardPreferences.lastSelectedDeckNames)) {
			this.settings.createCardPreferences.lastSelectedDeckNames = [];
		}

		if (!this.settings.incrementalReading) {
			this.settings.incrementalReading = {
				defaultIntervalFactor: 1.5,
				dailyNewLimit: 20,
				dailyReviewLimit: 50,
				defaultSplitLevel: 2,
				interleaveMode: true,
				maxConsecutiveSameTopic: 3,
				reviewThreshold: 7,
				maxInterval: 365,
				importFolder: resolveIRImportFolder(undefined, this.settings.weaveParentFolder),
				scheduleStrategy: "processing",
				dailyTimeBudgetMinutes: 40,
				maxAppearancesPerDay: 2,
				enableTagGroupPrior: true,
				agingStrength: "low",
				autoPostponeStrategy: "gentle",
				priorityHalfLifeDays: 7,
				learnAheadDays: 3,
			} as any;
			needsSave = true;
		} else {
			const resolvedImportFolder = resolveIRImportFolder(
				this.settings.incrementalReading.importFolder,
				this.settings.weaveParentFolder
			);
			if (this.settings.incrementalReading.importFolder !== resolvedImportFolder) {
				this.settings.incrementalReading.importFolder = resolvedImportFolder;
				needsSave = true;
			}
		}
		if (needsSave) {
			await this.saveSettings();
		}

		// 🔄 v1.0.0: 统一数据文件夹架构，移除可配置路径

		// 🚀 性能优化：迁移逻辑改为非阻塞异步执行，不影响启动速度
		// 迁移操作在后台执行，失败不影响插件启动
		this.runMigrationsAsync();

		// 初始化国际化系统 - 检测Obsidian语言设置
		initI18n();

		// 注入学习视图间距 CSS 变量
		this.applyStudyViewSpacing();
	}

	/**
	 * 🚀 异步执行所有迁移操作（非阻塞）
	 * 迁移操作在后台执行，不影响插件启动速度
	 */
	private runMigrationsAsync(): void {
		// 使用 setTimeout 确保不阻塞主线程
		setTimeout(async () => {
			try {
				// FSRS6参数迁移逻辑
				await this.migrateFSRSParameters();

				// 许可证数据迁移逻辑
				await this.migrateLicenseData();

				// 分隔符配置迁移逻辑（将 %%<->%% 迁移到 <->）
				await this.migrateDelimiterConfig();

				logger.debug("所有迁移操作已完成");
			} catch (error) {
				logger.error("迁移操作失败（不影响插件启动）:", error);
			}
		}, 100); // 延迟100ms执行，确保插件主流程先完成
	}

	/**
	 * 🔧 FSRS6参数迁移逻辑
	 * 检测并修复权重参数数量不一致和范围错误的问题
	 */
	private async migrateFSRSParameters(): Promise<void> {
		try {
			const currentWeights = this.settings.fsrsParams?.w;
			const expectedCount = 21; // FSRS6标准参数数量

			if (!currentWeights || !Array.isArray(currentWeights)) {
				// 保留历史记录和待确认优化
				const existingHistory = this.settings.fsrsParams?.optimizationHistory;
				const existingPending = this.settings.fsrsParams?.pendingOptimization;

				// 如果没有权重参数，使用默认值
				this.settings.fsrsParams = {
					...this.settings.fsrsParams,
					w: [...DEFAULT_SETTINGS.fsrsParams.w],
					// 恢复历史数据
					optimizationHistory: existingHistory || [],
					pendingOptimization: existingPending,
				};
				logger.info("FSRS参数已初始化");
				await this.saveSettings();
				return;
			}

			// 检查参数数量
			let needsMigration = false;
			let migrationReason = "";

			if (currentWeights.length !== expectedCount) {
				needsMigration = true;
				migrationReason = `参数数量不匹配 (当前: ${currentWeights.length}, 期望: ${expectedCount})`;
			} else {
				// 检查参数范围（使用简化的范围检查）
				const invalidParams = currentWeights.some((weight, index) => {
					if (typeof weight !== "number" || Number.isNaN(weight)) {
						return true;
					}
					// 特别检查w7参数（难度衰减）必须在[0, 0.5]范围内
					if (index === 7 && (weight < 0 || weight > 0.5)) {
						return true;
					}
					// 基本范围检查：所有参数应该是合理的正数（除了某些可以为0的参数）
					if (weight < -10 || weight > 100) {
						return true;
					}
					return false;
				});

				if (invalidParams) {
					needsMigration = true;
					migrationReason = "检测到无效的参数值（超出合理范围）";
				}
			}

			if (needsMigration) {
				logger.info("FSRS参数已优化");

				// 使用标准FSRS6参数
				this.settings.fsrsParams.w = [...DEFAULT_SETTINGS.fsrsParams.w];

				// 验证其他FSRS参数
				if (
					typeof this.settings.fsrsParams.requestRetention !== "number" ||
					this.settings.fsrsParams.requestRetention < 0.5 ||
					this.settings.fsrsParams.requestRetention > 0.99
				) {
					this.settings.fsrsParams.requestRetention = DEFAULT_SETTINGS.fsrsParams.requestRetention;
				}

				if (
					typeof this.settings.fsrsParams.maximumInterval !== "number" ||
					this.settings.fsrsParams.maximumInterval < 1 ||
					this.settings.fsrsParams.maximumInterval > 1825
				) {
					// 上限5年，参考Anki社区实践
					this.settings.fsrsParams.maximumInterval = DEFAULT_SETTINGS.fsrsParams.maximumInterval;
				}

				// 保存迁移后的设置
				await this.saveSettings();

				// 显示用户通知
				if (this.settings.enableNotifications) {
					setTimeout(() => {
						new Notice(`FSRS6参数已自动修复（${migrationReason}）`, 5000);
					}, 2000);
				}
			}
		} catch (error) {
			logger.error("FSRS参数迁移失败", error);
			// 保留历史记录
			const existingHistory = this.settings.fsrsParams?.optimizationHistory;
			const existingPending = this.settings.fsrsParams?.pendingOptimization;

			// 如果迁移失败，强制使用默认参数
			this.settings.fsrsParams = {
				...DEFAULT_SETTINGS.fsrsParams,
				optimizationHistory: existingHistory || [],
				pendingOptimization: existingPending,
			};
			await this.saveSettings();
			logger.info("FSRS参数已重置为默认值");
		}
	}

	/**
	 * 🔒 许可证数据迁移逻辑
	 * 确保许可证数据结构完整性，自动补全缺失字段
	 */
	private async migrateLicenseData(): Promise<void> {
		try {
			const license = this.settings.license;

			if (!license) {
				logger.warn("许可证数据不存在，使用默认值");
				this.settings.license = DEFAULT_LICENSE_INFO;
				await this.saveSettings();
				return;
			}

			let needsSave = false;

			// 检查并补全必需字段
			if (license.activationCode === undefined) {
				license.activationCode = "";
				needsSave = true;
			}
			if (license.isActivated === undefined) {
				license.isActivated = false;
				needsSave = true;
			}
			if (license.activatedAt === undefined) {
				license.activatedAt = "";
				needsSave = true;
			}
			if (license.deviceFingerprint === undefined) {
				license.deviceFingerprint = "";
				needsSave = true;
			}
			if (license.expiresAt === undefined) {
				license.expiresAt = "";
				needsSave = true;
			}
			if (license.productVersion === undefined) {
				license.productVersion = "";
				needsSave = true;
			}
			if (license.licenseType === undefined) {
				license.licenseType = "lifetime";
				needsSave = true;
			}

			// 可选字段默认为 undefined（不强制补全）
			// fingerprintVersion, boundEmail, cloudSync

			if (needsSave) {
				logger.info("许可证数据已自动补全缺失字段");
				await this.saveSettings();
			}
		} catch (error) {
			logger.error("许可证数据迁移失败", error);
		}
	}

	/**
	 * 启动数据目录迁移（五阶段）
	 *
	 * 阶段0: weave/ → weave/（插件更名迁移）
	 * 阶段1: .weave → weave/（旧隐藏目录）
	 * 阶段2: weave/_data/* → weave/*（去掉 _data/ 中间层）
	 * 阶段3: weave/IR → weave/incremental-reading/IR（IR 归入增量阅读模块）
	 * 阶段4: 隐藏标记文件重命名（去掉点前缀）
	 */
	private async migrateLegacyToWeaveDataFolder(): Promise<void> {
		const adapter: any = this.app.vault.adapter as any;
		const parentFolder = normalizeWeaveParentFolder(this.settings?.weaveParentFolder);
		const targetRoot = getReadableWeaveRoot(parentFolder);

		const conflictsRoot = `${targetRoot}/_migration_conflicts`;

		// ===== 工具函数 =====

		const safeCopyFile = async (fromPath: string, toPath: string): Promise<void> => {
			try {
				if (typeof adapter.readBinary === "function" && typeof adapter.writeBinary === "function") {
					const bin = await adapter.readBinary(fromPath);
					await adapter.writeBinary(toPath, bin);
					return;
				}
			} catch {
				/* fall back */
			}
			const text = await adapter.read(fromPath);
			await adapter.write(toPath, text);
		};

		const ensureDirForFile = async (filePath: string): Promise<void> => {
			const slash = filePath.lastIndexOf("/");
			if (slash <= 0) return;
			await DirectoryUtils.ensureDirRecursive(adapter, filePath.slice(0, slash));
		};

		const moveFileWithConflict = async (
			fromPath: string,
			toPath: string,
			sourceWins = false
		): Promise<"moved" | "conflict"> => {
			if (!(await adapter.exists(toPath))) {
				await safeCopyFile(fromPath, toPath);
				try {
					await adapter.remove(fromPath);
				} catch {}
				return "moved";
			}
			await DirectoryUtils.ensureDirRecursive(adapter, conflictsRoot);
			if (sourceWins) {
				const safeName = toPath.replace(/[\\/:]/g, "_").replace(/^\.+/, "");
				await safeCopyFile(toPath, `${conflictsRoot}/${safeName}-${Date.now()}`);
				await safeCopyFile(fromPath, toPath);
				try {
					await adapter.remove(fromPath);
				} catch {}
				return "moved";
			}
			const safeName = fromPath.replace(/[\\/:]/g, "_").replace(/^\.+/, "");
			await safeCopyFile(fromPath, `${conflictsRoot}/${safeName}-${Date.now()}`);
			try {
				await adapter.remove(fromPath);
			} catch {}
			return "conflict";
		};

		const mergeFolderTo = async (
			fromRoot: string,
			toRoot: string,
			sourceWins = false
		): Promise<{ moved: number; conflicts: number }> => {
			let moved = 0;
			let conflicts = 0;
			const walk = async (dir: string): Promise<void> => {
				let listing: any;
				try {
					listing = await adapter.list(dir);
				} catch {
					return;
				}
				for (const folder of listing?.folders || []) {
					await walk(folder);
				}
				for (const file of listing?.files || []) {
					const relative = file.startsWith(fromRoot)
						? file.slice(fromRoot.length).replace(/^\//, "")
						: file;
					const targetPath = `${toRoot}/${relative}`;
					await ensureDirForFile(targetPath);
					const result = await moveFileWithConflict(file, targetPath, sourceWins);
					if (result === "moved") moved++;
					else conflicts++;
				}
			};
			await walk(fromRoot);
			return { moved, conflicts };
		};

		const tryRemoveEmptyFolderDeep = async (dir: string): Promise<void> => {
			let listing: any;
			try {
				listing = await adapter.list(dir);
			} catch {
				return;
			}
			for (const folder of listing?.folders || []) {
				await tryRemoveEmptyFolderDeep(folder);
			}
			try {
				const after = await adapter.list(dir);
				if ((after?.files || []).length === 0 && (after?.folders || []).length === 0) {
					if (typeof adapter.rmdir === "function") await adapter.rmdir(dir, false);
					else if (typeof adapter.remove === "function") await adapter.remove(dir);
				}
			} catch {}
		};

		let movedTotal = 0;
		let conflictTotal = 0;

		// ===== 阶段0: tuanki/ → weave/（插件更名迁移）=====
		const oldWeaveCandidates = new Set<string>();
		oldWeaveCandidates.add("tuanki");
		if (parentFolder) oldWeaveCandidates.add(`${parentFolder}/tuanki`);

		for (const oldPath of oldWeaveCandidates) {
			try {
				if (oldPath && oldPath !== targetRoot && (await adapter.exists(oldPath))) {
					await DirectoryUtils.ensureDirRecursive(adapter, targetRoot);
					const stats = await mergeFolderTo(oldPath, targetRoot, true);
					movedTotal += stats.moved;
					conflictTotal += stats.conflicts;
					await tryRemoveEmptyFolderDeep(oldPath);
					logger.info(
						`[Migration] Phase0 weave->weave: ${oldPath} -> ${targetRoot}, moved=${stats.moved}`
					);
				}
			} catch (error) {
				logger.warn(`[Migration] Phase0 weave->weave failed: ${oldPath}`, error);
			}
		}

		// ===== 阶段1: .weave → weave/ =====
		const dotWeaveCandidates = new Set<string>();
		dotWeaveCandidates.add(LEGACY_DOT_TUANKI);
		if (parentFolder) dotWeaveCandidates.add(`${parentFolder}/${LEGACY_DOT_TUANKI}`);
		try {
			const top = await adapter.list("");
			for (const f of top?.folders || []) {
				if (f) dotWeaveCandidates.add(`${f}/${LEGACY_DOT_TUANKI}`);
			}
		} catch {}

		for (const legacy of dotWeaveCandidates) {
			try {
				if (legacy && legacy !== targetRoot && (await adapter.exists(legacy))) {
					await DirectoryUtils.ensureDirRecursive(adapter, targetRoot);
					const stats = await mergeFolderTo(legacy, targetRoot);
					movedTotal += stats.moved;
					conflictTotal += stats.conflicts;
					await tryRemoveEmptyFolderDeep(legacy);
					logger.info(
						`[Migration] Phase1 .weave: ${legacy} -> ${targetRoot}, moved=${stats.moved}`
					);
				}
			} catch (error) {
				logger.warn(`[Migration] Phase1 failed: ${legacy}`, error);
			}
		}

		// ===== 阶段2: weave/_data/* → weave/*（_data 版本优先，因为是 v2.x 运行时数据） =====
		const dataSubdir = getMachineWeaveRoot(parentFolder);
		try {
			if (dataSubdir !== targetRoot && (await adapter.exists(dataSubdir))) {
				const stats = await mergeFolderTo(dataSubdir, targetRoot, true);
				movedTotal += stats.moved;
				conflictTotal += stats.conflicts;
				await tryRemoveEmptyFolderDeep(dataSubdir);
				logger.info(
					`[Migration] Phase2 _data uplift: ${dataSubdir} -> ${targetRoot}, moved=${stats.moved}`
				);
			}
		} catch (error) {
			logger.warn("[Migration] Phase2 _data uplift failed", error);
		}

		// ===== 阶段3: weave/IR → weave/incremental-reading/IR =====
		const legacyIR = `${targetRoot}/IR`;
		const newIR = `${targetRoot}/incremental-reading/IR`;
		try {
			if (await adapter.exists(legacyIR)) {
				await DirectoryUtils.ensureDirRecursive(adapter, newIR);
				const stats = await mergeFolderTo(legacyIR, newIR);
				movedTotal += stats.moved;
				conflictTotal += stats.conflicts;
				await tryRemoveEmptyFolderDeep(legacyIR);
				logger.info(`[Migration] Phase3 IR move: ${legacyIR} -> ${newIR}, moved=${stats.moved}`);
			}
		} catch (error) {
			logger.warn("[Migration] Phase3 IR move failed", error);
		}

		// ===== 阶段4: 隐藏标记文件重命名（去掉点前缀） =====
		const dotFileRenames: Array<[string, string]> = [
			[`${targetRoot}/.schema-version`, `${targetRoot}/schema-version.json`],
			[`${targetRoot}/schema-version`, `${targetRoot}/schema-version.json`],
			[`${targetRoot}/.migration-completed`, `${targetRoot}/migration-completed`],
		];
		for (const [oldPath, newPath] of dotFileRenames) {
			try {
				if ((await adapter.exists(oldPath)) && !(await adapter.exists(newPath))) {
					await safeCopyFile(oldPath, newPath);
					await adapter.remove(oldPath);
					movedTotal++;
					logger.info(`[Migration] Phase4 rename: ${oldPath} -> ${newPath}`);
				}
			} catch (error) {
				logger.warn(`[Migration] Phase4 rename failed: ${oldPath}`, error);
			}
		}

		if (movedTotal > 0 || conflictTotal > 0) {
			logger.info(
				`[Migration] 完成: moved=${movedTotal}, conflicts=${conflictTotal}, target=${targetRoot}`
			);
			new Notice(
				`Weave: 数据目录已迁移至新结构（${movedTotal} 文件${
					conflictTotal > 0 ? `，冲突 ${conflictTotal}` : ""
				}）`,
				5000
			);
		}
	}

	/**
	 * 🔧 分隔符配置迁移逻辑
	 * 将旧的分隔符 %%<->%% 自动迁移到新的 <-> 分隔符
	 * 迁移范围：
	 * 1. 全局分隔符配置
	 * 2. 预设模板中的分隔符
	 * 3. 映射配置中的分隔符
	 */
	private async runUnifiedDataMigration(): Promise<void> {
		const migrationService = new UnifiedDataMigrationService(this.app, this.settings);
		const plan = await migrationService.planDataMigration({ reason: "startup-auto" });
		if (!plan.requiresMigration) return;

		const report = await migrationService.executeDataMigration(plan);
		await this.saveSettings();

		if (report.movedFiles > 0 || report.conflicts > 0) {
			logger.info(
				`[Migration] Unified migration completed: moved=${report.movedFiles}, conflicts=${report.conflicts}, target=${report.plan.targetRoot}`
			);
			new Notice(
				`Weave: 数据目录已迁移到 ${report.plan.targetRoot}（迁移 ${report.movedFiles} 个文件${
					report.conflicts > 0 ? `，冲突 ${report.conflicts}` : ""
				}）`,
				6000
			);
		}
	}

	private async recoverMigrationConflictsOnStartup(): Promise<void> {
		try {
			const dataManagementService = new DataManagementService(this as any);
			const recovered = await dataManagementService.recoverMigrationConflictData();
			const hasRecoveredData = recovered.importedCards > 0 || recovered.importedDecks > 0;
			const hasCleanupWork =
				recovered.deletedCardFiles > 0 ||
				recovered.mergedCardFiles > 0 ||
				recovered.renamedManifests > 0;

			if (hasRecoveredData) {
				logger.info(
					`[Migration] Recovered conflict data on startup: cards=${recovered.importedCards}, decks=${recovered.importedDecks}`
				);
				new Notice(
					`Weave: 已自动恢复迁移冲突数据（卡片 ${recovered.importedCards}，牌组 ${recovered.importedDecks}）`,
					7000
				);
			} else if (hasCleanupWork) {
				logger.info(
					`[Migration] Cleaned migration leftovers on startup: deletedCardFiles=${recovered.deletedCardFiles}, mergedCardFiles=${recovered.mergedCardFiles}, renamedManifests=${recovered.renamedManifests}`
				);
			}

			if (recovered.errors.length > 0) {
				for (const error of recovered.errors) {
					logger.warn("[Migration] Startup conflict recovery warning:", error);
				}
				if (!hasRecoveredData) {
					new Notice("Weave: 检测到迁移冲突副本，但自动恢复未完全成功，请在数据管理中检查", 8000);
				}
			}
		} catch (error) {
			logger.error("[Migration] Failed to recover migration conflicts on startup:", error);
			new Notice("Weave: 检测到迁移冲突副本，但自动恢复失败，请在数据管理中检查", 8000);
		}
	}

	private initializeBlockLinkCleanupService(): void {
		try {
			this.blockLinkCleanupService = BlockLinkCleanupService.getInstance();
			this.blockLinkCleanupService.initialize({
				dataStorage: this.dataStorage,
				vault: this.app.vault,
				app: this.app,
			});
			logger.info("块链接清理服务已初始化");
		} catch (error) {
			logger.error("块链接清理系统初始化失败:", error);
		}
	}

	private async migrateDelimiterConfig(): Promise<void> {
		try {
			const OLD_DELIMITER = "%%<->%%";
			const NEW_DELIMITER = "<->";
			let needsMigration = false;
			let migrationCount = 0;
			const migrationDetails: string[] = [];

			// 1. 迁移全局分隔符配置
			if (this.settings.simplifiedParsing?.symbols?.cardDelimiter === OLD_DELIMITER) {
				this.settings.simplifiedParsing.symbols.cardDelimiter = NEW_DELIMITER;
				needsMigration = true;
				migrationCount++;
				migrationDetails.push("全局分隔符配置");
			}

			// 2. 迁移预设模板中的分隔符
			if (
				this.settings.simplifiedParsing?.regexPresets &&
				Array.isArray(this.settings.simplifiedParsing.regexPresets)
			) {
				for (let i = 0; i < this.settings.simplifiedParsing.regexPresets.length; i++) {
					const preset = this.settings.simplifiedParsing.regexPresets[i];
					let presetUpdated = false;

					// 检查 separatorMode 中的 cardSeparator
					if (preset.separatorMode?.cardSeparator === OLD_DELIMITER) {
						preset.separatorMode.cardSeparator = NEW_DELIMITER;
						presetUpdated = true;
						migrationCount++;
					}

					if (presetUpdated) {
						needsMigration = true;
						migrationDetails.push(`预设模板 "${preset.name || `预设${i + 1}`}"`);
					}
				}
			}

			// 3. 迁移映射配置中的分隔符
			if (
				this.settings.simplifiedParsing?.batchParsing?.folderDeckMappings &&
				Array.isArray(this.settings.simplifiedParsing.batchParsing.folderDeckMappings)
			) {
				for (
					let i = 0;
					i < this.settings.simplifiedParsing.batchParsing.folderDeckMappings.length;
					i++
				) {
					const mapping = this.settings.simplifiedParsing.batchParsing.folderDeckMappings[i];
					let mappingUpdated = false;

					// 检查 multiCardsConfig 中的分隔符
					if ((mapping as any).multiCardsConfig?.parsingConfig) {
						const parsingConfig = (mapping as any).multiCardsConfig.parsingConfig;

						if (parsingConfig.separatorMode?.cardSeparator === OLD_DELIMITER) {
							parsingConfig.separatorMode.cardSeparator = NEW_DELIMITER;
							mappingUpdated = true;
							migrationCount++;
						}

						if (parsingConfig.patternMode?.cardSeparator === OLD_DELIMITER) {
							parsingConfig.patternMode.cardSeparator = NEW_DELIMITER;
							mappingUpdated = true;
							migrationCount++;
						}

						if (mappingUpdated) {
							needsMigration = true;
							const mappingPath = mapping.path || mapping.folderPath || `映射${i + 1}`;
							migrationDetails.push(`映射配置 "${mappingPath}"`);
						}
					}
				}
			}

			// 如果有迁移，保存配置
			if (needsMigration) {
				await this.saveSettings();
				logger.info(`配置已更新 (${migrationCount}处)`);

				// 显示用户通知
				if (this.settings.enableNotifications) {
					setTimeout(() => {
						new Notice(
							`✅ 分隔符配置已自动迁移\n已将 ${migrationCount} 处 %%<->%% 更新为 <->`,
							5000
						);
					}, 2000);
				}
			}
		} catch (error) {
			logger.error("分隔符配置迁移失败", error);
			// 迁移失败不影响插件启动，仅记录错误
		}
	}

	/**
	 * 深度合并对象，确保嵌套对象正确合并
	 */
	private deepMerge(target: any, source: any): any {
		const result = { ...target };

		for (const key in source) {
			if (Object.hasOwn(source, key)) {
				if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
					// 递归合并嵌套对象
					result[key] = this.deepMerge(target[key] || {}, source[key]);
				} else {
					// 直接赋值
					result[key] = source[key];
				}
			}
		}

		return result;
	}

	/**
	 * 将学习视图间距设置注入为 CSS 变量
	 */
	applyStudyViewSpacing() {
		const spacingMap: Record<string, string> = {
			compact: "12px",
			default: "20px",
			comfortable: "32px",
		};
		const value = spacingMap[this.settings.studyViewSpacing ?? "compact"] ?? "12px";
		document.documentElement.style.setProperty("--weave-study-view-spacing", value);
	}

	async saveSettings() {
		// 更新日志管理器的调试模式
		logger.setDebugMode(this.settings.enableDebugMode || false);

		await this.saveData(this.settings);

		// 同步学习视图间距 CSS 变量
		this.applyStudyViewSpacing();

		// 🔄 同步设置到 SimplifiedCardParser 实例
		if (this.simplifiedCardParser && this.settings.simplifiedParsing) {
			this.simplifiedCardParser.updateSettings(this.settings.simplifiedParsing);
		}

		// 🔄 同步设置到 BatchParsingManager 实例
		if (this.batchParsingManager && this.settings.simplifiedParsing) {
			this.batchParsingManager.updateParserSettings(this.settings.simplifiedParsing);
		}

		// 更新高级功能守卫的许可证状态
		const premiumGuard = PremiumFeatureGuard.getInstance();
		await premiumGuard.updateLicense(this.settings.license);
		premiumGuard.setPremiumFeaturesPreview(this.settings.showPremiumFeaturesPreview ?? false);

		// 🆕 重新初始化批量解析监听器（如果设置变更）
		if (this.batchParsingWatcher) {
			this.batchParsingWatcher.destroy();
		}
		await this.initBatchParsingWatcher();

		// v3.1: 同步标注信号配置到单例服务
		try {
			const { syncAnnotationSignalFromSettings } = await import(
				"./services/incremental-reading/IRAnnotationSignalService"
			);
			syncAnnotationSignalFromSettings(this.settings?.incrementalReading?.calloutSignal);
		} catch {
			// 静默失败，标注信号服务可能尚未初始化
		}
	}

	/**
	 * 🆕 分类系统数据迁移
	 * 将旧的 category 字段迁移到新的 categoryIds 数组
	 */
	async migrateDeckCategories(): Promise<void> {
		try {
			const { getCategoryStorage } = await import("./data/CategoryStorage");
			const categoryStorage = getCategoryStorage();
			await categoryStorage.initialize();
			const categories = await categoryStorage.getCategories();

			if (categories.length === 0) {
				return;
			}

			const decks = await this.dataStorage.getDecks();
			let migratedCount = 0;

			for (const deck of decks) {
				// 跳过已有 categoryIds 的牌组
				if (deck.categoryIds && deck.categoryIds.length > 0) {
					continue;
				}

				// 尝试匹配旧的 category 字段
				if (deck.category) {
					const matchedCategory = categories.find(
						(c) => c.name === deck.category || c.id === deck.category
					);

					if (matchedCategory) {
						deck.categoryIds = [matchedCategory.id];
						await this.dataStorage.saveDeck(deck);
						migratedCount++;
					} else {
						// 未匹配到分类，分配到第一个默认分类
						deck.categoryIds = [categories[0].id];
						await this.dataStorage.saveDeck(deck);
						migratedCount++;
					}
				} else {
					// 无旧分类，分配到第一个默认分类
					deck.categoryIds = [categories[0].id];
					await this.dataStorage.saveDeck(deck);
					migratedCount++;
				}
			}

			if (migratedCount > 0) {
				logger.info(`分类迁移完成 (${migratedCount}/${decks.length})`);
			}
		} catch (error) {
			logger.error("[CategoryMigration] 迁移失败:", error);
			// 迁移失败不影响插件加载
		}
	}

	/**
	 * 验证许可证
	 */
	async validateLicense(): Promise<void> {
		try {
			if (this.settings.license.isActivated) {
				const result = await licenseManager.validateCurrentLicense(this.settings.license);
				if (!result.isValid) {
					logger.warn("许可证验证失败:", result.error);
					// 重置许可证状态
					this.settings.license.isActivated = false;
					await this.saveSettings();

					// 显示许可证失效通知
					this.showLicenseExpiredNotice(result.error || "许可证验证失败");
				} else if (result.warnings?.includes("设备指纹已自动更新到新版本")) {
					// 🔧 设备指纹迁移后自动保存
					await this.saveSettings();
				}
			}
		} catch (error) {
			logger.error("许可证验证过程中发生错误:", error);
		}
	}

	/**
	 * 显示许可证失效通知
	 */
	private showLicenseExpiredNotice(message: string): void {
		const notice = createSafeNotice(`许可证失效: ${message}`, 0);

		// 创建一个按钮来打开设置
		const fragment = document.createDocumentFragment();
		const text = document.createTextNode(`许可证失效: ${message} `);
		const button = document.createElement("button");
		button.textContent = "前往设置";
		button.classList.add("weave-ml-sm");
		button.onclick = () => {
			// 使用安全的设置打开方法
			safeOpenSettings(this.app, "weave");

			// 使用安全的 Notice 隐藏方法
			notice.hide();
		};

		fragment.appendChild(text);
		fragment.appendChild(button);

		// 安全地添加到 Notice 元素
		try {
			const extendedNotice = notice as unknown as ExtendedNotice;
			const noticeEl = extendedNotice.notice?.noticeEl;
			if (noticeEl) {
				noticeEl.empty();
				noticeEl.appendChild(fragment);
			}
		} catch (error) {
			logger.warn("添加按钮到 Notice 失败:", error);
		}
	}

	/**
	 * 🔒 检查并执行许可证验证
	 * 在使用插件时调用，根据上次验证时间决定是否触发云端验证
	 */
	async checkAndValidateLicense(): Promise<boolean> {
		try {
			if (!this.settings.license.isActivated) {
				return false;
			}

			// 检查是否需要验证（基于时间间隔）
			const needsValidation = this.needsLicenseValidation();

			if (needsValidation) {
				const result = await licenseManager.validateCurrentLicense(this.settings.license);

				if (!result.isValid) {
					logger.warn("许可证验证失败:", result.error);
					this.settings.license.isActivated = false;
					await this.saveSettings();
					this.showLicenseExpiredNotice(result.error || "许可证验证失败");
					return false;
				}

				// 验证成功，保存更新的验证时间
				await this.saveSettings();
			}

			return true;
		} catch (error) {
			logger.error("许可证验证过程中发生错误:", error);
			return false;
		}
	}

	/**
	 * 🔒 判断是否需要执行许可证验证（基于7天间隔）
	 */
	private needsLicenseValidation(): boolean {
		const license = this.settings.license;

		if (!license.cloudSync?.lastValidatedAt) {
			return true; // 无验证记录，需要验证
		}

		const lastValidated = new Date(license.cloudSync.lastValidatedAt).getTime();
		const now = Date.now();
		const daysSinceValidation = (now - lastValidated) / (1000 * 60 * 60 * 24);

		// 超过7天，需要验证
		return daysSinceValidation > 7;
	}

	/**
	 * 检查是否为试用版
	 */
	isTrialVersion(): boolean {
		return licenseManager.isTrialVersion(this.settings.license);
	}

	/**
	 * 获取许可证状态
	 */
	getLicenseStatus(): { isValid: boolean; isActivated: boolean; remainingDays?: number } {
		if (!this.settings.license.isActivated) {
			return { isValid: false, isActivated: false };
		}

		const remainingDays = licenseManager.getLicenseRemainingDays(this.settings.license);
		return {
			isValid: remainingDays > 0,
			isActivated: true,
			remainingDays,
		};
	}

	// 🔄 v0.9.0 → v1.0.0 数据迁移已整合到 SchemaV2MigrationService

	/**
	 * 🔄 v2.0.0: Schema V2 数据结构规范化迁移
	 *
	 * 基于文件内容检测的安全数据迁移，将数据结构迁移到 V2.0 规范：
	 * - 记忆牌组数据 → weave/memory/
	 * - 增量阅读数据 → weave/incremental-reading/
	 * - 配置/索引/缓存 → .obsidian/plugins/weave/
	 */
	private async migrateToSchemaV2(): Promise<void> {
		try {
			const { SchemaV2MigrationService } = await import(
				"./services/data-migration/SchemaV2MigrationService"
			);
			const migrationService = new SchemaV2MigrationService(this.app);

			// 检查是否需要迁移
			const needsMigration = await migrationService.needsMigration({
				allowWhenSchemaUpToDate: true,
			});
			if (!needsMigration) {
				logger.debug("[Schema V2] 无需迁移，数据结构已是最新版本");
				return;
			}

			logger.info("[Schema V2] 检测到旧版本数据结构，开始迁移...");
			new Notice("Weave: 正在进行数据结构升级，请稍候...", 5000);

			const result = await migrationService.migrate();

			if (result.success) {
				logger.info(`✅ [Schema V2] 迁移完成: ${result.migratedCount} 项成功`);
			} else {
				logger.warn(
					`⚠️ [Schema V2] 迁移部分完成: ${result.migratedCount} 成功, ${result.failedCount} 失败`
				);
				if (result.errors.length > 0) {
					logger.warn("[Schema V2] 错误详情:", result.errors.slice(0, 5).join(", "));
				}
			}
		} catch (error) {
			logger.error("❌ [Schema V2] 迁移过程出错:", error);
			// 不抛出错误，允许插件继续运行
			new Notice("Weave: 数据结构升级遇到问题，插件将继续运行", 5000);
		}
	}

	/**
	 * 初始化数据存储及依赖服务（在 workspace.onLayoutReady 后调用）
	 *
	 * 此方法在 Obsidian 文件系统完全就绪后执行，确保：
	 * 1. vault.getAbstractFileByPath() 能准确查询文件夹
	 * 2. vault.createFolder() 创建的文件夹立即在 UI 中可见
	 * 3. 避免文件系统缓存不一致导致的显示问题
	 */
	private async initializeDataStorage(): Promise<void> {
		try {
			logger.info("🚀 [Layout Ready] 文件系统已就绪，开始初始化数据存储...");

			// v3.0.0: 五阶段迁移（tuanki→weave、.tuanki→weave、_data上移、IR归位、隐藏标记重命名）
			await this.runUnifiedDataMigration();

			// v2.0.0: Schema V2 数据结构规范化迁移（已整合旧版迁移）
			await this.migrateToSchemaV2();
			await migrateLegacyWeaveFolders(this.app, this.settings.weaveParentFolder);

			// 🔥 预先初始化 CardFileService，避免 dataStorage 在启动时读不到 V2 卡片文件
			try {
				const { initCardFileService } = await import("./services/reference-deck");
				if (!this.cardFileService) {
					this.cardFileService = initCardFileService(this);
				}
				await this.cardFileService.initialize();
			} catch (error) {
				logger.error("[Layout Ready] CardFileService 预初始化失败（不阻塞启动）:", error);
			}

			await this.recoverMigrationConflictsOnStartup();

			// 1. 初始化数据存储
			this.dataStorage = new WeaveDataStorage(this as any);
			await this.dataStorage.initialize();
			logger.info("✅ 数据存储初始化完成");
			await this.refreshCardSourceTrackingOnStartup();

			// 尽早初始化统一清理服务，避免删卡早于 deferred 初始化时漏掉源文档清理
			this.initializeBlockLinkCleanupService();

			// 标记 dataStorage 已就绪（通知等待中的视图）
			const { markServiceReady } = await import("./utils/service-ready-event");
			markServiceReady("dataStorage");

			// v2.1.3: 卡片内容迁移（we_source + we_block 合并）
			try {
				const { CardContentMigrationService } = await import(
					"./services/migration/CardContentMigrationService"
				);
				await CardContentMigrationService.autoMigrate(this.dataStorage);
			} catch (error) {
				logger.error("❌ [卡片内容迁移] 迁移过程出错:", error);
			}

			// 3. 初始化依赖数据存储的服务
			await this.initializeServicesAfterStorage();

			// 🔥 标记所有核心服务已就绪
			markServiceReady("allCoreServices");

			logger.info("✅ 所有依赖数据存储的服务初始化完成");
		} catch (error) {
			logger.error("❌ 数据存储初始化失败:", error);
			new Notice("Weave 插件数据初始化失败，请重启 Obsidian", 8000);
			throw error; // 抛出错误，阻止后续初始化
		}
	}

	/**
	 * 🔥 初始化依赖数据存储的服务
	 *
	 * 这些服务必须在 dataStorage 初始化完成后才能初始化
	 */
	private async initializeServicesAfterStorage(): Promise<void> {
		const startTime = Date.now();
		logger.info("[Services] 🚀 开始初始化依赖数据存储的服务...");

		// ========== 阶段1：核心服务（必须同步初始化）==========
		// 1. 初始化需要数据存储的核心服务
		this.deckHierarchy = new DeckHierarchyService(this.dataStorage);
		this.mediaManager = new MediaManagementService(this, this.dataStorage);
		await this.mediaManager.initialize();
		logger.debug("[Services] MediaManagementService 已初始化");

		// 2. 🆕 v0.9: 初始化卡片关系服务（支持渐进式挖空）- 核心服务
		const { CardRelationService } = await import("./services/relation");
		this.cardRelationService = new CardRelationService(this.dataStorage);
		logger.debug("[Services] 卡片关系服务初始化完成");

		const coreServicesTime = Date.now() - startTime;
		logger.debug(`[Services] 核心服务初始化完成: ${coreServicesTime}ms`);

		// ========== 阶段2：并行初始化独立服务（非阻塞）==========
		// 这些服务相互独立，可以并行初始化
		const parallelInitPromises: Promise<void>[] = [];

		// 2.1 队列优化系统（异步非阻塞）
		parallelInitPromises.push(
			(async () => {
				try {
					const { QueueOptimizationFactory } = await import(
						"./services/queue/QueueOptimizationFactory"
					);
					this.queueOptimizationSystem = QueueOptimizationFactory.createFromPluginSettings(
						this.settings
					);
					logger.debug("[Services] Queue Optimization System initialized");
				} catch (error) {
					logger.error("[Services] Queue Optimization System initialization failed:", error);
					const { QueueOptimizationFactory } = await import(
						"./services/queue/QueueOptimizationFactory"
					);
					this.queueOptimizationSystem = QueueOptimizationFactory.createDefault();
				}
			})()
		);

		// 2.2 题库服务（异步非阻塞）
		parallelInitPromises.push(
			(async () => {
				try {
					const { QuestionBankMigration } = await import("./utils/question-bank-migration");
					await QuestionBankMigration.autoMigrate(this);

					const { QuestionBankStorage, QuestionBankService, QuestionBankHierarchyService } =
						await import("./services/question-bank");

					this.questionBankStorage = new QuestionBankStorage(this.app);
					await this.questionBankStorage.initialize();

					this.questionBankService = new QuestionBankService(
						this.questionBankStorage,
						this.dataStorage
					);
					await this.questionBankService.initialize();

					this.questionBankHierarchy = new QuestionBankHierarchyService(
						this.dataStorage,
						this.questionBankService
					);

					// 注册同步钩子
					this.deckHierarchy.registerSyncHook({
						onMove: async (deckId: string, newParentId: string | null) => {
							await this.questionBankHierarchy?.syncMove(deckId, newParentId);
						},
						onRename: async (deckId: string, newName: string) => {
							await this.questionBankHierarchy?.syncRename(deckId, newName);
						},
						onDelete: async (deckId: string) => {
							await this.questionBankHierarchy?.syncDelete(deckId);
						},
					});

					// 🔥 标记题库服务已就绪
					const { markServiceReady } = await import("./utils/service-ready-event");
					markServiceReady("questionBankService");

					logger.debug("[Services] Question Bank services initialized");

					// 数据完整性检查（延迟执行，不阻塞启动）
					setTimeout(async () => {
						try {
							const banks = (await this.questionBankService?.getAllBanks()) ?? [];
							const hasCorruptedData = banks.some((_bank) => typeof _bank === "string");
							if (hasCorruptedData) {
								logger.warn("[QuestionBank] 检测到损坏的题库数据，正在清理...");
								await this.questionBankStorage?.saveBanks([]);
								await this.questionBankService?.initialize();
								logger.info("[QuestionBank] 数据已清理");
							}

							// 🆕 修复缺失的 pairedMemoryDeckId（在服务初始化后执行）
							const { QuestionBankMigration } = await import("./utils/question-bank-migration");
							await QuestionBankMigration.fixPairedMemoryDeckIdAfterInit(this);
						} catch (dataCheckError) {
							logger.warn("[QuestionBank] 数据检查失败（非致命错误）:", dataCheckError);
						}
					}, 2000);
				} catch (error) {
					logger.error("[Services] Question Bank services initialization failed:", error);
					this.questionBankService = undefined;
					this.questionBankStorage = undefined;
					this.questionBankHierarchy = undefined;
				}
			})()
		);

		// 2.4 增量摘录服务（异步非阻塞）
		parallelInitPromises.push(
			this.initializeIncrementalReadingServices().catch((_error) => {
				logger.error("[Services] ❌ 增量摘录服务初始化失败:", _error);
			})
		);

		// 2.5 全局数据缓存预加载（异步非阻塞）
		parallelInitPromises.push(
			(async () => {
				const cacheStartTime = Date.now();
				try {
					await GlobalDataCache.getInstance().preload(this);
					const cacheDuration = Date.now() - cacheStartTime;
					logger.debug(`[Services] 全局数据缓存预加载完成: ${cacheDuration}ms`);
				} catch (error) {
					logger.error("[Services] 全局数据缓存预加载失败（不影响插件启动）:", error);
				}
			})()
		);

		// 2.6 分类系统数据迁移（异步非阻塞）
		parallelInitPromises.push(
			this.migrateDeckCategories().catch((_error) => {
				logger.error("[Services] 分类系统迁移失败:", _error);
			})
		);

		// 2.7 🆕 引用式牌组系统初始化（异步非阻塞）
		parallelInitPromises.push(
			(async () => {
				try {
					const {
						initReferenceDeckService,
						initDataConsistencyService,
						initReferenceMigrationService,
						initCardFileService,
					} = await import("./services/reference-deck");

					// 初始化服务
					this.referenceDeckService = initReferenceDeckService(this);
					this.dataConsistencyService = initDataConsistencyService(this);
					this.referenceMigrationService = initReferenceMigrationService(this);
					if (!this.cardFileService) {
						this.cardFileService = initCardFileService(this);
						// 初始化卡片文件系统
						await this.cardFileService.initialize();
					}

					// 检查是否需要迁移到引用式架构
					const needsMigration = await this.referenceMigrationService.needsMigration();
					if (needsMigration) {
						logger.info("[Services] 检测到需要迁移到引用式牌组架构，开始自动迁移...");
						try {
							const migrationResult = await this.referenceMigrationService.migrate({
								createBackup: true,
								validate: true,
								dryRun: false,
							});
							if (migrationResult.success) {
								logger.info(
									`[Services] ✅ 迁移完成: ${migrationResult.migratedDecks} 个牌组, ${migrationResult.migratedCards} 张卡片`
								);
								new Notice(
									`数据迁移完成：${migrationResult.migratedDecks} 个牌组, ${migrationResult.migratedCards} 张卡片`
								);
							} else {
								logger.error("[Services] ❌ 迁移失败:", migrationResult.error);
								new Notice(`数据迁移失败: ${migrationResult.error}`);
							}
						} catch (migrationError) {
							logger.error("[Services] ❌ 迁移过程出错:", migrationError);
						}
					}

					// 可选：启动时自动检查数据一致性
					if (this.settings.autoCheckDataConsistency) {
						const checkResult = await this.dataConsistencyService.checkConsistency();
						if (!checkResult.isConsistent) {
							logger.warn("[Services] 数据一致性检查发现问题，建议执行修复");
						}
					}

					logger.info("[Services] ✅ 引用式牌组系统初始化完成");
				} catch (error) {
					logger.error("[Services] 引用式牌组系统初始化失败:", error);
				}
			})()
		);

		// 等待所有并行初始化完成（但设置超时，避免阻塞太久）
		try {
			await Promise.race([
				Promise.all(parallelInitPromises),
				new Promise((_, reject) => setTimeout(() => reject(new Error("并行初始化超时")), 8000)),
			]);
		} catch (error) {
			logger.warn("[Services] 部分服务初始化超时，继续启动:", error);
		}

		const parallelServicesTime = Date.now() - startTime;
		logger.info(`[Services] ✅ 并行服务初始化完成 (${parallelServicesTime}ms)`);

		// ========== 阶段3：延迟初始化非关键服务（完全异步，不等待）==========
		// 这些服务不影响核心功能，可以在空闲时初始化
		setTimeout(() => {
			this.initializeDeferredServices().catch((_error) => {
				logger.error("[Services] 延迟服务初始化失败:", _error);
			});
		}, 1000);

		const totalTime = Date.now() - startTime;
		logger.info(`[Services] ✅ 服务初始化主流程完成 (${totalTime}ms)`);
	}

	/**
	 * 🔥 延迟初始化非关键服务
	 * 这些服务不影响核心功能，在启动后空闲时初始化
	 */
	private async initializeDeferredServices(): Promise<void> {
		logger.debug("[Services] 开始延迟初始化非关键服务...");
		const startTime = Date.now();

		// 8. ✅ 性能优化：预加载全局数据缓存（牌组和模板）- 已移至并行初始化
		const cacheStartTime = Date.now();
		try {
			// 如果之前并行初始化失败，这里重试
			if (!GlobalDataCache.getInstance().isPreloaded()) {
				await GlobalDataCache.getInstance().preload(this);
				const cacheDuration = Date.now() - cacheStartTime;
				logger.debug(`[Services] 全局数据缓存重试预加载完成: ${cacheDuration}ms`);
			}
		} catch (error) {
			logger.error("[Services] 全局数据缓存预加载失败（不影响插件启动）:", error);
		}

		// 9. 🆕 初始化批量解析文件监听器
		await this.initBatchParsingWatcher();

		// 10. 🧹 初始化块链接清理系统
		this.initializeBlockLinkCleanupService();

		// 11. 🚀 获取数据路径
		const v2Paths = getV2PathsFromApp(this.app);
		logger.debug(`数据路径: ${v2Paths.root}`);

		// 12. 🚀 初始化DirectFileCardReader（高性能数据读取服务）
		logger.debug("初始化DirectFileCardReader...");
		try {
			this.directFileReader = new DirectFileCardReader(this.app.vault, v2Paths.root);

			// 可选：启用性能日志（调试模式）
			if (this.settings.enableDebugMode) {
				this.directFileReader.enablePerformanceLogging();
			}
			logger.info("✅ DirectFileCardReader初始化完成");
		} catch (error) {
			logger.error("DirectFileCardReader初始化失败:", error);
		}

		// 13. 🚀 预加载牌组数据缓存（性能优化：编辑卡片时秒开）
		try {
			logger.debug("预加载牌组数据缓存...");
			this.cachedDecks = await this.dataStorage.getAllDecks();
			logger.info(`✅ 牌组数据缓存完成: ${this.cachedDecks.length} 个牌组`);
		} catch (error) {
			logger.warn("⚠️ 牌组数据预加载失败（不影响功能）:", error);
			this.cachedDecks = [];
		}

		// 🔧 v2.3: 渐进式缓存 - 后台异步预热热门牌组（不阻塞启动）
		// 不再同步预热所有卡片，改为懒加载 + 后台预热热门牌组
		try {
			if (this.cardMetadataCache?.config.enableHotDeckPrefetch) {
				// 异步预热热门牌组的卡片（不阻塞启动）
				this.prefetchHotDeckCardsAsync().catch((_error) => {
					logger.warn("⚠️ 热门牌组后台预热失败（不影响功能）:", _error);
				});
				logger.info(
					`✅ 渐进式缓存已启用 (上限: ${this.cardMetadataCache.config.maxSize}, 后台预热: 进行中)`
				);
			} else {
				logger.info("✅ 渐进式缓存已启用 (懒加载模式)");
			}
		} catch (error) {
			logger.warn("⚠️ 渐进式缓存初始化失败（不影响功能）:", error);
		}

		// 14. 🚀 高性能卡片索引服务初始化CardIndexService（卡片反向索引服务）
		logger.debug("初始化CardIndexService...");
		try {
			this.cardIndexService = new CardIndexService(this.app.vault, v2Paths.root);

			// 异步构建索引（不阻塞启动）
			this.cardIndexService.initialize().catch((_error) => {
				logger.error("CardIndexService索引构建失败:", _error);
			});

			logger.info("✅ CardIndexService初始化完成");
		} catch (error) {
			logger.error("CardIndexService初始化失败:", error);
		}

		// ✅ 视图注册已移至 onload() 同步部分，确保在 workspace 恢复前注册

		// 🆕 初始化自动备份调度器（依赖 dataStorage）
		try {
			await this.initializeAutoBackup();
			logger.debug("✅ 自动备份调度器初始化完成");
		} catch (error) {
			logger.error("自动备份调度器初始化失败:", error);
		}

		// 16. 🆕 启动外部同步文件变更监听（检测 Remotely Save 等第三方云同步）
		try {
			this.externalSyncWatcher = new ExternalSyncWatcher(this);
			this.externalSyncWatcher.start();
			logger.info("[Services] ✅ ExternalSyncWatcher 已启动");
		} catch (error) {
			logger.error("[Services] ExternalSyncWatcher 启动失败:", error);
		}

		const totalTime = Date.now() - startTime;
		logger.info(`[Services] ✅ 延迟服务初始化完成 (${totalTime}ms)`);
	}

	/**
	 * 初始化 AnkiConnect 服务（插件级别）
	 */
	async initializeAnkiConnect(): Promise<void> {
		try {
			if (this.settings.ankiConnect?.enabled) {
				const { AnkiConnectService } = await import("./services/ankiconnect/AnkiConnectService");
				this.ankiConnectService = new AnkiConnectService(this, this.app, this.settings.ankiConnect);

				// 启动连接监控
				this.ankiConnectService.startConnectionMonitoring();
				logger.debug("AnkiConnect监控已启动");

				// 启动自动同步（如果配置启用）
				if (this.settings.ankiConnect.autoSync?.enabled) {
					this.ankiConnectService.startAutoSync();
					logger.debug("AnkiConnect自动同步已启动");
				}
			}
		} catch (error) {
			logger.error("❌ AnkiConnect 服务初始化失败:", error);
			// 不阻止插件加载，继续执行
		}
	}

	/**
	 * 清理 AnkiConnect 服务
	 */
	cleanupAnkiConnect(): void {
		if (this.ankiConnectService) {
			try {
				this.ankiConnectService.stopConnectionMonitoring();
				this.ankiConnectService.stopAutoSync();
				logger.debug("AnkiConnect服务已停止");
			} catch (error) {
				logger.error("❌ 停止 AnkiConnect 服务失败:", error);
			}
			this.ankiConnectService = null;
		}
	}

	/**
	 * 初始化自动备份调度器
	 */
	async initializeAutoBackup(): Promise<void> {
		try {
			const { AutoBackupScheduler } = await import("./services/backup/AutoBackupScheduler");

			this.autoBackupScheduler = new AutoBackupScheduler(
				this,
				() => this.settings.autoBackupConfig!,
				async (updates) => {
					this.settings.autoBackupConfig = {
						...this.settings.autoBackupConfig!,
						...updates,
					};
					await this.saveSettings();
				}
			);

			// 启动调度器
			this.autoBackupScheduler.start();
			logger.debug("自动备份调度器已启动");

			// 执行启动备份（如果启用）
			await this.autoBackupScheduler.checkAndCreateStartupBackup();
		} catch (error) {
			logger.error("❌ 自动备份调度器初始化失败:", error);
			// 不阻止插件加载
		}
	}

	/**
	 * 清理自动备份调度器
	 */
	cleanupAutoBackup(): void {
		if (this.autoBackupScheduler) {
			try {
				this.autoBackupScheduler.stop();
				logger.debug("自动备份调度器已停止");
			} catch (error) {
				logger.error("❌ 停止自动备份调度器失败:", error);
			}
			this.autoBackupScheduler = null;
		}
	}

	/**
	 * 🆕 v2.3: 后台异步预热热门牌组的卡片
	 * 识别最近学习的牌组，异步预热其卡片到元数据缓存
	 */
	private async prefetchHotDeckCardsAsync(): Promise<void> {
		if (!this.cardMetadataCache || !this.dataStorage) {
			return;
		}

		try {
			// 1. 识别热门牌组（最近 7 天学习过的）
			const hotDeckIds = await this.identifyHotDecks();

			if (hotDeckIds.length === 0) {
				logger.debug("[ProgressiveCache] 没有热门牌组需要预热");
				return;
			}

			// 2. 获取热门牌组的卡片
			const hotCards: import("./data/types").Card[] = [];
			for (const deckId of hotDeckIds) {
				try {
					const deckCards = await this.dataStorage.getDeckCards(deckId);
					hotCards.push(...deckCards);
				} catch {
					// 牌组可能已删除，跳过
				}
			}

			if (hotCards.length === 0) {
				logger.debug("[ProgressiveCache] 热门牌组中没有卡片");
				return;
			}

			// 3. 后台异步预热
			logger.debug(
				`[ProgressiveCache] 开始预热 ${hotDeckIds.length} 个热门牌组, ${hotCards.length} 张卡片`
			);
			await this.cardMetadataCache.prefetchAsync(hotCards);
		} catch (error) {
			logger.warn("[ProgressiveCache] 热门牌组预热失败:", error);
		}
	}

	/**
	 * 🆕 v2.3: 识别热门牌组
	 * 基于最近学习记录和用户收藏识别热门牌组
	 */
	private async identifyHotDecks(): Promise<string[]> {
		const hotDeckIds: string[] = [];

		try {
			// 1. 从学习会话获取最近学习的牌组
			if (this.dataStorage) {
				const allDecks = await this.dataStorage.getAllDecks();

				// 按最后学习时间排序，取前 5 个
				const recentDecks = allDecks
					.filter((deck) => deck.stats?.lastStudied)
					.sort((a, b) => {
						const timeA = new Date(a.stats?.lastStudied || 0).getTime();
						const timeB = new Date(b.stats?.lastStudied || 0).getTime();
						return timeB - timeA;
					})
					.slice(0, 5);

				for (const deck of recentDecks) {
					if (!hotDeckIds.includes(deck.id)) {
						hotDeckIds.push(deck.id);
					}
				}
			}

			// 2. 添加用户收藏/置顶的牌组（如果有配置）
			const pinnedDecks = this.settings.pinnedDecks || [];
			for (const deckId of pinnedDecks) {
				if (!hotDeckIds.includes(deckId)) {
					hotDeckIds.push(deckId);
				}
			}
		} catch (error) {
			logger.warn("[ProgressiveCache] 识别热门牌组失败:", error);
		}

		// 限制数量，避免预热过多
		return hotDeckIds.slice(0, 5);
	}

	private cleanupLegacyBackupSettings(loadedData: unknown): boolean {
		const rawSettings =
			loadedData && typeof loadedData === "object"
				? (loadedData as Record<string, unknown>)
				: undefined;
		const hasLegacyInterval = typeof rawSettings?.dataBackupIntervalHours === "number";
		const hasLegacyAutoBackup = typeof rawSettings?.autoBackup === "boolean";
		const hasLegacyBackupFields = hasLegacyInterval || hasLegacyAutoBackup;
		const hasStoredAutoBackupConfig = rawSettings?.autoBackupConfig != null;

		if (!hasLegacyBackupFields) {
			return false;
		}

		if (!hasStoredAutoBackupConfig) {
			const defaults = DEFAULT_SETTINGS.autoBackupConfig!;
			this.settings.autoBackupConfig = {
				...defaults,
				enabled: rawSettings?.autoBackup !== false,
				intervalHours: hasLegacyInterval
					? Number(rawSettings?.dataBackupIntervalHours) || defaults.intervalHours
					: defaults.intervalHours,
				triggers: { ...defaults.triggers },
				notifications: { ...defaults.notifications },
			};
		}

		const settingsRecord = this.settings as unknown as Record<string, unknown>;
		delete settingsRecord.dataBackupIntervalHours;
		delete settingsRecord.autoBackup;
		logger.debug("旧自动备份字段已清理并收口到 autoBackupConfig");
		return true;
	}

	private cleanupLegacyParentFolderSetting(loadedData: unknown): boolean {
		const rawSettings =
			loadedData && typeof loadedData === "object"
				? (loadedData as Record<string, unknown>)
				: undefined;
		if (typeof rawSettings?.tuankiParentFolder !== "string") {
			return false;
		}

		const settingsRecord = this.settings as unknown as Record<string, unknown>;
		delete settingsRecord.tuankiParentFolder;
		logger.debug("旧路径字段 tuankiParentFolder 已清理并收口到 weaveParentFolder");
		return true;
	}

	/**
	 * 更新 AnkiConnect 端点
	 */
	async updateAnkiConnectEndpoint(endpoint: string): Promise<void> {
		if (!this.ankiConnectService) {
			await this.initializeAnkiConnect();
			return;
		}

		// 重新创建服务实例
		this.cleanupAnkiConnect();
		this.settings.ankiConnect!.endpoint = endpoint;
		await this.saveSettings();
		await this.initializeAnkiConnect();
		logger.debug("AnkiConnect端点已更新");
	}

	/**
	 * 切换 AnkiConnect 启用状态
	 */
	async toggleAnkiConnect(enabled: boolean): Promise<void> {
		this.settings.ankiConnect!.enabled = enabled;
		await this.saveSettings();

		if (enabled) {
			await this.initializeAnkiConnect();
		} else {
			this.cleanupAnkiConnect();
		}

		logger.debug(`AnkiConnect ${enabled ? "已启用" : "已禁用"}`);
	}

	/**
	 * 🆕 初始化批量解析文件监听器
	 */
	private async initBatchParsingWatcher(): Promise<void> {
		if (!this.settings.simplifiedParsing) {
			logger.warn("[Plugin] simplifiedParsing 配置未初始化");
			return;
		}

		const batchSettings = this.settings.simplifiedParsing.batchParsing;

		try {
			// 初始化转换器和保存器
			if (!this.cardConverter) {
				this.cardConverter = new ParsedCardConverter(this.app, this.fsrs);
			}

			if (!this.batchCardSaver) {
				this.batchCardSaver = new BatchCardSaver(this.dataStorage, GlobalDataCache.getInstance());
			}

			const parser = new SimplifiedCardParser(this.settings.simplifiedParsing, this.app);
			this.simplifiedCardParser = parser;

			// 🎯 初始化新批量解析系统
			try {
				// 创建存储实现
				const uuidStorage = new UUIDStorageImpl();

				const deckStorage = new DeckStorageAdapter(this);

				// 创建批量解析管理器

				this.batchParsingManager = new BatchParsingManager(
					this.app,
					this.settings.simplifiedParsing,
					parser,
					deckStorage,
					uuidStorage,
					this // ✅ 传入插件实例，用于调用统一保存流程
				);

				// 注册命令
				this.batchParsingManager.registerCommands(this);

				logger.debug("批量解析系统已初始化");
			} catch (error) {
				logger.error("[Plugin] ❌ 批量解析手动触发系统初始化失败 - 详细信息:");
				logger.error("[Plugin] 错误类型:", error?.constructor?.name);
				logger.error("[Plugin] 错误消息:", error instanceof Error ? error.message : String(error));
				logger.error("[Plugin] 错误堆栈:", error instanceof Error ? error.stack : "无堆栈信息");
				logger.error("[Plugin] 完整错误对象:", error);

				// 🔥 确保 batchParsingManager 为 undefined
				this.batchParsingManager = undefined;
			}

			// 🔄 步骤3：初始化批量解析自动触发系统（仅在 autoTrigger 启用时）
			// 功能说明：
			// - 监听 Markdown 文件的 'modify' 事件（保存时触发）
			// - 自动检测文件中的卡片标记（基于配置的分隔符）
			// - 实时解析并同步卡片到数据库（与 BatchParsingManager 互补工作）
			// - 支持文件夹过滤、防抖处理等高级功能
			if (batchSettings.autoTrigger) {
				logger.debug("[Plugin] 🔍 [步骤3] autoTrigger 已启用，初始化自动触发监听器...");
				this.batchParsingWatcher = new BatchParsingFileWatcher(this, parser, {
					debounceDelay: batchSettings.triggerDebounce,
					onlyActiveFile: batchSettings.onlyActiveFile,
					autoTrigger: batchSettings.autoTrigger,
					includeFolders: batchSettings.includeFolders,
					excludeFolders: batchSettings.excludeFolders,
				});

				await this.batchParsingWatcher.initialize();
				logger.info("[Plugin] ✅ 批量解析监听器已初始化");
			} else {
				logger.debug("[Plugin] ℹ️ autoTrigger 已禁用，跳过批量解析监听器初始化");
			}

			logger.info("[Plugin] ✅ 批量解析服务初始化完成");
		} catch (error) {
			logger.error("[Plugin] ❌ 解析服务初始化失败 - 详细信息:");
			logger.error("[Plugin] 错误类型:", error?.constructor?.name);
			logger.error("[Plugin] 错误消息:", error instanceof Error ? error.message : String(error));
			logger.error("[Plugin] 错误堆栈:", error instanceof Error ? error.stack : "无堆栈信息");
			logger.error("[Plugin] 完整错误对象:", error);
			// 不阻止插件加载
		}
	}

	/**
	 * 🆕 获取默认牌组ID
	 */
	private async getDefaultDeckId(): Promise<string | null> {
		try {
			// 1. 优先使用用户配置的默认牌组
			if (this.settings.simplifiedParsing?.batchParsing?.defaultDeckId) {
				const deckId = this.settings.simplifiedParsing.batchParsing.defaultDeckId;
				// 验证牌组是否存在
				// ✅ 修复：getDeck 返回 Deck|null，不是 ApiResponse
				const deck = await this.dataStorage.getDeck(deckId);
				if (deck) {
					logger.debug("[Plugin] ✅ 使用配置的默认牌组:", deck.name);
					return deckId;
				}
			}

			// 2. 获取第一个牌组
			// ✅ 修复：getDecks 返回 Deck[]，不是 ApiResponse
			const decks = await this.dataStorage.getDecks();
			if (decks && decks.length > 0) {
				logger.debug("[Plugin] ✅ 使用第一个牌组:", decks[0].name);
				return decks[0].id;
			}

			// 3. 创建默认牌组
			// ✅ 修复：使用 saveDeck 创建新牌组
			logger.info("[Plugin] 🔄 创建新的默认牌组...");

			// 获取用户配置
			const userProfile = await this.dataStorage.getUserProfile();
			const defaultSettings = userProfile.globalSettings.defaultDeckSettings;

			// 构造完整牌组对象
			const newDeck: Deck = {
				id: `deck_${Date.now().toString(36)}`,
				name: "批量解析",
				description: "通过批量解析功能创建的卡片",
				category: "默认",
				path: "批量解析",
				level: 0,
				order: 0,
				inheritSettings: false,
				created: new Date().toISOString(),
				modified: new Date().toISOString(),
				settings: defaultSettings,
				includeSubdecks: false,
				stats: {
					totalCards: 0,
					newCards: 0,
					learningCards: 0,
					reviewCards: 0,
					todayNew: 0,
					todayReview: 0,
					todayTime: 0,
					totalReviews: 0,
					totalTime: 0,
					memoryRate: 0,
					averageEase: 0,
					forecastDays: {},
				},
				tags: [],
				metadata: { autoCreated: true },
			};

			// 使用 saveDeck 保存
			const createResponse = await this.dataStorage.saveDeck(newDeck);

			if (createResponse.success && createResponse.data) {
				logger.info("[Plugin] ✅ 已创建默认牌组:", createResponse.data.name);
				return createResponse.data.id;
			}

			logger.error("[Plugin] ❌ 创建默认牌组失败");
			return null;
		} catch (error) {
			logger.error("[Plugin] 获取默认牌组失败:", error);
			return null;
		}
	}

	/**
	 * ✅ 统一的卡片保存流程（批量解析和其他创建方式共用）
	 * 职责：将 ParsedCard[] 转换为 Card[] 并批量保存到数据库
	 * 🔄 重构后：支持从 ParsedCard.metadata 中提取 targetDeckId
	 */
	public async addCardsToDB(parsedCards: ParsedCard[]): Promise<void> {
		if (!this.cardConverter || !this.batchCardSaver) {
			// 如果转换器和保存器未初始化，则进行初始化
			this.cardConverter = new ParsedCardConverter(this.app, this.fsrs);
			this.batchCardSaver = new BatchCardSaver(this.dataStorage, GlobalDataCache.getInstance());
			logger.debug("[Plugin] ✅ 动态初始化卡片转换器和保存器");
		}

		try {
			// 1. 获取默认牌组ID（作为备用）
			const defaultDeckId = await this.getDefaultDeckId();
			if (!defaultDeckId) {
				new Notice("无法获取或创建默认牌组");
				return;
			}

			// 2. 逐张转换 ParsedCard 到 Card（支持每张卡片的独立 deckId）
			const convertedCards: any[] = [];

			for (const parsedCard of parsedCards) {
				// 🔒 二次验证：targetDeckId 必须存在（批量解析的强制要求）
				if (!parsedCard.metadata?.targetDeckId) {
					logger.error("[Plugin] ❌ 卡片缺少 targetDeckId，拒绝保存:", {
						front: (parsedCard.content || "").substring(0, 50),
						source: parsedCard.metadata?.sourceFile || "未知",
					});
					continue; // 跳过该卡片
				}

				const deckId = parsedCard.metadata.targetDeckId;

				// 🔒 三次验证：牌组必须存在
				const deck = await this.dataStorage.getDeck(deckId);
				if (!deck) {
					logger.error("[Plugin] ❌ 目标牌组不存在，拒绝保存:", {
						deckId: deckId,
						deckName: parsedCard.metadata?.targetDeckName || "未知",
						cardFront: (parsedCard.content || "").substring(0, 50),
					});
					continue; // 跳过该卡片
				}

				// 🆕 v2.2: 传递牌组名称以写入 we_decks
				const conversionOptions = {
					deckId: deckId,
					deckName: deck.name, // 🆕 用于写入 content YAML 的 we_decks
					preserveSourceInfo: true,
					priority: this.settings.simplifiedParsing?.batchParsing?.defaultPriority ?? 0,
					suspended: false,
				};

				const conversionResult = this.cardConverter.convertToCard(parsedCard, conversionOptions);

				if (conversionResult.success && conversionResult.card) {
					convertedCards.push(conversionResult.card);
				} else {
					logger.error(
						"[Plugin] 卡片转换失败:",
						conversionResult.errors || [conversionResult.error].filter(Boolean)
					);
				}
			}

			if (convertedCards.length === 0) {
				new Notice("没有可保存的卡片");
				return;
			}

			logger.info(`[Plugin] ✅ 成功转换 ${convertedCards.length} 张卡片`);

			// 3. 批量保存到数据库
			const saveResult = await this.batchCardSaver.saveBatchWithNotice(convertedCards, {
				continueOnError: true,
			});

			// 4. 输出结果
			logger.info("[Plugin] 批量保存完成:", {
				成功: saveResult.successCount,
				失败: saveResult.failureCount,
				总计: parsedCards.length,
				耗时: saveResult.duration ? `${saveResult.duration}ms` : "未知",
			});

			if (saveResult.failureCount > 0) {
				logger.error("[Plugin] 保存失败的卡片:", saveResult.errors);
			}
		} catch (error) {
			logger.error("[Plugin] 添加卡片到数据库失败:", error);
			new Notice(`保存卡片失败: ${error instanceof Error ? error.message : "未知错误"}`);
		}
	}

	private shouldShowPremiumEntry(featureId: string): boolean {
		return PremiumFeatureGuard.getInstance().shouldShowFeatureEntry(featureId);
	}

	private ensurePremiumFeatureAccess(featureId: string, blockedMessage: string): boolean {
		const premiumGuard = PremiumFeatureGuard.getInstance();
		if (premiumGuard.canUseFeature(featureId)) {
			return true;
		}

		new Notice(blockedMessage);
		return false;
	}

	/**
	 * 🆕 注册批量解析命令
	 */
	private registerBatchParsingCommands(): void {
		// 命令1: 批量解析当前文件（保留，这是有用的功能）
		this.addCommand({
			id: "batch-parse-current-file",
			name: "批量解析当前文件",
			icon: "file-text",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.extension !== "md") {
					return false;
				}

				if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.BATCH_PARSING)) {
					return false;
				}

				if (!checking) {
					if (
						!this.ensurePremiumFeatureAccess(
							PREMIUM_FEATURES.BATCH_PARSING,
							"批量解析系统需要激活许可证才能使用"
						)
					) {
						return false;
					}

					// ✅ 使用 BatchParsingManager 统一入口
					void this.batchParsingManager?.parseSingleFile(activeFile);
				}
				return true;
			},
		});

		this.addCommand({
			id: "ir-create-pdf-bookmark-task-current-view",
			name: "增量阅读：新建 PDF 书签任务（当前视图）",
			icon: "bookmark",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.extension !== "pdf") {
					return false;
				}

				if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
					return false;
				}

				if (!checking) {
					if (
						!this.ensurePremiumFeatureAccess(
							PREMIUM_FEATURES.INCREMENTAL_READING,
							"增量阅读是高级功能，请激活许可证后使用"
						)
					) {
						return false;
					}
					void this.createPdfBookmarkTaskFromCurrentView().catch((error) => {
						logger.error("[Plugin] 新建 PDF 书签任务（当前视图）失败:", error);
						new Notice("创建失败");
					});
				}

				return true;
			},
		});

		this.addCommand({
			id: "ir-create-pdf-bookmark-task-current-selection",
			name: "增量阅读：新建 PDF 书签任务（当前选区）",
			icon: "bookmark",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.extension !== "pdf") {
					return false;
				}

				if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
					return false;
				}

				if (!checking) {
					if (
						!this.ensurePremiumFeatureAccess(
							PREMIUM_FEATURES.INCREMENTAL_READING,
							"增量阅读是高级功能，请激活许可证后使用"
						)
					) {
						return false;
					}
					void this.createPdfBookmarkTaskFromCurrentSelection().catch((error) => {
						logger.error("[Plugin] 新建 PDF 书签任务（当前选区）失败:", error);
						new Notice("创建失败");
					});
				}

				return true;
			},
		});

		this.addCommand({
			id: "ir-create-pdf-bookmark-tasks-from-outline",
			name: "增量阅读：从 PDF 目录生成书签任务",
			icon: "bookmark",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.extension !== "pdf") {
					return false;
				}

				if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
					return false;
				}

				if (!checking) {
					if (
						!this.ensurePremiumFeatureAccess(
							PREMIUM_FEATURES.INCREMENTAL_READING,
							"增量阅读是高级功能，请激活许可证后使用"
						)
					) {
						return false;
					}
					void this.createPdfBookmarkTasksFromOutline().catch((error) => {
						logger.error("[Plugin] 从 PDF 目录生成书签任务失败:", error);
						new Notice("创建失败");
					});
				}

				return true;
			},
		});

		// 命令2: 批量解析所有映射文件（保留，这是有用的功能）
		this.addCommand({
			id: "batch-parse-all-mappings",
			name: "批量解析所有映射文件",
			icon: "files",
			checkCallback: (checking: boolean) => {
				if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.BATCH_PARSING)) {
					return false;
				}

				if (!checking) {
					if (
						!this.ensurePremiumFeatureAccess(
							PREMIUM_FEATURES.BATCH_PARSING,
							"批量解析系统需要激活许可证才能使用"
						)
					) {
						return false;
					}

					void this.batchParsingManager?.executeBatchParsing();
				}

				return true;
			},
		});

		// 命令3: 批量解析全局同步（扫描所有启用的映射并同步）
		this.addCommand({
			id: "batch-parse-sync-all",
			name: "批量解析：全局同步",
			icon: "refresh-cw",
			checkCallback: (checking: boolean) => {
				if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.BATCH_PARSING)) {
					return false;
				}

				if (!checking) {
					if (
						!this.ensurePremiumFeatureAccess(
							PREMIUM_FEATURES.BATCH_PARSING,
							"批量解析系统需要激活许可证才能使用"
						)
					) {
						return false;
					}

					new Notice("开始全局同步批量解析...");

					const syncTask = this.batchParsingManager?.executeBatchParsing();
					if (syncTask) {
						void syncTask
							.then(() => {
								new Notice("批量解析全局同步完成");
							})
							.catch((error) => {
								logger.error("[批量解析] 全局同步失败:", error);
								new Notice(
									`全局同步失败: ${error instanceof Error ? error.message : String(error)}`
								);
							});
					}
				}

				return true;
			},
		});

		logger.info("[Plugin] 批量解析命令已注册");
	}

	/**
	 * 📱 注册移动端命令
	 * 这些命令可以添加到 Obsidian 移动端工具栏
	 */
	private registerMobileCommands(): void {
		// 🤖 AI 处理选中文本命令（移动端友好）
		this.addCommand({
			id: "mobile-ai-process-selection",
			name: "AI 处理选中文本",
			icon: "bot",
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				try {
					const selection = editor.getSelection();
					if (!selection || selection.trim() === "") {
						new Notice("请先选中要处理的文本", 3000);
						return;
					}

					// 获取文件信息
					const activeFile = ctx?.file;
					let sourceFile: string | undefined;
					if (activeFile) {
						sourceFile = activeFile.path;
					}

					// v3.1: 当sourceFile为临时文件时，从IR store获取真实来源
					if (sourceFile && /weave-editor-/.test(sourceFile)) {
						try {
							const { irActiveBlockContextStore } = await import(
								"./stores/ir-active-block-context-store"
							);
							const irCtx = irActiveBlockContextStore.getActiveContext();
							if (irCtx?.sourcePath) {
								sourceFile = irCtx.sourcePath;
							} else {
								const { irActiveDocumentStore } = await import("./stores/ir-active-document-store");
								const irDoc = irActiveDocumentStore.getActiveDocument();
								if (irDoc) sourceFile = irDoc;
							}
						} catch {}
					}

					// 准备卡片内容（使用选中文本作为正面）
					const cardContent = `${selection}\n\n---div---\n\n`;
					const cardMetadata: any = {};
					if (sourceFile) {
						cardMetadata.sourceFile = sourceFile;
					}

					// 打开创建卡片模态窗（用户可以在模态窗中使用 AI 功能）
					await this.openCreateCardModal({
						initialContent: cardContent,
						cardMetadata,
						onSuccess: () => {
							new Notice("卡片创建成功", 2000);
						},
						onCancel: () => {
							logger.debug("ℹ️ [移动端AI处理] 用户取消");
						},
					});

					new Notice("提示：在卡片编辑器中可以使用 AI 功能", 3000);
				} catch (error) {
					logger.error("❌ [移动端AI处理] 执行失败:", error);
					new Notice("处理失败，请重试", 3000);
				}
			},
		});

		// ➕ 快速添加卡片命令（移动端友好）
		this.addCommand({
			id: "mobile-quick-add-card",
			name: "快速添加卡片",
			icon: "plus",
			callback: async () => {
				try {
					await this.openCreateCardModal({
						onSuccess: () => {
							new Notice("卡片创建成功", 2000);
						},
					});
				} catch (error) {
					logger.error("执行失败:", error);
					new Notice("创建卡片失败", 3000);
				}
			},
		});

		logger.info("[Plugin] 移动端命令已注册");
	}

	private syncObsidianLineNumberSettingToBodyClass(): void {
		try {
			const vaultAny = this.app.vault as any;
			const enabled = !!vaultAny?.getConfig?.("showLineNumber");
			document.body.classList.toggle("weave-line-numbers-on", enabled);
		} catch (error) {
			logger.debug("[Plugin] 同步 showLineNumber 设置失败（可忽略）:", error);
		}
	}

	private registerWorkspaceViews(): void {
		if (this.workspaceViewsRegistered) {
			return;
		}

		// 关键：必须在 onload 的首次 await 之前完成视图注册。
		// 移动端重启时 workspace 恢复更早、更慢，若这里晚于恢复，Obsidian 会把旧 leaf 卡在 loading。
		logger.debug("注册视图...");
		this.registerView(VIEW_TYPE_WEAVE, (leaf) => new WeaveView(leaf, this));
		this.registerView(VIEW_TYPE_STUDY, (leaf) => new StudyView(leaf, this));
		this.registerView(VIEW_TYPE_QUESTION_BANK, (leaf) => new QuestionBankView(leaf, this));
		this.registerView(VIEW_TYPE_IR_FOCUS, (leaf) => new IRFocusView(leaf, this));
		this.registerView(VIEW_TYPE_IR_CALENDAR, (leaf) => new IRCalendarView(leaf, this));
		this.registerView(VIEW_TYPE_EPUB, (leaf) => new EpubView(leaf, this));
		this.registerView(
			VIEW_TYPE_EPUB_BOOKSHELF_SIDEBAR,
			(leaf) => new EpubBookshelfSidebarView(leaf, this)
		);
		this.registerView(VIEW_TYPE_EPUB_SIDEBAR, (leaf) => new EpubSidebarView(leaf, this));
		this.registerExtensions(["epub"], VIEW_TYPE_EPUB);

		this.workspaceViewsRegistered = true;
		logger.info("✅ 视图已注册（在 workspace 恢复前）");
	}

	async onload() {
		try {
			this.registerWorkspaceViews();

			// 旧版 APKG 导入只在增强安装包中启用，社区版允许缺失该运行时资源。
			await this.refreshLegacyApkgImportRuntimeStatus();

			// 🔥 热重载开发环境已启动 - 代码变更将自动构建
			logger.info("🚀 Weave plugin loading with Hot Reload");
			await vaultStorage.initialize(this.app);
			await this.loadSettings();
			try {
				await migrateLegacyPluginRuntimeState(this);
			} catch (error) {
				logger.warn("[Plugin] 迁移本地运行时状态失败，将继续使用回退值", error);
			}
			await this.hydratePluginLocalState();
			await this.loadPersistedStudySession();

			try {
				this.editorTempFileCleanupService = new EditorTempFileCleanupService(this.app);
				this.registerInterval(
					window.setInterval(() => {
						try {
							void this.editorTempFileCleanupService?.cleanupNow();
						} catch {}
					}, 60 * 60 * 1000)
				);
			} catch {}
			this.syncObsidianLineNumberSettingToBodyClass();
			this.registerEvent(
				this.app.workspace.on("active-leaf-change", () => {
					this.syncObsidianLineNumberSettingToBodyClass();
				})
			);

			// 🔧 初始化日志管理器（必须在loadSettings之后）
			logger.setDebugMode(this.settings.enableDebugMode || false);

			// 🔧 初始化焦点管理器以防止输入焦点丢失
			logger.info("✅ 焦点管理器已初始化（全局监控已启动）");
			// focusManager 已通过导入自动初始化，这里只是记录日志

			// ✅ 初始化AI配置Store
			logger.debug("初始化AI配置Store...");
			aiConfigStore.initialize(this);
			logger.info("✅ AI配置Store已初始化");

			// 初始化平板端适配
			logger.debug("初始化平板端适配...");
			this.initializeTabletSupport();

			// 🆕 5. 初始化移动端模态窗全局适配
			logger.debug("初始化移动端模态窗适配...");
			const { initMobileModalAdaptation } = await import("./utils/mobile-modal-bounds");
			initMobileModalAdaptation();
			logger.info("✅ 移动端模态窗适配已初始化");

			registerMobileCanvasPaneMenuPatch(this);

			// EPUB link post-processor
			void import("./services/epub/EpubLinkPostProcessor").then(
				({ createEpubLinkPostProcessor }) => {
					this.registerMarkdownPostProcessor(createEpubLinkPostProcessor(this.app));
				}
			);

			this.registerMarkdownCodeBlockProcessor(
				WEAVE_DECKS_CODE_BLOCK_LANGUAGE,
				createWeaveDeckCodeBlockProcessor(this)
			);

			// EPUB protocol handler: obsidian://weave-epub?file=...&cfi=...&text=...
			this.registerObsidianProtocolHandler("weave-epub", async (params) => {
				const { EpubLinkService } = await import("./services/epub/EpubLinkService");
				const parsed = EpubLinkService.parseProtocolParams(params);
				if (!parsed) {
					logger.warn("[EPUB Protocol] Invalid params:", params);
					return;
				}
				const linkService = new EpubLinkService(this.app);
				await linkService.navigateToEpubLocation(parsed.filePath, parsed.cfi, parsed.text);
			});

			// 🔥 关键修复：等待 layout-ready 事件后再初始化数据存储
			// 原因：Obsidian 文件系统在 layout-ready 之前可能尚未完全就绪
			// 这会导致 vault.getAbstractFileByPath() 和 vault.createFolder() 行为不一致
			logger.debug("⏳ 等待 workspace layout-ready 事件...");
			this.app.workspace.onLayoutReady(async () => {
				try {
					document.querySelectorAll(".weave-ir-markdown-bottom-toolbar-container").forEach((el) => {
						try {
							(el as HTMLElement).remove();
						} catch {}
					});
				} catch {}

				try {
					await this.editorTempFileCleanupService?.aggressiveCleanup();
				} catch {}

				await this.initializeDataStorage();
			});

			// 验证许可证数据加载
			logger.debug("Weave 插件启动完成");

			// 验证许可证（异步非阻塞，不影响启动速度）
			this.validateLicense().catch((_error) => {
				logger.error("许可证验证失败:", _error);
			});

			// 🔒 初始化高级功能守卫（异步非阻塞）
			logger.debug("初始化高级功能守卫...");
			const premiumGuard = PremiumFeatureGuard.getInstance();
			premiumGuard.setPremiumFeaturesPreview(this.settings.showPremiumFeaturesPreview ?? false);
			premiumGuard
				.initialize(this.settings.license)
				.then(() => {
					logger.info("高级功能守卫初始化完成");
				})
				.catch((_error) => {
					logger.error("高级功能守卫初始化失败:", _error);
				});

			// 监听激活提示事件
			this.registerDomEvent(window, "Weave:open-activation" as any, () => {
				// 打开设置页面并导航到关于标签
				void this.activateView(VIEW_TYPE_WEAVE);
				setTimeout(() => {
					window.dispatchEvent(
						new CustomEvent("Weave:navigate", {
							detail: { page: "settings", tab: "about" },
						})
					);
				}, 100);
			});

			// ⏸️ 数据存储初始化已移至 initializeDataStorage() 方法
			// 该方法会在 workspace.onLayoutReady 事件触发后执行

			// 🆕 初始化不依赖数据存储的基础服务
			logger.info("初始化基础服务（不依赖数据存储）...");

			this.filterStateService = new FilterStateService(this);
			this.dataSyncService = new DataSyncService();
			this.indexManager = new IndexManagerService(this);

			// 初始化 IndexManager（异步非阻塞）
			this.indexManager
				.initialize()
				.then(() => {
					logger.info("IndexManagerService 已初始化");
				})
				.catch((_error) => {
					logger.error("IndexManagerService 初始化失败:", _error);
				});

			logger.info("基础服务初始化完成");

			// ✅ 题库服务、数据迁移、标注系统等依赖 dataStorage 的操作已移至 initializeServicesAfterStorage()
			// 这些服务将在 workspace.onLayoutReady 事件后初始化

			// 初始化 FSRS（不依赖dataStorage）
			this.fsrs = new FSRS({
				requestRetention: this.settings.fsrsParams.requestRetention,
				maximumInterval: this.settings.fsrsParams.maximumInterval,
				enableFuzz: this.settings.fsrsParams.enableFuzz,
				w: this.settings.fsrsParams.w,
			});
			logger.info("FSRS算法已初始化");

			// ✅ 初始化嵌入式编辑器管理器（旧嵌入式方案：embedRegistry，无文件池）
			try {
				const { EmbeddableEditorManager } = await import(
					"./services/editor/EmbeddableEditorManager"
				);
				this.editorPoolManager = new EmbeddableEditorManager(this.app);
				logger.info("嵌入式编辑器管理器已初始化（EmbeddableEditorManager）");
			} catch (error) {
				logger.error("嵌入式编辑器管理器初始化失败:", error);
			}

			// Global error & rejection tracing
			try {
				this.registerDomEvent(window, "error", (e: ErrorEvent) => {
					// 🎯 过滤 ResizeObserver 循环警告（无害的浏览器警告）
					if (e.message?.includes("ResizeObserver loop")) {
						// 忽略 ResizeObserver 循环警告，这是由浏览器限制引起的无害警告
						return;
					}

					const errorStack = e.error?.stack || "";
					logger.error("[GLOBAL_ERROR]", e.message, errorStack || e);
				});
				this.registerDomEvent(window, "unhandledrejection", (e: PromiseRejectionEvent) => {
					const reason = e.reason;
					const message = reason?.message || reason;
					const stack = reason?.stack || "";
					logger.error("[UNHANDLED_REJECTION]", message, stack || e);
				});
			} catch {}

			// 🎨 注册Ribbon图标（不依赖dataStorage）
			this.addRibbonIcon("brain", "打开主界面", () => {
				void this.activateView(VIEW_TYPE_WEAVE);
			});

			const openEpubReaderRibbon = this.addRibbonIcon("book-open", "打开 EPUB 书架", () => {
				void this.openEpubBookshelf();
			});

			const incrementalReadingRibbon = this.addRibbonIcon("calendar", "增量阅读日历", () => {
				const guard = PremiumFeatureGuard.getInstance();
				if (!guard.canUseFeature(PREMIUM_FEATURES.INCREMENTAL_READING)) {
					new Notice("增量阅读是高级功能，请激活许可证后使用");
					return;
				}
				void this.activateIRCalendarView();
			});

			const updateIncrementalReadingRibbonVisibility = (premiumActive: boolean) => {
				incrementalReadingRibbon.setCssProps({ display: premiumActive ? "" : "none" });
			};

			const updateEpubReaderRibbonVisibility = (premiumActive: boolean) => {
				openEpubReaderRibbon.setCssProps({ display: premiumActive ? "" : "none" });
			};

			updateIncrementalReadingRibbonVisibility(get(premiumGuard.isPremiumActive));
			updateEpubReaderRibbonVisibility(get(premiumGuard.isPremiumActive));
			const unsubscribeIncrementalReadingRibbon = premiumGuard.isPremiumActive.subscribe(
				(premiumActive) => {
					updateIncrementalReadingRibbonVisibility(premiumActive);
					updateEpubReaderRibbonVisibility(premiumActive);
				}
			);
			this.register(() => {
				unsubscribeIncrementalReadingRibbon();
			});

			// 注册命令（不依赖dataStorage）
			this.addCommand({
				id: "open-main-view",
				name: "打开主视图",
				icon: "brain",
				callback: () => {
					void this.activateView(VIEW_TYPE_WEAVE);
				},
			});

			this.addCommand({
				id: "quick-add-card",
				name: "快速添加卡片",
				icon: "plus",
				callback: async () => {
					// 使用统一的 openCreateCardModal 方法
					await this.openCreateCardModal();
				},
			});

			this.addCommand({
				id: "ir-set-pdf-resume-point",
				name: "记录 PDF 续读位置",
				icon: "bookmark",
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile || activeFile.extension !== "pdf") {
						return false;
					}

					if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
						return false;
					}

					if (!checking) {
						void this.setPdfResumePointFromActivePdf().catch((error) => {
							logger.error("[Plugin] 记录 PDF 续读位置失败:", error);
							new Notice("记录失败");
						});
					}

					return true;
				},
			});

			this.addCommand({
				id: "open-epub-reader",
				name: "打开 EPUB 阅读器",
				icon: "book-open",
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile || activeFile.extension !== "epub") {
						return false;
					}

					if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
						return false;
					}

					if (!checking) {
						void this.openActiveEpubReader();
					}

					return true;
				},
			});

			this.addCommand({
				id: "ir-import-epub",
				name: "增量阅读：导入 EPUB 内容",
				icon: "book-plus",
				checkCallback: (checking: boolean) => {
					if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
						return false;
					}

					if (!checking) {
						if (
							!this.ensurePremiumFeatureAccess(
								PREMIUM_FEATURES.INCREMENTAL_READING,
								"增量阅读是高级功能，请激活许可证后使用"
							)
						) {
							return false;
						}
						document.dispatchEvent(new CustomEvent("ir-import-epub"));
					}

					return true;
				},
			});

			// 命令：插入内容块标记（v2.2: 使用 UUID 标记）
			this.addCommand({
				id: "insert-ir-block-marker",
				name: "插入内容块标记",
				icon: "split",
				editorCallback: async (editor: Editor) => {
					const cursor = editor.getCursor();
					const lineContent = editor.getLine(cursor.line);

					// 生成新的 UUID
					const uuid = `ir-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
					const marker = `<!-- weave-ir: ${uuid} -->`;

					// 在当前行末尾或新行插入标记
					if (lineContent.trim().length === 0) {
						// 当前行为空，直接插入
						editor.replaceRange(`${marker}\n`, { line: cursor.line, ch: 0 });
					} else {
						// 在下一行插入
						editor.replaceRange(`\n${marker}\n`, { line: cursor.line, ch: lineContent.length });
					}

					new Notice("已插入内容块标记");
				},
			});

			// 🆕 从选中文本创建卡片（快捷键）
			this.addCommand({
				id: "create-card-from-selection",
				name: "从选中文本创建卡片",
				icon: "file-plus",
				callback: async () => {
					try {
						logger.debug("📝 [快捷键创建卡片] 命令触发");

						// 步骤1：获取选中文本（支持编辑模式和阅读模式）
						let selectedText = "";
						let editor: Editor | null = null;
						let ctx: MarkdownView | MarkdownFileInfo | null = null;

						// 尝试从编辑器获取（编辑模式）
						const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
						if (activeView?.editor) {
							editor = activeView.editor;
							ctx = activeView;
							selectedText = editor.getSelection();
						}

						// 如果编辑器API没有获取到选择，尝试从window获取（降级方案）
						if (!selectedText || selectedText.trim() === "") {
							const windowSelection = window.getSelection();
							if (windowSelection?.toString().trim()) {
								selectedText = windowSelection.toString().trim();
							}
						}

						// 步骤2：智能处理空文本
						if (!selectedText || selectedText.trim() === "") {
							logger.debug("⚠️ [快捷键创建卡片] 未选中文本");

							// 仅在编辑模式下尝试获取当前行
							if (editor) {
								logger.debug("⚠️ [快捷键创建卡片] 尝试获取当前行");
								const cursor = editor.getCursor();
								const line = editor.getLine(cursor.line);

								if (line?.trim()) {
									// 当前行有内容 - 直接使用
									selectedText = line.trim();

									// 自动选中该行（视觉反馈）
									editor.setSelection(
										{ line: cursor.line, ch: 0 },
										{ line: cursor.line, ch: line.length }
									);

									new Notice("使用当前行内容创建卡片", 2000);
								} else {
									// 当前行无内容 - 友好提示
									new Notice("请先选中要创建卡片的文本内容", 3000);
									return;
								}
							} else {
								// 阅读模式下没有选择 - 友好提示
								new Notice("请在阅读视图中选中文本后再使用快捷键", 3000);
								return;
							}
						}

						// 步骤3：获取文件信息
						const activeFile = activeView?.file || ctx?.file;
						let sourceFile: string | undefined;

						if (activeFile) {
							sourceFile = activeFile.path;
							logger.debug("[快捷键创建卡片] 源文件:", sourceFile);
						}

						// v3.1: 当sourceFile为空或为临时文件时，从IR store获取真实来源
						if (!sourceFile || /weave-editor-/.test(sourceFile)) {
							try {
								const { irActiveBlockContextStore } = await import(
									"./stores/ir-active-block-context-store"
								);
								const irCtx = irActiveBlockContextStore.getActiveContext();
								if (irCtx?.sourcePath) {
									sourceFile = irCtx.sourcePath;
									logger.debug("[快捷键创建卡片] 从IR块上下文获取源文件:", sourceFile);
								} else {
									const { irActiveDocumentStore } = await import(
										"./stores/ir-active-document-store"
									);
									const irActiveDocument = irActiveDocumentStore.getActiveDocument();
									if (irActiveDocument) {
										sourceFile = irActiveDocument;
										logger.debug("[快捷键创建卡片] 从IR活动文档获取源文件:", sourceFile);
									}
								}
							} catch (e) {
								logger.warn("[快捷键创建卡片] 解析IR来源失败:", e);
							}
						}

						if (!sourceFile) {
							logger.warn("[快捷键创建卡片] 无文件信息，创建无溯源卡片");
							new Notice("创建卡片（无源文档信息）", 2000);
						}

						// 步骤4：创建块链接
						let blockLinkInfo;

						if (sourceFile) {
							try {
								const { BlockLinkManager } = await import("./utils/block-link-manager");
								const blockLinkManager = new BlockLinkManager(this.app);

								const blockLinkResult = await blockLinkManager.createBlockLinkForSelection(
									selectedText,
									sourceFile
								);

								if (blockLinkResult.success && blockLinkResult.blockLinkInfo) {
									blockLinkInfo = blockLinkResult.blockLinkInfo;
									logger.debug("✅ [快捷键创建卡片] 块链接创建成功:", blockLinkInfo.blockLink);

									// 🛡️ 标记块链接为最近创建（60秒保护期，防止竞态条件）
									if (this.blockLinkCleanupService) {
										this.blockLinkCleanupService.markRecentlyCreated(blockLinkInfo.blockId);
										logger.debug("🛡️ [快捷键创建卡片] 块链接已保护（60秒）");
									}
								} else {
									// 块链接创建失败 - 使用降级策略
									logger.warn("⚠️ [快捷键创建卡片] 块链接创建失败，使用文档级溯源");
									new Notice("无法创建精确块链接，已保存文档级来源", 2000);
								}
							} catch (error) {
								logger.error("❌ [快捷键创建卡片] 块链接创建异常:", error);
							}
						}

						// ✅ 步骤5：生成标准content（遵循卡片数据结构规范 v1.0）
						// 问答题格式：正面\n\n---div---\n\n（背面留空，用户后续填写）
						const content = `${selectedText}\n\n---div---\n\n`;

						// ✅ 步骤6：准备溯源信息（使用专用字段，不混入fields）
						const cardMetadata: any = {};
						if (blockLinkInfo) {
							// L1溯源：完整块链接
							cardMetadata.sourceFile = sourceFile;
							cardMetadata.sourceBlock = `^${blockLinkInfo.blockId}`; // ✅ 添加^前缀，保持与批量解析一致
						} else if (sourceFile) {
							// L2溯源：文档级
							cardMetadata.sourceFile = sourceFile;
						}
						// L3：无溯源信息（cardMetadata保持为空对象）

						// ✅ 步骤7：打开创建卡片模态窗（传递标准content和元数据）
						logger.debug("📝 [快捷键创建卡片] 打开创建卡片模态窗");

						await this.openCreateCardModal({
							initialContent: content, // ✅ 传递标准格式的content
							cardMetadata, // ✅ 传递溯源元数据
							onSuccess: (card: any) => {
								logger.debug("✅ [快捷键创建卡片] 卡片创建成功:", card.id);
								new Notice("卡片创建成功", 2000);
							},
							onCancel: () => {
								logger.debug("ℹ️ [快捷键创建卡片] 用户取消创建");
							},
						});
					} catch (error) {
						logger.error("❌ [快捷键创建卡片] 执行失败:", error);
						new Notice("创建卡片失败，请重试", 3000);
					}
				},
			});

			// 🆕 从选中文本创建增量摘录笔记（快捷键，无模态窗）
			this.addCommand({
				id: "create-extract-note-from-selection",
				name: "从选中文本创建摘录笔记",
				icon: "scissors",
				callback: async () => {
					try {
						logger.debug("📝 [快捷键创建摘录] 命令触发");

						// 步骤1：获取选中文本
						let selectedText = "";
						let editor: Editor | null = null;

						const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
						if (activeView?.editor) {
							editor = activeView.editor;
							selectedText = editor.getSelection();
						}

						// 降级方案：从window获取
						if (!selectedText || selectedText.trim() === "") {
							const windowSelection = window.getSelection();
							if (windowSelection?.toString().trim()) {
								selectedText = windowSelection.toString().trim();
							}
						}

						// 步骤2：检查是否有选中文本
						if (!selectedText || selectedText.trim() === "") {
							logger.debug("⚠️ [快捷键创建摘录] 未选中文本");

							if (editor) {
								const cursor = editor.getCursor();
								const line = editor.getLine(cursor.line);

								if (line?.trim()) {
									selectedText = line.trim();
									editor.setSelection(
										{ line: cursor.line, ch: 0 },
										{ line: cursor.line, ch: line.length }
									);
									new Notice("使用当前行内容创建摘录", 2000);
								} else {
									new Notice("请先选中要创建摘录的文本内容", 3000);
									return;
								}
							} else {
								new Notice("请在编辑视图中选中文本后再使用快捷键", 3000);
								return;
							}
						}

						// 步骤3：获取文件信息
						const activeFile = activeView?.file;
						let sourceFile: string | undefined;

						if (activeFile) {
							sourceFile = activeFile.path;
							logger.debug("✅ [快捷键创建摘录] 源文件:", sourceFile);
						}

						// 步骤4：创建块链接
						let blockId: string | undefined;

						if (sourceFile) {
							try {
								const { BlockLinkManager } = await import("./utils/block-link-manager");
								const blockLinkManager = new BlockLinkManager(this.app);

								const blockLinkResult = await blockLinkManager.createBlockLinkForSelection(
									selectedText,
									sourceFile
								);

								if (blockLinkResult.success && blockLinkResult.blockLinkInfo) {
									blockId = blockLinkResult.blockLinkInfo.blockId;
									logger.debug("✅ [快捷键创建摘录] 块链接创建成功:", blockId);

									// 标记块链接为最近创建
									if (this.blockLinkCleanupService) {
										this.blockLinkCleanupService.markRecentlyCreated(blockId);
									}
								}
							} catch (error) {
								logger.error("❌ [快捷键创建摘录] 块链接创建异常:", error);
							}
						}

						// 步骤5：创建摘录卡片
						const { generateUUID } = await import("./utils/helpers");
						const now = new Date();

						const extractCard = {
							id: generateUUID(),
							type: "note" as const,
							content: selectedText.trim(),
							sourceFile: sourceFile || "",
							sourceBlock: blockId ? `^${blockId}` : undefined,
							createdAt: now,
							updatedAt: now,
							completed: false,
							pinned: false,
							tags: ["weave-incremental-reading"],
							deckId: "default",
						};

						// 步骤6：保存摘录卡片
						if (
							this.readingMaterialManager &&
							typeof (this.readingMaterialManager as any).addExtractCard === "function"
						) {
							await (this.readingMaterialManager as any).addExtractCard(extractCard);
						} else {
							// 降级：直接保存到存储
							logger.warn("⚠️ [快捷键创建摘录] ReadingMaterialManager 不可用，使用降级方案");
						}

						logger.debug("✅ [快捷键创建摘录] 摘录创建成功:", extractCard.id);
						new Notice("摘录笔记已添加", 2000);

						// 🆕 触发摘录添加事件，通知 ExtractListView 刷新
						this.app.workspace.trigger("Weave:extract-added" as any, extractCard);
						logger.debug("📢 [快捷键创建摘录] 已触发 Weave:extract-added 事件");
					} catch (error) {
						logger.error("❌ [快捷键创建摘录] 执行失败:", error);
						new Notice("创建摘录失败，请重试", 3000);
					}
				},
			});

			this.addCommand({
				id: "create-ir-reading-point-from-selection",
				name: i18n.t("commands.createIrReadingPointFromSelection.name"),
				icon: "book-plus",
				callback: async () => {
					await this.runSelectionToIRQuickCreate(this.getSelectionContextForIRQuickCreate());
				},
			});

			this.addCommand({
				id: "copy-selection-block-embed-link",
				name: "复制选区块嵌入链接",
				icon: "link",
				callback: async () => {
					try {
						let selectedText = "";
						let editor: Editor | null = null;
						let selectionFromPluginEditor = false;
						let activeFile = this.app.workspace.getActiveFile();
						let sourceFilePath: string | undefined = activeFile?.path;
						let irCtx: { sourcePath: string; startLine: number; endLine?: number } | null = null;

						const contextManager = EditorContextManager.getInstance();
						if (contextManager.hasActivePluginEditor()) {
							editor = contextManager.getCompatibleEditor();
							if (editor) {
								const pluginSelection = editor.getSelection();
								if (pluginSelection && pluginSelection.trim() !== "") {
									selectedText = pluginSelection;
									selectionFromPluginEditor = true;
								} else {
									editor = null;
								}
							}
						}

						if (!editor) {
							const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
							if (activeView?.editor) {
								editor = activeView.editor;
								selectedText = editor.getSelection();
								activeFile = activeView.file || activeFile;
								sourceFilePath = activeView.file?.path || sourceFilePath;
							}
						}

						if (!selectedText || selectedText.trim() === "") {
							const windowSelection = window.getSelection();
							if (windowSelection?.toString().trim()) {
								selectedText = windowSelection.toString().trim();
							}
						}

						if (!selectedText || selectedText.trim() === "") {
							new Notice("请先选中要获取块链接的文本内容", 3000);
							return;
						}

						// 增量阅读界面兼容：尝试获取 IR 当前块上下文（编辑模式或预览模式均适用）
						// 当activeFile是临时文件或来自插件编辑器时，都应尝试获取真实来源路径
						const isTempFile = sourceFilePath && /weave-editor-/.test(sourceFilePath);
						if (selectionFromPluginEditor || isTempFile) {
							try {
								const { irActiveBlockContextStore } = await import(
									"./stores/ir-active-block-context-store"
								);
								irCtx = irActiveBlockContextStore.getActiveContext();
								if (irCtx?.sourcePath) {
									sourceFilePath = irCtx.sourcePath;
								}
							} catch (error) {
								logger.warn("⚠️ [复制块链接] 无法读取 IR 块上下文信息:", error);
							}
						}

						// 增量阅读界面兼容：如果没有 sourceFilePath 或仍为临时文件，尝试从 IR 活动文档 store 获取
						if (!sourceFilePath || /weave-editor-/.test(sourceFilePath)) {
							try {
								const { irActiveDocumentStore } = await import("./stores/ir-active-document-store");
								const irActiveDocument = irActiveDocumentStore.getActiveDocument();
								if (irActiveDocument) {
									sourceFilePath = irActiveDocument;
								}
							} catch (error) {
								logger.warn("⚠️ [复制块链接] 无法读取 IR 活动文档信息:", error);
							}
						}

						if (!sourceFilePath || /weave-editor-/.test(sourceFilePath)) {
							new Notice("未找到源 Markdown 文件（请在文档或增量阅读材料中使用）", 3000);
							return;
						}

						// 尽量校验文件类型（避免非md路径导致块链接创建失败）
						const af = this.app.vault.getAbstractFileByPath(sourceFilePath);
						const ext = (af as any)?.extension;
						if (ext && ext !== "md") {
							new Notice("当前源文件不是 Markdown 文件", 3000);
							return;
						}

						const { BlockLinkManager } = await import("./utils/block-link-manager");
						const blockLinkManager = new BlockLinkManager(this.app);
						const result = irCtx
							? await blockLinkManager.createBlockLinkForIRSelection(
									selectedText,
									irCtx.sourcePath,
									irCtx.startLine || 0,
									irCtx.endLine || 0
							  )
							: await blockLinkManager.createBlockLinkForSelection(selectedText, sourceFilePath);

						if (!result.success || !result.blockLinkInfo?.blockId) {
							new Notice("无法创建块链接（可能未能在源文档中定位该文本）", 3500);
							return;
						}

						const embedLink = `![[${sourceFilePath}#^${result.blockLinkInfo.blockId}]]`;

						try {
							await navigator.clipboard.writeText(embedLink);
							new Notice("块链接已复制到剪贴板", 2000);
						} catch {
							new Notice("已生成块链接（无法自动写入剪贴板，请手动复制）", 3000);
						}
					} catch (error) {
						logger.error("❌ [复制块链接] 执行失败:", error);
						new Notice("获取块链接失败，请重试", 3000);
					}
				},
			});

			this.addCommand({
				id: "create-card-from-selection-block-embed-link",
				name: "用选区块嵌入链接创建卡片",
				icon: "plus",
				callback: async () => {
					try {
						let selectedText = "";
						let editor: Editor | null = null;
						let selectionFromPluginEditor = false;
						let activeFile = this.app.workspace.getActiveFile();
						let sourceFilePath: string | undefined = activeFile?.path;
						let irCtx: { sourcePath: string; startLine: number; endLine?: number } | null = null;

						const contextManager = EditorContextManager.getInstance();
						if (contextManager.hasActivePluginEditor()) {
							editor = contextManager.getCompatibleEditor();
							if (editor) {
								const pluginSelection = editor.getSelection();
								if (pluginSelection && pluginSelection.trim() !== "") {
									selectedText = pluginSelection;
									selectionFromPluginEditor = true;
								} else {
									editor = null;
								}
							}
						}

						if (!editor) {
							const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
							if (activeView?.editor) {
								editor = activeView.editor;
								selectedText = editor.getSelection();
								activeFile = activeView.file || activeFile;
								sourceFilePath = activeView.file?.path || sourceFilePath;
							}
						}

						if (!selectedText || selectedText.trim() === "") {
							const windowSelection = window.getSelection();
							if (windowSelection?.toString().trim()) {
								selectedText = windowSelection.toString().trim();
							}
						}

						if (!selectedText || selectedText.trim() === "") {
							new Notice("请先选中要获取块链接的文本内容", 3000);
							return;
						}

						// 增量阅读界面兼容：尝试获取 IR 当前块上下文（编辑模式或预览模式均适用）
						const isTempFile2 = sourceFilePath && /weave-editor-/.test(sourceFilePath);
						if (selectionFromPluginEditor || isTempFile2) {
							try {
								const { irActiveBlockContextStore } = await import(
									"./stores/ir-active-block-context-store"
								);
								irCtx = irActiveBlockContextStore.getActiveContext();
								if (irCtx?.sourcePath) {
									sourceFilePath = irCtx.sourcePath;
								}
							} catch (error) {
								logger.warn("⚠️ [选中块引用->新建卡片] 无法读取 IR 块上下文信息:", error);
							}
						}

						// 增量阅读界面兼容：如果没有 sourceFilePath 或仍为临时文件，尝试从 IR 活动文档 store 获取
						if (!sourceFilePath || /weave-editor-/.test(sourceFilePath)) {
							try {
								const { irActiveDocumentStore } = await import("./stores/ir-active-document-store");
								const irActiveDocument = irActiveDocumentStore.getActiveDocument();
								if (irActiveDocument) {
									sourceFilePath = irActiveDocument;
								}
							} catch (error) {
								logger.warn("⚠️ [选中块引用->新建卡片] 无法读取 IR 活动文档信息:", error);
							}
						}

						if (!sourceFilePath || /weave-editor-/.test(sourceFilePath)) {
							new Notice("未找到源 Markdown 文件（请在文档或增量阅读材料中使用）", 3000);
							return;
						}

						// 尽量校验文件类型（避免非md路径导致块链接创建失败）
						const af = this.app.vault.getAbstractFileByPath(sourceFilePath);
						const ext = (af as any)?.extension;
						if (ext && ext !== "md") {
							new Notice("当前源文件不是 Markdown 文件", 3000);
							return;
						}

						const { BlockLinkManager } = await import("./utils/block-link-manager");
						const blockLinkManager = new BlockLinkManager(this.app);
						const result = irCtx
							? await blockLinkManager.createBlockLinkForIRSelection(
									selectedText,
									irCtx.sourcePath,
									irCtx.startLine || 0,
									irCtx.endLine || 0
							  )
							: await blockLinkManager.createBlockLinkForSelection(selectedText, sourceFilePath);

						if (!result.success || !result.blockLinkInfo?.blockId) {
							new Notice("无法创建块链接（可能未能在源文档中定位该文本）", 3500);
							return;
						}

						const embedLink = `![[${sourceFilePath}#^${result.blockLinkInfo.blockId}]]`;

						await this.openCreateCardModal({
							initialContent: embedLink,
							cardMetadata: {
								content: embedLink,
								sourceFile: sourceFilePath,
								sourceBlock: result.blockLinkInfo.blockId,
							},
						});

						new Notice("已打开新建卡片并填充块引用链接", 2000);
					} catch (error) {
						logger.error("❌ [选中块引用->新建卡片] 执行失败:", error);
						new Notice("新建卡片失败，请重试", 3000);
					}
				},
			});

			// 🆕 格式化选中文本为Anki挖空格式（支持插件编辑器和原生编辑器）
			this.addCommand({
				id: "format-selection-as-cloze",
				name: i18n.t("commands.formatAsCloze.name"),
				icon: "highlighter",
				editorCallback: async (editor: Editor) => {
					await this.formatSelectionAsCloze(editor);
				},
				callback: async () => {
					await this.formatSelectionAsCloze();
				},
			});

			// 🆕 批量解析命令
			this.registerBatchParsingCommands();

			// 📱 移动端命令（可添加到 Obsidian 移动端工具栏）
			this.registerMobileCommands();

			// 🧹 块链接清理命令
			this.registerCleanupCommands();

			this.registerWeaveContextMenuFeatures();
			this.registerPdfPlusContextMenuFeatures();

			// 🖼️ 图片遮罩功能
			this.registerImageMaskFeatures();

			// 🤖 选中文本 AI 制卡（右键菜单 + 编辑器顶部预览面板）
			this.registerSelectedTextAICardFeatures();

			// Add settings tab
			this.addSettingTab(new AnkiSettingsTab(this.app, this));

			// 初始化媒体调试助手（开发模式）
			if (process.env.NODE_ENV === "development") {
				initMediaDebug(this);
			}

			// 🎨 初始化 UI 管理器（统一管理所有全局UI组件）
			logger.debug("🎨 Initializing UI Manager...");
			const { UIManager } = await import("./services/ui/UIManager");
			this.uiManager = UIManager.getInstance(this, {
				debug: this.settings.enableDebugMode || false,
			});
			logger.debug("✅ UI Manager initialized");

			// 创建全局悬浮按钮（如果启用）
			if (this.settings.showFloatingCreateButton) {
				this.createGlobalFloatingButton();
			}

			/*


		logger.debug('Weave 插件完全初始化完成');
		
		// v2.1: 自动检测并提示 YAML 元数据迁移
		*/
			logger.debug("Weave plugin fully initialized");
			await this.checkAndPromptMigration();

			// 初始化 AnkiConnect 服务（如果启用）
			await this.initializeAnkiConnect();

			// ⏸️ 自动备份初始化已移至 initializeDataStorage() 方法
			// 因为备份功能依赖 dataStorage，需要在 onLayoutReady 后初始化
		} catch (error) {
			logger.error("插件初始化失败:", error);
			new Notice("Weave 插件初始化失败，请查看控制台了解详情", 5000);
		}
	}

	/**
	 * v2.1: 自动检测并提示 YAML 元数据迁移
	 * 启动时检测需要迁移的卡片，显示确认弹窗
	 */
	private async checkAndPromptMigration(): Promise<void> {
		try {
			if (!this.dataStorage) {
				return;
			}

			const allCards = await this.dataStorage.getAllCards();
			if (allCards.length === 0) {
				return;
			}

			const { cardNeedsMigration, CardYAMLMigrationService } = await import(
				"./services/data-migration/CardYAMLMigrationService"
			);

			let needsMigration = 0;
			let alreadyMigrated = 0;

			for (const card of allCards) {
				if (cardNeedsMigration(card)) {
					needsMigration++;
				} else {
					alreadyMigrated++;
				}
			}

			// 如果没有需要迁移的卡片，跳过
			if (needsMigration === 0) {
				logger.info("[Migration] 所有卡片已是新格式，无需迁移");
				return;
			}

			logger.info(`[Migration] 检测到 ${needsMigration} 张卡片需要迁移`);

			// 显示迁移确认弹窗
			const { MigrationConfirmModal } = await import("./components/modals/MigrationConfirmModal");

			const modal = new MigrationConfirmModal(
				this.app,
				this as any,
				{
					total: allCards.length,
					needsMigration,
					alreadyMigrated,
				},
				async () => {
					// 用户确认迁移
					const migrationService = new CardYAMLMigrationService(this as any);
					const result = await migrationService.runFullMigration();

					if (result.success) {
						new Notice(`数据升级完成\n已升级: ${result.migratedCount} 张卡片`, 5000);
					} else {
						new Notice(
							`数据升级部分完成\n成功: ${result.migratedCount}\n失败: ${result.failedCount}`,
							5000
						);
					}

					logger.info("[Migration] 迁移结果:", result);
				},
				() => {
					// 用户跳过
					logger.info("[Migration] 用户选择稍后迁移");
				}
			);

			modal.open();
		} catch (error) {
			logger.error("[Migration] 自动检测迁移失败:", error);
		}
	}

	onunload() {
		this.cleanupServices();
	}

	/**
	 * 统一清理所有服务和资源
	 * 集中管理所有 teardown 逻辑，确保插件卸载时无资源泄漏
	 */
	private cleanupServices() {
		// 1. 刷写待处理数据
		try {
			void this.dataStorage?.flushPendingWrites();
		} catch {}
		try {
			void vaultStorage.flush();
		} catch {}

		// 2. 保存并清理AI配置Store
		aiConfigStore
			.forceSave()
			.then(() => {
				aiConfigStore.destroy();
			})
			.catch((_error) => {
				logger.error("AI配置Store清理失败:", _error);
			});

		// 3. 清理编辑器相关服务
		try {
			void this.editorTempFileCleanupService?.cleanupNow();
		} catch {}
		try {
			this.selectedTextAICardPanelManager?.dispose();
		} catch {}
		try {
			this.editorAIToolbarManager?.destroy();
		} catch {}
		try {
			this.editorPoolManager?.cleanup();
		} catch {}

		// 4. 清理 DOM 残留
		try {
			document.querySelectorAll(".weave-ir-markdown-bottom-toolbar-container").forEach((el) => {
				try {
					(el as HTMLElement).remove();
				} catch {}
			});
		} catch {}

		// 5. 清理核心服务
		try {
			resetDataManagementService();
		} catch {}
		try {
			destroyCardQualityInboxService();
		} catch {}
		try {
			if (this.sourceTraceNoticeTimer) {
				clearTimeout(this.sourceTraceNoticeTimer);
				this.sourceTraceNoticeTimer = null;
			}
			this.sourceTraceNotice?.destroy();
			this.sourceTraceNotice = null;
		} catch {}
		try {
			this.uiManager?.destroyAll();
		} catch {}
		try {
			this.externalSyncWatcher?.stop();
		} catch {}
		try {
			this.dataSyncService?.destroy();
		} catch {}
		this.cleanupAnkiConnect();
		this.cleanupAutoBackup();

		// 7. 清理批量解析与索引服务
		try {
			this.batchParsingWatcher?.destroy();
			this.batchParsingWatcher = undefined;
		} catch {}
		try {
			this.batchParsingManager?.destroy();
			this.batchParsingManager = undefined;
		} catch {}
		try {
			this.directFileReader?.dispose();
		} catch {}
		try {
			this.cardIndexService?.dispose();
		} catch {}

		// 8. 清理全局 window 上注册的清理函数
		const globalCleanupKeys = [
			"__weaveMobileModalAdaptationCleanup",
			"__weaveThemeManagerCleanup",
			"__weaveGlobalErrorReporterCleanup",
			"__weaveUnifiedErrorHandlerCleanup",
			"__weaveConfigPerformanceMonitorCleanup",
			"__weaveServicePerformanceMonitorCleanup",
			"__weaveFocusManagerCleanup",
			"__weaveEnhancedPerformanceMonitorCleanup",
			"__weaveMemoryManagerCleanup",
			"__weaveAdaptiveCacheServiceCleanup",
			"__weaveSmartCacheServiceCleanup",
			"__weaveCacheManagerCleanup",
			"__weaveGlobalPerformanceMonitorCleanup",
			"__weaveGlobalStateManagerCleanup",
		];
		const w = window as any;
		for (const key of globalCleanupKeys) {
			try {
				if (typeof w[key] === "function") {
					w[key]();
				}
			} catch {}
		}

		logger.debug("[Weave] 插件卸载完成");
	}

	/**
	 * 打开新建卡片模态框 - 直接挂载到 document.body（全局显示）
	 * ✅ 重构后架构：预加载数据 → 直接挂载组件
	 *
	 * @param options 创建卡片选项（兼容字符串参数）
	 */
	async openCreateCardModal(options?: CreateCardOptions | string): Promise<void> {
		try {
			// ✅ 单例检查：如果已有模态窗打开，填充内容到现有窗口
			if (this.currentCreateCardModal) {
				logger.debug("🎯 [openCreateCardModal] 已存在打开的模态窗，填充内容到现有窗口");

				// 兼容旧的字符串参数格式
				const params = typeof options === "string" ? { initialContent: options } : options || {};

				// 🔧 修复：同时支持 sourceInfo 和 cardMetadata（快捷键使用 cardMetadata）
				const { initialContent = "", sourceInfo, cardMetadata } = params;

				// 合并溯源信息：优先使用 cardMetadata，兼容 sourceInfo
				const metadata =
					cardMetadata ||
					(sourceInfo
						? {
								sourceFile: sourceInfo.file,
								sourceBlock: sourceInfo.blockId,
						  }
						: undefined);

				// 🔑 填充新内容到现有模态窗
				if (initialContent && this.currentCreateCardModal.updateContent) {
					await this.currentCreateCardModal.updateContent(initialContent, metadata);
					logger.debug("🎯 [openCreateCardModal] ✅ 内容已填充到现有模态窗");
					new Notice("内容已填充到编辑器");
				}

				// 温和提示：只在有内容填充时才闪烁
				if (initialContent) {
					// 聚焦现有窗口（将容器滚动到视图）
					this.currentCreateCardModal.container.scrollIntoView({
						behavior: "smooth",
						block: "center",
					});
					// 轻微高亮提示（避免过度动画造成"重开"的感觉）
					const container = this.currentCreateCardModal.container;
					container.setCssProps({ "box-shadow": "0 0 20px rgba(88, 166, 255, 0.5)" });
					setTimeout(() => {
						container.setCssProps({ "box-shadow": "" });
					}, 300);
				}
				return;
			}

			// 兼容旧的字符串参数格式
			const params = typeof options === "string" ? { initialContent: options } : options || {};

			const {
				initialContent = "",
				parsedCard,
				sourceInfo,
				selectedTemplate,
				contentMapping,
				onSuccess,
				onCancel,
			} = params;

			logger.debug("🎯 [openCreateCardModal] 被调用（直接挂载模式）");

			// ✅ 检查dataStorage是否已初始化
			if (!this.dataStorage) {
				logger.error("❌ [openCreateCardModal] dataStorage未初始化");
				new Notice("插件正在初始化，请稍候再试");
				return;
			}

			// ✅ 步骤1: 预加载所有必需数据（避免组件内异步加载）
			logger.debug("🎯 [openCreateCardModal] 预加载数据...");

			// 获取牌组数据
			const decks = await this.dataStorage.getAllDecks();

			// 模板数据获取已简化，不再从templateStore获取
			// const { templateStore } = await import('./stores/TemplateStore');
			const templates: any[] = [];
			// templateStore.state.subscribe(_state => {
			// 	templates = _state.fieldTemplates || [];
			// })();

			logger.debug("🎯 [openCreateCardModal] 数据预加载完成");

			// 🔍 调试：显示接收到的 cardMetadata
			logger.debug("🎯 [openCreateCardModal] 接收到的参数", {
				hasCardMetadata: !!params.cardMetadata,
				cardMetadata: params.cardMetadata,
				sourceFile: params.cardMetadata?.sourceFile,
				sourceBlock: params.cardMetadata?.sourceBlock,
			});

			// ✅ 步骤2: 创建新卡片对象（遵循卡片数据结构规范 v1.0）
			const { CardType } = await import("./data/types");
			const { createContentWithMetadata } = await import("./utils/yaml-utils");

			// ✅ 确定初始正文内容
			const bodyContent = initialContent || params.cardMetadata?.content || "";

			// 🆕 v2.1: 构建 YAML 元数据并生成带 frontmatter 的 content
			const persistedDeckNames = Array.isArray(
				this.settings.createCardPreferences?.lastSelectedDeckNames
			)
				? this.settings.createCardPreferences?.lastSelectedDeckNames.filter(
						(name): name is string => !!name && typeof name === "string"
				  )
				: [];
			const persistedDeckId =
				typeof this.settings.createCardPreferences?.lastSelectedDeckId === "string"
					? this.settings.createCardPreferences.lastSelectedDeckId
					: "";
			const persistedPrimaryDeck = persistedDeckId
				? decks.find((d) => d.id === persistedDeckId)
				: persistedDeckNames.length > 0
				? decks.find((d) => d.name === persistedDeckNames[0])
				: undefined;
			const deckId =
				params.cardMetadata?.deckId || persistedPrimaryDeck?.id || decks[0]?.id || "default";
			const deckName = decks.find((d) => d.id === deckId)?.name;
			const initialDeckNames =
				persistedDeckNames.length > 0
					? persistedDeckNames.filter((name) => decks.some((d) => d.name === name))
					: deckName
					? [deckName]
					: [];

			const yamlMetadata: Record<string, any> = {};
			// v3.1: 安全网 - 检测临时文件路径并解析为真实来源文档
			if (params.cardMetadata?.sourceFile && /weave-editor-/.test(params.cardMetadata.sourceFile)) {
				logger.warn(
					"[openCreateCardModal] 检测到临时文件路径，尝试解析真实来源:",
					params.cardMetadata.sourceFile
				);
				try {
					const { irActiveBlockContextStore } = await import(
						"./stores/ir-active-block-context-store"
					);
					const irCtx = irActiveBlockContextStore.getActiveContext();
					if (irCtx?.sourcePath) {
						params.cardMetadata.sourceFile = irCtx.sourcePath;
						logger.info("[openCreateCardModal] 已替换为IR块上下文来源:", irCtx.sourcePath);
					} else {
						const { irActiveDocumentStore } = await import("./stores/ir-active-document-store");
						const irDoc = irActiveDocumentStore.getActiveDocument();
						if (irDoc) {
							params.cardMetadata.sourceFile = irDoc;
							logger.info("[openCreateCardModal] 已替换为IR活动文档来源:", irDoc);
						}
					}
				} catch (e) {
					logger.warn("[openCreateCardModal] 解析真实来源失败:", e);
				}
			}

			// 🔧 v2.1.1: 使用合并的 wikilink 格式
			if (params.cardMetadata?.sourceFile) {
				// 移除 .md 后缀用于 wikilink
				const docName = params.cardMetadata.sourceFile.replace(/\.md$/, "");
				const blockId = params.cardMetadata?.sourceBlock?.replace(/^\^/, ""); // 移除可能的 ^ 前缀

				logger.debug("🎯 [openCreateCardModal] 处理来源信息", {
					sourceFile: params.cardMetadata.sourceFile,
					sourceBlock: params.cardMetadata.sourceBlock,
					docName,
					blockId,
				});

				if (blockId) {
					// 合并格式: ![[文档名#^blockId]]
					yamlMetadata.we_source = `![[${docName}#^${blockId}]]`;
				} else {
					// 仅文档: [[文档名]]
					yamlMetadata.we_source = `[[${docName}]]`;
				}
			}
			if (!yamlMetadata.we_source && typeof bodyContent === "string" && bodyContent.trim()) {
				const firstPdfOrEpubLink =
					bodyContent.match(
						/(!?\[\[[^\]]+?\.pdf[^\]]*?#page=[^\]]*?(?:rect|selection)=[^\]]*?\]\])/i
					)?.[1] ||
					bodyContent.match(
						/(\[\[(?:(?!\]\]).)+\.epub(?:(?!\]\]).)*#(?:weave-loc=|weave-cfi=)(?:(?!\]\]).)*\]\])/i
					)?.[1];
				if (firstPdfOrEpubLink) {
					yamlMetadata.we_source = firstPdfOrEpubLink;
				}
			}
			if (initialDeckNames.length > 0) {
				yamlMetadata.we_decks = initialDeckNames;
			}
			yamlMetadata.we_type = CardType.Basic;
			yamlMetadata.created = new Date().toISOString();

			// ✅ 生成带 YAML frontmatter 的完整 content
			const cardContent = createContentWithMetadata(yamlMetadata, bodyContent);

			logger.debug("🎯 [openCreateCardModal] Content-Only 架构：content 已包含 YAML frontmatter");

			// 🆕 v0.8: 使用统一ID系统生成UUID
			const newCard: import("./data/types").Card = {
				uuid: generateUUID(), // 🆕 使用新格式UUID：tk-{12位}（Card.id已废弃）
				deckId, // ✅ 使用上面定义的 deckId 变量
				// ❌ templateId: 不再生成（改为可选字段）
				type: CardType.Basic, // ✅ 只需要 type 判断题型

				// ✅ Content-Only: content 是唯一数据源
				content: cardContent,

				// ❌ 不再生成 fields

				// ✅ 元数据使用专用字段
				sourceFile: params.cardMetadata?.sourceFile,
				sourceBlock: params.cardMetadata?.sourceBlock,

				fsrs: {
					due: new Date().toISOString(),
					stability: 0,
					difficulty: 0,
					elapsedDays: 0,
					scheduledDays: 0,
					reps: 0,
					lapses: 0,
					state: 0,
					lastReview: undefined,
					retrievability: 1,
				},
				reviewHistory: [],
				stats: {
					totalReviews: 0,
					totalTime: 0,
					averageTime: 0,
					memoryRate: 0,
				},
				created: new Date().toISOString(),
				modified: new Date().toISOString(),
				tags: parsedCard?.tags || [],
			};

			// ✅ 步骤3: 获取嵌入式编辑器管理器（旧嵌入式方案：embedRegistry）
			if (!this.editorPoolManager) {
				const { EmbeddableEditorManager } = await import(
					"./services/editor/EmbeddableEditorManager"
				);
				this.editorPoolManager = new EmbeddableEditorManager(this.app);
			}
			const editorPoolManager = this.editorPoolManager;

			// ✅ 步骤4: 动态导入组件并直接挂载到 document.body
			logger.debug("🎯 [openCreateCardModal] 动态导入CreateCardModal组件...");
			const { mount, unmount } = await import("svelte");
			const { default: CreateCardModal } = await import(
				"./components/modals/CreateCardModal.svelte"
			);

			// ✅ 步骤5: 创建挂载容器（全局显示，在所有标签页上方）
			const container = document.createElement("div");
			container.className = "weave-create-card-modal-container";
			document.body.appendChild(container);

			// ✅ 步骤6: 挂载组件并传入预加载的数据
			logger.debug("🎯 [openCreateCardModal] 挂载CreateCardModal组件到document.body...");
			const modalInstance = mount(CreateCardModal, {
				target: container,
				props: {
					open: true,
					card: newCard,
					plugin: this,
					editorPoolManager,
					decks, // ✅ 预加载的牌组数据
					templates, // ✅ 预加载的模板数据
					onModalClose: () => {
						logger.debug("🎯 [openCreateCardModal] 模态窗关闭，清理DOM");
						void unmount(modalInstance);
						container.remove();
						// ✅ 清理单例引用
						this.currentCreateCardModal = null;
					},
					onSave: (savedCard: any) => {
						// ✅ 只通知保存成功，不关闭模态窗
						// 让 CreateCardModal 自己决定是否关闭（支持钉住模式）
						logger.debug("🎯 [openCreateCardModal] 卡片保存成功，通知外部");
						onSuccess?.(savedCard);
					},
					onCancel: () => {
						logger.debug("🎯 [openCreateCardModal] 用户取消");
						onCancel?.();
						void unmount(modalInstance);
						container.remove();
						// ✅ 清理单例引用
						this.currentCreateCardModal = null;
					},
				},
			});

			// 🆕 创建方法引用包装器
			const updateContentWrapper = async (content: string, metadata: any) => {
				if (modalInstance?.updateContent) {
					await modalInstance.updateContent(content, metadata);
				}
			};

			// ✅ 保存当前模态窗引用（单例控制 + 方法引用）
			this.currentCreateCardModal = {
				instance: modalInstance,
				container,
				updateContent: updateContentWrapper,
			};

			logger.debug(
				"🎯 [openCreateCardModal] ✅ 新建卡片模态窗已成功挂载（全局显示，支持外部操作）"
			);
		} catch (error) {
			logger.error("🎯 [openCreateCardModal] 执行失败:", error);
			new Notice("打开新建卡片模态框时发生错误");
		}
	}

	/**
	 * 打开编辑卡片模态窗（全局方法，支持从任意位置调用）
	 * ✅ 重构后架构：完全对齐 openCreateCardModal 的设计
	 *
	 * @param card 要编辑的卡片对象
	 * @param options 可选配置
	 */
	async openEditCardModal(
		card: import("./data/types").Card,
		options?: {
			onSave?: (card: import("./data/types").Card) => void;
			onCancel?: () => void;
		}
	): Promise<void> {
		try {
			const { onSave, onCancel } = options || {};

			// ✅ 强制清理旧模态窗（防止重复实例）
			if (this.currentEditCardModal) {
				logger.debug("🎯 [openEditCardModal] 强制清理旧模态窗");
				const { unmount } = await import("svelte");
				try {
					void unmount(this.currentEditCardModal.instance);
				} catch (e) {
					logger.warn("[openEditCardModal] unmount失败:", e);
				}
				this.currentEditCardModal.container.remove();
				this.currentEditCardModal = null;
			}

			// ⚠️ 强制清理所有残留的编辑器容器
			const orphans = document.querySelectorAll(".weave-edit-card-modal-container");
			if (orphans.length > 0) {
				logger.warn(`🎯 [openEditCardModal] 发现${orphans.length}个残留容器，强制清理`);
				orphans.forEach((el) => el.remove());
			}

			// ✅ 检查必要服务
			if (!this.dataStorage || !this.editorPoolManager) {
				logger.error("❌ [openEditCardModal] 服务未初始化");
				new Notice("插件正在初始化，请稍候再试");
				return;
			}

			// ✅ 加载牌组数据
			// 优先使用缓存，缓存为空时才异步加载
			const decks =
				this.cachedDecks.length > 0 ? this.cachedDecks : await this.dataStorage.getAllDecks();
			const editorPoolManager = this.editorPoolManager;

			// ✅ 动态导入
			const { mount, unmount } = await import("svelte");
			const { default: EditCardModal } = await import("./components/modals/EditCardModal.svelte");

			// ✅ 创建容器
			const container = document.createElement("div");
			container.className = "weave-edit-card-modal-container";
			document.body.appendChild(container);

			// ✅ 挂载组件
			const modalInstance = mount(EditCardModal, {
				target: container,
				props: {
					open: true,
					card,
					plugin: this,
					editorPoolManager,
					decks,
					onModalClose: () => {
						logger.debug("🎯 [openEditCardModal] 关闭并清理");
						void unmount(modalInstance);
						container.remove();
						this.currentEditCardModal = null;
					},
					onSave: (savedCard: any) => {
						logger.debug("🎯 [openEditCardModal] 保存成功，立即关闭");
						void unmount(modalInstance);
						container.remove();
						this.currentEditCardModal = null;

						if (onSave) {
							Promise.resolve(onSave(savedCard)).catch((e: any) => {
								logger.error("[openEditCardModal] onSave失败:", e);
							});
						}
					},
					onCancel: () => {
						logger.debug("🎯 [openEditCardModal] 取消");
						onCancel?.();
						void unmount(modalInstance);
						container.remove();
						this.currentEditCardModal = null;
					},
				},
			});

			this.currentEditCardModal = { instance: modalInstance, container };
			logger.debug("🎯 [openEditCardModal] ✅ 挂载成功");
		} catch (error) {
			logger.error("🎯 [openEditCardModal] 失败:", error);
			new Notice("打开编辑卡片模态框时发生错误");
		}
	}

	/**
	 * 控制侧边栏重定向提示的显示频率，避免重复弹出提示。
	 */
	private showIRSidebarRedirectNotice(deckPath?: string, deckName?: string): void {
		const now = Date.now();
		if (now - this.lastIRSidebarRedirectNoticeAt < 1500) {
			return;
		}

		const resolvedDeckName =
			String(deckName || "").trim() ||
			String(deckPath || "")
				.split("/")
				.pop()
				?.trim() ||
			"当前增量阅读牌组";

		new Notice(
			`增量阅读已改为通过左侧侧边栏配合文档、PDF 或 EPUB 阅读，不再打开独立学习界面。请在左侧侧边栏继续处理“${resolvedDeckName}”。`,
			5000
		);
		this.lastIRSidebarRedirectNoticeAt = now;
	}

	async redirectIncrementalReadingToSidebar(options?: {
		deckPath?: string;
		deckName?: string;
		closeLegacyFocusLeaves?: boolean;
	}): Promise<void> {
		try {
			await this.activateIRCalendarView();
			if (options?.closeLegacyFocusLeaves) {
				this.app.workspace.detachLeavesOfType(VIEW_TYPE_IR_FOCUS);
			}
			this.showIRSidebarRedirectNotice(options?.deckPath, options?.deckName);
		} catch (error) {
			logger.error("[WeavePlugin] 重定向增量阅读到侧边栏失败:", error);
			new Notice("打开增量阅读侧边栏失败");
		}
	}

	/**
	 * 打开卡片详情模态框 - 直接挂载到 document.body（全局显示）
	 * ✅ 支持在其他标签页上方显示，不局限于插件视图
	 *
	 * @param card 要查看的卡片对象
	 * @param options 可选配置
	 */
	async openViewCardModal(
		card: import("./data/types").Card,
		options?: {
			allDecks?: Array<{ id: string; name: string }>;
			onClose?: () => void;
		}
	): Promise<void> {
		try {
			const { allDecks, onClose } = options || {};

			// ✅ 强制清理旧模态窗（防止重复实例）
			if (this.currentViewCardModal) {
				logger.debug("🎯 [openViewCardModal] 强制清理旧模态窗");
				this.currentViewCardModal.close();
				this.currentViewCardModal = null;
			}

			// ✅ 检查必要服务
			if (!this.dataStorage) {
				logger.error("❌ [openViewCardModal] 服务未初始化");
				new Notice("插件正在初始化，请稍候再试");
				return;
			}

			// ✅ 加载牌组数据（如果未提供）
			const decks =
				allDecks ||
				(this.cachedDecks.length > 0 ? this.cachedDecks : await this.dataStorage.getAllDecks());

			const { ViewCardModalObsidian } = await import("./components/modals/ViewCardModalObsidian");
			const isTestCard = card.cardPurpose === "test";
			const modal = new ViewCardModalObsidian(this.app, {
				card,
				plugin: this,
				allDecks: decks,
				onClose: () => {
					logger.debug("🎯 [openViewCardModal] 关闭并清理");
					this.currentViewCardModal = null;
					onClose?.();
				},
			});

			this.currentViewCardModal = modal;
			modal.open();
			logger.debug("🎯 [openViewCardModal] ✅ 打开成功", { isTestCard });
		} catch (error) {
			logger.error("🎯 [openViewCardModal] 失败:", error);
			new Notice("打开卡片详情模态框时发生错误");
		}
	}

	/**
	 * 创建全局悬浮按钮（使用 UIManager 统一管理）
	 *
	 * 🔧 架构说明：
	 * - 创建专用容器 div，避免直接挂载到 document.body
	 * - UIManager.destroy 时会正确移除容器，不影响 body
	 * - 与 CreateCardModal 保持一致的容器管理模式
	 */
	createGlobalFloatingButton() {
		// 动态导入悬浮按钮组件
		import("./components/ui/FloatingCreateCardButton.svelte")
			.then(async ({ default: FloatingCreateCardButton }) => {
				const { mount } = await import("svelte");
				// 🔧 关键修复：创建专用容器，避免直接挂载到 document.body
				const container = document.createElement("div");
				container.className = "weave-floating-button-container";
				document.body.appendChild(container);

				// 创建组件实例，挂载到专用容器
				const instance = mount(FloatingCreateCardButton, {
					target: container, // ✅ 挂载到专用容器，而非 document.body
					props: {
						plugin: this,
						onCreateCard: () => {
							// 🎯 传递非空初始内容，确保编辑器有初始内容
							// 使用符合解析规则的格式（---div--- 分隔符）
							void this.openCreateCardModal({
								initialContent: "\n\n---div---\n\n", // 提供标准问答格式占位符
							});
						},
					},
				});

				// 使用 UIManager 注册组件（统一生命周期管理）
				this.uiManager.register(
					"floating-button",
					"floating-button",
					instance,
					container, // ✅ 传递专用容器，UIManager.destroy 时会正确移除
					{ createdBy: "createGlobalFloatingButton" }
				);

				logger.debug("[Plugin] ✅ 全局悬浮按钮已创建并注册到 UIManager（使用专用容器）");
			})
			.catch((_error) => {
				logger.error("[Plugin] ❌ 加载全局悬浮按钮失败:", _error);
			});
	}

	/**
	 * 切换悬浮按钮显示状态（使用 UIManager 统一管理）
	 *
	 * 🏗️ 架构说明：
	 * - UIManager.destroy() 负责销毁组件实例和移除DOM容器
	 * - FloatingCreateCardButton.onDestroy() 负责清理全局样式（document.body.style）
	 * - 无需额外的防御性清理，避免竞态条件和重复清理错误
	 */
	toggleFloatingButton(show: boolean) {
		if (show && !this.uiManager.has("floating-button")) {
			this.createGlobalFloatingButton();
		} else if (!show && this.uiManager.has("floating-button")) {
			// ✅ UIManager 负责销毁容器
			// ✅ 组件 onDestroy 负责清理全局样式
			// ✅ 无需额外清理，避免竞态条件
			this.uiManager.destroy("floating-button");
		}
	}

	async activateView(viewType: string, forceLocation?: "content" | "sidebar") {
		try {
			// 验证输入参数
			if (!viewType) {
				logger.error("[WeavePlugin] activateView: viewType不能为空");
				return;
			}

			// 验证workspace是否可用
			if (!this.app?.workspace) {
				logger.error("[WeavePlugin] activateView: workspace不可用");
				return;
			}

			// 🆕 确定打开位置：优先使用强制位置，否则使用设置中的偏好
			const openLocation = forceLocation ?? this.settings.mainInterfaceOpenLocation ?? "content";
			logger.debug(`[WeavePlugin] 正在激活视图: ${viewType}, 位置: ${openLocation}`);

			// 🔥 清理旧视图实例（向后兼容：清理 anki-view 残留）
			this.app.workspace.detachLeavesOfType(viewType);

			// 🔥 特殊处理：如果是 weave-view，同时清理旧的 anki-view
			if (viewType === VIEW_TYPE_WEAVE) {
				this.app.workspace.detachLeavesOfType("anki-view");
			}

			// 🆕 根据设置决定打开位置
			let leaf;
			if (openLocation === "sidebar") {
				// 在右侧边栏打开
				leaf = this.app.workspace.getRightLeaf(false);
			} else {
				// 在主编辑区打开
				leaf = this.app.workspace.getLeaf(false);
			}

			if (!leaf) {
				logger.error("[WeavePlugin] activateView: 无法创建leaf");
				return;
			}

			await leaf.setViewState({
				type: viewType,
				active: true,
			});

			// 🔧 修复：确保leaf存在后再调用revealLeaf
			const targetLeaves = this.app.workspace.getLeavesOfType(viewType);
			if (targetLeaves.length > 0 && targetLeaves[0]) {
				void this.app.workspace.revealLeaf(targetLeaves[0]);
				logger.debug(`[WeavePlugin] 成功激活视图: ${viewType}`);
			} else {
				logger.error(`[WeavePlugin] activateView: 找不到指定类型的视图leaf: ${viewType}`);
			}
		} catch (error) {
			logger.error("[WeavePlugin] activateView失败:", error);
			// 显示用户友好的错误提示
			new Notice(`无法打开视图: ${error instanceof Error ? error.message : "未知错误"}`);
		}
	}

	async returnToDeckStudyView(
		filter: "memory" | "question-bank" | "incremental-reading" = "memory"
	): Promise<void> {
		const normalizedFilter =
			filter === "question-bank" || filter === "incremental-reading" ? filter : "memory";

		try {
			vaultStorage.setItem("weave-deck-mode-filter", normalizedFilter);

			const workspace = this.app.workspace;
			let leaf = workspace.getLeavesOfType(VIEW_TYPE_WEAVE)[0] ?? null;

			if (!leaf) {
				const openLocation = this.settings.mainInterfaceOpenLocation ?? "content";
				const targetLeaf =
					openLocation === "sidebar" ? workspace.getRightLeaf(false) : workspace.getLeaf(false);

				if (!targetLeaf) {
					throw new Error("无法创建 Weave 视图");
				}

				leaf = targetLeaf;

				await leaf.setViewState({
					type: VIEW_TYPE_WEAVE,
					active: true,
				});
			}

			try {
				const ws: any = workspace as any;
				if (typeof ws.setActiveLeaf === "function") {
					try {
						ws.setActiveLeaf(leaf, { focus: true });
					} catch {
						ws.setActiveLeaf(leaf, true);
					}
				}
			} catch {}

			void workspace.revealLeaf(leaf);

			const syncDeckStudyState = () => {
				window.dispatchEvent(
					new CustomEvent("Weave:navigate", {
						detail: "deck-study",
					})
				);
				window.dispatchEvent(
					new CustomEvent("Weave:sidebar-filter-select", {
						detail: normalizedFilter,
					})
				);
			};

			syncDeckStudyState();
			window.setTimeout(syncDeckStudyState, 120);
		} catch (error) {
			logger.error("[WeavePlugin] 返回牌组学习界面失败:", error);
			new Notice("返回牌组学习界面失败");
		}
	}

	private async openActiveEpubReader(options?: { missingFileNotice?: string }): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile) || activeFile.extension !== "epub") {
			if (options?.missingFileNotice) {
				new Notice(options.missingFileNotice);
			}
			return;
		}

		await this.openEpubReader(activeFile.path);
	}

	private async openEpubBookshelf(): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		try {
			const workspace = this.app.workspace;
			let leaf: WorkspaceLeaf | null =
				workspace.getLeavesOfType(VIEW_TYPE_EPUB_BOOKSHELF_SIDEBAR)[0] ?? null;
			if (!leaf) {
				leaf = workspace.getLeftLeaf(false);
			}
			if (!leaf) {
				logger.error("[WeavePlugin] openEpubBookshelf: cannot create leaf");
				return;
			}
			await leaf.setViewState({
				type: VIEW_TYPE_EPUB_BOOKSHELF_SIDEBAR,
				active: true,
			});
			void workspace.revealLeaf(leaf);
		} catch (error) {
			logger.error("[WeavePlugin] openEpubBookshelf failed:", error);
			new Notice("打开 EPUB 书架失败");
		}
	}

	async openEpubReader(filePath: string): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		try {
			const leaf = getPreferredEpubLeaf(this.app, filePath);
			if (!leaf) {
				logger.error("[WeavePlugin] openEpubReader: cannot create leaf");
				return;
			}
			await leaf.setViewState({
				type: VIEW_TYPE_EPUB,
				active: true,
				state: { filePath },
			});
			void this.app.workspace.revealLeaf(leaf);
		} catch (error) {
			logger.error("[WeavePlugin] openEpubReader failed:", error);
			new Notice("打开 EPUB 失败");
		}
	}

	/**
	 * 📅 激活增量阅读日历视图（在左侧边栏）
	 */
	async activateIRCalendarView() {
		const { workspace } = this.app;

		// 检查是否已经打开
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_IR_CALENDAR)[0];

		if (!leaf) {
			// 在左侧边栏创建新leaf
			const leftLeaf = workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({
					type: VIEW_TYPE_IR_CALENDAR,
					active: true,
				});
				leaf = leftLeaf;
			}
		}

		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}

	/**
	 * 📚 异步初始化增量摘录服务（非阻塞）
	 */
	private async initializeIncrementalReadingServices(): Promise<void> {
		try {
			logger.debug("[Services] 📚 开始初始化增量摘录服务...");
			const startTime = Date.now();

			const {
				createReadingMaterialStorage,
				createReadingMaterialManager,
				createReadingSessionManager,
				createAnchorManager,
				createExtractCardService,
			} = await import("./services/incremental-reading");
			const { createYAMLFrontmatterManager } = await import("./utils/yaml-frontmatter-utils");

			const createEmptyDeckStats = (): import("./data/types").DeckStats => ({
				totalCards: 0,
				newCards: 0,
				learningCards: 0,
				reviewCards: 0,
				todayNew: 0,
				todayReview: 0,
				todayTime: 0,
				totalReviews: 0,
				totalTime: 0,
				memoryRate: 0,
				averageEase: 0,
				forecastDays: {},
			});

			// 创建 YAML 管理器
			const yamlManager = createYAMLFrontmatterManager(this.app);

			// 创建存储服务
			this.readingMaterialStorage = createReadingMaterialStorage(this.app);
			await this.readingMaterialStorage.initialize();

			// 创建材料管理器
			this.readingMaterialManager = createReadingMaterialManager(
				this.app,
				this.readingMaterialStorage,
				yamlManager
			);

			// 创建会话管理器
			this.readingSessionManager = createReadingSessionManager(
				this.app,
				this.readingMaterialStorage,
				this.readingMaterialManager
			);

			// 创建锚点管理器
			this.anchorManager = createAnchorManager(this.app, this.readingMaterialStorage, yamlManager);

			// 创建摘录卡片服务
			this.extractCardService = createExtractCardService(
				this.app,
				this.readingMaterialManager,
				this.readingSessionManager
			);
			this.extractCardService.setCallbacks({
				openCreateCardModal: (options) => this.openCreateCardModal(options),
				getDeck: async (deckId) => {
					if (!this.dataStorage) return null;
					return await this.dataStorage.getDeck(deckId);
				},
				createDeck: async (partial) => {
					if (!this.dataStorage) {
						throw new Error("dataStorage 未初始化");
					}
					if (!partial.name) {
						throw new Error("deck.name 不能为空");
					}
					const now = new Date().toISOString();
					const profile = await this.dataStorage.getUserProfile();
					const defaultSettings = profile.globalSettings.defaultDeckSettings;
					const deck = {
						id: partial.id || `deck_${Date.now().toString(36)}`,
						name: partial.name,
						description: partial.description || "",
						category: partial.category || "默认",
						parentId: partial.parentId,
						path: partial.path || partial.name,
						level: partial.level ?? 0,
						order: partial.order ?? 0,
						inheritSettings: partial.inheritSettings ?? false,
						settings: (partial.settings as any) || defaultSettings,
						stats: partial.stats || createEmptyDeckStats(),
						includeSubdecks: partial.includeSubdecks ?? false,
						deckType: partial.deckType,
						purpose: partial.purpose,
						knowledgeLevel: partial.knowledgeLevel,
						created: partial.created || now,
						modified: partial.modified || now,
						tags: partial.tags || [],
						metadata: partial.metadata || {},
						icon: partial.icon,
						color: partial.color,
						categoryIds: partial.categoryIds,
						cardUUIDs: partial.cardUUIDs,
					} as import("./data/types").Deck;
					const resp = await this.dataStorage.saveDeck(deck);
					if (!resp?.success) {
						throw new Error(resp?.error || "创建牌组失败");
					}
					return resp.data as import("./data/types").Deck;
				},
				updateDeck: async (deck) => {
					if (!this.dataStorage) {
						throw new Error("dataStorage 未初始化");
					}
					const resp = await this.dataStorage.saveDeck(deck);
					if (!resp?.success) {
						throw new Error(resp?.error || "更新牌组失败");
					}
				},
			});

			// 设置锚点管理器到材料管理器（避免循环依赖）
			this.readingMaterialManager.setAnchorManager(this.anchorManager);

			// 🆕 v3.0 创建标签组服务
			const { IRTagGroupService } = await import(
				"./services/incremental-reading/IRTagGroupService"
			);
			this.irTagGroupService = new IRTagGroupService(this.app);
			await this.irTagGroupService.initialize();
			logger.debug("[Services] ✅ 标签组服务初始化完成");
			this.registerEvent(
				this.app.metadataCache.on("changed", (file) => {
					if (file instanceof TFile) {
						this.irTagGroupService?.invalidateDocumentCache(file.path);
					}
				})
			);
			this.registerEvent(
				this.app.vault.on("rename", (file, oldPath) => {
					void this.handleEpubSourceFileRenamed(file, oldPath);
					void this.handleCardSourceFileRenamed(file, oldPath);
					if (file instanceof TFile) {
						this.irTagGroupService?.invalidateDocumentCache(oldPath);
						this.irTagGroupService?.invalidateDocumentCache(file.path);
						void this.handleIncrementalReadingFileRenamed(file, oldPath);
					}
				})
			);
			this.registerEvent(
				this.app.vault.on("delete", (file) => {
					void this.handleCardSourceFileDeleted(file);
					if (file instanceof TFile) {
						this.irTagGroupService?.invalidateDocumentCache(file.path);
					}
				})
			);

			// v3.1: 同步标注信号配置到单例服务
			try {
				const { syncAnnotationSignalFromSettings } = await import(
					"./services/incremental-reading/IRAnnotationSignalService"
				);
				syncAnnotationSignalFromSettings(this.settings?.incrementalReading?.calloutSignal);
			} catch (e) {
				logger.warn("[Services] 标注信号配置同步失败:", e);
			}

			// 🔥 标记增量摘录服务已就绪
			const { markServiceReady } = await import("./utils/service-ready-event");
			markServiceReady("readingMaterialManager");

			const duration = Date.now() - startTime;
			logger.info(`[Services] ✅ 增量摘录服务初始化完成 (${duration}ms)`);
		} catch (error) {
			logger.error("[Services] ❌ 增量摘录服务初始化失败:", error);
		}
	}

	private async handleCardSourceFileRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
		const newPath = file.path;
		if (!oldPath || oldPath === newPath) return;

		try {
			const updateResult = await this.dataStorage?.updateSourceFileReferences(oldPath, newPath);
			await this.dataStorage?.refreshSourceFileStatuses(newPath);
			if (updateResult && updateResult.updatedLinks > 0) {
				logger.info(
					`[SourceTrace] 已同步 ${updateResult.updatedCards} 张卡片的溯源路径: ${oldPath} -> ${newPath}`
				);
				this.showSourceTraceUpdateNotice(
					updateResult.affectedSourceFiles,
					updateResult.updatedLinks
				);
			}
		} catch (error) {
			logger.warn("[SourceTrace] 文件重命名后更新卡片溯源路径失败:", error);
		}
	}

	private async handleEpubSourceFileRenamed(file: TAbstractFile, oldPath: string): Promise<void> {
		const newPath = file.path;
		if (!oldPath || oldPath === newPath) return;

		try {
			const { EpubPathSyncService } = await import("./services/epub/EpubPathSyncService");
			const syncService = new EpubPathSyncService(this.app);
			const result = await syncService.syncRenamedTarget(file, oldPath);
			const affectedItems =
				result.updatedMarkdownFiles +
				result.updatedCanvasFiles +
				result.updatedCardFiles +
				result.updatedCanvasBindings +
				result.updatedBooks +
				result.updatedTasks;
			const affectedRefs =
				result.updatedLinks +
				result.updatedCanvasBindings +
				result.updatedBooks +
				result.updatedTasks;

			if (affectedRefs > 0) {
				logger.info(
					`[EpubPathSync] 已同步 EPUB 引用: old=${oldPath}, new=${newPath}, links=${result.updatedLinks}, markdown=${result.updatedMarkdownFiles}, canvas=${result.updatedCanvasFiles}, cardJson=${result.updatedCardFiles}, canvasBindings=${result.updatedCanvasBindings}, books=${result.updatedBooks}, tasks=${result.updatedTasks}`
				);
				this.queueSourceTraceNotice({
					epubFiles: affectedItems,
					epubLinks: affectedRefs,
				});
				await this.refreshOpenEpubViewsAfterRename(oldPath, newPath);
			}
		} catch (error) {
			logger.warn("[EpubPathSync] EPUB 文件重命名后同步引用失败:", error);
		}
	}

	private async handleCardSourceFileDeleted(file: TAbstractFile): Promise<void> {
		const deletedPath = file.path;
		if (!deletedPath) return;

		try {
			const result = await this.dataStorage?.refreshSourceFileStatuses(deletedPath);
			if (result && result.updated > 0) {
				logger.info(
					`[SourceTrace] 已将 ${result.updated} 张卡片标记为源文件变更/缺失: ${deletedPath}`
				);
				this.queueSourceTraceNotice({ invalidCards: result.updated });
			}
		} catch (error) {
			logger.warn("[SourceTrace] 文件删除后刷新卡片溯源状态失败:", error);
		}
	}

	private async refreshCardSourceTrackingOnStartup(): Promise<void> {
		try {
			const result = await this.dataStorage?.refreshSourceFileStatuses();
			if (result && result.updated > 0) {
				logger.info(
					`[SourceTrace] 启动时已刷新 ${result.updated} 张卡片的溯源状态，其中 ${result.missing} 张源文件缺失`
				);
			}
		} catch (error) {
			logger.warn("[SourceTrace] 启动时刷新卡片溯源状态失败:", error);
		}
	}

	private showSourceTraceUpdateNotice(fileCount: number, linkCount: number): void {
		if (fileCount <= 0 || linkCount <= 0) {
			return;
		}

		this.queueSourceTraceNotice({ files: fileCount, links: linkCount });
	}

	private queueSourceTraceNotice(delta: {
		files?: number;
		links?: number;
		invalidCards?: number;
		epubFiles?: number;
		epubLinks?: number;
	}): void {
		this.pendingSourceTraceNotice.files += delta.files || 0;
		this.pendingSourceTraceNotice.links += delta.links || 0;
		this.pendingSourceTraceNotice.invalidCards += delta.invalidCards || 0;
		this.pendingSourceTraceNotice.epubFiles += delta.epubFiles || 0;
		this.pendingSourceTraceNotice.epubLinks += delta.epubLinks || 0;

		if (this.sourceTraceNoticeTimer) {
			clearTimeout(this.sourceTraceNoticeTimer);
		}

		this.sourceTraceNoticeTimer = setTimeout(() => {
			this.flushSourceTraceNotice();
		}, 600);
	}

	private flushSourceTraceNotice(): void {
		if (this.sourceTraceNoticeTimer) {
			clearTimeout(this.sourceTraceNoticeTimer);
			this.sourceTraceNoticeTimer = null;
		}

		const { files, links, invalidCards, epubFiles, epubLinks } = this.pendingSourceTraceNotice;
		this.pendingSourceTraceNotice = {
			files: 0,
			links: 0,
			invalidCards: 0,
			epubFiles: 0,
			epubLinks: 0,
		};

		const parts: string[] = [];
		if (files > 0 && links > 0) {
			parts.push(`已自动更新 ${files} 个文件中的 ${links} 条溯源链接`);
		}
		if (epubFiles > 0 && epubLinks > 0) {
			parts.push(`已自动更新 ${epubFiles} 个 EPUB 关联项中的 ${epubLinks} 处图书引用`);
		}
		if (invalidCards > 0) {
			parts.push(`已标记 ${invalidCards} 张卡片的来源文件失效`);
		}

		if (parts.length === 0) {
			return;
		}

		this.sourceTraceNotice?.destroy();
		this.sourceTraceNotice = createSafeNotice(`Weave: ${parts.join("；")}`, 4500);
	}

	private async refreshOpenEpubViewsAfterRename(oldPath: string, newPath: string): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_EPUB);
		for (const leaf of leaves) {
			try {
				const state = leaf.getViewState();
				const currentPath = String(
					(state as any)?.state?.filePath || (state as any)?.state?.file || ""
				);
				const remappedPath = this.remapVaultPath(currentPath, oldPath, newPath);
				if (!remappedPath || remappedPath === currentPath) {
					continue;
				}

				await leaf.setViewState({
					...(state as any),
					state: {
						...((state as any)?.state || {}),
						filePath: remappedPath,
						file: remappedPath,
					},
				});
			} catch (error) {
				logger.warn("[EpubPathSync] 更新已打开 EPUB 视图失败:", error);
			}
		}
	}

	private remapVaultPath(sourcePath: string, oldPath: string, newPath: string): string | null {
		if (!sourcePath || !oldPath || !newPath) {
			return null;
		}

		const normalizedSource = sourcePath.replace(/\\/g, "/");
		const normalizedOld = oldPath.replace(/\\/g, "/");
		const normalizedNew = newPath.replace(/\\/g, "/");

		if (normalizedSource === normalizedOld) {
			return normalizedNew;
		}

		if (normalizedSource.startsWith(`${normalizedOld}/`)) {
			return `${normalizedNew}${normalizedSource.slice(normalizedOld.length)}`;
		}

		return null;
	}

	private async handleIncrementalReadingFileRenamed(file: TFile, oldPath: string): Promise<void> {
		const newPath = file.path;
		if (!oldPath || oldPath === newPath) return;

		let changed = false;

		try {
			if (this.readingMaterialStorage) {
				await this.readingMaterialStorage.initialize();
				const allMaterials = await this.readingMaterialStorage.getAllMaterials();
				const targets = allMaterials.filter((m) => m.filePath === oldPath);
				if (targets.length > 0) {
					for (const material of targets) {
						material.filePath = newPath;
						material.title = file.basename;
					}
					await this.readingMaterialStorage.saveMaterials(targets);
					changed = true;
				}
			}
		} catch (error) {
			logger.warn("[IR] 重命名后更新材料索引失败:", error);
		}

		try {
			const storage =
				this.irStorageServiceForRename ??
				(this.irStorageServiceForRename = new IRStorageService(this.app));
			await storage.initialize();

			const chunks = await storage.getAllChunkData();
			const chunkUpdates: import("./types/ir-types").IRChunkFileData[] = [];
			for (const chunk of Object.values(chunks)) {
				if ((chunk as any)?.filePath === oldPath) {
					(chunk as any).filePath = newPath;
					(chunk as any).updatedAt = Date.now();
					chunkUpdates.push(chunk);
				}
			}
			if (chunkUpdates.length > 0) {
				await storage.saveChunkDataBatch(chunkUpdates);
				changed = true;
			}

			const sources = await storage.getAllSources();
			let sourceUpdated = 0;
			for (const src of Object.values(sources)) {
				let srcChanged = false;
				if ((src as any)?.originalPath === oldPath) {
					(src as any).originalPath = newPath;
					srcChanged = true;
				}
				if ((src as any)?.rawFilePath === oldPath) {
					(src as any).rawFilePath = newPath;
					srcChanged = true;
				}
				if ((src as any)?.indexFilePath === oldPath) {
					(src as any).indexFilePath = newPath;
					srcChanged = true;
				}
				if (srcChanged) {
					await storage.saveSource(src);
					sourceUpdated++;
				}
			}
			if (sourceUpdated > 0) {
				changed = true;
			}
		} catch (error) {
			logger.warn("[IR] 重命名后更新 chunks/sources 路径失败:", error);
		}

		try {
			const pdfService = await this.ensureIRPdfBookmarkTaskServiceReady();
			const allTasks = await pdfService.getAllTasks();
			let pdfTaskUpdated = 0;
			for (const task of allTasks) {
				let taskChanged = false;
				if (task.pdfPath === oldPath) {
					task.pdfPath = newPath;
					taskChanged = true;
				}
				if (typeof task.link === "string" && task.link.startsWith(oldPath)) {
					task.link = newPath + task.link.slice(oldPath.length);
					taskChanged = true;
				}
				if (taskChanged) {
					await pdfService.updateTask(task.id, {
						pdfPath: task.pdfPath,
						link: task.link,
					});
					pdfTaskUpdated++;
				}
			}
			if (pdfTaskUpdated > 0) {
				changed = true;
				logger.info(`[IR] 重命名后更新 ${pdfTaskUpdated} 个 PDF 书签任务路径`);
			}
		} catch (error) {
			logger.warn("[IR] 重命名后更新 PDF 书签任务路径失败:", error);
		}

		if (changed && typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
		}
	}

	/**
	 * 📚 打开快捷续读仪表板（模态窗）
	 */
	async openQuickResumeDashboard(): Promise<void> {
		try {
			if (!this.readingMaterialManager) {
				new Notice("增量摘录服务未初始化");
				return;
			}

			// 动态导入 Svelte 组件
			const { mount, unmount } = await import("svelte");
			const { default: QuickResumeDashboard } = await import(
				"./components/incremental-reading/QuickResumeDashboard.svelte"
			);

			// 创建容器
			const container = document.body.createDiv({
				cls: "weave-quick-resume-container",
			});

			let component: any = null;

			// 挂载组件
			component = mount(QuickResumeDashboard, {
				target: container,
				props: {
					plugin: this,
					onClose: () => {
						// 卸载组件并移除容器
						if (component) {
							void unmount(component);
							component = null;
						}
						container.remove();
					},
					onMaterialSelect: async (materialId: string) => {
						// 跳转到材料
						await this.jumpToReadingMaterial(materialId);
					},
				},
			});

			logger.debug("[Plugin] ✅ 快捷续读仪表板已打开");
		} catch (error) {
			logger.error("[Plugin] ❌ 打开快捷续读仪表板失败:", error);
			new Notice("打开快捷续读仪表板失败");
		}
	}

	/**
	 * 📚 跳转到阅读材料
	 */
	async jumpToReadingMaterial(materialId: string): Promise<void> {
		try {
			if (!this.readingMaterialManager || !this.anchorManager) {
				return;
			}

			const materials = await this.readingMaterialManager.getAllMaterials();
			const material = materials.find((m) => m.uuid === materialId);

			if (!material) {
				logger.warn("[Plugin] 材料不存在:", materialId);
				new Notice("材料不存在");
				return;
			}

			const contextPath = this.app.workspace.getActiveFile()?.path ?? "";
			const file = this.app.vault.getAbstractFileByPath(material.filePath);
			if (!file) {
				logger.warn("[Plugin] 文件不存在:", material.filePath);
				new Notice("文件不存在");
				return;
			}

			if (!(file instanceof TFile) || file.extension !== "md") {
				const linkToOpen =
					material.resumeLink && material.resumeLink.trim().length > 0
						? material.resumeLink
						: material.filePath;
				await openLinkWithExistingLeaf(this.app, linkToOpen, contextPath, { focus: true });
				return;
			}

			await openFileWithExistingLeaf(this.app, file, { focus: true });

			if (material.progress.currentAnchor) {
				await this.anchorManager.jumpToAnchor(file, material.progress.currentAnchor);
			}

			logger.debug("[Plugin] 已跳转到材料:", material.title);
		} catch (error) {
			logger.error("[Plugin] 跳转到材料失败:", error);
			new Notice("跳转失败");
		}
	}

	/**
	 * 打开学习会话（标签页模式，支持多种学习模式）
	 * @param options 学习会话选项（支持旧的 deckId 字符串形式）
	 */
	async openStudySession(
		options?:
			| string
			| {
					deckId?: string;
					deckName?: string;
					mode?: StudyMode;
					cardIds?: string[];
					cards?: import("./data/types").Card[]; // 支持直接传递卡片对象
			  }
	): Promise<void> {
		// 🔄 向后兼容：支持旧的 openStudySession(deckId) 调用方式
		const deckId = typeof options === "string" ? options : options?.deckId;
		const deckName = typeof options === "object" ? options?.deckName : undefined;
		const mode = typeof options === "object" ? options?.mode : undefined;
		const cardIds = typeof options === "object" ? options?.cardIds : undefined;
		const cards = typeof options === "object" ? options?.cards : undefined;

		logger.debug("[Plugin] 打开学习会话");

		try {
			await this.loadPersistedStudySession();
			const workspace = this.app.workspace;

			// 检查是否已有活跃的学习会话
			const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_STUDY);

			if (existingLeaves.length > 0) {
				// 已有学习会话，激活并更新
				const leaf = existingLeaves[0];
				try {
					const ws: any = workspace as any;
					if (typeof ws.setActiveLeaf === "function") {
						try {
							ws.setActiveLeaf(leaf, { focus: true });
						} catch {
							ws.setActiveLeaf(leaf, true);
						}
					}
				} catch {}
				void workspace.revealLeaf(leaf);

				// 更新视图状态（传递新的学习模式和卡片列表）
				await leaf.setViewState({
					type: VIEW_TYPE_STUDY,
					state: { deckId, deckName, mode, cardIds, cards },
				});

				// 📱 移动端兜底：某些版本仅 revealLeaf 不会切换到 tab
				if (Platform.isMobile) {
					try {
						const ws: any = workspace as any;
						if (typeof ws.setActiveLeaf === "function") {
							try {
								ws.setActiveLeaf(leaf, { focus: true });
							} catch {
								ws.setActiveLeaf(leaf, true);
							}
						}
						void workspace.revealLeaf(leaf);
						workspace.trigger("layout-change");
					} catch {}
				}

				logger.debug("[Plugin] ✅ 激活已存在的学习会话");
				return;
			}

			// 创建新的学习标签页
			const leaf = workspace.getLeaf("tab");

			await leaf.setViewState({
				type: VIEW_TYPE_STUDY,
				state: { deckId, deckName, mode, cardIds, cards },
			});

			// 激活该标签页
			try {
				const ws: any = workspace as any;
				if (typeof ws.setActiveLeaf === "function") {
					try {
						ws.setActiveLeaf(leaf, { focus: true });
					} catch {
						ws.setActiveLeaf(leaf, true);
					}
				}
			} catch {}
			void workspace.revealLeaf(leaf);

			logger.debug("[Plugin] ✅ 学习会话已打开");
		} catch (error) {
			logger.error("[Plugin] ❌ 打开学习会话失败:", error);
			new Notice("打开学习会话失败");
		}
	}

	/**
	 * 打开学习界面
	 * @param params 学习参数
	 */
	async openStudyInterface(params: {
		deckId: string;
		mode: string;
		cards: import("./data/types").Card[];
	}): Promise<void> {
		logger.debug("[Plugin] 打开学习界面:", {
			deckId: params.deckId,
			cardsCount: params.cards.length,
		});

		// 直接传递卡片对象
		await this.openStudySession({
			deckId: params.deckId,
			mode: params.mode as StudyMode,
			cards: params.cards, // 直接传递卡片对象
		});
	}

	/**
	 * 打开考试学习会话（标签页模式）
	 * @param options 考试会话选项
	 */
	async openQuestionBankSession(options: {
		bankId: string;
		bankName?: string;
		mode?: import("./types/question-bank-types").TestMode;
		config?: import("./types/question-bank-types").QuestionBankModeConfig;
		resumeBehavior?: import("./types/question-bank-types").QuestionBankResumeBehavior;
	}): Promise<void> {
		const { bankId, bankName, mode, config, resumeBehavior } = options;

		logger.debug("[Plugin] 打开考试学习会话:", { bankId, bankName, mode });

		try {
			const workspace = this.app.workspace;

			// 检查是否已有相同题库的学习会话
			const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_QUESTION_BANK);

			// 查找相同 bankId 的视图
			const existingLeaf = existingLeaves.find((_leaf) => {
				const view = _leaf.view as QuestionBankView;
				return view.getState()?.bankId === bankId;
			});

			if (existingLeaf) {
				// 已有相同题库的会话，激活它
				void workspace.revealLeaf(existingLeaf);
				logger.debug("[Plugin] ✅ 激活已存在的考试会话");
				return;
			}

			// 创建新的考试标签页
			const leaf = workspace.getLeaf("tab");

			await leaf.setViewState({
				type: VIEW_TYPE_QUESTION_BANK,
				state: { bankId, bankName, mode, config, resumeBehavior },
			});

			// 激活该标签页
			void workspace.revealLeaf(leaf);

			logger.debug("[Plugin] ✅ 考试会话已打开（标签页模式）");
		} catch (error) {
			logger.error("[Plugin] ❌ 打开考试会话失败:", error);
			new Notice("打开考试界面失败");
		}
	}

	/**
	 * 加载待学习的卡片
	 * @param deckId 可选的牌组ID
	 * @returns 待学习的卡片列表
	 */
	async loadStudyCards(deckId?: string): Promise<any[]> {
		try {
			const allCards = await this.dataStorage.getAllCards();
			const now = Date.now();

			// 过滤到期的卡片
			let dueCards = allCards.filter(
				(card) => card.fsrs?.due && new Date(card.fsrs.due).getTime() <= now
			);

			// 🆕 v2.0: 引用式牌组架构 - 如果指定了牌组，只加载该牌组的卡片
			if (deckId) {
				const deck = await this.dataStorage.getDeck(deckId);
				if (deck?.cardUUIDs?.length) {
					const uuidSet = new Set(deck.cardUUIDs);
					dueCards = dueCards.filter((card) => uuidSet.has(card.uuid));
				} else {
					// 🆕 v2.2: 优先从 content YAML 的 we_decks 获取牌组ID
					const { getCardDeckIds } = await import("./utils/yaml-utils");
					const allDecks = await this.dataStorage.getDecks();
					dueCards = dueCards.filter((_card) => {
						const { deckIds } = getCardDeckIds(_card, allDecks);
						return (
							deckIds.includes(deckId) ||
							_card.referencedByDecks?.includes(deckId) ||
							_card.deckId === deckId
						);
					});
				}
			}

			// 限制数量
			const limit = this.settings.reviewsPerDay || 20;
			return dueCards.slice(0, limit);
		} catch (error) {
			logger.error("[Plugin] 加载学习卡片失败:", error);
			return [];
		}
	}

	/**
	 * 加载持久化的学习会话
	 */
	private getPluginLocalStateService(): PluginLocalStateService {
		if (!this.pluginLocalStateService) {
			this.pluginLocalStateService = new PluginLocalStateService(this.app);
		}
		return this.pluginLocalStateService;
	}

	private getDefaultStudyInterfaceViewPreferences(): StudyInterfaceViewPreferences {
		const defaults =
			this.settings?.studyInterfaceViewPreferences ??
			DEFAULT_SETTINGS.studyInterfaceViewPreferences;
		return {
			showSidebar: defaults?.showSidebar ?? true,
			sidebarCompactModeSetting: defaults?.sidebarCompactModeSetting ?? "auto",
			statsCollapsed: defaults?.statsCollapsed ?? true,
			cardOrder: defaults?.cardOrder ?? "sequential",
			sidebarPosition: defaults?.sidebarPosition ?? "right",
		};
	}

	private getDefaultCreateCardPreferences(): CreateCardPreferencesState {
		const defaults = this.settings?.createCardPreferences ?? DEFAULT_SETTINGS.createCardPreferences;
		return {
			lastSelectedDeckId:
				typeof defaults?.lastSelectedDeckId === "string" ? defaults.lastSelectedDeckId : "",
			lastSelectedDeckNames: Array.isArray(defaults?.lastSelectedDeckNames)
				? [...defaults.lastSelectedDeckNames]
				: [],
		};
	}

	private getDefaultEditorModalSizeState(): EditorModalSizeState {
		const defaults = this.settings?.editorModalSize ?? DEFAULT_SETTINGS.editorModalSize;
		return {
			preset: defaults?.preset ?? "large",
			customWidth: defaults?.customWidth,
			customHeight: defaults?.customHeight,
		};
	}

	private getAIAssistantPreferencesFromSettings(): AIAssistantLocalPreferences {
		const aiConfig = this.settings?.aiConfig;
		return {
			lastUsedProvider:
				typeof aiConfig?.lastUsedProvider === "string"
					? aiConfig.lastUsedProvider
					: aiConfig?.defaultProvider,
			lastUsedModel: typeof aiConfig?.lastUsedModel === "string" ? aiConfig.lastUsedModel : undefined,
			savedGenerationConfig: aiConfig?.savedGenerationConfig
				? {
						...aiConfig.savedGenerationConfig,
						autoTags: Array.isArray(aiConfig.savedGenerationConfig.autoTags)
							? [...aiConfig.savedGenerationConfig.autoTags]
							: [],
				  }
				: undefined,
		};
	}

	private cloneAIAssistantPreferences(
		preferences: AIAssistantLocalPreferences
	): AIAssistantLocalPreferences {
		return {
			lastUsedProvider: preferences.lastUsedProvider,
			lastUsedModel: preferences.lastUsedModel,
			savedGenerationConfig: preferences.savedGenerationConfig
				? {
						...preferences.savedGenerationConfig,
						autoTags: Array.isArray(preferences.savedGenerationConfig.autoTags)
							? [...preferences.savedGenerationConfig.autoTags]
							: [],
				  }
				: undefined,
		};
	}

	private getAIGenerationHistoryFromSettings(): AIGenerationHistoryEntry[] {
		const history = this.settings?.aiConfig?.generationHistory;
		return Array.isArray(history) ? [...history] : [];
	}

	private async hydratePluginLocalState(): Promise<void> {
		const service = this.getPluginLocalStateService();

		this.deckViewPreferenceCache = await service.loadDeckViewPreference();

		this.studyInterfaceViewPreferencesCache =
			(await service.loadStudyInterfaceViewPreferences()) ??
			this.getDefaultStudyInterfaceViewPreferences();
		this.settings.studyInterfaceViewPreferences = { ...this.studyInterfaceViewPreferencesCache };

		this.aiAssistantPreferencesCache =
			(await service.loadAIAssistantPreferences()) ?? this.getAIAssistantPreferencesFromSettings();
		this.settings.aiConfig = {
			...(this.settings.aiConfig ?? { ...DEFAULT_SETTINGS.aiConfig }),
			lastUsedProvider: this.aiAssistantPreferencesCache.lastUsedProvider,
			lastUsedModel: this.aiAssistantPreferencesCache.lastUsedModel,
			savedGenerationConfig: this.aiAssistantPreferencesCache.savedGenerationConfig
				? {
						...this.aiAssistantPreferencesCache.savedGenerationConfig,
						autoTags: Array.isArray(this.aiAssistantPreferencesCache.savedGenerationConfig.autoTags)
							? [...this.aiAssistantPreferencesCache.savedGenerationConfig.autoTags]
							: [],
				  }
				: undefined,
		};

		this.createCardPreferencesCache =
			(await service.loadCreateCardPreferences()) ?? this.getDefaultCreateCardPreferences();
		this.settings.createCardPreferences = {
			lastSelectedDeckId: this.createCardPreferencesCache.lastSelectedDeckId ?? "",
			lastSelectedDeckNames: Array.isArray(this.createCardPreferencesCache.lastSelectedDeckNames)
				? [...this.createCardPreferencesCache.lastSelectedDeckNames]
				: [],
		};

		this.editorModalSizeStateCache =
			(await service.loadEditorModalSizeState()) ?? this.getDefaultEditorModalSizeState();
		this.settings.editorModalSize = {
			...(this.settings.editorModalSize ?? DEFAULT_SETTINGS.editorModalSize),
			...this.editorModalSizeStateCache,
		};

		this.aiGenerationHistoryCache =
			(await service.loadAIGenerationHistory()) ?? this.getAIGenerationHistoryFromSettings();
		this.settings.aiConfig = {
			...(this.settings.aiConfig ?? { ...DEFAULT_SETTINGS.aiConfig }),
			generationHistory: [...this.aiGenerationHistoryCache],
		};
	}

	async loadDeckViewPreference(): Promise<string | null> {
		const service = this.getPluginLocalStateService();
		const loaded = await service.loadDeckViewPreference();
		if (typeof loaded === "string" && loaded.length > 0) {
			this.deckViewPreferenceCache = loaded;
			return loaded;
		}
		if (typeof this.deckViewPreferenceCache === "string" && this.deckViewPreferenceCache.length > 0) {
			return this.deckViewPreferenceCache;
		}
		return null;
	}

	getCachedDeckViewPreference(): string | null {
		if (typeof this.deckViewPreferenceCache === "string" && this.deckViewPreferenceCache.length > 0) {
			return this.deckViewPreferenceCache;
		}
		return null;
	}

	async saveDeckViewPreference(deckView: string): Promise<void> {
		this.deckViewPreferenceCache = deckView;
		await this.getPluginLocalStateService().saveDeckViewPreference(deckView);
	}

	getStudyInterfaceViewPreferences(): StudyInterfaceViewPreferences {
		if (!this.studyInterfaceViewPreferencesCache) {
			this.studyInterfaceViewPreferencesCache = this.getDefaultStudyInterfaceViewPreferences();
		}
		return { ...this.studyInterfaceViewPreferencesCache };
	}

	async saveStudyInterfaceViewPreferences(
		preferences: StudyInterfaceViewPreferences
	): Promise<void> {
		const nextPreferences = {
			...this.getDefaultStudyInterfaceViewPreferences(),
			...preferences,
		};
		this.studyInterfaceViewPreferencesCache = nextPreferences;
		this.settings.studyInterfaceViewPreferences = { ...nextPreferences };
		await this.getPluginLocalStateService().saveStudyInterfaceViewPreferences(nextPreferences);
	}

	getAIAssistantPreferences(): AIAssistantLocalPreferences {
		if (!this.aiAssistantPreferencesCache) {
			this.aiAssistantPreferencesCache = this.getAIAssistantPreferencesFromSettings();
		}
		return this.cloneAIAssistantPreferences(this.aiAssistantPreferencesCache);
	}

	async saveAIAssistantPreferences(preferences: AIAssistantLocalPreferences): Promise<void> {
		const nextPreferences = this.cloneAIAssistantPreferences(preferences);
		this.aiAssistantPreferencesCache = nextPreferences;
		this.settings.aiConfig = {
			...(this.settings.aiConfig ?? { ...DEFAULT_SETTINGS.aiConfig }),
			lastUsedProvider: nextPreferences.lastUsedProvider,
			lastUsedModel: nextPreferences.lastUsedModel,
			savedGenerationConfig: nextPreferences.savedGenerationConfig
				? {
						...nextPreferences.savedGenerationConfig,
						autoTags: Array.isArray(nextPreferences.savedGenerationConfig.autoTags)
							? [...nextPreferences.savedGenerationConfig.autoTags]
							: [],
				  }
				: undefined,
		};
		await this.getPluginLocalStateService().saveAIAssistantPreferences(nextPreferences);
	}

	getAIGenerationHistory(): AIGenerationHistoryEntry[] {
		if (!this.aiGenerationHistoryCache) {
			this.aiGenerationHistoryCache = this.getAIGenerationHistoryFromSettings();
		}
		return [...this.aiGenerationHistoryCache];
	}

	async saveAIGenerationHistory(history: AIGenerationHistoryEntry[]): Promise<void> {
		this.aiGenerationHistoryCache = [...history];
		this.settings.aiConfig = {
			...(this.settings.aiConfig ?? { ...DEFAULT_SETTINGS.aiConfig }),
			generationHistory: [...this.aiGenerationHistoryCache],
		};
		await this.getPluginLocalStateService().saveAIGenerationHistory(this.aiGenerationHistoryCache);
	}

	getCreateCardPreferences(): CreateCardPreferencesState {
		if (!this.createCardPreferencesCache) {
			this.createCardPreferencesCache = this.getDefaultCreateCardPreferences();
		}
		return {
			lastSelectedDeckId: this.createCardPreferencesCache.lastSelectedDeckId ?? "",
			lastSelectedDeckNames: Array.isArray(this.createCardPreferencesCache.lastSelectedDeckNames)
				? [...this.createCardPreferencesCache.lastSelectedDeckNames]
				: [],
		};
	}

	async saveCreateCardPreferences(preferences: CreateCardPreferencesState): Promise<void> {
		const nextPreferences: CreateCardPreferencesState = {
			lastSelectedDeckId:
				typeof preferences.lastSelectedDeckId === "string" ? preferences.lastSelectedDeckId : "",
			lastSelectedDeckNames: Array.isArray(preferences.lastSelectedDeckNames)
				? [...preferences.lastSelectedDeckNames]
				: [],
		};
		this.createCardPreferencesCache = nextPreferences;
		this.settings.createCardPreferences = {
			lastSelectedDeckId: nextPreferences.lastSelectedDeckId ?? "",
			lastSelectedDeckNames: Array.isArray(nextPreferences.lastSelectedDeckNames)
				? [...nextPreferences.lastSelectedDeckNames]
				: [],
		};
		await this.getPluginLocalStateService().saveCreateCardPreferences(nextPreferences);
	}

	getEditorModalSizeState(): EditorModalSizeState {
		if (!this.editorModalSizeStateCache) {
			this.editorModalSizeStateCache = this.getDefaultEditorModalSizeState();
		}
		return { ...this.editorModalSizeStateCache };
	}

	async saveEditorModalSizeState(state: EditorModalSizeState): Promise<void> {
		const nextState: EditorModalSizeState = {
			preset: state.preset ?? "large",
			customWidth: state.customWidth,
			customHeight: state.customHeight,
		};
		this.editorModalSizeStateCache = nextState;
		this.settings.editorModalSize = {
			...(this.settings.editorModalSize ?? DEFAULT_SETTINGS.editorModalSize),
			...nextState,
		};
		await this.getPluginLocalStateService().saveEditorModalSizeState(nextState);
	}

	async loadPersistedStudySession(): Promise<void> {
		try {
			const persistedSession =
				await this.getPluginLocalStateService().loadPersistedStudySession<PersistedStudySession>();
			if (isPersistedStudySession(persistedSession)) {
				const sessionManager = StudySessionManager.getInstance();
				sessionManager.setPersistedSession(persistedSession);
				logger.debug("[Plugin] 已加载持久化的学习会话");
			}
		} catch (error) {
			logger.error("[Plugin] 加载持久化学习会话失败:", error);
		}
	}

	/**
	 * 保存学习会话到磁盘
	 */
	async savePersistedStudySession(): Promise<void> {
		try {
			const sessionManager = StudySessionManager.getInstance();
			const persistedSession = sessionManager.getPersistedSession();

			if (persistedSession) {
				// 保存到插件数据
				await this.getPluginLocalStateService().savePersistedStudySession(persistedSession);
				logger.debug("[Plugin] 学习会话已持久化到磁盘");
			} else {
				await this.getPluginLocalStateService().clearPersistedStudySession();
			}
		} catch (error) {
			logger.error("[Plugin] 保存学习会话失败:", error);
		}
	}

	/**
	 * 清除持久化的学习会话
	 */
	async clearPersistedStudySession(): Promise<void> {
		try {
			await this.getPluginLocalStateService().clearPersistedStudySession();

			const sessionManager = StudySessionManager.getInstance();
			sessionManager.clearPersistedSession();

			logger.debug("[Plugin] 已清除持久化的学习会话");
		} catch (error) {
			logger.error("[Plugin] 清除学习会话失败:", error);
		}
	}

	/**
	 * 注册统一清理命令
	 * 🔧 v2.0: 统一所有清理功能为两个命令
	 * - 当前文档清理：清理当前文档中的所有Weave残留元数据
	 * - 全局清理：扫描所有文档并清理残留元数据
	 *
	 * 支持的清理类型：
	 * - 快捷键创建：块链接 ^we-xxx
	 * - 批量解析-单文件单卡片：YAML中的weave-uuid
	 * - 批量解析-单文件多卡片：分隔符内的 #we_已删除 标记
	 */
	private registerCleanupCommands(): void {
		logger.debug("[Plugin] 注册统一清理命令...");

		// 统一清理命令1: 当前文档清理
		this.addCommand({
			id: "cleanup-current-file",
			name: "清理当前文档（块链接、UUID等）",
			icon: "eraser",
			callback: async () => {
				try {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile) {
						new Notice("没有打开的文档", 3000);
						return;
					}

					// 获取检测器实例
					const detector = this.blockLinkCleanupService.getDetector();
					if (!detector) {
						new Notice("清理服务未初始化", 3000);
						return;
					}

					// 显示处理中提示
					const notice = new Notice("正在检测 Weave 残留元数据...", 0);

					// 先读取文件内容，手动检查是否有Weave元数据
					const content = await this.app.vault.read(activeFile);
					const hasMetadata = this.checkForWeaveMetadata(content);

					if (!hasMetadata.found) {
						notice.hide();
						new Notice("当前文档没有 Weave 元数据", 3000);
						return;
					}

					// 显示检测到的元数据信息
					logger.info(`[清理] 检测到元数据: ${hasMetadata.details}`);

					// 检测当前文件中的所有孤立引用
					const orphanedItems = await detector.detectInFile(activeFile);

					// 🔧 增强提示：显示检测结果和保护状态
					if (orphanedItems.length === 0) {
						notice.hide();
						// 如果有元数据但没有孤立引用，可能是保护机制或卡片仍存在
						const protectedInfo = detector.getProtectedInfo?.() || { links: 0, uuids: 0 };
						if (protectedInfo.links > 0 || protectedInfo.uuids > 0) {
							new Notice(
								`检测到元数据但在保护期内\n保护中: ${protectedInfo.links}个块链接, ${protectedInfo.uuids}个UUID\n请稍后再试`,
								5000
							);
						} else {
							new Notice(
								`检测到元数据 (${hasMetadata.details})\n但对应卡片仍存在于插件中，无需清理`,
								5000
							);
						}
						return;
					}

					// 显示将要清理的内容
					logger.info(`[清理] 发现 ${orphanedItems.length} 个孤立引用:`);
					orphanedItems.forEach((_item) => {
						logger.info(`  - ${_item.uuid || _item.blockId} (${_item.creationType})`);
					});

					// 执行统一清理（会自动根据创建类型选择对应策略）
					const result = await this.blockLinkCleanupService.cleanupFile(activeFile);

					notice.hide();

					if (result.success && result.cleanedItems.length > 0) {
						// 统计清理类型
						const summary = this.summarizeCleanedItems(result.cleanedItems);
						new Notice(`清理完成：${summary}`, 5000);
					} else {
						new Notice("清理完成：没有需要清理的内容", 3000);
					}
				} catch (error) {
					logger.error("[Plugin] 清理当前文档失败:", error);
					new Notice("清理当前文档失败，请查看控制台", 3000);
				}
			},
		});

		// 🧹 统一清理命令2: 全局清理
		this.addCommand({
			id: "cleanup-orphaned-block-links",
			name: "全局清理（扫描所有文档的残留元数据）",
			icon: "trash-2",
			callback: async () => {
				try {
					// 获取检测器实例
					const detector = this.blockLinkCleanupService.getDetector();
					if (!detector) {
						new Notice("清理服务未初始化", 3000);
						return;
					}

					// 创建扫描器
					const scanner = new GlobalCleanupScanner(
						this.blockLinkCleanupService,
						detector,
						this.app.vault,
						this.app
					);

					// 创建并显示进度模态窗口
					const modal = new CleanupProgressModal(this.app, scanner);
					modal.open();

					// 注册详情回调
					scanner.onDetail((detail) => {
						modal.addCleanupDetail(detail);
					});

					// 开始扫描
					const result = await scanner.scanAndCleanup((progress) => {
						modal.updateProgress(progress);
					});

					// 显示结果
					modal.showResult(result);
				} catch (error) {
					logger.error("[Plugin] 全局清理失败:", error);
					new Notice("全局清理失败，请查看控制台", 3000);
				}
			},
		});

		this.addCommand({
			id: "ir-slim-markdown-frontmatter",
			name: "清理增量阅读YAML冗余字段（ir-chunk/ir-index）",
			icon: "eraser",
			callback: async () => {
				try {
					const confirmed = await showObsidianConfirm(
						this.app,
						"该操作会扫描增量阅读的块文件与索引文件，并移除 frontmatter 中的冗余字段（tag_group、chunk_order、priority_reason、created_at）。\n\n不会修改正文内容。\n\n确定继续吗？",
						{ title: "确认清理增量阅读YAML" }
					);
					if (!confirmed) return;

					const notice = new Notice("正在清理增量阅读 YAML...", 0);
					const { resolveIRImportFolder } = await import("./config/paths");
					const storage = new IRStorageService(this.app);
					const scanRoot = resolveIRImportFolder(
						this.settings?.incrementalReading?.importFolder,
						this.settings?.weaveParentFolder
					);
					const result = await storage.slimIRMarkdownFrontmatter(scanRoot);
					notice.hide();
					new Notice(
						`增量阅读 YAML 清理完成：扫描 ${result.scanned} 个文件，更新 ${result.updated} 个文件`,
						6000
					);
				} catch (error) {
					logger.error("[Plugin] 清理增量阅读 YAML 失败:", error);
					new Notice("清理增量阅读 YAML 失败，请查看控制台", 4000);
				}
			},
		});

		logger.debug("[Plugin] ✅ 统一清理命令已注册");
	}

	/**
	 * 生成清理项目摘要
	 */
	private summarizeCleanedItems(items: string[]): string {
		const blockLinks = items.filter((i) => i.startsWith("^")).length;
		const uuids = items.filter((i) => i.includes("uuid") || i.startsWith("tk-")).length;

		const parts: string[] = [];
		if (blockLinks > 0) parts.push(`${blockLinks}个块链接`);
		if (uuids > 0) parts.push(`${uuids}个UUID`);

		return parts.length > 0 ? parts.join("、") : `${items.length}项`;
	}

	/**
	 * 检查文件内容是否包含Weave元数据
	 * 🔧 用于在清理前提供详细的检测信息
	 */
	private checkForWeaveMetadata(content: string): {
		found: boolean;
		details: string;
		uuids: string[];
	} {
		const details: string[] = [];
		const uuids: string[] = [];

		// 检查块链接 ^we-xxx
		const blockLinks = content.match(/\^we-[a-z0-9]{6}/g) || [];
		if (blockLinks.length > 0) {
			details.push(`${blockLinks.length}个块链接`);
		}

		// 检查UUID uuid: tk-xxx 或 <!-- tk-xxx -->
		const uuidMatches = content.match(/uuid:\s*(tk-[a-z0-9]{12})/gi) || [];
		const commentUuids = content.match(/<!--\s*(tk-[a-z0-9]{12})\s*-->/g) || [];

		uuidMatches.forEach((_m) => {
			const uuid = _m.match(/tk-[a-z0-9]{12}/i)?.[0];
			if (uuid) uuids.push(uuid);
		});
		commentUuids.forEach((_m) => {
			const uuid = _m.match(/tk-[a-z0-9]{12}/i)?.[0];
			if (uuid) uuids.push(uuid);
		});

		if (uuids.length > 0) {
			details.push(`${uuids.length}个UUID: ${uuids.join(", ")}`);
		}

		// 检查 YAML weave-uuid
		const yamlUuid = content.match(/weave-uuid:\s*(tk-[a-z0-9]{12})/i);
		if (yamlUuid) {
			details.push("YAML UUID");
			uuids.push(yamlUuid[1]);
		}

		return {
			found: details.length > 0,
			details: details.join(", "),
			uuids: Array.from(new Set(uuids)),
		};
	}

	private registerWeaveContextMenuFeatures(): void {
		// 初始化编辑器AI制卡工具栏管理器
		this.editorAIToolbarManager = new EditorAIToolbarManager(this);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (
					file instanceof TFile &&
					file.extension === "epub" &&
					this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)
				) {
					menu.addItem((item) => {
						item
							.setTitle("用 Weave 打开")
							.setIcon("book-open")
							.onClick(async () => {
								await this.openEpubReader(file.path);
							});
					});
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				try {
					if (!(view instanceof MarkdownView)) return;
					const file = view.file;
					if (!file) return;
					const selection = editor.getSelection()?.trim() || "";

					const weaveSubmenu = getWeaveOperationsSubmenu(menu);

					weaveSubmenu.addItem((item) => {
						item
							.setTitle("插入牌组视图")
							.setIcon("layout-grid")
							.onClick(() => {
								this.insertWeaveDeckViewCodeBlock(editor);
							});
					});

					if (selection && this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
						weaveSubmenu.addItem((item) => {
							item
								.setTitle(i18n.t("commands.createIrReadingPointFromSelection.name"))
								.setIcon("book-plus")
								.onClick(() => {
									void this.runSelectionToIRQuickCreate({
										file,
										editor,
										selectedText: selection,
										selectionRange: {
											from: editor.getCursor("from"),
											to: editor.getCursor("to"),
										},
									});
								});
						});
					}

					// AI制卡工具栏
					weaveSubmenu.addItem((item) => {
						item
							.setTitle("AI 制卡")
							.setIcon("sparkles")
							.onClick(() => {
								void this.editorAIToolbarManager?.toggle();
							});
					});

					if (this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) {
						weaveSubmenu.addItem((item) => {
							item
								.setTitle("将当前文档添加为增量阅读文档...")
								.setIcon("book")
								.onClick(() => {
									void this.openAddCurrentDocumentToIRDeckModal(file);
								});
						});
						weaveSubmenu.addItem((item) => {
							item
								.setTitle("将当前文档从增量阅读牌组中移除")
								.setIcon("trash")
								.onClick(() => {
									void this.removeCurrentDocumentFromIR(file);
								});
						});
					}
				} catch {}
			})
		);

		// Canvas 节点右键菜单：添加为 Weave 卡片（子菜单显示记忆牌组）
		this.registerEvent(
			(this.app.workspace as any).on("canvas:node-menu", (menu: Menu, node: any) => {
				try {
					if (!this.dataStorage) return;

					// 获取节点内容
					let nodeContent = "";
					const nodeData = node?.getData?.();

					if (nodeData?.type === "text" && nodeData?.text) {
						nodeContent = nodeData.text.trim();
					} else if (nodeData?.type === "file" && nodeData?.file) {
						nodeContent = `![[${nodeData.file}]]`;
					}

					if (!nodeContent) return;

					menu.addItem((item) => {
						item.setTitle("添加为 Weave 卡片");
						item.setIcon("brain");
						const submenu = (item as any).setSubmenu() as Menu;

						// 异步加载记忆牌组列表（submenu 在用户 hover 时才展开，加载时间充裕）
						void this.buildCanvasCardDeckSubmenu(submenu, nodeContent, node);
					});
				} catch {}
			})
		);

		// 注册命令面板命令
		this.addCommand({
			id: "ai-card-generation",
			name: "AI 制卡",
			icon: "sparkles",
			editorCallback: () => {
				void this.editorAIToolbarManager?.toggle();
			},
		});
	}

	/**
	 * Canvas 节点添加为卡片 - 构建牌组子菜单
	 */
	private async buildCanvasCardDeckSubmenu(
		submenu: Menu,
		content: string,
		node: any
	): Promise<void> {
		try {
			const allDecks = await this.dataStorage.getAllDecks();
			const memoryDecks = allDecks.filter(
				(d: Deck) => d.purpose !== "test" && d.deckType !== "question-bank"
			);

			if (memoryDecks.length === 0) {
				submenu.addItem((subItem) => {
					subItem.setTitle("暂无可用牌组").setDisabled(true);
				});
				return;
			}

			for (const deck of memoryDecks) {
				submenu.addItem((subItem) => {
					subItem.setTitle(deck.name).onClick(async () => {
						await this.addCanvasNodeAsCard(content, deck, node);
					});
				});
			}
		} catch (error) {
			logger.error("[Canvas] 加载牌组列表失败:", error);
			submenu.addItem((subItem) => {
				subItem.setTitle("加载牌组失败").setDisabled(true);
			});
		}
	}

	/**
	 * 将 Canvas 节点内容创建为卡片并保存到指定牌组
	 */
	private async addCanvasNodeAsCard(content: string, deck: Deck, node: any): Promise<void> {
		try {
			const { CardType } = await import("./data/types");
			const { createContentWithMetadata } = await import("./utils/yaml-utils");

			const now = new Date().toISOString();
			const sourceFile = this.getActiveCanvasPath();
			const sourceBlock = this.getCanvasNodeId(node);
			const sourceLink = this.buildCanvasNodeSourceLink(node);
			const cardContent = createContentWithMetadata(
				{
					...(sourceLink ? { we_source: sourceLink } : {}),
					we_decks: [deck.name],
					we_type: CardType.Basic,
					created: now,
				},
				content
			);
			const newCard: import("./data/types").Card = {
				uuid: generateUUID(),
				deckId: deck.id,
				type: CardType.Basic,
				content: cardContent,
				sourceFile: sourceFile,
				sourceBlock: sourceBlock ? `^${sourceBlock}` : undefined,
				fsrs: {
					due: now,
					stability: 0,
					difficulty: 0,
					elapsedDays: 0,
					scheduledDays: 0,
					reps: 0,
					lapses: 0,
					state: 0,
					lastReview: undefined,
					retrievability: 1,
				},
				reviewHistory: [],
				stats: {
					totalReviews: 0,
					totalTime: 0,
					averageTime: 0,
					memoryRate: 0,
				},
				created: now,
				modified: now,
				tags: [],
			};

			const result = await this.dataStorage.saveCard(newCard);
			if (result.success) {
				new Notice(`已添加到牌组「${deck.name}」`);
			} else {
				new Notice(`添加失败: ${result.error}`);
			}
		} catch (error) {
			logger.error("[Canvas] 添加卡片失败:", error);
			new Notice("添加卡片失败");
		}
	}

	private getActiveCanvasPath(): string | undefined {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile?.path?.toLowerCase().endsWith(".canvas")) {
			return activeFile.path;
		}

		const canvasLeaf = this.app.workspace.getLeavesOfType("canvas")[0];
		const canvasPath = (canvasLeaf?.view as any)?.file?.path;
		return typeof canvasPath === "string" && canvasPath.toLowerCase().endsWith(".canvas")
			? canvasPath
			: undefined;
	}

	private getCanvasNodeId(node: any): string | undefined {
		const nodeData = node?.getData?.() ?? node;
		const nodeId = typeof nodeData?.id === "string" ? nodeData.id.trim() : "";
		return nodeId || undefined;
	}

	private buildCanvasNodeSourceLink(node: any): string | undefined {
		const canvasPath = this.getActiveCanvasPath();
		if (!canvasPath) return undefined;

		const nodeData = node?.getData?.() ?? node;
		const nodeId = this.getCanvasNodeId(node);
		if (!nodeId) {
			return `[[${canvasPath}]]`;
		}

		const x = Number(nodeData?.x);
		const y = Number(nodeData?.y);
		const width = Number(nodeData?.width);
		const height = Number(nodeData?.height);
		const params = new URLSearchParams();

		if (Number.isFinite(x)) params.set("x", String(Math.round(x)));
		if (Number.isFinite(y)) params.set("y", String(Math.round(y)));
		if (Number.isFinite(width)) params.set("w", String(Math.round(width)));
		if (Number.isFinite(height)) params.set("h", String(Math.round(height)));

		const query = params.toString();
		return `[[${canvasPath}#^${nodeId}${query ? `?${query}` : ""}]]`;
	}

	private registerPdfPlusContextMenuFeatures(): void {
		this.registerEvent(
			(this.app.workspace as any).on("pdf-menu", (menu: Menu, data: any) => {
				try {
					const activeFile = this.app.workspace.getActiveFile();
					if (!activeFile || activeFile.extension !== "pdf") return;
					if (!this.shouldShowPremiumEntry(PREMIUM_FEATURES.INCREMENTAL_READING)) return;

					menu.addItem((item) => {
						item
							.setTitle("Weave：设为续读点")
							.setIcon("bookmark")
							.onClick(() => {
								void this.setPdfResumePointFromActivePdf();
							});
					});

					menu.addItem((item) => {
						item
							.setTitle("Weave：创建书签任务（当前视图）")
							.setIcon("bookmark")
							.onClick(() => {
								void this.createPdfBookmarkTaskWithTitle(activeFile.basename);
							});
					});

					menu.addItem((item) => {
						item
							.setTitle("Weave：从目录生成书签任务")
							.setIcon("bookmark")
							.onClick(() => {
								void this.createPdfBookmarkTasksFromOutline();
							});
					});

					const selection = typeof data?.selection === "string" ? data.selection.trim() : "";
					if (selection) {
						menu.addItem((item) => {
							item
								.setTitle("Weave：创建书签任务（选区）")
								.setIcon("bookmark")
								.onClick(() => {
									void this.createPdfBookmarkTaskWithTitle(selection.slice(0, 80));
								});
						});
					}

					if (data?.annot) {
						const pageNumber = typeof data?.pageNumber === "number" ? data.pageNumber : null;
						const title = pageNumber ? `PDF 标注 p.${pageNumber}` : "PDF 标注";
						menu.addItem((item) => {
							item
								.setTitle("Weave：创建书签任务（标注）")
								.setIcon("bookmark")
								.onClick(() => {
									void this.createPdfBookmarkTaskWithTitle(title);
								});
						});
					}
				} catch {}
			})
		);
	}

	private getIncrementalReadingSettings(): {
		importFolder: string;
		selectionQuickCreateLastFolder: string;
	} {
		if (!this.settings.incrementalReading) {
			this.settings.incrementalReading = {
				importFolder: resolveIRImportFolder(undefined, this.settings.weaveParentFolder),
				selectionQuickCreateLastFolder: "",
			} as any;
		}

		const irSettings = this.settings.incrementalReading as any;
		irSettings.importFolder = resolveIRImportFolder(
			irSettings.importFolder,
			this.settings.weaveParentFolder
		);
		irSettings.selectionQuickCreateLastFolder = String(
			irSettings.selectionQuickCreateLastFolder || ""
		).trim();

		return irSettings;
	}

	private normalizeSelectionQuickCreateFolderPath(folderPath: string): string {
		const raw = String(folderPath || "")
			.trim()
			.replace(/\\/g, "/");
		if (!raw || raw === "." || raw === "/") {
			return "/";
		}

		return normalizePath(raw);
	}

	private getSelectionQuickCreateFolderConfig(): {
		initialFolder: string;
	} {
		const irSettings = this.getIncrementalReadingSettings();
		const defaultFolder = "/";
		const initialFolder = this.normalizeSelectionQuickCreateFolderPath(
			irSettings.selectionQuickCreateLastFolder || defaultFolder
		);

		return {
			initialFolder,
		};
	}

	private async saveSelectionQuickCreatePreferences(update: {
		folderPath?: string;
	}): Promise<void> {
		const irSettings = this.getIncrementalReadingSettings() as any;

		if (update.folderPath !== undefined) {
			irSettings.selectionQuickCreateLastFolder = this.normalizeSelectionQuickCreateFolderPath(
				update.folderPath
			);
		}

		await this.saveSettings();
	}

	async scheduleEpubChapterForIncrementalReading(options: {
		filePath: string;
		title: string;
		tocHref: string;
		tocLevel: number;
	}): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		const sourceFile = this.app.vault.getAbstractFileByPath(String(options.filePath || "").trim());
		if (!(sourceFile instanceof TFile) || sourceFile.extension !== "epub") {
			new Notice("未找到对应的 EPUB 文件", 3000);
			return;
		}

		const service = await this.ensureIREpubBookmarkTaskServiceReady();
		const normalizedHref = this.normalizeEpubBookmarkHref(options.tocHref);
		if (!normalizedHref) {
			new Notice("未能读取章节定位信息", 3000);
			return;
		}

		const picked = await this.pickIRDeck();
		if (!picked) {
			return;
		}
		const existingTasks = await service.getTasksByDeckIdentifiers(
			await this.getIRDeckIdentifiers(picked)
		);

		const title =
			this.cleanIRReadingPointTitle(options.title) ||
			sourceFile.basename ||
			"EPUB 章节";

		const duplicateTask = existingTasks.find(
			(task) =>
				String(task.epubFilePath || "").trim() === sourceFile.path &&
				this.normalizeEpubBookmarkHref(task.tocHref) === normalizedHref
		);
		if (duplicateTask) {
			new Notice(`章节「${title}」已存在于专题「${picked.name}」中`, 3500);
			return;
		}
		const nextRepDate = Date.now();

		await service.batchCreateTasks([
			{
				deckId: picked.id,
				epubFilePath: sourceFile.path,
				title,
				tocHref: normalizedHref,
				tocLevel: Math.max(0, Number(options.tocLevel || 0)),
				priorityUi: 5,
				nextRepDate,
			},
		]);

		await recomputeAndBroadcastIRData(this.app, "import_materials", {
			deckIds: [picked.id],
		});
		new Notice(`已将「${title}」添加到专题「${picked.name}」，月历与专题数据已刷新`, 4000);
	}

	async exportEpubChapterToMarkdown(options: {
		filePath: string;
		title: string;
		body: string;
		markdown?: string;
		assets?: Array<{
			placeholder: string;
			suggestedName: string;
			data: Uint8Array;
			mimeType: string;
			originalHref?: string;
		}>;
		sourceLink?: string;
		bookTitle?: string;
		author?: string;
	}): Promise<void> {
		const sourceFile = this.app.vault.getAbstractFileByPath(String(options.filePath || "").trim());
		if (!(sourceFile instanceof TFile) || sourceFile.extension !== "epub") {
			new Notice("未找到对应的 EPUB 文件", 3000);
			return;
		}

		const exportFolder =
			sourceFile.parent?.path && sourceFile.parent.path.trim()
				? normalizePath(sourceFile.parent.path)
				: "/";
		const title = this.cleanIRReadingPointTitle(options.title) || "EPUB 章节";
		const fileTitle = options.bookTitle
			? `${String(options.bookTitle).trim()} - ${title}`
			: `${sourceFile.basename} - ${title}`;

		await this.ensureSelectionQuickCreateFolderExists(exportFolder);
		const targetPath = await this.generateUniqueIRReadingPointPath(exportFolder, fileTitle);
		const assetReplacements = await this.writeEpubChapterExportAssets(targetPath, options.assets || []);
		const content = this.buildEpubChapterMarkdownContent({
			title,
			body: options.markdown || options.body,
			sourceLink: options.sourceLink,
			bookTitle: options.bookTitle,
			author: options.author,
			assetReplacements,
		});
		const createdFile = await this.app.vault.create(targetPath, content);
		await openFileWithExistingLeaf(this.app, createdFile, { openInNewTab: true, focus: true });
		new Notice(`已导出 Markdown：${createdFile.basename}`, 3000);
	}

	async openIRReadingPointFromExternalSelection(options: {
		filePath: string;
		selectedText: string;
		sourceLink?: string;
		successNotice?: string;
		initialTitle?: string;
	}): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(String(options.filePath || "").trim());
		if (!(file instanceof TFile)) {
			new Notice("未找到对应的源文件，无法创建增量阅读点", 3000);
			return;
		}

		const selectedText = String(options.selectedText || "").trim();
		if (!selectedText) {
			new Notice("请先选中文本后再创建增量阅读点", 3000);
			return;
		}

		await this.runSelectionToIRQuickCreate({
			file,
			editor: null,
			selectedText,
			selectionRange: null,
			sourceLink: String(options.sourceLink || "").trim() || undefined,
			replaceSourceSelection: false,
			successNotice: options.successNotice,
			initialTitle: String(options.initialTitle || "").trim() || undefined,
		});
	}

	private async runSelectionToIRQuickCreate(context: IRQuickCreateContext | null): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		if (!context) {
			new Notice("请先在 Markdown 编辑界面中选中文本，或将光标放在有内容的行上", 3000);
			return;
		}

		try {
			const preferredTitle = this.cleanIRReadingPointTitle(String(context.initialTitle || ""));
			const draft = preferredTitle
				? {
						title: preferredTitle,
						titleDetected: true,
				  }
				: this.deriveIRReadingPointDraftFromSelection(context.selectedText);
			const folderConfig = this.getSelectionQuickCreateFolderConfig();
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const decksData = await storage.getAllDecks();
			const deckOptions = Object.values(decksData)
				.filter((deck) => !deck.archivedAt)
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((deck) => ({ id: deck.id, name: deck.name }));
			if (deckOptions.length === 0) {
				new Notice("暂无可用增量阅读专题", 3000);
				return;
			}
			const preferredDeck = await this.resolvePreferredIRDeckForSelectionSource(context.file);
			const { SelectionToIRModal } = await import("./modals/SelectionToIRModal");

			new SelectionToIRModal(this.app, {
				deckOptions,
				initialDeckId: preferredDeck?.id,
				initialTitle: draft.title,
				initialFolder: folderConfig.initialFolder,
				titleDetected: draft.titleDetected,
				onPreferenceChange: async (update) => {
					await this.saveSelectionQuickCreatePreferences(update);
				},
				onSubmit: async (payload) => {
					await this.createIRReadingPointFromSelection(context, payload);
				},
			}).open();
		} catch (error) {
			logger.error("[SelectionToIR] 打开从选区创建增量阅读点模态窗失败:", error);
			new Notice("打开增量阅读点创建窗口失败，请重试", 3000);
		}
	}

	private getSelectionContextForIRQuickCreate(): IRQuickCreateContext | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeFile = activeView?.file ?? this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile) || activeFile.extension !== "md") {
			return null;
		}

		const editor: Editor | null = activeView?.editor ?? null;
		let selectedText = editor?.getSelection() ?? "";
		let selectionRange: IRQuickCreateSelectionRange | null = null;

		if (editor && selectedText.trim()) {
			selectionRange = {
				from: editor.getCursor("from"),
				to: editor.getCursor("to"),
			};
		}

		if ((!selectedText || !selectedText.trim()) && editor) {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			if (line?.trim()) {
				selectedText = line.trim();
				selectionRange = {
					from: { line: cursor.line, ch: 0 },
					to: { line: cursor.line, ch: line.length },
				};
				editor.setSelection(selectionRange.from, selectionRange.to);
			}
		}

		if (!selectedText || !selectedText.trim()) {
			const windowSelection = window.getSelection()?.toString()?.trim() || "";
			if (!windowSelection) {
				return null;
			}
			selectedText = windowSelection;
			selectionRange = null;
		}

		return {
			file: activeFile,
			editor,
			selectedText: selectedText.trim(),
			selectionRange,
			replaceSourceSelection: true,
		};
	}

	private cleanIRReadingPointTitle(rawTitle: string): string {
		return String(rawTitle || "")
			.replace(/\r\n?/g, " ")
			.replace(/^\s*#{1,6}\s+/, "")
			.replace(/\s+/g, " ")
			.trim();
	}

	private deriveIRReadingPointDraftFromSelection(selectedText: string): {
		title: string;
		titleDetected: boolean;
	} {
		const normalized = String(selectedText || "")
			.replace(/\r\n?/g, "\n")
			.trim();
		const lines = normalized.split("\n");
		const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
		if (firstNonEmptyIndex >= 0) {
			const firstLine = lines[firstNonEmptyIndex].trim();
			const headingMatch = firstLine.match(/^#{1,6}\s+(.+)$/);
			if (headingMatch?.[1]) {
				const title = this.cleanIRReadingPointTitle(headingMatch[1]) || "未命名阅读点";
				return {
					title,
					titleDetected: true,
				};
			}
		}

		const firstMeaningfulLine = lines.find((line) => line.trim().length > 0) || normalized;
		const cleanedLine = this.cleanIRReadingPointTitle(firstMeaningfulLine);
		const title =
			cleanedLine.length > 80
				? `${cleanedLine.slice(0, 80).trim()}...`
				: cleanedLine || "未命名阅读点";

		return {
			title,
			titleDetected: false,
		};
	}

	private async ensureSelectionQuickCreateFolderExists(folderPath: string): Promise<void> {
		const normalizedFolder = this.normalizeSelectionQuickCreateFolderPath(folderPath);
		if (normalizedFolder === "/") {
			return;
		}

		const segments = normalizedFolder.split("/").filter(Boolean);
		let currentPath = "";
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	private sanitizeIRReadingPointFileName(title: string): string {
		const cleaned = this.cleanIRReadingPointTitle(title)
			.replace(/[\\/:*?"<>|]/g, "_")
			.replace(/\.+$/g, "")
			.trim();
		const truncated = cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
		return truncated || `阅读点-${Date.now()}`;
	}

	private async generateUniqueIRReadingPointPath(
		folderPath: string,
		title: string
	): Promise<string> {
		const normalizedFolder = this.normalizeSelectionQuickCreateFolderPath(folderPath);
		const baseName = this.sanitizeIRReadingPointFileName(title);

		for (let index = 0; index < 500; index++) {
			const suffix = index === 0 ? "" : ` ${index + 1}`;
			const fileName = `${baseName}${suffix}.md`;
			const candidatePath =
				normalizedFolder === "/" ? fileName : normalizePath(`${normalizedFolder}/${fileName}`);
			if (!(await this.app.vault.adapter.exists(candidatePath))) {
				return candidatePath;
			}
		}

		const fallbackFileName = `${baseName}-${Date.now()}.md`;
		return normalizedFolder === "/"
			? fallbackFileName
			: normalizePath(`${normalizedFolder}/${fallbackFileName}`);
	}

	private buildIRReadingPointContent(
		title: string,
		body: string,
		options?: { sourceLink?: string }
	): string {
		const safeTitle = this.cleanIRReadingPointTitle(title) || "未命名阅读点";
		const normalizedBody = String(body || "")
			.replace(/\r\n?/g, "\n")
			.trim();
		const markdownBody = normalizedBody ? `# ${safeTitle}\n\n${normalizedBody}\n` : `# ${safeTitle}\n`;
		const sourceLink = String(options?.sourceLink || "").trim();
		if (!normalizedBody) {
			return sourceLink
				? createContentWithMetadata({ we_source: sourceLink }, markdownBody)
				: markdownBody;
		}

		return sourceLink
			? createContentWithMetadata({ we_source: sourceLink }, markdownBody)
			: markdownBody;
	}

	private async resolvePreferredIRDeckForSelectionSource(
		file: TFile
	): Promise<{ id: string; name: string } | null> {
		let deckId = "";

		if (this.readingMaterialManager) {
			const material = this.readingMaterialManager.getMaterialByPath(file.path) as any;
			const materialDeckId =
				typeof material?.readingDeckId === "string" ? material.readingDeckId.trim() : "";
			const materialTopicId = typeof material?.topicId === "string" ? material.topicId.trim() : "";
			deckId = materialDeckId || materialTopicId;
		}

		if (!deckId) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as
				| Record<string, unknown>
				| undefined;
			const yamlTopicId =
				typeof frontmatter?.["weave-reading-topic-id"] === "string"
					? String(frontmatter["weave-reading-topic-id"]).trim()
					: "";
			const yamlLegacyDeckId =
				typeof frontmatter?.["weave-reading-ir-deck-id"] === "string"
					? String(frontmatter["weave-reading-ir-deck-id"]).trim()
					: "";
			deckId = yamlTopicId || yamlLegacyDeckId;
		}

		if (deckId) {
			try {
				const storage = new IRStorageService(this.app);
				await storage.initialize();
				const deck = await storage.getDeck(deckId);
				if (deck) {
					return {
						id: deckId,
						name: String((deck as any).name || "").trim() || "增量阅读",
					};
				}
			} catch (error) {
				logger.warn("[SelectionToIR] 读取源文档关联专题失败，将在模态窗顶部重新选择:", error);
			}
		}

		return null;
	}

	private async updateSourceDocumentAfterIRQuickCreate(
		file: TFile,
		link: string,
		selectionRange: {
			from: { line: number; ch: number };
			to: { line: number; ch: number };
		} | null,
		editor: Editor | null
	): Promise<boolean> {
		if (!selectionRange) {
			return false;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (editor && activeView?.editor === editor && activeView.file?.path === file.path) {
			editor.replaceRange(link, selectionRange.from, selectionRange.to);
			return true;
		}

		const currentContent = await this.app.vault.cachedRead(file);
		const updatedContent = replaceSelectionInMarkdownContent(currentContent, selectionRange, link);
		if (updatedContent !== currentContent) {
			await this.app.vault.modify(file, updatedContent);
		}
		return true;
	}

	private getIRReadingPointWikiLinkTarget(file: TFile): string {
		return file.path.replace(/\.md$/i, "");
	}

	private async createIRReadingPointFromSelection(
		context: IRQuickCreateContext,
		payload: {
			title: string;
			deckId: string;
			folderPath: string;
		}
	): Promise<void> {
		const title = this.cleanIRReadingPointTitle(payload.title);
		if (!title) {
			new Notice("请输入阅读点标题", 3000);
			throw new Error("selection-ir-missing-title");
		}

		const { waitForServiceReady } = await import("./utils/service-ready-event");
		await waitForServiceReady("readingMaterialManager", 15000);

		if (!this.readingMaterialManager) {
			new Notice("增量阅读服务尚未初始化完成，请稍后再试", 3000);
			throw new Error("selection-ir-manager-not-ready");
		}

		const deckId = String(payload.deckId || "").trim();
		if (!deckId) {
			new Notice("请选择增量阅读专题", 3000);
			throw new Error("selection-ir-missing-deck");
		}

		const storage = new IRStorageService(this.app);
		await storage.initialize();
		const rawDeck = await storage.getDeck(deckId);
		const deck = rawDeck
			? { id: deckId, name: String((rawDeck as any).name || "").trim() || "增量阅读" }
			: null;
		if (!deck) {
			new Notice("所选增量阅读专题不存在或已归档", 3000);
			throw new Error("selection-ir-deck-missing");
		}

		const folderPath = this.normalizeSelectionQuickCreateFolderPath(payload.folderPath);
		const body = String(context.selectedText || "")
			.replace(/\r\n?/g, "\n")
			.trim();
		const fileContent = this.buildIRReadingPointContent(title, body, {
			sourceLink: context.sourceLink,
		});
		let createdFile: TFile | null = null;

		try {
			await this.ensureSelectionQuickCreateFolderExists(folderPath);
			const targetPath = await this.generateUniqueIRReadingPointPath(folderPath, title);
			createdFile = await this.app.vault.create(targetPath, fileContent);

			const material = await this.readingMaterialManager.getOrCreateMaterial(createdFile, {
				copyToImportFolder: false,
				source: "manual",
				category: ReadingCategory.Later,
				tags: ["weave-incremental-reading"],
			});
			await this.readingMaterialManager.setReadingDeck(material.uuid, deck.id);

			const { createYAMLFrontmatterManager } = await import("./utils/yaml-frontmatter-utils");
			const yamlManager = createYAMLFrontmatterManager(this.app);
			await yamlManager.updateReadingFields(createdFile, {
				"weave-reading-topic-id": deck.id,
			});

			await this.ensureExternalDocumentChunkScheduled(createdFile, deck.id, deck.name);

			const shouldReplaceSourceSelection = context.replaceSourceSelection !== false;
			const createdLink = `[[${this.getIRReadingPointWikiLinkTarget(createdFile)}]]`;
			const sourceUpdated = shouldReplaceSourceSelection
				? await this.updateSourceDocumentAfterIRQuickCreate(
						context.file,
						createdLink,
						context.selectionRange,
						context.editor
				  )
				: false;

			window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
			const successNotice = String(context.successNotice || "").trim();
			if (successNotice) {
				new Notice(successNotice, 3500);
			} else if (shouldReplaceSourceSelection) {
				new Notice(
					sourceUpdated
						? "阅读点已创建，并已用双链替换源文档选区"
						: "阅读点已创建，但未能定位源文档选区，未自动替换为双链",
					3500
				);
			} else {
				new Notice("阅读点已创建", 2500);
			}
		} catch (error) {
			logger.error("[SelectionToIR] 从选区创建增量阅读点失败:", error);
			if (createdFile) {
				window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
				new Notice("阅读点文件已创建，但加入增量阅读或回写源文档失败，请检查控制台日志", 4500);
				return;
			}

			new Notice("创建增量阅读点失败，请重试", 3000);
			throw error;
		}
	}

	private async openAddCurrentDocumentToIRDeckModal(file: TFile): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const decksData = await storage.getAllDecks();
			const decks = Object.values(decksData)
				.filter((d) => !d.archivedAt)
				.sort((a, b) => a.name.localeCompare(b.name));

			if (decks.length === 0) {
				new Notice("暂无可用增量阅读牌组");
				return;
			}

			const modal = new IRDeckSelectorModal(this.app, decks, (deck) => {
				void this.addCurrentDocumentToIRDeck(file, deck.id, deck.name);
			});
			modal.open();
		} catch (error) {
			logger.error("[WeaveContextMenu] 打开增量阅读牌组选择失败:", error);
			new Notice("打开增量阅读牌组列表失败");
		}
	}

	private async addCurrentDocumentToIRDeck(
		file: TFile,
		deckId: string,
		deckName: string
	): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		try {
			const { waitForServiceReady } = await import("./utils/service-ready-event");
			await waitForServiceReady("readingMaterialManager", 15000);

			if (!this.readingMaterialManager) {
				new Notice("增量阅读服务未就绪");
				return;
			}

			await this.readingMaterialManager.getOrCreateMaterial(file, {
				copyToImportFolder: false,
				source: "manual",
			});

			const { createYAMLFrontmatterManager } = await import("./utils/yaml-frontmatter-utils");
			const yamlManager = createYAMLFrontmatterManager(this.app);
			await yamlManager.updateReadingFields(file, {
				"weave-reading-ir-deck-id": deckId,
			});

			await this.ensureExternalDocumentChunkScheduled(file, deckId, deckName);
			window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));

			new Notice(`已添加为增量阅读文档：${deckName}`);
		} catch (error) {
			logger.error("[WeaveContextMenu] 添加增量阅读文档失败:", error);
			new Notice("添加为增量阅读文档失败");
		}
	}

	private async ensureExternalDocumentChunkScheduled(
		file: TFile,
		deckId: string,
		deckName: string
	): Promise<void> {
		const storage = new IRStorageService(this.app);
		await storage.initialize();
		const chunks = await storage.getAllChunkData();

		const existing = Object.values(chunks).find(
			(c: any) => (c as any)?.filePath === file.path
		) as any;
		const now = Date.now();

		if (existing) {
			existing.deckIds = [deckId];
			existing.deckTag = `#IR_deck_${deckName}`;
			existing.nextRepDate = now;
			existing.intervalDays = existing.intervalDays || 1;
			existing.scheduleStatus = "queued";
			existing.updatedAt = now;
			(existing.meta as any) = { ...(existing.meta || {}), externalDocument: true };
			await storage.saveChunkData(existing);
			return;
		}

		const chunkId = generateChunkId();
		const sourceId = generateSourceId();
		const chunk = createDefaultChunkFileData(chunkId, sourceId, file.path) as any;
		chunk.deckIds = [deckId];
		chunk.deckTag = `#IR_deck_${deckName}`;
		chunk.nextRepDate = now;
		chunk.intervalDays = 1;
		chunk.scheduleStatus = "queued";
		chunk.updatedAt = now;
		chunk.meta = { ...(chunk.meta || {}), externalDocument: true };
		await storage.saveChunkData(chunk);
	}

	private async ensureIRPdfBookmarkTaskServiceReady(): Promise<IRPdfBookmarkTaskService> {
		if (!this.irPdfBookmarkTaskService) {
			this.irPdfBookmarkTaskService = new IRPdfBookmarkTaskService(this.app);
		}
		await this.irPdfBookmarkTaskService.initialize();
		return this.irPdfBookmarkTaskService;
	}

	private async ensureIREpubBookmarkTaskServiceReady(): Promise<IREpubBookmarkTaskService> {
		if (!this.irEpubBookmarkTaskService) {
			this.irEpubBookmarkTaskService = new IREpubBookmarkTaskService(this.app);
		}
		await this.irEpubBookmarkTaskService.initialize();
		return this.irEpubBookmarkTaskService;
	}

	private async resolveIRDeckById(deckId: string): Promise<{ id: string; name: string } | null> {
		const normalizedDeckId = String(deckId || "").trim();
		if (!normalizedDeckId) {
			return null;
		}

		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const deck = await storage.getDeck(normalizedDeckId);
			if (!deck || (deck as any).archivedAt) {
				return null;
			}

			return {
				id: normalizedDeckId,
				name: String((deck as any).name || "").trim() || "增量阅读",
			};
		} catch {
			return null;
		}
	}

	private async getIRDeckIdentifiers(deck: { id: string; path?: string }): Promise<string[]> {
		const identifiers = new Set<string>();
		const deckId = String(deck?.id || "").trim();
		if (deckId) {
			identifiers.add(deckId);
		}

		const deckPath = String(deck?.path || "").trim();
		if (deckPath) {
			identifiers.add(deckPath);
		}

		if (!deckId || deckPath) {
			return Array.from(identifiers);
		}

		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const storedDeck = await storage.getDeck(deckId);
			const legacyPath = String((storedDeck as any)?.path || "").trim();
			if (legacyPath) {
				identifiers.add(legacyPath);
			}
		} catch {}

		return Array.from(identifiers);
	}

	private normalizeEpubBookmarkHref(href: string): string {
		return String(href || "").trim();
	}

	private normalizeEpubChapterExportBody(body: string, title: string): string {
		let normalized = String(body || "")
			.replace(/\r\n?/g, "\n")
			.trim();

		const normalizedTitle = this.cleanIRReadingPointTitle(title).toLowerCase();
		const headingMatch = normalized.match(/^#\s+(.+?)\n+/);
		if (headingMatch) {
			const firstHeading = this.cleanIRReadingPointTitle(headingMatch[1]).toLowerCase();
			if (firstHeading && firstHeading === normalizedTitle) {
				normalized = normalized.slice(headingMatch[0].length).trim();
			}
		}

		return normalized.replace(/\n{3,}/g, "\n\n").trim();
	}

	private buildEpubChapterMarkdownContent(options: {
		title: string;
		body: string;
		sourceLink?: string;
		bookTitle?: string;
		author?: string;
		assetReplacements?: Map<string, string>;
	}): string {
		const title = this.cleanIRReadingPointTitle(options.title) || "EPUB 章节";
		const body = this.normalizeEpubChapterExportBody(
			this.replaceEpubExportAssetPlaceholders(options.body, options.assetReplacements),
			title
		);
		const metaLines = [
			options.bookTitle ? `> 来源书籍：${String(options.bookTitle).trim()}` : "",
			options.author ? `> 作者：${String(options.author).trim()}` : "",
			options.sourceLink ? `> EPUB 溯源：${String(options.sourceLink).trim()}` : "",
		].filter(Boolean);

		const sections = [`# ${title}`, ""];
		if (metaLines.length > 0) {
			sections.push(...metaLines, "");
		}
		sections.push("## 正文", "", body || "（当前章节暂无可导出的正文内容）", "");

		const markdown = sections.join("\n");
		return options.sourceLink
			? createContentWithMetadata({ we_source: options.sourceLink }, markdown)
			: markdown;
	}

	private replaceEpubExportAssetPlaceholders(
		markdown: string,
		replacements?: Map<string, string>
	): string {
		let result = String(markdown || "");
		if (!replacements || replacements.size === 0) {
			return result;
		}
		for (const [placeholder, replacement] of replacements.entries()) {
			result = result.split(placeholder).join(replacement);
		}
		return result;
	}

	private async writeEpubChapterExportAssets(
		notePath: string,
		assets: Array<{
			placeholder: string;
			suggestedName: string;
			data: Uint8Array;
			mimeType: string;
			originalHref?: string;
		}>
	): Promise<Map<string, string>> {
		const replacements = new Map<string, string>();
		if (!Array.isArray(assets) || assets.length === 0) {
			return replacements;
		}

		const assetFolderPath = this.buildEpubChapterAssetFolderPath(notePath);
		await this.ensureSelectionQuickCreateFolderExists(assetFolderPath);
		const usedNames = new Set<string>();

		for (const asset of assets) {
			const placeholder = String(asset?.placeholder || "").trim();
			if (!placeholder || !(asset?.data instanceof Uint8Array) || asset.data.length === 0) {
				continue;
			}
			const assetPath = await this.generateUniqueEpubAssetPath(
				assetFolderPath,
				String(asset.suggestedName || "").trim() || "image"
			);
			const assetName = assetPath.split("/").pop() || assetPath;
			if (usedNames.has(assetName)) {
				continue;
			}
			usedNames.add(assetName);
			await this.app.vault.createBinary(assetPath, this.uint8ArrayToArrayBuffer(asset.data));
			replacements.set(placeholder, `![[${assetPath}]]`);
		}

		return replacements;
	}

	private buildEpubChapterAssetFolderPath(notePath: string): string {
		const normalizedNotePath = normalizePath(String(notePath || "").trim());
		const noteBasePath = normalizedNotePath.replace(/\.md$/i, "");
		return normalizePath(`${noteBasePath}.assets`);
	}

	private async generateUniqueEpubAssetPath(folderPath: string, suggestedName: string): Promise<string> {
		const rawFileName = String(suggestedName || "").trim();
		const dotIndex = rawFileName.lastIndexOf(".");
		const baseName = dotIndex > 0 ? rawFileName.slice(0, dotIndex) : rawFileName;
		const extension = dotIndex > 0 ? rawFileName.slice(dotIndex).toLowerCase() : "";
		const safeBaseName =
			this.sanitizeIRReadingPointFileName(baseName || "image").replace(/\.md$/i, "") || "image";
		let attempt = 0;

		while (attempt < 2000) {
			const fileName =
				attempt === 0
					? `${safeBaseName}${extension}`
					: `${safeBaseName}-${attempt + 1}${extension}`;
			const candidatePath = normalizePath(`${folderPath}/${fileName}`);
			if (!this.app.vault.getAbstractFileByPath(candidatePath)) {
				return candidatePath;
			}
			attempt += 1;
		}

		return normalizePath(`${folderPath}/${safeBaseName}-${Date.now()}${extension}`);
	}

	private uint8ArrayToArrayBuffer(data: Uint8Array): ArrayBuffer {
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	}

	private async readClipboardTextOrPrompt(promptText: string): Promise<string | null> {
		let text = "";
		try {
			text = await navigator.clipboard.readText();
		} catch {
			try {
				const electronClipboard = (window as any)?.require?.("electron")?.clipboard;
				if (electronClipboard?.readText) {
					text = String(electronClipboard.readText() || "");
				}
			} catch {}
		}

		text = String(text || "").trim();
		if (text) return text;

		const { showObsidianInput } = await import("./utils/obsidian-confirm");
		const manual = await showObsidianInput(this.app, promptText);
		if (!manual || !manual.trim()) return null;
		return manual.trim();
	}

	private async copyPdfPlusCurrentPageViewLinkFromActivePdf(): Promise<string | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") {
			new Notice("请先打开一个 PDF 文件");
			return null;
		}

		const commandName = "PDF++: Copy link to current page view";
		const commands = (this.app as any)?.commands?.commands as Record<string, any> | undefined;
		const entries = commands ? Object.entries(commands) : [];
		let pdfPlusCommandId: string | undefined;
		for (const [id, cmd] of entries) {
			if (cmd?.name === commandName) {
				pdfPlusCommandId = id;
				break;
			}
		}
		if (!pdfPlusCommandId) {
			for (const [id, cmd] of entries) {
				const n = String(cmd?.name || "");
				if (n.includes("Copy link to current page view") && n.startsWith("PDF++")) {
					pdfPlusCommandId = id;
					break;
				}
			}
		}

		if (!pdfPlusCommandId) {
			new Notice("未找到 PDF++ 命令：复制当前页面视图链接");
			return null;
		}

		const executed = (this.app as any).commands.executeCommandById(pdfPlusCommandId);
		if (!executed) {
			new Notice("执行 PDF++ 命令失败");
			return null;
		}

		await new Promise((resolve) => setTimeout(resolve, 120));

		const linkText = await this.readClipboardTextOrPrompt(
			"无法读取剪贴板，请粘贴 PDF++ 生成的链接："
		);
		if (!linkText) {
			new Notice("读取剪贴板失败");
			return null;
		}

		if (!/\.pdf/i.test(linkText) || !/page=\d+/i.test(linkText)) {
			new Notice("剪贴板内容不是有效的 PDF++ 链接");
			return null;
		}

		return linkText;
	}

	private async pickIRDeck(): Promise<{ id: string; name: string } | null> {
		try {
			const storage = new IRStorageService(this.app);
			await storage.initialize();
			const decksData = await storage.getAllDecks();
			const decks = Object.values(decksData)
				.filter((d) => !d.archivedAt)
				.sort((a, b) => a.name.localeCompare(b.name));

			if (decks.length === 0) {
				new Notice("暂无可用增量阅读牌组");
				return null;
			}

			return await new Promise((resolve) => {
				let resolved = false;
				let closeTimer: ReturnType<typeof setTimeout> | null = null;
				const settle = (value: { id: string; name: string } | null) => {
					if (resolved) {
						return;
					}
					resolved = true;
					if (closeTimer) {
						clearTimeout(closeTimer);
						closeTimer = null;
					}
					resolve(value);
				};
				const modal = new IRDeckSelectorModal(this.app, decks, (deck) => {
					settle({ id: deck.id, name: deck.name });
				});
				const originalOnClose = (modal as any).onClose?.bind(modal);
				(modal as any).onClose = () => {
					try {
						originalOnClose?.();
					} catch {}
					if (resolved || closeTimer) {
						return;
					}
					closeTimer = setTimeout(() => {
						closeTimer = null;
						settle(null);
					}, 0);
				};
				modal.open();
			});
		} catch (error) {
			logger.error("[Plugin] 打开增量阅读牌组选择失败:", error);
			new Notice("打开增量阅读牌组列表失败");
			return null;
		}
	}

	private async createPdfBookmarkTaskWithTitle(title: string): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") {
			new Notice("请先打开一个 PDF 文件");
			return;
		}

		const link = await this.copyPdfPlusCurrentPageViewLinkFromActivePdf();
		if (!link) return;

		const picked = await this.pickIRDeck();
		if (!picked) return;

		const service = await this.ensureIRPdfBookmarkTaskServiceReady();
		await service.createTask({
			deckId: picked.id,
			pdfPath: activeFile.path,
			title,
			link,
		});

		window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
		new Notice(`已创建 PDF 书签任务：${picked.name}`);
	}

	private async setPdfResumePointFromActivePdf(): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") {
			new Notice("请先打开一个 PDF 文件");
			return;
		}

		if (!this.readingMaterialManager || !this.readingMaterialStorage) {
			new Notice("增量阅读服务未初始化");
			return;
		}

		await this.readingMaterialStorage.initialize();
		const linkText = await this.copyPdfPlusCurrentPageViewLinkFromActivePdf();
		if (!linkText) return;

		if (!/\.pdf/i.test(linkText) || !/page=\d+/i.test(linkText)) {
			new Notice("剪贴板内容不是有效的 PDF++ 链接");
			return;
		}

		const material = await this.readingMaterialManager.getOrCreateMaterial(activeFile, {
			source: "manual",
			copyToImportFolder: false,
			category: ReadingCategory.Reading,
			tags: ["weave-incremental-reading"],
		});

		if (material.category !== ReadingCategory.Reading) {
			await this.readingMaterialManager.changeCategory(material.uuid, ReadingCategory.Reading);
			material.category = ReadingCategory.Reading;
		}

		if (!Array.isArray(material.tags)) {
			material.tags = [];
		}
		if (!material.tags.includes("weave-incremental-reading")) {
			material.tags.push("weave-incremental-reading");
		}

		let picked: { id: string; name: string } | null = null;
		if (
			typeof (material as any).readingDeckId === "string" &&
			String((material as any).readingDeckId).trim()
		) {
			const deckId = String((material as any).readingDeckId).trim();
			try {
				const storage = new IRStorageService(this.app);
				await storage.initialize();
				const deck = await storage.getDeck(deckId);
				picked = deck
					? { id: deckId, name: String((deck as any).name || "").trim() || "增量阅读" }
					: null;
			} catch {
				picked = null;
			}
		}
		if (!picked) {
			picked = await this.pickIRDeck();
			if (!picked) {
				new Notice("已记录续读点，但未加入增量阅读牌组");
			}
		}

		if (picked) {
			(material as any).readingDeckId = picked.id;
		}
		material.resumeLink = linkText;
		material.resumeUpdatedAt = new Date().toISOString();
		await this.readingMaterialStorage.saveMaterial(material);

		if (picked) {
			try {
				const service = await this.ensureIRPdfBookmarkTaskServiceReady();
				const existing = await service.getTasksByDeckIdentifiers(
					await this.getIRDeckIdentifiers(picked)
				);
				const existingResume = existing.find(
					(t) =>
						String((t as any)?.pdfPath || "").trim() === activeFile.path &&
						String((t as any)?.annotationId || "").trim() === "resume"
				);

				if (existingResume) {
					await service.updateTask(existingResume.id, {
						pdfPath: activeFile.path,
						title: activeFile.basename,
						link: linkText,
						status: "new",
						nextRepDate: 0,
						intervalDays: 1,
					});
				} else {
					await service.createTask({
						deckId: picked.id,
						pdfPath: activeFile.path,
						title: activeFile.basename,
						link: linkText,
						annotationId: "resume",
					});
				}
			} catch (e) {
				logger.warn("[Plugin] 创建/更新 PDF 续读点任务失败（忽略，不影响续读点写入）:", e);
				new Notice("已记录续读点，但加入增量阅读失败（请打开控制台查看日志）");
			}
		}

		window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
		new Notice("已记录 PDF 续读位置");
	}

	private async createPdfBookmarkTaskFromCurrentView(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") {
			new Notice("请先打开一个 PDF 文件");
			return;
		}
		await this.createPdfBookmarkTaskWithTitle(activeFile.basename);
	}

	private async createPdfBookmarkTaskFromCurrentSelection(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") {
			new Notice("请先打开一个 PDF 文件");
			return;
		}

		const selection = window.getSelection()?.toString()?.trim() || "";
		const title = selection ? selection.slice(0, 80) : activeFile.basename;
		await this.createPdfBookmarkTaskWithTitle(title);
	}

	private async getPdfOutlineFromActiveView(): Promise<
		Array<{ title: string; pageNumber: number; path: string[] }>
	> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") return [];

		const pickPdfView = (): any => {
			try {
				const leaves = this.app.workspace.getLeavesOfType?.("pdf") || [];
				for (const leaf of leaves) {
					const v: any = leaf?.view;
					const filePath = v?.file?.path;
					if (filePath && filePath === activeFile.path) {
						return v;
					}
				}
			} catch {}
			return this.app.workspace.getMostRecentLeaf?.()?.view as any;
		};

		const view = pickPdfView();
		const pdfDocument =
			view?.viewer?.pdfViewer?.pdfDocument ||
			view?.pdfViewer?.pdfDocument ||
			view?.viewer?.pdfDocument ||
			view?.pdfDocument;
		if (!pdfDocument?.getOutline) return [];

		let outline: any[];
		try {
			outline = await pdfDocument.getOutline();
		} catch {
			outline = [];
		}
		if (!Array.isArray(outline) || outline.length === 0) return [];

		const results: Array<{ title: string; pageNumber: number; path: string[] }> = [];

		const resolvePageNumber = async (item: any): Promise<number | null> => {
			const dest = item?.dest;
			if (!dest) return null;

			try {
				const destArray = typeof dest === "string" ? await pdfDocument.getDestination(dest) : dest;
				if (!Array.isArray(destArray) || destArray.length === 0) return null;
				const ref = destArray[0];
				const idx = await pdfDocument.getPageIndex(ref);
				if (typeof idx !== "number" || Number.isNaN(idx)) return null;
				return idx + 1;
			} catch {
				return null;
			}
		};

		const walk = async (items: any[], ancestors: string[]) => {
			for (const it of items) {
				const rawTitle = String(it?.title || "").trim();
				const title = rawTitle || "目录";
				const nextPath = [...ancestors, title];
				const pageNumber = await resolvePageNumber(it);
				if (pageNumber && pageNumber > 0) {
					results.push({ title, pageNumber, path: nextPath });
				}
				const children = it?.items;
				if (Array.isArray(children) && children.length > 0) {
					await walk(children, nextPath);
				}
			}
		};

		await walk(outline, []);
		return results;
	}

	private async createPdfBookmarkTasksFromOutline(): Promise<void> {
		if (
			!this.ensurePremiumFeatureAccess(
				PREMIUM_FEATURES.INCREMENTAL_READING,
				"增量阅读是高级功能，请激活许可证后使用"
			)
		) {
			return;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "pdf") {
			new Notice("请先打开一个 PDF 文件");
			return;
		}

		const picked = await this.pickIRDeck();
		if (!picked) return;

		const outline = await this.getPdfOutlineFromActiveView();
		if (!outline || outline.length === 0) {
			new Notice("未能读取 PDF 目录");
			return;
		}

		const service = await this.ensureIRPdfBookmarkTaskServiceReady();
		const existing = await service.getTasksByDeckIdentifiers(await this.getIRDeckIdentifiers(picked));
		const existingKeys = new Set<string>();
		for (const t of existing) {
			const link = String((t as any)?.link || "").trim();
			const pdfPath = String((t as any)?.pdfPath || "").trim();
			const m = link.match(/\bpage=(\d+)\b/i);
			const pageNumber = m ? Number(m[1]) : 0;
			if (pdfPath && pageNumber > 0) {
				existingKeys.add(`${pdfPath}#${pageNumber}`);
			}
			if (link) {
				existingKeys.add(link);
			}
		}

		let created = 0;
		let skipped = 0;

		for (const item of outline) {
			const pageNumber = Number(item.pageNumber || 0);
			if (!pageNumber || pageNumber <= 0) continue;

			const title =
				Array.isArray(item.path) && item.path.length > 0
					? item.path.join(" / ")
					: String(item.title || "").trim();
			const link = `[[${activeFile.path}#page=${pageNumber}|${title || activeFile.basename}]]`;
			const key = `${activeFile.path}#${pageNumber}`;
			if (existingKeys.has(key) || existingKeys.has(link)) {
				skipped++;
				continue;
			}

			await service.createTask({
				deckId: picked.id,
				pdfPath: activeFile.path,
				title: title || activeFile.basename,
				link,
			});
			existingKeys.add(key);
			existingKeys.add(link);
			created++;
		}

		window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
		new Notice(`已生成 PDF 书签任务：${created} 个（跳过 ${skipped} 个）`);
	}

	private isIRSystemFile(file: TFile): boolean {
		try {
			const cache = this.app.metadataCache.getFileCache(file);
			const fmType = cache?.frontmatter?.weave_type;
			return typeof fmType === "string" && fmType.startsWith("ir-");
		} catch {
			return false;
		}
	}

	private async removeCurrentDocumentFromIR(file: TFile): Promise<void> {
		try {
			if (
				!this.ensurePremiumFeatureAccess(
					PREMIUM_FEATURES.INCREMENTAL_READING,
					"增量阅读是高级功能，请激活许可证后使用"
				)
			) {
				return;
			}

			if (this.isIRSystemFile(file)) {
				new Notice("该文件为增量阅读系统文件，不支持移除");
				return;
			}

			const confirmed = await showObsidianConfirm(
				this.app,
				"确认将当前文档从增量阅读中移除？\n将清理 YAML 增量阅读字段、阅读材料索引、调度记录等插件数据。",
				{ title: "确认移除", confirmText: "移除", confirmClass: "mod-warning" }
			);
			if (!confirmed) return;

			const { createYAMLFrontmatterManager } = await import("./utils/yaml-frontmatter-utils");
			const yamlManager = createYAMLFrontmatterManager(this.app);
			await yamlManager.removeReadingFields(file);

			try {
				const { waitForServiceReady } = await import("./utils/service-ready-event");
				await waitForServiceReady("readingMaterialManager", 15000);
				if (this.readingMaterialManager) {
					const material = await this.readingMaterialManager.getMaterialByFile(file);
					if (material) {
						await this.readingMaterialManager.removeMaterial(material.uuid);
					}
				}
			} catch {}

			try {
				const storage = new IRStorageService(this.app);
				await storage.initialize();
				const chunks = await storage.getAllChunkData();
				const relatedChunkIds = Object.values(chunks)
					.filter((c: any) => (c as any)?.filePath === file.path)
					.map((c: any) => (c as any)?.chunkId)
					.filter(Boolean) as string[];
				for (const chunkId of relatedChunkIds) {
					await storage.deleteChunkData(chunkId);
				}
				await storage.deleteBlocksByFile(file.path);
			} catch {}

			window.dispatchEvent(new CustomEvent("Weave:ir-data-updated"));
			new Notice("已从增量阅读中移除");
		} catch (error) {
			logger.error("[WeaveContextMenu] 移除增量阅读文档失败:", error);
			new Notice("移除增量阅读文档失败");
		}
	}

	private insertWeaveDeckViewCodeBlock(editor: Editor): void {
		try {
			const template = this.buildWeaveDeckViewCodeBlockTemplate();
			const cursor = editor.getCursor();
			const currentLine = editor.getLine(cursor.line);
			const needsLeadingNewline = currentLine.trim().length > 0 && cursor.ch > 0;
			const insertText = `${needsLeadingNewline ? "\n" : ""}${template}`;

			editor.replaceRange(insertText, cursor);

			const insertedStartLine = cursor.line + (needsLeadingNewline ? 1 : 0);
			const deckNamesLine = insertedStartLine + 4;
			editor.setCursor({ line: deckNamesLine, ch: 4 });
			new Notice("已插入牌组视图代码块");
		} catch (error) {
			logger.error("[WeaveContextMenu] 插入牌组视图代码块失败:", error);
			new Notice("插入牌组视图代码块失败");
		}
	}

	private buildWeaveDeckViewCodeBlockTemplate(): string {
		return [
			`\`\`\`${WEAVE_DECKS_CODE_BLOCK_LANGUAGE}`,
			"title: 我的牌组",
			"size: medium",
			"deckNames:",
			"  - 牌组名称1",
			"  - 牌组名称2",
			"sort: due",
			"limit: 6",
			"```",
			"",
		].join("\n");
	}

	private registerImageMaskFeatures(): void {
		logger.debug("[Plugin] 注册图片遮罩功能...");

		// 1. 注册编辑器右键菜单
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				// 检测当前行是否包含图片链接
				if (this.hasImageLink(line)) {
					const weaveSubmenu = getWeaveOperationsSubmenu(menu);
					weaveSubmenu.addItem((item) => {
						item
							.setTitle("Weave 图片遮罩")
							.setIcon("image")
							.onClick(async () => {
								await this.openImageMaskModalFromEditor(editor, cursor.line, view.file?.path || "");
							});
					});
				}
			})
		);

		// 2. 注册命令面板命令
		this.addCommand({
			id: "edit-image-mask",
			name: "编辑图片遮罩",
			icon: "image",
			editorCallback: async (editor, view) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				if (!this.hasImageLink(line)) {
					new Notice("请将光标移动到图片行");
					return;
				}

				await this.openImageMaskModalFromEditor(editor, cursor.line, view.file?.path || "");
			},
		});

		logger.debug("[Plugin] ✅ 图片遮罩功能已注册");
	}

	private registerSelectedTextAICardFeatures(): void {
		try {
			this.selectedTextAICardPanelManager = new SelectedTextAICardPanelManager(this);

			this.addCommand({
				id: "selected-text-ai-card",
				name: "选中文本AI制卡",
				icon: "brain",
				callback: () => {
					try {
						const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
						const editor = mdView?.editor;
						if (!mdView || !editor) {
							new Notice("未找到可用的编辑器视图");
							return;
						}

						this.runSelectedTextAICardCommand(editor, mdView);
					} catch {
						new Notice("打开AI制卡失败");
					}
				},
				editorCallback: (editor, view) => {
					try {
						const mdView =
							view instanceof MarkdownView
								? view
								: this.app.workspace.getActiveViewOfType(MarkdownView);
						this.runSelectedTextAICardCommand(editor, mdView || undefined);
					} catch {
						new Notice("打开AI制卡失败");
					}
				},
			});

			this.registerEvent(
				this.app.workspace.on("editor-menu", (menu, editor, view) => {
					try {
						if (!(view instanceof MarkdownView)) return;

						const selection = editor.getSelection()?.trim() || "";
						if (!selection) return;

						const weaveSubmenu = getWeaveOperationsSubmenu(menu);
						weaveSubmenu.addItem((item) => {
							item.setTitle("选中文本AI制卡");
							item.setIcon("brain");
							const submenu = (item as any).setSubmenu() as Menu;
							const actions = get(customActionsForMenu).split;

							submenu.addItem((subItem) => {
								subItem.setTitle("主动提问...").onClick(() => {
									this.selectedTextAICardPanelManager?.openPanel({
										view,
										editor,
										selectedText: selection,
										actionId: "Weave:proactive-question",
									});
								});
							});

							submenu.addSeparator();

							if (!actions || actions.length === 0) {
								submenu.addItem((subItem) => {
									subItem.setTitle("暂无可用功能").setDisabled(true);
								});
							} else {
								actions.forEach((action) => {
									submenu.addItem((subItem) => {
										subItem.setTitle(action.name).onClick(() => {
											this.selectedTextAICardPanelManager?.openPanel({
												view,
												editor,
												selectedText: selection,
												actionId: action.id,
											});
										});
									});
								});
							}
						});
					} catch {}
				})
			);
		} catch {
			// ignore
		}
	}

	private runSelectedTextAICardCommand(editor: Editor, view?: MarkdownView): void {
		const selection = editor.getSelection()?.trim() || "";
		if (!selection) {
			new Notice("请先选中要制卡的文本");
			return;
		}

		const mdView = view || this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView) {
			new Notice("未找到可用的编辑器视图");
			return;
		}

		this.openSelectedTextAICardActionSelector({
			view: mdView,
			editor,
			selectedText: selection,
		});
	}

	private openSelectedTextAICardActionSelector(params: {
		view: MarkdownView;
		editor: Editor;
		selectedText: string;
	}): void {
		const actions = get(customActionsForMenu).split;
		const items: Array<{ id: string; name: string }> = [
			{
				id: "Weave:proactive-question",
				name: "主动提问...",
			},
		];

		if (actions && actions.length > 0) {
			for (const a of actions) {
				items.push({ id: a.id, name: a.name });
			}
		}

		const modal = new SelectedTextAICardActionSuggestModal(this.app, items, (item) => {
			this.selectedTextAICardPanelManager?.openPanel({
				view: params.view,
				editor: params.editor,
				selectedText: params.selectedText,
				actionId: item.id,
			});
		});
		modal.open();
	}

	/**
	 * 🖼️ 从编辑器打开图片遮罩模态窗
	 */
	private async openImageMaskModalFromEditor(
		editor: import("obsidian").Editor,
		lineNumber: number,
		sourceFilePath: string
	): Promise<void> {
		try {
			// 动态导入遮罩数据解析器
			const { MaskDataParser } = await import("./services/image-mask/MaskDataParser");
			const parser = new MaskDataParser(this.app);

			// 获取图片行内容
			const line = editor.getLine(lineNumber);
			const imageLink = parser.extractImageLink(line);

			if (!imageLink) {
				new Notice("无法识别图片链接");
				return;
			}

			// 解析图片路径
			const imageFile = parser.resolveImagePath(imageLink, sourceFilePath);
			if (!imageFile) {
				new Notice("无法找到图片文件");
				return;
			}

			// 检查是否已有遮罩数据
			const content = editor.getValue();
			const commentLocation = parser.findMaskCommentForImage(content, lineNumber);

			let initialMaskData = null;
			if (commentLocation.found && commentLocation.content) {
				const parseResult = parser.parseCommentToMaskData(commentLocation.content);
				if (parseResult.success) {
					initialMaskData = parseResult.data || null;
				}
			}

			// 打开模态窗
			const { ImageMaskEditorModal } = await import("./modals/ImageMaskEditorModal");

			const modal = new ImageMaskEditorModal(this.app, {
				imageFile,
				initialMaskData,
				onSave: async (maskData) => {
					await this.saveMaskData(editor, lineNumber, maskData, parser);
				},
			});

			modal.open();
		} catch (error) {
			logger.error("[Plugin] 打开图片遮罩模态窗失败:", error);
			new Notice("打开图片遮罩编辑器失败");
		}
	}

	/**
	 * 🖼️ 保存遮罩数据到编辑器
	 * 🔧 修复：删除遮罩后清理注释数据
	 */
	private async saveMaskData(
		editor: import("obsidian").Editor,
		imageLineNumber: number,
		maskData: import("./types/image-mask-types").MaskData,
		parser: import("./services/image-mask/MaskDataParser").MaskDataParser
	): Promise<void> {
		try {
			// 检查是否已存在注释
			const content = editor.getValue();
			const commentLocation = parser.findMaskCommentForImage(content, imageLineNumber);

			// 🔧 修复：如果遮罩为空，删除注释行
			if (maskData.masks.length === 0) {
				if (commentLocation.found && typeof commentLocation.line === "number") {
					// 删除整行（包括换行符）
					const _lineContent = editor.getLine(commentLocation.line);
					editor.replaceRange(
						"",
						{ line: commentLocation.line, ch: 0 },
						{ line: commentLocation.line + 1, ch: 0 } // 包括下一行的开头，删除换行符
					);
					logger.debug("[Plugin] 已删除空遮罩注释");
				} else {
					// 没有注释，什么都不做
					logger.debug("[Plugin] 无遮罩数据，且无需清理");
				}
				return;
			}

			// 生成 HTML 注释
			const comment = parser.maskDataToComment(maskData);

			if (commentLocation.found && typeof commentLocation.line === "number") {
				// 更新现有注释
				const lineContent = editor.getLine(commentLocation.line);
				editor.replaceRange(
					comment,
					{ line: commentLocation.line, ch: 0 },
					{ line: commentLocation.line, ch: lineContent.length }
				);

				logger.debug("[Plugin] 已更新遮罩数据");
			} else {
				// 插入新注释（在图片行下方）
				const _nextLine = imageLineNumber + 1;
				editor.replaceRange(`\n${comment}`, {
					line: imageLineNumber,
					ch: editor.getLine(imageLineNumber).length,
				});

				logger.debug("[Plugin] 已插入遮罩数据");
			}
		} catch (error) {
			logger.error("[Plugin] 保存遮罩数据失败:", error);
			throw error;
		}
	}

	/**
	 * 🖼️ 检测文本行是否包含图片链接
	 */
	private hasImageLink(line: string): boolean {
		try {
			const parser = new MaskDataParser(this.app);
			return parser.hasImageLink(line);
		} catch {
			const wikiPattern = /!\[\[.*?\]\]/;
			const mdPattern = /!\[[^\]]*\]\([^\)]*\)/;
			return wikiPattern.test(line) || mdPattern.test(line);
		}
	}

	/**
	 * 🆕 初始化平板端适配支持
	 */
	private async formatSelectionAsCloze(preferredEditor?: Editor): Promise<void> {
		try {
			logger.debug("📝 [格式化挖空] 命令触发");

			let selectedText = "";
			let editor: Editor | null = preferredEditor ?? null;

			// 1. 优先使用快捷键直接传入的编辑器实例
			if (editor) {
				selectedText = editor.getSelection();
				logger.debug("📝 [格式化挖空] 使用命令传入编辑器:", selectedText ? "成功" : "失败");
			}

			// 2. 再尝试插件编辑器
			if ((!selectedText || selectedText.trim() === "") && !editor) {
				const contextManager = EditorContextManager.getInstance();
				if (contextManager.hasActivePluginEditor()) {
					editor = contextManager.getCompatibleEditor();
					if (editor) {
						selectedText = editor.getSelection();
						logger.debug("📝 [格式化挖空] 使用插件编辑器:", selectedText ? "成功" : "失败");
					}
				}
			}

			// 3. 降级到原生编辑器
			if ((!selectedText || selectedText.trim() === "") && !editor) {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.editor) {
					editor = activeView.editor;
					selectedText = editor.getSelection();
					logger.debug("📝 [格式化挖空] 使用原生编辑器:", selectedText ? "成功" : "失败");
				}
			}

			const normalizedSelection = selectedText.trim();

			if (!normalizedSelection) {
				logger.debug("⚠️ [格式化挖空] 未检测到可写编辑器选区");
				new Notice(i18n.t("commands.formatAsCloze.noSelection"), 3000);
				return;
			}

			if (!editor) {
				logger.warn("⚠️ [格式化挖空] 未找到可写入的编辑器实例");
				new Notice("请先在编辑器内选中文本后再使用快捷键", 3000);
				return;
			}

			const content = editor.getValue();
			const matches = content.matchAll(/\{\{c(\d+)::/g);
			const numbers = Array.from(matches).map((m) => parseInt(m[1], 10));
			const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
			const nextNumber = maxNumber + 1;

			logger.debug(`📝 [格式化挖空] 当前最大序号: c${maxNumber}, 下一个: c${nextNumber}`);

			const formatted = `{{c${nextNumber}::${normalizedSelection}}}`;
			editor.replaceSelection(formatted);

			logger.debug("✅ [格式化挖空] 格式化成功");
			new Notice(i18n.t("commands.formatAsCloze.success") + ` (c${nextNumber})`, 2500);
		} catch (error) {
			logger.error("❌ [格式化挖空] 执行失败:", error);
			new Notice(i18n.t("commands.formatAsCloze.error"), 3000);
		}
	}

	private initializeTabletSupport(): void {
		try {
			// 检测当前设备类型
			const deviceInfo = detectDevice();

			logger.debug("[平板端适配] 设备信息:", deviceInfo);

			// 🔧 关键修复：确保 Obsidian 原生设备类存在于 body 元素
			// CSS 样式依赖 body.is-mobile 和 body.is-phone 类来控制移动端显示
			// Obsidian 应该自动添加这些类，但为了确保兼容性，我们手动检查并添加
			if (document.body) {
				// 添加 Obsidian 原生设备类（如果不存在）
				if (Platform.isMobile && !document.body.classList.contains("is-mobile")) {
					document.body.classList.add("is-mobile");
					logger.info("[移动端适配] 已添加 is-mobile 类到 body");
				}

				// Platform.isPhone 在 Obsidian 1.4.0+ 可用
				const isPhone =
					(Platform as any).isPhone ??
					(Platform.isMobile && !((Platform as any).isTablet ?? false));
				if (isPhone && !document.body.classList.contains("is-phone")) {
					document.body.classList.add("is-phone");
					logger.info("[移动端适配] 已添加 is-phone 类到 body");
				}

				// Platform.isTablet 在 Obsidian 1.4.0+ 可用
				const isTablet = (Platform as any).isTablet ?? false;
				if (isTablet && !document.body.classList.contains("is-tablet")) {
					document.body.classList.add("is-tablet");
					logger.info("[移动端适配] 已添加 is-tablet 类到 body");
				}

				// 添加自定义设备类型类名（用于更细粒度的控制）
				applyDeviceClasses(document.body);
			}

			// 为插件容器添加设备信息
			this.app.workspace.onLayoutReady(() => {
				const pluginContainers = document.querySelectorAll(".weave-app");
				pluginContainers.forEach((_container) => {
					if (_container instanceof HTMLElement) {
						applyDeviceClasses(_container);
					}
				});

				// 为现有界面应用触控优化
				this.applyTouchOptimizations();
			});

			// 在开发环境启用调试工具（不显示浮窗）
			if (process.env.NODE_ENV === "development") {
				tabletDebugger.enable({
					showDebugInfo: false, // 禁用设备信息浮窗
					logDeviceChanges: false, // 禁用设备变化日志
				});
			}

			// 添加全局设备信息到window（供其他组件使用）
			(window as any).weaveDeviceInfo = deviceInfo;

			logger.info("[平板端适配] 初始化完成", {
				device: deviceInfo.isTablet ? "tablet" : deviceInfo.isMobile ? "mobile" : "desktop",
				touch: deviceInfo.isTouch,
				orientation: deviceInfo.orientation,
			});
		} catch (error) {
			logger.error("[平板端适配] 初始化失败:", error);
		}
	}

	/**
	 * 🆕 为现有界面应用触控优化
	 */
	private applyTouchOptimizations(): void {
		try {
			const deviceInfo = detectDevice();

			// 只对触控设备应用优化
			if (!deviceInfo.isTouch) {
				logger.debug("[触控优化] 非触控设备，跳过优化");
				return;
			}

			logger.debug("[触控优化] 开始应用触控优化");

			// 为所有现有按钮添加触控优化类名
			// 🔧 排除装饰性小圆点按钮（彩色圆点用于视图/模式切换，尺寸应保持16px）
			const buttons = document.querySelectorAll(".weave-app button, .weave-app .clickable");
			buttons.forEach((_button) => {
				if (_button instanceof HTMLElement) {
					// 🔧 排除装饰性圆点按钮，这些按钮有自己的触控区域（通过 ::before 伪元素扩展）
					const isDecorativeDot =
						_button.classList.contains("view-type-dot") ||
						_button.classList.contains("sidebar-dot");
					if (isDecorativeDot) {
						return; // 跳过装饰性圆点，保持其原始尺寸
					}

					_button.classList.add("weave-touch-optimized");

					// 确保最小触控尺寸
					const currentHeight = _button.offsetHeight;
					const currentWidth = _button.offsetWidth;

					if (currentHeight < 44 || currentWidth < 44) {
						_button.setCssProps({
							"min-height": "44px",
							"min-width": "44px",
						});
					}
				}
			});

			// 为滚动容器添加触控优化
			const scrollContainers = document.querySelectorAll(
				'.weave-app .scrollable, .weave-app [style*="overflow"]'
			);
			scrollContainers.forEach((_container) => {
				if (_container instanceof HTMLElement) {
					_container.setCssProps({
						"-webkit-overflow-scrolling": "touch",
						"overscroll-behavior": "contain",
					});
				}
			});

			logger.info(
				"[触控优化] 已应用到",
				buttons.length,
				"个按钮和",
				scrollContainers.length,
				"个滚动容器"
			);
		} catch (error) {
			logger.error("[触控优化] 应用失败:", error);
		}
	}
}

class SelectedTextAICardActionSuggestModal extends SuggestModal<{ id: string; name: string }> {
	constructor(
		app: any,
		private items: Array<{ id: string; name: string }>,
		private onSelect: (item: { id: string; name: string }) => void
	) {
		super(app);
		this.setPlaceholder("选择AI制卡功能...");
	}

	getSuggestions(query: string): Array<{ id: string; name: string }> {
		const q = (query || "").trim().toLowerCase();
		if (!q) return this.items;
		return this.items.filter((it) => it.name.toLowerCase().includes(q));
	}

	renderSuggestion(item: { id: string; name: string }, el: HTMLElement): void {
		el.setText(item.name);
	}

	onChooseSuggestion(item: { id: string; name: string }, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}
}

// 默认导出
export default WeavePlugin;

// 类型别名（向后兼容）
export type AnkiPlugin = WeavePlugin;
