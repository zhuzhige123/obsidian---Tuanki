import { isCallable, readUnknownNumber, readUnknownProperty, readUnknownString } from "./dynamic-access";
import { isRecord } from "./typed-json";

export type CanvasNodeData = {
	id?: string;
	text?: string;
	file?: string;
	label?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
};

export type CanvasNodeLike = {
	id?: string;
	text?: string;
	file?: string;
	label?: string;
	nodeEl?: HTMLElement;
	contentEl?: HTMLElement;
	containerEl?: HTMLElement;
	el?: HTMLElement;
	unknownData?: CanvasNodeData;
	getData?: () => CanvasNodeData;
};

export type CanvasControllerLike = {
	nodes?: Map<string, CanvasNodeLike>;
	selectOnly?: (node: CanvasNodeLike) => void;
	zoomToSelection?: () => void;
};

export function asCanvasNode(node: unknown): CanvasNodeLike | null {
	return isRecord(node) ? node : null;
}

export function getCanvasController(view: unknown): CanvasControllerLike | null {
	const canvas = readUnknownProperty(view, "canvas");
	return isRecord(canvas) ? canvas : null;
}

export function getCanvasNodes(view: unknown): CanvasNodeLike[] {
	const canvas = getCanvasController(view);
	const nodesMap = canvas?.nodes;
	if (!(nodesMap instanceof Map)) {
		return [];
	}
	return Array.from(nodesMap.values())
		.map((node) => asCanvasNode(node))
		.filter((node): node is CanvasNodeLike => node !== null);
}

export function getCanvasNodeData(node: CanvasNodeLike): CanvasNodeData {
	if (isCallable(node.getData)) {
		const data = node.getData();
		return isRecord(data) ? data : {};
	}
	return node;
}

export function getCanvasNodeId(node: CanvasNodeLike): string | undefined {
	const data = getCanvasNodeData(node);
	return readUnknownString(node, "id") ?? data.id;
}

export function getCanvasNodeElement(node: CanvasNodeLike): HTMLElement | undefined {
	for (const key of ["nodeEl", "contentEl", "containerEl", "el"] as const) {
		const el = node[key];
		if (el instanceof HTMLElement) {
			return el;
		}
	}
	return undefined;
}

export function buildCanvasNodeSearchText(node: CanvasNodeLike): string {
	const data = getCanvasNodeData(node);
	const values = [
		getCanvasNodeId(node),
		data.id,
		readUnknownString(node, "text"),
		data.text,
		readUnknownString(node, "file"),
		data.file,
		readUnknownString(node, "label"),
		data.label,
		node.unknownData?.text,
		node.unknownData?.file,
	];
	return values
		.map((value) => String(value || "").trim())
		.filter(Boolean)
		.join("\n");
}

export function getCanvasNodeRect(node: CanvasNodeLike): {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
} {
	const data = getCanvasNodeData(node);
	return {
		x: readUnknownNumber(data, "x"),
		y: readUnknownNumber(data, "y"),
		width: readUnknownNumber(data, "width"),
		height: readUnknownNumber(data, "height"),
	};
}

export function selectCanvasNode(view: unknown, node: CanvasNodeLike): void {
	const canvas = getCanvasController(view);
	if (!canvas) {
		return;
	}
	canvas.selectOnly?.(node);
	canvas.zoomToSelection?.();
}
