import { type Extension, type RangeSet, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { mount, unmount } from "svelte";
import WeaveDeckCodeBlock from "../components/markdown/WeaveDeckCodeBlock.svelte";
import type { WeavePlugin } from "../main";
import { WEAVE_DECKS_CODE_BLOCK_LANGUAGE } from "../services/markdown/weaveDeckCodeBlock";

type MountedComponent = Parameters<typeof unmount>[0];

interface FenceMatch {
	from: number;
	to: number;
	source: string;
}

class WeaveDeckCodeBlockWidget extends WidgetType {
	private component: MountedComponent | null = null;

	constructor(private plugin: WeavePlugin, private source: string) {
		super();
	}

	eq(other: WeaveDeckCodeBlockWidget): boolean {
		return other.plugin === this.plugin && other.source === this.source;
	}

	toDOM(): HTMLElement {
		const container = activeDocument.createElement("div");
		container.className = "cm-weave-decks-widget";

		this.component = mount(WeaveDeckCodeBlock, {
			target: container,
			props: {
				plugin: this.plugin,
				source: this.source,
				embedded: true,
			},
		});

		return container;
	}

	destroy(_dom: HTMLElement): void {
		if (this.component) {
			void unmount(this.component);
			this.component = null;
		}
	}

	ignoreEvent(): boolean {
		return false;
	}
}

class WeaveDeckCodeBlockViewPlugin {
	decorations: RangeSet<Decoration>;

	constructor(private view: EditorView, private plugin: WeavePlugin) {
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.viewportChanged || update.selectionSet) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	private buildDecorations(view: EditorView): RangeSet<Decoration> {
		const builder = new RangeSetBuilder<Decoration>();

		if (!view.state.field(editorLivePreviewField, false)) {
			return builder.finish();
		}

		const text = view.state.doc.toString();
		const matches = findWeaveDeckFenceBlocks(text);

		for (const match of matches) {
			if (match.to < view.viewport.from || match.from > view.viewport.to) {
				continue;
			}

			if (selectionIntersectsMatch(view, match)) {
				continue;
			}

			builder.add(
				match.from,
				match.to,
				Decoration.replace({
					widget: new WeaveDeckCodeBlockWidget(this.plugin, match.source),
					block: true,
				})
			);
		}

		return builder.finish();
	}
}

export function createWeaveDeckCodeBlockExtension(plugin: WeavePlugin): Extension {
	return ViewPlugin.fromClass(
		class extends WeaveDeckCodeBlockViewPlugin {
			constructor(view: EditorView) {
				super(view, plugin);
			}
		},
		{
			decorations: (value) => value.decorations,
		}
	);
}

function selectionIntersectsMatch(view: EditorView, match: FenceMatch): boolean {
	return view.state.selection.ranges.some((range) => {
		const headInside = range.head >= match.from && range.head <= match.to;
		const anchorInside = range.anchor >= match.from && range.anchor <= match.to;
		const overlaps = range.from <= match.to && range.to >= match.from;
		return headInside || anchorInside || overlaps;
	});
}

function findWeaveDeckFenceBlocks(text: string): FenceMatch[] {
	const matches: FenceMatch[] = [];
	const pattern = new RegExp(
		`^\`\`\`(?:${WEAVE_DECKS_CODE_BLOCK_LANGUAGE})[^\\r\\n]*\\r?\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`,
		"gm"
	);

	let match = pattern.exec(text);
	while (match !== null) {
		matches.push({
			from: match.index,
			to: match.index + match[0].length,
			source: match[1] || "",
		});

		match = pattern.exec(text);
	}

	return matches;
}
