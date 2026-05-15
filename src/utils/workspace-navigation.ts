import { TFile } from "obsidian";
import type { App, TAbstractFile, WorkspaceLeaf } from "obsidian";

type WorkspaceCompat = App["workspace"] & {
	iterateAllLeaves?: (callback: (leaf: WorkspaceLeaf) => void) => void;
	revealLeaf?: (leaf: WorkspaceLeaf) => Promise<void> | void;
	setActiveLeaf?: {
		(leaf: WorkspaceLeaf, pushHistory: boolean): void;
		(leaf: WorkspaceLeaf, options: { focus?: boolean }): void;
	};
};

type LeafWithOptionalFileView = WorkspaceLeaf & {
	view: WorkspaceLeaf["view"] & {
		file?: TFile | null;
	};
};

function unwrapLinkText(linkText: string): string {
	return (
		linkText
			.trim()
			.replace(/^!?\[\[/, "")
			.replace(/\]\]$/, "")
			.split("|")[0]
			?.trim() || ""
	);
}

function getLinkTargetPath(linkText: string): string {
	return unwrapLinkText(linkText).split("#")[0]?.trim() || "";
}

function collectAllLeaves(app: App): WorkspaceLeaf[] {
	const workspace = app.workspace as WorkspaceCompat;
	const leaves: WorkspaceLeaf[] = [];

	if (typeof workspace.iterateAllLeaves === "function") {
		workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			leaves.push(leaf);
		});
		return leaves;
	}

	const fallbackTypes = ["markdown", "pdf", "canvas", "image", "audio", "video", "media"];
	const seen = new Set<WorkspaceLeaf>();

	for (const type of fallbackTypes) {
		for (const leaf of app.workspace.getLeavesOfType(type)) {
			if (!seen.has(leaf)) {
				seen.add(leaf);
				leaves.push(leaf);
			}
		}
	}

	return leaves;
}

export function findLeafByFile(app: App, file: TFile): WorkspaceLeaf | null {
	for (const leaf of collectAllLeaves(app)) {
		const leafFile = (leaf as LeafWithOptionalFileView).view?.file;
		if (leafFile?.path === file.path) {
			return leaf;
		}
	}

	return null;
}

export function revealLeaf(app: App, leaf: WorkspaceLeaf, focus = true): void {
	const workspace = app.workspace as WorkspaceCompat;

	try {
		if (typeof workspace.setActiveLeaf === "function") {
			try {
				workspace.setActiveLeaf(leaf, { focus });
			} catch {
				workspace.setActiveLeaf(leaf, focus);
			}
		}
	} catch {}

	try {
		const maybeRevealLeaf = workspace?.["revealLeaf"];
		if (typeof maybeRevealLeaf === "function") {
			void maybeRevealLeaf.call(workspace, leaf);
		}
	} catch {}
}

function resolveLinkFile(app: App, linkText: string, contextPath: string): TFile | null {
	const targetPath = getLinkTargetPath(linkText);
	if (!targetPath) return null;

	const linked = app.metadataCache.getFirstLinkpathDest(targetPath, contextPath);
	if (linked) return linked;

	const direct = app.vault.getAbstractFileByPath(targetPath);
	return direct instanceof TFile ? direct : null;
}

function resolveFile(app: App, fileOrPath: TFile | string): TFile | null {
	if (typeof fileOrPath !== "string") return fileOrPath;

	const abstractFile: TAbstractFile | null = app.vault.getAbstractFileByPath(fileOrPath);
	return abstractFile instanceof TFile ? abstractFile : null;
}

export async function openLinkWithExistingLeaf(
	app: App,
	linkText: string,
	contextPath: string,
	options: {
		openInNewTab?: boolean;
		focus?: boolean;
	} = {}
): Promise<WorkspaceLeaf | null> {
	const { openInNewTab = false, focus = true } = options;
	const targetFile = resolveLinkFile(app, linkText, contextPath);
	const hasSubpath = unwrapLinkText(linkText).includes("#");

	if (targetFile) {
		const existingLeaf = findLeafByFile(app, targetFile);
		if (existingLeaf) {
			revealLeaf(app, existingLeaf, focus);

			if (hasSubpath) {
				await app.workspace.openLinkText(linkText, targetFile.path, false, { active: focus });
			}

			return existingLeaf;
		}

		if (!hasSubpath) {
			return await openFileWithExistingLeaf(app, targetFile, {
				openInNewTab,
				focus,
			});
		}
	}

	await app.workspace.openLinkText(linkText, contextPath, openInNewTab ? "tab" : false, {
		active: focus,
	});
	return targetFile ? findLeafByFile(app, targetFile) : app.workspace.getMostRecentLeaf?.() ?? null;
}

export async function openFileWithExistingLeaf(
	app: App,
	fileOrPath: TFile | string,
	options: {
		openInNewTab?: boolean;
		focus?: boolean;
		openState?: Record<string, unknown>;
	} = {}
): Promise<WorkspaceLeaf | null> {
	const { openInNewTab = false, focus = true, openState } = options;
	const file = resolveFile(app, fileOrPath);
	if (!file) return null;

	const existingLeaf = findLeafByFile(app, file);
	if (existingLeaf) {
		revealLeaf(app, existingLeaf, focus);
		return existingLeaf;
	}

	const leaf = openInNewTab ? app.workspace.getLeaf("tab") : app.workspace.getLeaf(false);
	await leaf.openFile(file, { active: focus, state: openState });

	if (focus) {
		revealLeaf(app, leaf, focus);
	}

	return leaf;
}
