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

export type EpubReaderEngineType = "foliate";

export type FlashStyle = "pulse" | "highlight" | "none";
export type ReaderHighlightPresentation = "highlight" | "conceal";

export interface HighlightSourceLocator {
	sourceFile: string;
	sourceRef?: string;
	excerptId?: string;
}

export interface NavigateAndHighlightOptions {
	cfi?: string;
	href?: string;
	text?: string;
	flashStyle?: FlashStyle;
	flashColor?: string;
	dismiss?: "click" | "auto";
	sourceFile?: string;
	sourceRef?: string;
	createdTime?: number;
}

export interface ReaderNavigateOptions {
	cfi?: string;
	href?: string;
	text?: string;
}

export interface ReaderNavigationRectOptions extends ReaderNavigateOptions {
	allowFallback?: boolean;
}

export interface HighlightClickInfo {
	cfiRange: string;
	color: string;
	style?: EpubHighlightStyle;
	text: string;
	sourceFile: string;
	sourceRef?: string;
	excerptId?: string;
	sourceLocators?: HighlightSourceLocator[];
	createdTime?: number;
	temporary?: boolean;
	presentation?: ReaderHighlightPresentation;
	rect: { top: number; left: number; bottom: number; right: number; width: number; height: number };
}

export interface ReaderHighlightInput {
	cfiRange: string;
	color: string;
	style?: EpubHighlightStyle;
	text?: string;
	chapterIndex?: number;
	chapterTitle?: string;
	sourceFile?: string;
	sourceRef?: string;
	excerptId?: string;
	sourceLocators?: HighlightSourceLocator[];
	createdTime?: number;
	presentation?: ReaderHighlightPresentation;
}

export interface ReaderHighlight extends ReaderHighlightInput {
	temporary?: boolean;
}

export interface ReaderRenderOptions {
	width?: number;
	height?: number;
	flow?: string;
	spread?: string;
	manager?: "default" | "continuous";
	minSpreadWidth?: number;
	lineHeight?: number;
	letterSpacing?: number;
	pageMargin?: number;
	widthMode?: EpubWidthMode;
	strikethroughPresentation?: EpubStrikethroughDisplayMode;
}

export interface ReaderAppearanceOptions {
	lineHeight?: number;
	letterSpacing?: number;
	pageMargin?: number;
	widthMode?: EpubWidthMode;
	strikethroughPresentation?: EpubStrikethroughDisplayMode;
}

export interface ReaderRemainingTimeEstimate {
	bookMs?: number;
	chapterMs?: number;
	wordsPerMinute?: number;
}

export interface ReaderFrame {
	document: Document;
	window: Window;
	cfiFromRange: (range: Range) => string | null;
}

export interface ReaderSelectionChange {
	cfiRange: string;
	frame: ReaderFrame;
}

export interface ReaderFootnotePreviewInfo {
	href: string;
	label: string;
	text: string;
	rect: { top: number; left: number; bottom: number; right: number; width: number; height: number };
}

export interface EpubChapterExportAsset {
	placeholder: string;
	suggestedName: string;
	data: Uint8Array;
	mimeType: string;
	originalHref?: string;
}

export interface EpubChapterReadingPointDraft {
	title: string;
	text: string;
	cfi: string;
	chapterIndex: number;
	chapterHref: string;
	markdown?: string;
	assets?: EpubChapterExportAsset[];
}

export interface EpubReaderEngine {
	readonly engineType: EpubReaderEngineType;
	loadEpub(filePath: string, existingBookId?: string): Promise<EpubBook>;
	renderTo(container: HTMLElement, options?: ReaderRenderOptions): Promise<void>;
	goToLocation(cfi: string): Promise<void>;
	canonicalizeLocation?(cfi: string, textHint?: string): Promise<string | null>;
	getReadingProgress(): number;
	getPaginationInfo(): Promise<PaginationInfo>;
	getRemainingReadingTimeEstimate?(): Promise<ReaderRemainingTimeEstimate>;
	isLayoutChanging(): boolean;
	resize(width: number, height: number): void;
	applyReaderAppearance(appearance: ReaderAppearanceOptions, redisplay?: boolean): Promise<void>;
	onRelocated(callback: (position: ReadingPosition) => void): () => void;
	setLayoutMode(
		mode: EpubLayoutMode,
		flowMode: EpubFlowMode,
		appearance?: ReaderAppearanceOptions
	): Promise<void>;
	searchText(query: string): Promise<Array<{ cfi: string; excerpt: string; chapterTitle: string }>>;
	getTableOfContents(): Promise<TocItem[]>;
	navigateTo(options: ReaderNavigateOptions): Promise<void>;
	navigateAndHighlight(options: NavigateAndHighlightOptions): Promise<void>;
	getNavigationTargetRect(options: ReaderNavigationRectOptions): DOMRect | null;
	getCurrentPosition(): ReadingPosition;
	getCurrentChapterTitle(): string;
	getCurrentChapterIndex(): number;
	getCurrentChapterHref?(): string;
	getChapterReadingPointDraft?(
		href: string,
		titleHint?: string
	): Promise<EpubChapterReadingPointDraft | null>;
	getSectionHrefForCfi?(cfi: string): string | null;
	getCurrentCFI(): string;
	prevPage(): Promise<void>;
	nextPage(): Promise<void>;
	goToPage(pageNumber: number): Promise<void>;
	getPageNumberFromCfi(cfi: string): Promise<number | undefined>;
	getVisibleFrames(): ReaderFrame[];
	onFootnotePreview(callback: (info: ReaderFootnotePreviewInfo | null) => void): () => void;
	onSelectionChange(callback: (event: ReaderSelectionChange) => void): () => void;
	onHighlightClick(callback: (info: HighlightClickInfo) => void): () => void;
	applyHighlights(highlights: ReaderHighlight[]): Promise<void>;
	refreshHighlights?(): Promise<void>;
	addHighlight(highlight: ReaderHighlight): void;
	addTemporaryHighlight(highlight: ReaderHighlightInput, durationMs?: number): void;
	temporarilyRevealConcealedText?(cfiRange: string, durationMs?: number): void;
	removeHighlight(cfiRange: string): void;
	destroy(): void;
}
