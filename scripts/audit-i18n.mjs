import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const translationKeyAliases = {
  'about.license.activation.activateLicense': 'about.license.activation.activate',
  'about.license.activation.codeLabel': 'about.license.activation.code',
  'ankiConnect.autoSync.enableLabel': 'ankiConnect.autoSync.enable',
  'ankiConnect.connection.connected': 'ankiConnect.connection.statusLabel.connected',
  'ankiConnect.connection.disconnected': 'ankiConnect.connection.statusLabel.disconnected',
  'ankiConnect.connection.endpointDesc': 'ankiConnect.connection.address.description',
  'ankiConnect.connection.endpointLabel': 'ankiConnect.connection.address.label',
  'ankiConnect.connection.testButton': 'ankiConnect.connection.test.button',
  'ankiConnect.connection.testing': 'ankiConnect.connection.statusLabel.testing',
  'ankiConnect.connection.testingButton': 'ankiConnect.connection.test.testing',
  'study.view.title': 'study.title',
  'toolbar.aiAssistant': 'navigation.aiAssistant'
};

const translationAliasSuffixes = [
  ['Label', 'label'],
  ['Desc', 'description'],
  ['Description', 'description'],
  ['Placeholder', 'placeholder'],
  ['Title', 'title'],
  ['Button', 'button'],
  ['Help', 'help'],
  ['Error', 'error'],
  ['Success', 'success'],
  ['Warning', 'warning'],
  ['Info', 'info']
];

const placeholderRegex = /\{(\w+)\}/g;
const literalUsageRegexes = [
  /\bt\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g,
  /\bi18n\.t\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g,
  /\$tr\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g,
  /\$trArray\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g,
  /\btrArray\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g,
  /\btArr\(\s*['"`]([a-z][\w-]*(?:\.[\w-]+)+)['"`]/g
];
const dynamicUsageRegexes = [
  /\bt\(\s*(?!['"`])/g,
  /\bi18n\.t\(\s*(?!['"`])/g,
  /\$tr\(\s*(?!['"`])/g,
  /\$trArray\(\s*(?!['"`])/g,
  /\btrArray\(\s*(?!['"`])/g,
  /\btArr\(\s*(?!['"`])/g
];
const intentionalRuntimeFallbackPrefixes = ['runtimeFallback.'];
const resourceModuleBoundaries = [
  { file: 'app-shell.ts', exportName: 'appShellTranslations', allowedKeys: ['common', 'navigation', 'celebration', 'rating', 'notifications', 'menus', 'ui', 'tables', 'toolbar', 'pluginSystem', 'virtualization', 'commands'] },
  { file: 'app-shell.ts', exportName: 'appShellTranslationOverrides', allowedKeys: ['common', 'commands', 'toolbar'] },
  { file: 'settings.ts', exportName: 'settingsTranslations', allowedKeys: ['settings'] },
  { file: 'settings.ts', exportName: 'settingsTranslationOverrides', allowedKeys: ['settings', 'settingsConstants', 'settingsUtils'] },
  { file: 'integrations.ts', exportName: 'integrationsTranslations', allowedKeys: ['aiConfig', 'ankiConnect', 'about', 'license'] },
  { file: 'integrations.ts', exportName: 'integrationsTranslationOverrides', allowedKeys: ['aiConfig', 'ankiConnect', 'about'] },
  { file: 'study.ts', exportName: 'studyTranslations', allowedKeys: ['study', 'studyInterface', 'studyInfo', 'fsrs', 'deckStudyPage', 'cards'] },
  { file: 'study.ts', exportName: 'studyTranslationOverrides', allowedKeys: ['study', 'studyInterface', 'deckStudyPage', 'cards', 'fsrs6Notices', 'noCardsModal'] },
  { file: 'management.ts', exportName: 'managementTranslations', allowedKeys: ['analytics', 'cardManagement', 'filters', 'parsing', 'modals', 'dataManagement', 'decks'] },
  { file: 'management.ts', exportName: 'managementTranslationOverrides', allowedKeys: ['modals', 'dataManagement', 'decks'] },
  { file: 'incremental-reading.ts', exportName: 'incrementalReadingTranslations', allowedKeys: [] },
  { file: 'incremental-reading.ts', exportName: 'incrementalReadingTranslationOverrides', allowedKeys: ['irTagGroup', 'irSettings', 'irSidebar', 'epub'] }
];

function isIntentionalRuntimeFallbackKey(key) {
  return intentionalRuntimeFallbackPrefixes.some(prefix => key.startsWith(prefix));
}

function isTranslationBranch(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTranslationTrees(base, override) {
  if (!override) {
    return { ...base };
  }

  const merged = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key];
    if (isTranslationBranch(baseValue) && isTranslationBranch(overrideValue)) {
      merged[key] = mergeTranslationTrees(baseValue, overrideValue);
    } else {
      merged[key] = overrideValue;
    }
  }

  return merged;
}

function getTranslationAliasCandidates(key) {
  const candidates = new Set();
  const directAlias = translationKeyAliases[key];

  if (directAlias) {
    candidates.add(directAlias);
  }

  const parts = key.split('.');
  const lastSegment = parts.at(-1) ?? '';

  for (const [suffix, targetSegment] of translationAliasSuffixes) {
    if (!lastSegment.endsWith(suffix) || lastSegment.length <= suffix.length) {
      continue;
    }

    const baseSegment = lastSegment.slice(0, -suffix.length);
    const normalizedBase = `${baseSegment.charAt(0).toLowerCase()}${baseSegment.slice(1)}`;
    candidates.add([...parts.slice(0, -1), normalizedBase, targetSegment].join('.'));
    candidates.add([...parts.slice(0, -1), normalizedBase].join('.'));

    if (targetSegment === 'description') {
      candidates.add([...parts.slice(0, -1), normalizedBase, 'desc'].join('.'));
    }
  }

  if (lastSegment === 'connected' || lastSegment === 'disconnected' || lastSegment === 'testing') {
    candidates.add([...parts.slice(0, -1), 'statusLabel', lastSegment].join('.'));
    candidates.add([...parts.slice(0, -1), 'status', lastSegment].join('.'));
  }

  if (key.includes('.endpoint')) {
    candidates.add(key.replace('.endpoint', '.address'));
  }

  return [...candidates];
}

function createSourceFile(filePath) {
  return ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getPropertyName(sourceFile, nameNode) {
  if (!nameNode) return null;
  if (
    ts.isIdentifier(nameNode) ||
    ts.isStringLiteral(nameNode) ||
    ts.isNumericLiteral(nameNode) ||
    ts.isNoSubstitutionTemplateLiteral(nameNode)
  ) {
    return nameNode.text;
  }
  return nameNode.getText(sourceFile).replace(/^['"]|['"]$/g, '');
}

function resolveImportFile(fromFilePath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFilePath), specifier);
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.js`, path.join(basePath, 'index.ts'), path.join(basePath, 'index.js')];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

const moduleCache = new Map();
const evaluationCache = new Map();

function loadModule(filePath) {
  const normalizedPath = path.resolve(filePath);
  if (moduleCache.has(normalizedPath)) {
    return moduleCache.get(normalizedPath);
  }

  const sourceFile = createSourceFile(normalizedPath);
  const imports = new Map();
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier.text;
      const resolvedFile = resolveImportFile(normalizedPath, specifier);
      if (!resolvedFile || !statement.importClause || statement.importClause.isTypeOnly) {
        continue;
      }

      const bindings = statement.importClause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) {
        continue;
      }

      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        const localName = element.name.text;
        const importedName = element.propertyName?.text ?? element.name.text;
        imports.set(localName, { filePath: resolvedFile, exportName: importedName });
      }
      continue;
    }

    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      declarations.set(declaration.name.text, declaration.initializer);
    }
  }

  const moduleInfo = { filePath: normalizedPath, sourceFile, imports, declarations };
  moduleCache.set(normalizedPath, moduleInfo);
  return moduleInfo;
}

function evaluateExpression(moduleInfo, expression, stack = []) {
  const cacheKey = `${moduleInfo.filePath}::${expression.pos}:${expression.end}`;
  if (evaluationCache.has(cacheKey)) {
    return evaluationCache.get(cacheKey);
  }

  const result = evaluateExpressionInternal(moduleInfo, expression, stack);
  evaluationCache.set(cacheKey, result);
  return result;
}

function evaluateExpressionInternal(moduleInfo, expression, stack) {
  if (ts.isObjectLiteralExpression(expression)) {
    const out = {};
    for (const prop of expression.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = getPropertyName(moduleInfo.sourceFile, prop.name);
        if (!key) continue;
        out[key] = evaluateExpression(moduleInfo, prop.initializer, stack);
        continue;
      }

      if (ts.isShorthandPropertyAssignment(prop)) {
        out[prop.name.text] = resolveIdentifier(moduleInfo, prop.name.text, stack);
        continue;
      }

      if (ts.isSpreadAssignment(prop)) {
        const spreadValue = evaluateExpression(moduleInfo, prop.expression, stack);
        if (!isTranslationBranch(spreadValue)) {
          throw new Error(`Spread value is not an object in ${moduleInfo.filePath}`);
        }
        Object.assign(out, spreadValue);
      }
    }
    return out;
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;

  if (ts.isIdentifier(expression)) {
    return resolveIdentifier(moduleInfo, expression.text, stack);
  }

  if (ts.isElementAccessExpression(expression)) {
    const target = evaluateExpression(moduleInfo, expression.expression, stack);
    const argument = expression.argumentExpression
      ? evaluateExpression(moduleInfo, expression.argumentExpression, stack)
      : undefined;
    return target?.[argument];
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const target = evaluateExpression(moduleInfo, expression.expression, stack);
    return target?.[expression.name.text];
  }

  if (ts.isParenthesizedExpression(expression)) {
    return evaluateExpression(moduleInfo, expression.expression, stack);
  }

  if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression?.(expression)) {
    return evaluateExpression(moduleInfo, expression.expression, stack);
  }

  if (ts.isCallExpression(expression)) {
    return evaluateCallExpression(moduleInfo, expression, stack);
  }

  throw new Error(`Unsupported expression kind ${ts.SyntaxKind[expression.kind]} in ${moduleInfo.filePath}`);
}

function mergeTranslationTreesForAudit(base, ...overrides) {
  if (!isTranslationBranch(base)) {
    throw new Error('mergeTranslationTrees base must be an object');
  }

  return overrides.reduce((merged, override) => {
    if (!override) {
      return merged;
    }
    if (!isTranslationBranch(override)) {
      throw new Error('mergeTranslationTrees override must be an object');
    }

    const next = { ...merged };
    for (const [key, overrideValue] of Object.entries(override)) {
      const baseValue = next[key];
      if (isTranslationBranch(baseValue) && isTranslationBranch(overrideValue)) {
        next[key] = mergeTranslationTreesForAudit(baseValue, overrideValue);
        continue;
      }
      next[key] = overrideValue;
    }
    return next;
  }, { ...base });
}

function evaluateCallExpression(moduleInfo, expression, stack) {
  const calleeName = ts.isIdentifier(expression.expression)
    ? expression.expression.text
    : null;

  if (calleeName === 'mergeTranslationTrees') {
    const args = expression.arguments.map((arg) => evaluateExpression(moduleInfo, arg, stack));
    const [base, ...overrides] = args;
    return mergeTranslationTreesForAudit(base ?? {}, ...overrides);
  }

  throw new Error(
    `Unsupported call expression ${calleeName ?? ts.SyntaxKind[expression.expression.kind]} in ${moduleInfo.filePath}`
  );
}

function resolveIdentifier(moduleInfo, name, stack = []) {
  const traceKey = `${moduleInfo.filePath}::${name}`;
  if (stack.includes(traceKey)) {
    throw new Error(`Circular reference detected while resolving ${traceKey}`);
  }

  if (moduleInfo.imports.has(name)) {
    const imported = moduleInfo.imports.get(name);
    const importedModule = loadModule(imported.filePath);
    return resolveIdentifier(importedModule, imported.exportName, [...stack, traceKey]);
  }

  if (!moduleInfo.declarations.has(name)) {
    throw new Error(`Unable to resolve identifier ${name} in ${moduleInfo.filePath}`);
  }

  return evaluateExpression(moduleInfo, moduleInfo.declarations.get(name), [...stack, traceKey]);
}

function flattenTranslations(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node ?? {})) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenTranslations(value, next, out);
    } else {
      out[next] = String(value);
    }
  }

  return out;
}

function collectPlaceholders(text) {
  return [...text.matchAll(placeholderRegex)].map(match => match[1]).sort();
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'backup-before-migration') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }

    if (/\.(ts|tsx|js|jsx|svelte)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }

  return out;
}

function collectStaticUsage(rootDir) {
  const usageFiles = walkFiles(path.join(rootDir, 'src'));
  const staticUsage = new Map();
  const dynamicUsageSites = [];

  for (const file of usageFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');

    for (const regex of literalUsageRegexes) {
      for (const match of content.matchAll(regex)) {
        const key = match[1];
        if (!staticUsage.has(key)) {
          staticUsage.set(key, []);
        }
        staticUsage.get(key).push(relativePath);
      }
    }

    for (const regex of dynamicUsageRegexes) {
      for (const match of content.matchAll(regex)) {
        const line = content.slice(0, match.index).split(/\r?\n/).length;
        dynamicUsageSites.push(`${relativePath}:${line}`);
      }
    }
  }

  return { staticUsage, dynamicUsageSites };
}

function summarizeByPrefix(keys, depth = 2, limit = 20) {
  const counts = new Map();

  for (const key of keys) {
    const prefix = key.split('.').slice(0, depth).join('.');
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([prefix, count]) => ({ prefix, count }));
}

function validateAggregateObject(moduleInfo, declarationName, expectedExportSuffix) {
  const violations = [];
  const declaration = moduleInfo.declarations.get(declarationName);
  const resourcesDir = path.resolve(path.dirname(moduleInfo.filePath), 'resources');

  if (!declaration || !ts.isObjectLiteralExpression(declaration)) {
    violations.push(`${declarationName} must be an object literal in ${moduleInfo.filePath}`);
    return violations;
  }

  for (const languageProperty of declaration.properties) {
    if (!ts.isPropertyAssignment(languageProperty)) {
      violations.push(`${declarationName} must only contain language property assignments`);
      continue;
    }

    const language = getPropertyName(moduleInfo.sourceFile, languageProperty.name);
    if (language !== 'zh-CN' && language !== 'en-US') {
      violations.push(`${declarationName} contains unexpected language branch: ${language}`);
      continue;
    }

    if (!ts.isObjectLiteralExpression(languageProperty.initializer)) {
      violations.push(`${declarationName}.${language} must be an object literal`);
      continue;
    }

    for (const child of languageProperty.initializer.properties) {
      if (
        !ts.isSpreadAssignment(child) &&
        !(
          ts.isPropertyAssignment(child) &&
          ts.isCallExpression(child.initializer) &&
          ts.isIdentifier(child.initializer.expression) &&
          child.initializer.expression.text === 'mergeTranslationTrees'
        )
      ) {
        violations.push(`${declarationName}.${language} must only contain spread assignments. Add new keys in src/utils/i18n/resources/* modules instead.`);
        continue;
      }

      if (!ts.isSpreadAssignment(child)) {
        continue;
      }

      if (!ts.isElementAccessExpression(child.expression) || !ts.isIdentifier(child.expression.expression)) {
        violations.push(`${declarationName}.${language} contains a non-module spread expression`);
        continue;
      }

      const importedBindingName = child.expression.expression.text;
      const argument = child.expression.argumentExpression;
      if (!argument || !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
        violations.push(`${declarationName}.${language} must index spreads with a literal language key`);
        continue;
      }

      if (argument.text !== language) {
        violations.push(`${declarationName}.${language} spreads must use the matching language key`);
      }

      const imported = moduleInfo.imports.get(importedBindingName);
      if (!imported) {
        violations.push(`${declarationName}.${language} spread ${importedBindingName} must come from an imported resource module`);
        continue;
      }

      const importedPath = path.resolve(imported.filePath);
      if (!(importedPath === resourcesDir || importedPath.startsWith(`${resourcesDir}${path.sep}`))) {
        violations.push(`${declarationName}.${language} spread ${importedBindingName} must come from src/utils/i18n/resources/*`);
      }

      if (!imported.exportName.endsWith(expectedExportSuffix)) {
        violations.push(`${declarationName}.${language} spread ${importedBindingName} must import a *${expectedExportSuffix} export`);
      }
    }
  }

  return violations;
}

function validateAggregateModule(moduleInfo) {
  return [
    ...validateAggregateObject(moduleInfo, 'translations', 'Translations'),
    ...validateAggregateObject(moduleInfo, 'translationOverrides', 'TranslationOverrides')
  ];
}

function findSuggestedBoundary(exportName, topLevelKey) {
  const expectedSuffix = exportName.endsWith('TranslationOverrides') ? 'TranslationOverrides' : 'Translations';
  return resourceModuleBoundaries.find(boundary =>
    boundary.exportName.endsWith(expectedSuffix) && boundary.allowedKeys.includes(topLevelKey)
  ) ?? null;
}

function validateResourceModuleBoundaries(rootDir) {
  const violations = [];
  const suggestedMoves = [];
  const resourcesDir = path.join(rootDir, 'src', 'utils', 'i18n', 'resources');

  for (const boundary of resourceModuleBoundaries) {
    const filePath = path.join(resourcesDir, boundary.file);
    const moduleInfo = loadModule(filePath);
    const resolved = resolveIdentifier(moduleInfo, boundary.exportName);
    const allowedKeys = new Set(boundary.allowedKeys);

    for (const language of ['zh-CN', 'en-US']) {
      const branch = resolved?.[language];
      if (!isTranslationBranch(branch)) {
        violations.push(`${boundary.exportName}.${language} must resolve to an object branch`);
        continue;
      }

      const actualKeys = Object.keys(branch).sort();
      const unexpectedKeys = actualKeys.filter(key => !allowedKeys.has(key));
      const missingKeys = boundary.allowedKeys.filter(key => !actualKeys.includes(key));

      for (const key of unexpectedKeys) {
        const suggestedBoundary = findSuggestedBoundary(boundary.exportName, key);
        if (suggestedBoundary) {
          violations.push(boundary.exportName + '.' + language + " contains unexpected top-level key " + key + ". Suggested target: " + suggestedBoundary.exportName + " (src/utils/i18n/resources/" + suggestedBoundary.file + ")");
          suggestedMoves.push({
            key,
            fromExport: boundary.exportName,
            fromFile: boundary.file,
            toExport: suggestedBoundary.exportName,
            toFile: suggestedBoundary.file
          });
        } else {
          violations.push(boundary.exportName + '.' + language + " contains unexpected top-level key " + key + ". Move it to the correct resource module.");
        }
      }

      for (const key of missingKeys) {
        violations.push(`${boundary.exportName}.${language} is missing expected top-level key ${key}.`);
      }
    }
  }

  return { violations, suggestedMoves };
}

function buildReport(rootDir) {
  const i18nFile = path.join(rootDir, 'src', 'utils', 'i18n', 'resources.ts');
  const moduleInfo = loadModule(i18nFile);
  const aggregateStructureViolations = validateAggregateModule(moduleInfo);
  const resourceModuleBoundaryCheck = validateResourceModuleBoundaries(rootDir);
  const resourceModuleBoundaryViolations = resourceModuleBoundaryCheck.violations;
  const suggestedResourceModuleMoves = resourceModuleBoundaryCheck.suggestedMoves;
  const extracted = resolveIdentifier(moduleInfo, 'translations');
  const overrides = resolveIdentifier(moduleInfo, 'translationOverrides');
  const translations = {};

  for (const language of Object.keys(extracted)) {
    translations[language] = mergeTranslationTrees(extracted[language], overrides[language]);
  }

  const languages = Object.keys(translations);
  const flatByLanguage = Object.fromEntries(
    languages.map(language => [language, flattenTranslations(translations[language])])
  );

  const allKeys = new Set(languages.flatMap(language => Object.keys(flatByLanguage[language])));
  const missingByLang = {};

  for (const language of languages) {
    const languageKeys = new Set(Object.keys(flatByLanguage[language]));
    missingByLang[language] = [...allKeys].filter(key => !languageKeys.has(key)).sort();
  }

  const placeholderMismatches = [];
  for (const key of [...allKeys].sort()) {
    const perLanguage = {};
    let baseline = null;
    let mismatch = false;

    for (const language of languages) {
      const value = flatByLanguage[language][key];
      if (typeof value !== 'string') continue;

      const placeholders = collectPlaceholders(value);
      perLanguage[language] = placeholders;
      const packed = JSON.stringify(placeholders);
      if (baseline === null) {
        baseline = packed;
      } else if (packed !== baseline) {
        mismatch = true;
      }
    }

    if (mismatch) {
      placeholderMismatches.push({ key, perLanguage });
    }
  }

  const { staticUsage, dynamicUsageSites } = collectStaticUsage(rootDir);
  const usedKeys = [...staticUsage.keys()].sort();
  const directMissingKeys = usedKeys.filter(
    key => !allKeys.has(key) && !isIntentionalRuntimeFallbackKey(key)
  );
  const aliasCoveredKeys = [];
  const unresolvedMissingKeys = [];

  for (const key of directMissingKeys) {
    const aliasMatch = getTranslationAliasCandidates(key).find(candidate => allKeys.has(candidate));
    if (aliasMatch) {
      aliasCoveredKeys.push({ key, alias: aliasMatch });
    } else {
      unresolvedMissingKeys.push(key);
    }
  }

  const deprecatedKeyUsages = usedKeys
    .filter(key => Object.prototype.hasOwnProperty.call(translationKeyAliases, key))
    .map(key => ({
      key,
      canonical: translationKeyAliases[key],
      files: staticUsage.get(key) ?? []
    }));

  const unusedKeys = [...allKeys].filter(key => !staticUsage.has(key)).sort();

  return {
    i18nFile: path.relative(rootDir, i18nFile).replace(/\\/g, '/'),
    languages,
    aggregateStructureViolations,
    resourceModuleBoundaryViolations,
    suggestedResourceModuleMoves,
    duplicateKeys: [],
    nonStringValues: [],
    keyCounts: Object.fromEntries(languages.map(language => [language, Object.keys(flatByLanguage[language]).length])),
    missingByLang,
    placeholderMismatches,
    codeUsage: {
      staticUsageKeyCount: usedKeys.length,
      directMissingKeys,
      aliasCoveredKeys,
      unresolvedMissingKeys,
      deprecatedKeyUsages,
      directMissingByPrefix: summarizeByPrefix(directMissingKeys),
      unresolvedMissingByPrefix: summarizeByPrefix(unresolvedMissingKeys),
      dynamicUsageSites
    },
    unusedKeys
  };
}

function printSummary(report) {
  const structuralIssueCount =
    report.aggregateStructureViolations.length +
    report.resourceModuleBoundaryViolations.length +
    report.duplicateKeys.length +
    report.nonStringValues.length +
    Object.values(report.missingByLang).reduce((sum, keys) => sum + keys.length, 0) +
    report.placeholderMismatches.length;

  console.log('I18n audit summary');
  console.log(`- File: ${report.i18nFile}`);
  console.log(`- Languages: ${report.languages.join(', ')}`);
  console.log(`- Keys: ${JSON.stringify(report.keyCounts)}`);
  console.log(`- Structural issues: ${structuralIssueCount}`);
  console.log(
    `- Static usage keys: ${report.codeUsage.staticUsageKeyCount}, direct missing: ${report.codeUsage.directMissingKeys.length}, alias-covered: ${report.codeUsage.aliasCoveredKeys.length}, unresolved: ${report.codeUsage.unresolvedMissingKeys.length}, deprecated: ${report.codeUsage.deprecatedKeyUsages.length}`
  );
  console.log(`- Unused translation keys: ${report.unusedKeys.length}`);
  console.log(`- Dynamic usage sites: ${report.codeUsage.dynamicUsageSites.length}`);

  if (report.aggregateStructureViolations.length > 0) {
    console.log('');
    console.log('Aggregate structure violations');
    for (const violation of report.aggregateStructureViolations.slice(0, 20)) {
      console.log(`- ${violation}`);
    }
  }

  if (report.resourceModuleBoundaryViolations.length > 0) {
    console.log('');
    console.log('Resource module boundary violations');
    for (const violation of report.resourceModuleBoundaryViolations.slice(0, 20)) {
      console.log(`- ${violation}`);
    }
  }

  if (report.suggestedResourceModuleMoves.length > 0) {
    console.log('');
    console.log('Suggested resource module moves');
    for (const suggestion of report.suggestedResourceModuleMoves.slice(0, 20)) {
      console.log('- ' + suggestion.key + ' :: ' + suggestion.fromExport + ' -> ' + suggestion.toExport + ' (src/utils/i18n/resources/' + suggestion.toFile + ')');
    }
  }

  if (report.codeUsage.deprecatedKeyUsages.length > 0) {
    console.log('');
    console.log('Deprecated key usage');
    for (const item of report.codeUsage.deprecatedKeyUsages.slice(0, 20)) {
      console.log(`- ${item.key} -> ${item.canonical}`);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const report = buildReport(rootDir);
const hasStructuralIssues =
  report.aggregateStructureViolations.length > 0 ||
  report.resourceModuleBoundaryViolations.length > 0 ||
  report.duplicateKeys.length > 0 ||
  report.nonStringValues.length > 0 ||
  Object.values(report.missingByLang).some(keys => keys.length > 0) ||
  report.placeholderMismatches.length > 0;
const hasStrictUsageIssues = args.has('--strict-usage') && report.codeUsage.unresolvedMissingKeys.length > 0;

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printSummary(report);
}

if (hasStructuralIssues || hasStrictUsageIssues) {
  process.exit(1);
}
