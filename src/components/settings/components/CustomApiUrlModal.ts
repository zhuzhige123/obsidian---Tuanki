import { App, Modal, Notice } from "obsidian";
import type { AIProvider } from "../constants/settings-constants";
import { AI_PROVIDER_LABELS, DEFAULT_API_URLS } from "../constants/settings-constants";
import { t } from "../../../utils/i18n";

export class CustomApiUrlModal extends Modal {
	private provider: AIProvider;
	private currentUrl: string;
	private onSave: (url: string) => void;

	constructor(app: App, provider: AIProvider, currentUrl: string, onSave: (url: string) => void) {
		super(app);
		this.provider = provider;
		this.currentUrl = currentUrl;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("weave-custom-api-url-modal");

		this.setTitle(t("aiConfig.apiKeys.customUrlModal.title", { provider: AI_PROVIDER_LABELS[this.provider] }));

		// API基础地址输入（手动创建，避免Setting API的横排布局在移动端过窄）
		const inputGroup = contentEl.createEl("div", { cls: "weave-url-input-group" });
		inputGroup.createEl("label", { text: t("aiConfig.apiKeys.customUrlModal.label"), cls: "weave-url-label" });

		const inputEl = inputGroup.createEl("input", {
			type: "text",
			placeholder: DEFAULT_API_URLS[this.provider] || "https://api.example.com/v1",
			value: this.currentUrl,
			cls: "weave-url-input",
		});
		inputEl.addEventListener("input", () => {
			this.currentUrl = inputEl.value;
		});
		inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.handleSave();
			}
		});

		inputGroup.createEl("div", {
			text: t("aiConfig.apiKeys.customUrlModal.defaultPrefix", {
				url: DEFAULT_API_URLS[this.provider] || t("aiConfig.apiKeys.customUrlModal.defaultFallback")
			}),
			cls: "weave-url-desc",
		});

		// 按钮区域
		const btnContainer = contentEl.createEl("div", { cls: "weave-url-buttons" });

		const cancelBtn = btnContainer.createEl("button", { text: t("aiConfig.apiKeys.customUrlModal.cancel") });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = btnContainer.createEl("button", { text: t("aiConfig.apiKeys.customUrlModal.save"), cls: "mod-cta" });
		saveBtn.addEventListener("click", () => this.handleSave());
	}

	private handleSave() {
		const url = this.currentUrl.trim();
		if (!url) {
			new Notice(t("aiConfig.apiKeys.customUrlModal.emptyError"), 3000);
			return;
		}

		try {
			const urlObj = new URL(url);
			if (!["http:", "https:"].includes(urlObj.protocol)) {
				new Notice(t("aiConfig.apiKeys.customUrlModal.protocolError"), 3000);
				return;
			}
			if (urlObj.search || urlObj.hash) {
				new Notice(t("aiConfig.apiKeys.customUrlModal.queryHashError"), 3000);
				return;
			}
		} catch {
			new Notice(t("aiConfig.apiKeys.customUrlModal.invalidUrlError"), 3000);
			return;
		}

		const cleanedUrl = url.replace(/\/+$/, "");
		this.onSave(cleanedUrl);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
