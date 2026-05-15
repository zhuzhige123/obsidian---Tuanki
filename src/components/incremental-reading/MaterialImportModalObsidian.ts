import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type WeavePlugin from "../../main";
import type { BatchImportResult } from "../../services/incremental-reading/ReadingMaterialManager";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import MaterialImportModal from "./MaterialImportModal.svelte";

export interface MaterialImportModalObsidianOptions {
	plugin: WeavePlugin;
	onImportComplete?: (result: BatchImportResult) => void;
	onClose?: () => void;
}

export class MaterialImportModalObsidian extends Modal {
	private component: Parameters<typeof unmount>[0] | null = null;
	private readonly options: MaterialImportModalObsidianOptions;

	constructor(app: App, options: MaterialImportModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle("导入阅读材料");
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-material-import-modal",
			contentClass: "weave-material-import-modal-content",
		});

		this.component = mount(MaterialImportModal, {
			target: this.contentEl,
			props: {
				plugin: this.options.plugin,
				open: true,
				useObsidianModal: true,
				onClose: () => this.close(),
				onImportComplete: (result: BatchImportResult) => {
					this.options.onImportComplete?.(result);
				},
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
