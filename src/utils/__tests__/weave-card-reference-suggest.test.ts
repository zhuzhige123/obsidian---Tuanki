vi.mock("@codemirror/autocomplete", () => ({
	CompletionContext: class CompletionContext {},
	autocompletion: () => ({}),
	completionKeymap: [],
}));

vi.mock("@codemirror/lang-markdown", () => ({
	markdown: () => ({}),
}));

vi.mock("@codemirror/search", () => ({
	searchKeymap: [],
}));

vi.mock("@codemirror/state", () => ({
	EditorSelection: class EditorSelection {},
	EditorState: class EditorState {},
	Prec: { highest: <T>(value: T) => value },
}));

vi.mock("@codemirror/view", () => ({
	Decoration: class Decoration {},
	EditorView: class EditorView {},
	keymap: { of: <T>(value: T) => value },
}));

vi.mock("obsidian", () => {
	class EditorSuggest<T> {
		app: any;
		context: any = null;

		constructor(app: any) {
			this.app = app;
		}

		open(): void {}

		close(): void {}
	}

	EditorSuggest.prototype.open = vi.fn();
	EditorSuggest.prototype.close = vi.fn();

	class MarkdownView {}
	class TFile {
		path = "";
	}
	class Editor {}
	class App {}

	return {
		App,
		Editor,
		EditorSuggest,
		MarkdownView,
		TFile,
		normalizePath: (value: string) => value.replace(/\\/g, "/"),
	};
});

import { TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { WeaveCardReferenceSuggest, WeaveTagSuggest } from "../obsidian-suggest";
import { buildWeaveCardReferenceToken } from "../weave-card-reference";

function createDetachedFile(): TFile {
	const file = new TFile();
	file.path = "weave/editor/weave-editor-123.md";
	return file;
}

function createMarkdownFile(path = "notes/demo.md"): TFile {
	const file = new TFile();
	file.path = path;
	return file;
}

describe("WeaveCardReferenceSuggest", () => {
	function createApp() {
		return {
			workspace: {
				getActiveViewOfType: vi.fn(() => null),
			},
		} as any;
	}

	it("writes the canonical @_uuid token back into the triggering detached editor", () => {
		const editor = {
			getLine: vi.fn(() => "关联 @_kap"),
			replaceRange: vi.fn(),
			cm: { composing: false },
		};
		const file = createDetachedFile();
		const app = createApp();
		const plugin: any = {
			dataStorage: null,
		};
		const suggest = new WeaveCardReferenceSuggest(app, plugin);
		const cursor = { line: 0, ch: "关联 @_kap".length };
		const trigger = suggest.onTrigger(cursor, editor as any, file as any);

		expect(trigger).toEqual({
			start: { line: 0, ch: 3 },
			end: cursor,
			query: "kap",
		});

		suggest.context = {
			...trigger,
			editor: editor as any,
			file,
		} as any;
		suggest.selectSuggestion(
			{
				card: { uuid: "tk-matem58cpza3" } as any,
				label: "示例",
				preview: "预览",
			},
			{} as MouseEvent
		);

		expect(editor.replaceRange).toHaveBeenCalledWith(
			buildWeaveCardReferenceToken("tk-matem58cpza3"),
			{ line: 0, ch: 3 },
			cursor
		);
	});

	it("suppresses trigger and suggestion refresh while the editor is composing IME text", async () => {
		const editor = {
			getLine: vi.fn(() => "关联 @_ce"),
			replaceRange: vi.fn(),
			cm: { composing: true },
		};
		const suggest = new WeaveCardReferenceSuggest(createApp(), {
			dataStorage: {
				getCards: vi.fn(async () => [
					{ uuid: "tk-1", content: "测试内容" },
				]),
			},
		} as any);

		const trigger = suggest.onTrigger(
			{ line: 0, ch: "关联 @_ce".length },
			editor as any,
			createDetachedFile() as any
		);

		expect(trigger).toBeNull();

		const suggestions = await suggest.getSuggestions({
			query: "测试",
			editor: editor as any,
			file: createDetachedFile(),
			start: { line: 0, ch: 3 },
			end: { line: 0, ch: 7 },
		} as any);

		expect(suggestions).toEqual([]);
	});

	it("supports committed Chinese text as the @_ search query after IME composition ends", () => {
		const editor = {
			getLine: vi.fn(() => "关联 @_测试"),
			replaceRange: vi.fn(),
			cm: { composing: false },
		};
		const suggest = new WeaveCardReferenceSuggest(createApp(), { dataStorage: null } as any);
		const cursor = { line: 0, ch: "关联 @_测试".length };

		const trigger = suggest.onTrigger(cursor, editor as any, createDetachedFile() as any);

		expect(trigger).toEqual({
			start: { line: 0, ch: 3 },
			end: cursor,
			query: "测试",
		});
	});

	it("does not trigger the suggest list when the cursor is inside an existing @_uuid token", () => {
		const editor = {
			getLine: vi.fn(() => "关联 @_tk-mrew37veqy44|测试"),
			replaceRange: vi.fn(),
			cm: { composing: false },
		};
		const suggest = new WeaveCardReferenceSuggest(createApp(), { dataStorage: null } as any);

		const trigger = suggest.onTrigger(
			{ line: 0, ch: "关联 @_tk-mrew37veqy44|测试".indexOf("tk-mrew37veqy44") + 3 },
			editor as any,
			createMarkdownFile() as any
		);

		expect(trigger).toBeNull();
	});
});

describe("WeaveTagSuggest", () => {
	function createApp() {
		return {
			workspace: {
				getActiveViewOfType: vi.fn(() => null),
			},
		} as any;
	}

	it("writes the selected #tag back into the triggering detached editor", () => {
		const editor = {
			getLine: vi.fn(() => "标签 #心"),
			replaceRange: vi.fn(),
			cm: { composing: false },
		};
		const suggest = new WeaveTagSuggest(createApp(), { dataStorage: null } as any);
		const cursor = { line: 0, ch: "标签 #心".length };
		const trigger = suggest.onTrigger(cursor, editor as any, createDetachedFile() as any);

		expect(trigger).toEqual({
			start: { line: 0, ch: 3 },
			end: cursor,
			query: "心",
		});

		suggest.context = {
			...trigger,
			editor: editor as any,
			file: createDetachedFile(),
		} as any;
		suggest.selectSuggestion(
			{
				tag: "心血管",
				usageCount: 2,
			},
			{} as MouseEvent
		);

		expect(editor.replaceRange).toHaveBeenCalledWith(
			"#心血管",
			{ line: 0, ch: 3 },
			cursor
		);
	});

	it("returns plugin card tags when only # is typed", async () => {
		const editor = {
			getLine: vi.fn(() => "标签 #"),
			replaceRange: vi.fn(),
			cm: { composing: false },
		};
		const suggest = new WeaveTagSuggest(createApp(), {
			dataStorage: {
				getCards: vi.fn(async () => [
					{ uuid: "card-1", content: "正文 #心血管", tags: ["医学"] },
					{ uuid: "card-2", content: "正文 #心血管 #解剖", tags: ["医学"] },
				]),
			},
		} as any);

		const trigger = suggest.onTrigger(
			{ line: 0, ch: "标签 #".length },
			editor as any,
			createDetachedFile() as any
		);

		expect(trigger).toEqual({
			start: { line: 0, ch: 3 },
			end: { line: 0, ch: 4 },
			query: "",
		});

		const suggestions = await suggest.getSuggestions({
			query: "",
			editor: editor as any,
			file: createDetachedFile(),
			start: { line: 0, ch: 3 },
			end: { line: 0, ch: 4 },
		} as any);

		expect(suggestions).toEqual([
			{ tag: "心血管", usageCount: 2 },
			{ tag: "医学", usageCount: 2 },
			{ tag: "解剖", usageCount: 1 },
		]);
	});

	it("merges Obsidian markdown tag cache with plugin card tags", async () => {
		const editor = {
			getLine: vi.fn(() => "标签 #生"),
			replaceRange: vi.fn(),
			cm: { composing: false },
		};
		const suggest = new WeaveTagSuggest({
			workspace: {
				getActiveViewOfType: vi.fn(() => null),
			},
			metadataCache: {
				getTags: vi.fn(() => ({
					"#生物": 4,
					"#生理": 2,
				})),
				getFileCache: vi.fn(() => null),
			},
			vault: {
				getMarkdownFiles: vi.fn(() => []),
			},
		} as any, {
			dataStorage: {
				getCards: vi.fn(async () => [
					{ uuid: "card-1", content: "正文 #生物", tags: ["生化"] },
				]),
			},
		} as any);

		const suggestions = await suggest.getSuggestions({
			query: "生",
			editor: editor as any,
			file: createDetachedFile(),
			start: { line: 0, ch: 3 },
			end: { line: 0, ch: 5 },
		} as any);

		expect(suggestions).toEqual([
			{ tag: "生物", usageCount: 5 },
			{ tag: "生理", usageCount: 2 },
			{ tag: "生化", usageCount: 1 },
		]);
	});
});
