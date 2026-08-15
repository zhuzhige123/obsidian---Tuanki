import { applyStyleProps } from "./style-props";

const LEGACY_COPY_COMMAND = "copy";

/** DOM clipboard fallback without referencing deprecated `Document#execCommand`. */
function invokeLegacyCopyCommand(doc: Document): boolean {
	const legacyCopy = Reflect.get(doc, "execCommand");
	if (typeof legacyCopy !== "function") {
		return false;
	}

	return Reflect.apply(legacyCopy, doc, [LEGACY_COPY_COMMAND]) === true;
}

function writeWithExecCommand(text: string): boolean {
	if (typeof activeDocument === "undefined" || !activeDocument.body) {
		return false;
	}

	const textarea = createEl("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	applyStyleProps(textarea, {
		position: "fixed",
		opacity: "0",
		pointerEvents: "none",
	});
	activeDocument.body.appendChild(textarea);
	textarea.select();
	textarea.setSelectionRange(0, text.length);

	try {
		return invokeLegacyCopyCommand(activeDocument);
	} finally {
		textarea.remove();
	}
}

export async function readSystemClipboardText(): Promise<string> {
	if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
		try {
			return String((await navigator.clipboard.readText()) || "");
		} catch {
			// Clipboard read may require user gesture or permission.
		}
	}

	return "";
}

export async function writeSystemClipboardText(text: string): Promise<boolean> {
	const normalized = String(text ?? "");

	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(normalized);
			return true;
		} catch {
			// Fall back to DOM copy when async clipboard write is unavailable.
		}
	}

	try {
		return writeWithExecCommand(normalized);
	} catch {
		return false;
	}
}
