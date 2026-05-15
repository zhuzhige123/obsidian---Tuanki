/**
 * 高亮和样式转换层
 * 负责转换 Obsidian 特殊样式标记
 *
 * 转换规则：
 * - ==text== → <mark>text</mark>
 * - ~~text~~ → <del>text</del>
 */

import type { ConversionContext, LayerConversionResult } from "../../../types/ankiconnect-types";
import { getConfiguredClozeMatches } from "../../../utils/cloze-syntax";
import { BoundaryDetector, CONVERSION_REGEX, StringUtils } from "../utils/conversion-utils";
import { BaseConversionLayer } from "./ConversionLayer";

export class HighlightLayer extends BaseConversionLayer {
	name = "HighlightLayer";
	priority = 60; // 中等优先级
	description = "高亮和样式转换（==highlight== 和 ~~strikethrough~~）";

	convert(content: string, context: ConversionContext): LayerConversionResult {
		const options = context.options.highlightConversion;

		if (!options.enabled) {
			this.debug("高亮转换已禁用");
			return this.createResult(content, 0);
		}

		this.debug("开始高亮和样式转换");

		const warnings: string[] = [];
		let convertedContent = content;
		let totalChanges = 0;

		// 转换高亮
		const highlightResult = this.convertHighlight(convertedContent);
		convertedContent = highlightResult.content;
		totalChanges += highlightResult.count;

		this.debug("高亮转换完成", { changeCount: highlightResult.count });

		// 转换删除线
		const strikethroughResult = this.convertStrikethrough(convertedContent);
		convertedContent = strikethroughResult.content;
		totalChanges += strikethroughResult.count;

		this.debug("删除线转换完成", { changeCount: strikethroughResult.count });

		this.debug("高亮和样式转换总结", { totalChanges });

		return this.createResult(convertedContent, totalChanges, warnings);
	}

	/**
	 * 转换高亮
	 * ==text== → <mark>text</mark>
	 */
	private convertHighlight(content: string): { content: string; count: number } {
		let count = 0;
		const matches = getConfiguredClozeMatches(content);
		if (matches.length === 0) {
			return { content, count };
		}

		let cursor = 0;
		let result = "";
		for (const match of matches) {
			result += content.slice(cursor, match.index);
			if (BoundaryDetector.shouldSkipMatch(content, match.index)) {
				result += match.fullMatch;
			} else {
				count++;
				result += `<mark style="background-color:#FEF08A;padding:2px 4px;border-radius:2px;">${StringUtils.escapeHtml(
					match.text
				)}</mark>`;
			}
			cursor = match.endIndex;
		}
		result += content.slice(cursor);

		return { content: result, count };
	}

	/**
	 * 转换删除线
	 * ~~text~~ → <del>text</del>
	 */
	private convertStrikethrough(content: string): { content: string; count: number } {
		let count = 0;

		const result = content.replace(CONVERSION_REGEX.STRIKETHROUGH, (match, text, offset) => {
			// 检查是否在代码块中
			if (BoundaryDetector.shouldSkipMatch(content, offset)) {
				return match;
			}

			count++;

			// 转换为 del 标签
			return `<del>${StringUtils.escapeHtml(text)}</del>`;
		});

		return { content: result, count };
	}
}
