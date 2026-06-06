import {
	OFFICIAL_QA_REGEX_PRESET_ID,
	OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT,
	cloneOfficialPresetConfig,
	ensureBuiltinRegexPresets,
	getPreset,
	type PresetId,
	normalizeRegexParsingConfig,
	normalizeRegexParsingPresets,
	validateConfig,
} from "../RegexPresets";
import { RegexCardParser } from "../RegexCardParser";
import type { RegexParsingConfig } from "../../../types/newCardParsingTypes";

describe("RegexPresets", () => {
	it("provides official Q&A regex preset with valid pattern config", () => {
		const meta = getPreset(OFFICIAL_QA_REGEX_PRESET_ID);
		expect(meta).toBeDefined();
		expect(meta?.recommended).toBe(true);
		expect(meta?.config.mode).toBe("pattern");
		expect(meta?.config.patternMode?.cardPattern).toContain("Q");

		const validation = validateConfig(meta!.config);
		expect(validation.valid).toBe(true);
	});

	it("seeds official Q&A regex preset when user list is empty", () => {
		const { presets, seeded } = ensureBuiltinRegexPresets([]);
		expect(seeded).toBe(true);
		expect(presets).toHaveLength(1);
		expect(presets[0].id).toBe("official-qa-format");
	});

	it("does not duplicate official preset when already present", () => {
		const official = cloneOfficialPresetConfig(OFFICIAL_QA_REGEX_PRESET_ID)!;
		const { presets, seeded } = ensureBuiltinRegexPresets([official]);
		expect(seeded).toBe(false);
		expect(presets).toHaveLength(1);
	});

	it("parses official Q&A regex sample into multiple cards", () => {
		const config = cloneOfficialPresetConfig(OFFICIAL_QA_REGEX_PRESET_ID)!;
		const parser = new RegexCardParser({} as any);
		const result = parser.parseContentPreview(OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT, config);

		expect(result.success).toBe(true);
		expect(result.cards.length).toBe(3);
		expect(result.cards[0].front).toContain("间隔重复");
		expect(result.cards[0].back.length).toBeGreaterThan(0);
	});

	it("repairs official preset when patternMode is missing", () => {
		const broken: RegexParsingConfig = {
			id: "official-qa-format",
			name: "官方 Q&A 正则模板",
			mode: "pattern",
			uuidLocation: "inline",
			uuidPattern: "<!-- (tk-[a-z0-9]{12}) -->",
			excludeTags: [],
			autoAddUUID: true,
			syncMethod: "tag-based",
		};

		const normalized = normalizeRegexParsingConfig(broken);
		expect(normalized.patternMode?.cardPattern).toContain("Q");
		expect(validateConfig(normalized).valid).toBe(true);
	});

	it("normalizes presets on load and seeds official template", () => {
		const { presets, changed } = normalizeRegexParsingPresets(undefined);
		expect(changed).toBe(true);
		expect(presets.some((preset) => preset.id === "official-qa-format")).toBe(true);
	});

	it("parses heading-based sample with first line as front and body as back", () => {
		const config = cloneOfficialPresetConfig("heading-based" as PresetId)!;
		const parser = new RegexCardParser({} as any);
		const sample = getPreset("heading-based")!.example;
		const result = parser.parseContentPreview(sample, config);

		expect(result.success).toBe(true);
		expect(result.cards.length).toBe(2);
		expect(result.cards[0].front).toBe("什么是卡片？");
		expect(result.cards[0].back).toContain("基本单位");
		expect(result.cards[1].front).toBe("什么是牌组？");
		expect(result.cards[1].back).toContain("集合");
	});

	it("enables firstLineAsFront for heading card separator presets", () => {
		const normalized = normalizeRegexParsingConfig({
			name: "标题分隔模式",
			mode: "separator",
			separatorMode: {
				cardSeparator: "^##\\s+",
				multiline: true,
			},
			uuidLocation: "inline",
			excludeTags: [],
			autoAddUUID: true,
			syncMethod: "tag-based",
		});

		expect(normalized.separatorMode?.firstLineAsFront).toBe(true);
	});
});
