/**
 * Google Gemini AI服务实现
 * API文档: https://ai.google.dev/api/rest
 */

import { AIService } from './AIService';
import type { GenerationConfig, GeneratedCard, AIServiceResponse, GenerationProgress } from '../../types/ai-types';

export class GeminiService extends AIService {
  protected baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  async generateCards(
    content: string,
    config: GenerationConfig,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<AIServiceResponse> {
    try {
      onProgress?.({
        status: 'preparing',
        progress: 10,
        message: '准备生成卡片...'
      });

      const systemPrompt = this.buildSystemPrompt(config);
      const userPrompt = this.buildUserPrompt(content, config.promptTemplate);

      onProgress?.({
        status: 'generating',
        progress: 25,
        message: '正在调用Gemini服务...'
      });

      const { requestUrl } = await import('obsidian');

      // Gemini API 格式
      const response = await requestUrl({
        url: `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${userPrompt}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
            responseMimeType: 'application/json'
          }
        })
      });

      onProgress?.({
        status: 'parsing',
        progress: 90,
        message: '解析生成结果...'
      });

      const data = response.json;
      
      // Gemini 响应格式
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Gemini未返回有效内容');
      }

      const content_text = data.candidates[0].content.parts[0].text;
      const parsedCards = this.parseResponse(content_text);

      // 转换为GeneratedCard格式
      const cards: GeneratedCard[] = parsedCards.map((card: any) => ({
        id: this.generateCardId(),
        type: card.type || 'qa',
        front: this.ensureString(card.front),
        back: this.ensureString(card.back),
        choices: card.choices,
        correctAnswer: card.correctAnswer,
        clozeText: card.clozeText,
        tags: card.tags || [],
        images: card.images || [],
        explanation: card.explanation,
        metadata: {
          generatedAt: new Date().toISOString(),
          provider: 'gemini',
          model: this.model,
          temperature: config.temperature
        }
      }));

      onProgress?.({
        status: 'completed',
        progress: 100,
        message: `成功生成${cards.length}张卡片`
      });

      return {
        success: true,
        cards,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0
        },
        cost: this.estimateCost(
          data.usageMetadata?.promptTokenCount || 0,
          data.usageMetadata?.candidatesTokenCount || 0
        )
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  estimateCost(promptTokens: number, completionTokens: number): number {
    // Gemini 1.5 Pro 定价（美元，2024年价格）
    // 输入: $0.00025 / 1K tokens (128K context以下)
    // 输出: $0.0005 / 1K tokens
    const PROMPT_PRICE = 0.00025;
    const COMPLETION_PRICE = 0.0005;

    const promptCost = (promptTokens / 1000) * PROMPT_PRICE;
    const completionCost = (completionTokens / 1000) * COMPLETION_PRICE;

    return promptCost + completionCost;
  }

  async testConnection(): Promise<boolean> {
    try {
      const { requestUrl } = await import('obsidian');
      
      const response = await requestUrl({
        url: `${this.baseUrl}/models?key=${this.apiKey}`,
        method: 'GET'
      });

      return response.status === 200;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  /**
   * 通用对话接口
   */
  async chat(request: import('./AIService').ChatRequest): Promise<import('./AIService').ChatResponse> {
    try {
      const { requestUrl } = await import('obsidian');
      
      // 转换消息格式 - Gemini不支持system角色
      const contents = request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
      
      // 提取system消息作为第一个user消息的前缀
      const systemMessage = request.messages.find(m => m.role === 'system');
      if (systemMessage && contents.length > 0 && contents[0].role === 'user') {
        contents[0].parts[0].text = `${systemMessage.content}\n\n${contents[0].parts[0].text}`;
      }
      
      const response = await requestUrl({
        url: `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? 2000
          }
        })
      });

      const data = response.json;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error('Gemini未返回有效内容');
      }

      return {
        success: true,
        content: content.trim(),
        model: this.model
      };
    } catch (error) {
      console.error('Gemini chat error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Gemini调用失败'
      };
    }
  }

  protected handleError(error: any): AIServiceResponse {
    console.error('Gemini API Error:', error);

    let errorMessage = 'Gemini API调用失败';

    if (error.message) {
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('401')) {
        errorMessage = 'Gemini API密钥无效，请检查配置';
      } else if (error.message.includes('QUOTA_EXCEEDED') || error.message.includes('429')) {
        errorMessage = 'Gemini API配额超限，请稍后重试';
      } else if (error.message.includes('SAFETY')) {
        errorMessage = 'Gemini安全过滤器触发，请调整内容';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Gemini API请求超时';
      } else {
        errorMessage = `Gemini API错误: ${error.message}`;
      }
    }

    return {
      success: false,
      error: errorMessage,
      cards: []
    };
  }

  private generateCardId(): string {
    return `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private ensureString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'object') {
      console.warn('Gemini返回了非字符串类型的卡片内容:', value);
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    
    return String(value);
  }
}



