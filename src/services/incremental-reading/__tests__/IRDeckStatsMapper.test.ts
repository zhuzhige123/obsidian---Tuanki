
import { toDeckStats } from "../IRDeckStatsMapper";

describe("toDeckStats", () => {
	it("maps IR deck stats to the shared deck card stats shape", () => {
		expect(
			toDeckStats({
				totalCount: 12,
				dueToday: 3,
				dueWithinDays: 8,
				questionCount: 5,
			})
		).toMatchObject({
			totalCards: 12,
			newCards: 3,
			learningCards: 5,
			reviewCards: 5,
		});
	});

	it("falls back safely when projected fields are missing", () => {
		expect(toDeckStats()).toMatchObject({
			totalCards: 0,
			newCards: 0,
			learningCards: 0,
			reviewCards: 0,
		});

		expect(
			toDeckStats({
				dueToday: 4,
			})
		).toMatchObject({
			newCards: 4,
			learningCards: 0,
		});
	});
});
