import { getInspirationModalLocaleContent } from '../i18n/resources/inspiration-modal';
import { localizeDeckGroupConfig } from '../deck-kanban-labels';
import { i18n } from '../i18n';

describe('i18n locale bridges', () => {
	beforeEach(() => {
		i18n.setLanguage('en-US');
	});

	it('localizes deck kanban group config without Chinese leakage in English', () => {
		const t = (key: string) => i18n.t(key);
		const config = localizeDeckGroupConfig('completion', t);

		expect(config.title).toBe('Completion status');
		expect(config.groups.map((group) => group.label)).toEqual([
			'New cards',
			'Learning',
			'Due for review',
			'Completed',
		]);
		expect(JSON.stringify(config)).not.toMatch(/[\u4e00-\u9fff]/);
	});

	it('switches inspiration modal content with the active language', () => {
		i18n.setLanguage('zh-CN');
		const zhContent = getInspirationModalLocaleContent('zh-CN');
		expect(zhContent.tabs[0]?.label).toMatch(/[\u4e00-\u9fff]/);

		i18n.setLanguage('en-US');
		const enContent = getInspirationModalLocaleContent('en-US');
		expect(enContent.tabs[0]?.label).not.toMatch(/[\u4e00-\u9fff]/);
		expect(enContent.tabs[0]?.label.length).toBeGreaterThan(0);
	});

	it('resolves storage.firstDeck strings in both languages from management translations', () => {
		i18n.setLanguage('zh-CN');
		expect(i18n.t('storage.firstDeck.title')).toBe('创建第一个记忆牌组');

		i18n.setLanguage('en-US');
		expect(i18n.t('storage.firstDeck.title')).toBe('Create your first memory deck');
		expect(i18n.t('storage.firstDeck.title')).not.toMatch(/[\u4e00-\u9fff]/);
	});
});
