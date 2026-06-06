import { CardState } from "../data/types";

export function parseCardStateValue(value: number | undefined): CardState | undefined {
	switch (value) {
		case CardState.New:
			return CardState.New;
		case CardState.Learning:
			return CardState.Learning;
		case CardState.Review:
			return CardState.Review;
		case CardState.Relearning:
			return CardState.Relearning;
		default:
			return undefined;
	}
}

export function isActiveStudyState(state: CardState): boolean {
	return state === CardState.Learning || state === CardState.Relearning;
}
