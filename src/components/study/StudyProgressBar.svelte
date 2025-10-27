<script lang="ts">
  import type { Card } from '../../data/types';
  import { CardState } from '../../data/types';
  import type { AnkiDataStorage } from '../../data/storage';
  
  // 🌍 导入国际化
  import { tr } from '../../utils/i18n';

  interface Props {
    deckId: string;
    dataStorage: AnkiDataStorage;
    refreshTrigger?: number; // 用于触发刷新的计数器
    className?: string;
  }

  let { deckId, dataStorage, refreshTrigger = 0, className = '' }: Props = $props();
  
  // 🌍 响应式翻译函数
  let t = $derived($tr);

  // 牌组所有卡片数据
  let allDeckCards = $state<Card[]>([]);
  let isLoading = $state(false);

  // 加载牌组所有卡片数据
  $effect(() => {
    // ✅ 显式读取 refreshTrigger，建立响应式依赖
    const trigger = refreshTrigger;
    
    if (deckId && dataStorage) {
      const loadCards = async () => {
        try {
          isLoading = true;
          const cards = await dataStorage.getCardsByDeck(deckId);
          allDeckCards = cards;
          console.log('StudyProgressBar - Loaded deck cards:', cards.length, 'Trigger:', trigger);
        } catch (error) {
          console.error('StudyProgressBar - Failed to load deck cards:', error);
          allDeckCards = [];
        } finally {
          isLoading = false;
        }
      };
      loadCards();
    }
  });

  // 牌组卡片状态分布计算（扩展为四种状态）
  let progressData = $derived(() => {
    const total = allDeckCards.length;

    if (total === 0) {
      return { newCards: 0, learning: 0, review: 0, mastered: 0, total: 0 };
    }

    const now = new Date();
    let newCards = 0;    // 新卡片
    let learning = 0;    // 学习中
    let review = 0;      // 待复习（到期）
    let mastered = 0;    // 已掌握（未到期）

    allDeckCards.forEach(card => {
      // 确保卡片有fsrs数据
      if (!card.fsrs) {
        newCards++; // 没有FSRS数据的当作新卡片
        return;
      }

      const fsrs = card.fsrs;
      const dueDate = new Date(fsrs.due);

      switch (fsrs.state) {
        case CardState.New:
          newCards++;
          break;
        case CardState.Learning:
        case CardState.Relearning:
          learning++; // 学习中状态
          break;
        case CardState.Review:
          if (dueDate <= now) {
            review++; // 到期需要复习
          } else {
            mastered++; // 已掌握未到期
          }
          break;
        default:
          newCards++; // 未知状态当作新卡片
          break;
      }
    });

    // 🔧 移除过多的日志输出，避免日志泛滥
    // console.log('StudyProgressBar - Deck Distribution:', {
    //   total,
    //   newCards,
    //   learning,
    //   review,
    //   mastered,
    //   deckId
    // });

    return {
      newCards,
      learning,
      review,
      mastered,
      total
    };
  });

  // 计算百分比
  let percentages = $derived(() => {
    const data = progressData();
    const { newCards, learning, review, mastered, total } = data;
    if (total === 0) return { newCards: 0, learning: 0, review: 0, mastered: 0 };

    return {
      newCards: (newCards / total) * 100,
      learning: (learning / total) * 100,
      review: (review / total) * 100,
      mastered: (mastered / total) * 100
    };
  });

  // 工具提示文本
  let tooltips = $derived(() => {
    const data = progressData();
    return {
      newCards: t('studyInterface.progress.newCards').replace('{n}', String(data.newCards)),
      learning: t('studyInterface.progress.learning').replace('{n}', String(data.learning)),
      review: t('studyInterface.progress.review').replace('{n}', String(data.review)),
      mastered: t('studyInterface.progress.mastered').replace('{n}', String(data.mastered)),
      total: t('studyInterface.progress.total').replace('{n}', String(data.total))
    };
  });
</script>

<div class="study-progress-container {className}">
  <div
    class="study-progress-bar"
    class:loading={isLoading}
    title={tooltips().total}
    role="progressbar"
    aria-label={t('studyInterface.progress.ariaLabel')}
  >
    <!-- 已掌握区域 (绿色) -->
    <div
      class="progress-segment mastered"
      style="width: {percentages().mastered}%"
      title={tooltips().mastered}
    ></div>

    <!-- 学习中区域 (黄色) -->
    <div
      class="progress-segment learning"
      style="width: {percentages().learning}%"
      title={tooltips().learning}
    ></div>

    <!-- 新卡片区域 (蓝色) -->
    <div
      class="progress-segment new"
      style="width: {percentages().newCards}%"
      title={tooltips().newCards}
    ></div>

    <!-- 待复习区域 (红色) -->
    <div
      class="progress-segment review"
      style="width: {percentages().review}%"
      title={tooltips().review}
    ></div>
  </div>
</div>

<style>
  .study-progress-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .study-progress-bar {
    position: relative;
    width: 200px;
    height: 8px;
    background: var(--background-modifier-form-field);
    border-radius: var(--tuanki-radius-sm);
    overflow: hidden;
    cursor: pointer;
    transition: var(--tuanki-transition-normal);
    display: flex;
    border: 1px solid var(--background-modifier-border);
  }

  .study-progress-bar:hover {
    transform: scaleY(1.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* 加载状态 */
  .study-progress-bar.loading {
    opacity: 0.6;
    pointer-events: none;
  }

  .progress-segment {
    height: 100%;
    transition: all 0.3s ease-in-out;
    position: relative;
    cursor: pointer;
  }

  .progress-segment:hover {
    filter: brightness(1.1);
    transform: scaleY(1.1);
    z-index: 1;
  }

  /* 优化的学习状态颜色方案 */
  .progress-segment.mastered {
    background: #10b981; /* 绿色 - 已掌握 */
  }

  .progress-segment.learning {
    background: #f59e0b; /* 黄色 - 学习中 */
  }

  .progress-segment.new {
    background: #3b82f6; /* 蓝色 - 新卡片 */
  }

  .progress-segment.review {
    background: #ef4444; /* 红色 - 待复习 */
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .study-progress-bar {
      width: 150px;
      height: 6px;
    }
  }

  /* 无障碍支持 */
  .progress-segment:focus {
    outline: 2px solid var(--text-accent);
    outline-offset: 2px;
  }

  /* 动画效果 */
  @keyframes progressUpdate {
    0% {
      transform: scaleX(0.95);
    }
    50% {
      transform: scaleX(1.05);
    }
    100% {
      transform: scaleX(1);
    }
  }

  .progress-segment {
    animation: progressUpdate 0.5s ease-out;
  }

  /* 暗色主题优化 - 使用统一的主题变量 */
  :global(body.theme-dark) .study-progress-bar {
    background: var(--background-modifier-form-field);
    border-color: var(--background-modifier-border);
    box-shadow: var(--tuanki-shadow-sm);
  }

  :global(body.theme-dark) .study-progress-bar:hover {
    box-shadow: var(--tuanki-shadow-md);
  }

  /* 暗色主题下的进度段颜色 - 优化对比度 */
  :global(body.theme-dark) .progress-segment.mastered {
    background: #059669; /* 深绿色 - 已掌握 */
  }

  :global(body.theme-dark) .progress-segment.learning {
    background: #d97706; /* 深黄色 - 学习中 */
  }

  :global(body.theme-dark) .progress-segment.new {
    background: #2563eb; /* 深蓝色 - 新卡片 */
  }

  :global(body.theme-dark) .progress-segment.review {
    background: #dc2626; /* 深红色 - 待复习 */
  }
</style>
