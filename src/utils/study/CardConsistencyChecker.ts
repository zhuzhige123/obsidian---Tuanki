/**
 * 卡片一致性检查器
 *
 * 用于检测卡片内容格式与数据结构是否一致
 * 主要应用场景：
 * 1. MD自由编辑导致内容格式变化
 * 2. 渐进式挖空数据未初始化
 * 3. 卡片类型与内容不匹配
 *
 * @since 2025-11-29
 */

import { Card, CardType } from "../../data/types";
import { hasAnyClozeSyntax } from "../cloze-syntax";

/**
 * 一致性问题类型
 */
export enum ConsistencyIssueType {
	/** 类型不匹配：内容格式与声明的type不一致 */
	TYPE_MISMATCH = "TYPE_MISMATCH",

	/** 缺少渐进式挖空数据：type是cloze且有多个挖空，但无progressiveCloze */
	MISSING_PROGRESSIVE_CLOZE = "MISSING_PROGRESSIVE_CLOZE",

	/** 孤立的渐进式挖空数据：有progressiveCloze但内容不是挖空或只有1个挖空 */
	ORPHANED_PROGRESSIVE_CLOZE = "ORPHANED_PROGRESSIVE_CLOZE",

	/** progressiveCloze数据过时：挖空数量与记录不一致 */
	OUTDATED_PROGRESSIVE_CLOZE = "OUTDATED_PROGRESSIVE_CLOZE",
}

/**
 * 一致性问题详情
 */
export interface CardConsistencyIssue {
	/** 问题类型 */
	type: ConsistencyIssueType;

	/** 卡片 */
	card: Card;

	/** 检测到的内容类型 */
	detectedContentType: CardType;

	/** 当前数据中的类型 */
	currentDataType: CardType;

	/** 检测到的挖空数量 */
	detectedClozeCount: number;

	/** 记录的挖空数量（如果有） */
	recordedClozeCount?: number;

	/** 问题描述 */
	description: string;

	/** 修复建议 */
	suggestion: string;
}

/**
 * 卡片一致性检查器
 */
export class CardConsistencyChecker {
	/**
	 * 检查卡片一致性
	 *
	 * @param card 要检查的卡片
	 * @returns 一致性问题，如果没有问题返回null
	 */
	check(card: Card): CardConsistencyIssue | null {
		// 1. 检测内容实际类型
		const contentType = this.detectCardTypeFromContent(card.content || "");

		// 2. 获取数据中声明的类型
		const dataType = card.type || CardType.Basic;

		// 3. 检测挖空状态
		const clozeCount = this.getClozeCount(card.content || "");
		// V2 架构：检查是否为渐进式挖空父卡片
		const hasProgressiveCloze = card.type === CardType.ProgressiveParent;
		const recordedClozeCount = hasProgressiveCloze
			? (card as any).progressiveCloze?.totalClozes
			: undefined;

		// 情况A: 内容是挖空，但type不是cloze
		if (contentType === CardType.Cloze && dataType !== CardType.Cloze) {
			return {
				type: ConsistencyIssueType.TYPE_MISMATCH,
				card,
				detectedContentType: contentType,
				currentDataType: dataType,
				detectedClozeCount: clozeCount,
				description: "内容包含挖空标记，但卡片类型不是挖空卡片",
				suggestion: `将卡片类型从"${dataType}"修改为"cloze"，并初始化渐进式挖空数据`,
			};
		}

		// 情况B: type是cloze，但内容不是挖空
		if (dataType === CardType.Cloze && contentType !== CardType.Cloze) {
			return {
				type: ConsistencyIssueType.TYPE_MISMATCH,
				card,
				detectedContentType: contentType,
				currentDataType: dataType,
				detectedClozeCount: clozeCount,
				description: `卡片类型是"cloze"，但内容不包含挖空标记`,
				suggestion: `将卡片类型修改为"${contentType}"${
					hasProgressiveCloze ? "，并清除挖空数据" : ""
				}`,
			};
		}

		// 情况C: type是cloze，内容有多个挖空，但无progressiveCloze
		if (dataType === CardType.Cloze && clozeCount >= 2 && !hasProgressiveCloze) {
			return {
				type: ConsistencyIssueType.MISSING_PROGRESSIVE_CLOZE,
				card,
				detectedContentType: contentType,
				currentDataType: dataType,
				detectedClozeCount: clozeCount,
				description: `检测到${clozeCount}个挖空，但未初始化渐进式挖空数据`,
				suggestion: "初始化渐进式挖空数据，每个挖空将作为独立的学习实例",
			};
		}

		// 情况D: 有progressiveCloze，但内容不是挖空或只有1个挖空
		if (hasProgressiveCloze && (contentType !== CardType.Cloze || clozeCount < 2)) {
			return {
				type: ConsistencyIssueType.ORPHANED_PROGRESSIVE_CLOZE,
				card,
				detectedContentType: contentType,
				currentDataType: dataType,
				detectedClozeCount: clozeCount,
				recordedClozeCount,
				description: "卡片包含挖空数据，但内容已不是渐进式挖空格式",
				suggestion: "清除过时的挖空数据以保持一致性",
			};
		}

		// 情况E: progressiveCloze数量与实际不一致
		if (hasProgressiveCloze && recordedClozeCount !== clozeCount) {
			return {
				type: ConsistencyIssueType.OUTDATED_PROGRESSIVE_CLOZE,
				card,
				detectedContentType: contentType,
				currentDataType: dataType,
				detectedClozeCount: clozeCount,
				recordedClozeCount,
				description: `记录的挖空数量(${recordedClozeCount})与实际数量(${clozeCount})不一致`,
				suggestion: "重新初始化渐进式挖空数据以匹配当前内容",
			};
		}

		return null; // 一致，无问题
	}

	/**
	 * 从内容检测卡片类型
	 *
	 * @param content 卡片内容
	 * @returns 检测到的卡片类型
	 */
	detectCardTypeFromContent(content: string): CardType {
		if (hasAnyClozeSyntax(content)) {
			return CardType.Cloze;
		}

		// 检测选择题标记 - [ ] 或 - [x]
		if (/^-\s*\[[xX\s]\]/.test(content.trim())) {
			return CardType.Multiple;
		}

		// 默认问答题
		return CardType.Basic;
	}

	/**
	 * 获取挖空数量
	 *
	 * @param content 卡片内容
	 * @returns 挖空数量（去重后）
	 */
	private getClozeCount(content: string): number {
		const matches = content.match(/\{\{c(\d+)::/g);
		if (!matches) return 0;

		// 提取所有挖空序号并去重
		const clozeNumbers = new Set(
			matches
				.map((_m) => {
					const match = _m.match(/\d+/);
					return match ? match[0] : "";
				})
				.filter((_n) => _n)
		);

		return clozeNumbers.size;
	}

	/**
	 * 获取所有挖空序号（用于初始化）
	 *
	 * @param content 卡片内容
	 * @returns 挖空序号数组，按升序排列
	 */
	getClozeOrdinals(content: string): number[] {
		const matches = content.match(/\{\{c(\d+)::/g);
		if (!matches) return [];

		const ordinals = new Set(
			matches
				.map((_m) => {
					const match = _m.match(/\d+/);
					return match ? parseInt(match[0], 10) : 0;
				})
				.filter((_n) => _n > 0)
		);

		return Array.from(ordinals).sort((a, b) => a - b);
	}
}
