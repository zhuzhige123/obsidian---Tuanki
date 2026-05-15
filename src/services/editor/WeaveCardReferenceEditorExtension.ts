import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type ViewUpdate,
} from "@codemirror/view";
import type { WeavePlugin } from "../../main";
import {
	buildWeaveCardReferenceDisplayText,
	parseWeaveCardReferencesInText,
} from "../../utils/weave-card-reference";

class WeaveCardReferenceAliasWidget extends WidgetType {
	constructor(
		private readonly displayText: string,
		private readonly uuid: string,
		private readonly alias: string,
		private readonly from: number,
		private readonly to: number
	) {
		super();
	}

	eq(other: WeaveCardReferenceAliasWidget): boolean {
		return (
			other.displayText === this.displayText &&
			other.uuid === this.uuid &&
			other.alias === this.alias &&
			other.from === this.from &&
			other.to === this.to
		);
	}

	toDOM(): HTMLElement {
		const element = document.createElement("span");
		element.className = "cm-weave-card-reference-alias";
		element.textContent = this.displayText;
		element.setAttribute("data-weave-card-uuid", this.uuid);
		element.setAttribute("data-weave-card-alias", this.alias);
		return element;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function isSelectionInsideRange(view: EditorView, from: number, to: number): boolean {
	return view.state.selection.ranges.some((range) => {
		if (range.empty) {
			return range.head >= from && range.head <= to;
		}
		return range.from < to && range.to > from;
	});
}

function isLikelyInCode(view: EditorView, from: number): boolean {
	const line = view.state.doc.lineAt(from);
	const before = line.text.slice(0, from - line.from);
	const fencedCount = before.split("`").length - 1;
	return fencedCount % 2 === 1;
}

function buildDecorations(view: EditorView) {
	const builder = new RangeSetBuilder<Decoration>();
	for (const { from, to } of view.visibleRanges) {
		const text = view.state.doc.sliceString(from, to);
		for (const reference of parseWeaveCardReferencesInText(text)) {
			if (!reference.alias) {
				continue;
			}
			const absoluteFrom = from + reference.startIndex;
			const absoluteTo = from + reference.endIndex;
			if (isSelectionInsideRange(view, absoluteFrom, absoluteTo)) {
				continue;
			}
			if (isLikelyInCode(view, absoluteFrom)) {
				continue;
			}
			builder.add(
				absoluteFrom,
				absoluteTo,
				Decoration.replace({
					widget: new WeaveCardReferenceAliasWidget(
						buildWeaveCardReferenceDisplayText(reference),
						reference.uuid,
						reference.alias,
						absoluteFrom,
						absoluteTo
					),
					inclusive: false,
				})
			);
		}
	}
	return builder.finish();
}

export function createWeaveCardReferenceEditorExtension(plugin: WeavePlugin): Extension {
	void plugin;
	return [
		ViewPlugin.fromClass(
			class {
				decorations;

				constructor(private readonly view: EditorView) {
					this.decorations = buildDecorations(view);
				}

				update(update: ViewUpdate): void {
					if (update.docChanged || update.viewportChanged || update.selectionSet) {
						this.decorations = buildDecorations(update.view);
					}
				}
			},
			{
				decorations: (value) => value.decorations,
			}
		),
		EditorView.baseTheme({
			".cm-weave-card-reference-alias": {
				cursor: "default",
			},
		}),
	];
}
