import type { App, WorkspaceLeaf } from "obsidian";
import { EPUB_RUNTIME } from "../services/epub-integration/epub-runtime";
import { epubActiveDocumentStore } from "../stores/epub-active-document-store";
import { irActiveDocumentStore } from "../stores/ir-active-document-store";

export type ActiveDocumentKind = "file" | "epub" | "ir";

const EPUB_VIEW_TYPES = new Set([
	EPUB_RUNTIME.viewTypes.reader,
	EPUB_RUNTIME.viewTypes.sidebar,
]);
const IR_VIEW_TYPES = new Set(["weave-ir-calendar-view"]);
const INTERNAL_WEAVE_VIEW_TYPES = new Set([
	"weave-view",
	"weave-study-view",
	"weave-question-bank-view",
	"weave-card-staging-view",
]);

export function getLeafFilePath(leaf?: WorkspaceLeaf | null): string | null {
	const view = leaf?.view as {
		file?: { path?: string };
		getState?: () => Record<string, unknown>;
	} | undefined;
	const directPath = view?.file?.path;
	if (typeof directPath === "string" && directPath.trim()) {
		return directPath;
	}

	const viewState = view?.getState?.();
	const serializedPath = viewState?.filePath || viewState?.file;
	if (typeof serializedPath === "string" && serializedPath.trim()) {
		return serializedPath;
	}

	return null;
}

export function getActiveDocumentFileName(path: string | null | undefined): string {
	if (!path) return "";
	const parts = path.split("/");
	return parts[parts.length - 1].replace(/\.md$/i, "");
}

/**
 * Tracks Obsidian's current external document (markdown / EPUB / IR source)
 * while ignoring Weave's own internal views.
 */
export class ActiveDocumentResolver {
	private lastExternalActiveDocument: string | null = null;
	private lastExternalDocumentKind: ActiveDocumentKind = "file";
	private trackedLeaf: WorkspaceLeaf | null = null;

	setTrackedLeaf(leaf: WorkspaceLeaf | null): void {
		this.trackedLeaf = leaf;
	}

	resolve(app: App, activeLeaf?: WorkspaceLeaf | null): string | null {
		const leaf = activeLeaf ?? app.workspace.getMostRecentLeaf?.() ?? null;
		if (!leaf) {
			return this.lastExternalActiveDocument;
		}

		if (this.trackedLeaf && leaf === this.trackedLeaf) {
			if (this.lastExternalDocumentKind === "epub") {
				return epubActiveDocumentStore.getActiveDocument() ?? this.lastExternalActiveDocument;
			}
			if (this.lastExternalDocumentKind === "ir") {
				return irActiveDocumentStore.getActiveDocument() ?? this.lastExternalActiveDocument;
			}
			return this.lastExternalActiveDocument;
		}

		const activeViewType = leaf.view?.getViewType?.() ?? "";
		const leafFilePath = getLeafFilePath(leaf);

		if (leafFilePath) {
			return this.rememberExternalDocument(leafFilePath, "file");
		}

		if (EPUB_VIEW_TYPES.has(activeViewType)) {
			const epubPath = epubActiveDocumentStore.getActiveDocument() ?? null;
			return epubPath
				? this.rememberExternalDocument(epubPath, "epub")
				: this.lastExternalActiveDocument;
		}

		if (IR_VIEW_TYPES.has(activeViewType)) {
			const irPath = irActiveDocumentStore.getActiveDocument() ?? null;
			return irPath
				? this.rememberExternalDocument(irPath, "ir")
				: this.lastExternalActiveDocument;
		}

		if (INTERNAL_WEAVE_VIEW_TYPES.has(activeViewType)) {
			return this.lastExternalActiveDocument;
		}

		const activeFile = app.workspace.getActiveFile();
		return this.rememberExternalDocument(activeFile?.path ?? null, "file");
	}

	getLastResolvedDocument(): string | null {
		return this.lastExternalActiveDocument;
	}

	private rememberExternalDocument(
		path: string | null,
		kind: ActiveDocumentKind
	): string | null {
		if (path) {
			this.lastExternalActiveDocument = path;
			this.lastExternalDocumentKind = kind;
		}
		return path;
	}
}

let sharedActiveDocumentResolver: ActiveDocumentResolver | null = null;

export function getSharedActiveDocumentResolver(): ActiveDocumentResolver {
	if (!sharedActiveDocumentResolver) {
		sharedActiveDocumentResolver = new ActiveDocumentResolver();
	}
	return sharedActiveDocumentResolver;
}

export function resolveCurrentActiveDocument(
	app: App,
	activeLeaf?: WorkspaceLeaf | null
): string | null {
	return getSharedActiveDocumentResolver().resolve(app, activeLeaf);
}
