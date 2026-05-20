<script lang="ts">
  import { Menu, Notice, TFile } from 'obsidian';
  import { untrack } from 'svelte';
  import type { CustomSystemPrompt, GenerationConfig } from '../../types/ai-types';
  import type { WeavePlugin } from '../../main';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { PromptBuilderService } from '../../services/ai/PromptBuilderService';
  import {
    createUserPromptFile,
    getUserPromptFolderPath,
    getUserPromptRelativePath,
    listUserPromptFiles,
    resolveUserPromptFile
  } from '../../services/ai/UserPromptFileService';
  import { OFFICIAL_SYSTEM_PROMPTS, getOfficialSystemPromptById } from '../../constants/official-system-prompts';
  import { showObsidianConfirm } from '../../utils/obsidian-confirm';
  import { focusManager } from '../../utils/focus-manager';
  import { tr } from '../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
    config: GenerationConfig;
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: GenerationConfig) => void;
    useObsidianModal?: boolean;
  }

  interface PromptDraft {
    name: string;
    content: string;
  }

  type PromptTab = 'system' | 'user';

  const NEW_PROMPT_ID = '__new_system_prompt__';
  const AI_CONFIG_USER_PROMPT_SELECT_MENU_CLASS = 'weave-ai-config-user-prompt-select-menu';

  let { plugin, config, isOpen, onClose, onSave, useObsidianModal = false }: Props = $props();
  let t = $derived($tr);

  let modalEl = $state<HTMLElement | null>(null);
  let lastTrapEl: HTMLElement | null = null;
  let wasOpen = false;

  let localConfig = $state<GenerationConfig>(untrack(() => ({ ...config })));
  let activeTab = $state<PromptTab>('system');

  let customSystemPrompts = $state<CustomSystemPrompt[]>([]);
  let selectedSystemPromptId = $state<string | null>(null);
  let editingSystemPromptId = $state<string | null>(null);
  let draftPrompt = $state<PromptDraft>({ name: '', content: '' });

  let userPromptFiles = $state<TFile[]>([]);
  let selectedUserPromptPath = $state<string | null>(null);
  let userPromptContent = $state('');
  let userPromptFolderPath = $state('');

  const isEditing = $derived.by(() => editingSystemPromptId !== null);
  const activeCustomSystemPrompt = $derived.by(() => {
    if (!selectedSystemPromptId) return null;
    return customSystemPrompts.find((prompt) => prompt.id === selectedSystemPromptId) ?? null;
  });
  const selectedPromptName = $derived.by(() => {
    if (!selectedSystemPromptId) return t('aiAssistant.configModal.builtinSystemPrompt');
    const officialPrompt = getOfficialSystemPromptById(selectedSystemPromptId);
    if (officialPrompt) return officialPrompt.name;
    return activeCustomSystemPrompt?.name ?? t('aiAssistant.configModal.builtinSystemPrompt');
  });
  const selectedPromptTypeLabel = $derived.by(() => {
    if (!selectedSystemPromptId) return t('aiAssistant.configModal.builtin');
    if (getOfficialSystemPromptById(selectedSystemPromptId)) return t('aiAssistant.configModal.official');
    return t('aiAssistant.configModal.custom');
  });
  const currentSystemPrompt = $derived.by(() => {
    if (selectedSystemPromptId) {
      const officialPrompt = getOfficialSystemPromptById(selectedSystemPromptId);
      if (officialPrompt) {
        return PromptBuilderService.replaceVariables(officialPrompt.content, localConfig);
      }

      const customPrompt = customSystemPrompts.find((prompt) => prompt.id === selectedSystemPromptId);
      if (customPrompt) return customPrompt.content;
    }

    return PromptBuilderService.getBuiltinSystemPrompt(localConfig);
  });
  const displayedPromptContent = $derived.by(() => (isEditing ? draftPrompt.content : currentSystemPrompt));
  const canCreatePrompt = $derived.by(() => customSystemPrompts.length < 5);
  const canSaveDraft = $derived.by(() => draftPrompt.name.trim().length > 0 && draftPrompt.content.trim().length > 0);
  const selectedUserPromptFile = $derived.by(() => {
    if (!selectedUserPromptPath) return null;
    return userPromptFiles.find((file) => file.path === selectedUserPromptPath) ?? null;
  });
  const selectedUserPromptName = $derived.by(() => {
    if (!selectedUserPromptFile) return t('aiAssistant.configModal.noUserPromptFileSelected');
    return getUserPromptRelativePath(plugin.app, selectedUserPromptFile.path);
  });

  $effect(() => {
    if (isOpen && !wasOpen) {
      focusManager.saveFocus();
      setTimeout(() => {
        if (!modalEl) return;
        lastTrapEl = modalEl;
        const firstFocusable = modalEl.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) as HTMLElement | null;
        focusManager.trapFocus(modalEl, firstFocusable ?? undefined);
      }, 0);
    } else if (!isOpen && wasOpen) {
      if (lastTrapEl) {
        focusManager.releaseTrap(lastTrapEl);
      }
      focusManager.restoreFocus();
      lastTrapEl = null;
    }

    wasOpen = isOpen;
  });

  $effect(() => {
    if (!isOpen) return;

    localConfig = { ...config };
    activeTab = 'system';

    customSystemPrompts = plugin.settings.aiConfig?.systemPromptConfig?.customSystemPrompts ?? [];
    selectedSystemPromptId = plugin.settings.aiConfig?.systemPromptConfig?.selectedSystemPromptId ?? null;
    userPromptFolderPath = getUserPromptFolderPath(plugin.app);

    resetDraft();
    void refreshUserPromptFiles(plugin.getAIAssistantPreferences().lastSelectedPromptFilePath ?? null);
  });

  function ensureSystemPromptConfig() {
    const aiConfig =
      plugin.settings.aiConfig ?? (plugin.settings.aiConfig = {} as NonNullable<typeof plugin.settings.aiConfig>);

    if (!aiConfig.systemPromptConfig) {
      aiConfig.systemPromptConfig = {
        useBuiltin: true,
        customPrompt: '',
        customSystemPrompts: [],
        selectedSystemPromptId: undefined
      };
    }

    return aiConfig.systemPromptConfig;
  }

  function resetDraft() {
    editingSystemPromptId = null;
    draftPrompt = { name: '', content: '' };
  }

  async function persistSystemPromptState() {
    const systemPromptConfig = ensureSystemPromptConfig();
    systemPromptConfig.customSystemPrompts = customSystemPrompts;
    systemPromptConfig.selectedSystemPromptId = selectedSystemPromptId ?? undefined;
    await plugin.saveSettings();
  }

  async function selectSystemPrompt(id: string | null) {
    selectedSystemPromptId = id;
    await persistSystemPromptState();
  }

  function startCreatePrompt() {
    if (!canCreatePrompt) {
      new Notice(t('aiAssistant.configModal.maxCustomPrompts'));
      return;
    }

    editingSystemPromptId = NEW_PROMPT_ID;
    draftPrompt = {
      name: t('aiAssistant.configModal.newSystemPrompt'),
      content: currentSystemPrompt
    };
  }

  function startEditPrompt(promptId: string) {
    const prompt = customSystemPrompts.find((item) => item.id === promptId);
    if (!prompt) return;

    selectedSystemPromptId = prompt.id;
    editingSystemPromptId = prompt.id;
    draftPrompt = {
      name: prompt.name,
      content: prompt.content
    };
  }

  async function saveEditingPrompt() {
    if (!canSaveDraft) {
      new Notice(t('aiAssistant.configModal.enterSystemPromptNameAndContent'));
      return;
    }

    if (editingSystemPromptId === NEW_PROMPT_ID) {
      const newPrompt: CustomSystemPrompt = {
        id: `custom-system-prompt-${Date.now()}`,
        name: draftPrompt.name.trim(),
        content: draftPrompt.content.trim(),
        description: '',
        createdAt: new Date().toISOString()
      };

      customSystemPrompts = [...customSystemPrompts, newPrompt];
      selectedSystemPromptId = newPrompt.id;
      await persistSystemPromptState();
      resetDraft();
      new Notice(t('aiAssistant.configModal.systemPromptAdded'));
      return;
    }

    customSystemPrompts = customSystemPrompts.map((prompt) =>
      prompt.id === editingSystemPromptId
        ? {
            ...prompt,
            name: draftPrompt.name.trim(),
            content: draftPrompt.content.trim(),
            updatedAt: new Date().toISOString()
          }
        : prompt
    );

    selectedSystemPromptId = editingSystemPromptId;
    await persistSystemPromptState();
    resetDraft();
    new Notice(t('aiAssistant.configModal.systemPromptSaved'));
  }

  function cancelEditingPrompt() {
    resetDraft();
  }

  async function deleteSystemPrompt(promptId: string) {
    const prompt = customSystemPrompts.find((item) => item.id === promptId);
    if (!prompt) return;

    const confirmed = await showObsidianConfirm(plugin.app, t('aiAssistant.configModal.confirmDeletePrompt', { name: prompt.name }), {
      title: t('aiAssistant.configModal.confirmDeleteTitle')
    });
    if (!confirmed) return;

    customSystemPrompts = customSystemPrompts.filter((item) => item.id !== promptId);
    if (selectedSystemPromptId === promptId) {
      selectedSystemPromptId = null;
    }
    if (editingSystemPromptId === promptId) {
      resetDraft();
    }

    await persistSystemPromptState();
    new Notice(t('aiAssistant.configModal.deletedPrompt', { name: prompt.name }));
  }

  function copySystemPromptToClipboard() {
    navigator.clipboard
      .writeText(displayedPromptContent)
      .then(() => new Notice(t('aiAssistant.configModal.copiedToClipboard')))
      .catch(() => new Notice(t('aiAssistant.configModal.copyFailed')));
  }

  function showMenuAtTrigger(menu: Menu, trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const ownerDocument = trigger.ownerDocument ?? document;
    menu.showAtPosition(
      {
        x: Math.round(rect.left),
        y: Math.round(rect.bottom + 6)
      },
      ownerDocument
    );
  }

  function attachMenuClass(menu: Menu, className: string) {
    const extendedMenu = menu as unknown as { dom?: HTMLElement };
    const applyClass = () => {
      extendedMenu.dom?.classList.add(className);
    };
    applyClass();
    requestAnimationFrame(applyClass);
    setTimeout(applyClass, 0);
  }

  function openSystemPromptSelectMenu(event: MouseEvent) {
    if (isEditing) {
      new Notice(t('aiAssistant.configModal.saveOrCancelEditingFirst'));
      return;
    }

    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.builtinSystemPrompt'))
        .setChecked(!selectedSystemPromptId)
        .onClick(() => {
          void selectSystemPrompt(null);
        });
    });

    if (OFFICIAL_SYSTEM_PROMPTS.length > 0) {
      menu.addSeparator();
      OFFICIAL_SYSTEM_PROMPTS.forEach((prompt) => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setChecked(selectedSystemPromptId === prompt.id)
            .onClick(() => {
              void selectSystemPrompt(prompt.id);
            });
        });
      });
    }

    if (customSystemPrompts.length > 0) {
      menu.addSeparator();
      customSystemPrompts.forEach((prompt) => {
        menu.addItem((item) => {
          item
            .setTitle(prompt.name)
            .setChecked(selectedSystemPromptId === prompt.id)
            .onClick(() => {
              void selectSystemPrompt(prompt.id);
            });
        });
      });
    }

    showMenuAtTrigger(menu, trigger);
  }

  function openSystemPromptActionsMenu(event: MouseEvent) {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;

    const menu = new Menu();

    if (isEditing) {
      menu.addItem((item) => {
        item
          .setTitle(t('aiAssistant.configModal.menuSave'))
          .setIcon('check')
          .setDisabled(!canSaveDraft)
          .onClick(() => {
            void saveEditingPrompt();
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(t('aiAssistant.configModal.menuCancelEdit'))
          .setIcon('x')
          .onClick(() => {
            cancelEditingPrompt();
          });
      });

      menu.addSeparator();
    }

    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.menuNew'))
        .setIcon('plus')
        .setDisabled(!canCreatePrompt || isEditing)
        .onClick(() => {
          startCreatePrompt();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.menuCopy'))
        .setIcon('copy')
        .onClick(() => {
          copySystemPromptToClipboard();
        });
    });

    if (activeCustomSystemPrompt && !isEditing) {
      menu.addSeparator();

      menu.addItem((item) => {
        item
          .setTitle(t('aiAssistant.configModal.menuEdit'))
          .setIcon('edit')
          .onClick(() => {
            startEditPrompt(activeCustomSystemPrompt.id);
          });
      });

      menu.addItem((item) => {
        item
          .setTitle(t('aiAssistant.configModal.menuDelete'))
          .setIcon('trash')
          .onClick(() => {
            void deleteSystemPrompt(activeCustomSystemPrompt.id);
          });
      });
    }

    showMenuAtTrigger(menu, trigger);
  }

  async function refreshUserPromptFiles(preferredPath?: string | null) {
    try {
      const files = await listUserPromptFiles(plugin.app);
      userPromptFiles = files;

      let nextPath = preferredPath ?? selectedUserPromptPath;
      if (!nextPath || !files.some((file) => file.path === nextPath)) {
        nextPath = files[0]?.path ?? null;
      }

      if (!nextPath) {
        selectedUserPromptPath = null;
        userPromptContent = '';
        await persistUserPromptSelection(null);
        return;
      }

      const file = resolveUserPromptFile(plugin.app, nextPath);
      if (!file) {
        selectedUserPromptPath = null;
        userPromptContent = '';
        await persistUserPromptSelection(null);
        return;
      }

      selectedUserPromptPath = file.path;
      userPromptContent = await plugin.app.vault.read(file);
      await persistUserPromptSelection(file.path);
    } catch (error) {
      new Notice(t('aiAssistant.configModal.loadUserPromptFilesFailed'));
      console.error('[AIConfigModal] Failed to refresh user prompt files:', error);
    }
  }

  async function persistUserPromptSelection(path: string | null) {
    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      lastSelectedPromptFilePath: path ?? undefined
    });
  }

  function notifyUserPromptFilesChanged(path?: string | null) {
    window.dispatchEvent(
      new CustomEvent('Weave:ai-user-prompt-files-changed', {
        detail: { path: path ?? null }
      })
    );
  }

  async function selectUserPromptFile(path: string) {
    const file = resolveUserPromptFile(plugin.app, path);
    if (!file) {
      await refreshUserPromptFiles();
      new Notice(t('aiAssistant.configModal.userPromptFileMissingOrOutsideFolder'));
      return;
    }

    selectedUserPromptPath = file.path;
    userPromptContent = await plugin.app.vault.read(file);
    await persistUserPromptSelection(file.path);
  }

  async function createUserPromptTemplateFile() {
    try {
      const created = await createUserPromptFile(plugin.app);
      await refreshUserPromptFiles(created.path);
      notifyUserPromptFilesChanged(created.path);
      new Notice(t('aiAssistant.configModal.userPromptFileCreated'));
    } catch (error) {
      new Notice(t('aiAssistant.configModal.createUserPromptFileFailed'));
      console.error('[AIConfigModal] Failed to create user prompt file:', error);
    }
  }

  async function saveUserPromptTemplateFile() {
    if (!selectedUserPromptPath) {
      new Notice(t('aiAssistant.configModal.selectUserPromptFileFirst'));
      return;
    }

    const file = resolveUserPromptFile(plugin.app, selectedUserPromptPath);
    if (!file) {
      await refreshUserPromptFiles();
      new Notice(t('aiAssistant.configModal.userPromptFileMissingOrMoved'));
      return;
    }

    try {
      await plugin.app.vault.modify(file, userPromptContent);
      await refreshUserPromptFiles(file.path);
      notifyUserPromptFilesChanged(file.path);
      new Notice(t('aiAssistant.configModal.userPromptFileSaved'));
    } catch (error) {
      new Notice(t('aiAssistant.configModal.saveUserPromptFileFailed'));
      console.error('[AIConfigModal] Failed to save user prompt file:', error);
    }
  }

  async function deleteUserPromptTemplateFile() {
    if (!selectedUserPromptFile) {
      new Notice(t('aiAssistant.configModal.selectUserPromptFileFirst'));
      return;
    }

    const confirmed = await showObsidianConfirm(plugin.app, t('aiAssistant.configModal.confirmDeletePrompt', { name: selectedUserPromptFile.name }), {
      title: t('aiAssistant.configModal.confirmDeleteTitle')
    });
    if (!confirmed) return;

    try {
      const deletedPath = selectedUserPromptFile.path;
      await plugin.app.fileManager.trashFile(selectedUserPromptFile);
      await refreshUserPromptFiles();
      notifyUserPromptFilesChanged(deletedPath);
      new Notice(t('aiAssistant.configModal.deletedPrompt', { name: selectedUserPromptFile.name }));
    } catch (error) {
      new Notice(t('aiAssistant.configModal.deleteUserPromptFileFailed'));
      console.error('[AIConfigModal] Failed to delete user prompt file:', error);
    }
  }

  function openUserPromptSelectMenu(event: MouseEvent) {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;

    const menu = new Menu();

    if (userPromptFiles.length === 0) {
      menu.addItem((item) => item.setTitle(t('aiAssistant.configModal.noUserPromptFilesInFolder')).setDisabled(true));
    } else {
      userPromptFiles.forEach((file) => {
        menu.addItem((item) => {
          item
            .setTitle(getUserPromptRelativePath(plugin.app, file.path))
            .setChecked(selectedUserPromptPath === file.path)
            .onClick(() => {
              void selectUserPromptFile(file.path);
            });
        });
      });
    }

    showMenuAtTrigger(menu, trigger);
    attachMenuClass(menu, AI_CONFIG_USER_PROMPT_SELECT_MENU_CLASS);
  }

  function openUserPromptActionsMenu(event: MouseEvent) {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) return;

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.menuNew'))
        .setIcon('plus')
        .onClick(() => {
          void createUserPromptTemplateFile();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.menuSave'))
        .setIcon('check')
        .setDisabled(!selectedUserPromptFile)
        .onClick(() => {
          void saveUserPromptTemplateFile();
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.menuRefresh'))
        .setIcon('refresh-cw')
        .onClick(() => {
          void refreshUserPromptFiles();
        });
    });

    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle(t('aiAssistant.configModal.menuDelete'))
        .setIcon('trash')
        .setDisabled(!selectedUserPromptFile)
        .onClick(() => {
          void deleteUserPromptTemplateFile();
        });
    });

    showMenuAtTrigger(menu, trigger);
  }
</script>

{#snippet modalContent(nativeMode: boolean)}
  <div class="ai-config-modal" class:ai-config-modal-native={nativeMode} bind:this={modalEl} role="dialog" tabindex="-1">
    {#if !nativeMode}
      <div class="modal-header">
        <div class="modal-title">{t('aiAssistant.configModal.title')}</div>
        <button class="modal-close-btn" type="button" onclick={onClose} aria-label={t('aiAssistant.configModal.close')}>
          <ObsidianIcon name="x" size={18} />
        </button>
      </div>
    {/if}

    <div class="prompt-shell">
      <div class="prompt-tabs" role="tablist" aria-label={t('aiAssistant.configModal.tabList')}>
        <button
          type="button"
          class="prompt-tab"
          role="tab"
          class:active={activeTab === 'system'}
          aria-selected={activeTab === 'system'}
          onclick={() => activeTab = 'system'}
        >
          {t('aiAssistant.configModal.systemTab')}
        </button>
        <button
          type="button"
          class="prompt-tab"
          role="tab"
          class:active={activeTab === 'user'}
          aria-selected={activeTab === 'user'}
          onclick={() => activeTab = 'user'}
        >
          {t('aiAssistant.configModal.userTab')}
        </button>
      </div>

      {#if activeTab === 'system'}
        <div class="prompt-toolbar">
          <button
            type="button"
            class="toolbar-text-trigger primary-trigger"
            onclick={openSystemPromptSelectMenu}
            title={t('aiAssistant.configModal.systemPromptListTitle', { name: selectedPromptName })}
            aria-label={t('aiAssistant.configModal.systemPromptList')}
          >
            <span class="trigger-label">{selectedPromptName}</span>
            <ObsidianIcon name="chevron-down" size={14} />
          </button>

          <button
            type="button"
            class="toolbar-text-trigger secondary-trigger"
            onclick={openSystemPromptActionsMenu}
            title={t('aiAssistant.configModal.moreActions')}
            aria-label={t('aiAssistant.configModal.moreActions')}
          >
            <span class="trigger-label">{t('aiAssistant.configModal.moreActions')}</span>
            <ObsidianIcon name="chevron-down" size={14} />
          </button>
        </div>

        <div class="prompt-editor-shell" class:is-editing={isEditing}>
          <div class="prompt-editor-head">
            <div class="prompt-meta">
              <span class="prompt-meta-type">{selectedPromptTypeLabel}</span>
              <span class="prompt-meta-name">{isEditing
                ? (editingSystemPromptId === NEW_PROMPT_ID
                  ? t('aiAssistant.configModal.newSystemPromptLabel')
                  : t('aiAssistant.configModal.editSystemPromptLabel'))
                : selectedPromptName}</span>
            </div>
            {#if isEditing}
              <div class="prompt-meta-tip">{t('aiAssistant.configModal.saveOrCancelHint')}</div>
            {/if}
          </div>

          {#if isEditing}
            <div class="editing-layout">
              <input
                class="prompt-name-input"
                type="text"
                value={draftPrompt.name}
                oninput={(event) => {
                  draftPrompt = {
                    ...draftPrompt,
                    name: (event.currentTarget as HTMLInputElement).value
                  };
                }}
                placeholder={t('aiAssistant.configModal.systemPromptNamePlaceholder')}
              />
              <textarea
                class="prompt-content-editor"
                value={draftPrompt.content}
                oninput={(event) => {
                  draftPrompt = {
                    ...draftPrompt,
                    content: (event.currentTarget as HTMLTextAreaElement).value
                  };
                }}
                placeholder={t('aiAssistant.configModal.systemPromptContentPlaceholder')}
                rows="18"
              ></textarea>
            </div>
          {:else}
            <pre class="prompt-preview">{displayedPromptContent}</pre>
          {/if}
        </div>
      {:else}
        <div class="prompt-toolbar">
          <button
            type="button"
            class="toolbar-text-trigger primary-trigger"
            onclick={openUserPromptSelectMenu}
            title={t('aiAssistant.configModal.userPromptListTitle', { name: selectedUserPromptName })}
            aria-label={t('aiAssistant.configModal.userPromptList')}
          >
            <span class="trigger-label">{selectedUserPromptName}</span>
            <ObsidianIcon name="chevron-down" size={14} />
          </button>

          <button
            type="button"
            class="toolbar-text-trigger secondary-trigger"
            onclick={openUserPromptActionsMenu}
            title={t('aiAssistant.configModal.moreActions')}
            aria-label={t('aiAssistant.configModal.moreActions')}
          >
            <span class="trigger-label">{t('aiAssistant.configModal.moreActions')}</span>
            <ObsidianIcon name="chevron-down" size={14} />
          </button>
        </div>

        <div class="prompt-editor-shell is-editing">
          <div class="prompt-editor-head">
            <div class="prompt-meta">
              <span class="prompt-meta-type">{t('aiAssistant.configModal.userPromptType')}</span>
              <span class="prompt-meta-name">{selectedUserPromptName}</span>
            </div>
            <div class="prompt-meta-tip prompt-meta-tip-path">{userPromptFolderPath}</div>
          </div>

          {#if selectedUserPromptFile}
            <div class="editing-layout">
              <input
                class="prompt-name-input"
                type="text"
                value={selectedUserPromptFile.name}
                readonly
              />
              <textarea
                class="prompt-content-editor"
                value={userPromptContent}
                oninput={(event) => {
                  userPromptContent = (event.currentTarget as HTMLTextAreaElement).value;
                }}
                placeholder={t('aiAssistant.configModal.userPromptContentPlaceholder')}
                rows="18"
              ></textarea>
            </div>
          {:else}
            <div class="prompt-empty-state">{t('aiAssistant.configModal.noUserPromptFilesEmptyState')}</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if isOpen}
  {#if useObsidianModal}
    {@render modalContent(true)}
  {:else}
    <div class="modal-overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && onClose()}>
      {@render modalContent(false)}
    </div>
  {/if}
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--layer-modal, 50);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
  }

  .ai-config-modal {
    width: min(1100px, 94vw);
    max-height: min(88vh, 940px);
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.24);
  }

  .ai-config-modal-native {
    width: 100%;
    max-height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-title {
    font-size: 1.12rem;
    font-weight: 700;
    color: var(--text-normal);
  }

  .modal-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .modal-close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .prompt-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 0 0;
  }

  .prompt-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
  }

  .prompt-tab {
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    height: 32px;
    padding: 0 12px;
    background: var(--background-primary-alt);
    color: var(--text-muted);
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
  }

  .prompt-tab.active {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-primary-alt));
  }

  .prompt-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 20px;
  }

  .toolbar-text-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-primary-alt);
    color: var(--text-normal);
    font-size: 0.92rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .toolbar-text-trigger:hover {
    border-color: var(--background-modifier-border-hover);
    background: var(--background-modifier-hover);
  }

  .toolbar-text-trigger:focus-visible {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .primary-trigger {
    flex: 1 1 auto;
    justify-content: flex-start;
    min-width: 0;
  }

  .secondary-trigger {
    flex: 0 0 auto;
  }

  .trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prompt-editor-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin: 0 20px 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 20px;
    background: var(--background-primary);
    overflow: hidden;
  }

  .prompt-editor-shell.is-editing {
    border-color: var(--interactive-accent-hover);
  }

  .prompt-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary-alt) 72%, transparent);
  }

  .prompt-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .prompt-meta-type {
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .prompt-meta-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .prompt-meta-tip {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .prompt-meta-tip-path {
    max-width: 56%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editing-layout {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px 18px;
  }

  .prompt-name-input,
  .prompt-content-editor {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-primary-alt);
    color: var(--text-normal);
    font-family: var(--font-interface);
  }

  .prompt-name-input {
    height: 42px;
    padding: 0 12px;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .prompt-content-editor {
    flex: 1;
    min-height: 240px;
    padding: 14px 16px;
    resize: none;
    line-height: 1.65;
    font-family: var(--font-text);
    font-size: 0.92rem;
  }

  .prompt-name-input:focus,
  .prompt-content-editor:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .prompt-preview {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 18px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-text);
    font-size: 0.95rem;
    line-height: 1.78;
    color: var(--text-normal);
  }

  .prompt-empty-state {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.6;
  }

  :global(.menu.weave-ai-config-user-prompt-select-menu) {
    max-height: min(62vh, 640px);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
  }

  @media (max-width: 720px) {
    .prompt-shell {
      padding-top: 12px;
      gap: 12px;
    }

    .prompt-tabs {
      padding: 0 14px;
    }

    .prompt-toolbar {
      flex-direction: column;
      align-items: stretch;
      padding: 0 14px;
    }

    .secondary-trigger {
      width: 100%;
      justify-content: space-between;
    }

    .prompt-editor-shell {
      margin: 0 14px 14px;
      border-radius: 16px;
    }

    .prompt-editor-head {
      flex-direction: column;
      align-items: flex-start;
    }

    .prompt-meta {
      width: 100%;
    }

    .prompt-meta-tip {
      font-size: 0.78rem;
    }

    .prompt-meta-tip-path {
      max-width: 100%;
      white-space: normal;
      overflow: visible;
      text-overflow: unset;
      word-break: break-all;
    }

    .editing-layout {
      padding: 14px;
    }

    .prompt-preview {
      padding: 14px;
    }
  }
</style>
