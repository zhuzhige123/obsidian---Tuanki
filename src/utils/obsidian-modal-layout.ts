import type { Modal } from "obsidian";

interface ConfigureWeaveObsidianModalLayoutOptions {
	modalClass: string;
	contentClass: string;
}

export function configureWeaveObsidianModalLayout(
	modal: Modal,
	options: ConfigureWeaveObsidianModalLayoutOptions
): void {
	modal.modalEl.addClass(
		"weave-obsidian-modal-shell",
		...options.modalClass.split(/\s+/).filter(Boolean)
	);
	modal.contentEl.empty();
	modal.contentEl.addClass(
		"weave-obsidian-modal-content-shell",
		...options.contentClass.split(/\s+/).filter(Boolean)
	);
}
