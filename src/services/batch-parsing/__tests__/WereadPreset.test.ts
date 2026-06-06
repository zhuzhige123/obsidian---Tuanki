import { RegexCardParser } from "../RegexCardParser";
import {
	cloneOfficialPresetConfig,
	getPreset,
	normalizeRegexParsingConfig,
} from "../RegexPresets";

const WEREAD_SAMPLE = `## 夜晚的潜水艇

> 📌 1966年一个寒夜，博尔赫斯站在轮船甲板上，往海中丢了一枚硬币。
> ⏱ 2024-04-02 11:33:39 ^3300059686-18-1115-1265

> 📌 想象这回事，就像顺水推舟，难的只是把舟从岸上拖进水里。
> ⏱ 2024-04-02 11:41:59 ^3300059686-18-4958-5019`;

describe("Weread preset", () => {
	it("preserves highlight on front and timestamp metadata on back", () => {
		const config = cloneOfficialPresetConfig("weread-default")!;
		const parser = new RegexCardParser({} as any);
		const result = parser.parseContentPreview(WEREAD_SAMPLE, config);

		expect(result.success).toBe(true);
		expect(result.cards.length).toBe(2);

		expect(result.cards[0].front).toContain("1966年");
		expect(result.cards[0].back).toContain("2024-04-02");
		expect(result.cards[0].back).toContain("^3300059686-18-1115-1265");

		expect(result.cards[1].front).toContain("想象这回事");
		expect(result.cards[1].back).toContain("^3300059686-18-4958-5019");
	});

	it("migrates legacy weread regex that dropped timestamp metadata", () => {
		const legacyPattern =
			"^>\\s*\\u{1F4CC}\\s*([\\s\\S]*?)\\r?\\n>\\s*\\u23F1\\uFE0F?\\s*[^\\r\\n]+()$";
		const normalized = normalizeRegexParsingConfig({
			name: "微信读书（Weread 默认）",
			mode: "pattern",
			patternMode: {
				cardPattern: legacyPattern,
				flags: "gmu",
				captureGroups: { front: 1, back: 2 },
			},
			uuidLocation: "inline",
			excludeTags: [],
			autoAddUUID: true,
			syncMethod: "tag-based",
		});

		const parser = new RegexCardParser({} as any);
		const result = parser.parseContentPreview(WEREAD_SAMPLE, normalized);

		expect(result.cards[0].back).toContain("2024-04-02");
		expect(result.cards[0].back).toContain("^3300059686");
	});

	it("matches official example document", () => {
		const config = cloneOfficialPresetConfig("weread-default")!;
		const example = getPreset("weread-default")!.example;
		const parser = new RegexCardParser({} as any);
		const result = parser.parseContentPreview(example, config);

		expect(result.success).toBe(true);
		expect(result.cards.length).toBeGreaterThanOrEqual(2);
		expect(result.cards.every((card) => card.back.length > 0)).toBe(true);
	});
});
