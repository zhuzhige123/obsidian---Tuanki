import { readUnknownNumber, readUnknownProperty } from "./dynamic-access";

export interface ChromePerformanceMemory {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
}

export function getChromePerformanceMemory(): ChromePerformanceMemory | null {
	if (typeof performance === "undefined") {
		return null;
	}
	const memory = readUnknownProperty(performance, "memory");
	const used = readUnknownNumber(memory, "usedJSHeapSize");
	const total = readUnknownNumber(memory, "totalJSHeapSize");
	if (used === undefined || total === undefined || total <= 0) {
		return null;
	}
	return { usedJSHeapSize: used, totalJSHeapSize: total };
}

export function getChromeMemoryUsageSnapshot(): {
	used: number;
	total: number;
	percentage: number;
} {
	const memory = getChromePerformanceMemory();
	if (!memory) {
		return { used: 0, total: 0, percentage: 0 };
	}
	return {
		used: memory.usedJSHeapSize,
		total: memory.totalJSHeapSize,
		percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100,
	};
}
