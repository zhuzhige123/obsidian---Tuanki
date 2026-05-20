export const AI_SECRET_STORAGE_PROVIDERS = [
	"openai",
	"gemini",
	"anthropic",
	"deepseek",
	"zhipu",
	"siliconflow",
	"xai",
] as const;

export type AISecretStorageProvider = (typeof AI_SECRET_STORAGE_PROVIDERS)[number];

export interface AISecretStorageAdapter {
	setSecret(id: string, secret: string): void;
	getSecret(id: string): string | null;
	listSecrets?(): string[];
}

export interface AISecretConfigShape {
	apiKey?: string;
	model?: string;
	verified?: boolean;
	lastVerified?: string;
	baseUrl?: string;
	secretId?: string;
}

export function isAISecretStorageProvider(value: string | undefined): value is AISecretStorageProvider {
	return !!value && AI_SECRET_STORAGE_PROVIDERS.includes(value as AISecretStorageProvider);
}

export function buildAIProviderSecretId(provider: AISecretStorageProvider): string {
	return `weave-ai-${provider}`;
}

export function normalizeAIProviderSecretId(
	provider: AISecretStorageProvider,
	candidate?: string
): string {
	const trimmed = candidate?.trim().toLowerCase() ?? "";
	if (!trimmed) {
		return buildAIProviderSecretId(provider);
	}

	if (/^[a-z0-9-]+$/.test(trimmed)) {
		return trimmed;
	}

	return buildAIProviderSecretId(provider);
}

export function getAISecretStorage(app: unknown): AISecretStorageAdapter | null {
	const secretStorage = (app as { secretStorage?: unknown } | undefined)?.secretStorage as
		| Partial<AISecretStorageAdapter>
		| undefined;

	if (
		secretStorage
		&& typeof secretStorage.setSecret === "function"
		&& typeof secretStorage.getSecret === "function"
	) {
		return secretStorage as AISecretStorageAdapter;
	}

	return null;
}
