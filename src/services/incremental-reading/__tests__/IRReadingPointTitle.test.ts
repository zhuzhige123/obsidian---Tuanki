
import { extractReadingPointDisplayName } from "../IRReadingPointTitle";

describe("extractReadingPointDisplayName", () => {
	it("returns the last hierarchical segment for slash-separated titles", () => {
		expect(
			extractReadingPointDisplayName(
				"第一部分 基础理论 学习时大脑是如何运作的 / 02 遗忘的威力：过滤干扰信息，激活深层的宝藏 / 回想的原相"
			)
		).toBe("回想的原相");
	});

	it("supports full-width slash separators", () => {
		expect(extractReadingPointDisplayName("第一章 ／ 第二节 ／ 具体阅读点")).toBe("具体阅读点");
	});

	it("keeps the original title when there is no hierarchy separator", () => {
		expect(extractReadingPointDisplayName("具体阅读点")).toBe("具体阅读点");
	});
});
