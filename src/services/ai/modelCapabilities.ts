import type { AIProvider } from "../../types/ai-types";

export type StructuredOutputMode = "native_json" | "prompt_only";

export interface ModelCapabilities {
	structuredOutputMode: StructuredOutputMode;
	structuredFallbackModel?: string;
	omitTemperature: boolean;
	reasoningModel: boolean;
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
	structuredOutputMode: "native_json",
	omitTemperature: false,
	reasoningModel: false,
};

function normalizeModel(model?: string): string {
	return (model || "").trim().toLowerCase();
}

export function getModelCapabilities(provider: AIProvider, model?: string): ModelCapabilities {
	const normalizedModel = normalizeModel(model);

	if (provider === "deepseek" && normalizedModel === "deepseek-reasoner") {
		return {
			structuredOutputMode: "prompt_only",
			structuredFallbackModel: "deepseek-v4-flash",
			omitTemperature: true,
			reasoningModel: true,
		};
	}

	if (
		provider === "siliconflow" &&
		(normalizedModel.includes("deepseek-r1") || normalizedModel.endsWith("/r1"))
	) {
		return {
			structuredOutputMode: "prompt_only",
			structuredFallbackModel: "deepseek-ai/DeepSeek-V3.2",
			omitTemperature: true,
			reasoningModel: true,
		};
	}

	return DEFAULT_CAPABILITIES;
}

export function shouldUseNativeJsonOutput(provider: AIProvider, model?: string): boolean {
	return getModelCapabilities(provider, model).structuredOutputMode === "native_json";
}
