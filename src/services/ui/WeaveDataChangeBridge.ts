import { WEAVE_WORKSPACE_EVENTS } from "../../constants/weave-events";
import type { WeavePlugin } from "../../main";
import type { DataChangeType } from "../DataSyncService";

export function createWeaveDataChangeNotifier(plugin: WeavePlugin, _defaultType: DataChangeType) {
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
		signalLegacyDataChanged,
		signalLegacyCardChanged,
	};
}

export type WeaveDataChangeNotifier = ReturnType<typeof createWeaveDataChangeNotifier>;
