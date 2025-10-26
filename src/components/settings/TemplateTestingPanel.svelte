<script lang="ts">
  import type { FieldTemplate } from "../../data/template-types";
  import type { ParseTemplate, SimplifiedParsingSettings } from "../../types/newCardParsingTypes";
  import type { UnifiedCardType } from "../../types/unified-card-types";
  import type AnkiPlugin from "../../main";
  import { SimplifiedCardParser } from "../../utils/simplifiedParser/SimplifiedCardParser";
  import { CardTypeDetector } from "../../components/preview/CardTypeDetector";
  import { ContentPreviewEngine } from "../../components/preview/ContentPreviewEngine";
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { onMount } from "svelte";

  interface Props {
    mode: 'field' | 'regex';
    template: FieldTemplate | ParseTemplate;
    plugin: AnkiPlugin;
    onTemplateUpdate?: (template: FieldTemplate | ParseTemplate) => void;
  }

  let { mode, template, plugin, onTemplateUpdate }: Props = $props();

  // 测试内容状态
  let testContent = $state('');
  let isExpanded = $state(true);
  let isLoading = $state(false);

  // 解析结果状态
  let parseResult = $state<{
    success: boolean;
    fields?: Record<string, string>;
    cardType?: UnifiedCardType;
    confidence?: number;
    strategy?: string;
    warnings?: string[];
    error?: string;
  } | null>(null);

  // 预览状态
  let previewData = $state<{
    frontContent: string;
    backContent: string;
    cardType: UnifiedCardType;
    renderingHints: any;
  } | null>(null);

  // 服务实例
  let cardParser: SimplifiedCardParser;
  let previewEngine: ContentPreviewEngine;
  let cardTypeDetector: CardTypeDetector;

  onMount(() => {
    // 获取当前的简化解析设置
    const parsingSettings = plugin.settings?.simplifiedParsing;
    if (parsingSettings) {
      // 🔧 为测试场景创建特殊配置：禁用触发标签检查
      const testParsingSettings = {
        ...parsingSettings,
        enableTagTrigger: false  // 测试环境禁用触发标签检查
      };

      cardParser = new SimplifiedCardParser(testParsingSettings);
      previewEngine = new ContentPreviewEngine(plugin);
      cardTypeDetector = new CardTypeDetector();
    }
  });

  // 防抖处理函数
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleContentChange() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      parseTestContent();
    }, 300);
  }

  // 解析测试内容
  async function parseTestContent() {
    if (!testContent.trim() || !cardParser) {
      parseResult = null;
      previewData = null;
      return;
    }

    isLoading = true;

    try {
      // 使用SimplifiedCardParser进行解析
      const parsingSettings = plugin.settings?.simplifiedParsing;
      if (!parsingSettings) {
        parseResult = {
          success: false,
          error: '解析设置未配置'
        };
        previewData = null;
        return;
      }

      // 🔧 测试场景特殊配置：禁用触发标签检查
      const testParsingSettings = {
        ...parsingSettings,
        enableTagTrigger: false  // 测试场景禁用触发标签检查，允许用户测试纯内容
      };

      const parseConfig = {
        scenario: 'newCard' as const,
        templateId: template?.id,
        settings: testParsingSettings
      };

      const result = await cardParser.parseContent(testContent, parseConfig);

      if (result.success && result.cards.length > 0) {
        const card = result.cards[0];

        // 检测卡片类型 - 使用静态方法
        const mockCard = {
          id: 'test-card',
          fields: card.fields,
          tags: card.tags || [],
          deckId: 'test-deck'
        };
        const cardTypeResult = CardTypeDetector.detectCardType(mockCard as any);

        parseResult = {
          success: true,
          fields: card.fields,
          cardType: cardTypeResult.cardType,
          confidence: cardTypeResult.confidence,
          strategy: 'simplified-parser',
          warnings: result.errors.map(e => e.message)
        };

        // 生成预览数据
        await generatePreview(card.fields || {}, cardTypeResult.cardType);
      } else {
        const errorMessages = result.errors.map(e => e.message);
        parseResult = {
          success: false,
          error: errorMessages.join('; ') || '解析失败'
        };
        previewData = null;
      }
    } catch (error) {
      parseResult = {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
      previewData = null;
    } finally {
      isLoading = false;
    }
  }

  // 生成预览内容
  async function generatePreview(fields: Record<string, string>, cardType: UnifiedCardType) {
    try {
      let frontContent = '';
      let backContent = '';

      if (mode === 'field') {
        // FieldTemplate 模式
        const fieldTemplate = template as FieldTemplate;
        frontContent = fieldTemplate.frontTemplate || '';
        backContent = fieldTemplate.backTemplate || '';

        // 替换模板变量
        for (const [key, value] of Object.entries(fields)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          frontContent = frontContent.replace(regex, value || '');
          backContent = backContent.replace(regex, value || '');
        }
      } else {
        // 🔥 ParseTemplate 模式 - 基于字段合成预览
        // 回退：基于字段合成简易预览
        frontContent = fields.Front || fields.front ||
                      (fields.question ? `## ${fields.question}${fields.options ? '\n\n' + fields.options : ''}` : '');
        backContent = fields.Back || fields.back ||
                     (fields.correct_answer ? `答案: ${fields.correct_answer}${fields.explanation ? '\n\n解析: ' + fields.explanation : ''}` : '');
      }

      previewData = {
        frontContent,
        backContent,
        cardType,
        renderingHints: {
          questionPosition: 'top',
          answerReveal: 'click',
          showProgress: false,
          enableAnimations: true
        }
      };
    } catch (error) {
      console.error('预览生成失败:', error);
      previewData = null;
    }
  }

  // 加载示例内容 - 使用当前SimplifiedParsingSettings系统支持的格式
  function loadExampleContent() {
    // 根据当前模板类型生成适合的示例内容
    if (!template) {
      testContent = `# 示例内容

请先配置模板字段，然后在此输入测试内容。`;
      handleContentChange();
      return;
    }

    // 🎯 优先根据官方模板ID生成专用示例
    if (template.isOfficial) {
      switch (template.id) {
        case 'official-qa':
          testContent = `什么是机器学习？

---div---

机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。`;
          break;

        case 'official-choice':
          testContent = `以下哪个是机器学习的主要类型？

A. 监督学习
B. 无监督学习
C. 强化学习
D. 以上都是

---div---

答案：D. 以上都是

解释：机器学习主要包括监督学习、无监督学习和强化学习三大类型。`;
          break;

        case 'official-cloze':
          testContent = `机器学习是==人工智能==的一个分支，通过==算法==让计算机从数据中学习。

深度学习是机器学习的==子集==，使用==神经网络==进行复杂模式识别。`;
          break;

        default:
          testContent = `什么是机器学习？

---div---

机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。`;
      }
      handleContentChange();
      return;
    }

    // 根据模板类型生成示例
    if (mode === 'field' && 'fields' in template) {
      // 单字段解析模式 - 根据字段配置生成示例
      const fieldTemplate = template as any;
      if (fieldTemplate.fields && fieldTemplate.fields.length > 0) {
        const exampleParts: string[] = [];

        fieldTemplate.fields.forEach((field: any, index: number) => {
          if (field.name.toLowerCase().includes('question') || field.name.toLowerCase().includes('front')) {
            exampleParts.push(`什么是机器学习？`);
          } else if (field.name.toLowerCase().includes('answer') || field.name.toLowerCase().includes('back')) {
            exampleParts.push(`机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。`);
          } else if (field.name.toLowerCase().includes('option')) {
            exampleParts.push(`A) 监督学习\nB) 无监督学习\nC) 强化学习\nD) 以上都是`);
          } else {
            exampleParts.push(`示例${field.name}内容`);
          }

          if (index < fieldTemplate.fields.length - 1) {
            exampleParts.push('---div---'); // 使用当前系统的分隔符
          }
        });

        testContent = exampleParts.join('\n\n');
      } else {
        testContent = `什么是机器学习？

---div---

机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。`;
      }
    } else if (mode === 'regex' && 'regex' in template) {
      // 完整正则解析模式 - 生成符合正则的示例
      testContent = `什么是深度学习？

深度学习是机器学习的子集，使用多层神经网络来学习数据的复杂模式和表示。

#机器学习 #深度学习`;
    } else {
      // 默认示例
      testContent = `什么是机器学习？

---div---

机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。`;
    }

    handleContentChange();
  }

  // 清空测试内容
  function clearTestContent() {
    testContent = '';
    parseResult = null;
    previewData = null;
  }

  // 切换展开状态
  function toggleExpanded() {
    isExpanded = !isExpanded;
  }
</script>

<div class="template-testing-panel">
  <!-- 面板头部 -->
  <div
    class="panel-header"
    onclick={toggleExpanded}
    onkeydown={(e) => e.key === 'Enter' && toggleExpanded()}
    role="button"
    tabindex="0"
    aria-expanded={isExpanded}
  >
    <div class="header-left">
      <EnhancedIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} />
      <h4>MD卡片测试与预览</h4>
      {#if parseResult?.success}
        <span class="status-badge success">
          <EnhancedIcon name="check-circle" />
          解析成功
        </span>
      {:else if parseResult?.error}
        <span class="status-badge error">
          <EnhancedIcon name="alert-triangle" />
          解析失败
        </span>
      {/if}
    </div>
    <div class="header-right">
      {#if isLoading}
        <span class="loading-indicator">
          <EnhancedIcon name="loader" />
          解析中...
        </span>
      {/if}
    </div>
  </div>

  <!-- 面板内容 -->
  {#if isExpanded}
    <div class="panel-content">
      <div class="testing-container">
        <!-- 左侧：MD编辑区 -->
        <div class="test-input-panel">
          <div class="panel-section-header">
            <h5>MD测试内容</h5>
            <div class="controls">
              <EnhancedButton variant="secondary" size="sm" onclick={loadExampleContent}>
                <EnhancedIcon name="file-text" />
                加载示例
              </EnhancedButton>
              <EnhancedButton variant="secondary" size="sm" onclick={clearTestContent}>
                <EnhancedIcon name="trash-2" />
                清空
              </EnhancedButton>
            </div>
          </div>
          
          <textarea
            bind:value={testContent}
            class="test-editor"
            placeholder="在此输入测试内容，查看模板解析和渲染效果...

示例格式：
什么是机器学习？

---div---

机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。"
            oninput={handleContentChange}
            rows="12"
          ></textarea>

          <!-- 解析模式指示器 -->
          <div class="parse-mode-indicator">
            <span class="mode-label">解析模式:</span>
            <span class="mode-value">
              {mode === 'field' ? '单字段解析' : '完整正则解析'}
            </span>
          </div>
        </div>

        <!-- 右侧：实时预览区 -->
        <div class="preview-panel">
          <div class="panel-section-header">
            <h5>实时解析预览</h5>
            {#if parseResult?.cardType}
              <span class="card-type-badge">
                <EnhancedIcon name="credit-card" />
                {parseResult.cardType}
              </span>
            {/if}
          </div>

          <div class="preview-container">
            {#if isLoading}
              <div class="preview-loading">
                <EnhancedIcon name="loader" />
                <p>正在解析内容...</p>
              </div>
            {:else if parseResult?.success && previewData}
              <!-- 预览内容 -->
              <div class="preview-content">
                <div class="preview-section front-section">
                  <h6>正面 (问题)</h6>
                  <div class="preview-card front-card">
                    {@html previewData.frontContent || '<em>无内容</em>'}
                  </div>
                </div>

                <div class="preview-section back-section">
                  <h6>背面 (答案)</h6>
                  <div class="preview-card back-card">
                    {@html previewData.backContent || '<em>无内容</em>'}
                  </div>
                </div>
              </div>

              <!-- 解析信息 -->
              <div class="parse-info">
                <div class="info-row">
                  <span class="info-label">置信度:</span>
                  <span class="info-value">{(parseResult.confidence || 0).toFixed(2)}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">策略:</span>
                  <span class="info-value">{parseResult.strategy}</span>
                </div>
                {#if parseResult.warnings && parseResult.warnings.length > 0}
                  <div class="warnings">
                    <h6>警告信息:</h6>
                    <ul>
                      {#each parseResult.warnings as warning}
                        <li>{warning}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {:else if parseResult?.error}
              <!-- 错误显示 -->
              <div class="preview-error">
                <EnhancedIcon name="alert-triangle" />
                <h6>解析失败</h6>
                <p>{parseResult.error}</p>
                <div class="error-suggestions">
                  <p><strong>建议:</strong></p>
                  <ul>
                    <li>检查MD格式是否正确</li>
                    <li>确保使用了正确的字段标题格式 (!字段名)</li>
                    <li>验证模板配置是否完整</li>
                  </ul>
                </div>
              </div>
            {:else}
              <!-- 空状态 -->
              <div class="preview-empty">
                <EnhancedIcon name="edit-3" />
                <h6>开始测试</h6>
                <p>在左侧输入MD格式的测试内容，这里将显示实时解析预览效果</p>
                <EnhancedButton variant="secondary" size="sm" onclick={loadExampleContent}>
                  加载示例内容
                </EnhancedButton>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .template-testing-panel {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    margin-top: 1rem;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
    cursor: pointer;
    user-select: none;
  }

  .panel-header:hover {
    background: var(--background-modifier-hover);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-left h4 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.success {
    background: var(--color-green-bg);
    color: var(--color-green);
  }

  .status-badge.error {
    background: var(--color-red-bg);
    color: var(--color-red);
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .panel-content {
    padding: 1rem;
  }

  .testing-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    min-height: 400px;
  }

  .test-input-panel,
  .preview-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panel-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-section-header h5 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .controls {
    display: flex;
    gap: 0.5rem;
  }

  .test-editor {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-monospace);
    font-size: 0.85rem;
    line-height: 1.4;
    resize: vertical;
    min-height: 200px;
  }

  .test-editor:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .parse-mode-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--background-primary);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .mode-label {
    color: var(--text-muted);
  }

  .mode-value {
    color: var(--text-accent);
    font-weight: 500;
  }

  .card-type-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--interactive-accent-bg);
    color: var(--interactive-accent);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .preview-container {
    flex: 1;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    overflow: auto;
  }

  .preview-loading,
  .preview-empty,
  .preview-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    height: 100%;
    min-height: 200px;
  }

  .preview-loading p,
  .preview-empty p,
  .preview-error p {
    margin: 0.5rem 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .preview-empty h6,
  .preview-error h6 {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--text-normal);
  }

  .preview-content {
    padding: 1rem;
  }

  .preview-section {
    margin-bottom: 1rem;
  }

  .preview-section:last-child {
    margin-bottom: 0;
  }

  .preview-section h6 {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-card {
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-secondary);
    min-height: 3rem;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .front-card {
    border-left: 3px solid var(--interactive-accent);
  }

  .back-card {
    border-left: 3px solid var(--color-green);
  }

  .parse-info {
    padding: 0.75rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    font-size: 0.75rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.25rem;
  }

  .info-label {
    color: var(--text-muted);
  }

  .info-value {
    color: var(--text-normal);
    font-weight: 500;
  }

  .warnings {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .warnings h6 {
    margin: 0 0 0.25rem 0;
    font-size: 0.75rem;
    color: var(--color-orange);
  }

  .warnings ul {
    margin: 0;
    padding-left: 1rem;
    color: var(--text-muted);
  }

  .warnings li {
    margin-bottom: 0.125rem;
  }

  .error-suggestions {
    margin-top: 0.75rem;
    text-align: left;
  }

  .error-suggestions p {
    margin: 0 0 0.25rem 0;
    font-weight: 500;
  }

  .error-suggestions ul {
    margin: 0;
    padding-left: 1rem;
  }

  .error-suggestions li {
    margin-bottom: 0.25rem;
    font-size: 0.8rem;
  }

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .testing-container {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }
</style>
