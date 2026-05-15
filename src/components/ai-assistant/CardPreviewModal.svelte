<script lang="ts">
  import { logger } from '../../utils/logger';
  import { tick } from 'svelte';

  import type { WeavePlugin } from '../../main';
  import type { GeneratedCard, GenerationConfig } from '../../types/ai-types';
  import type { Card } from '../../data/types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import ObsidianDropdown from '../ui/ObsidianDropdown.svelte';
  import RegenerateDialog from './RegenerateDialog.svelte';
  import PreviewContainer from '../preview/PreviewContainer.svelte';
  import { CardConverter } from '../../services/ai/CardConverter';
  import { DetachedLeafEditor } from '../../services/editor/DetachedLeafEditor';
  import { Notice } from 'obsidian';
  import { tr } from '../../utils/i18n';
  import { getConfiguredClozeSyntaxExample } from '../../utils/cloze-syntax';

  interface Props {
    plugin: WeavePlugin;
    cards: GeneratedCard[];
    config: GenerationConfig; // AI 生成配置，包含 provider 和 model
    isOpen: boolean;
    isGenerating?: boolean; // 是否正在生成
    totalCards?: number; // 总卡片数
    onClose: () => void;
    onImport: (selectedCards: GeneratedCard[], targetDeck: string) => Promise<void>;
  }

  let { 
    plugin, 
    cards, 
    config,
    isOpen, 
    isGenerating = false,
    totalCards = 0,
    onClose, 
    onImport 
  }: Props = $props();

  // ===== 国际化 =====
  let t = $derived($tr);

  // ===== 状态管理 =====
  let currentIndex = $state(0);
  let selectedCardIds = $state<Set<string>>(new Set());
  let showRegenerateDialog = $state(false);
  let isImporting = $state(false);
  
  // 牌组选择
  let availableDecks = $state<Array<{ id: string; name: string }>>([]);
  let selectedDeckId = $state<string>('');

  // 预览相关状态
  let previewCard = $state<Card | null>(null);
  let showPreviewAnswer = $state(true); // 默认显示答案
  
  //  用于跟踪模态窗是否刚刚打开（普通变量，不触发effect）
  let wasOpen = false;
  
  // 编辑模式状态，用于切换预览和编辑
  let isEditMode = $state(false);
  let editingContent = $state('');  // 编辑中的content内容
  let editorContainer: HTMLDivElement | null = $state(null);
  let embeddedEditor: DetachedLeafEditor | null = null;

  // 监听当前卡片变化，转换为预览用Card
  $effect(() => {
    if (currentCard) {
      try {
        previewCard = CardConverter.convertForPreview(currentCard);
        // 保持显示答案状态（不重置）
      } catch (error) {
        logger.error('[CardPreviewModal] 卡片转换失败:', error);
        previewCard = null;
      }
    } else {
      previewCard = null;
    }
  });

  // ===== 派生状态 =====
  let currentCard = $derived(cards[currentIndex]);
  let selectedCount = $derived(selectedCardIds.size);
  let isCurrentCardSelected = $derived(
    currentCard ? selectedCardIds.has(currentCard.uuid) : false
  );
  let isAllSelected = $derived(selectedCount === cards.length && cards.length > 0);
  let canGoPrev = $derived(currentIndex > 0);
  let canGoNext = $derived(currentIndex < cards.length - 1);

  // ===== 工具函数 =====
  function truncateDeckName(name: string, maxLength: number = 30): string {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 3) + '...';
  }

  // ===== 卡片导航 =====
  function goToPrevCard() {
    if (canGoPrev) {
      currentIndex--;
      showRegenerateDialog = false;
    }
  }

  function goToNextCard() {
    if (canGoNext) {
      currentIndex++;
      showRegenerateDialog = false;
    }
  }

  function goToCard(index: number) {
    if (index >= 0 && index < cards.length) {
      currentIndex = index;
      showRegenerateDialog = false;
    }
  }

  // ===== 卡片选择 =====
  function toggleCurrentCard() {
    if (!currentCard) return;
    
    const newSet = new Set(selectedCardIds);
    if (newSet.has(currentCard.uuid)) {
      newSet.delete(currentCard.uuid);
    } else {
      newSet.add(currentCard.uuid);
    }
    selectedCardIds = newSet;
  }

  function selectAll() {
    selectedCardIds = new Set(cards.map(c => c.uuid));
  }

  function deselectAll() {
    selectedCardIds = new Set();
  }

  function toggleSelectAll() {
    if (selectedCount === cards.length && cards.length > 0) {
      // 当前全选状态，执行取消全选
      deselectAll();
    } else {
      // 当前未全选，执行全选
      selectAll();
    }
  }

  // ===== 重新生成 =====
  function toggleRegenerateDialog() {
    showRegenerateDialog = !showRegenerateDialog;
  }

  // ===== 编辑模式切换 =====
  
  /**
   * 切换编辑模式
   * 点击"编辑内容"按钮时：预览模式->编辑模式，编辑模式->保存并切换回预览模式
   */
  async function toggleEditMode() {
    if (!currentCard) return;
    
    if (isEditMode) {
      // 编辑模式 -> 预览模式：保存内容
      await saveAndExitEditMode();
    } else {
      // 预览模式 -> 编辑模式：进入编辑
      await enterEditMode();
    }
  }
  
  /**
   * 进入编辑模式
   */
  async function enterEditMode() {
    if (!currentCard) return;
    
    // 保存当前卡片的content到编辑状态
    editingContent = currentCard.content || '';
    isEditMode = true;
    
    // 等待DOM更新
    await tick();
    
    // 创建Obsidian原生编辑器
    if (editorContainer) {
      try {
        // 清理旧编辑器
        if (embeddedEditor) {
          embeddedEditor.destroy();
          embeddedEditor = null;
        }
        
        // 清空容器
        editorContainer.replaceChildren();
        
        // 创建新编辑器
        embeddedEditor = new DetachedLeafEditor(
          plugin.app,
          editorContainer,
          {
            value: editingContent,
            placeholder: '在此编辑卡片内容...\n\n使用 ---div--- 分隔正面和背面',
            sessionId: `preview-${currentCard.uuid}-${Date.now()}`,
            sourcePath: currentCard.metadata.sourceFile,
            onChange: (editor) => {
              // 实时更新编辑内容
              editingContent = editor.value;
            }
          }
        );
        
        // 手动加载组件
        embeddedEditor.load();
        
        // 聚焦编辑器
        setTimeout(() => {
          embeddedEditor?.focus();
        }, 100);
        
        logger.debug('[CardPreviewModal] 编辑器创建成功');
      } catch (error) {
        logger.error('[CardPreviewModal] 编辑器创建失败:', error);
        new Notice('编辑器创建失败');
        isEditMode = false;
      }
    }
  }
  
  /**
   * 保存并退出编辑模式
   */
  async function saveAndExitEditMode() {
    if (!currentCard) return;
    
    // 从编辑器获取最新内容
    const newContent = embeddedEditor?.value || editingContent;
    
    // 更新卡片内容
    const updatedCard: typeof currentCard = {
      ...currentCard,
      content: newContent
    };
    
    // 响应式更新cards数组
    const newCards = [...cards];
    newCards[currentIndex] = updatedCard;
    cards = newCards;
    
    // 清理编辑器
    if (embeddedEditor) {
      embeddedEditor.destroy();
      embeddedEditor = null;
    }
    
    isEditMode = false;
    new Notice('卡片内容已更新');
    
    logger.debug('[CardPreviewModal] 编辑内容已保存');
  }
  
  /**
   * 取消编辑（不保存）
   */
  function cancelEditMode() {
    if (embeddedEditor) {
      embeddedEditor.destroy();
      embeddedEditor = null;
    }
    isEditMode = false;
    editingContent = '';
  }
  
  // 切换卡片时退出编辑模式
  $effect(() => {
    if (isEditMode && currentCard) {
      // 当currentIndex变化时，如果在编辑模式，先保存当前编辑
      // 这个effect会在currentCard变化时触发
    }
  });
  
  // 清理：组件卸载时销毁编辑器
  $effect(() => {
    return () => {
      if (embeddedEditor) {
        embeddedEditor.destroy();
        embeddedEditor = null;
      }
    };
  });

  async function handleRegenerate(instruction: string) {
    if (!currentCard) return;

    try {
      new Notice('正在重新生成卡片...');
      
      // 调用 AI 服务重新生成卡片
      const { AIServiceFactory } = await import('../../services/ai/AIServiceFactory');
      const aiService = AIServiceFactory.createService(config.provider, plugin, config.model);
      
      // 使用content字段作为原始内容（插件统一使用content字段）
      const originalContent = currentCard.content || '';
      const cardType = currentCard.type;
      
      // 根据卡片类型构建提示词，让AI直接生成content格式
      let regeneratePrompt = '';
      let typeDistribution = { qa: 0, cloze: 0, choice: 0 };
      const currentClozeSyntax = getConfiguredClozeSyntaxExample('文本', plugin.settings?.clozeSettings);
      const clozePromptExample = getConfiguredClozeSyntaxExample('需要挖空的部分', plugin.settings?.clozeSettings);
      
      if (cardType === 'cloze') {
        typeDistribution.cloze = 100;
        regeneratePrompt = `
原始卡片内容：
${originalContent}

卡片类型：挖空题（cloze）

用户修改要求：${instruction}

请根据用户的修改要求重新生成这张挖空题卡片。

返回JSON数组，格式如下：
[
  {
    "type": "cloze",
    "content": "完整原文（用${clozePromptExample}标记需要挖空的部分）"
  }
]

注意：
1. 使用当前插件设置的挖空语法标记挖空部分，例如：${currentClozeSyntax}
2. content字段包含完整的卡片内容
3. 返回的必须是包含1个对象的JSON数组`;
      } else if (cardType === 'choice') {
        typeDistribution.choice = 100;
        regeneratePrompt = `
原始卡片内容：
${originalContent}

卡片类型：选择题（choice）

用户修改要求：${instruction}

请根据用户的修改要求重新生成这张选择题卡片。

返回JSON数组，格式如下：
[
  {
    "type": "choice",
    "content": "Q: 问题内容\\n\\nA) 选项A\\nB) 选项B\\nC) 选项C\\nD) 选项D\\n\\n---div---\\n\\n正确答案) 答案解释"
  }
]

注意：
1. content字段使用特定格式：Q:开头的问题，A)/B)/C)/D)开头的选项，---div---分隔，正确答案)开头的答案
2. 返回的必须是包含1个对象的JSON数组`;
      } else {
        // QA题
        typeDistribution.qa = 100;
        regeneratePrompt = `
原始卡片内容：
${originalContent}

卡片类型：问答题（qa）

用户修改要求：${instruction}

请根据用户的修改要求重新生成这张问答题卡片。

返回JSON数组，格式如下：
[
  {
    "type": "qa",
    "content": "问题内容\\n\\n---div---\\n\\n答案内容"
  }
]

注意：
1. content字段使用 ---div--- 分隔问题和答案
2. 返回的必须是包含1个对象的JSON数组`;
      }

      const aiConfig = plugin.settings.aiConfig!;
      const provider = config.provider;
      const model = config.model;
      const providerConfig = aiConfig.apiKeys?.[provider as keyof typeof aiConfig.apiKeys];
      
      if (!providerConfig || !providerConfig.apiKey) {
        throw new Error(`${provider} API密钥未配置`);
      }
      
      // 调用AI生成
      const response = await aiService.generateCards(
        regeneratePrompt,
        {
          templateId: 'regenerate',
          promptTemplate: regeneratePrompt,
          cardCount: 1,
          difficulty: currentCard.metadata.difficulty || 'medium',
          typeDistribution: typeDistribution,
          provider: provider,
          model: model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          imageGeneration: {
            enabled: false,
            strategy: 'none',
            imagesPerCard: 0,
            placement: 'question'
          },
          enableHints: false
        },
        () => {} // 不需要进度回调
      );
      
      if (response.success && response.cards && response.cards.length > 0) {
        const regeneratedCard = response.cards[0];
        
        // 直接使用返回的content字段（插件统一使用content字段）
        const newContent = regeneratedCard.content || '';
        
        const updatedCard: typeof currentCard = {
          ...currentCard,
          content: newContent  // 只更新content字段
        };
        
        // 响应式更新：创建新数组以触发Svelte 5更新
        const newCards = [...cards];
        newCards[currentIndex] = updatedCard;
        cards = newCards;
        
        new Notice('卡片已重新生成');
      } else {
        throw new Error(response.error || '生成失败');
      }
    } catch (error) {
      logger.error('Regenerate failed:', error);
      new Notice(error instanceof Error ? error.message : '重新生成失败');
    }
  }

  // ===== 加载牌组列表 =====
  async function loadDecks() {
    try {
      logger.debug('[CardPreviewModal] 开始加载牌组列表');
      const allDecks = await plugin.dataStorage.getDecks();
      logger.debug('[CardPreviewModal] 获取到所有牌组:', allDecks.length);
      
      availableDecks = allDecks
        .filter(deck => deck.purpose !== 'test')
        .map(deck => ({ id: deck.id, name: deck.name }));
      logger.debug('[CardPreviewModal] 拆分模式，过滤后牌组:', availableDecks.length);
      
      // 如果没有匹配的牌组，显示所有牌组
      if (availableDecks.length === 0) {
        logger.warn('[CardPreviewModal] 没有匹配的牌组，显示所有牌组');
        availableDecks = allDecks.map(deck => ({ id: deck.id, name: deck.name }));
      }
      
      // 设置默认选中的牌组
      const defaultTargetDeck = config.targetDeck;
      if (defaultTargetDeck) {
        // 查找匹配的牌组（可能是ID或name）
        const matchedDeck = availableDecks.find(d => 
          d.id === defaultTargetDeck || d.name === defaultTargetDeck
        );
        if (matchedDeck) {
          selectedDeckId = matchedDeck.id;
        } else if (availableDecks.length > 0) {
          selectedDeckId = availableDecks[0].id;
        }
      } else if (availableDecks.length > 0) {
        selectedDeckId = availableDecks[0].id;
      }
      
      logger.debug('[CardPreviewModal] 最终可用牌组:', availableDecks.length, '选中:', selectedDeckId);
    } catch (error) {
      logger.error('[CardPreviewModal] Load decks failed:', error);
      // 创建默认牌组备用
      availableDecks = [{ id: 'default', name: '默认记忆牌组' }];
      selectedDeckId = 'default';
    }
  }

  // ===== 导入卡片 =====
  async function handleImportCards() {
    if (selectedCount === 0) {
      new Notice('请至少选择一张卡片');
      return;
    }

    if (!selectedDeckId) {
      new Notice('请选择目标牌组');
      return;
    }

    const selectedCards = cards.filter(card => selectedCardIds.has(card.uuid));
    const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
    const deckName = selectedDeck?.name || selectedDeckId;

    try {
      isImporting = true;
      await onImport(selectedCards, selectedDeckId);
      new Notice(`成功导入 ${selectedCount} 张卡片到 ${deckName}`);
      onClose();
    } catch (error) {
      logger.error('Import failed:', error);
      new Notice(error instanceof Error ? error.message : '导入失败');
    } finally {
      isImporting = false;
    }
  }

  // ===== 键盘快捷键 =====
  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.card-editor-wrapper, input, textarea, [contenteditable="true"]')) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        goToPrevCard();
        break;
      case 'ArrowRight':
        goToNextCard();
        break;
      case ' ':
        event.preventDefault();
        toggleCurrentCard();
        break;
    }
  }

  // ===== 生命周期 =====
  $effect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown);
      loadDecks(); // 加载牌组列表
    }
    
    return () => {
      if (isOpen) {
        window.removeEventListener('keydown', handleKeydown);
      }
    };
  });

  // 重置状态 -  只在模态窗首次打开时重置currentIndex
  $effect(() => {
    if (isOpen) {
      if (!wasOpen) {
        // 首次打开：重置所有状态
        currentIndex = 0;
        selectedCardIds = new Set(cards.map(c => c.uuid)); // 默认全选
        showRegenerateDialog = false;
        wasOpen = true;
      }
      // 已打开状态下cards变化：不重置currentIndex，保持当前位置
    } else {
      // 关闭时重置标记
      wasOpen = false;
    }
  });
</script>

{#if isOpen}
  <div class="card-preview-overlay" role="presentation">
    <div 
      class="card-preview-modal" 
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-preview-title"
      tabindex="-1"
    >
      <!-- 预览头部 -->
      <div class="preview-header">
        <button class="back-btn" onclick={onClose} title={t('modals.cardPreview.back')}>
          <ObsidianIcon name="arrow-left" size={18} />
          <span>{t('modals.cardPreview.back')}</span>
        </button>

        <div class="preview-title">
          <h3 id="card-preview-title">{t('modals.cardPreview.title')}</h3>
          <div class="card-counter">
            <span class="current-num">{currentIndex + 1}</span>
            <span class="separator">/</span>
            <span class="total-num">{cards.length}</span>
            
            {#if isGenerating}
              <span class="generation-status">
                <ObsidianIcon name="loader" size={14} />
                <span>{t('modals.cardPreview.generatingProgress', { current: cards.length, total: totalCards })}</span>
              </span>
            {/if}
          </div>
        </div>

        <button class="preview-close" onclick={onClose} title={t('modals.cardPreview.close')}>
          <ObsidianIcon name="x" size={20} />
        </button>
      </div>

      <!-- 预览主体 -->
      <div class="preview-body">
        <div class="preview-main-content">
          {#if currentCard}
            <!-- 卡片显示 -->
            <div class="card-display">
              <!-- 卡片元信息 -->
              <div class="card-meta">
                <div class="card-meta-left">
                  {#if currentCard.metadata.difficulty}
                    <span class="difficulty-badge">{currentCard.metadata.difficulty}</span>
                  {/if}
                </div>

                <!-- 选择复选框（右上角） -->
                <label class="card-select-checkbox">
                  <input
                    type="checkbox"
                    checked={isCurrentCardSelected}
                    onchange={toggleCurrentCard}
                  />
                  <span>{t('modals.cardPreview.selectCard')}</span>
                </label>
              </div>

              <!-- 预览/编辑切换区域 -->
              {#if isEditMode}
                <!-- 编辑模式：Obsidian原生编辑器 -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  class="card-editor-wrapper"
                >
                  <div class="editor-toolbar">
                    <span class="editor-hint">编辑模式 - 使用 ---div--- 分隔正面和背面</span>
                  </div>
                  <div 
                    class="obsidian-editor-container" 
                    bind:this={editorContainer}
                  ></div>
                </div>
              {:else}
                <!-- 预览模式：使用统一的PreviewContainer组件 -->
                {#if previewCard}
                  <div class="card-preview-wrapper">
                    <PreviewContainer
                      card={previewCard}
                      bind:showAnswer={showPreviewAnswer}
                      {plugin}
                      enableAnimations={true}
                      enableAnswerControls={true}
                    />
                  </div>
                {:else}
                  <div class="card-section">
                    <div class="no-preview-warning">
                      卡片预览加载失败
                    </div>
                  </div>
                {/if}
              {/if}

              <!-- 操作按钮组 -->
              <div class="card-action-buttons">
                <!-- 编辑/预览切换按钮 -->
                <button
                  class="edit-content-btn"
                  onclick={toggleEditMode}
                  class:active={isEditMode}
                >
                  <ObsidianIcon name={isEditMode ? 'eye' : 'pencil'} size={16} />
                  <span>{isEditMode ? '预览' : '编辑内容'}</span>
                </button>
                
                <!-- 取消编辑按钮（仅编辑模式显示） -->
                {#if isEditMode}
                  <button
                    class="cancel-edit-btn"
                    onclick={cancelEditMode}
                  >
                    <ObsidianIcon name="x" size={16} />
                    <span>取消</span>
                  </button>
                {/if}
                
                <!-- 修改生成要求按钮（仅预览模式显示） -->
                {#if !isEditMode}
                  <button
                    class="regenerate-toggle-btn"
                    onclick={toggleRegenerateDialog}
                    class:active={showRegenerateDialog}
                  >
                    <ObsidianIcon name="message-square" size={16} />
                    <span>{t(showRegenerateDialog ? 'modals.cardPreview.collapseDialog' : 'modals.cardPreview.modifyRequirement')}</span>
                  </button>
                {/if}
              </div>
            </div>

            <!-- 重新生成对话框 -->
            {#if showRegenerateDialog}
              <RegenerateDialog
                {currentCard}
                onRegenerate={handleRegenerate}
              />
            {/if}
          {/if}
        </div>
      </div>

      <!-- 导航和操作区 -->
      <div class="preview-footer">
        <!-- 卡片导航 -->
        <div class="card-navigation">
          <button
            class="nav-btn"
            onclick={goToPrevCard}
            disabled={!canGoPrev}
            title={`${t('modals.cardPreview.prevCard')} (←)`}
          >
            <ObsidianIcon name="chevron-left" size={20} />
            <span>{t('modals.cardPreview.prevCard')}</span>
          </button>

          <!-- 缩略图条 -->
          <div class="thumbnail-strip">
            {#each cards as card, index}
              <div
                class="thumbnail"
                class:active={index === currentIndex}
                class:selected={selectedCardIds.has(card.uuid)}
                class:new={card.isNew}
                onclick={() => goToCard(index)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goToCard(index)}
                role="button"
                tabindex="0"
                title={`${t('modals.cardPreview.title')} ${index + 1}`}
              >
                <div class="thumbnail-number">{index + 1}</div>
                {#if selectedCardIds.has(card.uuid)}
                  <div class="thumbnail-check">
                    <ObsidianIcon name="check" size={12} />
                  </div>
                {/if}
              </div>
            {/each}
            
            {#if isGenerating && totalCards > cards.length}
              <!-- 骨架屏占位符（未生成的卡片） -->
              {#each Array(totalCards - cards.length) as _, index}
                <div class="thumbnail skeleton" title={`${t('modals.cardPreview.generating')} ${cards.length + index + 1}`}>
                  <div class="skeleton-loader"></div>
                </div>
              {/each}
            {/if}
          </div>

          <button
            class="nav-btn"
            onclick={goToNextCard}
            disabled={!canGoNext}
            title={`${t('modals.cardPreview.nextCard')} (→)`}
          >
            <span>{t('modals.cardPreview.nextCard')}</span>
            <ObsidianIcon name="chevron-right" size={20} />
          </button>
        </div>

        <!-- 底部操作栏 -->
        <div class="preview-actions">
          <!-- 批量操作 -->
          <div class="batch-actions">
            <button 
              class="action-btn" 
              onclick={toggleSelectAll} 
              title={t(isAllSelected ? 'modals.cardPreview.deselectAll' : 'modals.cardPreview.selectAll')}
            >
              <ObsidianIcon name={isAllSelected ? "square" : "check-square"} size={16} />
              <span>{t(isAllSelected ? 'modals.cardPreview.deselectAll' : 'modals.cardPreview.selectAll')}</span>
            </button>
          </div>

          <!-- 选择统计和导入 -->
          <div class="selection-info">
            <div class="selection-stats">
              <span class="selection-count">
                {t('modals.cardPreview.selected')} <strong>{selectedCount}</strong> / {cards.length} {t('modals.cardPreview.cardsUnit')}
              </span>
              
              <!-- 牌组选择器 -->
              <div class="deck-selector">
                <label for="target-deck">
                  导入到记忆牌组：
                </label>
                <ObsidianDropdown
                  className="target-deck-select"
                  value={selectedDeckId}
                  disabled={isImporting}
                  options={availableDecks.map((deck) => ({
                    id: deck.id,
                    label: truncateDeckName(deck.name),
                    description: deck.id === selectedDeckId ? deck.name : undefined
                  }))}
                  onchange={(value) => {
                    selectedDeckId = value;
                  }}
                />
              </div>
            </div>
            
            <button
              class="import-btn"
              onclick={handleImportCards}
              disabled={selectedCount === 0 || isImporting || !selectedDeckId}
            >
              <ObsidianIcon name="download" size={16} />
              <span>{t(isImporting ? 'modals.cardPreview.importing' : 'modals.cardPreview.importCards', { count: selectedCount })}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== 模态窗遮罩 ===== */
  .card-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-modal-backdrop, 1040);
    padding: 16px;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ===== 模态窗容器 ===== */
  .card-preview-modal {
    width: 100%;
    max-width: 900px;
    max-height: 90vh;
    background: var(--background-primary);
    border-radius: 12px;
    box-shadow: var(--shadow-l);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* ===== 预览头部 ===== */
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    flex-shrink: 0;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--text-muted);
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
  }

  .back-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .preview-title {
    flex: 1;
    text-align: center;
  }

  .preview-title h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: var(--text-normal);
  }

  .card-counter {
    font-size: 13px;
    color: var(--text-muted);
  }

  .card-counter .current-num {
    color: var(--text-accent);
    font-weight: 600;
  }

  .preview-close {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--text-muted);
    transition: all 0.2s;
    cursor: pointer;
  }

  .preview-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* ===== 预览主体 ===== */
  .preview-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .preview-main-content {
    width: 100%;
  }

  /* ===== 卡片显示 ===== */
  .card-display {
    background: var(--background-secondary);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 16px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 16px;
  }

  .card-meta-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .difficulty-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }

  .difficulty-badge {
    background: rgba(255, 166, 77, 0.1);
    color: #ff922b;
  }

  /* 卡片选中复选框 */
  .card-select-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    font-weight: 500;
    color: var(--text-normal);
  }

  .card-select-checkbox input[type='checkbox'] {
    cursor: pointer;
  }

  /* 统一预览容器包装器 */
  .card-preview-wrapper {
    /* PreviewContainer自带样式，这里只做必要的布局调整 */
    width: 100%;
    min-height: 200px;
  }

  /* 预览失败提示 */
  .no-preview-warning {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
  }

  /* 卡片内容区 */
  .card-section {
    margin-bottom: 20px;
  }

  .card-section:last-of-type {
    margin-bottom: 0;
  }

  /* 已移除未使用的CSS样式 - 预览现由PreviewContainer统一处理 */
  /* 包括：.section-header, .section-content, .cloze-content, .choice-options 等 */

  /* ===== 操作按钮组 ===== */
  .card-action-buttons {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }

  .edit-content-btn,
  .regenerate-toggle-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
  }

  .edit-content-btn {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .edit-content-btn:hover {
    background: var(--background-modifier-hover);
  }

  .edit-content-btn.active {
    background: var(--interactive-accent);
    color: white;
  }

  /* ===== 编辑器容器样式 ===== */
  .card-editor-wrapper {
    background: var(--background-primary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
    min-height: 300px;
  }

  .editor-toolbar {
    padding: 8px 12px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .editor-hint {
    font-size: 12px;
    color: var(--text-muted);
  }

  .obsidian-editor-container {
    min-height: 280px;
    max-height: 400px;
    overflow-y: auto;
  }

  /* Obsidian编辑器内部样式调整 */
  .obsidian-editor-container :global(.markdown-source-view) {
    padding: 12px;
  }

  .obsidian-editor-container :global(.cm-editor) {
    min-height: 260px;
  }

  .obsidian-editor-container :global(.cm-content) {
    padding: 8px 0;
  }

  /* 取消编辑按钮样式 */
  .cancel-edit-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
    background: var(--background-modifier-error);
    color: white;
  }

  .cancel-edit-btn:hover {
    opacity: 0.9;
  }

  /* 修改生成要求按钮 - 特定样式 */
  .regenerate-toggle-btn {
    background: var(--interactive-accent);
    color: white;
  }

  .regenerate-toggle-btn:hover {
    background: var(--interactive-accent-hover);
  }

  .regenerate-toggle-btn.active {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  /* ===== 预览底部 ===== */
  .preview-footer {
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    padding: 16px 24px;
    flex-shrink: 0;
  }

  /* 卡片导航 */
  .card-navigation {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
    flex-shrink: 0;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* 缩略图条 */
  .thumbnail-strip {
    flex: 1;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px;
  }

  .thumbnail-strip::-webkit-scrollbar {
    height: 4px;
  }

  .thumbnail-strip::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 2px;
  }

  .thumbnail {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--background-primary);
    border: 2px solid var(--background-modifier-border);
    transition: all 0.2s;
    cursor: pointer;
  }

  .thumbnail:hover {
    border-color: var(--text-accent);
  }

  .thumbnail.active {
    border-color: var(--text-accent);
    background: var(--color-accent-bg);
  }

  .thumbnail.selected {
    background: rgba(134, 239, 172, 0.1);
    border-color: #10b981;
  }

  .thumbnail-number {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .thumbnail.active .thumbnail-number {
    color: var(--text-accent);
  }

  .thumbnail-check {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #10b981;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ===== 底部操作栏 ===== */
  .preview-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .batch-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
  }

  .action-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .selection-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex: 1;
  }

  .selection-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .selection-count {
    font-size: 13px;
    color: var(--text-muted);
  }

  .selection-count strong {
    color: var(--text-accent);
    font-weight: 600;
  }

  /* 牌组选择器 */
  .deck-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .deck-selector label {
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
    white-space: nowrap;
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select) {
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
    min-height: 0;
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select:hover:not(.disabled)) {
    border-color: var(--text-accent);
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select:focus-visible) {
    outline: none;
    border-color: var(--text-accent);
    box-shadow: none;
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select.disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .import-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 8px;
    background: var(--interactive-accent);
    color: white;
    font-weight: 600;
    transition: all 0.2s;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .import-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .import-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ===== 响应式 ===== */
  @media (max-width: 768px) {
    .card-preview-modal {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .preview-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .batch-actions {
      justify-content: space-between;
    }

    .selection-info {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .selection-stats {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .deck-selector {
      width: 100%;
    }

    :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select) {
      flex: 1;
      min-width: auto;
    }

    .import-btn {
      justify-content: center;
      width: 100%;
    }
  }

  /* ===== 骨架屏和动画 ===== */
  .thumbnail.skeleton {
    position: relative;
    background: var(--background-modifier-border);
    cursor: not-allowed;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-loader {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.05),
      transparent
    );
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  /* 新卡片闪烁动画 */
  .thumbnail.new {
    animation: flashNew 0.6s ease-out;
    border-color: #10b981 !important;
  }

  @keyframes flashNew {
    0% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
      transform: scale(1.1);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      transform: scale(1);
    }
  }

  /* 生成状态指示 */
  .generation-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 12px;
    padding: 4px 8px;
    border-radius: 12px;
    background: rgba(59, 130, 246, 0.1);
    color: var(--text-accent);
    font-size: 12px;
    font-weight: 500;
  }

  .generation-status :global(.lucide) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
