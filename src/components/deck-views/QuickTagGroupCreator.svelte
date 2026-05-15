<script lang="ts">
  import { Notice } from 'obsidian';
  import type AnkiObsidianPlugin from '../../main';
  import {
    normalizeDeckTagGroupTags,
    normalizeDeckTagName,
    type DeckTagGroup
  } from '../../types/deck-kanban-types';
  import { untrack } from 'svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { tr } from '../../utils/i18n';

  interface Props {
    plugin: AnkiObsidianPlugin;
    editingTagGroup?: DeckTagGroup; // 可选的编辑模式
    onSave: (tagGroup: DeckTagGroup) => void;
    onCancel: () => void;
  }

  let { plugin, editingTagGroup, onSave, onCancel }: Props = $props();

  let t = $derived($tr);

  // 初始化时加载编辑数据
  let name = $state(untrack(() => editingTagGroup?.name || ''));
  let tags = $state<string[]>(untrack(() => normalizeDeckTagGroupTags(editingTagGroup?.tags || [])));
  let tagInput = $state('');
  let showSuggestions = $state(false);
  let allExistingTags = $state<string[]>([]);

  // 加载现有牌组标签
  $effect(() => {
    async function loadExistingTags() {
      const decks = await plugin.dataStorage.getDecks();
      const tagSet = new Set<string>();
      decks.forEach(deck => {
        if (deck.tags && deck.tags.length > 0) {
          deck.tags.forEach(tag => {
            const normalizedTag = normalizeDeckTagName(tag);
            if (normalizedTag) {
              tagSet.add(normalizedTag);
            }
          });
        }
      });
      allExistingTags = Array.from(tagSet).sort();
    }
    loadExistingTags();
  });

  // 过滤标签建议
  const filteredTags = $derived.by(() => {
    if (!tagInput) return [];
    const lower = tagInput.toLowerCase();
    const normalizedSelectedTags = new Set(tags.map((tag) => normalizeDeckTagName(tag)));
    return allExistingTags
      .filter(tag => tag.toLowerCase().includes(lower) && !normalizedSelectedTags.has(normalizeDeckTagName(tag)))
      .slice(0, 8);
  });

  // 添加标签
  function addTag(tag: string) {
    const normalizedTag = normalizeDeckTagName(tag);
    if (!normalizedTag) return;
    if (tags.some((existingTag) => normalizeDeckTagName(existingTag) === normalizedTag)) {
      new Notice(t('decks.tagGroupCreator.tagExists'));
      return;
    }
    tags = [...tags, normalizedTag];
    tagInput = '';
    showSuggestions = false;
  }

  // 移除标签
  function removeTag(index: number) {
    tags = tags.filter((_, i) => i !== index);
  }

  // 处理输入
  function handleTagInput(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTags.length > 0) {
        addTag(filteredTags[0]);
      } else if (tagInput.trim()) {
        addTag(tagInput);
      }
    } else if (e.key === 'Escape') {
      showSuggestions = false;
    }
  }

  // 保存
  function handleSave() {
    if (!name.trim()) {
      new Notice(t('decks.tagGroupCreator.nameRequired'));
      return;
    }
    const normalizedTags = normalizeDeckTagGroupTags(tags);
    if (normalizedTags.length === 0) {
      new Notice(t('decks.tagGroupCreator.tagRequired'));
      return;
    }

    const savedTagGroup: DeckTagGroup = {
      id: editingTagGroup?.id || `tag-group-${Date.now()}`, // 编辑模式保留原 ID
      name: name.trim(),
      tags: normalizedTags,
      icon: editingTagGroup?.icon,
      color: editingTagGroup?.color || '#3b82f6' // 保留原颜色
    };

    onSave(savedTagGroup);
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onCancel();
    }
  }
</script>

<div
  class="quick-creator-overlay"
  onclick={handleOverlayClick}
  onkeydown={handleOverlayKeydown}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div class="quick-creator-dialog">
    <div class="creator-header">
      <h3>{editingTagGroup ? t('decks.tagGroupCreator.titleEdit') : t('decks.tagGroupCreator.titleCreate')}</h3>
      <button class="close-btn" onclick={onCancel}>
        <EnhancedIcon name="x" size={18} />
      </button>
    </div>

    <div class="creator-body">
      <div class="form-field">
        <label for="quick-tag-group-name">{t('decks.tagGroupCreator.nameLabel')}</label>
        <input
          id="quick-tag-group-name"
          type="text"
          class="text-input"
          placeholder={t('decks.tagGroupCreator.namePlaceholder')}
          bind:value={name}
        />
      </div>

      <div class="form-field">
        <label for="quick-tag-group-tag-input">{t('decks.tagGroupCreator.tagsLabel')}</label>
        <div class="tag-container">
          {#if tags.length > 0}
            <div class="tag-chips">
              {#each tags as tag, i}
                <div class="tag-chip">
                  <span>{tag}</span>
                  <button class="remove-btn" onclick={() => removeTag(i)}>
                    <EnhancedIcon name="x" size={12} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          <div class="input-wrapper">
            <input
              id="quick-tag-group-tag-input"
              type="text"
              class="tag-input"
              placeholder={t('decks.tagGroupCreator.tagInputPlaceholder')}
              bind:value={tagInput}
              onkeydown={handleTagInput}
              onfocus={() => showSuggestions = true}
              onblur={() => setTimeout(() => showSuggestions = false, 200)}
            />

            {#if showSuggestions && filteredTags.length > 0}
              <div class="suggestions">
                {#each filteredTags as tag}
                  <button type="button" class="suggestion-item" onclick={() => addTag(tag)}>
                    {tag}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="hint">{t('decks.tagGroupCreator.tagHint')}</div>
      </div>
    </div>

    <div class="creator-footer">
      <button class="btn" onclick={onCancel}>{t('decks.tagGroupCreator.cancel')}</button>
      <button class="btn primary" onclick={handleSave}>{editingTagGroup ? t('decks.tagGroupCreator.save') : t('decks.tagGroupCreator.create')}</button>
    </div>
  </div>
</div>

<style>
  .quick-creator-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-popup);
    padding: 20px;
  }

  .quick-creator-dialog {
    width: 100%;
    max-width: 500px;
    background: var(--background-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
  }

  .creator-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .creator-header h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .creator-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-field label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .text-input {
    width: 100%;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    transition: border-color 0.2s;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .tag-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-secondary);
  }

  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    font-size: 12px;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .remove-btn:hover {
    background: var(--background-modifier-error);
    color: var(--text-error);
  }

  .input-wrapper {
    position: relative;
  }

  .tag-input {
    width: 100%;
    padding: 8px;
    font-size: 13px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .tag-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    max-height: 180px;
    overflow-y: auto;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: var(--weave-z-float);
  }

  .suggestion-item {
    padding: 8px 12px;
    font-size: 13px;
    color: var(--text-normal);
    cursor: pointer;
    transition: background 0.2s;
  }

  .suggestion-item:hover {
    background: var(--background-modifier-hover);
  }

  .hint {
    font-size: 11px;
    color: var(--text-muted);
  }

  .creator-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .btn {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .btn.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .btn.primary:hover {
    background: var(--interactive-accent-hover);
  }
</style>
