export function normalizeAITextContent(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => normalizeAITextContent(part))
			.filter(Boolean)
			.join("\n")
			.trim();
	}

	if (content && typeof content === "object") {
		const record = content as Record<string, unknown>;

		for (const key of ["text", "content", "value", "output_text"]) {
			const nested = record[key];
			if (nested !== undefined) {
				const normalized = normalizeAITextContent(nested);
				if (normalized) {
					return normalized;
				}
			}
		}
	}

	return "";
}

function stripThinkTags(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function unwrapSingleCodeFence(text: string): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json|JSON|markdown|md|text)?\s*\r?\n([\s\S]*?)\r?\n```$/);
	return fenced ? fenced[1].trim() : trimmed;
}

function extractBalancedJsonSegments(text: string): string[] {
	const segments: string[] = [];
	const length = text.length;

	for (let start = 0; start < length; start++) {
		const first = text[start];
		if (first !== "{" && first !== "[") {
			continue;
		}

		const stack = [first];
		let inString = false;
		let escaped = false;

		for (let index = start + 1; index < length; index++) {
			const char = text[index];

			if (inString) {
				if (escaped) {
					escaped = false;
					continue;
				}

				if (char === "\\") {
					escaped = true;
					continue;
				}

				if (char === "\"") {
					inString = false;
				}
				continue;
			}

			if (char === "\"") {
				inString = true;
				continue;
			}

			if (char === "{" || char === "[") {
				stack.push(char);
				continue;
			}

			if (char === "}" || char === "]") {
				const last = stack[stack.length - 1];
				const matches =
					(last === "{" && char === "}") ||
					(last === "[" && char === "]");

				if (!matches) {
					break;
				}

				stack.pop();

				if (stack.length === 0) {
					segments.push(text.slice(start, index + 1));
					start = index;
					break;
				}
			}
		}
	}

	return segments;
}

export function parseJsonFromAIText(text: string): unknown[] {
	if (!text) {
		return [];
	}

	const variants = [text, unwrapSingleCodeFence(text), stripThinkTags(text), unwrapSingleCodeFence(stripThinkTags(text))]
		.map((value) => value.trim())
		.filter(Boolean);

	const seen = new Set<string>();
	const results: unknown[] = [];

	for (const variant of variants) {
		if (seen.has(variant)) {
			continue;
		}
		seen.add(variant);

		try {
			results.push(JSON.parse(variant));
			continue;
		} catch {
			// Fall through to balanced extraction.
		}

		for (const segment of extractBalancedJsonSegments(variant)) {
			try {
				results.push(JSON.parse(segment));
			} catch {
				// Ignore invalid intermediate fragments.
			}
		}
	}

	return results;
}
