/**
 * HTML内容转换器
 *
 * 负责将Anki的HTML内容转换为Obsidian Markdown语法
 *
 * @module domain/apkg/converter
 */

import { APKGLogger } from "../../../infrastructure/logger/APKGLogger";
import { wrapWithConfiguredCloze } from "../../../utils/cloze-syntax";
import { throwIfImportAborted, yieldImportTask } from "../ImportTaskControl";
import type { ConversionConfig } from "../types";

/**
 * 媒体引用
 */
export interface MediaRef {
	originalName: string;
	placeholder: string;
	type: "image" | "audio" | "video";
}

/**
 * HTML内容转换器
 */
export class ContentConverter {
	private logger: APKGLogger;
	private mediaCounter = 0;
	private config: ConversionConfig | null = null;

	constructor() {
		this.logger = new APKGLogger({ prefix: "[ContentConverter]" });
	}

	/**
	 * 转换HTML为Markdown
	 *
	 * @param html - 原始HTML内容
	 * @returns 转换结果
	 */
	convert(html: string, config?: ConversionConfig): { markdown: string; mediaRefs: MediaRef[] } {
		const startTime = Date.now();
		this.logger.debug(`开始转换HTML (长度: ${html.length})`);
		this.logger.debug(`原始HTML预览: ${html.substring(0, 200)}...`);

		this.config = config || null;

		// 重置媒体计数器
		this.mediaCounter = 0;

		// 步骤1: 提取媒体引用并替换为占位符
		const { html: processedHtml, mediaRefs } = this.extractMediaReferences(html);
		this.logger.debug(`[步骤1] 提取媒体: ${mediaRefs.length} 个媒体文件`);

		// 步骤2: 转换Anki特定语法
		let result = this.convertAnkiSyntax(processedHtml);
		this.logger.debug("[步骤2] 转换Anki语法完成");

		if (this.config?.preserveStyles) {
			// 轻量转换：尽量保留原始HTML样式，只处理结构换行
			result = this.convertBasicHTMLLight(result);
			this.logger.debug("[步骤3] 轻量HTML结构处理完成");
		} else {
			// 标准转换：完整HTML->Markdown
			result = this.convertBasicHTML(result);
			this.logger.debug("[步骤3] 转换基础HTML标签完成");

			// 步骤4: 转换引用块
			result = this.convertBlockquotes(result);
			this.logger.debug("[步骤4] 转换引用块完成");

			// 步骤5: 转换列表
			result = this.convertLists(result);
			this.logger.debug("[步骤5] 转换列表完成");

			// 步骤6: 转换表格
			result = this.convertTables(result);
			this.logger.debug("[步骤6] 转换表格完成");

			// 步骤7: 转换标题
			result = this.convertHeadings(result);
			this.logger.debug("[步骤7] 转换标题完成");
		}

		// 步骤8: 清理和标准化
		result = this.cleanupMarkdown(result);
		this.logger.debug("[步骤8] 清理完成");

		const duration = Date.now() - startTime;
		this.logger.debug(`转换完成 (耗时: ${duration}ms)`);
		this.logger.debug(`结果预览: ${result.substring(0, 200)}...`);

		return {
			markdown: result,
			mediaRefs,
		};
	}

	/**
	 * 保留卡片字段内容的原始 HTML 结构，仅重写媒体路径
	 *
	 * 用于需要尽量保留卡片字段原始 HTML 内容的导入场景。
	 */
	convertRawHtml(
		html: string,
		mediaPathMap: Map<string, string>,
		config?: ConversionConfig
	): string {
		if (!html) {
			return "";
		}

		let result = html;
		const mediaFormat = config?.mediaFormat || "wikilink";

		result = result.replace(
			/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
			(_match, prefix, src, suffix) => {
				const filename = this.extractFilename(src);
				const path = mediaPathMap.get(filename);
				return path ? `${prefix}${path}${suffix}` : _match;
			}
		);

		result = result.replace(
			/(<video\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
			(_match, prefix, src, suffix) => {
				const filename = this.extractFilename(src);
				const path = mediaPathMap.get(filename);
				return path ? `${prefix}${path}${suffix}` : _match;
			}
		);

		result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, rawFilename) => {
			const filename = String(rawFilename || "").trim();
			const path = mediaPathMap.get(filename);

			if (!path) {
				return _match;
			}

			if (mediaFormat === "markdown") {
				return `[${filename}](${path})`;
			}

			return `<audio controls preload="metadata" src="${path}"></audio>`;
		});

		return result.trim();
	}

	/**
	 * 替换媒体占位符为实际路径
	 *
	 * @param markdown - 包含占位符的Markdown
	 * @param mediaRefs - 媒体引用列表
	 * @param mediaPathMap - 媒体路径映射 (原始文件名 → Obsidian路径)
	 * @returns 替换后的Markdown (媒体已转换为WikiLink格式)
	 */
	replaceMediaPlaceholders(
		markdown: string,
		mediaRefs: MediaRef[],
		mediaPathMap: Map<string, string>,
		config?: ConversionConfig
	): string {
		let result = markdown;

		// 遍历媒体引用，将占位符替换为WikiLink格式
		for (const ref of mediaRefs) {
			// 从映射中获取实际保存的路径
			const path = mediaPathMap.get(ref.originalName);

			if (path) {
				const mediaFormat = config?.mediaFormat || this.config?.mediaFormat || "wikilink";
				const filename = path.split("/").pop() || path;

				const replacement = (() => {
					if (mediaFormat === "markdown") {
						if (ref.type === "image") {
							return `![](${path})`;
						}
						return `[${filename}](${path})`;
					}

					return `![[${path}]]`;
				})();

				// 替换占位符（转义特殊字符以避免正则错误）
				const escapedPlaceholder = this.escapeRegExp(ref.placeholder);
				result = result.replace(new RegExp(escapedPlaceholder, "g"), replacement);

				this.logger.debug(`替换媒体: ${ref.placeholder} → ${replacement}`);
			} else {
				// 未找到文件映射，记录警告
				this.logger.warn(`未找到媒体文件映射: ${ref.originalName}`);
			}
		}

		return result;
	}

	/**
	 * 异步转换HTML为Markdown
	 *
	 * @param html - 原始HTML内容
	 * @param options - 可选参数，包括 signal 用于取消转换
	 * @returns 转换结果
	 */
	async convertAsync(
		html: string,
		config?: ConversionConfig,
		options?: { signal?: AbortSignal }
	): Promise<{ markdown: string; mediaRefs: MediaRef[] }> {
		throwIfImportAborted(options?.signal);

		const startTime = Date.now();
		this.logger.debug(`开始转换HTML (长度: ${html.length})`);
		this.logger.debug(`原始HTML预览: ${html.substring(0, 200)}...`);

		this.config = config || null;

		// 重置媒体计数器
		this.mediaCounter = 0;

		// 步骤1: 提取媒体引用并替换为占位符
		const { html: processedHtml, mediaRefs } = await this.extractMediaReferencesAsync(html, options);
		this.logger.debug(`[步骤1] 提取媒体: ${mediaRefs.length} 个媒体文件`);

		// 步骤2: 转换Anki特定语法
		let result = this.convertAnkiSyntax(processedHtml);
		this.logger.debug("[步骤2] 转换Anki语法完成");
		await yieldImportTask(options?.signal);

		if (this.config?.preserveStyles) {
			// 轻量转换：尽量保留原始HTML样式，只处理结构换行
			result = this.convertBasicHTMLLight(result);
			this.logger.debug("[步骤3] 轻量HTML结构处理完成");
			await yieldImportTask(options?.signal);
		} else {
			// 标准转换：完整HTML->Markdown
			result = this.convertBasicHTML(result);
			this.logger.debug("[步骤3] 转换基础HTML标签完成");
			await yieldImportTask(options?.signal);

			// 步骤4: 转换引用块
			result = this.convertBlockquotes(result);
			this.logger.debug("[步骤4] 转换引用块完成");
			await yieldImportTask(options?.signal);

			// 步骤5: 转换列表
			result = this.convertLists(result);
			this.logger.debug("[步骤5] 转换列表完成");
			await yieldImportTask(options?.signal);

			// 步骤6: 转换表格
			result = this.convertTables(result);
			this.logger.debug("[步骤6] 转换表格完成");
			await yieldImportTask(options?.signal);

			// 步骤7: 转换标题
			result = this.convertHeadings(result);
			this.logger.debug("[步骤7] 转换标题完成");
			await yieldImportTask(options?.signal);
		}

		// 步骤8: 清理和标准化
		result = this.cleanupMarkdown(result);
		this.logger.debug("[步骤8] 清理完成");

		const duration = Date.now() - startTime;
		this.logger.debug(`转换完成 (耗时: ${duration}ms)`);
		this.logger.debug(`结果预览: ${result.substring(0, 200)}...`);

		return {
			markdown: result,
			mediaRefs,
		};
	}

	/**
	 * 异步提取媒体引用并替换为占位符
	 *
	 * @param html - 原始HTML内容
	 * @param options - 可选参数，包括 signal 用于取消转换
	 * @returns 提取媒体引用结果
	 */
	private async extractMediaReferencesAsync(
		html: string,
		options?: { signal?: AbortSignal }
	): Promise<{ html: string; mediaRefs: MediaRef[] }> {
		const mediaRefs: MediaRef[] = [];
		let result = html;

		// 提取图片
		result = result.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_match, src) => {
			const filename = this.extractFilename(src);
			const placeholder = `__MEDIA_${this.mediaCounter++}__`;

			mediaRefs.push({
				originalName: filename,
				placeholder,
				type: "image",
			});

			return placeholder;
		});

		// 提取音频
		result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, filename) => {
			const placeholder = `__MEDIA_${this.mediaCounter++}__`;

			mediaRefs.push({
				originalName: filename.trim(),
				placeholder,
				type: "audio",
			});

			return placeholder;
		});

		// 提取视频
		result = result.replace(/<video[^>]+src=["']([^"']+)["'][^>]*>/gi, (_match, src) => {
			const filename = this.extractFilename(src);
			const placeholder = `__MEDIA_${this.mediaCounter++}__`;

			mediaRefs.push({
				originalName: filename,
				placeholder,
				type: "video",
			});

			return placeholder;
		});

		await yieldImportTask(options?.signal);

		return { html: result, mediaRefs };
	}

	/**
	 * 异步保留卡片字段内容的原始 HTML 结构，仅重写媒体路径
	 *
	 * 用于需要尽量保留卡片字段原始 HTML 内容的导入场景。
	 */
	async convertRawHtmlAsync(
		html: string,
		mediaPathMap: Map<string, string>,
		config?: ConversionConfig,
		options?: { signal?: AbortSignal }
	): Promise<string> {
		if (!html) {
			return "";
		}

		let result = html;
		const mediaFormat = config?.mediaFormat || "wikilink";

		throwIfImportAborted(options?.signal);
		result = result.replace(
			/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
			(_match, prefix, src, suffix) => {
				const filename = this.extractFilename(src);
				const path = mediaPathMap.get(filename);
				return path ? `${prefix}${path}${suffix}` : _match;
			}
		);
		await yieldImportTask(options?.signal);

		result = result.replace(
			/(<video\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
			(_match, prefix, src, suffix) => {
				const filename = this.extractFilename(src);
				const path = mediaPathMap.get(filename);
				return path ? `${prefix}${path}${suffix}` : _match;
			}
		);
		await yieldImportTask(options?.signal);

		result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, rawFilename) => {
			const filename = String(rawFilename || "").trim();
			const path = mediaPathMap.get(filename);

			if (!path) {
				return _match;
			}

			if (mediaFormat === "markdown") {
				return `[${filename}](${path})`;
			}

			return `<audio controls preload="metadata" src="${path}"></audio>`;
		});

		return result.trim();
	}

	/**
	 * 异步替换媒体占位符为实际路径
	 *
	 * @param markdown - 包含占位符的Markdown
	 * @param mediaRefs - 媒体引用列表
	 * @param mediaPathMap - 媒体路径映射 (原始文件名 → Obsidian路径)
	 * @param options - 可选参数，包括 signal 用于取消转换
	 * @returns 替换后的Markdown (媒体已转换为WikiLink格式)
	 */
	async replaceMediaPlaceholdersAsync(
		markdown: string,
		mediaRefs: MediaRef[],
		mediaPathMap: Map<string, string>,
		config?: ConversionConfig,
		options?: { signal?: AbortSignal }
	): Promise<string> {
		let result = markdown;

		const MEDIA_REPLACEMENT_YIELD_BATCH_SIZE = 10;

		for (let index = 0; index < mediaRefs.length; index++) {
			const ref = mediaRefs[index];
			throwIfImportAborted(options?.signal);
			const path = mediaPathMap.get(ref.originalName);

			if (path) {
				const mediaFormat = config?.mediaFormat || this.config?.mediaFormat || "wikilink";
				const filename = path.split("/").pop() || path;

				const replacement = (() => {
					if (mediaFormat === "markdown") {
						if (ref.type === "image") {
							return `![](${path})`;
						}
						return `[${filename}](${path})`;
					}

					return `![[${path}]]`;
				})();

				const escapedPlaceholder = this.escapeRegExp(ref.placeholder);
				result = result.replace(new RegExp(escapedPlaceholder, "g"), replacement);
			} else {
				this.logger.warn(`未找到媒体文件映射: ${ref.originalName}`);
			}

			if ((index + 1) % MEDIA_REPLACEMENT_YIELD_BATCH_SIZE === 0 && index + 1 < mediaRefs.length) {
				await yieldImportTask(options?.signal);
			}
		}

		return result;
	}

	private convertMathSyntax(html: string): string {
		let result = html;

		// <script type="math/tex">...</script>
		result = result.replace(
			/<script[^>]*type=["']math\/tex["'][^>]*>([\s\S]*?)<\/script>/gi,
			(_match, content) => {
				const latex = String(content || "").trim();
				return latex ? `$${latex}$` : "";
			}
		);

		// <script type="math/tex; mode=display">...</script>
		result = result.replace(
			/<script[^>]*type=["']math\/tex;\s*mode=display["'][^>]*>([\s\S]*?)<\/script>/gi,
			(_match, content) => {
				const latex = String(content || "").trim();
				return latex ? `\n$$\n${latex}\n$$\n` : "";
			}
		);

		// \[ ... \] -> $$ ... $$
		result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_m, content) => {
			const latex = String(content || "").trim();
			return latex ? `\n$$\n${latex}\n$$\n` : "";
		});

		// \( ... \) -> $ ... $
		result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, content) => {
			const latex = String(content || "").trim();
			return latex ? `$${latex}$` : "";
		});

		return result;
	}

	/**
	 * 转义正则表达式特殊字符
	 */
	private escapeRegExp(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * 提取媒体引用并替换为占位符
	 */
	private extractMediaReferences(html: string): { html: string; mediaRefs: MediaRef[] } {
		const mediaRefs: MediaRef[] = [];
		let result = html;

		// 提取图片
		result = result.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, (_match, src) => {
			const filename = this.extractFilename(src);
			const placeholder = `__MEDIA_${this.mediaCounter++}__`;

			mediaRefs.push({
				originalName: filename,
				placeholder,
				type: "image",
			});

			return placeholder;
		});

		// 提取音频
		result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, filename) => {
			const placeholder = `__MEDIA_${this.mediaCounter++}__`;

			mediaRefs.push({
				originalName: filename.trim(),
				placeholder,
				type: "audio",
			});

			return placeholder;
		});

		// 提取视频
		result = result.replace(/<video[^>]+src=["']([^"']+)["'][^>]*>/gi, (_match, src) => {
			const filename = this.extractFilename(src);
			const placeholder = `__MEDIA_${this.mediaCounter++}__`;

			mediaRefs.push({
				originalName: filename,
				placeholder,
				type: "video",
			});

			return placeholder;
		});

		return { html: result, mediaRefs };
	}

	/**
	 * 从URL或路径中提取文件名
	 */
	private extractFilename(path: string): string {
		// 移除查询参数
		const withoutQuery = path.split("?")[0];
		// 提取最后一个斜杠后的内容
		const parts = withoutQuery.split("/");
		return parts[parts.length - 1];
	}

	/**
	 * 转换Anki特定语法
	 */
	private convertAnkiSyntax(html: string): string {
		let result = html;

		result = this.convertMathSyntax(result);

		if (this.config?.clozeFormat !== "{{c::}}") {
			result = result.replace(/\{\{c\d+::([^}]+)\}\}/g, (_match, text) =>
				wrapWithConfiguredCloze(text)
			);

			result = result.replace(/\{\{c\d+::([^:}]+)::[^}]+\}\}/g, (_match, text) =>
				wrapWithConfiguredCloze(text)
			);
		}

		return result;
	}

	private convertBasicHTMLLight(html: string): string {
		let result = html;

		// 换行
		result = result.replace(/<br\s*\/?\s*>/gi, "\n");

		// 常见块级标签：保留标签但增加换行分隔
		result = result.replace(/<\/?p[^>]*>/gi, "\n");
		result = result.replace(/<\/?div[^>]*>/gi, "\n");
		result = result.replace(/<\/?tr[^>]*>/gi, "\n");

		return result;
	}

	/**
	 * 转换基础HTML标签
	 */
	private convertBasicHTML(html: string): string {
		let result = html;

		// 粗体
		result = result.replace(/<b>(.*?)<\/b>/gi, "**$1**");
		result = result.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");

		// 斜体
		result = result.replace(/<i>(.*?)<\/i>/gi, "*$1*");
		result = result.replace(/<em>(.*?)<\/em>/gi, "*$1*");

		// 下划线（Obsidian不支持，保留为HTML或转为粗体）
		result = result.replace(/<u>(.*?)<\/u>/gi, "**$1**");

		// 删除线
		result = result.replace(/<s>(.*?)<\/s>/gi, "~~$1~~");
		result = result.replace(/<strike>(.*?)<\/strike>/gi, "~~$1~~");
		result = result.replace(/<del>(.*?)<\/del>/gi, "~~$1~~");

		// 代码（行内）
		result = result.replace(/<code>(.*?)<\/code>/gi, "`$1`");

		// 代码块
		result = result.replace(/<pre[^>]*>(.*?)<\/pre>/gis, (_match, content) => {
			// 移除内部的<code>标签
			const cleanContent = content.replace(/<\/?code[^>]*>/gi, "");
			return `\n\`\`\`\n${cleanContent.trim()}\n\`\`\`\n`;
		});

		// 链接处理，支持无引号 href，避免双方括号
		result = result.replace(
			/<a\s+href=(["\']?)([^"'\s>]+)\1[^>]*>(.*?)<\/a>/gi,
			(_match, _quote, url, text) => {
				// 去掉文本中已有的方括号，避免双重方括号（如 [P77] 不应变成 [[P77]]）
				const cleanText = text.replace(/^\[/, "").replace(/\]$/, "");
				return `[${cleanText}](${url})`;
			}
		);

		// 换行
		result = result.replace(/<br\s*\/?>/gi, "\n");

		// 水平线
		result = result.replace(/<hr\s*\/?>/gi, "\n---\n");

		// 段落（简单移除，Markdown用空行分段）
		result = result.replace(/<p[^>]*>/gi, "\n");
		result = result.replace(/<\/p>/gi, "\n");

		// Div（移除标签保留内容）
		result = result.replace(/<div[^>]*>/gi, "\n");
		result = result.replace(/<\/div>/gi, "\n");

		// Span（移除标签保留内容）
		result = result.replace(/<span[^>]*>/gi, "");
		result = result.replace(/<\/span>/gi, "");

		// 字体标签（移除标签并保留内容）
		result = result.replace(/<font[^>]*>(.*?)<\/font>/gi, "$1");

		// 上下标
		result = result.replace(/<sup>(.*?)<\/sup>/gi, "^$1^");
		result = result.replace(/<sub>(.*?)<\/sub>/gi, "~$1~");

		result = result.replace(/<mark[^>]*>(.*?)<\/mark>/gi, (_match, text) =>
			wrapWithConfiguredCloze(text)
		);

		// 居中标签（移除标签保留内容，Obsidian 不支持居中）
		result = result.replace(/<center[^>]*>(.*?)<\/center>/gis, "$1");

		return result;
	}

	/**
	 * 转换引用块
	 */
	private convertBlockquotes(html: string): string {
		// 支持带属性的 blockquote 标签
		return html.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_match, content) => {
			const lines = content.trim().split("\n");
			return `${lines.map((_line: string) => `> ${_line}`).join("\n")}\n`;
		});
	}

	/**
	 * 转换列表
	 */
	private convertLists(html: string): string {
		let result = html;

		// 有序列表
		result = result.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_match, content) => {
			let counter = 1;
			const converted = content.replace(
				/<li[^>]*>(.*?)<\/li>/gis,
				(_liMatch: string, liContent: string) => {
					return `${counter++}. ${liContent.trim()}\n`;
				}
			);
			return `\n${converted}\n`;
		});

		// 无序列表
		result = result.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_match, content) => {
			const converted = content.replace(
				/<li[^>]*>(.*?)<\/li>/gis,
				(_liMatch: string, liContent: string) => {
					return `- ${liContent.trim()}\n`;
				}
			);
			return `\n${converted}\n`;
		});

		// 清理剩余的<li>标签
		result = result.replace(/<\/?li[^>]*>/gi, "");

		return result;
	}

	/**
	 * 转换表格
	 */
	private convertTables(html: string): string {
		if (this.config && !this.config.convertSimpleTables) {
			return html;
		}

		// 简单表格转换（复杂表格保留HTML）
		return html.replace(/<table[^>]*>(.*?)<\/table>/gis, (match, content) => {
			// 检查是否为简单表格（无嵌套、无复杂属性）
			if (content.includes("<table")) {
				// 嵌套表格，保留HTML
				return match;
			}

			try {
				// 提取表头
				const theadMatch = content.match(/<thead[^>]*>(.*?)<\/thead>/is);
				const tbodyMatch = content.match(/<tbody[^>]*>(.*?)<\/tbody>/is);

				const rows: string[][] = [];

				// 解析表头
				if (theadMatch) {
					const headerRow = this.parseTableRow(theadMatch[1]);
					if (headerRow) rows.push(headerRow);
				}

				// 解析表体
				const bodyContent = tbodyMatch ? tbodyMatch[1] : content;
				const rowMatches = bodyContent.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis);

				for (const rowMatch of rowMatches) {
					const row = this.parseTableRow(rowMatch[1]);
					if (row) rows.push(row);
				}

				if (rows.length === 0) {
					return match; // 无法解析，保留原HTML
				}

				// 生成Markdown表格
				let markdown = "\n";
				for (const [index, row] of rows.entries()) {
					markdown += `| ${row.join(" | ")} |\n`;
					if (index === 0) {
						// 添加表头分隔符
						markdown += `| ${row.map(() => "---").join(" | ")} |\n`;
					}
				}
				markdown += "\n";

				return markdown;
			} catch (error) {
				this.logger.warn("表格转换失败，保留HTML", error);
				return match;
			}
		});
	}

	/**
	 * 解析表格行
	 */
	private parseTableRow(rowHtml: string): string[] | null {
		const cells: string[] = [];
		const cellMatches = rowHtml.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gis);

		for (const cellMatch of cellMatches) {
			cells.push(cellMatch[1].trim());
		}

		return cells.length > 0 ? cells : null;
	}

	/**
	 * 转换标题
	 */
	private convertHeadings(html: string): string {
		let result = html;

		// H1-H6
		for (let level = 6; level >= 1; level--) {
			const hashes = "#".repeat(level);
			const regex = new RegExp(`<h${level}[^>]*>(.*?)<\/h${level}>`, "gi");
			result = result.replace(regex, `\n${hashes} $1\n`);
		}

		return result;
	}

	/**
	 * 清理和标准化Markdown
	 */
	private cleanupMarkdown(markdown: string): string {
		let result = markdown;

		// 移除HTML注释
		result = result.replace(/<!--[\s\S]*?-->/g, "");

		// HTML 实体解码
		result = this.decodeHTMLEntities(result);

		// 移除剩余的HTML标签（保留内容）
		if (!this.config?.preserveStyles) {
			result = result.replace(/<[^>]+>/g, "");
		}

		// 规范化空行（最多2个连续空行）
		result = result.replace(/\n{3,}/g, "\n\n");

		// 移除首尾空白
		result = result.trim();

		this.config = null;
		return result;
	}

	/**
	 * 解码常见 HTML 实体
	 */
	private decodeHTMLEntities(text: string): string {
		const entities: Record<string, string> = {
			"&nbsp;": " ",
			"&lt;": "<",
			"&gt;": ">",
			"&amp;": "&",
			"&quot;": '"',
			"&#39;": "'",
			"&apos;": "'",
			"&times;": "×",
			"&divide;": "÷",
			"&copy;": "©",
			"&reg;": "®",
			"&trade;": "™",
			"&euro;": "€",
			"&pound;": "£",
			"&yen;": "¥",
			"&cent;": "¢",
			"&deg;": "°",
			"&plusmn;": "±",
			"&sup2;": "²",
			"&sup3;": "³",
			"&frac14;": "¼",
			"&frac12;": "½",
			"&frac34;": "¾",
		};

		let result = text;

		// 替换命名实体
		for (const [entity, char] of Object.entries(entities)) {
			result = result.replace(new RegExp(entity, "g"), char);
		}

		// 解码数字实体 &#NNNN;
		result = result.replace(/&#(\d+);/g, (_match, code) => {
			return String.fromCharCode(parseInt(code, 10));
		});

		// 解码十六进制实体 &#xHHHH;
		result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => {
			return String.fromCharCode(parseInt(code, 16));
		});

		return result;
	}
}
