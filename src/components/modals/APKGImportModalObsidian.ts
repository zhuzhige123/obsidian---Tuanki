import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { WeaveDataStorage } from "../../data/storage";
import type { ImportResult } from "../../domain/apkg/types";
import type WeavePlugin from "../../main";
import { t } from "../../utils/i18n";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import APKGImportModal from "./APKGImportModal.svelte";

export interface APKGImportModalObsidianOptions {
	plugin: WeavePlugin;
	dataStorage: WeaveDataStorage;
	wasmUrl?: string;
	legacyImportAvailable?: boolean;
	legacyImportHelpText?: string;
	onImportComplete?: (result: ImportResult) => void;
	onClose?: () => void;
}

export class APKGImportModalObsidian extends Modal {
	private component: any = null;
	private readonly options: APKGImportModalObsidianOptions;

	constructor(app: App, options: APKGImportModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle(t("mainMenu.deckStudy.importLegacyPackage"));
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-apkg-import-modal",
			contentClass: "weave-apkg-import-modal-content",
		});

		this.component = mount(APKGImportModal, {
			target: this.contentEl,
			props: {
				show: true,
				useObsidianModal: true,
				plugin: this.options.plugin,
				dataStorage: this.options.dataStorage,
				wasmUrl: this.options.wasmUrl ?? this.options.plugin.wasmUrl,
				legacyImportAvailable:
					this.options.legacyImportAvailable ??
					this.options.plugin.hasLegacyApkgImportRuntime(),
				legacyImportHelpText:
					this.options.legacyImportHelpText ??
					this.options.plugin.getLegacyApkgImportUnavailableMessage(),
				onClose: () => this.close(),
				onImportComplete: (result: ImportResult) => this.options.onImportComplete?.(result),
			},
		});
	}

	onClose() {
		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}

		this.contentEl.empty();
		this.options.onClose?.();
	}
}
