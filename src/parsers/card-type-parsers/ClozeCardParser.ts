/**
 * 挖空题解析器
 * 遵循卡片数据结构规范 v1.0
 */

import { ProgressiveClozeAnalyzer } from "../../services/progressive-cloze/ProgressiveClozeAnalyzer";
import type { ParseResult } from "../../types/metadata-types";
import { ParseErrorType } from "../../types/metadata-types";
import { replaceConfiguredClozeSyntax, wrapWithConfiguredCloze } from "../../utils/cloze-syntax";
import { stripHintBlock } from "../../utils/hint-block-utils";
import { extractBodyContent } from "../../utils/yaml-utils";
import { CardType, MarkdownFieldsConverter } from "../MarkdownFieldsConverter";
import { CLOZE_PATTERNS } from "../regex-patterns";

/**
 * 挖空题解析器
 *
 * 支持格式：
 * 1. ==挖空内容==（Obsidian风格，优先）
 * 2. {{c1::挖空内容}}（Anki风格，兼容）
 *
 *  标准字段：只生成 { text }
 *  禁止添加元数据字段到fields（context/hint/clozeCount等）
 */
export class ClozeCardParser extends MarkdownFieldsConverter {
	/**
	 * 解析Markdown为fields
	 *
	 * 标准字段：{ text }
	 * text保留完整的content，包含挖空标记
	 */
	parseMarkdownToFields(content: string, _type: CardType): ParseResult {
		try {
			// 先剥离 YAML frontmatter，只保留正文（Anki 导出不需要元数据）
			const bodyContent = extractBodyContent(content);
			const cleanContent = stripHintBlock(bodyContent).trim();

			if (!cleanContent) {
				return this.createErrorResult(
					ParseErrorType.INVALID_FORMAT,
					"内容为空",
					content,
					"请输入挖空题内容"
				);
			}

			// 使用 ProgressiveClozeAnalyzer 分析
			const analyzer = new ProgressiveClozeAnalyzer();
			const analysis = analyzer.analyze(cleanContent);

			// 检查是否包含任何挖空标记
			if (!analysis.hasProgressiveCloze && !analysis.hasHighlight) {
				return this.createErrorResult(
					ParseErrorType.NO_CLOZE_FOUND,
					"未找到挖空标记",
					content,
					"请使用 ==内容== 或 {{c1::内容}} 标记挖空部分"
				);
			}

			// 如果有渐进式挖空，则验证编号
			if (analysis.hasProgressiveCloze) {
				const validation = analyzer.validateClozeNumbers(analysis.clozes);
				if (!validation.valid) {
					let errorMsg = "挖空编号不连续";
					if (validation.missingNumbers.length > 0) {
						errorMsg += `，缺少: c${validation.missingNumbers.join(", c")}`;
					}
					if (validation.duplicateNumbers.length > 0) {
						errorMsg += `，重复: c${validation.duplicateNumbers.join(", c")}`;
					}

					return this.createErrorResult(
						ParseErrorType.INVALID_FORMAT,
						errorMsg,
						content,
						"请确保挖空编号从c1开始连续递增"
					);
				}
			}

			// 构建标准fields对象
			const fields: Record<string, string> = {
				text: cleanContent,
			};

			// 在结果中附加分析信息（供后续处理使用）
			const result = this.createSuccessResult(fields, content, undefined);
			return {
				...result,
				metadata: {
					...result.metadata,
					clozeAnalysis: analysis,
				},
			};
		} catch (error) {
			return this.createErrorResult(
				ParseErrorType.INVALID_FORMAT,
				`解析失败: ${error instanceof Error ? error.message : String(error)}`,
				content
			);
		}
	}

	/**
	 * 从fields重建Markdown
	 *
	 * 重建规则：
	 * - 直接返回text字段（包含挖空标记）
	 */
	buildMarkdownFromFields(fields: Record<string, string>, _type: CardType): string {
		// 提取text字段（兼容大小写和旧字段名）
		const text = fields.text || fields.Text || fields.front || fields.Front || "";
		return text;
	}

	/**
	 * 转换Obsidian风格挖空为Anki风格（用于Anki同步）
	 */
	static convertObsidianToAnkiStyle(content: string): string {
		let result = content;
		let clozeIndex = 1;

		result = replaceConfiguredClozeSyntax(result, (match) => {
			const replacement = `{{c${clozeIndex}::${match.text}}}`;
			clozeIndex++;
			return replacement;
		});

		return result;
	}

	/**
	 * 转换Anki风格挖空为Obsidian风格（用于Obsidian编辑）
	 */
	static convertAnkiToObsidianStyle(content: string): string {
		return content.replace(CLOZE_PATTERNS.ANKI_STYLE, (_match, _num, text, hint) => {
			const wrapped = wrapWithConfiguredCloze(text);
			return hint ? `${wrapped}(${hint})` : wrapped;
		});
	}
}
