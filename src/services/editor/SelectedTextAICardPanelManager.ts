import type { MarkdownView } from "obsidian";
import { mount, unmount } from "svelte";
import SelectedTextAICardPanel from "../../components/ai-assistant/SelectedTextAICardPanel.svelte";
import type { WeavePlugin } from "../../main";

type PanelInstance = {
	container: HTMLElement;
	instance: any;
};

export class SelectedTextAICardPanelManager {
	private panels = new Map<MarkdownView, PanelInstance>();

	constructor(private plugin: WeavePlugin) {}

	openPanel(params: {
		view: MarkdownView;
		selectedText: string;
		actionId: string;
	}): void {
		const { view, selectedText, actionId } = params;

		this.closePanel(view);

		const container = document.createElement("div");
		container.className = "weave-ai-card-panel-container";

		view.contentEl.append(container);

		const instance = mount(SelectedTextAICardPanel, {
			target: container,
			props: {
				host: this.plugin,
				selectedText,
				actionId,
				sourceFilePath: view.file?.path || "",
				onClose: () => this.closePanel(view),
			},
		});

		this.panels.set(view, { container, instance });
	}

	closePanel(view: MarkdownView): void {
		const existing = this.panels.get(view);
		if (!existing) return;

		try {
			void unmount(existing.instance);
		} catch {}

		try {
			existing.container.remove();
		} catch {}

		this.panels.delete(view);
	}

	dispose(): void {
		for (const [view] of this.panels) {
			this.closePanel(view);
		}
		this.panels.clear();
	}
}
