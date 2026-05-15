import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageMaskIntegration } from "../ImageMaskIntegration";

function createApp() {
	return {
		metadataCache: {
			getFirstLinkpathDest: vi.fn((link: string) => {
				if (link.includes("heart.png")) {
					return { path: "assets/heart.png", extension: "png", basename: "heart" };
				}
				if (link.includes("one.png")) {
					return { path: "assets/one.png", extension: "png", basename: "one" };
				}
				if (link.includes("two.png")) {
					return { path: "assets/two.png", extension: "png", basename: "two" };
				}
				return null;
			}),
		},
	} as any;
}

function createLoadedImage(src: string, alt = "") {
	const img = document.createElement("img");
	img.setAttribute("src", src);
	if (alt) {
		img.setAttribute("alt", alt);
	}
	Object.defineProperty(img, "complete", {
		configurable: true,
		get: () => true,
	});
	Object.defineProperty(img, "naturalWidth", {
		configurable: true,
		get: () => 600,
	});
	Object.defineProperty(img, "naturalHeight", {
		configurable: true,
		get: () => 400,
	});
	return img;
}

describe("ImageMaskIntegration", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		if (!(HTMLElement.prototype as any).setCssProps) {
			(HTMLElement.prototype as any).setCssProps = function (props: Record<string, string>) {
				for (const [key, value] of Object.entries(props || {})) {
					this.style.setProperty(key, value);
				}
			};
		}
		if (!(SVGElement.prototype as any).setCssProps) {
			(SVGElement.prototype as any).setCssProps = function (props: Record<string, string>) {
				for (const [key, value] of Object.entries(props || {})) {
					(this as SVGElement).style.setProperty(key, value);
				}
			};
		}
	});

	it("matches repeated images by stable target occurrence before falling back to index", () => {
		const integration = new ImageMaskIntegration(createApp());
		const container = document.createElement("div");
		container.appendChild(createLoadedImage("app://local/assets/heart.png"));
		container.appendChild(createLoadedImage("app://local/assets/heart.png"));

		const content = [
			"![[assets/heart.png]]",
			'<!-- weave-mask: {"version":"1.0","masks":[{"id":"mask-1","type":"rect","x":0.1,"y":0.1,"width":0.2,"height":0.2,"style":"solid"}],"target":{"imagePath":"assets/heart.png","imageLink":"assets/heart.png","imageOccurrence":1}} -->',
			"",
			"![[assets/heart.png]]",
			'<!-- weave-mask: {"version":"1.0","masks":[{"id":"mask-2","type":"rect","x":0.2,"y":0.2,"width":0.2,"height":0.2,"style":"solid"}],"target":{"imagePath":"assets/heart.png","imageLink":"assets/heart.png","imageOccurrence":2}} -->',
		].join("\n");

		integration.applyMasksInContainer(container, content, false, "notes/anatomy.md");

		const wrappers = container.querySelectorAll(".weave-image-with-masks");
		expect(wrappers).toHaveLength(2);
		expect(wrappers[0]?.querySelector('[data-mask-id="mask-1"]')).not.toBeNull();
		expect(wrappers[1]?.querySelector('[data-mask-id="mask-2"]')).not.toBeNull();
	});

	it("falls back to image order for legacy mask data without target", () => {
		const integration = new ImageMaskIntegration(createApp());
		const container = document.createElement("div");
		container.appendChild(createLoadedImage("app://local/render-first.png"));
		container.appendChild(createLoadedImage("app://local/render-second.png"));

		const content = [
			"![[assets/one.png]]",
			'<!-- weave-mask: {"version":"1.0","masks":[{"id":"legacy-1","type":"rect","x":0.1,"y":0.1,"width":0.2,"height":0.2,"style":"solid"}]} -->',
			"",
			"![[assets/two.png]]",
			'<!-- weave-mask: {"version":"1.0","masks":[{"id":"legacy-2","type":"rect","x":0.2,"y":0.2,"width":0.2,"height":0.2,"style":"solid"}]} -->',
		].join("\n");

		integration.applyMasksInContainer(container, content, false, "notes/anatomy.md");

		const wrappers = container.querySelectorAll(".weave-image-with-masks");
		expect(wrappers).toHaveLength(2);
		expect(wrappers[0]?.querySelector('[data-mask-id="legacy-1"]')).not.toBeNull();
		expect(wrappers[1]?.querySelector('[data-mask-id="legacy-2"]')).not.toBeNull();
	});
});
