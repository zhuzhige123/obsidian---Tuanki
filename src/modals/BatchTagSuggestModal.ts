import { App, SuggestModal } from "obsidian";
import { filterTagSuggestionItems, type TagSuggestionItem } from "../utils/tag-suggest";
import {
	ensureWeaveSuggestModalTheme,
	markLatestSuggestionContainer,
} from "./weaveSuggestModalTheme";
import { applyStyleProps } from "../utils/style-props";

export interface AnchorRect {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

export type BatchTagSuggestItem = TagSuggestionItem & {
	icon?: string;
};

export class BatchTagSuggestModal extends SuggestModal<BatchTagSuggestItem> {
	private readonly items: BatchTagSuggestItem[];
	private readonly onSelect: (item: BatchTagSuggestItem) => void;
	private readonly anchorRect?: AnchorRect;
	private readonly initialQuery: string;
	private readonly onCloseCallback?: () => void;
	private readonly createSuggestion?: (query: string) => BatchTagSuggestItem | null;

	constructor(
		app: App,
		items: BatchTagSuggestItem[],
		onSelect: (item: BatchTagSuggestItem) => void,
		options?: {
			placeholder?: string;
			anchorRect?: AnchorRect;
			initialQuery?: string;
			onClose?: () => void;
			createSuggestion?: (query: string) => BatchTagSuggestItem | null;
		}
	) {
		super(app);
		this.items = items;
		this.onSelect = onSelect;
		this.anchorRect = options?.anchorRect;
		this.initialQuery = String(options?.initialQuery || "");
		this.onCloseCallback = options?.onClose;
		this.createSuggestion = options?.createSuggestion;

		this.setPlaceholder(options?.placeholder ?? "搜索标签...");
		this.setInstructions([]);
	}

	getSuggestions(query: string): BatchTagSuggestItem[] {
		const matchedItems = filterTagSuggestionItems(this.items, query, 40);
		const createItem = this.createSuggestion?.(query) ?? null;
		return createItem ? [createItem, ...matchedItems] : matchedItems;
	}

	onOpen(): void {
		void super.onOpen();
		window.dispatchEvent(new CustomEvent("Weave:emergent-child-popup-open"));
		ensureWeaveSuggestModalTheme();
		this.hideOverlay();
		window.requestAnimationFrame(() => this.hideOverlay());
		markLatestSuggestionContainer("weave-batch-tag-suggest-popover");
		this.positionNearAnchor();
		this.applyInitialQuery();
	}

	onClose(): void {
		super.onClose();
		this.onCloseCallback?.();
		window.dispatchEvent(
			new CustomEvent("Weave:emergent-child-popup-close", {
				detail: { graceMs: 220 },
			})
		);
	}

	renderSuggestion(item: BatchTagSuggestItem, el: HTMLElement): void {
		el.addClass("weave-batch-tag-suggestion");
		if (item.isCreateSuggestion) {
			el.addClass("weave-batch-tag-suggestion--create");
		}
		const row = el.createDiv({
			cls: "weave-batch-tag-suggestion__row",
		});
		row.createSpan({
			text: item.label,
			cls: "weave-batch-tag-suggestion__title",
		});
		if ((item.count ?? 0) > 0) {
			row.createSpan({
				text: `(${item.count})`,
				cls: "weave-batch-tag-suggestion__meta",
			});
		}
	}

	onChooseSuggestion(item: BatchTagSuggestItem, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
		this.close();
	}

	private hideOverlay(): void {
		if (typeof activeDocument === "undefined") {
			return;
		}

		const containerEl = this.containerEl;
		const siblingCandidates = [containerEl?.previousElementSibling, containerEl?.nextElementSibling]
			.filter((element): element is HTMLElement => element instanceof HTMLElement)
			.filter((element) => element.classList.contains("modal-bg"));

		const fallbackModalBg = Array.from(activeDocument.querySelectorAll(".modal-bg"))
			.reverse()
			.find((element): element is HTMLElement => element.instanceOf(HTMLElement));

		const modalBg = siblingCandidates[0] ?? fallbackModalBg;
		if (!modalBg) {
			return;
		}

		modalBg.classList.add("weave-suggest-modal-bg--hidden");
		applyStyleProps(modalBg, {
			display: "none",
			opacity: "0",
			"pointer-events": "none",
		});
	}

	private applyInitialQuery(): void {
		if (!this.initialQuery) {
			return;
		}

		const inputEl = (this as unknown as { inputEl?: HTMLInputElement }).inputEl;
		if (!inputEl) {
			return;
		}

		inputEl.value = this.initialQuery;
		inputEl.dispatchEvent(new Event("input"));
		window.setTimeout(() => {
			inputEl.focus();
			inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
		}, 0);
	}

	private positionNearAnchor(): void {
		if (!this.anchorRect || typeof window === "undefined") {
			return;
		}
		const anchorRect = this.anchorRect;
		const modalEl = this.modalEl;
		const containerEl = this.containerEl;
		if (!modalEl || !containerEl) {
			return;
		}

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const spacing = 8;
		const preferredWidth = Math.min(
			Math.max(anchorRect.width, 280),
			Math.min(420, viewportWidth - 24)
		);
		const spaceBelow = Math.max(0, viewportHeight - anchorRect.bottom - spacing - 12);
		const spaceAbove = Math.max(0, anchorRect.top - spacing - 12);
		const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
		const maxHeight = Math.max(180, Math.min(360, placeAbove ? spaceAbove : spaceBelow));
		const initialLeft = Math.max(12, Math.min(anchorRect.left, viewportWidth - preferredWidth - 12));
		const initialTop = Math.max(
			12,
			Math.min(anchorRect.bottom + spacing, viewportHeight - Math.min(maxHeight, 360) - 12)
		);

		containerEl.classList.add(
			"weave-suggest-modal-container--anchored",
			"weave-suggest-modal-container--overlayless"
		);
		modalEl.classList.add("weave-suggest-modal--anchored", "weave-suggest-modal--positioning");
		applyStyleProps(containerEl, {
			"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
			"--weave-suggest-popover-max-height": `${Math.round(maxHeight)}px`,
		});
		applyStyleProps(modalEl, {
			"--weave-suggest-popover-width": `${preferredWidth}px`,
			"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
			"--weave-suggest-popover-max-height": `${Math.round(maxHeight)}px`,
			"--weave-suggest-popover-left": `${Math.round(initialLeft)}px`,
			"--weave-suggest-popover-top": `${Math.round(initialTop)}px`,
		});

		const place = () => {
			const modalRect = modalEl.getBoundingClientRect();
			let left = anchorRect.left;
			if (left + modalRect.width > viewportWidth - 12) {
				left = anchorRect.right - modalRect.width;
			}
			left = Math.max(12, Math.min(left, viewportWidth - modalRect.width - 12));

			let top = placeAbove
				? anchorRect.top - modalRect.height - spacing
				: anchorRect.bottom + spacing;
			if (top + modalRect.height > viewportHeight - 12) {
				top = viewportHeight - modalRect.height - 12;
			}
			top = Math.max(12, top);

			applyStyleProps(modalEl, {
				"--weave-suggest-popover-left": `${Math.round(left)}px`,
				"--weave-suggest-popover-top": `${Math.round(top)}px`,
			});
			modalEl.classList.remove("weave-suggest-modal--positioning");
		};

		window.requestAnimationFrame(place);
	}
}
