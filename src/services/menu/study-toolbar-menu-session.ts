import type { Menu } from "obsidian";
import type { Card, Deck } from "../../data/types";
import type { RatingLabelStyle } from "../../components/study/rating-label-style";
import type { ChoiceOptionOrder } from "../../utils/study/choiceOptionOrder";
import {
	StudyToolbarMenuBuilder,
	type MenuBuilderConfig,
	type MenuCallbacks,
} from "./StudyToolbarMenuBuilder";

export interface StudyToolbarMenuSessionInput {
	card: Card;
	decks?: Deck[];
	isPremium?: boolean;
	isGraphLinked?: boolean;
	enableDirectDelete?: boolean;
	showTimingInfo?: boolean;
	autoPlayMedia?: boolean;
	playMediaMode?: "first" | "all";
	playMediaTiming?: "cardChange" | "showAnswer";
	playbackInterval?: number;
	cardOrder?: "sequential" | "random";
	choiceOptionOrder?: ChoiceOptionOrder;
	ratingLabelStyle?: RatingLabelStyle;
	showRatingIntervalOnButtons?: boolean;
	timerAutoPauseSeconds?: number;
	hintMaxUses?: number;
	showClozeModeSwitchButton?: boolean;
	aiSplitActions?: MenuBuilderConfig["aiActions"]["split"];
	callbacks: MenuCallbacks;
}

export function populateStudyToolbarMenuSession(
	menu: Menu,
	input: StudyToolbarMenuSessionInput
): void {
	if (!input.card) {
		return;
	}

	const config: MenuBuilderConfig = {
		card: input.card,
		decks: input.decks ?? [],
		isPremium: input.isPremium ?? false,
		isGraphLinked: input.isGraphLinked ?? false,
		hasSourceFile: !!input.card.sourceFile,
		currentPriority: input.card.priority || 2,
		enableDirectDelete: input.enableDirectDelete ?? false,
		showTimingInfo: input.showTimingInfo,
		autoPlayMedia: input.autoPlayMedia,
		playMediaMode: input.playMediaMode,
		playMediaTiming: input.playMediaTiming,
		playbackInterval: input.playbackInterval,
		cardOrder: input.cardOrder,
		choiceOptionOrder: input.choiceOptionOrder,
		ratingLabelStyle: input.ratingLabelStyle,
		showRatingIntervalOnButtons: input.showRatingIntervalOnButtons,
		timerAutoPauseSeconds: input.timerAutoPauseSeconds,
		hintMaxUses: input.hintMaxUses,
		showClozeModeSwitchButton: input.showClozeModeSwitchButton,
		aiActions: {
			split: input.aiSplitActions ?? [],
		},
	};

	new StudyToolbarMenuBuilder(config, input.callbacks).populateMenu(menu);
}
