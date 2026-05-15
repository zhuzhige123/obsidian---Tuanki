import type {
	AnkiConnectSettings,
	AnkiSyncCardType,
	CardTypeTemplateMapping,
	DeckSyncMapping,
	TemplateSyncMapping,
} from "../../components/settings/types/settings-types";
import {
	type LegacyAnkiConnectSettings,
	migrateAnkiConnectSettings,
	needsMigration,
} from "./migrations/remove-bidirectional-sync";

const DEFAULT_ENDPOINT = "http://localhost:8765";
const DEFAULT_MEDIA_TYPES = ["png", "jpg", "jpeg", "gif", "mp3", "mp4"];
const SUPPORTED_CARD_TYPE_MAPPINGS: AnkiSyncCardType[] = [
	"basic-qa",
	"single-choice",
	"multiple-choice",
	"cloze-deletion",
];

function normalizeCardTypeTemplateMapping(
	mapping: Partial<CardTypeTemplateMapping> | undefined
): CardTypeTemplateMapping {
	return {
		enabled: mapping?.enabled ?? false,
		ankiModelName: mapping?.ankiModelName ?? "",
		fieldMappings: { ...(mapping?.fieldMappings ?? {}) },
		lastValidatedAt: mapping?.lastValidatedAt,
	};
}

function cloneCardTypeMappings(
	mappings: Partial<Record<AnkiSyncCardType, CardTypeTemplateMapping>> | undefined
): Partial<Record<AnkiSyncCardType, CardTypeTemplateMapping>> {
	if (!mappings) {
		return {};
	}

	const cloned: Partial<Record<AnkiSyncCardType, CardTypeTemplateMapping>> = {};

	for (const cardType of SUPPORTED_CARD_TYPE_MAPPINGS) {
		if (mappings[cardType]) {
			cloned[cardType] = normalizeCardTypeTemplateMapping(mappings[cardType]);
		}
	}

	return cloned;
}

function normalizeDeckMapping(mapping: Partial<DeckSyncMapping>): DeckSyncMapping {
	return {
		weaveDeckId: mapping.weaveDeckId ?? "",
		weaveDeckName: mapping.weaveDeckName ?? "",
		ankiDeckName: mapping.ankiDeckName ?? "",
		syncDirection: "to_anki",
		enabled: mapping.enabled ?? false,
		lastSyncTime: mapping.lastSyncTime,
		contentConversion: mapping.contentConversion ?? "standard",
		cardTypeMappings: cloneCardTypeMappings(mapping.cardTypeMappings),
	};
}

function cloneTemplateMappings(
	mappings: Record<string, TemplateSyncMapping> | undefined
): Record<string, TemplateSyncMapping> {
	if (!mappings) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(mappings).map(([key, value]) => [
			key,
			{
				...value,
				fieldMappings: { ...(value.fieldMappings ?? {}) },
			},
		])
	);
}

export function createDefaultAnkiConnectSettings(): AnkiConnectSettings {
	return {
		enabled: false,
		endpoint: DEFAULT_ENDPOINT,
		mediaSync: {
			enabled: true,
			largeFileThresholdMB: 10,
			supportedTypes: [...DEFAULT_MEDIA_TYPES],
			createBacklinks: true,
		},
		autoSync: {
			enabled: false,
			intervalMinutes: 30,
			syncOnStartup: false,
			onlyWhenAnkiRunning: true,
			prioritizeRecent: true,
		},
		deckMappings: {},
		templateMappings: {},
		tutorialCompleted: false,
		tutorialStep: 0,
	};
}

export function normalizeAnkiConnectSettings(
	input?: Partial<AnkiConnectSettings> | LegacyAnkiConnectSettings | null
): AnkiConnectSettings {
	const defaults = createDefaultAnkiConnectSettings();
	const source = input ?? {};
	const migrated = needsMigration(source as LegacyAnkiConnectSettings)
		? migrateAnkiConnectSettings(source as LegacyAnkiConnectSettings)
		: source;

	const deckMappings = Object.fromEntries(
		Object.entries(migrated.deckMappings ?? {}).map(([key, value]) => [
			key,
			normalizeDeckMapping(value as Partial<DeckSyncMapping>),
		])
	);

	return {
		...defaults,
		...migrated,
		mediaSync: {
			...defaults.mediaSync,
			...(migrated.mediaSync ?? {}),
			supportedTypes: [
				...(migrated.mediaSync?.supportedTypes ?? defaults.mediaSync.supportedTypes),
			],
		},
		autoSync: {
			...defaults.autoSync,
			...(migrated.autoSync ?? {}),
		},
		deckMappings,
		templateMappings: cloneTemplateMappings(migrated.templateMappings),
		backups: migrated.backups ? { ...migrated.backups } : undefined,
		tutorialCompleted: migrated.tutorialCompleted ?? defaults.tutorialCompleted,
		tutorialStep: migrated.tutorialStep ?? defaults.tutorialStep,
		uiCache: migrated.uiCache
			? {
					ankiDecks: [...(migrated.uiCache.ankiDecks ?? [])],
					ankiModels: [...(migrated.uiCache.ankiModels ?? [])],
					lastFetchTime: migrated.uiCache.lastFetchTime ?? "",
					lastConnectionStatus: migrated.uiCache.lastConnectionStatus,
			  }
			: undefined,
		quickActions: migrated.quickActions ? { ...migrated.quickActions } : undefined,
		incrementalSyncState: migrated.incrementalSyncState,
	};
}

export function cloneAnkiConnectSettings(settings: AnkiConnectSettings): AnkiConnectSettings {
	return normalizeAnkiConnectSettings(settings);
}
