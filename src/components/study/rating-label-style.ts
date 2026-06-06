/** 新用户默认：难度文案 + 下次复习间隔（设置项「经典 + 时间」） */
export const DEFAULT_RATING_LABEL_STYLE = "classicTime" as const;

export type RatingLabelStyle = "classic" | "classicTime" | "mood" | "moodTime" | "spoken";

const VISIBLE_RATING_LABEL_STYLES = ["classic", "classicTime", "mood", "moodTime"] as const;

export interface RatingStyleOption {
	id: RatingLabelStyle;
	label: string;
}

export interface RatingLabels {
	again: string;
	hard: string;
	good: string;
	easy: string;
}

const RATING_LABEL_STYLE_TRANSLATION_KEYS: Record<
	RatingLabelStyle,
	{
		styleLabel: string;
		again: string;
		hard: string;
		good: string;
		easy: string;
	}
> = {
	classic: {
		styleLabel: "studyInterface.ratingLabelStyle.options.classic",
		again: "studyInterface.ratings.again",
		hard: "studyInterface.ratings.hard",
		good: "studyInterface.ratings.good",
		easy: "studyInterface.ratings.easy",
	},
	classicTime: {
		styleLabel: "studyInterface.ratingLabelStyle.options.classicTime",
		again: "studyInterface.ratings.again",
		hard: "studyInterface.ratings.hard",
		good: "studyInterface.ratings.good",
		easy: "studyInterface.ratings.easy",
	},
	mood: {
		styleLabel: "studyInterface.ratingLabelStyle.options.mood",
		again: "studyInterface.ratingPresets.mood.again",
		hard: "studyInterface.ratingPresets.mood.hard",
		good: "studyInterface.ratingPresets.mood.good",
		easy: "studyInterface.ratingPresets.mood.easy",
	},
	moodTime: {
		styleLabel: "studyInterface.ratingLabelStyle.options.moodTime",
		again: "studyInterface.ratingPresets.mood.again",
		hard: "studyInterface.ratingPresets.mood.hard",
		good: "studyInterface.ratingPresets.mood.good",
		easy: "studyInterface.ratingPresets.mood.easy",
	},
	spoken: {
		styleLabel: "studyInterface.ratingLabelStyle.options.spoken",
		again: "studyInterface.ratingPresets.spoken.again",
		hard: "studyInterface.ratingPresets.spoken.hard",
		good: "studyInterface.ratingPresets.spoken.good",
		easy: "studyInterface.ratingPresets.spoken.easy",
	},
};

export function normalizeRatingLabelStyle(value: unknown): RatingLabelStyle {
	if (value === "spoken") {
		return "mood";
	}
	return value === "classic" ||
		value === "classicTime" ||
		value === "mood" ||
		value === "moodTime"
		? value
		: DEFAULT_RATING_LABEL_STYLE;
}

/** 将旧版「文案 + 单独开关」合并为统一的风格选项。 */
export function resolveRatingLabelStyleFromPreferences(
	style: unknown,
	showRatingIntervalOnButtons?: boolean,
): RatingLabelStyle {
	const normalized = normalizeRatingLabelStyle(style);
	if (!showRatingIntervalOnButtons) {
		return normalized;
	}
	if (normalized === "classic") {
		return "classicTime";
	}
	if (normalized === "mood") {
		return "moodTime";
	}
	return normalized;
}

export function shouldShowRatingIntervalOnButtons(style: RatingLabelStyle): boolean {
	return normalizeRatingLabelStyle(style) === "classicTime";
}

export function getRatingLabelStyleOptions(t: (key: string, params?: Record<string, string | number>) => string): RatingStyleOption[] {
	return VISIBLE_RATING_LABEL_STYLES.map((id) => ({
		id,
		label: t(RATING_LABEL_STYLE_TRANSLATION_KEYS[id].styleLabel),
	}));
}

export function getRatingLabelStyleLabel(
	style: RatingLabelStyle,
	t: (key: string, params?: Record<string, string | number>) => string,
): string {
	const resolvedStyle = normalizeRatingLabelStyle(style);
	return t(RATING_LABEL_STYLE_TRANSLATION_KEYS[resolvedStyle].styleLabel);
}

export function isMoodGraphicStyle(style: RatingLabelStyle): boolean {
	const normalized = normalizeRatingLabelStyle(style);
	return normalized === "mood" || normalized === "moodTime";
}

export function isMoodTimeStyle(style: RatingLabelStyle): boolean {
	return normalizeRatingLabelStyle(style) === "moodTime";
}

export function getRatingLabels(
	style: RatingLabelStyle,
	t: (key: string, params?: Record<string, string | number>) => string,
): RatingLabels {
	const resolvedStyle = normalizeRatingLabelStyle(style);
	const translationKeys = RATING_LABEL_STYLE_TRANSLATION_KEYS[resolvedStyle];
	return {
		again: t(translationKeys.again),
		hard: t(translationKeys.hard),
		good: t(translationKeys.good),
		easy: t(translationKeys.easy),
	};
}
