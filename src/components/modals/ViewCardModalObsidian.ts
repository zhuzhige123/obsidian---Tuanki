import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { Card } from "../../data/types";
import type { ResolvedDeckRef } from "../../types/emergent-deck-types";
import type WeavePlugin from "../../main";
import QuestionBankCardDetailModal from "./QuestionBankCardDetailModal.svelte";
import ViewCardModal from "./ViewCardModal.svelte";

export interface ViewCardModalObsidianOptions {
	plugin: WeavePlugin;
	card: Card;
	allDecks?: Array<{ id: string; name: string }>;
	resolvedDeckRefs?: ResolvedDeckRef[];
	onClose?: () => void;
}

export class ViewCardModalObsidian extends Modal {
	private component: any = null;
	private readonly options: ViewCardModalObsidianOptions;

	constructor(app: App, options: ViewCardModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		const isTestCard = this.options.card.cardPurpose === "test";
		const ModalComponent = isTestCard ? QuestionBankCardDetailModal : ViewCardModal;

		this.setTitle(isTestCard ? "测试卡片详情" : "卡片详情");
		this.modalEl.addClass("weave-view-card-modal");
		this.modalEl.setCssProps({
			display: "flex",
			"flex-direction": "column",
			width: "88vw",
			"max-width": "960px",
			height: "80vh",
			"max-height": "80vh",
		});

		this.contentEl.empty();
		this.contentEl.addClass("weave-view-card-modal-content");
		this.contentEl.setCssProps({
			display: "flex",
			"flex-direction": "column",
			flex: "1",
			"min-height": "0",
			padding: "0",
			overflow: "hidden",
		});

		const props = {
			card: this.options.card,
			plugin: this.options.plugin,
			allDecks: this.options.allDecks,
			...(isTestCard ? {} : { resolvedDeckRefs: this.options.resolvedDeckRefs }),
		};

		this.component = mount(ModalComponent, {
			target: this.contentEl,
			props,
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
