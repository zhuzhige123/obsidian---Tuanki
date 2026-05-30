import { describe, expect, it, vi } from "vitest";
import { Menu } from "obsidian";
import type { MenuItem as MockMenuItem } from "../../tests/mocks/obsidian";
import {
	addMenuRadioChoice,
	addMenuRadioChoices,
	addMenuToggle,
	getMenuSubmenu,
} from "../obsidian-menu";

vi.mock("obsidian", async () => {
	return vi.importActual<typeof import("../../tests/mocks/obsidian")>("../../tests/mocks/obsidian");
});

function getMenuItems(menu: Menu): MockMenuItem[] {
	return (menu as Menu & { items: MockMenuItem[] }).items;
}

describe("obsidian-menu", () => {
	it("getMenuSubmenu returns a submenu instance", () => {
		const menu = new Menu();
		let submenu: Menu | null = null;
		menu.addItem((item) => {
			submenu = getMenuSubmenu(item);
		});
		expect(submenu).toBeInstanceOf(Menu);
	});

	it("addMenuRadioChoice always invokes onSelect with the target value", () => {
		const menu = new Menu();
		const onSelect = vi.fn();
		addMenuRadioChoice(
			menu,
			{ title: "Template 1", value: "template1" },
			true,
			onSelect
		);

		const item = getMenuItems(menu)[0];
		item.trigger();
		item.trigger();

		expect(onSelect).toHaveBeenCalledTimes(2);
		expect(onSelect).toHaveBeenNthCalledWith(1, "template1");
		expect(onSelect).toHaveBeenNthCalledWith(2, "template1");
	});

	it("addMenuRadioChoices marks only the current value as checked", () => {
		const menu = new Menu();
		addMenuRadioChoices(
			menu,
			"b",
			[
				{ title: "A", value: "a" },
				{ title: "B", value: "b" },
			],
			() => undefined
		);

		const items = getMenuItems(menu);
		expect(items[0].isChecked()).toBe(false);
		expect(items[1].isChecked()).toBe(true);
	});

	it("addMenuToggle reads fresh checked state on each click", () => {
		const menu = new Menu();
		let enabled = false;
		const onSetChecked = vi.fn((next: boolean) => {
			enabled = next;
		});

		addMenuToggle(menu, {
			title: "Side nav",
			getChecked: () => enabled,
			onSetChecked,
		});

		const item = getMenuItems(menu)[0];
		item.trigger();
		item.trigger();

		expect(onSetChecked).toHaveBeenNthCalledWith(1, true);
		expect(onSetChecked).toHaveBeenNthCalledWith(2, false);
	});
});
