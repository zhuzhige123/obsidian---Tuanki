/**
 * Weave 宿主侧增量阅读桥接模块（非完整 IR 领域实现）。
 * 调度、日历、材料栈、监控等由独立插件 weave-incremental-reading 负责。
 */

export {
	IR_DATA_UPDATED_EVENT,
	broadcastIRDataUpdated,
	recomputeAndBroadcastIRData,
} from "./IRScheduleRefreshService";
