import { Notice } from "obsidian";

export function showNotification(
	message: string,
	type: "success" | "error" | "info" | "warning" = "info"
) {
	const prefixMap = {
		success: "✓ ",
		error: "✕ ",
		warning: "⚠ ",
		info: "ℹ ",
	} as const;

	new Notice(`${prefixMap[type]}${message}`, 3000);
}
