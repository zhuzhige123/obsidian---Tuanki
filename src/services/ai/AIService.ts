/**
 * AI服务抽象基类
 */

import type {
  IAIService,
  GenerationConfig,
  AIServiceResponse,
  RegenerateRequest,
  GenerationProgress,
  SystemPromptConfig,
  SplitCardRequest,
  SplitCardResponse
} from '../../types/ai-types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import { OFFICIAL_TEMPLATES } from '../../constants/official-templates';
import { PromptBuilderService } from './PromptBuilderService';

/**
 * Chat消息接口
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat请求接口
 */
export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chat响应接口
 */
export interface ChatResponse {
  success: boolean;
  content?: string;
  model?: string;
  tokensUsed?: number;
  cost?: number;
  error?: string;
}

export abstract class AIService implements IAIService {
  protected apiKey: string;
  protected model: string;
  protected systemPromptConfig?: SystemPromptConfig;

  constructor(apiKey: string, model: string, systemPromptConfig?: SystemPromptConfig) {
    this.apiKey = apiKey;
    this.model = model;
    this.systemPromptConfig = systemPromptConfig;
  }

  /**
   * 生成卡片
   */
  abstract generateCards(
    content: string,
    config: GenerationConfig,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<AIServiceResponse>;

  /**
   * 重新生成单张卡片
   */
  abstract regenerateCard(
    request: RegenerateRequest,
    config: GenerationConfig
  ): Promise<AIServiceResponse>;

  /**
   * 拆分父卡片为多个子卡片
   */
  abstract splitParentCard(
    request: SplitCardRequest
  ): Promise<SplitCardResponse>;

  /**
   * 测试API连接
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * 通用对话接口（用于格式化等非生成场景）
   */
  abstract chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 加载模板信息
   */
  protected loadTemplates(config: GenerationConfig): {
    qa?: ParseTemplate;
    choice?: ParseTemplate;
    cloze?: ParseTemplate;
  } {
    const templates = config.templates;
    if (!templates) return {};

    return {
      qa: OFFICIAL_TEMPLATES.find(t => t.id === templates.qa),
      choice: OFFICIAL_TEMPLATES.find(t => t.id === templates.choice),
      cloze: OFFICIAL_TEMPLATES.find(t => t.id === templates.cloze)
    };
  }

  /**
   * 构建系统提示词（使用PromptBuilderService）
   */
  protected buildSystemPrompt(config: GenerationConfig): string {
    return PromptBuilderService.buildSystemPrompt(config, this.systemPromptConfig);
  }

  /**
   * 构建用户提示词（使用PromptBuilderService）
   */
  protected buildUserPrompt(content: string, promptTemplate: string): string {
    return PromptBuilderService.buildUserPrompt(content, promptTemplate);
  }

  /**
   * 解析AI响应为卡片数组
   */
  protected parseResponse(responseText: string): any[] {
    try {
      // 尝试提取JSON数组
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 尝试直接解析
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('AI返回的内容格式不正确');
    }
  }

  /**
   * 生成卡片ID
   */
  protected generateCardId(): string {
    return `ai-card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 估算成本（默认实现）
   */
  protected estimateCost(promptTokens: number, completionTokens: number): number {
    // 默认按GPT-4定价估算（实际应根据不同模型调整）
    const promptCost = (promptTokens / 1000) * 0.03;
    const completionCost = (completionTokens / 1000) * 0.06;
    return promptCost + completionCost;
  }

  /**
   * 处理API错误
   */
  protected handleError(error: any): AIServiceResponse {
    console.error('AI Service Error:', error);

    let errorMessage = 'AI服务调用失败';

    if (error.message) {
      errorMessage = error.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error.message || errorMessage;
    } else if (error.status === 401) {
      errorMessage = 'API密钥无效或已过期';
    } else if (error.status === 429) {
      errorMessage = 'API调用频率超限，请稍后再试';
    } else if (error.status === 500) {
      errorMessage = 'AI服务暂时不可用';
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}


