import { isRecord, readNumber, readString } from "../../utils/typed-json";

export interface AnthropicUsageTokens {
	input_tokens: number;
	output_tokens: number;
}

export interface OpenAIUsageTokens {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export function parseAnthropicMessagePayload(json: unknown): {
	contentText: string;
	usage: AnthropicUsageTokens;
} {
	const record = isRecord(json) ? json : {};
	const contentBlocks: unknown = record.content;
	if (!Array.isArray(contentBlocks) || contentBlocks.length === 0) {
		throw new Error("Claude未返回有效内容");
	}

	let contentText: string | undefined;
	for (const block of contentBlocks) {
		if (isRecord(block)) {
			contentText = readString(block, "text");
			if (contentText) {
				break;
			}
		}
	}
	if (!contentText) {
		throw new Error("Claude未返回有效内容");
	}

	const usageRecord = isRecord(record.usage) ? record.usage : {};
	return {
		contentText,
		usage: {
			input_tokens: readNumber(usageRecord, "input_tokens") ?? 0,
			output_tokens: readNumber(usageRecord, "output_tokens") ?? 0,
		},
	};
}

export function extractOpenAIChoicePayload(
	data: unknown,
	extractMessageContent: (content: unknown) => string
): { content: string; usage: OpenAIUsageTokens } {
	const record = isRecord(data) ? data : {};
	const choices: unknown = record.choices;
	let choice: Record<string, unknown> | null = null;
	if (Array.isArray(choices)) {
		for (const item of choices) {
			if (isRecord(item)) {
				choice = item;
				break;
			}
		}
	}
	const finishReason = choice ? readString(choice, "finish_reason") : undefined;

	if (finishReason === "length") {
		throw new Error("AI 返回内容被截断，请减少生成数量、缩短原文，或提高最大 tokens");
	}

	const message = choice && isRecord(choice.message) ? choice.message : null;
	const content = extractMessageContent(message?.content);

	if (!content) {
		throw new Error("AI 返回为空，可能是模型在 JSON 模式下没有给出最终内容，请稍后重试或切换模型");
	}

	const usageRecord = isRecord(record.usage) ? record.usage : {};
	return {
		content,
		usage: {
			prompt_tokens: readNumber(usageRecord, "prompt_tokens") ?? 0,
			completion_tokens: readNumber(usageRecord, "completion_tokens") ?? 0,
			total_tokens: readNumber(usageRecord, "total_tokens") ?? 0,
		},
	};
}
