<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount } from "svelte";
  import type { WeavePlugin } from "../../main";
  import type { Deck } from "../../data/types";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import ObsidianDropdown from "../ui/ObsidianDropdown.svelte";
  import { Notice } from "obsidian";
  import { generateId } from "../../utils/helpers";
  import { tr } from "../../utils/i18n";

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    mode?: "create" | "edit";
    initialBank?: Deck;
    onClose: () => void;
    onCreated?: (bank: Deck) => void;
    onBankCreated?: (bank: Deck) => void | Promise<void>;
    onUpdated?: (bank: Deck) => void;
    onBankUpdated?: (bank: Deck) => void | Promise<void>;
  }

  let {
    open = $bindable(),
    plugin,
    mode = "create",
    initialBank,
    onClose,
    onCreated: legacyOnCreated,
    onBankCreated = legacyOnCreated,
    onUpdated: legacyOnUpdated,
    onBankUpdated = legacyOnUpdated
  }: Props = $props();
  let t = $derived($tr);

  // 表单状态
  let name = $state("");
  let description = $state("");
  let difficulty = $state<"easy" | "medium" | "hard">("medium");
  let tags = $state<string[]>([]);
  let tagInput = $state("");
  let category = $state("");

  // UI状态
  let isSubmitting = $state(false);
  let nameError = $state("");
  let modalEl: HTMLElement | null = $state(null);

  // 初始化编辑模式
  $effect(() => {
    if (mode === "edit" && initialBank) {
      name = initialBank.name;
      description = initialBank.description || "";
      // 类型守卫：确保difficulty是合法值
      const bankDifficulty = initialBank.metadata?.difficulty;
      if (bankDifficulty === "easy" || bankDifficulty === "medium" || bankDifficulty === "hard") {
        difficulty = bankDifficulty;
      } else {
        difficulty = "medium";
      }
      tags = [...(initialBank.tags || [])];
      category = initialBank.category || "";
    }
  });

  // 验证表单
  function validateForm(): boolean {
    nameError = "";

    if (!name.trim()) {
      nameError = t('study.questionBankUI.createBankModal.nameRequired');
      return false;
    }

    if (name.trim().length < 2) {
      nameError = t('study.questionBankUI.createBankModal.nameTooShort');
      return false;
    }

    return true;
  }

  // 添加标签
  function handleAddTag() {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      tags = [...tags, trimmedTag];
      tagInput = "";
    }
  }

  // 移除标签
  function removeTag(tag: string) {
    tags = tags.filter(t => t !== tag);
  }

  // 处理标签输入Enter键
  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  }

  async function notifyBankCreated(bank: Deck) {
    if (typeof onBankCreated === 'function') {
      await onBankCreated(bank);
    }
  }

  async function notifyBankUpdated(bank: Deck) {
    if (typeof onBankUpdated === 'function') {
      await onBankUpdated(bank);
    }
  }

  // 提交表单
  async function handleSubmit() {
    if (!validateForm()) {
      return;
    }

    // 检查服务是否初始化
    if (!plugin.questionBankService) {
      logger.error('[CreateQuestionBankModal] QuestionBankService 未初始化');
      new Notice(t('study.questionBankUI.createBankModal.serviceNotReady'));
      return;
    }

    isSubmitting = true;

    try {

      if (mode === "create") {
        // 创建新题库
        const newBank: Deck = {
          id: generateId(),
          name: name.trim(),
          description: description.trim() || '',
          category: category.trim() || '',
          categoryIds: [],
          parentId: undefined,
          path: name.trim(),
          level: 0,
          order: 0,
          inheritSettings: false,
          settings: {} as any,
          stats: {} as any,
          includeSubdecks: false,
          deckType: 'question-bank',
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          tags: tags.length > 0 ? tags : [],
          metadata: {
            difficulty: difficulty,
            questionCount: 0
          }
        };

        await plugin.questionBankService.createBank(newBank);
        new Notice(t('study.questionBankUI.createBankModal.createSuccess', { name: newBank.name }));

        await notifyBankCreated(newBank);
      } else if (mode === "edit" && initialBank) {
        // 更新题库
        const updatedBank: Deck = {
          ...initialBank,
          name: name.trim(),
          description: description.trim() || '',
          category: category.trim() || '',
          tags: tags.length > 0 ? tags : [],
          modified: new Date().toISOString(),
          metadata: {
            ...initialBank.metadata,
            difficulty: difficulty
          }
        };

        await plugin.questionBankService.updateBank(updatedBank);
        new Notice(t('study.questionBankUI.createBankModal.updateSuccess', { name: updatedBank.name }));

        await notifyBankUpdated(updatedBank);
      }

      handleClose();
    } catch (error) {
      logger.error("[CreateQuestionBankModal] Submit failed:", error);
      new Notice(
        mode === "create"
          ? t('study.questionBankUI.createBankModal.createFailed', { error: error instanceof Error ? error.message : t('study.editorModal.unknownError') })
          : t('study.questionBankUI.createBankModal.updateFailed', { error: error instanceof Error ? error.message : t('study.editorModal.unknownError') })
      );
    } finally {
      isSubmitting = false;
    }
  }

  // 关闭对话框
  function handleClose() {
    name = "";
    description = "";
    difficulty = "medium";
    tags = [];
    tagInput = "";
    category = "";
    nameError = "";
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  function handleKeydown(_e: KeyboardEvent) {
  }

  // 处理点击背景关闭
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === modalEl && !isSubmitting) {
      handleClose();
    }
  }

  // 组件挂载时聚焦名称输入框
  onMount(() => {
    if (modalEl) {
      const nameInput = modalEl.querySelector<HTMLInputElement>('input[name="name"]');
      if (nameInput) {
        nameInput.focus();
      }
    }
  });
</script>

{#if open}
  <div
    bind:this={modalEl}
    class="modal-backdrop"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="modal-container">
      <!-- 模态窗头部 -->
      <div class="modal-header">
        <h2 id="modal-title">
          {mode === "create" ? t('study.questionBankUI.createBankModal.titleCreate') : t('study.questionBankUI.createBankModal.titleEdit')}
        </h2>
        <button
          class="close-btn"
          onclick={handleClose}
          disabled={isSubmitting}
          aria-label={t('study.questionBankUI.createBankModal.close')}
        >
          <ObsidianIcon name="x" size={20} />
        </button>
      </div>

      <!-- 模态窗内容 -->
      <div class="modal-content">
        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <!-- 题库名称 -->
          <div class="form-group">
            <label for="bank-name" class="required">{t('study.questionBankUI.createBankModal.nameLabel')}</label>
            <input
              type="text"
              id="bank-name"
              name="name"
              bind:value={name}
              placeholder={t('study.questionBankUI.createBankModal.namePlaceholder')}
              class="form-input"
              class:error={nameError}
              disabled={isSubmitting}
              required
            />
            {#if nameError}
              <span class="error-message">{nameError}</span>
            {/if}
          </div>

          <!-- 题库描述 -->
          <div class="form-group">
            <label for="bank-description">{t('study.questionBankUI.createBankModal.descriptionLabel')}</label>
            <textarea
              id="bank-description"
              bind:value={description}
              placeholder={t('study.questionBankUI.createBankModal.descriptionPlaceholder')}
              class="form-textarea"
              disabled={isSubmitting}
              rows="3"
            ></textarea>
          </div>

          <!-- 难度级别 -->
          <div class="form-group">
            <label for="bank-difficulty">{t('study.questionBankUI.createBankModal.difficultyLabel')}</label>
            <ObsidianDropdown
              className="form-select"
              value={difficulty}
              disabled={isSubmitting}
              options={[
                { id: 'easy', label: t('study.questionBankUI.createBankModal.difficultyEasy') },
                { id: 'medium', label: t('study.questionBankUI.createBankModal.difficultyMedium') },
                { id: 'hard', label: t('study.questionBankUI.createBankModal.difficultyHard') }
              ]}
              onchange={(value) => {
                difficulty = value as any;
              }}
            />
          </div>

          <!-- 分类 -->
          <div class="form-group">
            <label for="bank-category">{t('study.questionBankUI.createBankModal.categoryLabel')}</label>
            <input
              type="text"
              id="bank-category"
              bind:value={category}
              placeholder={t('study.questionBankUI.createBankModal.categoryPlaceholder')}
              class="form-input"
              disabled={isSubmitting}
            />
          </div>

          <!-- 标签 -->
          <div class="form-group">
            <label for="bank-tags">{t('study.questionBankUI.createBankModal.tagsLabel')}</label>
            <div class="tags-input-container">
              <div class="tags-list">
                {#each tags as tag}
                  <span class="tag-item">
                    #{tag}
                    <button
                      type="button"
                      class="tag-remove"
                      onclick={() => removeTag(tag)}
                      disabled={isSubmitting}
                      aria-label={t('study.questionBankUI.createBankModal.removeTag')}
                    >
                      <ObsidianIcon name="x" size={12} />
                    </button>
                  </span>
                {/each}
              </div>
              <div class="tag-input-wrapper">
                <input
                  type="text"
                  id="bank-tags"
                  bind:value={tagInput}
                  onkeydown={handleTagKeydown}
                  placeholder={t('study.questionBankUI.createBankModal.tagPlaceholder')}
                  class="tag-input"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  class="tag-add-btn"
                  onclick={handleAddTag}
                  disabled={isSubmitting || !tagInput.trim()}
                >
                  <ObsidianIcon name="plus" size={16} />
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- 模态窗底部 -->
      <div class="modal-footer">
        <button
          class="btn-secondary"
          onclick={handleClose}
          disabled={isSubmitting}
        >
          {t('study.questionBankUI.createBankModal.cancel')}
        </button>
        <button
          class="btn-primary"
          onclick={handleSubmit}
          disabled={isSubmitting}
        >
          {#if isSubmitting}
            <span class="spinner"></span>
            {mode === "create" ? t('study.questionBankUI.createBankModal.creating') : t('study.questionBankUI.createBankModal.saving')}
          {:else}
            {mode === "create" ? t('study.questionBankUI.createBankModal.createAction') : t('study.questionBankUI.createBankModal.saveAction')}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* 模态窗背景 */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-top);
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 模态窗容器 */
  .modal-container {
    background: var(--background-primary);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 模态窗头部 */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s;
  }

  .close-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .close-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 模态窗内容 */
  .modal-content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
  }

  /* 表单组 */
  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  label.required::after {
    content: " *";
    color: #ef4444;
  }

  /* 表单输入 */
  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9rem;
    font-family: var(--font-interface);
    transition: all 0.2s;
  }

  :global(.obsidian-dropdown-trigger.form-select) {
    width: 100%;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9rem;
    font-family: var(--font-interface);
    min-height: 0;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  .form-input:disabled,
  .form-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-input.error {
    border-color: #ef4444;
  }

  .form-input.error:focus {
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
  }

  .form-textarea {
    resize: vertical;
    min-height: 80px;
  }

  .error-message {
    display: block;
    margin-top: 0.375rem;
    font-size: 0.8rem;
    color: #ef4444;
  }

  /* 标签输入 */
  .tags-input-container {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 0.5rem;
    background: var(--background-primary);
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .tags-list:empty {
    margin-bottom: 0;
  }

  .tag-item {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-on-accent);
    opacity: 0.8;
    transition: opacity 0.2s;
  }

  .tag-remove:hover:not(:disabled) {
    opacity: 1;
  }

  .tag-input-wrapper {
    display: flex;
    gap: 0.5rem;
  }

  .tag-input {
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: 4px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 0.85rem;
  }

  .tag-input:focus {
    outline: none;
    background: var(--background-modifier-hover);
  }

  .tag-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tag-add-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .tag-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 模态窗底部 */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .btn-secondary,
  .btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 100px;
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .btn-secondary:disabled,
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 加载动画 */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--text-on-accent);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* 响应式设计 */
  @media (max-width: 640px) {
    .modal-container {
      width: 95%;
      max-height: 90vh;
    }

    .modal-header,
    .modal-content,
    .modal-footer {
      padding: 1rem;
    }

    .modal-header h2 {
      font-size: 1.1rem;
    }

    .form-group {
      margin-bottom: 1rem;
    }
  }
</style>
