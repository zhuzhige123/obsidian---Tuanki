import { describe, expect, it } from "vitest";
import {
	buildAttachmentRegistryMarkdown,
	buildMediaWikiLink,
	extractMediaVaultPathsFromContent,
	isMediaVaultPath,
	normalizeMediaVaultPath,
} from "../media-reference-extractor";

describe("media-reference-extractor", () => {
	it("extracts obsidian embeds with alias and width segments", () => {
		const paths = extractMediaVaultPathsFromContent(
			"![[weave/memory/media/decks/a/image.jpg|300|示例]]"
		);
		expect(paths.has("weave/memory/media/decks/a/image.jpg")).toBe(true);
	});

	it("extracts markdown and html media references", () => {
		const content = [
			"![alt](attachments/photo.png)",
			'<img src="weave/memory/media/shared/audio.mp3" />',
		].join("\n");
		const paths = extractMediaVaultPathsFromContent(content);
		expect(paths.has("attachments/photo.png")).toBe(true);
		expect(paths.has("weave/memory/media/shared/audio.mp3")).toBe(true);
	});

	it("ignores remote and non-media links", () => {
		const paths = extractMediaVaultPathsFromContent(
			"![[https://example.com/a.png]]\n[[notes/topic.md]]"
		);
		expect(paths.size).toBe(0);
	});

	it("builds sorted registry markdown", () => {
		const markdown = buildAttachmentRegistryMarkdown([
			"attachments/b.png",
			"attachments/a.png",
		]);
		expect(markdown).toContain("weave-managed: attachment-registry");
		expect(markdown.indexOf("attachments/a.png")).toBeLessThan(
			markdown.indexOf("attachments/b.png")
		);
	});

	it("normalizes windows-style paths", () => {
		expect(normalizeMediaVaultPath(".\\attachments\\a.png")).toBe("attachments/a.png");
	});

	it("builds wiki links with full vault path", () => {
		expect(buildMediaWikiLink("attachments/a.png")).toBe("![[attachments/a.png]]");
		expect(isMediaVaultPath("attachments/a.png")).toBe(true);
	});
});
