<script lang="ts">
  import type { FieldTemplate, FieldTemplateField, TemplateItem } from "../../data/template-types";
  import type { ParseTemplate } from "../../types/newCardParsingTypes";
  import { UnifiedCardType, getCardTypeName, CARD_TYPE_METADATA } from "../../types/unified-card-types";
  import { generateId } from "../../utils/helpers";
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { validateRegexSync, getRegexSecurityAdvice } from "../../utils/regex-validator";
  import { onMount } from "svelte";
  import TemplateTestingPanel from "./TemplateTestingPanel.svelte";
  import type AnkiPlugin from "../../main";


  type Props = {
    mode: 'field' | 'regex';
    template?: FieldTemplate | ParseTemplate | null;
    onSave: (template: FieldTemplate | ParseTemplate) => void;
    onClose: () => void;
    plugin?: AnkiPlugin;
  }
  let { mode, template, onSave, onClose, plugin }: Props = $props();

  const createDefaultFieldTemplate = (): FieldTemplate => ({
    id: generateId(),
    name: '新字段模板',
    fields: [
      { id: generateId(), type: 'field', name: '问题', key: 'front', side: 'front' },
      { id: generateId(), type: 'field', name: '答案', key: 'back', side: 'back' }
    ],
    frontTemplate: '{{front}}',
    backTemplate: '{{back}}',
    description: ''
  });

  const createDefaultRegexTemplate = (): ParseTemplate => ({
    id: generateId(), 
    name: '新解析模板', 
    description: '', 
    regex: '^([^\\n]+)\\n\\n((?:.|\\n)*)$', 
    fieldMappings: { front: 1, back: 2, tags: undefined }
  });

  // 安全的深拷贝函数，避免 structuredClone 的问题
  function safeClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  let currentTemplate = $state(
    template
    ? JSON.parse(JSON.stringify(template))
    : (mode === 'field'
      ? createDefaultFieldTemplate()
      : createDefaultRegexTemplate())
  );

  // 判断是否为官方模板
  let isOfficial = $derived((currentTemplate as any).isOfficial || false);


  // 测试相关状态
  let testText = $state('');
  let testResult = $state<{
    success: boolean;
    front?: string;
    back?: string;
    tags?: string;
    error?: string;
    warnings?: string[];
    criticalIssues?: string[];
    suggestions?: string[];
    captureGroupCount?: number;
    usedGroups?: number[];
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    complexity?: 'low' | 'medium' | 'high' | 'dangerous';
  } | null>(null);



  // 实时测试正则表达式 - 增强安全版本
  function testRegex() {
    if (mode !== 'regex' || !testText.trim()) {
      testResult = null;
      return;
    }

    const regexTemplate = currentTemplate as ParseTemplate;
    if (!regexTemplate.regex || !regexTemplate.regex.trim()) {
      testResult = { success: false, error: '请先输入正则表达式' };
      return;
    }

    try {
      // 使用增强的正则表达式验证器
      const validation = validateRegexSync(regexTemplate.regex, {
        maxLength: 1000,
        maxComplexity: 100,
        allowLookahead: false,
        allowLookbehind: false,
        allowBackreferences: false,
        timeoutMs: 500
      });

      if (!validation.isValid) {
        testResult = {
          success: false,
          error: validation.error || '正则表达式验证失败',
          warnings: validation.warnings,
          criticalIssues: validation.criticalIssues,
          suggestions: validation.suggestions || [
            '检查正则表达式语法是否正确',
            '避免使用可能导致性能问题的模式',
            '考虑简化复杂的正则表达式'
          ]
        };
        return;
      }

      // 如果有警告，显示但继续测试
      const securityWarnings: string[] = [];
      if (validation.warnings && validation.warnings.length > 0) {
        securityWarnings.push(...validation.warnings);
      }
      if (validation.riskLevel && validation.riskLevel !== 'low') {
        securityWarnings.push(`风险级别: ${validation.riskLevel}`);
      }

      const regex = new RegExp(regexTemplate.regex, 'm');
      const match = testText.match(regex);

      if (!match) {
        testResult = {
          success: false,
          error: '正则表达式未匹配到任何内容',
          suggestions: [
            '检查正则表达式语法是否正确',
            '确认测试文本格式与正则表达式匹配',
            '尝试使用更宽松的匹配模式'
          ]
        };
        return;
      }

      const { front, back, tags } = regexTemplate.fieldMappings;
      const captureGroupCount = match.length - 1; // 减去完整匹配
      const errors: string[] = [];
      const warnings: string[] = [...securityWarnings]; // 包含安全警告

      // 验证必需字段的捕获组索引
      if (front > captureGroupCount) {
        errors.push(`正面字段映射到第${front}个捕获组，但正则表达式只产生了${captureGroupCount}个捕获组`);
      }

      if (back > captureGroupCount) {
        errors.push(`背面字段映射到第${back}个捕获组，但正则表达式只产生了${captureGroupCount}个捕获组`);
      }

      // 验证可选字段
      if (tags !== undefined && tags > captureGroupCount) {
        warnings.push(`标签字段映射到第${tags}个捕获组，但正则表达式只产生了${captureGroupCount}个捕获组，标签将为空`);
      }

      // 检查未使用的捕获组
      const usedGroups = [front, back, tags].filter(Boolean);
      const maxUsedGroup = Math.max(...usedGroups);
      if (maxUsedGroup < captureGroupCount) {
        warnings.push(`正则表达式有${captureGroupCount}个捕获组，但只使用了${maxUsedGroup}个`);
      }

      if (errors.length > 0) {
        testResult = {
          success: false,
          error: errors.join('; '),
          suggestions: [
            `请调整字段映射或修改正则表达式以包含足够的捕获组`,
            `当前需要至少${Math.max(front, back)}个捕获组`
          ]
        };
        return;
      }

      testResult = {
        success: true,
        front: match[front]?.trim() || '',
        back: match[back]?.trim() || '',
        tags: tags && match.length > tags ? match[tags]?.trim() || '' : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        riskLevel: validation.riskLevel,
        complexity: validation.complexity,
        captureGroupCount,
        usedGroups
      };
    } catch (error) {
      testResult = {
        success: false,
        error: `正则表达式语法错误: ${error instanceof Error ? error.message : '未知错误'}`,
        suggestions: [
          '检查正则表达式语法',
          '确保括号匹配',
          '避免使用不支持的正则特性'
        ]
      };
    }
  }

  // 当正则表达式或测试文本变化时，自动测试
  $effect(() => {
    if (mode === 'regex') {
      testRegex();
    }
  });

  onMount(() => {
    if (template) {
      // 深拷贝传入的模板，避免直接修改原始对象
      currentTemplate = safeClone(template);
    }


  });

  function handleSave() {
    // 检查是否为官方模板
    const isOfficial = (currentTemplate as any).isOfficial;
    if (isOfficial) {
      alert('官方模板不可编辑。');
      return;
    }

    // 基础验证
    if (!currentTemplate.name.trim()) {
      alert('模板名称不能为空。');
      return;
    }
    onSave(currentTemplate);
  }

  // --- 字段模板相关逻辑 ---

  // 对字段进行分组排序，确保 front/both 在前，back 在后
  function groupAndSortFields(fields: TemplateItem[]): TemplateItem[] {
    const frontAndBoth = fields.filter(f => f.type !== 'field' || (f.side === 'front' || f.side === 'both'));
    const back = fields.filter(f => f.type === 'field' && f.side === 'back');
    return [...frontAndBoth, ...back];
  }

  function handleSideChange(fieldId: string) {
    if (mode === 'field') {
      const fieldTemplate = currentTemplate as FieldTemplate;
      // 找到对应的字段并等待Svelte更新其side值
      setTimeout(() => {
        fieldTemplate.fields = groupAndSortFields(fieldTemplate.fields);
      }, 0);
    }
  }

  // 处理题型变更
  function handleCardTypeChange(cardType?: UnifiedCardType) {
    if (mode === 'field' && cardType) {
      const fieldTemplate = currentTemplate as FieldTemplate;
      const metadata = CARD_TYPE_METADATA[cardType];

      // 应用题型特定的渲染提示（类型兼容转换）
      fieldTemplate.renderingHints = {
        questionPosition: metadata.renderingHints.questionPosition === 'overlay' ? 'top' :
                         metadata.renderingHints.questionPosition as 'top' | 'left' | 'inline',
        answerReveal: metadata.renderingHints.answerReveal === 'manual' || metadata.renderingHints.answerReveal === 'progressive' ? 'click' :
                     metadata.renderingHints.answerReveal as 'click' | 'hover' | 'auto',
        interactionMode: 'click', // 简化为支持的模式
        showProgress: metadata.renderingHints.showProgress,
        enableAnimations: metadata.renderingHints.enableAnimations,
        keyboardNavigation: metadata.renderingHints.keyboardNavigation,
        autoFocus: metadata.renderingHints.autoFocus
      };

      console.log(`[FieldTemplateEditor] 题型变更为: ${getCardTypeName(cardType)}`);
    }
  }



  function addField() {
    if (mode === 'field') {
      const fieldTemplate = currentTemplate as FieldTemplate;
      const fieldIndex = fieldTemplate.fields.filter(it => it.type === 'field').length + 1;
      const newField: FieldTemplateField = {
        id: generateId(),
        type: 'field',
        name: `新字段${fieldIndex}`,
        key: `field_${generateId()}`, // 保证key的唯一性
        side: 'both'
      };
      const newFields = [...(currentTemplate as FieldTemplate).fields, newField];
      (currentTemplate as FieldTemplate).fields = groupAndSortFields(newFields);
    }
  }

  function removeItem(id: string) {
     if (mode === 'field') {
      const fieldTemplate = currentTemplate as FieldTemplate;
       if (fieldTemplate.fields.filter(it => it.type === 'field').length <= 1) {
        alert("模板至少需要一个字段。");
        return;
      }
      if (confirm(`确定要删除此项目吗？此操作不可撤销。`)) {
        fieldTemplate.fields = fieldTemplate.fields.filter(it => it.id !== id);
      }
    }
  }

  // MD解析模板相关函数


  $effect(() => {
    if (mode === 'field') {
      const fieldTemplate = currentTemplate as FieldTemplate;

      // 获取正面和背面字段
      const frontFields = fieldTemplate.fields.filter(item =>
        item.type === 'field' && (item.side === 'front' || item.side === 'both')
      ) as FieldTemplateField[];

      const backFields = fieldTemplate.fields.filter(item =>
        item.type === 'field' && (item.side === 'back' || item.side === 'both')
      ) as FieldTemplateField[];

      // 生成更合理的HTML模板
      fieldTemplate.frontTemplate = frontFields.length > 0
        ? frontFields.map(f => `{{${f.key}}}`).join('<br>')
        : '';

      fieldTemplate.backTemplate = backFields.length > 0
        ? backFields.map(f => `{{${f.key}}}`).join('<br>')
        : '';

      // 如果模板为空，提供默认内容
      if (!fieldTemplate.frontTemplate && !fieldTemplate.backTemplate) {
        fieldTemplate.frontTemplate = '{{front}}';
        fieldTemplate.backTemplate = '{{back}}';
      }
    }
  });

  // --- 高级模式 ---
  let advancedMode = $state(false);
  function switchToAdvancedMode() {
    if (confirm('警告：切换到纯HTML编辑模式是一个不可逆的操作。\n\n您将失去可视化的拖拽编辑器，之后只能手动编辑HTML代码。\n\n确定要继续吗？')) {
      advancedMode = true;
    }
  }

</script>

<div class="modal-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" tabindex="-1">
  <div class="modal-content" role="button" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
    <header class="modal-header">
      <h2>{isOfficial ? '查看' : (template ? '编辑' : '创建')}{mode === 'field' ? '字段模板' : '解析模板'}</h2>
      <EnhancedButton variant="secondary" size="sm" onclick={onClose}><EnhancedIcon name="x" /></EnhancedButton>
    </header>
    
    <main class="modal-body">
      <div class="form-group">
        <label for="template-name">模板名称</label>
        <input id="template-name" type="text" bind:value={currentTemplate.name} placeholder="例如：基础问答卡" readonly={isOfficial} />
      </div>
      <div class="form-group">
        <label for="template-description">描述 (可选)</label>
        <textarea id="template-description" bind:value={currentTemplate.description} placeholder="简单描述此模板的用途" readonly={isOfficial}></textarea>
      </div>

      <!-- 题型选择 -->
      {#if mode === 'field'}
        {@const fieldTemplate = currentTemplate as FieldTemplate}
        <div class="form-group">
          <label for="card-type-select">题型类型</label>
          <select
            id="card-type-select"
            bind:value={fieldTemplate.cardType}
            disabled={isOfficial}
            onchange={() => handleCardTypeChange(fieldTemplate.cardType)}
          >
            <option value={undefined}>自动检测</option>
            {#each Object.values(UnifiedCardType) as cardType}
              <option value={cardType}>{getCardTypeName(cardType)}</option>
            {/each}
          </select>
          <p class="field-hint">
            {#if fieldTemplate.cardType}
              {CARD_TYPE_METADATA[fieldTemplate.cardType]?.description || ''}
            {:else}
              系统将根据字段内容自动检测题型
            {/if}
          </p>
        </div>
      {/if}

      {#if mode === 'field'}
        {@const fieldTemplate = currentTemplate as FieldTemplate}


          <div class="form-group">
            <p class="label-like">字段列表</p>
            <div class="fields-list-container">
              <div class="fields-group">
                <p class="fields-group-title">正面</p>
                {#each fieldTemplate.fields as item (item.id)}
                  {#if item.type === 'field' && (item.side === 'front' || item.side === 'both')}
                    {@const field = item}
                    <div class="field-row">
                      <input class="field-input" type="text" value={field.key} readonly title="字段ID (不可修改)" />
                      <input class="field-input" type="text" bind:value={field.name} placeholder="字段UI名称" readonly={isOfficial} />
                      <select class="field-select" bind:value={field.side} onchange={() => handleSideChange(field.id)} disabled={isOfficial}>
                        <option value="front">正面</option>
                        <option value="back">背面</option>
                        <option value="both">正面和背面</option>
                      </select>
                      <div class="field-actions">
                        <EnhancedButton
                          variant="secondary"
                          size="sm"
                          iconOnly={true}
                          icon="trash-2"
                          tooltip="删除"
                          onclick={() => removeItem(item.id)}
                          class="danger-zone"
                          disabled={isOfficial}
                        />
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>

              <div class="fields-group">
                <p class="fields-group-title">背面</p>
                 {#each fieldTemplate.fields as item (item.id)}
                  {#if item.type === 'field' && (item.side === 'back' || item.side === 'both')}
                    {@const field = item}
                    <div class="field-row">
                      <input class="field-input" type="text" value={field.key} readonly title="字段ID (不可修改)" />
                      <input class="field-input" type="text" bind:value={field.name} placeholder="字段UI名称" readonly={isOfficial} />
                      <select class="field-select" bind:value={field.side} onchange={() => handleSideChange(field.id)} disabled={isOfficial}>
                        <option value="front">正面</option>
                        <option value="back">背面</option>
                        <option value="both">正面和背面</option>
                      </select>
                      <div class="field-actions">
                        <EnhancedButton
                          variant="secondary"
                          size="sm"
                          iconOnly={true}
                          icon="trash-2"
                          tooltip="删除"
                          onclick={() => removeItem(item.id)}
                          class="danger-zone"
                          disabled={isOfficial}
                        />
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
            {#if !isOfficial}
              <EnhancedButton variant="secondary" onclick={addField}><EnhancedIcon name="plus" /> 添加字段</EnhancedButton>
            {/if}
          </div>

        <!-- HTML模板编辑 -->
        <div class="form-group">
          <p class="label-like">HTML模板</p>
          <div class="form-group">
            <label for="front-template">正面模板</label>
            <textarea id="front-template" class="code-editor" bind:value={fieldTemplate.frontTemplate} placeholder="例如：{'{'}{'{'}{'}front{'}'}{'}'}'" readonly={isOfficial}></textarea>
          </div>
          <div class="form-group">
            <label for="back-template">背面模板</label>
            <textarea id="back-template" class="code-editor" bind:value={fieldTemplate.backTemplate} placeholder="例如：{'{'}{'{'}{'}back{'}'}{'}'}'" readonly={isOfficial}></textarea>
          </div>
        </div>

      {:else}
        {@const regexTemplate = currentTemplate as ParseTemplate}
        <div class="form-group">
          <label for="regex-input">正则表达式</label>
          <textarea id="regex-input" bind:value={regexTemplate.regex} rows="3" placeholder="输入正则表达式..." readonly={isOfficial}></textarea>
        </div>
        <div class="form-group">
          <p class="label-like">捕获组映射</p>
          <p class="description">指定哪个捕获组 (...) 对应卡片的哪个部分。</p>
          <div class="mapping-grid">
            <label for="map-front">正面</label>
            <input id="map-front" type="number" min="1" bind:value={regexTemplate.fieldMappings.front} readonly={isOfficial} />

            <label for="map-back">背面</label>
            <input id="map-back" type="number" min="1" bind:value={regexTemplate.fieldMappings.back} readonly={isOfficial} />

            <label for="map-tags">标签 (可选)</label>
            <input id="map-tags" type="number" min="1" bind:value={regexTemplate.fieldMappings.tags} placeholder="可选" readonly={isOfficial} />
          </div>
        </div>

        <!-- 测试区域 -->
        {#if !isOfficial}
          <div class="form-group test-section">
            <p class="label-like">测试正则表达式</p>
            <p class="description">输入测试文本来验证正则表达式是否能正确解析内容。</p>

            <div class="test-examples">
              <details>
                <summary>查看示例</summary>
                <div class="examples-content">
                  <div class="example-item">
                    <strong>Q&A 格式示例:</strong>
                    <div class="example-text">Q: 什么是机器学习？
A: 机器学习是人工智能的一个分支，通过算法让计算机从数据中学习。</div>
                    <div class="example-regex">正则表达式: <code>Q:\s*(.+?)\s*A:\s*(.+)</code></div>
                  </div>

                  <div class="example-item">
                    <strong>标题-内容格式示例:</strong>
                    <div class="example-text"># 机器学习基础
机器学习是人工智能的重要分支，包括监督学习、无监督学习等。</div>
                    <div class="example-regex">正则表达式: <code>#\s*(.+?)\n(.+)</code></div>
                  </div>

                  <div class="example-item">
                    <strong>带标签的格式示例:</strong>
                    <div class="example-text">问题: 什么是深度学习？
答案: 深度学习是机器学习的子集，使用神经网络进行学习。
标签: AI, 机器学习, 深度学习</div>
                    <div class="example-regex">正则表达式: <code>问题:\s*(.+?)\s*答案:\s*(.+?)\s*标签:\s*(.+)</code></div>
                  </div>
                </div>
              </details>
            </div>

            <div class="test-input-group">
              <label for="test-text">测试文本</label>
              <textarea
                id="test-text"
                bind:value={testText}
                rows="4"
                placeholder="输入要测试的文本内容..."
              ></textarea>
            </div>

            {#if testResult}
              <div class="test-result {testResult.success ? 'success' : 'error'}">
                <div class="result-header">
                  <EnhancedIcon name={testResult.success ? 'check-circle' : 'alert-triangle'} />
                  <span>{testResult.success ? '解析成功' : '解析失败'}</span>
                </div>

                {#if testResult.success}
                  <div class="result-content">
                    <div class="result-item">
                      <strong>正面:</strong>
                      <span class="result-value">{testResult.front || '(空)'}</span>
                    </div>
                    <div class="result-item">
                      <strong>背面:</strong>
                      <span class="result-value">{testResult.back || '(空)'}</span>
                    </div>
                    {#if testResult.tags !== undefined}
                      <div class="result-item">
                        <strong>标签:</strong>
                        <span class="result-value">{testResult.tags || '(空)'}</span>
                      </div>
                    {/if}
                  </div>
                {:else}
                  <div class="error-message">
                    {testResult.error}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </main>

    <!-- 增强的MD测试示例和实时预览区域 -->
    {#if plugin}
      <TemplateTestingPanel
        {mode}
        template={currentTemplate}
        {plugin}
        onTemplateUpdate={(updatedTemplate) => {
          currentTemplate = updatedTemplate;
        }}
      />
    {/if}

    <footer class="modal-footer">
      {#if mode === 'field' && !isOfficial && !advancedMode}
        <EnhancedButton variant="secondary" size="sm" onclick={switchToAdvancedMode}>
          <EnhancedIcon name="code" /> 高级模式
        </EnhancedButton>
      {/if}
      <div style="flex: 1;"></div> <!-- 占位符将按钮推向两侧 -->
      <EnhancedButton variant="secondary" onclick={onClose}>{isOfficial ? '关闭' : '取消'}</EnhancedButton>
      {#if !isOfficial}
        <EnhancedButton variant="primary" onclick={handleSave}>保存模板</EnhancedButton>
      {/if}
    </footer>
  </div>
</div>

<style>
/* 样式与TemplateManager保持一致性，并做优化 */
/* 使用统一的模态窗样式 - 参考 modal-components.css */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--tuanki-modal-backdrop, rgba(0, 0, 0, 0.6));
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--tuanki-z-modal, 10000);
  backdrop-filter: blur(2px);
  transition: var(--tuanki-transition-normal);
}
.modal-content {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--tuanki-radius-lg, 12px);
  width: min(90vw, 700px);
  max-width: 700px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--tuanki-shadow-modal, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
  transition: var(--tuanki-transition-normal);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--tuanki-space-lg, 1.25rem) var(--tuanki-space-xl, 1.5rem);
  border-bottom: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
  background: var(--background-primary);
}
.modal-header h2 {
  margin: 0;
  font-size: var(--tuanki-font-size-lg, 1.25rem);
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-normal);
}
.modal-body {
  padding: var(--tuanki-space-xl, 1.5rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--tuanki-space-xl, 1.5rem);
  background: var(--background-primary);
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.form-group label {
  font-weight: 500;
  font-size: 0.9rem;
}
.form-group input,
.form-group textarea,
:global(.form-group select) {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--background-modifier-border);
  background-color: var(--background-secondary);
  border-radius: 6px;
  color: var(--text-normal);
}
.form-group input[readonly],
.form-group textarea[readonly] {
  background-color: var(--background-primary);
  color: var(--text-muted);
  cursor: not-allowed;
}
.form-group textarea {
  min-height: 80px;
  resize: vertical;
}


.fields-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fields-group-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0.5rem 0 0.25rem 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fields-list-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--background-secondary);
  border-radius: 8px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 2fr 1.5fr 1fr;
  gap: 0.5rem;
  align-items: center;
}
.field-input, .field-select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--background-modifier-border);
  background-color: var(--background-primary);
  border-radius: 6px;
  color: var(--text-normal);
}
.field-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}


.code-editor {
  font-family: var(--font-monospace);
  min-height: 120px;
}




.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--tuanki-space-md, 1rem);
  padding: var(--tuanki-space-lg, 1.25rem) var(--tuanki-space-xl, 1.5rem);
  border-top: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
  background: var(--background-primary);
  background-color: var(--background-secondary);
  flex-shrink: 0;
}
:global(.danger-zone) {
  color: var(--text-error) !important;
}
:global(.danger-zone:hover) {
  background-color: var(--background-modifier-error) !important;
}
.label-like {
    display: block;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: var(--text-normal);
}

.mapping-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem 1rem;
  align-items: center;
  margin-top: 0.5rem;
}
.mapping-grid label {
  font-size: 0.9rem;
  color: var(--text-muted);
}
.mapping-grid input {
  width: 100%;
}

/* 测试区域样式 */
.test-section {
  border-top: 1px solid var(--background-modifier-border);
  padding-top: 1.5rem;
  margin-top: 1.5rem;
}

.test-input-group {
  margin-bottom: 1rem;
}

.test-input-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-normal);
}

.test-input-group textarea {
  width: 100%;
  min-height: 80px;
  padding: 0.75rem;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: var(--font-monospace);
  font-size: 0.9rem;
  resize: vertical;
}

.test-input-group textarea:focus {
  outline: none;
  border-color: var(--interactive-accent);
  box-shadow: 0 0 0 2px var(--interactive-accent-hover);
}

.test-result {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: var(--radius-s);
  border: 1px solid;
}

.test-result.success {
  background: var(--background-modifier-success);
  border-color: var(--text-success);
}

.test-result.error {
  background: var(--background-modifier-error);
  border-color: var(--text-error);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
}

.test-result.success .result-header {
  color: var(--text-success);
}

.test-result.error .result-header {
  color: var(--text-error);
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.result-item strong {
  min-width: 60px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.result-value {
  flex: 1;
  padding: 0.25rem 0.5rem;
  background: var(--background-secondary);
  border-radius: var(--radius-xs);
  font-family: var(--font-monospace);
  font-size: 0.85rem;
  word-break: break-all;
}

.error-message {
  color: var(--text-error);
  font-size: 0.9rem;
  line-height: 1.4;
}

/* 示例区域样式 */
.test-examples {
  margin-bottom: 1rem;
}


.test-examples details {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  padding: 0.5rem;
}

.test-examples summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--interactive-accent);
  padding: 0.25rem;
  user-select: none;
}

.test-examples summary:hover {
  color: var(--interactive-accent-hover);
}

.examples-content {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--background-modifier-border);
}

.example-item {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--background-secondary);
  border-radius: var(--radius-s);
}

.example-item:last-child {
  margin-bottom: 0;
}

.example-item strong {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-normal);
}

.example-text {
  background: var(--background-primary);
  padding: 0.5rem;
  border-radius: var(--radius-xs);
  font-family: var(--font-monospace);
  font-size: 0.85rem;
  white-space: pre-line;
  margin-bottom: 0.5rem;
  border: 1px solid var(--background-modifier-border);
}

.example-regex {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.example-regex code {
  background: var(--background-modifier-border);
  padding: 0.2rem 0.4rem;
  border-radius: var(--radius-xs);
  font-family: var(--font-monospace);
  color: var(--text-accent);
}

</style>
