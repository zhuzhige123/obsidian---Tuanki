import { logger } from "../utils/logger";
/**
 * 卡片Markdown序列化工具
 * 提供卡片数据与Markdown格式之间的双向转换
 * 供嵌入式编辑器和降级编辑器共用
 */

import type { Card } from "../data/types";
import { CardType } from "../data/types";
import { ChoiceCardParser } from "../parsers/card-type-parsers/ChoiceCardParser";
import { ClozeCardParser } from "../parsers/card-type-parsers/ClozeCardParser";
import { QACardParser } from "../parsers/card-type-parsers/QACardParser";
import { getCardMetadataService } from "../services/CardMetadataService";
import { hasProgressiveClozeContent } from "../types/progressive-cloze-v2";
import { hasAnyClozeSyntax } from "./cloze-syntax";
import { TagExtractor } from "./tag-extractor";

/**
 * 将卡片数据转换为Obsidian兼容的Markdown格式（遵循卡片数据结构规范 v1.0）
 *
 *  核心原则：
 * 1. 优先使用card.content（权威数据源）
 * 2. 如果content不存在，从card.fields生成（向后兼容）
 * 3. 溯源信息从专用字段读取（不从fields读取）
 */
export function cardToMarkdown(card: Card): string {
	const lines: string[] = [];

	// 添加YAML frontmatter
	lines.push("---");
	// 优先从 content YAML 的 we_decks 获取牌组 ID
	const primaryDeckId = getCardMetadataService().getCardDeckIds(card)[0];
	lines.push(`weave_uuid: "${card.uuid}"`);
	lines.push(`weave_deck_id: "${primaryDeckId || card.deckId}"`);

	//  templateId 可选
	if (card.templateId) {
		lines.push(`weave_template_id: "${card.templateId}"`);
	}

	lines.push(`created: "${card.created}"`);
	lines.push(`modified: "${card.modified}"`);

	// 添加标签到YAML
	if (card.tags && card.tags.length > 0) {
		lines.push("tags:");
		for (const _tag of card.tags) {
			lines.push(`  - "${_tag}"`);
		}
	}

	// 添加FSRS数据到YAML（修复属性名不一致问题）
	if (card.fsrs) {
		lines.push("weave_fsrs:");
		lines.push(`  due: "${card.fsrs.due}"`);
		lines.push(`  stability: ${card.fsrs.stability}`);
		lines.push(`  difficulty: ${card.fsrs.difficulty}`);
		lines.push(`  state: ${card.fsrs.state}`);
		lines.push(`  reps: ${card.fsrs.reps}`);
		lines.push(`  lapses: ${card.fsrs.lapses}`);
		lines.push(`  elapsed_days: ${card.fsrs.elapsedDays}`); // 使用 camelCase 字段名
		lines.push(`  scheduled_days: ${card.fsrs.scheduledDays}`); // 使用 camelCase 字段名
		if (card.fsrs.lastReview) {
			// 正确的属性名是 lastReview
			lines.push(`  last_review: "${card.fsrs.lastReview}"`);
		}
	}

	// 添加其他元数据
	if (card.priority) {
		lines.push(`priority: ${card.priority}`);
	}

	//  从专用字段读取溯源信息（不从fields读取）
	if (card.sourceBlock || card.sourceFile) {
		lines.push("weave_source:");
		if (card.sourceBlock) {
			lines.push(`  block_link: "${card.sourceBlock}"`);
		}
		if (card.sourceFile) {
			lines.push(`  file_path: "${card.sourceFile}"`);
		}
	}

	lines.push("---");
	lines.push("");

	// content 是唯一数据源
	if (card.content?.trim()) {
		logger.debug(
			`[CardMarkdownSerializer] 使用 content 生成 Markdown (${card.content.length}字符)`
		);
		lines.push(card.content.trim());
	} else {
		//  异常情况：content 为空
		logger.warn("[CardMarkdownSerializer] content 为空！卡片数据异常:", card.uuid);
		lines.push(""); // 空内容
	}

	//  不再处理 fields（已废弃）
	// 如果需要访问字段，使用 getCardFields(card) 实时解析

	return lines.join("\n");
}

/**
 * 分离YAML frontmatter和Markdown内容
 */
export function parseFrontmatterAndContent(content: string): {
	frontmatter: Record<string, any>;
	markdownContent: string;
} {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		return {
			frontmatter: {},
			markdownContent: content,
		};
	}

	const frontmatterText = match[1];
	const markdownContent = match[2];

	try {
		// 简单的YAML解析（支持基本格式和一层嵌套对象）
		const frontmatter: Record<string, any> = {};
		const lines = frontmatterText.split("\n");

		let currentKey = "";
		let currentObject: Record<string, any> | null = null;
		let isArray = false;
		let arrayItems: string[] = [];

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			// 检测缩进级别
			const indentLevel = line.match(/^(\s*)/)?.[1]?.length || 0;
			const isIndented = indentLevel >= 2;

			if (trimmedLine.startsWith("- ")) {
				// 数组项
				if (isArray) {
					const item = trimmedLine.substring(2).trim();
					// 移除引号
					const cleanItem = item.replace(/^["']|["']$/g, "");
					arrayItems.push(cleanItem);
				}
			} else if (trimmedLine.includes(":")) {
				const colonIndex = trimmedLine.indexOf(":");
				const key = trimmedLine.substring(0, colonIndex).trim();
				const value = trimmedLine.substring(colonIndex + 1).trim();

				if (isIndented) {
					//  嵌套对象的字段
					if (currentObject) {
						if (value === "") {
							// 嵌套对象内的数组或嵌套对象（暂不支持多层嵌套）
							currentObject[key] = "";
						} else {
							// 移除引号并转换类型
							let cleanValue: any = value.replace(/^["']|["']$/g, "");

							// 尝试转换数字
							if (/^\d+$/.test(cleanValue)) {
								cleanValue = parseInt(cleanValue);
							} else if (/^\d+\.\d+$/.test(cleanValue)) {
								cleanValue = parseFloat(cleanValue);
							}

							currentObject[key] = cleanValue;
						}
					}
				} else {
					// 顶级字段
					// 保存上一个数组
					if (isArray && currentKey) {
						frontmatter[currentKey] = arrayItems;
						arrayItems = [];
						isArray = false;
					}

					// 保存上一个对象
					if (currentObject && currentKey) {
						frontmatter[currentKey] = currentObject;
						currentObject = null;
					}

					if (value === "") {
						// 可能是数组或对象的开始
						currentKey = key;
						isArray = true;
						arrayItems = [];
						currentObject = {};
					} else {
						// 简单键值对
						currentKey = key;
						isArray = false;
						currentObject = null;
						// 移除引号并转换类型
						let cleanValue: any = value.replace(/^["']|["']$/g, "");

						// 尝试转换数字
						if (/^\d+$/.test(cleanValue)) {
							cleanValue = parseInt(cleanValue);
						} else if (/^\d+\.\d+$/.test(cleanValue)) {
							cleanValue = parseFloat(cleanValue);
						}

						frontmatter[key] = cleanValue;
					}
				}
			}
		}

		// 保存最后一个数组或对象
		if (isArray && currentKey && arrayItems.length > 0) {
			frontmatter[currentKey] = arrayItems;
		} else if (currentObject && currentKey && Object.keys(currentObject).length > 0) {
			frontmatter[currentKey] = currentObject;
		}

		return {
			frontmatter,
			markdownContent,
		};
	} catch (error) {
		logger.error("[CardMarkdownSerializer] 解析YAML frontmatter失败:", error);
		return {
			frontmatter: {},
			markdownContent: content,
		};
	}
}

/**
 * 解析Markdown内容的各个部分
 *  支持 ---div--- 分隔符和传统的 ## 标题格式
 */
export function parseMarkdownSections(content: string): {
	front?: string;
	back?: string;
	notes?: string;
	tags?: string[];
	otherFields?: Record<string, string>;
} {
	const sections: any = { otherFields: {} };

	//  优先检测 ---div--- 分隔符
	if (content.includes("---div---")) {
		const parts = content.split("---div---");
		if (parts.length >= 2) {
			sections.front = parts[0].trim();
			sections.back = parts[1].trim();

			// 处理剩余部分（如果有多个分隔符）
			if (parts.length > 2) {
				sections.back += `\n\n${parts.slice(2).join("\n---div---\n").trim()}`;
			}

			return sections;
		}
	}

	//  回退到传统的 ## 标题格式解析
	const lines = content.split("\n");
	let currentSection = "";
	let currentContent: string[] = [];

	for (const line of lines) {
		// 跳过注释行
		if (line.trim().startsWith("<!--")) continue;
		if (line.trim() === "---") continue;

		// 检测标题
		if (line.startsWith("## ")) {
			// 保存上一个部分
			if (currentSection && currentContent.length > 0) {
				const content = currentContent.join("\n").trim();
				if (content) {
					assignSectionContent(sections, currentSection, content);
				}
			}

			// 开始新部分
			currentSection = line.substring(3).trim();
			currentContent = [];
		} else if (line.startsWith("### ")) {
			// 处理其他字段的子标题
			if (currentSection === "其他字段") {
				// 保存上一个字段
				if (currentContent.length > 0) {
					const fieldName = currentContent[0]?.substring(4).trim();
					const fieldContent = currentContent.slice(1).join("\n").trim();
					if (fieldName && fieldContent) {
						sections.otherFields[fieldName] = fieldContent;
					}
				}

				// 开始新字段
				currentContent = [line];
			} else {
				currentContent.push(line);
			}
		} else if (line.startsWith("#") && !line.startsWith("##")) {
		} else {
			currentContent.push(line);
		}
	}

	// 处理最后一个部分
	if (currentSection && currentContent.length > 0) {
		const content = currentContent.join("\n").trim();
		if (content) {
			assignSectionContent(sections, currentSection, content);
		}
	}

	// 回退：如果没有解析到任何内容，将整个内容作为 front 字段
	// 这解决了只有front内容的卡片编辑保存失败的问题
	if (!sections.front && !sections.back && Object.keys(sections.otherFields || {}).length === 0) {
		const trimmedContent = content.trim();
		if (trimmedContent) {
			logger.debug("[CardMarkdownSerializer] 终极回退：将整个内容解析为front字段");
			sections.front = trimmedContent;
		}
	}

	return sections;
}

/**
 * 分配部分内容到对应字段
 */
function assignSectionContent(sections: any, sectionName: string, content: string): void {
	switch (sectionName) {
		case "正面":
			sections.front = content;
			break;
		case "背面":
			sections.back = content;
			break;
		case "笔记":
			sections.notes = content;
			break;
		case "标签": {
			// 解析标签
			const tagMatches = content.match(/#\w+/g);
			if (tagMatches) {
				sections.tags = tagMatches.map((tag) => tag.substring(1));
			}
			break;
		}
		default:
			// 其他字段已在parseMarkdownSections中处理
			break;
	}
}

/**
 * 从Markdown内容自动检测卡片类型
 *
 *  与 CardCreationBridge.detectCardTypeFromContent 保持一致
 */
export function detectCardTypeFromContent(content: string): "basic" | "cloze" | "multiple" {
	if (!content || !content.trim()) {
		return "basic";
	}

	//  优先级检测顺序：从特殊到一般

	// 1 检测挖空（Anki格式 {{c1::}} 或 Markdown高亮 ==）
	// 注意：不区分普通挖空和渐进式挖空，统一返回 'cloze'
	// 渐进式挖空的检测和转换由 ProgressiveClozeGateway 统一处理
	const hasAnkiCloze = content.includes("{{c");
	const hasMarkdownHighlight = hasAnyClozeSyntax(content);

	if (hasAnkiCloze || hasMarkdownHighlight) {
		logger.debug(
			`[CardMarkdownSerializer] ✅ 检测到挖空标记 (Anki: ${hasAnkiCloze}, Markdown: ${hasMarkdownHighlight})`
		);
		return "cloze";
	}

	// 3 检测选择题
	if (content.includes("---choice---") || /^[A-D][.)、]\s/m.test(content)) {
		logger.debug("[CardMarkdownSerializer] ✅ 检测到选择题标记");
		return "multiple";
	}

	// 4 默认：基础问答题
	logger.debug("[CardMarkdownSerializer] ⚠️ 未检测到特殊标记，返回basic");
	return "basic";
}

/**
 * 根据卡片类型获取对应的解析器
 */
function getParserForDetectedType(cardType: "basic" | "cloze" | "multiple"): any {
	switch (cardType) {
		case "cloze":
			return new ClozeCardParser();
		case "multiple":
			return new ChoiceCardParser();
		default:
			return new QACardParser();
	}
}

/**
 * 将Markdown内容解析为卡片数据（遵循卡片数据结构规范 v1.0）
 *
 *  核心原则：
 * 1. 将Markdown内容保存到card.content（权威数据源）
 * 2. 使用标准化解析器从content生成fields（派生数据）
 * 3. 溯源信息保存到专用字段（不混入fields）
 * 4. 自动检测题型并更新card.type
 */
export function markdownToCard(content: string, originalCard: Card): Card {
	const updatedCard: Card = { ...originalCard };

	try {
		// 删除继承的 fields（如果有）
		if (updatedCard.fields) {
			updatedCard.fields = undefined;
			logger.debug("[CardMarkdownSerializer] 删除继承的 fields 字段");
		}

		// 分离YAML frontmatter和Markdown内容
		const { frontmatter, markdownContent } = parseFrontmatterAndContent(content);

		//  步骤1：将Markdown内容保存到card.content（权威数据源）
		updatedCard.content = markdownContent.trim();
		logger.debug(`[CardMarkdownSerializer] 更新content字段: ${markdownContent.length}字符`);

		//  智能type检测：仅在必要时更新
		// 原则：
		// 1. CardCreationBridge创建的卡片：type已正确，不覆盖
		// 2. 新建卡片模态窗：type=basic（默认值），需要自动检测
		// 3. V2架构：不再自动设置 'progressive'，由 ProgressiveClozeGateway 统一处理
		const detectedType = detectCardTypeFromContent(markdownContent);

		const isStillProgressive =
			(updatedCard.type === CardType.ProgressiveParent ||
				updatedCard.type === CardType.ProgressiveChild) &&
			hasProgressiveClozeContent(markdownContent);

		// 内容已不再是渐进式时，允许题型跟随内容自动切换
		if (!isStillProgressive && updatedCard.type !== detectedType) {
			updatedCard.type = detectedType as any;
			logger.debug(
				`[CardMarkdownSerializer] ✅ 自动检测并更新type: ${originalCard.type} → ${detectedType}`
			);
		}

		// 从frontmatter更新元数据
		if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
			updatedCard.tags = frontmatter.tags;
		}

		if (frontmatter.priority) {
			updatedCard.priority = frontmatter.priority;
		}

		//  从frontmatter解析FSRS数据（修复属性访问问题）
		if (frontmatter.weave_fsrs && typeof frontmatter.weave_fsrs === "object" && updatedCard.fsrs) {
			const fsrsData = frontmatter.weave_fsrs;
			if (fsrsData.due) updatedCard.fsrs.due = fsrsData.due;
			if (fsrsData.stability !== undefined) updatedCard.fsrs.stability = fsrsData.stability;
			if (fsrsData.difficulty !== undefined) updatedCard.fsrs.difficulty = fsrsData.difficulty;
			if (fsrsData.state !== undefined) updatedCard.fsrs.state = fsrsData.state;
			if (fsrsData.reps !== undefined) updatedCard.fsrs.reps = fsrsData.reps;
			if (fsrsData.lapses !== undefined) updatedCard.fsrs.lapses = fsrsData.lapses;
			if (fsrsData.elapsed_days !== undefined) updatedCard.fsrs.elapsedDays = fsrsData.elapsed_days; // 映射到 camelCase 属性
			if (fsrsData.scheduled_days !== undefined)
				updatedCard.fsrs.scheduledDays = fsrsData.scheduled_days; // 映射到 camelCase 属性
			if (fsrsData.last_review) updatedCard.fsrs.lastReview = fsrsData.last_review; // 映射到 lastReview 属性
		}

		//  从frontmatter解析来源追踪数据（保存到专用字段）
		if (frontmatter.weave_source && typeof frontmatter.weave_source === "object") {
			const sourceData = frontmatter.weave_source;
			if (sourceData.block_link) {
				updatedCard.sourceBlock = sourceData.block_link; //  专用字段
			}
			if (sourceData.file_path) {
				updatedCard.sourceFile = sourceData.file_path; //  专用字段
			}
			// document和unique_id是旧版字段，不再使用
		}

		//  步骤2：使用对应题型的解析器从content生成fields
		// 注意：使用detectedType（从内容检测）而不是updatedCard.type（可能是旧值）
		const _parser = getParserForDetectedType(detectedType);
		// 只使用 content，不生成 fields
		logger.debug("[markdownToCard] 使用 content 作为唯一数据源");

		// 直接使用 Markdown 内容作为原始内容
		updatedCard.content = markdownContent;

		// 不再生成或更新 fields
		// 所有内容已保存在 card.content 中

		// 更新修改时间
		updatedCard.modified = new Date().toISOString();

		logger.debug("[CardMarkdownSerializer] 卡片数据解析完成（Content-Only）:", {
			cardId: updatedCard.uuid,
			contentLength: updatedCard.content?.length || 0,
			tagsCount: updatedCard.tags?.length || 0,
		});

		// 自动提取 Markdown 中的 #标签并合并到 YAML 标签中
		const extractedTags = TagExtractor.extractTagsExcludingCode(markdownContent);
		if (extractedTags.length > 0) {
			updatedCard.tags = TagExtractor.mergeTags(markdownContent, updatedCard.tags || [], "smart");
			logger.debug("[CardMarkdownSerializer] 自动提取标签:", extractedTags);
		}

		return updatedCard;
	} catch (error) {
		logger.error("[CardMarkdownSerializer] 解析Markdown内容失败:", error);
		// 返回原始卡片，避免数据丢失
		return originalCard;
	}
}
