import { ButtonComponent, Modal, setIcon } from "obsidian";
import type { App } from "obsidian";
import type {
	EpubBookshelfMembershipEntry,
	EpubScanIndexEntry,
} from "../../services/epub/EpubStorageService";

interface EpubBookshelfImportModalOptions {
	entries: EpubScanIndexEntry[];
	membership: EpubBookshelfMembershipEntry[];
	onConfirm: (paths: string[]) => Promise<void> | void;
	title?: string;
}

export class EpubBookshelfImportModal extends Modal {
	private readonly entries: EpubScanIndexEntry[];
	private readonly membershipPaths: Set<string>;
	private readonly onConfirm: (paths: string[]) => Promise<void> | void;
	private readonly title: string;
	private query = "";
	private readonly selectedPaths = new Set<string>();
	private listContainer: HTMLElement | null = null;
	private summaryEl: HTMLElement | null = null;
	private confirmButton: ButtonComponent | null = null;
	private searchInputEl: HTMLInputElement | null = null;

	constructor(app: App, options: EpubBookshelfImportModalOptions) {
		super(app);
		this.entries = [...options.entries].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
		this.membershipPaths = new Set(options.membership.map((entry) => entry.path));
		this.onConfirm = options.onConfirm;
		this.title = options.title ?? "扫描结果";
	}

	override onOpen(): void {
		this.modalEl.addClass("weave-epub-import-modal");
		this.titleEl.setText(this.title);
		this.render();
		window.setTimeout(() => this.searchInputEl?.focus(), 0);
	}

	override onClose(): void {
		this.contentEl.empty();
		this.listContainer = null;
		this.summaryEl = null;
		this.confirmButton = null;
		this.searchInputEl = null;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("weave-epub-import-shell");

		const toolbar = contentEl.createDiv({ cls: "weave-epub-import-toolbar" });
		const searchWrap = toolbar.createDiv({ cls: "weave-epub-import-search" });
		const searchIcon = searchWrap.createSpan({ cls: "weave-epub-import-search-icon" });
		setIcon(searchIcon, "search");

		this.searchInputEl = searchWrap.createEl("input", {
			type: "search",
			placeholder: "按书名或路径搜索",
			cls: "weave-epub-import-search-input",
		});
		this.searchInputEl.value = this.query;
		this.searchInputEl.addEventListener("input", () => {
			this.query = this.searchInputEl?.value.trim().toLowerCase() ?? "";
			this.renderList();
		});

		this.summaryEl = contentEl.createDiv({ cls: "weave-epub-import-summary" });
		this.listContainer = contentEl.createDiv({ cls: "weave-epub-import-list" });
		this.renderList();

		const actionRow = contentEl.createDiv({ cls: "weave-epub-import-actions" });
		new ButtonComponent(actionRow).setButtonText("取消").onClick(() => this.close());
		this.confirmButton = new ButtonComponent(actionRow)
			.setCta()
			.setButtonText("加入书架")
			.onClick(async () => {
				const paths = Array.from(this.selectedPaths);
				if (paths.length === 0) {
					return;
				}
				await this.onConfirm(paths);
				this.close();
			});
		this.updateConfirmButton();
	}

	private getVisibleEntries(): EpubScanIndexEntry[] {
		return this.entries.filter((entry) => {
			if (!this.query) {
				return true;
			}
			const haystack = `${entry.name} ${entry.path}`.toLowerCase();
			return haystack.includes(this.query);
		});
	}

	private updateConfirmButton(): void {
		if (!this.confirmButton) {
			return;
		}
		const count = this.selectedPaths.size;
		this.confirmButton
			.setButtonText(count > 0 ? `加入书架 (${count})` : "加入书架")
			.setDisabled(count === 0);
	}

	private renderList(): void {
		if (!this.listContainer || !this.summaryEl) {
			return;
		}

		const visibleEntries = this.getVisibleEntries();
		this.summaryEl.setText(
			`扫描结果 ${this.entries.length} 本，当前显示 ${visibleEntries.length} 本，已选 ${this.selectedPaths.size} 本`
		);
		this.updateConfirmButton();

		this.listContainer.empty();
		if (visibleEntries.length === 0) {
			this.listContainer.createDiv({
				cls: "weave-epub-import-empty",
				text: this.query ? "没有匹配的 EPUB" : "没有可显示的 EPUB",
			});
			return;
		}

		for (const entry of visibleEntries) {
			const alreadyAdded = this.membershipPaths.has(entry.path);
			const row = this.listContainer.createDiv({
				cls: `weave-epub-import-item ${alreadyAdded ? "is-added" : ""}`,
			});

			const toggle = () => {
				if (alreadyAdded) {
					return;
				}
				if (this.selectedPaths.has(entry.path)) {
					this.selectedPaths.delete(entry.path);
				} else {
					this.selectedPaths.add(entry.path);
				}
				this.renderList();
			};

			const selector = row.createDiv({ cls: "weave-epub-import-selector" });
			if (alreadyAdded) {
				const badge = selector.createDiv({ cls: "weave-epub-import-added-icon" });
				setIcon(badge, "check");
			} else {
				const checkbox = selector.createEl("input", {
					type: "checkbox",
					cls: "weave-epub-import-checkbox",
				});
				checkbox.checked = this.selectedPaths.has(entry.path);
				checkbox.addEventListener("click", (event) => event.stopPropagation());
				checkbox.addEventListener("change", () => toggle());
			}

			const body = row.createDiv({ cls: "weave-epub-import-body" });
			const header = body.createDiv({ cls: "weave-epub-import-item-header" });
			header.createDiv({ cls: "weave-epub-import-name", text: entry.name });
			header.createDiv({
				cls: `weave-epub-import-status ${alreadyAdded ? "is-added" : "is-pending"}`,
				text: alreadyAdded ? "已在书架" : "可加入",
			});

			body.createDiv({
				cls: "weave-epub-import-path",
				text: this.getFolderLabel(entry.folder),
			});

			if (!alreadyAdded) {
				row.addEventListener("click", toggle);
			}
		}
	}

	private getFolderLabel(folderPath: string): string {
		const normalizedFolderPath = String(folderPath || "").trim();
		if (!normalizedFolderPath || normalizedFolderPath === "/") {
			return "仓库根目录";
		}
		return normalizedFolderPath;
	}
}
