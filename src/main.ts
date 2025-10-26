import { Plugin, Notice, Editor, MarkdownView, MarkdownFileInfo, TFile } from "obsidian";
import { AnkiView, VIEW_TYPE_ANKI } from "./views/AnkiView";
import { StudyView, VIEW_TYPE_STUDY } from "./views/StudyView";
import { FilterView, VIEW_TYPE_FILTER } from "./views/FilterView"; // 🆕 全局筛选视图
import { AnkiDataStorage } from "./data/storage";
import { FSRS } from "./algorithms/fsrs";
import { AnalyticsService } from "./data/analytics";
import { AnkiSettingsTab } from "./components/settings/SettingsTab";
import { licenseManager } from "./utils/licenseManager";
import { initMediaDebug } from "./utils/mediaDebugHelper";
import { createSafeNotice, safeOpenSettings } from "./utils/obsidian-api-safe";
import { TempFileManager } from "./services/temp-file-manager";
// import { DragDropCardCreator } from "./services/DragDropCardCreator"; // 已移除拖拽创建卡片功能
import { CardEditorModal } from "./modals/CardEditorModal";
import type { CreateCardOptions } from "./types/modal-types";
import { openCreateCardModal as openCreateCardModalStore } from "./stores/card-modal-store";

// 新架构组件 - 热重载测试
import { initializeServiceRegistry, setPluginReference } from "./architecture/service-registry";
import { startPerformanceMonitoring } from "./architecture/performance-monitor";
import { dispatchSystem, dispatchUI } from "./architecture/unified-state-management";
import { handleError, createErrorContext } from "./architecture/unified-error-handler";
import { ArchitectureHealthChecker } from "./architecture/layered-architecture";

import { TuankiAnnotationSystem } from './services/TuankiAnnotationSystem';
import { DEFAULT_SIMPLIFIED_PARSING_SETTINGS } from './types/newCardParsingTypes';
import { GlobalDataCache } from './services/GlobalDataCache';
import { BatchParsingFileWatcher } from './services/BatchParsingFileWatcher';
import { SimplifiedCardParser } from './utils/simplifiedParser/SimplifiedCardParser';
import { FileScanner } from './utils/fileScanner';
import type { BatchParseConfig, ParsedCard } from './types/newCardParsingTypes';
import { ParsedCardConverter } from './services/converter/ParsedCardConverter';
import { BatchCardSaver } from './services/batch/BatchCardSaver';

// 🆕 新批量解析系统
import { BatchParsingManager } from './services/batch-parsing';
import { UUIDStorageImpl } from './services/storage/UUIDStorageImpl';
// ❌ 已移除 CardSaverImpl - 现在使用插件的统一保存流程
import { DeckStorageAdapter } from './services/storage/DeckStorageAdapter';

// 🆕 v0.8: 统一标识符系统
import { generateUUID, generateBlockId } from './utils/helpers';

// 新增服务导入
import { ContentParserService } from './services/content/ContentParserService';
import { DeckHierarchyService } from './services/deck/DeckHierarchyService';
import { MediaManagementService } from './services/media/MediaManagementService';
import { IndexManagerService } from './services/index/IndexManagerService';
import { DataMigrationService } from './services/migration/DataMigrationService';
import { FilterStateService } from './services/FilterStateService'; // 🆕 全局筛选状态服务
import { DataSyncService } from './services/DataSyncService'; // 🆕 全局数据同步服务

// 高级功能守卫
import { PremiumFeatureGuard } from './services/premium/PremiumFeatureGuard';

// 快捷键服务
import { ShortcutService } from './services/ShortcutService';

// 学习会话管理
import { StudySessionManager } from './services/StudySessionManager';

// 🆕 学习模式类型
import type { StudyMode } from './types/study-types';


import "virtual:uno.css";
import "./styles/fonts.css";
import "./styles/global.css";
import "./styles/design-tokens.css";
import "./styles/modern-components.css";
import "./styles/modal-components.css";
import "./styles/card-animations.css";
import "./styles/card-base.css";
import "./styles/inline-card-editor.css";
import "./styles/drag-drop-indicator.css";
import "./styles/study-interface.css";
import "./styles/image-mask.css";

// 开发模式下导入测试和清理缓存
if (process.env.NODE_ENV === 'development') {
  // 🔥 内测阶段：清理所有可能的旧格式缓存
  console.log('🧹 内测阶段：清理旧格式缓存...');

  // 清理 localStorage 中的模板相关缓存
  const keysToRemove = Object.keys(localStorage).filter(key =>
    key.includes('template') ||
    key.includes('triad') ||
    key.includes('field') ||
    key.includes('markdown') ||
    key.includes('tuanki')
  );

  keysToRemove.forEach(key => {
    console.log(`🗑️ 清理缓存: ${key}`);
    localStorage.removeItem(key);
  });

  // 清理 sessionStorage
  const sessionKeysToRemove = Object.keys(sessionStorage).filter(key =>
    key.includes('template') ||
    key.includes('triad') ||
    key.includes('field') ||
    key.includes('markdown') ||
    key.includes('tuanki')
  );

  sessionKeysToRemove.forEach(key => {
    console.log(`🗑️ 清理会话缓存: ${key}`);
    sessionStorage.removeItem(key);
  });

  console.log('✅ 缓存清理完成，确保使用最新格式');
}
// 已移除未使用的types导入
import type {
  FieldTemplate,
} from "./data/template-types";
// import { setPlugin as setCmPlugin } from "./utils/codemirrorExtensions";

interface AnkiPluginSettings {
    // 基础配置 - 样式修复测试 v6 ✅ [验证CSS变量映射和UnoCSS配置]
    // 热重载测试注释 - 测试时间: 2025-08-23 03:01 ✅ 热重载正常工作！
    defaultDeck: string;
    reviewsPerDay: number;
    newCardsPerDay: number;        // 🆕 每日新卡片限额（默认20）
    enableNotifications: boolean;
    theme: "dark" | "light" | "auto";

    // 学习行为
    autoShowAnswerSeconds: number; // 0 表示手动
    learningSteps: number[];       // 分钟
    graduatingInterval: number;    // 天

    // 界面与交互
    enableShortcuts: boolean;
    showFloatingCreateButton: boolean;
    dataBackupIntervalHours: number; // ⚠️ 已废弃，保留用于迁移
    autoBackup?: boolean; // ⚠️ 已废弃，保留用于迁移
    
    // 🆕 自动备份配置
    autoBackupConfig?: import('./types/data-management-types').AutoBackupConfig;

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
        aiAssistant?: boolean;
        statistics?: boolean;
    };

    // 导航栏设置按钮显示控制
    showSettingsButton?: boolean;

    // 编辑器模态窗尺寸设置
    editorModalSize?: {
        preset: 'small' | 'medium' | 'large' | 'extra-large' | 'custom';
        customWidth?: number;  // 像素值
        customHeight?: number; // 像素值
        rememberLastSize?: boolean; // 是否记住上次调整的尺寸
        enableResize?: boolean; // 是否启用拖拽调整
    };



    // 激活码相关
    license: {
        activationCode: string;
        isActivated: boolean;
        activatedAt: string;
        deviceFingerprint: string;
        expiresAt: string; // 对于买断制，可以设置为很远的未来日期
        productVersion: string;
        licenseType: 'lifetime' | 'subscription';
    };

    // FSRS 参数
    fsrsParams: {
        w: number[];
        requestRetention: number;
        maximumInterval: number;
        enableFuzz: boolean;
    };

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

    // 卡片编辑模式：统一使用Markdown沉浸式编辑
    // editorMode 已移除，统一使用 markdown 模式


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
        enabled: boolean;                           // 是否启用自动播放
        mode: 'first' | 'all';                     // 播放模式：仅第一个/全部
        timing: 'cardChange' | 'showAnswer';       // 播放时机：切换卡片/显示答案
        playbackInterval: number;                  // 播放间隔（毫秒）
    };

    // 调试
    enableDebugMode?: boolean;

    // 新版简化解析设置
    simplifiedParsing?: import('./types/newCardParsingTypes').SimplifiedParsingSettings;


    // 修复工具设置
    repairTool?: {
        repairScope?: 'current-file' | 'open-files' | 'all-files';
        repairMissingBlockIds?: boolean;
        repairMissingUUIDs?: boolean;
        repairMissingTimestamps?: boolean;
        repairMalformedCallouts?: boolean;
        createBackupBeforeRepair?: boolean;
        confirmBeforeBatchRepair?: boolean;
        blockIdGenerationStrategy?: 'random' | 'sequential' | 'content-based';
        timestampStrategy?: 'current' | 'file-modified' | 'preserve-existing';
    };

    // AnkiConnect 同步设置
    ankiConnect?: import('./components/settings/types/settings-types').AnkiConnectSettings;

    // ✅ Phase 3: APKG 导入配置（字段显示面配置持久化）
    // 暂时注释，等待实现
    // apkgImportConfig?: import('./importers/apkg-config-manager').APKGImportConfiguration;

    // AI配置
    aiConfig?: {
        // API密钥配置（加密存储）
        apiKeys: {
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
            anthropic?: {
                apiKey: string;
                model: string;
                verified: boolean;
                lastVerified?: string;
            };
            deepseek?: {
                apiKey: string;
                model: string;
                verified: boolean;
                lastVerified?: string;
            };
            zhipu?: {
                apiKey: string;
                model: string;
                verified: boolean;
                lastVerified?: string;
            };
            siliconflow?: {
                apiKey: string;
                model: string;
                verified: boolean;
                lastVerified?: string;
            };
        };
        
        // 默认AI服务
        defaultProvider: 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'zhipu' | 'siliconflow';
        
        // AI格式化默认提供商（独立设置，允许与defaultProvider不同）
        formattingProvider?: 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'zhipu' | 'siliconflow';
        
        // AI拆分默认提供商（独立设置，允许与defaultProvider不同）
        splittingProvider?: 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'zhipu' | 'siliconflow';
        
        // AI格式化开关
        formatting: {
            enabled: boolean;
        };
        
        // 全局AI参数
        globalParams: {
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
        };
        
        // 提示词模板
        promptTemplates: {
            official: Array<{
                id: string;
                name: string;
                prompt: string;
                variables: string[];
                createdAt: string;
            }>;
            custom: Array<{
                id: string;
                name: string;
                prompt: string;
                variables: string[];
                createdAt: string;
                updatedAt: string;
            }>;
        };
        
        // 图片生成基础配置
        imageGeneration: {
            defaultSyntax: 'wiki' | 'markdown';
            attachmentDir: string;
            autoCreateSubfolders: boolean;
            includeTimestamp: boolean;
            includeCaption: boolean;
        };
        
        // 历史记录设置
        history: {
            enabled: boolean;
            retentionDays: number;
            showCostStats: boolean;
            autoCleanFailures: boolean;
        };
        
        // 统计数据
        statistics?: {
            totalGenerations: number;
            totalCards: number;
            successfulImports: number;
            totalCost: number;
            monthlyCost: number;
            lastReset?: string;
        };
        
        // 安全设置
        security: {
            encryptApiKeys: boolean;
            enableContentFilter: boolean;
            anonymousStats: boolean;
        };
        
        // 快捷键配置
        shortcuts?: {
            [provider: string]: {
                key: string;
                modifiers: string[];
            };
        };
        
        // AI生成默认配置
        generationDefaults?: {
            templateId: string;
            promptTemplate: string;
            templates: {
                qa: string;
                choice: string;
                cloze: string;
            };
            cardCount: number;
            difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
            typeDistribution: {
                qa: number;
                cloze: number;
                choice: number;
            };
            provider: 'openai' | 'gemini' | 'anthropic' | 'deepseek' | 'zhipu';
            model: string;
            temperature: number;
            maxTokens: number;
            imageGeneration: {
                enabled: boolean;
                strategy: 'none' | 'ai-generate' | 'search';
                imagesPerCard: number;
                placement: 'question' | 'answer' | 'both';
            };
            autoTags: string[];
            enableHints: boolean;
        };
        
        // 🆕 自定义格式化功能列表
        customFormatActions?: import('./types/ai-types').CustomFormatAction[];
        
        // 🆕 官方预设格式化功能开关
        officialFormatActions?: {
            choice: { enabled: boolean };          // 选择题格式化
            mathFormula: { enabled: boolean };     // 数学公式转换
            memoryAid: { enabled: boolean };       // AI助记
        };
    };

}

const DEFAULT_SETTINGS: AnkiPluginSettings = {
    defaultDeck: "默认牌组",
    reviewsPerDay: 20,
    newCardsPerDay: 20,        // 🆕 默认每天20张新卡片（参考Anki）
    enableNotifications: true,
    theme: "auto",

    autoShowAnswerSeconds: 0,
    learningSteps: [1, 10],
    graduatingInterval: 1,

    enableShortcuts: true,
    showFloatingCreateButton: true,
    dataBackupIntervalHours: 24, // ⚠️ 已废弃，保留用于迁移

    // 🆕 自动备份配置
    autoBackupConfig: {
        enabled: true,
        intervalHours: 24,
        triggers: {
            onStartup: true,
            onCardThreshold: true,
            cardThresholdCount: 100
        },
        notifications: {
            onSuccess: true,
            onFailure: true
        },
        lastAutoBackupTime: undefined,
        autoBackupCount: 0
    },

    multipleChoiceStats: {
        totalQuestions: 0,
        correctAnswers: 0,
        totalAttempts: 0,
        lastUpdated: new Date().toISOString()
    },

    navigationVisibility: {
        deckStudy: true,
        cardManagement: true,
        aiAssistant: true,
        statistics: true,
    },

    showSettingsButton: true,

    // 🎯 FSRS6个性化优化设置
    enablePersonalization: true, // 默认启用
    personalizationSettings: {
        enabled: true,
        minDataPoints: 50,
        enableBacktracking: true,
        checkpointInterval: 50,
        performanceThreshold: 0.1,
        autoOptimization: true
    },

    // 编辑器模态窗尺寸默认设置
    editorModalSize: {
        preset: 'large',
        customWidth: 800,
        customHeight: 600,
        rememberLastSize: true,
        enableResize: true
    },



    license: {
        activationCode: "",
        isActivated: false,
        activatedAt: "",
        deviceFingerprint: "",
        expiresAt: "",
        productVersion: "",
        licenseType: 'lifetime'
    },

    fsrsParams: {
        // FSRS6 官方默认参数 (21个权重参数)
        w: [
            0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
            0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
            0.5425, 0.0912, 0.0658, 0.1542
        ],
        requestRetention: 0.9,
        maximumInterval: 365, // 默认1年，用户可在设置中调整至5年
        enableFuzz: true
    },


    // 新版简化解析设置
    simplifiedParsing: DEFAULT_SIMPLIFIED_PARSING_SETTINGS,

    // 🔥 数据迁移标记
    migrationCompleted: false,

    editor: {
        linkStyle: "wikilink",
        linkPath: "short",
        preferAlias: true,
        attachmentDir: "Tuanki Assets",
        embedImages: true,
    },

    // 统一使用Markdown沉浸式编辑模式
    // editorMode 已移除，不再需要配置


    cardManager: {
        visibleFields: {
            table: { front: true, back: true, status: true, due: true, difficulty: true, priority: true, tags: true, deck: true, backlink: true, actions: true },
            grid: { tags: true, priority: true, deck: true, backlink: true },
        },
        sort: {
            primary: { field: "due", order: "asc" },
            secondary: null,
        },
        defaultFilters: { tag: "", status: "" }
    },

    clozeSettings: {
        enabled: true,
        openDelimiter: "==",
        closeDelimiter: "==",
        placeholder: "[...]"
    },

  // 媒体自动播放默认设置
  mediaAutoPlay: {
    enabled: false,                // 默认关闭，用户按需启用
    mode: 'first',                 // 默认只播放第一个媒体文件
    timing: 'cardChange',          // 默认在切换卡片时播放
    playbackInterval: 2000         // 默认播放间隔2秒（毫秒）
  },

    enableDebugMode: false,


    // 修复工具默认设置
    repairTool: {
        repairScope: 'current-file',
        repairMissingBlockIds: true,
        repairMissingUUIDs: true,
        repairMissingTimestamps: true,
        repairMalformedCallouts: true,
        createBackupBeforeRepair: false,
        confirmBeforeBatchRepair: true,
        blockIdGenerationStrategy: 'random',
        timestampStrategy: 'current',
    },

    // AnkiConnect 同步设置默认配置
    ankiConnect: {
        enabled: false,
        endpoint: 'http://localhost:8765',
        bidirectionalSync: {
            enabled: false,
            exclusiveTemplatesOnly: true,
            conflictResolution: 'timestamp_priority',
            autoMergeNonConflictFields: true,
            autoMergeTags: true
        },
        mediaSync: {
            enabled: true,
            largeFileThresholdMB: 10,
            supportedTypes: ['png', 'jpg', 'jpeg', 'gif', 'mp3', 'mp4'],
            createBacklinks: true
        },
        autoSync: {
            enabled: false,
            intervalMinutes: 30,
            syncOnStartup: false,
            onlyWhenAnkiRunning: true,
            prioritizeRecent: true
        },
        deckMappings: {},
        templateMappings: {},
        syncLogs: [],
        maxLogEntries: 100,
        // syncMetadata 已移除，改为使用独立的 importMappings.json
        tutorialCompleted: false,
        tutorialStep: 0
    },

};

export class TuankiPlugin extends Plugin {
	settings!: AnkiPluginSettings;
	dataStorage!: AnkiDataStorage;
  fsrs!: FSRS;
  analyticsService!: AnalyticsService;
  wasmUrl!: string;
  tempFileManager!: TempFileManager;
  annotationSystem!: TuankiAnnotationSystem;
  // dragDropCreator!: DragDropCardCreator; // 已移除拖拽创建卡片功能
  
  // 新增服务
  contentParser!: ContentParserService;
  deckHierarchy!: DeckHierarchyService;
  mediaManager!: MediaManagementService;
  indexManager!: IndexManagerService;
  shortcutService!: ShortcutService;
  filterStateService!: FilterStateService; // 🆕 全局筛选状态服务
  dataSyncService!: DataSyncService; // 🆕 全局数据同步服务
  
  // 🆕 批量解析文件监听器（旧系统，将被替换）
  private batchParsingWatcher?: BatchParsingFileWatcher;
  
  // 🆕 批量解析卡片转换器和保存器
  private cardConverter?: ParsedCardConverter;
  private batchCardSaver?: BatchCardSaver;
  
  // 🎯 新批量解析系统
  public batchParsingManager?: BatchParsingManager;
  private simplifiedCardParser?: SimplifiedCardParser;
  
  // 全局模态窗容器
  private globalModalContainer: HTMLElement | null = null;
  private globalModalInstance: any = null;
  
  // ✅ 新建卡片模态窗单例控制
  private currentCreateCardModal: {
    instance: any;
    container: HTMLElement;
  } | null = null;
  
  // 🆕 AnkiConnect 服务（插件级别持久化）
  public ankiConnectService: import('./services/ankiconnect/AnkiConnectService').AnkiConnectService | null = null;
  
  // 🆕 自动备份调度器
  private autoBackupScheduler: import('./services/backup/AutoBackupScheduler').AutoBackupScheduler | null = null;




	async loadSettings() {
		const loadedData = await this.loadData();

		// 深度合并设置，确保嵌套对象正确合并
		this.settings = this.deepMerge(DEFAULT_SETTINGS, loadedData);

		// 🔧 FSRS6参数迁移逻辑
		await this.migrateFSRSParameters();

		// 调试日志
		if (this.settings.enableDebugMode) {
			console.log('🔧 Tuanki 设置加载完成:', {
				hasLicenseData: !!loadedData?.license,
				isActivated: this.settings.license?.isActivated,
				activationCode: this.settings.license?.activationCode ?
					`${this.settings.license.activationCode.substring(0, 20)}...` : 'none',
				fsrsParamsCount: this.settings.fsrsParams?.w?.length || 0
			});
		}
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
				// 如果没有权重参数，使用默认值
				this.settings.fsrsParams = {
					...this.settings.fsrsParams,
					w: [...DEFAULT_SETTINGS.fsrsParams.w]
				};
				console.log('🔧 FSRS6参数迁移：初始化默认权重参数');
				await this.saveSettings();
				return;
			}

			// 检查参数数量
			let needsMigration = false;
			let migrationReason = '';

			if (currentWeights.length !== expectedCount) {
				needsMigration = true;
				migrationReason = `参数数量不匹配 (当前: ${currentWeights.length}, 期望: ${expectedCount})`;
			} else {
				// 检查参数范围（使用简化的范围检查）
				const invalidParams = currentWeights.some((weight, index) => {
					if (typeof weight !== 'number' || isNaN(weight)) {
						return true;
					}
					// 特别检查w7参数（难度衰减）必须在[0, 0.5]范围内
					if (index === 7 && (weight < 0 || weight > 0.5)) {
						console.warn(`🔧 检测到w7参数超出范围: ${weight} (应在[0, 0.5]范围内)`);
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
					migrationReason = '检测到无效的参数值（超出合理范围）';
				}
			}

			if (needsMigration) {
				console.log(`🔧 FSRS6参数迁移：${migrationReason}`);

				// 备份原始参数
				const backupParams = [...currentWeights];

				// 使用标准FSRS6参数
				this.settings.fsrsParams.w = [...DEFAULT_SETTINGS.fsrsParams.w];

				// 验证其他FSRS参数
				if (typeof this.settings.fsrsParams.requestRetention !== 'number' ||
					this.settings.fsrsParams.requestRetention < 0.5 ||
					this.settings.fsrsParams.requestRetention > 0.99) {
					this.settings.fsrsParams.requestRetention = DEFAULT_SETTINGS.fsrsParams.requestRetention;
					console.log('🔧 修复了无效的目标记忆率参数');
				}

				if (typeof this.settings.fsrsParams.maximumInterval !== 'number' ||
					this.settings.fsrsParams.maximumInterval < 1 ||
					this.settings.fsrsParams.maximumInterval > 1825) { // 上限5年，参考Anki社区实践
					this.settings.fsrsParams.maximumInterval = DEFAULT_SETTINGS.fsrsParams.maximumInterval;
					console.log('🔧 修复了无效的最大间隔参数（已限制在1-1825天范围内）');
				}

				// 保存迁移后的设置
				await this.saveSettings();

				console.log('🔧 FSRS6参数迁移：已更新为标准参数');
				console.log('🔧 原始参数已备份:', backupParams);

				// 显示用户通知
				if (this.settings.enableNotifications) {
					setTimeout(() => {
						new Notice(`FSRS6参数已自动修复（${migrationReason}）`, 5000);
					}, 2000);
				}
			}
		} catch (error) {
			console.error('🔧 FSRS6参数迁移失败:', error);
			// 如果迁移失败，强制使用默认参数
			this.settings.fsrsParams = {
				...DEFAULT_SETTINGS.fsrsParams
			};
			await this.saveSettings();
			console.log('🔧 已强制重置为默认FSRS6参数');
		}
	}

	/**
	 * 深度合并对象，确保嵌套对象正确合并
	 */
	private deepMerge(target: any, source: any): any {
		const result = { ...target };

		for (const key in source) {
			if (source.hasOwnProperty(key)) {
				if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
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

	async saveSettings() {
		// 调试日志
		if (this.settings.enableDebugMode) {
			console.log('💾 Tuanki 保存设置:', {
				isActivated: this.settings.license?.isActivated,
				activationCode: this.settings.license?.activationCode ?
					`${this.settings.license.activationCode.substring(0, 20)}...` : 'none',
				timestamp: new Date().toISOString()
			});
		}

		await this.saveData(this.settings);
		
		// 更新高级功能守卫的许可证状态
		const premiumGuard = PremiumFeatureGuard.getInstance();
		await premiumGuard.updateLicense(this.settings.license);
		
		// 🆕 重新初始化批量解析监听器（如果设置变更）
		if (this.batchParsingWatcher) {
			this.batchParsingWatcher.destroy();
		}
		await this.initBatchParsingWatcher();

		// 验证保存是否成功（仅在调试模式下）
		if (this.settings.enableDebugMode && this.settings.license?.isActivated) {
			setTimeout(async () => {
				const reloadedData = await this.loadData();
				if (!reloadedData?.license?.isActivated) {
					console.error('❌ 许可证保存失败，数据未持久化');
				} else {
					console.log('✅ 许可证保存验证成功');
				}
			}, 100);
		}
	}

	/**
	 * 获取默认模板ID - 新系统不使用此功能
	 */
	getDefaultTemplateId(): string {
		console.log('✅ 新的简化解析系统不使用默认模板ID');
		return '';
	}

	/**
	 * 🆕 分类系统数据迁移
	 * 将旧的 category 字段迁移到新的 categoryIds 数组
	 */
	async migrateDeckCategories(): Promise<void> {
		try {
			const { getCategoryStorage } = await import('./data/CategoryStorage');
			const categoryStorage = getCategoryStorage();
			await categoryStorage.initialize();
			const categories = await categoryStorage.getCategories();
			
			if (categories.length === 0) {
				console.log('[CategoryMigration] 无可用分类，跳过迁移');
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
						c => c.name === deck.category || c.id === deck.category
					);
					
					if (matchedCategory) {
						deck.categoryIds = [matchedCategory.id];
						await this.dataStorage.saveDeck(deck);
						migratedCount++;
						console.log(`[CategoryMigration] 迁移牌组 "${deck.name}": ${deck.category} → ${matchedCategory.name}`);
					} else {
						// 未匹配到分类，分配到第一个默认分类
						deck.categoryIds = [categories[0].id];
						await this.dataStorage.saveDeck(deck);
						migratedCount++;
						console.log(`[CategoryMigration] 牌组 "${deck.name}" 未匹配到分类，分配到默认分类: ${categories[0].name}`);
					}
				} else {
					// 无旧分类，分配到第一个默认分类
					deck.categoryIds = [categories[0].id];
					await this.dataStorage.saveDeck(deck);
					migratedCount++;
					console.log(`[CategoryMigration] 牌组 "${deck.name}" 无分类，分配到默认分类: ${categories[0].name}`);
				}
			}
			
			if (migratedCount > 0) {
				console.log(`✅ 分类系统迁移完成: ${migratedCount}/${decks.length} 个牌组已更新`);
			} else {
				console.log('✅ 分类系统迁移完成: 所有牌组已是最新格式');
			}
		} catch (error) {
			console.error('[CategoryMigration] 迁移失败:', error);
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
					console.warn('许可证验证失败:', result.error);
					// 重置许可证状态
					this.settings.license.isActivated = false;
					await this.saveSettings();

					// 显示许可证失效通知
					this.showLicenseExpiredNotice(result.error || '许可证验证失败');
				} else if (result.warnings?.includes('设备指纹已自动更新到新版本')) {
					// 🔧 设备指纹迁移后自动保存
					console.log('✅ 设备指纹已迁移，保存更新后的许可证信息');
					await this.saveSettings();
				}
			}
		} catch (error) {
			console.error('许可证验证过程中发生错误:', error);
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
		const button = document.createElement('button');
		button.textContent = '前往设置';
		button.style.marginLeft = '8px';
		button.onclick = () => {
			// 使用安全的设置打开方法
			safeOpenSettings(this.app, 'tuanki');

			// 使用安全的 Notice 隐藏方法
			notice.hide();
		};

		fragment.appendChild(text);
		fragment.appendChild(button);

		// 安全地添加到 Notice 元素
		try {
			const noticeEl = (notice as any).notice?.noticeEl;
			if (noticeEl) {
				noticeEl.empty();
				noticeEl.appendChild(fragment);
			}
		} catch (error) {
			console.warn('添加按钮到 Notice 失败:', error);
		}
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
			remainingDays
		};
	}

	/**
	 * 初始化 AnkiConnect 服务（插件级别）
	 */
	async initializeAnkiConnect(): Promise<void> {
		try {
			if (this.settings.ankiConnect?.enabled) {
				const { AnkiConnectService } = await import('./services/ankiconnect/AnkiConnectService');
				this.ankiConnectService = new AnkiConnectService(
					this,
					this.app,
					this.settings.ankiConnect
				);
				
				// 启动连接监控
				this.ankiConnectService.startConnectionMonitoring();
				console.log('✅ AnkiConnect 连接监控已启动');
				
				// 启动自动同步（如果配置启用）
				if (this.settings.ankiConnect.autoSync?.enabled) {
					this.ankiConnectService.startAutoSync();
					console.log('✅ AnkiConnect 自动同步已启动');
				}
			}
		} catch (error) {
			console.error('❌ AnkiConnect 服务初始化失败:', error);
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
				console.log('✅ AnkiConnect 服务已停止');
			} catch (error) {
				console.error('❌ 停止 AnkiConnect 服务失败:', error);
			}
			this.ankiConnectService = null;
		}
	}
	
	/**
	 * 初始化自动备份调度器
	 */
	async initializeAutoBackup(): Promise<void> {
		try {
			// 迁移旧配置到新格式
			await this.migrateBackupConfig();
			
			const { AutoBackupScheduler } = await import('./services/backup/AutoBackupScheduler');
			
			this.autoBackupScheduler = new AutoBackupScheduler(
				this,
				() => this.settings.autoBackupConfig!,
				async (updates) => {
					this.settings.autoBackupConfig = {
						...this.settings.autoBackupConfig!,
						...updates
					};
					await this.saveSettings();
				}
			);
			
			// 启动调度器
			this.autoBackupScheduler.start();
			console.log('⏰ 自动备份调度器已启动');
			
			// 执行启动备份（如果启用）
			await this.autoBackupScheduler.checkAndCreateStartupBackup();
		} catch (error) {
			console.error('❌ 自动备份调度器初始化失败:', error);
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
				console.log('⏰ 自动备份调度器已停止');
			} catch (error) {
				console.error('❌ 停止自动备份调度器失败:', error);
			}
			this.autoBackupScheduler = null;
		}
	}
	
	/**
	 * 迁移旧备份配置到新格式
	 */
	private async migrateBackupConfig(): Promise<void> {
		// 如果已有新配置，跳过迁移
		if (this.settings.autoBackupConfig) {
			return;
		}
		
		// 从旧配置迁移
		const oldInterval = this.settings.dataBackupIntervalHours || 24;
		const oldAutoBackup = this.settings.autoBackup !== false; // 默认启用
		
		this.settings.autoBackupConfig = {
			enabled: oldAutoBackup,
			intervalHours: oldInterval,
			triggers: {
				onStartup: true,
				onCardThreshold: true,
				cardThresholdCount: 100
			},
			notifications: {
				onSuccess: true,
				onFailure: true
			},
			autoBackupCount: 0
		};
		
		await this.saveSettings();
		console.log('⏰ 已迁移旧备份配置到新格式');
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
		
		console.log('✅ AnkiConnect 端点已更新:', endpoint);
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
		
		console.log(`✅ AnkiConnect ${enabled ? '已启用' : '已禁用'}`);
	}

	/**
	 * 🆕 初始化批量解析文件监听器
	 */
	private async initBatchParsingWatcher(): Promise<void> {
		if (!this.settings.simplifiedParsing) {
			console.warn('[Plugin] simplifiedParsing 配置未初始化');
			return;
		}

		const batchSettings = this.settings.simplifiedParsing.batchParsing;

		if (!batchSettings.autoTrigger) {
			console.log('[Plugin] 批量解析自动触发已禁用');
			return;
		}

		try {
			// 初始化转换器和保存器
			if (!this.cardConverter) {
				this.cardConverter = new ParsedCardConverter(this.app, this.fsrs);
				console.log('[Plugin] ✅ 卡片转换器已初始化');
			}
			
			if (!this.batchCardSaver) {
				this.batchCardSaver = new BatchCardSaver(
					this.dataStorage,
					GlobalDataCache.getInstance()
				);
				console.log('[Plugin] ✅ 批量卡片保存器已初始化');
			}
			
			const parser = new SimplifiedCardParser(
				this.settings.simplifiedParsing,
				this.app
			);
			this.simplifiedCardParser = parser;

			// 🎯 初始化新批量解析系统
			try {
				// 创建存储实现
				const uuidStorage = new UUIDStorageImpl();
				// ❌ 已移除 CardSaverImpl - 现在使用插件的统一保存流程
				const deckStorage = new DeckStorageAdapter(this);

				// 创建批量解析管理器
			this.batchParsingManager = new BatchParsingManager(
				this.app,
				this.settings.simplifiedParsing,
				parser,
				deckStorage,
				uuidStorage,
				this  // ✅ 传入插件实例，用于调用统一保存流程
			);

			// 注册命令
			this.batchParsingManager.registerCommands(this);

			console.log('[Plugin] ✅ 新批量解析系统已初始化（使用统一保存流程）');
			} catch (error) {
				console.error('[Plugin] ❌ 新批量解析系统初始化失败:', error);
			}

			// 旧批量解析系统（保留兼容）
			this.batchParsingWatcher = new BatchParsingFileWatcher(
				this,
				parser,
				{
					debounceDelay: batchSettings.triggerDebounce,
					onlyActiveFile: batchSettings.onlyActiveFile,
					autoTrigger: batchSettings.autoTrigger,
					includeFolders: batchSettings.includeFolders,
					excludeFolders: batchSettings.excludeFolders
				}
			);

			await this.batchParsingWatcher.initialize();
			console.log('[Plugin] ✅ 批量解析监听器已初始化');
		} catch (error) {
			console.error('[Plugin] ❌ 批量解析监听器初始化失败:', error);
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
				const response = await this.dataStorage.getDeck(deckId);
				if (response.success && response.data) {
					return deckId;
				}
			}
			
			// 2. 获取第一个牌组
			const decksResponse = await this.dataStorage.getDecks();
			if (decksResponse.success && decksResponse.data && decksResponse.data.length > 0) {
				return decksResponse.data[0].id;
			}
			
			// 3. 创建默认牌组
			const createResponse = await this.dataStorage.createDeck({
				name: '批量解析',
				description: '通过批量解析功能创建的卡片'
			});
			
			if (createResponse.success && createResponse.data) {
				console.log('[Plugin] ✅ 已创建默认牌组:', createResponse.data.name);
				return createResponse.data.id;
			}
			
			return null;
		} catch (error) {
			console.error('[Plugin] 获取默认牌组失败:', error);
			return null;
		}
	}
	
	/**
	 * 🆕 将解析后的卡片添加到数据库
	 */
	/**
	 * ✅ 统一的卡片保存流程（批量解析和其他创建方式共用）
	 * 职责：将 ParsedCard[] 转换为 Card[] 并批量保存到数据库
	 * 🔄 重构后：支持从 ParsedCard.metadata 中提取 targetDeckId
	 */
	public async addCardsToDB(parsedCards: ParsedCard[]): Promise<void> {
		if (!this.cardConverter || !this.batchCardSaver) {
			// 如果转换器和保存器未初始化，则进行初始化
			this.cardConverter = new ParsedCardConverter(this.app, this.fsrs);
			this.batchCardSaver = new BatchCardSaver(
				this.dataStorage,
				GlobalDataCache.getInstance()
			);
			console.log('[Plugin] ✅ 动态初始化卡片转换器和保存器');
		}
		
		try {
			// 1. 获取默认牌组ID（作为备用）
			const defaultDeckId = await this.getDefaultDeckId();
			if (!defaultDeckId) {
				new Notice('❌ 无法获取或创建默认牌组');
				return;
			}
			
			// 2. 逐张转换 ParsedCard 到 Card（支持每张卡片的独立 deckId）
			const convertedCards: any[] = [];
			
			for (const parsedCard of parsedCards) {
				// ✅ 优先使用 metadata 中的 targetDeckId，否则使用默认牌组
				const deckId = parsedCard.metadata?.targetDeckId || defaultDeckId;
				
				const conversionOptions = {
					deckId: deckId,
					preserveSourceInfo: true,
					priority: this.settings.simplifiedParsing?.batchParsing?.defaultPriority ?? 0,
					suspended: false
				};
				
				const conversionResult = this.cardConverter.convertToCard(
					parsedCard,
					conversionOptions
				);
				
				if (conversionResult.success && conversionResult.card) {
					convertedCards.push(conversionResult.card);
				} else {
					console.error('[Plugin] 卡片转换失败:', conversionResult.errors);
				}
			}
			
			if (convertedCards.length === 0) {
				new Notice('❌ 没有可保存的卡片');
				return;
			}
			
			console.log(`[Plugin] ✅ 成功转换 ${convertedCards.length} 张卡片`);
			
			// 3. 批量保存到数据库
			const saveResult = await this.batchCardSaver.saveBatchWithNotice(
				convertedCards,
				{ continueOnError: true }
			);
			
			// 4. 输出结果
			console.log('[Plugin] 批量保存完成:', {
				成功: saveResult.successCount,
				失败: saveResult.failureCount,
				总计: parsedCards.length,
				耗时: saveResult.duration ? `${saveResult.duration}ms` : '未知'
			});
			
			if (saveResult.failureCount > 0) {
				console.error('[Plugin] 保存失败的卡片:', saveResult.errors);
			}
			
		} catch (error) {
			console.error('[Plugin] 添加卡片到数据库失败:', error);
			new Notice(`❌ 保存卡片失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	}
	
	/**
	 * 🆕 注册批量解析命令
	 */
	private registerBatchParsingCommands(): void {
		// 命令1: 批量解析当前文件
		this.addCommand({
			id: 'batch-parse-current-file',
			name: '批量解析当前文件',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || activeFile.extension !== 'md') {
					return false;
				}

				if (!checking) {
					this.batchParseCurrentFile(activeFile);
				}
				return true;
			}
		});

		// 命令2: 批量解析所有文件（按扫描范围）
		this.addCommand({
			id: 'batch-parse-all-files',
			name: '批量解析所有文件（按扫描范围）',
			callback: async () => {
				await this.batchParseAllFiles();
			}
		});

		console.log('[Plugin] ✅ 批量解析命令已注册');
	}

	/**
	 * 🆕 批量解析当前文件
	 */
	private async batchParseCurrentFile(file: TFile): Promise<void> {
		if (!this.settings.simplifiedParsing) {
			new Notice('❌ 批量解析配置未初始化');
			return;
		}

		const parser = new SimplifiedCardParser(
			this.settings.simplifiedParsing,
			this.app
		);

		try {
			const content = await this.app.vault.read(file);

			// 检测是否包含批量解析范围
			const { rangeStart, rangeEnd } = this.settings.simplifiedParsing.symbols;
			if (!content.includes(rangeStart) || !content.includes(rangeEnd)) {
				new Notice('❌ 当前文件不包含批量解析范围');
				return;
			}

			const config: BatchParseConfig = {
				settings: this.settings.simplifiedParsing,
				scenario: 'batch',
				sourceFile: file.path,
				sourceFileName: file.name,
				sourceContent: content
			};

			const cards = await parser.parseBatchCards(content, config);

			if (cards.length === 0) {
				new Notice('⚠️ 未找到可解析的卡片');
				return;
			}

			// 将卡片添加到数据库
			await this.addCardsToDB(cards);
			
			console.log('[Plugin] 批量解析完成:', cards);

		} catch (error) {
			console.error('[Plugin] 批量解析失败:', error);
			new Notice(`❌ 批量解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * 🆕 批量解析所有文件（按扫描范围）
	 */
	private async batchParseAllFiles(): Promise<void> {
		if (!this.settings.simplifiedParsing) {
			new Notice('❌ 批量解析配置未初始化');
			return;
		}

		const batchSettings = this.settings.simplifiedParsing.batchParsing;
		const scanner = new FileScanner(this);

		try {
			// 扫描文件
			const scanResult = await scanner.scanMarkdownFiles({
				includePatterns: batchSettings.includeFolders.length > 0
					? batchSettings.includeFolders.map(f => `${f}/**/*.md`)
					: undefined,
				excludePatterns: batchSettings.excludeFolders.map(f => `${f}/**/*`),
				maxFiles: batchSettings.maxFilesPerBatch
			});

			if (scanResult.files.length === 0) {
				new Notice('⚠️ 扫描范围内没有文件');
				return;
			}

			// 显示确认信息
			const confirmed = confirm(
				`即将批量解析 ${scanResult.files.length} 个文件，是否继续？\n\n` +
				`注意：这可能需要一些时间，请耐心等待。`
			);

			if (!confirmed) {
				new Notice('❌ 已取消批量解析');
				return;
			}

			// 批量处理
			new Notice(`🔄 开始批量处理 ${scanResult.files.length} 个文件...`);

			let totalCards = 0;
			let processedFiles = 0;

			for (const fileInfo of scanResult.files) {
				try {
					const cards = await this.batchParseFile(fileInfo.file);
					totalCards += cards.length;
					if (cards.length > 0) {
						processedFiles++;
					}
				} catch (error) {
					console.error(`[Plugin] 处理文件失败: ${fileInfo.path}`, error);
				}
			}

			new Notice(
				`✅ 批量解析完成: ${totalCards} 张卡片，来自 ${processedFiles}/${scanResult.files.length} 个文件`
			);

		} catch (error) {
			console.error('[Plugin] 批量解析所有文件失败:', error);
			new Notice(`❌ 批量解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
		}
	}

	/**
	 * 🆕 批量解析单个文件（内部辅助方法）
	 */
	private async batchParseFile(file: TFile): Promise<ParsedCard[]> {
		const content = await this.app.vault.read(file);

		// 检测是否包含批量解析范围
		const { rangeStart, rangeEnd } = this.settings.simplifiedParsing!.symbols;
		if (!content.includes(rangeStart) || !content.includes(rangeEnd)) {
			return [];
		}

		const parser = new SimplifiedCardParser(
			this.settings.simplifiedParsing!,
			this.app
		);

		const config: BatchParseConfig = {
			settings: this.settings.simplifiedParsing!,
			scenario: 'batch',
			sourceFile: file.path,
			sourceFileName: file.name,
			sourceContent: content
		};

		const cards = await parser.parseBatchCards(content, config);

		if (cards.length > 0) {
			// 将卡片添加到数据库
			await this.addCardsToDB(cards);
		}

		return cards;
	}

	async onload() {
		try {
			// 🔥 热重载开发环境已启动 - 代码变更将自动构建
			console.log('🚀 Tuanki plugin loading with Hot Reload - Test 2!');
			await this.loadSettings();
			// setCmPlugin(this);

			// 🏗️ 初始化新架构系统
			console.log('🏗️ 初始化架构系统...');

			// 1. 设置插件引用供服务注册使用
			setPluginReference(this);

			// 2. 初始化服务注册表
			initializeServiceRegistry();

			// 3. 启动性能监控（开发环境默认禁用，避免内存泄漏误报）
			startPerformanceMonitoring();

			// 4. 更新系统状态
			dispatchSystem('SET_ONLINE_STATUS', navigator.onLine);
			dispatchUI('SET_CURRENT_PAGE', 'loading');

			console.log('✅ 架构系统初始化完成');

			// 验证许可证数据加载
			if (this.settings.enableDebugMode) {
				console.log('🚀 Tuanki 插件启动:', {
					isActivated: this.settings.license?.isActivated,
					hasActivationCode: !!this.settings.license?.activationCode,
					activatedAt: this.settings.license?.activatedAt
				});
			}

			// 验证许可证
			await this.validateLicense();
			
			// 🔒 初始化高级功能守卫
			console.log('🔒 初始化高级功能守卫...');
			const premiumGuard = PremiumFeatureGuard.getInstance();
			await premiumGuard.initialize(this.settings.license);
			console.log('✅ 高级功能守卫初始化完成');
			
		// 监听激活提示事件
		window.addEventListener('tuanki:open-activation', () => {
			// 打开设置页面并导航到关于标签
			this.activateView(VIEW_TYPE_ANKI);
			setTimeout(() => {
				window.dispatchEvent(new CustomEvent('tuanki:navigate', { 
					detail: { page: 'settings', tab: 'about' } 
				}));
			}, 100);
		});

		// Initialize data storage and algorithms
		this.dataStorage = new AnkiDataStorage(this);
		await this.dataStorage.initialize();

		// 🆕 初始化新服务
		console.log('🚀 Initializing new services...');
		
		// 1. 内容解析服务
		this.contentParser = new ContentParserService();
		// 注入模板服务（如果有）
		if ((this as any).templateService) {
			this.contentParser.setTemplateService((this as any).templateService);
		}
		
		// 2. 牌组层级服务
		this.deckHierarchy = new DeckHierarchyService(this.dataStorage);
		
		// 3. 媒体管理服务
		this.mediaManager = new MediaManagementService(this, this.dataStorage);
		await this.mediaManager.initialize();
		
		// 4. 索引管理服务
		this.indexManager = new IndexManagerService(this);
		await this.indexManager.initialize();
		
		// 🆕 5. 全局筛选状态服务
		this.filterStateService = new FilterStateService(this);
		console.log('[Tuanki] FilterStateService initialized');
		
		// 🆕 6. 全局数据同步服务
		this.dataSyncService = new DataSyncService();
		console.log('[Tuanki] DataSyncService initialized');
		
		// 7. 执行数据迁移
		const migrationService = new DataMigrationService(this, this.dataStorage, this.contentParser);
		const migrationReport = await migrationService.getMigrationReport();
		
		if (migrationReport.needsMigration) {
			console.log(`🔄 Data migration needed: ${migrationReport.cardsNeedingUpdate} cards, ${migrationReport.decksNeedingUpdate} decks`);
			const migrationResult = await migrationService.migrate();
			
			if (migrationResult.success) {
				console.log(`✅ Migration successful: ${migrationResult.cardsUpdated} cards, ${migrationResult.decksUpdated} decks updated`);
				if (migrationResult.warnings.length > 0) {
					console.warn('Migration warnings:', migrationResult.warnings);
				}
			} else {
				console.error('Migration errors:', migrationResult.errors);
			}
		} else {
			console.log('✅ No migration needed');
		}
		
		// 🆕 分类系统数据迁移
		console.log('🎨 执行分类系统数据迁移...');
		await this.migrateDeckCategories();
		
		console.log('✅ New services initialized');

		// 🔍 执行架构健康检查
		try {
			const healthChecker = new ArchitectureHealthChecker();
			const healthReport = await healthChecker.performHealthCheck();

			if (this.settings.enableDebugMode) {
				console.log('🔍 架构健康检查:', healthReport);
			}

			if (healthReport.status === 'critical') {
				console.error('❌ 架构存在严重问题:', healthReport.issues);
				await handleError(
					'架构健康检查发现严重问题',
					createErrorContext('AnkiPlugin', 'onload', { healthReport })
				);
			} else if (healthReport.status === 'warning') {
				console.warn('⚠️ 架构存在警告:', healthReport.issues);
			} else {
				console.log('✅ 架构健康状态良好');
			}
		} catch (error) {
			console.error('架构健康检查失败:', error);
		}


		// Global error & rejection tracing (helps diagnose modal freeze)
		try {
			window.addEventListener('error', (e) => {
				if ((this.settings as any)?.enableDebugMode) {
					console.error('[TUANKI][GLOBAL_ERROR]', e.message, (e as any)?.error?.stack || e);
				}
			});
			window.addEventListener('unhandledrejection', (e: any) => {
				if ((this.settings as any)?.enableDebugMode) {
					console.error('[TUANKI][UNHANDLED_REJECTION]', e?.reason?.message || e?.reason, e?.reason?.stack || e);
				}
			});
		} catch {}
		
		// 初始化 FSRS：使用 settings.fsrsParams
		this.fsrs = new FSRS({
				requestRetention: this.settings.fsrsParams.requestRetention,
				maximumInterval: this.settings.fsrsParams.maximumInterval,
				enableFuzz: this.settings.fsrsParams.enableFuzz,
				w: this.settings.fsrsParams.w,
		});



		// 初始化临时文件管理器
		this.tempFileManager = new TempFileManager(this);
		
		// 初始化快捷键服务并注册所有快捷键
		console.log('⌨️ 初始化快捷键服务...');
		this.shortcutService = new ShortcutService(this);
		this.shortcutService.registerAllShortcuts();
		console.log('✅ 快捷键服务初始化完成');

		// 🚫 已移除：拖拽创建卡片服务
		// this.dragDropCreator = new DragDropCardCreator(this);
		// this.dragDropCreator.enable();
		// console.log('✅ 拖拽创建卡片功能已启用 (Ctrl+拖拽)');

		// ✅ 初始化标注系统
		this.annotationSystem = TuankiAnnotationSystem.getInstance();
		
		// 动态导入模板存储
		const { templateStore } = await import('./stores/TemplateStore');
		
		await this.annotationSystem.initialize({
		  plugin: this,
		  vault: this.app.vault,
		  workspace: this.app.workspace,
		  metadataCache: this.app.metadataCache,
		  dataStorage: this.dataStorage,
		  deckService: this.dataStorage,
		  templateService: templateStore,
		  fsrs: this.fsrs,
		  config: {
		    autoDetectionEnabled: this.settings?.annotation?.autoDetectionEnabled ?? true,
		    autoCreateDecks: this.settings?.annotation?.autoCreateDecks ?? true,
		    defaultDeckId: this.settings?.annotation?.defaultDeckId ?? undefined,
		    defaultTemplateId: this.settings?.annotation?.defaultTemplateId ?? 'official-qa',
		    debounceDelay: this.settings?.annotation?.debounceDelay ?? 400,
		    maxConcurrentTasks: this.settings?.annotation?.maxConcurrentTasks ?? 2,
		    debugMode: this.settings?.debugMode ?? false,
		    onlyActiveFileAutoSync: this.settings?.annotation?.onlyActiveFileAutoSync ?? true
		  }
		});
		console.log('✅ 标注系统已启用');

		// 🆕 初始化 UUID 注册表
		console.log('🔧 正在初始化 UUID 注册表...');
		const { UUIDRegistry } = await import('./services/UUIDRegistry');
		const uuidRegistry = UUIDRegistry.getInstance();
		uuidRegistry.injectDataStorage(this.dataStorage);
		console.log('✅ UUID 注册表已初始化');

		// 🆕 初始化双向同步引擎
		if (this.settings?.annotation?.bidirectionalSyncEnabled !== false) {
		  console.log('🔧 正在初始化双向同步引擎...');
		  const { BidirectionalSyncEngine } = await import('./services/BidirectionalSyncEngine');
		  const syncEngine = BidirectionalSyncEngine.getInstance();
		  
		  syncEngine.initialize(
		    this.app.vault,
		    this.dataStorage,
		    {
		      debounceDelay: this.settings?.annotation?.debounceDelay || 3000
		    }
		  );
		  
		  console.log('✅ 双向同步引擎已初始化');
		} else {
		  console.log('ℹ️ 双向同步功能已禁用');
		}

		// 初始化分析服务
		this.analyticsService = new AnalyticsService(this.dataStorage);

		// ✅ 性能优化：预加载全局数据缓存（牌组和模板）
		console.log('[Tuanki] 开始预加载全局数据缓存...');
		const cacheStartTime = Date.now();
		try {
			await GlobalDataCache.getInstance().preload(this);
			const cacheDuration = Date.now() - cacheStartTime;
			console.log(`[Tuanki] ✅ 全局数据缓存预加载完成: ${cacheDuration}ms`);
		} catch (error) {
			console.error('[Tuanki] ❌ 全局数据缓存预加载失败（不影响插件启动）:', error);
		}

		// 🆕 初始化批量解析文件监听器
		await this.initBatchParsingWatcher();

    this.wasmUrl = this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/sql-wasm.wasm`);

	// Register views with data access
	this.registerView(VIEW_TYPE_ANKI, (leaf) => new AnkiView(leaf, this));
	this.registerView(VIEW_TYPE_STUDY, (leaf) => new StudyView(leaf, this));
	this.registerView(VIEW_TYPE_FILTER, (leaf) => new FilterView(leaf, this)); // 🆕 注册筛选视图

	this.addRibbonIcon("brain", "Open Weave", () => {
		this.activateView(VIEW_TYPE_ANKI);
	});
	
	// 🆕 添加筛选器Ribbon图标
	this.addRibbonIcon("filter", "打开Tuanki筛选器", () => {
		this.activateFilterView();
	});

		// Add commands
		this.addCommand({
			id: "open-anki-view",
			name: "Open Weave",
			callback: () => {
				this.activateView(VIEW_TYPE_ANKI);
			}
		});

	this.addCommand({
		id: "start-study-session",
		name: "Start Study Session",
		callback: () => {
			this.activateView(VIEW_TYPE_ANKI);
			// TODO: Auto-navigate to study session
		}
	});

	// 学习会话命令（标签页模式）
	this.addCommand({
		id: "open-study-view",
		name: "Open Study Session",
		callback: async () => {
			await this.openStudySession();
		}
	});

		this.addCommand({
			id: "open-analytics-dashboard",
			name: "Open Analytics Dashboard",
			callback: () => {
				this.activateView(VIEW_TYPE_ANKI);
				try {
					// Broadcast navigation to statistics page in the embedded app
					(window as any).dispatchEvent(new CustomEvent("tuanki:navigate", { detail: { page: "statistics" } }));
				} catch {}
			}
		});

		this.addCommand({
			id: "open-tuanki-card-management",
			name: "Open Card Management",
			callback: () => {
				this.activateView(VIEW_TYPE_ANKI);
				try {
					// Broadcast navigation to card management page in the embedded app
					(window as any).dispatchEvent(new CustomEvent("tuanki:navigate", { detail: { page: "tuanki-card-management" } }));
				} catch {}
			}
		});




		this.addCommand({
			id: "quick-add-card",
			name: "Quick Add Card",
			callback: async () => {
				// 使用统一的 openCreateCardModal 方法
				await this.openCreateCardModal();
			}
		});

		// 🆕 从选中文本创建卡片（快捷键）
		this.addCommand({
			id: "create-card-from-selection",
			name: "Create Card from Selection",
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				try {
					console.log('📝 [快捷键创建卡片] 命令触发');
					
					// 步骤1：获取选中文本
					let selectedText = editor.getSelection();
					
					// 步骤2：智能处理空文本
					if (!selectedText || selectedText.trim() === '') {
						console.log('⚠️ [快捷键创建卡片] 未选中文本，尝试获取当前行');
						
						// 尝试获取当前行
						const cursor = editor.getCursor();
						const line = editor.getLine(cursor.line);
						
						if (line && line.trim()) {
							// 当前行有内容 - 直接使用
							selectedText = line.trim();
							
							// 自动选中该行（视觉反馈）
							editor.setSelection(
								{ line: cursor.line, ch: 0 },
								{ line: cursor.line, ch: line.length }
							);
							
							new Notice('ℹ️ 使用当前行内容创建卡片', 2000);
						} else {
							// 当前行无内容 - 友好提示
							new Notice('ℹ️ 请先选中要创建卡片的文本内容', 3000);
							return;
						}
					}
					
					// 步骤3：获取文件信息
					const activeFile = ctx.file;
					let sourceFile: string | undefined;
					let sourceFileName: string | undefined;
					
					if (activeFile) {
						sourceFile = activeFile.path;
						sourceFileName = activeFile.basename;
						console.log('✅ [快捷键创建卡片] 源文件:', sourceFile);
					} else {
						// 无文件信息 - 友好提示但继续
						console.warn('⚠️ [快捷键创建卡片] 无文件信息，创建无溯源卡片');
						new Notice('ℹ️ 创建卡片（无源文档信息）', 2000);
					}
					
					// 步骤4：创建块链接
					let blockLinkInfo;
					
					if (sourceFile) {
						try {
							const { BlockLinkManager } = await import('./utils/block-link-manager');
							const blockLinkManager = new BlockLinkManager(this.app);
							
							const blockLinkResult = await blockLinkManager.createBlockLinkForSelection(
								selectedText,
								sourceFile
							);
							
							if (blockLinkResult.success && blockLinkResult.blockLinkInfo) {
								blockLinkInfo = blockLinkResult.blockLinkInfo;
								console.log('✅ [快捷键创建卡片] 块链接创建成功:', blockLinkInfo.blockLink);
							} else {
								// 块链接创建失败 - 使用降级策略
								console.warn('⚠️ [快捷键创建卡片] 块链接创建失败，使用文档级溯源');
								new Notice('⚠️ 无法创建精确块链接，已保存文档级来源', 2000);
							}
						} catch (error) {
							console.error('❌ [快捷键创建卡片] 块链接创建异常:', error);
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
						cardMetadata.sourceBlock = blockLinkInfo.blockId;
					} else if (sourceFile) {
						// L2溯源：文档级
						cardMetadata.sourceFile = sourceFile;
					}
					// L3：无溯源信息（cardMetadata保持为空对象）
					
					// ✅ 步骤7：打开创建卡片模态窗（传递标准content和元数据）
					console.log('📝 [快捷键创建卡片] 打开创建卡片模态窗');
					
					await this.openCreateCardModal({
						initialContent: content,  // ✅ 传递标准格式的content
						cardMetadata,             // ✅ 传递溯源元数据
						onSuccess: (card: any) => {
							console.log('✅ [快捷键创建卡片] 卡片创建成功:', card.id);
							new Notice('✅ 卡片创建成功', 2000);
						},
						onCancel: () => {
							console.log('ℹ️ [快捷键创建卡片] 用户取消创建');
						}
					});
					
				} catch (error) {
					console.error('❌ [快捷键创建卡片] 执行失败:', error);
					new Notice('❌ 创建卡片失败，请重试', 3000);
				}
			}
		});


		this.addCommand({
			id: "create-subdeck",
			name: "Create Subdeck",
			callback: async () => {
				// 创建子牌组的UI逻辑
				// 后续在UI更新phase实现
				new Notice('Subdeck creation will be available in the deck management UI');
			}
		});

		// 🆕 批量解析命令
		this.registerBatchParsingCommands();

		// 🖼️ 图片遮罩功能
		this.registerImageMaskFeatures();

		// Add settings tab
		this.addSettingTab(new AnkiSettingsTab(this.app, this));


		// 初始化媒体调试助手（开发模式）
		if (process.env.NODE_ENV === 'development') {
			initMediaDebug(this);
		}

		// 创建全局悬浮按钮（如果启用）
		if (this.settings.showFloatingCreateButton) {
			this.createGlobalFloatingButton();
		}


		// 🎯 架构初始化完成，更新状态
		dispatchUI('SET_CURRENT_PAGE', 'deck-study');
		dispatchUI('SET_LOADING', false);

		// 显示启动完成通知（仅在启用通知时显示）
		if (this.settings.enableNotifications) {
			// 延迟显示，确保界面已完全加载
			setTimeout(() => {
				import('./utils/notifications').then(({ showNotification }) => {
					showNotification('Tuanki 插件已成功加载 - 架构重构完成', 'success');
				}).catch(() => {
					// 如果通知模块加载失败，使用 Obsidian 原生通知
					new Notice('Tuanki 插件已成功加载 - 架构重构完成', 2000);
				});
			}, 1000);
		}

		// ✅ 新建卡片模态窗使用动态创建模式
		// 通过 openCreateCardModal() 直接挂载到 document.body

		console.log('🎉 Tuanki 插件完全初始化完成 - 新架构已启用');
		
		// 🆕 初始化 AnkiConnect 服务（如果启用）
		await this.initializeAnkiConnect();
		
		// 🆕 初始化自动备份调度器
		await this.initializeAutoBackup();

		} catch (error) {
			// 统一错误处理
			console.error('❌ 插件初始化失败:', error);
			await handleError(error instanceof Error ? error : new Error(String(error)), createErrorContext('AnkiPlugin', 'onload'));

			// 显示用户友好的错误消息
			new Notice('Tuanki 插件初始化失败，请查看控制台了解详情', 5000);
		}
	}

	onunload() {
		// 🆕 清理全局数据同步服务
		if (this.dataSyncService) {
			this.dataSyncService.destroy();
			console.log('[Tuanki] DataSyncService destroyed');
		}
		
		// 🆕 清理 AnkiConnect 服务
		this.cleanupAnkiConnect();
		
		// 🆕 清理自动备份调度器
		this.cleanupAutoBackup();
		
		// ✅ 清理全局模态窗容器
		console.log('[Plugin] 开始清理全局模态窗容器...');
		
		if (this.globalModalInstance) {
			try {
				this.globalModalInstance.$destroy();
				console.log('[Plugin] 全局模态窗实例已销毁');
			} catch (error) {
				console.error('[Plugin] 销毁全局模态窗实例失败:', error);
			}
			this.globalModalInstance = null;
		}
		
		if (this.globalModalContainer) {
			try {
				this.globalModalContainer.remove();
				console.log('[Plugin] 全局容器已从 document.body 移除');
			} catch (error) {
				console.error('[Plugin] 移除全局容器失败:', error);
			}
			this.globalModalContainer = null;
		}

		// 清理标注系统
		if (this.annotationSystem) {
			this.annotationSystem.destroy();
		}

		// 🆕 清理批量解析文件监听器
		if (this.batchParsingWatcher) {
			this.batchParsingWatcher.destroy();
			this.batchParsingWatcher = undefined;
		}

		// 🎯 清理新批量解析系统
		if (this.batchParsingManager) {
			this.batchParsingManager.destroy();
			this.batchParsingManager = undefined;
			console.log('[Plugin] ✅ 新批量解析系统已清理');
		}

		// 清理临时文件管理器
		if (this.tempFileManager) {
			this.tempFileManager.destroy();
		}

		// 🚫 已移除：拖拽创建服务
		// if (this.dragDropCreator) {
		// 	this.dragDropCreator.disable();
		// }

		// 清理分析服务
		if (this.analyticsService) {
			this.analyticsService.destroy();
		}

		// 清理全局悬浮按钮
		if (this.floatingButtonInstance) {
			this.floatingButtonInstance.$destroy();
			this.floatingButtonInstance = null;
		}

		// ⚠️ @deprecated 新建卡片模态框现在动态创建和销毁，无需全局实例
		// if (this.createCardModalInstance) {
		// 	this.createCardModalInstance.$destroy();
		// 	this.createCardModalInstance = null;
		// }


	}





	// 全局悬浮按钮实例
	private floatingButtonInstance: any = null;

	/**
	 * 打开新建卡片模态框 - 直接挂载到 document.body（全局显示）
	 * ✅ 重构后架构：预加载数据 → 直接挂载组件
	 * 
	 * @param options 创建卡片选项（兼容字符串参数）
	 */
	async openCreateCardModal(options?: CreateCardOptions | string): Promise<void> {
		try {
			// ✅ 单例检查：如果已有模态窗打开，聚焦现有窗口
			if (this.currentCreateCardModal) {
				console.log('🎯 [openCreateCardModal] 已存在打开的模态窗，聚焦现有窗口');
				// 聚焦现有窗口（将容器滚动到视图）
				this.currentCreateCardModal.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
				// 添加闪烁效果提示用户
				this.currentCreateCardModal.container.style.animation = 'pulse 0.5s ease-in-out';
				setTimeout(() => {
					if (this.currentCreateCardModal) {
						this.currentCreateCardModal.container.style.animation = '';
					}
				}, 500);
				return;
			}
			
			// 兼容旧的字符串参数格式
			const params = typeof options === 'string' 
				? { initialContent: options } 
				: (options || {});

			const {
				initialContent = '',
				parsedCard,
				sourceInfo,
				selectedTemplate,
				contentMapping,
				onSuccess,
				onCancel
			} = params;

			console.log('🎯 [openCreateCardModal] 被调用（直接挂载模式），参数:', {
				hasInitialContent: !!initialContent,
				hasParsedCard: !!parsedCard,
				hasSourceInfo: !!sourceInfo,
				selectedTemplate,
				hasContentMapping: !!contentMapping
			});

			// ✅ 步骤1: 预加载所有必需数据（避免组件内异步加载）
			console.log('🎯 [openCreateCardModal] 预加载数据...');
			
			// 获取牌组数据
			const decks = await this.dataStorage.getAllDecks();
			
			// 获取模板数据（从 templateStore）
			const { templateStore } = await import('./stores/TemplateStore');
			let templates: any[] = [];
			templateStore.state.subscribe(state => {
				templates = state.fieldTemplates || [];
			})();
			
			console.log('🎯 [openCreateCardModal] 数据预加载完成:', { 
				decksCount: decks.length, 
				templatesCount: templates.length 
			});

		// ✅ 步骤2: 创建新卡片对象（遵循卡片数据结构规范 v1.0）
		const { CardType } = await import("./data/types");
		
		// ✅ 确定初始内容（权威数据源）
		const cardContent = initialContent || params.cardMetadata?.content || '';
		
		// ✅ 如果有内容，使用解析器生成fields；否则使用空fields
		let initialFields: Record<string, string> = {};
		if (cardContent && cardContent.trim()) {
			// 使用QACardParser解析初始内容
			const { QACardParser } = await import('./parsers/card-type-parsers/QACardParser');
			const parser = new QACardParser();
			const parseResult = parser.parseMarkdownToFields(cardContent, CardType.Basic);
			if (parseResult.success) {
				initialFields = parseResult.fields || {};
				console.log('🎯 [openCreateCardModal] 初始内容已解析为fields:', initialFields);
			} else {
				// 解析失败，降级策略：整个内容作为front
				initialFields = { front: cardContent, back: '' };
				console.log('🎯 [openCreateCardModal] 解析失败，使用降级策略');
			}
		} else {
			// 无初始内容，提供空白模板
			initialFields = { front: '', back: '' };
			console.log('🎯 [openCreateCardModal] 无初始内容，使用空白模板');
		}
		
		// 🆕 v0.8: 使用统一ID系统生成UUID
		const newCard: import("./data/types").Card = {
			id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // card.id保持原样（内部临时ID）
			uuid: generateUUID(), // 🆕 使用新格式UUID：tk-{12位}
			deckId: params.cardMetadata?.deckId || decks[0]?.id || 'default',
			templateId: 'official-qa', // ✅ 固定使用官方问答模板（模板选择无意义）
			type: CardType.Basic,
			
			// ✅ content是权威数据源
			content: cardContent,
			
			// ✅ fields是派生数据
			fields: initialFields,
			
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
				retrievability: 1
			},
			reviewHistory: [],
			stats: {
				totalReviews: 0,
				totalTime: 0,
				averageTime: 0,
				memoryRate: 0
			},
			created: new Date().toISOString(),
			modified: new Date().toISOString(),
			tags: parsedCard?.tags || []
		};

			// ✅ 步骤3: 创建临时文件管理器
			const tempFileManager = new TempFileManager(this);

			// ✅ 步骤4: 动态导入组件并直接挂载到 document.body
			console.log('🎯 [openCreateCardModal] 动态导入CreateCardModal组件...');
			const { default: CreateCardModal } = await import('./components/modals/CreateCardModal.svelte');

			// ✅ 步骤5: 创建挂载容器（全局显示，在所有标签页上方）
			const container = document.createElement('div');
			container.className = 'tuanki-create-card-modal-container';
			document.body.appendChild(container);

		// ✅ 步骤6: 挂载组件并传入预加载的数据
		console.log('🎯 [openCreateCardModal] 挂载CreateCardModal组件到document.body...');
		const modalInstance = new (CreateCardModal as any)({
			target: container,
			props: {
				open: true,
				card: newCard,
				plugin: this,
				tempFileManager,
				decks,        // ✅ 预加载的牌组数据
				templates,    // ✅ 预加载的模板数据
				onModalClose: () => {
					console.log('🎯 [openCreateCardModal] 模态窗关闭，清理DOM');
					modalInstance.$destroy();
					container.remove();
					// ✅ 清理单例引用
					this.currentCreateCardModal = null;
				},
				onSave: (savedCard: any) => {
					console.log('🎯 [openCreateCardModal] 卡片保存成功');
					onSuccess?.(savedCard);
					modalInstance.$destroy();
					container.remove();
					// ✅ 清理单例引用
					this.currentCreateCardModal = null;
				},
				onCancel: () => {
					console.log('🎯 [openCreateCardModal] 用户取消');
					onCancel?.();
					modalInstance.$destroy();
					container.remove();
					// ✅ 清理单例引用
					this.currentCreateCardModal = null;
				}
			}
		});

		// ✅ 保存当前模态窗引用（单例控制）
		this.currentCreateCardModal = { instance: modalInstance, container };

		console.log('🎯 [openCreateCardModal] ✅ 新建卡片模态窗已成功挂载（全局显示，支持外部操作）');

		} catch (error) {
			console.error('🎯 [openCreateCardModal] 执行失败:', error);
			new Notice('打开新建卡片模态框时发生错误');
		}
	}

	/**
	 * 创建全局悬浮按钮
	 */
	createGlobalFloatingButton() {

		// 如果已有按钮，先销毁
		if (this.floatingButtonInstance) {
			this.floatingButtonInstance.$destroy();
			this.floatingButtonInstance = null;
		}

		// 动态导入悬浮按钮组件
		import('./components/ui/FloatingCreateCardButton.svelte').then(({ default: FloatingCreateCardButton }) => {
			this.floatingButtonInstance = new (FloatingCreateCardButton as any)({
				target: document.body,
				props: {
					plugin: this,
					onCreateCard: () => {
						// 使用插件的新建卡片方法
						this.openCreateCardModal();
					}
				}
			});
		}).catch(error => {
			console.error('加载全局悬浮按钮失败:', error);
		});
	}

	/**
	 * 切换悬浮按钮显示状态
	 */
	toggleFloatingButton(show: boolean) {
		if (show && !this.floatingButtonInstance) {
			this.createGlobalFloatingButton();
		} else if (!show && this.floatingButtonInstance) {
			this.floatingButtonInstance.$destroy();
			this.floatingButtonInstance = null;
		}
	}

	async activateView(viewType: string) {
		this.app.workspace.detachLeavesOfType(viewType);

        // 在主编辑区打开插件视图
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.setViewState({
            type: viewType,
            active: true,
        });

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(viewType)[0],
		);
	}
	
	/**
	 * 🆕 激活筛选视图（在左侧边栏）
	 */
	async activateFilterView() {
		const { workspace } = this.app;
		
		// 检查是否已经打开
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_FILTER)[0];
		
		if (!leaf) {
			// 在左侧边栏创建新leaf
			const leftLeaf = workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({
					type: VIEW_TYPE_FILTER,
					active: true
				});
				leaf = leftLeaf;
			}
		}
		
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * 打开学习会话（标签页模式，支持多种学习模式）
	 * @param options 学习会话选项（支持旧的 deckId 字符串形式）
	 */
	async openStudySession(options?: string | {
		deckId?: string;
		mode?: StudyMode;
		cardIds?: string[];
	}): Promise<void> {
		// 🔄 向后兼容：支持旧的 openStudySession(deckId) 调用方式
		const deckId = typeof options === 'string' ? options : options?.deckId;
		const mode = typeof options === 'object' ? options?.mode : undefined;
		const cardIds = typeof options === 'object' ? options?.cardIds : undefined;
		
		console.log('[Plugin] 打开学习会话', { deckId, mode, cardIds: cardIds?.length });

		try {
			const workspace = this.app.workspace;

			// 检查是否已有活跃的学习会话
			const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_STUDY);
			
			if (existingLeaves.length > 0) {
				// 已有学习会话，激活并更新
				const leaf = existingLeaves[0];
				workspace.revealLeaf(leaf);
				
				// 更新视图状态（传递新的学习模式和卡片列表）
				await leaf.setViewState({
					type: VIEW_TYPE_STUDY,
					state: { deckId, mode, cardIds }
				});
				
				console.log('[Plugin] ✅ 激活已存在的学习会话');
				return;
			}

			// 创建新的学习标签页
			const leaf = workspace.getLeaf('tab');

			await leaf.setViewState({
				type: VIEW_TYPE_STUDY,
				state: { deckId, mode, cardIds }
			});

			// 激活该标签页
			workspace.revealLeaf(leaf);

			console.log('[Plugin] ✅ 学习会话已打开', { deckId, mode, cardIds: cardIds?.length });
		} catch (error) {
			console.error('[Plugin] ❌ 打开学习会话失败:', error);
			new Notice('打开学习会话失败');
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
			let dueCards = allCards.filter(card => card.fsrs.due <= now);
			
			// 如果指定了牌组，只加载该牌组的卡片
			if (deckId) {
				dueCards = dueCards.filter(card => card.deckId === deckId);
			}
			
			// 限制数量
			const limit = this.settings.reviewsPerDay || 20;
			return dueCards.slice(0, limit);
		} catch (error) {
			console.error('[Plugin] 加载学习卡片失败:', error);
			return [];
		}
	}

	/**
	 * 加载持久化的学习会话
	 */
	async loadPersistedStudySession(): Promise<void> {
		try {
			const sessionData = await this.loadData();
			if (sessionData && sessionData.persistedStudySession) {
				const sessionManager = StudySessionManager.getInstance();
				sessionManager.setPersistedSession(sessionData.persistedStudySession);
				console.log('[Plugin] 已加载持久化的学习会话');
			}
		} catch (error) {
			console.error('[Plugin] 加载持久化学习会话失败:', error);
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
				const data = await this.loadData() || {};
				data.persistedStudySession = persistedSession;
				await this.saveData(data);
				console.log('[Plugin] 学习会话已持久化到磁盘');
			}
		} catch (error) {
			console.error('[Plugin] 保存学习会话失败:', error);
		}
	}

	/**
	 * 清除持久化的学习会话
	 */
	async clearPersistedStudySession(): Promise<void> {
		try {
			const data = await this.loadData() || {};
			delete data.persistedStudySession;
			await this.saveData(data);
			
			const sessionManager = StudySessionManager.getInstance();
			sessionManager.clearPersistedSession();
			
			console.log('[Plugin] 已清除持久化的学习会话');
		} catch (error) {
			console.error('[Plugin] 清除学习会话失败:', error);
		}
	}

	/**
	 * 🖼️ 注册图片遮罩功能
	 * - 编辑器右键菜单
	 * - 命令面板命令
	 */
	private registerImageMaskFeatures(): void {
		console.log('[Plugin] 注册图片遮罩功能...');

		// 1. 注册编辑器右键菜单
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);
				
				// 检测当前行是否包含图片链接
				if (this.hasImageLink(line)) {
					menu.addItem((item) => {
						item
							.setTitle('Tuanki 图片遮罩')
							.setIcon('image')
							.onClick(async () => {
								await this.openImageMaskModalFromEditor(editor, cursor.line, view.file?.path || '');
							});
					});
				}
			})
		);

		// 2. 注册命令面板命令
		this.addCommand({
			id: 'edit-image-mask',
			name: '编辑图片遮罩',
			editorCallback: async (editor, view) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);
				
				if (!this.hasImageLink(line)) {
					new Notice('⚠️ 请将光标移动到图片行');
					return;
				}
				
				await this.openImageMaskModalFromEditor(editor, cursor.line, view.file?.path || '');
			}
		});

		console.log('[Plugin] ✅ 图片遮罩功能已注册');
	}

	/**
	 * 🖼️ 从编辑器打开图片遮罩模态窗
	 */
	private async openImageMaskModalFromEditor(
		editor: import('obsidian').Editor,
		lineNumber: number,
		sourceFilePath: string
	): Promise<void> {
		try {
			// 动态导入遮罩数据解析器
			const { MaskDataParser } = await import('./services/image-mask/MaskDataParser');
			const parser = new MaskDataParser(this.app);

			// 获取图片行内容
			const line = editor.getLine(lineNumber);
			const imageLink = parser.extractImageLink(line);
			
			if (!imageLink) {
				new Notice('❌ 无法识别图片链接');
				return;
			}

			// 解析图片路径
			const imageFile = parser.resolveImagePath(imageLink, sourceFilePath);
			if (!imageFile) {
				new Notice('❌ 无法找到图片文件');
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
			const { ImageMaskEditorModal } = await import('./modals/ImageMaskEditorModal');
			
			const modal = new ImageMaskEditorModal(this.app, {
				imageFile,
				initialMaskData,
				onSave: async (maskData) => {
					await this.saveMaskData(editor, lineNumber, maskData, parser);
				}
			});
			
			modal.open();

		} catch (error) {
			console.error('[Plugin] 打开图片遮罩模态窗失败:', error);
			new Notice('❌ 打开图片遮罩编辑器失败');
		}
	}

	/**
	 * 🖼️ 保存遮罩数据到编辑器
	 */
	private async saveMaskData(
		editor: import('obsidian').Editor,
		imageLineNumber: number,
		maskData: import('./types/image-mask-types').MaskData,
		parser: import('./services/image-mask/MaskDataParser').MaskDataParser
	): Promise<void> {
		try {
			// 生成 HTML 注释
			const comment = parser.maskDataToComment(maskData);
			
			// 检查是否已存在注释
			const content = editor.getValue();
			const commentLocation = parser.findMaskCommentForImage(content, imageLineNumber);
			
			if (commentLocation.found && typeof commentLocation.line === 'number') {
				// 更新现有注释
				const lineContent = editor.getLine(commentLocation.line);
				editor.replaceRange(
					comment,
					{ line: commentLocation.line, ch: 0 },
					{ line: commentLocation.line, ch: lineContent.length }
				);
				
				console.log('[Plugin] 已更新遮罩数据');
			} else {
				// 插入新注释（在图片行下方）
				const nextLine = imageLineNumber + 1;
				editor.replaceRange(
					`\n${comment}`,
					{ line: imageLineNumber, ch: editor.getLine(imageLineNumber).length }
				);
				
				console.log('[Plugin] 已插入遮罩数据');
			}

		} catch (error) {
			console.error('[Plugin] 保存遮罩数据失败:', error);
			throw error;
		}
	}

	/**
	 * 🖼️ 检测文本行是否包含图片链接
	 */
	private hasImageLink(line: string): boolean {
		const wikiPattern = /!\[\[.*?\]\]/;
		const mdPattern = /!\[.*?\]\(.*?\)/;
		
		return wikiPattern.test(line) || mdPattern.test(line);
	}


}

// 默认导出
export default TuankiPlugin;

// Hot reload test: 1721283656171
// 构建验证测试 - 2025-08-30
