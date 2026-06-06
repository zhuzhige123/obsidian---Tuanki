import { RegexCardParser } from "../RegexCardParser";
import {
	OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT,
	cloneOfficialPresetConfig,
	OFFICIAL_QA_REGEX_PRESET_ID,
} from "../RegexPresets";
import type { RegexParsingConfig } from "../../../types/newCardParsingTypes";

describe("RegexCardParser", () => {
	const mockFile = {
		path: "test/qa-cards.md",
	} as any;

	const mockApp = {
		vault: {
			read: async () => OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT,
		},
	} as any;

	it("parseFile reports failure when no cards match", async () => {
		const parser = new RegexCardParser(mockApp);
		const config = cloneOfficialPresetConfig(OFFICIAL_QA_REGEX_PRESET_ID)!;

		mockApp.vault.read = async () => "## 只有标题\n\n没有 Q/A 标记的内容";

		const result = await parser.parseFile(mockFile, config, "preview");

		expect(result.success).toBe(false);
		expect(result.cards).toHaveLength(0);
		expect(result.errors[0]).toContain("未匹配到任何卡片");
	});

	it("parseFile succeeds for official Q&A sample", async () => {
		const parser = new RegexCardParser(mockApp);
		const config = cloneOfficialPresetConfig(OFFICIAL_QA_REGEX_PRESET_ID)!;

		mockApp.vault.read = async () => OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT;

		const result = await parser.parseFile(mockFile, config, "preview");

		expect(result.success).toBe(true);
		expect(result.cards.length).toBe(3);
	});

	it("parseFile reports invalid config when patternMode is missing", async () => {
		const parser = new RegexCardParser(mockApp);
		const config: RegexParsingConfig = {
			name: "broken",
			mode: "pattern",
			uuidLocation: "none",
			excludeTags: [],
			autoAddUUID: false,
			syncMethod: "tag-based",
		};

		mockApp.vault.read = async () => OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT;

		const result = await parser.parseFile(mockFile, config, "preview");

		expect(result.success).toBe(false);
		expect(result.errors[0]).toContain("无效的解析配置");
	});
});
