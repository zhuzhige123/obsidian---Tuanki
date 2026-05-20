import {
	DEFAULT_MOBILE_READER_SETTINGS,
	DEFAULT_READER_SETTINGS,
	normalizeEpubReaderSettingsForDevice,
} from "../reader-settings";

describe("normalizeEpubReaderSettingsForDevice", () => {
	it("preserves explicit mobile paginated mode while keeping a single-page layout", () => {
		expect(
			normalizeEpubReaderSettingsForDevice("mobile", {
				lineHeight: 1.82,
				viewportSidePadding: 14,
				widthMode: "full",
				layoutMode: "paginated",
				flowMode: "paginated",
				showScrolledSideNav: false,
			})
		).toEqual({
			...DEFAULT_MOBILE_READER_SETTINGS,
			lineHeight: 1.82,
			viewportSidePadding: 14,
			widthMode: "full",
			layoutMode: "paginated",
			flowMode: "paginated",
			showScrolledSideNav: false,
		});
	});

	it("falls back to the device defaults for invalid values", () => {
		expect(
			normalizeEpubReaderSettingsForDevice("mobile", {
				lineHeight: 0,
				viewportSidePadding: Number.NaN,
				widthMode: "wide" as never,
				layoutMode: "double",
				flowMode: "paginated",
				showScrolledSideNav: undefined,
			})
		).toEqual({
			...DEFAULT_MOBILE_READER_SETTINGS,
			layoutMode: "paginated",
			flowMode: "paginated",
		});
	});

	it("forces desktop double-page mode to use full width", () => {
		expect(
			normalizeEpubReaderSettingsForDevice("desktop", {
				...DEFAULT_READER_SETTINGS,
				layoutMode: "double",
				widthMode: "standard",
			})
		).toEqual({
			...DEFAULT_READER_SETTINGS,
			layoutMode: "double",
			widthMode: "full",
		});
	});
});
