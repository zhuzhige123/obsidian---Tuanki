import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { Card } from "../../data/types";
import type WeavePlugin from "../../main";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import DeckAnalyticsModal from "./DeckAnalyticsModalShell.svelte";

export interface DeckAnalyticsModalObsidianOptions {
	plugin: WeavePlugin;
	deckId?: string;
	cards?: Card[];
	initialTab?: "retention" | "quantity" | "timing" | "difficulty" | "loadForecast";
	onClose?: () => void;
}

export class DeckAnalyticsModalObsidian extends Modal {
	private component: any = null;
	private readonly options: DeckAnalyticsModalObsidianOptions;

	constructor(app: App, options: DeckAnalyticsModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle("牌组分析");
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-deck-analytics-modal",
			contentClass: "weave-deck-analytics-modal-content",
		});

		this.component = mount(DeckAnalyticsModal, {
			target: this.contentEl,
			props: {
				plugin: this.options.plugin,
				deckId: this.options.deckId,
				cards: this.options.cards ?? [],
				initialTab: this.options.initialTab ?? "retention",
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
