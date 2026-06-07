/**
 * Return a shallow copy of `obj` without the given key.
 * Prefer this over `const { key: _key, ...rest }` omit patterns in review-sensitive code.
 */
export function omitKey<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
	const result = { ...obj };
	delete result[key];
	return result;
}

export function omitKeys<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
	const result = { ...obj };
	for (const key of keys) {
		delete result[key];
	}
	return result;
}

/**
 * Return the first value from an iterator, or undefined when exhausted.
 */
export function firstIteratorValue<T>(iterator: Iterator<T, void, unknown>): T | undefined {
	const result: IteratorResult<T, void> = iterator.next();
	return result.done ? undefined : result.value;
}
