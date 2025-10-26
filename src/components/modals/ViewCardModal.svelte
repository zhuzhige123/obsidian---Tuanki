<!--
  查看卡片模态窗组件（重构版）
  职责：纯展示型模态窗，使用Tab方式展示卡片完整信息
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type AnkiPlugin from '../../main';
  import type { Card } from '../../data/types';
  import type { TabId } from '../../types/view-card-modal-types';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import TabNavigation from '../ui/TabNavigation.svelte';
  import CardInfoTab from './tabs/CardInfoTab.svelte';
  import ReviewStatsTab from './tabs/ReviewStatsTab.svelte';
  import MemoryCurveTab from './tabs/MemoryCurveTab.svelte';

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;

    /** 关闭回调 */
    onClose: () => void;

    /** 卡片数据 */
    card: Card;

    /** 插件实例 */
    plugin: AnkiPlugin;

    /** 所有牌组（可选） */
    allDecks?: Array<{id: string; name: string}>;
  }

  let {
    open = $bindable(),
    onClose,
    card,
    plugin,
    allDecks
  }: Props = $props();

  // 当前激活的Tab
  let activeTab = $state<TabId>('info');

  // Tab定义
  const tabs = [
    { id: 'info' as TabId, label: '卡片基本信息', icon: 'info' },
    { id: 'stats' as TabId, label: '复习数据', icon: 'bar-chart-2' },
    { id: 'curve' as TabId, label: '记忆曲线图', icon: 'activity' }
  ];

  // 牌组名称和模板名称
  let deckName = $state('加载中...');
  let templateName = $state('未知模板');

  // 加载关联数据
  onMount(async () => {
    try {
      // 获取牌组名称
      if (card.deckId) {
        if (allDecks) {
          const deck = allDecks.find(d => d.id === card.deckId);
          deckName = deck?.name || card.deckId;
        } else {
          const decks = await plugin.dataStorage.getAllDecks();
          const deck = decks.find(d => d.id === card.deckId);
          deckName = deck?.name || card.deckId;
        }
      } else {
        deckName = '无牌组';
      }

      // 获取模板名称
      if (card.templateId) {
        templateName = card.fields?.templateName || card.templateId;
      }
    } catch (error) {
      console.error('[ViewCardModal] 加载关联数据失败:', error);
    }
  });

  // 处理Tab切换
  function handleTabChange(tabId: string) {
    activeTab = tabId as TabId;
  }

  // 处理关闭
  function handleClose() {
    onClose();
  }
</script>

{#if open}
<ResizableModal
  bind:open
  {plugin}
  title="卡片详情"
  onClose={handleClose}
  enableTransparentMask={false}
  enableWindowDrag={false}
>
  <div class="view-card-modal-v2">
    <!-- Tab导航 -->
    <div class="modal-tabs">
      <TabNavigation
        {tabs}
        {activeTab}
        onTabChange={handleTabChange}
      />
    </div>

    <!-- Tab内容 -->
    <div class="modal-tab-content">
      {#if activeTab === 'info'}
        <CardInfoTab {card} {plugin} {deckName} {templateName} />
      {:else if activeTab === 'stats'}
        <ReviewStatsTab {card} />
      {:else if activeTab === 'curve'}
        <MemoryCurveTab {card} />
      {/if}
    </div>
  </div>
</ResizableModal>
{/if}

<style>
  .view-card-modal-v2 {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background-primary);
  }

  .modal-tabs {
    flex-shrink: 0;
    padding: 0;
    background: var(--background-primary);
  }

  .modal-tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 0;
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
</style>
