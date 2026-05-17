/**
 * YAML 属性读写工具模块
 *
 * 用于在卡片 content 字段中读取和更新 YAML frontmatter 属性
 *
 * @module utils/yaml-utils
 * @version 1.0.0
 * @see YAML属性栏卡片元数据方案.md
 */

import { EpubLinkService } from "../services/epub-integration/EpubLinkService";
import { logger } from "./logger";
import { getNormalizedDeckEntries, getSingleMemoryFormalDeckIds } from "./memory-deck-membership";
import { TagExtractor } from "./tag-extractor";

// ===== 类型定义 =====

/**
 * 卡片类型枚举
 */
export type CardYAMLType =
	| "basic"
	| "cloze"
	| "choice"
	| "code"
	| "progressive-parent"
	| "progressive-child";

/**
 * 题目难度枚举
 */
export type CardYAMLDifficulty = "easy" | "medium" | "hard";

/**
 * 卡片 YAML 元数据接口
 * 对应需求文档中定义的 we_ 前缀属性
 *
 * 架构说明：
 * - we_source: 合并来源文档+块链接，格式 ![[文档名#^blockId]] 或 [[文档名]]
 * - we_block: (兼容) 旧版块链接字段，迁移后可废弃
 * - we_refs: (新增) 关联文档列表
 */
export interface CardYAMLMetadata {
	/**
	 * 生成来源（唯一）
	 * 格式: ![[文档名#^blockId]] 或 [[文档名]] 或数组格式
	 * 包含文档路径和可选的块ID
	 */
	we_source?: string | string[];
	/**
	 * 块级嵌入链接 (兼容旧版)
	 * Compatibility note: 推荐使用 we_source 的合并格式
	 */
	we_block?: string;
	/**
	 * 关联文档列表 (新增)
	 * 格式: [[文档1]], [[文档2]]
	 */
	we_refs?: string[];
	/** 所属牌组名称列表 */
	we_decks?: string[];
	/** 优先级 (1-4) */
	we_priority?: number;
	/** 卡片类型 */
	we_type?: CardYAMLType;
	/** 题目难度 */
	we_difficulty?: CardYAMLDifficulty;
	/** 创建日期（Obsidian 通用字段） */
	created?: string;
	/** @deprecated 兼容旧数据，写回时会自动迁移到 created */
	we_created?: string;
	/** 标签（Obsidian 原生） */
	tags?: string[];
}

export function parseEpubSourceInfo(content: string): {
	sourceFile?: string;
	cfi?: string;
	text?: string;
	chapter?: number;
} {
	if (!content) return {};

	try {
		const yaml = parseYAMLFromContent(content);
		if (!yaml?.we_source) {
			return {};
		}

		const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];
		for (const sourceValue of sourceValues) {
			if (typeof sourceValue !== "string" || !sourceValue.trim()) {
				continue;
			}

			const parsed = EpubLinkService.parseLinkMarkup(sourceValue);
			if (!parsed?.filePath?.toLowerCase().endsWith(".epub")) {
				continue;
			}

			return {
				sourceFile: parsed.filePath,
				cfi: parsed.cfi,
				text: parsed.text,
				chapter: parsed.chapter,
			};
		}

		return {};
	} catch (e) {
		logger.warn("[yaml-utils] Failed to parse EPUB source info:", e);
		return {};
	}
}

/**
 * YAML frontmatter 原始数据
 */
export interface YAMLFrontmatter {
	[key: string]: any;
}

// ===== 核心解析函数 =====

/**
 * 从内容中解析 YAML frontmatter
 * @param content 卡片内容字符串
 * @returns 解析后的 YAML 数据对象
 */
export function parseYAMLFromContent(content: string): YAMLFrontmatter {
	if (!content || typeof content !== "string") {
		return {};
	}

	// 匹配 frontmatter 块：--- 开头，--- 结尾
	// 使用更宽松的正则，支持空 frontmatter（如 ---\n\n---）
	const match = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]*---/);
	if (!match) {
		return {};
	}

	const yamlContent = match[1];
	return parseYAMLString(yamlContent);
}

/**
 * 解析 YAML 字符串为对象
 * 支持：基本键值对、数组、带引号的字符串
 * @param yaml YAML 字符串
 * @returns 解析后的对象
 */
function parseYAMLString(yaml: string): YAMLFrontmatter {
	const result: YAMLFrontmatter = {};
	const lines = yaml.split(/\r?\n/);

	let currentKey: string | null = null;
	let currentArray: string[] | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// 跳过空行和注释
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		// 检测数组项（以 - 开头，前面有缩进）
		if (line.match(/^\s+-\s/) && currentKey && currentArray) {
			const arrayItemMatch = trimmed.match(/^-\s+(.*)$/);
			if (arrayItemMatch) {
				let value = arrayItemMatch[1].trim();
				value = unquoteString(value);
				currentArray.push(value);
			}
			continue;
		}

		// 检测键值对
		const colonIndex = trimmed.indexOf(":");
		if (colonIndex === -1) {
			continue;
		}

		const key = trimmed.substring(0, colonIndex).trim();
		const value = trimmed.substring(colonIndex + 1).trim();

		// 如果值为空，检查下一行是否是数组
		if (!value) {
			// 可能是数组开始
			currentKey = key;
			currentArray = [];
			result[key] = currentArray;
			continue;
		}

		// 重置数组状态
		currentKey = null;
		currentArray = null;

		// 解析值
		result[key] = parseYAMLValue(value);
	}

	return result;
}

/**
 * 解析 YAML 值
 * @param value 原始值字符串
 * @returns 解析后的值
 */
function parseYAMLValue(value: string): any {
	const normalizedValue = unquoteString(value);

	// 处理带引号的字符串
	if (
		(normalizedValue.startsWith("[[") && normalizedValue.endsWith("]]")) ||
		(normalizedValue.startsWith("![[") && normalizedValue.endsWith("]]"))
	) {
		return normalizedValue;
	}

	// 处理内联数组 [a, b, c]
	if (
		normalizedValue.startsWith("[") &&
		normalizedValue.endsWith("]") &&
		!normalizedValue.startsWith("[[") &&
		!normalizedValue.startsWith("![[")
	) {
		const inner = normalizedValue.slice(1, -1);
		if (!inner.trim()) return [];
		return inner.split(",").map((_item) => {
			const trimmed = _item.trim();
			return unquoteString(trimmed);
		});
	}

	// 布尔值
	if (normalizedValue === "true") return true;
	if (normalizedValue === "false") return false;

	// 数字（排除 UUID 类似的字符串）
	const looksLikeUUID = normalizedValue.includes("-") || normalizedValue.length > 15;
	if (!looksLikeUUID && !Number.isNaN(Number(normalizedValue)) && normalizedValue !== "") {
		return Number(normalizedValue);
	}

	return normalizedValue;
}

/**
 * 移除字符串的引号
 * @param value 可能带引号的字符串
 * @returns 去除引号后的字符串
 */
function unquoteString(value: string): string {
	let result = value;

	if (
		(result.startsWith('"') && result.endsWith('"')) ||
		(result.startsWith("'") && result.endsWith("'"))
	) {
		result = result.substring(1, result.length - 1);
		// 处理转义字符
		result = result.replace(/\\"/g, '"').replace(/\\'/g, "'");
	}
	return result;
}

// ===== 属性读取函数 =====

/**
 * 读取卡片内容中的单个属性
 * @param content 卡片内容
 * @param key 属性名
 * @returns 属性值，不存在则返回 undefined
 */
export function getCardProperty<T = any>(content: string, key: string): T | undefined {
	const yaml = parseYAMLFromContent(content);
	return yaml[key] as T | undefined;
}

/**
 * 批量读取卡片的所有 we_ 属性
 * @param content 卡片内容
 * @returns CardYAMLMetadata 对象
 */
export function getCardMetadata(content: string): CardYAMLMetadata {
	const yaml = parseYAMLFromContent(content);
	const created =
		typeof yaml.created === "string"
			? yaml.created
			: typeof yaml.we_created === "string"
				? yaml.we_created
				: undefined;

	return {
		we_source: yaml.we_source,
		we_block: yaml.we_block,
		we_refs: normalizeToArray(yaml.we_refs),
		we_decks: normalizeToArray(yaml.we_decks),
		we_priority: typeof yaml.we_priority === "number" ? yaml.we_priority : undefined,
		we_type: yaml.we_type,
		we_difficulty: yaml.we_difficulty,
		created,
		tags: normalizeToArray(yaml.tags),
	};
}

function normalizeLegacyCreatedField(yaml: YAMLFrontmatter): YAMLFrontmatter {
	if (!yaml || typeof yaml !== "object") {
		return {};
	}

	const normalized = { ...yaml };
	const canonicalCreated =
		typeof normalized.created === "string" && normalized.created.trim()
			? normalized.created
			: typeof normalized.we_created === "string" && normalized.we_created.trim()
				? normalized.we_created
				: undefined;

	if (canonicalCreated) {
		normalized.created = canonicalCreated;
	}
	delete normalized.we_created;

	return normalized;
}

/**
 * 将值规范化为数组
 * @param value 可能是数组或单个值
 * @returns 数组
 */
function normalizeToArray(value: any): string[] | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (Array.isArray(value)) {
		return value.map((v) => String(v));
	}
	return [String(value)];
}

// ===== 属性写入函数 =====

/**
 * 写入/更新卡片内容中的单个属性
 * @param content 原始卡片内容
 * @param key 属性名
 * @param value 属性值（undefined 表示删除该属性）
 * @returns 更新后的内容
 */
export function setCardProperty(content: string, key: string, value: any): string {
	const yaml = parseYAMLFromContent(content);

	if (value === undefined) {
		delete yaml[key];
	} else {
		yaml[key] = value;
	}

	return rebuildContent(content, yaml);
}

/**
 * 批量更新卡片的多个属性
 * @param content 原始卡片内容
 * @param updates 要更新的属性映射
 * @returns 更新后的内容
 */
export function setCardProperties(content: string, updates: Partial<CardYAMLMetadata>): string {
	const yaml = parseYAMLFromContent(content);

	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) {
			delete yaml[key];
		} else {
			yaml[key] = value;
		}
	}

	return rebuildContent(content, yaml);
}

/**
 * 重建内容：替换或添加 YAML frontmatter
 * @param content 原始内容
 * @param yaml 新的 YAML 数据
 * @returns 重建后的内容
 */
function rebuildContent(content: string, yaml: YAMLFrontmatter): string {
	const body = extractBodyContent(content);

	// 如果没有任何属性，返回纯正文
	if (Object.keys(yaml).length === 0) {
		return body;
	}

	const yamlString = stringifyYAML(yaml);
	return `---\n${yamlString}\n---\n${body}`;
}

/**
 * 从内容中提取正文（去除 YAML frontmatter）
 * @param content 完整内容
 * @returns 正文内容
 */
export function extractBodyContent(content: string): string {
	if (!content || typeof content !== "string") {
		return "";
	}

	// 匹配 frontmatter 块并移除
	// 使用更宽松的正则，支持空 frontmatter（如 ---\n\n---）
	const match = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]*---[\r\n]*/);
	if (match) {
		return content.substring(match[0].length);
	}

	return content;
}

/**
 * 将 YAML 对象转换为字符串
 * @param yaml YAML 数据对象
 * @returns YAML 字符串
 */
function stringifyYAML(yaml: YAMLFrontmatter): string {
	const lines: string[] = [];
	const normalizedYaml = normalizeLegacyCreatedField(yaml);

	// 定义属性的输出顺序（we_ 属性优先）
	const orderedKeys = [
		"we_source",
		"we_block",
		"we_decks",
		"we_priority",
		"we_type",
		"we_difficulty",
		"created",
		"tags",
	];

	const processedKeys = new Set<string>();

	// 先输出有序的属性
	for (const key of orderedKeys) {
		if (key in normalizedYaml && normalizedYaml[key] !== undefined) {
			lines.push(formatYAMLLine(key, normalizedYaml[key]));
			processedKeys.add(key);
		}
	}

	// 再输出其他属性
	for (const [key, value] of Object.entries(normalizedYaml)) {
		if (!processedKeys.has(key) && value !== undefined) {
			lines.push(formatYAMLLine(key, value));
		}
	}

	return lines.join("\n");
}

/**
 * 格式化单个 YAML 键值对
 * @param key 键名
 * @param value 值
 * @returns 格式化的 YAML 行
 */
function formatYAMLLine(key: string, value: any): string {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return `${key}: []`;
		}
		// 多行数组格式
		const items = value.map((item) => `  - ${quoteIfNeeded(String(item))}`).join("\n");
		return `${key}:\n${items}`;
	}

	if (typeof value === "string") {
		return `${key}: ${quoteIfNeeded(value)}`;
	}

	if (typeof value === "boolean") {
		return `${key}: ${value ? "true" : "false"}`;
	}

	if (typeof value === "number") {
		return `${key}: ${value}`;
	}

	// 对象或其他类型
	return `${key}: ${JSON.stringify(value)}`;
}

/**
 * 如果需要则添加引号
 * @param value 字符串值
 * @returns 可能带引号的字符串
 */
function quoteIfNeeded(value: string): string {
	const isObsidianWikiLink =
		(value.startsWith("[[") && value.endsWith("]]")) ||
		(value.startsWith("![[") && value.endsWith("]]"));

	// YAML 中的 wikilink / embed link 容易被高亮器误判为非法裸值，
	// 统一输出为带引号字符串，读取时会由 unquoteString 去掉外层引号，
	// 不影响后续 parseSourceInfo / parseObsidianLink 的跳转解析。
	if (isObsidianWikiLink) {
		return `"${value.replace(/"/g, '\\"')}"`;
	}

	// 需要引号的情况：包含特殊字符
	if (
		value.includes(":") ||
		value.includes("#") ||
		value.includes("\n") ||
		value.includes('"') ||
		value.includes("'") ||
		value.startsWith(" ") ||
		value.endsWith(" ") ||
		value === ""
	) {
		return `"${value.replace(/"/g, '\\"')}"`;
	}
	return value;
}

// ===== 标签提取函数 =====

/**
 * 从卡片内容中提取所有标签
 * 包括：YAML frontmatter 中的 tags 数组 + 正文中的 #标签 语法
 * @param content 卡片内容
 * @returns 去重后的标签数组
 */
export function extractAllTags(content: string): string[] {
	const tags = new Set<string>();

	// 1. 从 YAML frontmatter 提取
	const yaml = parseYAMLFromContent(content);
	if (yaml.tags) {
		const yamlTags = normalizeToArray(yaml.tags) || [];
		for (const tag of yamlTags) {
			tags.add(tag);
		}
	}

	// 2. 从正文提取 #标签（忽略 frontmatter、代码、链接目标与 HTML 属性）
	for (const tag of TagExtractor.extractTagsExcludingCode(content)) {
		tags.add(tag);
	}

	return Array.from(tags);
}

// ===== 辅助函数 =====

/**
 * 检查内容是否有 YAML frontmatter
 * @param content 卡片内容
 * @returns 是否有 frontmatter
 */
export function hasYAMLFrontmatter(content: string): boolean {
	if (!content || typeof content !== "string") {
		return false;
	}
	return /^---[\r\n]/.test(content);
}

/**
 * 创建带有 YAML frontmatter 的新内容
 * @param metadata 元数据
 * @param body 正文内容
 * @returns 完整内容
 */
export function createContentWithMetadata(metadata: CardYAMLMetadata, body: string): string {
	const yaml: YAMLFrontmatter = {};

	if (metadata.we_source) yaml.we_source = metadata.we_source;
	if (metadata.we_block) yaml.we_block = metadata.we_block;
	if (metadata.we_decks && metadata.we_decks.length > 0) yaml.we_decks = metadata.we_decks;
	if (metadata.we_priority !== undefined) yaml.we_priority = metadata.we_priority;
	if (metadata.we_type) yaml.we_type = metadata.we_type;
	if (metadata.we_difficulty) yaml.we_difficulty = metadata.we_difficulty;
	if (metadata.created || metadata.we_created) {
		yaml.created = metadata.created || metadata.we_created;
	}
	if (metadata.tags && metadata.tags.length > 0) yaml.tags = metadata.tags;

	if (Object.keys(yaml).length === 0) {
		return body;
	}

	const yamlString = stringifyYAML(yaml);
	return `---\n${yamlString}\n---\n${body}`;
}

/**
 * 从任意YAML数据和正文构建完整内容
 * 比 createContentWithMetadata 更灵活，支持任意键值对
 * @param yamlData 任意YAML键值对
 * @param body 正文内容
 * @returns 完整内容（含YAML frontmatter）
 */
export function buildContentWithYAML(yamlData: Record<string, any>, body: string): string {
	const filtered: YAMLFrontmatter = {};
	for (const [key, value] of Object.entries(yamlData)) {
		if (value !== undefined && value !== null && value !== "") {
			// 空数组也跳过
			if (Array.isArray(value) && value.length === 0) continue;
			filtered[key] = value;
		}
	}

	if (Object.keys(filtered).length === 0) {
		return body;
	}

	const yamlString = stringifyYAML(filtered);
	return `---\n${yamlString}\n---\n${body}`;
}

/**
 * 验证牌组名称列表
 * @param deckNames 牌组名称数组
 * @param validDeckNames 有效的牌组名称集合
 * @returns 验证结果
 */
export function validateDeckNames(
	deckNames: string[],
	validDeckNames: Set<string>
): { valid: boolean; invalidNames: string[] } {
	const invalidNames: string[] = [];

	for (const name of deckNames) {
		if (!validDeckNames.has(name)) {
			invalidNames.push(name);
		}
	}

	return {
		valid: invalidNames.length === 0,
		invalidNames,
	};
}

// ===== 导出日志函数供调试 =====

/**
 * 调试：打印解析结果
 * @param content 卡片内容
 */
export function debugParseYAML(content: string): void {
	const yaml = parseYAMLFromContent(content);
	const metadata = getCardMetadata(content);
	const tags = extractAllTags(content);

	logger.debug("[yaml-utils] 解析结果:", {
		raw: yaml,
		metadata,
		allTags: tags,
	});
}

// ===== Obsidian 链接解析工具 =====

/**
 * 来源信息接口
 * 支持来源文档和关联文档分离
 */
export interface SourceInfo {
	/** 来源文档路径（唯一，卡片生成的原始位置） */
	sourceFile?: string;
	/** 来源块ID */
	sourceBlock?: string;
	/** 关联文档列表（可多个，相关参考资料） */
	refs?: string[];
}

/**
 * 从卡片 content 解析来源信息
 *
 * 优先从 we_source 合并格式解析
 * 支持格式：
 * - we_source: ![[文档名#^blockId]] (推荐，合并格式)
 * - we_source: [[文档名]] + we_block: ^blockId (兼容旧版)
 * - we_source: 数组格式
 *
 * @param content 卡片内容
 * @returns SourceInfo 对象
 */
export function parseSourceInfo(content: string): SourceInfo {
	if (!content) return {};

	try {
		const yaml = parseYAMLFromContent(content);
		if (!yaml || Object.keys(yaml).length === 0) {
			return {};
		}

		let sourceFile: string | undefined;
		let sourceBlock: string | undefined;

		// 1. 优先从 we_source 解析（支持合并格式 ![[文档#^blockId]]）
		if (yaml.we_source) {
			const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];
			for (const sourceValue of sourceValues) {
				if (typeof sourceValue !== "string" || !sourceValue.trim()) {
					continue;
				}
				const parsedSourceFile = parseObsidianLink(sourceValue);
				const parsedSourceBlock = parseBlockId(sourceValue);
				if (!parsedSourceFile && !parsedSourceBlock) {
					continue;
				}
				sourceFile = parsedSourceFile;
				sourceBlock = parsedSourceBlock;
				break;
			}
		}

		// 2. 兼容旧版：从 we_block 补充块ID（如果 we_source 中没有）
		if (!sourceBlock && yaml.we_block) {
			const blockValue = Array.isArray(yaml.we_block) ? yaml.we_block[0] : yaml.we_block;
			if (blockValue) {
				sourceBlock = parseBlockId(blockValue);

				// 如果 sourceFile 未设置，从 we_block 提取文档名
				if (!sourceFile) {
					sourceFile = parseObsidianLink(blockValue);
				}
			}
		}

		// 3. 解析关联文档列表
		let refs: string[] | undefined;
		if (yaml.we_refs) {
			const refsArray = Array.isArray(yaml.we_refs) ? yaml.we_refs : [yaml.we_refs];
			refs = refsArray
				.map((ref: string) => parseObsidianLink(ref))
				.filter((ref: string | undefined): ref is string => !!ref);
			if (refs.length === 0) refs = undefined;
		}

		return { sourceFile, sourceBlock, refs };
	} catch (e) {
		logger.warn("[yaml-utils] 解析来源信息失败:", e);
		return {};
	}
}

/**
 * 解析 Obsidian wikilink 格式，提取文档路径
 * 支持格式：
 * - [[文档名]]
 * - [[文档名|别名]]
 * - ![[文档名]]
 * - [[文档名#^blockId]]
 * - ![[文档名#^blockId]]
 * - ![[文档名^blockId]] (旧版格式，无 #)
 *
 * @param link Obsidian 链接字符串
 * @returns 文档路径（带 .md 后缀），或 undefined
 */
export function parseObsidianLink(link: string): string | undefined {
	if (!link || typeof link !== "string") return undefined;

	let normalized = link.trim();
	normalized = normalized.replace(/^['"]+|['"]+$/g, "");
	normalized = normalized.replace(/\\/g, "/");

	// 正则表达式添加对 ^ 字符的排除
	// 匹配 [[文档名]] 或 [[文档名|别名]] 或 [[文档名#...]] 或 [[文档名^...]]
	// 支持开头的 ! (嵌入格式)
	const start = normalized.indexOf("[[");
	const end = normalized.lastIndexOf("]]");
	if (start !== -1 && end !== -1 && end > start + 2) {
		let inner = normalized.slice(start + 2, end).trim();
		const aliasIndex = inner.indexOf("|");
		if (aliasIndex !== -1) {
			inner = inner.slice(0, aliasIndex).trim();
		}

		const hashIndex = inner.indexOf("#");
		const caretIndex = inner.indexOf("^");
		let cutIndex = -1;
		if (hashIndex !== -1 && caretIndex !== -1) cutIndex = Math.min(hashIndex, caretIndex);
		else if (hashIndex !== -1) cutIndex = hashIndex;
		else if (caretIndex !== -1) cutIndex = caretIndex;
		if (cutIndex !== -1) {
			inner = inner.slice(0, cutIndex).trim();
		}

		let docName = inner;

		if (docName.startsWith("(") && /\)\]\]\s*$/.test(normalized)) {
			docName = docName.slice(1).trim();
		}
		if (docName.startsWith("（") && /）\]\]\s*$/.test(normalized)) {
			docName = docName.slice(1).trim();
		}

		docName = docName.replace(/^\.\/+/, "");

		try {
			docName = decodeURIComponent(docName);
		} catch {}

		const hasKnownNonMarkdownExtension =
			/\.(canvas|excalidraw(?:\.md)?|pdf|epub|png|jpe?g|gif|webp|svg|bmp|tiff|mp3|wav|ogg|flac|m4a|mp4|mov|avi|webm|txt|docx?)$/i.test(
				docName
			);
		if (hasKnownNonMarkdownExtension) {
			return docName;
		}

		// 默认补 .md（保持旧行为，兼容笔记链接）
		return docName.endsWith(".md") ? docName : `${docName}.md`;
	}

	return undefined;
}

/**
 * 解析块ID
 * 支持格式：
 * - ^blockId
 * - #^blockId
 * - ![[文档名#^blockId]]
 *
 * @param value 包含块ID的字符串
 * @returns 块ID（不带 ^ 前缀），或 undefined
 */
export function parseBlockId(value: string): string | undefined {
	if (!value || typeof value !== "string") return undefined;

	// 匹配 ^blockId（块ID可包含字母、数字、下划线、连字符）
	const match = value.match(/\^([a-zA-Z0-9_-]+)/);
	return match ? match[1] : undefined;
}

// ===== YAML 迁移工具 =====

/**
 * 迁移卡片 YAML：合并 we_source + we_block 为统一格式
 *
 * 迁移规则：
 * 1. 如果 we_source 已包含块ID (#^blockId)，保持不变
 * 2. 如果 we_block 存在且包含文档，优先使用 we_block（更完整）
 * 3. 如果 we_source 是文档链接，we_block 是块ID，合并为 ![[文档#^blockId]]
 * 4. 迁移后删除 we_block 字段
 *
 * @param content 卡片内容
 * @returns 迁移后的内容，如果无需迁移则返回原内容
 */
export function migrateSourceFields(content: string): { content: string; migrated: boolean } {
	if (!content) return { content, migrated: false };

	try {
		const yaml = parseYAMLFromContent(content);
		if (!yaml || Object.keys(yaml).length === 0) {
			return { content, migrated: false };
		}

		// 检查是否需要迁移
		if (!yaml.we_block) {
			return { content, migrated: false };
		}

		const sourceValues = Array.isArray(yaml.we_source)
			? yaml.we_source
			: yaml.we_source
			? [yaml.we_source]
			: [];
		const firstSourceIndex = sourceValues.findIndex(
			(value): value is string => typeof value === "string" && value.trim().length > 0
		);
		const sourceValue = firstSourceIndex >= 0 ? sourceValues[firstSourceIndex] : undefined;
		const blockValues = Array.isArray(yaml.we_block) ? yaml.we_block : [yaml.we_block];
		const blockValue = blockValues.find(
			(value): value is string => typeof value === "string" && value.trim().length > 0
		);

		// 如果任一 we_source 已包含块ID，只需删除 we_block
		if (
			sourceValues.some(
				(value): value is string => typeof value === "string" && !!parseBlockId(value)
			)
		) {
			const { we_block: _removedWeBlock, ...newYaml } = yaml;
			return { content: rebuildContent(content, newYaml), migrated: true };
		}

		// 提取信息
		const sourceDoc = sourceValue ? parseObsidianLink(sourceValue) : undefined;
		const blockDoc = blockValue ? parseObsidianLink(blockValue) : undefined;
		const blockId = blockValue ? parseBlockId(blockValue) : undefined;

		// 确定最终的来源文档
		const finalDoc = blockDoc || sourceDoc;

		if (!finalDoc && !blockId) {
			return { content, migrated: false };
		}

		// 构建合并后的 we_source
		let mergedSource: string;
		if (finalDoc && blockId) {
			// 移除 .md 后缀用于链接
			const docName = finalDoc.replace(/\.md$/, "");
			mergedSource = `![[${docName}#^${blockId}]]`;
		} else if (finalDoc) {
			const docName = finalDoc.replace(/\.md$/, "");
			mergedSource = `[[${docName}]]`;
		} else if (blockId) {
			mergedSource = `^${blockId}`;
		} else {
			return { content, migrated: false };
		}

		// 更新 YAML
		const { we_block: _removedWeBlock, ...newYaml } = yaml;
		if (Array.isArray(yaml.we_source)) {
			const nextSourceValues = [...sourceValues];
			if (firstSourceIndex >= 0) {
				nextSourceValues[firstSourceIndex] = mergedSource;
			} else {
				nextSourceValues.unshift(mergedSource);
			}

			const dedupedValues: string[] = [];
			const seenValues = new Set<string>();
			for (const value of nextSourceValues) {
				if (typeof value !== "string" || !value.trim()) {
					continue;
				}
				const normalizedValue = value.trim();
				if (seenValues.has(normalizedValue)) {
					continue;
				}
				seenValues.add(normalizedValue);
				dedupedValues.push(value);
			}

			newYaml.we_source = dedupedValues;
		} else {
			newYaml.we_source = mergedSource;
		}

		return { content: rebuildContent(content, newYaml), migrated: true };
	} catch (e) {
		logger.warn("[yaml-utils] 迁移来源字段失败:", e);
		return { content, migrated: false };
	}
}

/**
 * 检查卡片是否需要迁移来源字段
 * @param content 卡片内容
 * @returns true 如果需要迁移
 */
export function needsSourceMigration(content: string): boolean {
	if (!content) return false;

	try {
		const yaml = parseYAMLFromContent(content);
		return !!yaml?.we_block;
	} catch {
		return false;
	}
}

// ===== 牌组信息获取工具 =====

/**
 * 卡片牌组信息接口
 */
export interface CardDeckInfo {
	/** 牌组ID列表（从 content YAML 的 we_decks 获取） */
	deckIds: string[];
	/** 第一个牌组ID（便捷访问） */
	primaryDeckId?: string;
}

export interface GetCardDeckIdsOptions {
	/**
	 * 是否回退到运行时引用字段。
	 * 默认 true 仅用于兼容旧链路；当业务要求“以卡片内容 YAML 为准”时应显式传 false。
	 */
	fallbackToReferences?: boolean;
	/**
	 * 是否允许最后回退到旧的 card.deckId。
	 * 默认与 fallbackToReferences 保持一致，避免旧调用点行为突变。
	 */
	fallbackToDeckId?: boolean;
	/**
	 * 是否保留 YAML / 引用字段中的全部牌组归属。
	 * 默认 false，会沿用“单正式牌组 + 全部测试牌组”的兼容口径。
	 */
	preserveAllDeckIds?: boolean;
}

function normalizeDeckIdentifiers(
	values: string[] | undefined,
	decks?: Array<{ id: string; name: string; purpose?: "memory" | "test" }>,
	preserveAllDeckIds = false
): string[] {
	if (preserveAllDeckIds) {
		return getNormalizedDeckEntries(values, decks).map((entry) => entry.deckId);
	}

	return getSingleMemoryFormalDeckIds(values, decks);
}

/**
 * 从卡片获取牌组 ID 列表。
 * 默认优先读取 content YAML 中的 we_decks。
 * 当 options.fallbackToReferences !== false 时，才会继续回退到
 * referencedByDecks 和 card.deckId 这些兼容字段。
 *
 * 注意：we_decks 存储的是牌组名称，需要传入 decks 参数进行名称→ID 转换。
 * 如果 we_decks 中存储的值看起来像牌组ID（deck_开头），会尝试直接使用。
 *
 * @param card 卡片对象（需要 content 字段）
 * @param decks 可选的牌组列表，用于名称→ID 转换
 * @param options 控制是否允许回退到兼容字段
 * @returns CardDeckInfo 对象
 */
export function getCardDeckIds(
	card: { content?: string; deckId?: string; referencedByDecks?: string[]; cardPurpose?: string },
	decks?: Array<{ id: string; name: string; purpose?: "memory" | "test" }>,
	options: GetCardDeckIdsOptions = {}
): CardDeckInfo {
	const result: CardDeckInfo = { deckIds: [] };
	const fallbackToReferences = options.fallbackToReferences ?? true;
	const fallbackToDeckId = options.fallbackToDeckId ?? fallbackToReferences;
	const preserveAllDeckIds = options.preserveAllDeckIds ?? false;
	const runtimeDeckIds = card.deckId
		? normalizeDeckIdentifiers([card.deckId], decks, preserveAllDeckIds)
		: [];
	const isTestCard = card.cardPurpose === "test";

	if (!isTestCard && runtimeDeckIds.length > 0) {
		let nextDeckIds = [...runtimeDeckIds];
		if (fallbackToReferences && Array.isArray(card.referencedByDecks) && decks) {
			const referencedDeckIds = normalizeDeckIdentifiers(
				card.referencedByDecks,
				decks,
				preserveAllDeckIds
			);
			const testDeckIds = referencedDeckIds.filter((deckId) => {
				const matchedDeck = decks.find((deck) => deck.id === deckId);
				return matchedDeck?.purpose === "test";
			});
			nextDeckIds = Array.from(new Set([...runtimeDeckIds, ...testDeckIds]));
		}

		result.deckIds = nextDeckIds;
		result.primaryDeckId = nextDeckIds[0];
		return result;
	}

	// 1. 先从 content YAML 读取 we_decks。
	if (card.content) {
		try {
			const metadata = getCardMetadata(card.content);
			if (metadata.we_decks && metadata.we_decks.length > 0) {
				const convertedIds = normalizeDeckIdentifiers(
					metadata.we_decks,
					decks,
					preserveAllDeckIds
				);
				if (convertedIds.length > 0) {
					result.deckIds = convertedIds;
					result.primaryDeckId = convertedIds[0];
					return result;
				}
			}
		} catch (_e) {
			logger.debug("[yaml-utils] 解析 we_decks 失败，尝试回退方案");
		}
	}

	if (!fallbackToReferences) {
		return result;
	}

	// 2. 兼容旧索引：从 referencedByDecks 获取。
	if (card.referencedByDecks && card.referencedByDecks.length > 0) {
		const referencedDeckIds = normalizeDeckIdentifiers(
			card.referencedByDecks,
			decks,
			preserveAllDeckIds
		);
		if (referencedDeckIds.length > 0) {
			result.deckIds = referencedDeckIds;
			result.primaryDeckId = referencedDeckIds[0];
			return result;
		}
	}

	if (!fallbackToDeckId) {
		return result;
	}

	// 3. 最后回退：使用 card.deckId。
	if (runtimeDeckIds.length > 0) {
		result.deckIds = runtimeDeckIds;
		result.primaryDeckId = runtimeDeckIds[0];
	}

	return result;
}

/**
 * 仅从正式真源解析记忆卡正式归属。
 *
 * 用于运行时正式读取链路：
 * - 只认 content YAML 的 we_decks
 * - 不从 referencedByDecks / deckId 做兼容回退
 */
export function getCardDeckIdsFromFormalSource(
	card: { content?: string; deckId?: string; referencedByDecks?: string[]; cardPurpose?: string },
	decks?: Array<{ id: string; name: string; purpose?: "memory" | "test" }>
): CardDeckInfo {
	const result: CardDeckInfo = { deckIds: [] };

	if (!card.content) {
		return result;
	}

	try {
		const metadata = getCardMetadata(card.content);
		if (metadata.we_decks && metadata.we_decks.length > 0) {
			const convertedIds = normalizeDeckIdentifiers(metadata.we_decks, decks, false);
			if (convertedIds.length > 0) {
				result.deckIds = convertedIds;
				result.primaryDeckId = convertedIds[0];
			}
		}
	} catch (_e) {
		logger.debug("[yaml-utils] 解析正式归属 we_decks 失败");
	}

	return result;
}

/**
 * 从卡片获取牌组名称列表
 *
 * 处理 we_decks 中可能存储名称或ID的两种情况：
 * - 如果是牌组名称：直接使用
 * - 如果是牌组ID（deck_开头）：转换为名称
 *
 * @param card 卡片对象
 * @param decks 可用牌组列表（用于ID到名称的映射）
 * @param fallbackText 无牌组时的默认文本
 * @returns 牌组名称数组
 */
export function getCardDeckNames(
	card: { content?: string; deckId?: string; referencedByDecks?: string[] },
	decks: Array<{ id: string; name: string }>,
	fallbackText = "未知牌组"
): string[] {
	// 统一走 normalizeDeckIdentifiers，避免 we_decks 中名称/ID/旧值混杂时显示异常
	const { deckIds } = getCardDeckIds(card, decks);

	if (deckIds.length === 0) {
		return [fallbackText];
	}

	const names = deckIds.map((_id) => {
		const deck = decks.find((d) => d.id === _id);
		return deck?.name || _id;
	});

	return names.length > 0 ? names : [fallbackText];
}

/**
 * 从卡片获取主牌组名称（第一个牌组）
 *
 * @param card 卡片对象
 * @param decks 可用牌组列表
 * @param fallbackText 无牌组时的默认文本
 * @returns 主牌组名称
 */
export function getCardPrimaryDeckName(
	card: { content?: string; deckId?: string; referencedByDecks?: string[] },
	decks: Array<{ id: string; name: string }>,
	fallbackText = "未知牌组"
): string {
	const names = getCardDeckNames(card, decks, fallbackText);
	return names[0];
}
