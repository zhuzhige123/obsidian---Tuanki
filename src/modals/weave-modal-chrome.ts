export type WeaveModalAccentColor =
	| "blue"
	| "green"
	| "purple"
	| "orange"
	| "cyan"
	| "pink"
	| "red";

export function applyWeaveModalAccentTitle(
	titleEl: HTMLElement,
	accent: WeaveModalAccentColor
): void {
	titleEl.addClass("with-accent-bar", `accent-${accent}`);
}

export function clearWeaveModalAccentTitle(
	titleEl: HTMLElement,
	accent: WeaveModalAccentColor
): void {
	titleEl.removeClass("with-accent-bar", `accent-${accent}`);
}
