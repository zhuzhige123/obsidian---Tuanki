/**
 * 复习撤销管理器
 * 
 * 功能：
 * - 保存每次评分前的卡片和会话状态快照
 * - 支持撤销最近的评分操作
 * - 支持连续撤销（最多10次）
 * - 自动管理撤销栈大小
 */

import type { Card, Rating } from '../data/types';
import type { FSRSData } from '../algorithms/fsrs';
import type { Review } from '../data/types';

/**
 * 卡片统计数据接口
 */
export interface CardStats {
  totalReviews: number;
  totalTime: number;
  averageTime: number;
  memoryRate: number;
  predictionAccuracy?: number;
  stabilityTrend?: number;
  difficultyTrend?: number;
}

/**
 * 复习快照 - 记录评分前的完整状态
 */
export interface ReviewSnapshot {
  // 卡片索引位置
  cardIndex: number;
  
  // 卡片唯一标识
  cardId: string;
  
  // 卡片数据快照（评分前）
  cardSnapshot: {
    fsrs: FSRSData;
    reviewHistory: Review[];
    stats: CardStats;
    modified: string;
  };
  
  // 会话统计快照
  sessionSnapshot: {
    cardsReviewed: number;
    newCardsLearned: number;
    correctAnswers: number;
    totalTime: number;
  };
  
  // 评分操作信息
  reviewInfo: {
    rating: Rating;
    timestamp: number;
    responseTime: number;
  };
}

/**
 * 复习撤销管理器类
 */
export class ReviewUndoManager {
  // 撤销栈 - LIFO（后进先出）
  private undoStack: ReviewSnapshot[] = [];
  
  // 最大撤销次数
  private readonly MAX_STACK_SIZE = 10;

  /**
   * 构造函数
   */
  constructor() {
    console.log('[ReviewUndoManager] 初始化撤销管理器');
  }

  /**
   * 保存评分前的快照
   * 
   * @param snapshot - 快照数据
   */
  public saveSnapshot(snapshot: ReviewSnapshot): void {
    try {
      // 深拷贝防止引用污染
      const clonedSnapshot: ReviewSnapshot = {
        cardIndex: snapshot.cardIndex,
        cardId: snapshot.cardId,
        cardSnapshot: {
          fsrs: JSON.parse(JSON.stringify(snapshot.cardSnapshot.fsrs)),
          reviewHistory: JSON.parse(JSON.stringify(snapshot.cardSnapshot.reviewHistory)),
          stats: JSON.parse(JSON.stringify(snapshot.cardSnapshot.stats)),
          modified: snapshot.cardSnapshot.modified
        },
        sessionSnapshot: {
          cardsReviewed: snapshot.sessionSnapshot.cardsReviewed,
          newCardsLearned: snapshot.sessionSnapshot.newCardsLearned,
          correctAnswers: snapshot.sessionSnapshot.correctAnswers,
          totalTime: snapshot.sessionSnapshot.totalTime
        },
        reviewInfo: {
          rating: snapshot.reviewInfo.rating,
          timestamp: snapshot.reviewInfo.timestamp,
          responseTime: snapshot.reviewInfo.responseTime
        }
      };

      this.undoStack.push(clonedSnapshot);

      // 限制栈大小 - 超出时移除最早的快照
      if (this.undoStack.length > this.MAX_STACK_SIZE) {
        this.undoStack.shift();
        console.log('[ReviewUndoManager] 撤销栈已满，移除最早的快照');
      }

      console.log(`[ReviewUndoManager] 保存快照成功，当前栈大小: ${this.undoStack.length}`);
    } catch (error) {
      console.error('[ReviewUndoManager] 保存快照失败:', error);
    }
  }

  /**
   * 撤销最后一次评分操作
   * 
   * @returns 快照数据，如果栈为空则返回null
   */
  public undo(): ReviewSnapshot | null {
    if (this.undoStack.length === 0) {
      console.warn('[ReviewUndoManager] 撤销栈为空，无法撤销');
      return null;
    }

    const snapshot = this.undoStack.pop();
    console.log(`[ReviewUndoManager] 撤销操作，剩余快照: ${this.undoStack.length}`);
    return snapshot || null;
  }

  /**
   * 检查是否可以撤销
   * 
   * @returns 是否可以撤销
   */
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * 获取可撤销的次数
   * 
   * @returns 撤销栈中的快照数量
   */
  public getUndoCount(): number {
    return this.undoStack.length;
  }

  /**
   * 清空撤销栈
   * 
   * 使用场景：
   * - 会话结束
   * - 切换牌组
   * - 关闭学习界面
   */
  public clear(): void {
    const previousSize = this.undoStack.length;
    this.undoStack = [];
    console.log(`[ReviewUndoManager] 清空撤销栈，已清除 ${previousSize} 个快照`);
  }

  /**
   * 获取撤销栈状态（用于调试）
   * 
   * @returns 撤销栈信息
   */
  public getStackInfo(): { size: number; maxSize: number; snapshots: Array<{ cardId: string; rating: Rating; timestamp: number }> } {
    return {
      size: this.undoStack.length,
      maxSize: this.MAX_STACK_SIZE,
      snapshots: this.undoStack.map(s => ({
        cardId: s.cardId,
        rating: s.reviewInfo.rating,
        timestamp: s.reviewInfo.timestamp
      }))
    };
  }
}

