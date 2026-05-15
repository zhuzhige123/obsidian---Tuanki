import { describe, expect, it, vi } from "vitest";
import { MaskDataParser } from "../MaskDataParser";

function createApp() {
	return {
		metadataCache: {
			getFirstLinkpathDest: vi.fn((link: string) => {
				if (link === "assets/heart.png") {
					return { path: "assets/heart.png", extension: "png", basename: "heart" };
				}
				return null;
			}),
		},
	} as any;
}

describe("MaskDataParser", () => {
	it("builds stable target with same-image occurrence count", () => {
		const parser = new MaskDataParser(createApp());
		const content = [
			"![[assets/heart.png]]",
			"<!-- weave-mask: {\"version\":\"1.0\",\"masks\":[]} -->",
			"",
			"![[assets/heart.png]]",
		].join("\n");

		const target = parser.buildMaskTargetForImage(content, 3, "notes/anatomy.md");

		expect(target).toEqual({
			imagePath: "assets/heart.png",
			imageLink: "assets/heart.png",
			imageOccurrence: 2,
		});
	});

	it("returns null when target line is not an image", () => {
		const parser = new MaskDataParser(createApp());
		const content = ["普通文本", "![[assets/heart.png]]"].join("\n");

		expect(parser.buildMaskTargetForImage(content, 0, "notes/anatomy.md")).toBeNull();
	});

	it("finds image line by image file path and preferred occurrence context", () => {
		const parser = new MaskDataParser(createApp());
		const content = [
			"![[assets/heart.png]]",
			"第一处图片说明",
			"![[assets/heart.png]]",
		].join("\n");

		expect(parser.findImageLineForFile(content, "notes/anatomy.md", "assets/heart.png")).toBe(0);
		expect(parser.findImageLineForFile(content, "notes/anatomy.md", "assets/heart.png", 2)).toBe(2);
		expect(parser.findImageLineForFileOccurrence(content, "notes/anatomy.md", "assets/heart.png", 2)).toBe(2);
	});
});
