import {
	App,
	MarkdownView,
	Platform,
	TFile,
	WorkspaceLeaf,
	normalizePath,
	type WorkspaceSplit,
} from "obsidian";
import { getLeafContainerEl } from "../../utils/obsidian-markdown-editor";
import { readUnknownProperty, readUnknownString } from "../../utils/dynamic-access";
import { applyStyleProps } from "../../utils/style-props";
import {
	isDetachedEditorTempFilePath,
	isLegacyModalEditorPermanentFilePath,
	isPluginCacheModalEditorPermanentFilePath,
} from "./editor-temp-file-policy";

const OFFSCREEN_LEAF_STYLE = {
	position: "absolute",
	left: "-9999px",
	top: "-9999px",
	width: "1px",
	height: "1px",
	overflow: "hidden",
	"pointer-events": "none",
	display: "block",
	visibility: "visible",
} as const;

export type HiddenWorkspaceLeafResult = {
	leaf: WorkspaceLeaf;
	leafEl: HTMLElement | null;
};

/**
 * 按 Obsidian 公共 API 解析可用于 createLeafInParent 的父级 split。
 * 桌面端优先 rootSplit；移动端在侧栏 split 可用时优先使用，减少对主编辑区的干扰。
 */
export function resolveWorkspaceLeafParentSplits(workspace: App["workspace"]): WorkspaceSplit[] {
	const splits: WorkspaceSplit[] = [];
	const seen = new Set<WorkspaceSplit>();

	const push = (split: WorkspaceSplit | undefined) => {
		if (!split || seen.has(split)) {
			return;
		}
		seen.add(split);
		splits.push(split);
	};

	if (Platform.isMobile) {
		push(workspace.rightSplit);
		push(workspace.leftSplit);
	}

	push(workspace.rootSplit);
	return splits;
}

export async function waitForWorkspaceLayoutReady(app: App): Promise<void> {
	await new Promise<void>((resolve) => {
		try {
			app.workspace.onLayoutReady(() => resolve());
		} catch {
			resolve();
		}
	});
}

function markLeafOffscreen(leafEl: HTMLElement): void {
	leafEl.dataset.weaveDetachedLeafEditor = "true";
	applyStyleProps(leafEl, OFFSCREEN_LEAF_STYLE);
}

/**
 * 在 workspace 中创建一个保持挂载、但移出视口的隐藏 Markdown leaf。
 * 使用官方 Workspace API，避免依赖 WorkspaceSplit 内部方法探测。
 */
export async function createHiddenWorkspaceLeaf(app: App): Promise<HiddenWorkspaceLeafResult> {
	await waitForWorkspaceLayoutReady(app);

	const parentSplits = resolveWorkspaceLeafParentSplits(app.workspace);
	if (parentSplits.length === 0) {
		throw new Error("Workspace 布局尚未就绪，无法解析 WorkspaceSplit");
	}

	let leaf: WorkspaceLeaf | null = null;
	let lastError: unknown = null;

	for (const parentSplit of parentSplits) {
		try {
			leaf = app.workspace.createLeafInParent(parentSplit, 0);
			if (leaf) {
				break;
			}
		} catch (error) {
			lastError = error;
		}
	}

	if (!leaf) {
		throw lastError instanceof Error
			? lastError
			: new Error("createLeafInParent 在所有 WorkspaceSplit 上均失败");
	}

	const leafEl = getLeafContainerEl(leaf) ?? null;
	if (leafEl) {
		markLeafOffscreen(leafEl);
	}

	return { leaf, leafEl };
}

/**
 * 插件重载后清理上次会话遗留的 detached markdown leaf，避免占用 workspace 槽位。
 */
export function cleanupRestoredDetachedEditorLeaves(app: App): void {
	try {
		const leaves = app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			try {
				const leafEl = getLeafContainerEl(leaf);
				if (leafEl?.dataset?.weaveDetachedLeafEditor === "true") {
					leaf.detach();
					continue;
				}

				const view = leaf.view;
				const file = view instanceof MarkdownView ? view.file : null;
				const path = file?.path ? normalizePath(file.path) : "";
				if (path && isDetachedEditorTempFilePath(path)) {
					leaf.detach();
				}
			} catch {
				/* no-op */
			}
		}
	} catch {
		/* no-op */
	}
}

/**
 * 清理旧版 ModalEditorManager 遗留的 modal-editor-permanent* markdown leaf。
 */
export function cleanupRestoredModalEditorLeaves(app: App): void {
	try {
		const leaves = app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			try {
				const view = leaf.view;
				const file = view instanceof MarkdownView ? view.file : readUnknownProperty(view, "file");
				const rawPath =
					file instanceof TFile ? file.path : readUnknownString(file, "path");
				const path = rawPath ? normalizePath(rawPath) : "";
				if (!path) continue;

				if (
					isPluginCacheModalEditorPermanentFilePath(app, path)
					|| isLegacyModalEditorPermanentFilePath(path)
				) {
					leaf.detach();
				}
			} catch {
				/* no-op */
			}
		}
	} catch {
		/* no-op */
	}
}
