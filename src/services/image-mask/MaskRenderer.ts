import { logger } from "../../utils/logger";
/**
 * 遮罩渲染器
 *
 * 功能：
 * - 在学习复习时渲染遮罩到图片上
 * - 支持 SVG 遮罩层（轻量级，支持百分比坐标）
 * - 支持遮罩显示/隐藏动画
 * - 支持多种遮罩样式（纯色、模糊）
 *
 * @author Weave Team
 * @date 2025-10-22
 */

import type { Mask, MaskData, MaskRenderOptions } from "../../types/image-mask-types";
import { MASK_CONSTANTS } from "../../types/image-mask-types";
import { parseRGBAColor } from "./mask-operations";
import { applyStyleProps } from "../../utils/style-props";

export class MaskRenderer {
	// 遮罩状态追踪 Map<maskId, isVisible>
	private maskStates: Map<string, boolean> = new Map();

	/**
	 * 在图片元素上渲染遮罩
	 *
	 * @param imgElement 图片 DOM 元素
	 * @param maskData 遮罩数据
	 * @param options 渲染选项
	 */
	renderMasksOnImage(
		imgElement: HTMLImageElement,
		maskData: MaskData,
		options: MaskRenderOptions = { visible: true, interactive: false }
	): void {
		if (!maskData || !maskData.masks || maskData.masks.length === 0) {
			return;
		}

		// 图片资源可能尚未加载完成（尤其是移动端或懒加载场景）
		// 如果 naturalWidth/naturalHeight 为 0，会导致 viewBox/坐标计算错误，从而出现遮罩错位。
		if (!imgElement.complete || imgElement.naturalWidth === 0 || imgElement.naturalHeight === 0) {
			const pendingKey = "weaveMaskPending";
			if (imgElement.dataset[pendingKey] === "1") {
				return;
			}

			imgElement.dataset[pendingKey] = "1";
			imgElement.addEventListener(
				"load",
				() => {
					delete imgElement.dataset[pendingKey];
					this.renderMasksOnImage(imgElement, maskData, options);
				},
				{ once: true }
			);

			return;
		}

		// 创建遮罩容器
		const container = this.createMaskContainer(imgElement, options.interactive);

		// 渲染每个遮罩
		maskData.masks.forEach((_mask) => {
			const maskElement = this.createMaskElement(_mask, imgElement, options);
			if (maskElement) {
				container.appendChild(maskElement);

				// 初始化遮罩状态
				this.maskStates.set(_mask.id, options.visible ?? true);

				// 如果启用交互模式，添加点击事件
				if (options.interactive) {
					this.makeMaskInteractive(maskElement as SVGGElement, _mask.id);
				}
			}
		});
	}

	/**
	 * 显示遮罩（动画）
	 *
	 * @param container 遮罩容器元素
	 * @param duration 动画持续时间（毫秒）
	 */
	showMasks(
		container: HTMLElement | null,
		duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
	): void {
		if (!container) return;

		applyStyleProps(container, {
			display: "",
			opacity: "1",
			transition: `opacity ${duration}ms ease-in`,
		});
	}

	/**
	 * 隐藏遮罩（动画）- 用于显示答案时
	 *
	 * @param container 遮罩容器元素
	 * @param duration 动画持续时间（毫秒）
	 */
	hideMasks(
		container: HTMLElement | null,
		duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
	): void {
		if (!container) return;

		applyStyleProps(container, {
			opacity: "0",
			transition: `opacity ${duration}ms ease-out`,
		});

		// 更新所有遮罩状态为已揭示
		const masks = container.querySelectorAll(".weave-mask");
		masks.forEach((_mask) => {
			const maskId = _mask.closest("g[data-mask-id]")?.getAttribute("data-mask-id");
			if (maskId) {
				this.maskStates.set(maskId, false);
			}
		});

		// 动画结束后隐藏元素
		setTimeout(() => {
			applyStyleProps(container, { display: "none" });
		}, duration);
	}

	/**
	 * 切换单个遮罩的显示状态
	 *
	 * @param maskId 遮罩ID
	 * @param duration 动画持续时间（毫秒）
	 */
	toggleMask(
		maskId: string,
		duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION,
		root: ParentNode = document
	): void {
		const maskElement = this.findMaskShape(maskId, root);
		if (!maskElement) return;

		const currentState = this.maskStates.get(maskId) ?? true;
		const newState = !currentState;

		this.maskStates.set(maskId, newState);
		this.applyMaskVisibility(maskElement, newState, duration);
	}

	/**
	 * 恢复容器内所有遮罩为可见（用于从「显示答案」回到问题面）
	 */
	restoreAllMasksInContainer(container: HTMLElement): void {
		const shapes = container.querySelectorAll("g[data-mask-id] .weave-mask");
		shapes.forEach((shape) => {
			const maskElement = shape as SVGElement;
			const group = maskElement.closest("g[data-mask-id]");
			const maskId = group?.getAttribute("data-mask-id");
			if (!maskId) return;

			this.maskStates.set(maskId, true);
			this.applyMaskVisibility(maskElement, true, 0);
		});
	}

	/**
	 * 使遮罩可交互（添加点击事件）
	 */
	private makeMaskInteractive(maskGroup: SVGGElement, maskId: string): void {
		const maskElement = maskGroup.querySelector(".weave-mask") as SVGElement | null;
		if (!maskElement) return;

		const maskRoot = maskGroup.closest(".weave-mask-overlay") ?? document;

		applyStyleProps(maskElement, {
			"pointer-events": "auto",
			cursor: "pointer",
		});
		maskElement.classList.add("weave-mask-interactive");

		const originalOpacity = maskElement.getAttribute("fill-opacity") || "0.7";
		maskElement.setAttribute("data-original-opacity", originalOpacity);

		const handleToggle = (e: Event) => {
			e.stopPropagation();
			e.preventDefault();
			this.toggleMask(maskId, MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION, maskRoot);
			logger.debug("[MaskRenderer] 切换遮罩:", maskId);
		};

		maskElement.addEventListener("click", handleToggle);

		maskElement.addEventListener("mouseenter", () => {
			const isVisible = this.maskStates.get(maskId) ?? true;
			if (isVisible && !maskElement.classList.contains("mask-revealed")) {
				const currentOpacity =
					maskElement.style.fillOpacity || maskElement.getAttribute("fill-opacity") || "0.7";
				maskElement.setAttribute("data-hover-backup-opacity", currentOpacity);
				applyStyleProps(maskElement, {
					transition: "fill-opacity 150ms ease",
					"fill-opacity": "0",
				});
				maskElement.classList.add("mask-hovering");
			}
		});

		maskElement.addEventListener("mouseleave", () => {
			const isVisible = this.maskStates.get(maskId) ?? true;
			if (isVisible && maskElement.classList.contains("mask-hovering")) {
				const backupOpacity = maskElement.getAttribute("data-hover-backup-opacity") || "0.7";
				applyStyleProps(maskElement, { "fill-opacity": backupOpacity });
				maskElement.classList.remove("mask-hovering");
			}
		});
	}

	/**
	 * 查找图片对应的遮罩容器
	 *
	 * @param imgElement 图片元素
	 * @returns 遮罩容器或 null
	 */
	findMaskContainer(imgElement: HTMLImageElement): HTMLElement | null {
		const wrapper = imgElement.parentElement;
		if (!wrapper || !wrapper.classList.contains("weave-image-with-masks")) {
			return null;
		}

		return wrapper.querySelector(".weave-mask-overlay") as HTMLElement;
	}

	/**
	 * Hide All, Guess One 模式：只揭示指定编号的遮罩
	 *
	 * @param container 遮罩容器
	 * @param revealIndex 要揭示的遮罩编号（从1开始），0表示全部隐藏
	 */
	revealByIndex(container: HTMLElement | null, revealIndex: number): void {
		if (!container) return;

		const maskGroups = container.querySelectorAll("g[data-mask-id]");
		maskGroups.forEach((_group) => {
			const indexText = _group.querySelector(".weave-mask-index");
			const maskIndex = indexText ? parseInt(indexText.textContent || "0", 10) : 0;
			const shapeElement = _group.querySelector("rect, circle") as SVGElement;

			if (shapeElement) {
				if (revealIndex === 0) {
					// 全部显示遮罩
					applyStyleProps(shapeElement, {
						"fill-opacity": shapeElement.getAttribute("data-original-opacity") || "0.7",
					});
				} else if (maskIndex === revealIndex) {
					// 揭示指定编号的遮罩
					applyStyleProps(shapeElement, { "fill-opacity": "0" });
				} else {
					// 其他遮罩保持显示
					applyStyleProps(shapeElement, {
						"fill-opacity": shapeElement.getAttribute("data-original-opacity") || "0.7",
					});
				}
			}
		});

		logger.debug("[MaskRenderer] Hide All Guess One - 揭示编号:", revealIndex);
	}

	/**
	 * 获取遮罩总数
	 */
	getMaskCount(container: HTMLElement | null): number {
		if (!container) return 0;
		return container.querySelectorAll("g[data-mask-id]").length;
	}

	// ===== 私有方法 =====

	private findMaskShape(maskId: string, root: ParentNode = document): SVGElement | null {
		const group = root.querySelector(`g[data-mask-id="${maskId}"]`);
		if (!group) return null;
		return group.querySelector(".weave-mask") as SVGElement | null;
	}

	private applyMaskVisibility(
		maskElement: SVGElement,
		visible: boolean,
		duration: number
	): void {
		if (visible) {
			applyStyleProps(maskElement, {
				transition: duration > 0 ? `fill-opacity ${duration}ms ease-in` : "",
				"fill-opacity": maskElement.getAttribute("data-original-opacity") || "0.7",
			});
			maskElement.classList.remove("mask-revealed");
			maskElement.classList.remove("mask-hovering");
			return;
		}

		applyStyleProps(maskElement, {
			transition: duration > 0 ? `fill-opacity ${duration}ms ease-out` : "",
			"fill-opacity": "0",
		});
		maskElement.classList.add("mask-revealed");
		maskElement.classList.remove("mask-hovering");
	}

	/**
	 * 创建遮罩容器
	 *
	 *  创新方案：动态获取图片实际显示尺寸，精确定位 SVG 遮罩层
	 */
	private createMaskContainer(imgElement: HTMLImageElement, interactive = false): SVGElement {
		// 检查是否已存在包装器
		let wrapper = imgElement.parentElement;
		if (!wrapper || !wrapper.classList.contains("weave-image-with-masks")) {
			// 创建包装器
			wrapper = document.createElement("div");
			wrapper.className = "weave-image-with-masks";

			// 替换图片位置
			const parent = imgElement.parentElement;
			if (parent) {
				parent.insertBefore(wrapper, imgElement);
				wrapper.appendChild(imgElement);
			}
		}

		// 移除旧的遮罩层（如果存在）
		const oldOverlay = wrapper.querySelector(".weave-mask-overlay");
		if (oldOverlay) {
			oldOverlay.remove();
		}

		// 遮罩坐标以图片原始尺寸（natural）作为“坐标系”，但遮罩层的
		// 实际显示大小必须跟随图片当前显示尺寸，否则在不同窗口/移动端缩放时会错位。
		const naturalWidth =
			imgElement.naturalWidth || imgElement.clientWidth || imgElement.offsetWidth;
		const naturalHeight =
			imgElement.naturalHeight || imgElement.clientHeight || imgElement.offsetHeight;

		logger.debug("[MaskRenderer] 图片尺寸:", {
			naturalWidth: imgElement.naturalWidth,
			naturalHeight: imgElement.naturalHeight,
			clientWidth: imgElement.clientWidth,
			clientHeight: imgElement.clientHeight,
		});

		// 创建 SVG 遮罩层
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute(
			"class",
			interactive ? "weave-mask-overlay interactive" : "weave-mask-overlay"
		);

		// viewBox 固定使用图片原始像素尺寸，确保遮罩数据在任何显示尺寸下都能按比例缩放。
		svg.setAttribute("viewBox", `0 0 ${naturalWidth} ${naturalHeight}`);
		svg.setAttribute("preserveAspectRatio", "none");

		// 遮罩层显示尺寸使用 100%，严格跟随图片当前显示尺寸
		// 这样无论学习预览里图片被缩放到多大，遮罩都能正确覆盖。
		applyStyleProps(svg, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			"pointer-events": interactive ? "auto" : "none",
		});

		// 保存图片尺寸供后续使用
		svg.dataset.imgWidth = String(naturalWidth);
		svg.dataset.imgHeight = String(naturalHeight);

		wrapper.appendChild(svg);

		return svg;
	}

	/**
	 * 创建单个遮罩元素
	 *
	 *  创新方案：使用图片实际尺寸计算遮罩坐标
	 */
	private createMaskElement(
		mask: Mask,
		imgElement: HTMLImageElement,
		options: MaskRenderOptions
	): SVGElement | null {
		// 遮罩元素坐标计算必须使用 natural 尺寸（与 viewBox 坐标系一致）
		const imgWidth = imgElement.naturalWidth || imgElement.clientWidth || imgElement.offsetWidth;
		const imgHeight =
			imgElement.naturalHeight || imgElement.clientHeight || imgElement.offsetHeight;

		let shapeElement: SVGElement;

		if (mask.type === "rect") {
			shapeElement = this.createRectMask(mask, imgWidth, imgHeight);
		} else if (mask.type === "circle") {
			shapeElement = this.createCircleMask(mask, imgWidth, imgHeight);
		} else {
			logger.warn("[MaskRenderer] 不支持的遮罩类型:", mask.type);
			return null;
		}

		// 应用样式
		this.applyMaskStyle(shapeElement, mask);

		// 创建组合元素，包含形状和编号
		const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
		group.setAttribute("data-mask-id", mask.id);
		group.appendChild(shapeElement);

		// 添加编号显示
		if (mask.index) {
			const badgeGroup = this.createMaskIndexText(mask, imgWidth, imgHeight);
			group.appendChild(badgeGroup);
		}

		// 应用可见性
		if (!options.visible) {
			applyStyleProps(group, { display: "none" });
		}

		return group;
	}

	/**
	 * 创建角标式编号徽章（左上角）
	 */
	private createMaskIndexText(mask: Mask, imgWidth: number, imgHeight: number): SVGGElement {
		const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
		group.setAttribute("class", "weave-mask-badge");
		group.setAttribute("pointer-events", "none");

		// 计算左上角位置
		let badgeX: number;
		let badgeY: number;
		const minDimension = Math.min(imgWidth, imgHeight);
		const badgeSize = Math.max(16, minDimension * 0.04); // 徽章大小
		const offset = badgeSize * 0.3; // 内边距

		if (mask.type === "rect") {
			badgeX = mask.x * imgWidth + offset;
			badgeY = mask.y * imgHeight + offset;
		} else {
			badgeX = (mask.x - (mask.radius || 0)) * imgWidth + offset;
			badgeY = (mask.y - (mask.radius || 0)) * imgHeight + offset;
		}

		// 徽章背景（圆角矩形）
		const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		bg.setAttribute("x", String(badgeX - badgeSize / 2));
		bg.setAttribute("y", String(badgeY - badgeSize / 2));
		bg.setAttribute("width", String(badgeSize));
		bg.setAttribute("height", String(badgeSize));
		bg.setAttribute("rx", String(badgeSize * 0.2));
		bg.setAttribute("fill", "rgba(0, 0, 0, 0.75)");
		group.appendChild(bg);

		// 编号文字
		const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
		text.setAttribute("x", String(badgeX));
		text.setAttribute("y", String(badgeY));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.textContent = String(mask.index);

		const fontSize = Math.max(10, badgeSize * 0.6);
		applyStyleProps(text, {
			"font-size": `${fontSize}px`,
			"font-weight": "600",
			fill: "white",
			"user-select": "none",
		});
		group.appendChild(text);

		return group;
	}

	/**
	 * 创建矩形遮罩
	 */
	private createRectMask(mask: Mask, imgWidth: number, imgHeight: number): SVGRectElement {
		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

		//  创新方案：坐标乘以图片实际尺寸（而不是固定的10）
		// 这样 viewBox 和坐标都使用图片实际像素，确保精确对齐
		rect.setAttribute("x", `${mask.x * imgWidth}`);
		rect.setAttribute("y", `${mask.y * imgHeight}`);
		rect.setAttribute("width", `${(mask.width || 0) * imgWidth}`);
		rect.setAttribute("height", `${(mask.height || 0) * imgHeight}`);

		return rect;
	}

	/**
	 * 创建圆形遮罩
	 *
	 *  创新方案：使用图片实际尺寸计算坐标
	 */
	private createCircleMask(mask: Mask, imgWidth: number, imgHeight: number): SVGCircleElement {
		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");

		//  创新方案：坐标乘以图片实际尺寸
		circle.setAttribute("cx", `${mask.x * imgWidth}`);
		circle.setAttribute("cy", `${mask.y * imgHeight}`);
		// 圆形半径使用宽高中较小的值，保持比例
		const minDimension = Math.min(imgWidth, imgHeight);
		circle.setAttribute("r", `${(mask.radius || 0) * minDimension}`);

		return circle;
	}

	/**
	 * 应用遮罩样式
	 */
	private applyMaskStyle(element: SVGElement, mask: Mask): void {
		const fill = mask.fill || MASK_CONSTANTS.DEFAULT_FILL;
		const { rgb, opacity } = parseRGBAColor(fill);

		// 统一设置颜色属性
		element.setAttribute("fill", rgb);
		element.setAttribute("fill-opacity", opacity.toString());

		// 保存原始透明度（用于 Hide All Guess One 模式）
		element.setAttribute("data-original-opacity", opacity.toString());

		// 强制元素本身不透明，防止 CSS 的 opacity 覆盖 fill-opacity
		applyStyleProps(element, { opacity: "1" });

		// 应用特殊样式
		if (mask.style === "blur") {
			// SVG 模糊滤镜
			const filterId = `blur-${mask.id}`;
			const filter = this.createBlurFilter(
				filterId,
				mask.blurRadius || MASK_CONSTANTS.DEFAULT_BLUR_RADIUS
			);

			// 添加滤镜到 SVG
			const svg = element.parentElement as unknown as SVGElement;
			if (svg) {
				let defs = svg.querySelector("defs");
				if (!defs) {
					defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
					svg.insertBefore(defs, svg.firstChild);
				}
				defs.appendChild(filter);

				element.setAttribute("filter", `url(#${filterId})`);
			}
		}

		// 添加类名用于 CSS 控制
		element.classList.add("weave-mask");
		element.classList.add(`weave-mask-${mask.style}`);
	}

	/**
	 * 重置所有遮罩状态（清理状态追踪）
	 */
	resetMaskStates(): void {
		this.maskStates.clear();
	}

	/**
	 * 创建模糊滤镜
	 */
	private createBlurFilter(id: string, radius: number): SVGFilterElement {
		const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
		filter.setAttribute("id", id);

		const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
		blur.setAttribute("in", "SourceGraphic");
		blur.setAttribute("stdDeviation", `${radius}`);

		filter.appendChild(blur);

		return filter;
	}
}

/**
 * 在容器中查找所有带遮罩的图片
 *
 * @param container 容器元素
 * @returns 带遮罩的图片包装器数组
 */
export function findMaskedImages(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll(".weave-image-with-masks")) as HTMLElement[];
}

/**
 * 批量显示所有遮罩
 *
 * @param container 容器元素
 * @param duration 动画持续时间
 */
export function revealAllMasks(
	container: HTMLElement,
	duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
): void {
	const renderer = new MaskRenderer();
	const maskedImages = findMaskedImages(container);

	maskedImages.forEach((wrapper) => {
		const overlay = wrapper.querySelector(".weave-mask-overlay") as HTMLElement;
		renderer.hideMasks(overlay, duration);
	});
}

/**
 * 批量隐藏所有遮罩
 *
 * @param container 容器元素
 * @param duration 动画持续时间
 */
export function hideAllMasks(
	container: HTMLElement,
	duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
): void {
	const renderer = new MaskRenderer();
	const maskedImages = findMaskedImages(container);

	maskedImages.forEach((wrapper) => {
		const overlay = wrapper.querySelector(".weave-mask-overlay") as HTMLElement;
		renderer.showMasks(overlay, duration);
	});
}
