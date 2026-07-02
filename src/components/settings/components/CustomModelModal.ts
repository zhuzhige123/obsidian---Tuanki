import { App, Modal, Notice } from "obsidian";
import type { AIProvider } from "../constants/settings-constants";
import { AI_PROVIDER_LABELS } from "../constants/settings-constants";
import { t } from "../../../utils/i18n";

const MODEL_NAME_REGEX = /^[a-zA-Z0-9\-._/]+$/;

export class CustomModelModal extends Modal {
	private provider: AIProvider;
	private modelName: string;
	private onSave: (modelName: string) => void;

	constructor(
		app: App,
		provider: AIProvider,
		onSave: (modelName: string) => void
	) {
		super(app);
		this.provider = provider;
		this.modelName = "";
		this.onSave = onSave;
	}

	private validateModelName(modelName: string): { valid: boolean; message: string } {
		const trimmed = modelName.trim();
		if (!trimmed) {
			return { valid: false, message: t("aiConfig.apiKeys.customModel.emptyError") };
		}

		if (!MODEL_NAME_REGEX.test(trimmed)) {
			return { valid: false, message: t("aiConfig.apiKeys.customModel.invalidCharsError") };
		}

		if (trimmed.length > 100) {
			return { valid: false, message: t("aiConfig.apiKeys.customModel.tooLongError") };
		}

		return { valid: true, message: t("aiConfig.apiKeys.customModel.validMessage") };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("weave-custom-model-modal");

		this.setTitle(
			t("aiConfig.apiKeys.customModel.title", { provider: AI_PROVIDER_LABELS[this.provider] })
		);

		const providerInfo = contentEl.createEl("div", { cls: "weave-model-provider-info" });
		providerInfo.createEl("span", {
			text: AI_PROVIDER_LABELS[this.provider],
			cls: "weave-model-provider-name",
		});

		const inputGroup = contentEl.createEl("div", { cls: "weave-model-input-group" });
		inputGroup.createEl("label", {
			text: t("aiConfig.apiKeys.customModel.nameLabel"),
			cls: "weave-model-label",
		});

		const inputEl = inputGroup.createEl("input", {
			type: "text",
			placeholder: t("aiConfig.apiKeys.customModel.namePlaceholder"),
			cls: "weave-model-input",
		});

		const hintEl = inputGroup.createEl("div", { cls: "weave-model-hint" });

		const updateHint = () => {
			this.modelName = inputEl.value;
			const validation = this.validateModelName(this.modelName);
			hintEl.setText(validation.message);
			hintEl.toggleClass("is-error", !validation.valid);
		};

		inputEl.addEventListener("input", updateHint);
		inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				this.handleSave();
			}
		});

		const btnContainer = contentEl.createEl("div", { cls: "weave-model-buttons" });
		const cancelBtn = btnContainer.createEl("button", {
			text: t("aiConfig.apiKeys.customModel.cancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = btnContainer.createEl("button", {
			text: t("aiConfig.apiKeys.customModel.save"),
			cls: "mod-cta",
		});
		saveBtn.addEventListener("click", () => this.handleSave());

		window.setTimeout(() => inputEl.focus(), 0);
	}

	private handleSave() {
		const validation = this.validateModelName(this.modelName);
		if (!validation.valid) {
			new Notice(validation.message, 3000);
			return;
		}

		this.onSave(this.modelName.trim());
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
