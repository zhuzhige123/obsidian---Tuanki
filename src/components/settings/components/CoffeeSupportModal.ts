import { App, Modal, Notice } from "obsidian";
import "./coffee-support-modal.css";

interface ResolvedCoffeeSupportModalOptions {
	imageSrc: string;
	title: string;
	loadingText: string;
	errorText: string;
	errorNotice: string;
	caption: string;
}

export interface CoffeeSupportModalOptions {
	imageSrc: string;
	title?: string;
	loadingText?: string;
	errorText?: string;
	errorNotice?: string;
	caption?: string;
}

export class CoffeeSupportModal extends Modal {
	private readonly options: ResolvedCoffeeSupportModalOptions;

	constructor(app: App, options: CoffeeSupportModalOptions) {
		super(app);
		this.options = {
			imageSrc: options.imageSrc,
			title: options.title || "请喝咖啡",
			loadingText: options.loadingText || "正在加载收款码…",
			errorText: options.errorText || "收款码加载失败，请稍后重试或重新打开设置页面。",
			errorNotice: options.errorNotice || "收款码加载失败",
			caption: options.caption || "扫码即可支持开发",
		};
	}

	onOpen(): void {
		this.setTitle(this.options.title);
		this.modalEl.addClass("weave-coffee-support-modal");
		this.contentEl.empty();

		const wrapper = this.contentEl.createDiv({ cls: "weave-coffee-support-modal__content" });
		const loadingEl = wrapper.createDiv({
			cls: "weave-coffee-support-modal__loading",
			text: this.options.loadingText,
		});

		void this.renderQrCode(wrapper, loadingEl);
	}

	onClose(): void {
		this.contentEl.empty();
		this.modalEl.removeClass("weave-coffee-support-modal");
	}

	private async renderQrCode(wrapper: HTMLDivElement, loadingEl: HTMLDivElement): Promise<void> {
		const imageEl = wrapper.createEl("img", {
			cls: "weave-coffee-support-modal__image",
			attr: {
				alt: this.options.title,
			},
		});
		imageEl.addClass("is-hidden");

		imageEl.addEventListener("load", () => {
			loadingEl.remove();
			imageEl.removeClass("is-hidden");
			wrapper.createEl("p", {
				cls: "weave-coffee-support-modal__caption",
				text: this.options.caption,
			});
		});

		imageEl.addEventListener("error", () => {
			imageEl.remove();
			loadingEl.remove();
			wrapper.createEl("div", {
				cls: "weave-coffee-support-modal__error",
				text: this.options.errorText,
			});
			new Notice(this.options.errorNotice);
		});

		imageEl.src = this.options.imageSrc;
	}
}
