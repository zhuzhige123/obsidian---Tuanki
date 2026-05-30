import { CreateDeckModalObsidian } from "../components/modals/CreateDeckModalObsidian";
import type { Deck } from "../data/types";
import type WeavePlugin from "../main";

let activeCreateDeckModal: CreateDeckModalObsidian | null = null;

export function openEditableFormalCreateDeckModal(params: {
	plugin: WeavePlugin;
	onDeckCreated: (deck: Deck) => void | Promise<void>;
}): void {
	const { plugin, onDeckCreated } = params;
	if (!plugin.dataStorage) {
		return;
	}

	activeCreateDeckModal?.close();
	activeCreateDeckModal = new CreateDeckModalObsidian(plugin.app, {
		plugin,
		dataStorage: plugin.dataStorage,
		mode: "create",
		onDeckCreated: async (deck) => {
			await onDeckCreated(deck);
		},
		onClose: () => {
			activeCreateDeckModal = null;
		},
	});
	activeCreateDeckModal.open();
}

export function closeEditableFormalCreateDeckModal(): void {
	activeCreateDeckModal?.close();
	activeCreateDeckModal = null;
}
