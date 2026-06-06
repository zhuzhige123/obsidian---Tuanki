<script lang="ts">
  import type { GenerationConfig } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import AIGenerationConfigForm from './AIGenerationConfigForm.svelte';
  import { isMobileDevice } from '../../utils/mobile-modal-bounds';
  import { tr } from '../../utils/i18n';

  interface Props {
    isOpen: boolean;
    config: GenerationConfig;
    style?: string;
    onClose: () => void;
    onSave: (config: GenerationConfig) => void;
  }

  let { isOpen, config, style = '', onClose, onSave }: Props = $props();
  let t = $derived($tr);
  let useMobileShell = $state(false);

  $effect(() => {
    if (!isOpen) {
      useMobileShell = false;
      return;
    }
    useMobileShell = isMobileDevice();
  });

  const popoverStyle = $derived(useMobileShell ? '' : style);
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ai-config-popover-backdrop weave-mobile-safe-overlay"
    class:is-mobile-shell={useMobileShell}
    onclick={(event) => event.target === event.currentTarget && onClose()}
  >
    <div
      class="ai-config-popover"
      class:is-mobile-shell={useMobileShell}
      style={popoverStyle}
      role="dialog"
      aria-label={t('aiAssistant.generationConfig.title')}
    >
      <div class="modal-header">
        <div class="header-title-group">
          <h2 class="modal-title">{t('aiAssistant.generationConfig.title')}</h2>
        </div>
        <button class="close-btn clickable-icon" type="button" onclick={onClose} title={t('ui.close')} aria-label={t('ui.close')}>
          <ObsidianIcon name="x" size={18} />
        </button>
      </div>

      <AIGenerationConfigForm
        {config}
        onCancel={onClose}
        onSave={onSave}
      />
    </div>
  </div>
{/if}

<style>
  .ai-config-popover-backdrop {
    position: absolute;
    inset: 0;
    z-index: 40;
  }

  .ai-config-popover {
    position: absolute;
    max-height: min(86vh, 820px);
    background: var(--background-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    overscroll-behavior: contain;
    border: 1px solid rgba(128, 128, 128, 0.3);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.3);
    flex-shrink: 0;
  }

  .header-title-group {
    min-width: 0;
  }

  .modal-title {
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
</style>
