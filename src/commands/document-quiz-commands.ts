import { Notice, MarkdownView } from "obsidian";
import type { WeavePlugin } from "../main";
import { runDocumentQuizFlow } from "../services/document-quiz/DocumentQuizFlow";
import { shouldShowDocumentQuizEntry } from "../services/document-quiz/DocumentQuizDetector";
import { i18n } from "../utils/i18n";

export function registerDocumentQuizCommands(plugin: WeavePlugin): void {
	plugin.addCommand({
		id: "document-quiz-parse-and-test",
		name: i18n.t("documentQuiz.commands.parseAndTest"),
		icon: "clipboard-check",
		editorCheckCallback: (_checking, editor, view) => {
			if (!(view instanceof MarkdownView) || !view.file) {
				return false;
			}
			if (_checking) {
				return true;
			}
			void runDocumentQuizFlow(plugin);
			return true;
		},
	});

	plugin.addCommand({
		id: "document-quiz-parse-selection",
		name: i18n.t("documentQuiz.commands.parseSelection"),
		icon: "scan-text",
		editorCheckCallback: (_checking, editor, view) => {
			if (!(view instanceof MarkdownView) || !view.file) {
				return false;
			}
			const selection = editor.getSelection()?.trim();
			if (!selection) {
				if (!_checking) {
					new Notice(i18n.t("documentQuiz.noSelection"));
				}
				return false;
			}
			if (_checking) {
				return true;
			}
			void runDocumentQuizFlow(plugin, { selectionText: selection });
			return true;
		},
	});
}

export function registerDocumentQuizEditorMenu(plugin: WeavePlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu, editor, view) => {
			if (!(view instanceof MarkdownView) || !view.file) {
				return;
			}

			const content = editor.getValue();
			if (!shouldShowDocumentQuizEntry(content)) {
				return;
			}

			menu.addItem((item) => {
				item
					.setTitle(i18n.t("documentQuiz.commands.parseAndTest"))
					.setIcon("clipboard-check")
					.onClick(() => {
						void runDocumentQuizFlow(plugin);
					});
			});
		})
	);
}
