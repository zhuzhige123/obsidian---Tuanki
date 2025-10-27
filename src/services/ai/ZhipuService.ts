/**
 * 智谱清言AI服务实现
 * 基于OpenAI兼容API格式
 */

import { OpenAIService } from './OpenAIService';

export class ZhipuService extends OpenAIService {
  constructor(apiKey: string, model: string) {
    super(apiKey, model);
    // 智谱AI的API端点
    this.baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
  }

  /**
   * 智谱清言免费模型，成本估算返回0
   */
  protected estimateCost(promptTokens: number, completionTokens: number): number {
    return 0; // 免费模型
  }

  /**
   * 测试智谱AI连接
   * 使用轻量级请求验证API密钥和连接状态
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'user', content: 'hi' }
          ],
          max_tokens: 5
        })
      });

      return response.status === 200;
    } catch (error) {
      console.error('Zhipu AI connection test failed:', error);
      return false;
    }
  }

  /**
   * 增强错误处理，添加智谱AI特定错误提示
   */
  protected handleError(error: any): import('../../types/ai-types').AIServiceResponse {
    console.error('Zhipu AI Service Error:', error);

    let errorMessage = 'AI服务调用失败';

    if (error.message) {
      errorMessage = error.message;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error.message || errorMessage;
    } else if (error.status === 401) {
      errorMessage = 'API密钥无效或已过期，请检查智谱AI配置';
    } else if (error.status === 429) {
      errorMessage = '免费额度已用完，请稍后再试或升级套餐';
    } else if (error.status === 500) {
      errorMessage = '智谱AI服务暂时不可用，请稍后重试';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到智谱AI服务器，请检查网络连接';
    }

    // 智谱AI特有错误码处理
    if (error.code === 'QUOTA_EXCEEDED') {
      errorMessage = '今日免费额度已用完，明日自动重置';
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

// 需要导入requestUrl
import { requestUrl } from 'obsidian';




