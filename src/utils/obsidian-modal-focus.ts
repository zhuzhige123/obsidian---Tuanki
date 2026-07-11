import { focusManager } from "./focus-manager";

type ModalLike = {
	open: (...args: unknown[]) => unknown;
	onClose?: (...args: unknown[]) => unknown;
};

/**
 * Save focus before an Obsidian modal opens and restore it after the modal closes.
 * This avoids the editor/input focus getting "stuck" after confirm/select dialogs.
 */
export function attachModalFocusRestore<T extends ModalLike>(modal: T): T {
	const originalOpen = modal.open.bind(modal);
	modal.open = (...args: unknown[]) => {
		focusManager.saveFocus();
		return originalOpen(...args);
	};

	const originalOnClose =
		typeof modal.onClose === "function" ? modal.onClose.bind(modal) : undefined;

	modal.onClose = (...args: unknown[]) => {
		try {
			const result = originalOnClose?.(...args);
			if (result instanceof Promise) {
				return result.finally(() => {
					focusManager.restoreFocus();
				});
			}

			focusManager.restoreFocus();
			return result;
		} catch (error) {
			focusManager.restoreFocus();
			throw error;
		}
	};

	return modal;
}
