import type { App, TFile } from "obsidian";
import { isCallable, readUnknownProperty } from "./dynamic-access";
import { getFileBackedViewPath } from "./obsidian-markdown-editor";
import { isRecord } from "./typed-json";

export interface PdfOutlineItem {
	title: string;
	pageNumber: number;
	path: string[];
}

interface PdfOutlineDocumentLike {
	getOutline(): Promise<unknown>;
	getDestination?(dest: string): Promise<unknown>;
	getPageIndex(ref: unknown): Promise<number>;
	destroy?(): Promise<void> | void;
}

type PdfJsLoadingTask = {
	promise: Promise<PdfOutlineDocumentLike>;
	destroy?: () => Promise<void> | void;
};

export interface GetPdfOutlineForFileOptions {
	includeEntriesWithoutPage?: boolean;
	preferOpenView?: boolean;
	directLoadTimeoutMs?: number;
	maxDirectLoadFileSizeBytes?: number;
}

export const DEFAULT_PDF_OUTLINE_DIRECT_LOAD_TIMEOUT_MS = 20_000;
export const DEFAULT_PDF_OUTLINE_BINARY_SIZE_LIMIT_BYTES = 128 * 1024 * 1024;

function asPdfOutlineDocument(value: unknown): PdfOutlineDocumentLike | null {
	if (!isRecord(value) || typeof value.getOutline !== "function") {
		return null;
	}
	return value as PdfOutlineDocumentLike;
}

function extractPdfDocumentFromView(view: unknown): PdfOutlineDocumentLike | null {
	const viewer = readUnknownProperty(view, "viewer");
	const pdfViewer = readUnknownProperty(view, "pdfViewer") ?? readUnknownProperty(viewer, "pdfViewer");
	return (
		asPdfOutlineDocument(readUnknownProperty(pdfViewer, "pdfDocument")) ||
		asPdfOutlineDocument(readUnknownProperty(viewer, "pdfDocument")) ||
		asPdfOutlineDocument(readUnknownProperty(view, "pdfDocument"))
	);
}

export function getOpenWorkspacePdfDocument(app: App, filePath: string): PdfOutlineDocumentLike | null {
	try {
		for (const leaf of app.workspace.getLeavesOfType("pdf")) {
			const view = leaf.view;
			if (getFileBackedViewPath(view) !== filePath) {
				continue;
			}
			const pdfDocument = extractPdfDocumentFromView(view);
			if (pdfDocument) {
				return pdfDocument;
			}
		}

		const recentView = app.workspace.getMostRecentLeaf()?.view;
		if (getFileBackedViewPath(recentView) === filePath) {
			return extractPdfDocumentFromView(recentView);
		}
	} catch {
		return null;
	}

	return null;
}

async function resolvePdfOutlinePageNumber(
	pdfDocument: PdfOutlineDocumentLike,
	item: unknown
): Promise<number> {
	const dest = isRecord(item) ? item.dest : undefined;
	if (!dest) {
		return 0;
	}

	try {
		const destArray = typeof dest === "string" ? await pdfDocument.getDestination?.(dest) : dest;
		if (!Array.isArray(destArray) || destArray.length === 0) {
			return 0;
		}

		const pageIndex = await pdfDocument.getPageIndex(destArray[0]);
		return typeof pageIndex === "number" && !Number.isNaN(pageIndex) ? pageIndex + 1 : 0;
	} catch {
		return 0;
	}
}

export async function extractPdfOutlineFromDocument(
	pdfDocument: PdfOutlineDocumentLike,
	options: Pick<GetPdfOutlineForFileOptions, "includeEntriesWithoutPage"> = {}
): Promise<PdfOutlineItem[]> {
	const includeEntriesWithoutPage = options.includeEntriesWithoutPage ?? true;

	let outline: unknown;
	try {
		outline = await pdfDocument.getOutline();
	} catch {
		return [];
	}

	if (!Array.isArray(outline) || outline.length === 0) {
		return [];
	}

	const results: PdfOutlineItem[] = [];

	const walk = async (items: unknown[], ancestors: string[]) => {
		for (const item of items) {
			const title =
				isRecord(item) && typeof item.title === "string" ? item.title.trim() || "目录" : "目录";
			const nextPath = [...ancestors, title];
			const pageNumber = await resolvePdfOutlinePageNumber(pdfDocument, item);

			if (includeEntriesWithoutPage || pageNumber > 0) {
				results.push({ title, pageNumber, path: nextPath });
			}

			const children = isRecord(item) ? item.items ?? item.children : undefined;
			if (Array.isArray(children) && children.length > 0) {
				await walk(children, nextPath);
			}
		}
	};

	await walk(outline, []);
	return results;
}

async function loadPdfDocumentFromBinary(
	app: App,
	pdfFile: TFile,
	timeoutMs: number
): Promise<{ pdfDocument: PdfOutlineDocumentLike; cleanup: () => Promise<void> } | null> {
	const pdfjsLib = readUnknownProperty(window, "pdfjsLib");
	const getDocument = readUnknownProperty(pdfjsLib, "getDocument");
	if (!isCallable(getDocument)) {
		return null;
	}

	let loadingTask: PdfJsLoadingTask | null = null;
	try {
		const arrayBuffer = await app.vault.readBinary(pdfFile);
		loadingTask = Reflect.apply(getDocument, pdfjsLib, [
			{ data: new Uint8Array(arrayBuffer) },
		]) as PdfJsLoadingTask;
		const pdfDocument = await Promise.race([
			loadingTask.promise,
			new Promise<never>((_, reject) =>
				window.setTimeout(() => reject(new Error("PDF load timeout")), timeoutMs)
			),
		]);

		return {
			pdfDocument,
			cleanup: async () => {
				try {
					await Promise.resolve(pdfDocument.destroy?.());
				} catch { /* no-op */ }
				try {
					await Promise.resolve(loadingTask?.destroy?.());
				} catch { /* no-op */ }
			},
		};
	} catch {
		try {
			await Promise.resolve(loadingTask?.destroy?.());
		} catch { /* no-op */ }
		return null;
	}
}

export async function getPdfOutlineForFile(
	app: App,
	pdfFile: TFile,
	options: GetPdfOutlineForFileOptions = {}
): Promise<PdfOutlineItem[]> {
	const includeEntriesWithoutPage = options.includeEntriesWithoutPage ?? true;
	const preferOpenView = options.preferOpenView ?? true;
	const directLoadTimeoutMs = options.directLoadTimeoutMs ?? DEFAULT_PDF_OUTLINE_DIRECT_LOAD_TIMEOUT_MS;
	const maxDirectLoadFileSizeBytes =
		options.maxDirectLoadFileSizeBytes ?? DEFAULT_PDF_OUTLINE_BINARY_SIZE_LIMIT_BYTES;

	if (preferOpenView) {
		const openPdfDocument = getOpenWorkspacePdfDocument(app, pdfFile.path);
		if (openPdfDocument) {
			const items = await extractPdfOutlineFromDocument(openPdfDocument, {
				includeEntriesWithoutPage,
			});
			if (items.length > 0) {
				return items;
			}
		}
	}

	const fileSize = Number(pdfFile.stat?.size ?? 0);
	if (
		Number.isFinite(maxDirectLoadFileSizeBytes) &&
		maxDirectLoadFileSizeBytes > 0 &&
		fileSize > maxDirectLoadFileSizeBytes
	) {
		return [];
	}

	const loadedPdf = await loadPdfDocumentFromBinary(app, pdfFile, directLoadTimeoutMs);
	if (!loadedPdf) {
		return [];
	}

	try {
		return await extractPdfOutlineFromDocument(loadedPdf.pdfDocument, {
			includeEntriesWithoutPage,
		});
	} finally {
		await loadedPdf.cleanup();
	}
}
