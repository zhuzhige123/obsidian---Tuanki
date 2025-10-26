<script lang="ts">
  import StatusBadge from "../../ui/StatusBadge.svelte";
  import EnhancedIcon from "../../ui/EnhancedIcon.svelte";
  import TableCheckbox from "./TableCheckbox.svelte";
  import { ICON_NAMES } from "../../../icons/index.js";
  import { formatRelativeTimeDetailed } from "../../../utils/helpers.js";
  import { truncateText, getFieldTemplateInfo, getSourceDocumentStatusInfo } from "../utils/table-utils";
  import BasicCell from "./cells/BasicCell.svelte";
  import TagsCell from "./cells/TagsCell.svelte";
  import PriorityCell from "./cells/PriorityCell.svelte";
  import DeckCell from "./cells/DeckCell.svelte";
  import LinkCell from "./cells/LinkCell.svelte";
  import ActionsCell from "./cells/ActionsCell.svelte";
  import type { TableRowProps, ColumnKey } from "../types/table-types";

  let { 
    card, 
    selected, 
    columnVisibility, 
    columnOrder,
    callbacks, 
    plugin, 
    decks = [], 
    fieldTemplates = [], 
    availableTags = [], 
    onSelect 
  }: TableRowProps = $props();
  
  // 获取源文件名
  function getSourceFileName(card: any): string {
    if (card.sourceFile) {
      return card.sourceFile.split('/').pop() || card.sourceFile;
    }
    if (card.customFields?.obsidianFilePath) {
      const path = card.customFields.obsidianFilePath as string;
      return path.split('/').pop() || path;
    }
    return '';
  }

  function handleRowSelect(checked: boolean) {
    onSelect(card.id, checked);
  }

  // 格式化创建时间
  function formatFixedTime(dateString: string | number | null | undefined): string {
    if (!dateString) return '-';
    
    try {
      let date: Date;
      if (typeof dateString === 'string' && /^\d+$/.test(dateString)) {
        date = new Date(Number(dateString));
      } else {
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) {
        return '-';
      }
      
      const now = new Date();
      const isToday = date.getFullYear() === now.getFullYear() &&
                      date.getMonth() === now.getMonth() &&
                      date.getDate() === now.getDate();
      
      if (isToday) {
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${hour}:${minute}`;
      } else {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (error) {
      return '-';
    }
  }

  const templateInfo = $derived(getFieldTemplateInfo(card.templateId, fieldTemplates, plugin));
  const sourceStatusInfo = $derived(getSourceDocumentStatusInfo((card as any).sourceDocumentStatus || ''));
</script>

<tr class="tuanki-table-row" class:selected={selected}>
  <!-- 复选框列（固定） -->
  <td class="tuanki-checkbox-column">
    <TableCheckbox
      checked={selected}
      onchange={handleRowSelect}
      ariaLabel="选择卡片"
    />
  </td>

  <!-- 动态列 -->
  {#each columnOrder as columnKey (columnKey)}
    {#if columnVisibility[columnKey]}
      {#if columnKey === 'front'}
        <BasicCell content={card.fields?.front || card.fields?.question || ''} columnKey="front" />
      {:else if columnKey === 'back'}
        <BasicCell content={card.fields?.back || card.fields?.answer || ''} columnKey="back" />
      {:else if columnKey === 'status'}
        <td class="tuanki-status-column"><StatusBadge state={card.fsrs.state} /></td>
      {:else if columnKey === 'deck'}
        <DeckCell {card} {decks} />
      {:else if columnKey === 'tags'}
        <TagsCell {card} {availableTags} onTagsUpdate={callbacks.onTagsUpdate} />
      {:else if columnKey === 'priority'}
        <PriorityCell {card} onPriorityUpdate={callbacks.onPriorityUpdate} />
      {:else if columnKey === 'uuid'}
        <td class="tuanki-uuid-column">
          <div class="tuanki-cell-content">
            <span class="tuanki-uuid-text" title={card.uuid}>
              <EnhancedIcon name={ICON_NAMES.HASH} size={14} />
              {truncateText(card.uuid || 'N/A', 8)}
            </span>
          </div>
        </td>
      {:else if columnKey === 'created'}
        <td class="tuanki-date-column">
          <span class="tuanki-text-content">{formatFixedTime(card.created)}</span>
        </td>
      {:else if columnKey === 'obsidian_block_link'}
        <LinkCell {card} {plugin} />
      {:else if columnKey === 'source_document'}
        <td class="tuanki-source-document-column">
          {#if card.sourceFile || card.customFields?.obsidianFilePath}
            <button 
              class="tuanki-source-link"
              onclick={() => callbacks.onJumpToSource?.(card)}
              title="点击跳转到源文档"
            >
              <EnhancedIcon name="file-text" size={14} />
              <span>{truncateText(getSourceFileName(card), 20)}</span>
            </button>
          {:else}
            <span class="tuanki-text-muted">-</span>
          {/if}
        </td>
      {:else if columnKey === 'field_template'}
        <td class="tuanki-field-template-column">
          {#if templateInfo}
            <div class="tuanki-cell-content">
              <EnhancedIcon name={templateInfo.icon} size={14} />
              <span class={templateInfo.class}>{templateInfo.name}</span>
            </div>
          {:else}
            <span class="tuanki-text-muted">未知</span>
          {/if}
        </td>
      {:else if columnKey === 'source_document_status'}
        <td class="tuanki-source-status-column">
          {#if card.sourceFile || card.customFields?.obsidianFilePath}
            <div class="tuanki-cell-content">
              <EnhancedIcon name={sourceStatusInfo.icon} size={14} />
              <span class={sourceStatusInfo.class} title={sourceStatusInfo.tooltip}>
                {sourceStatusInfo.text}
              </span>
            </div>
          {:else}
            <span class="tuanki-text-muted">-</span>
          {/if}
        </td>
      {:else if columnKey === 'actions'}
        <ActionsCell 
          {card} 
          onView={callbacks.onView}
          onTempFileEdit={callbacks.onTempFileEdit}
          onEdit={callbacks.onEdit}
          onDelete={callbacks.onDelete}
        />
      {/if}
    {/if}
  {/each}
</tr>

<style>
  @import '../styles/cell-common.css';

  .tuanki-table-row {
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background-color 0.2s ease;
  }

  .tuanki-table-row:hover {
    background: var(--background-modifier-hover);
  }

  .tuanki-table-row.selected {
    background: rgba(var(--color-accent-rgb), 0.1);
  }

  .tuanki-table-row td {
    padding: 10px 16px;
    border-right: 1px solid var(--background-modifier-border);
    vertical-align: middle;
  }

  .tuanki-checkbox-column {
    width: 48px;
    min-width: 48px;
    max-width: 48px;
    text-align: center;
  }
</style>


