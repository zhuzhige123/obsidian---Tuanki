import { App, FuzzySuggestModal, TFolder } from "obsidian";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";
import { applyStyleProps } from "../utils/style-props";

 interface AnchorRect {
 	left: number;
 	right: number;
 	top: number;
 	bottom: number;
 	width: number;
 	height: number;
 }

interface VaultFolderSuggestModalOptions {
	placeholder?: string;
	anchorRect?: AnchorRect;
}

export class VaultFolderSuggestModal extends FuzzySuggestModal<string> {
	private readonly items: string[];
	private readonly anchorRect: AnchorRect | null;
	private resolver: ((folderPath: string | null) => void) | null = null;
	private selectedFolderPath: string | null = null;
	private settled = false;
	private closeTimer: number | null = null;

	constructor(app: App, options: VaultFolderSuggestModalOptions = {}) {
		super(app);
		this.anchorRect = options.anchorRect ?? null;
		const folderPaths = app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => folder.path)
			.sort((a, b) => a.localeCompare(b));

		this.items = ["/", ...folderPaths];
		this.setPlaceholder(options.placeholder ?? "选择保存文件夹...");
	}

	getItems(): string[] {
		return this.items;
	}

	onOpen(): void {
		void super.onOpen();
		window.dispatchEvent(new CustomEvent("Weave:emergent-child-popup-open"));
		ensureWeaveSuggestModalTheme();
		markLatestSuggestionContainer("weave-vault-folder-suggest-popover");
		this.positionNearAnchor();

		if (!this.anchorRect && this.containerEl) {
			this.containerEl.classList.add("weave-suggest-modal-container--raised");
		}

		if (!this.anchorRect && this.modalEl) {
			this.modalEl.classList.add("weave-suggest-modal--raised");
		}
	}

	getItemText(folderPath: string): string {
		return folderPath === "/" ? "/（Vault 根目录）" : folderPath;
	}

	private settle(folderPath: string | null): void {
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
		resolver?.(folderPath);
	}

	onChooseItem(folderPath: string): void {
		this.selectedFolderPath = folderPath;
		this.settle(folderPath);
	}

	onClose(): void {
		super.onClose();
		window.dispatchEvent(
			new CustomEvent("Weave:emergent-child-popup-close", {
				detail: { graceMs: 220 },
			})
		);
		if (this.settled) {
			this.selectedFolderPath = null;
			return;
		}

		if (this.closeTimer !== null) {
			window.clearTimeout(this.closeTimer);
		}

		this.closeTimer = window.setTimeout(() => {
			this.closeTimer = null;
			const selectedFolderPath = this.selectedFolderPath;
			this.selectedFolderPath = null;
			this.settle(selectedFolderPath);
		}, 0);
	}

	openAndSelect(): Promise<string | null> {
		return new Promise((resolve) => {
			if (this.closeTimer !== null) {
				window.clearTimeout(this.closeTimer);
				this.closeTimer = null;
			}
			this.resolver = resolve;
			this.selectedFolderPath = null;
			this.settled = false;
			this.open();
		});
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
			const preferredWidth = Math.min(
				Math.max(anchorRect.width, 280),
				Math.min(420, viewportWidth - 24)
			);
			const spaceBelow = Math.max(0, viewportHeight - anchorRect.bottom - spacing - 12);
			const spaceAbove = Math.max(0, anchorRect.top - spacing - 12);
			const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
			const maxHeight = Math.max(180, Math.min(360, placeAbove ? spaceAbove : spaceBelow));

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
		};

		window.requestAnimationFrame(place);
	}
}
