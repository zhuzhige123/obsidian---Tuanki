export function ensureWeaveSuggestModalTheme(): void {
	// Suggest modal theme has been migrated to static CSS bundled in styles.css.
}

export function markLatestSuggestionContainer(className: string): void {
	if (typeof document === "undefined") {
		return;
	}

	window.requestAnimationFrame(() => {
		const containers = Array.from(document.querySelectorAll(".suggestion-container")) as HTMLElement[];
		const latest = containers.at(-1);
		if (!latest) {
			return;
		}

		latest.classList.add(className);
	});
}
