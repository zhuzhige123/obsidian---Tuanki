<script lang="ts">
  import { normalizePath } from "obsidian";
  import type { Card } from "../../data/types";
  import type { WeavePlugin } from "../../main";
  import { getCardMetadataService } from "../../services/CardMetadataService";
  import type { ReadingMaterial } from "../../types/incremental-reading-types";
  import { logger } from "../../utils/logger";
  import { normalizePathForComparison } from "../../utils/source-path-matcher";
  import { tr } from '../../utils/i18n';
  import { parseEpubSourceInfo, parseSourceInfo } from "../../utils/yaml-utils";

  interface Props {
    card: Card;
    plugin: WeavePlugin;
    studyQueue: Card[];
    onOpenSource?: () => void;
  }

  let { card, plugin, studyQueue, onOpenSource }: Props = $props();

  let t = $derived($tr);

  const metadataService = getCardMetadataService();

  /**
   * 从 source 字符串中提取纯文件名和 blockId
   * source 可能的格式：
   *  - "filename#^blockId"
   *  - "path/to/filename.md#^blockId"
   *  - "filename"
   *  - "path/to/filename.md"
   */
  function parseSource(source: string | undefined): { fileName: string; blockId: string | null } | null {
    if (!source) return null;
    let filePart = source;
    let blockId: string | null = null;

    // 提取 #^blockId
    const blockMatch = source.match(/#\^(.+)$/);
    if (blockMatch) {
      blockId = blockMatch[1];
      filePart = source.slice(0, blockMatch.index);
    }

    // 去掉路径前缀和 .md 后缀
    const fileName = filePart.replace(/^.*[\\/]/, '').replace(/\.md$/, '');
    return fileName ? { fileName, blockId } : null;
  }

  function formatEpubLocationSummary(_text: string | undefined, chapter: number | undefined): string | null {
    if (chapter !== undefined) {
      return `章节 ${chapter}`;
    }
    return null;
  }

  // -- 解析当前卡片的源文件信息 --
  let sourceParsed = $derived.by(() => {
    const content = card?.content || '';
    const epubSource = parseEpubSourceInfo(content);
    if (epubSource.sourceFile) {
      const fileName = epubSource.sourceFile.replace(/^.*[\\/]/, '').replace(/\.epub$/i, '');
      const locationLabel = formatEpubLocationSummary(epubSource.text, epubSource.chapter);
      return {
        fileName,
        blockId: null,
        isEpub: true,
        locationLabel,
        sourcePath: epubSource.sourceFile,
        displayName: locationLabel || fileName,
      };
    }

    const raw = metadataService.getCardSource(card);
    const parsed = parseSource(raw);
    if (!parsed) return null;
    return {
      ...parsed,
      isEpub: false,
      locationLabel: null,
      sourcePath: raw,
      displayName: parsed.fileName,
    };
  });

  let sourceDocName = $derived(sourceParsed?.displayName || sourceParsed?.fileName || null);
  let sourceLocationLabel = $derived(sourceParsed?.locationLabel || null);

  function hasExplicitExtension(path: string): boolean {
    return /\.[^/.]+$/i.test(path);
  }

  function normalizeMarkdownPath(path: string | undefined): string | null {
    if (!path) return null;
    const normalized = normalizePath(path.trim());
    if (!normalized) {
      return null;
    }

    if (!normalized.toLowerCase().endsWith('.md') && hasExplicitExtension(normalized)) {
      return null;
    }

    return normalized;
  }

  function normalizeMarkdownNoteKey(path: string | undefined): string | null {
    const normalized = normalizeMarkdownPath(path);
    if (!normalized) {
      return null;
    }

    return normalizePathForComparison(normalized) || null;
  }

  let sourceMarkdownKey = $derived.by(() => {
    const parsed = parseSourceInfo(card.content || '');
    return normalizeMarkdownNoteKey(parsed.sourceFile || card.sourceFile);
  });

  // -- 最小标题（从 Obsidian metadataCache 获取）--
  let smallestHeading = $derived.by(() => {
    if (!sourceParsed) return null;

    if (sourceParsed.isEpub) {
      return sourceParsed.locationLabel || null;
    }

    try {
      const app = plugin.app;
      const tFile = app.metadataCache.getFirstLinkpathDest(sourceParsed.fileName, '');
      if (!tFile) return null;

      const cache = app.metadataCache.getFileCache(tFile);
      if (!cache?.headings || cache.headings.length === 0) return null;

      // 优先从解析的 source 中获取 blockId，其次从 card.sourceBlock 获取
      const blockId = sourceParsed.blockId 
        || (card as any).sourceBlock?.replace(/^\^/, '') 
        || null;

      if (!blockId || !cache.sections) {
        return cache.headings[0]?.heading || null;
      }

      // 查找 blockId 对应的 section
      const targetSection = cache.sections.find((s: any) => s.id === blockId);
      if (!targetSection) {
        // blockId 可能在 blocks 中
        const blockRef = cache.blocks?.[blockId];
        if (!blockRef) {
          return cache.headings[0]?.heading || null;
        }
        // 使用 block reference 的行号
        return findNearestHeading(cache.headings, blockRef.position.start.line);
      }

      return findNearestHeading(cache.headings, targetSection.position.start.line);
    } catch (e) {
      logger.debug('[SourceInfoBar] 获取标题失败:', e);
      return null;
    }
  });

  /**
   * 找到指定行号之前最近的标题
   */
  function findNearestHeading(headings: any[], targetLine: number): string | null {
    let bestHeading: string | null = null;
    let bestLine = -1;

    for (const h of headings) {
      const hLine = h.position.start.line;
      if (hLine <= targetLine && hLine > bestLine) {
        bestLine = hLine;
        bestHeading = h.heading;
      }
    }
    return bestHeading;
  }

  /**
   * 仅提取源文件名（不含 blockId），用于同源比较
   */
  function normalizeSourceForComparison(source: string | undefined): string | null {
    if (!source) return null;
    return source
      .replace(/#\^.+$/, '')
      .replace(/#weave-loc=.*$/, '')
      .replace(/#weave-cfi=.*$/, '')
      .replace(/^.*[\\/]/, '')
      .replace(/\.(md|epub)$/i, '')
      .toLowerCase();
  }

  // -- 同源卡片数量 --
  let siblingCount = $derived.by(() => {
    const currentNorm = normalizeSourceForComparison(metadataService.getCardSource(card));
    if (!currentNorm) return 0;

    let count = 0;
    for (const c of studyQueue) {
      const norm = normalizeSourceForComparison(metadataService.getCardSource(c));
      if (norm === currentNorm) {
        count++;
      }
    }
    return count;
  });

  let linkedReadingMaterials = $derived.by(() => {
    const notePath = sourceMarkdownKey;
    const manager = plugin.readingMaterialManager;
    if (!notePath || !manager?.getAllMaterials) {
      return [] as ReadingMaterial[];
    }

    return manager
      .getAllMaterials()
      .filter((material) => normalizeMarkdownNoteKey(material.associatedNotePath) === notePath);
  });

  let linkedReadingCount = $derived(linkedReadingMaterials.length);

  let linkedReadingPreview = $derived.by(() => {
    if (linkedReadingMaterials.length === 0) {
      return null;
    }

    const labels = linkedReadingMaterials
      .slice(0, 2)
      .map((material) => material.title || material.filePath.replace(/^.*[\\/]/, ''));
    const remaining = linkedReadingMaterials.length - labels.length;
    return remaining > 0 ? `${labels.join(' / ')} +${remaining}` : labels.join(' / ');
  });

  let linkedReadingTooltip = $derived.by(() => {
    if (linkedReadingMaterials.length === 0) {
      return t('study.sourceInfo.noLinkedIrMaterials');
    }

    return linkedReadingMaterials
      .map((material, index) => `${index + 1}. ${material.title || material.filePath}`)
      .join('\n');
  });

  function handleSourceClick() {
    if (onOpenSource && sourceDocName) {
      onOpenSource();
    }
  }

  function handleSourceKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSourceClick();
    }
  }
</script>

<div class="source-info-cards">
  <div class="stat-card linked-reading-card" title={linkedReadingTooltip}>
    <div class="stat-header">
      <span class="stat-title">{t('study.sourceInfo.linkedIrMaterials')}</span>
      <span class="stat-status">{t('study.sourceInfo.linkedByNote')}</span>
    </div>
    <div class="stat-content">
      <span class="stat-value">{linkedReadingCount}<span class="stat-unit">{t('study.sourceInfo.unitMaterials')}</span></span>
      {#if linkedReadingPreview}
        <span class="source-heading">{linkedReadingPreview}</span>
      {/if}
    </div>
  </div>

  <!-- 来源文档 -->
  <div
    class="stat-card source-card"
    class:clickable={!!sourceDocName}
    onclick={handleSourceClick}
    onkeydown={handleSourceKeydown}
    role="button"
    tabindex="0"
    title={metadataService.getCardSource(card) || ''}
  >
    <div class="stat-header">
      <span class="stat-title">{t('study.sourceInfo.sourceDoc')}</span>
    </div>
    <div class="stat-content">
      <span class="stat-value source-doc-name">{sourceDocName || '--'}</span>
      {#if !sourceParsed?.isEpub && sourceLocationLabel}
        <span class="source-heading">{sourceLocationLabel}</span>
      {:else if smallestHeading}
        <span class="source-heading">{smallestHeading}</span>
      {/if}
    </div>
  </div>

  <!-- 同源卡片 -->
  <div class="stat-card sibling-card">
    <div class="stat-header">
      <span class="stat-title">{t('study.sourceInfo.siblingCards')}</span>
      <span class="stat-status">{t('study.sourceInfo.thisSession')}</span>
    </div>
    <div class="stat-content">
      <span class="stat-value">{siblingCount}<span class="stat-unit">{t('study.sourceInfo.unitCards')}</span></span>
    </div>
  </div>
</div>

<style>
  .source-info-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin: 0 1.5rem 0.375rem 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  .stat-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .stat-card:hover {
    box-shadow: 0 8px 20px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.05);
    border-color: color-mix(in srgb, var(--background-modifier-border) 70%, var(--text-accent) 30%);
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--text-accent), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 2;
    pointer-events: none;
  }

  .stat-card:hover::before {
    opacity: 1;
  }

  .stat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    position: relative;
    z-index: 1;
  }

  .stat-title {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    position: relative;
    z-index: 1;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-normal);
    line-height: 1.1;
    letter-spacing: -0.025em;
  }

  .stat-unit {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 600;
    margin-left: 0.25rem;
  }

  .stat-status {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--text-muted) 8%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60%;
  }

  /* 来源文档卡片 - 可点击样式 */
  .source-card.clickable {
    cursor: pointer;
  }

  .source-doc-name {
    font-size: 1rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .source-heading {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    margin-top: 0.25rem;
  }

  /* 动画效果 */
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ==================== Obsidian 移动端适配 ==================== */

  :global(body.is-phone) .source-info-cards {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 0.375rem;
    margin: 0 0.5rem 0.25rem 0.5rem;
    padding: 0.375rem 0;
    animation: none;
    background: color-mix(in srgb, var(--background-secondary) 50%, var(--background-primary) 50%);
    border-radius: 0.625rem;
  }

  :global(body.is-phone) .stat-card {
    flex: 1 1 0;
    min-width: 0;
    padding: 0.375rem 0.5rem;
    border-radius: 0.5rem;
    background: transparent;
    border: none;
    transition: background 0.15s ease;
  }

  :global(body.is-phone) .stat-card:active {
    background: color-mix(in srgb, var(--background-modifier-hover) 80%, transparent);
  }

  :global(body.is-phone) .stat-card::before {
    display: none;
  }

  :global(body.is-phone) .stat-header {
    margin-bottom: 0.125rem;
    gap: 0;
    justify-content: center;
  }

  :global(body.is-phone) .stat-title {
    font-size: 0.5625rem;
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-muted);
    opacity: 0.8;
  }

  :global(body.is-phone) .stat-content {
    gap: 0;
    align-items: center;
    justify-content: center;
  }

  :global(body.is-phone) .stat-value {
    font-size: 0.875rem;
    font-weight: 700;
    text-align: center;
    color: var(--text-normal);
  }

  :global(body.is-phone) .source-doc-name {
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  :global(body.is-phone) .stat-unit {
    font-size: 0.5625rem;
    margin-left: 0.0625rem;
    opacity: 0.7;
  }

  :global(body.is-phone) .stat-status {
    display: none;
  }

  /* 平板端 */
  :global(body.is-tablet) .source-info-cards {
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin: 0 1rem 0.5rem 1rem;
  }

  :global(body.is-tablet) .stat-card {
    padding: 0.75rem;
  }

  :global(body.is-tablet) .stat-value {
    font-size: 1.25rem;
  }
</style>
