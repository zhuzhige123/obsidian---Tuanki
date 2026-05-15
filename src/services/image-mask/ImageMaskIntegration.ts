import { logger } from "../../utils/logger";
/**
 * 图片遮罩集成服务
 *
 * 功能：
 * - 在学习界面自动检测和渲染遮罩
 * - 处理显示答案时的遮罩揭示动画
 * - 提供统一的遮罩管理接口
 *
 * @author Weave Team
 * @date 2025-10-22
 */

import type { App } from "obsidian";
import type { MaskData } from "../../types/image-mask-types";
import { MASK_CONSTANTS } from "../../types/image-mask-types";
import { MaskDataParser } from "./MaskDataParser";
import { buildMaskTargetKey, getMaskTargetComparablePath, normalizeImageResourceUrl } from "./image-mask-target";
import { MaskRenderer, revealAllMasks } from "./MaskRenderer";
import { applyStyleProps } from "../../utils/style-props";

interface ParsedMaskLookup {
	byIndex: Map<number, MaskData>;
	byTargetKey: Map<string, MaskData>;
	knownComparablePaths: string[];
}

export class ImageMaskIntegration {
	private app: App;
	private parser: MaskDataParser;
	private renderer: MaskRenderer;

	constructor(app: App) {
		this.app = app;
		this.parser = new MaskDataParser(app);
		this.renderer = new MaskRenderer();
	}

	/**
	 * 在容器中查找并渲染所有带遮罩的图片
	 *
	 * @param container 容器元素
	 * @param content Markdown 内容（用于解析遮罩数据）
	 * @param interactive 是否启用交互模式（点击单个遮罩切换）
	 * @param sourceFilePath Markdown 源文件路径，用于解析更稳定的图片目标
	 */
	applyMasksInContainer(
		container: HTMLElement,
		content: string,
		interactive = false,
		sourceFilePath = ""
	): void {
		const images = container.querySelectorAll("img");

		if (images.length === 0) {
			return;
		}

		// 解析内容，查找遮罩注释
		const maskLookup = this.parseMaskDataFromContent(content, sourceFilePath);

		if (maskLookup.byIndex.size === 0 && maskLookup.byTargetKey.size === 0) {
			return;
		}

		const renderedOccurrenceByPath = new Map<string, number>();

		// 为每个图片应用遮罩
		images.forEach((img, index) => {
			const comparablePath = this.resolveRenderedImageComparablePath(
				img,
				maskLookup.knownComparablePaths
			);
			const occurrence = comparablePath
				? (renderedOccurrenceByPath.get(comparablePath) || 0) + 1
				: 0;
			if (comparablePath) {
				renderedOccurrenceByPath.set(comparablePath, occurrence);
			}

			const maskData = this.findMaskDataForImage(index, comparablePath, occurrence, maskLookup);

			if (maskData) {
				// 调试日志：输出遮罩数据详情
				logger.debug(`[ImageMaskIntegration] 为图片 ${index} 应用遮罩，数据:`, {
					maskCount: maskData.masks.length,
					comparablePath,
					occurrence,
					masks: maskData.masks.map((m) => ({
						id: m.id,
						type: m.type,
						fill: m.fill,
						style: m.style,
					})),
				});

				this.renderer.renderMasksOnImage(img, maskData, { visible: true, interactive });
			}
		});
	}

	/**
	 * 显示所有遮罩（用于显示问题时）
	 *
	 * @param container 容器元素
	 * @param animated 是否启用动画
	 */
	showAllMasks(container: HTMLElement, animated = false): void {
		const maskedImages = container.querySelectorAll(".weave-image-with-masks");

		maskedImages.forEach((wrapper) => {
			const overlay = wrapper.querySelector(".weave-mask-overlay") as HTMLElement;
			if (overlay) {
				if (animated) {
					this.renderer.showMasks(overlay, MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION);
				} else {
					//  修复：非动画模式也要恢复 display 属性
					applyStyleProps(overlay, {
						display: "",
						opacity: "1",
					});
				}
			}
		});

		logger.debug(`[ImageMaskIntegration] 显示所有遮罩（动画: ${animated}）`);
	}

	/**
	 * 揭示所有遮罩（用于显示答案时）
	 *
	 * @param container 容器元素
	 * @param duration 动画持续时间（毫秒）
	 */
	revealAllMasks(
		container: HTMLElement,
		duration: number = MASK_CONSTANTS.DEFAULT_ANIMATION_DURATION
	): void {
		revealAllMasks(container, duration);
		logger.debug(`[ImageMaskIntegration] 揭示所有遮罩（动画 ${duration}ms）`);
	}

	/**
	 * 移除容器中的所有遮罩
	 *
	 * @param container 容器元素
	 */
	removeMasksInContainer(container: HTMLElement): void {
		const overlays = container.querySelectorAll(".weave-mask-overlay");
		overlays.forEach((overlay) => overlay.remove());

		const wrappers = container.querySelectorAll(".weave-image-with-masks");
		wrappers.forEach((_wrapper) => {
			const img = _wrapper.querySelector("img");
			if (img && _wrapper.parentElement) {
				_wrapper.parentElement.insertBefore(img, _wrapper);
				_wrapper.remove();
			}
		});
	}

	// ===== 私有方法 =====

	/**
	 * 从内容中解析所有遮罩数据
	 * 同时维护：
	 * - 兼容旧逻辑的图片全局顺序索引
	 * - 更稳定的图片路径 + 同路径出现次数目标索引
	 */
	private parseMaskDataFromContent(content: string, sourceFilePath: string): ParsedMaskLookup {
		const byIndex = new Map<number, MaskData>();
		const byTargetKey = new Map<string, MaskData>();
		const knownComparablePaths = new Set<string>();
		const lines = content.split("\n");
		let imageCount = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			// 检查当前行是否为图片
			if (this.parser.hasImageLink(line)) {
				// 检查下一行是否为遮罩注释
				const nextLineIndex = i + 1;
				if (nextLineIndex < lines.length) {
					const nextLine = lines[nextLineIndex].trim();

					if (nextLine.startsWith(MASK_CONSTANTS.COMMENT_PREFIX)) {
						const parseResult = this.parser.parseCommentToMaskData(nextLine);

						if (parseResult.success && parseResult.data) {
							const target =
								parseResult.data.target ||
								this.parser.buildMaskTargetForImage(content, i, sourceFilePath) ||
								undefined;
							const maskData = target
								? {
									...parseResult.data,
									target,
								}
								: parseResult.data;
							const targetKey = buildMaskTargetKey(maskData.target);
							const comparablePath = getMaskTargetComparablePath(maskData.target);

							byIndex.set(imageCount, maskData);
							if (targetKey && !byTargetKey.has(targetKey)) {
								byTargetKey.set(targetKey, maskData);
							}
							if (comparablePath) {
								knownComparablePaths.add(comparablePath);
							}
							logger.debug(
								`[ImageMaskIntegration] 找到遮罩数据：图片序号=${imageCount}，遮罩数量=${maskData.masks.length}`
							);
						}
					}
				}

				// 图片计数递增
				imageCount++;
			}
		}

		logger.debug(
			`[ImageMaskIntegration] 解析完成：共 ${imageCount} 张图片，${byIndex.size} 张有遮罩`
		);
		return {
			byIndex,
			byTargetKey,
			knownComparablePaths: Array.from(knownComparablePaths),
		};
	}

	/**
	 * 查找图片对应的遮罩数据
	 */
	private findMaskDataForImage(
		imageIndex: number,
		comparablePath: string,
		occurrence: number,
		maskLookup: ParsedMaskLookup
	): MaskData | null {
		const targetKey = comparablePath
			? buildMaskTargetKey({ imagePath: comparablePath, imageOccurrence: occurrence })
			: null;
		const maskData = targetKey ? maskLookup.byTargetKey.get(targetKey) : undefined;

		if (maskData) {
			logger.debug(
				`[ImageMaskIntegration] 通过稳定 target 为图片 #${imageIndex} 找到遮罩数据，包含 ${maskData.masks.length} 个遮罩`
			);
			return maskData;
		}

		const fallbackMaskData = maskLookup.byIndex.get(imageIndex);
		if (fallbackMaskData) {
			logger.debug(
				`[ImageMaskIntegration] 回退到图片顺序为图片 #${imageIndex} 找到遮罩数据，包含 ${fallbackMaskData.masks.length} 个遮罩`
			);
			return fallbackMaskData;
		}

		return null;
	}

	private resolveRenderedImageComparablePath(img: HTMLImageElement, knownComparablePaths: string[]): string {
		if (knownComparablePaths.length === 0) {
			return "";
		}

		const rawCandidates = [img.currentSrc, img.getAttribute("src") || "", img.getAttribute("alt") || ""];
		const candidates = Array.from(
			new Set(rawCandidates.map((value) => normalizeImageResourceUrl(value)).filter(Boolean))
		);

		let bestMatch = "";
		for (const candidate of candidates) {
			const candidateFileName = this.getPathFileName(candidate);
			for (const knownPath of knownComparablePaths) {
				const knownFileName = this.getPathFileName(knownPath);
				const isMatch =
					candidate === knownPath ||
					candidate.endsWith(`/${knownPath}`) ||
					candidate.endsWith(knownPath) ||
					knownPath.endsWith(`/${candidate}`) ||
					(!!candidateFileName && candidateFileName === knownFileName);
				if (isMatch && knownPath.length > bestMatch.length) {
					bestMatch = knownPath;
				}
			}
		}

		return bestMatch;
	}

	private getPathFileName(value: string): string {
		const normalized = normalizeImageResourceUrl(value);
		if (!normalized) {
			return "";
		}

		const segments = normalized.split("/").filter(Boolean);
		return segments[segments.length - 1] || "";
	}
}

/**
 * 创建图片遮罩集成实例的便捷函数
 */
export function createImageMaskIntegration(app: App): ImageMaskIntegration {
	return new ImageMaskIntegration(app);
}
