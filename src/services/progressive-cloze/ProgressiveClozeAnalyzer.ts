/**
 * 渐进式挖空分析器
 *
 * 负责检测和提取{{c::}}语法的挖空标记
 * 与Anki的挖空格式完全兼容
 *
 * @module services/progressive-cloze/ProgressiveClozeAnalyzer
 */

import type {
	ClozeAnalysisResult,
	ClozeData,
	ClozeValidationResult,
} from "../../types/progressive-cloze-types";
import { getConfiguredClozeMatches, hasConfiguredClozeSyntax } from "../../utils/cloze-syntax";

export class ProgressiveClozeAnalyzer {
	/**
	 * 分析内容，检测挖空类型
	 *
	 * @param content 待分析的内容
	 * @returns 分析结果
	 */
	analyze(content: string): ClozeAnalysisResult {
		// 检测{{c1::}}模式
		const clozeMatches = content.matchAll(/\{\{c(\d+)::([^}:]+)(?:::([^}]+))?\}\}/g);
		const clozes = Array.from(clozeMatches);

		const highlights = getConfiguredClozeMatches(content);

		// 提取挖空数据
		const clozeData = this.extractProgressiveClozes(content);

		return {
			hasProgressiveCloze: clozes.length > 0,
			hasHighlight: highlights.length > 0,
			clozeCount: clozes.length,
			highlightCount: highlights.length,
			shouldSplit: clozes.length > 1, // 只有2个及以上才拆分
			clozes: clozeData,
		};
	}

	/**
	 * 提取渐进式挖空信息
	 *
	 * 支持三种格式：
	 * - {{c1::text}}         基础格式
	 * - {{c1::text::hint}}   带提示格式
	 * - {{c1::}}text{{::}}   Anki旧版格式（兼容）
	 *
	 * @param content 待解析的内容
	 * @returns 挖空数据列表
	 */
	extractProgressiveClozes(content: string): ClozeData[] {
		const clozes: ClozeData[] = [];

		// 正则：匹配{{c数字::文本::提示}}
		const regex = /\{\{c(\d+)::([^}:]+)(?:::([^}]+))?\}\}/g;
		let match;

		while ((match = regex.exec(content)) !== null) {
			const ord = parseInt(match[1]) - 1; // c1 → ord: 0
			const text = match[2].trim();
			const hint = match[3]?.trim();

			clozes.push({
				ord,
				text,
				hint,
				startPos: match.index,
				endPos: match.index + match[0].length,
				uuid: this.generateClozeUUID(ord, text),
				syntax: "anki",
			});
		}

		// 按ord排序（支持c3, c1, c2这种乱序）
		return clozes.sort((a, b) => a.ord - b.ord);
	}

	/**
	 * 生成稳定的UUID
	 *
	 * 基于ord和文本内容生成，确保相同的挖空在编辑后仍有相同的UUID
	 *
	 * @param ord 挖空序号（0-based）
	 * @param text 挖空文本
	 * @returns UUID字符串
	 */
	private generateClozeUUID(ord: number, text: string): string {
		const hash = this.simpleHash(`${ord}-${text}`);
		return `cloze-${ord}-${hash}`;
	}

	/**
	 * 简单哈希函数
	 *
	 * 用于生成UUID的哈希值，不需要加密级别的安全性
	 *
	 * @param str 待哈希的字符串
	 * @returns 36进制哈希字符串
	 */
	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // 转换为32位整数
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * 验证挖空编号连续性
	 *
	 * 检查规则：
	 * 1. 编号应该从1开始连续递增（c1, c2, c3...）
	 * 2. 不应该有重复的编号
	 * 3. 不应该有跳过的编号（如c1, c3缺少c2）
	 *
	 * @param clozes 挖空数据列表
	 * @returns 验证结果
	 */
	validateClozeNumbers(clozes: ClozeData[]): ClozeValidationResult {
		const numbers = clozes.map((c) => c.ord);
		const uniqueNumbers = [...new Set(numbers)];

		// 检查重复
		const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
		const uniqueDuplicates = [...new Set(duplicates)];

		// 检查缺失
		const maxNumber = Math.max(...uniqueNumbers);
		const missing: number[] = [];
		for (let i = 0; i <= maxNumber; i++) {
			if (!uniqueNumbers.includes(i)) {
				missing.push(i + 1); // 转换为c编号（1-based）
			}
		}

		return {
			valid: duplicates.length === 0 && missing.length === 0,
			missingNumbers: missing,
			duplicateNumbers: uniqueDuplicates.map((_d) => _d + 1), // 转换为c编号
		};
	}

	/**
	 * 获取当前内容中最大的挖空编号
	 *
	 * 用于自动递增挖空编号（编辑器功能）
	 *
	 * @param content 内容字符串
	 * @returns 最大编号（如果没有挖空则返回0）
	 */
	getMaxClozeNumber(content: string): number {
		const matches = content.matchAll(/\{\{c(\d+)::/g);
		const numbers = Array.from(matches).map((m) => parseInt(m[1]));
		return numbers.length > 0 ? Math.max(...numbers) : 0;
	}

	/**
	 * 检测内容中是否包含渐进式挖空
	 *
	 * 快速检测方法，不提取详细信息
	 *
	 * @param content 内容字符串
	 * @returns 是否包含{{c::}}语法
	 */
	hasProgressiveCloze(content: string): boolean {
		return /\{\{c\d+::.+?\}\}/.test(content);
	}

	/**
	 * 检测内容中是否包含Obsidian高亮
	 *
	 * @param content 内容字符串
	 * @returns 是否包含==文本==语法
	 */
	hasObsidianHighlight(content: string): boolean {
		return hasConfiguredClozeSyntax(content);
	}
}
