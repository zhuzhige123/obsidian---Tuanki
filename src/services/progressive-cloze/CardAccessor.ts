/**
 * 卡片访问器
 *
 * 统一的卡片数据访问层，提供渐进式挖空相关的高级功能
 *
 * 核心职责：
 * 1. 提供统一的content访问接口（兼容 V1 和 V2）
 * 2. 提供当前激活挖空的解析和显示
 * 3. 提供挖空文本的提取和替换
 * 4. 缓存优化，避免重复解析
 *
 * V2 架构设计：
 * - 子卡片存储完整 content：创建时从父卡片复制，避免运行时查找
 * - CardAccessor 提供向后兼容：支持 V1 遗留数据（content 为空的子卡片）
 * - 推荐用法：直接使用 card.content，除非需要高级挖空操作
 *
 * @module services/progressive-cloze/CardAccessor
 * @version 2.0.0
 */

import type { Card } from "../../data/types";
import {
	type ClozeData,
	type ProgressiveClozeChildCard,
	type ProgressiveClozeParentCard,
	isProgressiveClozeChild,
	isProgressiveClozeParent,
} from "../../types/progressive-cloze-v2";

/**
 * 卡片存储接口（依赖注入）
 */
export interface ICardStore {
	/** 根据UUID获取卡片 */
	getCard(uuid: string): Card | null;

	/** 批量获取卡片 */
	getCards(uuids: string[]): Card[];
}

/**
 * 卡片访问器
 *
 * 使用示例：
 * ```typescript
 * const accessor = new CardAccessor(childCard, cardStore);
 *
 * // V2: 获取content（向后兼容 V1 数据）
 * const content = accessor.getContent();
 *
 * // 获取当前挖空文本
 * const clozeText = accessor.getActiveClozeText();
 *
 * // 获取用于显示的content（当前挖空高亮）
 * const displayContent = accessor.getDisplayContent();
 * ```
 */
export class CardAccessor {
	private contentCache: string | null = null;
	private clozeDataCache: ClozeData[] | null = null;

	constructor(private card: Card, private cardStore: ICardStore) {}

	// ==========================================================================
	// Content 访问
	// ==========================================================================

	/**
	 * 获取卡片内容
	 *
	 * V2 架构：
	 * - 普通卡片：直接返回自己的content
	 * - 父卡片：直接返回自己的content
	 * - 子卡片：优先使用自己的content（V2 已存储），如果为空则从父卡片获取（V1 兼容）
	 *
	 * @throws Error 如果子卡片的父卡片不存在（仅 V1 遗留数据）
	 */
	getContent(): string {
		// 缓存优化
		if (this.contentCache !== null) {
			return this.contentCache;
		}

		let content: string;

		if (isProgressiveClozeChild(this.card)) {
			// V2: 子卡片优先使用自己的content
			if (this.card.content?.trim()) {
				content = this.card.content;
			} else {
				// V1 兼容：content为空时从父卡片获取
				const parentCard = this.cardStore.getCard(this.card.parentCardId);

				if (!parentCard) {
					throw new Error(
						`[CardAccessor] Parent card not found: ${this.card.parentCardId} ` +
							`for child card: ${this.card.uuid}`
					);
				}

				if (!isProgressiveClozeParent(parentCard)) {
					throw new Error(
						`[CardAccessor] Parent card is not a progressive-parent type: ${parentCard.uuid}`
					);
				}

				content = parentCard.content;
			}
		} else {
			// 普通卡片或父卡片：直接返回
			content = this.card.content || "";
		}

		// 缓存
		this.contentCache = content;
		return content;
	}

	/**
	 * 获取父卡片（如果存在）
	 */
	getParentCard(): ProgressiveClozeParentCard | null {
		if (!isProgressiveClozeChild(this.card)) {
			return null;
		}

		const parentCard = this.cardStore.getCard(this.card.parentCardId);
		if (!parentCard || !isProgressiveClozeParent(parentCard)) {
			return null;
		}

		return parentCard;
	}

	// ==========================================================================
	// 挖空解析
	// ==========================================================================

	/**
	 * 解析content中的所有挖空
	 *
	 * @returns 挖空数据数组，按ord排序
	 */
	parseClozes(): ClozeData[] {
		// 缓存优化
		if (this.clozeDataCache !== null) {
			return this.clozeDataCache;
		}

		const content = this.getContent();
		const clozes: ClozeData[] = [];

		// 匹配所有挖空：{{c1::text}} 或 {{c1::text::hint}}
		const clozePattern = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g;
		let match: RegExpExecArray | null;

		while ((match = clozePattern.exec(content)) !== null) {
			const ord = parseInt(match[1], 10) - 1; // 转换为0-based
			const text = match[2].trim();
			const hint = match[3]?.trim();

			// 检查是否已存在该ord（避免重复）
			const existingIndex = clozes.findIndex((c) => c.ord === ord);
			if (existingIndex >= 0) {
				// 如果已存在，合并文本（处理多个相同序号的挖空）
				clozes[existingIndex].text += `, ${text}`;
				if (hint && !clozes[existingIndex].hint) {
					clozes[existingIndex].hint = hint;
				}
			} else {
				clozes.push({
					ord,
					text,
					hint,
					position: {
						start: match.index,
						end: match.index + match[0].length,
					},
				});
			}
		}

		// 按ord排序
		clozes.sort((a, b) => a.ord - b.ord);

		// 缓存
		this.clozeDataCache = clozes;
		return clozes;
	}

	/**
	 * 获取当前激活的挖空数据
	 *
	 * 仅对子卡片有效，返回当前学习的挖空信息
	 */
	getActiveClozeData(): ClozeData | null {
		if (!isProgressiveClozeChild(this.card)) {
			return null;
		}

		const clozes = this.parseClozes();
		// 类型断言：类型守卫后this.card确定是ProgressiveClozeChildCard
		const childCard = this.card;
		return clozes.find((c) => c.ord === childCard.clozeOrd) || null;
	}

	/**
	 * 获取当前激活的挖空文本
	 *
	 * 仅对子卡片有效
	 *
	 * @returns 挖空文本，如 "Python"
	 */
	getActiveClozeText(): string | null {
		const clozeData = this.getActiveClozeData();
		return clozeData?.text || null;
	}

	/**
	 * 获取当前激活的挖空提示
	 *
	 * 仅对子卡片有效
	 */
	getActiveClozeHint(): string | null {
		const clozeData = this.getActiveClozeData();
		return clozeData?.hint || null;
	}

	// ==========================================================================
	// 显示内容生成
	// ==========================================================================

	/**
	 * 获取用于显示的content
	 *
	 * 对于子卡片：
	 * - 当前挖空显示为 [...] 或 [提示]
	 * - 其他挖空显示原文
	 *
	 * 对于父卡片和普通卡片：
	 * - 返回原始content
	 *
	 * @param showHint 是否在挖空处显示提示（默认true）
	 */
	getDisplayContent(showHint = true): string {
		const content = this.getContent();

		if (!isProgressiveClozeChild(this.card)) {
			// 非子卡片：返回原始content
			return content;
		}

		// 类型断言：类型守卫后this.card确定是ProgressiveClozeChildCard
		const childCard = this.card;
		const activeClozeOrd = childCard.clozeOrd;

		// 替换挖空标记
		return content.replace(
			/\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g,
			(_match, ordStr: string, text: string, hint?: string) => {
				const ord = parseInt(ordStr, 10) - 1; // 转换为0-based

				if (ord === activeClozeOrd) {
					// 当前挖空：显示为 [...] 或 [提示]
					if (showHint && hint) {
						return `[${hint}]`;
					}
					return "[...]";
				} else {
					// 其他挖空：显示原文
					return text;
				}
			}
		);
	}

	/**
	 * 获取用于答案显示的content
	 *
	 * 所有挖空都显示原文，但当前挖空会高亮标记
	 */
	getAnswerContent(): string {
		const content = this.getContent();

		if (!isProgressiveClozeChild(this.card)) {
			return content;
		}

		// 类型断言：类型守卫后this.card确定是ProgressiveClozeChildCard
		const childCard = this.card;
		const activeClozeOrd = childCard.clozeOrd;

		// 替换挖空标记，当前挖空用 **text** 标记
		return content.replace(/\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g, (_match, ordStr: string, text: string) => {
			const ord = parseInt(ordStr, 10) - 1;

			if (ord === activeClozeOrd) {
				// 当前挖空：高亮显示
				return `**${text}**`;
			} else {
				// 其他挖空：普通显示
				return text;
			}
		});
	}

	// ==========================================================================
	// 工具方法
	// ==========================================================================

	/**
	 * 清除缓存
	 *
	 * 当卡片内容可能变化时调用（如父卡片被修改）
	 */
	clearCache(): void {
		this.contentCache = null;
		this.clozeDataCache = null;
	}

	/**
	 * 获取所有同胞子卡片（siblings）
	 *
	 * 仅对子卡片有效，返回同一父卡片的所有其他子卡片
	 */
	getSiblingCards(): ProgressiveClozeChildCard[] {
		if (!isProgressiveClozeChild(this.card)) {
			return [];
		}

		const parentCard = this.getParentCard();
		if (!parentCard) {
			return [];
		}

		const childCards = this.cardStore.getCards(parentCard.progressiveCloze.childCardIds);

		return childCards.filter(
			(c): c is ProgressiveClozeChildCard => isProgressiveClozeChild(c) && c.uuid !== this.card.uuid
		);
	}

	/**
	 * 检查今天是否有同胞卡片已经学习过
	 *
	 * 用于Bury Siblings机制
	 */
	hasSiblingStudiedToday(): boolean {
		const siblings = this.getSiblingCards();
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const todayEnd = new Date().setHours(23, 59, 59, 999);

		return siblings.some((_sibling) => {
			const lastReview = _sibling.fsrs?.lastReview;
			if (!lastReview) return false;

			const reviewTime = new Date(lastReview).getTime();
			return reviewTime >= todayStart && reviewTime <= todayEnd;
		});
	}
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建CardAccessor实例
 *
 * @param card 卡片
 * @param cardStore 卡片存储服务
 */
export function createCardAccessor(card: Card, cardStore: ICardStore): CardAccessor {
	return new CardAccessor(card, cardStore);
}
