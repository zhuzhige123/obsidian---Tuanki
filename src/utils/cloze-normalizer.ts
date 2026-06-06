/**
 * 挖空序号规范化工具
 *
 * 用于检测、验证和修复 Anki 挖空序号
 * 确保序号从 c1 开始连续递增
 *
 * @module utils/cloze-normalizer
 */

/**
 * 挖空序号规范化结果
 */
export interface ClozeNormalizationResult {
	/** 规范化后的内容 */
	normalized: string;
	/** 是否发生了变更 */
	changed: boolean;
	/** 检测到的问题列表 */
	issues: string[];
	/** 原始挖空数量 */
	originalCount: number;
	/** 规范化后的挖空数量 */
	normalizedCount: number;
}

/**
 * 挖空状态检测结果
 */
export interface ClozeStatusResult {
	/** 是否有效（序号连续） */
	valid: boolean;
	/** 挖空数量 */
	count: number;
	/** 是否有无序号的挖空 */
	hasUnnumbered: boolean;
	/** 缺失的序号列表 */
	missingNumbers: number[];
	/** 重复的序号列表 */
	duplicateNumbers: number[];
	/** 问题描述 */
	issue?: string;
}

/**
 * 规范化挖空序号
 *
 * 处理以下情况：
 * 1. 无序号挖空 {{c::text}} → {{c1::text}}
 * 2. 序号不连续 {{c1::}} {{c3::}} → {{c1::}} {{c2::}}
 * 3. 重复序号 {{c1::}} {{c1::}} → {{c1::}} {{c2::}}
 *
 * @param content 待规范化的内容
 * @returns 规范化结果
 */
export function normalizeClozeNumbers(content: string): ClozeNormalizationResult {
	const issues: string[] = [];
	let counter = 1;
	let originalCount = 0;

	// 先统计原始挖空数量
	const originalMatches = content.matchAll(/\{\{c(\d*)::/g);
	originalCount = Array.from(originalMatches).length;

	// 规范化处理
	const normalized = content.replace(/\{\{c(\d*)::/g, (match, num: string) => {
		if (!num || num === "") {
			// 无序号的挖空
			issues.push(`第${counter}个挖空无序号，已自动分配为 c${counter}`);
			return `{{c${counter++}::`;
		}

		const currentNum = parseInt(num);
		if (currentNum !== counter) {
			// 序号不连续或重复
			issues.push(`序号 c${currentNum} 已调整为 c${counter}`);
			return `{{c${counter++}::`;
		}

		counter++;
		return match;
	});

	const normalizedCount = counter - 1;

	return {
		normalized,
		changed: normalized !== content,
		issues,
		originalCount,
		normalizedCount,
	};
}

/**
 * 检测挖空状态
 *
 * 不修改内容，仅检测并返回状态信息
 *
 * @param content 待检测的内容
 * @returns 挖空状态
 */
export function detectClozeStatus(content: string): ClozeStatusResult {
	const matches = content.matchAll(/\{\{c(\d*)::/g);
	const allMatches = Array.from(matches);

	const count = allMatches.length;

	if (count === 0) {
		return {
			valid: false,
			count: 0,
			hasUnnumbered: false,
			missingNumbers: [],
			duplicateNumbers: [],
			issue: "未检测到挖空标记",
		};
	}

	// 检测无序号挖空
	const hasUnnumbered = allMatches.some((m) => !m[1] || m[1] === "");

	if (hasUnnumbered) {
		return {
			valid: false,
			count,
			hasUnnumbered: true,
			missingNumbers: [],
			duplicateNumbers: [],
			issue: "存在无序号的挖空 {{c::}}",
		};
	}

	// 提取所有序号
	const numbers = allMatches.map((m) => parseInt(m[1]));
	const uniqueNumbers = [...new Set(numbers)];

	// 检测重复
	const duplicates: number[] = [];
	numbers.forEach((num, i) => {
		if (numbers.indexOf(num) !== i && !duplicates.includes(num)) {
			duplicates.push(num);
		}
	});

	if (duplicates.length > 0) {
		return {
			valid: false,
			count,
			hasUnnumbered: false,
			missingNumbers: [],
			duplicateNumbers: duplicates,
			issue: `存在重复序号: ${duplicates.map((_n) => `c${_n}`).join(", ")}`,
		};
	}

	// 检测连续性
	const maxNumber = Math.max(...uniqueNumbers);
	const missing: number[] = [];

	for (let i = 1; i <= maxNumber; i++) {
		if (!uniqueNumbers.includes(i)) {
			missing.push(i);
		}
	}

	if (missing.length > 0) {
		return {
			valid: false,
			count,
			hasUnnumbered: false,
			missingNumbers: missing,
			duplicateNumbers: [],
			issue: `序号不连续，缺少: ${missing.map((_n) => `c${_n}`).join(", ")}`,
		};
	}

	// 序号有效且连续
	return {
		valid: true,
		count,
		hasUnnumbered: false,
		missingNumbers: [],
		duplicateNumbers: [],
	};
}

/**
 * 快速检查是否可以拆分
 *
 * @param content 内容
 * @returns 是否可以拆分（2个及以上有序挖空）
 */
export function canSplitCloze(content: string): boolean {
	const status = detectClozeStatus(content);
	return status.valid && status.count >= 2;
}

/**
 * 获取挖空数量
 *
 * @param content 内容
 * @returns 挖空数量
 */
export function getClozeCount(content: string): number {
	const matches = content.matchAll(/\{\{c\d*::/g);
	return Array.from(matches).length;
}
