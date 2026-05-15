declare module "foliate-js/epub.js" {
	export class EPUB {
		constructor(loader: {
			loadText: (name: string) => Promise<string | null> | string | null;
			loadBlob: (name: string, type?: string) => Promise<Blob | null> | Blob | null;
			getSize: (name: string) => number;
			sha1?: (value: string) => Promise<Uint8Array>;
		});
		init(): Promise<any>;
	}
}

declare module "foliate-js/view.js" {
	type FoliateContentEntry = { index: number; overlayer?: any; doc?: Document | null };

	export class View extends HTMLElement {
		book: any;
		renderer: any & {
			getContents?: () => FoliateContentEntry[];
		};
		lastLocation: any;
		open(book: any): Promise<void>;
		close(): void;
		goTo(target: any): Promise<any>;
		goToTextStart(): Promise<any>;
		prev(distance?: number): Promise<void>;
		next(distance?: number): Promise<void>;
		goLeft(): Promise<void>;
		goRight(): Promise<void>;
		resolveNavigation(target: any): any;
		getCFI(index: number, range?: Range): string;
		getContents?(): FoliateContentEntry[];
		addAnnotation(annotation: any, remove?: boolean): Promise<any>;
		deleteAnnotation(annotation: any): Promise<any>;
		showAnnotation(annotation: any): Promise<any>;
		search(opts: any): AsyncIterable<any>;
		clearSearch(): void;
		init(options: { lastLocation?: any; showTextStart?: boolean }): Promise<void>;
	}
}

declare module "foliate-js/footnotes.js" {
	export class FootnoteHandler extends EventTarget {
		detectFootnotes: boolean;
		handle(
			book: any,
			event: CustomEvent<{ a: HTMLElement; href: string; follow?: boolean }> & { preventDefault(): void }
		): Promise<void> | void;
	}
}

declare module "foliate-js/dict.js" {
	export class StarDict {
		loadIfo(file: Blob): Promise<void>;
		loadIdx(file: Blob): Promise<void>;
		loadDict(file: Blob, inflate: (value: Uint8Array) => Uint8Array | Promise<Uint8Array>): Promise<void>;
		loadSyn(file?: Blob): Promise<void>;
		lookup(query: string): Promise<Array<{ word: string; data: [string, Uint8Array | Promise<Uint8Array>] | Array<[string, Uint8Array | Promise<Uint8Array>]> }>>;
		synonyms(query: string): Promise<Array<{ word: string; data: [string, Uint8Array | Promise<Uint8Array>] | Array<[string, Uint8Array | Promise<Uint8Array>]> }>>;
	}
}

declare module "foliate-js/overlayer.js" {
	export class Overlayer {
		static highlight(rects: any, options?: any): SVGElement;
		static outline(rects: any, options?: any): SVGElement;
	}
}
