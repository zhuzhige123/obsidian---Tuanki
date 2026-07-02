<!--
  题库考试卡片详情模态窗组件
  职责：纯展示型模态窗，使用Tab方式展示测试卡片完整信息
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '../../utils/logger';

  import { Platform } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import TabNavigation from '../ui/TabNavigation.svelte';
  import QuestionBankCardInfoTab from './tabs/QuestionBankCardInfoTab.svelte';
  import TestStatsTab from './tabs/TestStatsTab.svelte';
  // 🌍 导入国际化
  import { tr } from '../../utils/i18n';

  // 📱 移动端检测
  const isMobile = Platform.isMobile;

  // 响应式翻译函数
  let t = $derived($tr);

  interface Props {
    /** 卡片数据 */
    card: Card;

    /** 插件实例 */
    plugin: WeavePlugin;

    /** 所有牌组（可选） */
    allDecks?: Array<{id: string; name: string}>;
  }

  let {
    card,
    plugin,
    allDecks
  }: Props = $props();

  // 内部卡片状态 - 用于动态刷新
  let currentCard = $state<Card>(untrack(() => card));

  // 当前激活的Tab
  let activeTab = $state<string>('info');

  // Tab定义（测试卡片专用）- 📱 移动端显示文本功能键（不显示图标）
  let tabs = $derived([
    { id: 'info' as const, label: t('study.questionBankUI.detailModal.infoTab'), icon: '' },
    { id: 'stats' as const, label: t('study.questionBankUI.detailModal.statsTab'), icon: '' }
  ]);

  // 牌组名称 - 使用$derived确保响应式更新
  let deckName = $state('');
  
  // 响应式初始化翻译文本
  $effect(() => {
    if (!deckName) deckName = t('study.questionBankUI.cardInfoTab.loading');
  });

  // 监听模态窗打开状态，重新读取最新卡片数据
  $effect(() => {
    if (card.uuid) {
      // 异步刷新卡片数据
      (async () => {
        try {
          const latestCard = await plugin.dataStorage.getCardByUUID(card.uuid);
          if (latestCard) {
            currentCard = latestCard;
            logger.debug('[QuestionBankCardDetailModal] ✅ 刷新卡片数据:', {
              uuid: latestCard.uuid,
              cardPurpose: latestCard.cardPurpose
            });
          }
        } catch (error) {
          logger.error('[QuestionBankCardDetailModal] 刷新卡片数据失败:', error);
          currentCard = card; // 刷新失败时使用传入的卡片
        }
      })();
    }
  });

  // 使用$effect响应式加载关联数据（基于currentCard变化）
  $effect(() => {
    if (currentCard) {
      (async () => {
        try {
          // 获取牌组名称
          if (currentCard.deckId) {
            if (allDecks) {
              const deck = allDecks.find(d => d.id === currentCard.deckId);
              deckName = deck?.name || currentCard.deckId;
            } else {
              const decks = await plugin.dataStorage.getAllDecks();
              const deck = decks.find(d => d.id === currentCard.deckId);
              deckName = deck?.name || currentCard.deckId;
            }
          } else {
            deckName = t('study.questionBankUI.detailModal.noDeck');
          }
        } catch (error) {
          logger.error('[QuestionBankCardDetailModal] 加载关联数据失败:', error);
        }
      })();
    }
  });

  // 处理Tab切换
  function handleTabChange(tabId: string) {
    activeTab = tabId;
  }
</script>

<div class="question-bank-detail-modal" class:mobile={isMobile}>
  <!-- Tab导航 -->
  <div class="modal-tabs" class:mobile={isMobile}>
    <TabNavigation
      {tabs}
      {activeTab}
      onTabChange={handleTabChange}
      useObsidianIcons={false}
      toolbarStyle={true}
    />
  </div>

  <!-- Tab内容 -->
  <div class="modal-tab-content" class:mobile={isMobile}>
    {#if activeTab === 'info'}
      <QuestionBankCardInfoTab card={currentCard} {plugin} {deckName} {isMobile} />
    {:else if activeTab === 'stats'}
      <TestStatsTab card={currentCard} {isMobile} />
    {/if}
  </div>
</div>

<style>
  .question-bank-detail-modal {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary);
  }

  .modal-tabs {
    flex-shrink: 0;
    padding: 12px 16px 0 16px;
    background: transparent;
  }

  .modal-tabs :global(.tab-navigation) {
    width: fit-content;
    max-width: 100%;
  }

  .modal-tabs :global(.tab-button.active .tab-label) {
    font-weight: 600;
  }

  .modal-tabs :global(.tab-button svg) {
    flex-shrink: 0;
  }

  .modal-tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    min-height: 0;
  }

  /* 滚动条样式 */
  .modal-tab-content::-webkit-scrollbar {
    width: 8px;
  }

  .modal-tab-content::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .modal-tab-content::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .modal-tab-content::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* ==================== 📱 移动端适配样式 ==================== */
  
  /* 移动端模态窗容器 - 限制高度，避免过长 */
  .question-bank-detail-modal.mobile {
    max-height: 70vh;
    min-height: 0;
    overflow: hidden;
  }

  /* 移动端Tab导航 - 图标居中，增大触摸区域 */
  .modal-tabs.mobile {
    padding: 8px 12px 0 12px;
  }

  .modal-tabs.mobile :global(.tab-navigation) {
    gap: 4px;
  }

  .modal-tabs.mobile :global(.tab-button) {
    min-height: 40px;
    padding: 8px 12px;
    flex: 1;
    justify-content: center;
  }

  /* 移动端Tab内容区域 */
  .modal-tab-content.mobile {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
</style>
