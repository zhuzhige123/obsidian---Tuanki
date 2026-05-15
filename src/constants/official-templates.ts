/**
 * 官方模板定义
 * 这些模板由插件提供，不可删除和编辑
 *
 *  重要：官方模板的唯一定义源为 DEFAULT_TEMPLATES
 * 此文件仅提供便捷的访问接口和工具函数
 */

import { DEFAULT_TEMPLATES, type ParseTemplate } from "../types/newCardParsingTypes";
import { escapeRegexLiteral, getGlobalClozeDelimiterSettings } from "../utils/cloze-syntax";

function getRuntimeOfficialTemplate(template: ParseTemplate): ParseTemplate {
	if (template.id !== "official-cloze" || !Array.isArray(template.fields)) {
		return template;
	}

	const { openDelimiter, closeDelimiter } = getGlobalClozeDelimiterSettings();
	const clozePattern = `${escapeRegexLiteral(openDelimiter)}([\\s\\S]+?)${escapeRegexLiteral(closeDelimiter)}`;

	return {
		...template,
		fields: template.fields.map((field) =>
			field.name === "Cloze"
				? {
					...field,
					pattern: clozePattern,
					flags: "g",
				}
				: field
		),
	};
}

/**
 * 官方模板列表
 * 直接从 DEFAULT_TEMPLATES 中筛选出官方模板
 */
export const OFFICIAL_TEMPLATES: ParseTemplate[] = DEFAULT_TEMPLATES.filter((t) => t.isOfficial);

export function getOfficialTemplates(): ParseTemplate[] {
	return DEFAULT_TEMPLATES.filter((template) => template.isOfficial).map(getRuntimeOfficialTemplate);
}

/**
 * 官方模板ID列表（仅包含三个核心模板）
 */
export const OFFICIAL_TEMPLATE_IDS = ["official-qa", "official-choice", "official-cloze"] as const;

/**
 * 官方模板ID类型
 */
export type OfficialTemplateId = typeof OFFICIAL_TEMPLATE_IDS[number];

/**
 * 检查给定的模板ID是否为官方模板
 * @param templateId 模板ID
 * @returns 是否为官方模板
 */
export function isOfficialTemplate(templateId: string): boolean {
	return (OFFICIAL_TEMPLATE_IDS as readonly string[]).includes(templateId);
}

/**
 * 根据ID获取官方模板
 * @param templateId 模板ID
 * @returns 官方模板对象，如果不存在则返回null
 */
export function getOfficialTemplateById(templateId: string): ParseTemplate | null {
	return getOfficialTemplates().find((t) => t.id === templateId) || null;
}

/**
 * 获取默认模板（问答题）
 * @returns 默认的问答题模板
 */
export function getDefaultTemplate(): ParseTemplate {
	const template = getOfficialTemplates().find((t) => t.id === "official-qa");
	if (!template) {
		throw new Error("Default QA template not found. This should never happen.");
	}
	return template;
}
