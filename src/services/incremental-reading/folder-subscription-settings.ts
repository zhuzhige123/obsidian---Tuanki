import { normalizePath } from 'obsidian';
import type {
  IncrementalReadingFolderSubscriptionInitialScheduleMode,
  IncrementalReadingFolderSubscriptionRule,
  IncrementalReadingFolderSubscriptionSettings
} from '../../types/plugin-settings.d';

export function createIncrementalReadingFolderSubscriptionRuleId(): string {
  return `ir-folder-sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeIncrementalReadingFolderSubscriptionPath(folderPath: string): string {
  const trimmed = String(folderPath || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === '/') {
    return '/';
  }
  return normalizePath(trimmed).replace(/^\/+|\/+$/g, '');
}

export function normalizeIncrementalReadingFolderSubscriptionRule(
  rule?: IncrementalReadingFolderSubscriptionRule | null,
  fallbackIndex = 0
): IncrementalReadingFolderSubscriptionRule {
  return {
    id: String(rule?.id || '').trim() || `ir-folder-sub-${fallbackIndex + 1}`,
    enabled: rule?.enabled !== false,
    folderPath: normalizeIncrementalReadingFolderSubscriptionPath(String(rule?.folderPath || '')),
    deckId: String(rule?.deckId || '').trim()
  };
}

export function normalizeIncrementalReadingFolderSubscriptionSettings(
  settings?: IncrementalReadingFolderSubscriptionSettings | null
): IncrementalReadingFolderSubscriptionSettings {
  const threshold = Number(settings?.importConfirmThreshold ?? 20);
  const initialScheduleMode: IncrementalReadingFolderSubscriptionInitialScheduleMode =
    settings?.initialScheduleMode === 'scheduled' ? 'scheduled' : 'today';

  const normalizedRules = Array.isArray(settings?.rules)
    ? settings.rules.map((rule, index) => normalizeIncrementalReadingFolderSubscriptionRule(rule, index))
    : [];

  const migratedRules = normalizedRules.length > 0
    ? normalizedRules
    : (() => {
        const folderPath = normalizeIncrementalReadingFolderSubscriptionPath(String(settings?.folderPath || ''));
        const deckId = String(settings?.deckId || '').trim();
        const enabled = settings?.enabled === true;
        if (!folderPath && !deckId && !enabled) {
          return [];
        }
        return [
          {
            id: createIncrementalReadingFolderSubscriptionRuleId(),
            enabled,
            folderPath,
            deckId
          }
        ];
      })();

  return {
    rules: migratedRules.filter((rule) => rule.enabled || rule.folderPath || rule.deckId),
    initialScheduleMode,
    importConfirmThreshold:
      Number.isFinite(threshold) && threshold >= 0 ? Math.min(200, Math.round(threshold)) : 20
  };
}

export function getActiveIncrementalReadingFolderSubscriptionRules(
  settings?: IncrementalReadingFolderSubscriptionSettings | null
): IncrementalReadingFolderSubscriptionRule[] {
  return (normalizeIncrementalReadingFolderSubscriptionSettings(settings).rules || []).filter(
    (rule) => rule.enabled === true && Boolean(rule.folderPath) && Boolean(rule.deckId)
  );
}

export function isFileWithinIncrementalReadingFolderSubscription(filePath: string, folderPath: string): boolean {
  const normalizedFilePath = normalizePath(String(filePath || '').trim());
  const normalizedFolderPath = normalizeIncrementalReadingFolderSubscriptionPath(folderPath);
  if (!normalizedFilePath || !normalizedFolderPath) {
    return false;
  }
  if (normalizedFolderPath === '/') {
    return true;
  }
  return normalizedFilePath === normalizedFolderPath || normalizedFilePath.startsWith(`${normalizedFolderPath}/`);
}

export function resolveIncrementalReadingFolderSubscriptionRuleForFile(
  filePath: string,
  settingsOrRules?: IncrementalReadingFolderSubscriptionSettings | IncrementalReadingFolderSubscriptionRule[] | null
): IncrementalReadingFolderSubscriptionRule | null {
  const rules = Array.isArray(settingsOrRules)
    ? settingsOrRules.map((rule, index) => normalizeIncrementalReadingFolderSubscriptionRule(rule, index))
    : getActiveIncrementalReadingFolderSubscriptionRules(settingsOrRules);

  const matchedRules = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled === true && isFileWithinIncrementalReadingFolderSubscription(filePath, rule.folderPath || ''))
    .sort((left, right) => {
      const leftLength = String(left.rule.folderPath || '').length;
      const rightLength = String(right.rule.folderPath || '').length;
      if (rightLength !== leftLength) {
        return rightLength - leftLength;
      }
      return left.index - right.index;
    });

  return matchedRules[0]?.rule || null;
}
