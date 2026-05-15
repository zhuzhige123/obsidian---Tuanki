import type { App, TFile } from "obsidian";

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

export interface GetPdfOutlineForFileOptions {
	includeEntriesWithoutPage?: boolean;
	preferOpenView?: boolean;
	directLoadTimeoutMs?: number;
	maxDirectLoadFileSizeBytes?: number;
}

export const DEFAULT_PDF_OUTLINE_DIRECT_LOAD_TIMEOUT_MS = 20_000;
export const DEFAULT_PDF_OUTLINE_BINARY_SIZE_LIMIT_BYTES = 128 * 1024 * 1024;

function extractPdfDocumentFromView(view: any): PdfOutlineDocumentLike | null {
	const pdfDocument =
		view?.viewer?.pdfViewer?.pdfDocument
		|| view?.pdfViewer?.pdfDocument
		|| view?.viewer?.pdfDocument
		|| view?.pdfDocument;

	return typeof pdfDocument?.getOutline === "function" ? (pdfDocument as PdfOutlineDocumentLike) : null;
}

export function getOpenWorkspacePdfDocument(app: App, filePath: string): PdfOutlineDocumentLike | null {
	const workspaceAny = app.workspace as any;

	try {
		const leaves = workspaceAny?.getLeavesOfType?.("pdf") || [];
		for (const leaf of leaves) {
			const view = leaf?.view;
			if (view?.file?.path !== filePath) {
				continue;
			}

			const pdfDocument = extractPdfDocumentFromView(view);
			if (pdfDocument) {
				return pdfDocument;
			}
		}

		const recentView = workspaceAny?.getMostRecentLeaf?.()?.view;
		if (recentView?.file?.path === filePath) {
			return extractPdfDocumentFromView(recentView);
		}
	} catch {
		return null;
	}

	return null;
}

async function resolvePdfOutlinePageNumber(
	pdfDocument: PdfOutlineDocumentLike,
	item: any
): Promise<number> {
	const dest = item?.dest;
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

	const walk = async (items: any[], ancestors: string[]) => {
		for (const item of items) {
			const title = String(item?.title || "").trim() || "目录";
			const nextPath = [...ancestors, title];
			const pageNumber = await resolvePdfOutlinePageNumber(pdfDocument, item);

			if (includeEntriesWithoutPage || pageNumber > 0) {
				results.push({ title, pageNumber, path: nextPath });
			}

			const children = item?.items ?? item?.children;
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
	const pdfjsLib = (window as any).pdfjsLib;
	if (!pdfjsLib?.getDocument) {
		return null;
	}

	let loadingTask: any = null;
	try {
		const arrayBuffer = await (app.vault as any).readBinary(pdfFile);
		loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
		const pdfDocument = await Promise.race([
			loadingTask.promise,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PDF load timeout")), timeoutMs)),
		]);

		return {
			pdfDocument,
			cleanup: async () => {
				try {
					await Promise.resolve(pdfDocument?.destroy?.());
				} catch {}
				try {
					await Promise.resolve(loadingTask?.destroy?.());
				} catch {}
			},
		};
	} catch {
		try {
			await Promise.resolve(loadingTask?.destroy?.());
		} catch {}
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
		Number.isFinite(maxDirectLoadFileSizeBytes)
		&& maxDirectLoadFileSizeBytes > 0
		&& fileSize > maxDirectLoadFileSizeBytes
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
