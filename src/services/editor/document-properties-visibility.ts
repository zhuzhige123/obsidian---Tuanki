import type { Vault } from "obsidian";

/**
 * 是否与 Obsidian「设置 → 编辑器 → 笔记内属性」一致：仅在用户选择 Hidden 时返回 true。
 * visible / source 等均不隐藏（source 模式下 YAML 由编辑器正文呈现）。
 */
export function shouldHideDocumentPropertiesForVault(vault: Vault): boolean {
	try {
		const mode = (vault as { getConfig?: (key: string) => unknown }).getConfig?.(
			"propertiesInDocument"
		);
		if (mode === undefined || mode === null) {
			return false;
		}
		if (mode === false) return true;
		if (mode === true) return false;
		if (typeof mode === "number") {
			return mode === 0;
		}
		if (typeof mode === "string") {
			const s = mode.toLowerCase();
			return s === "hidden" || s === "hide" || s === "off" || s === "never";
		}
		return false;
	} catch {
		return false;
	}
}
