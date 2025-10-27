/**
 * 提示词模板工具函数
 */

import type { GenerationConfig } from '../types/ai-types';

/**
 * 替换模板中的变量
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, String(value));
  }

  return result;
}

/**
 * 从配置构建变量对象
 */
export function buildVariablesFromConfig(config: GenerationConfig): Record<string, string | number> {
  return {
    count: config.cardCount,
    difficulty: config.difficulty,
    template: config.templateId,
    qaPercent: config.typeDistribution.qa,
    clozePercent: config.typeDistribution.cloze,
    choicePercent: config.typeDistribution.choice
  };
}

/**
 * 提取模板中的变量名
 */
export function extractVariables(template: string): string[] {
  const regex = /\{(\w+)\}/g;
  const matches = [...template.matchAll(regex)];
  return [...new Set(matches.map(m => m[1]))];
}

/**
 * 验证模板变量是否完整
 */
export function validateTemplate(
  template: string,
  requiredVariables: string[]
): { valid: boolean; missing: string[] } {
  const extractedVariables = extractVariables(template);
  const missing = requiredVariables.filter(v => !extractedVariables.includes(v));

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * 格式化难度等级为中文
 */
export function formatDifficulty(difficulty: 'easy' | 'medium' | 'hard'): string {
  const map = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  };
  return map[difficulty] || difficulty;
}



