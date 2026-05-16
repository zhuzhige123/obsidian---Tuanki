import { ContentObserverImpl } from "../ContentObserver";

function createObserver(): ContentObserverImpl {
	const contentEl = document.createElement("div");
	const scroller = document.createElement("div");
	scroller.className = "cm-scroller";
	contentEl.appendChild(scroller);

	return new ContentObserverImpl({
		contentEl,
	} as any);
}

describe("ContentObserver", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("stop cancels pending timeout-scheduled update", () => {
		const observer = createObserver();
		const callback = vi.fn();
		observer.onPositionUpdate(callback);
		(observer as any).lastUpdateTime = Date.now();

		observer.triggerUpdate();
		observer.stop();
		vi.advanceTimersByTime(20);

		expect(callback).not.toHaveBeenCalled();
	});
});
