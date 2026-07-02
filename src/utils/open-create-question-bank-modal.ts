import { CreateQuestionBankModalObsidian } from "../components/modals/CreateQuestionBankModalObsidian";
import type { Deck } from "../data/types";
import type WeavePlugin from "../main";

let activeCreateQuestionBankModal: CreateQuestionBankModalObsidian | null = null;

export function openCreateQuestionBankModal(params: {
	plugin: WeavePlugin;
	onBankCreated?: (bank: Deck) => void | Promise<void>;
}): void {
	const { plugin, onBankCreated } = params;

	activeCreateQuestionBankModal?.close();
	activeCreateQuestionBankModal = new CreateQuestionBankModalObsidian(plugin.app, {
		plugin,
		onBankCreated: (bank) => {
			void Promise.resolve(onBankCreated?.(bank));
		},
		onClose: () => {
			activeCreateQuestionBankModal = null;
		},
	});
	activeCreateQuestionBankModal.open();
}

export function closeCreateQuestionBankModal(): void {
	activeCreateQuestionBankModal?.close();
	activeCreateQuestionBankModal = null;
}
