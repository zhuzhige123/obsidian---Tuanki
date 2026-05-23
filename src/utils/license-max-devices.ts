import { LICENSE_CLOUD_MAX_DEVICES } from "../config/license-cloud-config";

/**
 * 早期激活码可能内嵌 maxDevices=3；与云端一致，统一按 5 台设备展示与校验。
 */
export function normalizeLicenseMaxDevices(value?: number): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		return LICENSE_CLOUD_MAX_DEVICES;
	}
	if (n < LICENSE_CLOUD_MAX_DEVICES) {
		return LICENSE_CLOUD_MAX_DEVICES;
	}
	return Math.min(n, LICENSE_CLOUD_MAX_DEVICES);
}
