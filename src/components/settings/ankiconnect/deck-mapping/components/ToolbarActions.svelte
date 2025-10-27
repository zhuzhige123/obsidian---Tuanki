<!--
  工具栏操作组件
  职责：获取Anki牌组、添加映射按钮等工具栏操作
-->
<script lang="ts">
  import type { AnkiDeckInfo } from '../../../../../types/ankiconnect-types';
  import type { Deck } from '../../../../../data/types';

  interface Props {
    ankiDecks: AnkiDeckInfo[];
    tuankiDecks: Deck[];
    isFetchingDecks: boolean;
    showAddModal: boolean;
    onFetchDecks: () => Promise<void>;
    onToggleAddModal: () => void;
  }

  let { 
    ankiDecks, 
    tuankiDecks, 
    isFetchingDecks, 
    showAddModal,
    onFetchDecks,
    onToggleAddModal
  }: Props = $props();
</script>

<div class="toolbar">
  <button
    class="btn btn-primary"
    onclick={onFetchDecks}
    disabled={isFetchingDecks}
  >
    {isFetchingDecks ? '获取中...' : '获取 Anki 牌组列表'}
  </button>
  {#if ankiDecks.length > 0}
    <span class="deck-count">已发现 {ankiDecks.length} 个 Anki 牌组</span>
  {/if}
  <button
    class="btn btn-success"
    onclick={onToggleAddModal}
    disabled={tuankiDecks.length === 0 || ankiDecks.length === 0}
    title={tuankiDecks.length === 0 ? '请先创建 Tuanki 牌组' : ankiDecks.length === 0 ? '请先获取 Anki 牌组列表' : ''}
  >
    {showAddModal ? '取消添加' : '➕ 添加映射'}
  </button>
</div>

<style>
  .toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 16px 0;
  }

  .deck-count {
    font-size: 13px;
    color: var(--text-muted);
    padding: 0 8px;
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

  .btn-success {
    background: var(--tuanki-success);
    color: white;
  }

  .btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .deck-count {
      text-align: center;
    }
  }
</style>


