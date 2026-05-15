<script lang="ts">
  import type { Card } from '../../../data/types';
  import { Menu, TFile } from "obsidian";
  import StatusBadge from "../../ui/StatusBadge.svelte";
  import { untrack } from "svelte";
  import EnhancedIcon from "../../ui/EnhancedIcon.svelte";
  import DraggableCheckboxWrapper from "./DraggableCheckboxWrapper.svelte";
  import { ICON_NAMES } from "../../../icons/index.js";
  import { truncateText, getFieldTemplateInfo, getSourceDocumentStatusInfo } from "../utils/table-utils";
  import TagsCell from "./cells/TagsCell.svelte";
  import PriorityCell from "./cells/PriorityCell.svelte";
  import ActionsCell from "./cells/ActionsCell.svelte";
  import ReviewDataCell from "./cells/ReviewDataCell.svelte";
  import ModifiedCell from "./cells/ModifiedCell.svelte";
  import type { FieldTemplateInfo, SourceDocumentStatusInfo, TableRowProps } from "../types/table-types";
  import { getCardBack, getCardFront } from "../../../utils/card-field-helper";
  import { getCardDeckIds } from "../../../utils/yaml-utils";

  let {
    card,
    selected,
    selectionOrder = null,
    columnOrder,
    tableViewMode,
    callbacks,
    plugin,
    decks = [],
    fieldTemplates = [],
    availableTags = [],
    onSelect,
    onDragSelectStart,
    onDragSelectMove,
    isDragSelectActive,
    isVisible = true
  }: TableRowProps = $props();

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
    onSelect(card.uuid, checked);
  }

  function getIRSourceKindLabel(kind: string | undefined): string {
    if (kind === 'markdown') return 'Markdown';
    if (kind === 'pdf') return 'PDF';
    if (kind === 'epub') return 'EPUB';
    return '-';
  }

  function getIRPriorityValue(card: any): number {
    return Number(card.ir_priority_value ?? card.ir_priority ?? 5) || 5;
  }

  function getIRPriorityClass(value: number): string {
    if (value >= 8) return 'high';
    if (value >= 5) return 'medium';
    return 'low';
  }

  function isIRDeckIdentifierLike(value: string | null | undefined): boolean {
    const normalized = String(value || '').trim();
    return /^deck-[a-z0-9_-]+$/i.test(normalized);
  }

  function stripMarkdownExtension(name: string): string {
    return name.replace(/\.md$/i, '');
  }

  function getAssociatedNotePaths(card: any): string[] {
    const paths = Array.isArray(card.ir_associated_note_paths)
      ? card.ir_associated_note_paths
      : [];
    return paths.filter((path: unknown): path is string => typeof path === 'string' && !!path);
  }

  function getAssociatedNoteDisplay(card: any): {
    paths: string[];
    primaryPath?: string;
    remainingCount: number;
  } {
    const paths = getAssociatedNotePaths(card);
    return {
      paths,
      primaryPath: paths[0],
      remainingCount: Math.max(0, paths.length - 1)
    };
  }

  function resolveNoteFile(path: string): TFile | null {
    if (!plugin?.app || !path) return null;

    const direct = plugin.app.vault.getAbstractFileByPath(path);
    if (direct instanceof TFile) return direct;

    if (!/\.[^/.]+$/i.test(path)) {
      const markdownFile = plugin.app.vault.getAbstractFileByPath(`${path}.md`);
      if (markdownFile instanceof TFile) return markdownFile;
    }

    return null;
  }

  function getAssociatedNoteLabel(path: string): string {
    const file = resolveNoteFile(path);
    if (file instanceof TFile) {
      return stripMarkdownExtension(file.basename);
    }

    const normalized = path.replace(/\\/g, '/');
    return stripMarkdownExtension(normalized.split('/').pop() || normalized);
  }

  async function openAssociatedNote(path: string) {
    if (!plugin?.app || !path) return;

    const file = resolveNoteFile(path);
    const targetPath = file?.path || path;
    const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
    await plugin.app.workspace.openLinkText(targetPath, contextPath, false);
  }

  function openAssociatedNotesMenu(event: MouseEvent, notePaths: string[]) {
    if (!plugin?.app || notePaths.length === 0) return;
    event.preventDefault();
    event.stopPropagation();

    const menu = new Menu();
    for (const path of notePaths) {
      menu.addItem((item) =>
        item
          .setTitle(getAssociatedNoteLabel(path))
          .setIcon('file-text')
          .onClick(() => {
            void openAssociatedNote(path);
          })
      );
    }
    menu.showAtMouseEvent(event);
  }

  function openAssociatedNotesManager(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    callbacks.onIRAssociatedNotesManage?.(event, card);
  }

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
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      return '-';
    }
  }

  const defaultTemplateInfo: FieldTemplateInfo = {
    name: '未设置',
    icon: ICON_NAMES.HELP,
    class: 'weave-template-unknown'
  };

  const defaultSourceStatusInfo: SourceDocumentStatusInfo = {
    text: '未知',
    icon: ICON_NAMES.HELP,
    class: 'weave-status-unknown',
    tooltip: '源文档状态未知'
  };

  // 只有行可见时才计算派生数据，减少大表格下的额外开销。
  let templateInfo = $state<FieldTemplateInfo>(
    untrack(() =>
      isVisible
        ? getFieldTemplateInfo(card.templateId || '', fieldTemplates, plugin)
        : defaultTemplateInfo
    )
  );
  let sourceStatusInfo = $state<SourceDocumentStatusInfo>(
    untrack(() =>
      isVisible
        ? getSourceDocumentStatusInfo((card as any).sourceDocumentStatus || '')
        : defaultSourceStatusInfo
    )
  );

  let cardDeckNames = $derived.by(() => {
    if (!isVisible) return [];

    const { deckIds } = getCardDeckIds(card, decks, { fallbackToReferences: false });
    if (deckIds.length === 0) {
      return [];
    }

    const names = deckIds
      .map((deckId) => decks.find((deck) => deck.id === deckId)?.name || "")
      .filter(Boolean);

    return Array.from(new Set(names));
  });

  let irCardDeckNames = $derived.by(() => {
    if (!isVisible) return [];

    const names: string[] = [];
    const seen = new Set<string>();
    const deckIds = (card as any).ir_deck_ids || (card as any).metadata?.deckIds || [];

    if (Array.isArray(deckIds)) {
      for (const deckId of deckIds) {
        const deck = decks.find(d => d.id === deckId);
        const deckName = deck?.name || '';
        if (deckName && !seen.has(deckName)) {
          seen.add(deckName);
          names.push(deckName);
        }
      }
    }

    const singleDeckName = (card as any).ir_deck;
    if (
      typeof singleDeckName === 'string' &&
      singleDeckName &&
      singleDeckName !== '未分配' &&
      !isIRDeckIdentifierLike(singleDeckName) &&
      !seen.has(singleDeckName)
    ) {
      names.push(singleDeckName);
    }

    return names;
  });

  $effect(() => {
    if (!isVisible) return;

    templateInfo = getFieldTemplateInfo(card.templateId || '', fieldTemplates, plugin);
    sourceStatusInfo = getSourceDocumentStatusInfo((card as any).sourceDocumentStatus || '');
  });

  // 继续沿用既有样式类，兼容 V3/V4 的增量阅读状态。
  function getIRStateClass(state: string | undefined): string {
    const s = state || 'new';
    if (s === 'queued' || s === 'active') return 'learning';
    if (s === 'scheduled') return 'review';
    if (s === 'done') return 'done';
    return s;
  }

  function getIRStateLabel(state: string | undefined): string {
    const s = state || 'new';
    if (s === 'new') return '新导入';
    if (s === 'learning' || s === 'queued' || s === 'active') return '阅读中';
    if (s === 'review' || s === 'scheduled') return '复习';
    if (s === 'suspended') return '已暂停';
    if (s === 'done') return '已完成';
    return '未知';
  }
</script>

<tr
  class="weave-table-row"
  class:selected={selected}
>
  <td class="weave-checkbox-column">
    <div class="weave-checkbox-cell">
      <DraggableCheckboxWrapper
        checked={selected}
        onchange={handleRowSelect}
        ariaLabel="选择卡片"
        cardId={card.uuid}
        {onDragSelectStart}
        {onDragSelectMove}
        {isDragSelectActive}
      />
      {#if selected && selectionOrder}
        <span class="weave-selection-order-badge" title={`多选序号 ${selectionOrder}`}>
          {selectionOrder}
        </span>
      {/if}
    </div>
  </td>

  {#each columnOrder as columnKey (columnKey)}
    {#if columnKey === 'front'}
      <td class="weave-content-column weave-front-column">
        <div class="weave-cell-content">
          <span class="weave-text-content weave-text-content-primary">
            {truncateText((card as any).front || getCardFront(card))}
          </span>
        </div>
      </td>
    {:else if columnKey === 'back'}
      <td class="weave-content-column weave-back-column">
        <div class="weave-cell-content">
          <span class="weave-text-content weave-text-content-secondary">
            {truncateText((card as any).back || getCardBack(card))}
          </span>
        </div>
      </td>
    {:else if columnKey === 'status'}
      <td class="weave-status-column"><StatusBadge state={card.fsrs ? card.fsrs.state : 0} /></td>
    {:else if columnKey === 'deck'}
      <td class="weave-deck-column">
        <div class="weave-decks-container">
        {#if cardDeckNames.length > 0}
          {#each cardDeckNames as deckName}
            <span class="weave-deck-badge weave-deck-badge--memory" title={deckName}>
              {truncateText(deckName, 12)}
            </span>
          {/each}
        {:else}
          <span class="weave-text-muted">未分配</span>
        {/if}
        </div>
      </td>
    {:else if columnKey === 'tags'}
      <TagsCell app={plugin?.app} {card} {availableTags} onTagsUpdate={callbacks.onTagsUpdate} />
    {:else if columnKey === 'priority'}
      <PriorityCell {card} onPriorityUpdate={callbacks.onPriorityUpdate} />
    {:else if columnKey === 'uuid'}
      <td class="weave-uuid-column">
        <div class="weave-cell-content">
          <span class="weave-uuid-text" title={card.uuid}>
            <EnhancedIcon name={ICON_NAMES.HASH} size={14} />
            {truncateText(card.uuid || 'N/A', 8)}
          </span>
        </div>
      </td>
    {:else if columnKey === 'created'}
      <td class="weave-date-column">
        <span class="weave-text-content weave-text-content-meta">{formatFixedTime(card.created)}</span>
      </td>
    {:else if columnKey === 'modified'}
      <ModifiedCell {card} />
    {:else if columnKey === 'next_review' || columnKey === 'retention' || columnKey === 'interval' || columnKey === 'difficulty' || columnKey === 'review_count'}
      <ReviewDataCell {card} column={columnKey} />
    {:else if columnKey === 'source_document'}
      <td class="weave-source-document-column">
        {#if card.sourceFile || card.customFields?.obsidianFilePath}
          <button
            class="weave-source-link"
            onclick={() => callbacks.onJumpToSource?.(card)}
            title={card.sourceBlock || (card.customFields?.blockId)
              ? '点击打开源文档并定位到块引用位置'
              : '点击打开源文档'}
          >
            <span>{truncateText(getSourceFileName(card), 20)}</span>
            {#if card.sourceBlock || (card.customFields?.blockId)}
              <EnhancedIcon name="link" size={12} class="weave-has-block-indicator" />
            {/if}
          </button>
        {:else}
          <span class="weave-text-muted">-</span>
        {/if}
      </td>
    {:else if columnKey === 'field_template'}
      <td class="weave-field-template-column">
        {#if templateInfo}
          <div class="weave-cell-content weave-field-template-chip {templateInfo.class}">
            <EnhancedIcon name={templateInfo.icon} size={12} />
            <span class="weave-field-template-text">{templateInfo.name}</span>
          </div>
        {:else}
          <span class="weave-text-muted">未设置</span>
        {/if}
      </td>
    {:else if columnKey === 'source_document_status'}
      <td class="weave-source-status-column">
        {#if card.sourceFile || card.customFields?.obsidianFilePath}
          <div class="weave-cell-content weave-source-status-badge {sourceStatusInfo.class}">
            <EnhancedIcon name={sourceStatusInfo.icon} size={12} />
            <span class="weave-source-status-text" title={sourceStatusInfo.tooltip}>
              {sourceStatusInfo.text}
            </span>
          </div>
        {:else}
          <span class="weave-text-muted">-</span>
        {/if}
      </td>
    {:else if columnKey === 'question_type'}
      <td class="weave-question-type-column">
        <span class="weave-inline-chip weave-inline-chip--soft">{(card as any).question_type || '-'}</span>
      </td>
    {:else if columnKey === 'accuracy'}
      <td class="weave-accuracy-column">
        <span class="weave-inline-chip weave-inline-chip--metric {(card as any).accuracy_class || ''}">
          {(card as any).accuracy || '-'}
        </span>
      </td>
    {:else if columnKey === 'test_attempts'}
      <td class="weave-test-attempts-column">
        <span class="weave-text-content weave-text-content-meta">{(card as any).test_attempts || 0}</span>
      </td>
    {:else if columnKey === 'last_test'}
      <td class="weave-last-test-column">
        <span class="weave-text-content weave-text-content-meta">{(card as any).last_test || '-'}</span>
      </td>
    {:else if columnKey === 'error_level'}
      <td class="weave-error-level-column">
        <span class="weave-inline-chip weave-inline-chip--soft">{(card as any).error_level || '-'}</span>
      </td>
    {:else if columnKey === 'ir_title'}
      <td class="weave-ir-title-column">
        <div class="weave-cell-content">
          <span class="weave-text-content" title={(card as any).ir_title || '-'}>
            {truncateText((card as any).ir_title || '-', 50)}
          </span>
        </div>
      </td>
    {:else if columnKey === 'ir_source_file'}
      <td class="weave-ir-source-file-column">
        <span class="weave-text-content" title={(card as any).ir_source_file || '-'}>
          {truncateText((card as any).ir_source_document_label || (card as any).ir_source_file?.split('/').pop() || '-', 25)}
        </span>
      </td>
    {:else if columnKey === 'ir_source_kind'}
      <td class="weave-ir-source-kind-column">
        <span class="weave-inline-chip weave-inline-chip--soft">
          {getIRSourceKindLabel((card as any).ir_source_kind)}
        </span>
      </td>
    {:else if columnKey === 'ir_state'}
      <td class="weave-ir-state-column">
        <span class="weave-state-badge weave-state-{getIRStateClass((card as any).ir_state)}">
          {getIRStateLabel((card as any).ir_state)}
        </span>
      </td>
    {:else if columnKey === 'ir_priority'}
      <td class="weave-ir-priority-column">
        <span class="weave-priority-badge weave-priority-{getIRPriorityClass(getIRPriorityValue(card as any))}">
          P{getIRPriorityValue(card as any)}
        </span>
      </td>
    {:else if columnKey === 'ir_tags'}
      <TagsCell app={plugin?.app} {card} {availableTags} onTagsUpdate={callbacks.onTagsUpdate} />
    {:else if columnKey === 'ir_next_review'}
      <td class="weave-ir-next-review-column">
        <span class="weave-text-content">
          {(card as any).ir_next_review ? formatFixedTime((card as any).ir_next_review) : '-'}
        </span>
      </td>
    {:else if columnKey === 'ir_review_count'}
      <td class="weave-ir-review-count-column">
        <span class="weave-text-content">{(card as any).ir_review_count || 0}</span>
      </td>
    {:else if columnKey === 'ir_reading_time'}
      <td class="weave-ir-reading-time-column">
        <span class="weave-text-content">
          {(() => {
            const totalSeconds = (card as any).ir_reading_time || 0;
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            if (hours > 0) {
              return `${hours}小时${minutes}分钟`;
            } else if (minutes > 0) {
              return `${minutes}分钟`;
            } else {
              return '0分钟';
            }
          })()}
        </span>
      </td>
    {:else if columnKey === 'ir_notes'}
      <td class="weave-ir-notes-column" oncontextmenu={openAssociatedNotesManager}>
        {#if getAssociatedNoteDisplay(card as any).paths.length === 0}
          <span class="weave-text-muted">-</span>
        {:else}
          <div class="weave-ir-note-links">
            <button
              type="button"
              class="weave-ir-note-link"
              title={getAssociatedNoteDisplay(card as any).primaryPath}
              onclick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const primaryPath = getAssociatedNoteDisplay(card as any).primaryPath;
                if (primaryPath) {
                  void openAssociatedNote(primaryPath);
                }
              }}
              oncontextmenu={openAssociatedNotesManager}
            >
              {getAssociatedNoteLabel(getAssociatedNoteDisplay(card as any).primaryPath || '')}
            </button>
            {#if getAssociatedNoteDisplay(card as any).remainingCount > 0}
              <button
                type="button"
                class="weave-ir-note-more"
                title={`查看其余 ${getAssociatedNoteDisplay(card as any).remainingCount} 个关联笔记`}
                onclick={(event) => openAssociatedNotesMenu(event, getAssociatedNoteDisplay(card as any).paths)}
                oncontextmenu={openAssociatedNotesManager}
              >
                +{getAssociatedNoteDisplay(card as any).remainingCount}
              </button>
            {/if}
          </div>
        {/if}
      </td>
    {:else if columnKey === 'ir_extract_cards'}
      <td class="weave-ir-extract-cards-column">
        <span class="weave-text-content">{(card as any).ir_extract_cards ?? 0}</span>
      </td>
    {:else if columnKey === 'ir_memory_cards'}
      <td class="weave-ir-memory-cards-column">
        <span class="weave-text-content">{(card as any).ir_memory_cards ?? 0}</span>
      </td>
    {:else if columnKey === 'ir_source_subunit'}
      <td class="weave-ir-source-subunit-column">
        <span class="weave-text-content" title={(card as any).ir_source_subunit || '-'}>
          {truncateText((card as any).ir_source_subunit || '-', 28)}
        </span>
      </td>
    {:else if columnKey === 'ir_tag_group'}
      <td class="weave-ir-tag-group-column">
        <span class="weave-inline-chip weave-inline-chip--soft" title={(card as any).ir_tag_group || '默认'}>
          {(card as any).ir_tag_group || '默认'}
        </span>
      </td>
    {:else if columnKey === 'ir_created'}
      <td class="weave-ir-created-column">
        <span class="weave-text-content">{formatFixedTime((card as any).ir_created)}</span>
      </td>
    {:else if columnKey === 'ir_decks'}
      <td class="weave-ir-decks-column">
        <div class="weave-decks-container">
          {#if irCardDeckNames.length > 0}
            {#each irCardDeckNames.slice(0, 3) as deckName}
              <span class="weave-deck-badge" title={deckName}>
                {truncateText(deckName, 12)}
              </span>
            {/each}
            {#if irCardDeckNames.length > 3}
              <span class="weave-deck-more" title={irCardDeckNames.join('\n')}>
                +{irCardDeckNames.length - 3}
              </span>
            {/if}
          {:else}
            <span class="weave-text-muted">未分配</span>
          {/if}
        </div>
      </td>
    {:else if columnKey === 'actions'}
      <td class="weave-actions-column">
        <ActionsCell
          {card}
          onView={callbacks.onView}
          onTempFileEdit={callbacks.onTempFileEdit}
          onEdit={callbacks.onEdit}
          onDelete={callbacks.onDelete}
        />
      </td>
    {/if}
  {/each}
</tr>

<style>
  @import '../styles/cell-common.css';

  .weave-table-row {
    transition: background-color 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
    position: relative;
  }

  .weave-table-row:hover {
    background: color-mix(in srgb, var(--background-modifier-hover) 58%, transparent);
    box-shadow: inset 0 1px 0 var(--weave-table-grid-hover-border-color, color-mix(in srgb, var(--background-modifier-border) 24%, transparent));
    z-index: 1;
  }

  .weave-table-row.selected {
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
  }

  .weave-table-row.selected:hover {
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 18%, transparent);
  }

  .weave-table-row td {
    padding: var(--weave-table-cell-padding-y, 6px) var(--weave-table-cell-padding-x, 16px);
    border-right: 1px solid var(--weave-table-grid-border-color, color-mix(in srgb, var(--background-modifier-border) 45%, transparent));
    border-bottom: 1px solid var(--weave-table-grid-border-color, var(--background-modifier-border));
    vertical-align: middle;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 0;
  }

  .weave-table-row:last-child td {
    border-bottom: none;
  }

  .weave-table-row .weave-checkbox-column {
    width: 72px;
    min-width: 72px;
    max-width: 72px;
    text-align: center;
    padding: var(--weave-table-cell-padding-y, 6px) var(--weave-table-cell-padding-x, 16px);
    text-overflow: clip;
    overflow: visible;
  }

  .weave-checkbox-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
  }

  .weave-selection-order-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 16%, var(--weave-table-surface-bg, var(--background-secondary)));
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent);
    color: var(--text-accent);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .weave-actions-column {
    width: 60px;
    min-width: 60px;
    max-width: 60px;
    text-align: center;
  }

  .weave-source-document-column {
    background: transparent;
  }

  .weave-source-document-column .weave-source-link {
    background: transparent !important;
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    overflow: hidden;
    color: color-mix(in srgb, var(--text-normal) 72%, var(--text-muted));
    padding: 0;
  }

  .weave-source-document-column .weave-source-link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .weave-text-content {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-size: 12px;
  }

  .weave-text-content-primary {
    color: var(--text-normal);
    font-size: 12px;
    font-weight: 600;
  }

  .weave-text-content-secondary {
    color: color-mix(in srgb, var(--text-normal) 72%, var(--text-muted));
    font-size: 12px;
  }

  .weave-text-content-meta {
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 500;
  }

  .weave-inline-chip {
    display: inline-flex;
    align-items: center;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 65%, transparent);
    background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 92%, transparent);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .weave-inline-chip--soft {
    color: color-mix(in srgb, var(--text-normal) 72%, var(--text-muted));
  }

  .weave-inline-chip--metric {
    font-variant-numeric: tabular-nums;
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--weave-table-surface-bg, var(--background-secondary)));
    border-color: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
  }

  .weave-field-template-chip,
  .weave-source-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 65%, transparent);
    background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 92%, transparent);
  }

  .weave-field-template-text,
  .weave-source-status-text {
    line-height: 1;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .weave-template-official {
    color: color-mix(in srgb, var(--color-green) 84%, var(--text-normal));
    border-color: color-mix(in srgb, var(--color-green) 22%, transparent);
    background: color-mix(in srgb, var(--color-green) 10%, var(--weave-table-surface-bg, var(--background-secondary)));
  }

  .weave-template-custom {
    color: color-mix(in srgb, var(--interactive-accent) 78%, var(--text-normal));
    border-color: color-mix(in srgb, var(--interactive-accent) 20%, transparent);
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--weave-table-surface-bg, var(--background-secondary)));
  }

  .weave-template-missing,
  .weave-template-unknown {
    color: var(--text-muted);
  }

  .weave-status-exists {
    color: color-mix(in srgb, var(--color-green) 84%, var(--text-normal));
    border-color: color-mix(in srgb, var(--color-green) 22%, transparent);
    background: color-mix(in srgb, var(--color-green) 10%, var(--weave-table-surface-bg, var(--background-secondary)));
  }

  .weave-status-deleted {
    color: color-mix(in srgb, var(--color-red) 82%, var(--text-normal));
    border-color: color-mix(in srgb, var(--color-red) 22%, transparent);
    background: color-mix(in srgb, var(--color-red) 10%, var(--weave-table-surface-bg, var(--background-secondary)));
  }

  .weave-status-none,
  .weave-status-unknown {
    color: var(--text-muted);
  }

  .weave-cell-content {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    overflow: hidden;
  }

  .weave-cell-content span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .weave-decks-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .weave-deck-badge {
    display: inline-flex;
    align-items: center;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: color-mix(in srgb, var(--text-normal) 76%, var(--text-muted));
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
  }

  .weave-deck-badge--memory {
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--weave-table-surface-bg, var(--background-secondary)));
    border-color: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
    color: color-mix(in srgb, var(--interactive-accent) 72%, var(--text-normal));
  }

  .weave-deck-badge--formal {
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--weave-table-surface-bg, var(--background-secondary)));
    border-color: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
    color: color-mix(in srgb, var(--interactive-accent) 72%, var(--text-normal));
  }

  .weave-deck-badge--emergent {
    background: color-mix(in srgb, var(--color-orange, #d97706) 10%, var(--weave-table-surface-bg, var(--background-secondary)));
    border-color: color-mix(in srgb, var(--color-orange, #d97706) 20%, transparent);
    color: color-mix(in srgb, var(--color-orange, #d97706) 82%, var(--text-normal));
  }

  .weave-table-row:hover .weave-deck-badge {
    transform: translateY(-1px);
  }

  .weave-deck-more {
    display: inline-flex;
    align-items: center;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 7px;
    background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 92%, transparent);
    color: var(--text-faint);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
  }

  .weave-state-badge {
    display: inline-flex;
    align-items: center;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .weave-state-new {
    background: color-mix(in srgb, var(--color-blue, var(--interactive-accent)) 15%, transparent);
    color: var(--color-blue, var(--interactive-accent));
  }

  .weave-state-learning {
    background: color-mix(in srgb, var(--color-orange, var(--interactive-accent)) 15%, transparent);
    color: var(--color-orange, var(--interactive-accent));
  }

  .weave-state-review {
    background: color-mix(in srgb, var(--color-green, var(--interactive-accent)) 15%, transparent);
    color: var(--color-green, var(--interactive-accent));
  }

  .weave-state-suspended {
    background: color-mix(in srgb, var(--color-gray, var(--text-muted)) 15%, transparent);
    color: var(--text-muted);
  }

  .weave-state-done {
    background: color-mix(in srgb, var(--color-purple, var(--interactive-accent)) 15%, transparent);
    color: var(--color-purple, var(--interactive-accent));
  }

  .weave-priority-badge {
    display: inline-flex;
    align-items: center;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .weave-priority-high {
    background: color-mix(in srgb, var(--color-red, var(--text-error)) 15%, transparent);
    color: var(--color-red, var(--text-error));
  }

  .weave-priority-medium {
    background: color-mix(in srgb, var(--color-yellow, var(--interactive-accent)) 15%, transparent);
    color: var(--color-yellow, var(--interactive-accent));
  }

  .weave-priority-low {
    background: color-mix(in srgb, var(--color-green, var(--interactive-accent)) 15%, transparent);
    color: var(--color-green, var(--interactive-accent));
  }

  .weave-ir-note-links {
    display: flex;
    gap: 4px;
    align-items: center;
    min-width: 0;
  }

  .weave-ir-note-link,
  .weave-ir-note-more {
    appearance: none;
    border: none;
    background: transparent;
    box-shadow: none;
    outline: none;
    padding: 0;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    border-radius: 0;
    transform: none;
  }

  .weave-ir-note-link {
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .weave-ir-note-more {
    display: inline-flex;
    align-items: center;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
  }

  .weave-ir-note-link:hover,
  .weave-ir-note-more:hover,
  .weave-ir-note-link:focus-visible,
  .weave-ir-note-more:focus-visible {
    color: var(--interactive-accent);
    text-decoration: underline;
    background: transparent;
    box-shadow: none;
  }

  @media (max-width: 768px) {
    .weave-table-row td {
      padding: 4px 10px;
    }

    .weave-table-row .weave-checkbox-column {
      width: 58px;
      min-width: 58px;
      max-width: 58px;
      padding: 4px 10px;
    }

    .weave-checkbox-cell {
      gap: 4px;
    }

    .weave-selection-order-badge {
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-size: 9px;
    }

    .weave-actions-column {
      width: 52px;
      min-width: 52px;
      max-width: 52px;
    }

    .weave-text-content-primary {
      font-size: 12px;
    }

    .weave-text-content-secondary,
    .weave-text-content {
      font-size: 11px;
    }

    .weave-text-content-meta,
    .weave-field-template-text,
    .weave-source-status-text {
      font-size: 10px;
    }

    .weave-inline-chip,
    .weave-field-template-chip,
    .weave-source-status-badge,
    .weave-deck-badge {
      min-height: 17px;
      padding: 0 5px;
    }

    .weave-inline-chip,
    .weave-deck-badge {
      font-size: 10px;
    }

    .weave-deck-more {
      padding: 2px 6px;
      font-size: 9px;
    }

    .weave-cell-content,
    .weave-decks-container,
    .weave-ir-note-links {
      gap: 3px;
    }

    .weave-source-document-column .weave-source-link {
      gap: 3px;
    }
  }
</style>
