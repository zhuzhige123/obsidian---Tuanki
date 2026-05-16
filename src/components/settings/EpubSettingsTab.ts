import type { Plugin } from "obsidian";
import { PluginSettingTab } from "obsidian";

type EpubSettingsHost = Plugin & {
	settings?: unknown;
	saveSettings?: () => Promise<void>;
};

export class EpubSettingsTab extends PluginSettingTab {
  plugin: EpubSettingsHost;

  constructor(app: any, plugin: EpubSettingsHost) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    const { mount } = await import("svelte");
    const { default: Component } = await import("./EpubSettingsPanel.svelte");
    mount(Component, {
      target: containerEl,
      props: {
        plugin: this.plugin,
      },
    });
  }
}
