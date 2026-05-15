import { type App, SuggestModal, setIcon } from "obsidian";
import type { IRDeck } from "../types/ir-types";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";

export class IRDeckSelectorModal extends SuggestModal<IRDeck> {
	private decks: IRDeck[];
	private onSelect: (deck: IRDeck) => void;

	constructor(app: App, decks: IRDeck[], onSelect: (deck: IRDeck) => void) {
		super(app);
		this.decks = decks;
		this.onSelect = onSelect;

		this.setPlaceholder("搜索增量阅读专题...");
		this.setInstructions([
			{ command: "↑↓", purpose: "导航" },
			{ command: "↵", purpose: "选择" },
			{ command: "esc", purpose: "关闭" },
		]);
	}

	getSuggestions(query: string): IRDeck[] {
		if (!query) return this.decks;
		const q = query.toLowerCase();
		return this.decks.filter(
			(d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
		);
	}

	onOpen(): void {
		void super.onOpen();
		window.dispatchEvent(new CustomEvent("Weave:emergent-child-popup-open"));
		ensureWeaveSuggestModalTheme();
		markLatestSuggestionContainer("weave-ir-deck-suggest-popover");
		if (this.containerEl) {
			this.containerEl.classList.add("weave-suggest-modal-container--raised");
		}
		if (this.modalEl) {
			this.modalEl.classList.add("weave-suggest-modal--raised");
		}
	}

	onClose(): void {
		super.onClose();
		window.dispatchEvent(
			new CustomEvent("Weave:emergent-child-popup-close", {
				detail: { graceMs: 220 },
			})
		);
	}

	renderSuggestion(deck: IRDeck, el: HTMLElement): void {
		el.addClass("weave-ir-deck-suggestion");

		const row = el.createDiv({ cls: "weave-ir-deck-suggestion-row" });

		const iconEl = row.createSpan({ cls: "weave-ir-deck-suggestion-icon" });
		setIcon(iconEl, "folder");

		const nameEl = row.createSpan({ text: deck.name, cls: "weave-ir-deck-suggestion-name" });
	}

	onChooseSuggestion(deck: IRDeck, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(deck);
		this.close();
	}
}
