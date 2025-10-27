<script lang="ts">
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import TagMultiSelect from "../../../ui/TagMultiSelect.svelte";
  import { getTagColor } from "../../utils/table-utils";
  import type { TagsCellProps } from "../../types/table-types";

  let { card, onTagsUpdate, availableTags = [] }: TagsCellProps = $props();

  let isEditing = $state(false);

  function startEditing() {
    isEditing = true;
  }

  function cancelEditing() {
    isEditing = false;
  }

  function handleTagsChange(event: CustomEvent<string[]>) {
    if (!onTagsUpdate) return;
    onTagsUpdate(card.id, event.detail);
    cancelEditing();
  }
</script>

<td class="tuanki-tags-column" onclick={startEditing}>
  {#if isEditing}
    <!-- 编辑模式 - Notion风格标签选择器 -->
    <div 
      class="tuanki-tags-select-container" 
      role="button"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && cancelEditing()}
    >
      <TagMultiSelect
        selected={card.tags || []}
        options={availableTags}
        placeholder="添加标签..."
        size="sm"
        on:change={handleTagsChange}
      />
    </div>
  {:else}
    <!-- 显示模式 -->
    <button
      class="tuanki-tags-container"
      onclick={startEditing}
      onkeydown={(e) => e.key === 'Enter' && startEditing()}
      aria-label="编辑标签"
      type="button"
    >
      {#if card.tags && card.tags.length > 0}
        {#each card.tags.slice(0, 2) as tag}
          <span class="tuanki-tag tuanki-tag-{getTagColor(tag)}">{tag}</span>
        {/each}
        {#if card.tags.length > 2}
          <span class="tuanki-tags-more">+{card.tags.length - 2}</span>
        {/if}
      {:else}
        <span class="tuanki-text-muted tuanki-tags-placeholder">点击添加标签</span>
      {/if}
      <div class="tuanki-tags-edit-hint">
        <EnhancedIcon name="edit" size={12} />
      </div>
    </button>
  {/if}
</td>

<style>
  .tuanki-tags-column {
    min-width: 150px;
    max-width: 200px;
  }

  .tuanki-tags-container {
    position: relative;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 6px;
    padding: 4px;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
    background: transparent;
    border: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
  }

  .tuanki-tags-container:hover {
    background: var(--background-modifier-hover);
  }

  .tuanki-tags-container:hover .tuanki-tags-edit-hint {
    opacity: 1;
  }

  .tuanki-tags-edit-hint {
    opacity: 0;
    transition: opacity 0.2s ease;
    color: var(--text-muted);
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
  }

  .tuanki-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tuanki-tag-blue { background: rgba(59, 130, 246, 0.15); color: rgb(59, 130, 246); }
  .tuanki-tag-green { background: rgba(16, 185, 129, 0.15); color: rgb(16, 185, 129); }
  .tuanki-tag-purple { background: rgba(139, 92, 246, 0.15); color: rgb(139, 92, 246); }
  .tuanki-tag-orange { background: rgba(249, 115, 22, 0.15); color: rgb(249, 115, 22); }
  .tuanki-tag-pink { background: rgba(236, 72, 153, 0.15); color: rgb(236, 72, 153); }
  .tuanki-tag-cyan { background: rgba(6, 182, 212, 0.15); color: rgb(6, 182, 212); }
  .tuanki-tag-red { background: rgba(239, 68, 68, 0.15); color: rgb(239, 68, 68); }
  .tuanki-tag-yellow { background: rgba(234, 179, 8, 0.15); color: rgb(234, 179, 8); }

  .tuanki-tags-more {
    font-size: 0.7rem;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    padding: 2px 4px;
    border-radius: 8px;
    font-weight: 500;
  }

  .tuanki-tags-placeholder {
    font-size: 0.8rem;
    color: var(--text-faint) !important;
    font-style: italic;
  }

  .tuanki-tags-select-container {
    width: 100%;
    padding: 2px;
  }

  .tuanki-text-muted {
    color: var(--text-muted);
  }
</style>

