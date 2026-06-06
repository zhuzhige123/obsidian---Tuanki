import type { Menu } from "obsidian";

export interface EditableFormalDeckMenuDeck {
	id: string;
	name: string;
}

export interface PopulateEditableFormalDeckMenuOptions {
	menu: Menu;
	decks: EditableFormalDeckMenuDeck[];
	selectedDeckNames: string[];
	createDeckLabel: string;
	onDeckNamesChange: (names: string[]) => void;
	onCreateDeck: () => void;
	onAfterDeckToggle?: () => void;
}

/** 填充「可选正式牌组 + 新建牌组」Obsidian 菜单项（新建卡片/编辑卡片顶部牌组列表共用）。 */
export function populateEditableFormalDeckMenu(
	options: PopulateEditableFormalDeckMenuOptions
): void {
	const {
		menu,
		decks,
		selectedDeckNames,
		createDeckLabel,
		onDeckNamesChange,
		onCreateDeck,
		onAfterDeckToggle,
	} = options;

	for (const deck of decks) {
		menu.addItem((item) => {
			const checked =
				Array.isArray(selectedDeckNames) && selectedDeckNames.includes(deck.name);
			item.setTitle(deck.name);
			item.setIcon(checked ? "check-square" : "square");
			item.onClick(() => {
				const currentName =
					Array.isArray(selectedDeckNames) && selectedDeckNames.length > 0
						? selectedDeckNames[0]
						: "";
				const next = currentName === deck.name ? [] : [deck.name];
				onDeckNamesChange(next);
				onAfterDeckToggle?.();
			});
		});
	}

	if (decks.length > 0) {
		menu.addSeparator();
	}

	menu.addItem((item) => {
		item.setTitle(createDeckLabel);
		item.setIcon("plus");
		item.onClick(() => {
			onCreateDeck();
		});
	});
}
