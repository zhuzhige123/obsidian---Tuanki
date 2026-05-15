import type {
	CalloutSignalSettings,
	CalloutTypeWeight,
	IncrementalReadingFolderSubscriptionInitialScheduleMode,
	IncrementalReadingFolderSubscriptionRule,
	IncrementalReadingFolderSubscriptionSettings,
	IncrementalReadingSettings,
} from "../../types/plugin-settings.d";
import type { IncrementalReadingSettingsHost } from "../../components/settings/types/incremental-reading-settings-host";
import { getLegacyIRImportFolder } from "../../config/paths";
import {
	createIncrementalReadingFolderSubscriptionRuleId,
	normalizeIncrementalReadingFolderSubscriptionSettings,
} from "./folder-subscription-settings";
import {
	buildDefaultIncrementalReadingSettings,
	DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS,
	DEFAULT_IR_CALLOUT_TYPES,
} from "./ir-settings";

type RootSettingsState = {
	incrementalReading?: IncrementalReadingSettings;
};

type UpdateSettingsState = (settings: RootSettingsState) => void;

export class IRSettingsEditor {
	private readonly plugin: IncrementalReadingSettingsHost;
	private readonly getState: () => RootSettingsState;
	private readonly updateState: UpdateSettingsState;

	constructor(options: {
		plugin: IncrementalReadingSettingsHost;
		getState: () => RootSettingsState;
		updateState: UpdateSettingsState;
	}) {
		this.plugin = options.plugin;
		this.getState = options.getState;
		this.updateState = options.updateState;
	}

	getNormalizedIncrementalReadingSettings(): IncrementalReadingSettings {
		const defaultIRSettings = buildDefaultIncrementalReadingSettings(
			this.plugin.settings?.weaveParentFolder
		);
		return {
			...defaultIRSettings,
			...this.plugin.getIncrementalReadingSettings(),
			importFolder: getLegacyIRImportFolder(this.plugin.settings?.weaveParentFolder),
		};
	}

	ensureIncrementalReadingSettings(): IncrementalReadingSettings {
		const state = this.getState();
		if (!state.incrementalReading) {
			const nextSettings = this.getNormalizedIncrementalReadingSettings();
			this.updateState({
				...state,
				incrementalReading: nextSettings,
			});
			return nextSettings;
		}
		return state.incrementalReading;
	}

	async save(syncFolderSubscription = false): Promise<IncrementalReadingSettings> {
		const incrementalReading = this.ensureIncrementalReadingSettings();
		const savedSettings = (await this.plugin.saveIncrementalReadingSettings(incrementalReading, {
			syncFolderSubscription,
		})) as IncrementalReadingSettings;
		this.updateState({
			...this.getState(),
			incrementalReading: savedSettings,
		});
		return savedSettings;
	}

	getFolderSubscriptionSettingsSnapshot(): IncrementalReadingFolderSubscriptionSettings {
		return normalizeIncrementalReadingFolderSubscriptionSettings(
			this.ensureIncrementalReadingSettings().folderSubscription
		);
	}

	applyNormalizedFolderSubscriptionSettings(): void {
		const incrementalReading = this.ensureIncrementalReadingSettings();
		const normalizedFolderSubscription = normalizeIncrementalReadingFolderSubscriptionSettings(
			incrementalReading.folderSubscription
		);
		if (
			JSON.stringify(incrementalReading.folderSubscription || {}) !==
			JSON.stringify(normalizedFolderSubscription)
		) {
			incrementalReading.folderSubscription = normalizedFolderSubscription;
		}
	}

	getFolderSubscriptionRules(): IncrementalReadingFolderSubscriptionRule[] {
		return this.getFolderSubscriptionSettingsSnapshot().rules || [];
	}

	updateFolderSubscriptionSettings(
		updater: (
			current: IncrementalReadingFolderSubscriptionSettings
		) => IncrementalReadingFolderSubscriptionSettings
	): void {
		const incrementalReading = this.ensureIncrementalReadingSettings();
		incrementalReading.folderSubscription = normalizeIncrementalReadingFolderSubscriptionSettings(
			updater(this.getFolderSubscriptionSettingsSnapshot())
		);
	}

	createEmptyFolderSubscriptionRule(): IncrementalReadingFolderSubscriptionRule {
		return {
			id: createIncrementalReadingFolderSubscriptionRuleId(),
			enabled: true,
			folderPath: "",
			deckId: "",
		};
	}

	getFolderSubscriptionImportConfirmThreshold(): number {
		const value = Number(this.getFolderSubscriptionSettingsSnapshot().importConfirmThreshold ?? 20);
		if (!Number.isFinite(value) || value < 0) {
			return 20;
		}
		return Math.min(200, Math.round(value));
	}

	getFolderSubscriptionInitialScheduleMode(): IncrementalReadingFolderSubscriptionInitialScheduleMode {
		return this.getFolderSubscriptionSettingsSnapshot().initialScheduleMode === "scheduled"
			? "scheduled"
			: "today";
	}

	updateIncrementalReading(updater: (settings: IncrementalReadingSettings) => void): void {
		updater(this.ensureIncrementalReadingSettings());
	}

	getCalloutSignalSettings(): CalloutSignalSettings {
		const incrementalReading = this.ensureIncrementalReadingSettings();
		if (!incrementalReading.calloutSignal) {
			incrementalReading.calloutSignal = this.buildDefaultCalloutSignalSettings();
		}
		if (
			!incrementalReading.calloutSignal.typeWeights ||
			incrementalReading.calloutSignal.typeWeights.length === 0
		) {
			incrementalReading.calloutSignal.typeWeights = DEFAULT_IR_CALLOUT_TYPES.map((item) => ({
				...item,
			}));
		}
		return incrementalReading.calloutSignal;
	}

	updateCalloutSignal(updater: (settings: CalloutSignalSettings) => void): void {
		updater(this.getCalloutSignalSettings());
	}

	updateCalloutType(
		type: string,
		updater: (typeWeight: CalloutTypeWeight) => CalloutTypeWeight
	): boolean {
		const calloutSignal = this.getCalloutSignalSettings();
		const index = (calloutSignal.typeWeights || []).findIndex((item) => item.type === type);
		if (index === -1 || !calloutSignal.typeWeights) {
			return false;
		}
		calloutSignal.typeWeights[index] = updater(calloutSignal.typeWeights[index]);
		return true;
	}

	addCustomCalloutType(type: string, weight: number): void {
		const calloutSignal = this.getCalloutSignalSettings();
		if (!calloutSignal.typeWeights) {
			calloutSignal.typeWeights = [];
		}
		calloutSignal.typeWeights.push({
			type,
			enabled: true,
			weight,
		});
	}

	removeCustomCalloutType(type: string): boolean {
		const calloutSignal = this.getCalloutSignalSettings();
		if (!calloutSignal.typeWeights) {
			return false;
		}
		const index = calloutSignal.typeWeights.findIndex((item) => item.type === type);
		if (index === -1) {
			return false;
		}
		calloutSignal.typeWeights.splice(index, 1);
		return true;
	}

	buildDefaultCalloutSignalSettings(): CalloutSignalSettings {
		return {
			...DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS,
			typeWeights: DEFAULT_IR_CALLOUT_TYPES.map((item) => ({ ...item })),
		};
	}

	getDefaultCalloutTypes(): CalloutTypeWeight[] {
		return DEFAULT_IR_CALLOUT_TYPES.map((item) => ({ ...item }));
	}
}
