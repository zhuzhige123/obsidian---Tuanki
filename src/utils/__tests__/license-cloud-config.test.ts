import { describe, expect, it } from "vitest";
import {
	isCloudLicenseConfigured,
	LICENSE_CLOUD_REVALIDATION_DAYS,
} from "../../config/license-cloud-config";

describe("license-cloud-config", () => {
	it("treats empty base url as not configured", () => {
		expect(isCloudLicenseConfigured()).toBe(false);
	});

	it("uses 7-day revalidation interval constant", () => {
		expect(LICENSE_CLOUD_REVALIDATION_DAYS).toBe(7);
	});
});
