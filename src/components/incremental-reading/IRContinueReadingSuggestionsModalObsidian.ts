import type { App } from "obsidian";
import { mount, unmount } from "svelte";
import IRContinueReadingSuggestionsModal from "./IRContinueReadingSuggestionsModal.svelte";

export interface IRContinueReadingSuggestionModalItem {
	id: string;
	title: string;
	metaText: string;
	contextLabel?: string;
	priorityLabel?: string;
	kind: "scheduled" | "suspended";
}

export interface IRContinueReadingSuggestionsModalObsidianOptions {
	suggestions: IRContinueReadingSuggestionModalItem[];
	suspendedItems?: IRContinueReadingSuggestionModalItem[];
	isChineseUi?: boolean;
	anchorElement?: HTMLElement | null;
	onOpenSuggestion?: (id: string) => void | Promise<void>;
	onAddSuggestion?: (id: string) => void | Promise<void>;
	onClose?: () => void;
}

export class IRContinueReadingSuggestionsModalObsidian {
	private static activeInstance: IRContinueReadingSuggestionsModalObsidian | null = null;
	private component: Parameters<typeof unmount>[0] | null = null;
	private containerEl: HTMLDivElement | null = null;
	private options: IRContinueReadingSuggestionsModalObsidianOptions;
	private isOpen = false;

	constructor(_app: App, options: IRContinueReadingSuggestionsModalObsidianOptions) {
		this.options = options;
	}

	open() {
		if (this.isOpen) {
			return;
		}

		if (
			IRContinueReadingSuggestionsModalObsidian.activeInstance &&
			IRContinueReadingSuggestionsModalObsidian.activeInstance !== this
		) {
			IRContinueReadingSuggestionsModalObsidian.activeInstance.close();
		}

		this.isOpen = true;
		IRContinueReadingSuggestionsModalObsidian.activeInstance = this;
		this.containerEl = document.createElement("div");
		this.containerEl.className = "weave-ir-continue-reading-floating-root";
		document.body.append(this.containerEl);
		this.render();
	}

	refresh(options: IRContinueReadingSuggestionsModalObsidianOptions) {
		this.options = options;
		if (!this.isOpen) {
			return;
		}
		this.render();
	}

	close() {
		if (!this.isOpen) {
			return;
		}

		this.isOpen = false;
		if (IRContinueReadingSuggestionsModalObsidian.activeInstance === this) {
			IRContinueReadingSuggestionsModalObsidian.activeInstance = null;
		}
		this.destroyComponent();

		try {
			this.containerEl?.remove();
		} catch {
		}
		this.containerEl = null;
		this.options.onClose?.();
	}

	private destroyComponent() {
		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}
		if (this.containerEl) {
			this.containerEl.replaceChildren();
		}
	}

	private render() {
		if (!this.containerEl) {
			return;
		}

		this.destroyComponent();
		this.component = mount(IRContinueReadingSuggestionsModal, {
			target: this.containerEl,
			props: {
				suggestions: this.options.suggestions,
				suspendedItems: this.options.suspendedItems ?? [],
				isChineseUi: this.options.isChineseUi !== false,
				anchorElement: this.options.anchorElement ?? null,
				onOpenSuggestion: (id: string) => this.options.onOpenSuggestion?.(id),
				onAddSuggestion: (id: string) => this.options.onAddSuggestion?.(id),
				onClose: () => this.close(),
			},
		});
	}
}
