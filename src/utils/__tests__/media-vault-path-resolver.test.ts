import { describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import {
	buildMediaPathMatchVariants,
	buildUnavailableMediaPlaceholder,
	buildVaultMediaBasenameIndex,
	removeMediaPathFromContent,
	repairMediaReferencesInContent,
	resolveExistingMediaVaultPath,
	resolveRelativeVaultPath,
	rewriteMediaPathInContent,
} from "../media-vault-path-resolver";

describe("media-vault-path-resolver", () => {
	it("resolves parent-relative vault paths from a context file", () => {
		const resolved = resolveRelativeVaultPath(
			"weave/memory/attachment-registry.md",
			"../../附件/Pasted image 20260426094505.png"
		);
		expect(resolved).toBe("附件/Pasted image 20260426094505.png");
	});

	it("resolves triple-parent relative paths to vault-root attachment folders", () => {
		const resolved = resolveRelativeVaultPath(
			"weave/memory/attachment-registry.md",
			"../../../附件/Pasted image 20260426094505.png"
		);
		expect(resolved).toBe("附件/Pasted image 20260426094505.png");
	});

	it("resolves sibling-relative paths without a leading dot", () => {
		const resolved = resolveRelativeVaultPath(
			"weave/memory/attachment-registry.md",
			"附件/Pasted image 20260425075202.png"
		);
		expect(resolved).toBe("weave/memory/附件/Pasted image 20260425075202.png");
	});

	it("builds path match variants for encoded spaces", () => {
		const variants = buildMediaPathMatchVariants("附件/Pasted image 20260426094505.png");
		expect(variants).toContain("附件/Pasted image 20260426094505.png");
		expect(variants).toContain("附件/Pasted%20image%2020260426094505.png");
	});

	it("rewrites wikilink, markdown image, and html src references", () => {
		const fromPath = "../../附件/Pasted image 20260426094505.png";
		const toPath = "附件/Pasted image 20260426094505.png";
		const content = [
			`![[${fromPath}|300]]`,
			`![alt](${fromPath})`,
			`<img src="${fromPath}" />`,
		].join("\n");

		const rewritten = rewriteMediaPathInContent(content, fromPath, toPath);
		expect(rewritten).toContain(`![[${toPath}|300]]`);
		expect(rewritten).toContain(`![alt](${toPath})`);
		expect(rewritten).toContain(`src="${toPath}"`);
	});

	it("removes broken wikilink, markdown image, and html src references", () => {
		const brokenPath = "../../../附件/Pasted image 20260426094505.png";
		const content = [
			"前文",
			`![[${brokenPath}|300]]`,
			`![alt](${brokenPath})`,
			`<img src="${brokenPath}" />`,
			"后文",
		].join("\n");

		const stripped = removeMediaPathFromContent(content, brokenPath);
		expect(stripped).not.toContain(brokenPath);
		expect(stripped).toContain("前文");
		expect(stripped).toContain("后文");
	});

	it("finds existing media by basename when direct path is broken", async () => {
		const targetPath = "weave/memory/media/decks/a/Pasted image 20260426094505.png";
		const targetFile = {
			path: targetPath,
			name: "Pasted image 20260426094505.png",
			basename: "Pasted image 20260426094505",
			extension: "png",
		} as TFile;
		const app = {
			vault: {
				getFiles: () => [targetFile],
				getAbstractFileByPath: (path: string) => (path === targetPath ? targetFile : null),
				adapter: {
					exists: vi.fn(async (path: string) => path === targetPath),
				},
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => null),
			},
		};

		const resolved = await resolveExistingMediaVaultPath(
			app as never,
			"../../../附件/Pasted image 20260426094505.png",
			"weave/memory/attachment-registry.md",
			{ basenameIndex: buildVaultMediaBasenameIndex(app as never) }
		);

		expect(resolved).toBe(targetPath);
	});

	it("builds visible placeholder for unavailable attachments", () => {
		expect(buildUnavailableMediaPlaceholder("附件/Pasted image 20260426094505.png")).toContain(
			"Pasted image 20260426094505.png"
		);
	});

	it("repairs broken references by relinking or stripping", async () => {
		const targetPath = "附件/Pasted image 20260426094505.png";
		const targetFile = {
			path: targetPath,
			name: "Pasted image 20260426094505.png",
			basename: "Pasted image 20260426094505",
			extension: "png",
		} as TFile;
		const app = {
			vault: {
				getFiles: () => [targetFile],
				getAbstractFileByPath: (path: string) => (path === targetPath ? targetFile : null),
				adapter: {
					exists: vi.fn(async (path: string) => path === targetPath),
				},
			},
			metadataCache: {
				getFirstLinkpathDest: vi.fn(() => null),
			},
		};

		const repaired = await repairMediaReferencesInContent(
			app as never,
			"![[../../../附件/Pasted image 20260426094505.png|300]]",
			"weave/memory/attachment-registry.md",
			{ basenameIndex: buildVaultMediaBasenameIndex(app as never) }
		);

		expect(repaired.changed).toBe(true);
		expect(repaired.pathsNormalized).toBe(1);
		expect(repaired.text).toContain(`![[${targetPath}|300]]`);
	});
});
