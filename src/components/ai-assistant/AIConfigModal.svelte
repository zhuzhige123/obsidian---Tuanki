<script lang="ts">
  import type { GenerationConfig } from '../../types/ai-types';
  import type { WeavePlugin } from '../../main';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import AIPromptConfigPanel from './AIPromptConfigPanel.svelte';
  import { focusManager } from '../../utils/focus-manager';
  import { tr } from '../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
    config: GenerationConfig;
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: GenerationConfig) => void;
    useObsidianModal?: boolean;
  }

  let { plugin, config, isOpen, onClose, onSave, useObsidianModal = false }: Props = $props();
  let t = $derived($tr);

  let modalEl = $state<HTMLElement | null>(null);
  let lastTrapEl: HTMLElement | null = null;
  let wasOpen = false;

  $effect(() => {
    if (isOpen && !wasOpen) {
      focusManager.saveFocus();
      window.setTimeout(() => {
        if (!modalEl) return;
        lastTrapEl = modalEl;
        const firstFocusable = modalEl.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) as HTMLElement | null;
        focusManager.trapFocus(modalEl, firstFocusable ?? undefined);
      }, 0);
    } else if (!isOpen && wasOpen) {
      if (lastTrapEl) {
        focusManager.releaseTrap(lastTrapEl);
      }
      focusManager.restoreFocus();
      lastTrapEl = null;
    }

    wasOpen = isOpen;
  });
</script>

{#snippet modalContent(nativeMode: boolean)}
  <div class="ai-config-modal" class:ai-config-modal-native={nativeMode} bind:this={modalEl} role="dialog" tabindex="-1">
    {#if !nativeMode}
      <div class="modal-header">
        <div class="modal-title">{t('aiAssistant.configModal.title')}</div>
        <button class="modal-close-btn" type="button" onclick={onClose} aria-label={t('aiAssistant.configModal.close')}>
          <ObsidianIcon name="x" size={18} />
        </button>
      </div>
    {/if}

    <div class="prompt-shell">
      <AIPromptConfigPanel {plugin} {config} active={isOpen} variant="full" />
    </div>
  </div>
{/snippet}

{#if isOpen}
  {#if useObsidianModal}
    {@render modalContent(true)}
  {:else}
    <div class="modal-overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && onClose()}>
      {@render modalContent(false)}
    </div>
  {/if}
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--layer-modal, 50);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
  }

  .ai-config-modal {
    width: min(1100px, 94vw);
    max-height: min(88vh, 940px);
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.24);
  }

  .ai-config-modal-native {
    width: 100%;
    max-height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-title {
    font-size: 1.12rem;
    font-weight: 700;
    color: var(--text-normal);
  }

  .modal-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .modal-close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .prompt-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 16px 20px 20px;
    overflow: auto;
  }
</style>
