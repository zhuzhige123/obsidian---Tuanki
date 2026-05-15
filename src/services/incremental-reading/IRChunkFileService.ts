/**
 * 增量阅读旧 chunk 文件兼容服务
 *
 * 仅保留旧 `ir-chunk` Markdown 的 YAML 读写能力，
 * 供旧调度兼容链路读取和回写用户可编辑字段。
 * 已弃用的 raw/index/chunk 新增写入、入口索引卡、总索引和分类卡维护都已移除。
 *
 * @module services/incremental-reading/IRChunkFileService
 */

import { App, TFile, normalizePath } from "obsidian";
import type { IRChunkFileYAML } from "../../types/ir-types";
import { logger } from "../../utils/logger";

function yamlStringify(obj: Record<string, unknown>): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) {
				lines.push(`${key}: []`);
			} else {
				lines.push(`${key}:`);
				for (const item of value) {
					lines.push(`  - ${item}`);
				}
			}
			continue;
		}

		if (typeof value === "string") {
			if (value.includes(":") || value.includes("#") || value.includes("\n")) {
				lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
			} else {
				lines.push(`${key}: ${value}`);
			}
			continue;
		}

		lines.push(`${key}: ${value}`);
	}
	return lines.join("\n");
}

export class IRChunkFileService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private parseYAMLValue(value: string): unknown {
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1);
		}

		if (/^-?\d+(\.\d+)?$/.test(value)) {
			return Number(value);
		}

		if (value === "true") return true;
		if (value === "false") return false;

		return value;
	}

	private getChunkFile(filePath: string): TFile | null {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			return null;
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		return file instanceof TFile ? file : null;
	}

	/**
	 * 读取旧 chunk Markdown 的 YAML frontmatter。
	 * 非 `ir-chunk` 文件一律返回 null，避免把普通笔记误识别成旧 chunk。
	 */
	async readChunkFileYAML(filePath: string): Promise<IRChunkFileYAML | null> {
		try {
			const file = this.getChunkFile(filePath);
			if (!file) return null;

			const content = await this.app.vault.read(file);
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) return null;

			const lines = yamlMatch[1].split("\n");
			const result: Record<string, unknown> = {};
			let currentKey: string | null = null;
			let currentArray: string[] | null = null;

			for (const rawLine of lines) {
				const line = rawLine.trimEnd();
				if (!line.trim()) continue;

				if (line.startsWith("  - ")) {
					if (currentKey && currentArray !== null) {
						currentArray.push(line.substring(4).trim());
					}
					continue;
				}

				if (currentKey && currentArray !== null) {
					result[currentKey] = currentArray;
					currentArray = null;
				}

				const colonIndex = line.indexOf(":");
				if (colonIndex <= 0) {
					currentKey = null;
					continue;
				}

				const key = line.substring(0, colonIndex).trim();
				const value = line.substring(colonIndex + 1).trim();

				if (value === "" || value === "[]") {
					currentKey = key;
					currentArray = [];
					continue;
				}

				result[key] = this.parseYAMLValue(value);
				currentKey = null;
			}

			if (currentKey && currentArray !== null) {
				result[currentKey] = currentArray;
			}

			if (result.weave_type !== "ir-chunk") {
				return null;
			}

			return result as unknown as IRChunkFileYAML;
		} catch (error) {
			logger.error(`[IRChunkFileService] 读取块文件 YAML 失败: ${filePath}`, error);
			return null;
		}
	}

	/**
	 * 更新旧 chunk Markdown 的 YAML frontmatter。
	 */
	async updateChunkFileYAML(filePath: string, updates: Partial<IRChunkFileYAML>): Promise<boolean> {
		try {
			const file = this.getChunkFile(filePath);
			if (!file) return false;

			const content = await this.app.vault.read(file);
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) return false;

			const existingYAML = await this.readChunkFileYAML(filePath);
			if (!existingYAML) return false;

			const updatedYAML = { ...existingYAML, ...updates };
			const restContent = content.substring(yamlMatch[0].length);
			const nextContent = `---\n${yamlStringify(updatedYAML as Record<string, unknown>)}\n---${restContent}`;

			await this.app.vault.modify(file, nextContent);
			return true;
		} catch (error) {
			logger.error(`[IRChunkFileService] 更新块文件 YAML 失败: ${filePath}`, error);
			return false;
		}
	}
}
