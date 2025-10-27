<script lang="ts">
  import type AnkiPlugin from '../../main';
  import type { GeneratedCard } from '../../types/ai-types';
  import type { Card } from '../../data/types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import RegenerateDialog from './RegenerateDialog.svelte';
  import PreviewContainer from '../preview/PreviewContainer.svelte';
  import { CardConverter } from '../../services/ai/CardConverter';
  import { Notice } from 'obsidian';

  interface Props {
    plugin: AnkiPlugin;
    cards: GeneratedCard[];
    isOpen: boolean;
    isGenerating?: boolean; // 🆕 是否正在生成
    totalCards?: number; // 🆕 总卡片数
    onClose: () => void;
    onImport: (selectedCards: GeneratedCard[], targetDeck: string) => Promise<void>;
  }

  let { 
    plugin, 
    cards, 
    isOpen, 
    isGenerating = false,
    totalCards = 0,
    onClose, 
    onImport 
  }: Props = $props();

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

  // 监听当前卡片变化，转换为预览用Card
  $effect(() => {
    if (currentCard) {
      try {
        previewCard = CardConverter.convertForPreview(currentCard);
        // 保持显示答案状态（不重置）
      } catch (error) {
        console.error('[CardPreviewModal] 卡片转换失败:', error);
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
    currentCard ? selectedCardIds.has(currentCard.id) : false
  );
  let canGoPrev = $derived(currentIndex > 0);
  let canGoNext = $derived(currentIndex < cards.length - 1);

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
    if (newSet.has(currentCard.id)) {
      newSet.delete(currentCard.id);
    } else {
      newSet.add(currentCard.id);
    }
    selectedCardIds = newSet;
  }

  function selectAll() {
    selectedCardIds = new Set(cards.map(c => c.id));
  }

  function deselectAll() {
    selectedCardIds = new Set();
  }

  function invertSelection() {
    const newSet = new Set<string>();
    cards.forEach(card => {
      if (!selectedCardIds.has(card.id)) {
        newSet.add(card.id);
      }
    });
    selectedCardIds = newSet;
  }

  // ===== 重新生成 =====
  function toggleRegenerateDialog() {
    showRegenerateDialog = !showRegenerateDialog;
  }

  async function handleRegenerate(instruction: string) {
    if (!currentCard) return;

    try {
      new Notice('正在重新生成卡片...');
      
      // 调用 AI 服务重新生成卡片
      const { AIServiceFactory } = await import('../../services/ai/AIServiceFactory');
      const aiService = AIServiceFactory.getDefaultService(plugin);
      
      // 根据卡片类型构建不同的提示词
      let regeneratePrompt = '';
      let typeDistribution = { qa: 0, cloze: 0, choice: 0 };
      
      if (currentCard.type === 'cloze') {
        typeDistribution.cloze = 100;
        regeneratePrompt = `
原始内容：${currentCard.front}
卡片类型：挖空题（cloze）

用户修改要求：${instruction}

请根据用户的修改要求重新生成这张挖空题卡片。

返回JSON数组，格式如下：
[
  {
    "type": "cloze",
    "front": "完整原文（用==文本==标记需要挖空的部分）",
    "back": ""
  }
]

注意：
1. 使用==文本==语法标记挖空部分（不是{{c1::}}）
2. back字段留空或重复front内容
3. 返回的必须是包含1个对象的JSON数组`;
      } else if (currentCard.type === 'choice') {
        typeDistribution.choice = 100;
        regeneratePrompt = `
原始问题：${currentCard.front}
原始选项：${JSON.stringify(currentCard.choices)}
正确答案索引：${currentCard.correctAnswer}
卡片类型：选择题（choice）

用户修改要求：${instruction}

请根据用户的修改要求重新生成这张选择题卡片。

返回JSON数组，格式如下：
[
  {
    "type": "choice",
    "front": "问题内容",
    "back": "正确答案文本",
    "choices": ["选项A", "选项B", "选项C", "选项D"],
    "correctAnswer": 0
  }
]

注意：
1. choices必须是包含4个选项的字符串数组
2. correctAnswer是正确答案的索引（0-3）
3. 返回的必须是包含1个对象的JSON数组`;
      } else {
        // QA题
        typeDistribution.qa = 100;
        regeneratePrompt = `
原始问题：${currentCard.front}
原始答案：${currentCard.back}
卡片类型：问答题（qa）

用户修改要求：${instruction}

请根据用户的修改要求重新生成这张问答题卡片。

返回JSON数组，格式如下：
[
  {
    "type": "qa",
    "front": "修改后的问题",
    "back": "修改后的答案"
  }
]

注意：返回的必须是包含1个对象的JSON数组`;
      }

      const aiConfig = plugin.settings.aiConfig!;
      const provider = aiConfig.defaultProvider;
      const providerConfig = aiConfig.apiKeys[provider];
      
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
          model: providerConfig.model,
          temperature: aiConfig.globalParams.temperature,
          maxTokens: aiConfig.globalParams.maxTokens,
          imageGeneration: {
            enabled: false,
            strategy: 'none',
            imagesPerCard: 0,
            placement: 'question'
          },
          autoTags: [],
          enableHints: false
        },
        () => {} // 不需要进度回调
      );
      
      if (response.success && response.cards && response.cards.length > 0) {
        // 更新卡片内容
        const regeneratedCard = response.cards[0];
        const updatedCard: typeof currentCard = {
          ...currentCard,
          front: regeneratedCard.front,
          back: regeneratedCard.back,
          // 更新选择题特有字段
          ...(currentCard.type === 'choice' && {
            choices: regeneratedCard.choices,
            correctAnswer: regeneratedCard.correctAnswer
          })
        };
        
        // 🔄 响应式更新：创建新数组以触发Svelte 5更新
        const newCards = [...cards];
        newCards[currentIndex] = updatedCard;
        cards = newCards;
        
        new Notice('卡片已重新生成');
        
        // 关闭对话框
        showRegenerateDialog = false;
      } else {
        throw new Error(response.error || '生成失败');
      }
    } catch (error) {
      console.error('Regenerate failed:', error);
      new Notice(error instanceof Error ? error.message : '重新生成失败');
    }
  }

  // ===== 加载牌组列表 =====
  async function loadDecks() {
    try {
      const decks = await plugin.dataStorage.getDecks();
      availableDecks = decks.map(deck => ({ id: deck.id, name: deck.name }));
      
      // 设置默认选中的牌组
      const defaultTargetDeck = plugin.settings.aiConfig?.generationDefaults?.targetDeck;
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
    } catch (error) {
      console.error('Load decks failed:', error);
      // 创建默认牌组备用
      availableDecks = [{ id: 'default', name: '默认牌组' }];
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

    const selectedCards = cards.filter(card => selectedCardIds.has(card.id));
    const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
    const deckName = selectedDeck?.name || selectedDeckId;

    try {
      isImporting = true;
      await onImport(selectedCards, selectedDeckId);
      new Notice(`成功导入 ${selectedCount} 张卡片到 ${deckName}`);
      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      new Notice(error instanceof Error ? error.message : '导入失败');
    } finally {
      isImporting = false;
    }
  }

  // ===== 键盘快捷键 =====
  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        onClose();
        break;
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
      return () => {
        window.removeEventListener('keydown', handleKeydown);
      };
    }
  });

  // 重置状态
  $effect(() => {
    if (isOpen) {
      currentIndex = 0;
      selectedCardIds = new Set(cards.map(c => c.id)); // 默认全选
      showRegenerateDialog = false;
    }
  });
</script>

{#if isOpen}
  <!-- 模态窗遮罩 -->
  <div class="card-preview-overlay" onclick={onClose}>
    <!-- 模态窗容器 -->
    <div class="card-preview-modal" onclick={(e) => e.stopPropagation()}>
      <!-- 预览头部 -->
      <div class="preview-header">
        <button class="back-btn" onclick={onClose} title="返回">
          <ObsidianIcon name="arrow-left" size={18} />
          <span>返回</span>
        </button>

        <div class="preview-title">
          <h3>卡片预览</h3>
          <div class="card-counter">
            <span class="current-num">{currentIndex + 1}</span>
            <span class="separator">/</span>
            <span class="total-num">{cards.length}</span>
            
            {#if isGenerating}
              <span class="generation-status">
                <ObsidianIcon name="loader" size={14} />
                <span>正在生成 {cards.length}/{totalCards}</span>
              </span>
            {/if}
          </div>
        </div>

        <button class="preview-close" onclick={onClose} title="关闭">
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
                  <span class="template-badge">{currentCard.type}</span>
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
                  <span>选择此卡片</span>
                </label>
              </div>

              <!-- 使用统一的PreviewContainer组件 -->
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
                    ⚠️ 卡片预览加载失败
                  </div>
                </div>
              {/if}

              <!-- 修改生成要求按钮 -->
              <button
                class="regenerate-toggle-btn"
                onclick={toggleRegenerateDialog}
                class:active={showRegenerateDialog}
              >
                <ObsidianIcon name="message-square" size={16} />
                <span>{showRegenerateDialog ? '收起对话' : '修改生成要求'}</span>
              </button>
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
            title="上一张 (←)"
          >
            <ObsidianIcon name="chevron-left" size={20} />
            <span>上一张</span>
          </button>

          <!-- 缩略图条 -->
          <div class="thumbnail-strip">
            {#each cards as card, index}
              <button
                class="thumbnail"
                class:active={index === currentIndex}
                class:selected={selectedCardIds.has(card.id)}
                class:new={card.isNew}
                onclick={() => goToCard(index)}
                title={`卡片 ${index + 1}`}
              >
                <div class="thumbnail-number">{index + 1}</div>
                {#if selectedCardIds.has(card.id)}
                  <div class="thumbnail-check">
                    <ObsidianIcon name="check" size={12} />
                  </div>
                {/if}
              </button>
            {/each}
            
            {#if isGenerating && totalCards > cards.length}
              <!-- 骨架屏占位符（未生成的卡片） -->
              {#each Array(totalCards - cards.length) as _, index}
                <div class="thumbnail skeleton" title={`等待生成第 ${cards.length + index + 1} 张`}>
                  <div class="skeleton-loader"></div>
                </div>
              {/each}
            {/if}
          </div>

          <button
            class="nav-btn"
            onclick={goToNextCard}
            disabled={!canGoNext}
            title="下一张 (→)"
          >
            <span>下一张</span>
            <ObsidianIcon name="chevron-right" size={20} />
          </button>
        </div>

        <!-- 底部操作栏 -->
        <div class="preview-actions">
          <!-- 批量操作 -->
          <div class="batch-actions">
            <button class="action-btn" onclick={selectAll} title="全选">
              <ObsidianIcon name="check-square" size={16} />
              <span>全选</span>
            </button>
            <button class="action-btn" onclick={deselectAll} title="取消全选">
              <ObsidianIcon name="square" size={16} />
              <span>取消全选</span>
            </button>
            <button class="action-btn" onclick={invertSelection} title="反选">
              <ObsidianIcon name="minus-square" size={16} />
              <span>反选</span>
            </button>
          </div>

          <!-- 选择统计和导入 -->
          <div class="selection-info">
            <div class="selection-stats">
              <span class="selection-count">
                已选择 <strong>{selectedCount}</strong> / {cards.length} 张
              </span>
              
              <!-- 牌组选择器 -->
              <div class="deck-selector">
                <label for="target-deck">导入到：</label>
                <select
                  id="target-deck"
                  bind:value={selectedDeckId}
                  disabled={isImporting}
                >
                  {#each availableDecks as deck}
                    <option value={deck.id}>{deck.name}</option>
                  {/each}
                </select>
              </div>
            </div>
            
            <button
              class="import-btn"
              onclick={handleImportCards}
              disabled={selectedCount === 0 || isImporting || !selectedDeckId}
            >
              <ObsidianIcon name="download" size={16} />
              <span>{isImporting ? '导入中...' : `导入 ${selectedCount} 张卡片`}</span>
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
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--tuanki-z-modal-backdrop, 1040);
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
    max-width: 700px;
    margin: 0 auto;
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

  .template-badge,
  .difficulty-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }

  .template-badge {
    background: var(--color-accent-bg);
    color: var(--text-accent);
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

  /* 修改生成要求按钮 */
  .regenerate-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    margin-top: 16px;
    border-radius: 8px;
    background: var(--interactive-accent);
    color: white;
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
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
  }

  .deck-selector select {
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 150px;
  }

  .deck-selector select:hover:not(:disabled) {
    border-color: var(--text-accent);
  }

  .deck-selector select:focus {
    outline: none;
    border-color: var(--text-accent);
    box-shadow: 0 0 0 2px var(--color-accent-bg);
  }

  .deck-selector select:disabled {
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

    .deck-selector select {
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

