import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
});
