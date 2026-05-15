import type { Menu } from "obsidian";
import { i18n } from "./i18n";

export type WeavePageId = "deck-study" | "weave-card-management" | "ai-assistant";

export function addWeaveNavigationItems(
	menu: Menu,
	currentPage: string,
	onNavigate: (pageId: WeavePageId) => void
): void {
	const navigateIfNeeded = (pageId: WeavePageId) => {
		if (currentPage === pageId) {
			return;
		}

		onNavigate(pageId);
	};

	menu.addItem((item) => {
		item
			.setTitle(i18n.t("navigation.deckStudy"))
			.setIcon("graduation-cap")
			.setChecked(currentPage === "deck-study")
			.onClick(() => navigateIfNeeded("deck-study"));
	});

	menu.addItem((item) => {
		item
			.setTitle(i18n.t("navigation.cardManagement"))
			.setIcon("list")
			.setChecked(currentPage === "weave-card-management")
			.onClick(() => navigateIfNeeded("weave-card-management"));
	});

	menu.addItem((item) => {
		item
			.setTitle(i18n.t("navigation.aiAssistant"))
			.setIcon("bot")
			.setChecked(currentPage === "ai-assistant")
			.onClick(() => navigateIfNeeded("ai-assistant"));
	});
}
