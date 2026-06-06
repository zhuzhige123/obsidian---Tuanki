import type { EditorView } from "@codemirror/view";
import type { Editor, MarkdownView } from "obsidian";
import { readUnknownProperty } from "./dynamic-access";
import { isRecord } from "./typed-json";

export type CodeMirror6View = {
	dom?: HTMLElement;
	state?: {
		doc?: { toString(): string };
		sliceDoc?: (from?: number, to?: number) => string;
	};
};

/** Obsidian Markdown Editor with optional CodeMirror 6 bridge (`editor.cm`). */
export type ObsidianMarkdownEditor = Editor & {
	cm?: CodeMirror6View;
};

export type MarkdownEditorViewLike = Pick<MarkdownView, "editor" | "contentEl" | "containerEl">;

export function asMarkdownEditorView(view: unknown): MarkdownEditorViewLike | null {
	if (!isRecord(view)) {
		return null;
	}
	const editor = readUnknownProperty(view, "editor");
	const contentEl = readUnknownProperty(view, "contentEl");
	if (!isRecord(editor) && !(contentEl instanceof HTMLElement)) {
		return null;
	}
	return view as MarkdownEditorViewLike;
}

export function getEditorCodeMirrorView(editor: unknown): CodeMirror6View | undefined {
	if (!isRecord(editor)) {
		return undefined;
	}
	const cm = editor.cm;
	return isRecord(cm) ? (cm as CodeMirror6View) : undefined;
}

export function getCodeMirrorDocumentText(cm: CodeMirror6View | undefined): string | undefined {
	const doc = cm?.state?.doc;
	if (doc && typeof doc.toString === "function") {
		return doc.toString();
	}
	const sliceDoc = cm?.state?.sliceDoc;
	if (typeof sliceDoc === "function") {
		return sliceDoc();
	}
	return undefined;
}

export function getEditorText(editor: ObsidianMarkdownEditor | null | undefined): string {
	if (!editor) {
		return "";
	}
	try {
		const value = editor.getValue();
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
	} catch {
		/* fall through to CodeMirror */
	}
	return getCodeMirrorDocumentText(getEditorCodeMirrorView(editor)) ?? "";
}

export function setEditorText(editor: ObsidianMarkdownEditor | null | undefined, content: string): void {
	editor?.setValue(content);
}

export function focusEditorWithCursor(
	editor: ObsidianMarkdownEditor | null | undefined,
	cursorPosition?: "start" | "end"
): void {
	if (!editor) {
		return;
	}
	editor.focus();
	if (cursorPosition === "start") {
		editor.setCursor({ line: 0, ch: 0 });
		return;
	}
	if (cursorPosition === "end") {
		const lastLine = editor.lastLine();
		const lastLineLength = String(editor.getLine(lastLine) ?? "").length;
		editor.setCursor({ line: lastLine, ch: lastLineLength });
	}
}

export function getLeafContainerEl(leaf: unknown): HTMLElement | undefined {
	const el = readUnknownProperty(leaf, "containerEl");
	return el instanceof HTMLElement ? el : undefined;
}

export function getLeafTabHeaderEl(leaf: unknown): HTMLElement | undefined {
	const el = readUnknownProperty(leaf, "tabHeaderEl");
	return el instanceof HTMLElement ? el : undefined;
}

export function getFileBackedViewPath(view: unknown): string | undefined {
	const file = readUnknownProperty(view, "file");
	const path = readUnknownProperty(file, "path");
	return typeof path === "string" ? path : undefined;
}

export function asEditorView(cm: unknown): EditorView | null {
	if (!isRecord(cm) || typeof cm.dispatch !== "function" || !isRecord(cm.state)) {
		return null;
	}
	return cm as EditorView;
}

export function createEditorFacadeFromView(cm: EditorView): Editor {
	return {
		getSelection: () => {
			const selection = cm.state.selection.main;
			return cm.state.sliceDoc(selection.from, selection.to);
		},
		replaceSelection: (replacement: string) => {
			const selection = cm.state.selection.main;
			cm.dispatch({
				changes: {
					from: selection.from,
					to: selection.to,
					insert: replacement,
				},
				selection: { anchor: selection.from + replacement.length },
			});
		},
		getValue: () => cm.state.doc.toString(),
		setValue: (content: string) => {
			cm.dispatch({
				changes: {
					from: 0,
					to: cm.state.doc.length,
					insert: content,
				},
			});
		},
	} as Editor;
}
