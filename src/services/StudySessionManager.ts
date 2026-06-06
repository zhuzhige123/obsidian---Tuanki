import type { TimerHandle } from "../types/timer";
/**
 * 学习会话管理器
 * 管理运行时学习状态，避免污染卡片数据
 *
 * 核心职责：
 * - 管理learningStepIndex等运行时状态
 * - 隔离会话数据与持久化数据
 * - 提供会话生命周期管理
 */

import type { Card } from "../data/types";
import { CardState } from "../data/types";
import type {
	PersistedStudySession,
	PersistedStudySessionStore,
	StudySessionSnapshot,
	StudySessionType,
} from "../types/study-types";
import { StepIndexCalculator } from "../utils/learning-steps/StepIndexCalculator";
import { logger } from "../utils/logger";

/**
 * 学习会话状态接口
 */
export interface StudySessionState {
	sessionId: string;
	cardId: string;
	learningStepIndex: number;
	startTime: number;
	interactionCount: number;
	currentState: CardState;
}

/**
 * FSRS更新数据接口
 */
export interface FSRSUpdateData {
	learningStepIndex?: number;
	interactionCount?: number;
	sessionDuration?: number;
}

/**
 * 学习会话管理器类
 */
export class StudySessionManager {
	private static instance: StudySessionManager | null = null;
	private sessions: Map<string, StudySessionState> = new Map();

	// 会话过期时间（2小时）
	private readonly SESSION_TIMEOUT = 2 * 60 * 60 * 1000;

	// 自动清理定时器
	private cleanupTimer: TimerHandle | null = null;

	// 按牌组保存的持久化会话状态
	private persistedSessions = new Map<string, PersistedStudySession>();
	private activePersistedDeckId: string | null = null;

	// 缓存Learning Steps配置（用于后续计算）
	private learningStepsConfig: Map<string, { learningSteps: number[]; relearningSteps: number[] }> =
		new Map();

	/**
	 * 私有构造函数（单例模式）
	 */
	private constructor() {
		this.startAutoCleanup();
	}

	/**
	 * 获取单例实例
	 */
	public static getInstance(): StudySessionManager {
		if (!StudySessionManager.instance) {
			StudySessionManager.instance = new StudySessionManager();
		}
		return StudySessionManager.instance;
	}

	public static destroyInstance(): void {
		if (!StudySessionManager.instance) {
			return;
		}

		StudySessionManager.instance.destroy();
		StudySessionManager.instance = null;
	}

	/**
	 * 创建学习会话
	 * @param card 当前卡片
	 * @param learningSteps 学习步骤配置（分钟）
	 * @param relearningSteps 重学步骤配置（分钟）
	 * @returns 会话ID
	 */
	public createSession(
		card: Card,
		learningSteps: number[] = [],
		relearningSteps: number[] = []
	): string {
		const sessionId = `${card.uuid}-${Date.now()}`;

		//  检查 FSRS 数据
		// V2架构：所有卡片（包括子卡片）都有独立的fsrs字段
		// 如果缺失 fsrs，则自动初始化
		if (!card.fsrs) {
			logger.warn(`[StudySessionManager] 卡片 ${card.uuid} 缺少FSRS数据，自动初始化`);
			// 自动初始化FSRS数据
			card.fsrs = {
				due: new Date().toISOString(),
				stability: 0,
				difficulty: 0,
				elapsedDays: 0,
				scheduledDays: 0,
				reps: 0,
				lapses: 0,
				state: 0, // CardState.New
				lastReview: new Date().toISOString(),
				retrievability: 0,
			};
		}

		// 使用 StepIndexCalculator 从 FSRS 数据推断 stepIndex
		// 统一从同一数据源计算，避免状态不一致
		const learningStepIndex = StepIndexCalculator.calculate(card, learningSteps, relearningSteps);

		// 缓存配置供后续使用
		this.learningStepsConfig.set(sessionId, { learningSteps, relearningSteps });

		const sessionState: StudySessionState = {
			sessionId,
			cardId: card.uuid,
			learningStepIndex,
			startTime: Date.now(),
			interactionCount: 0,
			currentState: card.fsrs?.state,
		};

		this.sessions.set(sessionId, sessionState);

		logger.debug(
			`[StudySessionManager] 创建会话: ${sessionId}, stepIndex: ${learningStepIndex} (从FSRS推断)`
		);

		return sessionId;
	}

	/**
	 * 获取会话状态
	 * @param sessionId 会话ID
	 * @returns 会话状态，如果不存在则返回null
	 */
	public getSessionState(sessionId: string): StudySessionState | null {
		return this.sessions.get(sessionId) || null;
	}

	/**
	 * 更新学习步骤索引
	 * @param sessionId 会话ID
	 * @param stepIndex 新的步骤索引
	 */
	public updateStepIndex(sessionId: string, stepIndex: number): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.learningStepIndex = stepIndex;
			session.interactionCount++;
			logger.debug(`[StudySessionManager] 更新步骤索引: ${sessionId}, stepIndex: ${stepIndex}`);
		} else {
			logger.warn(`[StudySessionManager] 会话不存在: ${sessionId}`);
		}
	}

	/**
	 * 更新会话状态
	 * @param sessionId 会话ID
	 * @param updates 状态更新
	 */
	public updateSession(sessionId: string, updates: Partial<StudySessionState>): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			Object.assign(session, updates);
		} else {
			logger.warn(`[StudySessionManager] 会话不存在: ${sessionId}`);
		}
	}

	/**
	 * 完成会话并提取需要持久化的数据
	 * @param sessionId 会话ID
	 * @returns FSRS更新数据（仅包含需要持久化的字段）
	 */
	public finalizeSession(sessionId: string): FSRSUpdateData {
		const session = this.sessions.get(sessionId);

		if (!session) {
			logger.warn(`[StudySessionManager] 会话不存在: ${sessionId}`);
			return {};
		}

		const sessionDuration = Date.now() - session.startTime;

		const updateData: FSRSUpdateData = {
			learningStepIndex: session.learningStepIndex,
			interactionCount: session.interactionCount,
			sessionDuration,
		};

		logger.debug(`[StudySessionManager] 会话完成: ${sessionId}, 时长: ${sessionDuration}ms`);

		return updateData;
	}

	/**
	 * 销毁会话
	 * @param sessionId 会话ID
	 */
	public dispose(sessionId: string): void {
		const deleted = this.sessions.delete(sessionId);
		// 清理配置缓存
		this.learningStepsConfig.delete(sessionId);
		if (deleted) {
			logger.debug(`[StudySessionManager] 销毁会话: ${sessionId}`);
		}
	}

	/**
	 * 清理所有会话（用于测试或重置）
	 */
	public clearAll(): void {
		const count = this.sessions.size;
		this.sessions.clear();
		this.learningStepsConfig.clear();
		logger.debug(`[StudySessionManager] 清理所有会话，共 ${count} 个`);
	}

	/**
	 * 启动自动清理过期会话
	 */
	private startAutoCleanup(): void {
		// 每30分钟检查一次
		this.cleanupTimer = window.setInterval(() => {
			this.cleanupExpiredSessions();
		}, 30 * 60 * 1000);
	}

	/**
	 * 清理过期会话
	 */
	private cleanupExpiredSessions(): void {
		const now = Date.now();
		const expiredSessions: string[] = [];

		for (const [sessionId, session] of this.sessions.entries()) {
			if (now - session.startTime > this.SESSION_TIMEOUT) {
				expiredSessions.push(sessionId);
			}
		}

		if (expiredSessions.length > 0) {
			for (const sessionId of expiredSessions) {
				this.sessions.delete(sessionId);
			}
			logger.debug(`[StudySessionManager] 清理过期会话: ${expiredSessions.length} 个`);
		}
	}

	/**
	 * 停止自动清理（用于插件卸载）
	 */
	public stopAutoCleanup(): void {
		if (this.cleanupTimer) {
			window.clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	public destroy(): void {
		this.stopAutoCleanup();
		this.clearAll();
		this.clearPersistedSession();
	}

	/**
	 * 获取当前活跃会话数量
	 */
	public getActiveSessionCount(): number {
		return this.sessions.size;
	}

	/**
	 * 调试：打印所有活跃会话
	 */
	public debugPrintSessions(): void {
		logger.debug(`[StudySessionManager] 活跃会话数: ${this.sessions.size}`);
		for (const [sessionId, session] of this.sessions.entries()) {
			logger.debug(
				`  - ${sessionId}: cardId=${session.cardId}, stepIndex=${session.learningStepIndex}`
			);
		}
	}

	// ==================== 持久化相关方法 ====================

	/**
	 * 持久化会话状态
	 * @param sessionId 会话ID
	 * @param additionalData 额外的持久化数据（卡片列表、统计等）
	 * @returns 持久化的会话数据
	 */
	public persistSession(
		sessionId: string,
		additionalData: StudySessionSnapshot & {
			currentCardId: string;
			sessionType: StudySessionType;
		}
	): PersistedStudySession {
		const session = this.sessions.get(sessionId);

		if (!session) {
			throw new Error(`[StudySessionManager] 无法持久化：会话不存在 ${sessionId}`);
		}

		const persistedSession: PersistedStudySession = {
			sessionId,
			deckId: additionalData.deckId,
			currentCardIndex: additionalData.currentCardIndex,
			currentCardId: additionalData.currentCardId,
			remainingCardIds: additionalData.remainingCardIds,
			startTime: session.startTime,
			pauseTime: Date.now(),
			stats: additionalData.stats,
			isPaused: true,
			sessionType: additionalData.sessionType,
		};

		this.persistedSessions.set(persistedSession.deckId, persistedSession);
		this.activePersistedDeckId = persistedSession.deckId;

		logger.debug("[StudySessionManager] 会话已持久化:", sessionId);
		return persistedSession;
	}

	/**
	 * 恢复持久化的会话
	 * @param persisted 持久化的会话数据
	 * @returns 新的会话ID
	 */
	public restoreSession(persisted: PersistedStudySession): string {
		const sessionId = `restored-${Date.now()}`;

		// 恢复基础会话状态
		const sessionState: StudySessionState = {
			sessionId,
			cardId: persisted.currentCardId,
			learningStepIndex: 0, // 学习步骤索引在具体卡片学习时设置
			startTime: persisted.startTime,
			interactionCount: persisted.stats.completed,
			currentState: CardState.New, // 将在实际卡片加载时更新
		};

		this.sessions.set(sessionId, sessionState);

		// 清除当前牌组的持久化状态（已恢复）
		this.persistedSessions.delete(persisted.deckId);
		if (this.activePersistedDeckId === persisted.deckId) {
			const nextDeckId = this.persistedSessions.keys().next().value;
			this.activePersistedDeckId = typeof nextDeckId === "string" ? nextDeckId : null;
		}

		logger.debug("[StudySessionManager] 会话已恢复:", sessionId);
		return sessionId;
	}

	/**
	 * 暂停会话
	 * @param sessionId 会话ID
	 */
	public pauseSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			logger.debug("[StudySessionManager] 会话已暂停:", sessionId);
			// 实际的暂停逻辑由调用方（如StudyView）处理
			// 这里只做标记和日志记录
		} else {
			logger.warn(`[StudySessionManager] 无法暂停：会话不存在 ${sessionId}`);
		}
	}

	/**
	 * 恢复会话
	 * @param sessionId 会话ID
	 */
	public resumeSession(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			logger.debug("[StudySessionManager] 会话已恢复:", sessionId);
			// 实际的恢复逻辑由调用方处理
		} else {
			logger.warn(`[StudySessionManager] 无法恢复：会话不存在 ${sessionId}`);
		}
	}

	/**
	 * 检查是否有持久化的会话
	 * @returns 是否存在持久化会话
	 */
	public hasPersistedSession(deckId?: string): boolean {
		if (deckId !== undefined) {
			return this.persistedSessions.has(deckId);
		}
		return this.persistedSessions.size > 0;
	}

	/**
	 * 获取持久化的会话
	 * @returns 持久化的会话数据，如果不存在则返回null
	 */
	public getPersistedSession(deckId?: string): PersistedStudySession | null {
		if (deckId !== undefined) {
			return this.persistedSessions.get(deckId) ?? null;
		}

		if (this.activePersistedDeckId) {
			return this.persistedSessions.get(this.activePersistedDeckId) ?? null;
		}

		const firstSession = this.persistedSessions.values().next();
		return firstSession.done ? null : firstSession.value;
	}

	public getPersistedSessionStore(): PersistedStudySessionStore | null {
		if (this.persistedSessions.size === 0) {
			return null;
		}

		const sessionsByDeckId: Record<string, PersistedStudySession> = {};
		for (const [deckId, session] of this.persistedSessions.entries()) {
			sessionsByDeckId[deckId] = session;
		}

		return {
			activeDeckId: this.activePersistedDeckId ?? undefined,
			sessionsByDeckId,
		};
	}

	/**
	 * 清除持久化的会话
	 */
	public clearPersistedSession(deckId?: string): void {
		if (deckId !== undefined) {
			const session = this.persistedSessions.get(deckId);
			if (session) {
				logger.debug("[StudySessionManager] 持久化会话已清除:", session.sessionId);
				this.persistedSessions.delete(deckId);
				if (this.activePersistedDeckId === deckId) {
					const nextDeckId = this.persistedSessions.keys().next().value;
					this.activePersistedDeckId = typeof nextDeckId === "string" ? nextDeckId : null;
				}
			}
			return;
		}

		if (this.persistedSessions.size > 0) {
			logger.debug("[StudySessionManager] 已清除全部持久化会话:", this.persistedSessions.size);
			this.persistedSessions.clear();
			this.activePersistedDeckId = null;
		}
	}

	/**
	 * 设置持久化会话（用于从磁盘加载）
	 * @param session 持久化的会话数据
	 */
	public setPersistedSession(session: PersistedStudySession): void {
		this.persistedSessions.set(session.deckId, session);
		this.activePersistedDeckId = session.deckId;
		logger.debug("[StudySessionManager] 持久化会话已设置:", session.sessionId);
	}

	public setPersistedSessionStore(store: PersistedStudySessionStore): void {
		this.persistedSessions = new Map(Object.entries(store.sessionsByDeckId));
		const nextActiveDeckId =
			store.activeDeckId && this.persistedSessions.has(store.activeDeckId)
				? store.activeDeckId
				: this.persistedSessions.keys().next().value;
		this.activePersistedDeckId = typeof nextActiveDeckId === "string" ? nextActiveDeckId : null;
		logger.debug("[StudySessionManager] 持久化会话集合已设置:", this.persistedSessions.size);
	}
}
