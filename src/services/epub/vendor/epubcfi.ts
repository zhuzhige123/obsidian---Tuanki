// @ts-nocheck
// Adapted from foliate-js/epubcfi.js under the MIT license.
// Copyright (c) 2022 John Factotum

const findIndices = (arr, f) =>
	arr.map((x, i, a) => (f(x, i, a) ? i : null)).filter((x) => x != null);

const splitAt = (arr, is) =>
	[-1, ...is, arr.length].reduce(
		({ xs, a }, b) => ({ xs: xs?.concat([arr.slice(a + 1, b)]) ?? [], a: b }),
		{}
	).xs;

const concatArrays = (a, b) =>
	a
		.slice(0, -1)
		.concat([a[a.length - 1].concat(b[0])])
		.concat(b.slice(1));

const isNumber = /\d/;
export const isCFI = /^epubcfi\((.*)\)$/;
const escapeCFI = (str) => str.replace(/[\^[\](),;=]/g, "^$&");

const wrap = (x) => (isCFI.test(x) ? x : `epubcfi(${x})`);
const unwrap = (x) => x.match(isCFI)?.[1] ?? x;
const lift =
	(f) =>
	(...xs) =>
		`epubcfi(${f(...xs.map((x) => x.match(isCFI)?.[1] ?? x))})`;
export const joinIndir = lift((...xs) => xs.join("!"));

const tokenizer = (str) => {
	const tokens = [];
	let state;
	let isEscaped;
	let value = "";
	const push = (x) => {
		tokens.push(x);
		state = null;
		value = "";
	};
	const cat = (x) => {
		value += x;
		isEscaped = false;
	};
	for (const char of Array.from(str.trim()).concat("")) {
		if (char === "^" && !isEscaped) {
			isEscaped = true;
			continue;
		}
		if (state === "!") push(["!"]);
		else if (state === ",") push([","]);
		else if (state === "/" || state === ":") {
			if (isNumber.test(char)) {
				cat(char);
				continue;
			} else push([state, parseInt(value)]);
		} else if (state === "~") {
			if (isNumber.test(char) || char === ".") {
				cat(char);
				continue;
			} else push(["~", parseFloat(value)]);
		} else if (state === "@") {
			if (char === ":") {
				push(["@", parseFloat(value)]);
				state = "@";
				continue;
			}
			if (isNumber.test(char) || char === ".") {
				cat(char);
				continue;
			} else push(["@", parseFloat(value)]);
		} else if (state === "[") {
			if (char === ";" && !escape) {
				push(["[", value]);
				state = ";";
			} else if (char === "," && !escape) {
				push(["[", value]);
				state = "[";
			} else if (char === "]" && !escape) push(["[", value]);
			else cat(char);
			continue;
		} else if (state?.startsWith(";")) {
			if (char === "=" && !escape) {
				state = `;${value}`;
				value = "";
			} else if (char === ";" && !escape) {
				push([state, value]);
				state = ";";
			} else if (char === "]" && !escape) push([state, value]);
			else cat(char);
			continue;
		}
		if (
			char === "/" ||
			char === ":" ||
			char === "~" ||
			char === "@" ||
			char === "[" ||
			char === "!" ||
			char === ","
		)
			state = char;
	}
	return tokens;
};

const findTokens = (tokens, x) => findIndices(tokens, ([t]) => t === x);

const parser = (tokens) => {
	const parts = [];
	let state;
	for (const [type, val] of tokens) {
		if (type === "/") parts.push({ index: val });
		else {
			const last = parts[parts.length - 1];
			if (type === ":") last.offset = val;
			else if (type === "~") last.temporal = val;
			else if (type === "@") last.spatial = (last.spatial ?? []).concat(val);
			else if (type === ";s") last.side = val;
			else if (type === "[") {
				if (state === "/" && val) last.id = val;
				else {
					last.text = (last.text ?? []).concat(val);
					continue;
				}
			}
		}
		state = type;
	}
	return parts;
};

const parserIndir = (tokens) => splitAt(tokens, findTokens(tokens, "!")).map(parser);

export const parse = (cfi) => {
	const tokens = tokenizer(unwrap(cfi));
	const commas = findTokens(tokens, ",");
	if (!commas.length) return parserIndir(tokens);
	const [parent, start, end] = splitAt(tokens, commas).map(parserIndir);
	return { parent, start, end };
};

const partToString = ({ index, id, offset, temporal, spatial, text, side }) => {
	const param = side ? `;s=${side}` : "";
	return (
		`/${index}` +
		(id ? `[${escapeCFI(id)}${param}]` : "") +
		(offset != null && index % 2 ? `:${offset}` : "") +
		(temporal ? `~${temporal}` : "") +
		(spatial ? `@${spatial.join(":")}` : "") +
		(text || (!id && side) ? `[${text?.map(escapeCFI)?.join(",") ?? ""}${param}]` : "")
	);
};

const toInnerString = (parsed) =>
	parsed.parent
		? [parsed.parent, parsed.start, parsed.end].map(toInnerString).join(",")
		: parsed.map((parts) => parts.map(partToString).join("")).join("!");

const stringifyCfi = (parsed) => wrap(toInnerString(parsed));

export const collapse = (x, toEnd) =>
	typeof x === "string"
		? stringifyCfi(collapse(parse(x), toEnd))
		: x.parent
		? concatArrays(x.parent, x[toEnd ? "end" : "start"])
		: x;

const buildRange = (from, to) => {
	if (typeof from === "string") from = parse(from);
	if (typeof to === "string") to = parse(to);
	from = collapse(from);
	to = collapse(to, true);
	const localFrom = from[from.length - 1];
	const localTo = to[to.length - 1];
	const localParent = [];
	const localStart = [];
	const localEnd = [];
	let pushToParent = true;
	const len = Math.max(localFrom.length, localTo.length);
	for (let i = 0; i < len; i++) {
		const a = localFrom[i];
		const b = localTo[i];
		pushToParent &&= a?.index === b?.index && !a?.offset && !b?.offset;
		if (pushToParent) localParent.push(a);
		else {
			if (a) localStart.push(a);
			if (b) localEnd.push(b);
		}
	}
	const parent = from.slice(0, -1).concat([localParent]);
	return stringifyCfi({ parent, start: [localStart], end: [localEnd] });
};

export const compare = (a, b) => {
	if (typeof a === "string") a = parse(a);
	if (typeof b === "string") b = parse(b);
	if (a.start || b.start)
		return compare(collapse(a), collapse(b)) || compare(collapse(a, true), collapse(b, true));

	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const p = a[i] ?? [];
		const q = b[i] ?? [];
		const maxIndex = Math.max(p.length, q.length) - 1;
		for (let j = 0; j <= maxIndex; j++) {
			const x = p[j];
			const y = q[j];
			if (!x) return -1;
			if (!y) return 1;
			if (x.index > y.index) return 1;
			if (x.index < y.index) return -1;
			if (j === maxIndex) {
				if (x.offset > y.offset) return 1;
				if (x.offset < y.offset) return -1;
			}
		}
	}
	return 0;
};

const isTextNode = ({ nodeType }) => nodeType === 3 || nodeType === 4;
const isElementNode = ({ nodeType }) => nodeType === 1;

const getChildNodes = (node, filter) => {
	if (!node?.childNodes) return [];
	const nodes = Array.from(node.childNodes).filter(
		(child) => isTextNode(child) || isElementNode(child)
	);
	return filter
		? nodes
				.flatMap((child) => {
					const accept = filter(child);
					if (accept === NodeFilter.FILTER_REJECT) return null;
					else if (accept === NodeFilter.FILTER_SKIP) return getChildNodes(child, filter);
					else return child;
				})
				.filter((x) => x)
		: nodes;
};

const indexChildNodes = (node, filter) => {
	if (!node) return ["before", "after"];
	const nodes = getChildNodes(node, filter).reduce((arr, child) => {
		const last = arr[arr.length - 1];
		if (!last) arr.push(child);
		else if (isTextNode(child)) {
			if (Array.isArray(last)) last.push(child);
			else if (isTextNode(last)) arr[arr.length - 1] = [last, child];
			else arr.push(child);
		} else {
			if (isElementNode(last)) arr.push(null, child);
			else arr.push(child);
		}
		return arr;
	}, []);
	if (isElementNode(nodes[0])) nodes.unshift("first");
	if (isElementNode(nodes[nodes.length - 1])) nodes.push("last");
	nodes.unshift("before");
	nodes.push("after");
	return nodes;
};

const partsToNode = (node, parts, filter) => {
	if (!node) return { node: null, offset: 0 };
	if (!Array.isArray(parts) || parts.length === 0) return { node: null, offset: 0 };
	const lastPart = parts[parts.length - 1] ?? {};
	const { id } = lastPart;
	if (id) {
		const el = node.ownerDocument.getElementById(id);
		if (el) return { node: el, offset: 0 };
	}
	for (const part of parts) {
		const index = part?.index;
		if (typeof index !== "number" || !Number.isFinite(index)) return { node: null, offset: 0 };
		const newNode = node ? indexChildNodes(node, filter)[index] : null;
		if (newNode === "first") return { node: node.firstChild ?? node };
		if (newNode === "last") return { node: node.lastChild ?? node };
		if (newNode === "before") return { node, before: true };
		if (newNode === "after") return { node, after: true };
		if (newNode == null) return { node: null, offset: 0 };
		node = newNode;
	}
	const offset = typeof lastPart.offset === "number" && Number.isFinite(lastPart.offset) ? lastPart.offset : 0;
	if (!Array.isArray(node)) return { node, offset };
	let sum = 0;
	for (const n of node) {
		const length = n?.nodeValue?.length ?? 0;
		if (!n) continue;
		if (sum + length >= offset) return { node: n, offset: offset - sum };
		sum += length;
	}
	return { node: null, offset: 0 };
};

const nodeToParts = (node, offset, filter) => {
	const { parentNode, id } = node;
	const indexed = indexChildNodes(parentNode, filter);
	const index = indexed.findIndex((x) =>
		Array.isArray(x) ? x.some((item) => item === node) : x === node
	);
	const chunk = indexed[index];
	if (Array.isArray(chunk)) {
		let sum = 0;
		for (const x of chunk) {
			if (x === node) {
				sum += offset;
				break;
			} else sum += x.nodeValue.length;
		}
		offset = sum;
	}
	const part = { id, index, offset };
	return (
		parentNode !== node.ownerDocument.documentElement
			? nodeToParts(parentNode, null, filter).concat(part)
			: [part]
	).filter((x) => x.index !== -1);
};

export const fromRange = (range, filter = undefined) => {
	const { startContainer, startOffset, endContainer, endOffset } = range;
	const start = nodeToParts(startContainer, startOffset, filter);
	if (range.collapsed) return stringifyCfi([start]);
	const end = nodeToParts(endContainer, endOffset, filter);
	return buildRange([start], [end]);
};

export const toRange = (doc, parts, filter = undefined) => {
	const startParts = collapse(parts);
	const endParts = collapse(parts, true);

	const root = doc.documentElement;
	const start = partsToNode(root, startParts?.[0], filter);
	const end = partsToNode(root, endParts?.[0], filter);
	if (!start?.node || !end?.node) throw new Error("Invalid EPUB CFI target");

	const range = doc.createRange();

	if (start.before) range.setStartBefore(start.node);
	else if (start.after) range.setStartAfter(start.node);
	else range.setStart(start.node, start.offset);

	if (end.before) range.setEndBefore(end.node);
	else if (end.after) range.setEndAfter(end.node);
	else range.setEnd(end.node, end.offset);
	return range;
};

export const fromElements = (elements) => {
	const results = [];
	const { parentNode } = elements[0];
	const parts = nodeToParts(parentNode);
	for (const [index, node] of indexChildNodes(parentNode).entries()) {
		const el = elements[results.length];
		if (node === el) {
			results.push(stringifyCfi([parts.concat({ id: el.id, index })]));
		}
	}
	return results;
};

export const toElement = (doc, parts) => partsToNode(doc.documentElement, collapse(parts)).node;

export const fake = {
	fromIndex: (index) => wrap(`/6/${(index + 1) * 2}`),
	toIndex: (parts) => parts?.at(-1).index / 2 - 1,
};

export const fromCalibrePos = (pos) => {
	const [parts] = parse(pos);
	const item = parts.shift();
	parts.shift();
	return stringifyCfi([[{ index: 6 }, item], parts]);
};

export const fromCalibreHighlight = ({ spine_index, start_cfi, end_cfi }) => {
	const pre = `${fake.fromIndex(spine_index)}!`;
	return buildRange(pre + start_cfi.slice(2), pre + end_cfi.slice(2));
};

export type ParsedCfiPart = {
	index: number;
	id?: string;
	offset?: number;
	temporal?: number;
	spatial?: number[];
	text?: string[];
	side?: string;
};

export type ParsedCfiSegment = ParsedCfiPart[];
export type ParsedCfiPath = ParsedCfiSegment[];

export interface ParsedCfiRange {
	parent: ParsedCfiPath;
	start: ParsedCfiPath;
	end: ParsedCfiPath;
}

export type ParsedCfi = ParsedCfiPath | ParsedCfiRange;
