import type { Deck } from "../../data/types";
import type { WeaveDataStorage } from "../../data/storage";
import type { WeavePlugin } from "../../main";

export interface StagingDeckTarget {
	id: string;
	name: string;
}

export function isMemoryDeckForStaging(deck: Pick<Deck, "purpose" | "deckType">): boolean {
	return deck.purpose !== "test" && deck.deckType !== "question-bank";
}

export async function resolveStagingMemoryDeck(
	dataStorage: WeaveDataStorage,
	configuredTarget?: string
): Promise<StagingDeckTarget | null> {
	const allDecks = await dataStorage.getDecks();
	const memoryDecks = allDecks.filter(isMemoryDeckForStaging);

	const configuredDeckId = configuredTarget?.trim();
	if (configuredDeckId) {
		const matchedDeck =
			memoryDecks.find((deck) => deck.id === configuredDeckId || deck.name === configuredDeckId) ??
			(await dataStorage.getDeck(configuredDeckId));
		if (matchedDeck && isMemoryDeckForStaging(matchedDeck)) {
			return { id: matchedDeck.id, name: matchedDeck.name };
		}
	}

	const firstDeck = memoryDecks[0];
	return firstDeck ? { id: firstDeck.id, name: firstDeck.name } : null;
}

export async function listStagingQuestionBankOptions(
	plugin: WeavePlugin
): Promise<StagingDeckTarget[]> {
	const questionBankService = plugin.questionBankService;
	if (!questionBankService) {
		return [];
	}

	await questionBankService.getAllBanks();
	return questionBankService.getAllQuestionBanks().map((bank) => ({
		id: bank.id,
		name: bank.name,
	}));
}

export async function resolveDefaultStagingQuestionBank(
	plugin: WeavePlugin,
	memoryDeckId?: string
): Promise<StagingDeckTarget | null> {
	const questionBankService = plugin.questionBankService;
	if (!questionBankService) {
		return null;
	}

	await questionBankService.getAllBanks();

	if (memoryDeckId) {
		const candidates = await questionBankService.getBankCandidatesByMemoryDeckId(memoryDeckId);
		if (candidates.length > 0) {
			const bank = candidates[0].bank;
			return { id: bank.id, name: bank.name };
		}
	}

	const banks = questionBankService.getAllQuestionBanks();
	const firstBank = banks[0];
	return firstBank ? { id: firstBank.id, name: firstBank.name } : null;
}

export function pickPreferredStagingQuestionBankId(
	options: StagingDeckTarget[],
	preferredId?: string
): string {
	const normalizedPreferredId = preferredId?.trim();
	if (
		normalizedPreferredId &&
		options.some((option) => option.id === normalizedPreferredId)
	) {
		return normalizedPreferredId;
	}
	return options[0]?.id ?? "";
}
