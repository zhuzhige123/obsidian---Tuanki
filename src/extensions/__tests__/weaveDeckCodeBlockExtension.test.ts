import type { WeavePlugin } from "../../main";
import {
	createWeaveDeckCodeBlockExtension,
	findWeaveDeckFenceBlocks,
} from "../../extensions/weaveDeckCodeBlockExtension";

describe("weaveDeckCodeBlockExtension", () => {
	it("finds weave-decks fence blocks in markdown", () => {
		const text = "```weave-decks\n{\"title\":\"Deck\"}\n```";
		expect(findWeaveDeckFenceBlocks(text)).toEqual([
			{
				from: 0,
				to: text.length,
				source: '{"title":"Deck"}\n',
			},
		]);
	});

	it("registers block decorations through a StateField extension", () => {
		const extension = createWeaveDeckCodeBlockExtension({} as WeavePlugin);
		expect(extension).toBeTruthy();
		expect(typeof (extension as { spec?: unknown }).spec).toBe("object");
	});
});
