import { setIcon } from "obsidian";
import {
	buildSourceLocateCandidateVariants,
	buildSourceLocateTimestampCandidates,
	decodeSourceLocateURIComponent,
	isDescriptiveSourceLocateTextCandidate,
	normalizeSourceLocateMatchValue,
	parseTaggedSourceLocateCandidates,
} from "./source-locate-candidates";
import { applyStyleProps } from "../../utils/style-props";

interface LocateOverlayOptions {
	label?: string;
	icon?: string;
	durationMs?: number;
}

const DEFAULT_DURATION = 2600;

interface MarkdownLocateRequest {
	searchCandidates: string[];
	textCandidates: string[];
	epubLinkCandidates: string[];
	epubCfiCandidates: string[];
	excerptCandidates: string[];
	createdTime?: number;
	hasEpubTarget: boolean;
}

interface MarkdownLocateTarget {
	scrollTarget: HTMLElement;
	overlayRect: DOMRect;
}

interface TextSegment {
	node: Text;
	start: number;
	end: number;
	text: string;
}

interface RectLike {
	left?: number;
	top?: number;
	right?: number;
	bottom?: number;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}

export class SourceLocateOverlayService {
	private overlayEl: HTMLElement | null = null;
	private timer: number | null = null;

	showAtRect(
		rect: DOMRect | DOMRectReadOnly | RectLike | null | undefined,
		options: LocateOverlayOptions = {}
	): boolean {
		const normalizedRect = this.normalizeDisplayRect(rect);
		if (!normalizedRect) return false;
		this.clear();

		const label = options.label || "定位到溯源位置";
		const icon = options.icon || "map-pinned";
		const overlay = document.body.createDiv({ cls: "weave-source-locate-overlay" });
		overlay.classList.add("weave-source-locate-overlay--measuring");
		applyStyleProps(overlay, {
			top: "-9999px",
			left: "-9999px",
		});
		const iconWrap = overlay.createDiv({ cls: "weave-source-locate-overlay__icon" });
		setIcon(iconWrap, icon);
		overlay.createSpan({ cls: "weave-source-locate-overlay__label", text: label });

		const overlayWidth = Math.max(0, overlay.offsetWidth || 220);
		const overlayHeight = Math.max(0, overlay.offsetHeight || 40);
		const top = this.clamp(
			normalizedRect.top + Math.min(12, Math.max(4, normalizedRect.height * 0.18)),
			12,
			Math.max(12, window.innerHeight - overlayHeight - 12)
		);
		const left = this.clamp(
			normalizedRect.left + Math.min(18, Math.max(6, normalizedRect.width * 0.12)),
			12,
			Math.max(12, window.innerWidth - overlayWidth - 12)
		);

		overlay.classList.remove("weave-source-locate-overlay--measuring");
		applyStyleProps(overlay, {
			top: `${top}px`,
			left: `${left}px`,
		});
		this.overlayEl = overlay;
		this.timer = window.setTimeout(() => this.clear(), options.durationMs ?? DEFAULT_DURATION);
		return true;
	}

	showTopCenter(anchor: HTMLElement, options: LocateOverlayOptions = {}): void {
		const rect = anchor.getBoundingClientRect();
		const virtualRect = new DOMRect(rect.left + rect.width / 2 - 70, rect.top + 24, 140, 24);
		this.showAtRect(virtualRect, options);
	}

	findMarkdownLocateTarget(
		container: HTMLElement,
		candidates: string[]
	): MarkdownLocateTarget | null {
		return this.resolveMarkdownLocateTarget(container, candidates);
	}

	findMarkdownTarget(container: HTMLElement, candidates: string[]): HTMLElement | null {
		return this.resolveMarkdownLocateTarget(container, candidates)?.scrollTarget || null;
	}

	showForMarkdownTarget(
		container: HTMLElement,
		candidates: string[],
		options: LocateOverlayOptions = {}
	): boolean {
		const target = this.resolveMarkdownLocateTarget(container, candidates);
		if (!target) return false;
		return this.showAtRect(target.overlayRect, options);
	}

	private resolveMarkdownLocateTarget(
		container: HTMLElement,
		candidates: string[]
	): MarkdownLocateTarget | null {
		const request = this.parseMarkdownLocateRequest(candidates);
		const cleanCandidates = request.searchCandidates;
		if (request.hasEpubTarget) {
			const epubCalloutTarget = this.findPreviewTargetByEpubCallout(container, request);
			if (epubCalloutTarget) {
				return this.buildLocateTarget(
					epubCalloutTarget,
					request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
				);
			}
		}
		if (cleanCandidates.length === 0) return null;

		if (request.hasEpubTarget) {
			const directTarget = this.findPreviewTargetByAttributes(container, cleanCandidates);
			if (directTarget) {
				return this.buildLocateTarget(
					directTarget,
					request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
				);
			}

			const previewBlock = this.findPreviewTargetByText(
				container,
				request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
			);
			if (previewBlock) {
				return this.buildLocateTarget(
					previewBlock,
					request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
				);
			}

			const sourceEditorTarget = this.findSourceEditorTargetByEpubCallout(container, request);
			if (sourceEditorTarget) {
				return sourceEditorTarget;
			}
		} else {
			const previewBlockByText = this.findPreviewTargetByText(container, request.textCandidates);
			if (previewBlockByText) {
				return this.buildLocateTarget(previewBlockByText, request.textCandidates);
			}

			const directTarget = this.findPreviewTargetByAttributes(container, cleanCandidates);
			if (directTarget) {
				return this.buildLocateTarget(
					directTarget,
					request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
				);
			}

			const previewBlock = this.findPreviewTargetByText(container, cleanCandidates);
			if (previewBlock) {
				return this.buildLocateTarget(previewBlock, cleanCandidates);
			}
		}

		const previewLinks = Array.from(
			container.querySelectorAll(
				".markdown-preview-view a.internal-link, .markdown-preview-view a[href]"
			)
		) as HTMLElement[];
		const previewLink = previewLinks.find((link) => {
			const href = `${link.getAttribute("href") || ""} ${link.getAttribute("data-href") || ""}`;
			return cleanCandidates.some((candidate) => this.matchesCandidate(href, candidate));
		});

		if (previewLink) {
			const target = previewLink.closest(".callout, blockquote, p, li, div") as HTMLElement | null;
			return this.buildLocateTarget(
				target || previewLink,
				request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates,
				previewLink
			);
		}

		const sourceLines = Array.from(container.querySelectorAll(".cm-line")) as HTMLElement[];
		const sourceLineCandidates = Array.from(
			new Set([
				...(request.textCandidates.length > 0 ? request.textCandidates : []),
				...cleanCandidates,
			])
		);
		const sourceLine = this.findBestSourceEditorLine(sourceLines, sourceLineCandidates);
		if (sourceLine) {
			return this.buildLocateTarget(
				sourceLine,
				request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
			);
		}

		if (!request.hasEpubTarget) {
			const activeLine = container.querySelector(".cm-active, .cm-line") as HTMLElement | null;
			if (activeLine) {
				return this.buildLocateTarget(
					activeLine,
					request.textCandidates.length > 0 ? request.textCandidates : cleanCandidates
				);
			}
		}

		return null;
	}

	private parseMarkdownLocateRequest(candidates: string[]): MarkdownLocateRequest {
		const parsed = parseTaggedSourceLocateCandidates(candidates);

		return {
			searchCandidates: Array.from(
				new Set(
					parsed.rawSearchCandidates.flatMap((candidate) => this.buildCandidateVariants(candidate))
				)
			),
			textCandidates: Array.from(
				new Set(parsed.textCandidates.filter((candidate) => this.isDescriptiveTextCandidate(candidate)))
			),
			epubLinkCandidates: Array.from(
				new Set(parsed.epubLinkCandidates.flatMap((candidate) => this.buildCandidateVariants(candidate)))
			),
			epubCfiCandidates: Array.from(
				new Set(parsed.epubCfiCandidates.flatMap((candidate) => this.buildCandidateVariants(candidate)))
			),
			excerptCandidates: Array.from(
				new Set(parsed.excerptCandidates.flatMap((candidate) => this.buildCandidateVariants(candidate)))
			),
			createdTime: parsed.createdTime,
			hasEpubTarget: parsed.hasEpubTarget,
		};
	}

	clear(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.overlayEl?.remove();
		this.overlayEl = null;
	}

	private buildCandidateVariants(candidate: string): string[] {
		return buildSourceLocateCandidateVariants(candidate);
	}

	private findPreviewTargetByAttributes(
		container: HTMLElement,
		candidates: string[]
	): HTMLElement | null {
		if (candidates.length === 0) return null;
		const previewTargets = Array.from(
			container.querySelectorAll(
				".markdown-preview-view [id], .markdown-preview-view [data-heading], .markdown-preview-view [data-block-id], .markdown-preview-view [data-blockid], .markdown-preview-view [href], .markdown-preview-view [data-href]"
			)
		) as HTMLElement[];

		let bestElement: HTMLElement | null = null;
		let bestScore = 0;

		for (const element of previewTargets) {
			const values = [
				element.id,
				element.getAttribute("data-heading") || "",
				element.getAttribute("data-block-id") || "",
				element.getAttribute("data-blockid") || "",
				element.getAttribute("href") || "",
				element.getAttribute("data-href") || "",
			].join(" ");
			const score = this.scoreBestCandidateMatch(values, candidates);
			if (score > bestScore) {
				bestScore = score;
				bestElement = element;
			}
		}

		return bestScore > 0 ? bestElement : null;
	}

	private findPreviewTargetByText(
		container: HTMLElement,
		candidates: string[]
	): HTMLElement | null {
		if (candidates.length === 0) return null;
		const previewBlocks = Array.from(
			container.querySelectorAll(
				".markdown-preview-view .callout, .markdown-preview-view blockquote, .markdown-preview-view li, .markdown-preview-view p, .markdown-preview-view pre, .markdown-preview-view h1, .markdown-preview-view h2, .markdown-preview-view h3, .markdown-preview-view h4, .markdown-preview-view h5, .markdown-preview-view h6"
			)
		) as HTMLElement[];

		let bestElement: HTMLElement | null = null;
		let bestScore = 0;

		for (const element of previewBlocks) {
			const text = element.textContent || "";
			if (!text.trim()) continue;
			const score = this.scoreBestCandidateMatch(text, candidates);
			if (score > bestScore) {
				bestScore = score;
				bestElement = element;
			}
		}

		return bestScore > 0 ? bestElement : null;
	}

	private findPreviewTargetByEpubCallout(
		container: HTMLElement,
		request: MarkdownLocateRequest
	): HTMLElement | null {
		const blockSet = new Set<HTMLElement>();
		for (const selector of [
			".markdown-preview-view .callout",
			".markdown-preview-view blockquote",
			".markdown-rendered .callout",
			".markdown-rendered blockquote",
		]) {
			for (const block of Array.from(container.querySelectorAll(selector)) as HTMLElement[]) {
				blockSet.add(block);
			}
		}

		let bestElement: HTMLElement | null = null;
		let bestScore = 0;

		for (const block of blockSet) {
			const score = this.scoreEpubCalloutBlock(block, request);
			if (score > bestScore) {
				bestScore = score;
				bestElement = block;
			}
		}

		return bestScore > 0 ? bestElement : null;
	}

	private findSourceEditorTargetByEpubCallout(
		container: HTMLElement,
		request: MarkdownLocateRequest
	): MarkdownLocateTarget | null {
		const sourceLines = Array.from(container.querySelectorAll(".cm-line")) as HTMLElement[];
		if (sourceLines.length === 0) {
			return null;
		}

		const blocks = this.collectSourceEditorEpubCalloutBlocks(sourceLines);
		let bestBlock: HTMLElement[] | null = null;
		let bestScore = 0;

		for (const block of blocks) {
			const score = this.scoreSourceEditorEpubCalloutBlock(block, request);
			if (score > bestScore) {
				bestScore = score;
				bestBlock = block;
			}
		}

		if (!bestBlock || bestScore === 0) {
			return null;
		}

		const preferredTextCandidates =
			request.textCandidates.length > 0 ? request.textCandidates : request.searchCandidates;
		const headerCandidates = [
			...request.epubLinkCandidates,
			...request.epubCfiCandidates,
			...request.excerptCandidates,
			...(request.createdTime ? this.buildTimestampCandidates(request.createdTime) : []),
		];
		const scrollTarget =
			this.findBestSourceEditorLine(bestBlock, preferredTextCandidates) ||
			this.findBestSourceEditorLine(bestBlock, headerCandidates) ||
			bestBlock[0];

		return this.buildLocateTarget(scrollTarget, preferredTextCandidates);
	}

	private collectSourceEditorEpubCalloutBlocks(lines: HTMLElement[]): HTMLElement[][] {
		const blocks: HTMLElement[][] = [];
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index];
			if (!this.isSourceEditorEpubCalloutHeader(line.textContent || "")) {
				continue;
			}

			const blockLines: HTMLElement[] = [line];
			let nextIndex = index + 1;
			while (nextIndex < lines.length) {
				const nextLine = lines[nextIndex];
				const nextText = (nextLine.textContent || "").trimStart();
				if (!nextText.startsWith(">")) {
					break;
				}
				blockLines.push(nextLine);
				nextIndex += 1;
			}

			blocks.push(blockLines);
			index = nextIndex - 1;
		}
		return blocks;
	}

	private isSourceEditorEpubCalloutHeader(text: string): boolean {
		return /^>\s*\[!epub(?:\|[^\]]+)?\]/i.test(String(text || "").trim());
	}

	private scoreSourceEditorEpubCalloutBlock(
		lines: HTMLElement[],
		request: MarkdownLocateRequest
	): number {
		const linkCandidates = [
			...request.epubLinkCandidates,
			...request.epubCfiCandidates,
			...request.excerptCandidates,
		];
		if (linkCandidates.length === 0) {
			return 0;
		}

		const content = lines.map((line) => this.buildElementMatchText(line)).join("\n");
		const linkScore = this.scoreBestCandidateMatch(content, linkCandidates);
		if (linkScore === 0) {
			return 0;
		}

		let totalScore = 5000 + linkScore * 100;
		if (request.excerptCandidates.length > 0) {
			totalScore += this.scoreBestCandidateMatch(content, request.excerptCandidates) * 20;
		}
		if (request.createdTime) {
			totalScore +=
				this.scoreBestCandidateMatch(
					content,
					this.buildTimestampCandidates(request.createdTime)
				) * 10;
		}
		if (request.textCandidates.length > 0) {
			totalScore += this.scoreBestCandidateMatch(content, request.textCandidates);
		}
		return totalScore;
	}

	private scoreEpubCalloutBlock(block: HTMLElement, request: MarkdownLocateRequest): number {
		const linkCandidates = [
			...request.epubLinkCandidates,
			...request.epubCfiCandidates,
			...request.excerptCandidates,
		];
		if (linkCandidates.length === 0) return 0;

		const links = Array.from(
			block.querySelectorAll("a.internal-link, a[href], [data-href], [href]")
		) as HTMLElement[];
		let bestLinkScore = 0;

		for (const link of links) {
			const values = [
				link.getAttribute("href") || "",
				link.getAttribute("data-href") || "",
				link.getAttribute("aria-label") || "",
				link.getAttribute("title") || "",
				link.textContent || "",
			].join(" ");
			bestLinkScore = Math.max(bestLinkScore, this.scoreBestCandidateMatch(values, linkCandidates));
		}

		if (bestLinkScore === 0) {
			bestLinkScore = this.scoreBestCandidateMatch(this.serializeElement(block), linkCandidates);
		}
		if (bestLinkScore === 0) return 0;

		let totalScore = 5000 + bestLinkScore * 100;
		if (request.excerptCandidates.length > 0) {
			totalScore +=
				this.scoreBestCandidateMatch(this.serializeElement(block), request.excerptCandidates) * 20;
		}
		if (request.createdTime) {
			totalScore +=
				this.scoreBestCandidateMatch(
					block.textContent || "",
					this.buildTimestampCandidates(request.createdTime)
				) * 10;
		}
		return totalScore;
	}

	private matchesCandidate(haystack: string, candidate: string): boolean {
		const normalizedHaystack = this.normalizeForMatch(haystack);
		const normalizedCandidate = this.normalizeForMatch(candidate);
		if (!normalizedHaystack || !normalizedCandidate) return false;
		return normalizedHaystack.includes(normalizedCandidate);
	}

	private scoreBestCandidateMatch(haystack: string, candidates: string[]): number {
		let bestScore = 0;
		for (const candidate of candidates) {
			const score = this.scoreCandidateMatch(haystack, candidate);
			if (score > bestScore) {
				bestScore = score;
			}
		}
		return bestScore;
	}

	private findBestSourceEditorLine(
		lines: HTMLElement[],
		candidates: string[]
	): HTMLElement | null {
		if (lines.length === 0 || candidates.length === 0) {
			return null;
		}

		let bestElement: HTMLElement | null = null;
		let bestScore = 0;
		for (const line of lines) {
			const text = this.buildElementMatchText(line);
			if (!text.trim()) {
				continue;
			}
			const score = this.scoreBestCandidateMatch(text, candidates);
			if (score > bestScore) {
				bestScore = score;
				bestElement = line;
			}
		}

		return bestScore > 0 ? bestElement : null;
	}

	private buildElementMatchText(element: Element): string {
		const values: string[] = [];
		const pushValue = (value?: string | null) => {
			const normalized = String(value || "").trim();
			if (normalized) {
				values.push(normalized);
			}
		};

		if (element instanceof HTMLElement) {
			pushValue(element.textContent);
			pushValue(element.getAttribute("href"));
			pushValue(element.getAttribute("data-href"));
			pushValue(element.getAttribute("aria-label"));
			pushValue(element.getAttribute("title"));

			const descendants = element.querySelectorAll(
				"a.internal-link, a[href], [data-href], [href], .internal-link"
			);
			for (const node of Array.from(descendants)) {
				if (!(node instanceof HTMLElement)) {
					continue;
				}
				pushValue(node.textContent);
				pushValue(node.getAttribute("href"));
				pushValue(node.getAttribute("data-href"));
				pushValue(node.getAttribute("aria-label"));
				pushValue(node.getAttribute("title"));
			}
		}

		return values.join(" ");
	}

	private serializeElement(element: Element): string {
		return new XMLSerializer().serializeToString(element);
	}

	private scoreCandidateMatch(haystack: string, candidate: string): number {
		const normalizedHaystack = this.normalizeForMatch(haystack);
		const normalizedCandidate = this.normalizeForMatch(candidate);
		if (
			!normalizedHaystack ||
			!normalizedCandidate ||
			!normalizedHaystack.includes(normalizedCandidate)
		) {
			return 0;
		}

		const candidateLength = normalizedCandidate.length;
		const descriptiveBoost = this.isDescriptiveTextCandidate(candidate) ? 1000 : 0;
		return descriptiveBoost + Math.min(candidateLength, 400);
	}

	private isDescriptiveTextCandidate(candidate: string): boolean {
		return isDescriptiveSourceLocateTextCandidate(candidate, {
			minLength: 10,
			requireWordBoundaryHint: true,
		});
	}

	private normalizeForMatch(value: string): string {
		return normalizeSourceLocateMatchValue(value);
	}

	private buildTimestampCandidates(createdTime: number): string[] {
		return buildSourceLocateTimestampCandidates(createdTime, {
			includeDateOnly: true,
			includeSeconds: true,
		});
	}

	private tryDecodeURIComponent(value: string): string {
		return decodeSourceLocateURIComponent(value, 2);
	}

	private buildLocateTarget(
		scrollTarget: HTMLElement,
		textCandidates: string[],
		rectSource?: HTMLElement | null
	): MarkdownLocateTarget {
		const preciseRect = this.normalizeDisplayRect(
			this.findTextRectInElement(rectSource || scrollTarget, textCandidates) || null
		);
		const fallbackRect = this.normalizeDisplayRect(
			(rectSource || scrollTarget).getBoundingClientRect()
		);
		return {
			scrollTarget,
			overlayRect: preciseRect || fallbackRect || new DOMRect(0, 0, 0, 0),
		};
	}

	private normalizeDisplayRect(
		rect: DOMRect | DOMRectReadOnly | RectLike | null | undefined
	): DOMRect | null {
		if (!rect) {
			return null;
		}

		const left = this.pickFiniteNumber(rect.left, rect.x);
		const top = this.pickFiniteNumber(rect.top, rect.y);
		const width = this.pickFiniteNumber(rect.width);
		const height = this.pickFiniteNumber(rect.height);
		const right = this.pickFiniteNumber(rect.right);
		const bottom = this.pickFiniteNumber(rect.bottom);

		const resolvedWidth = width ?? (left !== null && right !== null ? right - left : null);
		const resolvedHeight = height ?? (top !== null && bottom !== null ? bottom - top : null);
		const resolvedLeft =
			left ?? (right !== null && resolvedWidth !== null ? right - resolvedWidth : null);
		const resolvedTop =
			top ?? (bottom !== null && resolvedHeight !== null ? bottom - resolvedHeight : null);

		if (
			resolvedLeft === null ||
			resolvedTop === null ||
			resolvedWidth === null ||
			resolvedHeight === null
		) {
			return null;
		}

		if (
			!Number.isFinite(resolvedLeft) ||
			!Number.isFinite(resolvedTop) ||
			!Number.isFinite(resolvedWidth) ||
			!Number.isFinite(resolvedHeight)
		) {
			return null;
		}

		if (resolvedWidth === 0 && resolvedHeight === 0) {
			return null;
		}

		return new DOMRect(
			resolvedLeft,
			resolvedTop,
			Math.max(0, resolvedWidth),
			Math.max(0, resolvedHeight)
		);
	}

	private pickFiniteNumber(...values: Array<number | string | undefined>): number | null {
		for (const value of values) {
			const numericValue =
				typeof value === "number"
					? value
					: typeof value === "string" && value.trim()
						? Number(value)
						: Number.NaN;
			if (Number.isFinite(numericValue)) {
				return numericValue;
			}
		}
		return null;
	}

	private clamp(value: number, min: number, max: number): number {
		if (!Number.isFinite(value)) {
			return min;
		}
		if (!Number.isFinite(min)) {
			min = 0;
		}
		if (!Number.isFinite(max)) {
			return Math.max(value, min);
		}
		if (max < min) {
			return min;
		}
		return Math.min(Math.max(value, min), max);
	}

	private findTextRectInElement(
		element: HTMLElement,
		candidates: string[]
	): DOMRect | null {
		const textCandidates = Array.from(
			new Set(
				candidates
					.map((candidate) => this.tryDecodeURIComponent(String(candidate || "").trim()))
					.filter((candidate) => this.isDescriptiveTextCandidate(candidate))
					.sort((a, b) => b.length - a.length)
			)
		);
		if (textCandidates.length === 0) {
			return null;
		}

		const segments = this.collectTextSegments(element);
		if (segments.length === 0) {
			return null;
		}

		const doc = element.ownerDocument;
		const combined = segments.map((segment) => segment.text).join("");
		for (const candidate of textCandidates) {
			const offsets = this.findCandidateOffsets(combined, candidate);
			if (!offsets) {
				continue;
			}
			const range = this.createRangeFromOffsets(doc, segments, offsets.start, offsets.end);
			if (!range) {
				continue;
			}
			const rect = range.getBoundingClientRect?.() || null;
			if (rect && (rect.width > 0 || rect.height > 0)) {
				return new DOMRect(rect.left, rect.top, rect.width, rect.height);
			}
		}

		return null;
	}

	private collectTextSegments(root: HTMLElement): TextSegment[] {
		const doc = root.ownerDocument;
		const segments: TextSegment[] = [];
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				const parent = node.parentElement;
				if (!parent) {
					return NodeFilter.FILTER_REJECT;
				}
				const tagName = parent.tagName.toUpperCase();
				if (tagName === "SCRIPT" || tagName === "STYLE") {
					return NodeFilter.FILTER_REJECT;
				}
				return (node.textContent || "").length > 0
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT;
			},
		});

		let offset = 0;
		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			const text = node.textContent || "";
			segments.push({ node, start: offset, end: offset + text.length, text });
			offset += text.length;
		}

		return segments;
	}

	private findCandidateOffsets(
		haystack: string,
		candidate: string
	): { start: number; end: number } | null {
		const exactIndex = haystack.toLowerCase().indexOf(candidate.toLowerCase());
		if (exactIndex >= 0) {
			return {
				start: exactIndex,
				end: exactIndex + candidate.length,
			};
		}

		const normalizedHaystack = this.normalizeTextWithMap(haystack);
		const normalizedCandidate = this.normalizeTextWithMap(candidate).normalized;
		if (!normalizedHaystack.normalized || !normalizedCandidate) {
			return null;
		}

		const normalizedIndex = normalizedHaystack.normalized.indexOf(normalizedCandidate);
		if (normalizedIndex < 0) {
			return null;
		}

		const normalizedEndIndex = normalizedIndex + normalizedCandidate.length - 1;
		const rawStart = normalizedHaystack.rawIndexByNormalizedIndex[normalizedIndex];
		const rawEndInclusive = normalizedHaystack.rawIndexByNormalizedIndex[normalizedEndIndex];
		if (!Number.isFinite(rawStart) || !Number.isFinite(rawEndInclusive)) {
			return null;
		}

		return {
			start: rawStart,
			end: rawEndInclusive + 1,
		};
	}

	private normalizeTextWithMap(value: string): {
		normalized: string;
		rawIndexByNormalizedIndex: number[];
	} {
		const rawValue = this.tryDecodeURIComponent(String(value || ""));
		const normalizedChars: string[] = [];
		const rawIndexByNormalizedIndex: number[] = [];
		let previousWasSpace = false;

		for (let rawIndex = 0; rawIndex < rawValue.length; rawIndex += 1) {
			const normalizedChar = this.normalizeMatchChar(rawValue[rawIndex]);
			if (!normalizedChar) {
				continue;
			}

			if (normalizedChar === " ") {
				if (previousWasSpace || normalizedChars.length === 0) {
					continue;
				}
				normalizedChars.push(" ");
				rawIndexByNormalizedIndex.push(rawIndex);
				previousWasSpace = true;
				continue;
			}

			normalizedChars.push(normalizedChar);
			rawIndexByNormalizedIndex.push(rawIndex);
			previousWasSpace = false;
		}

		while (normalizedChars.length > 0 && normalizedChars[normalizedChars.length - 1] === " ") {
			normalizedChars.pop();
			rawIndexByNormalizedIndex.pop();
		}

		return {
			normalized: normalizedChars.join(""),
			rawIndexByNormalizedIndex,
		};
	}

	private normalizeMatchChar(char: string): string {
		if (!char) {
			return "";
		}
		if (/\s/.test(char)) {
			return " ";
		}
		if (char === "“" || char === "”") {
			return '"';
		}
		if (char === "‘" || char === "’") {
			return "'";
		}
		return char.toLowerCase();
	}

	private createRangeFromOffsets(
		doc: Document,
		segments: TextSegment[],
		start: number,
		end: number
	): Range | null {
		const startBoundary = this.resolveTextBoundary(segments, start, false);
		const endBoundary = this.resolveTextBoundary(segments, end, true);
		if (!startBoundary || !endBoundary) {
			return null;
		}

		const range = doc.createRange();
		range.setStart(startBoundary.node, startBoundary.offset);
		range.setEnd(endBoundary.node, endBoundary.offset);
		return range;
	}

	private resolveTextBoundary(
		segments: TextSegment[],
		offset: number,
		isEndBoundary: boolean
	): { node: Text; offset: number } | null {
		for (const segment of segments) {
			const matches = isEndBoundary
				? offset > segment.start && offset <= segment.end
				: offset >= segment.start && offset < segment.end;
			if (!matches) {
				continue;
			}
			return {
				node: segment.node,
				offset: offset - segment.start,
			};
		}

		const edgeSegment = isEndBoundary ? segments[segments.length - 1] : segments[0];
		if (!edgeSegment) {
			return null;
		}

		if (!isEndBoundary && offset === edgeSegment.end) {
			return { node: edgeSegment.node, offset: edgeSegment.text.length };
		}
		if (isEndBoundary && offset === edgeSegment.start) {
			return { node: edgeSegment.node, offset: 0 };
		}
		if (isEndBoundary && offset === edgeSegment.end) {
			return { node: edgeSegment.node, offset: edgeSegment.text.length };
		}

		return null;
	}
}

let sourceLocateOverlayService: SourceLocateOverlayService | null = null;

export function getSourceLocateOverlayService(): SourceLocateOverlayService {
	if (!sourceLocateOverlayService) {
		sourceLocateOverlayService = new SourceLocateOverlayService();
	}
	return sourceLocateOverlayService;
}
