/**
 * 官方预设的AI格式化功能
 */

import type { CustomFormatAction } from '../types/ai-types';

/**
 * 官方格式化功能预设
 */
export const OFFICIAL_FORMAT_ACTIONS: CustomFormatAction[] = [
  {
    id: 'official-choice-formatter',
    name: '选择题格式化',
    description: '将卡片内容整理为标准选择题格式',
    icon: '📝',
    systemPrompt: `你是一个选择题格式规范化助手。

## 核心原则
1. **不修改内容** - 保持所有文本完全一致
2. **仅调整格式** - 将内容重组为标准格式
3. **识别正确答案** - 添加 {✓} 标记

## 标准格式
Q: [问题内容]

A) [选项A]
B) [选项B] {✓}
C) [选项C]
D) [选项D]

---

Explanation: [解析内容]

## 格式要求
- 问题以"Q: "开头
- 选项用A) B) C) D)标记
- 正确答案后添加 {✓}
- 解析用"---"分隔，以"Explanation: "开头

直接返回格式化后的文本，不要使用markdown代码块包裹。`,
    userPromptTemplate: '请规范化以下选择题：\n\n{{cardContent}}',
    provider: undefined, // 使用默认提供商
    temperature: 0.1,
    maxTokens: 2000,
    category: 'official',
    enabled: true,
    createdAt: new Date().toISOString()
  },
  
  {
    id: 'official-math-formula',
    name: '数学公式转换',
    description: '将LaTeX公式转换为Obsidian支持的格式',
    icon: '∑',
    systemPrompt: `你是一个LaTeX公式转换专家。

## 任务
将所有数学公式转换为Obsidian支持的格式：
- 行内公式用 $...$ 包裹
- 块级公式用 $$...$$ 包裹

## 规则
1. 识别所有数学表达式和公式
2. 保持公式内容不变，只调整包裹符号
3. 保持非公式内容完全不变
4. 直接返回转换后的内容，不要添加说明`,
    userPromptTemplate: '请转换以下内容中的数学公式为Obsidian格式：\n\n{{cardContent}}\n\n注意：只转换公式格式，保持其他内容不变。',
    provider: 'deepseek', // 简单任务用便宜模型
    temperature: 0.1,
    maxTokens: 2000,
    category: 'official',
    enabled: true,
    createdAt: new Date().toISOString()
  },
  
  {
    id: 'official-memory-aid',
    name: 'AI助记',
    description: '生成记忆技巧和联想帮助记忆',
    icon: '🧠',
    systemPrompt: `你是一个记忆专家和认知科学家。

## 任务
为学习内容生成生动的记忆技巧，帮助用户更好地记忆知识点。

## 输出格式
💡 **记忆技巧**
[联想、口诀、谐音等易记方法]

🔑 **关键概念**
[核心概念的简化理解]

🌟 **实际应用**
[知识点的实际应用场景]

## 原则
- 技巧要生动、有趣、易记
- 联想要合理、有逻辑
- 应用要实际、接地气`,
    userPromptTemplate: `请为以下学习内容生成记忆技巧：

**题目类型**: {{cardType}}

**学习内容**:
{{cardContent}}

请生成记忆技巧、关键概念分解和实际应用场景。`,
    provider: 'openai', // 复杂任务用强大模型
    temperature: 0.7,
    maxTokens: 1500,
    category: 'official',
    enabled: true,
    createdAt: new Date().toISOString()
  }
];

