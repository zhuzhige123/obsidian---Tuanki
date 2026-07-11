import { MarkdownView, type WorkspaceLeaf } from "obsidian";
import type { WeavePlugin } from "../../main";
import { runDocumentQuizFlow } from "./DocumentQuizFlow";
import { i18n } from "../../utils/i18n";

/** 已为该 MarkdownView 注入过顶栏按钮（避免重复 addAction） */
const viewsWithHeaderAction = new WeakSet<MarkdownView>();

/**
 * 在 Obsidian 原生 Markdown 编辑标签页 view-header 注入「解析并测试」。
 * 使用 ItemView.addAction → view-action clickable-icon（官方顶栏按钮）。
 */
export function registerDocumentQuizViewHeader(plugin: WeavePlugin): void {
	const syncAll = () => {
		plugin.app.workspace.iterateAllLeaves((leaf) => {
			ensureDocumentQuizHeaderAction(plugin, leaf);
		});
	};

	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", syncAll));
	plugin.registerEvent(plugin.app.workspace.on("layout-change", syncAll));
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", () => {
			window.setTimeout(syncAll, 0);
		})
	);

	plugin.app.workspace.onLayoutReady(() => {
		syncAll();
	});
}

function ensureDocumentQuizHeaderAction(plugin: WeavePlugin, leaf: WorkspaceLeaf): void {
	const view = leaf.view;
	if (!(view instanceof MarkdownView) || !view.file) {
		return;
	}

	if (viewsWithHeaderAction.has(view)) {
		return;
	}

	view.addAction(
		"clipboard-check",
		i18n.t("documentQuiz.toolbar.parseAndTest"),
		() => {
			void runDocumentQuizFlow(plugin);
		}
	);

	viewsWithHeaderAction.add(view);
}
