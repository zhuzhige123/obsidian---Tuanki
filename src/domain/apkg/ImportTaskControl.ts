export function createImportAbortError(message = "导入已取消"): Error {
	const error = new Error(message);
	error.name = "AbortError";
	return error;
}

export function isImportAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

export function throwIfImportAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw createImportAbortError();
	}
}

export async function yieldImportTask(signal?: AbortSignal): Promise<void> {
	throwIfImportAborted(signal);
	await Promise.resolve();
	await new Promise<void>((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => resolve());
			return;
		}

		setTimeout(resolve, 0);
	});
	throwIfImportAborted(signal);
}
