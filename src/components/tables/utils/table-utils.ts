/**
 * 表格工具函数
 * WeaveCardTable 组件拆分 - 共享工具函数
 */

import { ICON_NAMES } from "../../../icons/index.js";
import { getCardDeckNames as getCardDeckNamesFromYaml } from "../../../utils/yaml-utils";
import type { SourceDocumentStatusInfo } from "../types/table-types";

/**
 * 获取排序图标
 */
export function getSortIcon(
	currentField: string,
	sortField: string,
	direction: "asc" | "desc"
): string {
	if (currentField !== sortField) return "sort";
	return direction === "asc" ? "sort-up" : "sort-down";
}

/**
 * 获取排序图标的可访问性标签
 * @param currentField 当前列字段
 * @param sortField 当前排序字段
 * @param direction 排序方向
 * @param locale 语言代码
 * @returns ARIA标签文本
 */
export function getSortAriaLabel(
	currentField: string,
	sortField: string,
	direction: "asc" | "desc",
	locale: "zh" | "en" = "zh"
): string {
	if (currentField !== sortField) {
		return locale === "zh" ? "点击排序" : "Click to sort";
	}

	if (direction === "asc") {
		return locale === "zh" ? "升序排列,点击改为降序" : "Sorted ascending, click for descending";
	} else {
		return locale === "zh" ? "降序排列，点击改为升序" : "Sorted descending, click for ascending";
	}
}

/**
 * 获取星级状态
 */
export function getStarState(
	cardId: string,
	starIndex: number,
	currentPriority: number,
	hoveringCardId: string | null,
	hoveringStarIndex: number
): "hover" | "filled" | "empty" {
	const isHovering = hoveringCardId === cardId;
	const hoverIndex = isHovering ? hoveringStarIndex : -1;

	if (isHovering && hoverIndex >= starIndex) {
		return "hover";
	} else if (starIndex < currentPriority) {
		return "filled";
	} else {
		return "empty";
	}
}

/**
 * 获取牌组名称（通过牌组ID）
 * @param deckId 牌组ID
 * @param decks 牌组列表
 * @returns 牌组名称，如果找不到则返回友好提示
 */
export function getDeckName(deckId: string, decks?: Array<{ id: string; name: string }>): string {
	if (!deckId) return "无牌组";
	if (!decks || decks.length === 0) return "无牌组";
	const deck = decks.find((d) => d.id === deckId);
	return deck?.name || "无牌组";
}

/**
 * 🆕 v2.2: 从卡片获取牌组名称
 * 优先从 content YAML 的 we_decks 获取，回退到 card.deckId
 * @param card 卡片对象
 * @param decks 牌组列表
 * @returns 牌组名称，如果找不到则返回友好提示
 */
export function getCardDeckName(
	card: { content?: string; deckId?: string; referencedByDecks?: string[] },
	decks?: Array<{ id: string; name: string }>
): string {
	if (!card) return "无牌组";
	if (!decks || decks.length === 0) return "无牌组";

	// 使用统一的工具函数获取牌组名称
	const names = getCardDeckNamesFromYaml(card, decks, "无牌组");
	return names.join(", ");
}

/**
 * 获取源文档状态信息
 */
export function getSourceDocumentStatusInfo(status: string): SourceDocumentStatusInfo {
	switch (status) {
		case "存在":
			return {
				text: "存在",
				icon: ICON_NAMES.CHECK,
				class: "weave-status-exists",
				tooltip: "源文档存在，支持双向同步",
			};
		case "已删除":
			return {
				text: "已删除",
				icon: ICON_NAMES.DELETE,
				class: "weave-status-deleted",
				tooltip: "源文档已删除，不支持双向同步",
			};
		case "无源文档":
			return {
				text: "无源文档",
				icon: ICON_NAMES.HELP,
				class: "weave-status-none",
				tooltip: "卡片没有关联的源文档",
			};
		default:
			return {
				text: "未知",
				icon: ICON_NAMES.HELP,
				class: "weave-status-unknown",
				tooltip: "源文档状态未知",
			};
	}
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength = 50): string {
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return `${text.substring(0, maxLength)}...`;
}

/** 表格列最小宽度（像素） */
export function getMinColumnWidth(columnKey: string): number {
	if (columnKey === "checkbox") {
		return 32;
	}
	if (columnKey === "actions") {
		return 48;
	}
	return 50;
}

/**
 * 检查是否全选
 */
export function isAllSelected(selectedCount: number, totalCount: number): boolean {
	return totalCount > 0 && selectedCount === totalCount;
}

/**
 * 检查是否部分选择
 */
export function isIndeterminate(selectedCount: number, totalCount: number): boolean {
	return selectedCount > 0 && selectedCount < totalCount;
}

/**
 * 获取标签颜色
 */
export function getTagColor(tag: string): string {
	const colors = ["blue", "green", "purple", "orange", "pink", "cyan", "red", "yellow"];
	const hash = tag.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
	return colors[hash % colors.length];
}
