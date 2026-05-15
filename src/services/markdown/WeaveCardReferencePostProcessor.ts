import type { App } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import {
	buildWeaveCardReferenceDisplayText,
	parseWeaveCardReferencesInText,
} from "../../utils/weave-card-reference";

export function createWeaveCardReferencePostProcessor(_app: App) {
	return (el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];

		while (walker.nextNode()) {
			const node = walker.currentNode;
			if (!(node instanceof Text)) {
				continue;
			}
			if (!node.textContent || !node.textContent.includes("@_")) {
				continue;
			}
			const parentElement = node.parentElement;
			if (
				parentElement?.closest("a, code, pre, .cm-inline-code") ||
				parentElement?.classList.contains("weave-card-reference-display")
			) {
				continue;
			}
			textNodes.push(node);
		}

		for (const textNode of textNodes) {
			const content = textNode.textContent || "";
			const references = parseWeaveCardReferencesInText(content).filter((reference) => Boolean(reference.alias));
			if (references.length === 0) {
				continue;
			}

			const fragment = document.createDocumentFragment();
			let cursor = 0;
			for (const reference of references) {
				if (reference.startIndex > cursor) {
					fragment.appendChild(document.createTextNode(content.slice(cursor, reference.startIndex)));
				}

				const span = document.createElement("span");
				span.className = "weave-card-reference-display";
				span.setAttribute("data-weave-card-uuid", reference.uuid);
				span.setAttribute("data-weave-card-alias", reference.alias || "");
				span.textContent = buildWeaveCardReferenceDisplayText(reference);
				fragment.appendChild(span);
				cursor = reference.endIndex;
			}

			if (cursor < content.length) {
				fragment.appendChild(document.createTextNode(content.slice(cursor)));
			}

			textNode.parentNode?.replaceChild(fragment, textNode);
		}
	};
}
