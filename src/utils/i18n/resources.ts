import type { SupportedLanguage, TranslationKey } from './types';
import { mergeTranslationTrees } from './merge-translation-trees';
import { appShellTranslations, appShellTranslationOverrides } from './resources/app-shell-clean';
import { settingsTranslations, settingsTranslationOverrides } from './resources/settings';
import { integrationsTranslations, integrationsTranslationOverrides } from './resources/integrations';
import { licenseUiTranslationOverrides } from './resources/license-ui';
import { uiHotspotTranslationOverrides } from './resources/ui-hotspots';
import { aiUiTranslationOverrides } from './resources/ai-ui';
import { managementUiTranslationOverrides } from './resources/management-ui';
import { studyTranslations } from './resources/study';
import { managementTranslations, managementTranslationOverrides } from './resources/management';
import { incrementalReadingTranslationOverrides } from './resources/incremental-reading';

export const translations: Record<SupportedLanguage, TranslationKey> = {
	'zh-CN': {
		...appShellTranslations['zh-CN'],
		...settingsTranslations['zh-CN'],
		...integrationsTranslations['zh-CN'],
		...studyTranslations['zh-CN'],
		...managementTranslations['zh-CN'],
	},
	'en-US': {
		...appShellTranslations['en-US'],
		...settingsTranslations['en-US'],
		...integrationsTranslations['en-US'],
		...studyTranslations['en-US'],
		...managementTranslations['en-US'],
	},
};

export const translationOverrides: Partial<Record<SupportedLanguage, TranslationKey>> = {
	'zh-CN': {
		...appShellTranslationOverrides['zh-CN'],
		...settingsTranslationOverrides['zh-CN'],
		...integrationsTranslationOverrides['zh-CN'],
		...uiHotspotTranslationOverrides['zh-CN'],
		...aiUiTranslationOverrides['zh-CN'],
		...managementUiTranslationOverrides['zh-CN'],
		...managementTranslationOverrides['zh-CN'],
		...incrementalReadingTranslationOverrides['zh-CN'],
		about: mergeTranslationTrees(
			{},
			integrationsTranslationOverrides['zh-CN'].about as TranslationKey,
			licenseUiTranslationOverrides['zh-CN'].about as TranslationKey
		),
		modals: mergeTranslationTrees(
			{},
			managementTranslationOverrides['zh-CN'].modals as TranslationKey,
			managementUiTranslationOverrides['zh-CN'].modals as TranslationKey
		),
		study: mergeTranslationTrees(
			{},
			managementUiTranslationOverrides['zh-CN'].study as TranslationKey
		),
		toolbar: mergeTranslationTrees(
			{},
			appShellTranslationOverrides['zh-CN'].toolbar as TranslationKey,
			uiHotspotTranslationOverrides['zh-CN'].toolbar as TranslationKey
		),
	},
	'en-US': {
		...appShellTranslationOverrides['en-US'],
		...settingsTranslationOverrides['en-US'],
		...integrationsTranslationOverrides['en-US'],
		...uiHotspotTranslationOverrides['en-US'],
		...aiUiTranslationOverrides['en-US'],
		...managementUiTranslationOverrides['en-US'],
		...managementTranslationOverrides['en-US'],
		...incrementalReadingTranslationOverrides['en-US'],
		about: mergeTranslationTrees(
			{},
			integrationsTranslationOverrides['en-US'].about as TranslationKey,
			licenseUiTranslationOverrides['en-US'].about as TranslationKey
		),
		modals: mergeTranslationTrees(
			{},
			managementTranslationOverrides['en-US'].modals as TranslationKey,
			managementUiTranslationOverrides['en-US'].modals as TranslationKey
		),
		study: mergeTranslationTrees(
			{},
			managementUiTranslationOverrides['en-US'].study as TranslationKey
		),
		toolbar: mergeTranslationTrees(
			{},
			appShellTranslationOverrides['en-US'].toolbar as TranslationKey,
			uiHotspotTranslationOverrides['en-US'].toolbar as TranslationKey
		),
	},
};
