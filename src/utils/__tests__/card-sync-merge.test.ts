import { describe, expect, it } from "vitest";
import type { Card } from "../../data/types";
import {
	compareCardsForSyncWinner,
	computeCardSyncPayloadHash,
	pickNewerCard,
	stampCardSyncMetadata,
} from "../card-sync-merge";

function createCard(partial: Partial<Card> & Pick<Card, "uuid">): Card {
	return {
		content: partial.content ?? "content",
		created: partial.created ?? "2026-01-01T00:00:00.000Z",
		modified: partial.modified ?? "2026-01-01T00:00:00.000Z",
		stats: partial.stats ?? {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
		},
		...partial,
		uuid: partial.uuid,
	};
}

describe("card-sync-merge", () => {
	it("prefers newer modified timestamp", () => {
		const older = createCard({
			uuid: "a",
			modified: "2026-01-01T00:00:00.000Z",
		});
		const newer = createCard({
			uuid: "a",
			modified: "2026-06-15T12:00:00.000Z",
			stats: { totalReviews: 1, totalTime: 0, averageTime: 0 },
		});

		expect(compareCardsForSyncWinner(newer, older)).toBeGreaterThan(0);
		expect(pickNewerCard([older, newer])?.modified).toBe(newer.modified);
	});

	it("uses review count as secondary tie-breaker", () => {
		const left = createCard({
			uuid: "a",
			modified: "2026-06-15T12:00:00.000Z",
			stats: { totalReviews: 3, totalTime: 0, averageTime: 0 },
		});
		const right = createCard({
			uuid: "a",
			modified: "2026-06-15T12:00:00.000Z",
			stats: { totalReviews: 7, totalTime: 0, averageTime: 0 },
		});

		expect(pickNewerCard([left, right])?.stats.totalReviews).toBe(7);
	});

	it("stamps modified and contentHash together", () => {
		const card = createCard({ uuid: "a", content: "hello" });
		const stamped = stampCardSyncMetadata(card, new Date("2026-06-16T08:00:00.000Z"));

		expect(stamped.modified).toBe("2026-06-16T08:00:00.000Z");
		expect(stamped.contentHash).toBe(computeCardSyncPayloadHash(card));
		expect(stamped.lastSyncTime).toBe(new Date("2026-06-16T08:00:00.000Z").getTime());
	});
});
