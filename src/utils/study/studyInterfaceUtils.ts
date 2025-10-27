/**
 * StudyInterface 工具函数集
 * 
 * 本文件包含从StudyInterface.svelte提取的纯函数，提升代码复用性和可测试性
 */

import type AnkiPlugin from "../../main";

/**
 * 处理挖空文本
 * 
 * 支持两种挖空语法：
 * 1. Obsidian高亮语法: ==text==
 * 2. 自定义挖空语法: 通过插件设置配置
 * 
 * @param text - 原始文本
 * @param side - 显示面('front' | 'back')
 * @param showAnswerState - 是否显示答案
 * @param plugin - 插件实例（用于读取挖空设置）
 * @returns 处理后的HTML字符串
 */
export function processClozeText(
  text: string,
  side: 'front' | 'back',
  showAnswerState: boolean = false,
  plugin?: AnkiPlugin
): string {
  if (!text) return text;

  let processedText = text;

  // 1. 处理Obsidian高亮语法 ==text== 作为挖空
  const highlightRegex = /==(.*?)==/g;

  if (showAnswerState) {
    // 显示答案时，高亮文本显示为答案样式
    processedText = processedText.replace(highlightRegex, `<span class="cloze-answer">$1</span>`);
  } else if (side === 'front') {
    // 正面未显示答案时，高亮文本显示为挖空占位符
    processedText = processedText.replace(highlightRegex, `<span class="cloze-placeholder">[...]</span>`);
  } else {
    // 背面未显示答案时，高亮文本显示为答案样式
    processedText = processedText.replace(highlightRegex, `<span class="cloze-answer">$1</span>`);
  }

  // 2. 处理自定义挖空语法（如果启用）
  const clozeSettings = plugin?.settings?.clozeSettings;
  if (clozeSettings?.enabled) {
    const { openDelimiter, closeDelimiter, placeholder } = clozeSettings;

    // 构建正则表达式来匹配挖空语法
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openEsc = escapeRegex(openDelimiter);
    const closeEsc = escapeRegex(closeDelimiter);
    const customClozeRegex = new RegExp(`${openEsc}(.*?)${closeEsc}`, 'g');

    if (showAnswerState) {
      processedText = processedText.replace(customClozeRegex, `<span class="cloze-answer">$1</span>`);
    } else if (side === 'front') {
      processedText = processedText.replace(customClozeRegex, `<span class="cloze-placeholder">${placeholder || '[...]'}</span>`);
    } else {
      processedText = processedText.replace(customClozeRegex, `<span class="cloze-answer">$1</span>`);
    }
  }

  // 3. 处理Anki风格挖空 {{c1::text}}
  const ankiClozeRegex = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g;

  if (showAnswerState || side === 'back') {
    processedText = processedText.replace(ankiClozeRegex, `<span class="cloze-answer">$1</span>`);
  } else {
    processedText = processedText.replace(ankiClozeRegex, (_match, _content, hint) => {
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
  const ytRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/g;
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
  let current = '';
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
    } else if (char === ',' && !inQuotes) {
      // 字段分隔符
      result.push(current);
      current = '';
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
    const index = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
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
export function clearHoverTooltips(plugin: AnkiPlugin): void {
  // 清理Obsidian的hover预览弹窗
  const app = plugin.app as any;
  if (app?.workspace?.hoverLink) {
    app.workspace.hoverLink.hide();
  }

  // 精准清理常见 tooltip/hover 元素
  const tooltips = document.querySelectorAll(
    '.popover, .tooltip, .hover-editor, .popover-content, .mod-hover, .tuanki-hover-preview, .tuanki-hover-card, .suggestion-container, .mod-suggestion'
  );
  tooltips.forEach(tooltip => {
    if (tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }
  });

  // 清理悬停状态
  const hoveredElements = document.querySelectorAll('[data-tooltip-visible], .is-hovered');
  hoveredElements.forEach(el => {
    el.removeAttribute('data-tooltip-visible');
    el.classList.remove('is-hovered');
  });
}

/**
 * 为容器内的链接附加hover清理事件
 * 
 * @param container - 容器元素
 * @param plugin - 插件实例
 */
export function attachHoverCleanup(container: HTMLElement, plugin: AnkiPlugin): void {
  if (!container) return;

  const links = container.querySelectorAll('a[data-href], .internal-link');
  links.forEach(link => {
    const cleanupHandler = () => {
      setTimeout(() => clearHoverTooltips(plugin), 100);
    };

    link.addEventListener('mouseleave', cleanupHandler);
    link.addEventListener('blur', cleanupHandler);

    // 存储清理函数以便后续移除
    (link as any)._hoverCleanup = cleanupHandler;
  });
}

/**
 * 移除容器内的hover清理事件
 * 
 * @param container - 容器元素
 */
export function removeHoverCleanup(container: HTMLElement): void {
  if (!container) return;

  const links = container.querySelectorAll('a[data-href], .internal-link');
  links.forEach(link => {
    const cleanupHandler = (link as any)._hoverCleanup;
    if (cleanupHandler) {
      link.removeEventListener('mouseleave', cleanupHandler);
      link.removeEventListener('blur', cleanupHandler);
      delete (link as any)._hoverCleanup;
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
    const blockLinkElements = element.querySelectorAll('[data-field-key="obsidian_block_link"] .field-content');
    blockLinkElements.forEach(linkElement => {
      const htmlElement = linkElement as HTMLElement;
      const blockLink = htmlElement.textContent?.trim();
      if (blockLink && blockLink.match(/\[\[.*#\^.*\]\]/)) {
        htmlElement.style.cursor = 'pointer';
        htmlElement.style.color = 'var(--text-accent)';
        htmlElement.style.textDecoration = 'underline';

        htmlElement.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleBlockLinkClick(blockLink);
        });

        // 添加 hover 效果
        htmlElement.addEventListener('mouseenter', () => {
          htmlElement.style.background = 'color-mix(in srgb, var(--text-accent) 10%, transparent)';
        });

        htmlElement.addEventListener('mouseleave', () => {
          htmlElement.style.background = '';
        });
      }
    });
  } catch (error) {
    console.error('[setupBlockLinkHandlers] 设置块链接处理器失败', error);
  }
}

