import {
	isCloudLicenseConfigured,
	LICENSE_CLOUD_REVALIDATION_DAYS,
} from "../../config/license-cloud-config";

describe("license-cloud-config", () => {
	it("detects configured production cloud license endpoint", () => {
		expect(isCloudLicenseConfigured()).toBe(true);
	});

	it("uses 7-day revalidation interval constant", () => {
		expect(LICENSE_CLOUD_REVALIDATION_DAYS).toBe(7);
	});
});
