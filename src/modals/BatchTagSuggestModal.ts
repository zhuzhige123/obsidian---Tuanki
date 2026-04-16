import { App, SuggestModal, setIcon } from "obsidian";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";

interface AnchorRect {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

export interface BatchTagSuggestItem {
	tag: string;
	label: string;
	icon?: string;
	keywords?: string[];
}

export class BatchTagSuggestModal extends SuggestModal<BatchTagSuggestItem> {
	private readonly items: BatchTagSuggestItem[];
	private readonly onSelect: (item: BatchTagSuggestItem) => void;
	private readonly anchorRect?: AnchorRect;

	constructor(
		app: App,
		items: BatchTagSuggestItem[],
		onSelect: (item: BatchTagSuggestItem) => void,
		options?: {
			placeholder?: string;
			anchorRect?: AnchorRect;
		}
	) {
		super(app);
		this.items = items;
		this.onSelect = onSelect;
		this.anchorRect = options?.anchorRect;

		this.setPlaceholder(options?.placeholder ?? "搜索标签...");
		this.setInstructions([
			{ command: "↑↓", purpose: "选择标签" },
			{ command: "Enter", purpose: "确认" },
			{ command: "Esc", purpose: "关闭" },
		]);
	}

	getSuggestions(query: string): BatchTagSuggestItem[] {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return this.items;
		}

		return this.items.filter((item) => {
			const haystacks = [
				item.label,
				item.tag,
				...(item.keywords ?? []),
			];
			return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	}

	onOpen(): void {
		void super.onOpen();
		window.dispatchEvent(new CustomEvent("Weave:emergent-child-popup-open"));
		ensureWeaveSuggestModalTheme();
		markLatestSuggestionContainer("weave-batch-tag-suggest-popover");
		this.positionNearAnchor();
	}

	onClose(): void {
		super.onClose();
		window.dispatchEvent(
			new CustomEvent("Weave:emergent-child-popup-close", {
				detail: { graceMs: 220 },
			})
		);
	}

	renderSuggestion(item: BatchTagSuggestItem, el: HTMLElement): void {
		el.addClass("weave-batch-tag-suggestion");

		const row = el.createDiv({ cls: "weave-batch-tag-suggestion__row" });

		const iconEl = row.createSpan({ cls: "weave-batch-tag-suggestion__icon" });
		setIcon(iconEl, item.icon ?? "tag");

		const titleEl = row.createSpan({
			text: item.label,
			cls: "weave-batch-tag-suggestion__title",
		});
	}

	onChooseSuggestion(item: BatchTagSuggestItem, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}

	private positionNearAnchor(): void {
		if (!this.anchorRect || typeof window === "undefined") {
			return;
		}
		const anchorRect = this.anchorRect;

		const place = () => {
			const modalEl = this.modalEl;
			const containerEl = this.containerEl;
			if (!modalEl || !containerEl) {
				return;
			}

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const spacing = 12;
			const preferredWidth = Math.min(320, viewportWidth - 24);

			containerEl.classList.add("weave-suggest-modal-container--anchored");
			modalEl.classList.add("weave-suggest-modal--anchored");
			modalEl.setCssProps({
				"--weave-suggest-popover-width": `${preferredWidth}px`,
				"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
			});

			const modalRect = modalEl.getBoundingClientRect();
			let left = anchorRect.right + spacing;
			if (left + modalRect.width > viewportWidth - 12) {
				left = anchorRect.left - modalRect.width - spacing;
			}
			left = Math.max(12, Math.min(left, viewportWidth - modalRect.width - 12));

			let top = anchorRect.top + anchorRect.height / 2 - modalRect.height / 2;
			if (top + modalRect.height > viewportHeight - 12) {
				top = viewportHeight - modalRect.height - 12;
			}
			top = Math.max(12, top);

			containerEl.setCssProps({
				"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
			});
			modalEl.setCssProps({
				"--weave-suggest-popover-left": `${Math.round(left)}px`,
				"--weave-suggest-popover-top": `${Math.round(top)}px`,
			});
		};

		window.requestAnimationFrame(place);
	}
}
