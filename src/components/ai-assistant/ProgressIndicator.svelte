<script lang="ts">
  import type { GenerationProgress } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { tr } from '../../utils/i18n';

  interface Props {
    progress: GenerationProgress;
    onOpenPreview?: () => void; // 打开预览窗口的回调
  }

  let { progress, onOpenPreview }: Props = $props();
  let t = $derived($tr);

  // 状态图标映射
  let statusIcon = $derived.by(() => {
    switch (progress.status) {
      case 'preparing':
        return 'settings';
      case 'generating':
        return 'cpu';
      case 'parsing':
        return 'file-search';
      case 'completed':
        return 'check-circle';
      case 'failed':
        return 'x-circle';
      default:
        return 'loader';
    }
  });

  // 状态颜色
  let statusColor = $derived.by(() => {
    switch (progress.status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'normal';
    }
  });
</script>

<div class="progress-indicator" class:completed={progress.status === 'completed'} class:failed={progress.status === 'failed'}>
  <div class="progress-header">
    <div class="progress-icon {statusColor}">
      <ObsidianIcon name={statusIcon} size={20} />
    </div>
    <div class="progress-info">
      <div class="progress-message">{progress.message}</div>
      {#if progress.currentCard && progress.totalCards}
        <div class="progress-details">
          {t('aiAssistant.progressIndicator.progressLabel', { current: progress.currentCard, total: progress.totalCards })}
        </div>
      {/if}
    </div>
    
    {#if onOpenPreview && (progress.status === 'generating' || progress.status === 'completed')}
      <button class="preview-btn" onclick={onOpenPreview} title={t('aiAssistant.progressIndicator.openPreviewTitle')}>
        <ObsidianIcon name="eye" size={18} />
        <span>{progress.status === 'generating' ? t('aiAssistant.progressIndicator.preview') : t('aiAssistant.progressIndicator.view')}</span>
      </button>
    {/if}
  </div>

  <!-- 进度条 -->
  <div class="progress-bar-container">
    <div class="progress-bar" style="width: {progress.progress}%"></div>
  </div>

  <!-- 百分比 -->
  <div class="progress-percent">{Math.round(progress.progress)}%</div>
</div>

<style>
  .progress-indicator {
    padding: 20px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    margin: 16px 0;
  }

  .progress-indicator.completed {
    background: rgba(46, 204, 113, 0.1);
    border-color: var(--color-green);
  }

  .progress-indicator.failed {
    background: rgba(231, 76, 60, 0.1);
    border-color: var(--color-red);
  }

  .progress-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    position: relative;
  }

  .progress-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .progress-icon.success {
    background: var(--color-green);
    color: white;
  }

  .progress-icon.error {
    background: var(--color-red);
    color: white;
  }

  .progress-info {
    flex: 1;
  }

  .progress-message {
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .progress-details {
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .progress-bar-container {
    width: 100%;
    height: 8px;
    background: var(--background-modifier-border);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .progress-bar {
    height: 100%;
    background: var(--interactive-accent);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-percent {
    text-align: right;
    font-size: 0.85em;
    font-weight: 500;
    color: var(--text-normal);
  }

  .completed .progress-bar {
    background: var(--color-green);
  }

  .failed .progress-bar {
    background: var(--color-red);
  }

  /* 查看卡片按钮 */
  .preview-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .preview-btn:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .preview-btn:active {
    transform: translateY(0);
  }
</style>
