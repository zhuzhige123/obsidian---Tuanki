import {
	checkInputClozeAnswers,
	extractInputClozeAnswers,
	isInputClozeQuestionContent,
	normalizeInputClozeAnswer,
} from "../input-cloze-utils";
import { setGlobalClozeDelimiterSettings } from "../../cloze-syntax";

describe("input-cloze-utils", () => {
	afterEach(() => {
		setGlobalClozeDelimiterSettings({
			enabled: true,
			openDelimiter: "==",
			closeDelimiter: "==",
			placeholder: "[...]",
		});
	});

	it("recognizes #input cloze cards for question bank mode", () => {
		const content = [
			"---",
			"tags:",
			"  - input",
			"---",
			"",
			"法国首都是 ==Paris==，流经市区的是 {{c1::Seine::河流}}。",
		].join("\n");

		expect(isInputClozeQuestionContent(content)).toBe(true);
	});

	it("extracts inline and anki cloze answers in source order", () => {
		const content = "法国首都是 ==Paris==，流经市区的是 {{c1::Seine::河流}}。";

		expect(extractInputClozeAnswers(content)).toEqual(["Paris", "Seine"]);
	});

	it("extracts answers using the active custom delimiter pair only", () => {
		setGlobalClozeDelimiterSettings({
			enabled: true,
			openDelimiter: "[[",
			closeDelimiter: "]]",
			placeholder: "[...]",
		});

		const content = "法国首都是 [[Paris]]，旧写法 ==Legacy== 不应再被提取。";

		expect(extractInputClozeAnswers(content)).toEqual(["Paris"]);
	});

	it("normalizes width, spacing, and case when checking answers", () => {
		expect(normalizeInputClozeAnswer(" ＰａＲｉｓ   City ")).toBe("paris city");
		expect(checkInputClozeAnswers([" paris ", "ＳＥＩＮＥ"], ["Paris", "Seine"])).toBe(true);
	});

	it("keeps answer order strict for multi-blank input cloze questions", () => {
		expect(checkInputClozeAnswers(["Seine", "Paris"], ["Paris", "Seine"])).toBe(false);
	});
});
