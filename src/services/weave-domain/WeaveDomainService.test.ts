import { WeaveDomainService } from "./WeaveDomainService";

describe("WeaveDomainService", () => {
	it("exposes capability info", () => {
		const plugin = {
			manifest: { version: "0.8.6" },
			dataStorage: {},
		} as any;
		const service = new WeaveDomainService(plugin);
		const info = service.getInfo();
		expect(info.apiVersion).toBe("1");
		expect(info.capabilities.deleteCards).toBe(true);
	});

	it("routes createCard to dataStorage.addCard", async () => {
		const card = { uuid: "card-1" };
		const addCard = vi.fn(async () => ({ success: true, data: card, timestamp: "" }));
		const plugin = {
			manifest: { version: "0.8.6" },
			dataStorage: { addCard },
		} as any;
		const service = new WeaveDomainService(plugin);

		const result = await service.createCard({
			card: { uuid: "card-2", content: "x" } as any,
		});

		expect(addCard).toHaveBeenCalledTimes(1);
		expect(result.success).toBe(true);
		expect(result.card?.uuid).toBe("card-1");
	});

	it("maps deleteCards batch failures", async () => {
		const deleteCards = vi.fn(async () => ({
			deleted: [],
			failed: [{ uuid: "bad", error: "boom" }],
		}));
		const plugin = {
			manifest: { version: "0.8.6" },
			dataStorage: { deleteCards },
		} as any;
		const service = new WeaveDomainService(plugin);

		const result = await service.deleteCards({ cardIds: ["bad"] });
		expect(result.success).toBe(false);
		expect(result.failed).toHaveLength(1);
	});
});
