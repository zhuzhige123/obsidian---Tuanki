import { App, FuzzySuggestModal, TFolder } from "obsidian";
import { ensureWeaveSuggestModalTheme, markLatestSuggestionContainer } from "./weaveSuggestModalTheme";

interface VaultFolderSuggestModalOptions {
	placeholder?: string;
}

export class VaultFolderSuggestModal extends FuzzySuggestModal<string> {
	private readonly items: string[];
	private resolver: ((folderPath: string | null) => void) | null = null;
	private selectedFolderPath: string | null = null;
	private settled = false;
	private closeTimer: number | null = null;

	constructor(app: App, options: VaultFolderSuggestModalOptions = {}) {
		super(app);
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

		if (this.containerEl) {
			this.containerEl.classList.add("weave-suggest-modal-container--raised");
		}

		if (this.modalEl) {
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
}
