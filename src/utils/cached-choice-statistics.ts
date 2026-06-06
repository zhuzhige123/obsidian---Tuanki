/**
 * 选择题统计缓存工具
 * 用于优化选择题统计的计算性能
 */

import type { Card } from "../data/types";

export class CachedChoiceStatistics {
	private cache = new Map<string, unknown>();

	/**
	 * 获取缓存的统计数据
	 */
	get(cardId: string): unknown {
		return this.cache.get(cardId);
	}

	/**
	 * 设置缓存的统计数据
	 */
	set(cardId: string, stats: unknown): void {
		this.cache.set(cardId, stats);
	}

	/**
	 * 清除指定卡片的缓存
	 */
	clear(cardId?: string): void {
		if (cardId) {
			this.cache.delete(cardId);
		} else {
			this.cache.clear();
		}
	}

	/**
	 * 计算选择题统计
	 */
	calculate(card: Card): unknown {
		const cached = this.cache.get(card.uuid);
		if (cached) {
			return cached;
		}

		// 简单的统计计算
		const stats = {
			accuracy: card.stats?.choiceStats?.accuracy || 0,
			totalAttempts: card.stats?.choiceStats?.totalAttempts || 0,
			correctAttempts: card.stats?.choiceStats?.correctAttempts || 0,
		};

		this.cache.set(card.uuid, stats);
		return stats;
	}
}
