/**
 * 官方预设的系统提示词
 * 这些提示词在AI制卡配置模态窗中显示为不可编辑的官方选项
 */

import { WEAVE_AI_SYSTEM_PROMPT_TEMPLATE } from "./weave-ai-system-prompt-template";
import type { CustomSystemPrompt } from "../types/ai-types";

/**
 * 官方系统提示词列表
 */
export const OFFICIAL_SYSTEM_PROMPTS: CustomSystemPrompt[] = [
	{
		id: "official-synapse-builder",
		name: "认知制卡引擎",
		description:
			"基于 Wozniak 记忆二十条规则与 Weave 卡片语法的官方制卡引擎，自动匹配 QA / Cloze / Choice",
		content: WEAVE_AI_SYSTEM_PROMPT_TEMPLATE,
		createdAt: "2025-01-01T00:00:00.000Z",
	},
];

/**
 * 根据ID查找官方系统提示词
 */
export function getOfficialSystemPromptById(id: string): CustomSystemPrompt | null {
	return OFFICIAL_SYSTEM_PROMPTS.find((p) => p.id === id) || null;
}
