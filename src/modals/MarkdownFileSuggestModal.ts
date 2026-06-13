import { App, FuzzySuggestModal, TFile, setIcon, type FuzzyMatch } from "obsidian";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";
import { applyStyleProps } from "../utils/style-props";
import { listVaultMarkdownFiles } from "../utils/vault-file-list";

interface AnchorRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

interface MarkdownFileSuggestModalOptions {
	placeholder?: string;
	excludePath?: string;
	files?: TFile[];
	filter?: (file: TFile) => boolean;
	allowEmptySelection?: boolean;
	emptySelectionLabel?: string;
	emptySelectionDescription?: string | null;
	anchorRect?: AnchorRect;
	preferredWidth?: number;
	showPath?: boolean;
	showIcon?: boolean;
}

export type MarkdownFileSuggestItem =
	| {
			kind: "file";
			file: TFile;
	  }
	| {
			kind: "empty";
			label: string;
			description?: string;
	  };

export class MarkdownFileSuggestModal extends FuzzySuggestModal<MarkdownFileSuggestItem> {
	private readonly items: MarkdownFileSuggestItem[];
	private readonly anchorRect: AnchorRect | null;
	private readonly preferredWidth: number | null;
	private readonly showPath: boolean;
	private readonly showIcon: boolean;
	private resolver: ((item: MarkdownFileSuggestItem | null) => void) | null = null;
	private selectedItem: MarkdownFileSuggestItem | null = null;
	private settled = false;
	private closeTimer: number | null = null;

	constructor(app: App, options: MarkdownFileSuggestModalOptions = {}) {
		super(app);
		this.anchorRect = options.anchorRect ?? null;
		this.preferredWidth = options.preferredWidth ?? null;
		this.showPath = options.showPath ?? true;
		this.showIcon = options.showIcon ?? true;

		const files = (options.files ?? listVaultMarkdownFiles(app))
			.filter((file) => !options.excludePath || file.path !== options.excludePath)
			.filter((file) => (options.filter ? options.filter(file) : true));

		this.items = [
			...(options.allowEmptySelection
				? [
						{
							kind: "empty" as const,
							label: options.emptySelectionLabel ?? "不使用 Markdown 文件",
							description:
								options.emptySelectionDescription === undefined
									? "清空当前选择"
									: options.emptySelectionDescription ?? undefined,
						},
				  ]
				: []),
			...files.map((file) => ({ kind: "file" as const, file })),
		];

		this.setPlaceholder(options.placeholder ?? "选择 Markdown 笔记...");
	}

	onOpen(): void {
		void super.onOpen();
		ensureWeaveSuggestModalTheme();
		markLatestSuggestionContainer("weave-markdown-file-suggest-popover", {
			scopeEl: this.containerEl,
		});
		this.positionNearAnchor();
	}

	getItems(): MarkdownFileSuggestItem[] {
		return this.items;
	}

	getItemText(item: MarkdownFileSuggestItem): string {
		return item.kind === "file" ? item.file.path : item.label;
	}

	renderSuggestion(match: FuzzyMatch<MarkdownFileSuggestItem>, el: HTMLElement): void {
		const item = match.item;
		el.empty();

		if (item.kind === "empty") {
			const wrapper = el.createDiv({ cls: "weave-markdown-file-suggestion" });
			const content = wrapper.createDiv({ cls: "weave-markdown-file-suggestion__content" });
			content.createDiv({
				text: item.label,
				cls: "weave-markdown-file-suggestion__title",
			});
			if (item.description) {
				content.createDiv({
					text: item.description,
					cls: "weave-markdown-file-suggestion__path",
				});
			}
			return;
		}

		const wrapper = el.createDiv({ cls: "weave-markdown-file-suggestion" });
		if (this.showIcon) {
			const iconEl = wrapper.createSpan({ cls: "weave-markdown-file-suggestion__icon" });
			setIcon(iconEl, "file-text");
		} else {
			wrapper.addClass("weave-markdown-file-suggestion--no-icon");
		}

		if (!this.showPath) {
			wrapper.createDiv({
				text: this.getDisplayName(item.file),
				cls: "weave-markdown-file-suggestion__title",
			});
			return;
		}

		const content = wrapper.createDiv({ cls: "weave-markdown-file-suggestion__content" });
		content.createDiv({
			text: this.getDisplayName(item.file),
			cls: "weave-markdown-file-suggestion__title",
		});
		content.createDiv({
			text: item.file.path,
			cls: "weave-markdown-file-suggestion__path",
		});
	}

	private settle(item: MarkdownFileSuggestItem | null): void {
		if (this.settled) {
			return;
		}

		this.settled = true;
		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}

		const resolver = this.resolver;
		this.resolver = null;
		resolver?.(item);
	}

	onChooseItem(item: MarkdownFileSuggestItem): void {
		this.selectedItem = item;
		this.settle(item);
	}

	onClose(): void {
		super.onClose();
		if (this.settled) {
			this.selectedItem = null;
			return;
		}

		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
		}

		this.closeTimer = window.setTimeout(() => {
			this.closeTimer = null;
			const selectedItem = this.selectedItem;
			this.selectedItem = null;
			this.settle(selectedItem);
		}, 0);
	}

	openAndSelectItem(): Promise<MarkdownFileSuggestItem | null> {
		return new Promise((resolve) => {
			if (this.closeTimer !== null) {
				window.clearTimeout(this.closeTimer);
				this.closeTimer = null;
			}
			this.resolver = resolve;
			this.selectedItem = null;
			this.settled = false;
			this.open();
		});
	}

	openAndSelect(): Promise<TFile | null> {
		return this.openAndSelectItem().then((item) => (item?.kind === "file" ? item.file : null));
	}

	private getDisplayName(file: TFile): string {
		return String((file as Partial<TFile> & { name?: string }).name || file.path.split("/").pop() || file.path);
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
			const spacing = 8;
			const preferredWidth = Math.min(this.preferredWidth ?? 520, viewportWidth - 24);
			const maxHeight = Math.max(220, viewportHeight - anchorRect.bottom - spacing - 12);

			containerEl.classList.add("weave-suggest-modal-container--anchored");
			modalEl.classList.add("weave-suggest-modal--anchored");
			applyStyleProps(containerEl, {
				"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
				"--weave-suggest-popover-max-height": `${Math.round(maxHeight)}px`,
			});
			applyStyleProps(modalEl, {
				"--weave-suggest-popover-width": `${preferredWidth}px`,
				"--weave-suggest-popover-z": "calc(var(--z-index-modal, 400) + 10)",
				"--weave-suggest-popover-max-height": `${Math.round(maxHeight)}px`,
			});

			const modalRect = modalEl.getBoundingClientRect();
			const left = Math.max(12, Math.min(anchorRect.left, viewportWidth - modalRect.width - 12));
			const top = Math.min(anchorRect.bottom + spacing, viewportHeight - 12);

			applyStyleProps(modalEl, {
				"--weave-suggest-popover-left": `${Math.round(left)}px`,
				"--weave-suggest-popover-top": `${Math.round(top)}px`,
			});
		};

		window.requestAnimationFrame(place);
	}
}
