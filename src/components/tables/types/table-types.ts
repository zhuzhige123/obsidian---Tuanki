/**
 * 表格组件类型定义
 * WeaveCardTable 组件拆分 - 类型系统
 */

import type { App } from "obsidian";
import type { Card, Deck } from "../../../data/types";
import type WeavePlugin from "../../../main";

/**
 * 表格视图模式
 * - basic: 基础卡片管理
 * - review: 复习数据视图
 * - questionBank: 题库考试模式
 * - irContent: 增量阅读内容块模式
 */
export type TableViewMode = "basic" | "review" | "questionBank" | "irContent";

/**
 * 字段分组类型（用于两列布局）
 */
export type ColumnGroupType = "basic" | "review" | "advanced";

/**
 * 字段分组配置
 */
export interface ColumnGroups {
	basic: ColumnKey[]; // 基础信息字段
	review: ColumnKey[]; // 复习数据字段
	advanced: ColumnKey[]; // 高级选项字段
	shared: ColumnKey[]; // 通用字段（在basic和review中都显示）
}

/**
 * 列可见性配置
 */
export interface ColumnVisibility {
	front: boolean;
	back: boolean;
	status: boolean;
	deck: boolean;
	tags: boolean;
	priority: boolean;
	created: boolean;
	modified: boolean;
	next_review: boolean;
	retention: boolean;
	interval: boolean;
	difficulty: boolean;
	review_count: boolean;
	actions: boolean;
	uuid: boolean;
	obsidian_block_link: boolean;
	source_document: boolean;
	source_document_status: boolean;
	// 题库专用列
	question_bank_deck: boolean; // 考试题组
	question_type: boolean; // 题型
	accuracy: boolean; // 正确率
	test_attempts: boolean; // 测试次数
	last_test: boolean; // 最后测试时间
	error_level: boolean; // 错题等级
	// 增量阅读专用列
	ir_title: boolean; // 标题/标题路径
	ir_source_file: boolean; // 源文档
	ir_state: boolean; // 阅读状态
	ir_priority: boolean; // 优先级
	ir_tags: boolean; // 标签
	ir_next_review: boolean; // 下次复习
	ir_review_count: boolean; // 复习次数
	ir_reading_time: boolean; // 阅读时长
	ir_notes: boolean; // 关联笔记
	ir_extract_cards: boolean; // 摘录卡
	ir_memory_cards: boolean; // 记忆卡
	ir_source_kind: boolean; // 来源类型
	ir_source_subunit: boolean; // 目录书签
	ir_tag_group: boolean; // 标签组
	ir_created: boolean; // 创建时间
	ir_decks: boolean; // 所属牌组，支持多牌组
}

/**
 * 列键类型
 */
export type ColumnKey = keyof ColumnVisibility;

/**
 * 列顺序配置（用于拖拽排序）
 */
export type ColumnOrder = ColumnKey[];

/**
 * 默认列顺序
 */
export const DEFAULT_COLUMN_ORDER: ColumnOrder = [
	"front",
	"back",
	"status",
	"deck",
	"question_bank_deck",
	"tags",
	"priority",
	"question_type", // 题型
	"accuracy", // 正确率
	"test_attempts", // 测试次数
	"last_test", // 最后测试
	"error_level", // 错题等级
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
	"source_document_status",
	// 增量阅读专用列
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
	"ir_decks", // 所属牌组
	"actions",
];

/**
 * 排序配置
 */
export interface SortConfig {
	field: string;
	direction: "asc" | "desc";
}

/**
 * 列宽配置
 */
export interface ColumnWidths {
	checkbox: number;
	front: number;
	back: number;
	status: number;
	deck: number;
	question_bank_deck: number;
	tags: number;
	priority: number;
	created: number;
	modified: number;
	next_review: number;
	retention: number;
	interval: number;
	difficulty: number;
	review_count: number;
	actions: number;
	uuid: number;
	obsidian_block_link: number;
	source_document: number;
	source_document_status: number;
	// 题库专用列宽度
	question_type: number;
	accuracy: number;
	test_attempts: number;
	last_test: number;
	error_level: number;
	// 增量阅读专用列宽度
	ir_title: number;
	ir_source_file: number;
	ir_state: number;
	ir_priority: number;
	ir_tags: number;
	ir_next_review: number;
	ir_review_count: number;
	ir_reading_time: number;
	ir_notes: number;
	ir_extract_cards: number;
	ir_memory_cards: number;
	ir_source_kind: number;
	ir_source_subunit: number;
	ir_tag_group: number;
	ir_created: number;
	ir_decks: number; // 所属牌组列宽度
}

/**
 * 表格行回调函数集合
 */
export interface TableRowCallbacks {
	onEdit: (cardId: string) => void;
	onDelete: (cardId: string) => void;
	onResetToNewCard?: (cardId: string) => void;
	onTagsUpdate?: (cardId: string, tags: string[]) => void;
	onPriorityUpdate?: (cardId: string, priority: number) => void;
	onTempFileEdit?: (cardId: string) => void;
	onView?: (cardId: string) => void;
	onJumpToSource?: (card: Card) => void;
	onIRAssociatedNotesManage?: (event: MouseEvent, card: Card) => void;
}

/**
 * 列宽调整回调
 */
export type OnColumnResize = (columnKey: string, width: number) => void;

/**
 * 单元格基础 Props
 */
export interface BaseCellProps {
	card: Card;
}

export type TableTagOption = string | { name: string; count: number };

/**
 * 标签单元格 Props
 */
export interface TagsCellProps extends BaseCellProps {
	app?: App;
	onTagsUpdate?: (cardId: string, tags: string[]) => void;
	availableTags?: TableTagOption[];
}

/**
 * 优先级单元格 Props
 */
export interface PriorityCellProps extends BaseCellProps {
	onPriorityUpdate?: (cardId: string, priority: number) => void;
}

/**
 * 牌组单元格 Props
 */

/**
 * 链接单元格 Props
 */

/**
 * 操作单元格 Props
 */
export interface ActionsCellProps extends BaseCellProps {
	onView?: (cardId: string) => void;
	onTempFileEdit?: (cardId: string) => void;
	onResetToNewCard?: (cardId: string) => void;
	onEdit: (cardId: string) => void;
	onDelete: (cardId: string) => void;
}

/**
 * 基础单元格 Props
 */

/**
 * 列调整器 Props
 */
export interface ColumnResizerProps {
	columnKey: string;
	onResize: (columnKey: string, deltaX: number) => void;
}

/**
 * 表头 Props
 */
export interface TableHeaderProps {
	columnVisibility: ColumnVisibility;
	columnOrder: ColumnOrder;
	tableViewMode?: TableViewMode;
	sortConfig: SortConfig;
	selectedCards: Set<string>;
	totalCards: number;
	columnWidths: ColumnWidths;
	onSelectAll: (selected: boolean) => void;
	onSort: (field: string) => void;
	isSorting?: boolean;
	onColumnResize: OnColumnResize;
}

/**
 * 表格行 Props
 */
export interface TableRowProps {
	card: Card;
	selected: boolean;
	selectionOrder?: number | null;
	columnVisibility: ColumnVisibility;
	columnOrder: ColumnOrder;
	tableViewMode?: TableViewMode;
	callbacks: TableRowCallbacks;
	plugin?: WeavePlugin;
	decks?: Array<{ id: string; name: string }> | Deck[];
	formalDecks?: Array<{ id: string; name: string }> | Deck[];
	availableTags?: TableTagOption[];
	onSelect: (cardId: string, selected: boolean) => void;
	// 拖拽批量选择支持
	// 注：这些Props由TableRow传递给DraggableCheckboxWrapper
	// DraggableCheckboxWrapper包裹TableCheckbox，处理长按触发拖拽的交互逻辑
	onDragSelectStart?: (cardId: string) => void;
	onDragSelectMove?: (cardId: string) => void;
	isDragSelectActive?: boolean; // 全局拖拽状态
	//  性能优化：可见性检查
	isVisible?: boolean; // 组件是否可见，不可见时停止$effect计算
}

/**
 * 空状态 Props
 */
export interface TableEmptyStateProps {
	loading: boolean;
	isEmpty: boolean;
}

/**
 * 源文档状态信息
 */
export interface SourceDocumentStatusInfo {
	text: string;
	icon: string;
	class: string;
	tooltip: string;
}

/**
 * 字段分组配置常量
 * 用于两列布局的字段管理器
 */
export const COLUMN_GROUPS: ColumnGroups = {
	// 基础信息：卡片基本属性和来源信息
	basic: [
		"front",
		"back",
		"status",
		"deck",
		"tags",
		"priority",
		"created",
		"modified",
		"source_document",
	],
	// 复习数据：FSRS相关的复习统计信息
	review: [
		"front", // 通用字段
		"back", // 通用字段
		"status", // 通用字段
		"next_review",
		"retention",
		"interval",
		"difficulty",
		"review_count",
	],
	// 高级选项：技术信息和调试字段
	advanced: ["uuid", "source_document_status"],
	// 通用字段：在basic和review模式中都需要显示的字段
	shared: ["front", "back", "status"],
};
