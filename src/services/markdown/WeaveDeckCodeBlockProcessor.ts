import { type MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { mount, unmount } from "svelte";
import WeaveDeckCodeBlock from "../../components/markdown/WeaveDeckCodeBlock.svelte";
import type { WeavePlugin } from "../../main";

class WeaveDeckCodeBlockRenderChild extends MarkdownRenderChild {
	private component: unknown = null;

	constructor(containerEl: HTMLElement, private plugin: WeavePlugin, private source: string) {
		super(containerEl);
	}

	onload(): void {
		this.component = mount(WeaveDeckCodeBlock, {
			target: this.containerEl,
			props: {
				plugin: this.plugin,
				source: this.source,
			},
		});
	}

	onunload(): void {
		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}
	}
}

export function createWeaveDeckCodeBlockProcessor(plugin: WeavePlugin) {
	return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		el.empty();
		el.addClass("weave-decks-code-block-host");

		const child = new WeaveDeckCodeBlockRenderChild(el, plugin, source);
		ctx.addChild(child);
	};
}
