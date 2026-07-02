import type { WeaveTimerHandle } from "../../types/timer-handle.js";
/**
 * 全局 AI HTTP 请求策略（超时、并发），由插件设置驱动。
 */

let requestTimeoutMs = 30_000;
let concurrentLimit = 3;
let activeRequests = 0;
const waitQueue: Array<() => void> = [];

export function configureAIRequestPolicy(params: {
	requestTimeoutSeconds?: number;
	concurrentLimit?: number;
}): void {
	if (params.requestTimeoutSeconds !== undefined) {
		const seconds = Math.max(5, Math.min(600, params.requestTimeoutSeconds));
		requestTimeoutMs = seconds * 1000;
	}

	if (params.concurrentLimit !== undefined) {
		concurrentLimit = Math.max(1, Math.min(10, params.concurrentLimit));
	}
}

export function getAIRequestTimeoutMs(): number {
	return requestTimeoutMs;
}

export function getAIRequestConcurrentLimit(): number {
	return concurrentLimit;
}

export function resetAIRequestPolicyForTests(): void {
	requestTimeoutMs = 30_000;
	concurrentLimit = 3;
	activeRequests = 0;
	waitQueue.length = 0;
}

async function acquireRequestSlot(): Promise<void> {
	if (activeRequests < concurrentLimit) {
		activeRequests += 1;
		return;
	}

	await new Promise<void>((resolve) => {
		waitQueue.push(() => {
			activeRequests += 1;
			resolve();
		});
	});
}

function releaseRequestSlot(): void {
	activeRequests = Math.max(0, activeRequests - 1);
	const next = waitQueue.shift();
	if (next) {
		next();
	}
}

export async function runWithAIRequestSlot<T>(task: () => Promise<T>): Promise<T> {
	await acquireRequestSlot();
	try {
		return await task();
	} finally {
		releaseRequestSlot();
	}
}

export async function withAIRequestTimeout<T>(
	task: () => Promise<T>,
	timeoutMs: number = requestTimeoutMs
): Promise<T> {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return task();
	}

	let timeoutHandle: WeaveTimerHandle | undefined;
	try {
		return await Promise.race([
			task(),
			new Promise<T>((_, reject) => {
				timeoutHandle = window.setTimeout(() => {
					reject(new Error("timeout"));
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeoutHandle !== undefined) {
			window.clearTimeout(timeoutHandle);
		}
	}
}
