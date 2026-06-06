import type { StudyInterfaceViewPreferences } from "../../components/settings/types/settings-types";
import type { Card } from "../../data/types";
import {
	normalizeRatingLabelStyle,
	resolveRatingLabelStyleFromPreferences,
	shouldShowRatingIntervalOnButtons,
	type RatingLabelStyle,
} from "../../components/study/rating-label-style";
import type { ChoiceOptionOrder } from "./choiceOptionOrder";
import { applyCardOrder } from "./cardOrder";

export function normalizeStudyInterfaceViewPreferences(
	preferences: Partial<StudyInterfaceViewPreferences> | null | undefined
): StudyInterfaceViewPreferences {
	const ratingLabelStyle = resolveRatingLabelStyleFromPreferences(
		preferences?.ratingLabelStyle,
		preferences?.showRatingIntervalOnButtons
	);

	return {
		showSidebar: preferences?.showSidebar ?? true,
		sidebarCompactModeSetting:
			preferences?.sidebarCompactModeSetting === "fixed" ? "fixed" : "auto",
		statsCollapsed: preferences?.statsCollapsed ?? true,
		cardOrder: preferences?.cardOrder === "random" ? "random" : "sequential",
		choiceOptionOrder: preferences?.choiceOptionOrder === "random" ? "random" : "sequential",
		sidebarPosition: preferences?.sidebarPosition === "bottom" ? "bottom" : "right",
		ratingLabelStyle,
		showRatingIntervalOnButtons: shouldShowRatingIntervalOnButtons(ratingLabelStyle),
		graphLinkEnabled: preferences?.graphLinkEnabled === true,
	};
}

export interface StudyInterfaceViewPreferenceBindings {
	showSidebar: boolean;
	sidebarCompactModeSetting: "auto" | "fixed";
	statsCollapsed: boolean;
	cardOrder: "sequential" | "random";
	choiceOptionOrder: ChoiceOptionOrder;
	ratingLabelStyle: RatingLabelStyle;
	isGraphLinkEnabled: boolean;
}

export function applyStudyInterfaceViewPreferencesToBindings(
	prefs: StudyInterfaceViewPreferences,
	bindings: StudyInterfaceViewPreferenceBindings
): void {
	bindings.showSidebar = prefs.showSidebar;
	bindings.sidebarCompactModeSetting = prefs.sidebarCompactModeSetting;
	bindings.statsCollapsed = prefs.statsCollapsed;
	bindings.cardOrder = prefs.cardOrder;
	bindings.choiceOptionOrder = prefs.choiceOptionOrder;
	bindings.ratingLabelStyle = resolveRatingLabelStyleFromPreferences(
		prefs.ratingLabelStyle,
		prefs.showRatingIntervalOnButtons
	);
	bindings.isGraphLinkEnabled = prefs.graphLinkEnabled === true;
}

export function collectStudyInterfaceViewPreferencesFromBindings(
	bindings: StudyInterfaceViewPreferenceBindings,
	sidebarPosition: "right" | "bottom" = "right"
): StudyInterfaceViewPreferences {
	const ratingLabelStyle = normalizeRatingLabelStyle(bindings.ratingLabelStyle);
	return {
		showSidebar: bindings.showSidebar,
		sidebarCompactModeSetting: bindings.sidebarCompactModeSetting,
		statsCollapsed: bindings.statsCollapsed,
		cardOrder: bindings.cardOrder,
		choiceOptionOrder: bindings.choiceOptionOrder,
		sidebarPosition,
		ratingLabelStyle,
		showRatingIntervalOnButtons: shouldShowRatingIntervalOnButtons(ratingLabelStyle),
		graphLinkEnabled: bindings.isGraphLinkEnabled,
	};
}

export function applyStudyCardOrderToQueue(
	baseQueue: Card[],
	order: "sequential" | "random"
): Card[] {
	return applyCardOrder(baseQueue, order);
}

export function reorderStudyQueuePreservingCurrentCard(
	baseQueue: Card[],
	order: "sequential" | "random",
	currentCardId?: string
): { queue: Card[]; currentIndex: number } {
	const queue = applyCardOrder(baseQueue, order);
	if (!currentCardId) {
		return { queue, currentIndex: 0 };
	}

	const currentIndex = queue.findIndex((card) => card.uuid === currentCardId);
	return { queue, currentIndex: currentIndex >= 0 ? currentIndex : 0 };
}
