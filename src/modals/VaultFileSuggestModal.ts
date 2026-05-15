import { App, FuzzySuggestModal, TFile, setIcon, type FuzzyMatch } from "obsidian";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";
import { applyStyleProps } from "../utils/style-props";

interface AnchorRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

interface VaultFileSuggestModalOptions {
	placeholder?: string;
	files?: TFile[];
	filter?: (file: TFile) => boolean;
	allowEmptySelection?: boolean;
	emptySelectionLabel?: string;
	emptySelectionDescription?: string;
	anchorRect?: AnchorRect;
	preferredWidth?: number;
	icon?: string;
	showFileIcon?: boolean;
	showFilePath?: boolean;
}

type VaultFileSuggestItem =
	| {
			kind: "file";
			file: TFile;
	  }
	| {
			kind: "empty";
			label: string;
			description?: string;
	  };

export class VaultFileSuggestModal extends FuzzySuggestModal<VaultFileSuggestItem> {
	private readonly items: VaultFileSuggestItem[];
	private readonly anchorRect: AnchorRect | null;
	private readonly preferredWidth: number | null;
	private readonly icon: string;
	private readonly showFileIcon: boolean;
	private readonly showFilePath: boolean;
	private resolver: ((file: TFile | null) => void) | null = null;
	private selectedFile: TFile | null = null;
	private settled = false;
	private closeTimer: number | null = null;

	constructor(app: App, options: VaultFileSuggestModalOptions = {}) {
		super(app);
		this.anchorRect = options.anchorRect ?? null;
		this.preferredWidth = options.preferredWidth ?? null;
		this.icon = options.icon ?? "file";
		this.showFileIcon = options.showFileIcon ?? true;
		this.showFilePath = options.showFilePath ?? true;

		const files = (options.files ?? app.vault.getFiles()).filter((file) =>
			options.filter ? options.filter(file) : true
		);

		this.items = [
			...(options.allowEmptySelection
				? [
						{
							kind: "empty" as const,
							label: options.emptySelectionLabel ?? "清空当前选择",
							description: options.emptySelectionDescription ?? "不使用文件",
						},
				  ]
				: []),
			...files.map((file) => ({ kind: "file" as const, file })),
		];

		this.setPlaceholder(options.placeholder ?? "选择文件...");
	}

	onOpen(): void {
		void super.onOpen();
		ensureWeaveSuggestModalTheme();
		markLatestSuggestionContainer("weave-vault-file-suggest-popover");
		this.positionNearAnchor();
	}

	getItems(): VaultFileSuggestItem[] {
		return this.items;
	}

	getItemText(item: VaultFileSuggestItem): string {
		return item.kind === "file" ? item.file.path : item.label;
	}

	renderSuggestion(match: FuzzyMatch<VaultFileSuggestItem>, el: HTMLElement): void {
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
		if (this.showFileIcon) {
			const iconEl = wrapper.createSpan({ cls: "weave-markdown-file-suggestion__icon" });
			setIcon(iconEl, this.icon);
		}

		const content = wrapper.createDiv({ cls: "weave-markdown-file-suggestion__content" });
		content.createDiv({
			text: this.getDisplayName(item.file),
			cls: "weave-markdown-file-suggestion__title",
		});
		if (this.showFilePath) {
			content.createDiv({
				text: item.file.path,
				cls: "weave-markdown-file-suggestion__path",
			});
		}
	}

	private settle(file: TFile | null): void {
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
		resolver?.(file);
	}

	onChooseItem(item: VaultFileSuggestItem): void {
		const selectedFile = item.kind === "file" ? item.file : null;
		this.selectedFile = selectedFile;
		this.settle(selectedFile);
	}

	onClose(): void {
		super.onClose();
		if (this.settled) {
			this.selectedFile = null;
			return;
		}

		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
		}

		this.closeTimer = window.setTimeout(() => {
			this.closeTimer = null;
			const selectedFile = this.selectedFile;
			this.selectedFile = null;
			this.settle(selectedFile);
		}, 0);
	}

	openAndSelect(): Promise<TFile | null> {
		return new Promise((resolve) => {
			if (this.closeTimer !== null) {
				window.clearTimeout(this.closeTimer);
				this.closeTimer = null;
			}
			this.resolver = resolve;
			this.selectedFile = null;
			this.settled = false;
			this.open();
		});
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
