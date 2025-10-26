<script lang="ts">
  import type { Deck, DeckStats } from '../../data/types';
  import type { ColorScheme, CardState } from '../../config/card-color-schemes';
  import { getCardState } from '../../config/card-color-schemes';

  interface Props {
    deck: Deck;
    stats: DeckStats;
    colorScheme: ColorScheme;
    categoryName: string;
    onStudy: () => void;
    onMenu: (event: MouseEvent) => void;
  }

  let { deck, stats, colorScheme, categoryName, onStudy, onMenu }: Props = $props();

  // 计算卡片状态
  const cardState = $derived<CardState>(
    getCardState(stats.newCards, stats.learningCards, stats.reviewCards)
  );

  // 获取当前状态的配色
  const currentColorConfig = $derived(colorScheme[cardState]);

  // 生成卡片主区域样式
  const mainStyle = $derived(() => {
    return `background: ${currentColorConfig.gradient}; color: ${currentColorConfig.textColor};`;
  });

  // 生成信息条样式
  const infoBarStyle = $derived(() => {
    return `background: ${colorScheme.infoBar.background}; color: ${colorScheme.infoBar.textColor};`;
  });

  // 处理点击事件
  function handleClick() {
    onStudy();
  }

  // 处理右键菜单
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    onMenu(event);
  }

  // 处理键盘事件
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<div 
  class="deck-grid-card"
  onclick={handleClick}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  role="button"
  tabindex="0"
  aria-label={`牌组: ${deck.name}`}
>
  <!-- 上方主区域：牌组名 -->
  <div class="card-main" style={mainStyle()}>
    <!-- 微妙的光效层 -->
    <div class="light-effect"></div>
    
    <div class="deck-title">
      {deck.name}
    </div>
  </div>

  <!-- 下方信息条 -->
  <div class="card-info-bar" style={infoBarStyle()}>
    <!-- 左侧：分类 -->
    <div class="info-left">
      <span class="category-name">{categoryName}</span>
    </div>

    <!-- 中间：统计数字（缩写） -->
    <div class="info-center">
      <div class="stat-item">
        <span class="stat-number">{stats.newCards}</span>
        <span class="stat-label">新</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">{stats.learningCards}</span>
        <span class="stat-label">学</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">{stats.reviewCards}</span>
        <span class="stat-label">复</span>
      </div>
    </div>

    <!-- 右侧：记忆率 -->
    <div class="info-right">
      <span class="memory-rate">{Math.round(stats.memoryRate * 100)}%</span>
    </div>
  </div>
</div>

<style>
  .deck-grid-card {
    height: 220px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
  }

  .deck-grid-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    filter: brightness(1.05);
  }

  .deck-grid-card:active {
    transform: translateY(-2px);
  }

  /* 上方主区域：牌组名 */
  .card-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px 20px;
    position: relative;
    overflow: hidden;
  }

  /* 微妙的光效层 */
  .light-effect {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(
      circle at 30% 20%,
      rgba(255, 255, 255, 0.08) 0%,
      transparent 60%
    );
    pointer-events: none;
  }

  .deck-title {
    font-family: 'Playfair Display', 'Noto Serif SC', serif;
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    line-height: 1.3;
    position: relative;
    z-index: 1;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    word-break: break-word;
  }

  /* 下方信息条 */
  .card-info-bar {
    height: 52px;
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    font-size: 13px;
    font-weight: 500;
  }

  .info-left {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .category-name {
    opacity: 0.85;
  }

  .info-center {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    justify-content: center;
  }

  .stat-item {
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .stat-number {
    font-weight: 600;
    font-size: 16px;
  }

  .stat-label {
    font-size: 12px;
    opacity: 0.85;
  }

  .info-right {
    font-weight: 600;
    font-size: 15px;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .deck-grid-card {
      height: 200px;
    }

    .deck-title {
      font-size: 20px;
    }

    .card-info-bar {
      height: 48px;
      padding: 0 16px;
      font-size: 12px;
    }

    .stat-number {
      font-size: 14px;
    }

    .info-center {
      gap: 8px;
    }
  }
</style>

