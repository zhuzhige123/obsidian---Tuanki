/** 统一协调增量阅读的队列生成、调度执行和文件化块入口。 */

import type { App } from "obsidian";
import type { IRChunkFileData } from "../../types/ir-types";
import type {
	IRAdvancedScheduleSettings,
	IRBlock,
	IRScheduleStrategy,
	IRTagGroup,
	IRTagGroupProfile,
} from "../../types/ir-types";
import {
	DEFAULT_ADVANCED_SCHEDULE_SETTINGS,
	PROCESSING_STRATEGY,
	READING_LIST_STRATEGY,
} from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { IRChunkScheduleAdapter } from "./IRChunkScheduleAdapter";
import {
	IRQueueGenerator,
	type PostponeResult,
	type QueueGenerationResult,
} from "./IRQueueGenerator";
import { IRSchedulerV3, type ReadingCompletionData } from "./IRSchedulerV3";
import { IRStorageService } from "./IRStorageService";
import { IRTagGroupService } from "./IRTagGroupService";

// ============================================
// 类型定义
// ============================================

/** 创建调度外观时可覆盖的配置。 */
export interface IRSchedulingFacadeConfig {
	strategy?: "processing" | "reading-list";
	advancedSettings?: Partial<IRAdvancedScheduleSettings>;
	/** 可选传入现成的存储服务，避免重复创建。 */
	storageService?: IRStorageService;
}

/** 调度外观返回的学习队列结果。 */
export interface StudyQueueResult extends QueueGenerationResult {
	deckId: string;
	strategy: IRScheduleStrategy;
	overloadInfo?: {
		isOverloaded: boolean;
		overloadRatio: number;
	};
}

/** 完成内容块后的返回结果。 */
export interface CompleteBlockResult {
	block: IRBlock;
	groupProfile: IRTagGroupProfile;
	nextInQueue: IRBlock | null;
}

// ============================================
// IRSchedulingFacade 类
// ============================================

export class IRSchedulingFacade {
	private app: App;
	private storage: IRStorageService;
	private scheduler: IRSchedulerV3;
	private queueGenerator: IRQueueGenerator;
	private tagGroupService: IRTagGroupService;
	private chunkAdapter?: IRChunkScheduleAdapter;

	private strategy: IRScheduleStrategy;
	private advancedSettings: IRAdvancedScheduleSettings;

	private initialized = false;

	constructor(app: App, config?: IRSchedulingFacadeConfig) {
		this.app = app;
		const passedStorageService = config?.storageService;
		logger.debug(`[IRSchedulingFacade] 构造函数: storageService 传入=${!!passedStorageService}`);
		this.storage = passedStorageService || new IRStorageService(app);

		this.strategy =
			config?.strategy === "reading-list" ? READING_LIST_STRATEGY : PROCESSING_STRATEGY;

		this.advancedSettings = {
			...DEFAULT_ADVANCED_SCHEDULE_SETTINGS,
			...config?.advancedSettings,
		};

		this.scheduler = new IRSchedulerV3(
			this.storage,
			{
				strategy: this.strategy,
				advancedSettings: this.advancedSettings,
			},
			app
		);

		this.tagGroupService = new IRTagGroupService(app);

		this.queueGenerator = new IRQueueGenerator(this.strategy, this.advancedSettings);
	}

	/** 初始化依赖服务。 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		await this.storage.initialize();
		await this.tagGroupService.initialize();

		this.initialized = true;
		logger.info("[IRSchedulingFacade] 初始化完成");
	}

	// ============================================
	// v5.0 文件化块调度方法
	// ============================================

	/** 懒加载文件化块调度适配器。 */
	getChunkAdapter(): IRChunkScheduleAdapter {
		if (!this.chunkAdapter) {
			this.chunkAdapter = new IRChunkScheduleAdapter(this.app, this.storage);
		}
		return this.chunkAdapter;
	}

	/** 返回今天可学习的文件化块。 */
	async getChunkStudyQueue(): Promise<IRChunkFileData[]> {
		await this.initialize();
		const adapter = this.getChunkAdapter();
		return adapter.getTodayDueChunks();
	}

	/** 将文件化块标记为完成。 */
	async markChunkComplete(chunkId: string): Promise<void> {
		await this.initialize();
		const adapter = this.getChunkAdapter();
		await adapter.markChunkDone(chunkId);
	}

	/** 把块文件里的 YAML 状态同步回调度数据。 */
	async syncChunksFromYAML(): Promise<number> {
		await this.initialize();
		const adapter = this.getChunkAdapter();
		return adapter.syncAllFromYAML();
	}

	// ============================================
	// 策略与设置
	// ============================================

	/** 切换队列生成和调度策略。 */
	setStrategy(strategyType: "processing" | "reading-list"): void {
		this.strategy = strategyType === "processing" ? PROCESSING_STRATEGY : READING_LIST_STRATEGY;

		this.scheduler.setStrategy(strategyType);
		this.queueGenerator.setStrategy(this.strategy);

		logger.info(`[IRSchedulingFacade] 切换策略: ${strategyType}`);
	}

	/** 返回当前调度策略。 */
	getStrategy(): IRScheduleStrategy {
		return this.strategy;
	}

	/** 合并并下发新的高级设置。 */
	updateAdvancedSettings(settings: Partial<IRAdvancedScheduleSettings>): void {
		this.advancedSettings = { ...this.advancedSettings, ...settings };
		this.scheduler.updateAdvancedSettings(this.advancedSettings);
		this.queueGenerator.setAdvancedSettings(this.advancedSettings);
	}

	/** 返回当前高级设置。 */
	getAdvancedSettings(): IRAdvancedScheduleSettings {
		return this.advancedSettings;
	}

	// ============================================
	// 队列生成
	// ============================================

	/** 生成指定牌组的学习队列。 */
	async getStudyQueue(deckId: string): Promise<StudyQueueResult> {
		await this.initialize();

		logger.info(`[IRSchedulingFacade] getStudyQueue 开始: deckId=${deckId}`);
		logger.debug(
			`[IRSchedulingFacade] storage实例: initialized=${(this.storage as any).initialized}`
		);

		const blocks = await this.storage.getBlocksByDeck(deckId, false, "IRSchedulingFacade");
		logger.info(`[IRSchedulingFacade] 获取到块数: ${blocks.length}`);

		// 仅在牌组为空时补充诊断日志，帮助定位 deckId/path 不一致。
		if (blocks.length === 0) {
			const allDecks = await this.storage.getAllDecks();
			const allBlocks = await this.storage.getAllBlocks();
			logger.warn(`[IRSchedulingFacade] 块数为0! 所有牌组: ${Object.keys(allDecks).join(", ")}`);
			logger.warn(`[IRSchedulingFacade] 所有块数: ${Object.keys(allBlocks).length}`);

			const matchingDeck = Object.values(allDecks).find(
				(d: any) => d.id === deckId || d.path === deckId
			);
			if (matchingDeck) {
				logger.warn(
					`[IRSchedulingFacade] 找到匹配牌组: id=${(matchingDeck as any).id}, path=${
						(matchingDeck as any).path
					}, blockIds=${(matchingDeck as any).blockIds?.length || 0}`
				);
			} else {
				logger.warn(`[IRSchedulingFacade] 未找到匹配的牌组! deckId=${deckId}`);
			}
		}

		if (blocks.length > 0) {
			const sample = blocks.slice(0, 3).map((b) => ({
				id: b.id.slice(0, 8),
				state: b.state,
				nextReview: b.nextReview,
				dailyAppearances: b.dailyAppearances,
			}));
			logger.debug("[IRSchedulingFacade] 块样本:", JSON.stringify(sample));
		}

		const groupMapping = await this.buildGroupMapping(blocks);

		const overloadStats = this.queueGenerator.getOverloadStats(blocks, groupMapping);

		if (overloadStats.isOverloaded && this.advancedSettings.autoPostponeStrategy !== "off") {
			const today = new Date().toISOString().split("T")[0];
			const dueBlocks = blocks.filter(
				(b) =>
					b.state !== "suspended" &&
					(b.state === "new" || !b.nextReview || b.nextReview.split("T")[0] <= today)
			);

			const postponeResult = this.queueGenerator.autoPostpone(dueBlocks);

			if (postponeResult.postponedBlocks.length > 0) {
				await this.storage.saveBlocks(postponeResult.postponedBlocks);
				logger.info(`[IRSchedulingFacade] 自动后推 ${postponeResult.postponedCount} 块`);
			}
		}

		const updatedBlocks = await this.storage.getBlocksByDeck(deckId);
		const queueResult = this.queueGenerator.generateQueue(updatedBlocks, groupMapping);

		return {
			...queueResult,
			deckId,
			strategy: this.strategy,
			overloadInfo: {
				isOverloaded: overloadStats.isOverloaded,
				overloadRatio: overloadStats.overloadRatio,
			},
		};
	}

	/** 在调用方未显式传入时，为内容块解析所属牌组 ID。 */
	private async resolveDeckIdForBlock(block: IRBlock, deckId?: string): Promise<string> {
		const explicitDeckId = String(deckId || "").trim();
		if (explicitDeckId) {
			return explicitDeckId;
		}

		const blockDeckIdentifier = String(block.deckPath || "").trim();
		if (blockDeckIdentifier) {
			const matchedDeck = await this.storage.getDeckById(blockDeckIdentifier);
			if (matchedDeck) {
				return matchedDeck.id || matchedDeck.path || blockDeckIdentifier;
			}
		}

		const allDecks = Object.values(await this.storage.getAllDecks());
		const matchedByBlockId = allDecks.find((deck) => deck.blockIds?.includes(block.id));
		if (matchedByBlockId) {
			return matchedByBlockId.id || matchedByBlockId.path || "";
		}

		const matchedBySourceFile = allDecks.find((deck) => deck.sourceFiles?.includes(block.filePath));
		if (matchedBySourceFile) {
			return matchedBySourceFile.id || matchedBySourceFile.path || "";
		}

		return blockDeckIdentifier;
	}

	// ============================================
	// 内容块操作
	// ============================================

	/** 完成一个内容块，并返回更新后的后续上下文。 */
	async completeBlock(
		block: IRBlock,
		data: ReadingCompletionData,
		deckId = ""
	): Promise<CompleteBlockResult> {
		await this.initialize();

		const resolvedDeckId = await this.resolveDeckIdForBlock(block, deckId);
		const groupProfile = await this.tagGroupService.getProfileForDocument(block.filePath);
		const updatedBlock = await this.scheduler.completeBlock(
			block,
			data,
			resolvedDeckId,
			groupProfile
		);

		if (this.advancedSettings.tagGroupLearningSpeed !== "off") {
			const { calculateLoadSignal } = await import("./IRSchedulerV3");
			const loadSignal = calculateLoadSignal(
				data.readingTimeSeconds,
				data.createdCardCount,
				data.createdExtractCount,
				data.createdNoteCount
			);

			const priorityWeight = Math.max(
				this.advancedSettings.priorityWeightClamp[0],
				Math.min(
					this.advancedSettings.priorityWeightClamp[1],
					0.5 + (updatedBlock.priorityEff ?? 5) / 10
				)
			);

			await this.tagGroupService.updateGroupProfile(
				groupProfile.groupId,
				loadSignal,
				priorityWeight,
				this.advancedSettings
			);
		}

		const queueResult = await this.getStudyQueue(resolvedDeckId);
		const nextInQueue = queueResult.queue.find((b) => b.id !== updatedBlock.id) ?? null;

		return {
			block: updatedBlock,
			groupProfile,
			nextInQueue,
		};
	}

	/** 更新内容块的优先级。 */
	async updatePriority(block: IRBlock, priorityUi: number): Promise<IRBlock> {
		await this.initialize();
		return this.scheduler.updatePriority(block, priorityUi);
	}

	/** 暂停内容块。 */
	async suspendBlock(block: IRBlock, deckId = ""): Promise<IRBlock> {
		await this.initialize();
		const resolvedDeckId = await this.resolveDeckIdForBlock(block, deckId);
		return this.scheduler.suspendBlock(block, resolvedDeckId);
	}

	/** 恢复已暂停的内容块。 */
	async unsuspendBlock(block: IRBlock): Promise<IRBlock> {
		await this.initialize();
		return this.scheduler.unsuspendBlock(block);
	}

	/** 跳过内容块。 */
	async skipBlock(block: IRBlock, deckId = ""): Promise<void> {
		await this.initialize();
		const resolvedDeckId = await this.resolveDeckIdForBlock(block, deckId);
		return this.scheduler.skipBlock(block, resolvedDeckId);
	}

	// ============================================
	// 后推操作
	// ============================================

	/** 批量后推多个内容块。 */
	async postponeBlocks(blocks: IRBlock[], days: number): Promise<IRBlock[]> {
		await this.initialize();
		const postponedBlocks = this.queueGenerator.manualPostpone(blocks, days);
		await this.storage.saveBlocks(postponedBlocks);
		return postponedBlocks;
	}

	/** 按标签组后推内容块。 */
	async postponeByGroup(deckId: string, groupId: string, days: number): Promise<IRBlock[]> {
		await this.initialize();

		const blocks = await this.storage.getBlocksByDeck(deckId);
		const groupMapping = await this.buildGroupMapping(blocks);

		const postponedBlocks = this.queueGenerator.postponeByGroup(
			blocks,
			groupId,
			groupMapping,
			days
		);
		await this.storage.saveBlocks(postponedBlocks);

		return postponedBlocks;
	}

	/** 按优先级阈值后推内容块。 */
	async postponeByPriority(deckId: string, maxPriority: number, days: number): Promise<IRBlock[]> {
		await this.initialize();

		const blocks = await this.storage.getBlocksByDeck(deckId);
		const postponedBlocks = this.queueGenerator.postponeByPriority(blocks, maxPriority, days);
		await this.storage.saveBlocks(postponedBlocks);

		return postponedBlocks;
	}

	// ============================================
	// 标签组管理
	// ============================================

	/** 获取所有标签组。 */
	async getAllTagGroups(): Promise<IRTagGroup[]> {
		await this.initialize();
		return this.tagGroupService.getAllGroups();
	}

	/** 创建标签组。 */
	async createTagGroup(
		name: string,
		matchAnyTags: string[],
		description?: string
	): Promise<IRTagGroup> {
		await this.initialize();
		return this.tagGroupService.createGroup(name, matchAnyTags, description);
	}

	/** 删除标签组。 */
	async deleteTagGroup(id: string): Promise<void> {
		await this.initialize();
		return this.tagGroupService.deleteGroup(id);
	}

	/** 获取标签组统计。 */
	async getTagGroupStats(): Promise<
		Array<{
			group: IRTagGroup;
			profile: IRTagGroupProfile;
			documentCount: number;
		}>
	> {
		await this.initialize();
		return this.tagGroupService.getGroupStats();
	}

	// ============================================
	// 统计与监控
	// ============================================

	/** 获取牌组的调度统计。 */
	async getScheduleStats(deckId: string): Promise<{
		newCount: number;
		learningCount: number;
		reviewCount: number;
		suspendedCount: number;
		dueToday: number;
		overdue: number;
		upcoming7Days: number;
		reachedDailyLimit: number;
	}> {
		await this.initialize();
		return this.scheduler.getScheduleStats(deckId);
	}

	/** 获取牌组的过载信息。 */
	async getOverloadInfo(deckId: string): Promise<{
		isOverloaded: boolean;
		dueCount: number;
		budgetCount: number;
		overloadRatio: number;
		groupOverload: Record<string, { due: number; ratio: number }>;
	}> {
		await this.initialize();

		const blocks = await this.storage.getBlocksByDeck(deckId);
		const groupMapping = await this.buildGroupMapping(blocks);

		return this.queueGenerator.getOverloadStats(blocks, groupMapping);
	}

	// ============================================
	// 子服务访问
	// ============================================

	/** 暴露底层存储服务给高级调用方。 */
	getStorage(): IRStorageService {
		return this.storage;
	}

	/** 暴露底层调度器给高级调用方。 */
	getScheduler(): IRSchedulerV3 {
		return this.scheduler;
	}

	/** 暴露标签组服务给高级调用方。 */
	getTagGroupService(): IRTagGroupService {
		return this.tagGroupService;
	}

	/** 暴露队列生成器给高级调用方。 */
	getQueueGenerator(): IRQueueGenerator {
		return this.queueGenerator;
	}

	/** 构建文档到标签组的映射，供过载计算和分组调度复用。 */
	private async buildGroupMapping(blocks: IRBlock[]): Promise<Record<string, string>> {
		const groupMapping: Record<string, string> = {};

		for (const block of blocks) {
			if (!groupMapping[block.filePath]) {
				groupMapping[block.filePath] = await this.tagGroupService.matchGroupForDocument(
					block.filePath
				);
			}
		}

		return groupMapping;
	}
}

/** 创建调度外观实例。 */
export function createIRSchedulingFacade(
	app: App,
	config?: IRSchedulingFacadeConfig
): IRSchedulingFacade {
	return new IRSchedulingFacade(app, config);
}
