import { logger } from "../utils/logger";
/**
 * 区间解析器 - 用于识别和提取扫描区间标记的内容
 */

export interface RegionMarkers {
	/** 开始标记 */
	startMarker: string;
	/** 结束标记 */
	endMarker: string;
	/** 卡片分隔符 */
	cardSeparator: string;
}

export interface ParsedRegion {
	/** 区间内容 */
	content: string;
	/** 开始位置 */
	startIndex: number;
	/** 结束位置 */
	endIndex: number;
	/** 区间内的卡片数量 */
	cardCount: number;
	/** 分割后的卡片内容 */
	cards: string[];
}

export interface RegionParseResult {
	/** 解析到的区间列表 */
	regions: ParsedRegion[];
	/** 总卡片数量 */
	totalCards: number;
	/** 解析统计 */
	stats: {
		totalRegions: number;
		totalContent: number;
		parseTime: number;
	};
	/** 错误信息 */
	errors: string[];
}

export class RegionParser {
	private markers: RegionMarkers;

	constructor(markers: RegionMarkers) {
		this.markers = markers;
	}

	/**
	 * 解析文本中的所有区间
	 */
	parseRegions(content: string): RegionParseResult {
		const startTime = Date.now();
		const result: RegionParseResult = {
			regions: [],
			totalCards: 0,
			stats: {
				totalRegions: 0,
				totalContent: content.length,
				parseTime: 0,
			},
			errors: [],
		};

		try {
			const regions = this.extractRegions(content);

			for (const region of regions) {
				try {
					const cards = this.splitCards(region.content);
					const parsedRegion: ParsedRegion = {
						...region,
						cardCount: cards.length,
						cards: cards.filter((card) => card.trim().length > 0), // 过滤空卡片
					};

					result.regions.push(parsedRegion);
					result.totalCards += parsedRegion.cards.length;
				} catch (error) {
					result.errors.push(
						`解析区间时出错: ${error instanceof Error ? error.message : "Unknown error"}`
					);
				}
			}

			result.stats.totalRegions = result.regions.length;
			result.stats.parseTime = Date.now() - startTime;

			logger.debug(
				`🔍 [RegionParser] 解析完成: ${result.stats.totalRegions} 个区间, ${result.totalCards} 张卡片, 耗时 ${result.stats.parseTime}ms`
			);
		} catch (error) {
			result.errors.push(
				`解析过程中出错: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}

		return result;
	}

	/**
	 * 提取所有区间
	 */
	private extractRegions(content: string): Omit<ParsedRegion, "cardCount" | "cards">[] {
		const regions: Omit<ParsedRegion, "cardCount" | "cards">[] = [];
		const { startMarker, endMarker } = this.markers;

		logger.debug(`🔍 [RegionParser] 开始提取区间，标记: "${startMarker}" -> "${endMarker}"`);
		logger.debug(`📝 [RegionParser] 内容长度: ${content.length}`);
		logger.debug(`📝 [RegionParser] 内容预览: ${content.substring(0, 200)}...`);

		let searchIndex = 0;

		while (searchIndex < content.length) {
			// 查找开始标记
			const startIndex = content.indexOf(startMarker, searchIndex);
			logger.debug(
				`🔍 [RegionParser] 查找开始标记 "${startMarker}" 从位置 ${searchIndex}，找到位置: ${startIndex}`
			);
			if (startIndex === -1) break;

			// 查找对应的结束标记
			const contentStartIndex = startIndex + startMarker.length;
			const endIndex = content.indexOf(endMarker, contentStartIndex);
			logger.debug(
				`🔍 [RegionParser] 查找结束标记 "${endMarker}" 从位置 ${contentStartIndex}，找到位置: ${endIndex}`
			);

			if (endIndex === -1) {
				logger.warn(`找到开始标记但未找到对应的结束标记，位置: ${startIndex}`);
				break;
			}

			// 提取区间内容（不包括标记本身）
			const regionContent = content.substring(contentStartIndex, endIndex).trim();
			logger.debug(`📝 [RegionParser] 提取区间内容长度: ${regionContent.length}`);
			logger.debug(`📝 [RegionParser] 区间内容预览: ${regionContent.substring(0, 100)}...`);

			if (regionContent.length > 0) {
				regions.push({
					content: regionContent,
					startIndex: contentStartIndex,
					endIndex: endIndex,
				});
			}

			// 继续搜索下一个区间
			searchIndex = endIndex + endMarker.length;
		}

		return regions;
	}

	/**
	 * 根据分隔符分割卡片
	 */
	private splitCards(regionContent: string): string[] {
		const { cardSeparator } = this.markers;

		// 如果没有分隔符，整个区间作为一张卡片
		if (!cardSeparator || cardSeparator.trim().length === 0) {
			return [regionContent];
		}

		// 使用分隔符分割内容
		const cards = regionContent.split(cardSeparator);

		// 清理每张卡片的内容
		return cards.map((card) => card.trim()).filter((card) => card.length > 0);
	}

	/**
	 * 自动检测分隔符
	 */
	static detectSeparator(content: string): string | null {
		const commonSeparators = [
			"---",
			"***",
			"___",
			"===",
			"###",
			"***",
			"---\n",
			"\n---\n",
			"\n***\n",
			"\n___\n",
		];

		const separatorCounts = new Map<string, number>();

		for (const separator of commonSeparators) {
			const count = (
				content.match(new RegExp(separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []
			).length;
			if (count > 0) {
				separatorCounts.set(separator, count);
			}
		}

		if (separatorCounts.size === 0) {
			return null;
		}

		// 返回出现次数最多的分隔符
		const sortedSeparators = Array.from(separatorCounts.entries()).sort((a, b) => b[1] - a[1]);

		return sortedSeparators[0][0];
	}

	/**
	 * 验证区间标记的有效性
	 */
	static validateMarkers(markers: RegionMarkers): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!markers.startMarker || markers.startMarker.trim().length === 0) {
			errors.push("开始标记不能为空");
		}

		if (!markers.endMarker || markers.endMarker.trim().length === 0) {
			errors.push("结束标记不能为空");
		}

		if (markers.startMarker === markers.endMarker) {
			errors.push("开始标记和结束标记不能相同");
		}

		if (
			markers.startMarker &&
			markers.cardSeparator &&
			markers.startMarker.includes(markers.cardSeparator)
		) {
			errors.push("开始标记不应包含卡片分隔符");
		}

		if (
			markers.endMarker &&
			markers.cardSeparator &&
			markers.endMarker.includes(markers.cardSeparator)
		) {
			errors.push("结束标记不应包含卡片分隔符");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * 预览区间解析结果
	 */
	previewRegions(
		content: string,
		maxPreviewLength = 100
	): Array<{
		index: number;
		preview: string;
		cardCount: number;
		startLine: number;
		endLine: number;
	}> {
		const parseResult = this.parseRegions(content);

		return parseResult.regions.map((region, index) => {
			// 计算行号
			const beforeStart = content.substring(0, region.startIndex);
			const beforeEnd = content.substring(0, region.endIndex);
			const startLine = beforeStart.split("\n").length;
			const endLine = beforeEnd.split("\n").length;

			// 生成预览
			let preview = region.content;
			if (preview.length > maxPreviewLength) {
				preview = `${preview.substring(0, maxPreviewLength)}...`;
			}

			return {
				index: index + 1,
				preview,
				cardCount: region.cards.length,
				startLine,
				endLine,
			};
		});
	}

	/**
	 * 更新标记配置
	 */
	updateMarkers(markers: RegionMarkers): void {
		this.markers = markers;
	}

	/**
	 * 获取当前标记配置
	 */
	getMarkers(): RegionMarkers {
		return { ...this.markers };
	}
}
