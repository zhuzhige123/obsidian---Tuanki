import { populateEditableFormalDeckMenu } from "./editable-formal-deck-menu";

type MenuItemHandler = {
	setTitle: (title: string) => MenuItemHandler;
	setIcon: (icon: string) => MenuItemHandler;
	onClick: (callback: () => void) => void;
};

function createMockMenu() {
	const items: Array<{ title: string; icon?: string; onClick?: () => void }> = [];
	let separatorCount = 0;

	const menu = {
		addItem: (builder: (item: MenuItemHandler) => void) => {
			const item: MenuItemHandler = {
				setTitle(title: string) {
					items.push({ title });
					return item;
				},
				setIcon(icon: string) {
					const last = items[items.length - 1];
					if (last) last.icon = icon;
					return item;
				},
				onClick(callback: () => void) {
					const last = items[items.length - 1];
					if (last) last.onClick = callback;
					return item;
				},
			};
			builder(item);
		},
		addSeparator: () => {
			separatorCount += 1;
		},
	};

	return { menu, items, get separatorCount() { return separatorCount; } };
}

describe("populateEditableFormalDeckMenu", () => {
	it("列出牌组并在末尾提供新建牌组入口", () => {
		const { menu, items } = createMockMenu();
		const onDeckNamesChange = vi.fn();
		const onCreateDeck = vi.fn();

		populateEditableFormalDeckMenu({
			menu: menu as never,
			decks: [
				{ id: "d1", name: "英语" },
				{ id: "d2", name: "数学" },
			],
			selectedDeckNames: ["英语"],
			createDeckLabel: "新建牌组…",
			onDeckNamesChange,
			onCreateDeck,
		});

		expect(items.map((item) => item.title)).toEqual(["英语", "数学", "新建牌组…"]);
		expect(items[0]?.icon).toBe("check-square");
		expect(items[1]?.icon).toBe("square");

		items[1]?.onClick?.();
		expect(onDeckNamesChange).toHaveBeenCalledWith(["数学"]);

		items[2]?.onClick?.();
		expect(onCreateDeck).toHaveBeenCalledTimes(1);
	});

	it("无牌组时仍显示新建牌组入口且不插入分隔线", () => {
		const { menu, items, separatorCount } = createMockMenu();

		populateEditableFormalDeckMenu({
			menu: menu as never,
			decks: [],
			selectedDeckNames: [],
			createDeckLabel: "新建牌组…",
			onDeckNamesChange: vi.fn(),
			onCreateDeck: vi.fn(),
		});

		expect(items).toHaveLength(1);
		expect(items[0]?.title).toBe("新建牌组…");
		expect(separatorCount).toBe(0);
	});
});
