import { App, Modal, Setting } from "obsidian";
import { applyStyleProps } from "../../utils/style-props";

export interface MissingSourceDocumentModalOptions {
	title: string;
	message: string[];
	acknowledgeText?: string;
	removeButtonText?: string;
	removeDescription?: string;
	onRemove?: () => Promise<void> | void;
}

type MissingSourceDocumentModalResult = "dismiss" | "remove";

class MissingSourceDocumentModal extends Modal {
	private readonly options: MissingSourceDocumentModalOptions;
	private readonly onResolve: (result: MissingSourceDocumentModalResult) => void;
	private resolved = false;

	constructor(
		app: App,
		options: MissingSourceDocumentModalOptions,
		onResolve: (result: MissingSourceDocumentModalResult) => void
	) {
		super(app);
		this.options = options;
		this.onResolve = onResolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle(this.options.title);

		for (const line of this.options.message) {
			const normalized = String(line || "").trim();
			if (!normalized) continue;
			contentEl.createEl("p", { text: normalized });
		}

		if (this.options.onRemove) {
			new Setting(contentEl)
			.setName(this.options.removeButtonText || "移除该阅读点")
			.setDesc(
				this.options.removeDescription ||
					"如果该阅读点已经失效，可移除它并清理相关增量阅读调度数据。"
			)
			.addButton((button) =>
				button
					.setButtonText(this.options.removeButtonText || "移除该阅读点")
					.setWarning()
					.onClick(() => {
						void this.handleRemove();
					})
			);
		}

		const actions = contentEl.createDiv();
		applyStyleProps(actions, {
			display: "flex",
			"justify-content": "flex-end",
			gap: "10px",
			"margin-top": "16px",
		});

		const acknowledgeButton = actions.createEl("button", {
			text: this.options.acknowledgeText || "知道了",
			cls: "mod-cta",
		});
		acknowledgeButton.addEventListener("click", () => {
			this.finish("dismiss");
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.finish("dismiss");
		}
	}

	private async handleRemove(): Promise<void> {
		if (!this.options.onRemove) {
			return;
		}
		await this.options.onRemove();
		this.finish("remove");
		this.close();
	}

	private finish(result: MissingSourceDocumentModalResult): void {
		if (this.resolved) {
			return;
		}
		this.resolved = true;
		this.onResolve(result);
	}
}

export function showMissingSourceDocumentModal(
	app: App,
	options: MissingSourceDocumentModalOptions
): Promise<MissingSourceDocumentModalResult> {
	return new Promise((resolve) => {
		const modal = new MissingSourceDocumentModal(app, options, resolve);
		modal.open();
	});
}
