/**
 * 表格工具函数
 * TuankiCardTable 组件拆分 - 共享工具函数
 */

import type { Card, Deck } from "../../../data/types";
import type { FieldTemplate } from "../../../data/template-types";
import { ICON_NAMES } from "../../../icons/index.js";
import { OFFICIAL_TEMPLATES } from "../../../constants/official-templates";
import type { FieldTemplateInfo, SourceDocumentStatusInfo } from "../types/table-types";

/**
 * 获取排序图标
 */
export function getSortIcon(currentField: string, sortField: string, direction: "asc" | "desc"): string {
  if (currentField !== sortField) return "sort";
  return direction === "asc" ? "sort-up" : "sort-down";
}

/**
 * 获取星级状态
 */
export function getStarState(
  cardId: string, 
  starIndex: number, 
  currentPriority: number,
  hoveringCardId: string | null,
  hoveringStarIndex: number
): 'hover' | 'filled' | 'empty' {
  const isHovering = hoveringCardId === cardId;
  const hoverIndex = isHovering ? hoveringStarIndex : -1;

  if (isHovering && hoverIndex >= starIndex) {
    return 'hover';
  } else if (starIndex < currentPriority) {
    return 'filled';
  } else {
    return 'empty';
  }
}

/**
 * 获取牌组名称
 */
export function getDeckName(deckId: string, decks?: Array<{ id: string; name: string }>): string {
  if (!decks) return deckId || '未知牌组';
  const deck = decks.find(d => d.id === deckId);
  return deck?.name || deckId || '未知牌组';
}

/**
 * 获取字段模板显示信息
 */
export function getFieldTemplateInfo(
  templateId: string,
  fieldTemplates: FieldTemplate[] = [],
  plugin?: any
): FieldTemplateInfo {
  if (!templateId) {
    return {
      name: '未设置',
      icon: ICON_NAMES.HELP,
      class: 'tuanki-template-unknown'
    };
  }

  // 1. 优先查找官方模板
  const officialTemplate = OFFICIAL_TEMPLATES.find(t => t.id === templateId);
  if (officialTemplate) {
    return {
      name: officialTemplate.name,
      icon: ICON_NAMES.CHECK_CIRCLE,
      class: 'tuanki-template-official'
    };
  }

  // 2. 查找用户自定义 ParseTemplate
  const userParseTemplate = plugin?.settings?.simplifiedParsing?.templates?.find(
    (t: any) => t.id === templateId
  );
  if (userParseTemplate) {
    const isAnkiImported = userParseTemplate.tuankiMetadata?.source === 'anki_imported';
    return {
      name: userParseTemplate.name,
      icon: isAnkiImported ? ICON_NAMES.DOWNLOAD : ICON_NAMES.TAG,
      class: 'tuanki-template-custom'
    };
  }

  // 3. 查找旧版 FieldTemplate
  const oldTemplate = fieldTemplates.find(t => t.id === templateId);
  if (oldTemplate) {
    return {
      name: oldTemplate.name,
      icon: oldTemplate.isOfficial ? ICON_NAMES.CHECK_CIRCLE : ICON_NAMES.TAG,
      class: oldTemplate.isOfficial ? 'tuanki-template-official' : 'tuanki-template-custom'
    };
  }

  // 4. 后备显示：格式化 templateId
  const formattedName = templateId
    .replace(/^(official-|anki-imported-|custom-)/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  
  return {
    name: formattedName,
    icon: ICON_NAMES.WARNING,
    class: 'tuanki-template-missing'
  };
}

/**
 * 获取源文档状态信息
 */
export function getSourceDocumentStatusInfo(status: string): SourceDocumentStatusInfo {
  switch (status) {
    case '存在':
      return {
        text: '存在',
        icon: ICON_NAMES.CHECK,
        class: 'tuanki-status-exists',
        tooltip: '源文档存在，支持双向同步'
      };
    case '已删除':
      return {
        text: '已删除',
        icon: ICON_NAMES.DELETE,
        class: 'tuanki-status-deleted',
        tooltip: '源文档已删除，不支持双向同步'
      };
    case '无源文档':
      return {
        text: '无源文档',
        icon: ICON_NAMES.HELP,
        class: 'tuanki-status-none',
        tooltip: '卡片没有关联的源文档'
      };
    default:
      return {
        text: '未知',
        icon: ICON_NAMES.HELP,
        class: 'tuanki-status-unknown',
        tooltip: '源文档状态未知'
      };
  }
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 检查是否全选
 */
export function isAllSelected(selectedCount: number, totalCount: number): boolean {
  return totalCount > 0 && selectedCount === totalCount;
}

/**
 * 检查是否部分选择
 */
export function isIndeterminate(selectedCount: number, totalCount: number): boolean {
  return selectedCount > 0 && selectedCount < totalCount;
}

/**
 * 获取标签颜色
 */
export function getTagColor(tag: string): string {
  const colors = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan', 'red', 'yellow'];
  const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}


