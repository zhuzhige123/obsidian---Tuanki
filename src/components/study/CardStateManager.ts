import { UnifiedCardType } from "../../types/unified-card-types";
import { detectCardQuestionType } from "../../utils/card-type-utils";
import { logger } from "../../utils/logger";
import { getCardDeckIds } from "../../utils/yaml-utils";
import { getQuestionBankDeckIdsForCard } from "../pages/kanban-card-update";

/**
 * 卡片状态管理器
 * 用于看板视图中的卡片状态更新和拖拽操作
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card, CardState, Deck } from "../../data/types";

export interface CardStateUpdate {
	cardId: string;
	newState: CardState;
	oldState: CardState;
	timestamp: Date;
}

export interface CardGroupInfo {
	key: string;
	label: string;
	color: string;
	icon: string;
	cards: Card[];
	count: number;
	dueCount: number;
}

export class CardStateManager {
	private dataStorage: WeaveDataStorage;
	private updateHistory: CardStateUpdate[] = [];
	private decks: Deck[] = [];
	private dataSourceType: "memory" | "questionBank" | "incremental-reading" = "memory";

	constructor(dataStorage: WeaveDataStorage) {
		this.dataStorage = dataStorage;
	}

	/**
	 * 设置牌组列表（用于牌组名称映射）
	 */
	setDecks(decks: Deck[]): void {
		this.decks = decks;
	}

	setDataSourceType(dataSourceType: "memory" | "questionBank" | "incremental-reading"): void {
		this.dataSourceType = dataSourceType;
	}

	private getIRDeckGroupKeys(card: Card): string[] {
		const cardLike = card as any;
		const metadataDeckIds = Array.isArray(cardLike?.metadata?.deckIds)
			? cardLike.metadata.deckIds.filter(
					(value: unknown): value is string => typeof value === "string" && value.trim().length > 0
			  )
			: [];
		const irDeckIds = Array.isArray(cardLike?.ir_deck_ids)
			? cardLike.ir_deck_ids.filter(
					(value: unknown): value is string => typeof value === "string" && value.trim().length > 0
			  )
			: [];
		const deckIds = metadataDeckIds.length > 0 ? metadataDeckIds : irDeckIds;
		if (deckIds.length > 0) {
			return Array.from(new Set(deckIds));
		}
		if (typeof card.deckId === "string" && card.deckId.trim().length > 0) {
			return [card.deckId];
		}
		return ["_none"];
	}

	private getIRPriorityValue(card: Card): number {
		const cardLike = card as any;
		const candidates = [
			cardLike?.ir_priority_value,
			cardLike?.ir_priority,
			cardLike?.metadata?.priorityUi,
			cardLike?.metadata?.priorityEff,
			card.priority,
		];
		for (const value of candidates) {
			if (typeof value === "number" && Number.isFinite(value)) {
				return value;
			}
		}
		return 5;
	}

	private getIRTagGroupValue(card: Card): string {
		const value = String((card as any)?.ir_tag_group || "").trim();
		return value || "_default";
	}

	private getTagGroupValues(card: Card): string[] {
		const cardLike = card as any;
		const normalized = new Set<string>();
		const values =
			this.dataSourceType === "incremental-reading"
				? [...(Array.isArray(cardLike?.ir_tags) ? cardLike.ir_tags : []), ...(card.tags || [])]
				: card.tags || [];

		for (const value of values) {
			if (typeof value !== "string") continue;
			const normalizedValue = value.trim();
			if (normalizedValue) {
				normalized.add(normalizedValue);
			}
		}

		return Array.from(normalized);
	}

	private getDeckGroupKeys(card: Card): string[] {
		if (this.dataSourceType === "incremental-reading") {
			return this.getIRDeckGroupKeys(card);
		}

		if (this.dataSourceType === "questionBank") {
			const questionBankDeckIds = getQuestionBankDeckIdsForCard(card);
			if (questionBankDeckIds.length > 0) {
				return questionBankDeckIds;
			}
			return ["_none"];
		}

		const { deckIds } = getCardDeckIds(card, this.decks, { preserveAllDeckIds: true });
		if (deckIds.length > 0) {
			return Array.from(new Set(deckIds));
		}
		return ["_none"];
	}

	/**
	 * 更新卡片状态
	 */
	async updateCardState(cardId: string, newState: CardState): Promise<boolean> {
		try {
			const card = await this.dataStorage.getCardByUUID(cardId);
			if (!card || !card.fsrs) {
				logger.error("卡片不存在或fsrs未初始化:", cardId);
				return false;
			}

			const oldState = card.fsrs.state;

			// 更新卡片状态
			card.fsrs.state = newState;

			// 根据状态更新其他相关字段
			this.updateRelatedFields(card, newState);

			// 保存到数据存储
			await this.dataStorage.updateCard(card);

			// 记录更新历史
			this.updateHistory.push({
				cardId,
				newState,
				oldState,
				timestamp: new Date(),
			});

			logger.debug(`卡片 ${cardId} 状态从 ${oldState} 更新为 ${newState}`);
			return true;
		} catch (error) {
			logger.error("更新卡片状态失败:", error);
			return false;
		}
	}

	/**
	 * 批量更新卡片状态
	 */
	async batchUpdateCardStates(
		updates: Array<{ cardId: string; newState: CardState }>
	): Promise<boolean[]> {
		const results = await Promise.all(
			updates.map((update) => this.updateCardState(update.cardId, update.newState))
		);
		return results;
	}

	/**
	 * 根据状态更新相关字段
	 */
	private updateRelatedFields(card: Card, newState: CardState): void {
		if (!card.fsrs) return;

		const now = new Date();
		const nowISO = now.toISOString();

		switch (newState) {
			case 0: // 新卡片
				card.fsrs.due = nowISO;
				card.fsrs.stability = 0;
				card.fsrs.difficulty = 5; // 默认难度
				card.fsrs.elapsedDays = 0;
				card.fsrs.scheduledDays = 0;
				card.fsrs.reps = 0;
				card.fsrs.lapses = 0;
				break;

			case 1: // 学习中
				card.fsrs.due = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
				card.fsrs.scheduledDays = 0;
				break;

			case 2: // 复习
				if (card.fsrs.stability > 0) {
					const nextReviewDays = Math.max(1, Math.round(card.fsrs.stability));
					card.fsrs.due = new Date(
						now.getTime() + nextReviewDays * 24 * 60 * 60 * 1000
					).toISOString();
					card.fsrs.scheduledDays = nextReviewDays;
				} else {
					card.fsrs.due = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
					card.fsrs.scheduledDays = 1;
				}
				break;

			case 3: // 重新学习
				card.fsrs.due = nowISO;
				card.fsrs.lapses = (card.fsrs.lapses || 0) + 1;
				card.fsrs.scheduledDays = 0;
				break;
		}

		card.fsrs.lastReview = nowISO;
	}

	/**
	 * 获取状态分组信息
	 */
	getStateGroups(): CardGroupInfo[] {
		return [
			{
				key: "0",
				label: "新卡片",
				color: "#6b7280",
				icon: "plus-circle",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "1",
				label: "学习中",
				color: "#3b82f6",
				icon: "book-open",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "2",
				label: "复习",
				color: "#10b981",
				icon: "refresh-cw",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "3",
				label: "重新学习",
				color: "#f59e0b",
				icon: "rotate-ccw",
				cards: [],
				count: 0,
				dueCount: 0,
			},
		];
	}

	/**
	 * 获取题型分组信息
	 */
	getTypeGroups(): CardGroupInfo[] {
		return [
			{
				key: UnifiedCardType.BASIC_QA,
				label: "问答题",
				color: "var(--interactive-accent)",
				icon: "file-text",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: UnifiedCardType.SINGLE_CHOICE,
				label: "选择题",
				color: "#06b6d4",
				icon: "check-circle",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: UnifiedCardType.CLOZE_DELETION,
				label: "挖空题",
				color: "#ec4899",
				icon: "edit",
				cards: [],
				count: 0,
				dueCount: 0,
			},
		];
	}

	/**
	 * 获取优先级分组信息
	 */
	getPriorityGroups(cards: Card[] = []): CardGroupInfo[] {
		if (this.dataSourceType === "incremental-reading") {
			const priorityValues = Array.from(
				new Set(cards.map((card) => this.getIRPriorityValue(card)))
			).sort((a, b) => b - a);
			const colors = ["#ef4444", "#f97316", "#f59e0b", "#3b82f6", "#10b981", "#6b7280"];
			return priorityValues.map((value, index) => ({
				key: String(value),
				label: `P${value}`,
				color: colors[index % colors.length],
				icon: "flag",
				cards: [],
				count: 0,
				dueCount: 0,
			}));
		}

		return [
			{
				key: "4",
				label: "紧急",
				color: "#ef4444",
				icon: "alert-triangle",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "3",
				label: "高优先级",
				color: "#f59e0b",
				icon: "flag",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "2",
				label: "中优先级",
				color: "#3b82f6",
				icon: "flag",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "1",
				label: "低优先级",
				color: "#fbbf24",
				icon: "minus-circle",
				cards: [],
				count: 0,
				dueCount: 0,
			},
		];
	}

	/**
	 * 获取牌组分组信息
	 *  修复：结合已知牌组和卡片中的牌组，确保所有牌组都能显示
	 */
	getDeckGroups(cards: Card[]): CardGroupInfo[] {
		const deckGroups: CardGroupInfo[] = [];
		const colors = [
			"#3b82f6",
			"#10b981",
			"#f59e0b",
			"#ec4899",
			"var(--interactive-accent)",
			"#06b6d4",
		];
		let colorIndex = 0;
		const addedDeckIds = new Set<string>();

		// 1. 优先从已知牌组列表创建分组
		if (this.decks && this.decks.length > 0) {
			for (const _deck of this.decks) {
				if (!addedDeckIds.has(_deck.id)) {
					deckGroups.push({
						key: _deck.id,
						label: _deck.name,
						color: colors[colorIndex % colors.length],
						icon: "layers",
						cards: [],
						count: 0,
						dueCount: 0,
					});
					addedDeckIds.add(_deck.id);
					colorIndex++;
				}
			}
		}

		// 2. 补充：从卡片中提取未在已知牌组列表中的牌组
		// 优先从 content YAML 的 we_decks 获取牌组 ID
		for (const _card of cards) {
			const deckIds = this.getDeckGroupKeys(_card).filter((_deckId) => _deckId !== "_none");
			for (const cardDeckId of deckIds) {
				if (!addedDeckIds.has(cardDeckId)) {
					const matchedDeck = this.decks.find((deck) => deck.id === cardDeckId);
					const fallbackLabel =
						this.dataSourceType === "incremental-reading"
							? String((_card as any)?.ir_deck || "").trim() || "未分配专题"
							: cardDeckId;
					deckGroups.push({
						key: cardDeckId,
						label: matchedDeck?.name || fallbackLabel,
						color: colors[colorIndex % colors.length],
						icon: "layers",
						cards: [],
						count: 0,
						dueCount: 0,
					});
					addedDeckIds.add(cardDeckId);
					colorIndex++;
				}
			}
		}

		// 3. 添加"无牌组"分组
		deckGroups.push({
			key: "_none",
			label: "无牌组",
			color: "#6b7280",
			icon: "inbox",
			cards: [],
			count: 0,
			dueCount: 0,
		});

		return deckGroups;
	}

	/**
	 * 获取创建时间分组信息
	 */
	getCreateTimeGroups(): CardGroupInfo[] {
		return [
			{
				key: "today",
				label: "今天",
				color: "#3b82f6",
				icon: "calendar",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "yesterday",
				label: "昨天",
				color: "#10b981",
				icon: "calendar",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "last7days",
				label: "过去7天",
				color: "#f59e0b",
				icon: "calendar",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "last30days",
				label: "过去30天",
				color: "#ec4899",
				icon: "calendar",
				cards: [],
				count: 0,
				dueCount: 0,
			},
			{
				key: "earlier",
				label: "更早",
				color: "#6b7280",
				icon: "calendar",
				cards: [],
				count: 0,
				dueCount: 0,
			},
		];
	}

	/**
	 * 获取标签分组信息（动态生成）
	 */
	getTagGroups(cards: Card[]): CardGroupInfo[] {
		const tagSet = new Set<string>();
		const tagColors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444"];

		for (const _card of cards) {
			const cardTags = this.getTagGroupValues(_card);
			if (cardTags.length > 0) {
				tagSet.add(cardTags[0]);
			}
		}

		const groups: CardGroupInfo[] = Array.from(tagSet)
			.sort()
			.map((tag, index) => ({
				key: tag,
				label: tag,
				color: tagColors[index % tagColors.length],
				icon: "tag",
				cards: [],
				count: 0,
				dueCount: 0,
			}));

		groups.push({
			key: "_noTag",
			label: "无标签",
			color: "#6b7280",
			icon: "circle",
			cards: [],
			count: 0,
			dueCount: 0,
		});

		return groups;
	}

	getIRTagGroupGroups(cards: Card[]): CardGroupInfo[] {
		const groupSet = new Set<string>();
		const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

		for (const _card of cards) {
			groupSet.add(this.getIRTagGroupValue(_card));
		}

		const groups: CardGroupInfo[] = Array.from(groupSet)
			.sort((a, b) => {
				if (a === "_default") return 1;
				if (b === "_default") return -1;
				return a.localeCompare(b, "zh-CN");
			})
			.map((groupKey, index) => ({
				key: groupKey,
				label: groupKey === "_default" ? "默认" : groupKey,
				color: colors[index % colors.length],
				icon: "layers",
				cards: [],
				count: 0,
				dueCount: 0,
			}));

		if (!groups.some((group) => group.key === "_default")) {
			groups.push({
				key: "_default",
				label: "默认",
				color: "#6b7280",
				icon: "layers",
				cards: [],
				count: 0,
				dueCount: 0,
			});
		}

		return groups;
	}

	/**
	 * 将卡片分组到指定的分组中
	 */
	groupCards(
		cards: Card[],
		groupBy: "status" | "type" | "priority" | "deck" | "createTime" | "tag" | "ir_tag_group"
	): Record<string, Card[]> {
		const groups: Record<string, Card[]> = {};
		let groupInfos: CardGroupInfo[];

		switch (groupBy) {
			case "status":
				groupInfos = this.getStateGroups();
				break;
			case "type":
				groupInfos = this.getTypeGroups();
				break;
			case "priority":
				groupInfos = this.getPriorityGroups(cards);
				break;
			case "deck":
				groupInfos = this.getDeckGroups(cards);
				break;
			case "createTime":
				groupInfos = this.getCreateTimeGroups();
				break;
			case "tag":
				groupInfos = this.getTagGroups(cards);
				break;
			case "ir_tag_group":
				groupInfos = this.getIRTagGroupGroups(cards);
				break;
			default:
				groupInfos = this.getStateGroups();
		}

		// 初始化所有分组
		for (const _group of groupInfos) {
			groups[_group.key] = [];
		}

		// 将卡片分配到对应分组
		for (const _card of cards) {
			let groupKey: string;

			switch (groupBy) {
				case "status":
					//  状态分组需要fsrs数据，没有的视为新卡片(state=0)
					groupKey = _card.fsrs?.state?.toString() ?? "0";
					break;
				case "type": {
					const detectedType = detectCardQuestionType(_card);
					// 将多选题归入选择题分组
					if (detectedType === UnifiedCardType.MULTIPLE_CHOICE) {
						groupKey = UnifiedCardType.SINGLE_CHOICE;
					} else if (
						detectedType === UnifiedCardType.FILL_IN_BLANK ||
						detectedType === UnifiedCardType.SEQUENCE ||
						detectedType === UnifiedCardType.EXTENSIBLE
					) {
						groupKey = UnifiedCardType.BASIC_QA;
					} else {
						groupKey = detectedType;
					}
					break;
				}
				case "priority":
					groupKey =
						this.dataSourceType === "incremental-reading"
							? this.getIRPriorityValue(_card).toString()
							: (_card.priority || 1).toString();
					break;
				case "deck":
					groupKey = this.getDeckGroupKeys(_card)[0];
					break;
				case "createTime":
					groupKey = this.getTimeGroupKey(_card.created);
					break;
				case "tag": {
					const cardTags = this.getTagGroupValues(_card);
					if (cardTags.length > 0) {
						groupKey = cardTags[0];
					} else {
						groupKey = "_noTag";
					}
					break;
				}
				case "ir_tag_group":
					groupKey = this.getIRTagGroupValue(_card);
					break;
				default:
					groupKey = "0";
			}

			if (groupBy === "deck") {
				for (const deckGroupKey of this.getDeckGroupKeys(_card)) {
					if (groups[deckGroupKey]) {
						groups[deckGroupKey].push(_card);
					}
				}
			} else if (groups[groupKey]) {
				groups[groupKey].push(_card);
			}
		}

		return groups;
	}

	/**
	 * 根据创建时间获取分组key
	 */
	private getTimeGroupKey(created: string): string {
		const now = new Date();
		const createTime = new Date(created);
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
		const last7days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
		const last30days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

		if (createTime >= today) {
			return "today";
		} else if (createTime >= yesterday) {
			return "yesterday";
		} else if (createTime >= last7days) {
			return "last7days";
		} else if (createTime >= last30days) {
			return "last30days";
		} else {
			return "earlier";
		}
	}

	/**
	 * 检查卡片是否到期
	 */
	isCardDue(card: Card): boolean {
		if (!card.fsrs) return false;
		const now = new Date();
		const dueDate = new Date(card.fsrs.due);
		return dueDate <= now;
	}

	/**
	 * 获取分组统计信息
	 */
	getGroupStats(
		cards: Card[],
		groupKey: string,
		groupBy: "status" | "type" | "priority"
	): {
		total: number;
		due: number;
		new: number;
		learning: number;
		review: number;
	} {
		const groupCards = cards.filter((_card) => {
			switch (groupBy) {
				case "status":
					return _card.fsrs?.state.toString() === groupKey;
				case "type":
					return _card.type === groupKey;
				case "priority":
					return (_card.priority || 1).toString() === groupKey;
				default:
					return false;
			}
		});

		const total = groupCards.length;
		const due = groupCards.filter((card) => this.isCardDue(card)).length;
		const newCards = groupCards.filter((card) => card.fsrs?.state === 0).length;
		const learning = groupCards.filter((card) => card.fsrs?.state === 1).length;
		const review = groupCards.filter((card) => card.fsrs?.state === 2).length;

		return {
			total,
			due,
			new: newCards,
			learning,
			review,
		};
	}

	/**
	 * 获取更新历史
	 */
	getUpdateHistory(): CardStateUpdate[] {
		return [...this.updateHistory];
	}

	/**
	 * 清除更新历史
	 */
	clearUpdateHistory(): void {
		this.updateHistory = [];
	}

	/**
	 * 撤销最后一次状态更新
	 */
	async undoLastUpdate(): Promise<boolean> {
		const lastUpdate = this.updateHistory.pop();
		if (!lastUpdate) {
			return false;
		}

		try {
			await this.updateCardState(lastUpdate.cardId, lastUpdate.oldState);
			// 移除撤销操作产生的历史记录
			this.updateHistory.pop();
			return true;
		} catch (error) {
			logger.error("撤销状态更新失败:", error);
			// 恢复历史记录
			this.updateHistory.push(lastUpdate);
			return false;
		}
	}
}
