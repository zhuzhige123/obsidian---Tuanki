<!--
  AnkiConnect 同步进度模态窗
  统一的进度显示组件，支持多种操作类型
-->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import { tr } from '../../../utils/i18n';
  import ObsidianIcon from '../../ui/ObsidianIcon.svelte';
  import OperationProgressCard from '../../ui/OperationProgressCard.svelte';

  let t = $derived($tr);

  type OperationType = 'fetch_models' | 'sync_to_anki' | 'batch_sync';

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;
    /** 操作类型 */
    operation: OperationType;
    /** 操作标题 */
    title: string;
    /** 当前进度数值 */
    current: number;
    /** 总数 */
    total: number;
    /** 当前状态描述 */
    status?: string;
    /** 当前处理项名称（如牌组名） */
    currentItem?: string;
    /** 当前牌组索引 */
    deckIndex?: number;
    /** 总牌组数 */
    totalDecks?: number;
    /** 是否允许取消 */
    allowCancel?: boolean;
    /** 取消回调 */
    onCancel?: () => void;
    /** 关闭回调 */
    onClose?: () => void;
  }

  let {
    open = false,
    operation,
    title,
    current = 0,
    total = 0,
    status = '',
    currentItem = '',
    deckIndex = 0,
    totalDecks = 0,
    allowCancel = false,
    onCancel,
    onClose
  }: Props = $props();

  // 操作图标映射
  const operationIcons: Record<OperationType, string> = {
    fetch_models: 'layout-template',
    sync_to_anki: 'upload',
    batch_sync: 'refresh-cw'
  };

  // 计算进度百分比
  let progressPercentage = $derived(
    total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0
  );

  // 格式化进度文本
  let progressText = $derived(
    `${current} / ${total}`
  );

  // 格式化百分比
  let percentageText = $derived(
    `${Math.round(progressPercentage)}%`
  );

  let currentItemText = $derived(
    currentItem ? `${t('ankiConnect.syncProgress.processing')}：${currentItem}` : ''
  );

  let deckProgressText = $derived(
    totalDecks > 0 ? `${t('ankiConnect.syncProgress.deckProgress')}：${deckIndex} / ${totalDecks}` : ''
  );

  let cardTitle = $derived(status || title);

  let cardCounter = $derived(total > 0 ? progressText : percentageText);

  let cardMessage = $derived(
    currentItemText || deckProgressText || status || progressText
  );

  let cardDetail = $derived(
    currentItemText && deckProgressText ? deckProgressText : ''
  );

  // 获取操作图标
  function getOperationIcon(): string {
    return operationIcons[operation] || 'settings';
  }

  // 处理取消
  function handleCancel() {
    if (onCancel) {
      onCancel();
    }
    if (onClose) {
      onClose();
    }
  }
</script>

{#if open}
  <div 
    class="sync-progress-modal-overlay"
    role="presentation"
    transition:fade={{ duration: 250 }}
  >
    <div
      class="sync-progress-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
      tabindex="-1"
    >
      <!-- 头部 -->
      <div class="modal-header">
        <div class="operation-icon">
          <ObsidianIcon name={getOperationIcon()} size={22} />
        </div>
        <h3 id="progress-modal-title" class="modal-title">{title}</h3>
      </div>

      <!-- 进度区域 -->
      <div class="modal-body">
        <OperationProgressCard
          title={cardTitle}
          counter={cardCounter}
          message={cardMessage}
          detail={cardDetail}
          percent={progressPercentage}
          status="running"
          statusLabel="进行中"
          centered={true}
          detailInCard={Boolean(cardDetail)}
          footerPrimary={percentageText}
          footerSecondary={total > 0 ? progressText : ''}
          progressValueMin={0}
          progressValueMax={total > 0 ? total : 100}
          progressValueNow={total > 0 ? Math.min(current, total) : Math.round(progressPercentage)}
          progressValueText={total > 0 ? progressText : percentageText}
        />
      </div>

      <!-- 底部按钮 -->
      {#if allowCancel && onCancel}
        <div class="modal-footer">
          <button
            class="btn-cancel"
            onclick={handleCancel}
            aria-label={t('ankiConnect.syncProgress.cancelLabel')}
          >
            {t('ankiConnect.syncProgress.cancelButton')}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* 遮罩层 */
  .sync-progress-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--layer-notice);
    backdrop-filter: blur(2px);
    animation: fadeIn 0.25s ease-out;
    /* 遮罩层不拦截鼠标事件，允许点击穿透 */
    pointer-events: none;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 模态窗主体 */
  .sync-progress-modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 450px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.3s ease-out;
    /* 模态窗本体恢复事件接收 */
    pointer-events: auto;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 头部 */
  .modal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .operation-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--interactive-accent);
    opacity: 0.95;
  }

  .modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 主体内容 */
  .modal-body {
    padding: 1.5rem;
  }

  /* 底部按钮 */
  .modal-footer {
    padding: 0 1.5rem 1.5rem;
    display: flex;
    justify-content: flex-end;
  }

  .btn-cancel {
    padding: 8px 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-cancel:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-error);
    color: var(--text-error);
  }

  /* 响应式 */
  @media (max-width: 600px) {
    .sync-progress-modal {
      width: 95vw;
    }

    .modal-header {
      padding: 1.25rem 1.25rem 0.875rem;
    }

    .modal-body {
      padding: 1.25rem;
    }

    .modal-footer {
      padding: 0 1.25rem 1.25rem;
    }
  }
</style>

