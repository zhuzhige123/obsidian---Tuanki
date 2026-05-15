import { App, Modal, Setting } from "obsidian";

interface ClozeInputModeHintModalOptions {
	onConfirm: (dismissPermanently: boolean) => void | Promise<void>;
}

const YAML_INPUT_SAMPLE = ["we_cloze_mode", ": input"].join("");
const YAML_TAG_SAMPLE = ["tags", ": [we_input]"].join("");

export class ClozeInputModeHintModal extends Modal {
	private dismissPermanently = false;
	private readonly options: ClozeInputModeHintModalOptions;

	constructor(app: App, options: ClozeInputModeHintModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("weave-cloze-input-hint-modal");
		this.setTitle("输入模式提示");

		const intro = contentEl.createEl("p", {
			text: "你可以用卡片内容标记，让该卡片下次学习时自动进入输入模式。以下任一方式即可，不需要同时设置。",
		});
		intro.addClass("weave-cloze-input-hint-intro");

		const list = contentEl.createEl("ul", { cls: "weave-cloze-input-hint-list" });

		const contentTagItem = list.createEl("li");
		contentTagItem.appendText("正文添加 ");
		contentTagItem.createEl("code", { text: "#we_input" });

		const yamlFieldItem = list.createEl("li");
		yamlFieldItem.appendText("YAML 添加 ");
		yamlFieldItem.createEl("code", { text: YAML_INPUT_SAMPLE });

		const yamlTagItem = list.createEl("li");
		yamlTagItem.appendText("YAML 标签添加 ");
		yamlTagItem.createEl("code", { text: YAML_TAG_SAMPLE });

		const note = contentEl.createEl("p", {
			text: "插件会自动识别，下次切到该卡片时会自动切换到输入模式。",
		});
		note.addClass("weave-cloze-input-hint-note");

		new Setting(contentEl)
			.setName("永久不再显示")
			.setDesc("勾选后，后续切换到输入模式时不再弹出该提示")
			.addToggle((toggle) =>
				toggle.setValue(false).onChange((_value) => {
					this.dismissPermanently = _value;
				})
			);

		const actions = contentEl.createDiv({ cls: "weave-cloze-input-hint-actions" });
		const confirmBtn = actions.createEl("button", {
			text: "知道了",
			cls: "mod-cta",
		});
		confirmBtn.addEventListener("click", () => {
			void this.handleConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async handleConfirm(): Promise<void> {
		await this.options.onConfirm(this.dismissPermanently);
		this.close();
	}
}
