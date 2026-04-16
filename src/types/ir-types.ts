/**
 * 增量阅读类型定义
 *
 * @module types/ir-types
 * @version 4.0.0 - 权威规范对齐
 *
 * v4.0 变更 (对齐《增量阅读-算法实施权威规范.md》):
 * - 新增 IRBlockStatus 6状态机：new/queued/scheduled/active/suspended/done
 * - 新增 IRBlockStats 统计子对象：effectiveReadingTimeSec、extracts、cardsCreated、notesWritten
 * - 新增 IRBlockMeta 元数据：priorityLog（强制理由）、siblings
 * - 新增 IRBlockV4 完整接口
 * - 新增数据迁移函数 migrateToV4
 *
 * v3.0 变更:
 * - 新增 TagGroup（标签组/材料类型）数据结构
 * - 新增连续优先级轴（priorityUi/priorityEff）
 * - 新增防刷屏机制（dailyAppearances）
 * - 新增调度策略预设（IRScheduleStrategy）
 *
 * 结构说明:
 * - 添加 suspended 状态
 * - 简化优先级为 1|2|3
 * - 添加用户数据字段 (tags, favorite, notes, extractedCards)
 * - IRDeck 添加 blockIds 支持跨文件组织
 * - 添加版本化存储结构
 */

// ============================================
// 内容块状态 (v4.0 权威规范)
// ============================================

/**
 * v4.1 内容块状态枚举（7 状态）
 * - new: 刚导入/刚解析，尚未完成初始化
 * - queued: 已计算 nextRepDate，但尚未到期（nextRepDate > now）
 * - scheduled: 已到期（nextRepDate <= now），进入候选池，等待被选入会话
 * - active: 正在 IR 界面展示（需要防并发、避免重复入队）
 * - suspended: 用户搁置（暂时不参与调度，可恢复）
 * - done: 归档（用户已完全理解，正面完成）
 * - removed: 移除（用户不再需要，从队列永久移除，保留历史）
 */
export type IRBlockStatus =
	| "new"
	| "queued"
	| "scheduled"
	| "active"
	| "suspended"
	| "done"
	| "removed";

/**
 * Compatibility note: v3.0 旧状态枚举，使用 IRBlockStatus 代替
 * - new: 新导入，尚未开始阅读
 * - learning: 首次阅读中，短间隔调度
 * - review: 已读完一轮，进入长间隔调度
 * - suspended: 已暂停/忽略
 */
export type IRBlockState = "new" | "learning" | "review" | "suspended";

/**
 * 简化优先级
 * - 1: 高优先级
 * - 2: 中优先级 (默认)
 * - 3: 低优先级
 */
export type IRPriority = 1 | 2 | 3;

// ============================================
// 内容块数据结构（旧方案 - 标记模式）
// ============================================

/**
 * 内容块数据
 *
 * Compatibility note: v5.0 文件化块方案已弃用此接口
 * 新方案使用 IRChunkFileData（调度数据）+ IRChunkFileYAML（文件元数据）
 * 此接口仅用于兼容旧数据，新代码应使用 IRChunkFileData
 *
 * 迁移说明：
 * - filePath → IRChunkFileData.filePath（块文件路径，非源文件）
 * - startLine/endLine → 废弃（块文件即完整内容）
 * - headingPath → 废弃（块标题写入块文件）
 * - priority → IRChunkFileYAML.priority_ui
 * - state → IRChunkFileYAML.status + IRChunkFileData.scheduleStatus
 */
export interface IRBlock {
	// === 定位信息 ===
	/** 唯一标识符 (ir-xxxxxxxx 格式) */
	id: string;
	/** 源文件相对路径 */
	filePath: string;
	/** 标题层级路径 ["第一章", "第一节"] */
	headingPath: string[];
	/** 标题级别 (1-6) */
	headingLevel: number;
	/** 起始行号（用于快速定位） */
	startLine: number;
	/** 结束行号（用于内容范围定位） */
	endLine?: number;

	// === 元数据 ===
	/** 简化优先级: 1=高, 2=中, 3=低 */
	priority: IRPriority;
	/** 块状态 */
	state: IRBlockState;

	// === 调度数据 ===
	/** 当前间隔 (天) */
	interval: number;
	/** 间隔增长因子，默认1.5 */
	intervalFactor: number;
	/** 下次复习日期 (ISO字符串, null表示未调度) */
	nextReview: string | null;
	/** 复习次数 */
	reviewCount: number;
	/** 上次复习日期 (ISO字符串) */
	lastReview: string | null;

	// === 用户数据 ===
	/** 收藏 */
	favorite: boolean;
	/** 用户标签 */
	tags: string[];
	/** 用户笔记 */
	notes: string;
	/** 已提取的卡片UUID列表 */
	extractedCards: string[];

	// === 统计数据 ===
	/** 累计阅读时长（秒） */
	totalReadingTime: number;
	/** 首次阅读时间 */
	firstReadAt: string | null;
	/** 上次自评评分 (1-4: 忽略/一般/清晰/精通) */
	lastRating?: number;
	/** v2.3: 布鲁姆认知层级 (1-6: 记忆/理解/应用/分析/评价/创造) */
	cognitiveLevel?: number;

	// === v3.0 新调度系统字段 ===
	/** v3.0: 用户当次设置的优先级 (0-10 连续值)，默认 5 */
	priorityUi?: number;
	/** v3.0: EWMA 平滑后的有效优先级 (0-10)，用于调度计算 */
	priorityEff?: number;
	/** v3.0: 最后一次更新 priorityEff 的时间 (ISO字符串)，用于 time-aware EWMA */
	priorityUpdatedAt?: string;
	/** v3.0: 每日出现次数记录，key 为 YYYY-MM-DD，value 为当日出现次数 */
	dailyAppearances?: Record<string, number>;
	/** v3.0: 所属标签组 ID（用于继承组参数） */
	tagGroupId?: string;

	/** 导入时间 (ISO字符串) */
	createdAt: string;
	/** 最后更新时间 */
	updatedAt: string;

	// === 兼容字段 (待废弃) ===
	/** Compatibility note: 使用 headingPath[headingPath.length-1] 代替 */
	headingText?: string;
	/** Compatibility note: 不再使用文件夹映射 */
	deckPath?: string;
	/** Compatibility note: 使用 startLine 代替 */
	blockIndex?: number;
	/** Compatibility note: */
	contentPreview?: string;
}

// ============================================
// 牌组数据结构
// ============================================

/**
 * 增量阅读牌组
 * 支持跨文件组织，通过 blockIds 索引内容块
 */
export interface IRDeck {
	// === 基本信息 ===
	/** 牌组UUID */
	id: string;
	/** 牌组名称 */
	name: string;
	/** 牌组描述 */
	description: string;
	/** 图标 (emoji或图标名) */
	icon: string;
	/** 主题色 */
	color: string;

	// === 内容组织 (核心: 跨文件索引) ===
	/** 包含的内容块UUID列表 */
	blockIds: string[];
	/** 来源文件路径列表 (派生，用于快速查询) */
	sourceFiles: string[];

	// === 牌组设置 ===
	settings: IRDeckSettings;

	// === 标签 ===
	/** 牌组标签（用于看板分组等） */
	tags?: string[];

	// === 元数据 ===
	createdAt: string;
	updatedAt: string;
	/** 归档时间，null表示活跃 */
	archivedAt: string | null;

	// === 兼容字段 (待废弃) ===
	/** Compatibility note: 使用 id 代替 */
	path?: string;
}

/**
 * 拆分模式
 * - heading: 按标题级别拆分（默认 H2）
 * - blank-lines: 按双空行拆分
 * - custom: 使用自定义分隔符
 * - manual: 仅识别已有的 UUID 标记（用户完全手动）
 */
export type IRSplitMode = "heading" | "blank-lines" | "custom" | "manual";

/**
 * 牌组设置
 */
export interface IRDeckSettings {
	/** 新块默认优先级 */
	defaultPriority: IRPriority;
	/** 拆分模式 */
	splitMode: IRSplitMode;
	/** 拆分标题级别 (heading模式使用, 1-6, 默认2) */
	splitLevel: number;
	/** 自定义分隔符 (custom模式使用) */
	customSplitMarker?: string;
	/** 默认间隔因子 */
	defaultIntervalFactor: number;
	/** 每日新块上限 */
	dailyNewLimit: number;
	/** 每日复习上限 */
	dailyReviewLimit: number;
	/** 是否启用交错学习 */
	interleaveMode: boolean;
}

/**
 * 牌组统计
 */
export interface IRDeckStats {
	/** 新内容块数量（未读：当前已到期的内容块） */
	newCount: number;
	/** 学习中内容块数量 */
	learningCount: number;
	/** 待复习内容块数量 */
	reviewCount: number;
	/** 今日到期数量（当前已到期的内容块，用于学习队列） */
	dueToday: number;
	/** N天内到期数量（待读：可提前阅读的内容块） */
	dueWithinDays: number;
	/** 总内容块数量 */
	totalCount: number;
	/** 文件数量 */
	fileCount: number;
	/** 提问总数（内容块中带有复选框+问号的条目） */
	questionCount: number;
	/** 已完成提问数量（已勾选的提问） */
	completedQuestionCount: number;
	/** 今日可学习的新块数量（应用每日限制后） */
	todayNewCount?: number;
	/** 今日可复习的到期块数量（应用每日限制后） */
	todayDueCount?: number;
	loadRatePercent?: number;
}

// ============================================
// 阅读历史
// ============================================

/**
 * 阅读会话记录
 */
export interface IRSession {
	/** 会话ID */
	id: string;
	/** 内容块ID */
	blockId: string;
	topicId?: string;
	/** 牌组ID */
	deckId: string;
	/** 开始时间 */
	startTime: string;
	/** 结束时间 */
	endTime: string;
	/** 时长(秒) */
	duration: number;
	/** 操作类型 */
	action: "completed" | "skipped" | "suspended" | "ignored";
	/** 理解度评分 1-4 */
	rating?: number;
}

/**
 * 学习会话记录 (v6.0)
 * 记录用户每次打开增量阅读界面的完整学习会话
 * 区别于 IRSession（按块记录），这是整场会话级别的记录
 */
export interface IRStudySession {
	/** 会话唯一ID */
	id: string;
	/** 牌组ID */
	deckId: string;
	/** 牌组名称（冗余存储，方便展示） */
	topicId?: string;
	topicName?: string;
	deckName: string;
	/** 会话开始时间 (ISO 8601) */
	startTime: string;
	/** 会话结束时间 (ISO 8601) */
	endTime: string;
	/** 自动计时的时长（秒） */
	autoRecordedDuration: number;
	/** 用户确认/修正后的时长（秒） */
	confirmedDuration: number;
	/** 本次会话完成的内容块数量 */
	blocksCompleted: number;
	/** 本次会话创建的卡片数量 */
	cardsCreated: number;
}

/**
 * 学习会话存储结构
 */
export interface IRStudySessionStore {
	/** 存储版本 */
	version: string;
	/** 会话记录列表 */
	sessions: IRStudySession[];
}

// ============================================
// 存储数据结构
// ============================================

/** 当前存储版本 */
export const IR_STORAGE_VERSION = "4.0";

// ============================================
// v4.0 权威规范数据结构
// ============================================

/**
 * 优先级变更日志条目 (v4.0 权威规范)
 * 强制理由机制：每次优先级变更必须记录理由
 */
export interface IRPriorityLogEntry {
	/** 时间戳 (ms) */
	ts: number;
	/** 变更前优先级 */
	oldP: number;
	/** 变更后优先级 */
	newP: number;
	/** 变更理由（必填） */
	reason: string;
}

/**
 * 内容块统计数据 (v4.0 权威规范)
 */
export interface IRBlockStats {
	/** 展示次数 */
	impressions: number;
	/** 原始阅读时长（秒，可能含噪） */
	totalReadingTimeSec: number;
	/** 有效阅读时长（秒，过滤后） */
	effectiveReadingTimeSec: number;
	/** 摘录/提取次数 */
	extracts: number;
	/** 制卡次数 */
	cardsCreated: number;
	/** 批注/改写次数 */
	notesWritten: number;
	/** 最后交互时间 (ms timestamp) */
	lastInteraction: number;
	/** 最后展示时间 (ms timestamp)，用于 Aging 计算 */
	lastShownAt: number;
	/** 今日展示次数（跨天自动重置） */
	todayShownCount?: number;
	/** todayShownCount 对应的日期 (YYYY-MM-DD)，用于跨天重置 */
	todayShownDate?: string;
}

/**
 * 内容块元数据 (v4.0 权威规范)
 */
export interface IRBlockMeta {
	/** 优先级变更日志（强制理由机制） */
	priorityLog: IRPriorityLogEntry[];
	/** 前后兄弟块关联（用于上下文导航） */
	siblings: {
		prev: string | null;
		next: string | null;
	};
	/** 所属标签组 */
	tagGroup: string;
	/** 主关联笔记路径 */
	primaryAssociatedNotePath?: string;
	/** 关联的 Markdown 笔记路径（用于记忆卡片溯源统计） */
	associatedNotePath?: string;
	/** 关联的 Markdown 笔记路径列表 */
	associatedNotePaths?: string[];
}

/**
 * v4.0 内容块数据结构（权威规范版）
 * 对齐《增量阅读-算法实施权威规范.md》Section 2.1
 */
export interface IRBlockV4 {
	/** 唯一标识符 */
	id: string;
	/** 源文件路径 */
	sourcePath: string;
	/** 块标识（在文件内的定位） */
	blockId: string;
	/** 内容哈希（用于变更检测） */
	contentHash: string;

	/** 状态机（7 状态） */
	status: IRBlockStatus;

	/** 完成/移除原因（仅 done/removed 状态时有值） */
	doneReason?: "archived" | "removed" | "completed";
	/** 完成/移除时间 (ms timestamp) */
	doneAt?: number;

	/** 用户滑条优先级 P_ui (0-10) */
	priorityUi: number;
	/** 有效优先级 P_eff (0-10)，EWMA 平滑后 */
	priorityEff: number;

	/** 当前间隔（天） I_curr */
	intervalDays: number;
	/** 下次复习时间 (ms timestamp) */
	nextRepDate: number;

	/** 统计字段 */
	stats: IRBlockStats;

	/** 元数据与安全机制日志 */
	meta: IRBlockMeta;

	/** 导入时间 (ms timestamp) */
	createdAt: number;
	/** 最后更新时间 (ms timestamp) */
	updatedAt: number;

	// === 兼容字段（渐进迁移用） ===
	/** 标题层级路径 */
	headingPath?: string[];
	/** 标题级别 */
	headingLevel?: number;
	/** 起始行号 */
	startLine?: number;
	/** 结束行号 */
	endLine?: number;
	/** 用户标签 */
	tags?: string[];
	/** 用户笔记 */
	notes?: string;
	/** 收藏 */
	favorite?: boolean;
}

/**
 * 默认 IRBlockStats
 */
export const DEFAULT_IR_BLOCK_STATS: IRBlockStats = {
	impressions: 0,
	totalReadingTimeSec: 0,
	effectiveReadingTimeSec: 0,
	extracts: 0,
	cardsCreated: 0,
	notesWritten: 0,
	lastInteraction: 0,
	lastShownAt: 0,
};

/**
 * 默认 IRBlockMeta
 */
export const DEFAULT_IR_BLOCK_META: IRBlockMeta = {
	priorityLog: [],
	siblings: { prev: null, next: null },
	tagGroup: "default",
};

/**
 * 创建默认 IRBlockV4
 */
export function createDefaultIRBlockV4(id: string, sourcePath: string, blockId = ""): IRBlockV4 {
	const now = Date.now();
	return {
		id,
		sourcePath,
		blockId: blockId || id,
		contentHash: "",
		status: "new",
		priorityUi: 5,
		priorityEff: 5,
		intervalDays: 0,
		nextRepDate: 0,
		stats: { ...DEFAULT_IR_BLOCK_STATS },
		meta: { ...DEFAULT_IR_BLOCK_META, siblings: { prev: null, next: null } },
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * 状态映射：旧状态 → 新状态
 */
export function mapStateToStatus(state: IRBlockState): IRBlockStatus {
	switch (state) {
		case "new":
			return "new";
		case "learning":
			return "queued";
		case "review":
			return "queued";
		case "suspended":
			return "suspended";
		default:
			return "new";
	}
}

/**
 * 数据迁移：IRBlock (v3) → IRBlockV4
 */
export function migrateToIRBlockV4(oldBlock: IRBlock): IRBlockV4 {
	const now = Date.now();
	const createdAt = oldBlock.createdAt ? new Date(oldBlock.createdAt).getTime() : now;
	const updatedAt = oldBlock.updatedAt ? new Date(oldBlock.updatedAt).getTime() : now;
	const lastReview = oldBlock.lastReview ? new Date(oldBlock.lastReview).getTime() : 0;
	const nextReview = oldBlock.nextReview ? new Date(oldBlock.nextReview).getTime() : 0;

	return {
		id: oldBlock.id,
		sourcePath: oldBlock.filePath,
		blockId: oldBlock.id,
		contentHash: "",

		status: mapStateToStatus(oldBlock.state),

		priorityUi: oldBlock.priorityUi ?? 5,
		priorityEff: oldBlock.priorityEff ?? 5,

		intervalDays: oldBlock.interval || 0,
		nextRepDate: nextReview,

		stats: {
			impressions: oldBlock.reviewCount || 0,
			totalReadingTimeSec: oldBlock.totalReadingTime || 0,
			effectiveReadingTimeSec: oldBlock.totalReadingTime || 0,
			extracts: 0,
			cardsCreated: oldBlock.extractedCards?.length || 0,
			notesWritten: 0,
			lastInteraction: updatedAt,
			lastShownAt: lastReview || createdAt,
		},

		meta: {
			priorityLog: [],
			siblings: { prev: null, next: null },
			tagGroup: oldBlock.tagGroupId || "default",
		},

		createdAt,
		updatedAt,

		// 兼容字段
		headingPath: oldBlock.headingPath,
		headingLevel: oldBlock.headingLevel,
		startLine: oldBlock.startLine,
		endLine: oldBlock.endLine,
		tags: oldBlock.tags,
		notes: oldBlock.notes,
		favorite: oldBlock.favorite,
	};
}

/**
 * v4.0 blocks.json 数据结构
 */
export interface IRBlocksStoreV4 {
	version: "4.0";
	blocks: Record<string, IRBlockV4>;
}

/**
 * blocks.json 数据结构
 */
export interface IRBlocksStore {
	version: string;
	blocks: Record<string, IRBlock>;
}

/**
 * decks.json 数据结构
 */
export interface IRDecksStore {
	version: string;
	decks: Record<string, IRDeck>;
}

export interface IRTopicsStore {
	version: string;
	topics: Record<string, IRDeck>;
}

/**
 * history.json 数据结构
 */
export interface IRHistoryStore {
	version: string;
	sessions: IRSession[];
}

// ============================================
// v5.0 文件化内容块方案数据结构
// ============================================

/**
 * 块文件状态（写入 YAML 的简化状态）
 * - active: 活跃，参与 IR 调度
 * - processing: 处理中
 * - done: 归档（用户已完全理解）
 * - archived: 搁置（保留但暂不调度，可恢复）
 * - removed: 移除（从队列永久移除）
 */
export type ChunkFileStatus = "active" | "processing" | "done" | "archived" | "removed";

/**
 * 源材料文件元数据（存储在插件 JSON 中）
 */
export interface IRSourceFileMeta {
	/** 源文件唯一 ID */
	sourceId: string;
	/** 原始文件路径（导入前的位置） */
	originalPath: string;
	/** 源文件副本路径（IR/raw/ 下的只读副本） */
	rawFilePath: string;
	/** 索引文件路径 */
	indexFilePath: string;
	/** 关联的块文件 ID 列表（按顺序） */
	chunkIds: string[];
	/** 文章标题 */
	title: string;
	/** 作者（可选） */
	author?: string;
	/** 标签组 */
	tagGroup: string;
	/** 导入时间 */
	createdAt: number;
	/** 更新时间 */
	updatedAt: number;
}

/**
 * 索引文件 YAML frontmatter 结构
 * 写入索引 MD 文件的 YAML 区域
 */
export interface IRIndexFileYAML {
	/** 源文件 ID */
	source_id: string;
	/** 文章标题 */
	title: string;
	/** 作者 */
	author?: string;
	/** 来源 URL */
	source_url?: string;
	/** 标签列表 */
	tags: string[];
	/** Weave 类型标识 */
	weave_type: "ir-index";
	/** v6.1: 多牌组支持 - 牌组名称数组 */
	topic_names?: string[];
	deck_names?: string[];
}

/**
 * 块文件 YAML frontmatter 结构
 * 写入块 MD 文件的 YAML 区域（用户可编辑字段）
 */
export interface IRChunkFileYAML {
	/** 块唯一 ID */
	chunk_id: string;
	/** 所属源文件 ID */
	source_id: string;
	/** 块状态 */
	status: ChunkFileStatus;
	/** 用户优先级滑条值 (0-10) */
	priority_ui: number;
	/** 用户标签 */
	tags: string[];
	/** Weave 类型标识 */
	weave_type: "ir-chunk";
	/** v5.4: 牌组标签 - 格式 #IR_deck_牌组名 */
	topic_tag?: string;
	deck_tag?: string;
	/** v5.5: 多牌组支持 - 牌组名称数组（需与正式牌组核对） */
	topic_names?: string[];
	deck_names?: string[];
}

/**
 * 块文件完整数据（插件 JSON 中的调度状态）
 * 复杂/频繁变化的状态不写入 YAML
 */
export interface IRChunkFileData {
	/** 块唯一 ID */
	chunkId: string;
	/** 所属源文件 ID */
	sourceId: string;
	/** 块文件路径 */
	filePath: string;
	/** v5.4: 牌组标签 - 格式 #IR_deck_牌组名 (兼容) */
	topicTag?: string;
	deckTag?: string;
	/** v5.5: 多牌组支持 - 已验证的牌组ID列表 */
	topicIds?: string[];
	deckIds?: string[];

	// === 用户数据 ===
	/** 收藏 */
	favorite?: boolean;

	// === 调度引擎状态（保留在 JSON） ===
	/** 用户优先级滑条值 (0-10) */
	priorityUi?: number;
	/** 有效优先级（EWMA 平滑后） */
	priorityEff: number;
	/** 当前间隔（天） */
	intervalDays: number;
	/** 下次复习时间 (ms timestamp) */
	nextRepDate: number;
	/** 状态机（内部调度状态） */
	scheduleStatus: IRBlockStatus;
	/** 完成/移除原因（仅 done/removed 状态时有值） */
	doneReason?: "archived" | "removed" | "completed";
	/** 完成/移除时间 (ms timestamp) */
	doneAt?: number;

	// === 统计数据 ===
	/** 统计字段 */
	stats: IRBlockStats;
	/** 元数据 */
	meta: IRBlockMeta;

	// === 时间戳 ===
	createdAt: number;
	updatedAt: number;
}

/**
 * 索引文件到块文件的映射存储
 */
export interface IRSourcesStore {
	version: string;
	sources: Record<string, IRSourceFileMeta>;
}

/**
 * 块文件调度数据存储
 */
export interface IRChunksStore {
	version: string;
	chunks: Record<string, IRChunkFileData>;
}

/**
 * 生成源文件 ID
 */
export function generateSourceId(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let id = "src-";
	for (let i = 0; i < 12; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * 生成块文件 ID
 */
export function generateChunkId(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let id = "chunk-";
	for (let i = 0; i < 12; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * 创建默认块文件 YAML
 */
export function createDefaultChunkFileYAML(
	chunkId: string,
	sourceId: string,
	deckTag?: string,
	deckNames?: string[]
): IRChunkFileYAML {
	const normalizeDeckNameForTag = (name: string): string => {
		return (
			String(name || "")
				.trim()
				.replace(/[\s/\\#]+/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_+|_+$/g, "") || "未分配"
		);
	};

	const names = (deckNames || []).map((n) => String(n).trim()).filter(Boolean);
	const deckTagVal = deckTag || "#IR_deck_未分配";
	const inferredName = deckTagVal.startsWith("#IR_deck_")
		? deckTagVal.replace("#IR_deck_", "")
		: "";
	const primaryName = names[0] || inferredName || "未分配";
	const deckTagSegment = normalizeDeckNameForTag(primaryName);

	const tags = new Set<string>(["ir/chunk", "ir/deck", `ir/deck/${deckTagSegment}`]);
	return {
		chunk_id: chunkId,
		source_id: sourceId,
		status: "active",
		priority_ui: 5,
		tags: Array.from(tags),
		weave_type: "ir-chunk",
		topic_tag: deckTagVal,
		topic_names: names.length > 0 ? names : undefined,
	};
}

/**
 * 创建默认索引文件 YAML
 */
export function createDefaultIndexFileYAML(
	sourceId: string,
	title: string,
	deckNames?: string[]
): IRIndexFileYAML {
	const normalizeDeckNameForTag = (name: string): string => {
		return (
			String(name || "")
				.trim()
				.replace(/[\s/\\#]+/g, "_")
				.replace(/_+/g, "_")
				.replace(/^_+|_+$/g, "") || "未分配"
		);
	};

	const names = (deckNames || []).map((n) => String(n).trim()).filter(Boolean);
	const primaryName = names[0] || "未分配";
	const deckTagSegment = normalizeDeckNameForTag(primaryName);
	const tags = new Set<string>(["ir/source", "ir/deck", `ir/deck/${deckTagSegment}`]);
	return {
		source_id: sourceId,
		title,
		tags: Array.from(tags),
		weave_type: "ir-index",
		topic_names: names.length > 0 ? names : undefined,
	};
}

/**
 * 创建默认块文件调度数据
 */
export function createDefaultChunkFileData(
	chunkId: string,
	sourceId: string,
	filePath: string
): IRChunkFileData {
	const now = Date.now();
	// v5.4: 新块初始化时设置 nextRepDate = now，使其立即可被调度
	// 这对应状态机的 new → queued 转换的效果
	return {
		chunkId,
		sourceId,
		filePath,
		priorityUi: 5,
		priorityEff: 5,
		intervalDays: 1, // 初始间隔 1 天
		nextRepDate: now, // 立即到期，可被选入队列
		scheduleStatus: "new", // 保持 new 状态，首次阅读后转为 queued
		stats: { ...DEFAULT_IR_BLOCK_STATS },
		meta: { ...DEFAULT_IR_BLOCK_META, siblings: { prev: null, next: null } },
		createdAt: now,
		updatedAt: now,
	};
}

// ============================================
// 文件同步状态
// ============================================

/**
 * 文件同步状态
 * 用于增量检测文件变化，避免全量扫描
 */
export interface FileSyncState {
	/** 文件路径 */
	filePath: string;
	/** 文件修改时间 (mtime) */
	mtime: number;
	/** 文件大小 (bytes) */
	size: number;
	/** UUID 列表哈希 (快速检测块变化) */
	uuidListHash: string;
	/** 最后同步时间 */
	lastSynced: string;
}

/**
 * sync-state.json 数据结构
 */
export interface IRSyncStateStore {
	version: string;
	files: Record<string, FileSyncState>;
}

// ============================================
// v3.0 标签组（材料类型）数据结构
// ============================================

/**
 * 标签组定义 (v3.0)
 * 用于对"材料类型"分群，形成可迁移的类型先验
 * 每篇文档最多命中一个 TagGroup；未命中进入 default 组
 */
export interface IRTagGroup {
	/** 唯一标识符 */
	id: string;
	/** 标签组名称 */
	name: string;
	/** 描述 */
	description: string;
	/** 标签匹配规则：命中任一标签则认为命中该组 */
	matchAnyTags: string[];
	/** 匹配优先级：解决多命中冲突，数值越小优先级越高 */
	matchPriority: number;
	/**
	 * 匹配源配置：从文档的哪些位置提取标签进行匹配
	 * 未设置时默认 { yamlTags: true, inlineTags: true, customProperties: [] }
	 */
	matchSource?: IRTagGroupMatchSource;
	/** 创建时间 */
	createdAt: string;
	/** 更新时间 */
	updatedAt: string;
}

/**
 * 标签组匹配源配置
 */
export interface IRTagGroupMatchSource {
	/** 是否匹配 YAML frontmatter 的 tags 属性 */
	yamlTags: boolean;
	/** 是否匹配内联 #tags */
	inlineTags: boolean;
	/** 自定义 YAML 属性名列表（如 ['关键词', 'keywords', 'categories']） */
	customProperties: string[];
}

/**
 * 参数历史记录点
 */
export interface IRProfileHistoryPoint {
	/** 记录时间 */
	timestamp: string;
	/** intervalFactorBase 值 */
	value: number;
	/** 样本量（记录时） */
	sampleCount: number;
}

/**
 * 标签组调度参数 (v3.0)
 * 可学习的类型先验参数
 */
export interface IRTagGroupProfile {
	/** 关联的标签组 ID */
	groupId: string;
	/** 长期增长速度基线，主要学习项，clamp [1.1, 3.0] */
	intervalFactorBase: number;
	/** 冷启动修正乘子，clamp [0.7, 1.5] */
	initialIntervalMultiplier: number;
	/** 负载统计半衰期（天），用于 readingTime/rating 的 EWMA */
	loadHalfLifeDays?: number;
	/** 组样本量，用于 shrinkage 计算 */
	sampleCount: number;
	/** 最近更新时间 */
	updatedAt: string;
	/** intervalFactorBase 历史变化记录（用于可视化） */
	history?: IRProfileHistoryPoint[];
}

/**
 * 文档到标签组的映射缓存 (v3.0)
 * 可重建的派生数据
 */
export interface IRDocumentGroupMap {
	/** 文件路径 */
	filePath: string;
	/** 命中的标签组 ID */
	groupId: string;
	/** 从文件解析出的标签快照（便于调试与漂移检测） */
	tagsSnapshot: string[];
	/** 更新时间 */
	updatedAt: string;
}

/**
 * tag-groups.json 数据结构 (v3.0)
 */
export interface IRTagGroupsStore {
	version: string;
	groups: Record<string, IRTagGroup>;
}

/**
 * tag-group-profiles.json 数据结构 (v3.0)
 */
export interface IRTagGroupProfilesStore {
	version: string;
	profiles: Record<string, IRTagGroupProfile>;
}

/**
 * document-group-map.json 数据结构 (v3.0)
 */
export interface IRDocumentGroupMapStore {
	version: string;
	map: Record<string, IRDocumentGroupMap>;
}

// ============================================
// v3.0 调度策略配置
// ============================================

/**
 * 调度策略类型 (v3.0)
 * - processing: 加工流（同日推进摘录/卡片/永久笔记加工）
 * - reading-list: 阅读清单（每天处理一点，不追求同日重复）
 */
export type IRScheduleStrategyType = "processing" | "reading-list";

/**
 * 调度策略配置 (v3.0)
 */
export interface IRScheduleStrategy {
	/** 策略类型 */
	type: IRScheduleStrategyType;
	/** 会话内最小间隔（分钟），null 表示禁用会话内分钟级调度 */
	sessionMinIntervalMinutes: number | null;
	/** 跨日最小间隔（小时） */
	crossDayMinIntervalHours: number;
	/** 同块每日出现上限 */
	maxAppearancesPerBlockPerDay: number;
	/** 每日时间预算（分钟） */
	dailyTimeBudgetMinutes: number;
	/** 每日复习数量上限 */
	dailyReviewLimit: number;
}

/**
 * 预设策略：加工流 (v3.0)
 */
export const PROCESSING_STRATEGY: IRScheduleStrategy = {
	type: "processing",
	sessionMinIntervalMinutes: 10,
	crossDayMinIntervalHours: 6,
	maxAppearancesPerBlockPerDay: 2,
	dailyTimeBudgetMinutes: 40,
	dailyReviewLimit: 50,
};

/**
 * 预设策略：阅读清单 (v3.0)
 */
export const READING_LIST_STRATEGY: IRScheduleStrategy = {
	type: "reading-list",
	sessionMinIntervalMinutes: null,
	crossDayMinIntervalHours: 24,
	maxAppearancesPerBlockPerDay: 1,
	dailyTimeBudgetMinutes: 40,
	dailyReviewLimit: 50,
};

/**
 * 高级调度设置 (v3.0)
 */
export interface IRAdvancedScheduleSettings {
	/** 同一内容块每日最大出现次数 (覆盖策略默认值) */
	maxAppearancesPerDay?: number;
	/** 每日时间预算（分钟）(覆盖策略默认值) */
	dailyTimeBudgetMinutes?: number;
	/** 是否启用交错学习软约束 */
	interleaveMode?: boolean;
	/** 同主题连续软阈值 */
	maxConsecutiveSameTopic?: number;
	/** 是否启用 TagGroup 先验 */
	enableTagGroupPrior: boolean;
	/** TagGroup 参数学习速度：off/slow/medium/fast */
	tagGroupLearningSpeed: "off" | "slow" | "medium" | "fast";
	/** shrinkage 强度 k 值 */
	shrinkageStrength: number;
	/** intervalFactorBase 的 clamp 范围 */
	intervalFactorClamp: [number, number];
	/** initialIntervalMultiplier 的 clamp 范围 */
	initialIntervalMultiplierClamp: [number, number];
	/** priorityWeight 的 clamp 范围 */
	priorityWeightClamp: [number, number];
	/** 是否启用按组公平分配 */
	enableFairAllocation: boolean;
	/** aging 强度：low/medium/high */
	agingStrength: "low" | "medium" | "high";
	/** 自动后推策略：off/gentle/aggressive */
	autoPostponeStrategy: "off" | "gentle" | "aggressive";
	/** 优先级半衰期（天） */
	priorityHalfLifeDays: number;
	/** 基础间隔扩张因子（用户可配，默认 1.5） */
	defaultIntervalFactor?: number;
	/** 最大间隔天数（用户可配，默认 365） */
	maxIntervalDays?: number;
}

/**
 * 默认高级调度设置 (v3.0)
 */
export const DEFAULT_ADVANCED_SCHEDULE_SETTINGS: IRAdvancedScheduleSettings = {
	maxAppearancesPerDay: 2,
	dailyTimeBudgetMinutes: 40,
	interleaveMode: true,
	maxConsecutiveSameTopic: 3,
	enableTagGroupPrior: true,
	tagGroupLearningSpeed: "off",
	shrinkageStrength: 50,
	intervalFactorClamp: [1.1, 3.0],
	initialIntervalMultiplierClamp: [0.7, 1.5],
	priorityWeightClamp: [0.5, 1.5],
	enableFairAllocation: true,
	agingStrength: "low",
	autoPostponeStrategy: "gentle",
	priorityHalfLifeDays: 7,
	defaultIntervalFactor: 1.5,
	maxIntervalDays: 365,
};

/**
 * 默认标签组（用于未命中任何组的文档）
 */
export const DEFAULT_TAG_GROUP: IRTagGroup = {
	id: "default",
	name: "默认",
	description: "未命中任何标签组的文档",
	matchAnyTags: [],
	matchPriority: 999,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

/**
 * 默认标签组参数
 */
export const DEFAULT_TAG_GROUP_PROFILE: IRTagGroupProfile = {
	groupId: "default",
	intervalFactorBase: 1.5,
	initialIntervalMultiplier: 1.0,
	sampleCount: 0,
	updatedAt: new Date().toISOString(),
};


// ============================================
// 工具类型
// ============================================

/**
 * 生成 IR 块 ID
 */
export function generateIRBlockId(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let id = "ir-";
	for (let i = 0; i < 8; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * 默认牌组设置
 */
export const DEFAULT_IR_DECK_SETTINGS: IRDeckSettings = {
	defaultPriority: 2, // 中优先级
	splitMode: "heading",
	splitLevel: 2,
	defaultIntervalFactor: 1.5, // 默认值 1.5
	dailyNewLimit: 20,
	dailyReviewLimit: 50,
	interleaveMode: true, // 默认启用交错学习
};

/**
 * 生成牌组ID
 */
export function generateIRDeckId(): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
	let id = "deck-";
	for (let i = 0; i < 8; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

/**
 * 创建默认内容块
 */
export function createDefaultIRBlock(
	id: string,
	filePath: string,
	headingPath: string[],
	headingLevel: number,
	startLine: number
): IRBlock {
	const now = new Date().toISOString();
	return {
		id,
		filePath,
		headingPath,
		headingLevel,
		startLine,

		// 元数据
		priority: 2, // 默认中优先级
		state: "new",

		// 调度数据
		interval: 0,
		intervalFactor: 1.5,
		nextReview: null,
		reviewCount: 0,
		lastReview: null,

		// 用户数据
		favorite: false,
		tags: [],
		notes: "",
		extractedCards: [],

		// 统计数据
		totalReadingTime: 0,
		firstReadAt: null,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * 创建默认牌组
 */
export function createDefaultIRDeck(
	name: string,
	blockIds: string[] = [],
	sourceFiles: string[] = []
): IRDeck {
	const now = new Date().toISOString();
	return {
		id: generateIRDeckId(),
		name,
		description: "",
		icon: "📖",
		color: "#f97316", // 橙色

		// 内容组织
		blockIds,
		sourceFiles,

		// 设置
		settings: { ...DEFAULT_IR_DECK_SETTINGS },

		// 元数据
		createdAt: now,
		updatedAt: now,
		archivedAt: null,
	};
}
