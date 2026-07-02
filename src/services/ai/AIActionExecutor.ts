import { logger } from "../../utils/logger";
/**
 * AI Action统一执行器
 *
 * 职责：
 * 1. 统一的provider选择逻辑
 * 2. 统一的API密钥验证
 * 3. 统一的错误处理
 * 4. 协调调用专用服务
 *
 * 设计原则：
 * - 所有AI功能（格式化/拆分）都通过此执行器
 * - 消除代码重复，确保一致性
 * - 类型安全，避免any类型
 */

import { AI_PROVIDER_LABELS } from "../../components/settings/constants/settings-constants";
import type { AIProvider } from "../../types/ai-types";
import { resolveDefaultAIProvider } from "./AIConfigService";
import type { Card, Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import type { AIAction, FormatPreviewResult } from "../../types/ai-types";
import type { ParseTemplate } from "../../types/newCardParsingTypes";
import { AIFormatterService } from "./AIFormatterService";
import {
	AISplitService,
	type SplitCardData,
	type SplitConfig,
	type SplitResult as AISplitServiceResult,
} from "./AISplitService";
import { AIConfigError, AIExecutionError, AIProviderError } from "./errors";

/**
 * 格式化上下文
 */
interface FormatContext {
	template?: ParseTemplate;
	deck?: Deck;
}

/**
 * 拆分结果
 */
type SplitResult = Omit<AISplitServiceResult, "splitCards"> & {
	childCards?: SplitCardData[];
};

type ProviderApiConfig = {
	apiKey?: string;
};

/**
 * AI Action统一执行器
 */
export class AIActionExecutor {
	constructor(private plugin: WeavePlugin) {}

	/**
	 * 执行AI格式化
	 *
	 * @param action - AI功能配置
	 * @param card - 要格式化的卡片
	 * @param context - 格式化上下文（模板、牌组等）
	 * @returns 格式化结果
	 */
	async executeFormat(
		action: AIAction,
		card: Card,
		context: FormatContext
	): Promise<FormatPreviewResult> {
		// 1. 统一的provider选择和验证
		const provider = this.selectProvider(action);
		this.validateProvider(provider);

		// 2. 安全执行（统一错误处理）
		return await this.safeExecute(
			async () => {
				// 确保action有provider（验证后）
				const actionWithProvider = { ...action, provider };
				// ✅ 调用静态方法（formatWithCustomAction是静态方法）
				return await AIFormatterService.formatWithCustomAction(
					actionWithProvider,
					card,
					context,
					this.plugin
				);
			},
			provider,
			"format"
		);
	}

	/**
	 * 执行AI拆分
	 *
	 * @param action - AI功能配置
	 * @param card - 要拆分的卡片
	 * @param config - 可选的拆分配置覆盖
	 * @returns 拆分结果
	 */
	async executeSplit(
		action: AIAction,
		card: Card,
		config?: Partial<SplitConfig>
	): Promise<SplitResult> {
		const provider = this.selectProvider(action);
		this.validateProvider(provider);

		const service = new AISplitService(this.plugin);

		return await this.safeExecute(
			async () => {
				const actionWithProvider = { ...action, provider };
				const result = await service.splitCard(card, actionWithProvider, config);

				// 🔧 修复字段名不匹配：AISplitService返回splitCards，需要映射为childCards
				logger.debug("[AIActionExecutor] AISplitService原始响应:", {
					success: result.success,
					hasSplitCards: !!result.splitCards,
					splitCardsCount: result.splitCards?.length || 0,
				});

				const mappedResult = {
					...result,
					childCards: result.splitCards, // 映射字段名
				};

				logger.debug("[AIActionExecutor] 映射后的响应:", {
					success: mappedResult.success,
					hasChildCards: !!mappedResult.childCards,
					childCardsCount: mappedResult.childCards?.length || 0,
				});

				return mappedResult;
			},
			provider,
			"split"
		);
	}

	/**
	 * 统一的provider选择逻辑
	 * 优先级：action.provider > defaultProvider
	 *
	 * @param action - AI功能配置
	 * @returns 选中的provider
	 * @throws AIConfigError 如果未设置任何provider
	 */
	private selectProvider(action: AIAction): AIProvider {
		const aiConfig = this.plugin.settings.aiConfig;

		// 优先使用action配置的provider
		if (action.provider) {
			return action.provider;
		}

		const defaultProvider = resolveDefaultAIProvider(aiConfig);
		if (defaultProvider) {
			return defaultProvider;
		}

		throw new AIConfigError("未设置AI提供商，请在 [插件设置 > AI服务] 中配置默认AI服务");
	}

	/**
	 * 统一的provider验证
	 * 检查API密钥是否配置
	 *
	 * @param provider - 要验证的provider
	 * @throws AIProviderError 如果API密钥未配置
	 */
	private validateProvider(provider: AIProvider): void {
		const providerConfig = (
			this.plugin.settings.aiConfig?.apiKeys as
				| Partial<Record<AIProvider, ProviderApiConfig>>
				| undefined
		)?.[provider];

		if (!providerConfig || !providerConfig.apiKey) {
			throw new AIProviderError(
				provider,
				`${AI_PROVIDER_LABELS[provider]} 未配置API密钥`,
				"NO_API_KEY"
			);
		}
	}

	/**
	 * 统一的错误处理和执行包装
	 *
	 * @param executor - 要执行的函数
	 * @param provider - 使用的provider
	 * @param actionType - 功能类型（用于错误提示）
	 * @returns 执行结果
	 * @throws AIExecutionError 执行失败时
	 */
	private async safeExecute<T>(
		executor: () => Promise<T>,
		provider: AIProvider,
		actionType: string
	): Promise<T> {
		try {
			return await executor();
		} catch (error) {
			// AIProviderError 和 AIConfigError 直接抛出（已经是友好错误）
			if (error instanceof AIProviderError || error instanceof AIConfigError) {
				throw error;
			}

			// 其他错误包装为AIExecutionError
			const message = error instanceof Error ? error.message : "未知错误";
			throw new AIExecutionError(
				message,
				provider,
				actionType,
				error instanceof Error ? error : undefined
			);
		}
	}
}
