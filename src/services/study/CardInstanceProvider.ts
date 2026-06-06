import { CardState } from "../../data/types";
import { logger } from "../../utils/logger";
/**
 * 卡片学习实例提供者 V2
 *
 * 统一的数据访问层，解决统计与队列不一致的根本问题
 *
 * 核心职责：
 * 1. 过滤可学习的卡片（普通卡片 + 子卡片）
 * 2. 实现Bury Siblings机制（同一父卡片的子卡片分散到不同天）
 * 3. 保证统计和队列看到相同的数据
 *
 * 架构改进（V2）：
 * - ✅ 移除虚拟化层（ClozeStudyInstance）
 * - ✅ 子卡片是真实Card对象
 * - ✅ 父卡片不参与学习队列
 * - ✅ 简化类型系统
 *
 * @module services/study/CardInstanceProvider
 * @version 2.0.0
 */

import type { Card } from "../../data/types";
import {
	type ProgressiveClozeChildCard,
	type StudyInstance,
	isProgressiveClozeChild,
	isProgressiveClozeParent,
} from "../../types/progressive-cloze-v2";

// StudyInstance类型已移至 progressive-cloze-v2.ts
// 在新架构中：普通卡片 | 子卡片（都是真实Card对象）
export type { StudyInstance } from "../../types/progressive-cloze-v2";

/**
 * 获取实例的选项
 */
export interface GetInstancesOptions {
	/** 是否只返回到期的实例（用于队列）*/
	onlyDue?: boolean;
	/** 当前时间戳（用于测试） */
	now?: number;
}

/**
 * 卡片存储接口（依赖注入）
 */
export interface ICardStore {
	getCard(uuid: string): Card | null;
	getCards(uuids: string[]): Card[];
}

/**
 * 卡片实例提供者 V2
 */
export class CardInstanceProvider {
	constructor(private cardStore?: ICardStore) {}

	/**
	 * 过滤可学习的卡片
	 *
	 * 新架构逻辑：
	 * - 父卡片：跳过（不参与学习）
	 * - 子卡片：检查是否到期 + Bury Siblings
	 * - 普通卡片：检查是否到期
	 *
	 * ✅ 统计和队列都使用这个方法，保证一致性
	 *
	 * @param card 卡片
	 * @param options 选项
	 * @returns 学习实例数组（长度0或1）
	 */
	getTodaysInstances(card: Card, options: GetInstancesOptions = {}): StudyInstance[] {
		const { onlyDue = true, now = Date.now() } = options;

		// 父卡片：跳过（不参与学习）
		if (isProgressiveClozeParent(card)) {
			return [];
		}

		// 子卡片：检查Bury Siblings + 到期状态
		if (isProgressiveClozeChild(card)) {
			return this.getChildCardInstances(card, onlyDue, now);
		}

		// 普通卡片：检查到期状态
		return this.getBasicCardInstances(card, onlyDue, now);
	}

	/**
	 * 获取子卡片实例
	 *
	 * 实现Bury Siblings：检查同胞卡片今天是否已学习
	 *
	 * @param card 子卡片
	 * @param onlyDue 是否只返回到期的
	 * @param now 当前时间戳
	 * @returns 学习实例数组（长度0或1）
	 */
	private getChildCardInstances(
		card: ProgressiveClozeChildCard,
		onlyDue: boolean,
		now: number
	): StudyInstance[] {
		// 检查是否有FSRS数据
		if (!card.fsrs) {
			logger.warn(`[CardInstanceProvider] Child card missing FSRS data: ${card.uuid}`);
			return [];
		}

		// Bury Siblings检查：同胞卡片今天是否已学习
		if (this.cardStore && this.hasSiblingStudiedToday(card)) {
			return [];
		}

		// 到期检查
		if (onlyDue) {
			// 新卡片（state=0）不检查到期时间
			if (card.fsrs.state !== CardState.New) {
				const dueTime = this.parseDueTime(card.fsrs.due);
				if (dueTime > now) {
					return [];
				}
			}
		}

		return [card];
	}

	/**
	 * 获取普通卡片的学习实例
	 *
	 * @param card 普通卡片
	 * @param onlyDue 是否只返回到期的
	 * @param now 当前时间戳
	 * @returns 学习实例数组（长度0或1）
	 */
	private getBasicCardInstances(card: Card, onlyDue: boolean, now: number): StudyInstance[] {
		if (!card.fsrs) {
			// 没有FSRS数据，跳过
			return [];
		}

		// 如果只要到期的，检查是否到期
		if (onlyDue) {
			// 新卡片（state=0）不检查到期时间
			if (card.fsrs.state !== CardState.New) {
				const dueTime = this.parseDueTime(card.fsrs.due);
				if (dueTime > now) {
					// 未到期
					return [];
				}
			}
		}

		return [card];
	}

	/**
	 * 解析到期时间
	 */
	private parseDueTime(due: string | number | Date): number {
		if (typeof due === "number") return due;
		if (typeof due === "string") return Date.parse(due);
		return due.getTime();
	}

	/**
	 * 检查同胞卡片今天是否已学习（Bury Siblings）
	 *
	 * @param card 子卡片
	 * @returns 是否有同胞已学习
	 */
	private hasSiblingStudiedToday(card: ProgressiveClozeChildCard): boolean {
		if (!this.cardStore) {
			return false; // 没有cardStore，无法检查
		}

		// 获取父卡片
		const parentCard = this.cardStore.getCard(card.parentCardId);
		if (!parentCard || !isProgressiveClozeParent(parentCard)) {
			return false;
		}

		// 获取所有同胞卡片
		const siblingCards = this.cardStore
			.getCards(parentCard.progressiveCloze.childCardIds)
			.filter((c) => isProgressiveClozeChild(c) && c.uuid !== card.uuid);

		// 检查是否有同胞今天已学习
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const todayEnd = new Date().setHours(23, 59, 59, 999);

		return siblingCards.some((_sibling) => {
			if (!isProgressiveClozeChild(_sibling) || !_sibling.fsrs?.lastReview) {
				return false;
			}

			const reviewTime = new Date(_sibling.fsrs.lastReview).getTime();
			return reviewTime >= todayStart && reviewTime <= todayEnd;
		});
	}

	/**
	 * 检查卡片今天是否可以学习
	 *
	 * @param card 卡片
	 * @returns 是否可以学习
	 */
	canStudyToday(card: Card): boolean {
		const instances = this.getTodaysInstances(card, { onlyDue: true });
		return instances.length > 0;
	}

	/**
	 * 批量获取学习实例
	 *
	 * @param cards 卡片数组
	 * @param options 选项
	 * @returns 学习实例数组
	 */
	getBatchInstances(cards: Card[], options: GetInstancesOptions = {}): StudyInstance[] {
		const instances: StudyInstance[] = [];

		for (const card of cards) {
			const cardInstances = this.getTodaysInstances(card, options);
			instances.push(...cardInstances);
		}

		return instances;
	}
}
