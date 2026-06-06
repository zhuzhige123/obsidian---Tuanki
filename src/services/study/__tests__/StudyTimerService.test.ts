import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyTimerService } from "../StudyTimerService";

describe("StudyTimerService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-06T10:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("tracks elapsed time from reset", () => {
		const timer = new StudyTimerService({ autoPauseSeconds: 0 });
		timer.reset();

		vi.advanceTimersByTime(12_500);
		expect(timer.getElapsedMs()).toBe(12_500);
		expect(timer.getResponseTimeMs()).toBe(12_500);
	});

	it("freezes elapsed and response time when auto-pause threshold is reached", () => {
		const onAutoPaused = vi.fn();
		const timer = new StudyTimerService({
			autoPauseSeconds: 60,
			onAutoPaused,
		});
		timer.reset();

		vi.advanceTimersByTime(90_000);

		expect(timer.getElapsedMs()).toBe(60_000);
		expect(timer.getResponseTimeMs()).toBe(60_000);
		expect(onAutoPaused).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(120_000);
		expect(timer.getResponseTimeMs()).toBe(60_000);
	});

	it("resets pause state on reset", () => {
		const timer = new StudyTimerService({ autoPauseSeconds: 10 });
		timer.reset();
		vi.advanceTimersByTime(15_000);
		expect(timer.isPaused()).toBe(true);

		timer.reset();
		expect(timer.isPaused()).toBe(false);
		expect(timer.getElapsedMs()).toBe(0);
	});

	it("supports manual pause and resume without losing accumulated time", () => {
		const timer = new StudyTimerService({ autoPauseSeconds: 0 });
		timer.reset();
		vi.advanceTimersByTime(8_000);
		timer.setPaused(true);
		vi.advanceTimersByTime(20_000);
		expect(timer.getElapsedMs()).toBe(8_000);

		timer.setPaused(false);
		vi.advanceTimersByTime(2_000);
		expect(timer.getElapsedMs()).toBe(10_000);
	});
});
