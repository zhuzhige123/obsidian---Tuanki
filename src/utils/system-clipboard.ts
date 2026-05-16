import { applyStyleProps } from "./style-props";

function writeWithExecCommand(text: string): boolean {
	if (typeof document === "undefined" || !document.body) {
		return false;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	applyStyleProps(textarea, {
		position: "fixed",
		opacity: "0",
		pointerEvents: "none",
	});
	document.body.appendChild(textarea);
	textarea.select();
	textarea.setSelectionRange(0, text.length);

	try {
		return document.execCommand("copy");
	} finally {
		textarea.remove();
	}
}

export async function writeSystemClipboardText(text: string): Promise<boolean> {
	const normalized = String(text ?? "");

	try {
		const electronClipboard = (window as any)?.require?.("electron")?.clipboard;
		if (electronClipboard?.writeText) {
			electronClipboard.writeText(normalized);
			return true;
		}
	} catch {
		// ignore Electron clipboard failures and fall back to DOM copy
	}

	try {
		return writeWithExecCommand(normalized);
	} catch {
		return false;
	}
}
