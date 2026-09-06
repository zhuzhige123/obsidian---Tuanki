import { inflateRaw } from "pako";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

interface ZipCentralEntry {
	name: string;
	compression: number;
	compressedSize: number;
	uncompressedSize: number;
	localHeaderOffset: number;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
	return (
		bytes[offset] |
		(bytes[offset + 1] << 8) |
		(bytes[offset + 2] << 16) |
		(bytes[offset + 3] << 24)
	);
}

function decodeFilename(bytes: Uint8Array, offset: number, length: number): string {
	return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function decompressEntryData(entry: ZipCentralEntry, bytes: Uint8Array): Uint8Array {
	const localHeaderOffset = entry.localHeaderOffset;
	if (readUint32LE(bytes, localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
		throw new Error(`Invalid local file header for ${entry.name}`);
	}

	const filenameLength = readUint16LE(bytes, localHeaderOffset + 26);
	const extraLength = readUint16LE(bytes, localHeaderOffset + 28);
	const dataOffset = localHeaderOffset + 30 + filenameLength + extraLength;
	const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);

	if (entry.compression === COMPRESSION_STORED) {
		return compressed.slice();
	}

	if (entry.compression === COMPRESSION_DEFLATE) {
		return inflateRaw(compressed);
	}

	throw new Error(`Unsupported ZIP compression method ${entry.compression} for ${entry.name}`);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
	const maxCommentLength = 0xffff;
	const searchStart = Math.max(0, bytes.length - (22 + maxCommentLength));
	for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
		if (readUint32LE(bytes, offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
			return offset;
		}
	}
	throw new Error("ZIP end of central directory record not found");
}

function parseCentralDirectory(bytes: Uint8Array): ZipCentralEntry[] {
	const eocdOffset = findEndOfCentralDirectory(bytes);
	const entryCount = readUint16LE(bytes, eocdOffset + 10);
	const centralDirectoryOffset = readUint32LE(bytes, eocdOffset + 16);
	const entries: ZipCentralEntry[] = [];

	let offset = centralDirectoryOffset;
	for (let index = 0; index < entryCount; index += 1) {
		if (readUint32LE(bytes, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
			throw new Error("Invalid ZIP central directory entry");
		}

		const compression = readUint16LE(bytes, offset + 10);
		const compressedSize = readUint32LE(bytes, offset + 20);
		const uncompressedSize = readUint32LE(bytes, offset + 24);
		const filenameLength = readUint16LE(bytes, offset + 28);
		const extraLength = readUint16LE(bytes, offset + 30);
		const commentLength = readUint16LE(bytes, offset + 32);
		const localHeaderOffset = readUint32LE(bytes, offset + 42);
		const name = decodeFilename(bytes, offset + 46, filenameLength);

		entries.push({
			name,
			compression,
			compressedSize,
			uncompressedSize,
			localHeaderOffset,
		});

		offset += 46 + filenameLength + extraLength + commentLength;
	}

	return entries;
}

/** Lightweight ZIP signature check for EPUB/APKG payloads (no extraction). */
export function isReadableZipArchive(bytes: Uint8Array): boolean {
	if (bytes.byteLength < 22) {
		return false;
	}

	const hasLocalHeader =
		bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);

	if (!hasLocalHeader) {
		return false;
	}

	try {
		findEndOfCentralDirectory(bytes);
		return true;
	} catch {
		return false;
	}
}

export class MinimalZipArchive {
	private readonly entries: Map<string, Uint8Array>;

	private constructor(entries: Map<string, Uint8Array>) {
		this.entries = entries;
	}

	static async fromArrayBuffer(buffer: ArrayBuffer): Promise<MinimalZipArchive> {
		const bytes = new Uint8Array(buffer);
		const centralEntries = parseCentralDirectory(bytes);
		const entries = new Map<string, Uint8Array>();

		for (const entry of centralEntries) {
			if (entry.name.endsWith("/")) {
				continue;
			}
			entries.set(entry.name, decompressEntryData(entry, bytes));
		}

		return new MinimalZipArchive(entries);
	}

	has(name: string): boolean {
		return this.entries.has(name);
	}

	file(name: string): MinimalZipFile | null {
		const data = this.entries.get(name);
		return data ? new MinimalZipFile(data) : null;
	}

	get names(): string[] {
		return Array.from(this.entries.keys());
	}
}

class MinimalZipFile {
	constructor(private readonly data: Uint8Array) {}

	async async(type: "text"): Promise<string>;
	async async(type: "uint8array"): Promise<Uint8Array>;
	async async(type: "text" | "uint8array"): Promise<string | Uint8Array> {
		if (type === "text") {
			return new TextDecoder().decode(this.data);
		}
		if (type === "uint8array") {
			return this.data.slice();
		}
		throw new Error(`Unsupported ZIP read type: ${type}`);
	}
}
