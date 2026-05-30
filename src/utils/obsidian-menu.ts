import type { App, IconName, Menu, MenuItem } from "obsidian";

/** MenuItem with Obsidian's undocumented but stable submenu API. */
export type MenuItemWithSubmenu = MenuItem & { setSubmenu: () => Menu };

export function getMenuSubmenu(item: MenuItem): Menu {
	return (item as MenuItemWithSubmenu).setSubmenu();
}

export interface MenuSubmenuGroupConfig {
	title: string;
	icon?: IconName;
}

/** Add a parent row that opens a nested submenu (third level under pane menu groups). */
export function addMenuSubmenuGroup(
	parentMenu: Menu,
	group: MenuSubmenuGroupConfig,
	populate: (subMenu: Menu) => void
): void {
	parentMenu.addItem((item) => {
		item.setTitle(group.title);
		if (group.icon) {
			item.setIcon(group.icon);
		}
		populate(getMenuSubmenu(item));
	});
}

/** Attach app context so submenus position and behave correctly. */
export function attachMenuApp(menu: Menu, app: App): Menu {
	(menu as Menu & { app?: App }).app = app;
	return menu;
}

export interface MenuRadioChoice<T> {
	title: string;
	icon?: IconName;
	value: T;
	disabled?: boolean;
}

/**
 * Add a mutually exclusive choice (radio) item.
 * Follows Obsidian menu semantics: setChecked reflects state at open time only;
 * onClick always applies the target value (no early return).
 */
export function addMenuRadioChoice<T>(
	menu: Menu,
	choice: MenuRadioChoice<T>,
	isSelected: boolean,
	onSelect: (value: T) => void
): void {
	menu.addItem((item) => {
		item.setTitle(choice.title);
		if (choice.icon) {
			item.setIcon(choice.icon);
		}
		item.setChecked(isSelected);
		if (choice.disabled) {
			item.setDisabled(true);
		}
		item.onClick(() => {
			onSelect(choice.value);
		});
	});
}

export function addMenuRadioChoices<T>(
	menu: Menu,
	currentValue: T,
	choices: MenuRadioChoice<T>[],
	onSelect: (value: T) => void
): void {
	for (const choice of choices) {
		addMenuRadioChoice(menu, choice, currentValue === choice.value, onSelect);
	}
}

export interface MenuToggleConfig {
	title: string;
	icon?: IconName;
	getIcon?: () => IconName | undefined;
	getChecked: () => boolean;
	isDisabled?: () => boolean;
	onSetChecked: (checked: boolean) => void;
}

/**
 * Add a boolean toggle item. Reads fresh checked state on each click.
 */
export function addMenuToggle(menu: Menu, config: MenuToggleConfig): void {
	menu.addItem((item) => {
		item.setTitle(config.title);
		const icon = config.getIcon?.() ?? config.icon;
		if (icon) {
			item.setIcon(icon);
		}
		item.setChecked(config.getChecked());
		if (config.isDisabled?.()) {
			item.setDisabled(true);
		}
		item.onClick(() => {
			if (config.isDisabled?.()) {
				return;
			}
			config.onSetChecked(!config.getChecked());
		});
	});
}
