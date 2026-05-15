/**
 * 增量阅读服务模块
 *
 * @module services/incremental-reading
 * @version 3.0.0 - 新调度系统
 */

// 存储服务
export { ReadingMaterialStorage, createReadingMaterialStorage } from "./ReadingMaterialStorage";
export { IRStorageService } from "./IRStorageService";
export { IRPointDataReadService, createIRPointDataReadService } from "./IRPointDataReadService";
export { IRScheduleReadService, createIRScheduleReadService } from "./IRScheduleReadService";
export { IRPointReadService, createIRPointReadService } from "./IRPointReadService";
export { IRHostSharedService } from "./IRHostSharedService";
export type {
	IREnsureExternalDocumentChunkScheduledOptions,
	IREpubResumePointOptions,
	IREpubScheduleChapterOptions,
	IRSelectionQuickCreatePreferencesLike,
	IRTopicRef,
} from "./IRHostSharedService";

// v3.0 新调度系统
export {
	IRSchedulerV3,
	calculatePriorityEWMA,
	calculatePriorityMultiplier,
	calculateLoadSignal,
	calculateNextInterval,
	calculateNextReviewDate,
	hasReachedDailyLimit,
	incrementDailyAppearance,
	estimateReadingTime,
	DEFAULT_SCHEDULE_CONFIG_V3,
} from "./IRSchedulerV3";
export type { IRSchedulerV3Config, ReadingCompletionData } from "./IRSchedulerV3";

// v3.0 标签组服务
export { IRTagGroupService } from "./IRTagGroupService";

// v3.0 队列生成器
export {
	IRQueueGenerator,
	calculateAgingBonus,
	calculateItemScore,
	calculateOverdueDays,
} from "./IRQueueGenerator";
export type {
	QueueItem,
	QueueGenerationResult,
	PostponeResult,
} from "./IRQueueGenerator";

// v3.0 统一调度服务外观
export {
	IRSchedulingFacade,
	createIRSchedulingFacade,
} from "./IRSchedulingFacade";
export type {
	IRSchedulingFacadeConfig,
	StudyQueueResult,
	CompleteBlockResult,
} from "./IRSchedulingFacade";

// v3.0 监控统计服务
export {
	IRMonitoringService,
	createIRMonitoringService,
} from "./IRMonitoringService";
export type {
	DailyStats,
	IRDecisionEventRecord,
	IRDecisionOutcomeRecord,
	PriorityChangeRecord,
	GroupParamChangeRecord,
	TagGroupSummary,
	IRMonitoringData,
} from "./IRMonitoringService";

// v5.7 标注信号服务
export {
	IRAnnotationSignalService,
	getAnnotationSignalService,
	createAnnotationSignalService,
	calculateAnnotationSignal,
	calculateAdjustedPriority,
	syncAnnotationSignalFromSettings,
	CALLOUT_TYPE_ALIASES,
	DEFAULT_CALLOUT_WEIGHTS,
	DEFAULT_ENABLED_TYPES,
	DEFAULT_ANNOTATION_SIGNAL_CONFIG,
} from "./IRAnnotationSignalService";
export type {
	AnnotationSignalConfig,
	AnnotationSignalResult,
	ParsedCallout,
} from "./IRAnnotationSignalService";

export {
	IRSessionCardStatsService,
	getSessionCardStatsService,
	createSessionCardStatsService,
	destroySessionCardStatsService,
} from "./IRSessionCardStatsService";

export type {
	BlockCardStats,
	SessionCardStatsStore,
} from "./IRSessionCardStatsService";

// 锚点管理
export { AnchorManager, createAnchorManager } from "./AnchorManager";
export type { AnchorParseResult, AnchorInsertResult } from "./AnchorManager";

// 材料管理
export { ReadingMaterialManager, createReadingMaterialManager } from "./ReadingMaterialManager";
export type { CreateMaterialOptions, CategoryChangeResult } from "./ReadingMaterialManager";

// 会话管理
export { ReadingSessionManager, createReadingSessionManager } from "./ReadingSessionManager";
export type { StartSessionOptions, EndSessionOptions } from "./ReadingSessionManager";

// 摘录卡片服务
export { ExtractCardService, createExtractCardService } from "./ExtractCardService";
export type { ExtractCardOptions, ExtractCardResult, DeckHierarchy } from "./ExtractCardService";

// 段落解析器
export { ParagraphParser } from "./ParagraphParser";
export type { Paragraph } from "./ParagraphParser";

// 行号到 DOM 映射器
export { LineDOMMapperImpl, createLineDOMMapper } from "./LineDOMMapper";
export type { LineDOMMapper } from "./LineDOMMapper";

// 内容变化观察器
export { ContentObserverImpl, createContentObserver } from "./ContentObserver";
export type { ContentObserver } from "./ContentObserver";

// EPUB 书签 IR 任务服务
export { IREpubBookmarkTaskService, isEpubBookmarkTaskId } from "./IREpubBookmarkTaskService";
export type { IREpubBookmarkTask } from "./IREpubBookmarkTaskService";

export {
	IRScheduleKernel,
	createIRScheduleKernel,
} from "./IRScheduleKernel";
export type {
	ScheduleRecomputeReason,
	IRScheduleChangeSet,
	RecomputeOptions,
	IRScheduleExplanation,
	IRPlannedScheduleItem,
	IRPlannedDay,
	IRPlannedSchedule,
	IRScheduleImpactPreview,
} from "./IRScheduleKernel";
export type { IRCognitiveProfile } from "./IRCognitiveProfileService";
export {
	IRCognitiveProfileService,
	createIRCognitiveProfileService,
} from "./IRCognitiveProfileService";
export {
	IRPlanGeneratorService,
	createIRPlanGeneratorService,
} from "./IRPlanGeneratorService";
export {
	IR_DATA_UPDATED_EVENT,
	broadcastIRDataUpdated,
	recomputeAndBroadcastIRData,
} from "./IRScheduleRefreshService";
export {
	IRCalendarQueryService,
	getSharedIRCalendarQueryService,
} from "./IRCalendarQueryService";
export type {
	IRCalendarQueryOptions,
	IRCalendarQueryScope,
	IRCalendarQueryResult,
} from "./IRCalendarQueryService";
export {
	buildScheduleItemFromChunkData,
	buildScheduleItemFromEpubTask,
	buildScheduleItemFromLegacyBlock,
	buildScheduleItemFromPdfTask,
	buildScheduleItemFromProjectedItem,
} from "./IRCalendarScheduleItem";
export type {
	ScheduleItem,
	ScheduleItemSourceType,
} from "./IRCalendarScheduleItem";

// 类型重导出
export type {
	ReadingMaterial,
	ReadingSession,
	ReadingProgress,
	AnchorRecord,
	ReadingYAMLFields,
	ReadingMaterialsIndex,
	AnchorsCache,
	CalendarDayData,
	MonthlyStats,
	ReadingEvent,
	DeckHierarchyExtension,
} from "../../types/incremental-reading-types";

export {
	ReadingCategory,
	ReadingEventType,
	DEFAULT_READING_MATERIAL,
	ANCHOR_PREFIX,
	ANCHOR_REGEX,
	YAML_FIELD_PREFIX,
} from "../../types/incremental-reading-types";
