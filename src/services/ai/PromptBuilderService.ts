/**
 * 提示词构建服务
 * 统一管理提示词的构建、变量替换和预览生成
 */

import type { GenerationConfig, SystemPromptConfig } from '../../types/ai-types';
import { OFFICIAL_TEMPLATES } from '../../constants/official-templates';

/**
 * 内置系统提示词（从AIService.ts提取）
 * 这是完整的格式规范，用于指导AI生成标准化卡片
 */
export const BUILTIN_SYSTEM_PROMPT_TEMPLATE = `生成**恰好{cardCount}张**学习卡片（不多不少），难度：{difficulty}

类型分布：QA {qaPercent}%、Cloze {clozePercent}%、Choice {choicePercent}%
{templateFieldsInfo}

返回JSON数组，**必须包含且仅包含{cardCount}个卡片对象**。

🚨 **关键提醒**：生成选择题时，**必须**在正确答案后添加 {✓} 标记！这是强制要求，否则无法识别正确答案。

## 📝 标准Markdown格式说明

所有卡片都支持语义标记系统，可选添加以下额外信息：
- 💡 Hint: 提示信息（帮助回忆）
- Explanation: 详细解析（原理说明）
- ---meta--- 元数据区域（标签、难度、来源等）

## 卡片格式示例

### 1️⃣ 问答题（QA）
基础格式：
{
  "type": "qa",
  "front": "Q: 间隔重复学习的核心原理是什么？",
  "back": "A: 在即将遗忘时复习，利用遗忘曲线规律"
}

带提示和解析（推荐）：
{
  "type": "qa",
  "front": "Q: FSRS算法中的S代表什么含义？\\n\\n💡 Hint: 这是一个核心参数，影响记忆保持时间",
  "back": "A: Stability（稳定性），表示记忆在当前状态下可以保持的时间\\n\\n---meta---\\n\\nExplanation: FSRS中Stability是最核心的概念，它代表了记忆在遗忘曲线上的位置。Stability越高，意味着记忆越牢固。\\n\\nDifficulty: Hard\\nTags: #fsrs #算法原理"
}

### 2️⃣ 挖空题（Cloze）
基础格式：
{
  "type": "cloze",
  "front": "肾衰早期常精神委靡、疲乏、失眠。==肢体麻木==是最常见的神经症状。",
  "back": ""
}

带语境说明（推荐）：
{
  "type": "cloze",
  "front": "💡 Context: 这是关于FSRS核心公式的知识点\\n\\nFSRS算法通过计算卡片的==稳定性==(Stability)和==难度==(Difficulty)两个核心参数，来预测下次复习的==最佳时间间隔==。\\n\\n---meta---\\n\\nExplanation: 稳定性反映记忆的保持程度，难度反映内容的记忆难易程度，两者共同决定最优复习时机。\\n\\nTags: #fsrs #公式",
  "back": ""
}

### 3️⃣ 选择题（Choice）- **格式最严格**
✅ 正确示例（必须完全遵循）：
{
  "type": "choice",
  "front": "Q: 间隔重复学习的核心原理是什么？\\n\\nA) 每天固定时间复习\\nB) 在即将遗忘时复习 {✓}\\nC) 随机复习\\nD) 只复习难题",
  "back": "Explanation: 间隔重复利用遗忘曲线规律，在即将遗忘时进行复习，使记忆更牢固且学习效率更高。"
}

带提示的选择题（推荐）：
{
  "type": "choice",
  "front": "Q: FSRS算法中的\\"S\\"代表什么含义？\\n\\n💡 Hint: 这是一个核心参数，影响记忆保持时间\\n\\nA) Speed（速度）\\nB) Stability（稳定性） {✓}\\nC) Strength（强度）\\nD) Success（成功率）",
  "back": "Explanation: FSRS中Stability是最核心的概念，它代表了记忆在遗忘曲线上的位置。Stability越高，意味着记忆越牢固，下次复习间隔可以更长。\\n\\n---meta---\\n\\nDifficulty: Hard\\nTags: #fsrs #算法原理"
}

❌ 错误示例（缺少{✓}标记）：
{
  "type": "choice",
  "front": "Q: 问题内容\\n\\nA) 选项1\\nB) 选项2\\nC) 选项3\\nD) 选项4",
  "back": "解析内容"
}

## 🔴 选择题格式强制要求（必读）：
1. ✅ front字段必须以"Q: "开头
2. ✅ 选项必须用A)、B)、C)、D)标注（圆括号，不是A.或A、）
3. ✅ **正确答案后必须添加 {✓} 标记**（例如：B) 选项内容 {✓}）
4. ✅ 多选题在所有正确选项后都添加 {✓}
5. ✅ back字段是解析，建议以"Explanation:"开头
6. ❌ 不要使用choices数组和correctAnswer索引（旧格式已废弃）
7. ✅ 可选添加💡 Hint在选项前（提高学习效果）

## ⚠️ 重要约束（必须遵守）：

1. **卡片数量**：严格生成{cardCount}张卡片，不多不少
2. **挖空题语法**：必须用==文本==语法标记挖空
3. 🚨 **选择题{✓}标记（最重要）**：
   - 每个选择题的正确答案后**必须**添加 {✓} 标记
   - 格式：B) 正确选项内容 {✓}
   - 多选题：每个正确选项都要添加
   - ❌ 没有{✓}标记的选择题将无法使用
4. **换行符使用**：
   - front和back字段使用\\n\\n分隔段落
   - 使用\\n分隔单行
   - Q:和A:后面直接跟内容，用\\n\\n分隔
5. **质量提升（推荐）**：
   - 为重要卡片添加Explanation
   - 难题添加💡 Hint帮助回忆
   
🔴 再次强调：选择题必须有 {✓} 标记！这是系统识别正确答案的唯一方式！`;

export class PromptBuilderService {
  /**
   * 获取内置系统提示词（用于UI展示）
   */
  static getBuiltinSystemPrompt(config: GenerationConfig): string {
    const { cardCount, difficulty, typeDistribution } = config;
    
    // 构建模板字段说明
    let templateFieldsInfo = '';
    const templates = this.loadTemplates(config);
    
    if (typeDistribution.qa > 0 && templates.qa) {
      const fields = templates.qa.fields?.map(f => f.name).join(', ') || 'front, back';
      templateFieldsInfo += `\n问答题字段: ${fields}`;
    }
    
    if (typeDistribution.choice > 0 && templates.choice) {
      const fields = templates.choice.fields?.map(f => f.name).join(', ') || 'question, options, answer';
      templateFieldsInfo += `\n选择题字段: ${fields}`;
    }
    
    if (typeDistribution.cloze > 0 && templates.cloze) {
      const fields = templates.cloze.fields?.map(f => f.name).join(', ') || 'text, cloze';
      templateFieldsInfo += `\n挖空题字段: ${fields}`;
    }
    
    // 替换变量
    let prompt = BUILTIN_SYSTEM_PROMPT_TEMPLATE;
    prompt = prompt.replace(/{cardCount}/g, String(cardCount));
    prompt = prompt.replace(/{difficulty}/g, difficulty);
    prompt = prompt.replace(/{qaPercent}/g, String(typeDistribution.qa));
    prompt = prompt.replace(/{clozePercent}/g, String(typeDistribution.cloze));
    prompt = prompt.replace(/{choicePercent}/g, String(typeDistribution.choice));
    prompt = prompt.replace(/{templateFieldsInfo}/g, templateFieldsInfo ? '\n字段要求：' + templateFieldsInfo : '');
    
    return prompt;
  }

  /**
   * 构建系统提示词（用于实际AI调用）
   */
  static buildSystemPrompt(
    config: GenerationConfig,
    systemPromptConfig?: SystemPromptConfig
  ): string {
    // 如果配置了自定义系统提示词且选择使用
    if (systemPromptConfig && !systemPromptConfig.useBuiltin && systemPromptConfig.customPrompt) {
      return this.replaceVariables(systemPromptConfig.customPrompt, config);
    }
    
    // 默认使用内置系统提示词
    return this.getBuiltinSystemPrompt(config);
  }

  /**
   * 构建用户提示词
   */
  static buildUserPrompt(content: string, promptTemplate: string): string {
    const template = promptTemplate || '基于以下材料生成学习卡片';
    return `${template}\n\n${content}`;
  }

  /**
   * 构建完整提示词（用于预览）
   */
  static buildFullPrompt(
    content: string,
    config: GenerationConfig,
    promptTemplate: string,
    systemPromptConfig?: SystemPromptConfig
  ): {
    systemPrompt: string;
    userPrompt: string;
    fullText: string;
  } {
    const systemPrompt = this.buildSystemPrompt(config, systemPromptConfig);
    const userPrompt = this.buildUserPrompt(content, promptTemplate);
    
    const fullText = `=== System Prompt ===\n${systemPrompt}\n\n=== User Prompt ===\n${userPrompt}\n\n=== Content ===\n${content}`;
    
    return {
      systemPrompt,
      userPrompt,
      fullText
    };
  }

  /**
   * 替换提示词中的变量
   */
  static replaceVariables(template: string, config: GenerationConfig): string {
    let result = template;
    
    const variables: Record<string, string | number> = {
      cardCount: config.cardCount,
      count: config.cardCount,
      difficulty: config.difficulty,
      template: config.templateId,
      qaPercent: config.typeDistribution.qa,
      clozePercent: config.typeDistribution.cloze,
      choicePercent: config.typeDistribution.choice
    };
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    
    return result;
  }

  /**
   * 加载模板信息（私有方法）
   */
  private static loadTemplates(config: GenerationConfig) {
    const templates = config.templates;
    if (!templates) return {};

    return {
      qa: OFFICIAL_TEMPLATES.find(t => t.id === templates.qa),
      choice: OFFICIAL_TEMPLATES.find(t => t.id === templates.choice),
      cloze: OFFICIAL_TEMPLATES.find(t => t.id === templates.cloze)
    };
  }
}







