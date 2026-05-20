import { get } from 'svelte/store';

import { i18n, initI18n, syncI18nWithObsidianLanguage, trArray } from '../i18n';

describe('i18n runtime fallbacks', () => {
  beforeEach(() => {
    window.localStorage.removeItem('language');
    i18n.setLanguage('en-US');
  });

  it('prefers concrete translations for high-value keys', () => {
    expect(i18n.t('about.license.activation.activate')).toBe('Activate');
    expect(i18n.t('navigation.aiAssistant')).toBe('AI Assistant');
    expect(i18n.t('study.title')).toBe('Study');
    expect(i18n.t('ankiConnect.connection.test.testing')).toBe('Testing...');
  });

  it('resolves deck study page loading text in Chinese', () => {
    i18n.setLanguage('zh-CN');
    expect(i18n.t('deckStudyPage.studyActions.loading')).toBe('加载中...');
  });

  it('keeps license activation overrides merged with the full activation catalog', () => {
    i18n.setLanguage('zh-CN');
    expect(i18n.t('about.license.activation.formTitle')).toBe('许可证激活');
    expect(i18n.t('about.license.activation.licensed')).toBe('当前设备已激活');
    expect(i18n.t('about.license.activation.deactivate')).toBe('移除激活码');
    expect(i18n.t('about.license.activation.codePlaceholder')).toBe(
      '请粘贴完整的激活码（通常约 500-800 字符）'
    );

    i18n.setLanguage('en-US');
    expect(i18n.t('about.license.activation.formTitle')).toBe('License activation');
    expect(i18n.t('about.license.activation.licensed')).toBe('This device is activated');
    expect(i18n.t('about.license.activation.deactivate')).toBe('Remove activation code');
    expect(i18n.t('about.license.activation.codePlaceholder')).toBe(
      'Paste the full activation code (usually around 500-800 characters)'
    );
  });

  it('returns unresolved keys verbatim instead of pseudo-localized English text', () => {
    expect(i18n.t('runtimeFallback.avgTime')).toBe('runtimeFallback.avgTime');
    expect(i18n.t('runtimeFallback.openMenu')).toBe('runtimeFallback.openMenu');
  });

  it('keeps list translations empty when no real translation exists', () => {
    const toArray = get(trArray);
    expect(toArray('runtimeFallback.avgTime')).toEqual([]);
  });

  it('applies detected Obsidian language only after stable consecutive detections', () => {
    window.localStorage.setItem('language', 'zh');

    syncI18nWithObsidianLanguage();
    expect(i18n.getCurrentLanguage()).toBe('en-US');

    syncI18nWithObsidianLanguage();
    expect(i18n.getCurrentLanguage()).toBe('zh-CN');
  });

  it('initializes to the detected Obsidian language immediately', () => {
    window.localStorage.setItem('language', 'en');
    i18n.setLanguage('zh-CN');

    initI18n();

    expect(i18n.getCurrentLanguage()).toBe('en-US');
  });
});
