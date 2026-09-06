import { describe, expect, it } from "vitest";
import { isReadableZipArchive, MinimalZipArchive, packZipArchive } from "./minimal-zip";

describe("minimal-zip", () => {
	it("packs and reads APKG-like archives", async () => {
		const packed = await packZipArchive({
			"collection.anki21": new Uint8Array([1, 2, 3]),
			media: JSON.stringify({ 0: "sound.mp3" }),
			"0": new Uint8Array([9, 8, 7]),
		});

		expect(isReadableZipArchive(packed)).toBe(true);

		const archive = await MinimalZipArchive.fromArrayBuffer(packed.buffer);
		expect(archive.has("collection.anki21")).toBe(true);
		expect(archive.has("media")).toBe(true);
		expect(archive.has("0")).toBe(true);

		const db = await archive.file("collection.anki21")?.async("uint8array");
		expect(db).toEqual(new Uint8Array([1, 2, 3]));

		const mediaMap = await archive.file("media")?.async("text");
		expect(mediaMap).toBe(JSON.stringify({ 0: "sound.mp3" }));

		const sound = await archive.file("0")?.async("uint8array");
		expect(sound).toEqual(new Uint8Array([9, 8, 7]));
	});

	it("rejects archives without a central directory", () => {
		const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
		expect(isReadableZipArchive(bytes)).toBe(false);
	});
});
