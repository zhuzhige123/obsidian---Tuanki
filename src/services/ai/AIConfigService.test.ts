import {
	clampAIGlobalParam,
	isKnownAIProvider,
	mergeAIConfigWithDefaults,
	normalizeProviderBaseUrl,
	readAIGlobalGenerationDefaults,
	resolveAIChatRequestParams,
	resolveDefaultAIProvider,
	resolveSettingsSelectedProvider,
	setActiveAIProvider,
	AI_SPLIT_CHAT_MIN_MAX_TOKENS,
} from "./AIConfigService";

describe("AIConfigService", () => {
	it("merges nested defaults without dropping apiKeys", () => {
		const merged = mergeAIConfigWithDefaults({
			apiKeys: {
				openai: { apiKey: "sk-test", model: "gpt-4o", verified: true },
			},
		});

		expect(merged.apiKeys?.openai?.apiKey).toBe("sk-test");
		expect(merged.apiKeys?.zhipu?.model).toBeTruthy();
		expect(merged.globalParams?.requestTimeout).toBe(30);
	});

	it("resolves default provider with defaultProvider taking precedence", () => {
		expect(
			resolveDefaultAIProvider({
				defaultProvider: "openai",
				lastUsedProvider: "deepseek",
			})
		).toBe("openai");
	});

	it("falls back to lastUsedProvider then zhipu", () => {
		expect(resolveDefaultAIProvider({ lastUsedProvider: "anthropic" })).toBe("anthropic");
		expect(resolveDefaultAIProvider({})).toBe("zhipu");
	});

	it("syncs default and last-used provider together", () => {
		const config = mergeAIConfigWithDefaults({});
		setActiveAIProvider(config, "deepseek");
		expect(config.defaultProvider).toBe("deepseek");
		expect(config.lastUsedProvider).toBe("deepseek");
	});

	it("uses lastUsedProvider for settings UI selection, then default provider", () => {
		expect(resolveSettingsSelectedProvider({ lastUsedProvider: "gemini" })).toBe("gemini");
		expect(resolveSettingsSelectedProvider({ defaultProvider: "openai", lastUsedProvider: "deepseek" })).toBe(
			"deepseek"
		);
		expect(resolveSettingsSelectedProvider({ defaultProvider: "openai" })).toBe("openai");
		expect(resolveSettingsSelectedProvider({})).toBe("zhipu");
	});

	it("validates known providers", () => {
		expect(isKnownAIProvider("openai")).toBe(true);
		expect(isKnownAIProvider("unknown-vendor")).toBe(false);
	});

	it("normalizes provider base URLs and treats defaults as unset", () => {
		expect(normalizeProviderBaseUrl("openai", "https://api.openai.com/v1")).toBeUndefined();
		expect(normalizeProviderBaseUrl("openai", "https://api.openai.com/v1/")).toBeUndefined();
		expect(normalizeProviderBaseUrl("openai", "https://proxy.example.com/v1")).toBe(
			"https://proxy.example.com/v1"
		);
	});

	it("clamps global generation defaults and params", () => {
		const config = mergeAIConfigWithDefaults({
			globalParams: { temperature: 1.2, maxTokens: 3000 },
		});
		expect(readAIGlobalGenerationDefaults(config)).toEqual({
			temperature: 1.2,
			maxTokens: 3000,
		});
		expect(clampAIGlobalParam("temperature", 9)).toBe(2);
		expect(clampAIGlobalParam("maxTokens", 100)).toBe(256);
		expect(clampAIGlobalParam("concurrentLimit", 99)).toBe(10);
	});

	it("resolves chat params with action overrides and split token floor", () => {
		const config = mergeAIConfigWithDefaults({
			globalParams: { temperature: 0.7, maxTokens: 2000 },
		});

		expect(resolveAIChatRequestParams(config)).toEqual({
			temperature: 0.7,
			maxTokens: 2000,
		});

		expect(
			resolveAIChatRequestParams(config, { temperature: 0.2, maxTokens: 1500 })
		).toEqual({
			temperature: 0.2,
			maxTokens: 1500,
		});

		expect(
			resolveAIChatRequestParams(config, undefined, {
				minMaxTokens: AI_SPLIT_CHAT_MIN_MAX_TOKENS,
			})
		).toEqual({
			temperature: 0.7,
			maxTokens: AI_SPLIT_CHAT_MIN_MAX_TOKENS,
		});
	});
});
