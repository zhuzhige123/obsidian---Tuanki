<script lang="ts">
  /**
   * APKG 导入模态窗口
   * 使用 Weave 设计系统进行现代化重构
   * 设计风格：类 Cursor 现代化界面
   */
  import { Notice } from "obsidian";
  import { onDestroy, tick } from "svelte";
  import type { WeavePlugin } from "../../main";
  import { tr, t } from "../../utils/i18n";
  import type { WeaveDataStorage } from "../../data/storage";
  import type { ImportProgress, ImportResult } from "../../domain/apkg/types";
  import { ObsidianMediaStorageAdapter } from "../../infrastructure/adapters/impl/ObsidianMediaStorageAdapter";
  import { WeaveDataStorageAdapter } from "../../infrastructure/adapters/impl/WeaveDataStorageAdapter";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import OperationProgressCard from "../ui/OperationProgressCard.svelte";
  import ResizableModal from "../ui/ResizableModal.svelte";

  interface Props {
    show: boolean;
    dataStorage: WeaveDataStorage;
    wasmUrl?: string;
    legacyImportAvailable?: boolean;
    legacyImportHelpText?: string;
    plugin: WeavePlugin;
    onClose: () => void;
    onImportComplete: (result: ImportResult) => void;
    useObsidianModal?: boolean;
  }

  let {
    show = $bindable(),
    dataStorage,
    wasmUrl = "",
    legacyImportAvailable = true,
    legacyImportHelpText = "",
    plugin,
    onClose,
    onImportComplete,
    useObsidianModal = false
  }: Props = $props();

  // 状态管理
  type ImportStage = 'selection' | 'importing' | 'result';
  let importStage = $state<ImportStage>('selection');
  let selectedFile = $state<File | null>(null);
  let importResult = $state<ImportResult | null>(null);
  let progressStage = $state<ImportProgress['stage']>('parsing');
  let progressPercent = $state(0);
  let progressMessage = $state('');
  let progressDetail = $state('');
  let progressTotalItems = $state(0);
  let progressCompletedItems = $state(0);
  let isImporting = $state(false);
  let isDragOver = $state(false);
  let currentImportController = $state<AbortController | null>(null);
  let currentImportRunId = 0;
  let isDestroyed = false;
  let fileInput = $state<HTMLInputElement | undefined>(undefined);
  const canImportLegacyApkg = $derived(legacyImportAvailable && Boolean(wasmUrl));

  const importStageSequence: ImportProgress['stage'][] = ['parsing', 'analyzing', 'media', 'building', 'converting', 'saving'];

  function getImportStageLabel(stage: ImportProgress['stage']): string {
    switch (stage) {
      case 'parsing':
        return t('management.apkgImportModal.stages.parsing');
      case 'analyzing':
        return t('management.apkgImportModal.stages.analyzing');
      case 'converting':
        return t('management.apkgImportModal.stages.converting');
      case 'media':
        return t('management.apkgImportModal.stages.media');
      case 'building':
        return t('management.apkgImportModal.stages.building');
      case 'saving':
        return t('management.apkgImportModal.stages.saving');
      default:
        return t('management.apkgImportModal.stages.importing');
    }
  }

  function getImportStageDescription(stage: ImportProgress['stage']): string {
    switch (stage) {
      case 'parsing':
        return t('management.apkgImportModal.stageDescriptions.parsing');
      case 'analyzing':
        return t('management.apkgImportModal.stageDescriptions.analyzing');
      case 'media':
        return t('management.apkgImportModal.stageDescriptions.media');
      case 'converting':
        return t('management.apkgImportModal.stageDescriptions.converting');
      case 'building':
        return t('management.apkgImportModal.stageDescriptions.building');
      case 'saving':
        return t('management.apkgImportModal.stageDescriptions.saving');
      default:
        return t('management.apkgImportModal.stageDescriptions.preparing');
    }
  }

  function getStageIndex(stage: ImportProgress['stage']): number {
    return importStageSequence.indexOf(stage);
  }

  function isStageCompleted(stage: ImportProgress['stage']): boolean {
    return getStageIndex(stage) < getStageIndex(progressStage);
  }

  function isStageCurrent(stage: ImportProgress['stage']): boolean {
    return progressStage === stage;
  }

  function getProgressCounterLabel(): string {
    if (progressTotalItems > 0) {
      const completed = Math.min(progressCompletedItems, progressTotalItems);
      return `${completed}/${progressTotalItems}`;
    }

    return `${Math.round(progressPercent)}%`;
  }

  function applyImportProgress(progress: ImportProgress) {
    progressStage = progress.stage;
    progressPercent = progress.progress;
    progressMessage = progress.message || '';
    progressDetail = progress.detail || '';
    progressTotalItems = progress.totalItems || 0;
    progressCompletedItems = progress.completedItems || 0;
  }

  async function yieldToNextFrame() {
    await tick();
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
        return;
      }

      setTimeout(resolve, 0);
    });
  }

  function resetImportProgress() {
    progressStage = 'parsing';
    progressPercent = 0;
    progressMessage = '';
    progressDetail = '';
    progressTotalItems = 0;
    progressCompletedItems = 0;
  }

  async function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (file) {
      if (!file.name.toLowerCase().endsWith('.apkg')) {
        new Notice(t('management.apkgImportModal.invalidFile'));
        return;
      }
      selectedFile = file;
      importResult = null;
      await startImport();
    }
  }

  function selectFile() {
    if (!canImportLegacyApkg) {
      new Notice(legacyImportHelpText || t('management.apkgImportModal.runtimeMissing'));
      return;
    }
    if (fileInput) {
      fileInput.click();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectFile();
    }
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;

    if (!canImportLegacyApkg) {
      new Notice(legacyImportHelpText || t('management.apkgImportModal.runtimeMissing'));
      return;
    }

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.apkg')) {
        selectedFile = file;
        importResult = null;
        await startImport();
      } else {
        new Notice(t('management.apkgImportModal.invalidFile'));
      }
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!canImportLegacyApkg) {
      isDragOver = false;
      return;
    }
    isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
  }

  async function startImport() {
    if (!selectedFile) return;
    if (!canImportLegacyApkg) {
      new Notice(legacyImportHelpText || t('management.apkgImportModal.runtimeMissing'));
      return;
    }

    const runId = currentImportRunId + 1;
    currentImportRunId = runId;
    const abortController = new AbortController();
    currentImportController = abortController;
    isImporting = true;
    importResult = null;
    importStage = 'importing';
    resetImportProgress();
    
    try {
      // 创建新的APKG导入服务
      const dataStorageAdapter = new WeaveDataStorageAdapter(dataStorage);
      const mediaStorage = new ObsidianMediaStorageAdapter(plugin);
      const { APKGImportService } = await import("../../application/services/apkg/APKGImportService");
      const importService = new APKGImportService(dataStorageAdapter, mediaStorage, { wasmUrl });

      // 配置导入参数
      const config = APKGImportService.createStandardImportConfig(selectedFile);

      // 执行导入
      const result = await importService.import(config, plugin, (progress) => {
        if (shouldIgnoreImportUpdate(runId)) {
          return;
        }
        applyImportProgress(progress);
      }, {
        signal: abortController.signal,
      });

      if (shouldIgnoreImportUpdate(runId)) {
        return;
      }

      if (abortController.signal.aborted) {
        resetModal();
        resetImportProgress();
        return;
      }

      importResult = result;
      if (result.success) {
        applyImportProgress({
          stage: 'saving',
          progress: 100,
          message: t('management.apkgImportModal.progress.completed'),
        });
      }
      importStage = 'result';
      await yieldToNextFrame();

      if (result.success) {
        setTimeout(() => {
          if (!shouldIgnoreImportUpdate(runId) && importResult) {
            void Promise.resolve(onImportComplete(importResult));
          }
        }, 0);
      }
    } catch (error) {
      if (shouldIgnoreImportUpdate(runId) || abortController.signal.aborted) {
        resetModal();
        resetImportProgress();
        return;
      }
      importResult = {
        success: false,
        stats: { totalCards: 0, importedCards: 0, skippedCards: 0, failedCards: 0, mediaFiles: 0, mediaTotalSize: 0 },
        errors: [{ stage: 'parsing', message: error instanceof Error ? error.message : t('management.apkgImportModal.result.failedTitle'), code: 'UNKNOWN_ERROR' }],
        warnings: [],
        duration: 0
      };
      importStage = 'result';
    } finally {
      if (!shouldIgnoreImportUpdate(runId)) {
        isImporting = false;
      }
      if (currentImportController === abortController) {
        currentImportController = null;
      }
    }
  }

  function resetModal() {
    importStage = 'selection';
    selectedFile = null;
    importResult = null;
  }

  function invalidateCurrentImport() {
    currentImportRunId += 1;
  }

  function shouldIgnoreImportUpdate(runId: number): boolean {
    return isDestroyed || runId !== currentImportRunId;
  }

  function abortCurrentImport() {
    currentImportController?.abort();
    currentImportController = null;
  }

  function closeModal() {
    invalidateCurrentImport();
    abortCurrentImport();
    isImporting = false;
    selectedFile = null;
    importResult = null;
    resetImportProgress();
    importStage = 'selection';
    show = false;
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  onDestroy(() => {
    isDestroyed = true;
    currentImportRunId += 1;
    abortCurrentImport();
  });
</script>

{#snippet modalBody()}
  <div class="apkg-modal-body">
    {#if importStage === 'selection'}
      <!-- 文件选择阶段 -->
      <div class="apkg-stage apkg-selection">
        <div class="selection-hero">
          <div class="selection-hero-icon">
            <EnhancedIcon name="package" size={26} />
          </div>
          <div class="selection-hero-copy">
            <h3 class="selection-title">{$tr('management.apkgImportModal.selection.title')}</h3>
            <p class="selection-desc">{$tr('management.apkgImportModal.selection.description')}</p>
          </div>
        </div>

        {#if !canImportLegacyApkg}
          <div class="runtime-warning">
            <div class="runtime-warning__title">{$tr('management.apkgImportModal.selection.runtimeWarningTitle')}</div>
            <div class="runtime-warning__desc">
              {legacyImportHelpText || $tr('management.apkgImportModal.selection.runtimeWarningDescription')}
            </div>
          </div>
        {/if}

        <div class="dropzone"
             class:is-dragover={isDragOver}
             class:is-disabled={!canImportLegacyApkg}
             onclick={() => selectFile()}
             onkeydown={handleKeyDown}
             ondragover={handleDragOver}
             ondragleave={handleDragLeave}
             ondrop={handleDrop}
             role="button"
             tabindex={canImportLegacyApkg ? 0 : -1}
             aria-disabled={!canImportLegacyApkg}>
          <EnhancedIcon name="upload" size={56} />
          <h3 class="dropzone-title">{$tr('management.apkgImportModal.selection.dropzoneTitle')}</h3>
          <p class="dropzone-hint">
            {#if canImportLegacyApkg}
              {$tr('management.apkgImportModal.selection.dropzoneHintEnabled')}
            {:else}
              {$tr('management.apkgImportModal.selection.dropzoneHintDisabled')}
            {/if}
          </p>
        </div>

        <div class="selection-capabilities">
          <div class="capability-card">
            <div class="capability-title">{$tr('management.apkgImportModal.selection.capabilities.cardFormat')}</div>
            <div class="capability-desc">{$tr('management.apkgImportModal.selection.capabilities.cardFormatDesc')}</div>
          </div>
          <div class="capability-card">
            <div class="capability-title">{$tr('management.apkgImportModal.selection.capabilities.contentStandard')}</div>
            <div class="capability-desc">{$tr('management.apkgImportModal.selection.capabilities.contentStandardDesc')}</div>
          </div>
          <div class="capability-card">
            <div class="capability-title">{$tr('management.apkgImportModal.selection.capabilities.mediaMigration')}</div>
            <div class="capability-desc">{$tr('management.apkgImportModal.selection.capabilities.mediaMigrationDesc')}</div>
          </div>
        </div>
        <input
          bind:this={fileInput}
          type="file"
          accept=".apkg"
          onchange={handleFileSelect}
          style="display: none"
        />
      </div>

    {:else if importStage === 'importing'}
      <!-- 导入进度阶段 -->
      <div class="apkg-stage apkg-importing">
        <div class="progress-shell">
          <OperationProgressCard
            title={getImportStageLabel(progressStage)}
            counter={getProgressCounterLabel()}
            message={progressMessage || getImportStageDescription(progressStage)}
            detail={progressDetail}
            percent={progressPercent}
            status="running"
            statusLabel={$tr('management.apkgImportModal.progress.running')}
            centered={true}
            detailInCard={true}
            progressValueMin={0}
            progressValueMax={progressTotalItems > 0 ? progressTotalItems : 100}
            progressValueNow={progressTotalItems > 0 ? Math.min(progressCompletedItems, progressTotalItems) : Math.round(progressPercent)}
            progressValueText={getProgressCounterLabel()}
          />
          <div class="progress-stage-list">
            {#each importStageSequence as stage}
              <div class={`stage-item ${isStageCurrent(stage) ? 'is-current' : ''} ${isStageCompleted(stage) ? 'is-completed' : ''}`}>
                <div class="stage-marker">{getStageIndex(stage) + 1}</div>
                <div class="stage-copy">
                  <div class="stage-title">{getImportStageLabel(stage)}</div>
                  <div class="stage-desc">{getImportStageDescription(stage)}</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

    {:else if importStage === 'result'}
      <!-- 结果阶段 -->
      <div class="apkg-stage apkg-result">
        {#if importResult?.success}
          <div class="result-success">
            <div class="result-icon">
              <EnhancedIcon name="check-circle" size={56} color="var(--color-green)" />
            </div>
            <h3 class="result-title">{$tr('management.apkgImportModal.result.successTitle')}</h3>
            <p class="result-message">{$tr('management.apkgImportModal.result.successMessage', { count: importResult.stats.importedCards })}</p>

            <div class="result-pill-row">
              <span class="result-pill">{$tr('management.apkgImportModal.result.pills.weave')}</span>
              <span class="result-pill">{$tr('management.apkgImportModal.result.pills.obsidian')}</span>
              <span class="result-pill">{$tr('management.apkgImportModal.result.pills.media')}</span>
            </div>

            {#if importResult.deckName}
              <div class="result-details result-grid">
                <div class="detail-item">
                  <span class="detail-label">{$tr('management.apkgImportModal.result.deck')}</span>
                  <span class="detail-value">{importResult.deckName}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">{$tr('management.apkgImportModal.result.imported')}</span>
                  <span class="detail-value">{importResult.stats.importedCards} {$tr('management.apkgImportModal.result.cardsUnit')}</span>
                </div>
                {#if importResult.stats.failedCards > 0}
                  <div class="detail-item mod-warning">
                    <span class="detail-label">{$tr('management.apkgImportModal.result.failed')}</span>
                    <span class="detail-value">{importResult.stats.failedCards} {$tr('management.apkgImportModal.result.cardsUnit')}</span>
                  </div>
                {/if}
                <div class="detail-item">
                  <span class="detail-label">{$tr('management.apkgImportModal.result.media')}</span>
                  <span class="detail-value">{importResult.stats.mediaFiles} {$tr('management.apkgImportModal.result.mediaUnit')}</span>
                </div>
              </div>
            {/if}

            <!-- 错误信息列表 -->
            {#if importResult.errors && importResult.errors.length > 0}
              <details class="error-collapsible">
                <summary class="error-collapsible-trigger">
                  <EnhancedIcon name="alert-triangle" size={16} />
                  <span>{$tr('management.apkgImportModal.result.errorDetails', { count: importResult.errors.length })}</span>
                  <EnhancedIcon name="chevron-down" size={16} class="chevron" />
                </summary>
                <div class="error-collapsible-content">
                  {#each importResult.errors as error}
                    <div class="failed-card">
                      <div class="failed-header">
                        <span class="failed-id">{error.stage}</span>
                        <span class="failed-model">{error.code}</span>
                      </div>
                      <div class="failed-reason">{error.message}</div>
                    </div>
                  {/each}
                </div>
              </details>
            {/if}
          </div>
        {:else}
          <div class="result-error">
            <div class="result-icon">
              <EnhancedIcon name="alert-circle" size={56} color="var(--color-red)" />
            </div>
            <h3 class="result-title">{$tr('management.apkgImportModal.result.failedTitle')}</h3>
            <p class="result-message">{importResult?.errors?.[0]?.message || $tr('management.apkgImportModal.result.unknownError')}</p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 底部操作栏 -->
    {#if importStage === 'result'}
      <div class="apkg-modal-footer">
        <button class="apkg-close-btn" onclick={closeModal}>
          {$tr('management.apkgImportModal.result.close')}
        </button>
      </div>
    {:else if importStage === 'importing'}
      <div class="apkg-modal-footer">
        <button class="apkg-close-btn" onclick={closeModal}>
          {$tr('management.apkgImportModal.result.cancelAndClose')}
        </button>
      </div>
    {/if}
  </div>
{/snippet}

{#if useObsidianModal}
  {@render modalBody()}
{:else}
  <!-- 使用 ResizableModal 统一模态窗设计 -->
  <ResizableModal
    bind:open={show}
    {plugin}
    title={$tr('management.apkgImportModal.windowTitle')}
    accentColor="cyan"
    className="apkg-import-modal"
    closable={true}
    maskClosable={!isImporting}
    keyboard={!isImporting}
    onClose={closeModal}
    initialWidth={600}
    initialHeight={400}
  >
    {#snippet children()}
      {@render modalBody()}
    {/snippet}
  </ResizableModal>
{/if}

<style>
  /* ===== APKG 导入模态窗样式 ===== */

  .apkg-modal-body {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding: 1rem 1.5rem;
  }

  /* 阶段容器 */
  .apkg-stage {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    flex: 1;
    min-height: 0;
  }

  .selection-hero {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
    padding: 1rem 1.1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-secondary);
  }

  .selection-hero-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
    color: var(--interactive-accent);
    flex-shrink: 0;
  }

  .selection-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .selection-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-normal);
  }

  .selection-desc {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-muted);
  }

  .runtime-warning {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.9rem 1rem;
    border: 1px solid color-mix(in srgb, var(--color-orange) 45%, var(--background-modifier-border));
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-orange) 12%, var(--background-secondary));
  }

  .runtime-warning__title {
    font-weight: 700;
    color: var(--text-normal);
  }

  .runtime-warning__desc {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-muted);
  }

  /* ===== 文件选择阶段（Dropzone）===== */
  .dropzone {
    border: 2px dashed var(--background-modifier-border);
    border-radius: 12px;
    padding: 2.25rem 1.5rem;
    text-align: center;
    cursor: pointer;
    transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dropzone:hover,
  .dropzone.is-dragover {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .dropzone.is-disabled {
    cursor: not-allowed;
    opacity: 0.72;
    transform: none;
    box-shadow: none;
  }

  .dropzone.is-disabled:hover,
  .dropzone.is-disabled.is-dragover {
    border-color: var(--background-modifier-border);
    background: transparent;
    transform: none;
    box-shadow: none;
  }

  .dropzone-title {
    margin-top: 1.25rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .dropzone-hint {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .selection-capabilities {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .capability-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-secondary);
  }

  .capability-title {
    font-weight: 600;
    color: var(--text-normal);
  }

  .capability-desc {
    font-size: 0.8125rem;
    line-height: 1.55;
    color: var(--text-muted);
  }

  /* ===== 导入进度阶段 ===== */
  .progress-shell {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr);
    gap: 1rem;
    align-items: stretch;
    min-height: 0;
    flex: 1;
  }

  .progress-stage-list {
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: var(--background-secondary);
  }

  .progress-stage-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }

  .stage-item {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.75rem;
    border-radius: 10px;
    background: var(--background-primary);
    border: 1px solid transparent;
  }

  .stage-item.is-current {
    border-color: color-mix(in srgb, var(--interactive-accent) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-primary));
  }

  .stage-item.is-completed {
    opacity: 0.85;
  }

  .stage-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.65rem;
    height: 1.65rem;
    border-radius: 999px;
    background: var(--background-secondary-alt, var(--background-modifier-hover));
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .stage-item.is-current .stage-marker,
  .stage-item.is-completed .stage-marker {
    background: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
    color: var(--interactive-accent);
  }

  .stage-copy {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .stage-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .stage-desc {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  /* ===== 结果阶段 ===== */
  .result-success,
  .result-error {
    text-align: center;
    padding: 1.5rem;
  }

  .result-icon {
    margin-bottom: 1rem;
  }

  .result-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1rem 0;
    color: var(--text-normal);
  }

  .result-message {
    font-size: 1rem;
    color: var(--text-muted);
    margin-bottom: 1.25rem;
  }

  .result-pill-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .result-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
    color: var(--interactive-accent);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .result-details {
    text-align: left;
    background: var(--background-secondary);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-top: 1.25rem;
  }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 1rem;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .detail-item:last-child {
    border-bottom: none;
  }

  .detail-item.mod-warning {
    color: #f59e0b;
  }

  .detail-label {
    color: var(--text-muted);
  }

  .detail-value {
    font-weight: 600;
  }

  /* ===== 错误折叠组件 ===== */
  .error-collapsible {
    margin-top: 1.25rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    text-align: left;
  }

  .error-collapsible-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--background-secondary);
    cursor: pointer;
    font-weight: 600;
    transition: background 150ms;
    user-select: none;
  }

  .error-collapsible-trigger:hover {
    background: var(--background-modifier-hover);
  }

  .error-collapsible-trigger :global(.chevron) {
    margin-left: auto;
    transition: transform 150ms;
  }

  .error-collapsible[open] :global(.chevron) {
    transform: rotate(180deg);
  }

  .error-collapsible-content {
    padding: 1rem;
    background: var(--background-primary);
    border-top: 1px solid var(--background-modifier-border);
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .failed-card {
    padding: 1rem;
    background: var(--background-secondary);
    border-left: 3px solid #f59e0b;
    border-radius: 6px;
  }

  .failed-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .failed-id {
    color: var(--text-muted);
  }

  .failed-model {
    font-weight: 600;
  }

  .failed-reason {
    color: #f59e0b;
    font-size: 0.875rem;
  }

  /* ===== 底部操作栏 ===== */
  .apkg-modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 1rem 0 0;
    border-top: 1px solid var(--background-modifier-border);
    margin-top: 1rem;
  }

  .apkg-close-btn {
    padding: 0.5rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    transition: opacity 150ms;
  }

  .apkg-close-btn:hover {
    opacity: 0.9;
  }

  @media (max-width: 480px) {
    .apkg-modal-body {
      padding: 0.75rem 1rem;
    }

    .dropzone {
      padding: 1.5rem 1rem;
    }

    .selection-capabilities,
    .result-grid,
    .progress-shell {
      grid-template-columns: 1fr;
    }
  }
</style>
