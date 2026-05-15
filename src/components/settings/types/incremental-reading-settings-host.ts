import type { App } from "obsidian";
import type { IRTagGroupService } from "../../../services/incremental-reading/IRTagGroupService";
import type { IncrementalReadingSettings } from "../../../types/plugin-settings.d";

export interface IncrementalReadingSettingsHost {
	app: App;
	manifest?: {
		name?: string;
		version?: string;
	};
	settings: {
		weaveParentFolder?: string;
		incrementalReading?: IncrementalReadingSettings;
	};
	irTagGroupService?: IRTagGroupService;
	getIncrementalReadingSettings(): IncrementalReadingSettings;
	saveIncrementalReadingSettings(
		settings: IncrementalReadingSettings,
		options?: { syncFolderSubscription?: boolean }
	): Promise<IncrementalReadingSettings>;
	saveSettings(): Promise<void>;
	syncIncrementalReadingFolderSubscriptionFromSettings?: (options?: {
		trigger?: "startup" | "settings" | "file-change" | "manual";
	}) => Promise<number>;
}
