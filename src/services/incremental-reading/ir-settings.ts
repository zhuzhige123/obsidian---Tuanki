import { resolveIRImportFolder } from "../../config/paths";
import { normalizeIncrementalReadingFolderSubscriptionSettings } from "./folder-subscription-settings";
import type {
  CalloutSignalSettings,
  CalloutTypeWeight,
  IncrementalReadingFolderSubscriptionSettings,
  IncrementalReadingSettings,
  IRCalendarSidebarSettings
} from "../../types/plugin-settings.d";

export const DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS: IRCalendarSidebarSettings = {
  continuousReadingEnabled: false,
  autoStartNextTimerEnabled: false,
  showSchedulingPreview: false,
  calendarViewMode: "full",
  showMaterialTimers: true,
  backgroundWall: {
    imagePath: "",
    fadePercent: 72
  }
};

export const DEFAULT_IR_FOLDER_SUBSCRIPTION_SETTINGS: IncrementalReadingFolderSubscriptionSettings = {
  rules: [],
  initialScheduleMode: "today",
  importConfirmThreshold: 20
};

export const DEFAULT_IR_CALLOUT_TYPES: CalloutTypeWeight[] = [
  { type: "question", enabled: true, weight: 2.5 },
  { type: "warning", enabled: true, weight: 2.0 },
  { type: "quote", enabled: true, weight: 1.5 },
  { type: "tip", enabled: false, weight: 1.5 },
  { type: "info", enabled: false, weight: 1.0 },
  { type: "note", enabled: false, weight: 0.8 }
];

export const DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS: CalloutSignalSettings = {
  enabled: true,
  typeWeights: DEFAULT_IR_CALLOUT_TYPES,
  maxBoost: 2.0,
  saturationParam: 4,
  minContentLength: 0
};

export function buildDefaultIncrementalReadingSettings(
  weaveParentFolder?: string | null
): IncrementalReadingSettings {
  return {
    defaultIntervalFactor: 1.5,
    dailyNewLimit: 20,
    dailyReviewLimit: 50,
    defaultSplitLevel: 2,
    interleaveMode: true,
    maxConsecutiveSameTopic: 3,
    reviewThreshold: 7,
    maxInterval: 365,
    importFolder: resolveIRImportFolder(undefined, String(weaveParentFolder || "").trim()),
    selectionQuickCreateDeleteSource: false,
    selectionQuickCreateLastFolder: "",
    selectionQuickCreateBacklinkPosition: "start",
    selectionQuickCreateSourceDocumentBacklinkPosition: "start",
    appendSourceDocumentBacklinkOnSplitImport: false,
    scheduleStrategy: "processing",
    dailyTimeBudgetMinutes: 40,
    maxAppearancesPerDay: 2,
    enableTagGroupPrior: true,
    agingStrength: "low",
    autoPostponeStrategy: "gentle",
    priorityHalfLifeDays: 7,
    learnAheadDays: 3,
    tagGroupFollowMode: "ask",
    folderSubscription: {
      ...DEFAULT_IR_FOLDER_SUBSCRIPTION_SETTINGS
    },
    calendarSidebar: {
      ...DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS,
      backgroundWall: {
        ...DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS.backgroundWall
      }
    },
    calloutSignal: {
      ...DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS,
      typeWeights: DEFAULT_IR_CALLOUT_TYPES.map((item) => ({ ...item }))
    }
  };
}

export function normalizeIRCalendarSidebarSettings(
  settings?: Partial<IRCalendarSidebarSettings> | null
): IRCalendarSidebarSettings {
  return {
    ...DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS,
    ...(settings ?? {}),
    backgroundWall: {
      ...DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS.backgroundWall,
      ...(settings?.backgroundWall ?? {}),
      imagePath: String(settings?.backgroundWall?.imagePath || "").trim(),
      fadePercent: Number.isFinite(Number(settings?.backgroundWall?.fadePercent))
        ? Number(settings?.backgroundWall?.fadePercent)
        : (DEFAULT_IR_CALENDAR_SIDEBAR_SETTINGS.backgroundWall?.fadePercent ?? 72)
    }
  };
}

export function normalizeIRCalloutSignalSettings(
  settings?: CalloutSignalSettings | null
): CalloutSignalSettings {
  return {
    ...DEFAULT_IR_CALLOUT_SIGNAL_SETTINGS,
    ...(settings ?? {}),
    typeWeights: Array.isArray(settings?.typeWeights) && settings.typeWeights.length > 0
      ? settings.typeWeights.map((item) => ({ ...item }))
      : DEFAULT_IR_CALLOUT_TYPES.map((item) => ({ ...item }))
  };
}

export function normalizeIncrementalReadingSettings(
  settings?: Partial<IncrementalReadingSettings> | null,
  weaveParentFolder?: string | null
): IncrementalReadingSettings {
  const defaults = buildDefaultIncrementalReadingSettings(weaveParentFolder);
  return {
    ...defaults,
    ...(settings ?? {}),
    importFolder: resolveIRImportFolder(settings?.importFolder, String(weaveParentFolder || "").trim()),
    selectionQuickCreateLastFolder: String(settings?.selectionQuickCreateLastFolder || "").trim(),
    folderSubscription: normalizeIncrementalReadingFolderSubscriptionSettings(settings?.folderSubscription),
    calendarSidebar: normalizeIRCalendarSidebarSettings(settings?.calendarSidebar),
    calloutSignal: normalizeIRCalloutSignalSettings(settings?.calloutSignal)
  };
}
