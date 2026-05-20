import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { AnkiModelInfo } from "../../../types/ankiconnect-types";
import { configureWeaveObsidianModalLayout } from "../../../utils/obsidian-modal-layout";
import { i18n } from "../../../utils/i18n";
import type { DeckSyncMapping } from "../types/settings-types";
import CardTypeMappingModalContent from "./CardTypeMappingModalContent.svelte";

export interface CardTypeMappingModalObsidianOptions {
	mappingId: string;
	mapping: DeckSyncMapping;
	ankiModels: AnkiModelInfo[];
	isConnected?: boolean;
	onUpdateMapping: (id: string, updates: Partial<DeckSyncMapping>) => void;
	onClose?: () => void;
}

export class CardTypeMappingModalObsidian extends Modal {
	private component: any = null;
	private readonly options: CardTypeMappingModalObsidianOptions;

	constructor(app: App, options: CardTypeMappingModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle(i18n.t("ankiConnect.deckMapping.cardTypeModal.title"));
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-card-type-mapping-modal",
			contentClass: "weave-card-type-mapping-modal-content",
		});

		this.component = mount(CardTypeMappingModalContent, {
			target: this.contentEl,
			props: {
				mappingId: this.options.mappingId,
				mapping: this.options.mapping,
				ankiModels: this.options.ankiModels,
				isConnected: this.options.isConnected,
				onUpdateMapping: this.options.onUpdateMapping,
				onClose: () => this.close(),
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
