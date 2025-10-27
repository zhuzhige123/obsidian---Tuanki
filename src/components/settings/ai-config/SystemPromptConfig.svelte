<script lang="ts">
  import type { SystemPromptConfig } from "../../../types/ai-types";
  import type { GenerationConfig } from "../../../types/ai-types";
  import ObsidianIcon from "../../ui/ObsidianIcon.svelte";
  import { PromptBuilderService } from "../../../services/ai/PromptBuilderService";

  interface Props {
    systemPromptConfig: SystemPromptConfig;
  }

  let { systemPromptConfig = $bindable() }: Props = $props();

  // 展开/折叠内置系统提示词
  let showBuiltinPrompt = $state(false);

  // 用于预览的配置（示例）
  const sampleConfig: GenerationConfig = {
    templateId: 'standard-qa',
    promptTemplate: '请根据以下内容生成学习卡片',
    cardCount: 10,
    difficulty: 'medium',
    typeDistribution: {
      qa: 50,
      cloze: 30,
      choice: 20
    },
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 2000,
    imageGeneration: {
      enabled: false,
      strategy: 'none',
      imagesPerCard: 0,
      placement: 'question'
    },
    templates: {
      qa: 'official-qa',
      choice: 'official-choice',
      cloze: 'official-cloze'
    },
    autoTags: [],
    enableHints: true
  };

  // 获取内置系统提示词（用于只读展示）
  let builtinPrompt = $derived(() => {
    return PromptBuilderService.getBuiltinSystemPrompt(sampleConfig);
  });

  // 切换使用内置/自定义
  function toggleBuiltin() {
    systemPromptConfig.useBuiltin = !systemPromptConfig.useBuiltin;
    if (systemPromptConfig.useBuiltin) {
      // 切换回内置时记录修改时间
      systemPromptConfig.lastModified = undefined;
    } else {
      // 切换到自定义时，如果自定义提示词为空，填充内置作为起点
      if (!systemPromptConfig.customPrompt) {
        systemPromptConfig.customPrompt = builtinPrompt();
      }
      systemPromptConfig.lastModified = new Date().toISOString();
    }
  }

  // 恢复默认
  function restoreDefault() {
    if (confirm('确定要恢复默认的系统提示词吗？这将清空您的自定义内容。')) {
      systemPromptConfig.customPrompt = '';
      systemPromptConfig.useBuiltin = true;
      systemPromptConfig.lastModified = undefined;
    }
  }

  // 使用内置作为模板
  function useBuiltinAsTemplate() {
    if (systemPromptConfig.customPrompt && !confirm('这将覆盖当前的自定义内容，确定继续吗？')) {
      return;
    }
    systemPromptConfig.customPrompt = builtinPrompt();
    systemPromptConfig.lastModified = new Date().toISOString();
  }

  // 监听自定义提示词变化
  function handleCustomPromptChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    systemPromptConfig.customPrompt = target.value;
    systemPromptConfig.lastModified = new Date().toISOString();
  }
</script>

<div class="system-prompt-config">
  <!-- 使用内置/自定义切换 -->
  <div class="config-toggle">
    <div class="toggle-row">
      <div class="toggle-info">
        <div class="toggle-label">
          <ObsidianIcon name="wand-sparkles" size={18} />
          <span>使用内置系统提示词</span>
        </div>
        <p class="toggle-description">
          内置系统提示词包含完整的格式规范和生成要求，确保生成标准化的学习卡片。
        </p>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          bind:checked={systemPromptConfig.useBuiltin}
          onchange={toggleBuiltin}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

  {#if systemPromptConfig.useBuiltin}
    <!-- 内置系统提示词展示 -->
    <div class="builtin-section">
      <div class="section-header">
        <div class="header-left">
          <h4>内置系统提示词</h4>
          <span class="badge badge-readonly">只读</span>
        </div>
        <button
          class="btn-toggle"
          onclick={() => showBuiltinPrompt = !showBuiltinPrompt}
        >
          <ObsidianIcon name={showBuiltinPrompt ? "chevron-up" : "chevron-down"} size={16} />
          <span>{showBuiltinPrompt ? "收起" : "查看内容"}</span>
        </button>
      </div>

      {#if showBuiltinPrompt}
        <div class="prompt-preview">
          <div class="preview-toolbar">
            <span class="toolbar-info">
              <ObsidianIcon name="info" size={14} />
              此为示例预览（基于默认配置），实际使用时会根据生成配置动态调整
            </span>
          </div>
          <div class="prompt-content">{builtinPrompt()}</div>
        </div>
      {/if}

      <div class="info-card">
        <ObsidianIcon name="lightbulb" size={16} />
        <div class="info-content">
          <p><strong>内置系统提示词的作用：</strong></p>
          <ul>
            <li>定义标准的卡片JSON格式（问答题、挖空题、选择题）</li>
            <li>说明必需的字段和可选的增强字段（Hint、Explanation等）</li>
            <li>规范选择题的&#123;✓&#125;标记语法</li>
            <li>指导生成高质量的学习卡片</li>
          </ul>
        </div>
      </div>
    </div>
  {:else}
    <!-- 自定义系统提示词编辑 -->
    <div class="custom-section">
      <div class="section-header">
        <div class="header-left">
          <h4>自定义系统提示词</h4>
          <span class="badge badge-custom">自定义</span>
        </div>
        <div class="header-actions">
          <button
            class="btn btn-secondary"
            onclick={useBuiltinAsTemplate}
            title="使用内置提示词作为起点"
          >
            <ObsidianIcon name="copy" size={14} />
            <span>使用内置作为模板</span>
          </button>
          <button
            class="btn btn-danger"
            onclick={restoreDefault}
            title="恢复默认"
          >
            <ObsidianIcon name="rotate-ccw" size={14} />
            <span>恢复默认</span>
          </button>
        </div>
      </div>

      <div class="editor-container">
        <div class="editor-toolbar">
          <span class="toolbar-label">
            <ObsidianIcon name="edit-3" size={14} />
            编辑系统提示词
          </span>
          {#if systemPromptConfig.lastModified}
            <span class="last-modified">
              最后修改：{new Date(systemPromptConfig.lastModified).toLocaleString('zh-CN')}
            </span>
          {/if}
        </div>
        <textarea
          class="prompt-editor"
          placeholder="在此输入自定义系统提示词...&#10;&#10;提示：系统提示词用于指导AI理解输出格式和要求。您可以：&#10;1. 定义自己的卡片格式&#10;2. 添加特殊要求或约束&#10;3. 使用变量占位符：&#123;cardCount&#125;、&#123;difficulty&#125;等"
          value={systemPromptConfig.customPrompt}
          oninput={handleCustomPromptChange}
        ></textarea>
      </div>

      <div class="warning-card">
        <ObsidianIcon name="alert-triangle" size={16} />
        <div class="warning-content">
          <p><strong>⚠️ 注意事项：</strong></p>
          <ul>
            <li>自定义系统提示词可能导致生成的卡片格式不符合Tuanki要求</li>
            <li>请确保包含必要的JSON格式说明和字段定义</li>
            <li>选择题必须说明使用 &#123;✓&#125; 标记正确答案</li>
            <li>挖空题必须说明使用 ==文本== 语法</li>
            <li>建议先使用"内置作为模板"，然后在此基础上修改</li>
          </ul>
        </div>
      </div>

      <div class="variable-help">
        <h5>
          <ObsidianIcon name="code" size={14} />
          可用变量
        </h5>
        <div class="variable-grid">
          <div class="variable-item">
            <code>&#123;cardCount&#125;</code>
            <span>卡片数量</span>
          </div>
          <div class="variable-item">
            <code>&#123;difficulty&#125;</code>
            <span>难度等级</span>
          </div>
          <div class="variable-item">
            <code>&#123;qaPercent&#125;</code>
            <span>问答题百分比</span>
          </div>
          <div class="variable-item">
            <code>&#123;clozePercent&#125;</code>
            <span>挖空题百分比</span>
          </div>
          <div class="variable-item">
            <code>&#123;choicePercent&#125;</code>
            <span>选择题百分比</span>
          </div>
        </div>
        <p class="help-text">
          这些变量会在实际使用时自动替换为相应的值
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .system-prompt-config {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* 切换器 */
  .config-toggle {
    padding: 16px;
    background: var(--background-primary-alt);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }

  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .toggle-info {
    flex: 1;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 1.05em;
    color: var(--text-normal);
    margin-bottom: 6px;
  }

  .toggle-description {
    margin: 0;
    font-size: 0.9em;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
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

  /* 区域头部 */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-header h4 {
    margin: 0;
    font-size: 1.05em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .badge {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.7em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-readonly {
    background: rgba(107, 114, 128, 0.2);
    color: rgb(107, 114, 128);
  }

  .badge-custom {
    background: rgba(139, 92, 246, 0.2);
    color: rgb(139, 92, 246);
  }

  /* 内置提示词展示 */
  .builtin-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .prompt-preview {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .preview-toolbar {
    padding: 10px 14px;
    background: var(--background-primary-alt);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .toolbar-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .prompt-content {
    padding: 16px;
    font-family: var(--font-monospace);
    font-size: 0.8em;
    line-height: 1.6;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 400px;
    overflow-y: auto;
  }

  /* 自定义编辑器 */
  .custom-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .editor-container {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--background-primary-alt);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .toolbar-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9em;
    font-weight: 500;
    color: var(--text-normal);
  }

  .last-modified {
    font-size: 0.75em;
    color: var(--text-muted);
  }

  .prompt-editor {
    width: 100%;
    min-height: 300px;
    padding: 16px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-family: var(--font-monospace);
    font-size: 0.85em;
    line-height: 1.6;
    resize: vertical;
    outline: none;
  }

  /* 信息卡片 */
  .info-card,
  .warning-card {
    display: flex;
    gap: 12px;
    padding: 14px;
    border-radius: 8px;
  }

  .info-card {
    background: rgba(59, 130, 246, 0.1);
    border-left: 3px solid rgb(59, 130, 246);
  }

  .warning-card {
    background: rgba(245, 158, 11, 0.1);
    border-left: 3px solid rgb(245, 158, 11);
  }

  .info-content,
  .warning-content {
    flex: 1;
  }

  .info-content p,
  .warning-content p {
    margin: 0 0 8px 0;
    font-size: 0.9em;
    color: var(--text-normal);
  }

  .info-content ul,
  .warning-content ul {
    margin: 0;
    padding-left: 20px;
  }

  .info-content li,
  .warning-content li {
    margin: 4px 0;
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.5;
  }

  /* 变量帮助 */
  .variable-help {
    padding: 16px;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }

  .variable-help h5 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 12px 0;
    font-size: 0.95em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .variable-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }

  .variable-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .variable-item code {
    padding: 4px 8px;
    background: var(--background-primary-alt);
    border-radius: 4px;
    font-family: var(--font-monospace);
    font-size: 0.8em;
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .variable-item span {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .help-text {
    margin: 0;
    font-size: 0.85em;
    color: var(--text-muted);
    line-height: 1.4;
  }

  /* 按钮 */
  .btn,
  .btn-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    font-size: 0.85em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn {
    background: var(--interactive-normal);
    color: var(--text-normal);
  }

  .btn:hover {
    background: var(--interactive-hover);
    transform: translateY(-1px);
  }

  .btn-secondary {
    background: var(--interactive-accent);
    color: white;
  }

  .btn-secondary:hover {
    background: var(--interactive-accent-hover);
  }

  .btn-danger {
    background: rgb(239, 68, 68);
    color: white;
  }

  .btn-danger:hover {
    background: rgb(220, 38, 38);
  }

  .btn-toggle {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-toggle:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 滚动条 */
  .prompt-content::-webkit-scrollbar,
  .prompt-editor::-webkit-scrollbar {
    width: 8px;
  }

  .prompt-content::-webkit-scrollbar-track,
  .prompt-editor::-webkit-scrollbar-track {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .prompt-content::-webkit-scrollbar-thumb,
  .prompt-editor::-webkit-scrollbar-thumb {
    background: var(--text-muted);
    border-radius: 4px;
  }

  .prompt-content::-webkit-scrollbar-thumb:hover,
  .prompt-editor::-webkit-scrollbar-thumb:hover {
    background: var(--text-normal);
  }
</style>

