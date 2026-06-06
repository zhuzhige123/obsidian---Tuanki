import {
	ACTIVATION_EMAIL_BOUND_USER_MESSAGE,
	sanitizeCloudLicenseUserMessage,
} from "../activation-privacy";

describe("activation-privacy", () => {
	it("sanitizes legacy server messages that expose bound email", () => {
		const raw = "该激活码已绑定邮箱 tutaoyuan8@outlook.com，请使用已绑定的邮箱激活";
		expect(sanitizeCloudLicenseUserMessage(raw)).toBe(ACTIVATION_EMAIL_BOUND_USER_MESSAGE);
		expect(sanitizeCloudLicenseUserMessage(raw)).not.toMatch(/@/);
	});

	it("keeps unrelated errors unchanged", () => {
		expect(sanitizeCloudLicenseUserMessage("激活码已过期")).toBe("激活码已过期");
	});
});
