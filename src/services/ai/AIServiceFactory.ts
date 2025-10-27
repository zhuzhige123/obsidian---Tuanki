/**
 * AI服务工厂
 */

import { OpenAIService } from './OpenAIService';
import { ZhipuService } from './ZhipuService';
import { DeepSeekService } from './DeepSeekService';
import { GeminiService } from './GeminiService';
import { AnthropicService } from './AnthropicService';
import { SiliconFlowService } from './SiliconFlowService';
import type { AIProvider } from '../../types/ai-types';
import type { IAIService } from '../../types/ai-types';
import type AnkiPlugin from '../../main';

export class AIServiceFactory {
  /**
   * 创建AI服务实例
   */
  static createService(
    provider: AIProvider,
    plugin: AnkiPlugin
  ): IAIService {
    const aiConfig = plugin.settings.aiConfig;

    if (!aiConfig) {
      throw new Error('AI配置未初始化');
    }

    const providerConfig = aiConfig.apiKeys[provider];

    if (!providerConfig || !providerConfig.apiKey) {
      throw new Error(`${provider} API密钥未配置`);
    }

    switch (provider) {
      case 'openai':
        return new OpenAIService(
          providerConfig.apiKey,
          providerConfig.model
        );

      case 'zhipu':
        return new ZhipuService(
          providerConfig.apiKey,
          providerConfig.model
        );

      case 'deepseek':
        return new DeepSeekService(
          providerConfig.apiKey,
          providerConfig.model
        );

      case 'gemini':
        return new GeminiService(
          providerConfig.apiKey,
          providerConfig.model
        );

      case 'anthropic':
        return new AnthropicService(
          providerConfig.apiKey,
          providerConfig.model
        );

      case 'siliconflow':
        return new SiliconFlowService(
          providerConfig.apiKey,
          providerConfig.model
        );

      default:
        throw new Error(`不支持的AI服务提供商: ${provider}`);
    }
  }

  /**
   * 获取默认服务实例
   */
  static getDefaultService(plugin: AnkiPlugin): IAIService {
    const aiConfig = plugin.settings.aiConfig;

    if (!aiConfig) {
      throw new Error('AI配置未初始化');
    }

    return this.createService(aiConfig.defaultProvider, plugin);
  }
}


