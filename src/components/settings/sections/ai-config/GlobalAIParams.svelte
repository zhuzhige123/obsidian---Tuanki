<script lang="ts">
  interface Props {
    globalParams: {
      temperature: number;
      maxTokens: number;
      requestTimeout: number;
      concurrentLimit: number;
    };
  }

  let { globalParams = $bindable() }: Props = $props();

  // 格式化显示值
  function formatTemperature(value: number): string {
    return value.toFixed(1);
  }
</script>

<div class="global-ai-params">
  <!-- Temperature -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Temperature</div>
      <div class="setting-item-description">
        控制AI响应的随机性。值越低越确定，越高越创造性。推荐范围：0.5-1.0
      </div>
    </div>
    <div class="setting-item-control">
      <div class="slider-control">
        <input
          type="range"
          bind:value={globalParams.temperature}
          min="0"
          max="2"
          step="0.1"
          class="slider"
        />
        <span class="slider-value">{formatTemperature(globalParams.temperature)}</span>
      </div>
    </div>
  </div>

  <!-- Max Tokens -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">最大Token数</div>
      <div class="setting-item-description">
        单次请求的最大Token数量。推荐范围：1000-4000
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="number"
        bind:value={globalParams.maxTokens}
        min="100"
        max="10000"
        step="100"
        class="number-input"
      />
    </div>
  </div>

  <!-- Request Timeout -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">请求超时时间</div>
      <div class="setting-item-description">
        API请求超时时间（秒）。推荐：30-60秒
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="number"
        bind:value={globalParams.requestTimeout}
        min="10"
        max="120"
        step="5"
        class="number-input"
      />
    </div>
  </div>

  <!-- Concurrent Limit -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">并发请求限制</div>
      <div class="setting-item-description">
        同时发送的最大请求数。推荐：1-5
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="number"
        bind:value={globalParams.concurrentLimit}
        min="1"
        max="10"
        step="1"
        class="number-input"
      />
    </div>
  </div>
</div>

<style>
  .global-ai-params {
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

  .slider-control {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .slider {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--background-modifier-border);
    outline: none;
    -webkit-appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--interactive-accent);
    cursor: pointer;
    border: none;
  }

  .slider-value {
    min-width: 40px;
    text-align: center;
    font-size: 0.9em;
    font-weight: 500;
    color: var(--text-normal);
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




