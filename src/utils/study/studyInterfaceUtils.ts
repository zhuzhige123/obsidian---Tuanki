import { logger } from "../../utils/logger";
/**
 * StudyInterface 工具函数集
 *
 * 本文件包含从StudyInterface.svelte提取的纯函数，提升代码复用性和可测试性
 */

import type { WeavePlugin } from "../../main";
import { replaceConfiguredClozeSyntax } from "../cloze-syntax";
import { applyStyleProps } from "../style-props";

/**
 * 处理挖空文本
 *
 * 支持三种挖空语法：
 * 1. Obsidian高亮语法: ==text==
 * 2. 自定义挖空语法: 通过插件设置配置
 * 3. Anki风格挖空: {{c1::text}} (支持渐进式挖空)
 *
 * @param text - 原始文本
 * @param side - 显示面('front' | 'back')
 * @param showAnswerState - 是否显示答案
 * @param plugin - 插件实例（用于读取挖空设置）
 * @param activeClozeOrdinal - 当前激活的挖空序号（1-based），用于渐进式挖空
 * @returns 处理后的HTML字符串
 */
export function processClozeText(
	text: string,
	side: "front" | "back",
	showAnswerState = false,
	plugin?: WeavePlugin,
	activeClozeOrdinal?: number
): string {
	if (!text) return text;

	let processedText = text;
	const clozeSettings = plugin?.settings?.clozeSettings;
	const placeholder = clozeSettings?.placeholder || "[...]";
	processedText = replaceConfiguredClozeSyntax(
		processedText,
		(match) => {
			if (showAnswerState || side === "back") {
				return `<span class="cloze-answer">${match.text}</span>`;
			}

			return `<span class="cloze-placeholder">${placeholder}</span>`;
		},
		clozeSettings
	);

	// 处理Anki风格挖空 {{c1::text}} (支持渐进式挖空)
	const ankiClozeRegex = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

	if (showAnswerState || side === "back") {
		// 显示答案时，所有挖空都显示内容（移除标记）
		processedText = processedText.replace(ankiClozeRegex, `<span class="cloze-answer">$2</span>`);
	} else if (activeClozeOrdinal !== undefined) {
		// 渐进式挖空模式：只隐藏当前激活的挖空，其他挖空显示内容但移除标记
		processedText = processedText.replace(ankiClozeRegex, (_match, ordStr, content, hint) => {
			const ord = parseInt(ordStr, 10);

			if (ord === activeClozeOrdinal) {
				// 当前激活的挖空：显示为占位符
				return hint
					? `<span class="cloze-placeholder" title="${hint}">[${hint}]</span>`
					: `<span class="cloze-placeholder">[...]</span>`;
			} else {
				// 其他挖空：显示内容，移除标记（但不高亮）
				return content;
			}
		});
	} else {
		// 传统模式：所有挖空都隐藏
		processedText = processedText.replace(ankiClozeRegex, (_match, _ord, _content, hint) => {
			return hint
				? `<span class="cloze-placeholder" title="${hint}">[${hint}]</span>`
				: `<span class="cloze-placeholder">[...]</span>`;
		});
	}

	return processedText;
}

/**
 * 增强嵌入内容
 *
 * 将YouTube链接转换为嵌入式iframe
 *
 * @param md - Markdown文本
 * @returns 增强后的HTML字符串
 */
export function enhanceEmbeds(md: string): string {
	if (!md) return md;

	// YouTube链接转iframe
	const ytRegex =
		/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/g;
	return md.replace(
		ytRegex,
		(_match, id) =>
			`<iframe width="560" height="315" src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
	);
}

/**
 * 解析CSV行
 *
 * 正确处理引号和逗号
 *
 * @param line - CSV行文本
 * @returns 字段数组
 */
export function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				// 转义的双引号
				current += '"';
				i += 2;
			} else {
				// 开始或结束引号
				inQuotes = !inQuotes;
				i++;
			}
		} else if (char === "," && !inQuotes) {
			// 字段分隔符
			result.push(current);
			current = "";
			i++;
		} else {
			current += char;
			i++;
		}
	}

	result.push(current);
	return result;
}

/**
 * 在标题数组中查找列索引
 *
 * @param headers - 标题数组
 * @param possibleNames - 可能的列名数组
 * @returns 列索引，未找到返回-1
 */
export function findColumnIndex(headers: string[], possibleNames: string[]): number {
	for (const name of possibleNames) {
		const index = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
		if (index !== -1) return index;
	}
	return -1;
}

/**
 * 清理悬停提示框
 *
 * 清理Obsidian的hover预览和tooltip元素
 *
 * @param plugin - 插件实例
 */
export function clearHoverTooltips(plugin: WeavePlugin): void {
	// 清理Obsidian的hover预览弹窗
	const app = plugin.app as any;
	if (app?.workspace?.hoverLink) {
		app.workspace.hoverLink.hide();
	}

	// 精准清理常见 tooltip/hover 元素
	const tooltips = document.querySelectorAll(
		".popover, .tooltip, .hover-editor, .popover-content, .mod-hover, .weave-hover-preview, .weave-hover-card, .suggestion-container, .mod-suggestion"
	);
	tooltips.forEach((_tooltip) => {
		if (_tooltip.parentNode) {
			_tooltip.parentNode.removeChild(_tooltip);
		}
	});

	// 清理悬停状态
	const hoveredElements = document.querySelectorAll("[data-tooltip-visible], .is-hovered");
	hoveredElements.forEach((_el) => {
		_el.removeAttribute("data-tooltip-visible");
		_el.classList.remove("is-hovered");
	});
}

/**
 * 为容器内的链接附加hover清理事件
 *
 * @param container - 容器元素
 * @param plugin - 插件实例
 */
export function attachHoverCleanup(container: HTMLElement, plugin: WeavePlugin): void {
	if (!container) return;

	const links = container.querySelectorAll("a[data-href], .internal-link");
	links.forEach((_link) => {
		const cleanupHandler = () => {
			setTimeout(() => clearHoverTooltips(plugin), 100);
		};

		_link.addEventListener("mouseleave", cleanupHandler);
		_link.addEventListener("blur", cleanupHandler);

		// 存储清理函数以便后续移除
		(_link as any)._hoverCleanup = cleanupHandler;
	});
}

/**
 * 移除容器内的hover清理事件
 *
 * @param container - 容器元素
 */
export function removeHoverCleanup(container: HTMLElement): void {
	if (!container) return;

	const links = container.querySelectorAll("a[data-href], .internal-link");
	links.forEach((_link) => {
		const cleanupHandler = (_link as any)._hoverCleanup;
		if (cleanupHandler) {
			_link.removeEventListener("mouseleave", cleanupHandler);
			_link.removeEventListener("blur", cleanupHandler);
			(_link as any)._hoverCleanup = undefined;
		}
	});
}

/**
 * 设置块链接处理器
 *
 * 为块链接元素添加点击处理
 *
 * @param element - 容器元素
 * @param handleBlockLinkClick - 块链接点击处理函数
 */
export function setupBlockLinkHandlers(
	element: HTMLElement,
	handleBlockLinkClick: (blockLink: string) => void
): void {
	try {
		const blockLinkElements = element.querySelectorAll(
			'[data-field-key="obsidian_block_link"] .field-content'
		);
		blockLinkElements.forEach((_linkElement) => {
			const htmlElement = _linkElement as HTMLElement;
			const blockLink = htmlElement.textContent?.trim();
			if (blockLink?.match(/\[\[.*#\^.*\]\]/)) {
				applyStyleProps(htmlElement, {
					cursor: "pointer",
					color: "var(--text-accent)",
					"text-decoration": "underline",
				});

				htmlElement.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					handleBlockLinkClick(blockLink);
				});

				// 添加 hover 效果
				htmlElement.addEventListener("mouseenter", () => {
					applyStyleProps(htmlElement, {
						background: "color-mix(in srgb, var(--text-accent) 10%, transparent)",
					});
				});

				htmlElement.addEventListener("mouseleave", () => {
					applyStyleProps(htmlElement, { background: "" });
				});
			}
		});
	} catch (error) {
		logger.error("[setupBlockLinkHandlers] 设置块链接处理器失败", error);
	}
}
