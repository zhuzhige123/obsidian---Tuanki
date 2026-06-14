/**
 * 提示词构建服务
 * 统一管理提示词的构建、变量替换和预览生成
 */

import { getOfficialSystemPromptById } from "../../constants/official-system-prompts";
import { getOfficialTemplateById } from "../../constants/official-templates";
import { WEAVE_AI_SYSTEM_PROMPT_TEMPLATE } from "../../constants/weave-ai-system-prompt-template";
import type { GenerationConfig, SystemPromptConfig } from "../../types/ai-types";
import { getConfiguredClozeSyntaxExample } from "../../utils/cloze-syntax";

export { WEAVE_AI_SYSTEM_PROMPT_TEMPLATE as BUILTIN_SYSTEM_PROMPT_TEMPLATE } from "../../constants/weave-ai-system-prompt-template";

function getBuiltinSystemPrompt(config: GenerationConfig): string {
	return replaceVariables(WEAVE_AI_SYSTEM_PROMPT_TEMPLATE, config);
}

function buildSystemPrompt(
	config: GenerationConfig,
	systemPromptConfig?: SystemPromptConfig
): string {
	if (!systemPromptConfig) {
		return getBuiltinSystemPrompt(config);
	}

	if (systemPromptConfig.selectedSystemPromptId) {
		const officialPrompt = getOfficialSystemPromptById(systemPromptConfig.selectedSystemPromptId);
		if (officialPrompt) {
			return replaceVariables(officialPrompt.content, config);
		}

		if (systemPromptConfig.customSystemPrompts) {
			const selectedPrompt = systemPromptConfig.customSystemPrompts.find(
				(prompt) => prompt.id === systemPromptConfig.selectedSystemPromptId
			);
			if (selectedPrompt) {
				return replaceVariables(selectedPrompt.content, config);
			}
		}
	}

	if (!systemPromptConfig.useBuiltin && systemPromptConfig.customPrompt) {
		return replaceVariables(systemPromptConfig.customPrompt, config);
	}

	return getBuiltinSystemPrompt(config);
}

function buildUserPrompt(content: string, promptTemplate: string): string {
	const template = promptTemplate || "基于以下材料生成学习卡片";
	return `${template}\n\n${content}`;
}

function buildFullPrompt(
	content: string,
	config: GenerationConfig,
	promptTemplate: string,
	systemPromptConfig?: SystemPromptConfig
): {
	systemPrompt: string;
	userPrompt: string;
	fullText: string;
} {
	const systemPrompt = buildSystemPrompt(config, systemPromptConfig);
	const userPrompt = buildUserPrompt(content, promptTemplate);

	return {
		systemPrompt,
		userPrompt,
		fullText: `=== System Prompt ===\n${systemPrompt}\n\n=== User Prompt ===\n${userPrompt}\n\n=== Content ===\n${content}`,
	};
}

function replaceVariables(template: string, config: GenerationConfig): string {
	let result = template;

	const variables: Record<string, string | number> = {
		cardCount: config.cardCount,
		count: config.cardCount,
		clozeDifficultyExample: getConfiguredClozeSyntaxExample("难度"),
		clozeReliabilityExample: getConfiguredClozeSyntaxExample("可靠性"),
		clozeStableExample: getConfiguredClozeSyntaxExample("稳定性"),
		clozeSyntaxExample: getConfiguredClozeSyntaxExample("文本"),
		clozeTcpExample: getConfiguredClozeSyntaxExample("TCP"),
		clozeWrappedContentExample: getConfiguredClozeSyntaxExample("挖空内容"),
		clozeWrappedTextExample: getConfiguredClozeSyntaxExample("被挖空的文本"),
		difficulty: config.difficulty,
		template: config.templateId,
		qaPercent: config.typeDistribution.qa,
		clozePercent: config.typeDistribution.cloze,
		choicePercent: config.typeDistribution.choice,
	};

	for (const [key, value] of Object.entries(variables)) {
		const regex = new RegExp(`\\{${key}\\}`, "g");
		result = result.replace(regex, String(value));
	}

	return result;
}

function loadTemplates(config: GenerationConfig) {
	const templates = config.templates;
	if (!templates) {
		return {};
	}

	return {
		qa: getOfficialTemplateById(templates.qa),
		choice: getOfficialTemplateById(templates.choice),
		cloze: getOfficialTemplateById(templates.cloze),
	};
}

export const PromptBuilderService = {
	getBuiltinSystemPrompt,
	buildSystemPrompt,
	buildUserPrompt,
	buildFullPrompt,
	replaceVariables,
	loadTemplates,
};
