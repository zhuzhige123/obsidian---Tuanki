import type { Menu } from "obsidian";

export const WEAVE_OWNED_MENU_CLASS = "weave-owned-menu";
export const WEAVE_OWNED_MENU_COMPACT_CLASS = "weave-owned-menu--compact";

type MenuWithDom = Menu & { dom?: HTMLElement };

export function markWeaveOwnedMenu(menu: Menu, variant: "default" | "compact" = "default"): void {
	if (typeof window === "undefined") {
		return;
	}

	window.requestAnimationFrame(() => {
		const dom = (menu as MenuWithDom).dom;
		if (!dom) {
			return;
		}

		dom.classList.add(WEAVE_OWNED_MENU_CLASS);
		if (variant === "compact") {
			dom.classList.add(WEAVE_OWNED_MENU_COMPACT_CLASS);
		}
	});
}

export function showWeaveMenuAtMouseEvent(
	menu: Menu,
	event: MouseEvent,
	options: { variant?: "default" | "compact" } = {}
): void {
	menu.showAtMouseEvent(event);
	markWeaveOwnedMenu(menu, options.variant);
}

export function showWeaveMenuAtPosition(
	menu: Menu,
	position: { x: number; y: number },
	options: { variant?: "default" | "compact" } = {}
): void {
	menu.showAtPosition(position);
	markWeaveOwnedMenu(menu, options.variant);
}
