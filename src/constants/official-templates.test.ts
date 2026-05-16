import { getOfficialTemplateById } from "./official-templates";
import { setGlobalClozeDelimiterSettings } from "../utils/cloze-syntax";

describe("official-templates", () => {
	afterEach(() => {
		setGlobalClozeDelimiterSettings({
			enabled: true,
			openDelimiter: "==",
			closeDelimiter: "==",
			placeholder: "[...]",
		});
	});

	it("returns an official cloze template pattern that follows the active delimiter pair", () => {
		setGlobalClozeDelimiterSettings({
			enabled: true,
			openDelimiter: "[[",
			closeDelimiter: "]]",
			placeholder: "[...]",
		});

		const template = getOfficialTemplateById("official-cloze");
		const clozeField = template?.fields?.find((field) => field.name === "Cloze");
		expect(clozeField).toBeDefined();

		const regex = new RegExp(clozeField?.pattern || "", clozeField?.flags || "");
		expect(regex.test("法国首都是 [[Paris]]。")) .toBe(true);
		regex.lastIndex = 0;
		expect(regex.test("法国首都是 ==Paris==。")) .toBe(false);
	});
});
