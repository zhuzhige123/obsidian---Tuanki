import { isReadableZipArchive, MinimalZipArchive } from "./minimal-zip";

/** Deflate-compressed APKG-like archive (collection.anki21 + media + 0). */
const SAMPLE_APKG_ZIP_BASE64 =
	"UEsDBBQAAAAIAAAAAAA2/S2mBQAAAAMAAAABAAAAMOPkYAcAUEsDBBQAAAAIAAAAAAAdgLxVBQAAAAMAAAARAAAAY29sbGVjdGlvbi5hbmtpMjFjZGIGAFBLAwQUAAAACAAAAAAApPZffhMAAAARAAAABQAAAG1lZGlhq1YyULJSKs4vzUvRyy0wVqoFAFBLAQIUABQAAAAIAAAAAAA2/S2mBQAAAAMAAAABAAAAAAAAAAAAAAAAAAAAAAAwUEsBAhQAFAAAAAgAAAAAAB2AvFUFAAAAAwAAABEAAAAAAAAAAAAAAAAAJAAAAGNvbGxlY3Rpb24uYW5raTIxUEsBAhQAFAAAAAgAAAAAAKT2X34TAAAAEQAAAAUAAAAAAAAAAAAAAAAAWAAAAG1lZGlhUEsFBgAAAAADAAMAoQAAAI4AAAAAAA==";

function decodeBase64(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

describe("minimal-zip", () => {
	it("reads deflate-compressed APKG-like archives", async () => {
		const packed = decodeBase64(SAMPLE_APKG_ZIP_BASE64);

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
