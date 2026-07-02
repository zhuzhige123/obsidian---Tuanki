import type { Deck } from "../../data/types";
import type { QuestionBankStorage } from "../../services/question-bank/QuestionBankStorage";

export interface BatchAddToQuestionBankOptions {
	skippedCount?: number;
}

export function resolveBatchAddToQuestionBankNoticeParams(
	count: number,
	bankName: string,
	options?: BatchAddToQuestionBankOptions
): {
	key: "addToQuestionBankDone" | "addToQuestionBankDoneWithSkipped";
	params: Record<string, string | number>;
	level: "success" | "warning";
} {
	const skippedCount = Math.max(0, options?.skippedCount ?? 0);
	if (skippedCount > 0) {
		return {
			key: "addToQuestionBankDoneWithSkipped",
			params: { count, name: bankName, skipped: skippedCount },
			level: "warning",
		};
	}

	return {
		key: "addToQuestionBankDone",
		params: { count, name: bankName },
		level: "success",
	};
}

export async function buildQuestionBankMembershipIndex(
	storage: QuestionBankStorage,
	banks: Deck[],
	selectedCardIds: string[]
): Promise<Map<string, Set<string>>> {
	const selectedSet = new Set(selectedCardIds);
	const entries = await Promise.all(
		banks.map(async (bank) => {
			const refs = await storage.loadBankQuestionRefs(bank.id);
			const matched = refs
				.map((ref) => ref.cardUuid)
				.filter((uuid): uuid is string => Boolean(uuid && selectedSet.has(uuid)));
			return [bank.id, new Set(matched)] as const;
		})
	);

	return new Map(entries);
}

export function sortQuestionBanksForMenu(banks: Deck[]): Deck[] {
	return [...banks]
		.filter((bank) => bank.deckType === "question-bank" || !bank.deckType)
		.sort((left, right) => {
			const orderDiff = (left.order || 0) - (right.order || 0);
			if (orderDiff !== 0) return orderDiff;
			return (left.name || "").localeCompare(right.name || "", "zh-Hans-CN");
		});
}

export function computeQuestionBankMembershipFlags(
	selectedCardIds: string[],
	inBankSet: Set<string>
): { anyInBank: boolean; allInBank: boolean } {
	let anyInBank = false;
	let allInBank = selectedCardIds.length > 0;

	for (const uuid of selectedCardIds) {
		if (inBankSet.has(uuid)) {
			anyInBank = true;
		} else {
			allInBank = false;
		}
	}

	return { anyInBank, allInBank };
}

export function resolveEligibleQuestionBankAdds(
	eligibleUUIDs: string[],
	inBankSet: Set<string>
): string[] {
	return eligibleUUIDs.filter((uuid) => !inBankSet.has(uuid));
}
