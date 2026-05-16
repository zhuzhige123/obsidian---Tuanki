<script lang="ts">
  import { Notice, Platform, TFile, normalizePath } from 'obsidian';
  import type { WeavePlugin } from '../../../main';
  import type { Card } from '../../../data/types';
  import { EPUB_RUNTIME } from '../../../services/epub-integration';
  import { EpubLinkService } from '../../../services/epub-integration/EpubLinkService';
  import { findOpenEpubLeaf } from '../../../utils/epub-leaf-utils';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';
  import { openFileWithExistingLeaf, openLinkWithExistingLeaf } from '../../../utils/workspace-navigation';

  const isMobile = Platform.isMobile;

  interface Props {
    card: Card;
    plugin: WeavePlugin;
    deckName: string;
  }

  let { card, plugin, deckName }: Props = $props();

  function readString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return '';
  }

  function readNumber(...values: unknown[]): number | null {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  function readStringArray(...values: unknown[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const normalized = normalizePath(item.trim());
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
      }
    }

    return result;
  }

  function normalizeComparePath(path: string): string {
    return normalizePath(path).toLowerCase();
  }

  function getFileName(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    return normalized.split('/').pop() || normalized;
  }

  function getSourceKindLabel(value: string): string {
    if (value === 'markdown') return 'md';
    if (value === 'pdf') return 'pdf';
    if (value === 'epub') return 'epub';
    return '未知';
  }

  function getScheduleStatusLabel(value: string): string {
    switch (value) {
      case 'new':
        return '新建';
      case 'queued':
        return '待处理';
      case 'scheduled':
        return '已排期';
      case 'active':
        return '复习中';
      case 'suspended':
        return '已搁置';
      case 'done':
        return '已完成';
      case 'removed':
        return '已移除';
      default:
        return '未知';
    }
  }

  async function copyText(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      new Notice(`已复制${label}`);
    } catch {
      new Notice(`复制${label}失败`);
    }
  }

  async function openVaultPath(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const abstractFile =
      plugin.app.vault.getAbstractFileByPath(normalized) ||
      plugin.app.metadataCache.getFirstLinkpathDest(normalized, '');
    if (!(abstractFile instanceof TFile)) {
      new Notice('文件不存在或不在当前库中');
      return;
    }

    await openFileWithExistingLeaf(plugin.app, abstractFile, { openInNewTab: true, focus: true });
  }

  function getContextPath(): string {
    return plugin.app.workspace.getActiveFile()?.path ?? '';
  }

  async function openResumeLink(linkText: string): Promise<void> {
    await openLinkWithExistingLeaf(plugin.app, linkText, getContextPath(), { focus: true });
  }

  async function navigateToEpubLocation(filePath: string, options: { cfi?: string; href?: string; sourceId?: string }): Promise<void> {
    const normalizedFilePath = normalizePath(filePath);
    if (options.cfi) {
      await new EpubLinkService(plugin.app).navigateToEpubLocation(
        normalizedFilePath,
        options.cfi,
        '',
        options.sourceId
      );
      return;
    }

    const abstractFile = plugin.app.vault.getAbstractFileByPath(normalizedFilePath);
    if (!(abstractFile instanceof TFile)) {
      new Notice('源 EPUB 不存在或已移动');
      return;
    }

    const navDetail: { filePath: string; href?: string } = { filePath: normalizedFilePath };
    if (options.href) {
      navDetail.href = options.href;
    }

    const existingLeaf = findOpenEpubLeaf(plugin.app, normalizedFilePath);

    if (existingLeaf) {
      plugin.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
      window.dispatchEvent(new CustomEvent(EPUB_RUNTIME.events.navigate, { detail: navDetail }));
      return;
    }

    (window as any)[EPUB_RUNTIME.globals.pendingNavigationKey] = navDetail;
    if (typeof plugin.openEpubReader === 'function') {
      await plugin.openEpubReader(normalizedFilePath);
      return;
    }

    await plugin.app.workspace.openLinkText(normalizedFilePath, getContextPath(), false);
  }

  async function openResumeTarget(): Promise<void> {
    if (sourceKind === 'pdf' && resumeLink) {
      await openResumeLink(resumeLink);
      return;
    }

    if (sourceKind === 'epub' && epubFilePath) {
      await navigateToEpubLocation(epubFilePath, {
        cfi: epubResumeCfi || undefined,
        href: epubTocHref || undefined,
        sourceId: epubSourceId || undefined,
      });
      return;
    }

    new Notice('当前阅读点没有可恢复的精确阅读位置');
  }

  const cardLike = $derived(card as Card & Record<string, unknown>);
  const metadata = $derived((card.metadata || {}) as Record<string, unknown>);
  const sourceKind = $derived(readString(cardLike.ir_source_kind, card.sourceKind, 'unknown'));
  const sourceKindLabel = $derived(getSourceKindLabel(sourceKind));
  const scheduleStatus = $derived(readString(cardLike.ir_state));
  const scheduleStatusLabel = $derived(getScheduleStatusLabel(scheduleStatus));
  const sourceDocumentPath = $derived(
    readString(
      cardLike.ir_source_file,
      cardLike.ir_source_document_key,
      card.sourceDocumentKey,
      card.sourceFile
    )
  );
  const readingPointFilePath = $derived(readString(card.sourceFile));
  const showReadingPointFile = $derived(
    sourceKind === 'markdown' &&
      readingPointFilePath &&
      sourceDocumentPath &&
      normalizeComparePath(readingPointFilePath) !== normalizeComparePath(sourceDocumentPath)
  );
  const sourceSubunit = $derived(readString(cardLike.ir_source_subunit, card.sourceSubunitKey));
  const tagGroup = $derived(readString(cardLike.ir_tag_group, '默认'));
  const associatedNotePaths = $derived(
    readStringArray(card.associatedNotePaths, cardLike.ir_associated_note_paths, [card.associatedNotePath])
  );
  const primaryAssociatedNotePath = $derived(
    readString(
      associatedNotePaths[0],
      card.primaryAssociatedNotePath,
      card.associatedNotePath,
      cardLike.ir_primary_associated_note_path,
      cardLike.ir_associated_note_primary_path
    )
  );
  const priorityValue = $derived(readNumber(cardLike.ir_priority_value, cardLike.ir_priority, card.priority));
  const hasTags = $derived(Array.isArray(card.tags) && card.tags.length > 0);
  const isFavorite = $derived(Boolean(cardLike.ir_favorite));
  const resumeLink = $derived(readString(cardLike.resumeLink, metadata.resumeLink, metadata.link));
  const epubFilePath = $derived(readString(cardLike.epubFilePath, metadata.epubFilePath, sourceDocumentPath));
  const epubResumeCfi = $derived(readString(cardLike.resumeCfi, metadata.resumeCfi));
  const epubTocHref = $derived(readString(cardLike.tocHref, metadata.tocHref));
  const epubSourceId = $derived(readString(cardLike.sourceId, metadata.sourceId));
  const hasResumeTarget = $derived(
    sourceKind === 'pdf'
      ? Boolean(resumeLink)
      : sourceKind === 'epub'
        ? Boolean(epubFilePath && (epubResumeCfi || epubTocHref))
        : false
  );
  const resumeActionLabel = $derived(sourceKind === 'pdf' ? '恢复 PDF 阅读位置' : '恢复 EPUB 阅读位置');
</script>

<div class="ir-card-info-tab" class:mobile={isMobile} role="tabpanel" id="ir-info-panel">
  <section class="info-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-red" class:mobile={isMobile}>
      基础信息
    </h3>

    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">UUID</span>
        <span class="info-value action-row">
          <button class="pill-button" onclick={() => copyText(card.uuid, 'UUID')}>
            {card.uuid}
          </button>
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">来源类型</span>
        <span class="info-value">{sourceKindLabel}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">所属专题</span>
        <span class="info-value">{deckName}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">调度状态</span>
        <span class="info-value">
          <span class="status-badge">{scheduleStatusLabel}</span>
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">创建时间</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.created)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">最后更新</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.modified)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">优先级</span>
        <span class="info-value">
          {#if priorityValue !== null}
            <span class="priority-badge">P{priorityValue}</span>
          {:else}
            <span class="text-muted">未知</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">星标</span>
        <span class="info-value">{isFavorite ? '已标星' : '未标星'}</span>
      </div>
    </div>
  </section>

  <section class="info-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-orange" class:mobile={isMobile}>
      溯源信息
    </h3>

    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">源文档</span>
        <span class="info-value action-row">
          {#if sourceDocumentPath}
            <button class="link-button" onclick={() => openVaultPath(sourceDocumentPath)}>
              {sourceDocumentPath}
            </button>
            <button class="inline-action" onclick={() => copyText(sourceDocumentPath, '源文档路径')}>
              复制路径
            </button>
          {:else}
            <span class="text-muted">无</span>
          {/if}
        </span>
      </div>

      {#if hasResumeTarget}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">恢复阅读</span>
          <span class="info-value action-row">
            <button class="inline-action inline-action-accent" onclick={openResumeTarget}>
              {resumeActionLabel}
            </button>
          </span>
        </div>
      {/if}

      {#if showReadingPointFile}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">阅读点文件</span>
          <span class="info-value action-row">
            <button class="link-button" onclick={() => openVaultPath(readingPointFilePath)}>
              {readingPointFilePath}
            </button>
          </span>
        </div>
      {/if}

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">文档名</span>
        <span class="info-value">
          {#if sourceDocumentPath}
            {getFileName(sourceDocumentPath)}
          {:else}
            <span class="text-muted">无</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">子定位</span>
        <span class="info-value">
          {#if sourceSubunit}
            <span class="mono-text">{sourceSubunit}</span>
          {:else}
            <span class="text-muted">无</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">标签组</span>
        <span class="info-value">{tagGroup}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">主关联笔记</span>
        <span class="info-value action-row">
          {#if primaryAssociatedNotePath}
            <button class="link-button" onclick={() => openVaultPath(primaryAssociatedNotePath)}>
              {primaryAssociatedNotePath}
            </button>
          {:else}
            <span class="text-muted">无</span>
          {/if}
        </span>
      </div>
    </div>
  </section>

  {#if associatedNotePaths.length > 0}
    <section class="info-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-cyan" class:mobile={isMobile}>
        关联 md 笔记
      </h3>

      <div class="link-list">
        {#each associatedNotePaths as notePath}
          <div class="link-list-item" class:mobile={isMobile}>
            <button class="link-button" onclick={() => openVaultPath(notePath)}>
              {notePath}
            </button>
            <button class="inline-action" onclick={() => copyText(notePath, '笔记路径')}>
              复制路径
            </button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if hasTags}
    <section class="info-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-purple" class:mobile={isMobile}>
        已应用标签
      </h3>

      <div class="tags-container">
        {#each card.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .ir-card-info-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
  }

  .info-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
  }

  .section-title {
    display: flex;
    align-items: center;
    position: relative;
    padding-left: 16px;
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-4);
    line-height: 1.4;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 2px;
  }

  .section-title.accent-red::before {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.6));
  }

  .section-title.accent-orange::before {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.8), rgba(234, 88, 12, 0.6));
  }

  .section-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  .section-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .info-grid {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-3);
  }

  .info-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: var(--size-4-3);
    align-items: start;
  }

  .info-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: 500;
  }

  .info-value {
    font-size: var(--font-ui-medium);
    color: var(--text-normal);
    word-break: break-word;
    text-align: right;
  }

  .action-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .pill-button,
  .link-button,
  .inline-action {
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-normal);
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .pill-button {
    padding: 6px 10px;
    font-size: var(--font-ui-small);
    word-break: break-all;
    text-align: left;
  }

  .link-button {
    padding: 6px 10px;
    font-size: var(--font-ui-small);
    color: var(--text-accent);
    word-break: break-all;
    text-align: left;
  }

  .inline-action {
    padding: 4px 8px;
    font-size: var(--font-ui-smaller);
    white-space: nowrap;
  }

  .inline-action-accent {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .pill-button:hover,
  .link-button:hover,
  .inline-action:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .inline-action-accent:hover {
    background: var(--interactive-accent-hover);
    border-color: var(--interactive-accent-hover);
  }

  .status-badge,
  .priority-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
  }

  .mono-text {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-small);
  }

  .text-muted {
    color: var(--text-muted);
  }

  .link-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .link-list-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    font-size: var(--font-ui-small);
    color: var(--text-normal);
  }

  @media (max-width: 768px) {
    .info-row {
      grid-template-columns: 100px 1fr;
    }
  }

  .ir-card-info-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  .info-section.mobile {
    padding: 12px;
  }

  .section-title.mobile {
    font-size: 14px;
    margin-bottom: 12px;
    padding-left: 12px;
    line-height: 1.2;
  }

  .section-title.mobile.with-accent-bar::before {
    height: 14px;
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
  }

  .info-grid.mobile {
    gap: 0;
  }

  .info-row.mobile {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--background-modifier-border-hover);
  }

  .info-row.mobile:last-child {
    border-bottom: none;
  }

  .info-row.mobile .info-label {
    flex-shrink: 0;
    font-size: 13px;
  }

  .info-row.mobile .info-value {
    flex: 1;
    text-align: right;
    font-size: 13px;
  }
</style>
