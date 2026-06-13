import { LICENSE_CLOUD_MAX_DEVICES } from "../config/license-cloud-config";
import type { LicenseInfo } from "../types/license";
import { isLegacyWeaveProductId } from "./license-state";

export interface LicenseDeviceStats {
	used: number;
	max: number;
}

export function isWeavePrimaryLicense(license: LicenseInfo | null | undefined): boolean {
	if (!license) {
		return false;
	}

	return (
		isLegacyWeaveProductId(license.issuedProductId) ||
		Boolean(license.entitlements?.includes("weave-premium"))
	);
}

export function getLicenseDeviceStats(
	license: LicenseInfo | null | undefined
): LicenseDeviceStats | null {
	if (!license?.isActivated) {
		return null;
	}

	const max =
		license.cloudSync?.devicesMax ?? license.maxDevices ?? LICENSE_CLOUD_MAX_DEVICES;

	if (typeof license.cloudSync?.devicesUsed === "number") {
		return { used: license.cloudSync.devicesUsed, max };
	}

	if (license.boundEmail) {
		return { used: 1, max };
	}

	return null;
}

export function resolveLicenseDeviceStats(
	license: LicenseInfo | null | undefined
): LicenseDeviceStats | null {
	if (!license?.isActivated) {
		return null;
	}

	return getLicenseDeviceStats(license);
}

export function formatLicenseDeviceStats(stats: LicenseDeviceStats): string {
	return `${stats.used}/${stats.max}`;
}
