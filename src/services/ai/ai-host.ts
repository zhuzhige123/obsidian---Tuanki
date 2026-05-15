import type { App } from "obsidian";
import type { ApiResponse, Card, Deck } from "../../data/types";
import type { AIConfig } from "../../types/plugin-settings";

export interface AIConfigHost {
	settings: {
		aiConfig?: AIConfig;
	};
}

export interface AICardStorageHost {
	getDecks(): Promise<Deck[]>;
	saveCard(card: Card): Promise<ApiResponse<Card>>;
}

export interface AISplitHost extends AIConfigHost {
	dataStorage: AICardStorageHost;
}

export interface AISelectedTextPanelHost extends AISplitHost {
	app: App;
}

export function resolveAIConfig(host: AIConfigHost): AIConfig | undefined {
	return host.settings.aiConfig as AIConfig | undefined;
}

export function resolveDefaultAISplitInstruction(host: AIConfigHost): string | undefined {
	const value = resolveAIConfig(host)?.cardSplitting?.defaultInstruction;
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed || undefined;
}
