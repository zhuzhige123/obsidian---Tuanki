/**
 * 表格列配置工具
 * 用于动态列渲染的配置映射
 *
 * 支持中英文国际化
 */

import type { ColumnKey } from "../types/table-types";

/**
 * 列标签映射（中文）- 简化版
 */
export const COLUMN_LABELS_ZH: Record<ColumnKey, string> = {
	front: "正面",
	back: "背面",
	status: "状态",
	deck: "正式牌组",
	tags: "标签",
	priority: "优先级",
	created: "创建时间",
	modified: "修改时间",
	next_review: "下次复习",
	retention: "记忆率",
	interval: "间隔",
	difficulty: "难度",
	review_count: "复习次数",
	uuid: "UUID",
	obsidian_block_link: "块引用",
	source_document: "源文档",
	field_template: "模板",
	source_document_status: "源状态",
	actions: "操作",
	// 题库专用列
	question_type: "题型",
	accuracy: "正确率",
	test_attempts: "答题次数",
	last_test: "最后测试",
	error_level: "错题等级",
	// 增量阅读专用列
	ir_title: "标题",
	ir_source_file: "源文档",
	ir_state: "阅读状态",
	ir_priority: "优先级",
	ir_tags: "标签",
	ir_next_review: "下次复习",
	ir_review_count: "复习次数",
	ir_reading_time: "阅读时长",
	ir_notes: "关联笔记",
	ir_extract_cards: "摘录卡",
	ir_memory_cards: "记忆卡",
	ir_source_kind: "来源类型",
	ir_source_subunit: "目录书签",
	ir_tag_group: "标签组",
	ir_created: "创建时间",
	ir_decks: "专题", // IR 专题
};

/**
 * 列标签映射（英文）
 */
export const COLUMN_LABELS_EN: Record<ColumnKey, string> = {
	front: "Front",
	back: "Back",
	status: "Status",
	deck: "Formal Deck",
	tags: "Tags",
	priority: "Priority",
	created: "Created",
	modified: "Modified",
	next_review: "Next Review",
	retention: "Retention",
	interval: "Interval",
	difficulty: "Difficulty",
	review_count: "Reviews",
	uuid: "UUID",
	obsidian_block_link: "Block Link",
	source_document: "Source",
	field_template: "Template",
	source_document_status: "Source Status",
	actions: "Actions",
	// Question Bank columns
	question_type: "Question Type",
	accuracy: "Accuracy",
	test_attempts: "Attempts",
	last_test: "Last Test",
	error_level: "Error Level",
	// Incremental Reading columns
	ir_title: "Title",
	ir_source_file: "Source File",
	ir_state: "Reading State",
	ir_priority: "Priority",
	ir_tags: "Tags",
	ir_next_review: "Next Review",
	ir_review_count: "Reviews",
	ir_reading_time: "Reading Time",
	ir_notes: "Associated Notes",
	ir_extract_cards: "Extract Cards",
	ir_memory_cards: "Memory Cards",
	ir_source_kind: "Source Type",
	ir_source_subunit: "Bookmark",
	ir_tag_group: "Tag Group",
	ir_created: "Created",
	ir_decks: "Topics", // IR topics
};

/**
 * 列标签完整描述（中文，用于tooltip）
 */
export const COLUMN_TOOLTIPS_ZH: Record<ColumnKey, string> = {
	front: "卡片正面内容",
	back: "卡片背面内容",
	status: "卡片学习状态",
	deck: "卡片正式归属牌组",
	tags: "卡片标签",
	priority: "优先级（1-4星）",
	created: "创建时间",
	modified: "卡片最后修改时间",
	next_review: "下次复习的预计时间",
	retention: "当前的记忆保持率",
	interval: "当前复习间隔",
	difficulty: "卡片难度系数",
	review_count: "已复习次数",
	uuid: "唯一标识符",
	obsidian_block_link: "Obsidian块引用",
	source_document: "源文档路径",
	field_template: "字段模板",
	source_document_status: "源文档状态",
	actions: "操作",
	// 题库专用列提示
	question_type: "题目类型（单选、多选、填空、问答）",
	accuracy: "答题正确率",
	test_attempts: "测试答题次数",
	last_test: "最近一次测试时间",
	error_level: "错题严重程度",
	// 增量阅读专用列提示
	ir_title: "内容块标题路径",
	ir_source_file: "源文档路径",
	ir_state: "阅读状态（新导入/阅读中/复习/已暂停）",
	ir_priority: "内容优先级（P 值）",
	ir_tags: "内容块标签",
	ir_next_review: "下次复习时间",
	ir_review_count: "复习次数",
	ir_reading_time: "累计阅读时长",
	ir_notes: "当前来源关联的 Markdown 笔记数量",
	ir_extract_cards: "当前来源沉淀的摘录型卡片数量",
	ir_memory_cards: "当前来源沉淀的记忆卡片数量",
	ir_source_kind: "来源文档类型（Markdown / PDF / EPUB）",
	ir_source_subunit: "PDF / EPUB 的目录书签或章节定位",
	ir_tag_group: "当前阅读点命中的增量阅读标签组",
	ir_created: "导入时间",
	ir_decks: "内容块所属专题（兼容旧的增量阅读牌组数据）",
};

/**
 * 列标签完整描述（英文，用于tooltip）
 */
export const COLUMN_TOOLTIPS_EN: Record<ColumnKey, string> = {
	front: "Card front content",
	back: "Card back content",
	status: "Card learning status",
	deck: "Card formal deck assignment",
	tags: "Card tags",
	priority: "Priority (1-4 stars)",
	created: "Creation date",
	modified: "Last modified date",
	next_review: "Next scheduled review time",
	retention: "Current memory retention rate",
	interval: "Current review interval",
	difficulty: "Card difficulty factor",
	review_count: "Number of reviews",
	uuid: "Unique identifier",
	obsidian_block_link: "Obsidian block link",
	source_document: "Source document path",
	field_template: "Field template",
	source_document_status: "Source document status",
	actions: "Actions",
	// Question Bank column tooltips
	question_type: "Question type (single choice, multiple choice, cloze, short answer)",
	accuracy: "Test accuracy rate",
	test_attempts: "Number of test attempts",
	last_test: "Last test time",
	error_level: "Error severity level",
	// Incremental Reading column tooltips
	ir_title: "Content block heading path",
	ir_source_file: "Source document path",
	ir_state: "Reading state (new/learning/review/suspended)",
	ir_priority: "Content priority value (P badge)",
	ir_tags: "Content block tags",
	ir_next_review: "Next scheduled review time",
	ir_review_count: "Number of reviews",
	ir_reading_time: "Total reading time",
	ir_notes: "Number of associated Markdown notes for the current source",
	ir_extract_cards: "Number of extract-style cards produced from the current source",
	ir_memory_cards: "Number of memory cards produced from the current source",
	ir_source_kind: "Source document type (Markdown / PDF / EPUB)",
	ir_source_subunit: "Bookmark or chapter location for PDF / EPUB sources",
	ir_tag_group: "Matched incremental-reading tag group for the current item",
	ir_created: "Import time",
	ir_decks: "Topics this content block belongs to (compatible with legacy IR deck data)",
};

/**
 * 旧版列标签映射（向后兼容）
 * Compatibility note: 使用 getColumnLabel() 替代
 */
export const COLUMN_LABELS: Record<ColumnKey, string> = COLUMN_LABELS_ZH;

/**
 * 可排序的列
 */
export const SORTABLE_COLUMNS: Set<ColumnKey> = new Set([
	"front",
	"back",
	"status",
	"deck",
	"tags",
	"priority",
	"created",
	"modified",
	"next_review",
	"retention",
	"interval",
	"difficulty",
	"review_count",
	"uuid",
	"obsidian_block_link",
	"source_document",
	"field_template",
	"source_document_status",
	// 题库专用列可排序
	"question_type",
	"accuracy",
	"test_attempts",
	"last_test",
	"error_level",
	// 增量阅读专用列可排序
	"ir_title",
	"ir_source_file",
	"ir_state",
	"ir_priority",
	"ir_tags",
	"ir_next_review",
	"ir_review_count",
	"ir_reading_time",
	"ir_notes",
	"ir_extract_cards",
	"ir_memory_cards",
	"ir_source_kind",
	"ir_source_subunit",
	"ir_tag_group",
	"ir_created",
	"ir_decks", // 所属牌组可排序
]);

/**
 * 判断列是否可排序
 */
export function isSortableColumn(key: ColumnKey): boolean {
	return SORTABLE_COLUMNS.has(key);
}

/**
 * 获取列标签（支持国际化）
 * @param key 列键名
 * @param locale 语言代码（'zh' | 'en'）
 * @returns 列标签文本
 */
export function getColumnLabel(key: ColumnKey, locale: "zh" | "en" = "zh"): string {
	const labels = locale === "zh" ? COLUMN_LABELS_ZH : COLUMN_LABELS_EN;
	return labels[key] || key;
}

/**
 * 获取列提示文本（支持国际化）
 * @param key 列键名
 * @param locale 语言代码（'zh' | 'en'）
 * @returns 列完整描述文本
 */
export function getColumnTooltip(key: ColumnKey, locale: "zh" | "en" = "zh"): string {
	const tooltips = locale === "zh" ? COLUMN_TOOLTIPS_ZH : COLUMN_TOOLTIPS_EN;
	return tooltips[key] || "";
}
