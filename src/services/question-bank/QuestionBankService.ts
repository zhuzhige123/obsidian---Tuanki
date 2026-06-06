import { logger } from "../../utils/logger";
/**
 * 题库核心服务
 *
 * 提供考试题组和题目卡片的CRUD操作
 *
 *  数据管理策略：
 * - 内存缓存：所有题库和题目都加载到内存中（this.banks, this.questions）
 * - 按题库存储：每个题库的题目独立存储在各自的 questions.json 文件中
 * - 增量保存：修改单个题库时，只更新该题库的 questions.json，不影响其他题库
 *
 *  保存策略：
 * - 添加题目 → 只保存该题库的 questions.json
 * - 更新题目 → 只保存该题库的 questions.json
 * - 删除题目 → 只保存该题库的 questions.json
 * - 删除题库 → 删除整个题库文件夹
 *
 * @module services/question-bank/QuestionBankService
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck, DeckSettings, DeckStats } from "../../data/types";
import type {
	QuestionBankFilter,
	QuestionBankStats,
	QuestionRef,
	QuestionTestStats,
} from "../../types/question-bank-types";
import { generateId } from "../../utils/helpers";
import { computeQuestionBankDisplayStats } from "../../utils/question-bank/question-bank-display-stats";
import { QuestionBankStorage } from "./QuestionBankStorage";

export interface QuestionBankMatchCandidate {
	bank: Deck;
	matchType: "pairedMemoryDeckId" | "card-overlap";
	overlapCount: number;
	totalRefs: number;
}

/**
 * 题库核心服务
 */
export class QuestionBankService {
	private storage: QuestionBankStorage;
	private banks: Deck[] = [];
	private dataStorage: WeaveDataStorage;

	constructor(storage: QuestionBankStorage, dataStorage: WeaveDataStorage) {
		if (!storage) {
			throw new Error("QuestionBankService requires a valid QuestionBankStorage instance");
		}
		if (!dataStorage) {
			throw new Error("QuestionBankService requires a valid WeaveDataStorage instance");
		}
		this.storage = storage;
		this.dataStorage = dataStorage;
		// 服务初始化完成
	}

	// ============================================================================
	// 初始化
	// ============================================================================

	/**
	 * 初始化服务（加载数据）
	 * 注意：QuestionBankStorage 应该在传入前已经初始化
	 */
	async initialize(): Promise<void> {
		await this.loadData();
	}

	/**
	 * 加载所有数据（按题库加载）
	 */
	private async loadData(): Promise<void> {
		this.banks = await this.storage.loadBanks();

		//  调试日志：显示从存储加载的原始数据
		logger.debug(
			"[QuestionBankService] loadData 从存储加载的题库:",
			this.banks.map((b) => ({
				id: b.id,
				name: b.name,
				pairedMemoryDeckId: (b.metadata as any)?.pairedMemoryDeckId,
			}))
		);

		// 防御性检查：确保数据格式正确
		if (!Array.isArray(this.banks)) {
			logger.error("[QuestionBankService] banks 数据损坏，重置为空数组");
			this.banks = [];
			await this.storage.saveBanks([]);
		}

		// 题库数据加载完成
	}

	/**
	 * 保存所有数据（按题库保存）
	 */
	private async saveData(): Promise<void> {
		await this.storage.saveBanks(this.banks);
	}

	// ============================================================================
	// 考试题组管理
	// ============================================================================

	/**
	 * 创建考试题组
	 * @param name 题库名称
	 * @param description 题库描述
	 * @param initialMetadata 初始 metadata（可选，用于设置 pairedMemoryDeckId 等）
	 */
	async createQuestionBank(
		name: string,
		description = "",
		initialMetadata?: Record<string, any>
	): Promise<Deck> {
		const now = new Date().toISOString();

		const bank: Deck = {
			id: generateId(),
			name,
			description,
			category: "",
			categoryIds: [],
			parentId: undefined,
			path: name,
			level: 0,
			order: this.banks.length,
			inheritSettings: false,
			deckType: "question-bank",
			settings: await this.getDefaultSettings(),
			stats: this.getDefaultStats(),
			includeSubdecks: false,
			created: now,
			modified: now,
			tags: [],
			metadata: initialMetadata || {},
		};

		this.banks.push(bank);
		await this.storage.saveBanks(this.banks);

		// 题库创建成功
		logger.debug("[QuestionBankService] createQuestionBank 完成:", {
			bankId: bank.id,
			bankName: bank.name,
			pairedMemoryDeckId: (bank.metadata as any)?.pairedMemoryDeckId,
		});

		return bank;
	}

	/**
	 * 获取考试题组
	 */
	getQuestionBank(bankId: string): Deck | undefined {
		return this.banks.find((b) => b.id === bankId);
	}

	/**
	 * 获取所有考试题组
	 */
	getAllQuestionBanks(): Deck[] {
		return [...this.banks];
	}

	/**
	 * 获取所有题库（别名方法）
	 * 每次调用时从存储重新加载，确保数据一致性
	 */
	async getAllBanks(): Promise<Deck[]> {
		//  从存储重新加载数据，避免内存缓存导致的残留数据问题
		await this.loadData();
		return this.getAllQuestionBanks();
	}

	async pairBankWithMemoryDeck(bankId: string, memoryDeckId: string): Promise<Deck> {
		await this.loadData();

		const targetBank = this.banks.find((bank) => bank.id === bankId);
		if (!targetBank) {
			throw new Error(`题库不存在: ${bankId}`);
		}

		const now = new Date().toISOString();
		let changed = false;

		for (const bank of this.banks) {
			const metadata = (bank.metadata ??= {});
			const pairedId = (metadata as any).pairedMemoryDeckId;
			if (bank.id !== bankId && pairedId === memoryDeckId) {
				delete (metadata as any).pairedMemoryDeckId;
				bank.modified = now;
				changed = true;
			}
		}

		const targetMetadata = (targetBank.metadata ??= {});
		if ((targetMetadata as any).pairedMemoryDeckId !== memoryDeckId) {
			(targetMetadata as any).pairedMemoryDeckId = memoryDeckId;
			targetBank.modified = now;
			changed = true;
		}

		if (changed) {
			await this.storage.saveBanks(this.banks);
		}

		return targetBank;
	}

	/**
	 * 根据ID获取题库（别名方法）
	 */
	getBankById(bankId: string): Deck | null {
		return this.getQuestionBank(bankId) || null;
	}

	async getBankCandidatesByMemoryDeckId(
		memoryDeckId: string
	): Promise<QuestionBankMatchCandidate[]> {
		await this.loadData();
		const allBanks = this.getAllQuestionBanks();

		const pairedBanks = allBanks.filter(
			(b) => b.metadata && (b.metadata as any).pairedMemoryDeckId === memoryDeckId
		);
		if (pairedBanks.length > 0) {
			return pairedBanks.map((bank) => ({
				bank,
				matchType: "pairedMemoryDeckId",
				overlapCount: Number.MAX_SAFE_INTEGER,
				totalRefs: Number((bank.metadata as any)?.questionCount || 0),
			}));
		}

		const memoryDeck = await this.dataStorage.getDeck(memoryDeckId);
		const memoryCardUUIDs = new Set((memoryDeck?.cardUUIDs || []).filter(Boolean));
		if (memoryCardUUIDs.size === 0) {
			return [];
		}

		const candidates: QuestionBankMatchCandidate[] = [];
		for (const bank of allBanks) {
			const refs = await this.storage.loadBankQuestionRefs(bank.id);
			if (refs.length === 0) continue;

			let overlapCount = 0;
			for (const ref of refs) {
				if (memoryCardUUIDs.has(ref.cardUuid)) {
					overlapCount++;
				}
			}

			if (overlapCount > 0) {
				candidates.push({
					bank,
					overlapCount,
					totalRefs: refs.length,
					matchType: "card-overlap",
				});
			}
		}

		candidates.sort((a, b) => {
			if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
			if (a.totalRefs !== b.totalRefs) return a.totalRefs - b.totalRefs;
			return (a.bank.order || 0) - (b.bank.order || 0);
		});

		return candidates;
	}

	/**
	 * 根据记忆牌组ID查找对应的考试题组
	 * 优先使用显式 pairedMemoryDeckId，缺失时再按实际卡片引用关系回退查找。
	 */
	async findBankByMemoryDeckId(memoryDeckId: string): Promise<Deck | null> {
		await this.loadData();
		const allBanks = this.getAllQuestionBanks();

		const pairedBank = allBanks.find(
			(b) => b.metadata && (b.metadata as any).pairedMemoryDeckId === memoryDeckId
		);

		if (pairedBank) {
			logger.debug("[QuestionBankService] findBankByMemoryDeckId: 命中显式关联", {
				searchingFor: memoryDeckId,
				found: true,
				bankName: pairedBank.name,
				matchType: "pairedMemoryDeckId",
			});
			return pairedBank;
		}

		const memoryDeck = await this.dataStorage.getDeck(memoryDeckId);
		const memoryCardUUIDs = new Set((memoryDeck?.cardUUIDs || []).filter(Boolean));

		if (memoryCardUUIDs.size === 0) {
			logger.debug(
				"[QuestionBankService] findBankByMemoryDeckId: 记忆牌组没有可用于回退匹配的卡片引用",
				{
					searchingFor: memoryDeckId,
					found: false,
					matchType: "none",
				}
			);
			return null;
		}

		const candidates: Array<{ bank: Deck; overlapCount: number; totalRefs: number }> = [];
		for (const bank of allBanks) {
			const refs = await this.storage.loadBankQuestionRefs(bank.id);
			if (refs.length === 0) continue;

			let overlapCount = 0;
			for (const ref of refs) {
				if (memoryCardUUIDs.has(ref.cardUuid)) {
					overlapCount++;
				}
			}

			if (overlapCount > 0) {
				candidates.push({
					bank,
					overlapCount,
					totalRefs: refs.length,
				});
			}
		}

		candidates.sort((a, b) => {
			if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
			if (a.totalRefs !== b.totalRefs) return a.totalRefs - b.totalRefs;
			return (a.bank.order || 0) - (b.bank.order || 0);
		});

		const best = candidates[0];
		const second = candidates[1];
		const hasClearWinner = !!best && (!second || best.overlapCount > second.overlapCount);

		if (hasClearWinner && best) {
			logger.info("[QuestionBankService] findBankByMemoryDeckId: 通过卡片引用关系匹配到题库", {
				searchingFor: memoryDeckId,
				bankName: best.bank.name,
				overlapCount: best.overlapCount,
				totalRefs: best.totalRefs,
				matchType: "card-overlap",
			});
			return best.bank;
		}

		logger.debug("[QuestionBankService] findBankByMemoryDeckId:", {
			searchingFor: memoryDeckId,
			found: false,
			bankName: undefined,
			matchType: candidates.length > 1 ? "ambiguous-card-overlap" : "none",
			candidates: candidates.slice(0, 3).map((candidate) => ({
				bankId: candidate.bank.id,
				bankName: candidate.bank.name,
				overlapCount: candidate.overlapCount,
				totalRefs: candidate.totalRefs,
			})),
		});

		return null;
	}

	/**
	 * 创建题库（别名方法，兼容 QuestionBank 接口）
	 * 在创建时就设置完整的 metadata，避免竞态条件
	 */
	async createBank(bank: Partial<Deck>): Promise<Deck> {
		const name = bank.name || "未命名考试题组";
		const description = bank.description || "";

		// 在创建时就传入 metadata，避免后续更新时的竞态条件
		// 之前的问题：createQuestionBank 先保存空 metadata，然后再更新
		// 如果在两次保存之间有 loadData() 调用，metadata 会丢失
		const initialMetadata = bank.metadata ? { ...bank.metadata } : {};

		//  直接传入 metadata 到 createQuestionBank
		const createdBank = await this.createQuestionBank(name, description, initialMetadata);

		// 构建其他更新（不包括 metadata，因为已经在创建时设置）
		const updates: Partial<Deck> = {};

		if ((bank as any).difficulty) (updates as any).difficulty = (bank as any).difficulty;
		if (bank.tags) updates.tags = bank.tags;
		if (bank.category) updates.category = bank.category;
		if (bank.parentId !== undefined) updates.parentId = bank.parentId;
		if (bank.path) updates.path = bank.path;
		if (bank.level !== undefined) updates.level = bank.level;
		if (bank.order !== undefined) updates.order = bank.order;
		if (bank.deckType) updates.deckType = bank.deckType;

		// 如果有其他更新，应用它们
		if (Object.keys(updates).length > 0) {
			Object.assign(createdBank, updates);

			// 保存到存储
			await this.storage.saveBanks(this.banks);
		}

		return createdBank;
	}

	/**
	 * 更新题库（别名方法，兼容整个对象更新）
	 */
	async updateBank(bank: Deck): Promise<void> {
		await this.updateQuestionBank(bank.id, bank);
	}

	/**
	 * 更新考试题组
	 */
	async updateQuestionBank(bankId: string, updates: Partial<Deck>): Promise<void> {
		const bank = this.banks.find((b) => b.id === bankId);
		if (!bank) {
			throw new Error(`题库不存在: ${bankId}`);
		}

		// 特殊处理 metadata 字段，确保合并而不是替换
		if (updates.metadata) {
			// 确保 bank 有 metadata 对象
			if (!bank.metadata) {
				bank.metadata = {};
			}

			// 合并 metadata
			bank.metadata = {
				...bank.metadata,
				...updates.metadata,
			};

			// 从 updates 中移除 metadata，避免 Object.assign 覆盖
			const { metadata, ...restUpdates } = updates;
			Object.assign(bank, restUpdates);
		} else {
			Object.assign(bank, updates);
		}

		bank.modified = new Date().toISOString();

		await this.storage.saveBanks(this.banks);

		// 题库更新成功
	}

	/**
	 * 删除题库（别名方法）
	 */
	async deleteBank(bankId: string): Promise<void> {
		await this.deleteQuestionBank(bankId);
	}

	/**
	 * 更新题库配置
	 */
	async updateBankConfig(bankId: string, config: any): Promise<void> {
		const bank = this.banks.find((b) => b.id === bankId);
		if (!bank) {
			throw new Error(`题库不存在: ${bankId}`);
		}

		// 确保metadata存在
		if (!bank.metadata) {
			bank.metadata = {};
		}

		// 确保config存在
		if (!(bank.metadata as any).config) {
			(bank.metadata as any).config = {};
		}

		// 更新modeConfig
		(bank.metadata as any).config.modeConfig = config;

		bank.modified = new Date().toISOString();

		await this.storage.saveBanks(this.banks);

		// 题库配置更新成功
	}

	/**
	 * 删除考试题组（及其所有题目）
	 */
	async deleteQuestionBank(bankId: string): Promise<void> {
		const index = this.banks.findIndex((b) => b.id === bankId);
		if (index === -1) {
			throw new Error(`题库不存在: ${bankId}`);
		}

		// 数据安全优先：只删除用户明确选择的题库，不按 pairedMemoryDeckId 连带删除其它题库。
		const bankIdsToDelete = [this.banks[index].id];

		for (const id of bankIdsToDelete) {
			try {
				await this.storage.deleteBankData(id);
			} catch (error) {
				logger.error(`[QuestionBankService] 删除题库数据失败: ${id}`, error);
			}
		}

		// 删除题库（内存）
		const toDelete = new Set(bankIdsToDelete);
		this.banks = this.banks.filter((b) => !toDelete.has(b.id));
		await this.storage.saveBanks(this.banks);

		// 题库删除成功
	}

	// ============================================================================
	// 题目管理
	// ============================================================================

	/**
	 * 添加题目到题库
	 */
	async addQuestion(bankId: string, question: Card): Promise<void> {
		await this.addQuestionRefs(bankId, [question.uuid]);
	}

	/**
	 * 批量添加题目
	 */
	async addQuestions(bankId: string, questions: Card[]): Promise<void> {
		await this.addQuestionRefs(
			bankId,
			questions.map((q) => q.uuid)
		);
	}

	async addQuestionRefs(bankId: string, cardUuids: string[]): Promise<void> {
		const bank = this.getQuestionBank(bankId);
		if (!bank) {
			throw new Error(`题库不存在: ${bankId}`);
		}

		const refs = await this.storage.loadBankQuestionRefs(bankId);
		const existing = new Set(refs.map((r) => r.cardUuid));
		const now = new Date().toISOString();

		for (const uuid of cardUuids) {
			if (!uuid || existing.has(uuid)) continue;
			refs.push({ cardUuid: uuid, addedAt: now });
			existing.add(uuid);
		}

		await this.storage.saveBankQuestionRefs(bankId, refs);
		await this.updateBankStats(bankId);
	}

	async removeQuestionRefs(bankId: string, cardUuids: string[]): Promise<void> {
		const bank = this.getQuestionBank(bankId);
		if (!bank) {
			throw new Error(`题库不存在: ${bankId}`);
		}

		const removeSet = new Set(cardUuids.filter(Boolean));
		if (removeSet.size === 0) {
			return;
		}

		const refs = await this.storage.loadBankQuestionRefs(bankId);
		const filteredRefs = refs.filter((ref) => !removeSet.has(ref.cardUuid));

		if (filteredRefs.length === refs.length) {
			return;
		}

		await this.storage.saveBankQuestionRefs(bankId, filteredRefs);
		await this.updateBankStats(bankId);
	}

	async cleanupDeletedMemoryCards(cardUuids: string[]): Promise<void> {
		const uniqueCardUuids = Array.from(new Set(cardUuids.filter(Boolean)));
		if (uniqueCardUuids.length === 0) {
			return;
		}

		const cleanupResult = await this.storage.cleanupDeletedCards(uniqueCardUuids);
		if (cleanupResult.affectedBankIds.length === 0) {
			return;
		}

		for (const bankId of cleanupResult.affectedBankIds) {
			await this.updateBankStats(bankId);
		}

		logger.info("[QuestionBankService] 已清理已删除记忆卡片在考试题库中的残留数据", {
			cardCount: uniqueCardUuids.length,
			affectedBanks: cleanupResult.affectedBankIds.length,
			removedRefs: cleanupResult.removedRefs,
			removedGlobalStats: cleanupResult.removedGlobalStats,
			removedErrorBookEntries: cleanupResult.removedErrorBookEntries,
			updatedInProgressSessions: cleanupResult.updatedInProgressSessions,
			removedInProgressSessions: cleanupResult.removedInProgressSessions,
			updatedSessionArchives: cleanupResult.updatedSessionArchives,
			removedSessionArchives: cleanupResult.removedSessionArchives,
		});
	}

	/**
	 * 根据ID获取题目（async版本，用于实时刷新）
	 *  先从内存查找，找不到则从数据库重新加载
	 */
	async getQuestionById(bankId: string, questionId: string): Promise<Card | null> {
		try {
			const questions = await this.getQuestionsByBank(bankId);
			return questions.find((q) => q.uuid === questionId) || null;
		} catch (error) {
			logger.error("[QuestionBankService] 获取题目失败:", questionId, error);
			return null;
		}
	}

	/**
	 * 更新题目
	 */
	async updateQuestion(questionId: string, updates: Partial<Card>): Promise<void> {
		const card = await this.dataStorage.getCardByUUID(questionId);
		if (!card) {
			throw new Error(`题目不存在: ${questionId}`);
		}

		const { stats, deckId, cardPurpose, ...rest } = updates as any;
		Object.assign(card, rest);
		card.modified = new Date().toISOString();
		await this.dataStorage.saveCard(card);
	}

	/**
	 * 删除题目
	 * @param questionIdOrBankId - 题目ID，或者第一个参数为bankId时的bankId
	 * @param questionId - 当第一个参数为bankId时的题目ID
	 */
	async deleteQuestion(questionIdOrBankId: string, questionId?: string): Promise<void> {
		// 兼容两种调用方式：
		// 1. deleteQuestion(questionId)
		// 2. deleteQuestion(bankId, questionId)
		const actualQuestionId = questionId || questionIdOrBankId;

		let bankId = questionId ? questionIdOrBankId : undefined;
		if (!bankId) {
			// 兼容旧调用：自动定位所属题库（首次命中即返回）
			for (const bank of this.banks) {
				const refs = await this.storage.loadBankQuestionRefs(bank.id);
				if (refs.some((r) => r.cardUuid === actualQuestionId)) {
					bankId = bank.id;
					break;
				}
			}
		}
		if (!bankId) {
			throw new Error("deleteQuestion 无法定位题库，请提供 bankId");
		}

		const refs = await this.storage.loadBankQuestionRefs(bankId);
		const filtered = refs.filter((r) => r.cardUuid !== actualQuestionId);
		await this.storage.saveBankQuestionRefs(bankId, filtered);

		await this.updateBankStats(bankId);
	}

	// ============================================================================
	// 题目查询
	// ============================================================================

	private async resolveCardsByUuidsFromAllCards(uuids: string[]): Promise<Card[]> {
		if (uuids.length === 0) return [];

		const allCards = await this.dataStorage.getCards();
		const cardByUuid = new Map<string, Card>();
		for (const c of allCards) {
			cardByUuid.set(c.uuid, c);
		}

		const resolved: Card[] = [];
		let missingCount = 0;

		for (const uuid of uuids) {
			const card = cardByUuid.get(uuid);
			if (!card) {
				missingCount++;
				continue;
			}
			resolved.push(card);
		}

		if (missingCount > 0) {
			logger.warn("[QuestionBankService] 题库引用的卡片未找到（可能被删除或索引未同步）:", {
				requested: uuids.length,
				resolved: resolved.length,
				missing: missingCount,
			});
		}

		return resolved;
	}

	/**
	 * 获取题库的所有题目
	 */
	async getQuestionsByBank(bankId: string, filter?: QuestionBankFilter): Promise<Card[]> {
		const refs = await this.storage.loadBankQuestionRefs(bankId);
		const uuids = refs.map((r) => r.cardUuid).filter(Boolean);
		// 不能使用 dataStorage.getCardsByUUIDs：它可能受 deck 过滤/索引状态影响，导致题库引用题目被错误过滤为空
		const cards = await this.resolveCardsByUuidsFromAllCards(uuids);

		const statsByUuid = await this.storage.loadGlobalQuestionStats();
		const merged = cards.map((c) => {
			const clone: Card = { ...c, deckId: bankId, cardPurpose: "test" as any };
			const testStats = statsByUuid[c.uuid];
			if (testStats) {
				clone.stats = clone.stats ? { ...clone.stats, testStats } : ({ testStats } as any);
			}
			return clone;
		});

		if (filter) {
			return this.applyFilter(merged, filter);
		}

		return merged;
	}

	/**
	 * 获取未测试的题目
	 */
	async getUntestedQuestions(bankId: string): Promise<Card[]> {
		const questions = await this.getQuestionsByBank(bankId);
		return questions.filter((q) => !q.stats?.testStats || q.stats.testStats.totalAttempts === 0);
	}

	/**
	 * 获取错题
	 */
	async getErrorQuestions(bankId: string): Promise<Card[]> {
		const questions = await this.getQuestionsByBank(bankId);
		return questions.filter((q) => !!q.stats?.testStats?.isInErrorBook);
	}

	/**
	 * 应用筛选条件
	 */
	private applyFilter(questions: Card[], filter: QuestionBankFilter): Card[] {
		let result = [...questions];

		// 按标签筛选
		if (filter.tags && filter.tags.length > 0) {
			result = result.filter((q) => filter.tags?.some((tag) => q.tags?.includes(tag)));
		}

		// 按难度筛选
		if (filter.difficulty) {
			result = result.filter((q) => q.difficulty === filter.difficulty);
		}

		// 按题型筛选
		if (filter.cardType) {
			// TODO: 需要实现题型映射逻辑
		}

		// 仅未测试题目
		if (filter.untestedOnly) {
			result = result.filter((q) => !q.stats?.testStats || q.stats.testStats.totalAttempts === 0);
		}

		// 仅错题
		if (filter.errorOnly) {
			result = result.filter((q) => q.stats?.testStats?.isInErrorBook);
		}

		return result;
	}

	// ============================================================================
	// 统计信息
	// ============================================================================

	/**
	 * 更新题库统计信息
	 */
	private async updateBankStats(bankId: string): Promise<void> {
		const bank = this.getQuestionBank(bankId);
		if (!bank) return;

		const questions = await this.getQuestionsByBank(bankId);

		const displayStats = computeQuestionBankDisplayStats(questions);
		const totalQuestions = displayStats.total;
		const testedQuestions = displayStats.completed;
		const averageAccuracy = displayStats.accuracy / 100;

		const testedQuestionsWithStats = questions.filter(
			(q) => q.stats?.testStats && q.stats.testStats.totalAttempts > 0
		);

		const averageScore =
			testedQuestionsWithStats.length > 0
				? testedQuestionsWithStats.reduce(
						(sum, q) => sum + (q.stats.testStats?.averageScore || 0),
						0
				  ) / testedQuestionsWithStats.length
				: 0;

		// 统计错题数量
		const errorCount = questions.filter((q) => q.stats.testStats?.isInErrorBook).length;

		// 按难度分布
		const byDifficulty = {
			easy: questions.filter((q) => q.difficulty === "easy").length,
			medium: questions.filter((q) => q.difficulty === "medium").length,
			hard: questions.filter((q) => q.difficulty === "hard").length,
		};

		// 更新元数据中的统计信息
		if (!bank.metadata) {
			bank.metadata = {};
		}

		bank.metadata.questionBankStats = {
			totalQuestions,
			testedQuestions,
			averageAccuracy,
			averageScore,
			averageCompletionTime: 0, // TODO: 从测试会话中计算
			errorCount,
			totalTests: 0, // TODO: 从测试会话中计算
			byDifficulty,
		} as QuestionBankStats;

		bank.modified = new Date().toISOString();

		await this.storage.saveBanks(this.banks);
	}

	/**
	 * 获取题库统计信息
	 */
	async getBankStats(bankId: string): Promise<QuestionBankStats | null> {
		const bank = this.getQuestionBank(bankId);
		if (!bank) return null;

		// 确保统计信息是最新的
		await this.updateBankStats(bankId);

		return (bank.metadata?.questionBankStats as QuestionBankStats) || null;
	}

	// ============================================================================
	// 辅助方法
	// ============================================================================

	/**
	 * 获取默认牌组设置
	 */
	private async getDefaultSettings(): Promise<DeckSettings> {
		return this.dataStorage.getCurrentDefaultDeckSettings({
			newCardsPerDay: 20,
			maxReviewsPerDay: 200,
			enableAutoAdvance: false,
			showAnswerTime: 0,
		});
	}

	/**
	 * 获取默认统计信息
	 */
	private getDefaultStats(): DeckStats {
		return {
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
		};
	}
}
