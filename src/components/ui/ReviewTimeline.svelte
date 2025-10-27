<script lang="ts">
  import EnhancedIcon from './EnhancedIcon.svelte';
  import { formatRelativeTime } from '../../utils/helpers';
  import { getRatingColor, getRatingLabel } from '../../utils/memory-curve-utils';
  import type { ReviewLog } from '../../data/types';

  interface Props {
    /** 复习历史记录 */
    reviews: ReviewLog[];
    /** 最大显示数量 */
    maxItems?: number;
  }

  let { reviews, maxItems = 20 }: Props = $props();

  // 排序并限制显示数量
  const displayReviews = $derived(() => {
    return [...reviews]
      .sort((a, b) => new Date(b.review).getTime() - new Date(a.review).getTime())
      .slice(0, maxItems);
  });

  // 获取评分图标
  function getRatingIcon(rating: number): string {
    switch (rating) {
      case 1: return 'x-circle';
      case 2: return 'alert-circle';
      case 3: return 'check-circle';
      case 4: return 'star';
      default: return 'circle';
    }
  }
</script>

<div class="review-timeline">
  {#if displayReviews().length === 0}
    <div class="timeline-empty">
      <EnhancedIcon name="clock" size={32} />
      <p>暂无复习记录</p>
    </div>
  {:else}
    {#each displayReviews() as review, index}
      <div class="timeline-item" style:--rating-color={getRatingColor(review.rating)}>
        <div class="timeline-marker">
          <EnhancedIcon name={getRatingIcon(review.rating)} size={16} />
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-rating">{getRatingLabel(review.rating)}</span>
            <span class="timeline-time">{formatRelativeTime(review.review)}</span>
          </div>
          <div class="timeline-details">
            <span class="detail-item">
              <EnhancedIcon name="calendar" size={12} />
              间隔 {review.scheduledDays}天
            </span>
            <span class="detail-item">
              <EnhancedIcon name="trending-up" size={12} />
              稳定性 {review.stability.toFixed(1)}天
            </span>
            <span class="detail-item">
              <EnhancedIcon name="activity" size={12} />
              难度 {review.difficulty.toFixed(1)}
            </span>
          </div>
        </div>
        {#if index < displayReviews().length - 1}
          <div class="timeline-connector"></div>
        {/if}
      </div>
    {/each}
    
    {#if reviews.length > maxItems}
      <div class="timeline-more">
        还有 {reviews.length - maxItems} 条复习记录
      </div>
    {/if}
  {/if}
</div>

<style>
  .review-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 400px;
    overflow-y: auto;
    padding: var(--size-4-2);
  }

  .timeline-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--size-4-8) var(--size-4-4);
    color: var(--text-muted);
    text-align: center;
  }

  .timeline-empty p {
    margin-top: var(--size-4-2);
    font-size: var(--font-ui-medium);
  }

  .timeline-item {
    position: relative;
    display: flex;
    padding-left: 36px;
    padding-bottom: var(--size-4-3);
  }

  .timeline-marker {
    position: absolute;
    left: 0;
    top: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--rating-color);
    color: white;
    border-radius: 50%;
    z-index: 2;
  }

  .timeline-connector {
    position: absolute;
    left: 13px;
    top: 28px;
    width: 2px;
    height: calc(100% - 20px);
    background: var(--background-modifier-border);
    z-index: 1;
  }

  .timeline-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--size-4-1);
    padding-left: var(--size-4-2);
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--size-4-2);
  }

  .timeline-rating {
    font-weight: 600;
    color: var(--text-normal);
    font-size: var(--font-ui-medium);
  }

  .timeline-time {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
  }

  .timeline-details {
    display: flex;
    flex-wrap: wrap;
    gap: var(--size-4-3);
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }

  .detail-item {
    display: flex;
    align-items: center;
    gap: var(--size-4-1);
  }

  .timeline-more {
    text-align: center;
    padding: var(--size-4-2);
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    border-top: 1px dashed var(--background-modifier-border);
  }

  /* 滚动条样式 */
  .review-timeline::-webkit-scrollbar {
    width: 8px;
  }

  .review-timeline::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .review-timeline::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .review-timeline::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }
</style>


