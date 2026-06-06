/**
 * Safe dynamic property access for plugin integrations (replaces `(x as unknown).prop`).
 */
export function readUnknownProperty(value: unknown, key: string): unknown {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	if (!Object.prototype.hasOwnProperty.call(value, key)) {
		return undefined;
	}
	return Reflect.get(value, key);
}

export function readUnknownString(value: unknown, key: string): string | undefined {
	const raw = readUnknownProperty(value, key);
	return typeof raw === "string" ? raw : undefined;
}

export function readUnknownNumber(value: unknown, key: string): number | undefined {
	const raw = readUnknownProperty(value, key);
	return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function readUnknownBoolean(value: unknown, key: string): boolean | undefined {
	const raw = readUnknownProperty(value, key);
	return typeof raw === "boolean" ? raw : undefined;
}

export function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === "function";
}

export async function callUnknownAsync(
	value: unknown,
	key: string,
	...args: unknown[]
): Promise<unknown> {
	const method = readUnknownProperty(value, key);
	if (!isCallable(method)) {
		return undefined;
	}
	return Reflect.apply(method, value, args);
}
