export type ParsedCfiPart = {
	index: number;
	id?: string;
	offset?: number;
	temporal?: number;
	spatial?: number[];
	text?: string[];
	side?: string;
};

export type ParsedCfiSegment = ParsedCfiPart[];
export type ParsedCfiPath = ParsedCfiSegment[];

export interface ParsedCfiRange {
	parent: ParsedCfiPath;
	start: ParsedCfiPath;
	end: ParsedCfiPath;
}

export type ParsedCfi = ParsedCfiPath | ParsedCfiRange;

export const isCFI: RegExp;
export const joinIndir: (...xs: string[]) => string;
export const parse: (cfi: string) => ParsedCfi;
export const collapse: (x: ParsedCfi | string, toEnd?: boolean) => ParsedCfi | string;
export const compare: (a: ParsedCfi | string, b: ParsedCfi | string) => number;
export const fromRange: (range: Range, filter?: (node: Node) => number) => string;
export const toRange: (
	doc: Document,
	parts: ParsedCfi | string,
	filter?: (node: Node) => number
) => Range;
export const fromElements: (elements: Element[]) => string[];
export const toElement: (doc: Document, parts: ParsedCfi | string) => Node | null;
export const fake: {
	fromIndex: (index: number) => string;
	toIndex: (parts: ParsedCfiPath) => number;
};
export const fromCalibrePos: (pos: string) => string;
export const fromCalibreHighlight: (highlight: {
	spine_index: number;
	start_cfi: string;
	end_cfi: string;
}) => string;
