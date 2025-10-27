/**
 * OpenAI服务实现
 */

import { AIService } from './AIService';
import type {
  GenerationConfig,
  AIServiceResponse,
  RegenerateRequest,
  GenerationProgress,
  GeneratedCard,
  SplitCardRequest,
  SplitCardResponse
} from '../../types/ai-types';
import { requestUrl } from 'obsidian';

export class OpenAIService extends AIService {
  protected baseUrl = 'https://api.openai.com/v1';

  async generateCards(
    content: string,
    config: GenerationConfig,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<AIServiceResponse> {
    try {
      // 优化的进度更新策略：非线性增长，减少等待焦虑
      onProgress?.({
        status: 'preparing',
        progress: 15,
        message: '准备生成卡片...'
      });

      const systemPrompt = this.buildSystemPrompt(config);
      const userPrompt = this.buildUserPrompt(content, config.promptTemplate);

      onProgress?.({
        status: 'generating',
        progress: 25,
        message: '正在调用AI服务...'
      });

      // 模拟进度增长（等待API响应期间）
      const progressInterval = setInterval(() => {
        if (onProgress) {
          const currentProgress = Math.min(85, 25 + Math.random() * 5);
          onProgress({
            status: 'generating',
            progress: currentProgress,
            message: `AI正在思考...（${config.cardCount}张卡片）`
          });
        }
      }, 500);

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          response_format: { type: 'json_object' }
        })
      });

      clearInterval(progressInterval);

      onProgress?.({
        status: 'parsing',
        progress: 90,
        message: '解析生成结果...'
      });

      const data = response.json;
      const content_text = data.choices[0].message.content;
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
          provider: 'openai',
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
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          estimatedCost: this.estimateCost(
            data.usage.prompt_tokens,
            data.usage.completion_tokens
          )
        }
      };
    } catch (error) {
      onProgress?.({
        status: 'failed',
        progress: 0,
        message: '生成失败'
      });
      return this.handleError(error);
    }
  }

  async regenerateCard(
    request: RegenerateRequest,
    config: GenerationConfig
  ): Promise<AIServiceResponse> {
    try {
      const systemPrompt = `你是一个专业的学习卡片生成助手。现在需要根据用户的修改要求，重新生成一张卡片。

原始卡片信息：
类型：${request.originalCard.type}
正面：${request.originalCard.front}
背面：${request.originalCard.back}

请根据用户的修改要求生成新卡片，保持与原卡片相同的格式，以JSON格式返回。`;

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request.instruction }
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          response_format: { type: 'json_object' }
        })
      });

      const data = response.json;
      const content_text = data.choices[0].message.content;
      const parsedCards = this.parseResponse(content_text);

      if (parsedCards.length === 0) {
        throw new Error('未能生成新卡片');
      }

      const newCard: GeneratedCard = {
        id: request.cardId,
        type: parsedCards[0].type || request.originalCard.type,
        front: this.ensureString(parsedCards[0].front),
        back: this.ensureString(parsedCards[0].back),
        choices: parsedCards[0].choices,
        correctAnswer: parsedCards[0].correctAnswer,
        clozeText: parsedCards[0].clozeText,
        tags: parsedCards[0].tags || [],
        images: parsedCards[0].images || [],
        explanation: parsedCards[0].explanation,
        metadata: {
          generatedAt: new Date().toISOString(),
          provider: 'openai',
          model: this.model,
          temperature: config.temperature
        }
      };

      return {
        success: true,
        cards: [newCard],
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          estimatedCost: this.estimateCost(
            data.usage.prompt_tokens,
            data.usage.completion_tokens
          )
        }
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async splitParentCard(request: SplitCardRequest): Promise<SplitCardResponse> {
    try {
      // 构建拆分提示词
      const systemPrompt = `你是一个专业的学习卡片拆分助手，遵循"最小信息原则"。

你的任务是将一张包含多个知识点的父卡片拆分为多张独立的子卡片。每张子卡片应该只包含一个清晰的知识点。

拆分原则：
1. 每张子卡片只包含一个核心概念或知识点
2. 保持子卡片的独立性和完整性
3. 子卡片应该可以独立复习和理解
4. 保留必要的上下文，但避免重复信息
5. 保持原有的格式风格和表达方式

输出格式（JSON）：
{
  "cards": [
    {
      "front": "问题或提示",
      "back": "答案或解释",
      "tags": ["可选标签"],
      "explanation": "可选的额外说明"
    }
  ]
}

${request.targetCount ? `请生成约${request.targetCount}张子卡片。` : '请根据内容自动决定合适的子卡片数量（建议2-5张）。'}`;

      const userPrompt = `请将以下卡片拆分为多张子卡片：

【卡片正面】
${request.content.front}

【卡片背面】
${request.content.back}

${request.instruction ? `\n【额外要求】\n${request.instruction}` : ''}

请按照JSON格式输出拆分后的子卡片。`;

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 3000,
          response_format: { type: 'json_object' }
        })
      });

      const data = response.json;
      const content_text = data.choices[0].message.content;
      
      // 解析JSON响应
      const parsed = JSON.parse(content_text);
      const childCards = parsed.cards || [];

      if (!Array.isArray(childCards) || childCards.length === 0) {
        throw new Error('AI未能生成有效的子卡片');
      }

      // 规范化子卡片数据
      const normalizedCards = childCards.map(card => ({
        front: this.ensureString(card.front),
        back: this.ensureString(card.back),
        tags: Array.isArray(card.tags) ? card.tags : [],
        explanation: card.explanation ? this.ensureString(card.explanation) : undefined
      }));

      return {
        success: true,
        childCards: normalizedCards,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          estimatedCost: this.estimateCost(
            data.usage.prompt_tokens,
            data.usage.completion_tokens
          )
        }
      };
    } catch (error) {
      console.error('OpenAI splitParentCard error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '拆分卡片失败'
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.status === 200;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  /**
   * 通用对话接口
   */
  async chat(request: import('./AIService').ChatRequest): Promise<import('./AIService').ChatResponse> {
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
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2000
        })
      });

      const data = response.json;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI未返回有效内容');
      }

      return {
        success: true,
        content: content.trim(),
        model: this.model,
        tokensUsed: data.usage?.total_tokens,
        cost: this.estimateCost(
          data.usage?.prompt_tokens || 0,
          data.usage?.completion_tokens || 0
        )
      };
    } catch (error) {
      console.error('OpenAI chat error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OpenAI调用失败'
      };
    }
  }

  /**
   * 确保值是字符串
   * 处理AI可能返回对象、数组、undefined等非字符串类型的情况
   */
  private ensureString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    // 如果是对象或数组，尝试JSON化后返回（作为降级方案）
    if (typeof value === 'object') {
      console.warn('AI返回了非字符串类型的卡片内容:', value);
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    
    // 其他类型（数字、布尔等）转为字符串
    return String(value);
  }
}


