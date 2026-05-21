import { WEAVE_WORKSPACE_EVENTS } from "../../constants/weave-events";
import type { WeavePlugin } from "../../main";
import type { DataChangeAction, DataChangeEvent, DataChangeType } from "../DataSyncService";

export interface NotifyDataChangedOptions {
	structured?: boolean;
	type?: DataChangeType;
	action?: DataChangeAction;
	ids?: string[];
	metadata?: Record<string, unknown>;
}

export function createWeaveDataChangeNotifier(plugin: WeavePlugin, defaultType: DataChangeType) {
	const notifyStructured = async (options: NotifyDataChangedOptions): Promise<void> => {
		if (!plugin.dataSyncService) {
			return;
		}

		await plugin.dataSyncService.notifyChange({
			type: options.type ?? defaultType,
			action: options.action ?? "update",
			ids: options.ids,
			metadata: options.metadata,
		});
	};

	const notifyDataChanged = async (options: NotifyDataChangedOptions = {}): Promise<void> => {
		const useStructured = options.structured !== false;
		if (useStructured) {
			await notifyStructured(options);
		}
		if (!useStructured) {
			plugin.app.workspace.trigger(WEAVE_WORKSPACE_EVENTS.DATA_CHANGED);
		}
	};

	const signalLegacyDataChanged = (): void => {
		plugin.app.workspace.trigger(WEAVE_WORKSPACE_EVENTS.DATA_CHANGED);
	};

	const signalLegacyCardChanged = (
		action: "create" | "update" | "delete",
		options?: { includeDataChanged?: boolean; cardId?: string; payload?: unknown }
	): void => {
		const payload = options?.payload;
		if (action === "create") {
			plugin.app.workspace.trigger(WEAVE_WORKSPACE_EVENTS.CARD_CREATED, payload);
		} else if (action === "update") {
			plugin.app.workspace.trigger(WEAVE_WORKSPACE_EVENTS.CARD_UPDATED, payload);
		} else if (action === "delete") {
			plugin.app.workspace.trigger(WEAVE_WORKSPACE_EVENTS.CARD_DELETED, options?.cardId ?? payload);
		}

		if (options?.includeDataChanged !== false) {
			plugin.app.workspace.trigger(WEAVE_WORKSPACE_EVENTS.DATA_CHANGED);
		}
	};

	return {
		notifyDataChanged,
		signalLegacyDataChanged,
		signalLegacyCardChanged,
	};
}

export type WeaveDataChangeNotifier = ReturnType<typeof createWeaveDataChangeNotifier>;

export type { DataChangeEvent };
