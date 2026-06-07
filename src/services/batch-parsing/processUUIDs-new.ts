import { logger } from "../../utils/logger";
/**
 * UUID处理的新实现（重构版）
 * 使用位置信息进行精确插入，避免文件结构破坏
 *
 * 这是一个临时文件，用于替换 SimpleBatchParsingService.ts 中的 processUUIDs 方法
 */

import type { ParsedCard } from "../../types/newCardParsingTypes";
import { logDebugWithTag } from "../../utils/logger";
import type { CardWithPosition } from "../../utils/simplifiedParser/CardPositionTracker";
import type { UUIDManager } from "./UUIDManager";

/**
 * UUID处理结果
 */
export interface UUIDProcessResult {
	duplicates: string[];
	contentUpdated: boolean;
	updatedContent: string;
}

/**
 * UUID处理器（重构版 - 使用位置信息）
 *
 * 核心改进：
 * 1. 不再使用 splitCardsRaw 重新分割内容
 * 2. 直接使用解析时保存的位置信息
 * 3. 从后往前插入UUID，避免位置偏移
 * 4. 保持文件结构完整，不删除或移动分隔符
 */
export async function processUUIDsWithPosition(
	cards: ParsedCard[],
	cardsPosition: CardWithPosition[],
	content: string,
	uuidManager: UUIDManager,
	detectUUIDInContent: (content: string) => string | null
): Promise<UUIDProcessResult> {
	const duplicates: string[] = [];
	let contentUpdated = false;

	if (cards.length !== cardsPosition.length) {
		return {
			duplicates,
			contentUpdated: false,
			updatedContent: content,
		};
	}

	// 构建插入计划（从后往前，避免位置偏移）
	const insertions: Array<{
		lineNumber: number;
		content: string;
		cardIndex: number;
	}> = [];

	for (let i = cards.length - 1; i >= 0; i--) {
		const card = cards[i];
		const position = cardsPosition[i];

		const existingUUID = detectUUIDInContent(position.rawContent);

		if (existingUUID) {
			if (!card.metadata) {
				card.metadata = {};
			}
			card.metadata.uuid = existingUUID;
		} else {
			const uuid = uuidManager.generateCardUuid();
			const blockId = uuidManager.generateBlockID();

			const uuidLine = `<!-- ${uuid} --> ^${blockId}`;

			insertions.push({
				lineNumber: position.endLine,
				content: uuidLine,
				cardIndex: i,
			});

			if (!card.metadata) {
				card.metadata = {};
			}
			card.metadata.uuid = uuid;
			card.metadata.blockId = blockId; // 保留blockId（临时字段）

			contentUpdated = true;
		}
	}

	// 执行插入
	if (insertions.length > 0) {
		logDebugWithTag("processUUIDs", `准备插入UUID，共 ${insertions.length} 个`);
		logDebugWithTag(
			"processUUIDs",
			`插入计划（排序前）: ${insertions.map((ins) => `行${ins.lineNumber}`).join(", ")}`
		);

		const lines = content.split("\n");

		// 按行号从大到小排序，确保从后往前插入，避免位置偏移
		insertions.sort((a, b) => b.lineNumber - a.lineNumber);

		logDebugWithTag(
			"processUUIDs",
			`插入顺序（排序后）: ${insertions.map((ins) => `行${ins.lineNumber}`).join(", ")}`
		);

		for (const insertion of insertions) {
			logDebugWithTag("processUUIDs", `在第 ${insertion.lineNumber} 行插入: ${insertion.content}`);
			lines.splice(insertion.lineNumber, 0, insertion.content);
		}

		const updatedContent = lines.join("\n");

		// 验证插入结果
		let verificationSuccess = true;
		for (const insertion of insertions) {
			if (!updatedContent.includes(insertion.content)) {
				logger.error(`[processUUIDs] 验证失败：未找到插入的内容: ${insertion.content}`);
				verificationSuccess = false;
			}
		}

		if (verificationSuccess) {
			logDebugWithTag("processUUIDs", "所有UUID插入验证通过");
		}

		return {
			duplicates,
			contentUpdated: true,
			updatedContent,
		};
	}

	return {
		duplicates,
		contentUpdated,
		updatedContent: content,
	};
}
