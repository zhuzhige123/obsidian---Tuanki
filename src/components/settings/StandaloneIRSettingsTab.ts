import { PluginSettingTab } from "obsidian";
import type StandaloneIncrementalReadingPlugin from "../../ir-main";

export class StandaloneIRSettingsTab extends PluginSettingTab {
	plugin: StandaloneIncrementalReadingPlugin;

	constructor(app: any, plugin: StandaloneIncrementalReadingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const { mount } = await import("svelte");
		const { default: Component } = await import("./StandaloneIRSettingsPanel.svelte");
		mount(Component, {
			target: containerEl,
			props: {
				plugin: this.plugin,
			},
		});
	}
}
