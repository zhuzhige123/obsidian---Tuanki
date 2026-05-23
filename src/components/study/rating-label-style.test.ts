import {
	DEFAULT_RATING_LABEL_STYLE,
	getRatingLabelStyleLabel,
	getRatingLabelStyleOptions,
	getRatingLabels,
	isMoodGraphicStyle,
	normalizeRatingLabelStyle,
	resolveRatingLabelStyleFromPreferences,
	shouldShowRatingIntervalOnButtons,
} from "./rating-label-style";

const messages: Record<string, string> = {
	"studyInterface.ratingLabelStyle.options.classic": "经典",
	"studyInterface.ratingLabelStyle.options.classicTime": "经典+时间",
	"studyInterface.ratingLabelStyle.options.mood": "情绪图形",
	"studyInterface.ratingLabelStyle.options.moodTime": "情绪+时间",
	"studyInterface.ratingLabelStyle.options.spoken": "情绪图形",
	"studyInterface.ratings.again": "重来",
	"studyInterface.ratings.hard": "困难",
	"studyInterface.ratings.good": "良好",
	"studyInterface.ratings.easy": "简单",
	"studyInterface.ratingPresets.mood.again": "卡住了",
	"studyInterface.ratingPresets.mood.hard": "有点难",
	"studyInterface.ratingPresets.mood.good": "挺顺的",
	"studyInterface.ratingPresets.mood.easy": "很轻松",
	"studyInterface.ratingPresets.spoken.again": "不会",
	"studyInterface.ratingPresets.spoken.hard": "吃力",
	"studyInterface.ratingPresets.spoken.good": "还行",
	"studyInterface.ratingPresets.spoken.easy": "轻松",
};

function t(key: string): string {
	return messages[key] ?? key;
}

describe("rating-label-style", () => {
	it("falls back to the default style when the value is invalid", () => {
		expect(normalizeRatingLabelStyle("mood")).toBe("mood");
		expect(normalizeRatingLabelStyle("moodTime")).toBe("moodTime");
		expect(normalizeRatingLabelStyle("classicTime")).toBe("classicTime");
		expect(normalizeRatingLabelStyle("spoken")).toBe("mood");
		expect(normalizeRatingLabelStyle("invalid-style")).toBe(DEFAULT_RATING_LABEL_STYLE);
		expect(normalizeRatingLabelStyle(undefined)).toBe(DEFAULT_RATING_LABEL_STYLE);
	});

	it("returns translated option labels in a stable order", () => {
		expect(getRatingLabelStyleOptions(t)).toEqual([
			{ id: "classic", label: "经典" },
			{ id: "classicTime", label: "经典+时间" },
			{ id: "mood", label: "情绪图形" },
			{ id: "moodTime", label: "情绪+时间" },
		]);
	});

	it("migrates legacy interval toggle into paired style options", () => {
		expect(resolveRatingLabelStyleFromPreferences("classic", true)).toBe("classicTime");
		expect(resolveRatingLabelStyleFromPreferences("mood", true)).toBe("moodTime");
		expect(resolveRatingLabelStyleFromPreferences("classic", false)).toBe("classic");
		expect(shouldShowRatingIntervalOnButtons("classicTime")).toBe(true);
		expect(shouldShowRatingIntervalOnButtons("classic")).toBe(false);
		expect(shouldShowRatingIntervalOnButtons("moodTime")).toBe(false);
	});

	it("resolves mood and spoken rating labels from shared translation keys", () => {
		expect(getRatingLabels("mood", t)).toEqual({
			again: "卡住了",
			hard: "有点难",
			good: "挺顺的",
			easy: "很轻松",
		});
		expect(getRatingLabels("classicTime", t)).toEqual({
			again: "重来",
			hard: "困难",
			good: "良好",
			easy: "简单",
		});
		expect(getRatingLabelStyleLabel("classicTime", t)).toBe("经典+时间");
		expect(getRatingLabelStyleLabel("spoken", t)).toBe("情绪图形");
		expect(isMoodGraphicStyle("mood")).toBe(true);
		expect(isMoodGraphicStyle("moodTime")).toBe(true);
		expect(isMoodGraphicStyle("spoken")).toBe(true);
		expect(isMoodGraphicStyle("classic")).toBe(false);
		expect(isMoodGraphicStyle("classicTime")).toBe(false);
	});
});
