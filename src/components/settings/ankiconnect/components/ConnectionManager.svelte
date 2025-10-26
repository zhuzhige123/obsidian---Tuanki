<!--
  AnkiConnect连接管理器组件
  职责：连接状态显示、连接测试、端点配置
-->
<script lang="ts">
  import type { ConnectionStatus } from '../../../../types/ankiconnect-types';

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
  <!-- 连接状态与测试 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">连接状态</div>
      <div class="setting-item-description">
        {#if isTesting}
          ⏳ 测试中...
        {:else if connectionStatus === null}
          ⚪ 未测试
        {:else if connectionStatus.isConnected}
          ✅ 已连接 {#if connectionStatus.apiVersion}<span style="opacity: 0.7;">· API v{connectionStatus.apiVersion}</span>{/if}
        {:else}
          ❌ 未连接
        {/if}
      </div>
    </div>
    <div class="setting-item-control">
      <button
        class="btn btn-primary"
        onclick={onTestConnection}
        disabled={isTesting}
      >
        {isTesting ? '测试中...' : '测试连接'}
      </button>
    </div>
  </div>

  {#if connectionStatus?.error}
    <div class="error-banner">
      <div class="error-text">{connectionStatus.error.message}</div>
      {#if connectionStatus.error.suggestion}
        <div class="error-suggestion">💡 {connectionStatus.error.suggestion}</div>
      {/if}
    </div>
  {/if}

  <!-- 端点配置 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">AnkiConnect 端点</div>
      <div class="setting-item-description">
        AnkiConnect API 的地址
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="text"
        class="modern-input"
        bind:value={endpoint}
        onblur={() => onEndpointChange(endpoint)}
        placeholder="http://localhost:8765"
      />
    </div>
  </div>
</div>

<style>
  .connection-manager {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .setting-item-info {
    flex: 1;
  }

  .setting-item-name {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .setting-item-description {
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
  }

  /* 错误横幅 */
  .error-banner {
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: var(--tuanki-radius-md);
    border-left: 3px solid var(--tuanki-error);
    margin-bottom: 12px;
  }

  .error-text {
    font-size: 14px;
    color: var(--tuanki-error);
    margin-bottom: 4px;
  }

  .error-suggestion {
    font-size: 12px;
    color: var(--text-muted);
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: var(--tuanki-radius-sm);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
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

  .modern-input {
    width: 250px;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-sm);
    color: var(--text-normal);
    font-size: 14px;
    transition: border-color 0.2s;
  }

  .modern-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--interactive-accent-hover);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .setting-item {
      flex-direction: column;
      align-items: flex-start;
    }

    .setting-item-control {
      margin-left: 0;
      margin-top: 8px;
    }

    .modern-input {
      width: 100%;
    }
  }
</style>


