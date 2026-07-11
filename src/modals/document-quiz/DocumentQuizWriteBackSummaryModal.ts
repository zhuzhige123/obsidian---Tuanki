import { App, Modal } from "obsidian";
import type { DocumentQuizWriteBackResult } from "../../types/document-quiz-types";
import { i18n } from "../../utils/i18n";
import {
	applyWeaveModalAccentTitle,
	clearWeaveModalAccentTitle,
} from "../weave-modal-chrome";

const WRITEBACK_MODAL_ACCENT = "green" as const;

export class DocumentQuizWriteBackSummaryModal extends Modal {
	constructor(
		app: App,
		private readonly results: DocumentQuizWriteBackResult[]
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass("weave-document-quiz-writeback-modal");
		modalEl.addClass("weave-document-quiz-writeback-modal-shell");
		this.setTitle(i18n.t("documentQuiz.writeBack.title"));
		applyWeaveModalAccentTitle(this.titleEl, WRITEBACK_MODAL_ACCENT);

		let succeeded = 0;
		const failed: DocumentQuizWriteBackResult[] = [];
		for (const result of this.results) {
			if (result.success) {
				succeeded += 1;
			} else {
				failed.push(result);
			}
		}

		contentEl.createEl("p", {
			cls: "weave-document-quiz-writeback-summary",
			text: i18n.t("documentQuiz.writeBack.summary", {
				succeeded: String(succeeded),
				failed: String(failed.length),
			}),
		});

		if (failed.length > 0) {
			const list = contentEl.createEl("ul", { cls: "weave-document-quiz-writeback-failures" });
			for (const item of failed) {
				list.createEl("li", {
					text: i18n.t("documentQuiz.writeBack.failedRow", {
						blockId: item.blockId,
						error: item.error ?? i18n.t("common.unknown"),
					}),
				});
			}
		}

		const actions = contentEl.createDiv({ cls: "modal-button-container weave-document-quiz-writeback-actions" });
		actions.createEl("button", {
			text: i18n.t("common.confirm"),
			cls: "mod-cta",
		}).addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
		this.contentEl.removeClass("weave-document-quiz-writeback-modal");
		this.modalEl.removeClass("weave-document-quiz-writeback-modal-shell");
		clearWeaveModalAccentTitle(this.titleEl, WRITEBACK_MODAL_ACCENT);
	}
}
