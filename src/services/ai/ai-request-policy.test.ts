import {
	configureAIRequestPolicy,
	getAIRequestConcurrentLimit,
	getAIRequestTimeoutMs,
	resetAIRequestPolicyForTests,
	runWithAIRequestSlot,
	withAIRequestTimeout,
} from "./ai-request-policy";

describe("ai-request-policy", () => {
	afterEach(() => {
		resetAIRequestPolicyForTests();
	});

	it("applies timeout and concurrent limits from settings", () => {
		configureAIRequestPolicy({
			requestTimeoutSeconds: 45,
			concurrentLimit: 2,
		});

		expect(getAIRequestTimeoutMs()).toBe(45_000);
		expect(getAIRequestConcurrentLimit()).toBe(2);
	});

	it("rejects when the timeout elapses first", async () => {
		configureAIRequestPolicy({ requestTimeoutSeconds: 1, concurrentLimit: 1 });

		await expect(
			withAIRequestTimeout(
				() =>
					new Promise<string>((resolve) => {
						window.setTimeout(() => resolve("late"), 50);
					}),
				10
			)
		).rejects.toThrow("timeout");
	});

	it("limits concurrent slots", async () => {
		configureAIRequestPolicy({ concurrentLimit: 1 });

		let releaseFirst: (() => void) | undefined;
		const first = runWithAIRequestSlot(
			() =>
				new Promise<void>((resolve) => {
					releaseFirst = resolve;
				})
		);
		let secondStarted = false;

		const second = runWithAIRequestSlot(async () => {
			secondStarted = true;
		});

		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(secondStarted).toBe(false);

		releaseFirst?.();
		await first;
		await second;
		expect(secondStarted).toBe(true);
	});
});
