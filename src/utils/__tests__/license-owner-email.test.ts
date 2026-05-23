import { describe, expect, it } from "vitest";
import {
	assertSubmittedEmailMatchesActivationOwner,
	normalizeLicenseEmail,
	resolveBindEmailForActivation,
} from "../license-owner-email";

describe("license-owner-email", () => {
	it("normalizes submitted email", () => {
		expect(normalizeLicenseEmail("  User@Example.COM ")).toBe("user@example.com");
	});

	it("does not block locally before cloud bind check", () => {
		const result = assertSubmittedEmailMatchesActivationOwner("any@example.com", {
			userId: "user_1760428945541_002",
		});
		expect(result.ok).toBe(true);
	});

	it("first activation binds submitted email", () => {
		const result = resolveBindEmailForActivation("tutaoyuan8@outlook.com", {}, null);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.bindEmail).toBe("tutaoyuan8@outlook.com");
		}
	});

	it("re-activation must use cloud-bound email", () => {
		const result = resolveBindEmailForActivation(
			"tutaoyuan8@outlook.com",
			{},
			{ email: "tutaoyuan8@outlook.com" }
		);
		expect(result.ok).toBe(true);
	});

	it("rejects different email when code already bound", () => {
		const result = resolveBindEmailForActivation(
			"qtutaoyuan8@outlook.com",
			{},
			{ email: "tutaoyuan8@outlook.com" }
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("该激活码已被绑定，请输入正确的邮箱");
			expect(result.error).not.toMatch(/@/);
		}
	});

	it("rejects when cloud record exists but email is empty", () => {
		const result = resolveBindEmailForActivation("any@example.com", {}, { email: "" });
		expect(result.ok).toBe(false);
	});
});
