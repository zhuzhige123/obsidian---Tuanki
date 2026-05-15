import { describe, expect, it } from "vitest";
import {
	getCanvasNodeIdFromSourceLink,
	getCanvasLocateSupportFromCardContent,
	getCanvasSourceNodeRectFromCardContent,
	getCanvasSourceNodeRectFromSourceLink,
	getCanvasTextCandidatesFromCardContent,
	getCanvasTextCandidatesFromText,
	normalizeCanvasNodeId,
} from "./canvas-source-locate";

describe("canvas-source-locate", () => {
	it("normalizes canvas node ids from mixed source formats", () => {
		expect(normalizeCanvasNodeId("canvas:node-1?x=10&y=20")).toBe("node-1");
		expect(normalizeCanvasNodeId("^node-2")).toBe("node-2");
		expect(normalizeCanvasNodeId(" node-3 ")).toBe("node-3");
		expect(normalizeCanvasNodeId("")).toBeUndefined();
	});

	it("extracts canvas node id and rect directly from source links", () => {
		const sourceLink = '[[boards/topic.canvas#^node-9?x=12&y=34&w=56&h=78|节点]]';

		expect(getCanvasNodeIdFromSourceLink(sourceLink)).toBe("node-9");
		expect(getCanvasSourceNodeRectFromSourceLink(sourceLink)).toEqual({
			x: 12,
			y: 34,
			width: 56,
			height: 78,
		});
	});

	it("extracts canvas node rect from we_source query parameters", () => {
		const content = `---
we_source: '[[boards/topic.canvas#^node-1?x=120&y=240&w=360&h=180]]'
---
正文`;

		expect(getCanvasSourceNodeRectFromCardContent(content)).toEqual({
			x: 120,
			y: 240,
			width: 360,
			height: 180,
		});
	});

	it("builds stable canvas text candidates from raw text", () => {
		const text = `第一条候选文本需要足够长才会被纳入
第二条候选文本同样要满足长度要求
短行
第三条候选文本也应该被保留`;

		expect(getCanvasTextCandidatesFromText(text)).toEqual([
			"第一条候选文本需要足够长才会被纳入",
			"第二条候选文本同样要满足长度要求",
			"第三条候选文本也应该被保留",
		]);
	});

	it("builds stable canvas text candidates from card body", () => {
		const content = `---
we_source: '[[boards/topic.canvas#^node-1]]'
---
> 第一条候选文本需要足够长才会被纳入
> 第二条候选文本同样要满足长度要求
短行
第三条候选文本也应该被保留
第四条候选文本应该被截断掉`;

		expect(getCanvasTextCandidatesFromCardContent(content)).toEqual([
			"第一条候选文本需要足够长才会被纳入",
			"第二条候选文本同样要满足长度要求",
			"第三条候选文本也应该被保留",
		]);
	});

	it("returns unified locate support payload", () => {
		const content = `---
we_source:
  - '[[notes/source.md]]'
  - '[[boards/topic.canvas#^node-9?x=12&y=34&w=56&h=78]]'
---
这里是一段足够长的候选文本，用于定位 canvas 节点`;

		expect(getCanvasLocateSupportFromCardContent(content)).toEqual({
			rawWeSource: '[[boards/topic.canvas#^node-9?x=12&y=34&w=56&h=78]]',
			nodeRect: { x: 12, y: 34, width: 56, height: 78 },
			textCandidates: ["这里是一段足够长的候选文本，用于定位 canvas 节点"],
		});
	});
});
