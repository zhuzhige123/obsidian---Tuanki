<script lang="ts">
  import { logger } from '../../utils/logger';
  import { focusManager } from '../../utils/focus-manager';

  import type { WeavePlugin } from "../../main";
  import type { Deck } from "../../data/types";
  import { Notice } from "obsidian";
  import { generateId } from "../../utils/helpers";
  import { tr } from "../../utils/i18n";

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    onClose: () => void;
    onCreated?: (bank: Deck) => void;
    onBankCreated?: (bank: Deck) => void | Promise<void>;
    useObsidianModal?: boolean;
  }

  let {
    open,
    plugin,
    onClose,
    onCreated: legacyOnCreated,
    onBankCreated = legacyOnCreated,
    useObsidianModal = false,
  }: Props = $props();

  let t = $derived($tr);

  let name = $state("");
  let selectedTag = $state("");
  let tagInput = $state("");
  let availableTags = $state<string[]>([]);
  let isSaving = $state(false);
  let nameInputRef: HTMLInputElement | null = $state(null);

  $effect(() => {
    if (open) {
      focusManager.saveFocus();

      void (async () => {
        try {
          name = "";
          selectedTag = "";
          tagInput = "";
          await loadAvailableTags();

          window.setTimeout(() => {
            nameInputRef?.focus();
          }, 100);
        } catch (error) {
          logger.error("[CreateQuestionBankModal] 初始化失败:", error);
          new Notice(t("study.questionBankUI.createBankModal.serviceNotReady"));
        }
      })();
    }
  });

  async function loadAvailableTags() {
    try {
      const banks = plugin.questionBankService
        ? await plugin.questionBankService.getAllBanks()
        : [];
      const allTags = new Set<string>();
      banks.forEach((bank) => {
        bank.tags?.forEach((tag) => allTags.add(tag));
      });
      availableTags = Array.from(allTags).sort();
    } catch (error) {
      logger.error("[CreateQuestionBankModal] 加载标签失败:", error);
      availableTags = [];
    }
  }

  function selectTag(tag: string) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) {
      return;
    }

    selectedTag = trimmedTag;
    tagInput = "";

    if (!availableTags.includes(trimmedTag)) {
      availableTags = [...availableTags, trimmedTag].sort();
    }
  }

  function handleTagInput(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (tagInput.trim()) {
        selectTag(tagInput);
      }
    } else if (event.key === "Backspace" && tagInput === "" && selectedTag) {
      event.preventDefault();
      selectedTag = "";
    }
  }

  function clearTag() {
    selectedTag = "";
  }

  async function notifyBankCreated(bank: Deck) {
    if (typeof onBankCreated === "function") {
      await onBankCreated(bank);
    }
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) {
      return;
    }

    if (trimmedName.length < 2) {
      new Notice(t("study.questionBankUI.createBankModal.nameTooShort"));
      return;
    }

    if (!plugin.questionBankService) {
      logger.error("[CreateQuestionBankModal] QuestionBankService 未初始化");
      new Notice(t("study.questionBankUI.createBankModal.serviceNotReady"));
      return;
    }

    isSaving = true;

    try {
      const newBank: Deck = {
        id: generateId(),
        name: trimmedName,
        description: "",
        category: "",
        categoryIds: [],
        parentId: undefined,
        path: trimmedName,
        level: 0,
        order: 0,
        inheritSettings: false,
        settings: {} as Deck["settings"],
        stats: {} as Deck["stats"],
        includeSubdecks: false,
        deckType: "question-bank",
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        tags: selectedTag ? [selectedTag] : [],
        metadata: {
          difficulty: "medium",
          questionCount: 0,
        },
      };

      const createdBank = await plugin.questionBankService.createBank(newBank);
      new Notice(t("study.questionBankUI.createBankModal.createSuccess", { name: createdBank.name }));
      await notifyBankCreated(createdBank);
      closeModal();
    } catch (error) {
      logger.error("[CreateQuestionBankModal] Submit failed:", error);
      new Notice(
        t("study.questionBankUI.createBankModal.createFailed", {
          error: error instanceof Error ? error.message : t("cards.editorModal.unknownError"),
        })
      );
    } finally {
      isSaving = false;
    }
  }

  function closeModal() {
    name = "";
    selectedTag = "";
    tagInput = "";
    focusManager.restoreFocus();
    onClose();
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeModal();
    }
  }
</script>

{#snippet modalContent()}
  {#if !useObsidianModal}
    <div class="modal-header">
      <h3>{t("study.questionBankUI.createBankModal.titleCreate")}</h3>
      <button class="icon-btn" aria-label={t("study.questionBankUI.createBankModal.close")} onclick={closeModal}>×</button>
    </div>
  {/if}

  <div class="weave-deck-edit-form">
    <label class="weave-deck-edit-field">
      <span class="weave-deck-edit-field-label">{t("study.questionBankUI.createBankModal.nameLabel")}</span>
      <input
        class="weave-deck-edit-input"
        placeholder={t("study.questionBankUI.createBankModal.namePlaceholder")}
        bind:value={name}
        bind:this={nameInputRef}
      />
    </label>

    <label class="weave-deck-edit-field">
      <span class="weave-deck-edit-field-label">{t("study.questionBankUI.createBankModal.tagsLabel")}</span>
      <div class="weave-deck-edit-tag-input-wrapper">
        {#if selectedTag}
          <div class="weave-deck-edit-selected-tags">
            <span class="weave-deck-edit-tag-chip">
              <span>{selectedTag}</span>
              <button
                type="button"
                class="weave-deck-edit-tag-chip-remove"
                onclick={clearTag}
                aria-label={t("study.questionBankUI.createBankModal.removeTag")}
              >
                ×
              </button>
            </span>
          </div>
        {/if}
        <input
          class="weave-deck-edit-tag-input"
          placeholder={selectedTag ? "" : t("study.questionBankUI.createBankModal.tagPlaceholder")}
          bind:value={tagInput}
          onkeydown={handleTagInput}
        />
      </div>

      {#if availableTags.length > 0}
        <div class="weave-deck-edit-available-tags">
          <div class="weave-deck-edit-available-tags-title">{t("modals.createDeck.availableTags")}</div>
          <div class="weave-deck-edit-available-tags-list">
            {#each availableTags as tag}
              <button
                type="button"
                class="weave-deck-edit-available-tag-item {selectedTag === tag ? 'selected' : ''}"
                onclick={() => selectTag(tag)}
              >
                {tag}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <span class="weave-deck-edit-hint">{t("deckStudyPage.edit.tagDesc")}</span>
    </label>
  </div>

  <div class="weave-deck-edit-footer">
    <button class="weave-deck-edit-btn" onclick={closeModal}>{t("study.questionBankUI.createBankModal.cancel")}</button>
    <button
      class="weave-deck-edit-btn weave-deck-edit-btn-primary"
      disabled={!name.trim() || isSaving}
      onclick={handleSubmit}
    >
      {t("study.questionBankUI.createBankModal.createAction")}
    </button>
  </div>
{/snippet}

{#if open}
  {#if useObsidianModal}
    <div class="modal modal-native" role="dialog" aria-modal="true" tabindex="0">
      {@render modalContent()}
    </div>
  {:else}
    <div class="modal-overlay" role="presentation" onclick={handleOverlayClick} onkeydown={handleOverlayKeydown} tabindex="-1">
      <div class="modal" role="dialog" aria-modal="true" tabindex="0">
        {@render modalContent()}
      </div>
    </div>
  {/if}
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-top);
  }

  .modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    width: 520px;
    max-width: calc(100vw - 2rem);
    box-shadow: var(--anki-shadow-2xl);
    display: flex;
    flex-direction: column;
    z-index: calc(var(--weave-z-top) + 1);
  }

  .modal-native {
    width: 100%;
    max-width: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.5rem;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
  }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.25rem;
    cursor: pointer;
  }

  .icon-btn:hover {
    color: var(--text-normal);
  }
</style>
