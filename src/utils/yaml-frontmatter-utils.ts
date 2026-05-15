/**
 * YAML Frontmatter 工具
 *
 * 用于在MD文件中读取和更新增量阅读相关的YAML字段
 *
 * @module utils/yaml-frontmatter-utils
 * @version 1.0.0
 */

import type { App, TFile } from "obsidian";
import type { ReadingCategory, ReadingYAMLFields } from "../types/incremental-reading-types";
import {
	READING_LEGACY_DECK_YAML_KEY,
	READING_TOPIC_YAML_KEY,
	extractReadingTopicIdFromFrontmatter,
} from "./ir-topic-compat";
import { logger } from "./logger";

function normalizeWeaveTags(tags: unknown[]): string[] {
	const ordered = new Map<string, string>();
	for (const rawTag of Array.isArray(tags) ? tags : []) {
		const label = String(rawTag || "").trim();
		const key = label.toLowerCase();
		if (!key || ordered.has(key)) continue;
		ordered.set(key, label);
	}
	return Array.from(ordered.values());
}

/**
 * YAML Frontmatter 管理器
 */
export class YAMLFrontmatterManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private async stripEmptyFrontmatterBlock(file: TFile): Promise<void> {
		const vaultAny = this.app.vault as {
			read?: (file: TFile) => Promise<string>;
			modify?: (file: TFile, content: string) => Promise<void>;
		};

		if (typeof vaultAny.read !== "function" || typeof vaultAny.modify !== "function") {
			return;
		}

		const content = await vaultAny.read(file);
		const cleanedContent = content.replace(/^---\r?\n(?:[ \t]*\r?\n)*(?:---|\.\.\.)(?:\r?\n)?/, "");
		if (cleanedContent !== content) {
			await vaultAny.modify(file, cleanedContent);
		}
	}

	/**
	 * 获取文件的增量阅读YAML字段
	 * @param file 目标文件
	 * @returns 增量阅读字段，如果不存在则返回null
	 */
	async getReadingFields(file: TFile): Promise<Partial<ReadingYAMLFields> | null> {
		try {
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;

			if (!frontmatter) {
				return null;
			}

			const fields: Partial<ReadingYAMLFields> = {};

			if (frontmatter["weave-reading-id"]) {
				fields["weave-reading-id"] = frontmatter["weave-reading-id"];
			}
			if (frontmatter["weave-reading-category"]) {
				fields["weave-reading-category"] = frontmatter["weave-reading-category"];
			}
			if (frontmatter["weave-reading-priority"] !== undefined) {
				fields["weave-reading-priority"] = frontmatter["weave-reading-priority"];
			}
			if (frontmatter["weave_tags"] !== undefined) {
				const rawTags = Array.isArray(frontmatter["weave_tags"])
					? frontmatter["weave_tags"]
					: typeof frontmatter["weave_tags"] === "string"
						? String(frontmatter["weave_tags"])
								.split(",")
								.map((tag) => tag.trim())
						: [];
				fields["weave_tags"] = normalizeWeaveTags(rawTags);
			}
			const topicId = extractReadingTopicIdFromFrontmatter(frontmatter);
			if (topicId) {
				fields["weave-reading-topic-id"] = topicId;
				fields["weave-reading-ir-deck-id"] = topicId;
			}

			return Object.keys(fields).length > 0 ? fields : null;
		} catch (error) {
			logger.error("[YAMLFrontmatter] 获取YAML字段失败:", error);
			return null;
		}
	}

	/**
	 * 获取文件的阅读材料ID
	 * @param file 目标文件
	 * @returns 阅读材料UUID，如果不存在则返回null
	 */
	async getReadingId(file: TFile): Promise<string | null> {
		const fields = await this.getReadingFields(file);
		return fields?.["weave-reading-id"] || null;
	}

	/**
	 * 更新文件的增量阅读YAML字段
	 * @param file 目标文件
	 * @param updates 要更新的字段
	 */
	async updateReadingFields(file: TFile, updates: Partial<ReadingYAMLFields>): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				// 更新每个字段
				if (updates["weave-reading-id"] !== undefined) {
					const readingId = String(updates["weave-reading-id"] || "").trim();
					if (readingId) {
						frontmatter["weave-reading-id"] = readingId;
					} else {
						delete frontmatter["weave-reading-id"];
					}
				}
				if (updates["weave-reading-category"] !== undefined) {
					delete frontmatter["weave-reading-category"];
				}
				if (updates["weave-reading-priority"] !== undefined) {
					delete frontmatter["weave-reading-priority"];
				}
				if (updates["weave_tags"] !== undefined) {
					const normalizedTags = normalizeWeaveTags(updates["weave_tags"] || []);
					if (normalizedTags.length > 0) {
						frontmatter["weave_tags"] = normalizedTags;
					} else {
						delete frontmatter["weave_tags"];
					}
				}
				const topicId = updates[READING_TOPIC_YAML_KEY] ?? updates[READING_LEGACY_DECK_YAML_KEY];
				if (topicId !== undefined) {
					void topicId;
					delete frontmatter[READING_TOPIC_YAML_KEY];
					delete frontmatter[READING_LEGACY_DECK_YAML_KEY];
				}
			});

			logger.debug("[YAMLFrontmatter] 更新YAML字段成功:", file.path, updates);
		} catch (error) {
			logger.error("[YAMLFrontmatter] 更新YAML字段失败:", error);
			throw error;
		}
	}

	/**
	 * 初始化文件的增量阅读YAML字段
	 * @param file 目标文件
	 * @param uuid 阅读材料UUID
	 * @param category 初始分类
	 * @param priority 初始优先级
	 */
	async initializeReadingFields(
		file: TFile,
		uuid: string,
		category: ReadingCategory,
		priority: number
	): Promise<void> {
		await this.updateReadingFields(file, {
			"weave-reading-id": uuid,
			"weave-reading-category": category,
			"weave-reading-priority": priority,
			[READING_TOPIC_YAML_KEY]: "",
		});
	}

	/**
	 * 更新文件的分类
	 * @param file 目标文件
	 * @param category 新分类
	 */
	async updateCategory(file: TFile, category: ReadingCategory): Promise<void> {
		await this.updateReadingFields(file, {
			"weave-reading-category": category,
		});
	}

	/**
	 * 更新文件的优先级
	 * @param file 目标文件
	 * @param priority 新优先级
	 */
	async updatePriority(file: TFile, priority: number): Promise<void> {
		await this.updateReadingFields(file, {
			"weave-reading-priority": priority,
		});
	}

	/**
	 * 移除文件的增量阅读YAML字段
	 * @param file 目标文件
	 */
	async removeReadingFields(file: TFile): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter["weave-reading-id"] = undefined;
				frontmatter["weave-reading-category"] = undefined;
				frontmatter["weave-reading-priority"] = undefined;
				delete frontmatter[READING_TOPIC_YAML_KEY];
				delete frontmatter[READING_LEGACY_DECK_YAML_KEY];
			});
			await this.stripEmptyFrontmatterBlock(file);

			logger.debug("[YAMLFrontmatter] 移除YAML字段成功:", file.path);
		} catch (error) {
			logger.error("[YAMLFrontmatter] 移除YAML字段失败:", error);
			throw error;
		}
	}

	/**
	 * 检查文件是否有增量阅读标记
	 * @param file 目标文件
	 * @returns 是否有阅读标记
	 */
	async hasReadingMark(file: TFile): Promise<boolean> {
		const readingId = await this.getReadingId(file);
		return readingId !== null;
	}

	/**
	 * 批量获取多个文件的阅读ID
	 * @param files 文件列表
	 * @returns 文件路径 -> 阅读ID 的映射
	 */
	async batchGetReadingIds(files: TFile[]): Promise<Map<string, string>> {
		const result = new Map<string, string>();

		for (const file of files) {
			const readingId = await this.getReadingId(file);
			if (readingId) {
				result.set(file.path, readingId);
			}
		}

		return result;
	}
}

/**
 * 创建 YAML Frontmatter 管理器实例
 * @param app Obsidian App 实例
 */
export function createYAMLFrontmatterManager(app: App): YAMLFrontmatterManager {
	return new YAMLFrontmatterManager(app);
}
