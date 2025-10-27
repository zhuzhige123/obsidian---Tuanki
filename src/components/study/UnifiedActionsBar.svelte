<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  
  // 🌍 导入国际化
  import { tr } from "../../utils/i18n";

  interface Props {
    showChildOverlay: boolean;
    selectedCount: number;
    onReturn: () => void;
    onRegenerate: () => void;
    onSave: () => void;
    canUndo?: boolean;
    onUndo?: () => void;
  }

  let { 
    showChildOverlay, 
    selectedCount, 
    onReturn, 
    onRegenerate, 
    onSave,
    canUndo = false,
    onUndo
  }: Props = $props();
  
  // 🌍 响应式翻译函数
  let t = $derived($tr);
</script>

<div class="unified-actions-bar">
  {#if showChildOverlay}
    <!-- 子卡片模式按钮 -->
    <button class="action-btn secondary" onclick={onReturn} type="button">
      <EnhancedIcon name="arrow-left" size="18" />
      <span>{t('studyInterface.actions.return')}</span>
    </button>
    
    <button class="action-btn primary" onclick={onRegenerate} type="button">
      <EnhancedIcon name="refresh-cw" size="18" />
      <span>{t('studyInterface.actions.regenerate')}</span>
    </button>
    
    <button 
      class="action-btn primary" 
      onclick={onSave} 
      disabled={selectedCount === 0}
      type="button"
    >
      <EnhancedIcon name="save" size="18" />
      <span>{t('studyInterface.actions.collect').replace('{n}', String(selectedCount))}</span>
    </button>
  {:else}
    <!-- 正常学习模式按钮 -->
    {#if canUndo && onUndo}
      <button class="action-btn secondary" onclick={onUndo} type="button">
        <EnhancedIcon name="undo" size="18" />
        <span>{t('studyInterface.actions.undo')}</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .unified-actions-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    background: var(--background-primary);
    border-top: none; /* 移除分割线 */
    position: relative;
    z-index: 90;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
  }

  .action-btn.secondary {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .action-btn.secondary:hover {
    background: var(--background-modifier-active-hover);
    transform: translateY(-1px);
  }

  .action-btn.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .action-btn.primary:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(76, 175, 80, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }
</style>

