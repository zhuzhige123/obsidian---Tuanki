import type { App } from "obsidian";
import { Notice } from "obsidian";
import { DirectoryUtils } from "../../utils/directory-utils";
import { i18n } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import { EpubLinkService } from "./EpubLinkService";

export interface ScreenshotRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface EpubVisibleFrameLike {
	document?: Document;
	window?: Window;
}

export class EpubScreenshotService {
	private app: App;
	private linkService: EpubLinkService;

	constructor(app: App) {
		this.app = app;
		this.linkService = new EpubLinkService(app);
	}

	async captureFromCanvas(
		sourceEl: HTMLElement,
		rect: ScreenshotRect,
		visibleFrames?: EpubVisibleFrameLike[]
	): Promise<Blob | null> {
		try {
			const blob = await this.captureWithElectron(sourceEl, rect);
			if (blob) return blob;

			return await this.captureWithSvgCanvas(sourceEl, rect, visibleFrames);
		} catch (e) {
			logger.error("[EpubScreenshotService] captureFromCanvas failed:", e);
			return null;
		}
	}

	private async captureWithElectron(
		sourceEl: HTMLElement,
		rect: ScreenshotRect
	): Promise<Blob | null> {
		try {
			const remote = this.getElectronRemote();
			if (!remote) return null;

			const win = remote.getCurrentWindow();
			if (!win?.webContents?.capturePage) return null;

			const sourceRect = sourceEl.getBoundingClientRect();
			const nativeImage = await win.webContents.capturePage({
				x: Math.round(sourceRect.left + rect.x),
				y: Math.round(sourceRect.top + rect.y),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
			});

			if (nativeImage.isEmpty()) return null;

			const buffer = nativeImage.toJPEG(92);
			return new Blob([buffer], { type: "image/jpeg" });
		} catch (e) {
			logger.warn("[EpubScreenshotService] Electron capture failed:", e);
			return null;
		}
	}

	private getElectronRemote(): any {
		try {
			// /skip require('electron') is needed for desktop-only screenshot capture via webContents, wrapped in try/catch for mobile safety
			const electron = (window as any).require("electron");
			if (electron.remote) return electron.remote;
		} catch (_) {
			/* not available */
		}
		try {
			return (window as any).require("@electron/remote");
		} catch (_) {
			/* not available */
		}
		return null;
	}

	private async captureWithSvgCanvas(
		sourceEl: HTMLElement,
		rect: ScreenshotRect,
		visibleFrames?: EpubVisibleFrameLike[]
	): Promise<Blob | null> {
		try {
			const canvas = document.createElement("canvas");
			const dpr = window.devicePixelRatio || 1;
			canvas.width = rect.width * dpr;
			canvas.height = rect.height * dpr;

			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			ctx.scale(dpr, dpr);

			ctx.fillStyle = getComputedStyle(sourceEl).backgroundColor || "#ffffff";
			ctx.fillRect(0, 0, rect.width, rect.height);

			const iframes = this.getVisibleIframes(sourceEl, visibleFrames);
			for (const iframe of iframes) {
				try {
					const iframeDoc = iframe.contentDocument;
					if (!iframeDoc) continue;

					const iframeRect = iframe.getBoundingClientRect();
					const sourceRect = sourceEl.getBoundingClientRect();

					const relX = iframeRect.left - sourceRect.left;
					const relY = iframeRect.top - sourceRect.top;

					const overlapX = Math.max(rect.x, relX);
					const overlapY = Math.max(rect.y, relY);
					const overlapRight = Math.min(rect.x + rect.width, relX + iframeRect.width);
					const overlapBottom = Math.min(rect.y + rect.height, relY + iframeRect.height);

					if (overlapRight <= overlapX || overlapBottom <= overlapY) continue;

					const body = iframeDoc.body;
					const cloned = body.cloneNode(true) as HTMLElement;

					const styles = Array.from(iframeDoc.querySelectorAll('style, link[rel="stylesheet"]'));
					let styleText = "";
					for (const s of styles) {
						if (s instanceof HTMLStyleElement) {
							styleText += s.textContent || "";
						}
					}

					const svgWidth = overlapRight - overlapX;
					const svgHeight = overlapBottom - overlapY;
					const offsetX = -(overlapX - relX);
					const offsetY = -(overlapY - relY);

					const svgString = `
						<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
							<foreignObject width="${iframeRect.width}" height="${iframeRect.height}" x="${offsetX}" y="${offsetY}">
								<div xmlns="http://www.w3.org/1999/xhtml">
									<style>${styleText}</style>
									${cloned.outerHTML}
								</div>
							</foreignObject>
						</svg>
					`;

					const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
					const url = URL.createObjectURL(blob);
					const img = new Image();

					await new Promise<void>((resolve) => {
						img.onload = () => {
							ctx.drawImage(img, overlapX - rect.x, overlapY - rect.y, svgWidth, svgHeight);
							URL.revokeObjectURL(url);
							resolve();
						};
						img.onerror = () => {
							URL.revokeObjectURL(url);
							resolve();
						};
						img.src = url;
					});
				} catch (e) {
					logger.warn("[EpubScreenshotService] iframe capture failed:", e);
				}
			}

			return new Promise((resolve) => {
				canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
			});
		} catch (e) {
			logger.error("[EpubScreenshotService] SVG canvas capture failed:", e);
			return null;
		}
	}

	async saveAsJpeg(blob: Blob, bookTitle: string): Promise<string> {
		const sanitizedTitle = bookTitle
			.replace(/[\\/:*?"<>|]/g, "_")
			.substring(0, 30)
			.trim();
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
		const fileName = `epub-${sanitizedTitle}-${timestamp}.jpg`;

		const attachmentFolder = (this.app.vault as any).getConfig?.("attachmentFolderPath") || "";
		let folderPath = attachmentFolder || "";

		if (!folderPath || folderPath === "/" || folderPath === ".") {
			folderPath = "";
		}

		const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;

		const adapter = this.app.vault.adapter;
		if (folderPath) {
			await DirectoryUtils.ensureDirRecursive(adapter, folderPath);
		}

		const arrayBuffer = await blob.arrayBuffer();
		await adapter.writeBinary(fullPath, new Uint8Array(arrayBuffer) as any);

		new Notice(i18n.t("views.epubView.notice.screenshotSaved", { fileName }));
		return fullPath;
	}

	extractTextFromRect(
		sourceEl: HTMLElement,
		rect: ScreenshotRect,
		visibleFrames?: EpubVisibleFrameLike[]
	): string {
		try {
			const extractedFrames: string[] = [];

			for (const iframe of this.getVisibleIframes(sourceEl, visibleFrames)) {
				try {
					const frameText = this.extractTextFromIframe(sourceEl, rect, iframe);
					if (frameText) {
						extractedFrames.push(frameText);
					}
				} catch (_e) {
					/* cross-origin or transient frame access */
				}
			}

			return extractedFrames.join(" ").replace(/\s+/g, " ").trim();
		} catch (e) {
			logger.warn("[EpubScreenshotService] extractTextFromRect failed:", e);
			return "";
		}
	}

	private extractTextFromIframe(
		sourceEl: HTMLElement,
		rect: ScreenshotRect,
		iframeEl: HTMLIFrameElement
	): string {
		const targetDoc = iframeEl.contentDocument;
		if (!targetDoc?.body) return "";

		const sourceRect = sourceEl.getBoundingClientRect();
		const iframeRect = iframeEl.getBoundingClientRect();
		const relX = iframeRect.left - sourceRect.left;
		const relY = iframeRect.top - sourceRect.top;
		const overlapX = Math.max(rect.x, relX);
		const overlapY = Math.max(rect.y, relY);
		const overlapRight = Math.min(rect.x + rect.width, relX + iframeRect.width);
		const overlapBottom = Math.min(rect.y + rect.height, relY + iframeRect.height);

		if (overlapRight <= overlapX || overlapBottom <= overlapY) {
			return "";
		}

		const iframeX = sourceRect.left + overlapX - iframeRect.left;
		const iframeY = sourceRect.top + overlapY - iframeRect.top;
		const iframeRight = sourceRect.left + overlapRight - iframeRect.left;
		const iframeBottom = sourceRect.top + overlapBottom - iframeRect.top;

		const walker = targetDoc.createTreeWalker(targetDoc.body, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const extractedParts: string[] = [];
		let currentNode = walker.nextNode();
		while (currentNode) {
			const textNode = currentNode as Text;
			const range = targetDoc.createRange();
			range.selectNodeContents(textNode);

			const intersectsRect = Array.from(range.getClientRects()).some(
				(clientRect) =>
					clientRect.right > iframeX &&
					clientRect.left < iframeRight &&
					clientRect.bottom > iframeY &&
					clientRect.top < iframeBottom
			);

			if (intersectsRect) {
				const normalizedText = textNode.textContent?.replace(/\s+/g, " ").trim();
				if (normalizedText) {
					extractedParts.push(normalizedText);
				}
			}

			range.detach?.();
			currentNode = walker.nextNode();
		}

		const extractedText = extractedParts.join(" ").replace(/\s+/g, " ").trim();
		if (extractedText) {
			return extractedText;
		}

		const sel = iframeEl.contentWindow?.getSelection?.();
		if (sel) {
			sel.removeAllRanges();
		}

		return "";
	}

	private getVisibleIframes(
		sourceEl: HTMLElement,
		visibleFrames?: EpubVisibleFrameLike[]
	): HTMLIFrameElement[] {
		const discovered = new Set<HTMLIFrameElement>();
		const pushFrame = (frame: HTMLIFrameElement | null | undefined) => {
			if (frame instanceof HTMLIFrameElement) {
				discovered.add(frame);
			}
		};

		for (const frameLike of visibleFrames || []) {
			pushFrame((frameLike.window?.frameElement as HTMLIFrameElement | null) || null);
			pushFrame(
				(frameLike.document?.defaultView?.frameElement as HTMLIFrameElement | null) || null
			);
		}

		for (const iframe of Array.from(sourceEl.querySelectorAll("iframe"))) {
			pushFrame(iframe);
		}

		return Array.from(discovered);
	}

	buildSnapshotEmbed(
		filePath: string,
		cfi: string,
		extractedText: string,
		chapterIndex?: number,
		chapterTitle?: string,
		sourcePath?: string
	): string {
		const link = this.linkService.buildEpubLink(
			filePath,
			cfi,
			extractedText,
			chapterIndex,
			chapterTitle,
			sourcePath
		);
		if (!extractedText) {
			return `> [!EPUB|] ${link}\n`;
		}
		const quotedLines = extractedText
			.split("\n")
			.map((_line) => `> ${_line}`)
			.join("\n");
		return `> [!EPUB|] ${link}\n${quotedLines}\n`;
	}

	buildJpegInsert(
		imagePath: string,
		filePath: string,
		cfi: string,
		chapterIndex?: number,
		chapterTitle?: string,
		sourcePath?: string
	): string {
		const link = this.linkService.buildEpubLink(
			filePath,
			cfi,
			"screenshot",
			chapterIndex,
			chapterTitle,
			sourcePath
		);
		return `> [!EPUB|] ${link}\n> ![[${imagePath}]]\n`;
	}
}
