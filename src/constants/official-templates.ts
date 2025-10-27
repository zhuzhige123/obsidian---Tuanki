/**
 * 官方模板定义
 * 这些模板由插件提供，不可删除和编辑
 */

import type { ParseTemplate } from '../types/newCardParsingTypes';

/**
 * 官方模板列表
 * 包含：基础模板（兼容旧版）、通用问答题、选择题、挖空题
 */
export const OFFICIAL_TEMPLATES: ParseTemplate[] = [
  {
    id: 'basic',
    name: '基础模板',
    description: '基础问答题格式（兼容旧版卡片）',
    type: 'single-field',
    cardType: 'basic-qa',
    fields: [
      { name: 'front', isRegex: false, pattern: 'front' },
      { name: 'back', isRegex: false, pattern: 'back' }
    ],
    regex: '',
    scenarios: [],
    isOfficial: true
  },
  {
    id: 'official-qa',
    name: '通用问答题',
    description: '标准的问答题格式，支持问题和答案字段',
    type: 'single-field',
    cardType: 'basic-qa',
    fields: [
      { name: 'front', isRegex: false, pattern: 'front' },
      { name: 'back', isRegex: false, pattern: 'back' }
    ],
    regex: '',
    scenarios: [],
    isOfficial: true
  },
  {
    id: 'official-choice',
    name: '选择题',
    description: `标准选择题格式（Markdown格式）
    
格式规范：
• 题目以"Q:"开头
• 选项使用A)、B)、C)、D)标注（圆括号）
• 正确答案用 {✓} 标记
• 多选题可以有多个 {✓} 标记
• 解析以"---div---"分隔，或在answer字段中提供

示例：
Q: 间隔重复学习的核心原理是什么？

A) 每天固定时间复习
B) 在即将遗忘时复习 {✓}
C) 随机复习
D) 只复习难题

---div---

解析：间隔重复利用遗忘曲线规律，在即将遗忘时进行复习，使记忆更牢固且学习效率更高。`,
    type: 'single-field',
    cardType: 'multiple-choice',
    fields: [
      { name: 'front', isRegex: false, pattern: 'front' },
      { name: 'back', isRegex: false, pattern: 'back' },
      { name: 'options', isRegex: false, pattern: 'options' },
      { name: 'correctAnswers', isRegex: false, pattern: 'correctAnswers' }
    ],
    regex: '',
    scenarios: [],
    isOfficial: true
  },
  {
    id: 'official-cloze',
    name: '挖空题',
    description: '填空题格式，支持挖空标记',
    type: 'single-field',
    cardType: 'cloze-deletion',
    fields: [
      { name: 'text', isRegex: false, pattern: 'text' },
      { name: 'hint', isRegex: false, pattern: 'hint' }
    ],
    regex: '',
    scenarios: [],
    isOfficial: true
  }
];

/**
 * 官方模板ID列表（仅包含三个核心模板）
 */
export const OFFICIAL_TEMPLATE_IDS = ['official-qa', 'official-choice', 'official-cloze'] as const;

/**
 * 官方模板ID类型
 */
export type OfficialTemplateId = typeof OFFICIAL_TEMPLATE_IDS[number];

/**
 * 检查给定的模板ID是否为官方模板
 * @param templateId 模板ID
 * @returns 是否为官方模板
 */
export function isOfficialTemplate(templateId: string): boolean {
  return OFFICIAL_TEMPLATE_IDS.includes(templateId as any);
}

/**
 * 根据ID获取官方模板
 * @param templateId 模板ID
 * @returns 官方模板对象，如果不存在则返回null
 */
export function getOfficialTemplateById(templateId: string): ParseTemplate | null {
  return OFFICIAL_TEMPLATES.find(t => t.id === templateId) || null;
}

/**
 * 获取默认模板（问答题）
 * @returns 默认的问答题模板
 */
export function getDefaultTemplate(): ParseTemplate {
  return OFFICIAL_TEMPLATES.find(t => t.id === 'official-qa')!;
}

