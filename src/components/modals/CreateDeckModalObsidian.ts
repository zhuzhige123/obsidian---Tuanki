import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { WeaveDataStorage } from "../../data/storage";
import type { Deck } from "../../data/types";
import type WeavePlugin from "../../main";
import { t } from "../../utils/i18n";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import CreateDeckModal from "./CreateDeckModal.svelte";

export interface CreateDeckModalObsidianOptions {
	plugin: WeavePlugin;
	dataStorage: WeaveDataStorage;
	mode?: "create" | "edit";
	initialDeck?: Deck | null;
	onCreated?: (deck: Deck) => void;
	onDeckCreated?: (deck: Deck) => void;
	onUpdated?: (deck: Deck) => void;
	onDeckUpdated?: (deck: Deck) => void;
	onClose?: () => void;
}

export class CreateDeckModalObsidian extends Modal {
	private component: unknown = null;
	private readonly options: CreateDeckModalObsidianOptions;

	constructor(app: App, options: CreateDeckModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const mode = this.options.mode ?? "create";
		this.setTitle(
			mode === "edit" ? t("modals.createDeck.titleEdit") : t("modals.createDeck.titleCreate")
		);
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-create-deck-modal",
			contentClass: "weave-create-deck-modal-content",
		});

		this.component = mount(CreateDeckModal, {
			target: this.contentEl,
			props: {
				open: true,
				useObsidianModal: true,
				plugin: this.options.plugin,
				dataStorage: this.options.dataStorage,
				mode,
				initialDeck: this.options.initialDeck ?? null,
				onClose: () => this.close(),
				onCreated: (deck: Deck) => this.options.onCreated?.(deck),
				onDeckCreated: (deck: Deck) =>
					(this.options.onDeckCreated ?? this.options.onCreated)?.(deck),
				onUpdated: (deck: Deck) => this.options.onUpdated?.(deck),
				onDeckUpdated: (deck: Deck) =>
					(this.options.onDeckUpdated ?? this.options.onUpdated)?.(deck),
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
