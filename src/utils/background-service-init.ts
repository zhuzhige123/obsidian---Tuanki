import { logger } from "./logger";

export interface BackgroundInitTask {
	name: string;
	run: () => Promise<void>;
}

/**
 * 并行执行后台初始化任务，逐项记录耗时与失败原因。
 * 不阻塞插件启动主路径；仅在实际失败时输出 warn/error。
 */
export async function runBackgroundInitTasks(
	label: string,
	tasks: BackgroundInitTask[]
): Promise<void> {
	if (tasks.length === 0) {
		return;
	}

	const startTime = Date.now();
	logger.debug(`[Services] 后台初始化开始: ${label} (${tasks.length} 项)`);

	const results = await Promise.allSettled(
		tasks.map(async (task) => {
			const taskStart = Date.now();
			await task.run();
			logger.debug(`[Services] ✅ ${task.name} (${Date.now() - taskStart}ms)`);
		})
	);

	const failedTasks = tasks.filter((_, index) => results[index].status === "rejected");
	const totalDuration = Date.now() - startTime;

	if (failedTasks.length > 0) {
		failedTasks.forEach((task) => {
			const index = tasks.indexOf(task);
			const result = results[index];
			const failureReason =
				result.status === "rejected"
					? result.reason instanceof Error
						? result.reason
						: new Error(String(result.reason))
					: undefined;
			logger.error(`[Services] ❌ ${task.name} 后台初始化失败:`, failureReason);
		});
		logger.warn(
			`[Services] 后台初始化完成 (${label}): ${tasks.length - failedTasks.length}/${tasks.length} 成功, 总耗时 ${totalDuration}ms`
		);
		return;
	}

	logger.info(
		`[Services] 后台初始化完成 (${label}): ${tasks.length}/${tasks.length} 成功, 总耗时 ${totalDuration}ms`
	);
}

/** 启动后台初始化，不阻塞调用方。 */
export function fireBackgroundInitTasks(label: string, tasks: BackgroundInitTask[]): void {
	void runBackgroundInitTasks(label, tasks).catch((error) => {
		logger.error(`[Services] 后台初始化调度异常 (${label}):`, error);
	});
}
