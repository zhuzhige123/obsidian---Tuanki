import { Menu } from "obsidian";
import { getMenuSubmenu } from "../../utils/obsidian-menu";

const submenuByMenu = new WeakMap<Menu, Menu>();

export function getWeaveOperationsSubmenu(menu: Menu): Menu {
	const existing = submenuByMenu.get(menu);
	if (existing) return existing;

	let created: Menu | null = null;

	menu.addItem((item) => {
		item.setTitle("Weave 操作");
		item.setIcon("brain");
		created = getMenuSubmenu(item);
	});

	const submenu = created ?? new Menu();
	submenuByMenu.set(menu, submenu);
	return submenu;
}
