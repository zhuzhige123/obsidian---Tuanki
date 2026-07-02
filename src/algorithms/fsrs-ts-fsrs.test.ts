/**
 * Golden tests: plugin FSRS wrapper must match official ts-fsrs scheduling.
 */
import { Rating as TsRating, createEmptyCard, fsrs as createTsFsrs } from "ts-fsrs";
import { CardState, Rating } from "../data/types";
import { FSRS6_DEFAULTS } from "../types/fsrs6-types";
import {
	PLUGIN_OWNED_SCHEDULING,
	reviewWithTsFsrs,
	sanitizeFsrsCardForScheduling,
	toTsFsrsParams,
	createTsFsrsScheduler,
} from "./fsrs-adapter";
import { FSRS } from "./fsrs";

const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

function tsParams() {
	return toTsFsrsParams({
		w: [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS],
		requestRetention: FSRS6_DEFAULTS.REQUEST_RETENTION,
		maximumInterval: FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
		enableFuzz: false,
	});
}

describe("FSRS (ts-fsrs wrapper)", () => {
	let pluginFsrs: FSRS;
	let tsFsrs: ReturnType<typeof createTsFsrs>;

	beforeEach(() => {
		pluginFsrs = new FSRS({
			w: [...FSRS6_DEFAULTS.DEFAULT_WEIGHTS],
			requestRetention: FSRS6_DEFAULTS.REQUEST_RETENTION,
			maximumInterval: FSRS6_DEFAULTS.MAXIMUM_INTERVAL,
			enableFuzz: false,
		});
		tsFsrs = createTsFsrs(tsParams());
	});

	test("createCard matches createEmptyCard baseline", () => {
		const pluginCard = pluginFsrs.createCard();
		const tsCard = createEmptyCard(FIXED_NOW);

		expect(pluginCard.state).toBe(CardState.New);
		expect(pluginCard.reps).toBe(tsCard.reps);
		expect(pluginCard.lapses).toBe(tsCard.lapses);
		expect(pluginCard.stability).toBe(tsCard.stability);
		expect(pluginCard.retrievability).toBe(1);
	});

	test("Good on new card matches ts-fsrs next()", () => {
		const pluginResult = pluginFsrs.review(pluginFsrs.createCard(), Rating.Good, FIXED_NOW.toISOString());
		const tsResult = tsFsrs.next(createEmptyCard(FIXED_NOW), FIXED_NOW, TsRating.Good);

		expect(pluginResult.card.stability).toBeCloseTo(tsResult.card.stability, 8);
		expect(pluginResult.card.difficulty).toBeCloseTo(tsResult.card.difficulty, 8);
		expect(pluginResult.card.scheduledDays).toBe(tsResult.card.scheduled_days);
		expect(pluginResult.card.state).toBe(tsResult.card.state);
		expect(pluginResult.log.rating).toBe(Rating.Good);
	});

	test("Again on review card matches ts-fsrs", () => {
		let pluginCard = pluginFsrs.createCard();
		let tsCard = createEmptyCard(FIXED_NOW);

		const good = pluginFsrs.review(pluginCard, Rating.Good, FIXED_NOW.toISOString());
		pluginCard = good.card;
		tsCard = tsFsrs.next(tsCard, FIXED_NOW, TsRating.Good).card;

		const later = new Date("2026-02-01T12:00:00.000Z").toISOString();
		pluginCard.elapsedDays = 17;
		tsCard.elapsed_days = 17;

		const pluginAgain = pluginFsrs.review(pluginCard, Rating.Again, later);
		const tsAgain = tsFsrs.next(tsCard, later, TsRating.Again);

		expect(pluginAgain.card.stability).toBeCloseTo(tsAgain.card.stability, 8);
		expect(pluginAgain.card.difficulty).toBeCloseTo(tsAgain.card.difficulty, 8);
		expect(pluginAgain.card.scheduledDays).toBe(tsAgain.card.scheduled_days);
	});

	test("predictMemoryState uses FSRS-6 forgetting curve", () => {
		const card = pluginFsrs.createCard();
		const reviewed = pluginFsrs.review(card, Rating.Good, FIXED_NOW.toISOString()).card;
		reviewed.elapsedDays = 10;

		const predicted = pluginFsrs.predictMemoryState(reviewed, 0);
		const tsR = tsFsrs.get_retrievability(
			{
				...createEmptyCard(FIXED_NOW),
				stability: reviewed.stability,
				difficulty: reviewed.difficulty,
				elapsed_days: 10,
				scheduled_days: reviewed.scheduledDays,
				reps: reviewed.reps,
				lapses: reviewed.lapses,
				state: reviewed.state as unknown as import("ts-fsrs").State,
				last_review: new Date(reviewed.lastReview!),
				due: new Date(reviewed.due),
			},
			new Date("2026-01-25T12:00:00.000Z"),
			false
		);

		expect(predicted).toBeCloseTo(tsR, 6);
	});

	test("updateParameters applies sanitized weights", () => {
		const invalid = [1, 2, 3] as unknown as number[];
		pluginFsrs.updateParameters({ w: invalid });
		expect(pluginFsrs.getParameters().w).toEqual(FSRS6_DEFAULTS.DEFAULT_WEIGHTS);
	});

	test("uses empty ts-fsrs learning steps (plugin-owned steps)", () => {
		const params = pluginFsrs.getScheduler().parameters;
		expect(params.learning_steps).toEqual(PLUGIN_OWNED_SCHEDULING.learning_steps);
		expect(params.relearning_steps).toEqual(PLUGIN_OWNED_SCHEDULING.relearning_steps);
	});

	test("repairs legacy Review cards with zero stability (study UI regression)", () => {
		const scheduler = createTsFsrsScheduler({ enableFuzz: false });
		const broken = {
			due: FIXED_NOW.toISOString(),
			stability: 0,
			difficulty: 0,
			elapsedDays: 0,
			scheduledDays: 0,
			reps: 2,
			lapses: 0,
			state: CardState.Review,
			lastReview: "2026-01-01T00:00:00.000Z",
			retrievability: 0.9,
		};

		expect(() =>
			reviewWithTsFsrs(scheduler, broken, Rating.Good, FIXED_NOW.toISOString())
		).not.toThrow();

		const sanitized = sanitizeFsrsCardForScheduling(broken, FIXED_NOW);
		expect(sanitized.stability).toBeGreaterThanOrEqual(0.001);
		expect(sanitized.difficulty).toBeGreaterThanOrEqual(1);
	});
});
