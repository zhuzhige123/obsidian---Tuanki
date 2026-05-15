import { type App, type Editor, MarkdownView, Notice, type WorkspaceLeaf } from "obsidian";
import {
	openFileWithExistingLeaf,
	openLinkWithExistingLeaf,
} from "../../utils/workspace-navigation";
import { getSourceLocateOverlayService } from "./SourceLocateOverlayService";
import {
	buildSourceLocateTimestampCandidates,
	EPUB_LOCATE_CFI_PREFIX,
	EPUB_LOCATE_EXCERPT_PREFIX,
	EPUB_LOCATE_LINK_PREFIX,
	EPUB_LOCATE_TIME_PREFIX,
	isDescriptiveSourceLocateTextCandidate,
	normalizeSourceLocateMatchValue,
	parseTaggedSourceLocateCandidates,
} from "./source-locate-candidates";

interface LocateOptions {
	label?: string;
	icon?: string;
	delayMs?: number;
	openInNewTab?: boolean;
	focus?: boolean;
	fallbackEl?: HTMLElement | null;
	nodeRect?: {
		x: number;
		y: number;
		width?: number;
		height?: number;
	} | null;
}

const DEFAULT_LABEL = "定位到溯源位置";
const DEFAULT_ICON = "map-pinned";

interface EditorLocateCandidates {
	textCandidates: string[];
	epubLinkCandidates: string[];
	epubCfiCandidates: string[];
	excerptCandidates: string[];
	timestampCandidates: string[];
	hasEpubTarget: boolean;
}

export class SourceNavigationService {
	private readonly overlay = getSourceLocateOverlayService();
	private readonly markdownLocateRetryDelayMs = 180;
	private readonly markdownLocateMaxAttempts = 6;
	private readonly markdownOverlayRetryDelayMs = 90;
	private readonly markdownOverlayMaxAttempts = 8;

	constructor(private readonly app: App) {}

	async locateInMarkdownView(
		view: MarkdownView | any,
		candidates: string[],
		options: LocateOptions = {}
	): Promise<boolean> {
		if (!view?.containerEl) return false;

		const target = this.overlay.findMarkdownLocateTarget(view.containerEl as HTMLElement, candidates);
		if (!target) {
			const editor = view?.editor as Editor | undefined;
			if (!editor || !this.locateInMarkdownEditor(editor, candidates)) {
				return false;
			}
			this.showMarkdownOverlayFromViewWithRetry(view, candidates, options, 0);
			return true;
		}

		try {
			target.scrollTarget.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
		} catch (_e) {
			/* ignore */
		}

		this.showMarkdownOverlayWithRetry(view, candidates, options, target, 0);

		return true;
	}

	private showMarkdownOverlayFromViewWithRetry(
		view: MarkdownView | any,
		candidates: string[],
		options: LocateOptions,
		attempt: number
	): void {
		const delay = attempt === 0 ? 60 : this.markdownOverlayRetryDelayMs;
		window.setTimeout(() => {
			try {
				const containerEl = view?.containerEl as HTMLElement | undefined;
				const target = containerEl ? this.overlay.findMarkdownLocateTarget(containerEl, candidates) : null;
				if (target) {
					const shown = this.overlay.showAtRect(target.overlayRect, {
						label: options.label || DEFAULT_LABEL,
						icon: options.icon || DEFAULT_ICON,
					});
					if (shown) {
						return;
					}
				}
			} catch (_e) {
				/* ignore */
			}
			if (attempt + 1 < this.markdownOverlayMaxAttempts) {
				this.showMarkdownOverlayFromViewWithRetry(view, candidates, options, attempt + 1);
			}
		}, delay);
	}

	private showMarkdownOverlayWithRetry(
		view: MarkdownView | any,
		candidates: string[],
		options: LocateOptions,
		fallbackTarget: { overlayRect: DOMRect; scrollTarget: HTMLElement },
		attempt: number
	): void {
		const delay = attempt === 0 ? 40 : this.markdownOverlayRetryDelayMs;
		window.setTimeout(() => {
			try {
				const containerEl = view?.containerEl as HTMLElement | undefined;
				const latestTarget =
					(containerEl
						? this.overlay.findMarkdownLocateTarget(containerEl, candidates)
						: null) || fallbackTarget;
				if (!latestTarget) {
					if (attempt + 1 < this.markdownOverlayMaxAttempts) {
						this.showMarkdownOverlayWithRetry(view, candidates, options, fallbackTarget, attempt + 1);
					}
					return;
				}

				const shown = this.overlay.showAtRect(latestTarget.overlayRect, {
					label: options.label || DEFAULT_LABEL,
					icon: options.icon || DEFAULT_ICON,
				});
				if (shown) {
					return;
				}

				if (attempt + 1 < this.markdownOverlayMaxAttempts) {
					this.showMarkdownOverlayWithRetry(view, candidates, options, latestTarget, attempt + 1);
				}
			} catch (_e) {
				if (attempt + 1 < this.markdownOverlayMaxAttempts) {
					this.showMarkdownOverlayWithRetry(view, candidates, options, fallbackTarget, attempt + 1);
				}
			}
		}, delay);
	}

	locateOpenedMarkdownLeaf(
		openedLeaf: WorkspaceLeaf | null,
		candidates: string[],
		options: LocateOptions = {}
	): void {
		this.locateOpenedMarkdownLeafWithRetry(openedLeaf, candidates, options, 0);
	}

	private locateOpenedMarkdownLeafWithRetry(
		openedLeaf: WorkspaceLeaf | null,
		candidates: string[],
		options: LocateOptions,
		attempt: number
	): void {
		const delay = attempt === 0 ? options.delayMs ?? 220 : this.markdownLocateRetryDelayMs;
		window.setTimeout(async () => {
			try {
				const activeView = (
					openedLeaf?.view?.getViewType?.() === "markdown"
						? openedLeaf.view
						: this.app.workspace.getActiveViewOfType("markdown" as any)
				) as any;
				const located = activeView
					? await this.locateInMarkdownView(activeView, candidates, options)
					: false;
				if (located) return;

				if (attempt + 1 < this.markdownLocateMaxAttempts) {
					this.locateOpenedMarkdownLeafWithRetry(openedLeaf, candidates, options, attempt + 1);
					return;
				}

				if (!activeView?.containerEl && options.fallbackEl) {
					this.overlay.showAtRect(options.fallbackEl.getBoundingClientRect(), {
						label: options.label || DEFAULT_LABEL,
						icon: options.icon || DEFAULT_ICON,
					});
					return;
				}

				new Notice("已打开源文档，但未精确定位到溯源内容");
			} catch (_e) {
				/* ignore */
			}
		}, delay);
	}

	async openMarkdownLinkAndLocate(
		linkText: string,
		contextPath: string,
		candidates: string[],
		options: LocateOptions = {}
	): Promise<WorkspaceLeaf | null> {
		const openedLeaf = await openLinkWithExistingLeaf(this.app, linkText, contextPath, {
			openInNewTab: options.openInNewTab ?? true,
			focus: options.focus ?? true,
		});
		this.locateOpenedMarkdownLeaf(openedLeaf, candidates, options);
		return openedLeaf;
	}

	async openCanvasAndLocate(
		canvasPath: string,
		candidates: string[],
		nodeId?: string,
		options: LocateOptions = {}
	): Promise<WorkspaceLeaf | null> {
		let canvasLeaf =
			this.app.workspace.getLeavesOfType("canvas").find((leaf) => {
				return (leaf.view as any)?.file?.path === canvasPath;
			}) || null;

		if (!canvasLeaf) {
			canvasLeaf = await openFileWithExistingLeaf(this.app, canvasPath, {
				openInNewTab: options.openInNewTab ?? true,
				focus: options.focus ?? true,
			});
		}
		if (!canvasLeaf) return null;

		this.app.workspace.setActiveLeaf(canvasLeaf, { focus: options.focus ?? true });

		this.locateCanvasNodeWithRetry(canvasLeaf, candidates, nodeId, options, 0);

		return canvasLeaf;
	}

	private locateInMarkdownEditor(editor: Editor, candidates: string[]): boolean {
		const content = this.safeGetEditorValue(editor);
		if (!content) {
			return false;
		}

		const parsed = this.parseEditorLocateCandidates(candidates);
		const target = this.findBestEditorLocateTarget(content, parsed);
		if (!target) {
			return false;
		}

		const lineText = editor.getLine(target.line) || "";
		const startPos = { line: target.line, ch: Math.max(0, Math.min(target.startCh, lineText.length)) };
		const endPos = {
			line: target.line,
			ch: Math.max(startPos.ch, Math.min(target.endCh, lineText.length)),
		};

		try {
			editor.setCursor(startPos);
		} catch (_e) {
			/* ignore */
		}

		try {
			editor.setSelection(startPos, endPos.ch > startPos.ch ? endPos : { line: target.line, ch: lineText.length });
			window.setTimeout(() => {
				try {
					editor.setCursor(startPos);
				} catch (_e) {
					/* ignore */
				}
			}, 900);
		} catch (_e) {
			/* ignore */
		}

		try {
			editor.scrollIntoView(
				{
					from: { line: Math.max(0, target.line - 2), ch: 0 },
					to: { line: target.line + 2, ch: 0 },
				},
				true
			);
		} catch (_e) {
			try {
				editor.scrollIntoView({ from: startPos, to: startPos }, true);
			} catch (_inner) {
				/* ignore */
			}
		}

		return true;
	}

	private safeGetEditorValue(editor: Editor): string {
		try {
			return String(editor.getValue() || "");
		} catch (_e) {
			return "";
		}
	}

	private parseEditorLocateCandidates(candidates: string[]): EditorLocateCandidates {
		const parsed = parseTaggedSourceLocateCandidates(candidates);
		const timestampCandidates =
			typeof parsed.createdTime === "number"
				? this.buildTimestampCandidates(parsed.createdTime)
				: [];

		return {
			textCandidates: parsed.textCandidates.filter((value) => this.isDescriptiveTextCandidate(value)),
			epubLinkCandidates: parsed.epubLinkCandidates,
			epubCfiCandidates: parsed.epubCfiCandidates,
			excerptCandidates: parsed.excerptCandidates,
			timestampCandidates,
			hasEpubTarget: parsed.hasEpubTarget,
		};
	}

	private findBestEditorLocateTarget(
		content: string,
		candidates: EditorLocateCandidates
	): { line: number; startCh: number; endCh: number } | null {
		const normalized = String(content || "").replace(/\r\n/g, "\n");
		const lines = normalized.split("\n");

		if (candidates.hasEpubTarget) {
			const blockTarget = this.findBestEpubCalloutLine(lines, candidates);
			if (blockTarget) {
				return blockTarget;
			}
		}

		return this.findBestPlainTextLine(lines, candidates.textCandidates);
	}

	private findBestEpubCalloutLine(
		lines: string[],
		candidates: EditorLocateCandidates
	): { line: number; startCh: number; endCh: number } | null {
		let best:
			| {
				line: number;
				startCh: number;
				endCh: number;
				score: number;
			  }
			| null = null;

		for (let index = 0; index < lines.length; index += 1) {
			const headerLine = lines[index];
			if (!/^>\s*\[!epub(?:\|[^\]]+)?\]/i.test(headerLine.trim())) {
				continue;
			}

			const blockLines = [headerLine];
			let nextIndex = index + 1;
			while (nextIndex < lines.length && lines[nextIndex].trimStart().startsWith(">")) {
				blockLines.push(lines[nextIndex]);
				nextIndex += 1;
			}

			const blockText = blockLines.join("\n");
			const score = this.scoreEditorCalloutBlock(blockText, candidates);
			if (score > 0) {
				const targetLine = this.findBestLineWithinBlock(lines, index, nextIndex - 1, candidates);
				const lineText = lines[targetLine] || "";
				const selection = this.findBestSelectionInLine(lineText, candidates.textCandidates);
				const result = {
					line: targetLine,
					startCh: selection?.start ?? 0,
					endCh: selection?.end ?? Math.max(0, lineText.length),
					score,
				};
				if (!best || result.score > best.score) {
					best = result;
				}
			}

			index = nextIndex - 1;
		}

		return best
			? { line: best.line, startCh: best.startCh, endCh: best.endCh }
			: null;
	}

	private scoreEditorCalloutBlock(blockText: string, candidates: EditorLocateCandidates): number {
		const normalizedBlock = this.normalizeForMatch(blockText);
		if (!normalizedBlock) {
			return 0;
		}

		let score = 0;
		score += this.scoreBestNormalizedMatch(normalizedBlock, candidates.excerptCandidates) * 200;
		score += this.scoreBestNormalizedMatch(normalizedBlock, candidates.epubLinkCandidates) * 100;
		score += this.scoreBestNormalizedMatch(normalizedBlock, candidates.epubCfiCandidates) * 80;
		score += this.scoreBestNormalizedMatch(normalizedBlock, candidates.timestampCandidates) * 20;
		score += this.scoreBestNormalizedMatch(normalizedBlock, candidates.textCandidates) * 5;
		return score;
	}

	private findBestLineWithinBlock(
		lines: string[],
		startLine: number,
		endLine: number,
		candidates: EditorLocateCandidates
	): number {
		let bestLine = startLine;
		let bestScore = 0;
		for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
			const lineText = lines[lineNumber] || "";
			const score = this.scoreBestNormalizedMatch(this.normalizeForMatch(lineText), candidates.textCandidates);
			if (score > bestScore) {
				bestScore = score;
				bestLine = lineNumber;
			}
		}
		if (bestScore > 0) {
			return bestLine;
		}
		return Math.min(endLine, startLine + 1);
	}

	private findBestPlainTextLine(
		lines: string[],
		textCandidates: string[]
	): { line: number; startCh: number; endCh: number } | null {
		let best:
			| {
				line: number;
				startCh: number;
				endCh: number;
				score: number;
			  }
			| null = null;

		for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
			const lineText = lines[lineNumber] || "";
			const normalizedLine = this.normalizeForMatch(lineText);
			const score = this.scoreBestNormalizedMatch(normalizedLine, textCandidates);
			if (score <= 0) {
				continue;
			}
			const selection = this.findBestSelectionInLine(lineText, textCandidates);
			const result = {
				line: lineNumber,
				startCh: selection?.start ?? 0,
				endCh: selection?.end ?? Math.max(0, lineText.length),
				score,
			};
			if (!best || result.score > best.score) {
				best = result;
			}
		}

		return best
			? { line: best.line, startCh: best.startCh, endCh: best.endCh }
			: null;
	}

	private findBestSelectionInLine(
		lineText: string,
		candidates: string[]
	): { start: number; end: number } | null {
		const lowerLine = lineText.toLowerCase();
		let best: { start: number; end: number; length: number } | null = null;
		for (const candidate of candidates) {
			const trimmed = String(candidate || "").trim();
			if (!trimmed) continue;
			const lowerCandidate = trimmed.toLowerCase();
			const index = lowerLine.indexOf(lowerCandidate);
			if (index < 0) continue;
			const current = { start: index, end: index + trimmed.length, length: trimmed.length };
			if (!best || current.length > best.length) {
				best = current;
			}
		}
		return best ? { start: best.start, end: best.end } : null;
	}

	private scoreBestNormalizedMatch(haystack: string, candidates: string[]): number {
		let bestScore = 0;
		for (const candidate of candidates) {
			const normalizedCandidate = this.normalizeForMatch(candidate);
			if (!haystack || !normalizedCandidate || !haystack.includes(normalizedCandidate)) {
				continue;
			}
			bestScore = Math.max(bestScore, normalizedCandidate.length);
		}
		return bestScore;
	}

	private isDescriptiveTextCandidate(candidate: string): boolean {
		return isDescriptiveSourceLocateTextCandidate(candidate, { minLength: 6 });
	}

	private normalizeForMatch(value: string): string {
		return normalizeSourceLocateMatchValue(String(value || ""));
	}

	private buildTimestampCandidates(createdTime: number): string[] {
		return buildSourceLocateTimestampCandidates(createdTime, {
			includeIsoMinute: true,
		});
	}

	private locateCanvasNodeWithRetry(
		canvasLeaf: WorkspaceLeaf,
		candidates: string[],
		nodeId: string | undefined,
		options: LocateOptions,
		attempt: number
	): void {
		window.setTimeout(() => {
			try {
				const canvasView = canvasLeaf.view as any;
				const canvas = canvasView?.canvas;
				const nodesMap = canvas?.nodes;
				if (!canvas || !nodesMap) {
					if (attempt < 5) {
						this.locateCanvasNodeWithRetry(canvasLeaf, candidates, nodeId, options, attempt + 1);
					}
					return;
				}

				const nodes = Array.from(nodesMap.values());
				const matchedNode =
					this.findCanvasNodeById(nodes, nodeId) ||
					this.findCanvasNodeByLocateCandidates(nodes, candidates) ||
					this.findCanvasNodeByRect(nodes, options.nodeRect);

				if (!matchedNode) {
					if (attempt < 5) {
						this.locateCanvasNodeWithRetry(canvasLeaf, candidates, nodeId, options, attempt + 1);
					} else if (options.fallbackEl) {
						this.overlay.showAtRect(options.fallbackEl.getBoundingClientRect(), {
							label: options.label || DEFAULT_LABEL,
							icon: options.icon || DEFAULT_ICON,
						});
					}
					return;
				}

				canvas.selectOnly(matchedNode);
				canvas.zoomToSelection();

				const nodeEl =
					(matchedNode as any)?.nodeEl ||
					(matchedNode as any)?.contentEl ||
					(matchedNode as any)?.containerEl ||
					(matchedNode as any)?.el;
				if (nodeEl instanceof HTMLElement) {
					window.setTimeout(() => {
						this.overlay.showAtRect(nodeEl.getBoundingClientRect(), {
							label: options.label || DEFAULT_LABEL,
							icon: options.icon || DEFAULT_ICON,
						});
					}, 120);
				}
			} catch (_e) {
				if (attempt < 5) {
					this.locateCanvasNodeWithRetry(canvasLeaf, candidates, nodeId, options, attempt + 1);
				}
			}
		}, (options.delayMs ?? 350) + attempt * 180);
	}

	private findCanvasNodeById(nodes: any[], nodeId?: string): any | null {
		const normalizedNodeId = this.normalizeCanvasNodeId(nodeId);
		if (!normalizedNodeId) return null;
		for (const node of nodes) {
			const data = typeof node?.getData === "function" ? node.getData() : node;
			const currentId = node?.id || data?.id || node?.unknownData?.id;
			if (typeof currentId === "string" && currentId === normalizedNodeId) {
				return node;
			}
		}
		return null;
	}

	private normalizeCanvasNodeId(nodeId?: string): string | undefined {
		if (!nodeId || typeof nodeId !== "string") return undefined;
		const trimmed = nodeId.trim();
		if (!trimmed) return undefined;

		let withoutPrefix = trimmed;
		if (withoutPrefix.startsWith("canvas-file-node:")) {
			withoutPrefix = withoutPrefix.slice("canvas-file-node:".length);
		} else if (withoutPrefix.startsWith("canvas-node:")) {
			withoutPrefix = withoutPrefix.slice("canvas-node:".length);
		} else if (withoutPrefix.startsWith("canvas:")) {
			withoutPrefix = withoutPrefix.slice(7);
		}
		const withoutCaret = withoutPrefix.startsWith("^") ? withoutPrefix.slice(1) : withoutPrefix;
		const queryIndex = withoutCaret.indexOf("?");
		return queryIndex >= 0 ? withoutCaret.slice(0, queryIndex) : withoutCaret;
	}

	private findCanvasNodeByLocateCandidates(nodes: any[], candidates: string[]): any | null {
		const parsed = this.parseEditorLocateCandidates(candidates);
		const rawCandidates = candidates.filter(
			(candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0
		);
		if (
			parsed.textCandidates.length === 0 &&
			parsed.epubLinkCandidates.length === 0 &&
			parsed.epubCfiCandidates.length === 0 &&
			parsed.excerptCandidates.length === 0 &&
			parsed.timestampCandidates.length === 0 &&
			rawCandidates.length === 0
		) {
			return null;
		}

		let bestNode: any | null = null;
		let bestScore = 0;

		for (const node of nodes) {
			const searchableText = this.buildCanvasNodeSearchText(node);
			if (!searchableText) {
				continue;
			}
			const score = this.scoreCanvasNodeMatch(searchableText, parsed, rawCandidates);
			if (score > bestScore) {
				bestScore = score;
				bestNode = node;
			}
		}

		return bestScore > 0 ? bestNode : null;
	}

	private buildCanvasNodeSearchText(node: any): string {
		const data = typeof node?.getData === "function" ? node.getData() : node;
		const values = [
			node?.id,
			data?.id,
			node?.text,
			data?.text,
			node?.file,
			data?.file,
			node?.label,
			data?.label,
			node?.unknownData?.text,
			node?.unknownData?.file,
		];
		return values
			.map((value) => String(value || "").trim())
			.filter(Boolean)
			.join("\n");
	}

	private scoreCanvasNodeMatch(
		searchableText: string,
		parsed: EditorLocateCandidates,
		rawCandidates: string[]
	): number {
		const normalized = this.normalizeForMatch(searchableText);
		if (!normalized) {
			return 0;
		}

		let score = 0;
		score += this.scoreBestNormalizedMatch(normalized, parsed.excerptCandidates) * 200;
		score += this.scoreBestNormalizedMatch(normalized, parsed.epubLinkCandidates) * 100;
		score += this.scoreBestNormalizedMatch(normalized, parsed.epubCfiCandidates) * 80;
		score += this.scoreBestNormalizedMatch(normalized, parsed.timestampCandidates) * 20;
		score += this.scoreBestNormalizedMatch(normalized, parsed.textCandidates) * 5;
		score += this.scoreBestNormalizedMatch(normalized, rawCandidates);
		return score;
	}

	private findCanvasNodeByRect(nodes: any[], nodeRect?: LocateOptions["nodeRect"]): any | null {
		if (!nodeRect || !Number.isFinite(nodeRect.x) || !Number.isFinite(nodeRect.y)) {
			return null;
		}

		let bestNode: any | null = null;
		let bestScore = Number.POSITIVE_INFINITY;

		for (const node of nodes) {
			const data = typeof node?.getData === "function" ? node.getData() : node;
			const x = Number(data?.x);
			const y = Number(data?.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

			const width = Number(data?.width);
			const height = Number(data?.height);
			const dx = Math.abs(x - nodeRect.x);
			const dy = Math.abs(y - nodeRect.y);
			const dw =
				Number.isFinite(width) && Number.isFinite(nodeRect.width)
					? Math.abs(width - (nodeRect.width as number))
					: 0;
			const dh =
				Number.isFinite(height) && Number.isFinite(nodeRect.height)
					? Math.abs(height - (nodeRect.height as number))
					: 0;
			const score = dx + dy + dw + dh;

			if (score < bestScore) {
				bestScore = score;
				bestNode = node;
			}
		}

		return bestNode;
	}
}
