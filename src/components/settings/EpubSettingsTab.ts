import { PluginSettingTab } from "obsidian";
import type StandaloneEpubPlugin from "../../epub-main";

export class EpubSettingsTab extends PluginSettingTab {
  plugin: StandaloneEpubPlugin;

  constructor(app: any, plugin: StandaloneEpubPlugin) {
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
