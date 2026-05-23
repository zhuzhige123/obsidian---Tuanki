import { Menu } from "obsidian";

export type MemoryDeckMenuAction =
	| "advance-study"
	| "deck-analytics"
	| "knowledge-graph"
	| "edit-deck"
	| "delete-deck"
	| "dissolve-deck";

export interface MemoryDeckMenuHandlers {
	onAdvanceStudy: () => void | Promise<void>;
	onOpenDeckAnalytics: () => void | Promise<void>;
	onOpenKnowledgeGraph: () => void | Promise<void>;
	onEditDeck: () => void | Promise<void>;
	onDeleteDeck: () => void | Promise<void>;
	onDissolveDeck: () => void | Promise<void>;
}

export interface MemoryDeckMenuText {
	advanceStudy: string;
	deckAnalytics: string;
	knowledgeGraph: string;
	editDeck: string;
	deleteDeck: string;
	dissolveDeck: string;
}

export interface MemoryDeckMenuOptions {
	showDeckAnalytics?: boolean;
	lockDeckAnalytics?: boolean;
	renderManagementSection?: (menu: Menu) => void;
}

export function buildMemoryDeckMenu(
	menu: Menu,
	text: MemoryDeckMenuText,
	handlers: MemoryDeckMenuHandlers,
	options: MemoryDeckMenuOptions = {}
): Menu {
	menu.addItem((item) =>
		item
			.setTitle(text.advanceStudy)
			.setIcon("fast-forward")
			.onClick(async () => await handlers.onAdvanceStudy())
	);

	if (options.showDeckAnalytics !== false) {
		menu.addItem((item) =>
			item
				.setTitle(options.lockDeckAnalytics ? `${text.deckAnalytics} 🔒` : text.deckAnalytics)
				.setIcon("bar-chart-2")
				.onClick(async () => await handlers.onOpenDeckAnalytics())
		);
	}

	menu.addItem((item) =>
		item
			.setTitle(text.knowledgeGraph)
			.setIcon("git-fork")
			.onClick(async () => await handlers.onOpenKnowledgeGraph())
	);

	menu.addSeparator();

	if (options.renderManagementSection) {
		options.renderManagementSection(menu);
		return menu;
	}

	menu.addItem((item) =>
		item
			.setTitle(text.editDeck)
			.setIcon("edit")
			.onClick(async () => await handlers.onEditDeck())
	);

	menu.addItem((item) =>
		item
			.setTitle(text.deleteDeck)
			.setIcon("trash-2")
			.onClick(async () => await handlers.onDeleteDeck())
	);

	menu.addItem((item) =>
		item
			.setTitle(text.dissolveDeck)
			.setIcon("unlink")
			.onClick(async () => await handlers.onDissolveDeck())
	);

	return menu;
}
