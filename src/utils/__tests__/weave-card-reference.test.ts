import { describe, expect, it } from "vitest";
import {
	buildWeaveCardReferenceDisplayText,
	buildWeaveCardReferenceToken,
	extractWeaveCardReferenceUUIDsFromText,
	findWeaveCardReferenceAtPosition,
	getWeaveCardReferenceTriggerMatch,
	parseWeaveCardReferencesInText,
} from "../weave-card-reference";

describe("weave-card-reference", () => {
	it("parses @_uuid|别名 while keeping uuid as the authoritative reference id", () => {
		const matches = parseWeaveCardReferencesInText("关联 @_tk-m7mypvbtdskh|别名 和 @_tk-plain123");

		expect(matches).toEqual([
			{
				raw: "@_tk-m7mypvbtdskh|别名",
				uuid: "tk-m7mypvbtdskh",
				alias: "别名",
				startIndex: 3,
				endIndex: 23,
			},
			{
				raw: "@_tk-plain123",
				uuid: "tk-plain123",
				alias: null,
				startIndex: 26,
				endIndex: 39,
			},
		]);
	});

	it("extracts uuids from aliased references without letting aliases affect relation parsing", () => {
		expect(
			extractWeaveCardReferenceUUIDsFromText("前文 @_tk-m7mypvbtdskh|别名，后文 @_tk-plain123")
		).toEqual(["tk-m7mypvbtdskh", "tk-plain123"]);
	});

	it("builds canonical storage token with optional alias and compact display text", () => {
		expect(buildWeaveCardReferenceToken("tk-m7mypvbtdskh", "别名")).toBe(
			"@_tk-m7mypvbtdskh|别名"
		);
		expect(
			buildWeaveCardReferenceDisplayText({ uuid: "tk-m7mypvbtdskh", alias: "别名" })
		).toBe("@_别名");
		expect(
			buildWeaveCardReferenceDisplayText({ uuid: "tk-m7mypvbtdskh", alias: null })
		).toBe("@_tk-m7mypvbtdskh");
	});

	it("finds a card reference by cursor position and can distinguish uuid from alias editing", () => {
		const text = "前文 @_tk-m7mypvbtdskh|别名 后文";
		const hitInUuid = findWeaveCardReferenceAtPosition(text, text.indexOf("tk-m7mypvbtdskh") + 2);
		expect(hitInUuid).toMatchObject({
			uuid: "tk-m7mypvbtdskh",
			alias: "别名",
			uuidStartIndex: text.indexOf("tk-m7mypvbtdskh"),
			uuidEndIndex: text.indexOf("tk-m7mypvbtdskh") + "tk-m7mypvbtdskh".length,
		});

		const hitInAlias = findWeaveCardReferenceAtPosition(text, text.indexOf("别名"));
		expect(hitInAlias?.uuid).toBe("tk-m7mypvbtdskh");
		expect(hitInAlias?.aliasStartIndex).toBe(text.indexOf("别名"));

		expect(findWeaveCardReferenceAtPosition(text, 0)).toBeNull();
	});

	it("stops suggest triggering once the user starts editing the alias portion", () => {
		expect(getWeaveCardReferenceTriggerMatch("关联 @_tk-m7mypvbtdskh")).toEqual({
			query: "tk-m7mypvbtdskh",
			startOffset: 3,
		});
		expect(getWeaveCardReferenceTriggerMatch("关联 @_tk-m7mypvbtdskh|别")).toBeNull();
	});
});
