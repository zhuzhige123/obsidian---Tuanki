<script lang="ts">
  interface Props {
    history: {
      enabled: boolean;
      retentionDays: number;
      showCostStats: boolean;
      autoCleanFailures: boolean;
    };
  }

  let { history = $bindable() }: Props = $props();
</script>

<div class="history-config">
  <!-- 启用历史记录 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">启用历史记录</div>
      <div class="setting-item-description">
        保存AI生成卡片的历史记录，便于追溯和统计
      </div>
    </div>
    <div class="setting-item-control">
      <label class="modern-switch">
        <input
          type="checkbox"
          bind:checked={history.enabled}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>

  {#if history.enabled}
    <!-- 保留天数 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">历史记录保留天数</div>
        <div class="setting-item-description">
          自动清理超过指定天数的历史记录
        </div>
      </div>
      <div class="setting-item-control">
        <input
          type="number"
          bind:value={history.retentionDays}
          min="1"
          max="365"
          step="1"
          class="number-input"
        />
      </div>
    </div>

    <!-- 显示成本统计 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">显示成本统计</div>
        <div class="setting-item-description">
          在历史记录中显示API调用成本估算
        </div>
      </div>
      <div class="setting-item-control">
        <label class="modern-switch">
          <input
            type="checkbox"
            bind:checked={history.showCostStats}
          />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>

    <!-- 自动清理失败记录 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">自动清理失败记录</div>
        <div class="setting-item-description">
          自动删除生成失败的历史记录
        </div>
      </div>
      <div class="setting-item-control">
        <label class="modern-switch">
          <input
            type="checkbox"
            bind:checked={history.autoCleanFailures}
          />
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  {/if}
</div>

<style>
  .history-config {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .setting-item-info {
    flex: 1;
    min-width: 0;
  }

  .setting-item-name {
    font-size: 0.95em;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .setting-item-description {
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
    min-width: 200px;
  }

  .number-input {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
    text-align: right;
  }

  .number-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  /* 移除number input的spinner */
  .number-input::-webkit-inner-spin-button,
  .number-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .number-input[type="number"] {
    -moz-appearance: textfield;
  }
</style>



