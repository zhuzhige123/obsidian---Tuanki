<!--
  CSV导入向导模态窗
  职责：3步导入流程（文件配置 → 列映射 → 预览确认）
  使用 EnhancedModal 组件确保正确居中定位
-->
<script lang="ts">
  import { logger } from '../../utils/logger';
  import { onMount, onDestroy } from 'svelte';
  import { Notice, Menu, AbstractInputSuggest, TFile } from 'obsidian';
  import EnhancedModal from '../ui/EnhancedModal.svelte';
  import type { WeavePlugin } from '../../main';
  import type { WeaveDataStorage } from '../../data/storage';
  import type { Deck, Card } from '../../data/types';
  import { CardType } from '../../data/types';
  import { generateCardUUID } from '../../services/identifier/WeaveIDGenerator';
  import { generateId } from '../../utils/helpers';
  import { buildContentWithYAML } from '../../utils/yaml-utils';
  import { listVaultMarkdownFiles } from '../../utils/vault-file-list';
  import {
    type Separator,
    type ImportCardType,
    type TargetField,
    type ColumnMapping,
    type CSVParseResult,
    type PreviewCard,
    type ImportStats,
    type GeneratedCardData,
    decodeFileContent,
    detectSeparator,
    parseCSVLine,
    parseCSVText,
    suggestMappings,
    generatePreviewCards,
    generateCardContent,
    collectUserYamlProperties,
    isYamlCustomField,
    getYamlPropertyName,
    SEPARATOR_LABELS,
    CARD_TYPE_OPTIONS,
    CARD_TYPE_FIELDS,
  } from '../../services/csv-import/CSVImportService';

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    onClose: () => void;
    onImportComplete?: (deckId: string, cardCount: number) => void;
  }

  let {
    open = $bindable(),
    plugin,
    dataStorage,
    onClose,
    onImportComplete,
  }: Props = $props();

  // ===== 步骤状态 =====
  let currentStep = $state<1 | 2 | 3>(1);

  // ===== Step 1: 文件与解析配置 =====
  let fileName = $state('');
  let fileText = $state('');
  let fileEncoding = $state('UTF-8');
  let separator = $state<Separator>(',');
  let hasHeader = $state(true);
  let detectionConfidence = $state(0);
  let previewRows = $state<string[][]>([]);
  let allRows = $state<string[][]>([]);
  let headers = $state<string[]>([]);
  let fileLoaded = $state(false);

  // ===== Step 2: 列映射 =====
  let mappings = $state<ColumnMapping[]>([]);
  let cardType = $state<ImportCardType>('basic-qa');
  let allowAutoCreate = $state(false);

  // ===== Step 1: 粘贴导入 =====
  let pasteCSVText = $state('');
  let isPasteMode = $state(false);

  // ===== Step 3: 预览与导入 =====
  let previewCards = $state<PreviewCard[]>([]);
  let importStats = $state<ImportStats | null>(null);
  let targetDeckId = $state('');
  let newDeckName = $state('');
  let createNewDeck = $state(true);
  let batchTags = $state('');
  let isImporting = $state(false);
  let importProgress = $state(0);
  let sourceLink = $state('');
  let sourceInputEl = $state<HTMLInputElement | null>(null);
  let fileSuggest: AbstractInputSuggest<TFile> | null = null;

  // ===== 牌组列表 =====
  let decks = $state<Deck[]>([]);

  // ===== 用户自定义YAML属性 =====
  let userYamlProperties = $state<string[]>([]);

  // ===== 溯源文件建议器 =====
  class SourceFileSuggest extends AbstractInputSuggest<TFile> {
    getSuggestions(inputStr: string): TFile[] {
      const files = listVaultMarkdownFiles(this.app);
      const lower = inputStr.toLowerCase();
      if (!lower) return files.slice(0, 30);
      return files.filter(f => f.path.toLowerCase().includes(lower)).slice(0, 30);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
      el.setText(file.path);
    }

    selectSuggestion(file: TFile): void {
      const name = file.path.replace(/\.md$/, '');
      sourceLink = `![[${name}]]`;
      if (sourceInputEl) {
        sourceInputEl.value = sourceLink;
      }
      this.close();
    }
  }

  $effect(() => {
    if (sourceInputEl && !fileSuggest) {
      fileSuggest = new SourceFileSuggest(plugin.app, sourceInputEl);
    }
  });

  onMount(async () => {
    try {
      decks = await dataStorage.getAllDecks();
      if (decks.length > 0) {
        targetDeckId = decks[0].id;
      }
      // 扫描现有卡片收集所有用户自定义YAML属性键
      const allCards = await dataStorage.getAllCards();
      const contents = allCards.map(c => c.content || '').filter(Boolean);
      userYamlProperties = collectUserYamlProperties(contents);
      logger.info('[CSVImport] 用户自定义YAML属性:', userYamlProperties);
    } catch (e) {
      logger.error('[CSVImport] 初始化失败:', e);
    }
  });

  onDestroy(() => {
    if (fileSuggest) {
      fileSuggest.close();
      fileSuggest = null;
    }
  });

  // ===== Step 1: 文件选择 =====
  async function handleFileSelect() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        fileName = file.name;
        newDeckName = file.name.replace(/\.(csv|tsv|txt)$/i, '');

        // 编码检测与解码
        const decoded = await decodeFileContent(file);
        fileText = decoded.text;
        fileEncoding = decoded.encoding;

        // 分隔符嗅探
        const detection = detectSeparator(fileText);
        separator = detection.separator;
        hasHeader = detection.hasHeader;
        detectionConfidence = detection.confidence;

        // 解析预览
        reparseFile();
        fileLoaded = true;
        isPasteMode = false;
        pasteCSVText = '';

        logger.info('[CSVImport] 文件已加载:', {
          fileName,
          encoding: fileEncoding,
          separator: separator === '\t' ? 'TAB' : separator,
          hasHeader,
          confidence: detectionConfidence,
        });
      } catch (err) {
        logger.error('[CSVImport] 文件读取失败:', err);
        new Notice('文件读取失败: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    input.click();
  }

  function reparseFile() {
    if (!fileText) return;

    const parsed = parseCSVText(fileText, separator);
    if (parsed.length === 0) {
      previewRows = [];
      allRows = [];
      headers = [];
      return;
    }

    if (hasHeader) {
      headers = parsed[0].map((h, i) => h.trim() || `Column_${i + 1}`);
      allRows = parsed.slice(1);
    } else {
      const colCount = parsed[0].length;
      headers = Array.from({ length: colCount }, (_, i) => `Column_${i + 1}`);
      allRows = parsed;
    }

    // 过滤完全空行
    allRows = allRows.filter(row => row.some(cell => cell.trim().length > 0));
    previewRows = allRows.slice(0, 8);

    // 自动推荐映射
    const suggestion = suggestMappings(headers);
    mappings = suggestion.mappings;
    cardType = suggestion.suggestedCardType;
  }

  // 分隔符或表头设置变更时重新解析
  function onSeparatorChange(newSep: Separator) {
    separator = newSep;
    reparseFile();
  }

  function onHasHeaderChange(value: boolean) {
    hasHeader = value;
    reparseFile();
  }

  // ===== 粘贴CSV内容处理 =====
  function handlePasteCSV(text: string) {
    pasteCSVText = text;
    if (!text.trim()) {
      if (isPasteMode) {
        fileLoaded = false;
        fileText = '';
        previewRows = [];
        allRows = [];
        headers = [];
      }
      return;
    }

    isPasteMode = true;
    fileName = '';
    fileText = text;
    fileEncoding = 'UTF-8';

    const detection = detectSeparator(text);
    separator = detection.separator;
    hasHeader = detection.hasHeader;
    detectionConfidence = detection.confidence;

    reparseFile();
    fileLoaded = true;

    if (!newDeckName.trim()) {
      newDeckName = 'CSV粘贴导入';
    }

    logger.info('[CSVImport] 粘贴内容已解析:', {
      separator: separator === '\t' ? 'TAB' : separator,
      hasHeader,
      rows: allRows.length,
      cols: headers.length,
    });
  }

  // ===== Step 2: 列映射操作 =====
  function updateMapping(index: number, targetField: TargetField) {
    mappings = mappings.map((m, i) => i === index ? { ...m, targetField } : m);
  }

  function onCardTypeChange(newType: ImportCardType) {
    cardType = newType;
    // 重新推荐映射
    const suggestion = suggestMappings(headers);
    mappings = suggestion.mappings;
  }

  // 可用的内置字段列表（基于卡片类型）
  let builtinFieldList = $derived.by(() => {
    const fieldConfig = CARD_TYPE_FIELDS[cardType];
    if (!fieldConfig) return [];
    return [...fieldConfig.required, ...fieldConfig.optional];
  });

  // Obsidian Menu 下拉菜单
  function openFieldMenu(event: MouseEvent, index: number) {
    const currentField = mappings[index]?.targetField;
    const menu = new Menu();

    // 跳过
    menu.addItem(item => {
      item.setTitle('-- 跳过 --');
      if (currentField === '_skip') item.setChecked(true);
      item.onClick(() => updateMapping(index, '_skip'));
    });

    // 卡片字段分组
    menu.addSeparator();
    menu.addItem(item => { item.setTitle('卡片字段'); item.setIsLabel(true); });
    for (const f of builtinFieldList) {
      const field = f as TargetField;
      menu.addItem(item => {
        item.setTitle(BUILTIN_FIELD_LABELS[f] || f);
        if (currentField === field) item.setChecked(true);
        item.onClick(() => updateMapping(index, field));
      });
    }

    // YAML自定义属性分组
    if (userYamlProperties.length > 0) {
      menu.addSeparator();
      menu.addItem(item => { item.setTitle('YAML自定义属性'); item.setIsLabel(true); });
      for (const prop of userYamlProperties) {
        const field = `yaml:${prop}` as TargetField;
        menu.addItem(item => {
          item.setTitle(prop);
          if (currentField === field) item.setChecked(true);
          item.onClick(() => updateMapping(index, field));
        });
      }
    }

    // 自动创建分组（从 CSV 列名生成新属性）
    if (allowAutoCreate && headers.length > 0) {
      const existingSet = new Set(userYamlProperties);
      const newProps = headers.filter(h => !existingSet.has(h));
      if (newProps.length > 0) {
        menu.addSeparator();
        menu.addItem(item => { item.setTitle('新建 YAML 属性'); item.setIsLabel(true); });
        for (const h of newProps) {
          const field = `yaml:${h}` as TargetField;
          menu.addItem(item => {
            item.setTitle(h);
            if (currentField === field) item.setChecked(true);
            item.onClick(() => updateMapping(index, field));
          });
        }
      }
    }

    menu.showAtMouseEvent(event);
  }

  /** 内置字段的中文标签 */
  const BUILTIN_FIELD_LABELS: Record<string, string> = {
    question: '问题/正面',
    answer: '答案/背面',
    hint: '提示（>hint:）',
    explanation: '解析',
    optionA: '选项A',
    optionB: '选项B',
    optionC: '选项C',
    optionD: '选项D',
    optionE: '选项E',
    optionF: '选项F',
    correct_answer: '正确答案',
    difficulty: '难度',
    content: '内容',
    tags: '标签',
    source: '来源',
    author: '作者',
    page: '页码',
    _skip: '-- 跳过 --',
  };

  function getFieldLabel(field: TargetField): string {
    if (isYamlCustomField(field)) {
      return getYamlPropertyName(field);
    }
    return BUILTIN_FIELD_LABELS[field] || field;
  }

  // 必填字段检查
  let missingRequiredFields = $derived.by(() => {
    const required = CARD_TYPE_FIELDS[cardType]?.required || [];
    const assignedFields = new Set<string>(mappings.map(m => m.targetField).filter(f => f !== '_skip'));
    return required.filter(f => !assignedFields.has(f));
  });

  // ===== Step 3: 预览生成 =====
  function goToStep3() {
    const result = generatePreviewCards(allRows, mappings, cardType, 5);
    previewCards = result.previews;
    importStats = result.stats;
    currentStep = 3;
  }

  // ===== 导入执行 =====
  async function executeImport() {
    if (isImporting) return;
    isImporting = true;
    importProgress = 0;

    try {
      let deckId = targetDeckId;
      let deckName = '';

      // 创建新牌组
      if (createNewDeck) {
        const trimmedName = newDeckName.trim() || (isPasteMode ? 'CSV粘贴导入' : fileName.replace(/\.(csv|tsv|txt)$/i, ''));
        const defaultDeckSettings = dataStorage.getCurrentDefaultDeckSettings({
          newCardsPerDay: 20,
          maxReviewsPerDay: 100,
          enableAutoAdvance: false,
          showAnswerTime: 0,
        });

        const newDeck: Deck = {
          id: generateId(),
          name: trimmedName,
          description: isPasteMode ? 'CSV粘贴导入' : `CSV导入: ${fileName}`,
          category: 'imported',
          path: trimmedName,
          level: 0,
          order: 0,
          inheritSettings: false,
          includeSubdecks: false,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          settings: defaultDeckSettings,
          stats: {
            totalCards: 0, newCards: 0, learningCards: 0, reviewCards: 0,
            todayNew: 0, todayReview: 0, todayTime: 0,
            totalReviews: 0, totalTime: 0, memoryRate: 0,
            averageEase: 2.5, forecastDays: {},
          },
          tags: ['csv-import'],
          metadata: {
            importedFrom: fileName,
            importDate: new Date().toISOString(),
          },
        };

        const deckResult = await dataStorage.saveDeck(newDeck);
        if (!deckResult.success) {
          throw new Error(`创建牌组失败: ${deckResult.error}`);
        }
        deckId = newDeck.id;
        deckName = trimmedName;
      } else {
        const deck = decks.find(d => d.id === targetDeckId);
        deckName = deck?.name || '';
      }

      // 解析批量标签
      const extraTags = batchTags.split(/[,;，；]/).map(t => t.trim()).filter(Boolean);

      // 批量生成卡片
      const totalValid = importStats?.validCards || 0;
      const allCards: Card[] = [];
      const importBatchId = `csv-${Date.now()}`;

      for (let i = 0; i < allRows.length; i++) {
        const generated = generateCardContent(allRows[i], mappings, cardType);
        if (!generated) continue;

        // 构建 YAML 元数据（支持任意键值对）
        const yamlMetadata: Record<string, any> = {
          we_type: mapCardType(cardType),
          created: new Date().toISOString(),
        };
        if (deckName) {
          yamlMetadata.we_decks = [deckName];
        }
        const allTags = [...generated.tags, ...extraTags];
        if (allTags.length > 0) {
          yamlMetadata.tags = allTags;
        }

        // 写入溯源文件
        if (sourceLink.trim()) {
          yamlMetadata.we_source = sourceLink.trim();
        }

        // 写入所有额外字段到YAML frontmatter
        for (const [key, value] of Object.entries(generated.extraFields)) {
          if (!value) continue;
          if (key === 'source') {
            yamlMetadata.we_source = value;
          } else if (key === 'difficulty') {
            yamlMetadata.we_difficulty = value;
          } else if (key.startsWith('yaml:')) {
            yamlMetadata[key.replace(/^yaml:/, '')] = value;
          } else {
            // author, page 等直接写入
            yamlMetadata[key] = value;
          }
        }

        const contentWithMeta = buildContentWithYAML(yamlMetadata, generated.content);

        const card: Card = {
          uuid: generateCardUUID(),
          deckId,
          type: mapCardType(cardType),
          content: contentWithMeta,
          fsrs: {
            due: new Date().toISOString(),
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            lastReview: undefined as any,
            retrievability: 1,
          },
          reviewHistory: [],
          stats: {
            totalReviews: 0,
            totalTime: 0,
            averageTime: 0,
            memoryRate: 0,
          },
          source: 'weave' as const,
          tags: allTags,
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          metadata: {
            importedFrom: isPasteMode ? 'clipboard-csv' : fileName,
            importBatchId,
          },
        };

        allCards.push(card);
      }

      // 一次性批量保存，避免逐张 saveCard 导致每次全量加载所有卡片
      importProgress = 10;
      await dataStorage.saveCardsBatch(allCards);
      const successCount = allCards.length;
      importProgress = 100;

      new Notice(`${isPasteMode ? 'CSV粘贴' : 'CSV'}导入完成: ${successCount} 张卡片已导入到 "${deckName}"`);
      logger.info('[CSVImport] 导入完成:', { successCount, deckName, deckId });

      onImportComplete?.(deckId, successCount);
      handleClose();
    } catch (err) {
      logger.error('[CSVImport] 导入失败:', err);
      new Notice('CSV导入失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      isImporting = false;
    }
  }

  function mapCardType(importType: ImportCardType): CardType {
    switch (importType) {
      case 'single-choice': return CardType.Multiple;
      case 'cloze': return CardType.Cloze;
      default: return CardType.Basic;
    }
  }

  function handleClose() {
    if (isImporting) return;
    open = false;
    onClose();
  }

  // 步骤导航
  function goBack() {
    if (currentStep === 2) currentStep = 1;
    else if (currentStep === 3) currentStep = 2;
  }

  function goNext() {
    if (currentStep === 1 && fileLoaded) currentStep = 2;
    else if (currentStep === 2 && missingRequiredFields.length === 0) goToStep3();
  }
</script>

<EnhancedModal
  {open}
  onClose={handleClose}
  size="lg"
  title="CSV导入向导"
  accentColor="orange"
  maskClosable={!isImporting}
  keyboard={!isImporting}
>
  {#snippet children()}
    <div class="csv-import-wizard">
      <!-- 步骤指示器 -->
      <div class="csv-steps">
        <div class="csv-step" class:active={currentStep === 1} class:done={currentStep > 1}>
          <span class="csv-step-num">{currentStep > 1 ? '>' : '1'}</span>
          <span class="csv-step-label">文件配置</span>
        </div>
        <div class="csv-step-line" class:done={currentStep > 1}></div>
        <div class="csv-step" class:active={currentStep === 2} class:done={currentStep > 2}>
          <span class="csv-step-num">{currentStep > 2 ? '>' : '2'}</span>
          <span class="csv-step-label">列映射</span>
        </div>
        <div class="csv-step-line" class:done={currentStep > 2}></div>
        <div class="csv-step" class:active={currentStep === 3}>
          <span class="csv-step-num">3</span>
          <span class="csv-step-label">预览导入</span>
        </div>
      </div>

      <!-- Step 1: 文件配置 -->
      {#if currentStep === 1}
        <div class="csv-step-content">
          <!-- 文件选择 -->
          <div class="csv-section">
            <div class="csv-section-title">选择文件</div>
            <button class="csv-file-btn" class:csv-file-btn-active={!isPasteMode && fileName} onclick={handleFileSelect}>
              {fileName || '点击选择 CSV/TSV 文件...'}
            </button>
            {#if fileLoaded && !isPasteMode}
              <div class="csv-file-info">
                <span>编码: {fileEncoding}</span>
                <span>数据行: {allRows.length}</span>
                <span>列数: {headers.length}</span>
              </div>
            {/if}
          </div>

          <!-- 分隔线 -->
          <div class="csv-or-divider">
            <span class="csv-or-text">或</span>
          </div>

          <!-- 粘贴CSV内容 -->
          <div class="csv-section">
            <div class="csv-section-title">粘贴 CSV 内容</div>
            <textarea
              class="csv-paste-textarea"
              class:csv-paste-active={isPasteMode && fileLoaded}
              value={pasteCSVText}
              oninput={(e) => handlePasteCSV((e.target as HTMLTextAreaElement).value)}
              placeholder={"front,back,tags\n什么是间隔重复,基于遗忘曲线的学习方法,学习方法\nJava基本类型,int boolean char double,Java"}
            ></textarea>
            {#if fileLoaded && isPasteMode}
              <div class="csv-file-info">
                <span>数据行: {allRows.length}</span>
                <span>列数: {headers.length}</span>
              </div>
            {/if}
          </div>

          {#if fileLoaded}
            <!-- 解析配置 -->
            <div class="csv-section">
              <div class="csv-section-title">解析配置</div>
              <div class="csv-config-row">
                <label class="csv-config-label" for="csv-separator-select">分隔符</label>
                <select
                  id="csv-separator-select"
                  class="csv-config-select"
                  value={separator}
                  onchange={(e) => onSeparatorChange((e.target as HTMLSelectElement).value as Separator)}
                >
                  {#each Object.entries(SEPARATOR_LABELS) as [sep, label]}
                    <option value={sep}>{label}</option>
                  {/each}
                </select>
                {#if detectionConfidence > 0.8}
                  <span class="csv-auto-tag">自动检测</span>
                {/if}
              </div>
              <div class="csv-config-row">
                <label class="csv-config-label">
                  <input type="checkbox" checked={hasHeader} onchange={(e) => onHasHeaderChange((e.target as HTMLInputElement).checked)} />
                  第一行是表头
                </label>
              </div>
            </div>

            <!-- 数据预览表格 -->
            <div class="csv-section">
              <div class="csv-section-title">数据预览（前 {previewRows.length} 行）</div>
              <div class="csv-preview-table-wrap">
                <table class="csv-preview-table">
                  <thead>
                    <tr>
                      <th class="csv-row-num">#</th>
                      {#each headers as h}
                        <th>{h}</th>
                      {/each}
                    </tr>
                  </thead>
                  <tbody>
                    {#each previewRows as row, i}
                      <tr>
                        <td class="csv-row-num">{i + 1}</td>
                        {#each headers as _, ci}
                          <td>{row[ci] || ''}</td>
                        {/each}
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Step 2: 列映射 -->
      {#if currentStep === 2}
        <div class="csv-step-content">
          <!-- 卡片类型选择 -->
          <div class="csv-section">
            <div class="csv-section-title">卡片类型</div>
            <div class="csv-card-types">
              {#each CARD_TYPE_OPTIONS as opt}
                <button
                  class="csv-card-type-btn"
                  class:selected={cardType === opt.value}
                  onclick={() => onCardTypeChange(opt.value)}
                >
                  <div class="csv-card-type-name">{opt.label}</div>
                  <div class="csv-card-type-desc">{opt.description}</div>
                </button>
              {/each}
            </div>
          </div>

          <!-- 自动创建属性开关 -->
          <div class="csv-auto-create-toggle">
            <div class="csv-auto-create-info">
              <span class="csv-auto-create-label">允许自动创建 YAML 属性</span>
              <span class="csv-auto-create-desc">启用后可将 CSV 列映射为新的 YAML 属性</span>
            </div>
            <div
              class="checkbox-container"
              class:is-enabled={allowAutoCreate}
              onclick={() => allowAutoCreate = !allowAutoCreate}
              role="switch"
              aria-checked={allowAutoCreate}
              tabindex="0"
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); allowAutoCreate = !allowAutoCreate; } }}
            >
              <input type="checkbox" tabindex="-1" checked={allowAutoCreate}>
            </div>
          </div>

          <!-- 列映射表 -->
          <div class="csv-section">
            <div class="csv-section-title">列映射</div>
            <div class="csv-auto-create-desc">将 CSV 的提示列映射到这里后，导入时会自动写入卡片内容中的 <code>&gt;hint:</code> 引用提示块。</div>
            {#if missingRequiredFields.length > 0}
              <div class="csv-warning">
                缺少必填字段: {missingRequiredFields.map(f => getFieldLabel(f)).join(', ')}
              </div>
            {/if}
            <div class="csv-mapping-list">
              {#each mappings as mapping, i}
                <div class="csv-mapping-row">
                  <div class="csv-mapping-source">
                    <span class="csv-mapping-col-name">{mapping.csvColumn}</span>
                    {#if allRows.length > 0 && allRows[0][mapping.csvIndex]}
                      <span class="csv-mapping-sample">"{allRows[0][mapping.csvIndex].slice(0, 40)}{allRows[0][mapping.csvIndex].length > 40 ? '...' : ''}"</span>
                    {/if}
                  </div>
                  <span class="csv-mapping-arrow">-></span>
                  <button
                    class="csv-mapping-select"
                    onclick={(e) => openFieldMenu(e, i)}
                  >
                    {getFieldLabel(mapping.targetField)}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Step 3: 预览确认 -->
      {#if currentStep === 3}
        <div class="csv-step-content">
          <!-- 导入统计 -->
          {#if importStats}
            <div class="csv-section">
              <div class="csv-section-title">导入统计</div>
              <div class="csv-stats-row">
                <div class="csv-stat">
                  <div class="csv-stat-value">{importStats.totalRows}</div>
                  <div class="csv-stat-label">总行数</div>
                </div>
                <div class="csv-stat csv-stat-success">
                  <div class="csv-stat-value">{importStats.validCards}</div>
                  <div class="csv-stat-label">有效卡片</div>
                </div>
                <div class="csv-stat csv-stat-warning">
                  <div class="csv-stat-value">{importStats.skippedRows}</div>
                  <div class="csv-stat-label">跳过</div>
                </div>
              </div>
              {#if importStats.warnings.length > 0}
                <div class="csv-warnings-list">
                  {#each importStats.warnings as w}
                    <div class="csv-warning-item">{w}</div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- 溯源文件（可选） -->
          <div class="csv-section">
            <div class="csv-section-title">溯源文件（可选）</div>
            <input
              bind:this={sourceInputEl}
              type="text"
              class="csv-config-input"
              value={sourceLink}
              oninput={(e) => sourceLink = (e.target as HTMLInputElement).value}
              placeholder="输入文件名搜索或手动填写 ![[文档路径]]"
            />
            {#if sourceLink.trim()}
              <div class="csv-source-preview">来源: {sourceLink}</div>
            {/if}
          </div>

          <!-- 目标牌组 -->
          <div class="csv-section">
            <div class="csv-section-title">目标牌组</div>
            <div class="csv-config-row">
              <label class="csv-config-label">
                <input type="radio" name="deck-target" checked={createNewDeck} onchange={() => createNewDeck = true} />
                创建新牌组
              </label>
              {#if createNewDeck}
                <input
                  type="text"
                  class="csv-config-input"
                  bind:value={newDeckName}
                  placeholder="输入牌组名称..."
                />
              {/if}
            </div>
            {#if decks.length > 0}
              <div class="csv-config-row">
                <label class="csv-config-label">
                  <input type="radio" name="deck-target" checked={!createNewDeck} onchange={() => createNewDeck = false} />
                  导入到已有牌组
                </label>
                {#if !createNewDeck}
                  <select class="csv-config-select" bind:value={targetDeckId}>
                    {#each decks as deck}
                      <option value={deck.id}>{deck.name}</option>
                    {/each}
                  </select>
                {/if}
              </div>
            {/if}
          </div>

          <!-- 批量标签 -->
          <div class="csv-section">
            <div class="csv-section-title">批量标签（可选）</div>
            <input
              type="text"
              class="csv-config-input"
              bind:value={batchTags}
              placeholder="多个标签用逗号分隔..."
            />
          </div>

          <!-- 卡片预览 -->
          <div class="csv-section">
            <div class="csv-section-title">卡片预览</div>
            <div class="csv-card-previews">
              {#each previewCards as card, i}
                <div class="csv-card-preview">
                  <div class="csv-card-preview-header">卡片 {i + 1}</div>
                  <pre class="csv-card-preview-content">{card.content}</pre>
                </div>
              {/each}
            </div>
          </div>

          <!-- 导入进度 -->
          {#if isImporting}
            <div class="csv-section">
              <div class="csv-progress-bar">
                <div class="csv-progress-fill" style="width: {importProgress}%"></div>
              </div>
              <div class="csv-progress-text">正在导入... {importProgress}%</div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="csv-footer">
      <div class="csv-footer-left">
        {#if currentStep > 1}
          <button class="csv-btn csv-btn-secondary" onclick={goBack} disabled={isImporting}>
            上一步
          </button>
        {/if}
      </div>
      <div class="csv-footer-right">
        <button class="csv-btn csv-btn-secondary" onclick={handleClose} disabled={isImporting}>
          取消
        </button>
        {#if currentStep < 3}
          <button
            class="csv-btn csv-btn-primary"
            onclick={goNext}
            disabled={
              (currentStep === 1 && !fileLoaded) ||
              (currentStep === 2 && missingRequiredFields.length > 0)
            }
          >
            下一步
          </button>
        {:else}
          <button
            class="csv-btn csv-btn-primary"
            onclick={executeImport}
            disabled={isImporting || !importStats || importStats.validCards === 0}
          >
            {isImporting ? '导入中...' : `导入 ${importStats?.validCards || 0} 张卡片`}
          </button>
        {/if}
      </div>
    </div>
  {/snippet}
</EnhancedModal>

<style>
  .csv-import-wizard {
    min-height: 400px;
  }

  /* 步骤指示器 */
  .csv-steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 24px;
    padding: 0 16px;
  }

  .csv-step {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 20px;
    background: var(--background-secondary);
    color: var(--text-muted);
    font-size: 13px;
    transition: all 0.2s ease;
  }

  .csv-step.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .csv-step.done {
    background: var(--background-modifier-success);
    color: var(--text-on-accent);
  }

  .csv-step-num {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: 600;
    font-size: 12px;
  }

  .csv-step-label {
    font-weight: 500;
  }

  .csv-step-line {
    width: 40px;
    height: 2px;
    background: var(--background-modifier-border);
    margin: 0 4px;
    transition: background 0.2s ease;
  }

  .csv-step-line.done {
    background: var(--interactive-accent);
  }

  /* 内容区域 */
  .csv-step-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .csv-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .csv-section-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-normal);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  /* 文件选择 */
  .csv-file-btn {
    padding: 12px 16px;
    border: 2px dashed var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-muted);
    cursor: pointer;
    text-align: center;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .csv-file-btn:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
  }

  .csv-file-btn-active {
    border-color: var(--interactive-accent);
    border-style: solid;
    color: var(--text-normal);
  }

  .csv-file-info {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-muted);
  }

  /* 配置行 */
  .csv-config-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }

  .csv-config-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-normal);
    white-space: nowrap;
    cursor: pointer;
  }

  .csv-config-select {
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
    min-width: 120px;
  }

  .csv-config-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  /* 分隔线 */
  .csv-or-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 4px 0;
  }

  .csv-or-divider::before,
  .csv-or-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--background-modifier-border);
  }

  .csv-or-text {
    font-size: 12px;
    color: var(--text-faint);
    flex-shrink: 0;
  }

  /* 粘贴区 */
  .csv-paste-textarea {
    width: 100%;
    min-height: 120px;
    max-height: 240px;
    padding: 10px 12px;
    border: 2px dashed var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 12px;
    font-family: var(--font-monospace);
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.2s ease;
  }

  .csv-paste-textarea:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }

  .csv-paste-textarea::placeholder {
    color: var(--text-faint);
    font-size: 12px;
  }

  .csv-paste-active {
    border-color: var(--interactive-accent);
    border-style: solid;
  }

  /* 溯源文件预览 */
  .csv-source-preview {
    font-size: 12px;
    color: var(--text-muted);
    padding: 4px 8px;
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .csv-auto-tag {
    font-size: 11px;
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    padding: 1px 6px;
    border-radius: 8px;
  }

  /* 数据预览表格 */
  .csv-preview-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .csv-preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .csv-preview-table th,
  .csv-preview-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--background-modifier-border);
    text-align: left;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .csv-preview-table th {
    background: var(--background-secondary);
    font-weight: 600;
    color: var(--text-normal);
    position: sticky;
    top: 0;
  }

  .csv-preview-table td {
    color: var(--text-muted);
  }

  .csv-row-num {
    width: 32px;
    text-align: center;
    color: var(--text-faint);
    font-size: 11px;
  }

  /* 卡片类型选择 */
  .csv-card-types {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .csv-card-type-btn {
    padding: 10px 12px;
    border: 2px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .csv-card-type-btn:hover {
    border-color: var(--interactive-accent);
  }

  .csv-card-type-btn.selected {
    border-color: var(--interactive-accent);
    background: var(--background-secondary);
  }

  .csv-card-type-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text-normal);
  }

  .csv-card-type-desc {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* 列映射 */
  .csv-mapping-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .csv-mapping-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background: var(--background-secondary);
    border-radius: 6px;
  }

  .csv-mapping-source {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .csv-mapping-col-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text-normal);
  }

  .csv-mapping-sample {
    font-size: 11px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .csv-mapping-arrow {
    color: var(--text-muted);
    font-size: 14px;
    flex-shrink: 0;
  }

  .csv-mapping-select {
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
    min-width: 140px;
    cursor: pointer;
    text-align: left;
  }

  .csv-mapping-select:hover {
    border-color: var(--interactive-accent);
  }

  /* 自动创建开关 */
  .csv-auto-create-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 6px;
  }

  .csv-auto-create-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .csv-auto-create-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .csv-auto-create-desc {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* 警告 */
  .csv-warning {
    padding: 8px 12px;
    background: rgba(255, 165, 0, 0.1);
    border: 1px solid rgba(255, 165, 0, 0.3);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 13px;
  }

  .csv-warnings-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .csv-warning-item {
    font-size: 12px;
    color: var(--text-muted);
    padding-left: 8px;
  }

  /* 统计 */
  .csv-stats-row {
    display: flex;
    gap: 16px;
  }

  .csv-stat {
    flex: 1;
    text-align: center;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 8px;
  }

  .csv-stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .csv-stat-success .csv-stat-value {
    color: var(--interactive-accent);
  }

  .csv-stat-warning .csv-stat-value {
    color: var(--text-muted);
  }

  .csv-stat-label {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* 卡片预览 */
  .csv-card-previews {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .csv-card-preview {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .csv-card-preview-header {
    padding: 4px 10px;
    background: var(--background-secondary);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .csv-card-preview-content {
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: inherit;
    max-height: 120px;
    overflow-y: auto;
  }

  /* 进度条 */
  .csv-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .csv-progress-fill {
    height: 100%;
    background: var(--interactive-accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .csv-progress-text {
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  /* 底部按钮 */
  .csv-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .csv-footer-left,
  .csv-footer-right {
    display: flex;
    gap: 8px;
  }

  .csv-btn {
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .csv-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .csv-btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .csv-btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .csv-btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border-color: var(--background-modifier-border);
  }

  .csv-btn-secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }
</style>
