import { describe, expect, it } from "vitest";

import { FieldSideResolver } from "./FieldSideResolver";

describe("FieldSideResolver", () => {
	it("does not hang when templates contain special Anki tags", () => {
		const resolver = new FieldSideResolver();
		const model = {
			id: 1,
			name: "Basic",
			type: 0,
			css: "",
			flds: [
				{ name: "Front", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20 },
				{ name: "Back", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20 },
			],
			tmpls: [
				{
					name: "Card 1",
					ord: 0,
					qfmt: "{{#Front}}{{Front}}{{/Front}}",
					afmt: "{{FrontSide}}<hr id=answer>{{type:Back}} {{Back}}",
				},
			],
		} as const;

		const result = resolver.resolve([model as any]);

		expect(result[1]).toEqual({
			Front: "front",
			Back: "back",
		});
	});
});
