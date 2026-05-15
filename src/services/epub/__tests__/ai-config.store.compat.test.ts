import { afterEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import {
	aiConfigStore,
	customActionsForMenu,
} from "../../../stores/ai-config.store";

describe("AI config store compatibility for EPUB AI split menus", () => {
	afterEach(() => {
		aiConfigStore.destroy();
	});

	it("normalizes legacy custom split actions so EPUB menus can still see them", () => {
		const plugin = {
			settings: {
				aiConfig: {
					apiKeys: {},
					defaultProvider: "zhipu",
					customFormatActions: [],
					customSplitActions: [
						{
							id: "legacy-split-1",
							name: "旧版自定义拆分",
							systemPrompt: "system",
							userPromptTemplate: "user",
							splitConfig: {
								targetCount: 3,
								splitStrategy: "knowledge-point",
								outputFormat: "qa",
							},
							enabled: true,
						},
					],
				},
			},
			saveSettings: async () => undefined,
		};

		aiConfigStore.initialize(plugin as any);

		const state = aiConfigStore.getState();
		expect(state.customSplitActions).toHaveLength(1);
		expect(state.customSplitActions[0]).toMatchObject({
			id: "legacy-split-1",
			type: "split",
			category: "custom",
		});
		expect(get(customActionsForMenu).split.map((action) => action.id)).toEqual(["legacy-split-1"]);
	});
});
