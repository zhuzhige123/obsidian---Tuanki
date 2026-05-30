<script lang="ts">
  import type { ConnectionStatus } from '../../../../types/ankiconnect-types';
  import { tr } from '../../../../utils/i18n';

  let t = $derived($tr);

  interface Props {
    connectionStatus: ConnectionStatus | null;
    isTesting: boolean;
    endpoint: string;
    onTestConnection: () => Promise<void>;
    onEndpointChange: (endpoint: string) => void;
  }

  let {
    connectionStatus,
    isTesting,
    endpoint,
    onTestConnection,
    onEndpointChange
  }: Props = $props();
</script>

<div class="connection-manager">
  <div class="setting-item connection-item">
    <div class="setting-info">
      <div class="setting-label">{t('ankiConnect.connection.address.label')}</div>
      <div class="setting-description">
        {#if isTesting}
          {t('ankiConnect.connection.statusLabel.testing')}
        {:else if connectionStatus === null}
          {t('ankiConnect.connection.notTested')}
        {:else if connectionStatus.isConnected}
          {t('ankiConnect.connection.statusLabel.connected')}
          {#if connectionStatus.apiVersion}
            <span class="connection-meta">API v{connectionStatus.apiVersion}</span>
          {/if}
        {:else}
          {t('ankiConnect.connection.statusLabel.disconnected')}
        {/if}
      </div>
    </div>

    <div class="setting-control endpoint-control">
      <input
        type="text"
        class="text-input"
        bind:value={endpoint}
        onblur={() => onEndpointChange(endpoint)}
        placeholder="http://localhost:8765"
      />
      <button
        class="btn btn-primary"
        type="button"
        onclick={onTestConnection}
        disabled={isTesting}
      >
        {isTesting ? t('ankiConnect.connection.test.testing') : t('ankiConnect.connection.test.button')}
      </button>
    </div>
  </div>

  {#if connectionStatus?.error}
    <div class="error-banner">
      <div class="error-text">{connectionStatus.error.message}</div>
      {#if connectionStatus.error.suggestion}
        <div class="error-suggestion">{connectionStatus.error.suggestion}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .connection-manager {
    --weave-settings-gap-sm: var(--size-2-2, 0.5rem);
    --weave-settings-gap-md: var(--size-4-2, 0.75rem);
    --weave-settings-gap-lg: var(--size-4-3, 1rem);
    --weave-settings-radius-sm: var(--radius-s, 6px);
    --weave-settings-radius-md: var(--radius-m, 10px);
    --weave-settings-radius-lg: var(--radius-l, 14px);
    display: flex;
    flex-direction: column;
    gap: var(--weave-settings-gap-md);
  }

  .setting-item {
    margin: 0;
    padding: calc(var(--weave-settings-gap-lg) + var(--weave-settings-gap-xs, 0.25rem))
      var(--weave-settings-gap-xl, 1.5rem);
    border: none;
    border-radius: var(--weave-settings-radius-lg);
    background: var(--background-secondary);
  }

  .connection-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--weave-settings-gap-xl, 1.5rem);
  }

  .setting-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .endpoint-control {
    gap: var(--weave-settings-gap-md);
  }

  .connection-meta {
    margin-left: var(--weave-settings-gap-sm);
    opacity: 0.7;
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
  }

  .error-banner {
    padding: var(--weave-settings-gap-lg) calc(var(--weave-settings-gap-lg) + var(--weave-settings-gap-xs, 0.25rem));
    background: color-mix(in oklab, var(--text-error), var(--background-primary) 92%);
    border-radius: var(--weave-settings-radius-lg);
    border: 1px solid color-mix(in oklab, var(--text-error), transparent 35%);
  }

  .error-text {
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    color: var(--text-error);
    margin-bottom: var(--weave-settings-gap-xs, 0.25rem);
  }

  .error-suggestion {
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
  }

  .btn {
    padding: var(--weave-settings-gap-sm) var(--weave-settings-gap-lg);
    border: none;
    border-radius: var(--weave-settings-radius-md);
    cursor: pointer;
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    font-weight: 500;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .text-input {
    width: min(360px, 100%);
    padding: var(--weave-settings-gap-sm) var(--weave-settings-gap-md);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--weave-settings-radius-md);
    color: var(--text-normal);
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    transition: border-color 0.2s;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  @media (max-width: 768px) {
    .connection-item {
      grid-template-columns: 1fr;
    }

    .setting-control {
      justify-content: flex-start;
    }

    .endpoint-control {
      width: 100%;
      flex-wrap: wrap;
    }

    .text-input {
      width: 100%;
    }
  }
</style>
