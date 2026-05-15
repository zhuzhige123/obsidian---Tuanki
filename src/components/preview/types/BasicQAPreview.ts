import type { Card } from "../../../data/types";
import type WeavePlugin from "../../../main";
import { getCardBack, getCardFront } from "../../../utils/card-field-helper";
import type { PreviewData, PreviewOptions, PreviewSection } from "../ContentPreviewEngine";
import { applyStyleProps } from "../../../utils/style-props";

/**
 * 问答渲染选项接口
 */
export interface QARenderOptions {
	showAnswer: boolean;
	enableTransitions: boolean;
	highlightKeywords: boolean;
	maxQuestionLength?: number;
	maxAnswerLength?: number;
}

/**
 * 问答渲染结果接口
 */
export interface QARenderResult {
	questionElement: HTMLElement;
	answerElement: HTMLElement;
	hasOverflow: boolean;
	keywordCount: number;
}

/**
 * 基础问答预览器
 * 专门处理基础问答题型的预览渲染
 */
export class BasicQAPreview {
	private plugin: WeavePlugin;
	private static readonly KEYWORD_PATTERNS = [
		// 中文关键词模式
		/(?:什么|为什么|怎么|如何|哪个|哪些|何时|何地|谁|多少)/g,
		// 英文关键词模式
		/(?:what|why|how|which|when|where|who|how many|how much)/gi,
		// 学术关键词
		/(?:定义|概念|原理|方法|步骤|特点|优缺点|区别|联系)/g,
	];

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 渲染问题内容
	 */
	renderQuestion(content: string, options: QARenderOptions): HTMLElement {
		const container = document.createElement("div");
		container.className = "weave-qa-question";

		// 处理内容长度
		const processedContent = this.processContentLength(content, options.maxQuestionLength);

		// 创建问题标题
		const titleElement = document.createElement("div");
		titleElement.className = "weave-qa-question-title";
		const qLabel = document.createElement("span");
		qLabel.className = "weave-qa-label";
		qLabel.textContent = "问题";
		titleElement.appendChild(qLabel);
		container.appendChild(titleElement);

		// 创建问题内容
		const contentElement = document.createElement("div");
		contentElement.className = "weave-qa-question-content";

		if (options.highlightKeywords) {
			// /skip legacyHTML is used to render keyword-highlighted content from trusted internal formatter
			contentElement.appendChild(this.createHighlightedFragment(processedContent));
		} else {
			contentElement.textContent = processedContent;
		}

		container.appendChild(contentElement);

		// 添加溢出指示器
		if (processedContent.length < content.length) {
			const overflowIndicator = document.createElement("div");
			overflowIndicator.className = "weave-qa-overflow-indicator";
			overflowIndicator.textContent = "...";
			container.appendChild(overflowIndicator);
		}

		// 应用过渡效果
		if (options.enableTransitions) {
			this.applyQuestionTransitions(container);
		}

		return container;
	}

	/**
	 * 渲染答案内容
	 */
	renderAnswer(content: string, options: QARenderOptions): HTMLElement {
		const container = document.createElement("div");
		container.className = "weave-qa-answer";

		if (!options.showAnswer) {
			container.classList.add("weave-qa-answer--hidden");
			return container;
		}

		// 处理内容长度
		const processedContent = this.processContentLength(content, options.maxAnswerLength);

		// 创建答案标题
		const titleElement = document.createElement("div");
		titleElement.className = "weave-qa-answer-title";
		const aLabel = document.createElement("span");
		aLabel.className = "weave-qa-label";
		aLabel.textContent = "答案";
		titleElement.appendChild(aLabel);
		container.appendChild(titleElement);

		// 创建答案内容
		const contentElement = document.createElement("div");
		contentElement.className = "weave-qa-answer-content";

		// 处理答案格式（支持列表、段落等）
		this.appendFormattedAnswerContent(contentElement, processedContent);

		container.appendChild(contentElement);

		// 添加溢出指示器
		if (processedContent.length < content.length) {
			const overflowIndicator = document.createElement("div");
			overflowIndicator.className = "weave-qa-overflow-indicator";
			overflowIndicator.textContent = "...";
			container.appendChild(overflowIndicator);
		}

		// 应用过渡效果
		if (options.enableTransitions) {
			this.applyAnswerTransitions(container);
		}

		return container;
	}

	/**
	 * 应用过渡效果
	 */
	applyTransitions(element: HTMLElement, transitionType: "question" | "answer" | "reveal"): void {
		switch (transitionType) {
			case "question":
				this.applyQuestionTransitions(element);
				break;
			case "answer":
				this.applyAnswerTransitions(element);
				break;
			case "reveal":
				this.applyRevealTransition(element);
				break;
		}
	}

	/**
	 * 渲染完整的问答卡片
	 */
	renderQACard(card: Card, options: QARenderOptions): QARenderResult {
		const questionContent = getCardFront(card);
		const answerContent = getCardBack(card);

		const questionElement = this.renderQuestion(questionContent, options);
		const answerElement = this.renderAnswer(answerContent, options);

		// 检测内容溢出
		const hasOverflow = this.detectContentOverflow(questionContent, answerContent, options);

		// 计算关键词数量
		const keywordCount = this.countKeywords(questionContent);

		return {
			questionElement,
			answerElement,
			hasOverflow,
			keywordCount,
		};
	}

	/**
	 * 切换答案显示状态
	 */
	toggleAnswerVisibility(answerElement: HTMLElement, show: boolean, animated = true): void {
		if (show) {
			answerElement.classList.remove("weave-qa-answer--hidden");
			if (animated) {
				this.applyRevealTransition(answerElement);
			}
		} else {
			answerElement.classList.add("weave-qa-answer--hidden");
		}
	}

	// ===== 私有方法 =====

	/**
	 * 处理内容长度
	 */
	private processContentLength(content: string, maxLength?: number): string {
		if (!maxLength || content.length <= maxLength) {
			return content;
		}

		// 智能截断，尽量在句子边界截断
		const truncated = content.substring(0, maxLength);
		const lastSentenceEnd = Math.max(
			truncated.lastIndexOf("。"),
			truncated.lastIndexOf("！"),
			truncated.lastIndexOf("？"),
			truncated.lastIndexOf("."),
			truncated.lastIndexOf("!"),
			truncated.lastIndexOf("?")
		);

		if (lastSentenceEnd > maxLength * 0.7) {
			return truncated.substring(0, lastSentenceEnd + 1);
		}

		return truncated;
	}

	/**
	 * 高亮关键词
	 */
	private createHighlightedFragment(content: string): DocumentFragment {
		const fragment = document.createDocumentFragment();
		const matches: Array<{ start: number; end: number; text: string }> = [];

		for (const pattern of BasicQAPreview.KEYWORD_PATTERNS) {
			const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
			const regex = new RegExp(pattern.source, flags);

			for (const match of content.matchAll(regex)) {
				if (match.index === undefined || match[0].length === 0) {
					continue;
				}

				matches.push({
					start: match.index,
					end: match.index + match[0].length,
					text: match[0],
				});
			}
		}

		matches.sort((a, b) => a.start - b.start || b.end - a.end);

		let cursor = 0;
		for (const match of matches) {
			if (match.start < cursor) {
				continue;
			}

			if (match.start > cursor) {
				fragment.appendChild(document.createTextNode(content.slice(cursor, match.start)));
			}

			const keyword = document.createElement("span");
			keyword.className = "weave-qa-keyword";
			keyword.textContent = match.text;
			fragment.appendChild(keyword);
			cursor = match.end;
		}

		if (cursor < content.length) {
			fragment.appendChild(document.createTextNode(content.slice(cursor)));
		}

		return fragment;
	}

	/**
	 * 格式化答案内容
	 */
	private appendFormattedAnswerContent(container: HTMLElement, content: string): void {
		const unorderedItems = this.extractListItems(content, /^[-*+]\s+(.+)$/);
		if (unorderedItems) {
			this.appendList(container, "ul", unorderedItems);
			return;
		}

		const orderedItems = this.extractListItems(content, /^\d+\.\s+(.+)$/);
		if (orderedItems) {
			this.appendList(container, "ol", orderedItems);
			return;
		}

		const paragraphs = content
			.split("\n\n")
			.map((paragraph) => paragraph.trim())
			.filter(Boolean);

		if (paragraphs.length > 1) {
			for (const paragraph of paragraphs) {
				const element = document.createElement("p");
				element.textContent = paragraph;
				container.appendChild(element);
			}
			return;
		}

		container.textContent = content;
	}

	private extractListItems(content: string, pattern: RegExp): string[] | null {
		const lines = content
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		if (lines.length === 0) {
			return null;
		}

		const items: string[] = [];
		for (const line of lines) {
			const match = line.match(pattern);
			if (!match) {
				return null;
			}
			items.push(match[1]);
		}

		return items.length > 0 ? items : null;
	}

	private appendList(container: HTMLElement, tagName: "ul" | "ol", items: string[]): void {
		const list = document.createElement(tagName);
		for (const itemText of items) {
			const item = document.createElement("li");
			item.textContent = itemText;
			list.appendChild(item);
		}
		container.appendChild(list);
	}

	private formatAnswerContent(content: string): string {
		let formattedContent = content;

		// 处理列表格式
		formattedContent = formattedContent.replace(/^[-*+]\s+(.+)$/gm, "<li>$1</li>");
		if (formattedContent.includes("<li>")) {
			formattedContent = `<ul>${formattedContent}</ul>`;
		}

		// 处理数字列表
		formattedContent = formattedContent.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
		if (formattedContent.includes("<li>") && !formattedContent.includes("<ul>")) {
			formattedContent = `<ol>${formattedContent}</ol>`;
		}

		// 处理段落
		if (!formattedContent.includes("<li>")) {
			const paragraphs = formattedContent.split("\n\n").filter((p) => p.trim());
			if (paragraphs.length > 1) {
				formattedContent = paragraphs.map((p) => `<p>${p.trim()}</p>`).join("");
			}
		}

		return formattedContent;
	}

	/**
	 * 应用问题过渡效果
	 */
	private applyQuestionTransitions(element: HTMLElement): void {
		applyStyleProps(element, {
			opacity: "0",
			transform: "translateY(-10px)",
		});

		// 使用requestAnimationFrame确保样式已应用
		requestAnimationFrame(() => {
			applyStyleProps(element, {
				transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
				opacity: "1",
				transform: "translateY(0)",
			});
		});
	}

	/**
	 * 应用答案过渡效果
	 */
	private applyAnswerTransitions(element: HTMLElement): void {
		applyStyleProps(element, {
			opacity: "0",
			transform: "translateY(10px)",
		});

		requestAnimationFrame(() => {
			applyStyleProps(element, {
				transition: "opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s",
				opacity: "1",
				transform: "translateY(0)",
			});
		});
	}

	/**
	 * 应用揭示过渡效果
	 */
	private applyRevealTransition(element: HTMLElement): void {
		applyStyleProps(element, {
			opacity: "0",
			transform: "scale(0.95)",
		});

		requestAnimationFrame(() => {
			applyStyleProps(element, {
				transition: "opacity 0.25s ease-out, transform 0.25s ease-out",
				opacity: "1",
				transform: "scale(1)",
			});
		});
	}

	/**
	 * 检测内容溢出
	 */
	private detectContentOverflow(
		questionContent: string,
		answerContent: string,
		options: QARenderOptions
	): boolean {
		const questionOverflow =
			options.maxQuestionLength && questionContent.length > options.maxQuestionLength;
		const answerOverflow =
			options.maxAnswerLength && answerContent.length > options.maxAnswerLength;

		return !!(questionOverflow || answerOverflow);
	}

	/**
	 * 计算关键词数量
	 */
	private countKeywords(content: string): number {
		let count = 0;

		for (const pattern of BasicQAPreview.KEYWORD_PATTERNS) {
			const matches = content.match(pattern);
			if (matches) {
				count += matches.length;
			}
		}

		return count;
	}
}
