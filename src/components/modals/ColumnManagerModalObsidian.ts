import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type { ColumnOrder, ColumnKey, ColumnVisibility, ColumnGroups } from "../tables/types/table-types";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import ColumnManager from "../ui/ColumnManager.svelte";

export interface ColumnManagerQuickPreset {
	id: string;
	label: string;
	description: string;
}

export interface ColumnManagerModalObsidianOptions {
	visibility: ColumnVisibility;
	columnOrder: ColumnOrder;
	columnGroups?: ColumnGroups;
	quickPresets?: ColumnManagerQuickPreset[];
	activePresetId?: string | null;
	onVisibilityChange: (key: ColumnKey, value: boolean) => void;
	onOrderChange: (newOrder: ColumnOrder) => void;
	onApplyPreset?: (presetId: string) => void;
	onResetToDefaults?: () => void;
	onClose?: () => void;
}

export class ColumnManagerModalObsidian extends Modal {
	private component: ReturnType<typeof mount> | null = null;
	private readonly options: ColumnManagerModalObsidianOptions;

	constructor(app: App, options: ColumnManagerModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		this.setTitle("字段管理");
		configureWeaveObsidianModalLayout(this, {
			modalClass: "weave-column-manager-modal",
			contentClass: "weave-column-manager-modal-content",
		});

		this.component = mount(ColumnManager, {
			target: this.contentEl,
			props: {
				visibility: this.options.visibility,
				columnOrder: this.options.columnOrder,
				columnGroups: this.options.columnGroups,
				quickPresets: this.options.quickPresets ?? [],
				activePresetId: this.options.activePresetId ?? null,
				onVisibilityChange: this.options.onVisibilityChange,
				onOrderChange: this.options.onOrderChange,
				onApplyPreset: this.options.onApplyPreset ?? (() => {}),
				onResetToDefaults: this.options.onResetToDefaults ?? (() => {}),
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
