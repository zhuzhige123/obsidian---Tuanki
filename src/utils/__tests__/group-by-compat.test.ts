import { installGroupByCompat } from "../group-by-compat";

type GroupByPatchedObject = ObjectConstructor & {
	groupBy?: <T>(
		items: Iterable<T>,
		callbackFn: (item: T, index: number) => PropertyKey
	) => Record<PropertyKey, T[]>;
};

type GroupByPatchedMap = MapConstructor & {
	groupBy?: <T, K>(
		items: Iterable<T>,
		callbackFn: (item: T, index: number) => K
	) => Map<K, T[]>;
};

describe("installGroupByCompat", () => {
	let originalObjectGroupBy: GroupByPatchedObject["groupBy"];
	let originalMapGroupBy: GroupByPatchedMap["groupBy"];

	beforeEach(() => {
		originalObjectGroupBy = (Object as GroupByPatchedObject).groupBy;
		originalMapGroupBy = (Map as GroupByPatchedMap).groupBy;
		delete (Object as GroupByPatchedObject).groupBy;
		delete (Map as GroupByPatchedMap).groupBy;
	});

	afterEach(() => {
		if (originalObjectGroupBy) {
			Object.defineProperty(Object, "groupBy", {
				value: originalObjectGroupBy,
				writable: true,
				configurable: true,
			});
		} else {
			delete (Object as GroupByPatchedObject).groupBy;
		}

		if (originalMapGroupBy) {
			Object.defineProperty(Map, "groupBy", {
				value: originalMapGroupBy,
				writable: true,
				configurable: true,
			});
		} else {
			delete (Map as GroupByPatchedMap).groupBy;
		}
	});

	it("polyfills Object.groupBy with stringified property keys", () => {
		installGroupByCompat();

		const grouped = (Object as GroupByPatchedObject).groupBy?.([1, 2, 3, 4], (value) =>
			value % 2 === 0 ? "even" : "odd"
		);

		expect(grouped).toEqual({
			odd: [1, 3],
			even: [2, 4],
		});
	});

	it("polyfills Map.groupBy with non-string keys", () => {
		installGroupByCompat();

		const small = { label: "small" };
		const large = { label: "large" };
		const grouped = (Map as GroupByPatchedMap).groupBy?.([1, 2, 3, 4], (value) =>
			value <= 2 ? small : large
		);

		expect(grouped?.get(small)).toEqual([1, 2]);
		expect(grouped?.get(large)).toEqual([3, 4]);
	});

	it("does not overwrite existing native implementations", () => {
		const nativeObjectGroupBy = () => ({ native: [1] });
		const nativeMapGroupBy = () => new Map([["native", [1]]]);
		Object.defineProperty(Object, "groupBy", {
			value: nativeObjectGroupBy,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(Map, "groupBy", {
			value: nativeMapGroupBy,
			writable: true,
			configurable: true,
		});

		installGroupByCompat();

		expect((Object as GroupByPatchedObject).groupBy).toBe(nativeObjectGroupBy);
		expect((Map as GroupByPatchedMap).groupBy).toBe(nativeMapGroupBy);
	});
});
