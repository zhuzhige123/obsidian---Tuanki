import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import { EpubStorageService } from "../services/epub-integration";
import { EPUB_RUNTIME } from "../services/epub-integration/epub-runtime";
import { isSupportedBookPath } from "../services/epub-integration/book-format";
import { epubActiveDocumentStore } from "../stores/epub-active-document-store";
import { isCallable, readUnknownProperty } from "./dynamic-access";
import { isRecord } from "./typed-json";
import { getLeafLocation } from "./view-location-utils";
import { revealLeaf } from "./workspace-navigation";

const KNOWN_EPUB_VIEW_TYPES = Array.from(
	new Set([
		EPUB_RUNTIME.viewTypes.reader,
		"weave-epub-reader",
		"weave-epub-reader-standalone",
	])
);

function isCenterLeaf(leaf: WorkspaceLeaf | null | undefined): leaf is WorkspaceLeaf {
	return !!leaf && getLeafLocation(leaf) === "center";
}

function readRegistryMapValue(source: unknown, key: string): unknown {
	if (!source) {
		return undefined;
	}
	const getter = readUnknownProperty(source, "get");
	if (isCallable(getter)) {
		return Reflect.apply(getter, source, [key]);
	}
	if (isRecord(source)) {
		return source[key];
	}
	return undefined;
}

function readRegisteredViewTypeForExtension(app: App, extension: string): string | null {
	const normalizedExtension = String(extension || "").trim().toLowerCase();
	if (!normalizedExtension) {
		return null;
	}
	const registry = readUnknownProperty(app, "viewRegistry");
	const typeByExtension = readUnknownProperty(registry, "typeByExtension");
	const viewType = readRegistryMapValue(typeByExtension, normalizedExtension);
	return typeof viewType === "string" && viewType.trim().length > 0 ? viewType : null;
}

function isRegisteredViewType(app: App, viewType: string): boolean {
	const registry = readUnknownProperty(app, "viewRegistry");
	if (!registry || !viewType) {
		return false;
	}
	const creators =
		readUnknownProperty(registry, "viewByType") ??
		readUnknownProperty(registry, "viewCreators") ??
		readUnknownProperty(registry, "views");
	const creator = readRegistryMapValue(creators, viewType);
	return creator !== undefined && creator !== null;
}

export function getAllOpenEpubLeaves(app: App): WorkspaceLeaf[] {
	const leaves = new Set<WorkspaceLeaf>();
	for (const viewType of KNOWN_EPUB_VIEW_TYPES) {
		for (const leaf of app.workspace.getLeavesOfType(viewType)) {
			leaves.add(leaf);
		}
	}
	return Array.from(leaves);
}

export function getOpenEpubFilePath(leaf: WorkspaceLeaf | null | undefined): string {
	if (!leaf) {
		return "";
	}
	try {
		const view = leaf.view as {
			getCurrentFilePath?: () => string;
			getState?: () => Record<string, unknown>;
		};
		const fromView = typeof view?.getCurrentFilePath === "function" ? view.getCurrentFilePath() : "";
		if (typeof fromView === "string" && fromView.trim()) {
			return fromView;
		}
		const state = leaf.getViewState?.()?.state ?? view?.getState?.() ?? {};
		const filePath = typeof state?.filePath === "string" ? state.filePath : "";
		if (filePath.trim()) {
			return filePath;
		}
		const file = typeof state?.file === "string" ? state.file : "";
		return file.trim();
	} catch {
		return "";
	}
}

export function resolveRegisteredEpubViewType(app: App, filePath?: string): string | null {
	const extension = String(filePath || "").split(".").pop() || "";
	const mappedViewType = readRegisteredViewTypeForExtension(app, extension);
	if (mappedViewType && KNOWN_EPUB_VIEW_TYPES.includes(mappedViewType)) {
		return mappedViewType;
	}
	for (const viewType of KNOWN_EPUB_VIEW_TYPES) {
		if (isRegisteredViewType(app, viewType)) {
			return viewType;
		}
	}
	return null;
}

function isExistingEpubPath(app: App, filePath: string | null | undefined): filePath is string {
	if (!filePath) {
		return false;
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	return file instanceof TFile && isSupportedBookPath(file.path);
}

export function findOpenEpubLeaf(app: App, filePath?: string): WorkspaceLeaf | null {
	const leaves = getAllOpenEpubLeaves(app);

	if (filePath) {
		const matchedLeaf = leaves.find((leaf) => {
			return getOpenEpubFilePath(leaf) === filePath;
		});
		return matchedLeaf ?? null;
	}

	return leaves.find((leaf) => isCenterLeaf(leaf)) ?? leaves[0] ?? null;
}

export function getPreferredEpubLeaf(app: App, filePath?: string): WorkspaceLeaf | null {
	const matchedEpubLeaf = findOpenEpubLeaf(app, filePath);
	if (matchedEpubLeaf) {
		return matchedEpubLeaf;
	}

	if (filePath) {
		return app.workspace.getLeaf("tab");
	}

	const activeLeaf = app.workspace.getMostRecentLeaf?.() ?? null;
	if (isCenterLeaf(activeLeaf)) {
		return activeLeaf;
	}

	const recentLeaf = app.workspace.getMostRecentLeaf?.();
	if (isCenterLeaf(recentLeaf)) {
		return recentLeaf;
	}

	const markdownLeaf = app.workspace.getLeavesOfType("markdown").find((leaf) => isCenterLeaf(leaf));
	if (markdownLeaf) {
		return markdownLeaf;
	}

	const fallbackLeaf = app.workspace.getLeaf(false);
	if (isCenterLeaf(fallbackLeaf)) {
		return fallbackLeaf;
	}

	return app.workspace.getLeaf("tab");
}

export async function openEpubInPreferredLeaf(
	app: App,
	filePath: string,
	state: Record<string, unknown> = {}
): Promise<WorkspaceLeaf | null> {
	const viewType = resolveRegisteredEpubViewType(app, filePath);
	if (!viewType) {
		return null;
	}
	const leaf = getPreferredEpubLeaf(app, filePath);
	if (!leaf) {
		return null;
	}

	await leaf.setViewState({
		type: viewType,
		active: true,
		state: {
			filePath,
			...state,
		},
	});
	revealLeaf(app, leaf);
	return leaf;
}

export async function resolveRecentEpubPath(app: App): Promise<string | null> {
	const activePath = epubActiveDocumentStore.getActiveDocument();
	if (isExistingEpubPath(app, activePath)) {
		return activePath;
	}

	const openLeafPath = getAllOpenEpubLeaves(app)
		.map((leaf) => {
			return getOpenEpubFilePath(leaf);
		})
		.find((path) => isExistingEpubPath(app, path));
	if (openLeafPath) {
		return openLeafPath;
	}

	try {
		const storageService = new EpubStorageService(app);
		const recentBook = Object.values(await storageService.loadBooks())
			.filter((book) => isExistingEpubPath(app, book.filePath))
			.sort((a, b) => {
				const timeA = Number.isFinite(a.readingStats?.lastReadTime) ? a.readingStats.lastReadTime : 0;
				const timeB = Number.isFinite(b.readingStats?.lastReadTime) ? b.readingStats.lastReadTime : 0;
				if (timeA !== timeB) {
					return timeB - timeA;
				}
				return a.filePath.localeCompare(b.filePath, "zh-CN");
			})[0];

		return recentBook?.filePath ?? null;
	} catch {
		return null;
	}
}
