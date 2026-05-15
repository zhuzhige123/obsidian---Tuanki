type StyleTarget = {
	style?: CSSStyleDeclaration;
};

function toCssPropertyName(property: string): string {
	if (property.startsWith("--")) {
		return property;
	}

	return property.replace(/[A-Z]/g, (segment) => `-${segment.toLowerCase()}`);
}

export function applyStyleProps(
	target: StyleTarget | null | undefined,
	styles: Record<string, string | number | null | undefined>
): void {
	const style = target?.style;
	if (!style) {
		return;
	}

	for (const [property, value] of Object.entries(styles)) {
		const cssProperty = toCssPropertyName(property);
		if (value === null || value === undefined || value === "") {
			style.removeProperty(cssProperty);
			continue;
		}

		style.setProperty(cssProperty, String(value));
	}
}
