/**
 * 学习界面AI功能协调器
 *
 * 职责：
 * - AI格式化功能
 * - AI拆分功能
 * - 子卡片管理
 *
 * @created 2025-11-29
 */

import { Notice } from "obsidian";
import type { WeaveDataStorage } from "../../data/storage";
import type { Card, Deck } from "../../data/types";
import { CardState } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type { AIAction, FormatPreviewResult, SplitCardRequest } from "../../types/ai-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { getCardBack, getCardFront } from "../../utils/card-field-helper";
import { markdownToCard } from "../../utils/card-markdown-serializer";
import { logger } from "../../utils/logger";
import { getCardDeckIds } from "../../utils/yaml-utils";
import { AIFormatterService } from "../ai/AIFormatterService";
import { resolveDefaultAIProvider } from "../ai/AIConfigService";
import { DerivationMethod } from "../relation/types";

/**
 * AI功能协调器上下文
 */
export interface AICoordinatorContext {
	plugin: WeavePlugin;
	dataStorage: WeaveDataStorage;
	decks: Deck[];
	availableTemplates: ParseTemplate[];
	formatActions: AIAction[];
}

/**
 * AI格式化结果回调
 */
export interface AIFormatCallbacks {
	onCardUpdated: (card: Card, index: number) => void;
	onForceRefresh: () => void;
}

/**
 * AI拆分结果
 */
export interface AIGenerationResult {
	success: boolean;
	cards: Card[];
	error?: string;
}

/**
 * 学习界面AI功能协调器
 */
export class StudyAICoordinator {
	constructor(private context: AICoordinatorContext) {}

	/**
	 * AI格式化卡片（官方预设）
	 */
	async formatCard(
		card: Card,
		formatType: string,
		cardIndex: number,
		callbacks: AIFormatCallbacks
	): Promise<boolean> {
		if (!card) {
			new Notice("当前没有可格式化的卡片");
			return false;
		}

		// 检查AI配置
		const aiConfig = this.context.plugin.settings.aiConfig;
		if (!aiConfig?.formatting?.enabled) {
			new Notice("AI格式化功能未启用\n请在设置→AI配置中开启");
			return false;
		}

		try {
			logger.debug(`开始AI格式化，类型: ${formatType}`);

			const loadingNotice = new Notice("AI正在格式化卡片...", 0);

			// 获取卡片内容
			let currentContent = card.content || "";

			if (!currentContent.trim()) {
				// 降级方案：从fields构建
				const front = getCardFront(card);
				const back = getCardBack(card);
				currentContent = front;
				if (back) {
					currentContent += `\n\n---\n\n${back}`;
				}
			}

			if (!currentContent.trim()) {
				loadingNotice.hide();
				new Notice("卡片内容为空，无法格式化");
				return false;
			}

			logger.debug("📝 卡片内容长度:", currentContent.length);

			// 调用AI格式化服务
			const formatResult = await AIFormatterService.formatChoiceQuestion(
				{ content: currentContent, formatType: "choice" },
				this.context.plugin
			);

			loadingNotice.hide();

			if (!formatResult.success) {
				new Notice(`格式化失败\n${formatResult.error || "未知错误"}`);
				logger.error("[AI格式化] 失败:", formatResult);
				return false;
			}

			if (!formatResult.formattedContent) {
				new Notice("格式化结果为空");
				return false;
			}

			logger.debug("✅ AI格式化成功:", {
				provider: formatResult.provider,
				model: formatResult.model,
			});

			// 更新卡片
			const updatedCard = { ...card };
			updatedCard.content = formatResult.formattedContent;
			updatedCard.modified = new Date().toISOString();

			// ✅ Content-Only: 只更新 content，不再更新 fields
			// 重新解析元数据
			try {
				const parsedCard = markdownToCard(formatResult.formattedContent, card);
				updatedCard.parsedMetadata = parsedCard.parsedMetadata;
			} catch (parseError) {
				logger.warn("[AI格式化] 元数据解析失败:", parseError);
			}

			// 保存卡片
			const result = await this.context.dataStorage.saveCard(updatedCard);

			if (result.success) {
				callbacks.onCardUpdated(updatedCard, cardIndex);

				const providerLabel = formatResult.provider ? ` (${formatResult.provider})` : "";
				new Notice(`AI格式化成功${providerLabel}`);

				logger.debug("✅ 卡片已保存");
				callbacks.onForceRefresh();
				return true;
			} else {
				new Notice("保存失败");
				return false;
			}
		} catch (error) {
			logger.error("[AI格式化] 异常:", error);
			new Notice(`格式化失败\n${error instanceof Error ? error.message : "未知错误"}`);
			return false;
		}
	}

	/**
	 * AI格式化卡片（自定义功能）
	 */
	async formatCardCustom(card: Card, actionId: string): Promise<FormatPreviewResult | null> {
		if (!card) {
			new Notice("当前没有可格式化的卡片");
			return null;
		}

		const action = this.context.formatActions.find((a) => a.id === actionId);
		if (!action) {
			new Notice("未找到该格式化功能");
			return null;
		}

		const loadingNotice = new Notice("AI正在格式化...", 0);

		try {
			const result = await AIFormatterService.formatWithCustomAction(
				action,
				card,
				{
					template: this.context.availableTemplates.find((t) => t.id === card.templateId),
					// 🆕 v2.2: 优先从 content YAML 的 we_decks 获取牌组ID
					deck: this.context.decks.find(
						(d) =>
							d.id ===
							(getCardDeckIds(card, this.context.decks, { fallbackToReferences: false })
								.primaryDeckId || card.deckId)
					),
				},
				this.context.plugin
			);

			loadingNotice.hide();

			if (result.success) {
				return result;
			} else {
				new Notice(`格式化失败: ${result.error}`);
				return null;
			}
		} catch (error) {
			loadingNotice.hide();
			logger.error("[AI格式化] 异常:", error);
			new Notice(`格式化失败: ${error instanceof Error ? error.message : "未知错误"}`);
			return null;
		}
	}

	/**
	 * 应用格式化结果
	 */
	async applyFormatResult(
		card: Card,
		formatResult: FormatPreviewResult,
		cardIndex: number,
		callbacks: AIFormatCallbacks
	): Promise<boolean> {
		if (!card || !formatResult?.formattedContent) return false;

		try {
			const updatedCard = { ...card };
			updatedCard.content = formatResult.formattedContent;
			updatedCard.modified = new Date().toISOString();

			// ✅ Content-Only: 只更新 content，不再更新 fields
			// 重新解析元数据
			try {
				const parsedCard = markdownToCard(formatResult.formattedContent, card);
				updatedCard.parsedMetadata = parsedCard.parsedMetadata;
			} catch (parseError) {
				logger.warn("[AI格式化] 元数据解析失败:", parseError);
			}

			// 保存卡片
			const result = await this.context.dataStorage.saveCard(updatedCard);

			if (result.success) {
				callbacks.onCardUpdated(updatedCard, cardIndex);

				const providerLabel = formatResult.provider ? ` (${formatResult.provider})` : "";
				new Notice(`AI格式化成功${providerLabel}`);

				logger.debug("✅ 卡片已保存并应用格式化");
				callbacks.onForceRefresh();
				return true;
			} else {
				new Notice("保存失败");
				return false;
			}
		} catch (error) {
			logger.error("[AI格式化] 应用失败:", error);
			new Notice(`应用失败: ${error instanceof Error ? error.message : "未知错误"}`);
			return false;
		}
	}

	/**
	 * AI拆分卡片
	 */
	async splitCard(
		card: Card,
		targetCount = 0,
		positionMap?: Map<number, string>
	): Promise<AIGenerationResult> {
		if (!card) {
			return { success: false, cards: [], error: "无卡片" };
		}

		try {
			// 区分首次拆分和重新生成
			const isRegeneration = positionMap && positionMap.size > 0;
			if (!isRegeneration) {
				new Notice("正在拆分卡片...");
			}

			// 获取AI服务
			const { AIServiceFactory } = await import("../ai/AIServiceFactory");

			const aiConfig = this.context.plugin.settings.aiConfig;
			const provider = resolveDefaultAIProvider(aiConfig);

			logger.debug("[AI拆分] 使用提供商:", provider);
			const aiService = AIServiceFactory.createService(provider, this.context.plugin);

			if (!aiService) {
				throw new Error(`AI服务未配置，请在设置中配置 ${provider} 的API密钥`);
			}

			// 构建拆分请求
			const request: SplitCardRequest = {
				parentCardId: card.uuid,
				content: {
					front: getCardFront(card) || card.content || "",
					back: getCardBack(card),
				},
				targetCount: targetCount,
				instruction:
					this.context.plugin.settings.aiConfig?.cardSplitting?.defaultInstruction || undefined,
				templateId: card.templateId,
			};

			// 调用AI拆分
			const response = await aiService.splitParentCard(request);

			if (!response.success || !response.childCards || response.childCards.length === 0) {
				throw new Error(response.error || "拆分失败");
			}

			// 转换为临时卡片数据
			const now = new Date().toISOString();
			const tempChildCards: Card[] = response.childCards.flatMap((child: unknown, index: number) => {
				if (!child || typeof child !== "object") {
					return [];
				}
				const record = child as Record<string, unknown>;
				if (typeof record.front !== "string" || typeof record.back !== "string") {
					return [];
				}
				const childTags = Array.isArray(record.tags)
					? record.tags.filter((tag): tag is string => typeof tag === "string")
					: card.tags || [];

				return [{
				uuid: `temp-uuid-${Date.now()}-${index}`,
				deckId: card.deckId,
				templateId: card.templateId,
				type: card.type,
				cardPurpose: "memory",
				content: `${record.front}\n\n---div---\n\n${record.back}`,
				tags: childTags,
				priority: 0,
				fsrs: {
					due: now,
					stability: 0,
					difficulty: 0,
					elapsedDays: 0,
					scheduledDays: 0,
					reps: 0,
					lapses: 0,
					state: CardState.New,
					retrievability: 0,
				},
				reviewHistory: [],
				stats: {
					totalReviews: 0,
					totalTime: 0,
					averageTime: 0,
					memoryRate: 0,
				},
				created: now,
				modified: now,

				parentCardId: card.uuid,
				relationMetadata: {
					derivationMethod: DerivationMethod.AI_SPLIT,
					sourceCardId: card.uuid,
					createdAt: now,
					isParent: false,
					level: 1,
				},
			}];
			});

			if (!isRegeneration) {
				new Notice(`成功拆分为${tempChildCards.length}张子卡片`);
			}

			return { success: true, cards: tempChildCards };
		} catch (error) {
			logger.error("[AI拆分] 失败:", error);
			const errorMessage = error instanceof Error ? error.message : "拆分失败";
			new Notice(`拆分失败: ${errorMessage}`);
			return { success: false, cards: [], error: errorMessage };
		}
	}

	/**
	 * 加载记忆牌组列表
	 */
	async loadMemoryDecks(): Promise<Array<{ id: string; name: string }>> {
		try {
			const allDecks = await this.context.dataStorage.getDecks();

			// 只加载记忆学习牌组（非题库牌组）
			const memoryDecks = allDecks
				.filter((deck) => deck.purpose !== "test")
				.map((deck) => ({
					id: deck.id,
					name: deck.name,
				}));

			return memoryDecks;
		} catch (error) {
			logger.error("[AI拆分] 加载记忆牌组失败:", error);
			// 创建默认牌组备用
			return [{ id: "default-memory", name: "默认记忆牌组" }];
		}
	}

}
