import { describe, expect, it, vi } from "vitest";
import { CardRelationService } from "../relation/CardRelationService";

describe("CardRelationService", () => {
	it("loads child cards by relationMetadata childCardIds before any full scan", async () => {
		const parentCard = {
			uuid: "parent-1",
			relationMetadata: {
				childCardIds: ["child-2", "child-1"],
			},
		} as any;
		const child1 = {
			uuid: "child-1",
			parentCardId: "parent-1",
			content: "A",
		} as any;
		const child2 = {
			uuid: "child-2",
			parentCardId: "parent-1",
			content: "B",
		} as any;
		const dataStorage = {
			getCardByUUID: vi.fn(async () => parentCard),
			getCardsByUUIDs: vi.fn(async () => [child2, child1]),
			getAllCards: vi.fn(async () => {
				throw new Error("should not scan all cards");
			}),
		} as any;
		const service = new CardRelationService(dataStorage);

		const children = await service.getChildCards("parent-1");

		expect(children.map((card: any) => card.uuid)).toEqual(["child-2", "child-1"]);
		expect(dataStorage.getCardByUUID).toHaveBeenCalledWith("parent-1");
		expect(dataStorage.getCardsByUUIDs).toHaveBeenCalledWith(["child-2", "child-1"]);
		expect(dataStorage.getAllCards).not.toHaveBeenCalled();
	});
});
