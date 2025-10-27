import { ItemView } from "obsidian";
import type AnkiPlugin from "../main";
// import { performanceMonitor } from "../utils/enhanced-performance-monitor";

export const VIEW_TYPE_ANKI = "anki-view";

export class AnkiView extends ItemView {
	component: any = null;
	plugin: AnkiPlugin;

	constructor(leaf: any, plugin: AnkiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_ANKI;
	}

	getDisplayText() {
		return "Weave";
	}

	getIcon() {
		return "brain";
	}

	// 设置为可以在主编辑区打开
	allowNoFile() {
		return true;
	}

	// 设置导航类型
	getNavigationType() {
		return "tab";
	}

	async onOpen() {
		// 直接创建主组件，无需进度条
		this.contentEl.classList.add("tuanki-view-content");
		this.contentEl.classList.add("tuanki-main-editor-mode");
		await this.createMainComponent();
	}

	private async createMainComponent() {
		try {
			// 动态导入主组件，实现懒加载
			const { default: Component } = await import("../components/TuankiApp.svelte");

			this.component = new Component({
				target: this.contentEl,
				props: {
					plugin: this.plugin,
					dataStorage: this.plugin.dataStorage,
					fsrs: this.plugin.fsrs
				}
			});
		} catch (error) {
			console.error('Failed to create AnkiView component:', error);
			this.contentEl.innerHTML = '<div class="error">Failed to load Anki interface</div>';
		}
	}

	async onClose() {
		if (this.component) {
			this.component.$destroy();
		}
	}
}
