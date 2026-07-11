import { type App, type Editor, MarkdownView, Notice, type WorkspaceLeaf } from "obsidian";
import {
	extractBlockIdFromCandidates,
	findObsidianBlockById,
} from "../../utils/obsidian-block-locator";
import {
	openFileWithExistingLeaf,
	openLinkWithExistingLeaf,
} from "../../utils/workspace-navigation";
import { getSourceLocateOverlayService } from "./SourceLocateOverlayService";
import {
	buildCanvasNodeSearchText,
	getCanvasNodeElement,
	getCanvasNodeId,
	getCanvasNodeRect,
	getCanvasNodes,
	selectCanvasNode,
	type CanvasNodeLike,
} from "../../utils/canvas-view-access";
import { getFileBackedViewPath } from "../../utils/obsidian-markdown-editor";
import {
	buildSourceLocateTimestampCandidates,
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
		view: MarkdownView,
		candidates: string[],
		options: LocateOptions = {}
	): Promise<boolean> {
		if (!view.containerEl) return false;

		const target = this.overlay.findMarkdownLocateTarget(view.containerEl, candidates);
		if (!target) {
			const editor = view.editor;
			if (!editor || !this.locateInMarkdownEditor(editor, candidates)) {
				return false;
			}
			this.showMarkdownOverlayFromViewWithRetry(view, candidates, options, 0);
			return true;
		}

		try {
			target.scrollTarget.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
		} catch {
			/* ignore */
		}

		this.showMarkdownOverlayWithRetry(view, candidates, options, target, 0);

		return true;
	}

	private showMarkdownOverlayFromViewWithRetry(
		view: MarkdownView,
		candidates: string[],
		options: LocateOptions,
		attempt: number
	): void {
		const delay = attempt === 0 ? 60 : this.markdownOverlayRetryDelayMs;
		window.setTimeout(() => {
			try {
				const containerEl = view.containerEl;
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
			} catch {
				/* ignore */
			}
			if (attempt + 1 < this.markdownOverlayMaxAttempts) {
				this.showMarkdownOverlayFromViewWithRetry(view, candidates, options, attempt + 1);
			}
		}, delay);
	}

	private showMarkdownOverlayWithRetry(
		view: MarkdownView,
		candidates: string[],
		options: LocateOptions,
		fallbackTarget: { overlayRect: DOMRect; scrollTarget: HTMLElement },
		attempt: number
	): void {
		const delay = attempt === 0 ? 40 : this.markdownOverlayRetryDelayMs;
		window.setTimeout(() => {
			try {
				const containerEl = view.containerEl;
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
			} catch {
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
		window.setTimeout(() => {
			void (async () => {
				try {
					const activeView =
						openedLeaf?.view instanceof MarkdownView
							? openedLeaf.view
							: this.app.workspace.getActiveViewOfType(MarkdownView);
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
				} catch {
					/* ignore */
				}
			})();
		}, delay);
	}

	async openMarkdownLinkAndLocate(
		linkText: string,
		contextPath: string,
		candidates: string[],
		options: LocateOptions = {}
	): Promise<WorkspaceLeaf | null> {
		const openedLeaf = await openLinkWithExistingLeaf(this.app, linkText, contextPath, {
			openInNewTab: options.openInNewTab ?? false,
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
				return getFileBackedViewPath(leaf.view) === canvasPath;
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

		const blockId = extractBlockIdFromCandidates(candidates);
		if (blockId) {
			const blockTarget = findObsidianBlockById(content, blockId);
			if (blockTarget) {
				return this.locateEditorBlockRange(editor, blockTarget.blockStartLine, blockTarget.targetLine);
			}
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
		} catch {
			/* ignore */
		}

		try {
			editor.setSelection(startPos, endPos.ch > startPos.ch ? endPos : { line: target.line, ch: lineText.length });
			window.setTimeout(() => {
				try {
					editor.setCursor(startPos);
				} catch {
					/* ignore */
				}
			}, 900);
		} catch {
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
		} catch {
			try {
				editor.scrollIntoView({ from: startPos, to: startPos }, true);
			} catch {
				/* ignore */
			}
		}

		return true;
	}

	private locateEditorBlockRange(editor: Editor, blockStartLine: number, targetLine: number): boolean {
		const endLineText = editor.getLine(targetLine) || "";
		const endCh = endLineText.replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, "").length;
		const startPos = { line: blockStartLine, ch: 0 };
		const endPos = { line: targetLine, ch: Math.max(0, endCh) };

		try {
			editor.setCursor(startPos);
		} catch {
			/* ignore */
		}

		try {
			editor.setSelection(startPos, endPos);
			window.setTimeout(() => {
				try {
					editor.setCursor(startPos);
				} catch {
					/* ignore */
				}
			}, 900);
		} catch {
			/* ignore */
		}

		try {
			editor.scrollIntoView(
				{
					from: { line: Math.max(0, blockStartLine - 2), ch: 0 },
					to: { line: targetLine + 2, ch: 0 },
				},
				true
			);
		} catch {
			try {
				editor.scrollIntoView({ from: startPos, to: endPos }, true);
			} catch {
				/* ignore */
			}
		}

		return true;
	}

	private safeGetEditorValue(editor: Editor): string {
		try {
			return String(editor.getValue() || "");
		} catch {
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
				const nodes = getCanvasNodes(canvasLeaf.view);
				if (nodes.length === 0) {
					if (attempt < 5) {
						this.locateCanvasNodeWithRetry(canvasLeaf, candidates, nodeId, options, attempt + 1);
					}
					return;
				}

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

				selectCanvasNode(canvasLeaf.view, matchedNode);

				const nodeEl = getCanvasNodeElement(matchedNode);
				if (nodeEl) {
					window.setTimeout(() => {
						this.overlay.showAtRect(nodeEl.getBoundingClientRect(), {
							label: options.label || DEFAULT_LABEL,
							icon: options.icon || DEFAULT_ICON,
						});
					}, 120);
				}
			} catch {
				if (attempt < 5) {
					this.locateCanvasNodeWithRetry(canvasLeaf, candidates, nodeId, options, attempt + 1);
				}
			}
		}, (options.delayMs ?? 350) + attempt * 180);
	}

	private findCanvasNodeById(nodes: CanvasNodeLike[], nodeId?: string): CanvasNodeLike | null {
		const normalizedNodeId = this.normalizeCanvasNodeId(nodeId);
		if (!normalizedNodeId) return null;
		for (const node of nodes) {
			const currentId = getCanvasNodeId(node);
			if (currentId === normalizedNodeId) {
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

	private findCanvasNodeByLocateCandidates(
		nodes: CanvasNodeLike[],
		candidates: string[]
	): CanvasNodeLike | null {
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

		let bestNode: CanvasNodeLike | null = null;
		let bestScore = 0;

		for (const node of nodes) {
			const searchableText = buildCanvasNodeSearchText(node);
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

	private findCanvasNodeByRect(
		nodes: CanvasNodeLike[],
		nodeRect?: LocateOptions["nodeRect"]
	): CanvasNodeLike | null {
		if (!nodeRect || !Number.isFinite(nodeRect.x) || !Number.isFinite(nodeRect.y)) {
			return null;
		}

		let bestNode: CanvasNodeLike | null = null;
		let bestScore = Number.POSITIVE_INFINITY;

		for (const node of nodes) {
			const rect = getCanvasNodeRect(node);
			const x = rect.x;
			const y = rect.y;
			if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
				continue;
			}

			const width = rect.width;
			const height = rect.height;
			const dx = Math.abs(x - nodeRect.x);
			const dy = Math.abs(y - nodeRect.y);
			const dw =
				width !== undefined &&
				nodeRect.width !== undefined &&
				Number.isFinite(width) &&
				Number.isFinite(nodeRect.width)
					? Math.abs(width - nodeRect.width)
					: 0;
			const dh =
				height !== undefined &&
				nodeRect.height !== undefined &&
				Number.isFinite(height) &&
				Number.isFinite(nodeRect.height)
					? Math.abs(height - nodeRect.height)
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
