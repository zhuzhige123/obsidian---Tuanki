import { computeToolbarPosition, createEventBinder, isEventOutsideToolbar } from './toolbar-positioning';

describe('toolbar-positioning', () => {
	it('returns docked placement for mobile toolbars', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 20, left: 40, bottom: 36, right: 96, width: 56, height: 16 },
			containerWidth: 320,
			containerHeight: 480,
			toolbarWidth: 280,
			toolbarHeight: 72,
			mobile: true,
		});

		expect(result).toEqual({
			top: 0,
			left: 160,
			arrowOffset: 0,
			isBelowAnchor: true,
			mode: 'docked',
		});
	});

	it('places floating toolbars above the anchor when space is available', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 120, left: 100, bottom: 144, right: 164, width: 64, height: 24 },
			containerWidth: 360,
			containerHeight: 280,
			toolbarWidth: 140,
			toolbarHeight: 60,
			mobile: false,
		});

		expect(result.mode).toBe('floating');
		expect(result.isBelowAnchor).toBe(false);
		expect(result.top).toBe(48);
		expect(result.left).toBe(132);
		expect(result.arrowOffset).toBe(0);
	});

	it('flips below and clamps arrow offset near viewport edges', () => {
		const result = computeToolbarPosition({
			anchorRect: { top: 18, left: 8, bottom: 34, right: 40, width: 32, height: 16 },
			containerWidth: 240,
			containerHeight: 180,
			toolbarWidth: 120,
			toolbarHeight: 56,
			mobile: false,
		});

		expect(result.isBelowAnchor).toBe(true);
		expect(result.left).toBe(72);
		expect(result.top).toBe(46);
		expect(result.arrowOffset).toBe(-42);
	});

	it('disposes bound listeners together', () => {
		const binder = createEventBinder();
		const target = document.createElement('div');
		const handler = vi.fn();

		binder.bind(target, 'click', handler);
		target.dispatchEvent(new Event('click'));
		expect(handler).toHaveBeenCalledTimes(1);

		binder.dispose();
		target.dispatchEvent(new Event('click'));
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('detects outside toolbar events', () => {
		const toolbar = document.createElement('div');
		const child = document.createElement('button');
		toolbar.appendChild(child);
		document.body.appendChild(toolbar);
		const outside = document.createElement('div');
		document.body.appendChild(outside);

		const insideEvent = new MouseEvent('mousedown', { bubbles: true });
		Object.defineProperty(insideEvent, 'target', { value: child });
		expect(isEventOutsideToolbar(toolbar, insideEvent)).toBe(false);

		const outsideEvent = new MouseEvent('mousedown', { bubbles: true });
		Object.defineProperty(outsideEvent, 'target', { value: outside });
		expect(isEventOutsideToolbar(toolbar, outsideEvent)).toBe(true);

		expect(isEventOutsideToolbar(undefined, outsideEvent)).toBe(false);
	});
});
