import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it } from "vitest";
import { createWeaveCardReferenceEditorExtension } from "../WeaveCardReferenceEditorExtension";

describe("WeaveCardReferenceEditorExtension", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("replaces aliased references with compact @_别名 display outside the active cursor range", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const view = new EditorView({
			state: EditorState.create({
				doc: "前文 @_tk-m7mypvbtdskh|别名 后文",
				extensions: [createWeaveCardReferenceEditorExtension({} as any)],
			}),
			parent: host,
		});

		await Promise.resolve();

		expect(host.querySelector(".cm-weave-card-reference-alias")?.textContent).toBe("@_别名");
		expect(host.textContent).toContain("前文 @_别名 后文");

		view.dispatch({
			selection: EditorSelection.cursor("前文 @_tk-m7mypvbtdskh|别名 后文".indexOf("|") + 1),
		});
		await Promise.resolve();

		expect(host.querySelector(".cm-weave-card-reference-alias")).toBeNull();
		expect(host.textContent).toContain("@_tk-m7mypvbtdskh|别名");
		view.destroy();
	});
});
