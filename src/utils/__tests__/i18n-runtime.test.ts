import { get } from 'svelte/store';

import { i18n, trArray } from '../i18n';

describe('i18n runtime fallbacks', () => {
  beforeEach(() => {
    i18n.setLanguage('en-US');
  });

  it('prefers concrete translations for high-value keys', () => {
    expect(i18n.t('about.license.activation.activate')).toBe('Activate');
    expect(i18n.t('navigation.aiAssistant')).toBe('AI Assistant');
    expect(i18n.t('study.title')).toBe('Study');
    expect(i18n.t('ankiConnect.connection.test.testing')).toBe('Testing...');
  });

  it('returns unresolved keys verbatim instead of pseudo-localized English text', () => {
    expect(i18n.t('runtimeFallback.avgTime')).toBe('runtimeFallback.avgTime');
    expect(i18n.t('runtimeFallback.openMenu')).toBe('runtimeFallback.openMenu');
  });

  it('keeps list translations empty when no real translation exists', () => {
    const toArray = get(trArray);
    expect(toArray('runtimeFallback.avgTime')).toEqual([]);
  });
});
