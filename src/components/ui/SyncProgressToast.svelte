<script lang="ts">
/**
 * 同步进度提示组件
 * Cursor 风格的嵌入式进度条
 */

import CursorProgress from './cursor/CursorProgress.svelte';

interface Props {
  direction: 'import' | 'export' | 'bidirectional';
  current: number;
  total: number;
  status: string;
  onCancel?: () => void;
  autoHide?: boolean;  // 完成后自动隐藏
}

let {
  direction,
  current = $bindable(0),
  total = $bindable(100),
  status = $bindable(''),
  onCancel,
  autoHide = true
}: Props = $props();

// 派生状态
const percentage = $derived((current / total) * 100);
const isComplete = $derived(percentage >= 100);

// 同步方向图标
const directionIcon = $derived(() => {
  switch (direction) {
    case 'import': return '→';  // Anki → Obsidian
    case 'export': return '←';  // Obsidian → Anki
    case 'bidirectional': return '↔';  // 双向同步
    default: return '';
  }
});

// 同步方向文本
const directionText = $derived(() => {
  switch (direction) {
    case 'import': return 'Anki → Obsidian';
    case 'export': return 'Obsidian → Anki';
    case 'bidirectional': return '双向同步';
    default: return '同步中';
  }
});

// 速度和 ETA 计算
let startTime = $state(Date.now());
let cardsProcessed = $derived(current);

const speed = $derived(() => {
  const elapsed = (Date.now() - startTime) / 1000; // 秒
  if (elapsed < 1) return 0;
  return Math.round(cardsProcessed / elapsed);
});

const eta = $derived(() => {
  if (speed() === 0) return '计算中...';
  const remaining = total - current;
  const seconds = Math.round(remaining / speed());
  
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`;
  return `${Math.round(seconds / 3600)}小时`;
});

// 完成后自动隐藏
let visible = $state(true);
$effect(() => {
  if (isComplete && autoHide) {
    setTimeout(() => {
      visible = false;
    }, 3000);
  }
});

// 取消按钮处理
function handleCancel() {
  if (onCancel) {
    onCancel();
  }
}
</script>

{#if visible}
<div class="sync-progress-toast" class:complete={isComplete}>
  <div class="toast-header">
    <div class="direction-indicator">
      <span class="direction-icon">{directionIcon()}</span>
      <span class="direction-text">{directionText()}</span>
    </div>
    {#if onCancel && !isComplete}
      <button class="cancel-btn" onclick={handleCancel} aria-label="取消同步">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    {/if}
  </div>

  <div class="progress-section">
    <CursorProgress value={current} max={total} />
  </div>

  <div class="status-section">
    <div class="status-text">{status}</div>
    <div class="stats-row">
      <span class="stat">{current} / {total}</span>
      {#if !isComplete && speed() > 0}
        <span class="stat">{speed()} 张/秒</span>
        <span class="stat">剩余 {eta()}</span>
      {/if}
    </div>
  </div>

  {#if isComplete}
    <div class="complete-indicator">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="var(--tuanki-success)" stroke-width="2"/>
        <path d="M6 10L9 13L14 7" stroke="var(--tuanki-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>同步完成</span>
    </div>
  {/if}
</div>
{/if}

<style>
.sync-progress-toast {
  background: var(--background-primary);
  border: 1px solid var(--tuanki-border);
  border-radius: 8px;
  padding: 16px;
  margin-top: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.sync-progress-toast.complete {
  border-color: var(--tuanki-success);
  background: linear-gradient(
    135deg,
    var(--background-primary) 0%,
    rgba(16, 185, 129, 0.05) 100%
  );
}

.toast-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.direction-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.direction-icon {
  font-size: 20px;
  font-weight: bold;
  color: var(--tuanki-primary);
}

.direction-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-normal);
}

.cancel-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cancel-btn:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.progress-section {
  margin-bottom: 12px;
}

.status-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-text {
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
}

.stats-row {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.complete-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--tuanki-border);
  color: var(--tuanki-success);
  font-weight: 500;
}

/* 动画效果 */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sync-progress-toast {
  animation: slideIn 0.3s ease;
}

/* 响应式设计 */
@media (max-width: 600px) {
  .stats-row {
    flex-direction: column;
    gap: 4px;
  }
  
  .direction-text {
    font-size: 12px;
  }
}

/* 高对比度模式 */
@media (prefers-contrast: high) {
  .sync-progress-toast {
    border-width: 2px;
  }
}

/* 减少动画模式 */
@media (prefers-reduced-motion: reduce) {
  .sync-progress-toast {
    animation: none;
  }
  
  .sync-progress-toast,
  .cancel-btn {
    transition: none;
  }
}
</style>




