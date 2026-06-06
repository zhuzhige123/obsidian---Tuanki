export function ensureWeaveSuggestModalTheme(): void {
	// Suggest modal theme has been migrated to static CSS bundled in styles.css.
}

export function markLatestSuggestionContainer(className: string): void {
	if (typeof activeDocument === "undefined") {
		return;
	}

	window.requestAnimationFrame(() => {
		const containers = Array.from(activeDocument.querySelectorAll(".suggestion-container"));
		const latest = containers.at(-1);
		if (!latest) {
			return;
		}

		latest.classList.add(className);
	});
}
