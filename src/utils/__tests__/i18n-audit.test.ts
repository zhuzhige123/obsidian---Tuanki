import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { appShellTranslations } from '../i18n/resources/app-shell-clean';

interface I18nAuditReport {
  aggregateStructureViolations: string[];
  resourceModuleBoundaryViolations: string[];
  suggestedResourceModuleMoves: Array<{ key: string }>;
  duplicateKeys: string[];
  nonStringValues: string[];
  missingByLang: Record<string, string[]>;
  placeholderMismatches: Array<{ key: string }>;
  codeUsage?: {
    directMissingKeys?: string[];
    unresolvedMissingKeys?: string[];
  };
}

function runI18nAudit(rootDir: string): I18nAuditReport {
  const scriptPath = path.join(rootDir, 'scripts', 'audit-i18n.mjs');

  try {
    const rawOutput = execFileSync(process.execPath, [scriptPath, '--json'], {
      cwd: rootDir,
      encoding: 'utf8'
    });

    return JSON.parse(rawOutput) as I18nAuditReport;
  } catch (error) {
    const rawOutput =
      typeof (error as { stdout?: unknown }).stdout === 'string'
        ? (error as { stdout: string }).stdout
        : '';

    if (!rawOutput.trim()) {
      throw error;
    }

    return JSON.parse(rawOutput) as I18nAuditReport;
  }
}

function stripNonExecutableText(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function collectHardcodedCjkHotspots(source: string): string[] {
  const cleaned = stripNonExecutableText(source);
  const patterns = [
    /(title|aria-label|placeholder)\s*=\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']/g,
    /\.setTitle\(\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']\s*\)/g,
    /new Notice\(\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']\s*\)/g,
    /showNotification\(\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']/g,
    /(label|title|text|placeholder|description)\s*:\s*["'`][^"'`\n\r]*[\u4E00-\u9FFF][^"'`\n\r]*["'`]/g,
    /(message|error|reason)\s*:\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']/g,
    /throw new Error\(\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']\s*\)/g,
    /throw new Error\(\s*`[^`\n\r]*[\u4E00-\u9FFF][^`\n\r]*`\s*\)/g,
    /new Notice\(\s*`[^`\n\r]*[\u4E00-\u9FFF][^`\n\r]*`\s*\)/g,
    /\.(updateDescription|updateProgress|increment|setComplete)\(\s*["'`][^"'`\n\r]*[\u4E00-\u9FFF][^"'`\n\r]*["'`]/g,
    /buildBlockedFixResult\([^,\n]+,\s*["'][^"'\n\r]*[\u4E00-\u9FFF][^"'\n\r]*["']/g,
    />[^\n\r<{]*[\u4E00-\u9FFF][^\n\r<{]*</g,
  ];

  const matches = new Set<string>();
  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      if (match[0]) {
        matches.add(match[0].trim());
      }
    }
  }

  return [...matches].sort();
}

describe('i18n audit', () => {
  it('keeps locale resources structurally consistent and free of EPUB i18n regressions', () => {
    const rootDir = process.cwd();
    const report = runI18nAudit(rootDir);
    const epubMissingKeys = [
      ...(report.codeUsage?.directMissingKeys ?? []),
      ...(report.codeUsage?.unresolvedMissingKeys ?? []),
    ].filter((key) => key.startsWith('epubView.') || key.startsWith('views.epubView.'));

    expect(report.aggregateStructureViolations).toEqual([]);
    expect(report.suggestedResourceModuleMoves).toEqual([]);
    expect(report.duplicateKeys).toEqual([]);
    expect(report.nonStringValues).toEqual([]);
    expect(report.placeholderMismatches).toEqual([]);
    expect([...new Set(epubMissingKeys)].sort()).toEqual([]);
  });

  it('keeps cleared bilingual hotspots free of new hardcoded Chinese UI text', () => {
    const rootDir = process.cwd();
    const hotspotFiles = [
      'src/components/navigation/SidebarNavHeader.svelte',
      'src/components/modals/tabs/CardInfoTab.svelte',
      'src/utils/weave-main-menu.ts',
      'src/components/pages/WeaveCardManagementPage.svelte',
      'src/views/StudyView.ts',
      'src/views/QuestionBankView.ts',
      'src/components/pages/DeckStudyPage.svelte',
      'src/components/settings/components/EnhancedActivationForm.svelte',
      'src/components/settings/components/EnhancedLicenseStatusCard.svelte',
      'src/components/settings/sections/LicenseSection.svelte',
      'src/components/batch/WeaveBatchToolbar.svelte',
      'src/components/cards/GridCard.svelte',
      'src/components/cards/LazyGridCard.svelte',
      'src/components/deck/DeckSelector.svelte',
      'src/components/ai-assistant/AIGenerationConfigForm.svelte',
      'src/components/ai-assistant/AIGenerationConfigPopover.svelte',
      'src/components/ai-assistant/PromptFooter.svelte',
      'src/components/ai-assistant/SelectedTextAICardPanel.svelte',
      'src/components/ai-assistant/AICardPreviewWorkspace.svelte',
      'src/components/ai-assistant/RegenerateDialog.svelte',
      'src/components/ai-assistant/AIConfigModal.svelte',
      'src/components/ai-assistant/ProgressIndicator.svelte',
      'src/components/modals/tabs/ReviewStatsTab.svelte',
      'src/components/modals/tabs/MemoryCurveTab.svelte',
      'src/components/search/CardSearchInput.svelte',
      'src/components/modals/CSVImportModal.svelte',
      'src/components/modals/APKGImportModal.svelte',
      'src/components/modals/DataManagementModal.svelte',
      'src/components/modals/DataManagementModalObsidian.ts',
      'src/components/modals/CreateQuestionBankModal.svelte',
      'src/components/modals/BuildDeckModal.svelte',
      'src/components/modals/CreateCardModal.svelte',
      'src/components/editor/InlineCardEditor.svelte',
      'src/components/study/SourceInfoBar.svelte',
      'src/components/study/CardEditorContainer.svelte',
      'src/components/study/AIActionManager.svelte',
      'src/components/study/MobileCardManagementHeader.svelte',
      'src/components/study/MobileCardManagementMenu.svelte',
      'src/components/study/StudyInterface.svelte',
      'src/components/study/VerticalToolbar.svelte',
      'src/components/study/study-interface-helpers.ts',
      'src/components/pages/DeckStudyPage.svelte',
      'src/services/data-management/DataManagementService.ts',
    ];

    const violations = hotspotFiles.flatMap((relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const matches = collectHardcodedCjkHotspots(content);
      return matches.map((snippet) => `${relativePath}: ${snippet}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps shared app-shell ui and toolbar actions localized in English', () => {
    const enUi = appShellTranslations['en-US'].ui as Record<string, unknown>;
    const enToolbar = appShellTranslations['en-US'].toolbar as Record<string, unknown>;

    expect(enUi.newCard).toBe('New Card');
    expect(enUi.edit).toBe('Edit');
    expect(enUi.delete).toBe('Delete');

    expect(enToolbar.edit).toBe('Edit');
    expect(enToolbar.delete).toBe('Delete');
    expect(enToolbar.reminder).toBe('Reminder');
    expect(enToolbar.deck).toBe('Deck');
    expect(enToolbar.graphLink).toBe('Graph link');

    const highRiskValues = [
      enUi.newCard,
      enUi.edit,
      enUi.delete,
      enToolbar.edit,
      enToolbar.delete,
      enToolbar.reminder,
      enToolbar.deck,
      enToolbar.graphLink,
    ];

    highRiskValues.forEach((value) => {
      expect(String(value)).not.toMatch(/[\u4E00-\u9FFF]/);
    });
  });
});
