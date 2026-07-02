import {
	TABLE_HORIZONTAL_OVERFLOW_THRESHOLD,
	canTopScrollbarScroll,
	createOverflowMeasureScheduler,
	measureHorizontalOverflow,
	resetLinkedHorizontalScroll,
	syncLinkedHorizontalScroll,
} from './table-horizontal-scroll';

function createScrollHost(clientWidth: number, scrollWidth: number): HTMLElement {
	return {
		clientWidth,
		scrollWidth,
		scrollLeft: 0,
	} as HTMLElement;
}

function createTopScrollbar(clientWidth: number, scrollWidth: number): HTMLElement {
	return {
		clientWidth,
		scrollWidth,
		scrollLeft: 0,
	} as HTMLElement;
}

describe('measureHorizontalOverflow', () => {
	it('returns null when viewport is not ready', () => {
		expect(
			measureHorizontalOverflow({
				scrollHost: createScrollHost(0, 1200),
			})
		).toBeNull();
	});

	it('treats small overflow as layout noise', () => {
		const metrics = measureHorizontalOverflow({
			scrollHost: createScrollHost(1000, 1010),
		});

		expect(metrics).toEqual({
			viewportWidth: 1000,
			contentWidth: 1010,
			overflowAmount: 10,
			hasOverflow: false,
		});
	});

	it('detects meaningful horizontal overflow', () => {
		const metrics = measureHorizontalOverflow({
			scrollHost: createScrollHost(800, 1200),
		});

		expect(metrics?.hasOverflow).toBe(true);
		expect(metrics?.overflowAmount).toBe(400);
	});

	it('uses fallback viewport width when scroll host width is zero', () => {
		const metrics = measureHorizontalOverflow({
			scrollHost: createScrollHost(0, 1200),
			fallbackViewportWidths: [0, 900],
		});

		expect(metrics?.viewportWidth).toBe(900);
		expect(metrics?.hasOverflow).toBe(true);
	});
});

describe('canTopScrollbarScroll', () => {
	it('requires overflow beyond threshold on top track', () => {
		expect(canTopScrollbarScroll(createTopScrollbar(900, 905))).toBe(false);
		expect(canTopScrollbarScroll(createTopScrollbar(900, 930))).toBe(true);
		expect(TABLE_HORIZONTAL_OVERFLOW_THRESHOLD).toBe(16);
	});
});

describe('syncLinkedHorizontalScroll', () => {
	it('copies scroll position from top track to content host', () => {
		const top = createTopScrollbar(900, 1200);
		const content = createScrollHost(900, 1200);
		top.scrollLeft = 48;

		syncLinkedHorizontalScroll('top', top, content);

		expect(content.scrollLeft).toBe(48);
	});

	it('copies scroll position from content host to top track', () => {
		const top = createTopScrollbar(900, 1200);
		const content = createScrollHost(900, 1200);
		content.scrollLeft = 72;

		syncLinkedHorizontalScroll('content', top, content);

		expect(top.scrollLeft).toBe(72);
	});
});

describe('resetLinkedHorizontalScroll', () => {
	it('clears both scroll positions', () => {
		const top = createTopScrollbar(900, 1200);
		const content = createScrollHost(900, 1200);
		top.scrollLeft = 40;
		content.scrollLeft = 40;

		resetLinkedHorizontalScroll(content, top);

		expect(content.scrollLeft).toBe(0);
		expect(top.scrollLeft).toBe(0);
	});
});

describe('createOverflowMeasureScheduler', () => {
	it('debounces measure calls via double rAF', async () => {
		const measure = vi.fn();
		const scheduler = createOverflowMeasureScheduler(measure);

		scheduler.schedule();
		scheduler.schedule();

		expect(measure).not.toHaveBeenCalled();

		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => resolve());
			});
		});

		expect(measure).toHaveBeenCalledTimes(1);
		scheduler.dispose();
	});
});
