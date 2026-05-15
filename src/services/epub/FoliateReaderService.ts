import { Platform, type App } from "obsidian";
import type {
	EpubChapterReadingPointDraft,
	EpubReaderEngine,
	HighlightSourceLocator,
	HighlightClickInfo,
	NavigateAndHighlightOptions,
	ReaderAppearanceOptions,
	ReaderFootnotePreviewInfo,
	ReaderFrame,
	ReaderHighlight,
	ReaderHighlightInput,
	ReaderNavigationRectOptions,
	ReaderNavigateOptions,
	ReaderRemainingTimeEstimate,
	ReaderRenderOptions,
	ReaderSelectionChange,
} from "./reader-engine-types";
import type {
	EpubBook,
	EpubFlowMode,
	EpubHighlightStyle,
	EpubLayoutMode,
	EpubStrikethroughDisplayMode,
	EpubWidthMode,
	PaginationInfo,
	ReadingPosition,
	TocItem,
} from "./types";
import type { View as FoliateViewElement } from "foliate-js/view.js";
import { logger } from "../../utils/logger";
import { FoliateVaultPublicationParser } from "./FoliateVaultPublicationParser";
import { applyStyleProps } from "../../utils/style-props";

type FoliateAnnotation = ReaderHighlight & {
	value: string;
	focusColor?: string;
};

type RenderedFoliateAnnotation = {
	annotation: FoliateAnnotation;
	renderSignature: string;
};

type VisibleFrameWithIndex = {
	index: number;
	href: string;
	document: Document;
	frameElement: HTMLElement | null;
	frame: ReaderFrame;
};

type FoliateRenderer = HTMLElement & {
	setStyles?: (styles: string | [string, string]) => void;
	render?: () => void;
	getContents?: () => Array<{ index?: number; doc?: Document | null }>;
};

function createCssDataUrl(cssText: string): string {
	return `data:text/css;charset=utf-8,${encodeURIComponent(cssText)}`;
}

export class FoliateReaderService implements EpubReaderEngine {
	readonly engineType = "foliate" as const;

	private static readonly HIGHLIGHT_TINT_MAP: Record<
		"light" | "dark",
		Record<string, string>
	> = {
		light: {
			yellow: "rgb(250, 204, 21)",
			green: "rgb(22, 163, 74)",
			blue: "rgb(37, 99, 235)",
			red: "rgb(220, 38, 38)",
			purple: "rgb(147, 51, 234)",
		},
		dark: {
			yellow: "rgb(255, 222, 89)",
			green: "rgb(74, 222, 128)",
			blue: "rgb(96, 165, 250)",
			red: "rgb(248, 113, 113)",
			purple: "rgb(196, 181, 253)",
		},
	};
	private static readonly HIGHLIGHT_OPACITY_MAP: Record<"light" | "dark", string> = {
		light: "0.72",
		dark: "0.68",
	};
	private static readonly HIGHLIGHT_BLEND_MODE_MAP: Record<"light" | "dark", string> = {
		light: "normal",
		dark: "normal",
	};
	private static desktopFoliateIframeSandboxPatchInstalled = false;
	private static mobileBlobIframePatchInstalled = false;
	private static mobileBlobIframeLoadTokens = new WeakMap<HTMLIFrameElement, number>();

	private readonly app: App;
	private readonly parser: FoliateVaultPublicationParser;

	private currentBook: EpubBook | null = null;
	private currentPosition: ReadingPosition = {
		chapterIndex: 0,
		cfi: "",
		percent: 0,
	};
	private currentPaginationInfo: PaginationInfo = { currentPage: 0, totalPages: 0 };
	private renderContainer: HTMLElement | null = null;
	private foliateView: FoliateViewElement | null = null;
	private layoutChangeInFlight = false;
	private currentLineHeight = 1.72;
	private currentLetterSpacing = 0;
	private currentPageMargin = 48;
	private currentWidthMode: EpubWidthMode = "standard";
	private currentStrikethroughPresentation: EpubStrikethroughDisplayMode = "conceal";
	private currentLayoutMode: EpubLayoutMode = "paginated";
	private currentFlowMode: EpubFlowMode = "paginated";
	private currentChapterTitle = "";
	private currentChapterHref = "";
	private relocatedCallbacks = new Set<(position: ReadingPosition) => void>();
	private footnotePreviewCallbacks = new Set<(info: ReaderFootnotePreviewInfo | null) => void>();
	private selectionChangeCallbacks = new Set<(event: ReaderSelectionChange) => void>();
	private highlightClickCallbacks = new Set<(info: HighlightClickInfo) => void>();
	private highlightDataMap = new Map<string, ReaderHighlight>();
	private temporaryHighlightDataMap = new Map<string, ReaderHighlight>();
	private savedHighlights: ReaderHighlight[] = [];
	private renderedAnnotations = new Map<string, RenderedFoliateAnnotation>();
	private temporaryHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private temporarilyRevealedConcealmentTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private documentFootnoteCleanups = new Map<Document, () => void>();
	private documentSelectionCleanups = new Map<Document, () => void>();
	private documentStyleElements = new WeakMap<Document, HTMLLinkElement>();
	private loadedDocumentSectionIndexes = new WeakMap<Document, number>();
	private lastSelectionByDocument = new WeakMap<Document, string>();
	private overlayerModulePromise: Promise<typeof import("foliate-js/overlayer.js")> | null = null;

	constructor(app: App) {
		this.app = app;
		this.parser = new FoliateVaultPublicationParser(app);
	}

	async loadEpub(filePath: string, existingBookId?: string): Promise<EpubBook> {
		await this.destroyViewOnly();
		this.resetHighlightState();

		const loaded = await this.parser.load(filePath);
		const initialCfi =
			(await this.parser.canonicalizeLocation(this.parser.getSectionHrefByIndex(0))) || "";
		this.currentBook = {
			id: existingBookId || `epub-${Date.now()}`,
			filePath,
			metadata: {
				title: loaded.metadata.title,
				author: loaded.metadata.author,
				publisher: loaded.metadata.publisher,
				language: loaded.metadata.language,
				isbn: loaded.metadata.identifier,
				coverImage: loaded.coverImage,
				wordCount: loaded.metadata.wordCount,
				chapterCount: loaded.metadata.chapterCount,
			},
			currentPosition: {
				chapterIndex: 0,
				cfi: initialCfi,
				percent: 0,
			},
			readingStats: {
				totalReadTime: 0,
				lastReadTime: Date.now(),
				createdTime: Date.now(),
			},
		};
		this.currentPosition = { ...this.currentBook.currentPosition };
		this.currentPaginationInfo = {
			currentPage: initialCfi ? (await this.parser.resolvePageNumber(initialCfi)) || 1 : 0,
			totalPages: loaded.totalPositions,
		};
		this.currentChapterTitle = this.parser.getSectionTitleByIndex(0);
		this.currentChapterHref = this.parser.getSectionHrefByIndex(0);
		return this.currentBook;
	}

	async renderTo(container: HTMLElement, options?: ReaderRenderOptions): Promise<void> {
		if (!this.currentBook) {
			throw this.createNotReadyError("renderTo");
		}

		await this.destroyViewOnly();
		await this.ensureFoliateViewRegistered();

		this.renderContainer = container;
		this.layoutChangeInFlight = true;
		this.applyRenderOptions(options);
		container.replaceChildren();
		container.dataset.foliate = "true";

		const view = document.createElement("foliate-view") as FoliateViewElement;
		view.classList.add("weave-epub-reader-host");
		view.addEventListener("relocate", this.handleRelocateEvent as EventListener);
		view.addEventListener("load", this.handleLoadEvent as EventListener);
		view.addEventListener("draw-annotation", this.handleDrawAnnotationEvent as EventListener);
		view.addEventListener("show-annotation", this.handleShowAnnotationEvent as EventListener);
		this.foliateView = view;
		container.appendChild(view);

		try {
			await view.open(this.parser.getBook());
			this.applyRendererLayout();
			this.applyRendererAppearance();
			this.renderedAnnotations.clear();
			const initialTarget = this.currentPosition.cfi || this.currentBook.currentPosition.cfi;
			if (initialTarget) {
				await this.navigateViewWithFallback(
					initialTarget,
					this.getSectionHrefFallbackTarget(initialTarget)
				);
			} else {
				await view.goToTextStart();
				await this.stabilizeViewAfterNavigation();
			}
			await this.syncCurrentPositionFromTarget(initialTarget || this.parser.getSectionHrefByIndex(0));
			await this.refreshHighlights();
		} finally {
			this.layoutChangeInFlight = false;
		}
	}

	async goToLocation(cfi: string): Promise<void> {
		const canonical = await this.parser.canonicalizeLocation(cfi);
		if (!canonical) {
			return;
		}
		this.clearSelections();
		await this.navigateViewWithFallback(canonical, this.getSectionHrefFallbackTarget(canonical, cfi));
		await this.syncCurrentPositionFromTarget(canonical);
	}

	canonicalizeLocation(cfi: string, textHint?: string): Promise<string | null> {
		return this.parser.canonicalizeLocation(cfi, textHint);
	}

	getReadingProgress(): number {
		return this.currentPosition.percent;
	}

	async getPaginationInfo(): Promise<PaginationInfo> {
		return this.currentPaginationInfo;
	}

	async getRemainingReadingTimeEstimate(): Promise<ReaderRemainingTimeEstimate> {
		if (!this.currentBook) {
			return {};
		}
		const totalWordCount = this.parser.getTotalWordCount();
		const totalPositions = this.parser.getTotalPositions();
		const section = this.parser.getSectionReadingMetrics(this.currentPosition.chapterIndex);
		const currentPage = this.normalizeCurrentPage(totalPositions);
		const activeReadMs = Math.max(0, this.currentBook.readingStats.totalReadTime || 0);
		const consumedBookWords =
			totalWordCount > 0 && totalPositions > 0 && currentPage > 0
				? Math.round((currentPage / totalPositions) * totalWordCount)
				: Math.round((this.currentPosition.percent / 100) * totalWordCount);
		const remainingBookWords = Math.max(0, totalWordCount - consumedBookWords);
		const chapterConsumedPositions = section
			? Math.min(
				section.positionCount,
				Math.max(1, currentPage - section.positionStart)
			)
			: 0;
		const chapterConsumedWords = section
			? Math.round((chapterConsumedPositions / Math.max(section.positionCount, 1)) * section.wordCount)
			: 0;
		const remainingChapterWords = section
			? Math.max(0, section.wordCount - chapterConsumedWords)
			: 0;
		const measuredWpm =
			activeReadMs >= 60_000 && consumedBookWords > 0
				? (consumedBookWords / activeReadMs) * 60_000
				: undefined;
		const effectiveWpm = measuredWpm && Number.isFinite(measuredWpm) && measuredWpm >= 40
			? measuredWpm
			: totalWordCount > 0
			? 260
			: undefined;

		return {
			bookMs:
				effectiveWpm && remainingBookWords > 0
					? Math.round((remainingBookWords / effectiveWpm) * 60_000)
					: undefined,
			chapterMs:
				effectiveWpm && remainingChapterWords > 0
					? Math.round((remainingChapterWords / effectiveWpm) * 60_000)
					: undefined,
			wordsPerMinute: effectiveWpm,
		};
	}

	isLayoutChanging(): boolean {
		return this.layoutChangeInFlight;
	}

	resize(_width: number, _height: number): void {
		(this.foliateView?.renderer as FoliateRenderer | undefined)?.render?.();
	}

	async applyReaderAppearance(
		appearance: ReaderAppearanceOptions,
		_redisplay?: boolean
	): Promise<void> {
		if (typeof appearance.lineHeight === "number" && appearance.lineHeight > 0) {
			this.currentLineHeight = appearance.lineHeight;
		}
		if (
			typeof appearance.letterSpacing === "number" &&
			Number.isFinite(appearance.letterSpacing)
		) {
			this.currentLetterSpacing = appearance.letterSpacing;
		}
		if (typeof appearance.pageMargin === "number" && Number.isFinite(appearance.pageMargin)) {
			this.currentPageMargin = appearance.pageMargin;
		}
		if (appearance.widthMode) {
			this.currentWidthMode = appearance.widthMode;
		}
		if (appearance.strikethroughPresentation) {
			this.currentStrikethroughPresentation = appearance.strikethroughPresentation;
		}
		this.applyRendererLayout();
		this.applyRendererAppearance();
		await this.refreshHighlights();
	}

	onRelocated(callback: (position: ReadingPosition) => void): () => void {
		this.relocatedCallbacks.add(callback);
		return () => {
			this.relocatedCallbacks.delete(callback);
		};
	}

	async setLayoutMode(
		mode: EpubLayoutMode,
		flowMode: EpubFlowMode,
		appearance?: ReaderAppearanceOptions
	): Promise<void> {
		this.currentLayoutMode = mode;
		this.currentFlowMode = flowMode;
		if (typeof appearance?.lineHeight === "number" && appearance.lineHeight > 0) {
			this.currentLineHeight = appearance.lineHeight;
		}
		if (
			typeof appearance?.letterSpacing === "number" &&
			Number.isFinite(appearance.letterSpacing)
		) {
			this.currentLetterSpacing = appearance.letterSpacing;
		}
		if (typeof appearance?.pageMargin === "number" && Number.isFinite(appearance.pageMargin)) {
			this.currentPageMargin = appearance.pageMargin;
		}
		if (appearance?.widthMode) {
			this.currentWidthMode = appearance.widthMode;
		} else if (mode === "double") {
			this.currentWidthMode = "full";
		}
		if (appearance?.strikethroughPresentation) {
			this.currentStrikethroughPresentation = appearance.strikethroughPresentation;
		}
		if (!this.foliateView) {
			return;
		}
		const currentCfi = this.getCurrentCFI();
		this.layoutChangeInFlight = true;
		try {
			this.applyRendererLayout();
			this.applyRendererAppearance();
			this.renderedAnnotations.clear();
			if (currentCfi) {
				await this.navigateViewWithFallback(
					currentCfi,
					this.getSectionHrefFallbackTarget(currentCfi, this.currentChapterHref)
				);
				await this.syncCurrentPositionFromTarget(currentCfi);
			}
			await this.refreshHighlights();
		} finally {
			this.layoutChangeInFlight = false;
		}
	}

	searchText(query: string): Promise<Array<{ cfi: string; excerpt: string; chapterTitle: string }>> {
		return this.parser.search(query);
	}

	getTableOfContents(): Promise<TocItem[]> {
		return Promise.resolve(this.parser.getTocItems());
	}

	async navigateTo(options: ReaderNavigateOptions): Promise<void> {
		await this.resolveNavigationRequest(options);
	}

	async navigateAndHighlight(options: NavigateAndHighlightOptions): Promise<void> {
		const { canonical } = await this.resolveNavigationRequest(options);
		if (canonical && options.flashStyle !== "none") {
			this.addTemporaryHighlight(
				{
					cfiRange: canonical,
					color: options.flashColor || "yellow",
					text: options.text,
					sourceFile: options.sourceFile,
					sourceRef: options.sourceRef,
					createdTime: options.createdTime,
				},
				2200
			);
		}
	}

	getNavigationTargetRect(options: ReaderNavigationRectOptions): DOMRect | null {
		const preciseRect = this.findPreciseNavigationTargetRect(options);
		if (preciseRect) {
			return preciseRect;
		}
		if (options.allowFallback === false) {
			return null;
		}
		return this.getRenderContainerRect();
	}

	getCurrentPosition(): ReadingPosition {
		return { ...this.currentPosition };
	}

	private findPreciseNavigationTargetRect(options: ReaderNavigationRectOptions): DOMRect | null {
		for (const target of this.buildNavigationRectTargets(options)) {
			for (const frame of this.getVisibleFramesWithIndex()) {
				const range = this.parser.resolveRangeInLoadedSection(
					target,
					frame.document,
					frame.index,
					options.text
				);
				if (!range) {
					continue;
				}
				const rect = this.createViewportRect(frame, range);
				if (rect) {
					return new DOMRect(rect.left, rect.top, rect.width, rect.height);
				}
			}
		}

		return null;
	}

	private buildNavigationRectTargets(options: ReaderNavigationRectOptions): string[] {
		const targets = new Set<string>();
		const primaryTarget = String(options.cfi || options.href || "").trim();
		if (primaryTarget) {
			targets.add(primaryTarget);
		}

		const currentCfi = String(this.currentPosition.cfi || "").trim();
		if (currentCfi) {
			targets.add(currentCfi);
		}

		const currentHref = String(this.currentChapterHref || "").trim();
		if (currentHref) {
			targets.add(currentHref);
		}

		return Array.from(targets);
	}

	private getRenderContainerRect(): DOMRect | null {
		const rect = this.renderContainer?.getBoundingClientRect() || null;
		if (!rect || (!rect.width && !rect.height)) {
			return null;
		}
		return new DOMRect(rect.left, rect.top, rect.width, rect.height);
	}

	getCurrentChapterTitle(): string {
		return this.currentChapterTitle;
	}

	getCurrentChapterIndex(): number {
		return this.currentPosition.chapterIndex;
	}

	getCurrentChapterHref(): string {
		return this.currentChapterHref;
	}

	getChapterReadingPointDraft(
		href: string,
		titleHint?: string
	): Promise<EpubChapterReadingPointDraft | null> {
		return this.parser.getSectionReadingPointDraft(href, titleHint);
	}

	getSectionHrefForCfi(cfi: string): string | null {
		return this.parser.getSectionHrefForCfi(cfi);
	}

	getCurrentCFI(): string {
		return this.currentPosition.cfi;
	}

	async prevPage(): Promise<void> {
		this.clearSelections();
		if (!this.foliateView) {
			return;
		}
		if (typeof this.foliateView.goLeft === "function") {
			await this.foliateView.goLeft();
			return;
		}
		await this.foliateView.prev();
	}

	async nextPage(): Promise<void> {
		this.clearSelections();
		if (!this.foliateView) {
			return;
		}
		if (typeof this.foliateView.goRight === "function") {
			await this.foliateView.goRight();
			return;
		}
		await this.foliateView.next();
	}

	async goToPage(pageNumber: number): Promise<void> {
		this.clearSelections();
		const canonical = await this.parser.resolveCfiForPage(pageNumber);
		if (!canonical) {
			return;
		}
		await this.navigateViewWithFallback(canonical, this.getSectionHrefFallbackTarget(canonical));
		await this.syncCurrentPositionFromTarget(canonical);
	}

	getPageNumberFromCfi(cfi: string): Promise<number | undefined> {
		return this.parser.resolvePageNumber(cfi);
	}

	getVisibleFrames(): ReaderFrame[] {
		return this.getVisibleFramesWithIndex().map((item) => item.frame);
	}

	onFootnotePreview(callback: (info: ReaderFootnotePreviewInfo | null) => void): () => void {
		this.footnotePreviewCallbacks.add(callback);
		return () => {
			this.footnotePreviewCallbacks.delete(callback);
		};
	}

	onSelectionChange(callback: (event: ReaderSelectionChange) => void): () => void {
		this.selectionChangeCallbacks.add(callback);
		return () => {
			this.selectionChangeCallbacks.delete(callback);
		};
	}

	onHighlightClick(callback: (info: HighlightClickInfo) => void): () => void {
		this.highlightClickCallbacks.add(callback);
		return () => {
			this.highlightClickCallbacks.delete(callback);
		};
	}

	async applyHighlights(highlights: ReaderHighlight[]): Promise<void> {
		this.highlightDataMap.clear();
		const deduped = new Map<string, ReaderHighlight>();
		for (const highlight of this.dedupeHighlights(highlights)) {
			const canonical =
				(await this.parser.canonicalizeLocation(highlight.cfiRange, highlight.text)) || highlight.cfiRange;
			const normalizedHighlight = this.normalizeHighlightSources({
				...highlight,
				cfiRange: canonical,
			});
			const key = this.normalizeLocationKey(normalizedHighlight.cfiRange);
			const existing = deduped.get(key);
			deduped.set(key, existing ? this.mergeHighlights(existing, normalizedHighlight) : normalizedHighlight);
		}
		this.savedHighlights = Array.from(deduped.values());
		for (const highlight of this.savedHighlights) {
			this.highlightDataMap.set(this.normalizeLocationKey(highlight.cfiRange), highlight);
		}
		await this.refreshHighlights();
	}

	async refreshHighlights(): Promise<void> {
		await this.syncAnnotationsWithView();
	}

	addHighlight(highlight: ReaderHighlight): void {
		void this.addResolvedHighlight(highlight);
	}

	addTemporaryHighlight(highlight: ReaderHighlightInput, durationMs = 2000): void {
		void this.addResolvedHighlight({ ...highlight, temporary: true }, durationMs);
	}

	temporarilyRevealConcealedText(cfiRange: string, durationMs = 3000): void {
		const key = this.normalizeLocationKey(cfiRange);
		const highlight = this.highlightDataMap.get(key);
		if (!highlight || highlight.presentation !== "conceal") {
			return;
		}
		const existingTimer = this.temporarilyRevealedConcealmentTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		this.temporarilyRevealedConcealmentTimers.set(
			key,
			setTimeout(() => {
				this.temporarilyRevealedConcealmentTimers.delete(key);
				void this.refreshHighlights();
			}, Math.max(200, durationMs))
		);
		void this.refreshHighlights();
	}

	removeHighlight(cfiRange: string): void {
		const key = this.normalizeLocationKey(cfiRange);
		this.highlightDataMap.delete(key);
		this.temporaryHighlightDataMap.delete(key);
		this.savedHighlights = this.savedHighlights.filter(
			(item) => this.normalizeLocationKey(item.cfiRange) !== key
		);
		const timer = this.temporaryHighlightTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.temporaryHighlightTimers.delete(key);
		}
		const revealedTimer = this.temporarilyRevealedConcealmentTimers.get(key);
		if (revealedTimer) {
			clearTimeout(revealedTimer);
			this.temporarilyRevealedConcealmentTimers.delete(key);
		}
		void this.syncAnnotationsWithView();
	}

	destroy(): void {
		void this.destroyAll();
	}

	private handleRelocateEvent = (event: Event): void => {
		const detail = (event as CustomEvent<{ cfi?: string; index?: number }>).detail;
		if (!detail) {
			return;
		}

		this.notifyFootnotePreview(null);

		const target =
			detail.cfi ||
			(typeof detail.index === "number" ? this.parser.getSectionHrefByIndex(detail.index) : "") ||
			this.currentPosition.cfi;
		if (!target) {
			return;
		}

		void this.syncCurrentPositionFromTarget(target);
	};

	private handleLoadEvent = (event: Event): void => {
		const detail = (event as CustomEvent<{ doc?: Document; index?: number }>).detail;
		const doc = detail?.doc;
		if (!doc) {
			return;
		}

		const index =
			typeof detail.index === "number" ? detail.index : this.currentPosition.chapterIndex || 0;
		this.loadedDocumentSectionIndexes.set(doc, index);
		this.normalizeDocument(doc);
		this.attachSelectionListeners(doc);
		this.renderedAnnotations.clear();
		void this.syncAnnotationsWithView();
	};

	private handleDrawAnnotationEvent = (event: Event): void => {
		const detail = (event as CustomEvent<{
			draw?: (draw: (rects: unknown[], options?: unknown) => SVGElement, options?: unknown) => void;
			annotation?: FoliateAnnotation;
		}>).detail;
		if (!detail?.annotation || typeof detail.draw !== "function") {
			return;
		}
		void this.drawAnnotation(detail.annotation, detail.draw);
	};

	private handleShowAnnotationEvent = (event: Event): void => {
		const detail = (event as CustomEvent<{
			value?: string;
			index?: number;
			range?: Range;
		}>).detail;
		const value = detail?.value;
		if (!value) {
			return;
		}

		const key = this.normalizeLocationKey(value);
		const highlight = this.highlightDataMap.get(key) || this.temporaryHighlightDataMap.get(key);
		if (!highlight) {
			return;
		}

		const frame =
			this.getVisibleFramesWithIndex().find((item) => item.index === detail.index) ||
			this.getVisibleFramesWithIndex()[0];
		if (this.hasActiveReaderSelection(frame?.document)) {
			return;
		}
		const containerRect = this.renderContainer?.getBoundingClientRect();
		const rect =
			frame && detail.range
				? this.createViewportRect(frame, detail.range) || {
						top: 0,
						left: 0,
						bottom: containerRect?.height || 0,
						right: containerRect?.width || 0,
						width: containerRect?.width || 0,
						height: containerRect?.height || 0,
				  }
				: {
						top: 0,
						left: 0,
						bottom: containerRect?.height || 0,
						right: containerRect?.width || 0,
						width: containerRect?.width || 0,
						height: containerRect?.height || 0,
				  };

		const info: HighlightClickInfo = {
			cfiRange: highlight.cfiRange,
			color: highlight.color,
			style: highlight.style,
			text: highlight.text || "",
			sourceFile: highlight.sourceFile || "",
			sourceRef: highlight.sourceRef,
			excerptId: highlight.excerptId,
			sourceLocators: highlight.sourceLocators,
			createdTime: highlight.createdTime,
			temporary: highlight.temporary,
			presentation: highlight.presentation,
			rect,
		};
		this.notifyHighlightClick(info);
	};

	private async resolveNavigationRequest(
		options: ReaderNavigateOptions
	): Promise<{ canonical: string | null }> {
		const rawCfi = String(options.cfi || "").trim();
		const rawHref = String(options.href || "").trim();
		const rawTarget = rawCfi || rawHref;
		if (!rawTarget) {
			return { canonical: null };
		}

		const resolved = await this.parser.resolveNavigationTarget(rawTarget, options.text);
		const canonical = resolved?.cfi || null;
		if (!resolved && !rawHref) {
			return { canonical: null };
		}

		const viewTarget = rawHref && !rawCfi ? rawHref : canonical || rawTarget;
		const fallbackTarget =
			rawHref || resolved?.href || this.getSectionHrefFallbackTarget(canonical || rawCfi || rawTarget);
		this.clearSelections();
		await this.navigateViewWithFallback(viewTarget, fallbackTarget);
		await this.syncCurrentPositionFromTarget(canonical || rawTarget, options.text);
		return { canonical };
	}

	private async stabilizeViewAfterNavigation(target?: string): Promise<void> {
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		if (!renderer) {
			return;
		}

		if (typeof renderer.render === "function") {
			renderer.render();
		}
		await this.waitForAnimationFrame();

		if (target && this.currentFlowMode === "paginated" && this.foliateView) {
			await this.foliateView.goTo(target);
			await this.waitForAnimationFrame();
		}

		if (typeof renderer.render === "function") {
			renderer.render();
		}
	}

	private async waitForAnimationFrame(): Promise<void> {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}

	private async navigateViewWithFallback(primaryTarget?: string, fallbackTarget?: string): Promise<void> {
		const normalizedPrimaryTarget = String(primaryTarget || "").trim();
		const normalizedFallbackTarget = String(fallbackTarget || "").trim();
		if (!this.foliateView || (!normalizedPrimaryTarget && !normalizedFallbackTarget)) {
			return;
		}

		if (normalizedPrimaryTarget) {
			try {
				await this.goToAndStabilize(normalizedPrimaryTarget);
				return;
			} catch (error) {
				if (
					!normalizedFallbackTarget ||
					normalizedFallbackTarget === normalizedPrimaryTarget ||
					!this.shouldFallbackFromNavigationError(normalizedPrimaryTarget, error)
				) {
					throw error;
				}
				logger.warn("[FoliateReaderService] EPUB navigation target failed, falling back to section href:", {
					primaryTarget: normalizedPrimaryTarget,
					fallbackTarget: normalizedFallbackTarget,
					error,
				});
			}
		}

		await this.goToAndStabilize(normalizedFallbackTarget);
	}

	private async goToAndStabilize(target: string): Promise<void> {
		if (!this.foliateView) {
			return;
		}
		await this.foliateView.goTo(target);
		await this.stabilizeViewAfterNavigation(target);
	}

	private getSectionHrefFallbackTarget(...candidates: Array<string | null | undefined>): string {
		for (const candidate of candidates) {
			const normalized = String(candidate || "").trim();
			if (!normalized) {
				continue;
			}
			if (!this.isCfiLikeTarget(normalized)) {
				return normalized;
			}
			const href = this.parser.getSectionHrefForCfi(normalized);
			if (href) {
				return href;
			}
		}
		return this.currentChapterHref || this.parser.getSectionHrefByIndex(this.currentPosition.chapterIndex || 0);
	}

	private shouldFallbackFromNavigationError(target: string, error: unknown): boolean {
		if (!this.isCfiLikeTarget(target)) {
			return false;
		}
		const normalizedMessage = String((error as { message?: string } | null)?.message || "").toLowerCase();
		return (
			normalizedMessage.includes("invalid epub cfi target") ||
			normalizedMessage.includes("childnodes") ||
			normalizedMessage.includes("reading 'length'") ||
			normalizedMessage.includes('reading "length"') ||
			normalizedMessage.includes("epubcfi") ||
			normalizedMessage.includes(" cfi")
		);
	}

	private isCfiLikeTarget(target: string): boolean {
		const normalized = String(target || "").trim();
		return normalized.startsWith("epubcfi(") || /^\/\d+/.test(normalized);
	}

	private async syncCurrentPositionFromTarget(target: string, textHint?: string): Promise<void> {
		const resolved = await this.parser.resolveNavigationTarget(target, textHint);
		if (!resolved) {
			return;
		}

		const totalPages = this.parser.getTotalPositions();
		const currentPage = resolved.cfi
			? (await this.parser.resolvePageNumber(resolved.cfi)) || (totalPages > 0 ? 1 : 0)
			: totalPages > 0
			? 1
			: 0;

		let percent = 0;
		if (totalPages > 1 && currentPage > 0) {
			percent = this.clamp(((currentPage - 1) / (totalPages - 1)) * 100, 0, 100);
		} else if (resolved.doc && resolved.range) {
			const sectionProgress = this.computeSectionProgression(resolved.doc, resolved.range);
			const chapterCount = Math.max(this.parser.getMetadata().chapterCount, 1);
			percent = this.clamp(((resolved.index + sectionProgress) / chapterCount) * 100, 0, 100);
		}

		this.currentChapterTitle = this.parser.getSectionTitleByIndex(resolved.index);
		this.currentChapterHref = resolved.href;
		this.currentPosition = {
			chapterIndex: resolved.index,
			cfi: resolved.cfi || this.currentPosition.cfi,
			percent,
		};
		this.currentPaginationInfo = {
			currentPage,
			totalPages,
		};
		if (this.currentBook) {
			this.currentBook.currentPosition = { ...this.currentPosition };
		}
		for (const callback of this.relocatedCallbacks) {
			try {
				callback(this.currentPosition);
			} catch (error) {
				logger.warn("[FoliateReaderService] Relocate listener failed:", error);
			}
		}
	}

	private computeSectionProgression(doc: Document, range: Range): number {
		const root = doc.body || doc.documentElement;
		const text = root?.textContent?.replace(/\s+/g, " ").trim() || "";
		if (!text) {
			return 0;
		}
		const probe = doc.createRange();
		probe.selectNodeContents(root);
		probe.setEnd(range.startContainer, range.startOffset);
		return this.clamp(probe.toString().length / Math.max(text.length, 1), 0, 1);
	}

	private getFoliateVisibleContents(): Array<{ index?: number; doc?: Document | null }> {
		const rendererContents = (this.foliateView?.renderer as FoliateRenderer | undefined)?.getContents?.();
		if (Array.isArray(rendererContents)) {
			return rendererContents;
		}

		// Backward-compat fallback for older foliate runtimes that exposed getContents() on the view.
		const legacyView = this.foliateView as
			| (FoliateViewElement & {
					getContents?: () => Array<{ index?: number; doc?: Document | null }>;
			  })
			| null;
		const legacyContents = legacyView?.getContents?.();
		return Array.isArray(legacyContents) ? legacyContents : [];
	}

	private getVisibleFramesWithIndex(): VisibleFrameWithIndex[] {
		const contents = this.getFoliateVisibleContents();
		const visibleFrames: VisibleFrameWithIndex[] = [];

		for (const item of contents) {
			const doc = item.doc;
			if (!doc?.defaultView) {
				continue;
			}

			const index =
				typeof item.index === "number"
					? item.index
					: this.loadedDocumentSectionIndexes.get(doc) ?? this.currentPosition.chapterIndex;
			const frame = this.createReaderFrame(doc, index);
			visibleFrames.push({
				index,
				href: this.parser.getSectionHrefByIndex(index),
				document: doc,
				frameElement: (doc.defaultView.frameElement as HTMLElement | null) || null,
				frame,
			});
		}

		return visibleFrames;
	}

	private createReaderFrame(doc: Document, index: number): ReaderFrame {
		return {
			document: doc,
			window: doc.defaultView as Window,
			cfiFromRange: (range: Range) => {
				try {
					return this.parser.createCfiFromRange(index, range);
				} catch (error) {
					logger.warn("[FoliateReaderService] Failed to build CFI from range:", {
						index,
						error,
					});
					return null;
				}
			},
		};
	}

	private attachSelectionListeners(doc: Document): void {
		if (this.documentSelectionCleanups.has(doc)) {
			return;
		}

		let pendingFrame = 0;
		const scheduleEmit = () => {
			if (pendingFrame) {
				cancelAnimationFrame(pendingFrame);
			}
			pendingFrame = requestAnimationFrame(() => {
				pendingFrame = 0;
				this.emitSelectionChangeIfNeeded(doc);
			});
		};

		const onSelectionChange = () => scheduleEmit();
		const onPointerUp = () => scheduleEmit();
		const onKeyUp = () => scheduleEmit();

		doc.addEventListener("selectionchange", onSelectionChange);
		doc.addEventListener("mouseup", onPointerUp);
		doc.addEventListener("touchend", onPointerUp);
		doc.addEventListener("keyup", onKeyUp);

		const cleanup = () => {
			if (pendingFrame) {
				cancelAnimationFrame(pendingFrame);
			}
			doc.removeEventListener("selectionchange", onSelectionChange);
			doc.removeEventListener("mouseup", onPointerUp);
			doc.removeEventListener("touchend", onPointerUp);
			doc.removeEventListener("keyup", onKeyUp);
		};
		this.documentSelectionCleanups.set(doc, cleanup);
	}

	private attachFootnotePreviewListeners(doc: Document): void {
		if (this.documentFootnoteCleanups.has(doc)) {
			return;
		}

		let hoverTimer: ReturnType<typeof setTimeout> | null = null;
		let hideTimer: ReturnType<typeof setTimeout> | null = null;
		let activeAnchor: HTMLAnchorElement | null = null;

		const clearHoverTimer = () => {
			if (hoverTimer) {
				clearTimeout(hoverTimer);
				hoverTimer = null;
			}
		};

		const clearHideTimer = () => {
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
		};

		const schedulePreviewForAnchor = (anchor: HTMLAnchorElement) => {
			if (activeAnchor === anchor) {
				clearHideTimer();
				return;
			}
			activeAnchor = anchor;
			clearHoverTimer();
			clearHideTimer();
			hoverTimer = setTimeout(() => {
				hoverTimer = null;
				this.emitFootnotePreviewForAnchor(doc, anchor);
			}, 180);
		};

		const scheduleHidePreview = () => {
			clearHoverTimer();
			clearHideTimer();
			hideTimer = setTimeout(() => {
				activeAnchor = null;
				this.notifyFootnotePreview(null);
			}, 120);
		};

		const onMouseOver = (event: MouseEvent) => {
			const anchor = this.findFootnoteReference(event.target);
			if (!anchor) {
				return;
			}
			schedulePreviewForAnchor(anchor);
		};

		const onMouseOut = (event: MouseEvent) => {
			const anchor = this.findFootnoteReference(event.target);
			if (!anchor) {
				return;
			}
			const relatedAnchor = this.findFootnoteReference(event.relatedTarget);
			if (relatedAnchor === anchor) {
				return;
			}
			scheduleHidePreview();
		};

		const onFocusIn = (event: FocusEvent) => {
			const anchor = this.findFootnoteReference(event.target);
			if (!anchor) {
				return;
			}
			schedulePreviewForAnchor(anchor);
		};

		const onFocusOut = (event: FocusEvent) => {
			const anchor = this.findFootnoteReference(event.target);
			if (!anchor) {
				return;
			}
			scheduleHidePreview();
		};

		doc.addEventListener("mouseover", onMouseOver);
		doc.addEventListener("mouseout", onMouseOut);
		doc.addEventListener("focusin", onFocusIn);
		doc.addEventListener("focusout", onFocusOut);

		const cleanup = () => {
			clearHoverTimer();
			clearHideTimer();
			doc.removeEventListener("mouseover", onMouseOver);
			doc.removeEventListener("mouseout", onMouseOut);
			doc.removeEventListener("focusin", onFocusIn);
			doc.removeEventListener("focusout", onFocusOut);
		};
		this.documentFootnoteCleanups.set(doc, cleanup);
	}

	private hasNonCollapsedTextSelection(doc: Document | null | undefined): boolean {
		const selection = doc?.defaultView?.getSelection?.();
		return Boolean(
			selection
			&& !selection.isCollapsed
			&& selection.rangeCount > 0
			&& selection.toString().trim()
		);
	}

	private hasActiveReaderSelection(preferredDoc?: Document | null): boolean {
		if (this.hasNonCollapsedTextSelection(preferredDoc)) {
			return true;
		}
		for (const frame of this.getVisibleFramesWithIndex()) {
			if (frame.document === preferredDoc) {
				continue;
			}
			if (this.hasNonCollapsedTextSelection(frame.document)) {
				return true;
			}
		}
		return this.hasNonCollapsedTextSelection(document);
	}

	private emitSelectionChangeIfNeeded(doc: Document): void {
		const selection = doc.defaultView?.getSelection?.();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			this.lastSelectionByDocument.delete(doc);
			return;
		}

		const range = selection.getRangeAt(0);
		const text = selection.toString().trim();
		if (!text) {
			this.lastSelectionByDocument.delete(doc);
			return;
		}

		const frame = this.getVisibleFramesWithIndex().find((item) => item.document === doc);
		if (!frame) {
			return;
		}
		const cfiRange = frame.frame.cfiFromRange(range.cloneRange());
		if (!cfiRange) {
			return;
		}

		const lastCfi = this.lastSelectionByDocument.get(doc);
		if (lastCfi === cfiRange) {
			return;
		}
		this.lastSelectionByDocument.set(doc, cfiRange);
		this.notifySelectionChange(cfiRange, frame.frame);
	}

	private applyRenderOptions(options?: ReaderRenderOptions): void {
		this.currentFlowMode = options?.flow === "scrolled" ? "scrolled" : this.currentFlowMode;
		this.currentLayoutMode = options?.spread === "always" ? "double" : this.currentLayoutMode;
		this.currentWidthMode = options?.widthMode || this.currentWidthMode;
		if (typeof options?.lineHeight === "number" && options.lineHeight > 0) {
			this.currentLineHeight = options.lineHeight;
		}
		if (typeof options?.letterSpacing === "number" && Number.isFinite(options.letterSpacing)) {
			this.currentLetterSpacing = options.letterSpacing;
		}
		if (typeof options?.pageMargin === "number" && Number.isFinite(options.pageMargin)) {
			this.currentPageMargin = options.pageMargin;
		}
		if (options?.strikethroughPresentation) {
			this.currentStrikethroughPresentation = options.strikethroughPresentation;
		}
	}

	private applyRendererLayout(): void {
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		if (!renderer) {
			return;
		}

		const tagName = renderer.tagName.toLowerCase();
		if (tagName === "foliate-paginator") {
			renderer.setAttribute("flow", this.currentFlowMode === "scrolled" ? "scrolled" : "paginated");
			renderer.setAttribute("max-column-count", this.currentLayoutMode === "double" ? "2" : "1");
			renderer.setAttribute("max-inline-size", this.currentWidthMode === "full" ? "920px" : "720px");
			renderer.setAttribute("max-block-size", "1440px");
			renderer.setAttribute("margin", `${Math.round(this.currentPageMargin)}px`);
			renderer.setAttribute(
				"gap",
				this.currentFlowMode === "scrolled"
					? "4%"
					: this.currentLayoutMode === "double"
					? "10%"
					: "7%"
			);
			renderer.setAttribute("animated", "");
			renderer.render?.();
			return;
		}

		if (tagName === "foliate-fxl") {
			renderer.setAttribute("zoom", this.currentWidthMode === "full" ? "fit-width" : "fit-page");
		}
	}

	private applyRendererAppearance(): void {
		const renderer = this.foliateView?.renderer as FoliateRenderer | undefined;
		const styles = this.buildReaderStyles();
		renderer?.setStyles?.(styles);
		for (const frame of this.getVisibleFramesWithIndex()) {
			this.normalizeDocument(frame.document);
		}
	}

	private buildReaderStyles(): string {
		const background = this.getObsidianCSSVar("--background-primary", "rgb(255, 255, 255)");
		const textColor = this.getObsidianCSSVar("--text-normal", "rgb(28, 29, 31)");
		const linkColor = this.getObsidianCSSVar("--link-color", "rgb(80, 110, 214)");
		const selectionBackground = this.getObsidianCSSVar(
			"--text-selection",
			"rgba(120, 140, 255, 0.32)"
		);
		const selectionTextColor = this.getObsidianCSSVar("--text-on-accent", textColor);
		const fontFamily = this.getObsidianFontStack();
		const monospaceFontFamily = this.getObsidianMonospaceFontStack();
		const fontSize = this.getObsidianTextFontSize();
		const colorScheme = this.getCurrentColorScheme();
		const concealment = this.getConcealmentPalette();
		const highlightOpacity = FoliateReaderService.HIGHLIGHT_OPACITY_MAP[colorScheme];
		const highlightBlendMode = FoliateReaderService.HIGHLIGHT_BLEND_MODE_MAP[colorScheme];
		const letterSpacing = `${this.currentLetterSpacing.toFixed(3)}em`;
		const horizontalPageMargin = `${Math.max(0, Math.round(this.currentPageMargin))}px`;

		return `:root {
	color-scheme: ${colorScheme};
	--overlayer-highlight-opacity: ${highlightOpacity};
	--overlayer-highlight-blend-mode: ${highlightBlendMode};
	--weave-reader-font-family: ${fontFamily};
	--weave-reader-monospace-font-family: ${monospaceFontFamily};
	--weave-reader-font-size: ${fontSize};
	--weave-reader-letter-spacing: ${letterSpacing};
	--weave-reader-page-margin-inline: ${horizontalPageMargin};
}
html {
	background: ${background} !important;
	color: ${textColor} !important;
	font-family: var(--weave-reader-font-family) !important;
	font-size: var(--weave-reader-font-size) !important;
	line-height: ${this.currentLineHeight} !important;
	letter-spacing: var(--weave-reader-letter-spacing) !important;
	-webkit-text-size-adjust: 100%;
}
body {
	background: transparent !important;
	color: ${textColor} !important;
	font-family: var(--weave-reader-font-family) !important;
	font-size: inherit !important;
	line-height: inherit !important;
	letter-spacing: inherit !important;
	margin: 0 var(--weave-reader-page-margin-inline) !important;
	text-rendering: optimizeLegibility;
	font-kerning: normal;
}
body :is(article, section, main, aside, header, footer, nav, p, div, span, li, dd, dt, blockquote, figcaption, td, th, caption, label, legend) {
	font-family: inherit !important;
	font-size: inherit !important;
	letter-spacing: inherit !important;
}
body :is(p, div, li, dd, dt, blockquote, figcaption) {
	line-height: inherit !important;
}
body :is(h1, h2, h3, h4, h5, h6) {
	font-family: inherit !important;
	line-height: inherit !important;
}
body :is(p, div, span, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, td, th, caption, label, legend) {
	color: inherit;
}
body :is(a, a:link, a:visited) {
	color: ${linkColor} !important;
	font-family: inherit !important;
	font-size: inherit !important;
}
body :is(pre, code, kbd, samp) {
	font-family: var(--weave-reader-monospace-font-family) !important;
	white-space: pre-wrap !important;
	word-break: break-word;
}
body :is(img, svg, video, canvas) {
	max-width: 100% !important;
	height: auto !important;
}
body ::selection {
	background: ${selectionBackground} !important;
	color: ${selectionTextColor} !important;
}
body .weave-foliate-concealment {
	fill: ${concealment.base};
	stroke: ${concealment.border};
	stroke-width: 1;
}`;
	}

	private async syncAnnotationsWithView(): Promise<void> {
		const view = this.foliateView;
		if (!view) {
			this.renderedAnnotations.clear();
			return;
		}

		const visibleFrames = this.getVisibleFramesWithIndex();
		const visibleIndexes = new Set(visibleFrames.map((item) => item.index));
		const desiredVisible = new Map<string, RenderedFoliateAnnotation>();

		const highlightKeys = new Set([
			...this.highlightDataMap.keys(),
			...this.temporaryHighlightDataMap.keys(),
		]);

		for (const key of highlightKeys) {
			const persistentHighlight = this.highlightDataMap.get(key);
			const temporaryHighlight = this.temporaryHighlightDataMap.get(key);
			const visibleHighlight = temporaryHighlight || persistentHighlight;
			if (!visibleHighlight) {
				continue;
			}
			const sectionIndex = this.parser.getSectionIndexForCfi(visibleHighlight.cfiRange);
			if (sectionIndex === null || !visibleIndexes.has(sectionIndex)) {
				continue;
			}
			desiredVisible.set(
				key,
				this.createRenderedAnnotation(persistentHighlight, temporaryHighlight)
			);
		}

		for (const [key, rendered] of Array.from(this.renderedAnnotations.entries())) {
			const desired = desiredVisible.get(key);
			if (
				!desired ||
				rendered.renderSignature !== desired.renderSignature ||
				!this.isSameAnnotation(rendered.annotation, desired.annotation)
			) {
				try {
					await view.deleteAnnotation(rendered.annotation);
				} catch (error) {
					logger.debugWithTag("FoliateReaderService", "Failed to delete foliate annotation", {
						key,
						error,
					});
				}
				this.renderedAnnotations.delete(key);
			}
		}

		for (const [key, rendered] of desiredVisible.entries()) {
			if (this.renderedAnnotations.has(key)) {
				continue;
			}
			try {
				await view.addAnnotation(rendered.annotation);
				this.renderedAnnotations.set(key, rendered);
			} catch (error) {
				logger.warn("[FoliateReaderService] Failed to add foliate annotation:", {
					key,
					error,
				});
			}
		}
	}

	private createAnnotation(highlight: ReaderHighlight): FoliateAnnotation {
		return {
			...highlight,
			value: highlight.cfiRange,
		};
	}

	private createRenderedAnnotation(
		persistentHighlight?: ReaderHighlight,
		temporaryHighlight?: ReaderHighlight
	): RenderedFoliateAnnotation {
		const annotation = this.createAnnotation(
			this.composeVisibleAnnotationHighlight(persistentHighlight, temporaryHighlight)
		);
		return {
			annotation,
			renderSignature: this.getAnnotationRenderSignature(annotation),
		};
	}

	private shouldRenderAnnotationAsConceal(annotation: Pick<FoliateAnnotation, "cfiRange" | "presentation" | "style">): boolean {
		if (annotation.presentation === "conceal") {
			return true;
		}
		return annotation.style === "strikethrough" && this.currentStrikethroughPresentation === "conceal";
	}

	private composeVisibleAnnotationHighlight(
		persistentHighlight?: ReaderHighlight,
		temporaryHighlight?: ReaderHighlight
	): FoliateAnnotation {
		if (persistentHighlight && temporaryHighlight) {
			return {
				...persistentHighlight,
				value: persistentHighlight.cfiRange,
				focusColor: temporaryHighlight.color,
			};
		}

		const highlight = temporaryHighlight || persistentHighlight;
		if (!highlight) {
			throw new Error("Cannot compose annotation without a highlight");
		}

		return this.createAnnotation(highlight);
	}

	private async drawAnnotation(
		annotation: FoliateAnnotation,
		draw: (draw: (rects: unknown[], options?: unknown) => SVGElement, options?: unknown) => void
	): Promise<void> {
		if (this.shouldRenderAnnotationAsConceal(annotation)) {
			const key = this.normalizeLocationKey(annotation.cfiRange);
			if (!this.temporarilyRevealedConcealmentTimers.has(key)) {
				draw((rects) => this.createConcealmentOverlay(rects));
				return;
			}
		}

		if (annotation.style) {
			const annotationStyle = annotation.style;
			draw((rects) => this.createStyledAnnotationOverlay(rects, annotationStyle, annotation.color));
			if (annotation.focusColor) {
				const focusColor = annotation.focusColor;
				draw((rects) => this.createTemporaryFocusOverlay(rects, focusColor));
			}
			return;
		}

		const overlayer = await this.getOverlayerModule();
		draw((rects, options) => overlayer.Overlayer.highlight(rects, options), {
			color: this.resolveHighlightTint(annotation.color),
			padding: 1,
		});

		if (annotation.focusColor) {
			const focusColor = annotation.focusColor;
			draw((rects) => this.createTemporaryFocusOverlay(rects, focusColor));
		}
	}

	private createConcealmentOverlay = (rects: unknown[]): SVGElement => {
		const palette = this.getConcealmentPalette();
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");

		for (const rect of rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>) {
			const background = document.createElementNS(svgNS, "rect");
			background.setAttribute("x", String(rect.left));
			background.setAttribute("y", String(rect.top));
			background.setAttribute("width", String(rect.width));
			background.setAttribute("height", String(rect.height));
			background.setAttribute("rx", "4");
			background.setAttribute("fill", palette.base);
			background.setAttribute("stroke", palette.border);
			group.appendChild(background);

			const stripeWidth = 9;
			for (let x = rect.left; x < rect.left + rect.width; x += stripeWidth * 2) {
				const stripe = document.createElementNS(svgNS, "rect");
				stripe.setAttribute("x", String(x));
				stripe.setAttribute("y", String(rect.top));
				stripe.setAttribute("width", String(Math.min(stripeWidth, rect.left + rect.width - x)));
				stripe.setAttribute("height", String(rect.height));
				stripe.setAttribute("fill", palette.stripe);
				stripe.setAttribute("opacity", "0.92");
				group.appendChild(stripe);
			}
		}

		return group;
	};

	private createStyledAnnotationOverlay = (
		rects: unknown[],
		style: EpubHighlightStyle,
		color?: string
	): SVGElement => {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");
		const strokeColor = this.resolveHighlightTint(color);
		for (const rect of rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>) {
			if (rect.width <= 0 || rect.height <= 0) {
				continue;
			}
			if (style === "underline") {
				group.appendChild(this.createStraightLineOverlay(rect, strokeColor, rect.top + rect.height - 1.5));
				continue;
			}
			if (style === "strikethrough") {
				group.appendChild(this.createStraightLineOverlay(rect, strokeColor, rect.top + rect.height * 0.58));
				continue;
			}
			group.appendChild(this.createWavyLineOverlay(rect, strokeColor));
		}
		return group;
	};

	private createStraightLineOverlay(
		rect: { left: number; top: number; width: number; height: number },
		strokeColor: string,
		y: number
	): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const line = document.createElementNS(svgNS, "line");
		line.setAttribute("x1", String(rect.left));
		line.setAttribute("y1", String(y));
		line.setAttribute("x2", String(rect.left + rect.width));
		line.setAttribute("y2", String(y));
		line.setAttribute("stroke", strokeColor);
		line.setAttribute("stroke-width", String(Math.max(1.5, Math.min(2.6, rect.height * 0.11))));
		line.setAttribute("stroke-linecap", "round");
		line.setAttribute("stroke-opacity", "0.96");
		return line;
	}

	private createWavyLineOverlay(
		rect: { left: number; top: number; width: number; height: number },
		strokeColor: string
	): SVGElement {
		const svgNS = "http://www.w3.org/2000/svg";
		const path = document.createElementNS(svgNS, "path");
		const baseY = rect.top + rect.height - 2;
		const amplitude = Math.max(1.2, Math.min(2.8, rect.height * 0.12));
		const wavelength = Math.max(6, Math.min(12, rect.height * 0.8));
		let currentX = rect.left;
		let d = `M ${rect.left} ${baseY}`;
		while (currentX < rect.left + rect.width) {
			const nextX = Math.min(currentX + wavelength, rect.left + rect.width);
			const midX = currentX + (nextX - currentX) / 2;
			d += ` Q ${currentX + wavelength * 0.25} ${baseY - amplitude}, ${midX} ${baseY}`;
			d += ` Q ${currentX + wavelength * 0.75} ${baseY + amplitude}, ${nextX} ${baseY}`;
			currentX = nextX;
		}
		path.setAttribute("d", d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", strokeColor);
		path.setAttribute("stroke-width", String(Math.max(1.4, Math.min(2.2, rect.height * 0.1))));
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		path.setAttribute("stroke-opacity", "0.96");
		return path;
	}

	private createTemporaryFocusOverlay = (rects: unknown[], color: string): SVGElement => {
		const svgNS = "http://www.w3.org/2000/svg";
		const group = document.createElementNS(svgNS, "g");
		const strokeColor = this.resolveHighlightTint(color);

		for (const rect of rects as Array<{
			left: number;
			top: number;
			width: number;
			height: number;
		}>) {
			const outline = document.createElementNS(svgNS, "rect");
			outline.setAttribute("x", String(rect.left - 1.5));
			outline.setAttribute("y", String(rect.top - 1.5));
			outline.setAttribute("width", String(rect.width + 3));
			outline.setAttribute("height", String(rect.height + 3));
			outline.setAttribute("rx", "5");
			outline.setAttribute("fill", "none");
			outline.setAttribute("stroke", strokeColor);
			outline.setAttribute("stroke-width", "2");
			outline.setAttribute("stroke-opacity", "0.95");
			group.appendChild(outline);
		}

		return group;
	};

	private async addResolvedHighlight(
		highlight: ReaderHighlight,
		durationMs?: number
	): Promise<void> {
		const canonical =
			(await this.parser.canonicalizeLocation(highlight.cfiRange, highlight.text)) || highlight.cfiRange;
		const normalizedHighlight = this.normalizeHighlightSources({ ...highlight, cfiRange: canonical });
		const key = this.normalizeLocationKey(normalizedHighlight.cfiRange);

		const existingTimer = this.temporaryHighlightTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.temporaryHighlightTimers.delete(key);
		}

		if (normalizedHighlight.temporary) {
			const existingTemporaryHighlight = this.temporaryHighlightDataMap.get(key);
			this.temporaryHighlightDataMap.set(
				key,
				existingTemporaryHighlight
					? this.mergeHighlights(existingTemporaryHighlight, normalizedHighlight)
					: normalizedHighlight
			);
			await this.refreshHighlights();

			if (typeof durationMs === "number" && durationMs > 0) {
				const timer = setTimeout(() => {
					this.temporaryHighlightTimers.delete(key);
					this.removeTemporaryHighlight(normalizedHighlight.cfiRange);
				}, durationMs);
				this.temporaryHighlightTimers.set(key, timer);
			}
			return;
		}

		const deduped = new Map<string, ReaderHighlight>();
		for (const item of this.savedHighlights) {
			deduped.set(this.normalizeLocationKey(item.cfiRange), item);
		}
		const existingHighlight = deduped.get(key);
		const mergedHighlight = existingHighlight
			? this.mergeHighlights(existingHighlight, normalizedHighlight)
			: normalizedHighlight;
		deduped.set(
			key,
			mergedHighlight
		);
		this.highlightDataMap.set(key, mergedHighlight);
		this.savedHighlights = Array.from(deduped.values());
		await this.refreshHighlights();
	}

	private removeTemporaryHighlight(cfiRange: string): void {
		const key = this.normalizeLocationKey(cfiRange);
		const existingTimer = this.temporaryHighlightTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.temporaryHighlightTimers.delete(key);
		}
		this.temporaryHighlightDataMap.delete(key);
		void this.syncAnnotationsWithView();
	}

	private dedupeHighlights(highlights: ReaderHighlight[]): ReaderHighlight[] {
		const deduped = new Map<string, ReaderHighlight>();
		for (const highlight of highlights) {
			const normalized = this.normalizeHighlightSources(highlight);
			const key = this.normalizeLocationKey(normalized.cfiRange);
			const existing = deduped.get(key);
			deduped.set(key, existing ? this.mergeHighlights(existing, normalized) : normalized);
		}
		return Array.from(deduped.values());
	}

	private collectHighlightSourceLocators(highlight: {
		sourceFile?: string;
		sourceRef?: string;
		excerptId?: string;
		sourceLocators?: HighlightSourceLocator[];
	}): HighlightSourceLocator[] {
		const locators: HighlightSourceLocator[] = [];
		const primarySourceFile = String(highlight.sourceFile || "").trim();
		if (primarySourceFile) {
			locators.push({
				sourceFile: primarySourceFile,
				sourceRef: highlight.sourceRef,
				...(highlight.excerptId ? { excerptId: highlight.excerptId } : {}),
			});
		}
		for (const locator of highlight.sourceLocators || []) {
			const sourceFile = String(locator?.sourceFile || "").trim();
			if (!sourceFile) continue;
			locators.push({
				sourceFile,
				sourceRef: locator.sourceRef,
				...(locator.excerptId ? { excerptId: locator.excerptId } : {}),
			});
		}
		return this.mergeHighlightSourceLocators([], locators);
	}

	private mergeHighlightSourceLocators(
		existing: HighlightSourceLocator[],
		incoming: HighlightSourceLocator[]
	): HighlightSourceLocator[] {
		const merged = new Map<string, HighlightSourceLocator>();
		for (const locator of [...existing, ...incoming]) {
			const sourceFile = String(locator?.sourceFile || "").trim();
			if (!sourceFile) continue;
			const normalizedRef = String(locator?.sourceRef || "").trim();
			const normalizedExcerptId = String(locator?.excerptId || "").trim();
			const key = `${sourceFile}::${normalizedRef}::${normalizedExcerptId}`;
			if (!merged.has(key)) {
				merged.set(key, {
					sourceFile,
					sourceRef: normalizedRef || undefined,
					...(normalizedExcerptId ? { excerptId: normalizedExcerptId } : {}),
				});
			}
		}
		return Array.from(merged.values());
	}

	private selectPrimarySourceLocator(locators: HighlightSourceLocator[]): HighlightSourceLocator | null {
		if (locators.length === 0) {
			return null;
		}

		const cardLocator = locators.find(
			(locator) => typeof locator.sourceRef === "string" && locator.sourceRef.startsWith("card:")
		);
		if (cardLocator) {
			return cardLocator;
		}

		const referencedLocator = locators.find(
			(locator) => typeof locator.sourceRef === "string" && locator.sourceRef.trim().length > 0
		);
		if (referencedLocator) {
			return referencedLocator;
		}

		const markdownLocator = locators.find((locator) => locator.sourceFile.endsWith(".md"));
		if (markdownLocator) {
			return markdownLocator;
		}

		const canvasLocator = locators.find((locator) => locator.sourceFile.endsWith(".canvas"));
		if (canvasLocator) {
			return canvasLocator;
		}

		const wdeckLocator = locators.find((locator) => locator.sourceFile.endsWith(".wdeck"));
		if (wdeckLocator) {
			return wdeckLocator;
		}

		const jsonLocator = locators.find((locator) => locator.sourceFile.endsWith(".json"));
		if (jsonLocator) {
			return jsonLocator;
		}

		return locators[0] || null;
	}

	private normalizeHighlightSources(highlight: ReaderHighlight): ReaderHighlight {
		const sourceLocators = this.collectHighlightSourceLocators(highlight);
		const primaryLocator = this.selectPrimarySourceLocator(sourceLocators);
		return {
			...highlight,
			sourceFile: primaryLocator?.sourceFile || highlight.sourceFile,
			sourceRef: primaryLocator?.sourceRef || highlight.sourceRef,
			excerptId: primaryLocator?.excerptId || highlight.excerptId,
			sourceLocators,
		};
	}

	private mergeHighlights(existing: ReaderHighlight, incoming: ReaderHighlight): ReaderHighlight {
		const sourceLocators = this.mergeHighlightSourceLocators(
			this.collectHighlightSourceLocators(existing),
			this.collectHighlightSourceLocators(incoming)
		);
		const primaryLocator = this.selectPrimarySourceLocator(sourceLocators);
		return {
			...existing,
			...incoming,
			sourceFile: primaryLocator?.sourceFile || incoming.sourceFile || existing.sourceFile,
			sourceRef: primaryLocator?.sourceRef || incoming.sourceRef || existing.sourceRef,
			excerptId: primaryLocator?.excerptId || incoming.excerptId || existing.excerptId,
			sourceLocators,
		};
	}

	private normalizeLocationKey(value: string): string {
		return this.normalizeLocationString(value).toLowerCase();
	}

	private normalizeLocationString(value: string): string {
		let normalized = String(value || "")
			.replace(/%5B/gi, "[")
			.replace(/%5D/gi, "]")
			.replace(/%7C/gi, "|")
			.trim();
		if (normalized.includes("%")) {
			try {
				normalized = decodeURIComponent(normalized);
			} catch (_error) {
				// Keep the original string when decoding fails.
			}
		}
		return normalized;
	}

	private normalizeDocument(doc: Document): void {
		if (!doc.documentElement) {
			return;
		}

		doc.documentElement.lang ||= this.currentBook?.metadata.language || "";
		const parserBook = this.parser.getBook();
		if (!doc.documentElement.dir && typeof parserBook.dir === "string") {
			doc.documentElement.dir = parserBook.dir;
		}

		const parent = doc.head || doc.documentElement;
		if (!parent) {
			return;
		}

		let styleElement = this.documentStyleElements.get(doc);
		if (!styleElement || !styleElement.isConnected) {
			styleElement = doc.createElement("link");
			styleElement.setAttribute("rel", "stylesheet");
			styleElement.setAttribute("type", "text/css");
			styleElement.setAttribute("data-weave-foliate-reader-style", "true");
			parent.appendChild(styleElement);
			this.documentStyleElements.set(doc, styleElement);
		}
		styleElement.setAttribute("href", createCssDataUrl(this.buildReaderStyles()));
		this.attachFootnotePreviewListeners(doc);
	}

	private findFootnoteReference(target: EventTarget | null): HTMLAnchorElement | null {
		const originElement = this.getElementFromEventTarget(target);
		if (!originElement || typeof originElement.closest !== "function") {
			return null;
		}
		const anchor = originElement.closest("a[href]");
		if (!anchor || anchor.tagName.toLowerCase() !== "a") {
			return null;
		}
		return this.isFootnoteReference(anchor as HTMLAnchorElement) ? (anchor as HTMLAnchorElement) : null;
	}

	private getElementFromEventTarget(target: EventTarget | null): Element | null {
		if (!target) {
			return null;
		}
		const candidate = target as { nodeType?: number; parentElement?: Element | null };
		if (candidate.nodeType === 1) {
			return target as Element;
		}
		if (candidate.nodeType === 3) {
			return candidate.parentElement ?? null;
		}
		return null;
	}

	private isFootnoteReference(anchor: HTMLAnchorElement): boolean {
		const href = String(anchor.getAttribute("href") || "").trim();
		if (!href.includes("#")) {
			return false;
		}
		const signals = [
			anchor.getAttribute("role") || "",
			anchor.getAttribute("epub:type") || "",
			anchor.getAttribute("type") || "",
			anchor.className || "",
		].join(" ").toLowerCase();
		if (
			signals.includes("noteref") ||
			signals.includes("footnote") ||
			signals.includes("endnote")
		) {
			return true;
		}
		return Boolean(anchor.closest("sup")) && (/^#/.test(href) || /#(?:fn|note)/i.test(href));
	}

	private emitFootnotePreviewForAnchor(doc: Document, anchor: HTMLAnchorElement): void {
		void (async () => {
			const info = await this.buildFootnotePreviewInfo(doc, anchor);
			logger.debugWithTag("FoliateReaderService", "Resolved footnote preview payload", {
				href: anchor.getAttribute("href") || "",
				hasInfo: Boolean(info),
				textLength: info?.text.length || 0,
			});
			this.notifyFootnotePreview(info);
		})();
	}

	private async buildFootnotePreviewInfo(
		doc: Document,
		anchor: HTMLAnchorElement
	): Promise<ReaderFootnotePreviewInfo | null> {
		const href = String(anchor.getAttribute("href") || "").trim();
		if (!href) {
			logger.debugWithTag("FoliateReaderService", "Skipped footnote preview because anchor href is empty");
			return null;
		}
		const footnoteTarget = await this.findFootnoteTarget(doc, href);
		if (!footnoteTarget) {
			logger.debugWithTag("FoliateReaderService", "Skipped footnote preview because no target element was found", {
				href,
			});
			return null;
		}
		const rect = this.createViewportRectFromElement(doc, anchor);
		if (!rect) {
			logger.debugWithTag("FoliateReaderService", "Skipped footnote preview because anchor rect was empty", {
				href,
			});
			return null;
		}
		const previewElement = this.resolveFootnotePreviewContentElement(footnoteTarget);
		if (!previewElement) {
			logger.debugWithTag("FoliateReaderService", "Skipped footnote preview because target did not resolve to a readable container", {
				href,
				tagName: footnoteTarget.tagName,
			});
			return null;
		}
		const clone = previewElement.cloneNode(true) as HTMLElement;
		clone
			.querySelectorAll("a.footnote-backref, a[href*='#fnref'], a[href*='#ref'], [role='doc-backlink']")
			.forEach((element) => element.remove());
		const normalizedText = clone.textContent?.replace(/\s+/g, " ").trim() || "";
		if (!normalizedText) {
			logger.debugWithTag("FoliateReaderService", "Skipped footnote preview because normalized footnote text was empty", {
				href,
				tagName: previewElement.tagName,
			});
			return null;
		}
		const label = String(anchor.textContent || "").replace(/\s+/g, " ").trim() || "脚注";
		return {
			href,
			label,
			text: normalizedText.length > 220 ? `${normalizedText.slice(0, 220).trimEnd()}…` : normalizedText,
			rect,
		};
	}

	private resolveFootnotePreviewContentElement(target: Element): Element | null {
		const containerSelector = [
			"li",
			"aside",
			"section",
			"dd",
			"blockquote",
			"p",
			"[role='doc-footnote']",
			"[epub\\:type*='footnote']",
			"[epub\\:type*='endnote']",
			"[type*='footnote']",
			"[type*='endnote']",
			"[class*='footnote']",
			"[class*='endnote']",
		].join(", ");
		const candidates = [
			target,
			target.closest(containerSelector),
			target.parentElement,
			target.parentElement?.closest(containerSelector),
			target.nextElementSibling,
			target.parentElement?.nextElementSibling,
		].filter((candidate): candidate is Element => Boolean(candidate));
		const uniqueCandidates = Array.from(new Set(candidates));
		for (const candidate of uniqueCandidates) {
			const clone = candidate.cloneNode(true) as HTMLElement;
			clone
				.querySelectorAll("a.footnote-backref, a[href*='#fnref'], a[href*='#ref'], [role='doc-backlink']")
				.forEach((element) => element.remove());
			const normalizedText = clone.textContent?.replace(/\s+/g, " ").trim() || "";
			if (normalizedText) {
				return candidate;
			}
		}
		return null;
	}

	private async findFootnoteTarget(doc: Document, href: string): Promise<Element | null> {
		const fragment = this.extractHrefFragment(href);
		if (!fragment) {
			return null;
		}
		const visibleFrames = this.getVisibleFramesWithIndex();
		const currentSectionIndex = this.loadedDocumentSectionIndexes.get(doc);
		const currentSectionHref =
			typeof currentSectionIndex === "number"
				? this.parser.getSectionHrefByIndex(currentSectionIndex)
				: this.currentChapterHref;
		const preferredPath = this.extractHrefPath(href, currentSectionHref);
		const candidateFrames = preferredPath
			? visibleFrames.filter((frame) => frame.href.endsWith(preferredPath) || preferredPath.endsWith(frame.href))
			: [];
		const documents = [
			doc,
			...candidateFrames.map((frame) => frame.document),
			...visibleFrames.map((frame) => frame.document).filter((frameDoc) => frameDoc !== doc),
		];
		for (const frameDoc of documents) {
			const element = this.findFootnoteTargetInDocument(frameDoc, fragment);
			if (element) {
				logger.debugWithTag("FoliateReaderService", "Matched footnote target in visible document", {
					href,
					fragment,
					tagName: element.tagName,
				});
				return element;
			}
		}
		if (preferredPath) {
			const externalDoc = await this.parser.getRawDocumentByHref(preferredPath);
			if (externalDoc) {
				const element = this.findFootnoteTargetInDocument(externalDoc, fragment);
				if (element) {
					logger.debugWithTag("FoliateReaderService", "Matched footnote target in external document", {
						href,
						fragment,
						preferredPath,
						tagName: element.tagName,
					});
					return element;
				}
			}
		}
		logger.debugWithTag("FoliateReaderService", "Failed to resolve footnote target from any document", {
			href,
			fragment,
			preferredPath,
		});
		return null;
	}

	private extractHrefPath(href: string, baseHref = this.currentChapterHref): string {
		const hashIndex = href.indexOf("#");
		if (hashIndex <= 0) {
			return "";
		}
		const rawPath = href.slice(0, hashIndex).split(/[?#]/)[0].trim();
		if (!rawPath) {
			return "";
		}
		return this.parser.resolveHrefAgainst(baseHref || rawPath, rawPath);
	}

	private extractHrefFragment(href: string): string {
		const hashIndex = href.indexOf("#");
		if (hashIndex < 0 || hashIndex === href.length - 1) {
			return "";
		}
		const fragment = href.slice(hashIndex + 1).trim();
		if (!fragment) {
			return "";
		}
		try {
			return decodeURIComponent(fragment);
		} catch (_error) {
			return fragment;
		}
	}

	private findFootnoteTargetInDocument(doc: Document, fragment: string): Element | null {
		const directMatch = doc.getElementById(fragment);
		if (directMatch && directMatch.nodeType === 1) {
			return directMatch;
		}
		const escapedFragment = typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(fragment)
			: fragment.replace(/([\[\]#.;?+*~':"!^$()=>|/@])/g, "\\$1");
		const selectorMatches = [
			`[id="${escapedFragment}"]`,
			`li[id="${escapedFragment}"]`,
			`aside[id="${escapedFragment}"]`,
			`section[id="${escapedFragment}"]`,
			`[data-footnote-id="${escapedFragment}"]`,
			`a[name="${escapedFragment}"]`,
		];
		for (const selector of selectorMatches) {
			const match = doc.querySelector(selector);
			if (match && match.nodeType === 1) {
				return match;
			}
		}
		return null;
	}

	private createViewportRectFromElement(
		doc: Document,
		element: Element
	): ReaderFootnotePreviewInfo["rect"] | null {
		const elementRect = element.getBoundingClientRect?.();
		if (!elementRect || (!elementRect.width && !elementRect.height)) {
			return null;
		}
		const frame = this.getVisibleFramesWithIndex().find((item) => item.document === doc);
		const iframeRect = frame?.frameElement?.getBoundingClientRect();
		if (!iframeRect) {
			return {
				top: elementRect.top,
				left: elementRect.left,
				bottom: elementRect.bottom,
				right: elementRect.right,
				width: elementRect.width,
				height: elementRect.height,
			};
		}
		return {
			top: elementRect.top + iframeRect.top,
			left: elementRect.left + iframeRect.left,
			bottom: elementRect.bottom + iframeRect.top,
			right: elementRect.right + iframeRect.left,
			width: elementRect.width,
			height: elementRect.height,
		};
	}

	private notifyFootnotePreview(info: ReaderFootnotePreviewInfo | null): void {
		for (const callback of this.footnotePreviewCallbacks) {
			try {
				callback(info);
			} catch (error) {
				logger.warn("[FoliateReaderService] Footnote preview listener failed:", error);
			}
		}
	}

	private createViewportRect(
		frame: VisibleFrameWithIndex,
		range: Range
	): HighlightClickInfo["rect"] | null {
		const rangeRect = range.getBoundingClientRect?.();
		if (!rangeRect || (!rangeRect.width && !rangeRect.height)) {
			return null;
		}

		const iframe = frame.frameElement;
		if (!iframe) {
			return {
				top: rangeRect.top,
				left: rangeRect.left,
				bottom: rangeRect.bottom,
				right: rangeRect.right,
				width: rangeRect.width,
				height: rangeRect.height,
			};
		}

		const iframeRect = iframe.getBoundingClientRect();
		return {
			top: rangeRect.top + iframeRect.top,
			left: rangeRect.left + iframeRect.left,
			bottom: rangeRect.bottom + iframeRect.top,
			right: rangeRect.right + iframeRect.left,
			width: rangeRect.width,
			height: rangeRect.height,
		};
	}

	private clearSelections(): void {
		try {
			window.getSelection?.()?.removeAllRanges();
		} catch (_error) {
			// Ignore host-window selection cleanup failures.
		}
		for (const frame of this.getVisibleFramesWithIndex()) {
			try {
				frame.frame.window.getSelection?.()?.removeAllRanges();
			} catch (_error) {
				// Ignore transient frame cleanup failures.
			}
		}
	}

	private async ensureFoliateViewRegistered(): Promise<void> {
		this.ensureDesktopFoliateIframeSandboxPatch();
		this.ensureMobileBlobIframeFallback();
		if (customElements.get("foliate-view")) {
			return;
		}
		await import("foliate-js/view.js");
	}

	private ensureDesktopFoliateIframeSandboxPatch(): void {
		if (
			Platform.isMobile ||
			FoliateReaderService.desktopFoliateIframeSandboxPatchInstalled ||
			typeof HTMLIFrameElement === "undefined"
		) {
			return;
		}

		if (typeof Element.prototype.setAttribute !== "function") {
			logger.warn(
				"[FoliateReaderService] Unable to install desktop foliate iframe sandbox patch because setAttribute is unavailable."
			);
			return;
		}

		HTMLIFrameElement.prototype.setAttribute = function (
			qualifiedName: string,
			value: string
		): void {
			const normalizedValue = FoliateReaderService.normalizeDesktopFoliateSandboxValue(
				qualifiedName,
				value,
				new Error().stack || ""
			);
			Element.prototype.setAttribute.call(this, qualifiedName, normalizedValue ?? value);
		};

		FoliateReaderService.desktopFoliateIframeSandboxPatchInstalled = true;
	}

	private static normalizeDesktopFoliateSandboxValue(
		attributeName: string,
		value: string,
		stack: string
	): string | null {
		if (Platform.isMobile || String(attributeName || "").toLowerCase() !== "sandbox") {
			return null;
		}
		if (!/foliate-js[\\/](?:paginator|fixed-layout)\.js/i.test(String(stack || ""))) {
			return null;
		}
		const tokens = String(value || "")
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!tokens.includes("allow-same-origin") || !tokens.includes("allow-scripts")) {
			return null;
		}
		const nextTokens = tokens.filter((token) => token !== "allow-scripts");
		return nextTokens.length > 0 ? nextTokens.join(" ") : null;
	}

	private ensureMobileBlobIframeFallback(): void {
		if (
			!Platform.isMobile ||
			FoliateReaderService.mobileBlobIframePatchInstalled ||
			typeof HTMLIFrameElement === "undefined"
		) {
			return;
		}

		const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
		if (!descriptor?.get || !descriptor?.set) {
			logger.warn(
				"[FoliateReaderService] Unable to install mobile blob iframe fallback because the iframe src descriptor is unavailable."
			);
			return;
		}

		const readSrc = (iframe: HTMLIFrameElement): string => {
			return descriptor.get ? (descriptor.get.call(iframe) as string) : "";
		};
		const writeSrc = (iframe: HTMLIFrameElement, href: string): void => {
			descriptor.set?.call(iframe, href);
		};
		const tokenStore = FoliateReaderService.mobileBlobIframeLoadTokens;

		Object.defineProperty(HTMLIFrameElement.prototype, "src", {
			configurable: true,
			enumerable: descriptor.enumerable ?? true,
			get() {
				return readSrc(this);
			},
			set(value: string) {
				const href = String(value || "");
				if (!FoliateReaderService.shouldUseMobileSrcdocFallback(this, href)) {
					try {
						this.removeAttribute("srcdoc");
					} catch (_error) {
						// Ignore transient cleanup failures.
					}
					writeSrc(this, href);
					return;
				}

				const nextToken = (tokenStore.get(this) || 0) + 1;
				tokenStore.set(this, nextToken);

				void (async () => {
					try {
						const response = await globalThis.fetch(href);
						if (!response.ok) {
							throw new Error(
								`Failed to load iframe blob resource: ${response.status} ${response.statusText}`
							);
						}
						const markup = await response.text();
						if (tokenStore.get(this) !== nextToken) {
							return;
						}
						this.removeAttribute("src");
						this.srcdoc = markup;
					} catch (error) {
						if (tokenStore.get(this) !== nextToken) {
							return;
						}
						logger.warn(
							"[FoliateReaderService] Mobile iframe blob fallback failed; falling back to direct iframe src load.",
							{
								href,
								error,
							}
						);
						try {
							this.removeAttribute("srcdoc");
						} catch (_cleanupError) {
							// Ignore cleanup failures before the native fallback.
						}
						writeSrc(this, href);
					}
				})();
			},
		});

		FoliateReaderService.mobileBlobIframePatchInstalled = true;
	}

	private static shouldUseMobileSrcdocFallback(
		iframe: HTMLIFrameElement,
		href: string
	): boolean {
		if (!href.startsWith("blob:")) {
			return false;
		}

		const sandbox = iframe.getAttribute("sandbox") || "";
		return (
			iframe.getAttribute("part") === "filter" &&
			sandbox.includes("allow-same-origin") &&
			sandbox.includes("allow-scripts")
		);
	}

	private async getOverlayerModule(): Promise<typeof import("foliate-js/overlayer.js")> {
		if (!this.overlayerModulePromise) {
			this.overlayerModulePromise = import("foliate-js/overlayer.js");
		}
		return this.overlayerModulePromise;
	}

	private async destroyViewOnly(): Promise<void> {
		this.notifyFootnotePreview(null);
		for (const cleanup of this.documentFootnoteCleanups.values()) {
			cleanup();
		}
		this.documentFootnoteCleanups.clear();
		for (const cleanup of this.documentSelectionCleanups.values()) {
			cleanup();
		}
		this.documentSelectionCleanups.clear();

		const currentContainer = this.renderContainer;
		const currentView = this.foliateView;
		this.foliateView = null;
		this.renderContainer = null;
		this.renderedAnnotations.clear();
		this.loadedDocumentSectionIndexes = new WeakMap<Document, number>();
		this.lastSelectionByDocument = new WeakMap<Document, string>();

		if (currentContainer) {
			delete currentContainer.dataset.foliate;
		}
		if (!currentView) {
			return;
		}

		currentView.removeEventListener("relocate", this.handleRelocateEvent as EventListener);
		currentView.removeEventListener("load", this.handleLoadEvent as EventListener);
		currentView.removeEventListener("draw-annotation", this.handleDrawAnnotationEvent as EventListener);
		currentView.removeEventListener("show-annotation", this.handleShowAnnotationEvent as EventListener);
		try {
			currentView.close();
		} catch (error) {
			logger.warn("[FoliateReaderService] Failed to close foliate view cleanly:", error);
		}
		currentView.remove();
	}

	private async destroyAll(): Promise<void> {
		await this.destroyViewOnly();
		this.resetHighlightState();
		this.parser.dispose();
		this.currentBook = null;
		this.currentPosition = { chapterIndex: 0, cfi: "", percent: 0 };
		this.currentPaginationInfo = { currentPage: 0, totalPages: 0 };
		this.currentChapterTitle = "";
		this.currentChapterHref = "";
		this.relocatedCallbacks.clear();
		this.footnotePreviewCallbacks.clear();
		this.selectionChangeCallbacks.clear();
		this.highlightClickCallbacks.clear();
	}

	private resetTemporaryHighlightTimers(): void {
		for (const timer of this.temporaryHighlightTimers.values()) {
			clearTimeout(timer);
		}
		this.temporaryHighlightTimers.clear();
	}

	private resetHighlightState(): void {
		this.resetTemporaryHighlightTimers();
		for (const timer of this.temporarilyRevealedConcealmentTimers.values()) {
			clearTimeout(timer);
		}
		this.temporarilyRevealedConcealmentTimers.clear();
		this.highlightDataMap.clear();
		this.temporaryHighlightDataMap.clear();
		this.savedHighlights = [];
		this.renderedAnnotations.clear();
	}

	private createNotReadyError(methodName: string): Error {
		return new Error(`FoliateReaderService 未完成初始化，无法调用 ${methodName}`);
	}

	private notifySelectionChange(cfiRange: string, frame: ReaderFrame): void {
		const event: ReaderSelectionChange = { cfiRange, frame };
		for (const listener of this.selectionChangeCallbacks) {
			try {
				listener(event);
			} catch (error) {
				logger.warn("[FoliateReaderService] Selection listener failed:", { cfiRange, error });
			}
		}
	}

	private notifyHighlightClick(info: HighlightClickInfo): void {
		for (const listener of this.highlightClickCallbacks) {
			try {
				listener(info);
			} catch (error) {
				logger.warn("[FoliateReaderService] Highlight click listener failed:", {
					cfiRange: info.cfiRange,
					error,
				});
			}
		}
	}

	private resolveHighlightTint(color?: string): string {
		const palette = FoliateReaderService.HIGHLIGHT_TINT_MAP[this.getCurrentColorScheme()];
		if (!color) {
			return palette.yellow;
		}
		return palette[color] || color;
	}

	private isSameAnnotation(a: FoliateAnnotation, b: FoliateAnnotation): boolean {
		return (
			a.value === b.value &&
			a.color === b.color &&
			a.style === b.style &&
			a.focusColor === b.focusColor &&
			a.text === b.text &&
			a.sourceFile === b.sourceFile &&
			a.sourceRef === b.sourceRef &&
			a.createdTime === b.createdTime &&
			a.temporary === b.temporary &&
			a.presentation === b.presentation
		);
	}

	private getAnnotationRenderSignature(annotation: FoliateAnnotation): string {
		const key = this.normalizeLocationKey(annotation.cfiRange);
		const isTemporarilyRevealed =
			this.shouldRenderAnnotationAsConceal(annotation) && this.temporarilyRevealedConcealmentTimers.has(key);

		return [
			`presentation:${annotation.presentation || "highlight"}`,
			`color:${annotation.color || "yellow"}`,
			`style:${annotation.style || "highlight"}`,
			`focus:${annotation.focusColor || ""}`,
			`strikethrough:${this.currentStrikethroughPresentation}`,
			`scheme:${this.getCurrentColorScheme()}`,
			`concealment:${isTemporarilyRevealed ? "revealed" : "concealed"}`,
		].join("|");
	}

	private normalizeCurrentPage(totalPositions: number): number {
		const currentPage = Math.round(this.currentPaginationInfo.currentPage || 0);
		if (currentPage > 0) {
			return Math.min(currentPage, Math.max(totalPositions, 1));
		}
		if (totalPositions <= 0) {
			return 0;
		}
		return Math.min(
			totalPositions,
			Math.max(1, Math.round((this.currentPosition.percent / 100) * totalPositions))
		);
	}

	private getConcealmentPalette(): {
		base: string;
		stripe: string;
		border: string;
	} {
		if (this.getCurrentColorScheme() === "dark") {
			return {
				base: "rgba(86, 92, 104, 0.96)",
				stripe: "rgba(112, 119, 132, 0.98)",
				border: "rgba(255, 255, 255, 0.12)",
			};
		}

		return {
			base: "rgba(247, 243, 239, 0.96)",
			stripe: "rgba(232, 225, 216, 0.98)",
			border: "rgba(89, 79, 69, 0.12)",
		};
	}

	private getObsidianStyleSource(): HTMLElement {
		return this.renderContainer || document.body || document.documentElement;
	}

	private getObsidianCSSVar(varName: string, fallback: string): string {
		try {
			const styleSource = this.getObsidianStyleSource();
			const primary = getComputedStyle(styleSource).getPropertyValue(varName).trim();
			if (primary) {
				return primary;
			}
			const bodyValue = getComputedStyle(document.body).getPropertyValue(varName).trim();
			if (bodyValue) {
				return bodyValue;
			}
			const rootValue = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
			return rootValue || fallback;
		} catch {
			return fallback;
		}
	}

	private getObsidianFontStack(): string {
		const fontText = this.getObsidianCSSVar("--font-text", "").trim();
		const fontInterface = this.getObsidianCSSVar("--font-interface", "").trim();
		const baseFont = fontText || fontInterface;
		if (!baseFont) {
			return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
		}
		return `${baseFont}, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
	}

	private getObsidianMonospaceFontStack(): string {
		const monoFont = this.getObsidianCSSVar("--font-monospace", "").trim();
		if (!monoFont) {
			return 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace';
		}
		return `${monoFont}, ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
	}

	private getObsidianTextFontSize(): string {
		const directTextSize = this.getObsidianCSSVar("--font-text-size", "").trim();
		if (this.isConcreteCssSizeValue(directTextSize)) {
			return directTextSize;
		}

		const directEditorSize = this.getObsidianCSSVar("--editor-font-size", "").trim();
		if (this.isConcreteCssSizeValue(directEditorSize)) {
			return directEditorSize;
		}

		const resolvedSize = this.resolveHostFontSizeExpression(
			"var(--font-text-size, var(--editor-font-size, 16px))"
		);
		if (resolvedSize) {
			return resolvedSize;
		}

		const rawSize = this.getObsidianCSSVar(
			"--font-text-size",
			this.getObsidianCSSVar("--editor-font-size", "16px")
		).trim();
		return rawSize || "16px";
	}

	private isConcreteCssSizeValue(value: string): boolean {
		if (!value) {
			return false;
		}
		return !value.includes("var(");
	}

	private resolveHostFontSizeExpression(valueExpression: string): string | null {
		try {
			const styleSource = this.getObsidianStyleSource();
			const probe = document.createElement("span");
			applyStyleProps(probe, {
				position: "absolute",
				visibility: "hidden",
				"pointer-events": "none",
				inset: "0",
			});
			probe.style.fontSize = valueExpression;
			styleSource.appendChild(probe);
			const resolvedSize = getComputedStyle(probe).fontSize.trim();
			probe.remove();
			return resolvedSize || null;
		} catch {
			return null;
		}
	}

	private getCurrentColorScheme(): "light" | "dark" {
		if (
			document.body.classList.contains("theme-dark") ||
			document.documentElement.classList.contains("theme-dark")
		) {
			return "dark";
		}
		return "light";
	}

	private clamp(value: number, min: number, max: number): number {
		return Math.min(Math.max(value, min), max);
	}
}
