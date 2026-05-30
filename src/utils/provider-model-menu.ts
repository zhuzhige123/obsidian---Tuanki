import { Menu, Platform } from "obsidian";
import { getMenuSubmenu } from "./obsidian-menu";
import type { AIProvider } from "../types/ai-types";
import {
	AI_MODEL_OPTIONS,
	AI_PROVIDER_LABELS,
	getDefaultAIModel,
} from "../components/settings/constants/settings-constants";

export type ProviderModelSelection = {
	provider?: AIProvider;
	model?: string;
};

export type ProviderModelMenuSelect =
	| { provider: AIProvider; model: string }
	| { provider: undefined; model: undefined };

export interface PopulateProviderModelMenuOptions {
	apiKeys: Record<string, { model?: string } | undefined>;
	selection: ProviderModelSelection;
	preferredProvider: AIProvider;
	providers?: AIProvider[];
	onSelect: (next: ProviderModelMenuSelect) => void;
	includeDefaultOption?: boolean;
	defaultOptionTitle?: string;
}

const DEFAULT_PROVIDERS: AIProvider[] = [
	"openai",
	"gemini",
	"anthropic",
	"deepseek",
	"zhipu",
	"siliconflow",
	"xai",
];

/** 与 Obsidian 移动/平板 class 一致，避免仅 Platform.isMobile 误判导致子菜单菜单。 */
export function isCompactMobileDevice(): boolean {
	return (
		Platform.isMobile
		|| document.body.classList.contains("is-mobile")
		|| document.body.classList.contains("is-phone")
	);
}

export function resolveDefaultModelForProvider(
	apiKeys: Record<string, { model?: string } | undefined>,
	provider: AIProvider
): string {
	return apiKeys[provider]?.model?.trim() || getDefaultAIModel(provider);
}

export function formatModelLabelOnly(
	selection: ProviderModelSelection,
	preferredProvider: AIProvider,
	apiKeys: Record<string, { model?: string } | undefined>
): string {
	const provider = selection.provider || preferredProvider;
	const modelId = selection.model || resolveDefaultModelForProvider(apiKeys, provider);
	const options = AI_MODEL_OPTIONS[provider] || [];
	const matched = options.find((item) => item.id === modelId);
	return matched?.label || modelId || resolveDefaultModelForProvider(apiKeys, provider);
}

export function formatProviderModelLabel(
	selection: ProviderModelSelection,
	preferredProvider: AIProvider,
	apiKeys: Record<string, { model?: string } | undefined>
): string {
	const provider = selection.provider || preferredProvider;
	const modelLabel = formatModelLabelOnly(selection, preferredProvider, apiKeys);
	return `${AI_PROVIDER_LABELS[provider]} · ${modelLabel}`;
}

function resolveEffectiveSelection(
	selection: ProviderModelSelection,
	preferredProvider: AIProvider,
	apiKeys: Record<string, { model?: string } | undefined>
): { provider: AIProvider; model: string } {
	const provider = selection.provider || preferredProvider;
	const model = selection.model || resolveDefaultModelForProvider(apiKeys, provider);
	return { provider, model };
}

function isModelSelected(
	selection: ProviderModelSelection,
	preferredProvider: AIProvider,
	apiKeys: Record<string, { model?: string } | undefined>,
	provider: AIProvider,
	model: string
): boolean {
	const effective = resolveEffectiveSelection(selection, preferredProvider, apiKeys);
	return effective.provider === provider && effective.model === model;
}

function populateFlatProviderModelMenu(
	menu: Menu,
	options: PopulateProviderModelMenuOptions
): void {
	const {
		apiKeys,
		selection,
		preferredProvider,
		providers = DEFAULT_PROVIDERS,
		onSelect,
		includeDefaultOption,
		defaultOptionTitle,
	} = options;

	if (includeDefaultOption) {
		menu.addItem((item) => {
			item
				.setTitle(defaultOptionTitle || "使用默认配置")
				.setIcon(!selection.provider ? "check" : "")
				.onClick(() => onSelect({ provider: undefined, model: undefined }));
		});
		menu.addSeparator();
	}

	for (let index = 0; index < providers.length; index++) {
		const provider = providers[index];
		const models = AI_MODEL_OPTIONS[provider] || [];
		const configuredModel = apiKeys[provider]?.model?.trim();
		const staticModelIds = models.map((model) => model.id);

		menu.addItem((item) => {
			item.setTitle(AI_PROVIDER_LABELS[provider]).setDisabled(true);
		});

		if (configuredModel && !staticModelIds.includes(configuredModel)) {
			menu.addItem((item) => {
				item
					.setTitle(configuredModel)
					.setIcon(
						isModelSelected(selection, preferredProvider, apiKeys, provider, configuredModel)
							? "check"
							: ""
					)
					.onClick(() => onSelect({ provider, model: configuredModel }));
			});
		}

		for (const model of models) {
			menu.addItem((item) => {
				item
					.setTitle(model.label)
					.setIcon(
						isModelSelected(selection, preferredProvider, apiKeys, provider, model.id) ? "check" : ""
					)
					.onClick(() => onSelect({ provider, model: model.id }));
			});
		}

		if (index < providers.length - 1) {
			menu.addSeparator();
		}
	}
}

function populateNestedProviderModelMenu(
	menu: Menu,
	options: PopulateProviderModelMenuOptions
): void {
	const {
		apiKeys,
		selection,
		preferredProvider,
		providers = DEFAULT_PROVIDERS,
		onSelect,
		includeDefaultOption,
		defaultOptionTitle,
	} = options;

	if (includeDefaultOption) {
		menu.addItem((item) => {
			item
				.setTitle(defaultOptionTitle || "使用默认配置")
				.setIcon(!selection.provider ? "check" : "")
				.onClick(() => onSelect({ provider: undefined, model: undefined }));
		});
		menu.addSeparator();
	}

	for (const provider of providers) {
		const models = AI_MODEL_OPTIONS[provider] || [];
		menu.addItem((item) => {
			item
				.setTitle(AI_PROVIDER_LABELS[provider])
				.setIcon((selection.provider || preferredProvider) === provider ? "check" : "");

			const submenu = getMenuSubmenu(item);
			const configuredModel = apiKeys[provider]?.model?.trim();
			const staticModelIds = models.map((model) => model.id);

			if (configuredModel && !staticModelIds.includes(configuredModel)) {
				submenu.addItem((modelItem) => {
					modelItem
						.setTitle(configuredModel)
						.setIcon(
							isModelSelected(selection, preferredProvider, apiKeys, provider, configuredModel)
								? "check"
								: ""
						)
						.onClick(() => onSelect({ provider, model: configuredModel }));
				});
				submenu.addSeparator();
			}

			for (const model of models) {
				submenu.addItem((modelItem) => {
					modelItem
						.setTitle(model.label)
						.setIcon(
							isModelSelected(selection, preferredProvider, apiKeys, provider, model.id)
								? "check"
								: ""
						)
						.onClick(() => onSelect({ provider, model: model.id }));
				});
			}
		});
	}
}

export function populateProviderModelMenu(
	menu: Menu,
	options: PopulateProviderModelMenuOptions
): void {
	menu.setUseNativeMenu?.(false);

	if (isCompactMobileDevice()) {
		populateFlatProviderModelMenu(menu, options);
		return;
	}

	populateNestedProviderModelMenu(menu, options);
}

export function showProviderModelMenuAt(
	event: MouseEvent,
	options: PopulateProviderModelMenuOptions
): void {
	const menu = new Menu();
	populateProviderModelMenu(menu, options);
	menu.showAtMouseEvent(event);
}
