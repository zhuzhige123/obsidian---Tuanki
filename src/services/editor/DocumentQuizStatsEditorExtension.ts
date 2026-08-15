import {
	EditorSelection,
	type EditorState,
	type Extension,
	type RangeSet,
	RangeSetBuilder,
	StateField,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { editorLivePreviewField, type App } from "obsidian";
import { buildDocumentQuizStatsPillDisplay } from "../document-quiz/document-quiz-stats-pill-display";
import {
	findDocumentQuizStatsCommentMatches,
	type DocumentQuizStatsCommentMatch,
} from "../document-quiz/document-quiz-stats-comment-locator";
import { createDocumentQuizStatsPillElement } from "../document-quiz/document-quiz-stats-pill-dom";
import { i18n } from "../../utils/i18n";

class DocumentQuizStatsPillWidget extends WidgetType {
	constructor(
		private readonly displayKey: string,
		private readonly from: number,
		private readonly to: number,
		private readonly pillEl: HTMLElement
	) {
		super();
	}

	eq(other: DocumentQuizStatsPillWidget): boolean {
		return (
			other.displayKey === this.displayKey &&
			other.from === this.from &&
			other.to === this.to
		);
	}

	toDOM(view: EditorView): HTMLElement {
		const host = createDiv();
		host.className = "cm-weave-doc-quiz-stats-pill-host";
		host.setAttribute("role", "button");
		host.setAttribute("tabindex", "0");
		host.setAttribute("title", i18n.t("documentQuiz.inlineStats.clickToEdit"));
		host.appendChild(this.pillEl);

		const focusCommentSource = (event: Event): void => {
			event.preventDefault();
			event.stopPropagation();
			view.dispatch({
				selection: EditorSelection.range(this.from, this.to),
				scrollIntoView: true,
			});
			view.focus();
		};

		host.addEventListener("mousedown", focusCommentSource);
		host.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				focusCommentSource(event);
			}
		});

		return host;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function selectionIntersectsRange(state: EditorState, from: number, to: number): boolean {
	return state.selection.ranges.some((range) => {
		const headInside = range.head >= from && range.head <= to;
		const anchorInside = range.anchor >= from && range.anchor <= to;
		const overlaps = range.from <= to && range.to >= from;
		return headInside || anchorInside || overlaps;
	});
}

function buildDisplayKey(
	match: DocumentQuizStatsCommentMatch,
	display: ReturnType<typeof buildDocumentQuizStatsPillDisplay>
): string {
	return [match.blockId, display.mastery, display.segments.join("|")].join("::");
}

function buildDocumentQuizStatsDecorations(state: EditorState): RangeSet<Decoration> {
	const builder = new RangeSetBuilder<Decoration>();

	if (!state.field(editorLivePreviewField, false)) {
		return builder.finish();
	}

	const text = state.doc.toString();
	if (!text.includes("weave-test-stats:")) {
		return builder.finish();
	}

	for (const match of findDocumentQuizStatsCommentMatches(text)) {
		if (selectionIntersectsRange(state, match.from, match.to)) {
			continue;
		}

		const display = buildDocumentQuizStatsPillDisplay({
			blockId: match.blockId,
			stats: match.snapshot,
		});
		const pillEl = createDocumentQuizStatsPillElement(display);

		builder.add(
			match.from,
			match.to,
			Decoration.replace({
				widget: new DocumentQuizStatsPillWidget(
					buildDisplayKey(match, display),
					match.from,
					match.to,
					pillEl
				),
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

export function createDocumentQuizStatsEditorExtension(_app: App): Extension {
	void _app;

	const weaveDocQuizStatsDecorationsField = StateField.define<RangeSet<Decoration>>({
		create(state) {
			return buildDocumentQuizStatsDecorations(state);
		},
		update(decorations, tr) {
			if (tr.docChanged || tr.selection || livePreviewFieldChanged(tr)) {
				return buildDocumentQuizStatsDecorations(tr.state);
			}
			return decorations;
		},
		provide: (field) => EditorView.decorations.from(field),
	});

	return [
		weaveDocQuizStatsDecorationsField,
		EditorView.baseTheme({
			".cm-weave-doc-quiz-stats-pill-host": {
				display: "block",
				cursor: "pointer",
			},
		}),
	];
}
