<script lang="ts">
  import type { GenerationConfig } from '../../types/ai-types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Props {
    config: GenerationConfig;
    onSave: (config: GenerationConfig) => void;
    onCancel?: () => void;
    saveLabel?: string;
  }

  let {
    config,
    onSave,
    onCancel = undefined,
    saveLabel = '保存并应用'
  }: Props = $props();

  function normalizeConfig(value: GenerationConfig): GenerationConfig {
    const count = Math.max(1, Math.min(value.maxGenerationLimit ?? value.cardCount ?? 20, 50));
    return {
      ...value,
      cardCount: count,
      maxGenerationLimit: count,
      typeDistribution: { ...(value.typeDistribution ?? { qa: 50, cloze: 30, choice: 20 }) }
    };
  }

  let localConfig = $state<GenerationConfig>(normalizeConfig({
    templateId: '',
    promptTemplate: '',
    cardCount: 20,
    difficulty: 'medium',
    typeDistribution: { qa: 50, cloze: 30, choice: 20 },
    provider: 'openai',
    model: '',
    temperature: 0.7,
    maxTokens: 2000,
    templates: { qa: 'official-qa', choice: 'official-choice', cloze: 'official-cloze' },
    enableHints: true,
    maxGenerationLimit: 20,
    prioritizePromptRequirements: true
  }));

  let validationErrors = $state<string[]>([]);

  const visualTypeDistribution = $derived.by(() => {
    const dist = localConfig.typeDistribution;
    const qa = Number(dist.qa) || 0;
    const cloze = Number(dist.cloze) || 0;
    const choice = Number(dist.choice) || 0;
    const sum = qa + cloze + choice;
    if (sum <= 0) {
      return { qa: 0, cloze: 0, choice: 0 };
    }

    const qaPct = Math.max(0, (qa / sum) * 100);
    const clozePct = Math.max(0, (cloze / sum) * 100);
    const choicePct = Math.max(0, 100 - qaPct - clozePct);
    return { qa: qaPct, cloze: clozePct, choice: choicePct };
  });

  $effect(() => {
    localConfig = normalizeConfig(config);
    validationErrors = [];
  });

  function updateTypeDistribution(type: 'qa' | 'cloze' | 'choice', value: number) {
    const nextDistribution = { ...localConfig.typeDistribution };
    nextDistribution[type] = value;
    const otherTypes = (['qa', 'cloze', 'choice'] as const).filter((item) => item !== type);
    const remaining = 100 - value;
    const currentOthersTotal = otherTypes.reduce((sum, item) => sum + nextDistribution[item], 0);

    if (currentOthersTotal > 0) {
      otherTypes.forEach((item) => {
        nextDistribution[item] = Math.round((nextDistribution[item] / currentOthersTotal) * remaining);
      });
    } else {
      nextDistribution[otherTypes[0]] = Math.floor(remaining / 2);
      nextDistribution[otherTypes[1]] = remaining - nextDistribution[otherTypes[0]];
    }

    const total = nextDistribution.qa + nextDistribution.cloze + nextDistribution.choice;
    const diff = 100 - total;
    if (diff !== 0) {
      const target = otherTypes.reduce(
        (best, current) => nextDistribution[current] > nextDistribution[best] ? current : best,
        otherTypes[0]
      );
      nextDistribution[target] = Math.max(0, Math.min(100, nextDistribution[target] + diff));
    }

    localConfig = { ...localConfig, typeDistribution: nextDistribution };
  }

  function resetToDefaults() {
    localConfig = {
      ...localConfig,
      cardCount: 10,
      maxGenerationLimit: 10,
      difficulty: 'medium',
      typeDistribution: { qa: 50, cloze: 30, choice: 20 },
      maxTokens: 2000,
      enableHints: true
    };
    validationErrors = [];
  }

  function validateConfig(): boolean {
    const errors: string[] = [];

    if (localConfig.cardCount < 1 || localConfig.cardCount > 50) {
      errors.push('卡片数量必须在 1-50 之间');
    }

    const total = Object.values(localConfig.typeDistribution).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 1) {
      errors.push(`题型分布总和必须为 100%（当前: ${total}%）`);
    }

    if (!Number.isFinite(localConfig.maxTokens) || localConfig.maxTokens < 1 || localConfig.maxTokens > 64000) {
      errors.push('Token 限制必须在 1-64000 之间');
    }

    validationErrors = errors;
    return errors.length === 0;
  }

  function handleSave() {
    if (!validateConfig()) return;

    onSave({
      ...localConfig,
      typeDistribution: { ...localConfig.typeDistribution },
      cardCount: localConfig.cardCount,
      maxTokens: Math.max(1, Math.floor(localConfig.maxTokens || 0)),
      maxGenerationLimit: localConfig.cardCount
    });
  }
</script>

<div class="generation-config-form">
  {#if validationErrors.length > 0}
    <div class="validation-errors">
      {#each validationErrors as error}
        <div class="error-item">{error}</div>
      {/each}
    </div>
  {/if}

  <div class="config-scroll">
    <section class="config-section difficulty">
      <div class="section-header">
        <div class="section-indicator difficulty-indicator"></div>
        <h3 class="section-title">难度级别</h3>
      </div>
      <div class="config-item">
        <fieldset class="config-fieldset">
          <legend class="visually-hidden">难度级别</legend>
          <div class="radio-group">
            <label class="radio-item">
              <input type="radio" name="difficulty" value="easy" bind:group={localConfig.difficulty} />
              <span class="radio-label">简单</span>
            </label>
            <label class="radio-item">
              <input type="radio" name="difficulty" value="medium" bind:group={localConfig.difficulty} />
              <span class="radio-label">中等</span>
            </label>
            <label class="radio-item">
              <input type="radio" name="difficulty" value="hard" bind:group={localConfig.difficulty} />
              <span class="radio-label">困难</span>
            </label>
            <label class="radio-item">
              <input type="radio" name="difficulty" value="mixed" bind:group={localConfig.difficulty} />
              <span class="radio-label">混合</span>
            </label>
          </div>
        </fieldset>
      </div>
    </section>

    <section class="config-section card-count">
      <div class="section-header">
        <div class="section-indicator count-indicator"></div>
        <h3 class="section-title">生成数量</h3>
      </div>
      <div class="config-item">
        <label class="config-label visually-hidden" for="card-count-slider">
          生成数量 ({localConfig.cardCount} 张)
        </label>
        <div class="slider-row">
          <input
            id="card-count-slider"
            type="range"
            min="1"
            max="50"
            bind:value={localConfig.cardCount}
            class="config-slider full-width"
          />
          <span class="slider-value-inline">{localConfig.cardCount} 张</span>
        </div>
      </div>
    </section>

    <section class="config-section type-distribution">
      <div class="section-header">
        <div class="section-indicator distribution-indicator"></div>
        <h3 class="section-title">题型分布</h3>
      </div>
      <div class="config-item">
        <fieldset class="config-fieldset">
          <legend class="visually-hidden">题型分布</legend>
          <div class="distribution-controls">
            <div class="distribution-item">
              <label class="distribution-label" for="qa-distribution-slider">
                <span class="type-dot qa-dot"></span>
                问答题
              </label>
              <div class="slider-container">
                <input
                  id="qa-distribution-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.typeDistribution.qa}
                  oninput={(event) => updateTypeDistribution('qa', parseInt((event.currentTarget as HTMLInputElement).value))}
                  class="config-slider qa-slider"
                />
                <span class="slider-value">{localConfig.typeDistribution.qa}%</span>
              </div>
            </div>

            <div class="distribution-item">
              <label class="distribution-label" for="cloze-distribution-slider">
                <span class="type-dot cloze-dot"></span>
                挖空题
              </label>
              <div class="slider-container">
                <input
                  id="cloze-distribution-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.typeDistribution.cloze}
                  oninput={(event) => updateTypeDistribution('cloze', parseInt((event.currentTarget as HTMLInputElement).value))}
                  class="config-slider cloze-slider"
                />
                <span class="slider-value">{localConfig.typeDistribution.cloze}%</span>
              </div>
            </div>

            <div class="distribution-item">
              <label class="distribution-label" for="choice-distribution-slider">
                <span class="type-dot choice-dot"></span>
                选择题
              </label>
              <div class="slider-container">
                <input
                  id="choice-distribution-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.typeDistribution.choice}
                  oninput={(event) => updateTypeDistribution('choice', parseInt((event.currentTarget as HTMLInputElement).value))}
                  class="config-slider choice-slider"
                />
                <span class="slider-value">{localConfig.typeDistribution.choice}%</span>
              </div>
            </div>
          </div>

          <div class="distribution-visual">
            <div class="stacked-bar">
              <div class="bar-segment qa-segment" style={`width:${visualTypeDistribution.qa}%`}></div>
              <div class="bar-segment cloze-segment" style={`width:${visualTypeDistribution.cloze}%`}></div>
              <div class="bar-segment choice-segment" style={`width:${visualTypeDistribution.choice}%`}></div>
            </div>
            <div class="bar-legend">
              <span class="legend-item">
                <span class="legend-dot qa-dot"></span>
                问答 {localConfig.typeDistribution.qa}%
              </span>
              <span class="legend-item">
                <span class="legend-dot cloze-dot"></span>
                挖空 {localConfig.typeDistribution.cloze}%
              </span>
              <span class="legend-item">
                <span class="legend-dot choice-dot"></span>
                选择 {localConfig.typeDistribution.choice}%
              </span>
            </div>
          </div>
        </fieldset>
      </div>
    </section>

    <section class="config-section advanced-options">
      <div class="section-header">
        <div class="section-indicator advanced-indicator"></div>
        <h3 class="section-title">高级选项</h3>
      </div>

      <div class="config-item">
        <label class="config-label" for="max-tokens-input">Token 限制</label>
        <input
          id="max-tokens-input"
          type="number"
          min="1"
          max="64000"
          step="100"
          value={localConfig.maxTokens}
          oninput={(event) => {
            const value = parseInt((event.currentTarget as HTMLInputElement).value, 10);
            localConfig = {
              ...localConfig,
              maxTokens: Number.isFinite(value) ? value : 2000
            };
          }}
          placeholder="2000"
          class="config-input"
        />
      </div>
    </section>
  </div>

  <div class="modal-footer">
    <button class="reset-btn obsidian-action-btn" type="button" onclick={resetToDefaults}>
      <ObsidianIcon name="rotate-ccw" size={14} />
      <span class="btn-label">重置默认</span>
    </button>
    <div class="footer-actions setting-item-control">
      {#if onCancel}
        <button class="cancel-btn obsidian-action-btn" type="button" onclick={onCancel}>
          <span class="btn-label">取消</span>
        </button>
      {/if}
      <button class="save-btn obsidian-action-btn mod-cta" type="button" onclick={handleSave}>
        <ObsidianIcon name="check" size={16} />
        <span class="btn-label">{saveLabel}</span>
      </button>
    </div>
  </div>
</div>

<style>
  .generation-config-form {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    --qa-color: #3b82f6;
    --cloze-color: #10b981;
    --choice-color: #f59e0b;
    --difficulty-color: #8b5cf6;
    --count-color: #06b6d4;
    --distribution-color: #ec4899;
    --advanced-color: #6366f1;
    --weave-border-visible: rgba(128, 128, 128, 0.3);
  }

  .config-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }

  .validation-errors {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    margin: 16px 20px 0;
    background: var(--background-modifier-error);
    border: 1px solid var(--text-error);
    border-radius: 6px;
    color: var(--text-error);
    font-size: 0.85em;
  }

  .config-section {
    margin-bottom: 20px;
    padding: 20px;
    border-radius: 8px;
    border: 1px solid var(--weave-border-visible);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .section-indicator {
    width: 4px;
    height: 24px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .difficulty-indicator { background: var(--difficulty-color); }
  .count-indicator { background: var(--count-color); }
  .distribution-indicator { background: var(--distribution-color); }
  .advanced-indicator { background: var(--advanced-color); }

  .section-title {
    flex: 1;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .config-item {
    margin-bottom: 16px;
  }

  .config-item:last-child {
    margin-bottom: 0;
  }

  .config-fieldset {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }

  .config-label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .config-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--weave-border-visible);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .config-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 3px rgba(var(--interactive-accent-rgb), 0.1);
  }

  .radio-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .radio-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--background-primary);
    border: 1px solid var(--weave-border-visible);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .radio-item:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .radio-item input[type="radio"] {
    appearance: none;
    width: 16px;
    height: 16px;
    border: 2px solid var(--text-muted);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    margin: 0;
  }

  .radio-item input[type="radio"]:checked {
    border-color: var(--interactive-accent);
    background: var(--interactive-accent);
  }

  .radio-item input[type="radio"]:checked::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
  }

  .radio-item:has(input:checked) {
    border-color: var(--interactive-accent);
    background: rgba(124, 58, 237, 0.1);
  }

  .radio-label {
    font-size: 0.875rem;
    color: var(--text-normal);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
  }

  .config-slider.full-width {
    flex: 1;
  }

  .slider-value-inline {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
    min-width: 60px;
    text-align: right;
  }

  .distribution-controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }

  .distribution-item {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .distribution-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 80px;
    font-size: 0.875rem;
    color: var(--text-normal);
  }

  .type-dot,
  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .qa-dot { background: var(--qa-color); }
  .cloze-dot { background: var(--cloze-color); }
  .choice-dot { background: var(--choice-color); }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
  }

  .slider-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
    min-width: 50px;
    text-align: right;
  }

  .config-slider {
    flex: 1;
    height: 6px;
    appearance: none;
    background: var(--weave-border-visible);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .config-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--interactive-accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
  }

  .config-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
  }

  .config-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--interactive-accent);
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  .qa-slider::-webkit-slider-thumb { background: var(--qa-color); }
  .cloze-slider::-webkit-slider-thumb { background: var(--cloze-color); }
  .choice-slider::-webkit-slider-thumb { background: var(--choice-color); }
  .qa-slider::-moz-range-thumb { background: var(--qa-color); }
  .cloze-slider::-moz-range-thumb { background: var(--cloze-color); }
  .choice-slider::-moz-range-thumb { background: var(--choice-color); }

  .distribution-visual {
    padding-top: 16px;
    border-top: 1px solid var(--weave-border-visible);
  }

  .stacked-bar {
    display: flex;
    height: 24px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--weave-border-visible);
  }

  .bar-segment {
    height: 100%;
    transition: width 0.3s ease;
  }

  .qa-segment { background: var(--qa-color); }
  .cloze-segment { background: var(--cloze-color); }
  .choice-segment { background: var(--choice-color); }

  .bar-legend {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid var(--weave-border-visible);
    background: var(--background-primary);
    flex-shrink: 0;
  }

  .footer-actions {
    display: flex;
    gap: 8px;
  }

  .reset-btn,
  .cancel-btn,
  .save-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .config-scroll {
      padding: 16px;
    }

    .distribution-item {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .distribution-label {
      min-width: 0;
    }

    .modal-footer .btn-label {
      display: none;
    }

    .reset-btn,
    .cancel-btn,
    .save-btn {
      padding: 10px 16px;
    }
  }
</style>
