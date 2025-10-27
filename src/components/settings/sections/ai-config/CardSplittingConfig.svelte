<script lang="ts">
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";

  interface Props {
    cardSplitting: {
      enabled: boolean;
      defaultTargetCount: number;
      minContentLength: number;
      maxContentLength: number;
      autoInheritTags: boolean;
      autoInheritSource: boolean;
      requireConfirmation: boolean;
      defaultInstruction: string;
    };
  }

  let { cardSplitting = $bindable() }: Props = $props();
</script>

<div class="card-splitting-config">
  <!-- 启用AI拆分 -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">
        <EnhancedIcon name="split" size={16} />
        启用AI拆分
      </div>
      <div class="setting-item-description">
        在学习界面中显示AI拆分按钮，可将复杂卡片拆分为多张子卡片
      </div>
    </div>
    <div class="setting-item-control">
      <label class="toggle-switch">
        <input type="checkbox" bind:checked={cardSplitting.enabled} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  {#if cardSplitting.enabled}
    <!-- 默认生成数量 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">默认生成数量</div>
        <div class="setting-item-description">
          设置AI拆分时默认生成的子卡片数量（0 = 让AI自动决定，通常2-5张）
        </div>
      </div>
      <div class="setting-item-control">
        <input
          type="number"
          min="0"
          max="10"
          bind:value={cardSplitting.defaultTargetCount}
          class="number-input"
        />
      </div>
    </div>

    <!-- 最小内容长度 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">最小内容长度</div>
        <div class="setting-item-description">
          只有内容长度达到此值的卡片才可以进行拆分（字符数）
        </div>
      </div>
      <div class="setting-item-control">
        <input
          type="number"
          min="50"
          max="1000"
          step="50"
          bind:value={cardSplitting.minContentLength}
          class="number-input"
        />
      </div>
    </div>

    <!-- 最大内容长度 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">最大内容长度</div>
        <div class="setting-item-description">
          超过此长度的卡片内容将被截断后再拆分（字符数）
        </div>
      </div>
      <div class="setting-item-control">
        <input
          type="number"
          min="1000"
          max="10000"
          step="500"
          bind:value={cardSplitting.maxContentLength}
          class="number-input"
        />
      </div>
    </div>

    <!-- 自动继承标签 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">
          <EnhancedIcon name="tag" size={16} />
          自动继承标签
        </div>
        <div class="setting-item-description">
          子卡片自动继承父卡片的所有标签
        </div>
      </div>
      <div class="setting-item-control">
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={cardSplitting.autoInheritTags} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 自动继承来源 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">
          <EnhancedIcon name="link" size={16} />
          自动继承来源信息
        </div>
        <div class="setting-item-description">
          子卡片自动继承父卡片的Obsidian来源文档和块链接
        </div>
      </div>
      <div class="setting-item-control">
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={cardSplitting.autoInheritSource} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 收入前确认 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">
          <EnhancedIcon name="alert-circle" size={16} />
          收入前确认
        </div>
        <div class="setting-item-description">
          收入子卡片到牌组前需要用户确认（推荐开启）
        </div>
      </div>
      <div class="setting-item-control">
        <label class="toggle-switch">
          <input type="checkbox" bind:checked={cardSplitting.requireConfirmation} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- 默认拆分指令 -->
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">
          <EnhancedIcon name="message-square" size={16} />
          默认拆分指令（可选）
        </div>
        <div class="setting-item-description">
          自定义AI拆分的额外指令，例如："重点关注定义和例子"（留空则使用默认指令）
        </div>
      </div>
      <div class="setting-item-control full-width">
        <textarea
          bind:value={cardSplitting.defaultInstruction}
          placeholder="输入自定义拆分指令..."
          rows="3"
          class="text-input"
        ></textarea>
      </div>
    </div>
  {/if}
</div>

<style>
  .card-splitting-config {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--background-modifier-border-hover);
  }

  .setting-item:last-child {
    border-bottom: none;
  }

  .setting-item-info {
    flex: 1;
  }

  .setting-item-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .setting-item-description {
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-item-control {
    flex-shrink: 0;
  }

  .setting-item-control.full-width {
    flex: 1;
    width: 100%;
  }

  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background-modifier-border);
    transition: 0.3s;
    border-radius: 24px;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: var(--interactive-accent);
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(20px);
  }

  .toggle-switch input:focus + .toggle-slider {
    box-shadow: 0 0 1px var(--interactive-accent);
  }

  /* Number Input */
  .number-input {
    width: 80px;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95em;
  }

  .number-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  /* Text Input */
  .text-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95em;
    font-family: var(--font-text);
    resize: vertical;
    min-height: 80px;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .text-input::placeholder {
    color: var(--text-faint);
  }
</style>

