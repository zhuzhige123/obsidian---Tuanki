import type { Card } from "../../data/types";
import { parseChoiceQuestion } from "../../parsing/choice-question-parser";
import { isInputClozeQuestionContent } from "./input-cloze-utils";

export function isQuestionBankEligibleContent(content: string | undefined): boolean {
	const normalized = content || "";
	return Boolean(parseChoiceQuestion(normalized)) || isInputClozeQuestionContent(normalized);
}

export function isQuestionBankEligibleCard(card: Pick<Card, "content">): boolean {
	return isQuestionBankEligibleContent(card.content);
}

export function filterQuestionBankEligibleCardUuids(
	cards: Array<Pick<Card, "uuid" | "content">>
): string[] {
	return cards.filter(isQuestionBankEligibleCard).map((card) => card.uuid);
}
