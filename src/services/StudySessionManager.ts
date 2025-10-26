/**
 * 学习会话管理器
 * 管理运行时学习状态，避免污染卡片数据
 * 
 * 核心职责：
 * - 管理learningStepIndex等运行时状态
 * - 隔离会话数据与持久化数据
 * - 提供会话生命周期管理
 */

import type { Card } from '../data/types';
import { CardState } from '../data/types';
import type { PersistedStudySession } from '../types/study-types';

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
  private static instance: StudySessionManager;
  private sessions: Map<string, StudySessionState> = new Map();
  
  // 会话过期时间（2小时）
  private readonly SESSION_TIMEOUT = 2 * 60 * 60 * 1000;
  
  // 自动清理定时器
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // 持久化的会话状态
  private persistedSession: PersistedStudySession | null = null;

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

  /**
   * 创建学习会话
   * @param card 当前卡片
   * @returns 会话ID
   */
  public createSession(card: Card): string {
    const sessionId = `${card.id}-${Date.now()}`;
    
    // 从卡片fields中读取learningStepIndex（向后兼容）
    const learningStepIndex = Number(card.fields?.learningStepIndex ?? 0);
    
    const sessionState: StudySessionState = {
      sessionId,
      cardId: card.id,
      learningStepIndex,
      startTime: Date.now(),
      interactionCount: 0,
      currentState: card.fsrs.state
    };
    
    this.sessions.set(sessionId, sessionState);
    
    console.log(`[StudySessionManager] 创建会话: ${sessionId}, stepIndex: ${learningStepIndex}`);
    
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
      console.log(`[StudySessionManager] 更新步骤索引: ${sessionId}, stepIndex: ${stepIndex}`);
    } else {
      console.warn(`[StudySessionManager] 会话不存在: ${sessionId}`);
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
      console.warn(`[StudySessionManager] 会话不存在: ${sessionId}`);
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
      console.warn(`[StudySessionManager] 会话不存在: ${sessionId}`);
      return {};
    }
    
    const sessionDuration = Date.now() - session.startTime;
    
    const updateData: FSRSUpdateData = {
      learningStepIndex: session.learningStepIndex,
      interactionCount: session.interactionCount,
      sessionDuration
    };
    
    console.log(`[StudySessionManager] 会话完成: ${sessionId}, 时长: ${sessionDuration}ms`);
    
    return updateData;
  }

  /**
   * 销毁会话
   * @param sessionId 会话ID
   */
  public dispose(sessionId: string): void {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      console.log(`[StudySessionManager] 销毁会话: ${sessionId}`);
    }
  }

  /**
   * 清理所有会话（用于测试或重置）
   */
  public clearAll(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    console.log(`[StudySessionManager] 清理所有会话，共 ${count} 个`);
  }

  /**
   * 启动自动清理过期会话
   */
  private startAutoCleanup(): void {
    // 每30分钟检查一次
    this.cleanupTimer = setInterval(() => {
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
      expiredSessions.forEach(sessionId => this.sessions.delete(sessionId));
      console.log(`[StudySessionManager] 清理过期会话: ${expiredSessions.length} 个`);
    }
  }

  /**
   * 停止自动清理（用于插件卸载）
   */
  public stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
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
    console.log(`[StudySessionManager] 活跃会话数: ${this.sessions.size}`);
    for (const [sessionId, session] of this.sessions.entries()) {
      console.log(`  - ${sessionId}: cardId=${session.cardId}, stepIndex=${session.learningStepIndex}`);
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
    additionalData: {
      deckId: string;
      currentCardIndex: number;
      currentCardId: string;
      remainingCardIds: string[];
      stats: { completed: number; correct: number; incorrect: number };
      sessionType: 'review' | 'new' | 'learning' | 'mixed';
    }
  ): PersistedStudySession {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error(`[StudySessionManager] 无法持久化：会话不存在 ${sessionId}`);
    }
    
    this.persistedSession = {
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
    
    console.log('[StudySessionManager] 会话已持久化:', sessionId);
    return this.persistedSession;
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
    
    // 清除持久化状态（已恢复）
    this.persistedSession = null;
    
    console.log('[StudySessionManager] 会话已恢复:', sessionId);
    return sessionId;
  }

  /**
   * 暂停会话
   * @param sessionId 会话ID
   */
  public pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log('[StudySessionManager] 会话已暂停:', sessionId);
      // 实际的暂停逻辑由调用方（如StudyView）处理
      // 这里只做标记和日志记录
    } else {
      console.warn(`[StudySessionManager] 无法暂停：会话不存在 ${sessionId}`);
    }
  }

  /**
   * 恢复会话
   * @param sessionId 会话ID
   */
  public resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log('[StudySessionManager] 会话已恢复:', sessionId);
      // 实际的恢复逻辑由调用方处理
    } else {
      console.warn(`[StudySessionManager] 无法恢复：会话不存在 ${sessionId}`);
    }
  }

  /**
   * 检查是否有持久化的会话
   * @returns 是否存在持久化会话
   */
  public hasPersistedSession(): boolean {
    return this.persistedSession !== null;
  }

  /**
   * 获取持久化的会话
   * @returns 持久化的会话数据，如果不存在则返回null
   */
  public getPersistedSession(): PersistedStudySession | null {
    return this.persistedSession;
  }

  /**
   * 清除持久化的会话
   */
  public clearPersistedSession(): void {
    if (this.persistedSession) {
      console.log('[StudySessionManager] 持久化会话已清除:', this.persistedSession.sessionId);
      this.persistedSession = null;
    }
  }

  /**
   * 设置持久化会话（用于从磁盘加载）
   * @param session 持久化的会话数据
   */
  public setPersistedSession(session: PersistedStudySession): void {
    this.persistedSession = session;
    console.log('[StudySessionManager] 持久化会话已设置:', session.sessionId);
  }
}


