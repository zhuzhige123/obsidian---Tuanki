import type { Card } from "../../../data/types";
import type { WeavePlugin } from "../../../main";
import {
	isProgressiveClozeChild,
	isProgressiveClozeParent,
} from "../../../types/progressive-cloze-v2";
import { getCardField, getCardFront } from "../../../utils/card-field-helper";
import { getAnkiClozeMatches, getConfiguredClozeMatches } from "../../../utils/cloze-syntax";
import { logger } from "../../../utils/logger";
import { applyStyleProps } from "../../../utils/style-props";

/**
 * 挖空数据接口
 */
export interface ClozeData {
	id: string;
	content: string;
	originalContent: string; // 新增：保存完整原始内容
	contextBefore: string; // 新增：挖空前的文本
	contextAfter: string; // 新增：挖空后的文本
	placeholder: string;
	revealed: boolean;
	startIndex: number;
	endIndex: number;
	groupId?: string;
	type: "obsidian" | "anki" | "anki-hint" | "custom";
	hint?: string; // 新增：Anki提示信息
}

/**
 * 挖空渲染选项接口
 */
export interface ClozeRenderOptions {
	showAnswers: boolean;
	enableIndividualReveal: boolean;
	animateReveal: boolean;
	placeholder: string;
	revealMode: "all" | "individual" | "group";
}

/**
 * 挖空渲染结果接口
 */
export interface ClozeRenderResult {
	element: HTMLElement;
	clozeData: ClozeData[];
	totalClozes: number;
	revealedCount: number;
}

/**
 * 挖空题预览器
 * 专门处理挖空题型的预览渲染
 */
export class ClozePreview {
	private plugin: WeavePlugin;
	private clozeStates: Map<string, boolean> = new Map();

	constructor(plugin: WeavePlugin) {
		this.plugin = plugin;
	}

	/**
	 * 解析挖空内容
	 */
	parseClozeContent(content: string): ClozeData[] {
		const clozeData: ClozeData[] = [];
		let clozeIndex = 0;
		const defaultPlaceholder = this.plugin.settings?.clozeSettings?.placeholder || "[...]";

		for (const match of getConfiguredClozeMatches(content, this.plugin.settings?.clozeSettings)) {
			const contextBefore = content.substring(0, match.index);
			const contextAfter = content.substring(match.endIndex);
			clozeData.push({
				id: `cloze-obsidian-${clozeIndex++}`,
				content: match.text,
				originalContent: content,
				contextBefore,
				contextAfter,
				placeholder: defaultPlaceholder,
				revealed: false,
				startIndex: match.index,
				endIndex: match.endIndex,
				type: "obsidian",
			});
		}

		for (const match of getAnkiClozeMatches(content)) {
			const contextBefore = content.substring(0, match.index);
			const contextAfter = content.substring(match.endIndex);
			const actualPlaceholder = match.hint ? `[${match.hint}]` : defaultPlaceholder;
			clozeData.push({
				id: `cloze-anki-${clozeIndex++}`,
				content: match.text,
				originalContent: content,
				contextBefore,
				contextAfter,
				placeholder: actualPlaceholder,
				revealed: false,
				startIndex: match.index,
				endIndex: match.endIndex,
				groupId: match.ordinal ? `group-${match.ordinal}` : undefined,
				type: match.hint ? "anki-hint" : "anki",
				hint: match.hint,
			});
		}

		// 按位置排序
		clozeData.sort((a, b) => a.startIndex - b.startIndex);

		logger.debug(`[ClozePreview] 解析到 ${clozeData.length} 个挖空，保存了完整上下文`);
		return clozeData;
	}

	/**
	 * 渲染挖空问题（隐藏答案）
	 */
	renderClozeQuestion(clozeData: ClozeData[], showAnswers: boolean): HTMLElement {
		const container = activeDocument.createElement("div");
		container.className = "weave-cloze-question";

		// 创建标题
		const titleElement = activeDocument.createElement("div");
		titleElement.className = "weave-cloze-title";
		const clozeLabel = activeDocument.createElement("span");
		clozeLabel.className = "weave-cloze-label";
		clozeLabel.textContent = "挖空练习";
		const clozeCount = activeDocument.createElement("span");
		clozeCount.className = "weave-cloze-count";
		clozeCount.textContent = `${clozeData.length} 个空`;
		titleElement.appendChild(clozeLabel);
		titleElement.appendChild(clozeCount);
		container.appendChild(titleElement);

		// 创建内容容器
		const contentElement = activeDocument.createElement("div");
		contentElement.className = "weave-cloze-content";

		// 渲染挖空内容
		const renderedContent = this.renderClozeContent(clozeData, showAnswers);
		contentElement.appendChild(renderedContent);

		container.appendChild(contentElement);

		return container;
	}

	/**
	 * 切换挖空揭示状态
	 */
	toggleClozeReveal(clozeId: string): void {
		const currentState = this.clozeStates.get(clozeId) || false;
		this.clozeStates.set(clozeId, !currentState);

		// 更新DOM元素
		const clozeElement = activeDocument.querySelector(`[data-cloze-id="${clozeId}"]`) as HTMLElement;
		if (clozeElement) {
			this.updateClozeElement(clozeElement, !currentState);
		}

		logger.debug(`[ClozePreview] 切换挖空状态: ${clozeId} -> ${!currentState}`);
	}

	/**
	 * 应用挖空动效
	 */
	applyClozeAnimations(elements: HTMLElement[]): void {
		elements.forEach((element, index) => {
			applyStyleProps(element, { opacity: "0" });
			//  已移除浮动动画效果

			window.setTimeout(() => {
				applyStyleProps(element, {
					transition: "opacity 0.3s ease-out",
					opacity: "1",
				});
			}, index * 50);
		});
	}

	/**
	 * 渲染完整的挖空卡片
	 */
	renderClozeCard(card: Card, options: ClozeRenderOptions): ClozeRenderResult {
		if (isProgressiveClozeChild(card)) {
			const element = activeDocument.createElement("div");
			element.className = "weave-cloze-question";
			element.textContent = options.showAnswers
				? "渐进式挖空（子卡片）"
				: "渐进式挖空（子卡片）- 请在学习界面查看";

			return {
				element,
				clozeData: [],
				totalClozes: 1,
				revealedCount: options.showAnswers ? 1 : 0,
			};
		}

		if (isProgressiveClozeParent(card)) {
			const element = activeDocument.createElement("div");
			element.className = "weave-cloze-question";
			element.textContent = "渐进式挖空（父卡片）- 请选择子卡片进行复习";

			return {
				element,
				clozeData: [],
				totalClozes: 0,
				revealedCount: 0,
			};
		}

		// 原有的普通挖空渲染逻辑
		const content = getCardField(card, "cloze") || getCardField(card, "content") || getCardFront(card);
		const clozeData = this.parseClozeContent(content);

		const element = this.renderClozeQuestion(clozeData, options.showAnswers);

		// 设置交互性
		if (options.enableIndividualReveal) {
			this.setupClozeInteractivity(element, clozeData, options);
		}

		const revealedCount = clozeData.filter(
			(c) => this.clozeStates.get(c.id) || options.showAnswers
		).length;

		return {
			element,
			clozeData,
			totalClozes: clozeData.length,
			revealedCount,
		};
	}

	/**
	 * 重置所有挖空状态
	 */
	resetClozeStates(): void {
		this.clozeStates.clear();
		logger.debug("[ClozePreview] 挖空状态已重置");
	}

	/**
	 * 获取挖空统计
	 */
	getClozeStats(): { totalStates: number; revealedCount: number } {
		const revealedCount = Array.from(this.clozeStates.values()).filter(Boolean).length;
		return {
			totalStates: this.clozeStates.size,
			revealedCount,
		};
	}

	// ===== 私有方法 =====

	/**
	 * 渲染挖空内容
	 */
	private renderClozeContent(clozeData: ClozeData[], showAnswers: boolean): HTMLElement {
		const container = activeDocument.createElement("div");
		container.className = "weave-cloze-text";

		// 使用完整的原始内容
		const originalContent = this.reconstructContent(clozeData);

		if (!originalContent) {
			logger.error("[ClozePreview] 无法获取原始内容");
			const errDiv = activeDocument.createElement("div");
			errDiv.className = "error";
			errDiv.textContent = "挖空内容渲染失败";
			container.appendChild(errDiv);
			return container;
		}

		//  新的渲染策略：基于位置精确替换
		let processedContent = originalContent;
		const sortedClozes = [...clozeData].sort((a, b) => b.startIndex - a.startIndex);

		// 从后往前替换，避免位置偏移
		sortedClozes.forEach((cloze) => {
			const placeholder = `__CLOZE_${cloze.id}__`;
			const beforeText = processedContent.substring(0, cloze.startIndex);
			const afterText = processedContent.substring(cloze.endIndex);
			processedContent = beforeText + placeholder + afterText;
		});

		// 创建文本节点和挖空元素
		const parts = processedContent.split(/__CLOZE_[\w-]+__/);
		let clozeIndex = 0;

		parts.forEach((part, index) => {
			if (part) {
				const textNode = activeDocument.createTextNode(part);
				container.appendChild(textNode);
			}

			if (index < parts.length - 1 && clozeIndex < sortedClozes.length) {
				// 按原始顺序获取挖空元素
				const originalCloze = clozeData.find((c) => c.id === sortedClozes[clozeIndex].id);
				if (originalCloze) {
					const clozeElement = this.createClozeElement(originalCloze, showAnswers);
					container.appendChild(clozeElement);
				}
				clozeIndex++;
			}
		});

		return container;
	}

	/**
	 * 创建挖空元素
	 */
	private createClozeElement(cloze: ClozeData, showAnswer: boolean): HTMLElement {
		const element = activeDocument.createElement("span");
		element.className = `weave-cloze-item weave-cloze-${cloze.type}`;
		element.setAttribute("data-cloze-id", cloze.id);
		element.setAttribute("data-cloze-type", cloze.type);

		// 设置挖空内容和占位符属性
		element.setAttribute("data-cloze-content", cloze.content);
		element.setAttribute("data-cloze-placeholder", cloze.placeholder);

		if (cloze.groupId) {
			element.setAttribute("data-cloze-group", cloze.groupId);
		}

		const isRevealed = showAnswer || this.clozeStates.get(cloze.id) || false;
		this.updateClozeElement(element, isRevealed);

		return element;
	}

	/**
	 * 更新挖空元素状态
	 */
	private updateClozeElement(element: HTMLElement, revealed: boolean): void {
		const clozeId = element.getAttribute("data-cloze-id");
		if (!clozeId) return;

		// 从属性中获取挖空内容和占位符
		const clozeContent = element.getAttribute("data-cloze-content") || "";
		const placeholder = element.getAttribute("data-cloze-placeholder") || "[...]";

		if (revealed) {
			// 显示答案时使用实际内容
			const ansSpan = activeDocument.createElement("span");
			ansSpan.className = "weave-cloze-answer";
			ansSpan.textContent = clozeContent;
			element.textContent = "";
			element.appendChild(ansSpan);
			element.classList.add("weave-cloze-revealed");
			element.classList.remove("weave-cloze-hidden");
		} else {
			// 隐藏时显示占位符
			const phSpan = activeDocument.createElement("span");
			phSpan.className = "weave-cloze-placeholder";
			phSpan.textContent = placeholder;
			element.textContent = "";
			element.appendChild(phSpan);
			element.classList.add("weave-cloze-hidden");
			element.classList.remove("weave-cloze-revealed");
		}

		// 更新状态
		this.clozeStates.set(clozeId, revealed);
	}

	/**
	 * 设置挖空交互性
	 */
	private setupClozeInteractivity(
		container: HTMLElement,
		_clozeData: ClozeData[],
		options: ClozeRenderOptions
	): void {
		const clozeElements = container.querySelectorAll(".weave-cloze-item");

		clozeElements.forEach((element) => {
			const clozeElement = element as HTMLElement;
			const clozeId = clozeElement.getAttribute("data-cloze-id");

			if (!clozeId) return;

			// 添加点击事件
			applyStyleProps(clozeElement, { cursor: "pointer" });
			clozeElement.addEventListener("click", () => {
				if (options.revealMode === "individual") {
					this.toggleClozeReveal(clozeId);
				} else if (options.revealMode === "group") {
					const groupId = clozeElement.getAttribute("data-cloze-group");
					if (groupId) {
						this.toggleClozeGroup(groupId);
					} else {
						this.toggleClozeReveal(clozeId);
					}
				}

				if (options.animateReveal) {
					this.animateClozeReveal(clozeElement);
				}
			});

			//  已移除悬停效果
		});
	}

	/**
	 * 切换挖空组状态
	 */
	private toggleClozeGroup(groupId: string): void {
		const groupElements = activeDocument.querySelectorAll(`[data-cloze-group="${groupId}"]`);
		const firstElement = groupElements[0] as HTMLElement;

		if (!firstElement) return;

		const firstClozeId = firstElement.getAttribute("data-cloze-id");
		const currentState = firstClozeId ? this.clozeStates.get(firstClozeId) || false : false;
		const newState = !currentState;

		groupElements.forEach((element) => {
			const clozeElement = element as HTMLElement;
			const clozeId = clozeElement.getAttribute("data-cloze-id");

			if (clozeId) {
				this.clozeStates.set(clozeId, newState);
				this.updateClozeElement(clozeElement, newState);
			}
		});

		logger.debug(`[ClozePreview] 切换挖空组状态: ${groupId} -> ${newState}`);
	}

	/**
	 * 动画化挖空揭示
	 */
	private animateClozeReveal(element: HTMLElement): void {
		//  已移除缩放动画效果
		applyStyleProps(element, { transition: "opacity 0.15s ease-out" });
	}

	/**
	 * 重构内容（基于上下文的完整实现）
	 */
	private reconstructContent(clozeData: ClozeData[]): string {
		// 使用保存的原始内容
		if (clozeData.length === 0) {
			return "";
		}

		// 使用第一个挖空的原始内容作为基础
		const originalContent = clozeData[0].originalContent;

		if (!originalContent) {
			// 降级方案：如果没有原始内容，尝试重建
			logger.warn("[ClozePreview] 没有原始内容，使用降级重建方案");
			return clozeData.map((c) => `${c.contextBefore}${c.content}${c.contextAfter}`).join("");
		}

		return originalContent;
	}

	/**
	 * 获取挖空模式
	 */
	private getClozePattern(cloze: ClozeData): RegExp {
		switch (cloze.type) {
			case "obsidian":
				return new RegExp(cloze.content, "g");
			case "anki":
			case "anki-hint":
				return new RegExp(`\\{\\{c\\d+::${cloze.content}\\}\\}`, "g");
			default:
				return new RegExp(cloze.content, "g");
		}
	}
}
