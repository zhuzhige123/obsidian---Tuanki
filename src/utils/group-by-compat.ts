type ObjectGroupBy = <T>(
	items: Iterable<T>,
	callbackFn: (item: T, index: number) => PropertyKey
) => Record<PropertyKey, T[]>;

type MapGroupBy = <T, K>(
	items: Iterable<T>,
	callbackFn: (item: T, index: number) => K
) => Map<K, T[]>;

type GroupByObjectConstructor = ObjectConstructor & {
	groupBy?: ObjectGroupBy;
};

type GroupByMapConstructor = MapConstructor & {
	groupBy?: MapGroupBy;
};

function assertIterable<T>(items: Iterable<T>): Iterable<T> {
	if (items == null || typeof (items as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
		throw new TypeError("groupBy items must be iterable");
	}
	return items;
}

function assertCallback<T, K>(
	callbackFn: ((item: T, index: number) => K) | undefined
): (item: T, index: number) => K {
	if (typeof callbackFn !== "function") {
		throw new TypeError("groupBy callback must be a function");
	}
	return callbackFn;
}

export function installGroupByCompat(): void {
	const objectCtor = Object as GroupByObjectConstructor;
	if (typeof objectCtor.groupBy !== "function") {
		Object.defineProperty(Object, "groupBy", {
			value<T>(items: Iterable<T>, callbackFn: (item: T, index: number) => PropertyKey) {
				const iterable = assertIterable(items);
				const callback = assertCallback(callbackFn);
				const grouped = Object.create(null) as Record<PropertyKey, T[]>;
				let index = 0;
				for (const item of iterable) {
					const rawKey = callback(item, index++);
					const key = typeof rawKey === "symbol" ? rawKey : String(rawKey);
					const bucket = grouped[key];
					if (Array.isArray(bucket)) {
						bucket.push(item);
					} else {
						grouped[key] = [item];
					}
				}
				return grouped;
			},
			writable: true,
			configurable: true,
		});
	}

	const mapCtor = Map as GroupByMapConstructor;
	if (typeof mapCtor.groupBy !== "function") {
		Object.defineProperty(Map, "groupBy", {
			value<T, K>(items: Iterable<T>, callbackFn: (item: T, index: number) => K) {
				const iterable = assertIterable(items);
				const callback = assertCallback(callbackFn);
				const grouped = new Map<K, T[]>();
				let index = 0;
				for (const item of iterable) {
					const key = callback(item, index++);
					const bucket = grouped.get(key);
					if (bucket) {
						bucket.push(item);
					} else {
						grouped.set(key, [item]);
					}
				}
				return grouped;
			},
			writable: true,
			configurable: true,
		});
	}
}

installGroupByCompat();
