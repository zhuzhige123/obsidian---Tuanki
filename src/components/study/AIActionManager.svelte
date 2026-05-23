<script lang="ts">
  import { logger } from '../../utils/logger';
  import { aiConfigStore } from '../../stores/ai-config.store';
  import type { AIAction, AIActionType, AIProvider } from '../../types/ai-types';
  import { TEMPLATE_VARIABLES } from '../../types/ai-types';
  import type { Deck } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import { AI_PROVIDER_LABELS, AI_MODEL_OPTIONS, getDefaultAIModel } from '../settings/constants/settings-constants';
  import ActionTypeTabBar from './ActionTypeTabBar.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedModal from '../ui/EnhancedModal.svelte';
  import ObsidianDropdown from '../ui/ObsidianDropdown.svelte';
  import { OFFICIAL_FORMAT_ACTIONS } from '../../constants/official-format-actions';
  import { DEFAULT_SPLIT_ACTIONS } from '../../data/default-split-actions';
  import { showObsidianConfirm } from '../../utils/obsidian-confirm';
  import { Notice } from 'obsidian';
  import { tr } from '../../utils/i18n';
  import { showProviderModelMenuAt } from '../../utils/provider-model-menu';

  interface Props {
    show: boolean;
    availableDecks: Deck[];
    plugin: WeavePlugin;
    onClose: () => void;
    allowedTypes?: AIActionType[];
    title?: string;
    useObsidianModal?: boolean;
    onUnsavedChangesChange?: (dirty: boolean) => void;
  }

  let {
    show,
    availableDecks,
    plugin,
    onClose,
    allowedTypes = ['format', 'split'],
    title = '',
    useObsidianModal = false,
    onUnsavedChangesChange
  }: Props = $props();
  const isModalOpen = $derived(useObsidianModal || show);
  let t = $derived($tr);
  const resolvedTitle = $derived(title || t('study.aiActionManager.title'));
  const normalizedAllowedTypes = $derived(
    allowedTypes.filter((type): type is AIActionType => type === 'format' || type === 'split')
  );
  const showTypeTabs = $derived(normalizedAllowedTypes.length > 1);

  // 状态管理
  let activeType = $state<AIActionType>('format');
  let selectedActionId = $state<string | null>(null);
  let showVariableHelp = $state(false);
  let draftFormatActions = $state<AIAction[]>([]);
  let draftSplitActions = $state<AIAction[]>([]);
  let hasUnsavedChanges = $state(false);
  let saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  let initializedForCurrentOpen = $state(false);
  let saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function cloneValue<T>(value: T): T {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value)) as T;
    }
  }

  function cloneActions(actions: AIAction[]): AIAction[] {
    return actions.map((action) => cloneValue(action));
  }

  function clearSaveFeedbackTimer() {
    if (saveFeedbackTimer) {
      clearTimeout(saveFeedbackTimer);
      saveFeedbackTimer = null;
    }
  }

  function markDirty() {
    hasUnsavedChanges = true;
    saveState = 'idle';
    clearSaveFeedbackTimer();
  }

  function loadDraftsFromStore() {
    const state = aiConfigStore.getState();
    draftFormatActions = cloneActions(state.customFormatActions);
    draftSplitActions = cloneActions(state.customSplitActions);
    hasUnsavedChanges = false;
    saveState = 'idle';
    clearSaveFeedbackTimer();
  }

  function getDraftActions(type: AIActionType): AIAction[] {
    if (type === 'format') return draftFormatActions;
    if (type === 'split') return draftSplitActions;
    return [];
  }

  function setDraftActions(type: AIActionType, actions: AIAction[], shouldMarkDirty = true) {
    const clonedActions = cloneActions(actions);

    if (type === 'format') {
      draftFormatActions = clonedActions;
    } else if (type === 'split') {
      draftSplitActions = clonedActions;
    }

    if (shouldMarkDirty) {
      markDirty();
    }
  }

  function buildOfficialFormatActions(): AIAction[] {
    return OFFICIAL_FORMAT_ACTIONS.map((action) => ({
      ...cloneValue(action),
      type: 'format' as const,
      category: 'official' as const
    })) as AIAction[];
  }

  function buildOfficialSplitActions(): AIAction[] {
    return DEFAULT_SPLIT_ACTIONS.map((action) => ({
      ...cloneValue(action),
      type: 'split' as const,
      category: 'official' as const
    })) as AIAction[];
  }

  $effect(() => {
    if (isModalOpen && !initializedForCurrentOpen) {
      loadDraftsFromStore();
      showVariableHelp = false;
      initializedForCurrentOpen = true;
      return;
    }

    if (!isModalOpen && initializedForCurrentOpen) {
      initializedForCurrentOpen = false;
      showVariableHelp = false;
      clearSaveFeedbackTimer();
    }
  });

  $effect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);
  });

  const currentFormatActions = $derived.by(() => [...buildOfficialFormatActions(), ...draftFormatActions]);
  const currentSplitActions = $derived.by(() => [...buildOfficialSplitActions(), ...draftSplitActions]);
  const currentActions = $derived(activeType === 'format' ? currentFormatActions : currentSplitActions);
  const selectedAction = $derived(currentActions.find(a => a.id === selectedActionId) || null);

  function getActionDisplayName(action: AIAction): string {
    return action.name.trim() || t('study.aiActionManager.unnamedAction');
  }

  function getActionCategoryLabel(action: AIAction): string {
    return action.category === 'official'
      ? t('study.aiActionManager.categoryOfficial')
      : t('study.aiActionManager.categoryCustom');
  }

  const activeTypeDisplayName = $derived(
    activeType === 'format'
      ? t('study.aiActionManager.types.format')
      : activeType === 'split'
        ? t('study.aiActionManager.types.split')
        : t('study.aiActionManager.types.generic')
  );

  const actionSelectorOptions = $derived(
    currentActions.map((action) => ({
      id: action.id,
      label: getActionDisplayName(action),
      description: getActionCategoryLabel(action)
    }))
  );

  const selectedActionValue = $derived(
    selectedActionId ?? currentActions[0]?.id ?? ''
  );

  $effect(() => {
    if (normalizedAllowedTypes.length === 0) return;

    if (!normalizedAllowedTypes.includes(activeType)) {
      activeType = normalizedAllowedTypes[0];
      selectedActionId = null;
      showVariableHelp = false;
    }
  });

  $effect(() => {
    if (!isModalOpen) return;

    if (currentActions.length === 0) {
      if (selectedActionId !== null) {
        selectedActionId = null;
      }
      return;
    }

    if (!selectedActionId || !currentActions.some((action) => action.id === selectedActionId)) {
      selectedActionId = currentActions[0].id;
    }
  });

  const availableVariables = $derived(TEMPLATE_VARIABLES);
  const providers: AIProvider[] = ['openai', 'gemini', 'anthropic', 'deepseek', 'zhipu', 'siliconflow', 'xai'];

  function getPreferredProvider(): AIProvider {
    return plugin.settings.aiConfig?.defaultProvider || 'zhipu';
  }

  function getDefaultModelForProvider(provider?: AIProvider): string {
    if (!provider) return '';
    const providerConfig = (plugin.settings.aiConfig?.apiKeys as any)?.[provider];
    return providerConfig?.model || getDefaultAIModel(provider);
  }

  function getModelLabel(provider: AIProvider, modelId?: string): string {
    const fallbackModel = getDefaultModelForProvider(provider);
    const resolvedModelId = (modelId || fallbackModel || '').trim();
    if (!resolvedModelId) return t('study.aiActionManager.noModelSelected');

    const providerOptions = AI_MODEL_OPTIONS[provider] || [];
    const matched = providerOptions.find((item) => item.id === resolvedModelId);
    return matched?.label || resolvedModelId;
  }

  function getActionProviderModelLabel(action: AIAction): string {
    const effectiveProvider = action.provider || getPreferredProvider();
    return `${AI_PROVIDER_LABELS[effectiveProvider]} · ${getModelLabel(effectiveProvider, action.model)}`;
  }

  function openActionProviderModelMenu(event: MouseEvent) {
    if (!selectedAction) return;

    const apiKeys = (plugin.settings.aiConfig?.apiKeys || {}) as Record<string, { model?: string } | undefined>;

    showProviderModelMenuAt(event, {
      apiKeys,
      selection: {
        provider: selectedAction.provider,
        model: selectedAction.model,
      },
      preferredProvider: getPreferredProvider(),
      providers,
      includeDefaultOption: true,
      defaultOptionTitle: t('study.aiActionManager.useDefaultConfig'),
      onSelect: (next) => {
        if (!next.provider) {
          updateSelectedAction({ provider: undefined, model: undefined });
          return;
        }
        updateSelectedAction({ provider: next.provider, model: next.model });
      },
    });
  }

  $effect(() => {
    if (selectedAction && !selectedAction.model) {
      const effectiveProvider = selectedAction.provider || getPreferredProvider();
      const computedDefaultModel = getDefaultModelForProvider(effectiveProvider);
      if (computedDefaultModel && selectedAction.category === 'custom') {
        logger.debug('[AIActionManager] 自动初始化model字段:', {
          actionId: selectedAction.id,
          provider: effectiveProvider,
          model: computedDefaultModel
        });
        updateSelectedAction({ model: computedDefaultModel }, false);
      }
    }
  });
  
  function handleTypeChange(type: AIActionType) {
    if (!normalizedAllowedTypes.includes(type)) return;
    activeType = type;
    selectedActionId = null;
    showVariableHelp = false;
  }

  function handleActionSelect(actionId: string) {
    selectedActionId = actionId;
    showVariableHelp = false;
  }
  
  function createNewAction() {
    const defaultProvider = getPreferredProvider();
    const defaultModelForProvider = getDefaultModelForProvider(defaultProvider);
    const actionTypeName = activeType === 'format'
      ? t('study.aiActionManager.types.formatShort')
      : t('study.aiActionManager.types.split');
    
    const newAction: AIAction = {
      id: `custom-${activeType}-${Date.now()}`,
      name: activeType === 'format'
        ? t('study.aiActionManager.newFormatActionName')
        : t('study.aiActionManager.newSplitActionName'),
      icon: 'sparkles',
      type: activeType,
      systemPrompt: t('study.aiActionManager.defaultSystemPrompt'),
      userPromptTemplate: t('study.aiActionManager.defaultUserPromptTemplate'),
      provider: defaultProvider,
      model: defaultModelForProvider,
      category: 'custom',
      createdAt: new Date().toISOString(),
      enabled: true
    };
    
    if (activeType === 'split') {
      newAction.splitConfig = {
        targetCount: 3,
        splitStrategy: 'knowledge-point',
        outputFormat: 'qa'
      };
    }
    
    const updatedActions = [...getDraftActions(activeType), newAction];
    setDraftActions(activeType, updatedActions);
    selectedActionId = newAction.id;
    new Notice(t('study.aiActionManager.notices.created', { actionType: actionTypeName }));
  }
  
  function deleteAction(id: string) {
    const action = currentActions.find(a => a.id === id);
    const actionName = action ? getActionDisplayName(action) : t('study.aiActionManager.thisAction');

    showObsidianConfirm(
      plugin.app,
      t('study.aiActionManager.confirmDeleteMessage', { name: actionName }),
      { title: t('study.aiActionManager.confirmDeleteTitle'), confirmText: t('study.aiActionManager.deleteAction') }
    ).then(confirmed => {
      if (confirmed) {
        const updatedActions = getDraftActions(activeType).filter(a => a.id !== id);
        setDraftActions(activeType, updatedActions);

        if (selectedActionId === id) {
          selectedActionId = null;
        }

        new Notice(t('study.aiActionManager.notices.deleted', { name: actionName }));
      }
    });
  }
  
  function updateSelectedAction(partial: Partial<AIAction>, shouldMarkDirty = true) {
    if (!selectedAction) return;
    
    const updated = { 
      ...selectedAction, 
      ...partial, 
      updatedAt: new Date().toISOString() 
    };

    const customActions = getDraftActions(activeType);
    const index = customActions.findIndex(a => a.id === selectedAction.id);

    if (index >= 0) {
      const updatedActions = [...customActions];
      updatedActions[index] = updated;
      setDraftActions(activeType, updatedActions, shouldMarkDirty);
    }
  }

  function duplicateAsCustom() {
    if (!selectedAction || selectedAction.category !== 'official') return;

    const defaultProvider = getPreferredProvider();
    const effectiveProvider = selectedAction.provider || defaultProvider;
    const defaultModelForProvider = getDefaultModelForProvider(effectiveProvider);
    
    const newAction: AIAction = {
      ...selectedAction,
      id: `custom-${activeType}-${Date.now()}`,
      name: t('study.aiActionManager.copyName', { name: selectedAction.name }),
      category: 'custom',
      provider: effectiveProvider,
      model: selectedAction.model || defaultModelForProvider,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const updatedActions = [...getDraftActions(activeType), newAction];
    setDraftActions(activeType, updatedActions);
    selectedActionId = newAction.id;
    new Notice(t('study.aiActionManager.notices.duplicated', { name: selectedAction.name }));
  }
  
  function restoreOfficialTemplates() {
    if (activeType === 'format') {
      new Notice(t('study.aiActionManager.notices.officialTemplatesAlwaysVisible'));
    } else {
      new Notice(t('study.aiActionManager.notices.noOfficialSplitTemplates'));
    }
  }

  function showActionOperationsMenu(event: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(t('study.aiActionManager.menu.new'))
        .setIcon('plus')
        .onClick(() => {
          createNewAction();
        });
    });

    if (selectedAction?.category === 'official') {
      menu.addItem((item) => {
        item
          .setTitle(t('study.aiActionManager.menu.duplicateAsCustom'))
          .setIcon('copy')
          .onClick(() => {
            duplicateAsCustom();
          });
      });
    } else if (selectedAction?.category === 'custom') {
      menu.addItem((item) => {
        item
          .setTitle(t('study.aiActionManager.menu.deleteCurrent'))
          .setIcon('trash')
          .onClick(() => {
            deleteAction(selectedAction.id);
          });
      });
    }

    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle(t('study.aiActionManager.menu.restoreOfficialTemplates'))
        .setIcon('refresh-cw')
        .onClick(() => {
          restoreOfficialTemplates();
        });
    });

    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle(
          saveState === 'saving'
            ? t('study.aiActionManager.menu.saving')
            : saveState === 'saved' && !hasUnsavedChanges
              ? t('study.aiActionManager.menu.saved')
              : t('study.aiActionManager.menu.save')
        )
        .setIcon(saveState === 'saved' && !hasUnsavedChanges ? 'check' : 'save')
        .setDisabled(!hasUnsavedChanges || saveState === 'saving')
        .onClick(() => {
          void saveChanges();
        });
    });

    menu.showAtMouseEvent(event);
  }

  async function saveChanges() {
    if (!hasUnsavedChanges || saveState === 'saving') return;

    saveState = 'saving';
    clearSaveFeedbackTimer();

    try {
      const currentState = aiConfigStore.getState();

      if (!plugin.settings.aiConfig) {
        plugin.settings.aiConfig = {
          apiKeys: {},
          defaultProvider: 'zhipu',
          customFormatActions: [],
          customSplitActions: []
        } as any;
      }

      const aiConfig = plugin.settings.aiConfig!;
      aiConfig.defaultProvider = currentState.defaultProvider;
      aiConfig.apiKeys = cloneValue(currentState.apiKeys);
      aiConfig.customFormatActions = cloneActions(draftFormatActions);
      aiConfig.customSplitActions = cloneActions(draftSplitActions);

      await plugin.saveSettings();
      aiConfigStore.reloadFromPlugin();

      hasUnsavedChanges = false;
      saveState = 'saved';
      new Notice(t('study.aiActionManager.notices.saved'));

      saveFeedbackTimer = setTimeout(() => {
        saveState = 'idle';
        saveFeedbackTimer = null;
      }, 2000);
    } catch (error) {
      saveState = 'idle';
      logger.error('[AIActionManager] 保存AI功能配置失败:', error);
      new Notice(t('study.aiActionManager.notices.saveFailed'));
    }
  }

  async function handleCloseRequest() {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    const confirmed = await showObsidianConfirm(
      plugin.app,
      t('study.aiActionManager.unsavedChangesMessage'),
      { title: t('study.aiActionManager.unsavedChangesTitle'), confirmText: t('study.aiActionManager.unsavedChangesConfirm') }
    );

    if (!confirmed) return;

    loadDraftsFromStore();
    onClose();
  }
</script>

<!-- 自定义强制背景虚化层 -->
{#if show && !useObsidianModal}
  <div 
    class="ai-config-backdrop" 
    role="button" 
    tabindex="0"
    onclick={handleCloseRequest}
    onkeydown={(e) => e.key === 'Enter' && void handleCloseRequest()}
  ></div>
{/if}

{#snippet modalHeader()}
  <div class="modal-toolbar">
    <div class="modal-toolbar-main">
      <h3 id="modal-title" class="modal-toolbar-title">{resolvedTitle}</h3>
    </div>

    <div class="modal-toolbar-center">
      {#if showTypeTabs}
        <div class="top-navigation-shell">
          <ActionTypeTabBar
            activeType={activeType}
            formatCount={currentFormatActions.length}
            splitCount={currentSplitActions.length}
            onTypeChange={handleTypeChange}
          />
        </div>
      {/if}
    </div>

    <div class="top-actions">
      <EnhancedButton
        variant="ghost"
        size="sm"
        iconOnly
        icon="times"
        onclick={handleCloseRequest}
        ariaLabel={t('study.aiActionManager.close')}
      />
    </div>
  </div>
{/snippet}

{#snippet managerContent()}
  <div class="manager-layout">
      <div class="action-toolbar-card">
        <div class="action-toolbar">
          <div class="action-toolbar-actions setting-item-control">
            <div class="action-primary-row">
              <div class="action-selector-control">
                <ObsidianDropdown
                  options={actionSelectorOptions}
                  value={selectedActionValue}
                  placeholder={t('study.aiActionManager.selectActionPlaceholder', { type: activeTypeDisplayName })}
                  className="action-selector-dropdown"
                  disabled={actionSelectorOptions.length === 0}
                  onchange={handleActionSelect}
                />
              </div>

              <button
                type="button"
                class="toolbar-btn obsidian-action-btn action-menu-btn"
                onclick={(event) => showActionOperationsMenu(event)}
                title={t('study.aiActionManager.actionMenuTitle')}
              >
                <EnhancedIcon name="more-horizontal" size="14" />
                <span>{t('study.aiActionManager.actions')}</span>
              </button>
            </div>

          </div>
        </div>

      </div>
      
      <div class="config-editor">
        {#if selectedAction}
          <div class="edit-form">
            <div class="form-section form-section-basic">
              <div class="section-header">
                <h4 class="section-title">{t('study.aiActionManager.sections.basic')}</h4>
              </div>
              
              <div class="form-group">
                <label class="form-label" for="action-name-input">{t('study.aiActionManager.fields.name')}</label>
                <input 
                  id="action-name-input"
                  type="text"
                  value={selectedAction.name}
                  oninput={(e) => updateSelectedAction({ name: (e.target as HTMLInputElement).value })}
                  placeholder={t('study.aiActionManager.fields.namePlaceholder')}
                  disabled={selectedAction.category === 'official'}
                  class="form-input"
                />
              </div>
            </div>
            
            {#if selectedAction.type === 'split' && selectedAction.splitConfig}
              <div class="form-section form-section-split">
                <div class="section-header">
                  <h4 class="section-title">{t('study.aiActionManager.sections.split')}</h4>
                </div>
                
                <div class="form-row">
                  <label class="form-label" for="split-target-count">{t('study.aiActionManager.fields.targetCount')}</label>
                  <input
                    id="split-target-count"
                    type="number"
                    class="form-input"
                    min="2"
                    max="8"
                    bind:value={selectedAction.splitConfig.targetCount}
                    onchange={() => updateSelectedAction({ splitConfig: selectedAction.splitConfig })}
                  />
                </div>
                
                <div class="form-row">
                  <label class="form-label" for="split-strategy-select">{t('study.aiActionManager.fields.splitStrategy')}</label>
                  <div class="form-select">
                    <ObsidianDropdown
                      options={[
                        { id: 'knowledge-point', label: t('study.aiActionManager.splitStrategies.knowledgePoint') },
                        { id: 'difficulty', label: t('study.aiActionManager.splitStrategies.difficulty') },
                        { id: 'content-length', label: t('study.aiActionManager.splitStrategies.contentLength') }
                      ]}
                      value={selectedAction.splitConfig.splitStrategy}
                      onchange={(value) => {
                        const splitConfig = selectedAction.splitConfig;
                        if (!splitConfig) return;
                        splitConfig.splitStrategy = value as any;
                        updateSelectedAction({ splitConfig });
                      }}
                    />
                  </div>
                </div>
                
                <div class="form-row">
                  <label class="form-label" for="split-output-format-select">{t('study.aiActionManager.fields.outputFormat')}</label>
                  <div class="form-select">
                    <ObsidianDropdown
                      options={[
                        { id: 'qa', label: t('study.aiActionManager.outputFormats.qa') },
                        { id: 'cloze', label: t('study.aiActionManager.outputFormats.cloze') },
                        { id: 'mixed', label: t('study.aiActionManager.outputFormats.mixed') }
                      ]}
                      value={selectedAction.splitConfig.outputFormat}
                      onchange={(value) => {
                        const splitConfig = selectedAction.splitConfig;
                        if (!splitConfig) return;
                        splitConfig.outputFormat = value as any;
                        updateSelectedAction({ splitConfig });
                      }}
                    />
                  </div>
                </div>
              </div>
            {/if}
            
            <div class="form-section form-section-ai">
              <div class="section-header">
                <h4 class="section-title">{t('study.aiActionManager.sections.aiService')}</h4>
              </div>
              
              <div class="form-group">
                <label class="form-label" for="action-provider-model-trigger">{t('study.aiActionManager.fields.providerModel')}</label>
                <button
                  id="action-provider-model-trigger"
                  type="button"
                  class="form-input form-menu-trigger"
                  onclick={openActionProviderModelMenu}
                  aria-label={t('study.aiActionManager.fields.providerModel')}
                >
                  <span>{getActionProviderModelLabel(selectedAction)}</span>
                  <EnhancedIcon name="chevron-down" size="14" />
                </button>
                <div class="form-hint">
                  {t('study.aiActionManager.providerHint')}
                </div>
              </div>
            </div>
            
            <div class="form-section form-section-prompt">
              <div class="section-header">
                <h4 class="section-title">{t('study.aiActionManager.sections.prompt')}</h4>
              </div>
              
              <div class="form-group">
                <div class="label-with-help">
                  <label class="form-label" for="system-prompt-textarea">{t('study.aiActionManager.fields.systemPrompt')}</label>
                  <EnhancedButton
                    variant="ghost"
                    size="xs"
                    icon={showVariableHelp ? 'chevron-up' : 'chevron-down'}
                    onclick={() => showVariableHelp = !showVariableHelp}
                    ariaLabel={t('study.aiActionManager.toggleVariables')}
                  >
                    {t('study.aiActionManager.availableVariables')}
                  </EnhancedButton>
                </div>
                <textarea
                  id="system-prompt-textarea"
                  value={selectedAction.systemPrompt}
                  oninput={(e) => updateSelectedAction({ systemPrompt: (e.target as HTMLTextAreaElement).value })}
                  placeholder={t('study.aiActionManager.systemPromptPlaceholder')}
                  rows="8"
                  disabled={selectedAction.category === 'official'}
                  class="form-textarea"
                ></textarea>
              </div>
              
              <div class="form-group">
                <label class="form-label" for="user-prompt-textarea">{t('study.aiActionManager.fields.userPromptTemplate')}</label>
                <textarea
                  id="user-prompt-textarea"
                  value={selectedAction.userPromptTemplate}
                  oninput={(e) => updateSelectedAction({ userPromptTemplate: (e.target as HTMLTextAreaElement).value })}
                  placeholder={t('study.aiActionManager.userPromptPlaceholder')}
                  rows="6"
                  disabled={selectedAction.category === 'official'}
                  class="form-textarea"
                ></textarea>
              </div>
              
              {#if showVariableHelp && availableVariables}
                <div class="variable-help">
                  <h5 class="variable-help-title">{t('study.aiActionManager.availableVariablesTitle')}</h5>
                  <div class="variable-list">
                    {#each Object.entries(availableVariables) as [variable, description]}
                      <div class="variable-item">
                        <code class="variable-code">{variable}</code>
                        <span class="variable-desc">{description}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="empty-editor-state">
            <EnhancedIcon name="sparkles" size="48" variant="muted" />
            <p>{t('study.aiActionManager.emptyStateTitle')}</p>
            <p class="hint-text">{t('study.aiActionManager.emptyStateHint')}</p>
          </div>
        {/if}
      </div>
    </div>
{/snippet}

{#if useObsidianModal}
  <div class="ai-action-manager ai-action-manager-native">
    {#if showTypeTabs}
      <div class="modal-header-tabs modal-header-tabs-native">
        <div class="top-navigation-shell">
          <ActionTypeTabBar
            activeType={activeType}
            formatCount={currentFormatActions.length}
            splitCount={currentSplitActions.length}
            onTypeChange={handleTypeChange}
          />
        </div>
      </div>
    {/if}
    {@render managerContent()}
  </div>
{:else}
  <EnhancedModal
    open={show}
    onClose={handleCloseRequest}
    size="xl"
    title={resolvedTitle}
    header={modalHeader}
    zIndex={6000}
    mask={false}
  >
    <div class="ai-action-manager">
      {@render managerContent()}
    </div>
  </EnhancedModal>
{/if}

<style>
  /*  CSS变量定义（确保在非.weave-app容器中也能使用） */
  .ai-action-manager {
    /* 间距系统 */
    --weave-space-xs: 4px;
    --weave-space-sm: 8px;
    --weave-space-md: 12px;
    --weave-space-lg: 16px;
    --weave-space-xl: 24px;
    --weave-space-2xl: 32px;
    
    /* 圆角系统 */
    --weave-radius-sm: 4px;
    --weave-radius-md: 8px;
    --weave-radius-lg: 12px;
    --weave-radius-xl: 16px;
    
    /* 颜色系统（使用Obsidian变量作为基础） */
    --weave-text-primary: var(--text-normal);
    --weave-text-secondary: var(--text-muted);
    --weave-text-faint: var(--text-faint);
    --weave-border: var(--background-modifier-border);
    --weave-surface: var(--background-primary);
    --weave-secondary-bg: var(--background-secondary);
    
    /* 组件样式 */
    width: 100%;
    height: 100%;
    background: var(--background-primary);
    display: flex;
    flex-direction: column;
  }
  
  .modal-toolbar {
    flex-shrink: 0;
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--weave-space-lg);
    padding: 12px 16px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, transparent);
    background: var(--background-primary);
    min-width: 0;
  }

  .modal-toolbar-main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    justify-self: start;
  }

  .modal-toolbar-center {
    min-width: 0;
    display: flex;
    justify-content: flex-start;
    justify-self: start;
  }

  .modal-toolbar-title {
    margin: 0;
    font-size: 1.08rem;
    font-weight: 700;
    color: var(--text-normal, var(--weave-text-primary));
    white-space: nowrap;
  }

  .top-navigation-shell {
    display: inline-flex;
    max-width: 100%;
    padding: 0;
    border-radius: 0;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .top-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--weave-space-md);
    justify-self: end;
  }

  .modal-header-tabs {
    flex-shrink: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    padding: 12px 24px;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, transparent);
    background: var(--background-primary);
  }

  .modal-header-tabs-native {
    gap: 0;
  }

  .modal-header-tabs :global(.action-type-tab-bar) {
    max-width: 100%;
  }

  .manager-layout {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--weave-space-lg);
    padding: 18px 24px 24px;
  }

  .action-toolbar-card {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--weave-space-lg);
    padding: 18px 20px;
    border-radius: var(--weave-radius-xl);
    border: 1px solid var(--background-modifier-border, var(--weave-border));
    background: var(--background-secondary, var(--weave-secondary-bg));
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  }

  .action-toolbar {
    display: flex;
    align-items: center;
    gap: var(--weave-space-lg);
  }

  .action-selector-control {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 640px;
  }

  :global(.action-selector-dropdown.obsidian-dropdown-trigger) {
    width: 100%;
    min-height: 40px;
    padding: 0.625rem 0.875rem;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: none;
  }

  :global(.action-selector-dropdown.obsidian-dropdown-trigger:hover:not(.disabled)) {
    background: var(--background-modifier-form-field);
    border-color: var(--background-modifier-border-hover);
  }

  :global(.action-selector-dropdown.obsidian-dropdown-trigger:focus-visible) {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  :global(.action-selector-dropdown.obsidian-dropdown-trigger .dropdown-icon) {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .action-toolbar-actions {
    width: 100%;
    display: flex;
    align-items: stretch;
    flex-direction: column;
    justify-content: flex-start;
    gap: 10px;
  }

  .action-primary-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .toolbar-btn.obsidian-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    white-space: nowrap;
  }

  .toolbar-btn.obsidian-action-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .toolbar-btn.obsidian-action-btn:focus-visible {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .toolbar-btn.obsidian-action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
  }

  .action-menu-btn.toolbar-btn.obsidian-action-btn {
    flex: 0 0 auto;
    min-width: 84px;
    padding-inline: 12px;
  }

  .ai-config-backdrop {
    position: fixed !important;
    inset: 0 !important;
    background: rgba(0, 0, 0, 0.88) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    z-index: calc(var(--weave-z-loading) - 1);
    animation: backdropFadeIn 0.3s ease !important;
    pointer-events: auto !important;
  }

  @keyframes backdropFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .config-editor {
    flex: 1;
    min-height: 0;
    background: var(--background-secondary, var(--weave-secondary-bg));
    border-radius: var(--weave-radius-xl);
    overflow-y: auto;
    padding: 24px 28px;
    border: 1px solid var(--background-modifier-border, var(--weave-border));
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  }

  .edit-form {
    max-width: 920px;
  }

  .empty-editor-state {
    min-height: 320px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    color: var(--text-muted, var(--weave-text-secondary));
    padding: 40px 20px;
  }

  .empty-editor-state p {
    margin: 0;
    font-size: 0.92rem;
  }

  .empty-editor-state .hint-text {
    font-size: 0.82rem;
    color: var(--text-faint, var(--weave-text-faint));
  }
  
  .form-section {
    margin-bottom: var(--weave-space-xl);
    padding-bottom: var(--weave-space-xl);
    border-bottom: 1px solid var(--background-modifier-border, var(--weave-border));
  }
  
  .form-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
  
  /*  Section Header - 带彩色侧边条 */
  .section-header {
    display: flex;
    align-items: center;
    gap: var(--weave-space-md);
    margin-bottom: var(--weave-space-lg);
    position: relative;
    padding-left: var(--weave-space-lg);
  }
  
  .section-header::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 1.2em;
    border-radius: 2px;
  }
  
  /*  多彩侧边条 - Weave标识性设计 */
  .form-section-basic .section-header::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
  }
  
  .form-section-split .section-header::before {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(124, 58, 237, 0.6));
  }
  
  .form-section-ai .section-header::before {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.6));
  }
  
  .form-section-prompt .section-header::before {
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(219, 39, 119, 0.6));
  }
  
  .section-title {
    display: block;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-normal, var(--weave-text-primary));
    flex: 1;
  }
  
  .form-group {
    margin-bottom: var(--weave-space-lg);
  }
  
  .form-group:last-child {
    margin-bottom: 0;
  }
  
  .form-label {
    display: block;
    margin-bottom: var(--weave-space-sm);
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-normal, var(--weave-text-primary));
  }
  
  .form-input,
  .form-textarea,
  .form-select {
    width: 100%;
    padding: var(--weave-space-sm) var(--weave-space-md);
    background: var(--background-primary, var(--weave-surface));
    border: 1px solid var(--background-modifier-border, var(--weave-border));
    border-radius: var(--weave-radius-md);
    color: var(--text-normal, var(--weave-text-primary));
    font-size: 0.875rem;
    font-family: inherit;
    transition: all 0.2s ease;
  }
  
  .form-select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--weave-space-md) center;
    padding-right: calc(var(--weave-space-md) * 2 + 12px);
  }
  
  .form-select:focus {
    outline: none;
    border-color: var(--interactive-accent, var(--weave-accent-color));
    box-shadow: 0 0 0 3px rgba(var(--interactive-accent-rgb, 139, 92, 246), 0.1);
  }
  
  .form-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: var(--background-secondary, var(--weave-secondary-bg));
  }
  
  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--interactive-accent, var(--weave-accent-color));
    box-shadow: 0 0 0 3px rgba(var(--interactive-accent-rgb, 139, 92, 246), 0.1);
  }
  
  .form-input:disabled,
  .form-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--background-secondary, var(--weave-secondary-bg));
  }
  
  .form-hint {
    margin-top: var(--weave-space-xs);
    font-size: 0.75rem;
    color: var(--text-muted, var(--weave-text-secondary));
    line-height: 1.4;
  }
  
  .form-textarea {
    resize: vertical;
    line-height: 1.5;
    min-height: 120px;
  }
  
  .label-with-help {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--weave-space-sm);
  }
  
  .variable-help {
    margin-top: var(--weave-space-md);
    padding: var(--weave-space-md);
    background: var(--background-primary, var(--weave-surface));
    border: 1px solid var(--background-modifier-border, var(--weave-border));
    border-radius: var(--weave-radius-md);
  }
  
  .variable-help-title {
    margin: 0 0 var(--weave-space-sm) 0;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-normal, var(--weave-text-primary));
  }
  
  .variable-list {
    display: flex;
    flex-direction: column;
    gap: var(--weave-space-sm);
  }
  
  .variable-item {
    display: flex;
    align-items: center;
    gap: var(--weave-space-md);
  }
  
  .variable-code {
    padding: 0.1875rem 0.375rem;
    background: var(--background-secondary, var(--weave-secondary-bg));
    border-radius: var(--weave-radius-sm);
    color: var(--text-accent, var(--interactive-accent, var(--weave-accent-color)));
    font-size: 0.75rem;
    font-family: var(--font-monospace);
    white-space: nowrap;
    flex-shrink: 0;
  }
  
  .variable-desc {
    font-size: 0.75rem;
    color: var(--text-muted, var(--weave-text-secondary));
  }
  
  @media (max-width: 1024px) {
    .modal-toolbar {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "title close"
        "tabs tabs";
      align-items: start;
    }

    .modal-toolbar-main {
      grid-area: title;
    }

    .modal-toolbar-center {
      grid-area: tabs;
      justify-self: stretch;
      justify-content: flex-start;
    }

    .top-actions {
      grid-area: close;
      justify-self: end;
    }

    .action-selector-control {
      max-width: none;
    }

    .config-editor {
      padding: 22px 24px;
    }

    .edit-form {
      max-width: 100%;
    }
  }
  
  @media (max-width: 768px) {
    .modal-toolbar {
      padding: max(12px, env(safe-area-inset-top, 0)) 12px 10px;
      gap: 10px;
    }

    .modal-toolbar-main {
      width: auto;
      justify-content: flex-start;
      gap: 8px;
    }

    .modal-toolbar-title {
      font-size: 1rem;
      line-height: 1.3;
    }

    .top-navigation-shell {
      max-width: 100%;
      overflow-x: auto;
      padding: 0;
      border: none;
      background: transparent;
      box-shadow: none;
    }

    .top-actions {
      justify-self: end;
      gap: 10px;
    }

    .modal-header-tabs {
      padding: 10px 12px;
    }

    .manager-layout {
      padding: 16px;
      gap: 14px;
    }

    .action-toolbar-card {
      padding: 16px;
      border-radius: 14px;
    }

    .action-toolbar-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .action-primary-row {
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .toolbar-btn.obsidian-action-btn {
      flex: 1 1 140px;
      border: none;
      box-shadow: none;
      background: var(--background-primary);
      transition: background 0.18s ease, color 0.18s ease;
    }

    .toolbar-btn.obsidian-action-btn:hover:not(:disabled) {
      transform: none;
      border: none;
      box-shadow: none;
      background: var(--background-modifier-hover);
    }

    .toolbar-btn.obsidian-action-btn:focus-visible {
      border: none;
      box-shadow: none;
      outline: 2px solid var(--background-modifier-border-focus);
      outline-offset: 1px;
    }

    .action-menu-btn.toolbar-btn.obsidian-action-btn {
      flex: 0 0 auto;
      min-width: 76px;
      padding: 10px 12px;
    }

    :global(.action-selector-dropdown.obsidian-dropdown-trigger) {
      border: none;
      box-shadow: none;
      background: var(--background-primary);
    }

    :global(.action-selector-dropdown.obsidian-dropdown-trigger:hover:not(.disabled)) {
      border: none;
      background: var(--background-modifier-hover);
    }

    :global(.action-selector-dropdown.obsidian-dropdown-trigger:focus-visible) {
      border: none;
      box-shadow: none;
      outline: 2px solid var(--background-modifier-border-focus);
      outline-offset: 1px;
    }

    .top-actions :global(.weave-btn) {
      border: none;
      box-shadow: none;
    }

    .config-editor {
      padding: 18px;
      border-radius: 14px;
    }

    .label-with-help {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .variable-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
  }
  
  .config-editor::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  
  .config-editor::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .config-editor::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border, var(--weave-border));
    border-radius: 3px;
  }
  
  .config-editor::-webkit-scrollbar-thumb:hover {
    background: var(--text-faint, var(--weave-text-faint));
  }
</style>
