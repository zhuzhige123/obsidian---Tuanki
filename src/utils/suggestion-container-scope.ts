const WEAVE_SUGGEST_OWNERSHIP_CLASSES = [
	"weave-vault-file-suggest-container",
	"weave-markdown-file-suggest-popover",
	"weave-vault-folder-suggest-popover",
	"weave-batch-tag-suggest-popover",
	"weave-ir-deck-suggest-popover",
	"weave-ai-prompt-suggest-popover",
] as const;

function isVisibleSuggestionContainer(element: HTMLElement): boolean {
	if (!element.isConnected) {
		return false;
	}

	const style = window.getComputedStyle(element);
	return style.display !== "none" && style.visibility !== "hidden";
}

function isOwnedByOtherWeaveSuggest(element: HTMLElement, className: string): boolean {
	return WEAVE_SUGGEST_OWNERSHIP_CLASSES.some(
		(ownedClass) => ownedClass !== className && element.classList.contains(ownedClass)
	);
}

export function resolveSuggestionContainerForAnchor(
	anchor: HTMLElement,
	options: { scopeEl?: ParentNode | null } = {}
): HTMLElement | null {
	if (typeof document === "undefined") {
		return null;
	}

	const anchorRect = anchor.getBoundingClientRect();
	const roots = options.scopeEl ? [options.scopeEl] : [document];
	const candidates: HTMLElement[] = [];

	for (const root of roots) {
		for (const node of root.querySelectorAll(".suggestion-container")) {
			if (node instanceof HTMLElement && isVisibleSuggestionContainer(node)) {
				candidates.push(node);
			}
		}
	}

	if (candidates.length === 0) {
		return null;
	}

	let best: HTMLElement | null = null;
	let bestScore = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		const rect = candidate.getBoundingClientRect();
		const horizontalDistance = Math.abs(rect.left - anchorRect.left);
		const verticalDistance = Math.max(0, rect.top - anchorRect.bottom);
		const score = horizontalDistance + verticalDistance * 2;

		if (score < bestScore) {
			bestScore = score;
			best = candidate;
		}
	}

	return best;
}

export function markSuggestionContainer(
	className: string,
	options: { scopeEl?: ParentNode | null; anchorEl?: HTMLElement | null } = {}
): void {
	if (typeof document === "undefined") {
		return;
	}

	window.requestAnimationFrame(() => {
		const scopedContainers = options.scopeEl
			? Array.from(options.scopeEl.querySelectorAll(".suggestion-container")).filter(
					(node): node is HTMLElement => node instanceof HTMLElement
			  )
			: [];

		let target =
			(options.anchorEl
				? resolveSuggestionContainerForAnchor(options.anchorEl, {
						scopeEl: options.scopeEl ?? undefined,
				  })
				: null) ??
			(scopedContainers.at(-1) instanceof HTMLElement ? scopedContainers.at(-1)! : null);

		if (!target) {
			return;
		}

		if (isOwnedByOtherWeaveSuggest(target, className)) {
			return;
		}

		target.classList.add(className);
	});
}
