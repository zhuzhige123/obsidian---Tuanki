import type { App } from "obsidian";

/**
 * 跨插件协作事件：Weave 记忆学习会话是否占用主线程敏感路径。
 * 独立增量阅读等插件可监听此事件，在学习期间推迟全库扫描与调度重算。
 */
export const WEAVE_MEMORY_STUDY_SESSION_EVENT = "Weave:memory-study-session";

/** 与 `StudyView.VIEW_TYPE_STUDY` 保持一致。 */
export const WEAVE_STUDY_VIEW_TYPE = "weave-study-view";

export type WeaveMemoryStudySessionDetail = {
	active: boolean;
};

export function syncWeaveMemoryStudySessionBroadcast(app: App): void {
	const active = app.workspace.getLeavesOfType(WEAVE_STUDY_VIEW_TYPE).length > 0;
	window.dispatchEvent(
		new CustomEvent<WeaveMemoryStudySessionDetail>(WEAVE_MEMORY_STUDY_SESSION_EVENT, {
			detail: { active },
		})
	);
}
