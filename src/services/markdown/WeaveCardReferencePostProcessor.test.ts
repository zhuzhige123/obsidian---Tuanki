import { describe, expect, it } from "vitest";
import { createWeaveCardReferencePostProcessor } from "./WeaveCardReferencePostProcessor";

describe("WeaveCardReferencePostProcessor", () => {
	it("renders aliased references as compact @_别名 while preserving surrounding text", () => {
		const processor = createWeaveCardReferencePostProcessor({} as any);
		const container = document.createElement("div");
		container.innerHTML = "<p>前文 @_tk-m7mypvbtdskh|别名 后文 @_tk-plain123</p>";

		processor(container, {} as any);

		const aliasEl = container.querySelector(".weave-card-reference-display");
		expect(aliasEl).not.toBeNull();
		expect(aliasEl?.textContent).toBe("@_别名");
		expect(aliasEl?.getAttribute("data-weave-card-uuid")).toBe("tk-m7mypvbtdskh");
		expect(container.textContent).toBe("前文 @_别名 后文 @_tk-plain123");
	});

	it("does not rewrite references inside code spans", () => {
		const processor = createWeaveCardReferencePostProcessor({} as any);
		const container = document.createElement("div");
		container.innerHTML = "<p><code>@_tk-m7mypvbtdskh|别名</code></p>";

		processor(container, {} as any);

		expect(container.querySelector(".weave-card-reference-display")).toBeNull();
		expect(container.textContent).toBe("@_tk-m7mypvbtdskh|别名");
	});
});
