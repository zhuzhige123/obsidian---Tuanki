import { logger } from "../../../utils/logger";
/**
 * Markdown 基础格式转换层
 * 负责将 Markdown 格式转换为 HTML
 */

import type { ConversionContext, LayerConversionResult } from "../../../types/ankiconnect-types";
import type { IConversionLayer } from "./ConversionLayer";

/**
 * Markdown → HTML 转换层
 *
 * 转换规则：
 * - 换行：\n → <br>
 * - 粗体：**text** → <strong>text</strong>
 * - 斜体：*text* → <em>text</em>
 * - 代码：`code` → <code>code</code>
 * - 标题：## Title → <h2>Title</h2>
 */
export class MarkdownLayer implements IConversionLayer {
	name = "MarkdownLayer";
	description = "基础 Markdown 格式转换为 HTML";
	priority = 50; // 中等优先级（在公式、双链之后，高亮之前）
	enabled = true;

	convert(content: string, _context: ConversionContext): LayerConversionResult {
		let converted = content;
		let changeCount = 0;
		const warnings: string[] = [];

		try {
			// 1. 标题转换（## → <h2>，### → <h3>，等等）
			converted = converted.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes: string, text: string) => {
				const level = hashes.length;
				changeCount++;
				return `<h${level}>${text.trim()}</h${level}>`;
			});

			// 2. 粗体：**text** 或 __text__ → <strong>text</strong>
			converted = converted.replace(/\*\*(.+?)\*\*/g, (_match, text) => {
				changeCount++;
				return `<strong>${text}</strong>`;
			});
			converted = converted.replace(/__(.+?)__/g, (_match, text) => {
				changeCount++;
				return `<strong>${text}</strong>`;
			});

			// 3. 斜体：*text* 或 _text_ → <em>text</em>
			// 注意：避免与粗体冲突，使用负向前瞻
			converted = converted.replace(/(?:^|[^*])\*([^*]+?)\*(?!\*)/g, (match, text) => {
				changeCount++;
				const prefix = match.charAt(0) === "*" ? "" : match.charAt(0);
				return `${prefix}<em>${text}</em>`;
			});
			converted = converted.replace(/(?:^|[^_])_([^_]+?)_(?!_)/g, (match, text) => {
				changeCount++;
				const prefix = match.charAt(0) === "_" ? "" : match.charAt(0);
				return `${prefix}<em>${text}</em>`;
			});

			// 4. 行内代码：`code` → <code>code</code>
			converted = converted.replace(/`([^`]+?)`/g, (_match, code) => {
				changeCount++;
				return `<code>${code}</code>`;
			});

			// 5. 删除线：~~text~~ → <del>text</del>
			converted = converted.replace(/~~(.+?)~~/g, (_match, text) => {
				changeCount++;
				return `<del>${text}</del>`;
			});

			// 6. 换行转换：单个 \n → <br>
			// 注意：保留段落分隔（连续两个换行）
			converted = converted.replace(/([^\n])\n(?!\n)/g, "$1<br>\n");
			// 统计换行数
			const brCount = (converted.match(/<br>/g) || []).length;
			if (brCount > 0) {
				changeCount += brCount;
			}

			// 7. 段落：连续两个换行 → <p>包裹
			// 分割段落
			const paragraphs = converted.split(/\n\n+/);
			if (paragraphs.length > 1) {
				converted = paragraphs
					.map((p) => p.trim())
					.filter((p) => p.length > 0)
					.map((_p) => {
						// 如果段落以标题标签开头，不包裹 <p>
						if (_p.startsWith("<h")) {
							return _p;
						}
						return `<p>${_p}</p>`;
					})
					.join("\n");
				changeCount++;
			}

			logger.debug(`[MarkdownLayer] 转换完成: ${changeCount} 处修改`);
		} catch (error) {
			logger.error("[MarkdownLayer] 转换失败:", error);
			warnings.push(`Markdown 转换失败: ${error instanceof Error ? error.message : "未知错误"}`);
		}

		return {
			content: converted,
			changeCount,
			warnings,
		};
	}
}
