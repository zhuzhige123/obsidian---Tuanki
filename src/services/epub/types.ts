export interface EpubBook {
	id: string;
	filePath: string;
	sourceId?: string;
	sourceFingerprint?: string;
	sourceMtime?: number;
	sourceSize?: number;
	metadata: BookMetadata;
	currentPosition: ReadingPosition;
	readingStats: ReadingStats;
}

export interface BookMetadata {
	title: string;
	author: string;
	publisher?: string;
	language?: string;
	isbn?: string;
	coverImage?: string;
	wordCount?: number;
	chapterCount: number;
}

export type EpubHighlightStyle = "underline" | "strikethrough" | "wavy";

export type EpubStrikethroughDisplayMode = "strikethrough" | "conceal";

export interface ReadingPosition {
	chapterIndex: number;
	cfi: string;
	percent: number;
}

export interface ReadingStats {
	totalReadTime: number;
	lastReadTime: number;
	createdTime: number;
	completedTime?: number;
}

export interface EpubLastOpenBookmark extends ReadingPosition {
	title: string;
	preview: string;
	savedAt: number;
}

export interface EpubReadingReferencePoint extends ReadingPosition {
	title: string;
	savedAt: number;
}

export interface Highlight {
	id: string;
	text: string;
	color: HighlightColor;
	style?: EpubHighlightStyle;
	chapterIndex: number;
	cfiRange: string;
	createdTime: number;
	linkedNotePath?: string;
}

export type HighlightColor = "yellow" | "green" | "blue" | "red" | "purple";

export type ConcealedTextMode = "mask";

export interface ConcealedText {
	id: string;
	text: string;
	mode: ConcealedTextMode;
	chapterIndex: number;
	cfiRange: string;
	createdTime: number;
}

export interface Note {
	id: string;
	content: string;
	quotedText?: string;
	chapterIndex: number;
	cfi?: string;
	createdTime: number;
	modifiedTime: number;
}

export interface TocItem {
	id: string;
	label: string;
	href: string;
	level: number;
	pageNumber?: number;
	subitems?: TocItem[];
}

export interface PaginationInfo {
	currentPage: number;
	totalPages: number;
}

export type EpubWidthMode = "standard" | "full";
export type EpubLayoutMode = "paginated" | "double";
export type EpubFlowMode = "paginated" | "scrolled";
export type EpubTheme = "default" | "sepia";

export interface EpubReaderSettings {
	lineHeight: number;
	letterSpacing: number;
	pageMargin: number;
	viewportSidePadding: number;
	theme?: EpubTheme;
	widthMode: EpubWidthMode;
	layoutMode: EpubLayoutMode;
	flowMode: EpubFlowMode;
	showScrolledSideNav: boolean;
}
