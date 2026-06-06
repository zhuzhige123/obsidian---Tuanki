/**
 * 有限并发执行任务，避免在 Obsidian 主线程上无节制并行导致卡顿。
 */
export async function runTasksWithConcurrency<T>(
	tasks: Array<() => Promise<T>>,
	concurrency: number
): Promise<T[]> {
	if (tasks.length === 0) {
		return [];
	}

	const limit = Math.max(1, Math.min(concurrency, tasks.length));
	const results = new Array<T>(tasks.length);
	let nextIndex = 0;

	async function runWorker(): Promise<void> {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= tasks.length) {
				return;
			}

			results[currentIndex] = await tasks[currentIndex]();
		}
	}

	await Promise.all(Array.from({ length: limit }, () => runWorker()));
	return results;
}
