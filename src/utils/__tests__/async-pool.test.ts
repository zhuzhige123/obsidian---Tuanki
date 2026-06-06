import { describe, expect, it } from "vitest";
import { runTasksWithConcurrency } from "../async-pool";

describe("runTasksWithConcurrency", () => {
	it("runs all tasks and preserves order", async () => {
		const results = await runTasksWithConcurrency(
			[0, 1, 2, 3, 4].map((value) => async () => value * 2),
			2
		);

		expect(results).toEqual([0, 2, 4, 6, 8]);
	});

	it("returns an empty array for no tasks", async () => {
		await expect(runTasksWithConcurrency([], 4)).resolves.toEqual([]);
	});
});
