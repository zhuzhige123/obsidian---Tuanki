import { beforeEach, describe, expect, it } from "vitest";
import {
	DECK_STUDY_PAGE_CONTEXT,
	isLimitedTimeOpenFeature,
	PREMIUM_FEATURES,
	PremiumFeatureGuard,
} from "./PremiumFeatureGuard";

describe("PremiumFeatureGuard limited-time open", () => {
	beforeEach(async () => {
		const guard = PremiumFeatureGuard.getInstance();
		await guard.updateLicenseState({
			product: "weave",
			localLicenses: [],
			inheritedLicenses: [],
		});
	});

	it("allows deck-study kanban without premium", () => {
		const guard = PremiumFeatureGuard.getInstance();
		const context = { page: DECK_STUDY_PAGE_CONTEXT };

		expect(isLimitedTimeOpenFeature(PREMIUM_FEATURES.KANBAN_VIEW, context)).toBe(true);
		expect(guard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW, context)).toBe(true);
		expect(guard.isFeatureRestricted(PREMIUM_FEATURES.KANBAN_VIEW, context)).toBe(false);
	});

	it("keeps kanban premium outside deck-study", () => {
		const guard = PremiumFeatureGuard.getInstance();

		expect(guard.canUseFeature(PREMIUM_FEATURES.KANBAN_VIEW)).toBe(false);
		expect(guard.isFeatureRestricted(PREMIUM_FEATURES.KANBAN_VIEW)).toBe(true);
	});

	it("labels deck-study kanban as limited-time open when not premium", () => {
		const guard = PremiumFeatureGuard.getInstance();
		const title = guard.getFeatureEntryTitle("看板", PREMIUM_FEATURES.KANBAN_VIEW, {
			page: DECK_STUDY_PAGE_CONTEXT,
		});

		expect(title).toContain("限时开放");
	});
});
