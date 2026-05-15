import type { SupportedLanguage, TranslationKey } from './types';
import { appShellTranslations, appShellTranslationOverrides } from './resources/app-shell-clean';
import { settingsTranslations, settingsTranslationOverrides } from './resources/settings';
import { integrationsTranslations, integrationsTranslationOverrides } from './resources/integrations';
import { studyTranslations, studyTranslationOverrides } from './resources/study';
import { managementTranslations, managementTranslationOverrides } from './resources/management';
import { incrementalReadingTranslations, incrementalReadingTranslationOverrides } from './resources/incremental-reading';

export const translations: Record<SupportedLanguage, TranslationKey> = {
	'zh-CN': {
		...appShellTranslations['zh-CN'],
		...settingsTranslations['zh-CN'],
		...integrationsTranslations['zh-CN'],
		...studyTranslations['zh-CN'],
		...managementTranslations['zh-CN'],
		...incrementalReadingTranslations['zh-CN'],
	},
	'en-US': {
		...appShellTranslations['en-US'],
		...settingsTranslations['en-US'],
		...integrationsTranslations['en-US'],
		...studyTranslations['en-US'],
		...managementTranslations['en-US'],
		...incrementalReadingTranslations['en-US'],
	},
};

export const translationOverrides: Partial<Record<SupportedLanguage, TranslationKey>> = {
	'zh-CN': {
		...appShellTranslationOverrides['zh-CN'],
		...settingsTranslationOverrides['zh-CN'],
		...integrationsTranslationOverrides['zh-CN'],
		...studyTranslationOverrides['zh-CN'],
		...managementTranslationOverrides['zh-CN'],
		...incrementalReadingTranslationOverrides['zh-CN'],
	},
	'en-US': {
		...appShellTranslationOverrides['en-US'],
		...settingsTranslationOverrides['en-US'],
		...integrationsTranslationOverrides['en-US'],
		...studyTranslationOverrides['en-US'],
		...managementTranslationOverrides['en-US'],
		...incrementalReadingTranslationOverrides['en-US'],
	},
};
