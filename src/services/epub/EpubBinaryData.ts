import type { App, TFile } from "obsidian";
import { logger } from "../../utils/logger";

type ByteArrayLike = ArrayLike<number> & { [index: number]: number };
type BufferLike = {
	buffer: ArrayBuffer;
	byteOffset?: number;
	byteLength?: number;
};

function describeBinarySource(value: unknown): string {
	if (value == null) {
		return String(value);
	}

	const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
	return constructorName || typeof value;
}

function getBinaryLength(value: unknown): number | null {
	if (value instanceof ArrayBuffer) {
		return value.byteLength;
	}

	if (ArrayBuffer.isView(value)) {
		return value.byteLength;
	}

	if (Array.isArray(value)) {
		return value.length;
	}

	if (typeof value === "object" && value !== null && "byteLength" in value) {
		const byteLength = Number((value as { byteLength?: unknown }).byteLength);
		return Number.isFinite(byteLength) && byteLength >= 0 ? byteLength : null;
	}

	if (typeof value === "object" && value !== null && "length" in value) {
		const length = Number((value as { length?: unknown }).length);
		return Number.isFinite(length) && length >= 0 ? length : null;
	}

	return null;
}

function isBufferLike(value: unknown): value is BufferLike {
	if (!value || typeof value !== "object" || !("buffer" in value)) {
		return false;
	}

	const buffer = (value as { buffer?: unknown }).buffer;
	return buffer instanceof ArrayBuffer;
}

function isByteArrayLike(value: unknown): value is ByteArrayLike {
	if (!value || typeof value !== "object" || !("length" in value)) {
		return false;
	}

	const length = Number((value as { length?: unknown }).length);
	return Number.isInteger(length) && length >= 0;
}

function buildSignatureHex(bytes: Uint8Array): string {
	return Array.from(bytes.slice(0, 4))
		.map((value) => value.toString(16).padStart(2, "0"))
		.join(" ");
}

type BinaryReadAttempt = {
	label: string;
	read: () => Promise<unknown>;
};

type BinaryCandidate = {
	label: string;
	bytes: Uint8Array<ArrayBuffer>;
	exactSize: boolean;
};

export function hasZipSignature(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
	);
}

export function normalizeVaultBinaryData(
	binary: unknown,
	context: string
): Uint8Array<ArrayBuffer> {
	let normalized: Uint8Array<ArrayBuffer>;

	if (binary instanceof Uint8Array) {
		normalized = Uint8Array.from(binary);
	} else if (binary instanceof ArrayBuffer) {
		normalized = new Uint8Array(binary.slice(0));
	} else if (ArrayBuffer.isView(binary)) {
		normalized = Uint8Array.from(
			new Uint8Array(binary.buffer as ArrayBuffer, binary.byteOffset, binary.byteLength)
		);
	} else if (Array.isArray(binary)) {
		normalized = Uint8Array.from(binary);
	} else if (isBufferLike(binary)) {
		normalized = Uint8Array.from(
			new Uint8Array(
				binary.buffer,
				binary.byteOffset ?? 0,
				binary.byteLength ?? binary.buffer.byteLength
			)
		);
	} else if (isByteArrayLike(binary)) {
		const result = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			result[index] = Number(binary[index] ?? 0);
		}
		normalized = result;
	} else {
		throw new Error(`EPUB 二进制格式不受支持: ${context} (${describeBinarySource(binary)})`);
	}

	const diagnostics = {
		context,
		sourceType: describeBinarySource(binary),
		sourceLength: getBinaryLength(binary),
		normalizedLength: normalized.byteLength,
		signature: buildSignatureHex(normalized),
	};

	logger.debugWithTag("EpubBinaryData", "Normalized vault binary payload", diagnostics);

	if (!hasZipSignature(normalized)) {
		logger.warn("[EpubBinaryData] EPUB payload is missing ZIP signature", diagnostics);
	}

	return normalized;
}

function getExpectedFileSize(file: TFile): number | null {
	const size = Number(file?.stat?.size);
	return Number.isFinite(size) && size > 0 ? size : null;
}

function chooseBetterCandidate(
	current: BinaryCandidate | null,
	next: BinaryCandidate
): BinaryCandidate {
	if (!current) {
		return next;
	}

	if (next.exactSize && !current.exactSize) {
		return next;
	}

	if (next.exactSize === current.exactSize && next.bytes.byteLength > current.bytes.byteLength) {
		return next;
	}

	return current;
}

function createBinaryReadAttempts(app: App, file: TFile): BinaryReadAttempt[] {
	const attempts: BinaryReadAttempt[] = [
		{
			label: "vault.readBinary",
			read: () => app.vault.readBinary(file),
		},
	];

	const adapter = (app.vault as { adapter?: { readBinary?: (normalizedPath: string) => Promise<unknown> } })
		.adapter;
	if (typeof adapter?.readBinary === "function") {
		const readBinaryFromAdapter = adapter.readBinary.bind(adapter);
		attempts.push({
			label: "vault.adapter.readBinary",
			read: () => readBinaryFromAdapter(file.path),
		});
	}

	if (typeof app.vault.getResourcePath === "function") {
		attempts.push({
			label: "vault.getResourcePath+xhr",
			read: async () => {
				const resourcePath = app.vault.getResourcePath(file);
				if (!resourcePath) {
					throw new Error(`Missing resource path for ${file.path}`);
				}
				return readArrayBufferResource(resourcePath);
			},
		});
	}

	return attempts;
}

function readArrayBufferResource(resourcePath: string): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("GET", resourcePath, true);
		request.responseType = "arraybuffer";
		request.onload = () => {
			if (
				(request.status === 0 || (request.status >= 200 && request.status < 300)) &&
				request.response instanceof ArrayBuffer
			) {
				resolve(request.response);
				return;
			}
			reject(
				new Error(
					`Failed to load binary resource: ${request.status} ${request.statusText || "Unknown error"}`
				)
			);
		};
		request.onerror = async () => {
			try {
				resolve(await readArrayBufferResourceViaFetch(resourcePath));
			} catch (error) {
				reject(error);
			}
		};
		request.send();
	});
}

async function readArrayBufferResourceViaFetch(resourcePath: string): Promise<ArrayBuffer> {
	if (typeof globalThis.fetch !== "function") {
		throw new Error("Failed to load binary resource");
	}

	const response = await globalThis.fetch(resourcePath);
	if (!response.ok) {
		throw new Error(`Failed to load binary resource: ${response.status} ${response.statusText}`);
	}
	return response.arrayBuffer();
}

export async function readVaultBinaryData(
	app: App,
	file: TFile,
	context: string
): Promise<Uint8Array<ArrayBuffer>> {
	const expectedSize = getExpectedFileSize(file);
	const attempts = createBinaryReadAttempts(app, file);
	const diagnostics: Array<Record<string, unknown>> = [];
	let bestCandidate: BinaryCandidate | null = null;
	let firstError: unknown = null;

	for (const attempt of attempts) {
		try {
			const raw = await attempt.read();
			const bytes = normalizeVaultBinaryData(raw, `${context} via ${attempt.label}`);
			const exactSize = expectedSize == null || bytes.byteLength === expectedSize;
			const zipLike = hasZipSignature(bytes);

			diagnostics.push({
				label: attempt.label,
				byteLength: bytes.byteLength,
				exactSize,
				zipLike,
				signature: buildSignatureHex(bytes),
			});

			if (!zipLike) {
				continue;
			}

			const candidate: BinaryCandidate = {
				label: attempt.label,
				bytes,
				exactSize,
			};

			if (exactSize) {
				if (attempt.label !== "vault.readBinary") {
					logger.warn("[EpubBinaryData] Recovered EPUB binary through fallback read strategy", {
						context,
						filePath: file.path,
						expectedSize,
						chosen: attempt.label,
						diagnostics,
					});
				}
				return bytes;
			}

			bestCandidate = chooseBetterCandidate(bestCandidate, candidate);
		} catch (error) {
			firstError ||= error;
			diagnostics.push({
				label: attempt.label,
				error:
					error instanceof Error
						? error.message
						: typeof error === "string"
							? error
							: String(error),
			});
		}
	}

	if (bestCandidate) {
		logger.warn("[EpubBinaryData] EPUB binary size does not match file stat; using best available payload", {
			context,
			filePath: file.path,
			expectedSize,
			chosen: bestCandidate.label,
			chosenLength: bestCandidate.bytes.byteLength,
			diagnostics,
		});
		return bestCandidate.bytes;
	}

	if (firstError instanceof Error) {
		throw firstError;
	}

	throw new Error(`EPUB binary read failed: ${context}`);
}
