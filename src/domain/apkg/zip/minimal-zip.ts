import { deflateRaw, inflateRaw } from "pako";

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

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >> 8) & 0xff;
	bytes[offset + 2] = (value >> 16) & 0xff;
	bytes[offset + 3] = (value >> 24) & 0xff;
}

function decodeFilename(bytes: Uint8Array, offset: number, length: number): string {
	return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

function encodeFilename(name: string): Uint8Array {
	return new TextEncoder().encode(name);
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let index = 0; index < bytes.length; index += 1) {
		crc ^= bytes[index];
		for (let bit = 0; bit < 8; bit += 1) {
			const mask = -(crc & 1);
			crc = (crc >>> 1) ^ (0xedb88320 & mask);
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
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

interface ZipWriteEntry {
	name: string;
	data: Uint8Array;
}

export async function packZipArchive(files: Record<string, Uint8Array | string>): Promise<Uint8Array> {
	const entries: ZipWriteEntry[] = Object.entries(files).map(([name, value]) => ({
		name,
		data: typeof value === "string" ? new TextEncoder().encode(value) : value.slice(),
	}));

	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const filenameBytes = encodeFilename(entry.name);
		const compressed = deflateRaw(entry.data);
		const crc = crc32(entry.data);
		const localHeader = new Uint8Array(30 + filenameBytes.length);
		writeUint32LE(localHeader, 0, LOCAL_FILE_HEADER_SIGNATURE);
		writeUint16LE(localHeader, 4, 20);
		writeUint16LE(localHeader, 6, 0);
		writeUint16LE(localHeader, 8, COMPRESSION_DEFLATE);
		writeUint32LE(localHeader, 14, crc);
		writeUint32LE(localHeader, 18, compressed.length);
		writeUint32LE(localHeader, 22, entry.data.length);
		writeUint16LE(localHeader, 26, filenameBytes.length);
		writeUint16LE(localHeader, 28, 0);
		localHeader.set(filenameBytes, 30);
		localParts.push(localHeader, compressed);

		const centralHeader = new Uint8Array(46 + filenameBytes.length);
		writeUint32LE(centralHeader, 0, CENTRAL_DIRECTORY_SIGNATURE);
		writeUint16LE(centralHeader, 4, 20);
		writeUint16LE(centralHeader, 6, 20);
		writeUint16LE(centralHeader, 8, 0);
		writeUint16LE(centralHeader, 10, COMPRESSION_DEFLATE);
		writeUint32LE(centralHeader, 16, crc);
		writeUint32LE(centralHeader, 20, compressed.length);
		writeUint32LE(centralHeader, 24, entry.data.length);
		writeUint16LE(centralHeader, 28, filenameBytes.length);
		writeUint16LE(centralHeader, 30, 0);
		writeUint16LE(centralHeader, 32, 0);
		writeUint16LE(centralHeader, 34, 0);
		writeUint32LE(centralHeader, 42, offset);
		centralHeader.set(filenameBytes, 46);
		centralParts.push(centralHeader);

		offset += localHeader.length + compressed.length;
	}

	const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
	const endRecord = new Uint8Array(22);
	writeUint32LE(endRecord, 0, END_OF_CENTRAL_DIRECTORY_SIGNATURE);
	writeUint16LE(endRecord, 8, entries.length);
	writeUint16LE(endRecord, 10, entries.length);
	writeUint32LE(endRecord, 12, centralDirectorySize);
	writeUint32LE(endRecord, 16, offset);

	const totalSize =
		localParts.reduce((sum, part) => sum + part.length, 0) +
		centralDirectorySize +
		endRecord.length;
	const output = new Uint8Array(totalSize);
	let writeOffset = 0;

	for (const part of localParts) {
		output.set(part, writeOffset);
		writeOffset += part.length;
	}
	for (const part of centralParts) {
		output.set(part, writeOffset);
		writeOffset += part.length;
	}
	output.set(endRecord, writeOffset);

	return output;
}
