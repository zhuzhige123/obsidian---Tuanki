<!--
  帮助提示组件
  职责：显示问号图标，鼠标悬停或点击时显示提示内容
-->
<script lang="ts">
  interface Props {
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
  }

  let { content, position = 'top' }: Props = $props();
  
  let isVisible = $state(false);
  let isMobile = $state(false);

  // 检测是否为移动设备
  $effect(() => {
    isMobile = window.matchMedia('(max-width: 768px)').matches;
  });

  function toggleTooltip() {
    if (isMobile) {
      isVisible = !isVisible;
    }
  }

  function showTooltip() {
    if (!isMobile) {
      isVisible = true;
    }
  }

  function hideTooltip() {
    if (!isMobile) {
      isVisible = false;
    }
  }
</script>

<div class="help-tooltip-container">
  <button
    class="help-icon"
    onclick={toggleTooltip}
    onmouseenter={showTooltip}
    onmouseleave={hideTooltip}
    aria-label="帮助信息"
    type="button"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 11.5V11.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 4.5C6.61929 4.5 5.5 5.61929 5.5 7H6.5C6.5 6.17157 7.17157 5.5 8 5.5C8.82843 5.5 9.5 6.17157 9.5 7C9.5 7.55228 9.05228 8 8.5 8H8V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
  
  {#if isVisible}
    <div class="tooltip-content {position}" role="tooltip">
      {content}
    </div>
  {/if}
</div>

<style>
  .help-tooltip-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .help-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: help;
    transition: all 0.2s ease;
    border-radius: 50%;
  }

  .help-icon:hover {
    color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .help-icon:active {
    transform: scale(0.95);
  }

  .help-icon svg {
    display: block;
  }

  .tooltip-content {
    position: absolute;
    z-index: 1000;
    max-width: 300px;
    padding: var(--tuanki-space-sm) var(--tuanki-space-md);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-md);
    box-shadow: 0 4px 12px var(--background-modifier-box-shadow);
    color: var(--text-normal);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: normal;
    word-wrap: break-word;
    pointer-events: none;
    animation: tooltipFadeIn 0.2s ease;
  }

  .tooltip-content.top {
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-content.bottom {
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
  }

  .tooltip-content.left {
    right: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
  }

  .tooltip-content.right {
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
  }

  /* 添加小箭头 */
  .tooltip-content::before {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    border: 6px solid transparent;
  }

  .tooltip-content.top::before {
    bottom: -12px;
    left: 50%;
    transform: translateX(-50%);
    border-top-color: var(--background-primary);
  }

  .tooltip-content.bottom::before {
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    border-bottom-color: var(--background-primary);
  }

  .tooltip-content.left::before {
    right: -12px;
    top: 50%;
    transform: translateY(-50%);
    border-left-color: var(--background-primary);
  }

  .tooltip-content.right::before {
    left: -12px;
    top: 50%;
    transform: translateY(-50%);
    border-right-color: var(--background-primary);
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* 移动端优化 */
  @media (max-width: 768px) {
    .tooltip-content {
      position: fixed;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%) !important;
      max-width: 280px;
      pointer-events: auto;
    }

    .tooltip-content::before {
      display: none;
    }

    @keyframes tooltipFadeIn {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }
  }
</style>

