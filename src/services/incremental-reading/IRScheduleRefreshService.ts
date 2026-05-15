import type { App } from "obsidian";
import { logger } from "../../utils/logger";
import { getSharedIRWorkspaceSnapshotService } from "./IRWorkspaceSnapshotService";
import {
	getSharedIRScheduleKernel,
	IRScheduleKernel,
	type RecomputeOptions,
	type ScheduleRecomputeReason,
} from "./IRScheduleKernel";

export const IR_DATA_UPDATED_EVENT = "Weave:ir-data-updated";

export type UpdatedEventDetail = {
	reason: ScheduleRecomputeReason;
	generatedAt: number;
	deckIds?: string[];
};

const kernelByApp = new WeakMap<App, IRScheduleKernel>();

function getKernel(app: App): IRScheduleKernel {
	let kernel = kernelByApp.get(app);
	if (!kernel) {
		kernel = getSharedIRScheduleKernel(app);
		kernelByApp.set(app, kernel);
	}
	return kernel;
}

function dispatchIRDataUpdatedEvent(detail: UpdatedEventDetail): UpdatedEventDetail {
	window.dispatchEvent(
		new CustomEvent<UpdatedEventDetail>(IR_DATA_UPDATED_EVENT, {
			detail,
		})
	);
	return detail;
}

export function broadcastIRDataUpdated(
	app: App,
	options?: {
		reason?: ScheduleRecomputeReason;
		generatedAt?: number;
		deckIds?: string[];
		invalidateScheduleCache?: boolean;
	}
): UpdatedEventDetail {
	getSharedIRWorkspaceSnapshotService(app).invalidate();
	if (options?.invalidateScheduleCache !== false) {
		getKernel(app).invalidateScheduleCache();
	}

	return dispatchIRDataUpdatedEvent({
		reason: options?.reason ?? "ui_refresh",
		generatedAt: options?.generatedAt ?? Date.now(),
		deckIds: options?.deckIds,
	});
}

export async function recomputeAndBroadcastIRData(
	app: App,
	reason: ScheduleRecomputeReason,
	options?: RecomputeOptions
): Promise<UpdatedEventDetail> {
	try {
		getSharedIRWorkspaceSnapshotService(app).invalidate();
		const kernel = getKernel(app);
		kernel.invalidateScheduleCache();
		const schedule = await kernel.recomputeScheduleForDeck(reason, options);
		const detail: UpdatedEventDetail = {
			reason,
			generatedAt: schedule.generatedAt,
			deckIds: schedule.deckIds,
		};
		return dispatchIRDataUpdatedEvent(detail);
	} catch (error) {
		getSharedIRWorkspaceSnapshotService(app).invalidate();
		logger.error("[IRScheduleRefreshService] 重排并广播失败:", { reason, options, error });
		const detail: UpdatedEventDetail = {
			reason,
			generatedAt: Date.now(),
			deckIds: options?.deckIds,
		};
		return dispatchIRDataUpdatedEvent(detail);
	}
}
