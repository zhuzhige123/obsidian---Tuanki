import { Platform } from "obsidian";

const WEAVE_VIEW_LEAF_SELECTOR = '.workspace-leaf-content[data-type="weave-view"]';

/** 移动端 Weave 视图是否使用 Obsidian 原生 view-header（菜单/搜索/圆点居中） */
export function usesMobileNativeWeaveHeader(): boolean {
	return Platform.isMobile;
}

export function findWeaveViewLeafContent(element: HTMLElement | null): HTMLElement | null {
	if (!(element instanceof HTMLElement)) {
		return null;
	}

	const host = element.closest(WEAVE_VIEW_LEAF_SELECTOR);
	return host instanceof HTMLElement ? host : null;
}

export function hasWeaveMobileNativeHeader(element: HTMLElement | null): boolean {
	return findWeaveViewLeafContent(element)?.dataset.weaveMobileNativeHeader === "true";
}
