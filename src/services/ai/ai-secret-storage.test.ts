import {
	buildAIProviderSecretId,
	getAISecretStorage,
	normalizeAIProviderSecretId,
} from "./ai-secret-storage";

describe("ai-secret-storage", () => {
	it("builds stable default secret ids", () => {
		expect(buildAIProviderSecretId("openai")).toBe("weave-ai-openai");
		expect(buildAIProviderSecretId("gemini")).toBe("weave-ai-gemini");
	});

	it("normalizes invalid secret ids back to provider defaults", () => {
		expect(normalizeAIProviderSecretId("openai", "CUSTOM Secret")).toBe("weave-ai-openai");
		expect(normalizeAIProviderSecretId("openai", "custom-secret")).toBe("custom-secret");
		expect(normalizeAIProviderSecretId("openai", "")).toBe("weave-ai-openai");
	});

	it("detects secret storage support safely", () => {
		const supported = getAISecretStorage({
			secretStorage: {
				setSecret() {},
				getSecret() {
					return "value";
				},
			},
		});
		const unsupported = getAISecretStorage({});

		expect(supported).not.toBeNull();
		expect(unsupported).toBeNull();
	});
});
