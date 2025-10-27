<script lang="ts">
  import type { GenerationConfig } from '../../types/ai-types';
  import type AnkiPlugin from '../../main';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { OFFICIAL_TEMPLATES } from '../../constants/official-templates';

  interface Props {
    plugin: AnkiPlugin;
    config: GenerationConfig;
    isOpen: boolean;
    onClose: () => void;
    onSave: (config: GenerationConfig) => void;
  }

  let { plugin, config, isOpen, onClose, onSave }: Props = $props();

  // 本地配置状态（深拷贝并确保 templates 字段存在）
  function initializeConfig(sourceConfig: GenerationConfig): GenerationConfig {
    const initialized = JSON.parse(JSON.stringify(sourceConfig));
    if (!initialized.templates) {
      initialized.templates = {
        qa: 'official-qa',
        choice: 'official-choice',
        cloze: 'official-cloze'
      };
    }
    return initialized;
  }
  
  let localConfig = $state<GenerationConfig>(initializeConfig(config));
  
  // 验证错误
  let validationErrors = $state<string[]>([]);

  // 筛选官方模板（基于ID和名称）
  const qaTemplates = OFFICIAL_TEMPLATES.filter(t => 
    t.id === 'basic' || t.id === 'official-qa' || t.name.includes('问答')
  );
  const choiceTemplates = OFFICIAL_TEMPLATES.filter(t => 
    t.id === 'official-choice' || t.name.includes('选择')
  );
  const clozeTemplates = OFFICIAL_TEMPLATES.filter(t => 
    t.id === 'official-cloze' || t.name.includes('挖空') || t.name.includes('填空')
  );

  // 配置预览文本
  let previewText = $derived(() => {
    const { cardCount, difficulty, typeDistribution } = localConfig;
    const types = [];
    if (typeDistribution.qa > 0) types.push(`${typeDistribution.qa}%问答题`);
    if (typeDistribution.cloze > 0) types.push(`${typeDistribution.cloze}%挖空题`);
    if (typeDistribution.choice > 0) types.push(`${typeDistribution.choice}%选择题`);
    
    const difficultyMap = {
      easy: '简单',
      medium: '中等',
      hard: '困难',
      mixed: '混合'
    };
    
    return `将生成 ${cardCount} 张${difficultyMap[difficulty]}难度卡片（${types.join('，')}）`;
  });

  // 重置为当前配置（取消时使用）
  function resetConfig() {
    localConfig = initializeConfig(config);
    validationErrors = [];
  }

  // 重置为默认值
  function resetToDefaults() {
    localConfig = {
      ...localConfig,
      cardCount: 10,
      difficulty: 'medium',
      templates: {
        qa: 'official-qa',
        choice: 'official-choice',
        cloze: 'official-cloze'
      },
      typeDistribution: { qa: 50, cloze: 30, choice: 20 },
      imageGeneration: {
        enabled: false,
        strategy: 'none',
        imagesPerCard: 0,
        placement: 'question'
      },
      autoTags: [],
      enableHints: true
    };
  }

  // 更新题型分布（保持总和100%）
  function updateTypeDistribution(type: 'qa' | 'cloze' | 'choice', value: number) {
    const newConfig = { ...localConfig.typeDistribution };
    newConfig[type] = value;
    
    // 计算剩余两个类型的比例
    const others = (['qa', 'cloze', 'choice'] as const).filter(t => t !== type);
    const remaining = 100 - value;
    const currentOthersTotal = others.reduce((sum, t) => sum + newConfig[t], 0);
    
    if (currentOthersTotal > 0) {
      others.forEach(t => {
        newConfig[t] = Math.round((newConfig[t] / currentOthersTotal) * remaining);
      });
    } else {
      newConfig[others[0]] = Math.floor(remaining / 2);
      newConfig[others[1]] = remaining - newConfig[others[0]];
    }
    
    localConfig.typeDistribution = newConfig;
  }

  // 验证配置
  function validateConfig(): boolean {
    const errors: string[] = [];
    
    if (localConfig.cardCount < 1 || localConfig.cardCount > 50) {
      errors.push('卡片数量必须在 1-50 之间');
    }
    
    const total = localConfig.typeDistribution.qa + 
                  localConfig.typeDistribution.cloze + 
                  localConfig.typeDistribution.choice;
    if (Math.abs(total - 100) > 1) {
      errors.push(`题型分布总和必须为 100%（当前: ${total}%）`);
    }
    
    if (localConfig.imageGeneration.enabled && 
        localConfig.imageGeneration.strategy === 'none') {
      errors.push('已启用图片生成但未选择生成策略');
    }
    
    validationErrors = errors;
    return errors.length === 0;
  }

  // 处理保存
  function handleSave() {
    if (validateConfig()) {
      onSave(localConfig);
    }
  }

  // 处理关闭
  function handleClose() {
    resetConfig();
    onClose();
  }

  // 键盘快捷键
  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;
    
    if (event.key === 'Escape') {
      handleClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleSave();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="modal-overlay" onclick={handleClose}>
    <div class="ai-config-modal" onclick={(e) => e.stopPropagation()}>
      <!-- 头部 -->
      <div class="modal-header">
        <h2 class="modal-title">
          <ObsidianIcon name="sliders" size={20} />
          AI生成配置
        </h2>
        <button class="close-btn" onclick={handleClose} title="关闭 (Esc)">
          <ObsidianIcon name="x" size={18} />
        </button>
      </div>

      <!-- 内容 -->
      <div class="modal-content">
        <!-- 验证错误提示 -->
        {#if validationErrors.length > 0}
          <div class="validation-errors">
            <ObsidianIcon name="alert-circle" size={16} />
            <div class="error-list">
              {#each validationErrors as error}
                <div class="error-item">{error}</div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 卡片生成设置 -->
        <section class="config-section">
          <h3 class="section-title">
            <ObsidianIcon name="file-text" size={16} />
            卡片生成设置
          </h3>

          <!-- 生成数量 -->
          <div class="config-item">
            <label class="config-label">
              生成数量
              <span class="label-hint">（{localConfig.cardCount} 张）</span>
            </label>
            <div class="slider-container">
              <input
                type="range"
                min="1"
                max="50"
                bind:value={localConfig.cardCount}
                class="config-slider"
              />
              <span class="slider-value">{localConfig.cardCount}</span>
            </div>
          </div>

          <!-- 难度级别 -->
          <div class="config-item">
            <label class="config-label">难度级别</label>
            <div class="radio-group">
              <label class="radio-item">
                <input
                  type="radio"
                  name="difficulty"
                  value="easy"
                  bind:group={localConfig.difficulty}
                />
                <span>简单</span>
              </label>
              <label class="radio-item">
                <input
                  type="radio"
                  name="difficulty"
                  value="medium"
                  bind:group={localConfig.difficulty}
                />
                <span>中等</span>
              </label>
              <label class="radio-item">
                <input
                  type="radio"
                  name="difficulty"
                  value="hard"
                  bind:group={localConfig.difficulty}
                />
                <span>困难</span>
              </label>
              <label class="radio-item">
                <input
                  type="radio"
                  name="difficulty"
                  value="mixed"
                  bind:group={localConfig.difficulty}
                />
                <span>混合</span>
              </label>
            </div>
          </div>

          <!-- 卡片模板选择 -->
          <div class="config-item">
            <label class="config-label">卡片模板选择</label>
            
            {#if localConfig.templates}
              <!-- 问答题模板 -->
              <div class="template-select-item">
                <span class="template-label">问答题模板</span>
                <select 
                  bind:value={localConfig.templates.qa} 
                  class="config-select"
                >
                  {#each qaTemplates as template}
                    <option value={template.id}>{template.name}</option>
                  {/each}
                </select>
              </div>

              <!-- 挖空题模板 -->
              <div class="template-select-item">
                <span class="template-label">挖空题模板</span>
                <select 
                  bind:value={localConfig.templates.cloze} 
                  class="config-select"
                >
                  {#each clozeTemplates as template}
                    <option value={template.id}>{template.name}</option>
                  {/each}
                </select>
              </div>

              <!-- 选择题模板 -->
              <div class="template-select-item">
                <span class="template-label">选择题模板</span>
                <select 
                  bind:value={localConfig.templates.choice} 
                  class="config-select"
                >
                  {#each choiceTemplates as template}
                    <option value={template.id}>{template.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>

          <!-- 题型分布 -->
          <div class="config-item">
            <label class="config-label">题型分布</label>
            
            <!-- 问答题 -->
            <div class="distribution-item">
              <span class="distribution-label">问答题</span>
              <div class="slider-container">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.typeDistribution.qa}
                  oninput={(e) => updateTypeDistribution('qa', parseInt((e.target as HTMLInputElement).value))}
                  class="config-slider"
                />
                <span class="slider-value">{localConfig.typeDistribution.qa}%</span>
              </div>
            </div>

            <!-- 挖空题 -->
            <div class="distribution-item">
              <span class="distribution-label">挖空题</span>
              <div class="slider-container">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.typeDistribution.cloze}
                  oninput={(e) => updateTypeDistribution('cloze', parseInt((e.target as HTMLInputElement).value))}
                  class="config-slider"
                />
                <span class="slider-value">{localConfig.typeDistribution.cloze}%</span>
              </div>
            </div>

            <!-- 选择题 -->
            <div class="distribution-item">
              <span class="distribution-label">选择题</span>
              <div class="slider-container">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localConfig.typeDistribution.choice}
                  oninput={(e) => updateTypeDistribution('choice', parseInt((e.target as HTMLInputElement).value))}
                  class="config-slider"
                />
                <span class="slider-value">{localConfig.typeDistribution.choice}%</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 图片生成设置 -->
        <section class="config-section">
          <h3 class="section-title">
            <ObsidianIcon name="image" size={16} />
            图片生成设置
          </h3>

          <!-- 启用图片生成 -->
          <div class="config-item">
            <label class="config-label switch-label">
              <span>启用图片生成</span>
              <input
                type="checkbox"
                bind:checked={localConfig.imageGeneration.enabled}
                class="config-switch"
              />
            </label>
          </div>

          {#if localConfig.imageGeneration.enabled}
            <!-- 生成策略 -->
            <div class="config-item">
              <label class="config-label">生成策略</label>
              <select
                bind:value={localConfig.imageGeneration.strategy}
                class="config-select"
              >
                <option value="none">不生成</option>
                <option value="ai-generate">AI生成</option>
                <option value="search">图片搜索</option>
              </select>
            </div>

            <!-- 每卡图片数 -->
            <div class="config-item">
              <label class="config-label">每卡图片数量</label>
              <select
                bind:value={localConfig.imageGeneration.imagesPerCard}
                class="config-select"
              >
                <option value={0}>0 张</option>
                <option value={1}>1 张</option>
                <option value={2}>2 张</option>
                <option value={3}>3 张</option>
              </select>
            </div>

            <!-- 图片位置 -->
            <div class="config-item">
              <label class="config-label">图片位置</label>
              <select
                bind:value={localConfig.imageGeneration.placement}
                class="config-select"
              >
                <option value="question">问题区</option>
                <option value="answer">答案区</option>
                <option value="both">两者</option>
              </select>
            </div>
          {/if}
        </section>

        <!-- 高级选项 -->
        <section class="config-section">
          <h3 class="section-title">
            <ObsidianIcon name="settings-2" size={16} />
            高级选项
          </h3>

          <!-- 自动标签 -->
          <div class="config-item">
            <label class="config-label">自动添加标签</label>
            <input
              type="text"
              value={localConfig.autoTags.join(', ')}
              oninput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                localConfig.autoTags = value.split(',').map(t => t.trim()).filter(t => t);
              }}
              placeholder="标签1, 标签2, ..."
              class="config-input"
            />
          </div>

          <!-- 启用批注 -->
          <div class="config-item">
            <label class="config-label switch-label">
              <span>启用提示/批注</span>
              <input
                type="checkbox"
                bind:checked={localConfig.enableHints}
                class="config-switch"
              />
            </label>
          </div>
        </section>

        <!-- 配置预览 -->
        <div class="config-preview">
          <ObsidianIcon name="info" size={14} />
          <span class="preview-text">{previewText()}</span>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="modal-footer">
        <button class="reset-btn" onclick={resetToDefaults}>
          <ObsidianIcon name="rotate-ccw" size={14} />
          重置默认
        </button>
        <div class="footer-actions">
          <button class="cancel-btn" onclick={handleClose}>取消</button>
          <button class="save-btn" onclick={handleSave}>
            <ObsidianIcon name="check" size={16} />
            保存并应用
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .ai-config-modal {
    width: 90%;
    max-width: 600px;
    max-height: 85vh;
    background: var(--background-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 头部 */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 1.3em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 内容区 */
  .modal-content {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
  }

  .validation-errors {
    display: flex;
    gap: 8px;
    padding: 12px;
    margin-bottom: 16px;
    background: var(--background-modifier-error);
    border: 1px solid var(--text-error);
    border-radius: 6px;
    color: var(--text-error);
    font-size: 0.85em;
  }

  .error-list {
    flex: 1;
  }

  .error-item {
    margin-bottom: 4px;
  }

  .error-item:last-child {
    margin-bottom: 0;
  }

  /* 配置分组 */
  .config-section {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px 0;
    font-size: 1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  /* 配置项 */
  .config-item {
    margin-bottom: 16px;
  }

  .config-item:last-child {
    margin-bottom: 0;
  }

  .config-label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.9em;
    font-weight: 500;
    color: var(--text-normal);
  }

  .label-hint {
    color: var(--text-muted);
    font-weight: 400;
  }

  /* 滑块 */
  .slider-container {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .config-slider {
    flex: 1;
    height: 4px;
    background: var(--background-modifier-border);
    border-radius: 2px;
    outline: none;
    appearance: none;
  }

  .config-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: var(--interactive-accent);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .config-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .config-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: var(--interactive-accent);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .config-slider::-moz-range-thumb:hover {
    transform: scale(1.2);
  }

  .slider-value {
    min-width: 50px;
    text-align: right;
    font-weight: 600;
    color: var(--interactive-accent);
    font-size: 0.95em;
  }

  /* 单选按钮 */
  .radio-group {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .radio-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .radio-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .radio-item input[type="radio"] {
    cursor: pointer;
  }

  .radio-item input[type="radio"]:checked + span {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  /* 题型分布 */
  .distribution-item {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .distribution-item:last-child {
    margin-bottom: 0;
  }

  .distribution-label {
    min-width: 60px;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  /* 模板选择 */
  .template-select-item {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .template-select-item:last-child {
    margin-bottom: 0;
  }

  .template-label {
    min-width: 90px;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  /* 开关 */
  .switch-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .config-switch {
    position: relative;
    width: 44px;
    height: 24px;
    appearance: none;
    background: var(--background-modifier-border);
    border-radius: 12px;
    outline: none;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .config-switch::before {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    top: 3px;
    left: 3px;
    background: white;
    transition: all 0.3s ease;
  }

  .config-switch:checked {
    background: var(--interactive-accent);
  }

  .config-switch:checked::before {
    left: 23px;
  }

  /* 下拉选择 */
  .config-select {
    width: 100%;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .config-select:hover {
    border-color: var(--interactive-accent);
  }

  .config-select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  /* 输入框 */
  .config-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.9em;
    transition: all 0.2s ease;
  }

  .config-input:hover {
    border-color: var(--interactive-accent);
  }

  .config-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .config-input::placeholder {
    color: var(--text-muted);
  }

  /* 配置预览 */
  .config-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--background-secondary-alt);
    border-left: 3px solid var(--interactive-accent);
    border-radius: 4px;
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .preview-text {
    flex: 1;
  }

  /* 底部按钮 */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .reset-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .reset-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-normal);
    color: var(--text-normal);
  }

  .footer-actions {
    display: flex;
    gap: 8px;
  }

  .cancel-btn {
    padding: 8px 20px;
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-btn:hover {
    background: var(--background-modifier-hover);
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background: var(--interactive-accent);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .save-btn:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .ai-config-modal {
      width: 95%;
      max-height: 90vh;
    }

    .modal-header {
      padding: 16px 20px;
    }

    .modal-title {
      font-size: 1.1em;
    }

    .modal-content {
      padding: 16px 20px;
    }

    .config-section {
      padding: 12px;
    }

    .radio-group {
      flex-direction: column;
      gap: 8px;
    }

    .radio-item {
      width: 100%;
    }
  }
</style>

