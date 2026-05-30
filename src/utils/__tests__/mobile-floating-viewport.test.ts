import {
	detectKeyboardVisible,
	getVisualViewportLayout,
	MOBILE_KEYBOARD_THRESHOLD,
} from "../mobile-floating-viewport";
describe("detectKeyboardVisible", () => {
	it("returns true when visual viewport is much shorter than layout viewport", () => {
		expect(detectKeyboardVisible(400, 700, MOBILE_KEYBOARD_THRESHOLD)).toBe(true);
	});

	it("returns false when heights are close", () => {
		expect(detectKeyboardVisible(680, 700, MOBILE_KEYBOARD_THRESHOLD)).toBe(false);
	});
});

describe("getVisualViewportLayout", () => {
	it("exposes keyboardVisible from viewport height delta", () => {
		const originalVisualViewport = window.visualViewport;
		Object.defineProperty(window, "visualViewport", {
			configurable: true,
			value: {
				height: 420,
				width: 390,
				offsetTop: 0,
				offsetLeft: 0,
			},
		});
		Object.defineProperty(window, "innerHeight", {
			configurable: true,
			value: 700,
		});

		const layout = getVisualViewportLayout();
		expect(layout.height).toBe(420);
		expect(layout.keyboardVisible).toBe(true);

		Object.defineProperty(window, "visualViewport", {
			configurable: true,
			value: originalVisualViewport,
		});
	});
});
