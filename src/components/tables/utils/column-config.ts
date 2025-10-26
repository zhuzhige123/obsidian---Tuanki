/**
 * 表格列配置工具
 * 用于动态列渲染的配置映射
 */

import type { ColumnKey } from '../types/table-types';

/**
 * 列标签映射
 */
export const COLUMN_LABELS: Record<ColumnKey, string> = {
  front: "正面内容",
  back: "背面内容",
  status: "状态",
  deck: "牌组",
  tags: "标签",
  priority: "优先级",
  created: "创建时间",
  uuid: "UUID",
  obsidian_block_link: "块链接",
  source_document: "来源文档",
  field_template: "字段模板",
  source_document_status: "源文档状态",
  actions: "操作",
};

/**
 * 可排序的列
 */
export const SORTABLE_COLUMNS: Set<ColumnKey> = new Set([
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
]);

/**
 * 判断列是否可排序
 */
export function isSortableColumn(key: ColumnKey): boolean {
  return SORTABLE_COLUMNS.has(key);
}

/**
 * 获取列标签
 */
export function getColumnLabel(key: ColumnKey): string {
  return COLUMN_LABELS[key] || key;
}


