import type { TranslationKey } from "./types";

function isTranslationBranch(value: string | TranslationKey | undefined): value is TranslationKey {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeTranslationTrees(
	base: TranslationKey,
	...overrides: Array<TranslationKey | undefined>
): TranslationKey {
	return overrides.reduce<TranslationKey>((merged, override) => {
		if (!override) {
			return merged;
		}

		const next: TranslationKey = { ...merged };

		for (const [key, overrideValue] of Object.entries(override)) {
			const baseValue = next[key];

			if (isTranslationBranch(baseValue) && isTranslationBranch(overrideValue)) {
				next[key] = mergeTranslationTrees(baseValue, overrideValue);
				continue;
			}

			next[key] = overrideValue;
		}

		return next;
	}, { ...base });
}
