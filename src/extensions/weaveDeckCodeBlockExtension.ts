import {
	type EditorState,
	type Extension,
	type RangeSet,
	RangeSetBuilder,
	StateField,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import { mount, unmount } from "svelte";
import WeaveDeckCodeBlock from "../components/markdown/WeaveDeckCodeBlock.svelte";
import type { WeavePlugin } from "../main";
import { WEAVE_DECKS_CODE_BLOCK_LANGUAGE } from "../services/markdown/weaveDeckCodeBlock";

type MountedComponent = Parameters<typeof unmount>[0];

export interface FenceMatch {
	from: number;
	to: number;
	source: string;
}

class WeaveDeckCodeBlockWidget extends WidgetType {
	private component: MountedComponent | null = null;

	constructor(
		private plugin: WeavePlugin,
		private source: string
	) {
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

function selectionIntersectsMatch(state: EditorState, match: FenceMatch): boolean {
	return state.selection.ranges.some((range) => {
		const headInside = range.head >= match.from && range.head <= match.to;
		const anchorInside = range.anchor >= match.from && range.anchor <= match.to;
		const overlaps = range.from <= match.to && range.to >= match.from;
		return headInside || anchorInside || overlaps;
	});
}

export function findWeaveDeckFenceBlocks(text: string): FenceMatch[] {
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

function buildWeaveDeckDecorations(
	state: EditorState,
	plugin: WeavePlugin
): RangeSet<Decoration> {
	const builder = new RangeSetBuilder<Decoration>();

	if (!state.field(editorLivePreviewField, false)) {
		return builder.finish();
	}

	const text = state.doc.toString();
	const matches = findWeaveDeckFenceBlocks(text);

	for (const match of matches) {
		if (selectionIntersectsMatch(state, match)) {
			continue;
		}

		builder.add(
			match.from,
			match.to,
			Decoration.replace({
				widget: new WeaveDeckCodeBlockWidget(plugin, match.source),
				block: true,
			})
		);
	}

	return builder.finish();
}

function livePreviewFieldChanged(tr: { startState: EditorState; state: EditorState }): boolean {
	return (
		tr.startState.field(editorLivePreviewField, false) !==
		tr.state.field(editorLivePreviewField, false)
	);
}

export function createWeaveDeckCodeBlockExtension(plugin: WeavePlugin): Extension {
	const weaveDeckDecorationsField = StateField.define<RangeSet<Decoration>>({
		create(state) {
			return buildWeaveDeckDecorations(state, plugin);
		},
		update(decorations, tr) {
			if (tr.docChanged || tr.selection || livePreviewFieldChanged(tr)) {
				return buildWeaveDeckDecorations(tr.state, plugin);
			}
			return decorations;
		},
		provide: (field) => EditorView.decorations.from(field),
	});

	return weaveDeckDecorationsField;
}
