import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { Deck } from "../../data/types";
import type WeavePlugin from "../../main";
import { t } from "../../utils/i18n";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import CreateQuestionBankModal from "./CreateQuestionBankModal.svelte";

export interface CreateQuestionBankModalObsidianOptions {
	plugin: WeavePlugin;
	onCreated?: (bank: Deck) => void;
	onBankCreated?: (bank: Deck) => void | Promise<void>;
	onClose?: () => void;
}

export class CreateQuestionBankModalObsidian extends Modal {
	private component: unknown = null;
	private readonly options: CreateQuestionBankModalObsidianOptions;

	constructor(app: App, options: CreateQuestionBankModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle(t("study.questionBankUI.createBankModal.titleCreate"));
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-create-question-bank-modal",
			contentClass: "weave-create-question-bank-modal-content",
		});

		this.component = mount(CreateQuestionBankModal, {
			target: this.contentEl,
			props: {
				open: true,
				useObsidianModal: true,
				plugin: this.options.plugin,
				onClose: () => this.close(),
				onCreated: (bank: Deck) => this.options.onCreated?.(bank),
				onBankCreated: (bank: Deck) =>
					(this.options.onBankCreated ?? this.options.onCreated)?.(bank),
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
