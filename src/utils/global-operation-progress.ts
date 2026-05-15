import {
	weaveMainInterfaceStore,
	type WeaveGlobalOperationProgressState,
} from "../stores/weave-main-interface-store";

export type GlobalOperationPatch = Partial<
	Omit<WeaveGlobalOperationProgressState, "operationId">
>;

export interface GlobalOperationController {
	operationId: string;
	total: number;
	update: (patch: GlobalOperationPatch) => void;
	finish: (patch?: GlobalOperationPatch, clearDelayMs?: number) => void;
	clear: (clearDelayMs?: number) => void;
}

export function getGlobalOperationClearDelay(status: "success" | "error"): number {
	return status === "error" ? 2500 : 1500;
}

export function createGlobalOperationController(config: {
	title: string;
	total: number;
	detail: string;
	allowNavigation?: boolean;
	navigationMessage?: string;
	operationId?: string;
}): GlobalOperationController {
	const total = Math.max(1, config.total);
	const operationId = weaveMainInterfaceStore.startGlobalOperation({
		title: config.title,
		total,
		detail: config.detail,
		allowNavigation: config.allowNavigation,
		navigationMessage: config.navigationMessage,
		operationId: config.operationId,
	});
	let clearTimer: ReturnType<typeof setTimeout> | null = null;
	const clear = (clearDelayMs = 0) => {
		if (clearTimer !== null) {
			clearTimeout(clearTimer);
		}
		clearTimer = setTimeout(() => {
			weaveMainInterfaceStore.clearGlobalOperation(operationId);
			clearTimer = null;
		}, Math.max(0, clearDelayMs));
	};

	return {
		operationId,
		total,
		update(patch: GlobalOperationPatch) {
			weaveMainInterfaceStore.updateGlobalOperation(operationId, patch);
		},
		finish(patch?: GlobalOperationPatch, clearDelayMs?: number) {
			const status = patch?.status === "error" ? "error" : "success";
			weaveMainInterfaceStore.finishGlobalOperation(operationId, {
				...patch,
				status,
				total: patch?.total ?? total,
				current: patch?.current ?? total,
			});
			clear(clearDelayMs ?? getGlobalOperationClearDelay(status));
		},
		clear,
	};
}
