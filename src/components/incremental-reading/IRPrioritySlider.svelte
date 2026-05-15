<!--
  IRPrioritySlider - 优先级滑动条组件 v4.0

  设计目标：
  - 与继续阅读建议弹窗统一为同一套轻书卷编辑卡片语言
  - 突出当前优先级、节奏含义与快捷选择
  - 保留 0-10 连续优先级轴与实时预览能力
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  interface Props {
    value: number;
    expanded: boolean;
    disabled?: boolean;
    onToggle: () => void;
    onChange: (value: number) => void;
    onPreview?: (value: number) => void;
  }

  type PriorityTone = 'lowest' | 'low' | 'medium' | 'high' | 'urgent';

  interface PriorityPreset {
    tone: PriorityTone;
    value: number;
    label: string;
    shortHint: string;
    description: string;
    color: string;
  }

  let {
    value = 5,
    expanded = false,
    disabled = false,
    onToggle,
    onChange,
    onPreview
  }: Props = $props();

  let localValue = $state(untrack(() => value));
  let isDragging = $state(false);

  const priorityPresets: PriorityPreset[] = [
    {
      tone: 'lowest',
      value: 0,
      label: '最低',
      shortHint: '尽量少打扰',
      description: '仅在整体负载较低时再推进，适合暂不着急的阅读点。',
      color: 'var(--text-faint)'
    },
    {
      tone: 'low',
      value: 2.5,
      label: '低',
      shortHint: '低频出现',
      description: '保留在计划里，但不会主动占用太多今天的阅读注意力。',
      color: 'var(--text-muted)'
    },
    {
      tone: 'medium',
      value: 5,
      label: '中',
      shortHint: '常规节奏',
      description: '按当前默认节奏安排，是最平衡的推进频率。',
      color: 'var(--interactive-accent)'
    },
    {
      tone: 'high',
      value: 7.5,
      label: '高',
      shortHint: '更积极推进',
      description: '会更频繁回到你的阅读流里，适合当前值得优先推进的内容。',
      color: 'var(--text-warning)'
    },
    {
      tone: 'urgent',
      value: 10,
      label: '紧急',
      shortHint: '优先处理',
      description: '尽可能优先出现，适合你现在明确不想继续拖延的阅读点。',
      color: 'var(--text-error)'
    }
  ];

  $effect(() => {
    if (!isDragging) {
      localValue = value;
    }
  });

  function getPriorityPreset(v: number): PriorityPreset {
    if (v <= 1) return priorityPresets[0];
    if (v <= 3.5) return priorityPresets[1];
    if (v <= 6.5) return priorityPresets[2];
    if (v <= 8.5) return priorityPresets[3];
    return priorityPresets[4];
  }

  function getPriorityColor(v: number): string {
    return getPriorityPreset(v).color;
  }

  function getPriorityLabel(v: number): string {
    return getPriorityPreset(v).label;
  }

  function getPriorityHint(v: number): string {
    return getPriorityPreset(v).shortHint;
  }

  function getPriorityDescription(v: number): string {
    return getPriorityPreset(v).description;
  }

  function isPresetActive(preset: PriorityPreset, v: number): boolean {
    return getPriorityPreset(v).tone === preset.tone;
  }

  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    localValue = parseFloat(target.value);
    isDragging = true;
    onPreview?.(localValue);
  }

  function handleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newValue = parseFloat(target.value);
    isDragging = false;
    onChange(newValue);
  }

  function quickSet(v: number): void {
    localValue = v;
    isDragging = false;
    onPreview?.(v);
    onChange(v);
  }

  let currentPreset = $derived(getPriorityPreset(localValue));
  let currentColor = $derived(getPriorityColor(localValue));
</script>

<div class="ir-priority-slider" class:disabled>
  {#if expanded}
    <div class="priority-editor" style={`--priority-accent: ${currentColor};`}>
      <div class="priority-editor__header">
        <div class="priority-editor__title-group">
          <span class="priority-editor__kicker">
            <span class="priority-editor__kicker-dot" aria-hidden="true"></span>
            阅读节奏
          </span>
          <div class="priority-editor__title-row">
            <span class="priority-editor__title">优先级</span>
            <span class="priority-editor__state">{currentPreset.label}</span>
          </div>
        </div>

        <button
          type="button"
          class="priority-editor__close"
          onclick={onToggle}
          title="关闭优先级面板"
          aria-label="关闭优先级面板"
        >
          <EnhancedIcon name="x" size={14} color="var(--text-muted)" />
        </button>
      </div>

      <div class="priority-editor__hero">
        <div class="priority-editor__value-block">
          <span class="priority-editor__value">{localValue.toFixed(1)}</span>
          <span class="priority-editor__value-label">{getPriorityLabel(localValue)}</span>
        </div>
        <span class="priority-editor__value-hint">{getPriorityHint(localValue)}</span>
      </div>

      <p class="priority-editor__description">
        {getPriorityDescription(localValue)}
      </p>

      <div class="priority-editor__slider-section">
        <div class="priority-editor__scale">
          <span>轻推进</span>
          <span>更常出现</span>
        </div>

        <div class="priority-editor__slider-shell">
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={localValue}
            class="priority-editor__range"
            oninput={handleInput}
            onchange={handleChange}
            {disabled}
          />
          <div class="priority-editor__track" aria-hidden="true">
            <div class="priority-editor__fill" style={`width: ${localValue * 10}%;`}></div>
            <div class="priority-editor__thumb" style={`left: ${localValue * 10}%;`}></div>
          </div>
        </div>
      </div>

      <div class="priority-editor__presets">
        {#each priorityPresets as preset}
          <button
            type="button"
            class="priority-editor__preset"
            class:is-active={isPresetActive(preset, localValue)}
            onclick={() => quickSet(preset.value)}
            title={preset.label}
          >
            <span class="priority-editor__preset-value">{preset.value.toFixed(1)}</span>
            <span class="priority-editor__preset-label">{preset.label}</span>
          </button>
        {/each}
      </div>

      <div class="priority-editor__hint">
        高优先级内容会更积极地回到你的今日阅读流中。
      </div>
    </div>
  {:else}
    <button
      type="button"
      class="priority-editor__launcher"
      onclick={onToggle}
      {disabled}
      title="设置优先级"
      aria-label="设置优先级"
    >
      <span class="priority-editor__launcher-copy">
        <span class="priority-editor__launcher-label">优先级</span>
        <span class="priority-editor__launcher-value" style={`color: ${currentColor};`}>
          {localValue.toFixed(1)} {currentPreset.label}
        </span>
      </span>
      <EnhancedIcon name="chevron-down" size={12} color="var(--text-muted)" />
    </button>
  {/if}
</div>

<style>
  .ir-priority-slider {
    position: relative;
    width: 100%;
  }

  .ir-priority-slider.disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  .priority-editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    color: var(--text-normal);
    background: transparent;
  }

  .priority-editor__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .priority-editor__title-group {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .priority-editor__kicker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--priority-accent);
    text-transform: uppercase;
  }

  .priority-editor__kicker-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--priority-accent);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--priority-accent) 12%, transparent);
  }

  .priority-editor__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .priority-editor__title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-normal);
  }

  .priority-editor__state {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--priority-accent) 14%, var(--background-secondary));
    color: var(--priority-accent);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .priority-editor__close {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-secondary) 92%, transparent);
    box-shadow: none;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .priority-editor__close:hover {
    border-color: color-mix(in srgb, var(--priority-accent) 34%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--priority-accent) 8%, var(--background-secondary));
    transform: translateY(-1px);
  }

  .priority-editor__close:focus-visible,
  .priority-editor__preset:focus-visible,
  .priority-editor__launcher:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--priority-accent) 72%, transparent);
    outline-offset: 2px;
  }

  .priority-editor__hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--priority-accent) 18%, var(--background-modifier-border));
    border-radius: 16px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--priority-accent) 9%, var(--background-secondary)),
      color-mix(in srgb, var(--background-primary) 96%, var(--background-secondary))
    );
  }

  .priority-editor__value-block {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .priority-editor__value {
    font-size: 34px;
    font-weight: 750;
    line-height: 0.95;
    letter-spacing: -0.04em;
    color: var(--priority-accent);
    font-variant-numeric: tabular-nums;
  }

  .priority-editor__value-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .priority-editor__value-hint {
    display: inline-flex;
    align-items: center;
    padding: 4px 9px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-secondary) 84%, transparent);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .priority-editor__description {
    margin: 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
  }

  .priority-editor__slider-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .priority-editor__scale {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 600;
  }

  .priority-editor__slider-shell {
    position: relative;
    height: 28px;
  }

  .priority-editor__range {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 28px;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }

  .priority-editor__track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-modifier-border) 82%, transparent);
    transform: translateY(-50%);
    overflow: visible;
  }

  .priority-editor__fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--priority-accent) 70%, white 30%),
      var(--priority-accent)
    );
    transition:
      width 0.12s ease,
      background 0.18s ease;
  }

  .priority-editor__thumb {
    position: absolute;
    top: 50%;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 2px solid color-mix(in srgb, var(--background-primary) 92%, white);
    background: var(--priority-accent);
    box-shadow:
      0 6px 14px color-mix(in srgb, var(--priority-accent) 18%, transparent),
      0 1px 4px rgba(0, 0, 0, 0.12);
    transform: translate(-50%, -50%);
    transition:
      left 0.12s ease,
      background 0.18s ease;
  }

  .priority-editor__presets {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .priority-editor__preset {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 10px 11px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--background-secondary) 88%, var(--background-primary));
    box-shadow: none;
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .priority-editor__preset:hover {
    border-color: color-mix(in srgb, var(--priority-accent) 32%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--priority-accent) 7%, var(--background-secondary));
    transform: translateY(-1px);
  }

  .priority-editor__preset.is-active {
    border-color: color-mix(in srgb, var(--priority-accent) 40%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--priority-accent) 10%, var(--background-secondary));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--priority-accent) 12%, transparent);
  }

  .priority-editor__preset-value {
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    color: var(--priority-accent);
    font-variant-numeric: tabular-nums;
  }

  .priority-editor__preset-label {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .priority-editor__hint {
    padding-top: 2px;
    color: var(--text-faint);
    font-size: 11px;
    line-height: 1.5;
  }

  .priority-editor__launcher {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 14px;
    background: color-mix(in srgb, var(--background-secondary) 90%, var(--background-primary));
    box-shadow: none;
    cursor: pointer;
  }

  .priority-editor__launcher-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }

  .priority-editor__launcher-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-faint);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .priority-editor__launcher-value {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
  }

  :global(body.is-mobile) .priority-editor {
    padding: 14px;
  }

  @media (max-width: 420px) {
    .priority-editor__hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .priority-editor__presets {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
