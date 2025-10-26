import { EditorView, Decoration } from "@codemirror/view";
import { EditorState, EditorSelection, Prec } from "@codemirror/state";
import { autocompletion, completionKeymap, CompletionContext } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { keymap } from "@codemirror/view";
import { App, EditorSuggest, TFile, Editor, MarkdownView } from 'obsidian';
import type { EditorPosition, EditorSuggestTriggerInfo, EditorSuggestContext } from 'obsidian';
import type AnkiPlugin from "../main";


// Obsidian Link Autocompletion Suggest
export class LinkSuggest extends EditorSuggest<TFile> {
    constructor(app: App, private plugin: AnkiPlugin) {
        super(app);
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line).slice(0, cursor.ch);
        const match = line.match(/\[\[([^\]]*)$/);
        if (match) {
            return {
                start: { line: cursor.line, ch: (match.index || 0) + 2 },
                end: cursor,
                query: match[1],
            };
        }
        return null;
    }

    getSuggestions(context: EditorSuggestContext): TFile[] | Promise<TFile[]> {
        const files = this.app.vault.getMarkdownFiles();
        const query = context.query.toLowerCase();
        return files.filter(file => file.basename.toLowerCase().includes(query));
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.basename);
    }

    selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if(!currentView) return;

        const editor = currentView.editor;
        const linkText = this.app.fileManager.generateMarkdownLink(file, '');

        const start = this.context?.start;
        const end = this.context?.end;

        if (!start || !end) return;

        editor.replaceRange(linkText.slice(2, -2), start, end);
    }
}
