<script lang="ts">
  /**
   * 牌组模式筛选器
   * 当前主牌组页使用两种模式切换
   * - memory: 记忆牌组（FSRS学习）
   * - question-bank: 题库牌组（考试测试）
   * 
   * `DeckFilter` 仍保留旧值类型，便于读取历史状态：
   * - parent: 父卡片牌组（已废弃，映射到memory）
   * - child: 子卡片牌组（已废弃，映射到memory）
   * - all: 全部牌组（已废弃，映射到memory）
   * 
   * 移动端样式统一
   * - 移除移动端特殊样式，桌面端和移动端使用相同的 16px 圆点
   * - 通过扩大触控区域（::before 伪元素）确保移动端可点击性
   */
  import { tr } from '../../utils/i18n';
  import { get } from 'svelte/store';
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';

  export type DeckFilter = 'memory' | 'reading' | 'question-bank' | 'parent' | 'child' | 'all';

  interface Props {
    selectedFilter: DeckFilter;
    onSelect: (filter: DeckFilter) => void;
  }

  let { selectedFilter, onSelect }: Props = $props();

  let t = $derived($tr);
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));

  $effect(() => {
    const unsubscribePremium = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    const unsubscribePreview = premiumGuard.premiumFeaturesPreviewEnabled.subscribe(value => {
      showPremiumFeaturesPreview = value;
    });

    return () => {
      unsubscribePremium();
      unsubscribePreview();
    };
  });

  const filterDefs: Array<{ id: DeckFilter; nameKey: string; icon: string; colorStart: string; colorEnd: string }> = [
    {
      id: 'memory',
      nameKey: 'decks.categoryFilter.memory',
      icon: '📚',
      colorStart: '#3b82f6',
      colorEnd: '#2563eb'
    },
    {
      id: 'question-bank',
      nameKey: 'decks.categoryFilter.questionBank',
      icon: '📝',
      colorStart: '#10b981',
      colorEnd: '#059669'
    }
  ];

  const filters = $derived(filterDefs.map(f => ({ ...f, name: t(f.nameKey) })));
  const visibleFilters = $derived(
    filters.filter(filter => {
      if (filter.id === 'question-bank') {
        return premiumGuard.shouldShowFeatureEntry(PREMIUM_FEATURES.QUESTION_BANK, {
          isPremium,
          showPremiumPreview: showPremiumFeaturesPreview
        });
      }

      return true;
    })
  );

  function getGradientStyle(filter: typeof filters[0]): string {
    return `background: linear-gradient(135deg, ${filter.colorStart}, ${filter.colorEnd})`;
  }
</script>

<div class="category-filter">
  {#each visibleFilters as filter}
    <button
      class="category-dot"
      class:selected={selectedFilter === filter.id}
      style={getGradientStyle(filter)}
      onclick={() => onSelect(filter.id)}
      ontouchend={(e) => { e.preventDefault(); onSelect(filter.id); }}
      aria-label={filter.name}
      title={filter.name}
    >
      {#if selectedFilter === filter.id}
        <span class="selected-indicator"></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  /* ==================== 统一样式（桌面端和移动端相同） ==================== */
  /* 移除移动端特殊样式，使用统一的圆点尺寸 */
  .category-filter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 0;
    margin-bottom: 4px;
  }

  .category-dot {
    position: relative;
    width: 20px; /* 使用 20px 尺寸，移动端更易识别 */
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

  /*  扩大触控区域（不可见），确保移动端可点击 */
  .category-dot::before {
    content: '';
    position: absolute;
    top: -12px;
    left: -12px;
    right: -12px;
    bottom: -12px;
    border-radius: 50%;
  }

  .category-dot:hover {
    transform: scale(1.25);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .category-dot:active {
    transform: scale(1.15);
  }

  .category-dot:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .category-dot.selected {
    transform: scale(1.35);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  }

  /* 选中状态的脉冲边框 */
  .category-dot.selected::after {
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
