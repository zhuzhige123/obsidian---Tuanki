import { describe, expect, it } from "vitest";
import { getAttachmentRegistryAutoFixIssueCount } from "../attachment-registry-issues";

describe("getAttachmentRegistryAutoFixIssueCount", () => {
	it("counts only rewritable paths and stale registry", () => {
		expect(
			getAttachmentRegistryAutoFixIssueCount({
				rewritablePaths: [{ rawPath: "a.png", canonicalPath: "weave/memory/media/a.png" }],
				isRegistryStale: true,
			})
		).toBe(2);
	});

	it("returns zero when only locally unavailable refs remain", () => {
		expect(
			getAttachmentRegistryAutoFixIssueCount({
				rewritablePaths: [],
				isRegistryStale: false,
			})
		).toBe(0);
	});
});
