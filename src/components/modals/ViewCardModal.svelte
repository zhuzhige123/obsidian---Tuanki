<!--
  查看卡片模态窗组件（重构版）
  职责：纯展示型模态窗，使用Tab方式展示卡片完整信息
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '../../utils/logger';

  import { Platform } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import type { ResolvedDeckRef } from '../../types/emergent-deck-types';
  import type { TabId } from '../../types/view-card-modal-types';
  import TabNavigation from '../ui/TabNavigation.svelte';
  import CardInfoTab from './tabs/CardInfoTab.svelte';
  import ReviewStatsTab from './tabs/ReviewStatsTab.svelte';
  import MemoryCurveTab from './tabs/MemoryCurveTab.svelte';
  //  导入国际化
  import { tr } from '../../utils/i18n';
  // 导入 YAML 工具函数以获取牌组名称
  import { getCardDeckNames } from '../../utils/yaml-utils';

  //  移动端检测
  const isMobile = Platform.isMobile;

  //  响应式翻译函数
  let t = $derived($tr);

  interface Props {
    /** 卡片数据 */
    card: Card;

    /** 插件实例 */
    plugin: WeavePlugin;

    /** 所有牌组（可选） */
    allDecks?: Array<{id: string; name: string}>;
    resolvedDeckRefs?: ResolvedDeckRef[];
  }

  let {
    card,
    plugin,
    allDecks,
    resolvedDeckRefs = []
  }: Props = $props();

  // 内部卡片状态，用于动态刷新
  let currentCard = $state<Card>(untrack(() => card));

  // 当前激活的Tab
  let activeTab = $state<TabId>('info');

  // Tab定义 - 移动端显示文本功能键（不显示图标）
  let tabs = $derived([
    { id: 'info' as TabId, label: t('modals.viewCard.tabInfo'), icon: '' },
    { id: 'stats' as TabId, label: t('modals.viewCard.tabStats'), icon: '' },
    { id: 'curve' as TabId, label: t('modals.viewCard.tabCurve'), icon: '' }
  ]);

  // 牌组名称和模板名称 - 使用$derived确保响应式更新
  let deckName = $state('');
  let templateName = $state('');
  
  // 响应式初始化翻译文本
  $effect(() => {
    if (!deckName) deckName = t('modals.viewCard.loading');
    if (!templateName) templateName = t('modals.viewCard.unknownTemplate');
  });

  // 监听模态窗打开状态，重新读取最新卡片数据
  $effect(() => {
    if (card.uuid) {
      // 异步刷新卡片数据
      (async () => {
        try {
          const latestCard = await plugin.directFileReader.getCardByUUID(card.uuid);
          if (latestCard) {
            currentCard = latestCard;
            logger.debug('[ViewCardModal] ✅ 刷新卡片数据:', {
              uuid: latestCard.uuid,
              type: latestCard.type
            });
          }
        } catch (error) {
          logger.error('[ViewCardModal] 刷新卡片数据失败:', error);
          currentCard = card; // 刷新失败时使用传入的卡片
        }
      })();
    }
  });

  // 使用 $effect 响应式加载关联数据（基于 currentCard 变化）
  $effect(() => {
    if (currentCard) {
      (async () => {
        try {
          // 优先从 content YAML 的 we_decks 获取牌组名称
          const decks = allDecks || await plugin.dataStorage.getAllDecks();
          const names =
            resolvedDeckRefs.length > 0
              ? resolvedDeckRefs.map((ref) => ref.name)
              : getCardDeckNames(currentCard, decks, t('modals.viewCard.noDeck'));
          deckName = names.join(', ');

          // 获取模板名称
          if (currentCard.templateId) {
            templateName = currentCard.fields?.templateName || currentCard.templateId;
          }
        } catch (error) {
          logger.error('[ViewCardModal] 加载关联数据失败:', error);
        }
      })();
    }
  });

  // 处理Tab切换
  function handleTabChange(tabId: string) {
    activeTab = tabId as TabId;
  }
</script>

<div class="view-card-modal-v2" class:mobile={isMobile}>
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
      <CardInfoTab card={currentCard} {plugin} {deckName} {templateName} {resolvedDeckRefs} />
    {:else if activeTab === 'stats'}
      <ReviewStatsTab card={currentCard} />
    {:else if activeTab === 'curve'}
      <MemoryCurveTab card={currentCard} />
    {/if}
  </div>
</div>

<style>
  .view-card-modal-v2 {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: linear-gradient(
      180deg,
      var(--background-primary) 0%,
      var(--background-primary) 70%,
      var(--background-secondary) 100%
    );
    gap: 8px;
  }

  .modal-tabs {
    flex-shrink: 0;
    padding: 12px 14px 0 14px;
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
    padding: 0 14px 14px 14px;
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

  /* ====================  移动端适配样式 ==================== */
  
  /* 移动端模态窗容器 - 限制高度，避免过长 */
  .view-card-modal-v2.mobile {
    /*  移动端：限制最大高度为屏幕高度的 70%，避免模态窗过长 */
    max-height: 72vh;
    min-height: 0;
    overflow: hidden;
  }

  /* 移动端Tab导航 - 图标居中，增大触摸区域 */
  .modal-tabs.mobile {
    padding: 8px 10px 0 10px;
  }

  .modal-tabs.mobile :global(.tab-navigation) {
    gap: 4px;
  }

  .modal-tabs.mobile :global(.tab-button) {
    min-height: 40px;
    padding: 8px 11px;
    flex: 1;
    justify-content: center;
  }

  /* 移动端Tab内容区域 */
  .modal-tab-content.mobile {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 0 10px 10px 10px;
  }

  /* 移动端内部组件样式调整 */
  .modal-tab-content.mobile :global(.card-info-tab),
  .modal-tab-content.mobile :global(.review-stats-tab) {
    padding: 12px;
    gap: 12px;
  }

  .modal-tab-content.mobile :global(.info-section),
  .modal-tab-content.mobile :global(.stats-section) {
    padding: 12px;
  }

  .modal-tab-content.mobile :global(.section-title) {
    font-size: 14px;
    margin-bottom: 12px;
  }

  /* 移动端信息行 - 单列布局 */
  .modal-tab-content.mobile :global(.info-row) {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .modal-tab-content.mobile :global(.info-label) {
    font-size: 12px;
  }

  .modal-tab-content.mobile :global(.info-value) {
    font-size: 14px;
  }

  /* 移动端按钮 - 增大触摸区域 */
  .modal-tab-content.mobile :global(.uuid-button),
  .modal-tab-content.mobile :global(.link-button) {
    min-height: 36px;
    padding: 8px 12px;
  }

  /* 移动端统计卡片网格 - 2列布局 */
  .modal-tab-content.mobile :global(.stats-grid) {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  /* 移动端FSRS指标 - 单列布局 */
  .modal-tab-content.mobile :global(.fsrs-metrics) {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .modal-tab-content.mobile :global(.metric-card) {
    padding: 12px;
  }

  .modal-tab-content.mobile :global(.metric-value) {
    font-size: 24px;
  }

  /* 移动端复习计划网格 - 2列布局 */
  .modal-tab-content.mobile :global(.schedule-grid) {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .modal-tab-content.mobile :global(.schedule-item) {
    padding: 10px;
  }

  /* 移动端时间线样式 */
  .modal-tab-content.mobile :global(.timeline-section) {
    padding: 12px;
  }

  .modal-tab-content.mobile :global(.timeline-simple) {
    flex-wrap: wrap;
    gap: 8px;
  }

  .modal-tab-content.mobile :global(.timeline-actions) {
    width: 100%;
    margin-top: 8px;
  }

  /* 移动端卡片内容预览 */
  .modal-tab-content.mobile :global(.card-content-preview) {
    max-height: 200px;
    padding: 10px;
  }

  .modal-tab-content.mobile :global(.content-text) {
    font-size: 13px;
  }

  /* 移动端标签容器 */
  .modal-tab-content.mobile :global(.tags-container) {
    gap: 6px;
  }

  .modal-tab-content.mobile :global(.tag) {
    padding: 4px 8px;
    font-size: 12px;
  }

  /* 移动端关系徽章 */
  .modal-tab-content.mobile :global(.relation-badges-group) {
    gap: 4px;
  }

  .modal-tab-content.mobile :global(.relation-badge) {
    padding: 2px 8px;
    font-size: 11px;
  }
</style>
