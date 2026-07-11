import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type WeavePlugin from "../../main";
import type { GenerationConfig } from "../../types/ai-types";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import AIConfigModal from "./AIConfigModal.svelte";

type MountedComponent = Parameters<typeof unmount>[0];

export interface AIConfigModalObsidianOptions {
	plugin: WeavePlugin;
	config: GenerationConfig;
	onSave: (config: GenerationConfig) => void | Promise<void>;
	onClose?: () => void;
}

export class AIConfigModalObsidian extends Modal {
	private component: MountedComponent | null = null;
	private readonly options: AIConfigModalObsidianOptions;

	constructor(app: App, options: AIConfigModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle("AI 制卡配置");
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-ai-config-modal weave-native-system-prompt-modal",
			contentClass: "weave-ai-config-modal-content",
		});

		this.component = mount(AIConfigModal, {
			target: this.contentEl,
			props: {
				plugin: this.options.plugin,
				config: this.options.config,
				isOpen: true,
				useObsidianModal: true,
				onClose: () => this.close(),
				onSave: (config: GenerationConfig) => {
					void this.options.onSave(config);
					this.close();
				},
			},
		});
	}

	onClose() {
		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}

		this.contentEl.empty();
		this.options.onClose?.();
	}
}
