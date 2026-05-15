import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { Deck } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import QuestionBankAnalyticsModal from "./QuestionBankAnalyticsModal.svelte";

export interface QuestionBankAnalyticsModalObsidianOptions {
	plugin: WeavePlugin;
	questionBank: Deck;
	onClose?: () => void;
}

export class QuestionBankAnalyticsModalObsidian extends Modal {
	private component: any = null;
	private readonly options: QuestionBankAnalyticsModalObsidianOptions;

	constructor(app: App, options: QuestionBankAnalyticsModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle(`${this.options.questionBank.name} - 题库分析`);
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-question-bank-analytics-modal",
			contentClass: "weave-question-bank-analytics-modal-content",
		});

		this.component = mount(QuestionBankAnalyticsModal, {
			target: this.contentEl,
			props: {
				plugin: this.options.plugin,
				questionBank: this.options.questionBank,
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
