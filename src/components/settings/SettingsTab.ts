import { type App, PluginSettingTab } from "obsidian";
import type WeavePlugin from "../../main";
import type { PluginExtended } from "./types/settings-types";

export class AnkiSettingsTab extends PluginSettingTab {
	plugin: PluginExtended;

	constructor(app: App, plugin: WeavePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		void this.renderDisplay();
	}

	private async renderDisplay(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const { mount } = await import("svelte");
		const { default: Component } = await import("./SettingsPanel.svelte");
		mount(Component, { target: containerEl, props: { plugin: this.plugin } });
	}
}
