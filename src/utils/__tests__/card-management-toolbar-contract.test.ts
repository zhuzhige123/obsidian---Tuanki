import {
	CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS,
	CARD_MANAGEMENT_TOOLBAR_HANDLED_ACTIONS,
} from "../card-management-toolbar-contract";

describe("card-management-toolbar-contract", () => {
	it("keeps every dispatched action handled by the card management page", () => {
		const unhandled = CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS.filter(
			(action) =>
				!(CARD_MANAGEMENT_TOOLBAR_HANDLED_ACTIONS as readonly string[]).includes(action)
		);

		expect(unhandled).toEqual([]);
	});

	it("does not declare handled actions that are never dispatched", () => {
		const orphanHandled = CARD_MANAGEMENT_TOOLBAR_HANDLED_ACTIONS.filter(
			(action) =>
				!(CARD_MANAGEMENT_TOOLBAR_DISPATCH_ACTIONS as readonly string[]).includes(action)
		);

		expect(orphanHandled).toEqual([]);
	});
});
