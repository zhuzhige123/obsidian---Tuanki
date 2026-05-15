/**
 * 字段显示面解析器
 *
 * 基于Anki模板(qfmt/afmt)智能解析字段显示面
 *
 * @module domain/apkg/converter
 */

import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import type { AnkiModel, FieldParseResult, FieldSideMap } from "../types";

/**
 * 从模板中提取字段名称
 */
function extractFieldsFromTemplate(template: string): Set<string> {
	const fields = new Set<string>();
	if (!template || typeof template !== "string") {
		return fields;
	}

	const regex = /\{\{([^}]+?)\}\}/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(template)) !== null) {
		let fieldName = match[1].trim();

		// 过滤特殊标记
		if (isSpecialTag(fieldName)) {
			continue;
		}

		// 移除修饰符
		fieldName = stripModifiers(fieldName);

		if (fieldName.length === 0) {
			continue;
		}

		fields.add(fieldName);
	}

	return fields;
}

/**
 * 判断是否为特殊标记
 */
function isSpecialTag(tag: string): boolean {
	const specialPrefixes = ["#", "/", "!", "^"];
	if (specialPrefixes.some((prefix) => tag.startsWith(prefix))) {
		return true;
	}

	const specialTags = ["FrontSide", "Card", "Deck", "Subdeck", "CardFlag", "Type"];
	return specialTags.includes(tag);
}

/**
 * 移除字段修饰符
 */
function stripModifiers(fieldName: string): string {
	const modifiers = ["cloze:", "type:", "hint:", "text:", "furigana:", "kana:", "kanji:"];

	for (const modifier of modifiers) {
		if (fieldName.startsWith(modifier)) {
			return fieldName.substring(modifier.length).trim();
		}
	}

	return fieldName;
}

/**
 * 字段名语义识别规则
 * 基于字段名常见模式判断显示面
 */
function getFieldSideBySemantic(fieldName: string): "front" | "back" | "both" | null {
	const lowerName = fieldName.toLowerCase().trim();

	// 正面字段关键词（中英文）
	const frontKeywords = ["front", "question", "问题", "题目", "正面", "问", "q"];
	// 背面字段关键词（中英文）
	const backKeywords = ["back", "answer", "答案", "背面", "答", "a", "解答", "解释"];

	// 完全匹配或包含关键词
	for (const keyword of frontKeywords) {
		if (lowerName === keyword || lowerName.includes(keyword)) {
			return "front";
		}
	}

	for (const keyword of backKeywords) {
		if (lowerName === keyword || lowerName.includes(keyword)) {
			return "back";
		}
	}

	// 无法通过语义判断
	return null;
}

/**
 * 为给定Anki模型的所有字段确定其显示面
 */
function determineAllFieldSides(model: AnkiModel): Record<string, "front" | "back" | "both"> {
	const fieldSideMap: Record<string, "front" | "back" | "both"> = {};

	const mainTemplate = model.tmpls[0];
	if (!mainTemplate) {
		// 模型无模板，字段默认为 both
		for (const _field of model.flds) {
			fieldSideMap[_field.name] = "both";
		}
		return fieldSideMap;
	}

	const frontFields = extractFieldsFromTemplate(mainTemplate.qfmt);
	const backFields = extractFieldsFromTemplate(mainTemplate.afmt);

	for (const _field of model.flds) {
		// 优先使用字段名的语义识别
		const semanticSide = getFieldSideBySemantic(_field.name);
		if (semanticSide) {
			fieldSideMap[_field.name] = semanticSide;
			// 字段语义识别完成
			continue;
		}

		// 回退到模板解析逻辑
		const appearsInFront = frontFields.has(_field.name);
		const appearsInBack = backFields.has(_field.name);

		if (appearsInFront && appearsInBack) {
			fieldSideMap[_field.name] = "both";
		} else if (appearsInFront) {
			fieldSideMap[_field.name] = "front";
		} else if (appearsInBack) {
			fieldSideMap[_field.name] = "back";
		} else {
			fieldSideMap[_field.name] = "both";
		}

		// 字段模板解析完成
	}

	return fieldSideMap;
}

/**
 * 字段显示面解析器
 */
export class FieldSideResolver {
	private logger: APKGLogger;

	constructor() {
		this.logger = new APKGLogger({ prefix: "[FieldSideResolver]" });
	}

	/**
	 * 解析所有模型的字段显示面
	 *
	 * @param models - Anki模型列表
	 * @returns 字段显示面映射
	 */
	resolve(models: AnkiModel[]): FieldSideMap {
		this.logger.info(`开始解析 ${models.length} 个模型的字段显示面`);

		const fieldSideMap: FieldSideMap = {};

		for (const model of models) {
			const sideConfig = determineAllFieldSides(model);
			fieldSideMap[model.id] = sideConfig;

			this.logger.debug(`模型 "${model.name}" 字段配置:`, sideConfig);
		}

		this.logger.info("字段显示面解析完成");
		return fieldSideMap;
	}

	/**
	 * 解析单个模型的字段显示面
	 *
	 * @param model - Anki模型
	 * @returns 字段显示面映射
	 */
	resolveSingle(model: AnkiModel): Record<string, "front" | "back" | "both"> {
		return determineAllFieldSides(model);
	}

	/**
	 * 分析模板并生成详细报告
	 *
	 * @param model - Anki模型
	 * @returns 解析结果列表
	 */
	analyze(model: AnkiModel): FieldParseResult[] {
		if (!model.tmpls || model.tmpls.length === 0) {
			this.logger.warn(`模型 "${model.name}" 没有模板`);
			return [];
		}

		const template = model.tmpls[0];
		const frontFields = extractFieldsFromTemplate(template.qfmt);
		const backFields = extractFieldsFromTemplate(template.afmt);

		const results: FieldParseResult[] = model.flds.map((_field) => {
			const inFront = frontFields.has(_field.name);
			const inBack = backFields.has(_field.name);

			let side: "front" | "back" | "both";
			let confidence: "high" | "medium" | "low";

			if (inFront && inBack) {
				side = "both";
				confidence = "high";
			} else if (inFront) {
				side = "front";
				confidence = "high";
			} else if (inBack) {
				side = "back";
				confidence = "high";
			} else {
				// 字段未在任何模板中使用
				side = "both";
				confidence = "low";
				this.logger.warn(`字段 "${_field.name}" 未在模板中使用，默认设为 both`);
			}

			return {
				fieldName: _field.name,
				side,
				appearsInFront: inFront,
				appearsInBack: inBack,
				confidence,
			};
		});

		return results;
	}
}
