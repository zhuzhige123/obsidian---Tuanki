/**
 * AI驱动的卡片格式化服务
 * 使用真实AI模型进行智能格式规范化
 */

import type { AIProvider, CustomFormatAction, FormatPreviewResult } from '../../types/ai-types';
import type { Card } from '../../data/types';
import type { ParseTemplate } from '../../types/newCardParsingTypes';
import type { Deck } from '../../data/types';
import type AnkiPlugin from '../../main';
import { AIServiceFactory } from './AIServiceFactory';
import { PromptVariableResolver } from './PromptVariableResolver';

export interface FormatRequest {
  content: string;
  formatType: 'choice';
}

export interface FormatResponse {
  success: boolean;
  formattedContent?: string;
  error?: string;
  provider?: AIProvider;
  model?: string;
}

export class AIFormatterService {
  private static variableResolver = new PromptVariableResolver();
  
  /**
   * 使用自定义功能格式化卡片
   * @param action 自定义格式化功能配置
   * @param card 要格式化的卡片
   * @param context 上下文信息（模板、牌组）
   * @param plugin 插件实例
   * @returns 格式化预览结果
   */
  static async formatWithCustomAction(
    action: CustomFormatAction,
    card: Card,
    context: { template?: ParseTemplate; deck?: Deck },
    plugin: AnkiPlugin
  ): Promise<FormatPreviewResult> {
    try {
      const aiConfig = plugin.settings.aiConfig;
      
      if (!aiConfig?.formatting?.enabled) {
        return {
          success: false,
          originalContent: card.content || '',
          error: 'AI格式化功能未启用'
        };
      }
      
      // 确定使用的AI提供商
      const provider = action.provider || aiConfig.formattingProvider || aiConfig.defaultProvider;
      
      if (!provider) {
        return {
          success: false,
          originalContent: card.content || '',
          error: '未设置AI提供商'
        };
      }
      
      // 检查API密钥
      const providerConfig = aiConfig.apiKeys[provider];
      if (!providerConfig || !providerConfig.apiKey) {
        return {
          success: false,
          originalContent: card.content || '',
          error: `AI提供商"${provider}"未配置API密钥`
        };
      }
      
      // 解析模板变量
      const systemPrompt = this.variableResolver.resolve(action.systemPrompt, card, context);
      const userPrompt = this.variableResolver.resolve(action.userPromptTemplate, card, context);
      
      console.log('[AIFormatterService] 使用自定义功能:', action.name);
      console.log('[AIFormatterService] 提供商:', provider, '模型:', providerConfig.model);
      
      // 获取AI服务
      const aiService = AIServiceFactory.createService(provider, plugin);
      
      // 调用AI服务
      const response = await aiService.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: action.temperature ?? 0.1,
        maxTokens: action.maxTokens ?? 2000
      });
      
      if (!response.success || !response.content) {
        return {
          success: false,
          originalContent: card.content || '',
          error: response.error || 'AI格式化失败'
        };
      }
      
      // 清理AI响应
      const formattedContent = this.cleanAIResponse(response.content);
      
      return {
        success: true,
        originalContent: card.content || '',
        formattedContent,
        provider,
        model: response.model
      };
      
    } catch (error) {
      console.error('[AIFormatterService] Error:', error);
      return {
        success: false,
        originalContent: card.content || '',
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }
  
  /**
   * 格式化选择题内容
   */
  static async formatChoiceQuestion(
    request: FormatRequest,
    plugin: AnkiPlugin
  ): Promise<FormatResponse> {
    try {
      const aiConfig = plugin.settings.aiConfig;
      
      // 检查AI格式化是否启用
      if (!aiConfig?.formatting?.enabled) {
        return {
          success: false,
          error: 'AI格式化功能未启用，请在设置中开启'
        };
      }
      
      // 确定使用的提供商：优先使用formattingProvider，否则使用defaultProvider
      const provider = aiConfig.formattingProvider || aiConfig.defaultProvider;
      
      if (!provider) {
        return {
          success: false,
          error: '未设置AI提供商，请在设置中配置'
        };
      }
      
      const providerConfig = aiConfig.apiKeys[provider];
      
      if (!providerConfig || !providerConfig.apiKey) {
        return {
          success: false,
          error: `格式化AI提供商"${provider}"未配置API密钥，请在设置中配置`
        };
      }
      
      // 直接使用提供商的模型配置
      const model = providerConfig.model;
      
      console.log('[AIFormatterService] 使用提供商:', provider, '模型:', model);
      
      // 获取AI服务
      const aiService = AIServiceFactory.createService(provider, plugin);
      
      // 构建提示词
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(request.content);
      
      console.log('[AIFormatterService] 开始调用AI服务...');
      
      // 调用AI服务
      const response = await aiService.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        maxTokens: 2000
      });
      
      if (!response.success || !response.content) {
        console.error('[AIFormatterService] AI调用失败:', response.error);
        return {
          success: false,
          error: response.error || 'AI格式化失败'
        };
      }
      
      console.log('[AIFormatterService] AI调用成功，开始清理和验证格式...');
      
      // 清理AI响应内容（移除可能的代码块包裹）
      const formattedContent = this.cleanAIResponse(response.content);
      
      // 基础验证：检查是否符合选择题格式
      const validation = this.validateChoiceFormat(formattedContent);
      
      if (!validation.isValid) {
        console.error('[AIFormatterService] 格式验证失败:', validation.reason);
        return {
          success: false,
          error: `格式化结果不符合规范：${validation.reason}`
        };
      }
      
      console.log('[AIFormatterService] 格式验证通过');
      
      return {
        success: true,
        formattedContent,
        provider,
        model: response.model
      };
      
    } catch (error) {
      console.error('[AIFormatterService] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }
  
  /**
   * 构建系统提示词
   */
  private static buildSystemPrompt(): string {
    return `你是一个选择题格式规范化助手。

## 核心原则
1. **不修改内容** - 保持所有文本完全一致
2. **仅调整格式** - 将内容重组为标准格式
3. **识别正确答案** - 添加 {✓} 标记

## 标准格式
\`\`\`
Q: [问题内容]

A) [选项A]
B) [选项B] {✓}
C) [选项C]
D) [选项D]

---

Explanation: [解析内容]
\`\`\`

## 格式要求
- 问题以"Q: "开头
- 选项用A) B) C) D)标记
- 正确答案后添加 {✓}
- 解析用"---"分隔，以"Explanation: "开头

## ❌ 严格禁止
- ❌ 改写或润色任何文本
- ❌ 添加新内容或删除原有内容
- ❌ 修改正确答案
- ❌ 纠正拼写/语法错误

## ✅ 允许操作
- ✅ 统一格式标记（A. → A)）
- ✅ 添加/调整空行
- ✅ 添加正确答案标记 {✓}
- ✅ 规范分隔符格式

## 📝 输出格式要求
**重要**：直接返回格式化后的文本内容，不要使用markdown代码块（\`\`\`）包裹，不要添加任何前缀、后缀或额外说明。

示例正确输出：
Q: 问题内容

A) 选项A
B) 选项B {✓}

---

Explanation: 解析内容`;
  }
  
  /**
   * 构建用户提示词
   */
  private static buildUserPrompt(content: string): string {
    return `请规范化以下选择题：

${content}`;
  }
  
  /**
   * 清理AI响应内容
   * 移除可能存在的markdown代码块包裹和多余空白
   */
  private static cleanAIResponse(content: string): string {
    if (!content) return '';
    
    let cleaned = content.trim();
    
    // 检测并移除外层markdown代码块包裹
    // 匹配模式：```可选语言标识\n内容\n```
    const codeBlockRegex = /^```(?:markdown|md|text|)?\s*\n?([\s\S]*?)\n?```$/;
    const match = cleaned.match(codeBlockRegex);
    
    if (match) {
      // 提取代码块内的内容
      cleaned = match[1].trim();
      console.log('[AIFormatterService] 检测到代码块包裹，已自动清理');
    }
    
    // 清理多余的空白行（保留必要的分隔）
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    return cleaned;
  }
  
  /**
   * 验证是否符合选择题格式
   */
  private static validateChoiceFormat(content: string): {
    isValid: boolean;
    reason?: string;
  } {
    // 1. 检查是否有问题
    if (!content.includes('Q:') && !content.includes('q:')) {
      return { isValid: false, reason: '缺少问题部分（Q:）' };
    }
    
    // 2. 检查是否有选项
    const optionsMatch = content.match(/[A-Z]\)/g);
    if (!optionsMatch || optionsMatch.length < 2) {
      return { isValid: false, reason: '选项数量不足（至少需要2个）' };
    }
    
    // 3. 检查是否有正确答案标记
    if (!content.includes('{✓}')) {
      return { isValid: false, reason: '缺少正确答案标记 {✓}' };
    }
    
    return { isValid: true };
  }
}

