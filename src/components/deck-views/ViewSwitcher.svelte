<script lang="ts">
  /**
   * 视图切换器组件
   * 
   * 用于卡片管理界面的视图切换（表格/网格/看板）
   * 样式与 CategoryFilter 保持一致
   * 
   * @module components/deck-views/ViewSwitcher
   * @version 1.1.0
   * 🔧 v1.1.0 - 移除移动端特殊样式，与 CategoryFilter 完全统一
   */
  import { get } from 'svelte/store';
  import { tr } from '../../utils/i18n';
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';

  export type ViewType = 'table' | 'grid' | 'kanban';

  interface Props {
    currentView: ViewType;
    onViewChange: (view: ViewType) => void;
    /** 与旧版 MobileCardManagementHeader 一致：未开通会员时隐藏网格/看板圆点 */
    respectPremiumGates?: boolean;
  }

  let { currentView, onViewChange, respectPremiumGates = false }: Props = $props();

  let t = $derived($tr);

  const premiumGuard = PremiumFeatureGuard.getInstance();
  const featureContext = { page: 'weave-card-management' };
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));

  $effect(() => {
    const unsubscribePremium = premiumGuard.isPremiumActive.subscribe((value) => {
      isPremium = value;
    });
    const unsubscribePreview = premiumGuard.premiumFeaturesPreviewEnabled.subscribe((value) => {
      showPremiumFeaturesPreview = value;
    });

    return () => {
      unsubscribePremium();
      unsubscribePreview();
    };
  });

  const viewDefs: Array<{ id: ViewType; nameKey: string; colorStart: string; colorEnd: string }> = [
    {
      id: 'table',
      nameKey: 'decks.viewSwitcher.table',
      colorStart: '#ef4444',
      colorEnd: '#dc2626'
    },
    {
      id: 'grid',
      nameKey: 'decks.viewSwitcher.grid',
      colorStart: '#3b82f6',
      colorEnd: '#2563eb'
    },
    {
      id: 'kanban',
      nameKey: 'decks.viewSwitcher.kanban',
      colorStart: '#10b981',
      colorEnd: '#059669'
    }
  ];

  const views = $derived(viewDefs.map(v => ({ ...v, name: t(v.nameKey) })));

  const visibleViews = $derived(
    respectPremiumGates
      ? views.filter((view) => {
          if (view.id === 'grid') {
            return premiumGuard.shouldShowFeatureEntry(
              PREMIUM_FEATURES.GRID_VIEW,
              { isPremium, showPremiumPreview: showPremiumFeaturesPreview },
              featureContext
            );
          }
          if (view.id === 'kanban') {
            return premiumGuard.shouldShowFeatureEntry(
              PREMIUM_FEATURES.KANBAN_VIEW,
              { isPremium, showPremiumPreview: showPremiumFeaturesPreview },
              featureContext
            );
          }
          return true;
        })
      : views
  );

  function getGradientStyle(view: typeof views[0]): string {
    return `background: linear-gradient(135deg, ${view.colorStart}, ${view.colorEnd})`;
  }
</script>

<div class="view-switcher">
  {#each visibleViews as view}
    <button
      class="view-dot"
      class:selected={currentView === view.id}
      style={getGradientStyle(view)}
      onclick={() => onViewChange(view.id)}
      ontouchend={(e) => { e.preventDefault(); onViewChange(view.id); }}
      aria-label={view.name}
      title={view.name}
    >
      {#if currentView === view.id}
        <span class="selected-indicator"></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  /* ==================== 统一样式（桌面端和移动端相同） ==================== */
  /* 🔧 v1.1.0 - 与 CategoryFilter 完全一致，移除移动端特殊样式 */
  .view-switcher {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 0;
    margin-bottom: 4px;
  }

  .view-dot {
    position: relative;
    width: 20px; /* 🔧 与 CategoryFilter 保持一致 */
    height: 20px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    padding: 0;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* 🔧 扩大触控区域（不可见），确保移动端可点击 */
  .view-dot::before {
    content: '';
    position: absolute;
    top: -12px;
    left: -12px;
    right: -12px;
    bottom: -12px;
    border-radius: 50%;
  }

  .view-dot:hover {
    transform: scale(1.25);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .view-dot:active {
    transform: scale(1.15);
  }

  .view-dot:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .view-dot.selected {
    transform: scale(1.35);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  }

  /* 选中状态的脉冲边框 */
  .view-dot.selected::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.6);
    opacity: 0.6;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.15);
      opacity: 0.3;
    }
  }

  /* 选中指示器（白色小圆点） */
  .selected-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.5);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
</style>
