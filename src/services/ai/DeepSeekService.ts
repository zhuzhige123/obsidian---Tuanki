/**
 * DeepSeek AI服务实现
 * 继承自OpenAIService，使用DeepSeek API端点
 */

import { OpenAIService } from './OpenAIService';

export class DeepSeekService extends OpenAIService {
  /**
   * DeepSeek API基础URL
   */
  protected baseUrl = 'https://api.deepseek.com';

  /**
   * DeepSeek成本估算
   * 参考：https://platform.deepseek.com/pricing
   */
  estimateCost(promptTokens: number, completionTokens: number): number {
    // DeepSeek-Chat 定价（2024年价格，单位：元/百万tokens）
    const PROMPT_PRICE = 1.0;      // ¥1/M tokens (输入)
    const COMPLETION_PRICE = 2.0;  // ¥2/M tokens (输出)

    const promptCost = (promptTokens / 1_000_000) * PROMPT_PRICE;
    const completionCost = (completionTokens / 1_000_000) * COMPLETION_PRICE;

    return promptCost + completionCost;
  }

  /**
   * 测试DeepSeek API连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const { requestUrl } = await import('obsidian');
      
      const response = await requestUrl({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.status === 200;
    } catch (error) {
      console.error('DeepSeek connection test failed:', error);
      return false;
    }
  }

  /**
   * DeepSeek特定错误处理
   */
  protected handleError(error: any): any {
    console.error('DeepSeek API Error:', error);

    let errorMessage = 'DeepSeek API调用失败';

    if (error.message) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'DeepSeek API密钥无效，请检查配置';
      } else if (error.message.includes('429') || error.message.includes('rate limit')) {
        errorMessage = 'DeepSeek API请求频率超限，请稍后重试';
      } else if (error.message.includes('quota')) {
        errorMessage = 'DeepSeek API配额不足';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'DeepSeek API请求超时';
      } else {
        errorMessage = `DeepSeek API错误: ${error.message}`;
      }
    }

    return {
      success: false,
      error: errorMessage,
      cards: []
    };
  }
}



