import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flattenTranslationLeafKeys, i18n, translationCatalog } from '../i18n';

const EN_US_ALLOWED_CJK_VALUES = new Set([
  '简体中文',
  '#we_已删除, #we_deleted',
  'Zhipu AI',
  'SiliconFlow',
]);

const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(TEST_FILE_DIR, '..', '..');
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.svelte']);
const GUARDED_PREFIXES = [
  'common.',
  'navigation.',
  'views.',
  'settings.categories.',
  'study.menu.',
  'study.view.',
  'study.priority.',
  'study.noCardsModal.',
  'cards.kanban.',
];

function collectSourceFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name === '__tests__' || entry.name === 'dist' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

function collectLiteralTranslationKeys(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const keys = new Set<string>();
  const importsI18nModule = /from\s+['\"][^'\"]*i18n['\"]\s*;?/.test(source);
  const importUsesT = importsI18nModule && /\{[^}]*\bt\b[^}]*\}/.test(source);
  const usesDerivedTr = /\b(?:let|const)\s+t\s*=\s*\$derived\(\$tr\)\s*;?/.test(source);
  const patterns = [
    /i18n\.t\(\s*['\"`]([^'\"`]+)['\"`]/g,
    /\$tr\(\s*['\"`]([^'\"`]+)['\"`]/g,
  ];

  if (importUsesT || usesDerivedTr) {
    patterns.push(/\bt\(\s*['\"`]([^'\"`]+)['\"`]/g);
  }

  if (importsI18nModule) {
    patterns.push(/\bthis\.t\(\s*['\"`]([^'\"`]+)['\"`]/g);
  }

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const key = match[1]?.trim();
      if (key && !key.includes('${')) {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

describe('i18n runtime key coverage', () => {
  it('keeps zh-CN and en-US translation catalogs aligned', () => {
    const zhKeys = new Set(flattenTranslationLeafKeys(translationCatalog['zh-CN']));
    const enKeys = new Set(flattenTranslationLeafKeys(translationCatalog['en-US']));

    const missingInEn = [...zhKeys].filter((key) => !enKeys.has(key)).sort();
    const missingInZh = [...enKeys].filter((key) => !zhKeys.has(key)).sort();

    expect(missingInEn).toEqual([]);
    expect(missingInZh).toEqual([]);
  });

  it('keeps shared high-impact translation keys used in source resolvable in both languages', () => {
    const files = collectSourceFiles(SOURCE_ROOT);
    const keys = new Set<string>();

    for (const filePath of files) {
      for (const key of collectLiteralTranslationKeys(filePath)) {
        if (GUARDED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          keys.add(key);
        }
      }
    }

    const missingByLanguage: Record<string, string[]> = {};

    for (const language of ['zh-CN', 'en-US'] as const) {
      i18n.setLanguage(language);
      missingByLanguage[language] = [...keys].filter((key) => !i18n.hasTranslation(key)).sort();
    }

    expect(missingByLanguage).toEqual({
      'zh-CN': [],
      'en-US': [],
    });
  });

  it('keeps en-US translation values free of unintended Chinese text', () => {
    const cjkPattern = /[\u4E00-\u9FFF]/;
    const violations = flattenTranslationLeafKeys(translationCatalog['en-US'])
      .map((key) => {
        i18n.setLanguage('en-US');
        const value = i18n.t(key);
        if (!cjkPattern.test(value) || EN_US_ALLOWED_CJK_VALUES.has(value)) {
          return null;
        }
        return `${key} = ${value}`;
      })
      .filter((entry): entry is string => Boolean(entry))
      .sort();

    expect(violations).toEqual([]);
  });

  it('does not fall back from English to Chinese for missing keys', () => {
    i18n.setLanguage('en-US');
    expect(i18n.t('__missing.translation.key.for.test__')).toBe('__missing.translation.key.for.test__');
  });
});
