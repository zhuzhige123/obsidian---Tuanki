/**
 * 默认的AI拆分动作配置
 * 提供开箱即用的卡片拆分功能
 */

import type { AIAction } from "../types/ai-types";

/**
 * 官方AI拆分动作配置
 */
export const DEFAULT_SPLIT_ACTIONS: AIAction[] = [
	{
		id: "official-knowledge-split",
		name: "知识点拆分",
		description: "将复杂卡片按知识点拆分成多张独立的子卡片",
		icon: "git-branch",
		type: "split",

		systemPrompt: `你是一个专业的知识卡片拆分助手，专注于将复杂学习内容拆分成独立的知识点卡片。

## 拆分原则

1. 最小信息原则 - 每张子卡片只包含一个核心知识点
2. 独立完整性 - 每张卡片可以独立学习和记忆
3. 内容准确性 - 严格保持原始内容的准确性
4. 逻辑清晰性 - 确保子卡片之间的逻辑关系清晰
5. 上下文充分 - 提供必要的上下文信息

## 输出格式要求

返回标准JSON格式：

{
  "cards": [
    {
      "content": "问题部分\\n\\n---div---\\n\\n答案部分",
      "tags": ["标签1", "标签2"],
      "confidence": 0.9
    }
  ]
}

### 重要规则

- content字段必须使用"---div---"作为问题和答案的分隔符
- 问题部分：简洁清晰的问题描述
- 答案部分：完整准确的答案内容
- 每张卡片长度控制在50-300字符
- confidence表示拆分的置信度（0-1之间）

### 示例格式

问答题格式：
"什么是机器学习？\\n\\n---div---\\n\\n机器学习是人工智能的一个分支，它使计算机能够在没有明确编程的情况下学习和改进。"

概念解释格式：
"机器学习的定义\\n\\n---div---\\n\\n机器学习是人工智能的一个分支，通过算法和统计模型使计算机系统能够从数据中学习并改进性能。"`,

		userPromptTemplate: `请将以下卡片内容拆分成{{数量}}张独立的子卡片。

原始卡片内容：
{{cardContent}}

拆分要求：
- 目标数量：{{数量}}张子卡片
- 拆分策略：按知识点拆分
- 输出格式：标准问答题（使用---div---分隔符）
- 每张卡片：一个独立知识点，50-300字符

请识别内容中的独立知识点，为每个知识点创建一张完整的子卡片。`,

		splitConfig: {
			targetCount: 3,
			splitStrategy: "knowledge-point",
			outputFormat: "qa",
		},

		// AI服务配置（用户可修改）
		provider: undefined,
		model: undefined,

		category: "official",
		createdAt: new Date().toISOString(),
		enabled: true,
	},

	{
		id: "official-difficulty-split",
		name: "难度层次拆分",
		description: "将复杂概念按难度层次拆分，从基础到高级递进学习",
		icon: "trending-up",
		type: "split",

		systemPrompt: `你是一个专业的学习难度分析师，擅长将复杂内容按难度层次拆分。

## 拆分策略

1. 基础层 - 核心概念和基本定义
2. 中级层 - 概念应用和相关知识
3. 高级层 - 深入分析和复杂应用
4. 递进性 - 确保难度递进，前面为后面打基础

## 输出格式要求

返回标准JSON格式：

{
  "cards": [
    {
      "content": "问题部分\\n\\n---div---\\n\\n答案部分",
      "difficulty": "easy",
      "tags": ["标签1", "标签2"],
      "confidence": 0.9
    }
  ]
}

### 重要规则

- content字段必须使用"---div---"作为问题和答案的分隔符
- difficulty只能是"easy"、"medium"或"hard"
- 按难度从低到高排列卡片
- 确保每个难度级别至少有1张卡片
- 每张卡片长度控制在50-300字符

### 示例格式

基础卡片：
"什么是神经网络？\\n\\n---div---\\n\\n神经网络是一种模拟人脑神经元连接的计算模型。"

高级卡片：
"神经网络的反向传播算法如何工作？\\n\\n---div---\\n\\n反向传播通过计算误差梯度，从输出层向输入层传播，调整权重以最小化误差。"`,

		userPromptTemplate: `请将以下卡片内容按难度层次拆分成{{数量}}张子卡片。

原始卡片内容：
{{cardContent}}

拆分要求：
- 目标数量：{{数量}}张子卡片
- 拆分策略：按难度层次（easy → medium → hard）
- 输出格式：标准问答题（使用---div---分隔符）
- 确保难度递进，循序渐进

请分析内容的复杂程度，创建从基础概念到深入应用的学习路径。`,

		splitConfig: {
			targetCount: 4,
			splitStrategy: "difficulty",
			outputFormat: "qa",
		},

		// AI服务配置（用户可修改）
		provider: undefined,
		model: undefined,

		category: "official",
		createdAt: new Date().toISOString(),
		enabled: true,
	},

	{
		id: "official-cloze-split",
		name: "挖空题拆分",
		description: "将内容拆分成多张挖空题，适合记忆关键信息",
		icon: "eye-off",
		type: "split",

		systemPrompt: `你是一个专业的挖空题制作专家，擅长将学习内容转换为有效的挖空题。

## 挖空题制作原则

1. 关键信息挖空 - 选择重要的词汇、概念或数字
2. 上下文充分 - 保留足够的上下文信息
3. 适量挖空 - 每张卡片挖空1-2个关键点
4. 语义完整 - 确保挖空后的句子仍然有意义
5. 标记语法 - 使用当前插件设置的挖空语法标记挖空部分

## 输出格式要求

返回标准JSON格式：

{
  "cards": [
    {
      "content": "完整的挖空题文本，使用当前插件设置的挖空语法标记挖空部分",
      "tags": ["标签1", "标签2"],
      "confidence": 0.9
    }
  ]
}

### 重要规则

- content字段为完整的挖空题文本
- 使用当前插件设置的挖空语法标记需要挖空的部分
- 不要使用{{c1::}}格式（Anki格式）
- 不需要---div---分隔符（挖空题不分问题和答案）
- 每张卡片长度控制在50-300字符
- 挖空数量：每张卡癈1-2个关键点

### 示例格式

单个挖空：
"使用当前插件设置的挖空语法包裹‘机器学习’，并保留完整上下文。"

多个挖空：
"使用当前插件设置的挖空语法包裹‘神经网络’和‘计算模型’，广泛应用于机器学习领域。"`,

		userPromptTemplate: `请将以下卡片内容拆分成{{数量}}张挖空题子卡片。

原始卡片内容：
{{cardContent}}

拆分要求：
- 目标数量：{{数量}}张子卡片
- 题型：挖空题（使用当前插件设置的挖空语法）
- 每张卡片：挖空1-2个关键点
- 保留充分的上下文信息

请识别内容中的关键信息点，为每个关键点创建一张有效的挖空题卡片。`,

		splitConfig: {
			targetCount: 3,
			splitStrategy: "content-length",
			outputFormat: "cloze",
		},

		// AI服务配置（用户可修改）
		provider: undefined,
		model: undefined,

		category: "official",
		createdAt: new Date().toISOString(),
		enabled: true,
	},
];
