import { logger } from "../../utils/logger";
/**
 * Frontmatter 管理器
 * 职责：读取和写入 Markdown 文件的 frontmatter（YAML 元数据块）
 *
 * 功能：
 * 1. 解析 frontmatter
 * 2. 更新 frontmatter 中的字段
 * 3. 生成/写入 frontmatter
 * 4. 保持其他 frontmatter 字段不变
 *
 * @author Weave Team
 * @date 2025-11-03
 */

import { App, TFile } from "obsidian";

/**
 * Frontmatter 数据类型
 */
export interface FrontmatterData {
	[key: string]: unknown;
}

/**
 * UUID 字段名称（Weave 专用）
 */
export const WEAVE_UUID_FIELD = "weave-uuid";

/**
 * Frontmatter 管理器
 */
export class FrontmatterManager {
	constructor(private app: App) {}

	/**
	 * 解析文件的 frontmatter
	 * @param file Obsidian 文件对象
	 * @returns frontmatter 数据对象，如果不存在返回空对象
	 */
	async parseFrontmatter(file: TFile): Promise<FrontmatterData> {
		try {
			const content = await this.app.vault.read(file);
			return this.parseFrontmatterFromContent(content);
		} catch (error) {
			logger.error("[FrontmatterManager] 解析frontmatter失败:", error);
			return {};
		}
	}

	/**
	 * 从内容字符串中解析 frontmatter
	 * @param content Markdown 文件内容
	 * @returns frontmatter 数据对象
	 */
	parseFrontmatterFromContent(content: string): FrontmatterData {
		// 改进的正则：支持多种 frontmatter 格式
		// 格式1: ---\n...\n---
		// 格式2: ---\r\n...\r\n---
		// 格式3: ---\n...\n---\n（末尾有换行）
		const match = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---/);
		if (!match) {
			return {};
		}

		const yamlContent = match[1];
		return this.parseYAML(yamlContent);
	}

	/**
	 * 简单的 YAML 解析（仅支持基本键值对）
	 * 改进：更好地处理带引号的值和特殊字符
	 * @param yaml YAML 字符串
	 * @returns 解析后的对象
	 */
	private parseYAML(yaml: string): FrontmatterData {
		const result: FrontmatterData = {};
		const lines = yaml.split(/\r?\n/); // 支持 Windows 和 Unix 换行符
		let pendingArrayKey: string | null = null;
		let pendingArrayValues: string[] = [];

		const flushPendingArray = () => {
			if (!pendingArrayKey) {
				return;
			}

			result[pendingArrayKey] = [...pendingArrayValues];
			pendingArrayKey = null;
			pendingArrayValues = [];
		};

		for (const line of lines) {
			const isArrayItem = /^\s*-\s+/.test(line);
			if (isArrayItem) {
				if (!pendingArrayKey) {
					continue;
				}

				let itemValue = line.replace(/^\s*-\s+/, "").trim();
				if (
					(itemValue.startsWith('"') && itemValue.endsWith('"')) ||
					(itemValue.startsWith("'") && itemValue.endsWith("'"))
				) {
					itemValue = itemValue.substring(1, itemValue.length - 1);
					itemValue = itemValue.replace(/\\"/g, '"').replace(/\\'/g, "'");
				}

				pendingArrayValues.push(itemValue);
				continue;
			}

			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) {
				continue; // 跳过空行和注释
			}

			const colonIndex = trimmed.indexOf(":");
			if (colonIndex === -1) {
				continue;
			}

			flushPendingArray();

			const key = trimmed.substring(0, colonIndex).trim();
			let value = trimmed.substring(colonIndex + 1).trim();

			if (value === "") {
				pendingArrayKey = key;
				pendingArrayValues = [];
				continue;
			}

			// 处理带引号的值（支持单引号和双引号）
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				// 移除外层引号
				value = value.substring(1, value.length - 1);
				// 处理转义字符
				value = value.replace(/\\"/g, '"').replace(/\\'/g, "'");
			}

			// 特殊处理：UUID 不应该被转换为数字
			// 如果值看起来像 UUID（包含连字符或长度较长），保持为字符串
			const looksLikeUUID = value.includes("-") || value.length > 15;

			// 尝试转换为数字或布尔值（但排除 UUID）
			if (!looksLikeUUID) {
				if (value === "true") {
					result[key] = true;
				} else if (value === "false") {
					result[key] = false;
				} else if (!Number.isNaN(Number(value)) && value !== "" && !value.includes(" ")) {
					// 只有当值确实是纯数字且不包含空格时才转换
					result[key] = Number(value);
				} else {
					result[key] = value;
				}
			} else {
				result[key] = value;
			}
		}

		flushPendingArray();

		return result;
	}

	/**
	 * 将对象转换为 YAML 字符串
	 * @param data 数据对象
	 * @returns YAML 字符串
	 */
	private stringifyYAML(data: FrontmatterData): string {
		const lines: string[] = [];

		for (const [key, value] of Object.entries(data)) {
			let yamlValue: string;

			if (typeof value === "string") {
				// 字符串需要加引号（如果包含特殊字符）
				if (value.includes(":") || value.includes("#") || value.includes("\n")) {
					yamlValue = `"${value.replace(/"/g, '\\"')}"`;
				} else {
					yamlValue = value;
				}
			} else if (typeof value === "boolean") {
				yamlValue = value ? "true" : "false";
			} else if (typeof value === "number") {
				yamlValue = String(value);
			} else if (Array.isArray(value)) {
				// 数组转为 YAML 数组格式
				yamlValue = `\n  - ${value.join("\n  - ")}`;
			} else if (typeof value === "object" && value !== null) {
				// 对象不支持（简化实现）
				yamlValue = JSON.stringify(value);
			} else {
				yamlValue = String(value);
			}

			lines.push(`${key}: ${yamlValue}`);
		}

		return lines.join("\n");
	}

	/**
	 * 更新文件的 frontmatter
	 * @param file Obsidian 文件对象
	 * @param updates 要更新的字段
	 */
	async updateFrontmatter(file: TFile, updates: Partial<FrontmatterData>): Promise<void> {
		try {
			if (this.app.fileManager?.processFrontMatter) {
				await this.app.fileManager.processFrontMatter(file, (frontmatter: FrontmatterData) => {
					for (const [key, value] of Object.entries(updates)) {
						if (value === undefined || value === null) {
							delete frontmatter[key];
						} else {
							frontmatter[key] = value;
						}
					}
				});
				return;
			}

			const content = await this.app.vault.read(file);
			const newContent = this.updateFrontmatterInContent(content, updates);
			await this.app.vault.modify(file, newContent);
		} catch (error) {
			logger.error("[FrontmatterManager] 更新frontmatter失败:", error);
			throw error;
		}
	}

	/**
	 * 在内容字符串中更新 frontmatter
	 * @param content 原始内容
	 * @param updates 要更新的字段
	 * @returns 更新后的内容
	 */
	updateFrontmatterInContent(content: string, updates: Partial<FrontmatterData>): string {
		const existingData = this.parseFrontmatterFromContent(content);
		const mergedData = { ...existingData, ...updates };

		const yamlString = this.stringifyYAML(mergedData);
		const newFrontmatter = `---\n${yamlString}\n---`;

		// 替换或添加 frontmatter
		// 改进的正则：支持多种 frontmatter 格式
		if (content.match(/^---[\r\n]/)) {
			// 使用更精确的正则匹配 frontmatter 块
			// 匹配从开头的 --- 到第一个 --- 之间的所有内容（包括换行符）
			const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
			if (frontmatterRegex.test(content)) {
				return content.replace(frontmatterRegex, newFrontmatter);
			} else {
				// 如果正则匹配失败，尝试更宽松的匹配
				return content.replace(/^---[\r\n][\s\S]*?[\r\n]+---/, newFrontmatter);
			}
		} else {
			return `${newFrontmatter}\n\n${content}`;
		}
	}

	/**
	 * 获取文件的 UUID（从 frontmatter）
	 * @param file Obsidian 文件对象
	 * @returns UUID 字符串，如果不存在返回 null
	 */
	async getUUID(file: TFile): Promise<string | null> {
		const frontmatter = await this.parseFrontmatter(file);
		return frontmatter[WEAVE_UUID_FIELD] || null;
	}

	/**
	 * 设置文件的 UUID（写入 frontmatter）
	 * @param file Obsidian 文件对象
	 * @param uuid UUID 字符串
	 */
	async setUUID(file: TFile, uuid: string): Promise<void> {
		await this.updateFrontmatter(file, { [WEAVE_UUID_FIELD]: uuid });
		// 验证写入是否成功
		const verifyUUID = await this.getUUID(file);
		if (verifyUUID !== uuid) {
			logger.error(
				`[FrontmatterManager] UUID 写入验证失败，期望: ${uuid.substring(0, 8)}...，实际: ${
					verifyUUID ? `${verifyUUID.substring(0, 8)}...` : "null"
				}`
			);
		}
	}

	/**
	 * 批量更新多个字段
	 * @param file Obsidian 文件对象
	 * @param fields 字段映射
	 */
	async batchUpdate(file: TFile, fields: Record<string, unknown>): Promise<void> {
		await this.updateFrontmatter(file, fields);
	}

	/**
	 * 移除 frontmatter 中的某个字段
	 * @param file Obsidian 文件对象
	 * @param key 字段名
	 */
	async removeField(file: TFile, key: string): Promise<void> {
		try {
			if (this.app.fileManager?.processFrontMatter) {
				await this.app.fileManager.processFrontMatter(file, (frontmatter: FrontmatterData) => {
					delete frontmatter[key];
				});
				logger.debug(`[FrontmatterManager] 宸插垹闄ゅ瓧娈? ${key}`);
				return;
			}

			const content = await this.app.vault.read(file);
			const frontmatter = this.parseFrontmatterFromContent(content);

			// 检查字段是否存在
			if (!(key in frontmatter)) {
				logger.debug(`[FrontmatterManager] 字段 ${key} 不存在，跳过删除`);
				return;
			}

			// 删除字段
			delete frontmatter[key];

			// 直接使用删除后的 frontmatter 重新生成内容
			// 而不是调用 updateFrontmatterInContent（它会重新解析并合并）
			const yamlString = this.stringifyYAML(frontmatter);
			const newFrontmatter = `---\n${yamlString}\n---`;

			// 替换 frontmatter
			let newContent: string;
			if (content.match(/^---[\r\n]/)) {
				const frontmatterRegex = /^---[\r\n]+([\s\S]*?)[\r\n]+---/;
				if (frontmatterRegex.test(content)) {
					newContent = content.replace(frontmatterRegex, newFrontmatter);
				} else {
					newContent = content.replace(/^---[\r\n][\s\S]*?[\r\n]+---/, newFrontmatter);
				}
			} else {
				// 如果没有 frontmatter，不需要删除字段
				return;
			}

			await this.app.vault.modify(file, newContent);
			logger.debug(`[FrontmatterManager] 已删除字段: ${key}`);
		} catch (error) {
			logger.error("[FrontmatterManager] 移除字段失败:", error);
			throw error;
		}
	}

	/**
	 * 检查文件是否有 frontmatter
	 * @param file Obsidian 文件对象
	 * @returns 是否有 frontmatter
	 */
	async hasFrontmatter(file: TFile): Promise<boolean> {
		try {
			const content = await this.app.vault.read(file);
			return content.startsWith("---\n");
		} catch {
			return false;
		}
	}

	/**
	 * 从内容中提取正文（去除 frontmatter）
	 * @param content 完整内容
	 * @returns 正文内容
	 */
	extractBodyContent(content: string): string {
		if (!content.startsWith("---\n")) {
			return content;
		}

		const match = content.match(/^---\n[\s\S]*?\n---\n*/);
		if (match) {
			return content.substring(match[0].length);
		}

		return content;
	}

	/**
	 * 合并 frontmatter 和正文
	 * @param frontmatter frontmatter 数据
	 * @param body 正文内容
	 * @returns 完整内容
	 */
	combineContent(frontmatter: FrontmatterData, body: string): string {
		if (Object.keys(frontmatter).length === 0) {
			return body;
		}

		const yamlString = this.stringifyYAML(frontmatter);
		return `---\n${yamlString}\n---\n\n${body}`;
	}
}
