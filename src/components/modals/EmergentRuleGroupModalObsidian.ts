import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type WeavePlugin from "../../main";
import type { EmergentRuleGroup } from "../../services/deck/emergent-rule-groups";
import { configureWeaveObsidianModalLayout } from "../../utils/obsidian-modal-layout";
import EmergentRuleGroupModalContent from "./EmergentRuleGroupModalContent.svelte";

export interface EmergentRuleGroupModalObsidianOptions {
	plugin: WeavePlugin;
	groups: EmergentRuleGroup[];
	activeRuleGroupId: string;
	isMobile?: boolean;
	onSave: (groups: EmergentRuleGroup[], activeRuleGroupId: string) => Promise<void> | void;
	onClose?: () => void;
}

export class EmergentRuleGroupModalObsidian extends Modal {
	private component: ReturnType<typeof mount> | null = null;
	private readonly options: EmergentRuleGroupModalObsidianOptions;

	constructor(app: App, options: EmergentRuleGroupModalObsidianOptions) {
		super(app);
		this.options = options;
	}

	onOpen() {
		configureWeaveObsidianModalLayout(this, {
			modalClass: `weave-emergent-rule-group-modal${
				this.options.isMobile ? " weave-emergent-rule-group-modal--mobile" : ""
			}`,
			contentClass: "weave-emergent-rule-group-modal__content",
		});

		this.component = mount(EmergentRuleGroupModalContent, {
			target: this.contentEl,
			props: {
				plugin: this.options.plugin,
				groups: this.options.groups,
				activeRuleGroupId: this.options.activeRuleGroupId,
				isMobile: this.options.isMobile ?? false,
				onClose: () => this.close(),
				onSave: this.options.onSave
			}
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
