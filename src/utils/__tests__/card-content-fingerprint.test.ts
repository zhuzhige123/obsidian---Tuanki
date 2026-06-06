import { describe, expect, it } from "vitest";
import type { Card } from "../../data/types";
import { CardType } from "../../data/types";
import {
	buildBodyFingerprintIndex,
	getCardBodyFingerprint,
	getCardRetentionScore,
	mergeDuplicateCreateOntoExisting,
} from "../card-content-fingerprint";

function makeCard(overrides: Partial<Card> & { uuid: string; content: string }): Card {
	return {
		type: "basic",
		created: "2026-01-01T00:00:00.000Z",
		modified: "2026-01-01T00:00:00.000Z",
		...overrides,
	} as Card;
}

describe("card-content-fingerprint", () => {
	it("ignores YAML frontmatter when fingerprinting", () => {
		const a = getCardBodyFingerprint("---\nwe_decks:\n  - A\n---\n同一正文");
		const b = getCardBodyFingerprint("---\nwe_decks:\n  - B\n---\n同一正文");
		expect(a).toBe(b);
	});

	it("prefers cards with richer study history in the index", () => {
		const index = buildBodyFingerprintIndex([
			makeCard({
				uuid: "card-new",
				content: "---\n---\n重复正文",
			}),
			makeCard({
				uuid: "card-studied",
				content: "---\nwe_status: review\n---\n重复正文",
				stats: { totalReviews: 10, totalTime: 10, averageTime: 1 },
			}),
		]);

		const fingerprint = getCardBodyFingerprint("---\n---\n重复正文");
		expect(index.get(fingerprint)).toBe("card-studied");
		expect(getCardRetentionScore(makeCard({
			uuid: "card-studied",
			content: "---\nwe_status: review\n---\n重复正文",
			stats: { totalReviews: 10, totalTime: 10, averageTime: 1 },
		}))).toBeGreaterThan(
			getCardRetentionScore(makeCard({
				uuid: "card-new",
				content: "---\n---\n重复正文",
			}))
		);
	});

	it("keeps progressive cloze parent and child fingerprints distinct", () => {
		const sharedBody = "---\nwe_type: progressive-parent\n---\n{{c1::A}} {{c2::B}}";
		const parent = getCardBodyFingerprint(
			makeCard({
				uuid: "parent-1",
				type: CardType.ProgressiveParent,
				content: sharedBody,
			})
		);
		const childA = getCardBodyFingerprint(
			makeCard({
				uuid: "child-1",
				type: CardType.ProgressiveChild,
				parentCardId: "parent-1",
				clozeOrd: 0,
				content: sharedBody.replace("progressive-parent", "progressive-child"),
			} as Partial<Card> & { uuid: string; content: string })
		);
		const childB = getCardBodyFingerprint(
			makeCard({
				uuid: "child-2",
				type: CardType.ProgressiveChild,
				parentCardId: "parent-1",
				clozeOrd: 1,
				content: sharedBody.replace("progressive-parent", "progressive-child"),
			} as Partial<Card> & { uuid: string; content: string })
		);

		expect(parent).not.toBe(childA);
		expect(parent).not.toBe(childB);
		expect(childA).not.toBe(childB);
	});

	it("merges deck membership when coalescing duplicate creates", () => {
		const merged = mergeDuplicateCreateOntoExisting(
			makeCard({
				uuid: "card-keep",
				content: "---\nwe_decks:\n  - 牌组A\n---\n正文",
			}),
			makeCard({
				uuid: "card-dup",
				content: "---\nwe_decks:\n  - 牌组B\n---\n正文",
			})
		);

		expect(merged.uuid).toBe("card-keep");
		expect(merged.content).toContain("牌组A");
		expect(merged.content).toContain("牌组B");
	});
});
