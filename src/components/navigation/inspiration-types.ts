export type InspirationModalTabId =
	| "attribution"
	| "qa"
	| "cloze"
	| "single-choice"
	| "multi-choice"
	| "image-mask";

export interface InspirationModalTab {
	id: InspirationModalTabId;
	label: string;
}

export interface CardSyntaxBlock {
	title: string;
	code: string;
}

export interface CardSyntaxTutorial {
	intro: string;
	rules: string[];
	syntaxBlocks: CardSyntaxBlock[];
	example: CardSyntaxBlock;
}

export interface InspirationLink {
	label: string;
	href: string;
}

export interface InspirationItem {
	statement: string;
	categoryTag: string;
	note?: string;
	links?: InspirationLink[];
}

export interface InspirationSection {
	title: string;
	intro: string;
	items: InspirationItem[];
}

export interface InspirationModalContent {
	modalHeadings: {
		attributionTitle: string;
		syntaxTitle: string;
		attributionKicker: string;
		syntaxKicker: string;
	};
	aria: {
		close: string;
		tablist: string;
	};
	tabs: InspirationModalTab[];
	tutorials: Record<Exclude<InspirationModalTabId, "attribution">, CardSyntaxTutorial>;
	sections: InspirationSection[];
}

export const INSPIRATION_MODAL_TAB_IDS: InspirationModalTabId[] = [
	"attribution",
	"qa",
	"cloze",
	"single-choice",
	"multi-choice",
	"image-mask",
];
