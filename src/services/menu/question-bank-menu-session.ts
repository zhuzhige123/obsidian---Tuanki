import type { Menu } from "obsidian";
import type { Card } from "../../data/types";
import type { ChoiceOptionOrder } from "../../utils/study/choiceOptionOrder";
import {
	QuestionBankMenuBuilder,
	type QuestionBankMenuCallbacks,
	type QuestionBankMenuConfig,
} from "./QuestionBankMenuBuilder";

export interface QuestionBankMenuSessionInput {
	card: Card;
	isEditing?: boolean;
	hasSourceFile?: boolean;
	currentPriority?: number;
	enableDirectDelete?: boolean;
	showStatsBar?: boolean;
	questionOrder?: "sequential" | "random";
	choiceOptionOrder?: ChoiceOptionOrder;
	navColumnMode?: 1 | 3;
	showNavigator?: boolean;
	callbacks: QuestionBankMenuCallbacks;
}

export function populateQuestionBankMenuSession(
	menu: Menu,
	input: QuestionBankMenuSessionInput
): void {
	if (!input.card) {
		return;
	}

	const config: QuestionBankMenuConfig = {
		card: input.card,
		isEditing: input.isEditing,
		hasSourceFile: input.hasSourceFile ?? !!input.card.sourceFile,
		currentPriority: input.currentPriority ?? input.card.priority ?? 2,
		enableDirectDelete: input.enableDirectDelete ?? false,
		showStatsBar: input.showStatsBar,
		questionOrder: input.questionOrder,
		choiceOptionOrder: input.choiceOptionOrder,
		navColumnMode: input.navColumnMode,
		showNavigator: input.showNavigator,
	};

	new QuestionBankMenuBuilder(config, input.callbacks).populateMenu(menu);
}
