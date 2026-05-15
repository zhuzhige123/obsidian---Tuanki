<script lang="ts">
  import type { MemoryDeckLevelProgress } from '../../services/deck/MemoryDeckLevelService';

  interface Props {
    progress: MemoryDeckLevelProgress;
    size?: number;
    ringColor?: string;
  }

  let {
    progress,
    size = 58,
    ringColor = '#4ade80'
  }: Props = $props();

  const normalizedSize = $derived(Math.max(36, Math.floor(size)));
  const strokeWidth = $derived(normalizedSize <= 44 ? 3 : 4);
  const radius = $derived(18 - strokeWidth * 0.5);
  const circumference = $derived(2 * Math.PI * radius);
  const clampedProgress = $derived(Math.max(0, Math.min(100, progress.progressPercent || 0)));
  const dashOffset = $derived(circumference * (1 - clampedProgress / 100));
  const levelText = $derived(String(progress.level));
  const titleText = $derived(
    progress.isMaxLevel
      ? `等级 ${progress.level} · 已满级 · 已掌握 ${progress.masteredCardCount} 张`
      : `等级 ${progress.level} · 已掌握 ${progress.masteredCardCount} 张 · 距下一级还需 ${progress.experienceNeededForNextLevel} 张`
  );
</script>

<div
  class="deck-level-badge"
  style={`width:${normalizedSize}px; height:${normalizedSize}px; --deck-level-ring:${ringColor};`}
  title={titleText}
  aria-label={titleText}
>
  <svg class="deck-level-badge__ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle
      class="deck-level-badge__ring-bg"
      cx="18"
      cy="18"
      r={radius}
      stroke-width={strokeWidth}
    />
    <circle
      class="deck-level-badge__ring-progress"
      cx="18"
      cy="18"
      r={radius}
      stroke-width={strokeWidth}
      stroke-dasharray={circumference}
      stroke-dashoffset={dashOffset}
    />
  </svg>
  <div class="deck-level-badge__content">
    <span class="deck-level-badge__label">Lv</span>
    <span class="deck-level-badge__value">{levelText}</span>
  </div>
</div>

<style>
  .deck-level-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.2);
    backdrop-filter: blur(10px);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
  }

  .deck-level-badge__ring {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    overflow: visible;
  }

  .deck-level-badge__ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.16);
  }

  .deck-level-badge__ring-progress {
    fill: none;
    stroke: var(--deck-level-ring);
    stroke-linecap: round;
    transition: stroke-dashoffset 220ms ease;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--deck-level-ring) 38%, transparent));
  }

  .deck-level-badge__content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1;
    color: rgba(255, 255, 255, 0.96);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
    pointer-events: none;
  }

  .deck-level-badge__label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    opacity: 0.82;
    margin-bottom: 1px;
  }

  .deck-level-badge__value {
    font-size: 16px;
    font-weight: 700;
  }
</style>
