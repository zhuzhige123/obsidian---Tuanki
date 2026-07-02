import { describe, expect, it, vi } from "vitest";
import { adapterWriteIfChanged, textContentEquals } from "../vault-write-guard";

describe("vault-write-guard", () => {
	it("treats CRLF and LF as equal", () => {
		expect(textContentEquals("a\r\nb", "a\nb")).toBe(true);
	});

	it("skips adapter write when content is unchanged", async () => {
		const write = vi.fn(async () => undefined);
		const adapter = {
			exists: async () => true,
			read: async () => "same",
			write,
		};

		const result = await adapterWriteIfChanged(adapter, "weave/memory/test.json", "same");
		expect(result).toEqual({ written: false, skipped: true });
		expect(write).not.toHaveBeenCalled();
	});

	it("writes when content changed", async () => {
		const write = vi.fn(async () => undefined);
		const adapter = {
			exists: async () => true,
			read: async () => "old",
			write,
		};

		const result = await adapterWriteIfChanged(adapter, "weave/memory/test.json", "new");
		expect(result).toEqual({ written: true, skipped: false });
		expect(write).toHaveBeenCalledWith("weave/memory/test.json", "new");
	});
});
