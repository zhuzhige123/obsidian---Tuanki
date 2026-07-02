<script lang="ts">
  import { Notice, type App } from 'obsidian';
  import type { RegexParsingConfig } from '../../../types/newCardParsingTypes';
  import {
    REGEX_PRESETS,
    OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT,
    cloneOfficialPresetConfig,
    resolveExampleForConfig,
    type PresetId,
  } from '../../../services/batch-parsing/RegexPresets';
  import {
    RegexCardParser,
    type RegexPresetPreviewResult,
  } from '../../../services/batch-parsing/RegexCardParser';
  import RangeSeparatorConfig from './RangeSeparatorConfig.svelte';
  import { showObsidianConfirm } from '../../../utils/obsidian-confirm';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';
  import { tr } from '../../../utils/i18n';
  import { writeSystemClipboardText } from '../../../utils/system-clipboard';

  let t = $derived($tr);
  
  // Props
  interface Props {
    presets: RegexParsingConfig[];
    onPresetsChange: (presets: RegexParsingConfig[]) => void;
    app?: App;
  }
  
  let { presets = [], onPresetsChange, app }: Props = $props();
  
  // 编辑状态
  let editingPreset: RegexParsingConfig | null = $state(null);
  let isCreating = $state(false);
  let editingOriginalId: string | null = $state(null);
  let editingOriginalName: string | null = $state(null);

  let previewSampleText = $state(OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT);
  let previewResult: RegexPresetPreviewResult | null = $state(null);
  let previewRunning = $state(false);
  let highlightedOfficialId: PresetId | null = $state(null);

  const previewParser = $derived(app ? new RegexCardParser(app) : null);
  
  //  默认值常量
  const DEFAULT_SEPARATOR_MODE = {
    cardSeparator: '<->',  //  修改默认值从 %%<->%% 改为 <->
    frontBackSeparator: '---div---',
    multiline: true,
    emptyLineSeparator: {
      enabled: false,
      lineCount: 2
    }
  };
  
  // 简化后的默认正则模式配置
  const DEFAULT_PATTERN_MODE = {
    cardPattern: '',
    flags: 'gs',
    captureGroups: {
      front: 1,
      back: 2
    }
  };
  
  //  安全的派生状态：确保模式配置始终存在
  const safePatternMode = $derived.by(() => {
    if (editingPreset?.mode === 'pattern') {
      return editingPreset.patternMode || DEFAULT_PATTERN_MODE;
    }
    return DEFAULT_PATTERN_MODE;
  });
  
  const safeSeparatorMode = $derived.by(() => {
    if (editingPreset?.mode === 'separator') {
      return editingPreset.separatorMode || DEFAULT_SEPARATOR_MODE;
    }
    return DEFAULT_SEPARATOR_MODE;
  });
  
  /**
   * 生成新预设ID
   */
  function generatePresetId(): string {
    return `custom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
  
  /**
   *  工具函数：创建新的预设对象
   */
  function createNewPreset(): RegexParsingConfig {
    return {
      name: t('dataManagement.batchScan.regexPreset.newPresetName'),
      description: '',
      mode: 'separator',
      separatorMode: { ...DEFAULT_SEPARATOR_MODE },
      uuidLocation: 'inline',
      uuidPattern: '<!-- (tk-[a-z0-9]{12}) -->',
      excludeTags: [],
      autoAddUUID: true,
      syncMethod: 'tag-based'
    };
  }
  
  /**
   *  工具函数：确保 separatorMode 完整初始化
   */
  function ensureSeparatorMode(preset: RegexParsingConfig): void {
    if (!preset.separatorMode) {
      preset.separatorMode = { ...DEFAULT_SEPARATOR_MODE };
      return;
    }

    const incoming = preset.separatorMode;
    preset.separatorMode = {
      ...DEFAULT_SEPARATOR_MODE,
      ...incoming,
      emptyLineSeparator: incoming.emptyLineSeparator || DEFAULT_SEPARATOR_MODE.emptyLineSeparator
    };

    const cardSeparator = preset.separatorMode.cardSeparator?.trim() ?? '';
    if (/^\^#/.test(cardSeparator) && incoming.frontBackSeparator === undefined) {
      preset.separatorMode.frontBackSeparator = undefined;
      if (incoming.firstLineAsFront !== false) {
        preset.separatorMode.firstLineAsFront = true;
      }
    }
  }
  
  /**
   *  工具函数：确保 patternMode 完整初始化（简化版）
   */
  function ensurePatternMode(preset: RegexParsingConfig): void {
    if (!preset.patternMode) {
      preset.patternMode = { ...DEFAULT_PATTERN_MODE };
    } else {
      preset.patternMode = {
        ...DEFAULT_PATTERN_MODE,
        ...preset.patternMode,
        captureGroups: preset.patternMode.captureGroups || DEFAULT_PATTERN_MODE.captureGroups
      };
    }
  }
  
  /**
   * 添加新预设
   */
  function addPreset() {
    editingPreset = createNewPreset();
    isCreating = true;
    editingOriginalId = null;
    editingOriginalName = null;
    previewSampleText = OFFICIAL_QA_REGEX_SAMPLE_DOCUMENT;
    previewResult = null;
  }
  
  /**
   * 编辑预设
   */
  function editPreset(preset: RegexParsingConfig) {
    editingOriginalId = preset.id ?? null;
    editingOriginalName = preset.name;
    editingPreset = { 
      ...preset,
      //  强制设置默认值
      uuidLocation: 'inline',
      uuidPattern: '<!-- (tk-[a-z0-9]{12}) -->',
      autoAddUUID: preset.autoAddUUID !== undefined ? preset.autoAddUUID : true,
      excludeTags: preset.excludeTags || []
    };
    
    //  使用工具函数确保模式配置完整
    if (editingPreset.mode === 'separator') {
      ensureSeparatorMode(editingPreset);
    } else if (editingPreset.mode === 'pattern') {
      ensurePatternMode(editingPreset);
    }
    
    isCreating = false;
    previewSampleText = resolveExampleForConfig(editingPreset);
    previewResult = null;
  }

  function resetPreviewSample() {
    previewSampleText = resolveExampleForConfig(editingPreset);
    previewResult = null;
  }

  async function copyPreviewSample() {
    const copied = await writeSystemClipboardText(previewSampleText);
    new Notice(
      copied
        ? t('dataManagement.batchScan.regexPreset.sampleCopied')
        : t('dataManagement.batchScan.regexPreset.sampleCopyFailed')
    );
  }

  function runPreviewParse() {
    if (!editingPreset) return;
    if (!previewParser) {
      new Notice(t('dataManagement.batchScan.regexPreset.previewNeedsApp'));
      return;
    }
    previewRunning = true;
    try {
      previewResult = previewParser.parseContentPreview(previewSampleText, editingPreset);
      if (previewResult.success) {
        new Notice(
          t('dataManagement.batchScan.regexPreset.previewSuccess', {
            count: String(previewResult.cards.length),
          })
        );
      } else {
        new Notice(
          previewResult.errors[0] ||
            t('dataManagement.batchScan.regexPreset.previewFailed')
        );
      }
    } finally {
      previewRunning = false;
    }
  }
  
  /**
   * 保存预设
   */
  function savePreset() {
    if (!editingPreset) return;
    
    if (!editingPreset.name || !editingPreset.name.trim()) {
      new Notice(t('dataManagement.batchScan.regexPreset.nameEmpty'));
      return;
    }

    if (editingPreset.mode === 'separator') {
      ensureSeparatorMode(editingPreset);
    } else if (editingPreset.mode === 'pattern') {
      ensurePatternMode(editingPreset);
    }

    const trimmedName = editingPreset.name.trim();
    const normalizedName = trimmedName.toLowerCase();
    const duplicateByName = presets.some(p => {
      if (isCreating) {
        return p.name?.trim().toLowerCase() === normalizedName;
      }
      if (editingOriginalId && p.id) {
        return p.id !== editingOriginalId && p.name?.trim().toLowerCase() === normalizedName;
      }
      if (editingOriginalName) {
        return p.name !== editingOriginalName && p.name?.trim().toLowerCase() === normalizedName;
      }
      return p.name?.trim().toLowerCase() === normalizedName;
    });

    if (duplicateByName) {
      new Notice(t('dataManagement.batchScan.regexPreset.nameDuplicate'));
      return;
    }
    
    //  强制设置默认值
    const presetToSave: RegexParsingConfig = {
      ...editingPreset,
      name: trimmedName,
      uuidLocation: 'inline',
      uuidPattern: '<!-- (tk-[a-z0-9]{12}) -->',
      autoAddUUID: editingPreset.autoAddUUID !== undefined ? editingPreset.autoAddUUID : true,
      excludeTags: editingPreset.excludeTags || [],
      separatorMode: editingPreset.separatorMode
        ? {
            ...editingPreset.separatorMode,
            multiline:
              editingPreset.separatorMode.multiline !== undefined
                ? editingPreset.separatorMode.multiline
                : true,
          }
        : undefined,
    };

    if (presetToSave.mode === 'separator' && presetToSave.separatorMode) {
      ensureSeparatorMode(presetToSave);
    }

    if (presetToSave.mode === 'separator') {
      if (!presetToSave.separatorMode?.cardSeparator?.trim()) {
        new Notice(t('dataManagement.batchScan.regexPreset.separatorEmpty'));
        return;
      }
      try {
        const flags = presetToSave.separatorMode.multiline ? 'gm' : 'g';
        new RegExp(presetToSave.separatorMode.cardSeparator, flags);
        if (presetToSave.separatorMode.frontBackSeparator) {
          new RegExp(presetToSave.separatorMode.frontBackSeparator, 'm');
        }
      } catch (e) {
        new Notice(t('dataManagement.batchScan.regexPreset.separatorInvalid', { error: e instanceof Error ? e.message : String(e) }));
        return;
      }
    }

    if (presetToSave.mode === 'pattern') {
      if (!presetToSave.patternMode?.cardPattern?.trim()) {
        new Notice(t('dataManagement.batchScan.regexPreset.patternEmpty'));
        return;
      }
      try {
        new RegExp(presetToSave.patternMode.cardPattern, presetToSave.patternMode.flags || 'g');
      } catch (e) {
        new Notice(t('dataManagement.batchScan.regexPreset.patternInvalid', { error: e instanceof Error ? e.message : String(e) }));
        return;
      }
    }
    
    if (isCreating) {
      // 新建预设
      const id = presetToSave.id || generatePresetId();
      const newPreset = { ...presetToSave, id };
      onPresetsChange([...presets, newPreset]);
      new Notice(t('dataManagement.batchScan.regexPreset.created'));
    } else {
      // 更新现有预设
      const id = editingOriginalId || presetToSave.id || generatePresetId();
      const presetWithId = { ...presetToSave, id };

      const updated = presets.map(p => {
        if (editingOriginalId) {
          return p.id === editingOriginalId ? presetWithId : p;
        }
        if (editingOriginalName) {
          return p.name === editingOriginalName ? presetWithId : p;
        }
        return p.name === presetWithId.name ? presetWithId : p;
      });
      onPresetsChange(updated);
      new Notice(t('dataManagement.batchScan.regexPreset.saved'));
    }
    
    editingPreset = null;
    isCreating = false;
    editingOriginalId = null;
    editingOriginalName = null;
  }
  
  /**
   * 删除预设
   */
  async function deletePreset(preset: RegexParsingConfig) {
    if (!app) {
      new Notice(t('dataManagement.batchScan.regexPreset.previewNeedsApp'));
      return;
    }

    const confirmed = await showObsidianConfirm(
      app,
      t('dataManagement.batchScan.regexPreset.confirmDelete', { name: preset.name }),
      { title: t('dataManagement.batchScan.regexPreset.confirmDeleteTitle') }
    );
    if (confirmed) {
      if (preset.id) {
        onPresetsChange(presets.filter(p => p.id !== preset.id));
      } else {
        onPresetsChange(presets.filter(p => p.name !== preset.name));
      }
      new Notice(t('dataManagement.batchScan.regexPreset.deleted'));
    }
  }
  
  /**
   * 取消编辑
   */
  function cancelEdit() {
    editingPreset = null;
    isCreating = false;
    editingOriginalId = null;
    editingOriginalName = null;
  }
  
  /**
   * 从官方预设导入
   */
  function importFromOfficial(presetKey: string) {
    const officialPreset = cloneOfficialPresetConfig(presetKey as PresetId);
    if (!officialPreset) return;

    highlightedOfficialId = presetKey as PresetId;
    
    if (presets.some(p => (p.id && p.id === officialPreset.id) || p.name === officialPreset.name)) {
      new Notice(t('dataManagement.batchScan.regexPreset.alreadyExists', { name: officialPreset.name }));
      return;
    }
    
    onPresetsChange([...presets, officialPreset]);
    new Notice(t('dataManagement.batchScan.regexPreset.imported', { name: officialPreset.name }));
  }

  function previewOfficialExample(presetKey: string) {
    const meta = REGEX_PRESETS[presetKey as keyof typeof REGEX_PRESETS];
    if (!meta) return;
    highlightedOfficialId = presetKey as PresetId;
    previewSampleText = meta.example;
    previewResult = null;
  }
</script>

<div class="regex-preset-manager">
  <!-- 标题栏 -->
  <div class="preset-header">
    <div class="preset-header-left">
      <h4 class="group-title with-accent-bar accent-red">{t('dataManagement.batchScan.regexPreset.title')}</h4>
      <span class="preset-count">({presets.length})</span>
    </div>
    <div class="preset-header-right">
      <button 
        class="add-preset-btn"
        onclick={addPreset}
      >
        {t('dataManagement.batchScan.regexPreset.newPreset')}
      </button>
    </div>
  </div>
  
  <!-- 内容区域（始终显示） -->
  <div class="preset-content">
    <!-- 官方预设导入 -->
    <div class="official-presets">
      <div class="section-label">{t('dataManagement.batchScan.regexPreset.officialPresets')}</div>
      <p class="official-presets-hint">{t('dataManagement.batchScan.regexPreset.officialPresetsHint')}</p>
      <div class="preset-chips">
        {#each Object.keys(REGEX_PRESETS) as key}
          {@const preset = REGEX_PRESETS[key as keyof typeof REGEX_PRESETS]}
          <div class="preset-chip-wrap">
            <button 
              class="preset-chip"
              class:recommended={preset.recommended}
              class:active={highlightedOfficialId === key}
              onclick={() => importFromOfficial(key)}
              title={preset.description}
            >
              {#if preset.recommended}
                <span class="chip-badge">{t('dataManagement.batchScan.regexPreset.recommended')}</span>
              {/if}
              {preset.name}
            </button>
            <button
              type="button"
              class="preset-chip-example"
              onclick={() => previewOfficialExample(key)}
              title={t('dataManagement.batchScan.regexPreset.viewExample')}
            >
              {t('dataManagement.batchScan.regexPreset.example')}
            </button>
          </div>
        {/each}
      </div>
      {#if highlightedOfficialId && REGEX_PRESETS[highlightedOfficialId]}
        <details class="official-example-panel" open>
          <summary>{t('dataManagement.batchScan.regexPreset.exampleDocTitle')}</summary>
          <pre class="example-doc">{REGEX_PRESETS[highlightedOfficialId].example}</pre>
        </details>
      {/if}
    </div>
    
    <!-- 自定义预设列表 -->
    <div class="custom-presets">
      <div class="section-label">{t('dataManagement.batchScan.regexPreset.customPresets')}</div>
      
      {#if presets.length > 0}
        <div class="preset-list">
          {#each presets as preset}
            <div class="preset-item">
              <div class="preset-info">
                <div class="preset-name">{preset.name}</div>
                <div class="preset-meta">
                  {t('dataManagement.batchScan.regexPreset.mode')} {preset.mode === 'separator' ? t('dataManagement.batchScan.regexPreset.modeSeparator') : t('dataManagement.batchScan.regexPreset.modePattern')} | 
                  {t('dataManagement.batchScan.regexPreset.sync')} {preset.syncMethod === 'tag-based' ? t('dataManagement.batchScan.regexPreset.syncTagBased') : t('dataManagement.batchScan.regexPreset.syncFullSync')}
                </div>
              </div>
              <div class="preset-actions">
                <button 
                  class="action-btn edit"
                  onclick={() => editPreset(preset)}
                >
                  {t('dataManagement.batchScan.regexPreset.edit')}
                </button>
                <button 
                  class="action-btn delete"
                  onclick={() => deletePreset(preset)}
                >
                  {t('dataManagement.batchScan.regexPreset.delete')}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- 编辑器模态窗 -->
    {#if editingPreset}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div 
        class="preset-editor-overlay" 
        onclick={(event) => {
          if (event.target === event.currentTarget) {
            cancelEdit();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-editor-title"
        tabindex="-1"
      >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div 
          class="preset-editor" 
          role="document"
        >
          <div class="editor-header">
            <h3 id="preset-editor-title">{isCreating ? t('dataManagement.batchScan.regexPreset.createTitle') : t('dataManagement.batchScan.regexPreset.editTitle')}</h3>
            <button class="close-btn" onclick={cancelEdit} aria-label={t('dataManagement.batchScan.regexPreset.close')}>×</button>
          </div>
          
          <div class="editor-body">
            <!-- 基本信息 -->
            <div class="form-group">
              <label for="preset-name">{t('dataManagement.batchScan.regexPreset.presetName')}</label>
              <input 
                type="text" 
                id="preset-name"
                value={editingPreset?.name || ''}
                oninput={(e) => {
                  if (editingPreset) {
                    editingPreset.name = e.currentTarget.value;
                  }
                }}
                placeholder={t('dataManagement.batchScan.regexPreset.presetNamePlaceholder')}
              />
            </div>
            
            <!-- 解析模式 -->
            <div class="form-group">
              <label for="parsing-mode">{t('dataManagement.batchScan.regexPreset.parsingMode')}</label>
              <ObsidianDropdown
                options={[
                  { id: 'separator', label: t('dataManagement.batchScan.regexPreset.separatorMode') },
                  { id: 'pattern', label: t('dataManagement.batchScan.regexPreset.patternMode') }
                ]}
                value={editingPreset?.mode || 'separator'}
                onchange={(value) => {
                  const newMode = value as 'separator' | 'pattern';
                  if (!editingPreset) return;
                  editingPreset.mode = newMode;
                  if (newMode === 'pattern' && !editingPreset.patternMode) {
                    editingPreset.patternMode = { ...DEFAULT_PATTERN_MODE };
                  } else if (newMode === 'separator' && !editingPreset.separatorMode) {
                    editingPreset.separatorMode = { ...DEFAULT_SEPARATOR_MODE };
                  }
                }}
              />
            </div>
            
            <!-- 分隔符模式配置 -->
            {#if editingPreset?.mode === 'separator'}
              <RangeSeparatorConfig
                config={safeSeparatorMode}
                name="separator-type"
                hideFrontBack={/^\^#/.test(safeSeparatorMode.cardSeparator?.trim() ?? '')}
                onChange={(updated) => {
                  if (!editingPreset) return;
                  editingPreset.separatorMode = {
                    ...DEFAULT_SEPARATOR_MODE,
                    ...editingPreset.separatorMode,
                    ...updated,
                    emptyLineSeparator:
                      updated.emptyLineSeparator ??
                      editingPreset.separatorMode?.emptyLineSeparator ??
                      DEFAULT_SEPARATOR_MODE.emptyLineSeparator,
                  };
                }}
              />
            {/if}
            
            <!-- 正则模式配置（简化版） -->
            {#if editingPreset?.mode === 'pattern'}
              <!-- 卡片匹配正则表达式 -->
              <div class="form-group">
                <label for="card-pattern">{t('dataManagement.batchScan.regexPreset.cardPattern')}</label>
                <textarea 
                  id="card-pattern"
                  value={safePatternMode.cardPattern}
                  oninput={(e) => {
                    if (!editingPreset?.patternMode) editingPreset!.patternMode = { ...DEFAULT_PATTERN_MODE };
                    editingPreset!.patternMode.cardPattern = e.currentTarget.value;
                  }}
                  placeholder={t('dataManagement.batchScan.regexPreset.cardPatternPlaceholder')}
                  rows="3"
                ></textarea>
                <small class="help-text">{t('dataManagement.batchScan.regexPreset.cardPatternHelp')}</small>
                {#if safePatternMode.captureGroups}
                  <small class="help-text capture-hint">
                    {t('dataManagement.batchScan.regexPreset.captureGroupsHint', {
                      front: String(safePatternMode.captureGroups.front),
                      back: String(safePatternMode.captureGroups.back),
                    })}
                  </small>
                {/if}
              </div>
              
              <!-- 正则标志 -->
              <div class="form-group">
                <label for="regex-flags">{t('dataManagement.batchScan.regexPreset.regexFlags')}</label>
                <input 
                  type="text" 
                  id="regex-flags"
                  value={safePatternMode.flags}
                  oninput={(e) => {
                    if (!editingPreset?.patternMode) editingPreset!.patternMode = { ...DEFAULT_PATTERN_MODE };
                    editingPreset!.patternMode.flags = e.currentTarget.value;
                  }}
                  placeholder={t('dataManagement.batchScan.regexPreset.regexFlagsPlaceholder')}
                />
                <small class="help-text">{t('dataManagement.batchScan.regexPreset.regexFlagsHelp')}</small>
              </div>
            {/if}
            
            <!-- 示例与测试解析 -->
            <div class="form-group preview-section">
              <div class="preview-section-header">
                <label for="preview-sample">{t('dataManagement.batchScan.regexPreset.sampleDoc')}</label>
                <div class="preview-actions">
                  <button type="button" class="btn-link" onclick={resetPreviewSample}>
                    {t('dataManagement.batchScan.regexPreset.resetSample')}
                  </button>
                  <button type="button" class="btn-link" onclick={copyPreviewSample}>
                    {t('dataManagement.batchScan.regexPreset.copySample')}
                  </button>
                </div>
              </div>
              <textarea
                id="preview-sample"
                class="preview-sample-input"
                bind:value={previewSampleText}
                rows="8"
                placeholder={t('dataManagement.batchScan.regexPreset.sampleDocPlaceholder')}
              ></textarea>
              <small class="help-text">{t('dataManagement.batchScan.regexPreset.sampleDocHelp')}</small>
              <button
                type="button"
                class="btn-test-parse"
                onclick={runPreviewParse}
                disabled={previewRunning || !editingPreset}
              >
                {previewRunning
                  ? t('dataManagement.batchScan.regexPreset.previewRunning')
                  : t('dataManagement.batchScan.regexPreset.runPreview')}
              </button>
              {#if previewResult}
                <div
                  class="preview-result"
                  class:preview-error={!previewResult.success}
                >
                  {#if previewResult.success}
                    <div class="preview-summary">
                      {t('dataManagement.batchScan.regexPreset.previewSummary', {
                        count: String(previewResult.cards.length),
                        skipped: String(previewResult.skippedCount),
                      })}
                    </div>
                    <ol class="preview-card-list">
                      {#each previewResult.cards as card}
                        <li>
                          <strong>{t('dataManagement.batchScan.regexPreset.previewFront')}</strong>
                          <pre>{card.front || '—'}</pre>
                          <strong>{t('dataManagement.batchScan.regexPreset.previewBack')}</strong>
                          <pre>{card.back || '—'}</pre>
                          {#if card.tags.length > 0}
                            <span class="preview-tags">#{card.tags.join(' #')}</span>
                          {/if}
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    <p class="preview-error-msg">
                      {previewResult.errors.join('；') ||
                        t('dataManagement.batchScan.regexPreset.previewFailed')}
                    </p>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- 同步方法 -->
            <div class="form-group">
              <label for="sync-method">{t('dataManagement.batchScan.regexPreset.syncMethod')}</label>
              <ObsidianDropdown
                options={[
                  { id: 'tag-based', label: t('dataManagement.batchScan.regexPreset.tagBasedMode') },
                  { id: 'full-sync', label: t('dataManagement.batchScan.regexPreset.fullSyncMode') }
                ]}
                value={editingPreset?.syncMethod || 'tag-based'}
                onchange={(value) => {
                  if (editingPreset) {
                    editingPreset.syncMethod = value as 'tag-based' | 'full-sync';
                  }
                }}
              />
            </div>
          </div>
          
          <div class="editor-footer">
            <button class="btn-cancel" onclick={cancelEdit}>{t('dataManagement.batchScan.regexPreset.cancel')}</button>
            <button class="btn-save" onclick={savePreset}>{t('dataManagement.batchScan.regexPreset.save')}</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* 标题栏 */
  .preset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0 12px 0;
    background: transparent;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 16px;
  }
  
  .preset-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .preset-count {
    color: var(--text-muted);
    font-size: 12px;
  }
  
  .preset-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .add-preset-btn {
    padding: 4px 12px;
    border-radius: 4px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    cursor: pointer;
    font-size: 12px;
    transition: opacity 0.2s;
  }
  
  .add-preset-btn:hover {
    opacity: 0.8;
  }
  
  /* 展开内容 */
  .preset-content {
    padding: 0;
    background: transparent;
  }
  
  /* 官方预设 */
  .official-presets {
    margin-bottom: 20px;
  }
  
  .section-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  
  .official-presets-hint {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0 0 10px;
    line-height: 1.5;
  }

  .preset-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .preset-chip-wrap {
    display: inline-flex;
    align-items: stretch;
    gap: 0;
  }
  
  .preset-chip {
    padding: 6px 12px;
    border-radius: 4px 0 0 4px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-right: none;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .preset-chip.recommended {
    border-color: var(--interactive-accent);
  }

  .preset-chip.active {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .chip-badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 600;
  }

  .preset-chip-example {
    padding: 6px 8px;
    border-radius: 0 4px 4px 0;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
  }

  .preset-chip-example:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .official-example-panel {
    margin-top: 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 8px 12px;
    background: var(--background-secondary);
  }

  .official-example-panel summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .example-doc {
    margin: 8px 0 0;
    padding: 10px;
    font-family: var(--font-monospace);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow: auto;
    background: var(--background-primary);
    border-radius: 4px;
  }

  /*  深色模式 - 增强预设芯片边框可见性 */
  :global(body.theme-dark) .preset-chip {
    border-color: rgba(255, 255, 255, 0.15);
  }

  /*  浅色模式 - 增强预设芯片边框可见性 */
  :global(body.theme-light) .preset-chip {
    border-color: rgba(0, 0, 0, 0.15);
  }
  
  .preset-chip:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  /* 自定义预设列表 */
  .custom-presets {
    margin-top: 20px;
  }
  
  .preset-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
  }

  /*  深色模式 - 增强预设项边框可见性 */
  :global(body.theme-dark) .preset-item {
    border-color: rgba(255, 255, 255, 0.15);
  }

  /*  浅色模式 - 增强预设项边框可见性 */
  :global(body.theme-light) .preset-item {
    border-color: rgba(0, 0, 0, 0.15);
  }
  
  .preset-info {
    flex: 1;
  }
  
  .preset-name {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
  }
  
  .preset-meta {
    font-size: 11px;
    color: var(--text-faint);
  }
  
  .preset-actions {
    display: flex;
    gap: 8px;
  }
  
  .action-btn {
    padding: 4px 10px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 12px;
    transition: opacity 0.2s;
  }
  
  .action-btn.edit {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .action-btn.delete {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
  }
  
  .action-btn:hover {
    opacity: 0.8;
  }
  
  /* 编辑器模态窗 */
  .preset-editor-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-loading);
  }
  
  .preset-editor {
    background: var(--background-primary);
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .editor-header h3 {
    margin: 0;
    font-size: 16px;
  }
  
  .close-btn {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 24px;
    line-height: 1;
    color: var(--text-muted);
    transition: all 0.2s;
  }
  
  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
  
  .form-group {
    margin-bottom: 16px;
  }
  
  .form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--text-normal);
  }
  
  .form-group input[type="text"],
  .form-group textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
    transition: border-color 0.2s;
  }

  /*  深色模式 - 增强表单输入框边框可见性 */
  :global(body.theme-dark) .form-group input[type="text"],
  :global(body.theme-dark) .form-group textarea {
    border-color: rgba(255, 255, 255, 0.3);
  }

  /*  浅色模式 - 增强表单输入框边框可见性 */
  :global(body.theme-light) .form-group input[type="text"],
  :global(body.theme-light) .form-group textarea {
    border-color: rgba(0, 0, 0, 0.25);
  }

  .form-group textarea {
    font-family: var(--font-monospace);
    min-height: 80px;
    resize: vertical;
    line-height: 1.6;
  }
  
  .form-group .help-text {
    display: block;
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
    line-height: 1.4;
  }

  .preview-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .preview-actions {
    display: flex;
    gap: 8px;
  }

  .btn-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    color: var(--text-accent);
    cursor: pointer;
  }

  .preview-sample-input {
    font-family: var(--font-monospace);
    min-height: 120px;
  }

  .btn-test-parse {
    margin-top: 8px;
    padding: 6px 14px;
    border-radius: 4px;
    border: none;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    cursor: pointer;
    font-size: 12px;
  }

  .btn-test-parse:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .preview-result {
    margin-top: 12px;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    font-size: 12px;
  }

  .preview-result.preview-error {
    border-color: var(--background-modifier-error);
  }

  .preview-summary {
    font-weight: 600;
    margin-bottom: 8px;
  }

  .preview-card-list {
    margin: 0;
    padding-left: 1.2em;
  }

  .preview-card-list pre {
    margin: 4px 0 8px;
    padding: 6px 8px;
    background: var(--background-primary);
    border-radius: 4px;
    white-space: pre-wrap;
    font-family: var(--font-monospace);
    font-size: 11px;
  }

  .preview-tags {
    color: var(--text-muted);
    font-size: 11px;
  }

  .preview-error-msg {
    margin: 0;
    color: var(--text-error);
  }
  
  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .btn-cancel,
  .btn-save {
    padding: 8px 20px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 13px;
    transition: opacity 0.2s;
  }
  
  .btn-cancel {
    background: var(--background-secondary);
    color: var(--text-normal);
  }
  
  .btn-save {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .btn-cancel:hover,
  .btn-save:hover {
    opacity: 0.8;
  }

  /* mobile: keep save/cancel buttons in a row */
  :global(body.is-phone) .editor-footer {
    flex-direction: row;
    flex-wrap: nowrap;
  }

  :global(body.is-phone) .editor-footer .btn-cancel,
  :global(body.is-phone) .editor-footer .btn-save {
    flex: 1;
    min-width: 0;
  }
</style>

