/**
 * 表格组件类型定义
 * TuankiCardTable 组件拆分 - 类型系统
 */

import type { Card, Deck } from "../../../data/types";
import type { FieldTemplate } from "../../../data/template-types";
import type AnkiPlugin from "../../../main";

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
  actions: boolean;
  uuid: boolean;
  obsidian_block_link: boolean;
  source_document: boolean;
  field_template: boolean;
  source_document_status: boolean;
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
  'front',
  'back',
  'status',
  'deck',
  'tags',
  'priority',
  'created',
  'uuid',
  'obsidian_block_link',
  'source_document',
  'field_template',
  'source_document_status',
  'actions'
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
  tags: number;
  priority: number;
  created: number;
  actions: number;
  uuid: number;
  obsidian_block_link: number;
  source_document: number;
  field_template: number;
  source_document_status: number;
}

/**
 * 表格行回调函数集合
 */
export interface TableRowCallbacks {
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
  onTagsUpdate?: (cardId: string, tags: string[]) => void;
  onPriorityUpdate?: (cardId: string, priority: number) => void;
  onTempFileEdit?: (cardId: string) => void;
  onView?: (cardId: string) => void;
  onJumpToSource?: (card: any) => void;
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

/**
 * 标签单元格 Props
 */
export interface TagsCellProps extends BaseCellProps {
  onTagsUpdate?: (cardId: string, tags: string[]) => void;
  availableTags?: string[];
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
export interface DeckCellProps extends BaseCellProps {
  decks?: Array<{ id: string; name: string }> | Deck[];
}

/**
 * 链接单元格 Props
 */
export interface LinkCellProps extends BaseCellProps {
  plugin?: AnkiPlugin;
}

/**
 * 操作单元格 Props
 */
export interface ActionsCellProps extends BaseCellProps {
  onView?: (cardId: string) => void;
  onTempFileEdit?: (cardId: string) => void;
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

/**
 * 基础单元格 Props
 */
export interface BasicCellProps {
  content: string;
  title?: string;
  columnKey: string;
}

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
  sortConfig: SortConfig;
  selectedCards: Set<string>;
  totalCards: number;
  columnWidths: ColumnWidths;
  onSelectAll: (selected: boolean) => void;
  onSort: (field: string) => void;
  onColumnResize: OnColumnResize;
}

/**
 * 表格行 Props
 */
export interface TableRowProps {
  card: Card;
  selected: boolean;
  columnVisibility: ColumnVisibility;
  columnOrder: ColumnOrder;
  callbacks: TableRowCallbacks;
  plugin?: AnkiPlugin;
  decks?: Array<{ id: string; name: string }> | Deck[];
  fieldTemplates?: FieldTemplate[];
  availableTags?: string[];
  onSelect: (cardId: string, selected: boolean) => void;
}

/**
 * 空状态 Props
 */
export interface TableEmptyStateProps {
  loading: boolean;
  isEmpty: boolean;
}

/**
 * 字段模板信息
 */
export interface FieldTemplateInfo {
  name: string;
  icon: string;
  class: string;
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

