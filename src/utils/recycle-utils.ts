import { logger } from "../utils/logger";
/**
 * 卡片回收工具函数
 * 提供回收卡片的检测、标签插入、移除和生命周期管理功能
 *
 * 设计理念：将记忆效率不佳的卡片"回收"而非"搁置"，
 * 强调需要再处理、改进，而非忽视遗忘。
 */

import {
	RECYCLE_TAGS,
	RecycleReason,
	RecycleStatus,
	SUSPEND_TAGS,
} from "../constants/app-constants";
import type { Card } from "../data/types";
import { TagExtractor } from "./tag-extractor";
import { removeHashPrefix } from "./tag-utils";

// 🆕 回收信息接口
export interface RecycleInfo {
	recycledAt: string; // 回收时间
	reasons: RecycleReason[]; // 回收原因
	severity: number; // 严重程度（0-10）
	status: RecycleStatus; // 当前状态
	manual: boolean; // 是否手动回收
	originalDue?: string; // 原始到期时间
	improvements?: string; // 改进说明
}

/**
 * 检查卡片是否被回收
 * 支持中英文标签：#回收 或 #recycle
 * 兼容旧版：#搁置 或 #postpone
 *
 * @param card - 卡片对象
 * @returns 是否回收
 */
export function isRecycled(card: Card): boolean {
	if (!card) return false;

	// 方法1：检查元数据（优先，最准确）
	if (card.metadata?.recycleInfo) {
		return card.metadata.recycleInfo.status !== RecycleStatus.REACTIVATED;
	}

	const recycleTags: string[] = [
		RECYCLE_TAGS.ZH,
		RECYCLE_TAGS.EN,
		SUSPEND_TAGS.ZH, // 向后兼容
		SUSPEND_TAGS.EN, // 向后兼容
	];

	// 方法2：检查 card.tags 数组
	if (card.tags && Array.isArray(card.tags)) {
		const hasRecycleTag = card.tags.some((tag: string) =>
			recycleTags.includes(removeHashPrefix(tag))
		);
		if (hasRecycleTag) return true;
	}

	// 方法3：检查 card.content（双重保障）
	if (card.content && typeof card.content === "string") {
		const contentTags = TagExtractor.extractTags(card.content);
		const hasRecycleTag = contentTags.some((tag: string) => recycleTags.includes(tag));
		if (hasRecycleTag) return true;
	}

	return false;
}

/**
 * 智能插入回收标签到卡片内容
 * 插入策略：
 * 1. 如果有YAML front matter，插入到YAML后
 * 2. 如果第一行是标题（# ## ###），插入到第二行
 * 3. 默认插入到内容开头
 *
 * @param content - 原始内容
 * @param useChinese - 使用中文标签（默认true）
 * @returns 插入标签后的内容
 */
export function insertRecycleTag(content: string, useChinese = true): string {
	if (!content) content = "";

	const recycleTag = useChinese ? RECYCLE_TAGS.ZH : RECYCLE_TAGS.EN;

	// 检查是否已存在回收标签
	const existingTags = TagExtractor.extractTags(content);
	if (
		existingTags.includes(recycleTag) ||
		existingTags.includes(RECYCLE_TAGS.ZH) ||
		existingTags.includes(RECYCLE_TAGS.EN)
	) {
		// 已存在，不重复添加
		return content;
	}

	const lines = content.split("\n");
	let insertIndex = 0;

	// 策略1：跳过YAML front matter
	if (lines[0]?.trim() === "---") {
		const yamlEndIndex = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
		if (yamlEndIndex > 0) {
			insertIndex = yamlEndIndex + 1;
			lines.splice(insertIndex, 0, "", `#${recycleTag}`, "");
			return lines.join("\n");
		}
	}

	// 策略2：如果第一行是标题，插入到第二行
	if (lines[0]?.match(/^#{1,6}\s/)) {
		lines.splice(1, 0, "", `#${recycleTag}`, "");
		return lines.join("\n");
	}

	// 策略3：插入到开头
	return `#${recycleTag}\n\n${content}`;
}

/**
 * 从卡片内容中移除回收标签
 * 支持移除中文和英文标签，以及旧版搁置标签
 *
 * @param content - 原始内容
 * @returns 移除标签后的内容
 */
export function removeRecycleTag(content: string): string {
	if (!content || typeof content !== "string") {
		return "";
	}

	let updatedContent = content;

	// 移除回收标签（中文）
	const zhRecyclePattern = new RegExp(`#${RECYCLE_TAGS.ZH}\\b`, "g");
	updatedContent = updatedContent.replace(zhRecyclePattern, "");

	// 移除回收标签（英文）
	const enRecyclePattern = new RegExp(`#${RECYCLE_TAGS.EN}\\b`, "g");
	updatedContent = updatedContent.replace(enRecyclePattern, "");

	// 移除旧版搁置标签（中文）
	const zhSuspendPattern = new RegExp(`#${SUSPEND_TAGS.ZH}\\b`, "g");
	updatedContent = updatedContent.replace(zhSuspendPattern, "");

	// 移除旧版搁置标签（英文）
	const enSuspendPattern = new RegExp(`#${SUSPEND_TAGS.EN}\\b`, "g");
	updatedContent = updatedContent.replace(enSuspendPattern, "");

	// 清理多余的空行（最多保留一个空行）
	updatedContent = updatedContent
		.replace(/\n{3,}/g, "\n\n") // 将3个及以上换行替换为2个
		.trim();

	return updatedContent;
}

/**
 * 回收卡片
 * @param card - 卡片对象
 * @param reason - 回收原因
 * @param severity - 严重程度（0-10）
 */
export async function recycleCard(
	card: Card,
	reason: RecycleReason = RecycleReason.MANUAL,
	severity = 5
): Promise<void> {
	if (!card) return;

	// 1. 添加回收标签到内容
	card.content = insertRecycleTag(card.content || "", true);

	// 2. 更新tags数组
	if (!card.tags) card.tags = [];
	const recycleTagText = RECYCLE_TAGS.ZH;
	if (!card.tags.includes(recycleTagText) && !card.tags.includes(`#${recycleTagText}`)) {
		card.tags.push(recycleTagText);
	}

	// 3. 记录回收信息到元数据
	if (!card.metadata) card.metadata = {};

	card.metadata.recycleInfo = {
		recycledAt: new Date().toISOString(),
		reasons: [reason],
		severity,
		status: RecycleStatus.PENDING,
		manual: reason === RecycleReason.MANUAL,
		originalDue: card.fsrs?.due,
	};

	// 4. 更新FSRS due（设为远期，10年后）
	if (card.fsrs) {
		const farFuture = new Date();
		farFuture.setFullYear(farFuture.getFullYear() + 10);
		card.fsrs.due = farFuture.toISOString();
	}

	// 5. 更新修改时间
	card.modified = new Date().toISOString();
}

/**
 * 重新激活回收的卡片
 * @param card - 卡片对象
 * @param improvements - 改进说明（可选）
 */
export function reactivateCard(card: Card, improvements?: string): void {
	if (!card) return;

	// 1. 移除回收标签
	card.content = removeRecycleTag(card.content || "");

	// 2. 从tags数组中移除
	if (card.tags && Array.isArray(card.tags)) {
		card.tags = card.tags.filter((_tag) => {
			const cleanTag = removeHashPrefix(_tag);
			return (
				cleanTag !== RECYCLE_TAGS.ZH &&
				cleanTag !== RECYCLE_TAGS.EN &&
				cleanTag !== SUSPEND_TAGS.ZH &&
				cleanTag !== SUSPEND_TAGS.EN
			);
		});
	}

	// 3. 更新回收信息
	if (card.metadata?.recycleInfo) {
		card.metadata.recycleInfo.status = RecycleStatus.REACTIVATED;
		if (improvements) {
			card.metadata.recycleInfo.improvements = improvements;
		}

		// 4. 恢复FSRS due
		if (card.fsrs && card.metadata.recycleInfo.originalDue) {
			card.fsrs.due = card.metadata.recycleInfo.originalDue;
		}
	}

	// 5. 更新修改时间
	card.modified = new Date().toISOString();
}

/**
 * 获取回收标签的显示文本
 * @param useChinese - 使用中文
 * @returns 标签文本（带#前缀）
 */
export function getRecycleTagText(useChinese = true): string {
	return `#${useChinese ? RECYCLE_TAGS.ZH : RECYCLE_TAGS.EN}`;
}

/**
 * 批量过滤回收卡片
 * @param cards - 卡片数组
 * @returns 过滤后的卡片数组（不包含回收的卡片）
 */
export function filterRecycledCards(cards: Card[]): Card[] {
	if (!cards || !Array.isArray(cards)) {
		return [];
	}

	return cards.filter((card) => !isRecycled(card));
}

/**
 * 迁移旧版搁置卡片为回收卡片
 * @param card - 卡片对象
 * @returns 是否成功迁移
 */
export async function migrateFromSuspendToRecycle(card: Card): Promise<boolean> {
	if (!card) return false;

	// 检查是否包含旧版搁置标签
	const content = card.content || "";
	const hasSuspendTag =
		content.includes(`#${SUSPEND_TAGS.ZH}`) || content.includes(`#${SUSPEND_TAGS.EN}`);

	if (!hasSuspendTag) return false;

	try {
		// 移除旧标签
		let updatedContent = content;
		updatedContent = updatedContent.replace(new RegExp(`#${SUSPEND_TAGS.ZH}\\b`, "g"), "");
		updatedContent = updatedContent.replace(new RegExp(`#${SUSPEND_TAGS.EN}\\b`, "g"), "");
		updatedContent = updatedContent.replace(/\n{3,}/g, "\n\n").trim();

		card.content = updatedContent;

		// 添加回收标签和元数据
		await recycleCard(card, RecycleReason.MANUAL, 3);

		return true;
	} catch (error) {
		logger.error("[Migration] 迁移卡片失败:", error);
		return false;
	}
}
