import type { App } from "obsidian";
import type {
	EpubChapterReadingPointDraft,
	EpubReaderEngine,
	HighlightClickInfo,
	NavigateAndHighlightOptions,
	ReaderAppearanceOptions,
	ReaderFrame,
	ReaderHighlight,
	ReaderHighlightInput,
	ReaderNavigateOptions,
	ReaderRenderOptions,
	ReaderSelectionChange,
} from "./reader-engine-types";
import type {
	EpubBook,
	EpubFlowMode,
	EpubLayoutMode,
	EpubTheme,
	EpubWidthMode,
	PaginationInfo,
	ReadingPosition,
	TocItem,
} from "./types";
import type { View as FoliateViewElement } from "foliate-js/view.js";
import { logger } from "../../utils/logger";
import { FoliateVaultPublicationParser } from "./FoliateVaultPublicationParser";

type FoliateAnnotation = ReaderHighlight & {
	value: string;
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

export class FoliateReaderService implements EpubReaderEngine {
	readonly engineType = "foliate" as const;

	private static readonly HIGHLIGHT_TINT_MAP: Record<
		"light" | "dark",
		Record<string, string>
	> = {
		light: {
			yellow: "rgba(232, 170, 24, 0.6)",
			green: "rgba(34, 166, 84, 0.52)",
			blue: "rgba(38, 121, 231, 0.5)",
			red: "rgba(225, 78, 78, 0.48)",
			purple: "rgba(145, 92, 230, 0.48)",
		},
		dark: {
			yellow: "rgba(255, 209, 84, 0.5)",
			green: "rgba(74, 204, 120, 0.44)",
			blue: "rgba(110, 196, 250, 0.44)",
			red: "rgba(244, 110, 110, 0.42)",
			purple: "rgba(204, 166, 248, 0.42)",
		},
	};

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
	private currentTheme: EpubTheme = "default";
	private currentLineHeight = 1.72;
	private currentWidthMode: EpubWidthMode = "standard";
	private currentLayoutMode: EpubLayoutMode = "paginated";
	private currentFlowMode: EpubFlowMode = "paginated";
	private currentChapterTitle = "";
	private currentChapterHref = "";
	private relocatedCallbacks = new Set<(position: ReadingPosition) => void>();
	private selectionChangeCallbacks = new Set<(event: ReaderSelectionChange) => void>();
	private highlightClickCallbacks = new Set<(info: HighlightClickInfo) => void>();
	private highlightDataMap = new Map<string, ReaderHighlight>();
	private savedHighlights: ReaderHighlight[] = [];
	private renderedAnnotations = new Map<string, FoliateAnnotation>();
	private temporaryHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private temporarilyRevealedConcealmentTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private documentSelectionCleanups = new Map<Document, () => void>();
	private documentStyleElements = new WeakMap<Document, HTMLStyleElement>();
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
				await view.goTo(initialTarget);
				await this.stabilizeViewAfterNavigation(initialTarget);
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
		if (this.foliateView) {
			await this.foliateView.goTo(canonical);
			await this.stabilizeViewAfterNavigation(canonical);
		}
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

	isLayoutChanging(): boolean {
		return this.layoutChangeInFlight;
	}

	resize(_width: number, _height: number): void {
		(this.foliateView?.renderer as FoliateRenderer | undefined)?.render?.();
	}

	async applyReaderAppearance(
		theme: EpubTheme,
		lineHeight: number,
		_redisplay?: boolean
	): Promise<void> {
		this.currentTheme = theme;
		if (lineHeight > 0) {
			this.currentLineHeight = lineHeight;
		}
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
		if (appearance?.theme) {
			this.currentTheme = appearance.theme;
		}
		if (typeof appearance?.lineHeight === "number" && appearance.lineHeight > 0) {
			this.currentLineHeight = appearance.lineHeight;
		}
		if (appearance?.widthMode) {
			this.currentWidthMode = appearance.widthMode;
		} else if (mode === "double") {
			this.currentWidthMode = "full";
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
				await this.foliateView.goTo(currentCfi);
				await this.stabilizeViewAfterNavigation(currentCfi);
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

	getNavigationTargetRect(options: { cfi?: string; href?: string; text?: string }): DOMRect | null {
		const target = options.cfi || options.href || "";
		if (!target) {
			return this.renderContainer?.getBoundingClientRect() || null;
		}
		for (const frame of this.getVisibleFramesWithIndex()) {
			const range = this.parser.resolveRangeInLoadedSection(target, frame.document, frame.index, options.text);
			if (!range) {
				continue;
			}
			const rect = this.createViewportRect(frame, range);
			if (rect) {
				return new DOMRect(rect.left, rect.top, rect.width, rect.height);
			}
		}
		return this.renderContainer?.getBoundingClientRect() || null;
	}

	getCurrentPosition(): ReadingPosition {
		return { ...this.currentPosition };
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

	getPageNumberFromCfi(cfi: string): Promise<number | undefined> {
		return this.parser.resolvePageNumber(cfi);
	}

	getVisibleFrames(): ReaderFrame[] {
		return this.getVisibleFramesWithIndex().map((item) => item.frame);
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
		this.resetTemporaryHighlightTimers();
		this.highlightDataMap.clear();
		const deduped = new Map<string, ReaderHighlight>();
		for (const highlight of this.dedupeHighlights(highlights)) {
			const canonical =
				(await this.parser.canonicalizeLocation(highlight.cfiRange, highlight.text)) || highlight.cfiRange;
			const normalizedHighlight: ReaderHighlight = { ...highlight, cfiRange: canonical };
			deduped.set(this.normalizeLocationKey(normalizedHighlight.cfiRange), normalizedHighlight);
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
		const highlight = this.highlightDataMap.get(key);
		if (!highlight) {
			return;
		}

		const frame =
			this.getVisibleFramesWithIndex().find((item) => item.index === detail.index) ||
			this.getVisibleFramesWithIndex()[0];
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
			text: highlight.text || "",
			sourceFile: highlight.sourceFile || "",
			sourceRef: highlight.sourceRef,
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
		const rawTarget = options.cfi || options.href || "";
		if (!rawTarget) {
			return { canonical: null };
		}

		const canonical = await this.parser.canonicalizeLocation(rawTarget, options.text);
		if (!canonical) {
			return { canonical: null };
		}

		this.clearSelections();
		if (this.foliateView) {
			await this.foliateView.goTo(canonical);
			await this.stabilizeViewAfterNavigation(canonical);
		}
		await this.syncCurrentPositionFromTarget(canonical);
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

	private async syncCurrentPositionFromTarget(target: string): Promise<void> {
		const resolved = await this.parser.resolveNavigationTarget(target);
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
		this.currentTheme = options?.theme || this.currentTheme;
		this.currentWidthMode = options?.widthMode || this.currentWidthMode;
		if (typeof options?.lineHeight === "number" && options.lineHeight > 0) {
			this.currentLineHeight = options.lineHeight;
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
			renderer.setAttribute("margin", this.currentWidthMode === "full" ? "28px" : "48px");
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
		const background = this.getObsidianCSSVar(
			this.currentTheme === "sepia" ? "--background-secondary" : "--background-primary",
			this.currentTheme === "sepia" ? "rgb(244, 236, 216)" : "rgb(255, 255, 255)"
		);
		const textColor =
			this.currentTheme === "sepia"
				? this.getObsidianCSSVar("--text-muted", "rgb(84, 70, 46)")
				: this.getObsidianCSSVar("--text-normal", "rgb(28, 29, 31)");
		const linkColor = this.getObsidianCSSVar("--link-color", "rgb(80, 110, 214)");
		const selectionBackground = this.getObsidianCSSVar(
			"--text-selection",
			"rgba(120, 140, 255, 0.32)"
		);
		const selectionTextColor = this.getObsidianCSSVar("--text-on-accent", textColor);
		const fontFamily = this.getObsidianFontStack();
		const monospaceFontFamily = this.getObsidianMonospaceFontStack();
		const fontScale = this.getObsidianFontScale();
		const colorScheme = this.getCurrentColorScheme();
		const concealment = this.getConcealmentPalette();
		const highlightOpacity =
			this.currentTheme === "sepia" ? "0.4" : colorScheme === "dark" ? "0.46" : "0.5";
		const highlightBlendMode =
			this.currentTheme === "sepia" || colorScheme === "light" ? "multiply" : "normal";

		return `:root {
	color-scheme: ${colorScheme};
	--overlayer-highlight-opacity: ${highlightOpacity};
	--overlayer-highlight-blend-mode: ${highlightBlendMode};
}
html {
	background: ${background} !important;
	color: ${textColor} !important;
	-webkit-text-size-adjust: 100%;
}
body {
	background: transparent !important;
	color: ${textColor} !important;
	font-family: ${fontFamily} !important;
	font-size: ${fontScale}em !important;
	line-height: ${this.currentLineHeight} !important;
	margin: 0 !important;
	text-rendering: optimizeLegibility;
	font-kerning: normal;
}
body :is(p, div, li, dd, dt, blockquote, figcaption) {
	line-height: inherit !important;
}
body :is(a, a:link, a:visited) {
	color: ${linkColor} !important;
}
body :is(pre, code, kbd, samp) {
	font-family: ${monospaceFontFamily} !important;
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
		const desiredVisible = new Map<string, FoliateAnnotation>();

		for (const highlight of this.highlightDataMap.values()) {
			const sectionIndex = this.parser.getSectionIndexForCfi(highlight.cfiRange);
			if (sectionIndex === null || !visibleIndexes.has(sectionIndex)) {
				continue;
			}
			desiredVisible.set(
				this.normalizeLocationKey(highlight.cfiRange),
				this.createAnnotation(highlight)
			);
		}

		for (const [key, annotation] of Array.from(this.renderedAnnotations.entries())) {
			const desired = desiredVisible.get(key);
			if (!desired || !this.isSameAnnotation(annotation, desired)) {
				try {
					await view.deleteAnnotation(annotation);
				} catch (error) {
					logger.debugWithTag("FoliateReaderService", "Failed to delete foliate annotation", {
						key,
						error,
					});
				}
				this.renderedAnnotations.delete(key);
			}
		}

		for (const [key, annotation] of desiredVisible.entries()) {
			if (this.renderedAnnotations.has(key)) {
				continue;
			}
			try {
				await view.addAnnotation(annotation);
				this.renderedAnnotations.set(key, annotation);
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

	private async drawAnnotation(
		annotation: FoliateAnnotation,
		draw: (draw: (rects: unknown[], options?: unknown) => SVGElement, options?: unknown) => void
	): Promise<void> {
		if (annotation.presentation === "conceal") {
			const key = this.normalizeLocationKey(annotation.cfiRange);
			if (!this.temporarilyRevealedConcealmentTimers.has(key)) {
				draw((rects) => this.createConcealmentOverlay(rects));
				return;
			}
		}

		const overlayer = await this.getOverlayerModule();
		draw((rects, options) => overlayer.Overlayer.highlight(rects, options), {
			color: this.resolveHighlightTint(annotation.color),
			padding: 1,
		});
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

	private async addResolvedHighlight(
		highlight: ReaderHighlight,
		durationMs?: number
	): Promise<void> {
		const canonical =
			(await this.parser.canonicalizeLocation(highlight.cfiRange, highlight.text)) || highlight.cfiRange;
		const normalizedHighlight: ReaderHighlight = { ...highlight, cfiRange: canonical };
		const key = this.normalizeLocationKey(normalizedHighlight.cfiRange);

		const existingTimer = this.temporaryHighlightTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
			this.temporaryHighlightTimers.delete(key);
		}

		this.highlightDataMap.set(key, normalizedHighlight);
		const deduped = new Map<string, ReaderHighlight>();
		for (const item of this.savedHighlights) {
			deduped.set(this.normalizeLocationKey(item.cfiRange), item);
		}
		deduped.set(key, normalizedHighlight);
		this.savedHighlights = Array.from(deduped.values());
		await this.refreshHighlights();

		if (normalizedHighlight.temporary && typeof durationMs === "number" && durationMs > 0) {
			const timer = setTimeout(() => {
				this.temporaryHighlightTimers.delete(key);
				this.removeHighlight(normalizedHighlight.cfiRange);
			}, durationMs);
			this.temporaryHighlightTimers.set(key, timer);
		}
	}

	private dedupeHighlights(highlights: ReaderHighlight[]): ReaderHighlight[] {
		const deduped = new Map<string, ReaderHighlight>();
		for (const highlight of highlights) {
			deduped.set(this.normalizeLocationKey(highlight.cfiRange), highlight);
		}
		return Array.from(deduped.values());
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
			styleElement = doc.createElement("style");
			styleElement.setAttribute("data-weave-foliate-theme", "true");
			parent.appendChild(styleElement);
			this.documentStyleElements.set(doc, styleElement);
		}
		styleElement.textContent = this.buildReaderStyles();
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
		const host =
			(iframe?.closest(".epub-reader-viewport") as HTMLElement | null) ||
			(this.renderContainer?.closest(".epub-reader-viewport") as HTMLElement | null) ||
			this.renderContainer;
		if (!iframe || !host) {
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
		const hostRect = host.getBoundingClientRect();
		return {
			top: rangeRect.top + iframeRect.top - hostRect.top,
			left: rangeRect.left + iframeRect.left - hostRect.left,
			bottom: rangeRect.bottom + iframeRect.top - hostRect.top,
			right: rangeRect.right + iframeRect.left - hostRect.left,
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
		if (customElements.get("foliate-view")) {
			return;
		}
		await import("foliate-js/view.js");
	}

	private getOverlayerModule(): Promise<typeof import("foliate-js/overlayer.js")> {
		if (!this.overlayerModulePromise) {
			this.overlayerModulePromise = import("foliate-js/overlayer.js");
		}
		return this.overlayerModulePromise;
	}

	private async destroyViewOnly(): Promise<void> {
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
			currentView.close?.();
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
			a.text === b.text &&
			a.sourceFile === b.sourceFile &&
			a.sourceRef === b.sourceRef &&
			a.createdTime === b.createdTime &&
			a.temporary === b.temporary &&
			a.presentation === b.presentation
		);
	}

	private getConcealmentPalette(): {
		base: string;
		stripe: string;
		border: string;
	} {
		if (this.currentTheme === "sepia") {
			return {
				base: "rgba(240, 231, 211, 0.96)",
				stripe: "rgba(225, 213, 190, 0.98)",
				border: "rgba(125, 103, 76, 0.18)",
			};
		}

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

	private getObsidianFontScale(): number {
		const rawSize = this.getObsidianCSSVar(
			"--font-text-size",
			this.getObsidianCSSVar("--editor-font-size", "16px")
		)
			.trim()
			.toLowerCase();
		if (!rawSize) {
			return 1;
		}

		const numeric = Number.parseFloat(rawSize);
		if (!Number.isFinite(numeric) || numeric <= 0) {
			return 1;
		}

		if (rawSize.endsWith("px")) {
			return this.clamp(numeric / 16, 0.75, 2.5);
		}
		if (rawSize.endsWith("%")) {
			return this.clamp(numeric / 100, 0.75, 2.5);
		}
		return this.clamp(numeric, 0.75, 2.5);
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
