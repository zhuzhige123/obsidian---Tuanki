import type { DocumentQuizStatsPillDisplay } from "./document-quiz-stats-pill-display";

export const DOC_QUIZ_STATS_PILL_CLASS = "weave-doc-quiz-stats-pill";

export function createDocumentQuizStatsPillElement(
	display: DocumentQuizStatsPillDisplay
): HTMLElement {
	const pill = activeDocument.createElement("div");
	pill.className = `${DOC_QUIZ_STATS_PILL_CLASS} is-mastery-${display.mastery}`;
	pill.setAttribute("data-weave-doc-quiz-block-id", display.blockId);
	pill.setAttribute("aria-label", display.ariaLabel);

	const dot = activeDocument.createElement("span");
	dot.className = "weave-doc-quiz-stats-pill-dot";
	dot.setAttribute("aria-hidden", "true");
	pill.appendChild(dot);

	display.segments.forEach((segment, index) => {
		if (index > 0) {
			const sep = activeDocument.createElement("span");
			sep.className = "weave-doc-quiz-stats-pill-sep";
			sep.textContent = "·";
			sep.setAttribute("aria-hidden", "true");
			pill.appendChild(sep);
		}

		const text = activeDocument.createElement("span");
		text.className = "weave-doc-quiz-stats-pill-part";
		text.textContent = segment;
		pill.appendChild(text);
	});

	return pill;
}
