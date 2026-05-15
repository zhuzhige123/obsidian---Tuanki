<!--
  MaterialImportModal - 阅读材料批量导入模态窗
  
  重构版本 v4.0.0
  - 使用 ResizableModal 统一窗口定位和样式
  - 多彩侧边颜色条标识
  - 优化的多步骤流程（选择 → 拆分方式 → 配置/预览 → 导入）
  - 改进的空状态处理
  
  @module components/incremental-reading/MaterialImportModal
  @version 4.0.0
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { TFolder, TFile, Notice, normalizePath, Menu, Setting } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import { logger } from '../../utils/logger';
  import { getReadingMaterialDueAt } from '../../utils/ir-topic-compat';
  import { resolveIRImportFolder } from '../../config/paths';
  import { VaultFolderSuggestModal } from '../../modals/VaultFolderSuggestModal';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import type { BatchImportResult } from '../../services/incremental-reading/ReadingMaterialManager';
  import { getServices } from './IRDeckView.svelte';
  import type { IRDeck, IRChunkFileData } from '../../types/ir-types';
  
  import type { ImportStep, RuleSplitConfig as RuleSplitConfigType, ContentBlock } from '../../types/content-split-types';
  import { DEFAULT_RULE_SPLIT_CONFIG } from '../../types/content-split-types';
  import { splitByRules } from '../../utils/content-split-utils';
  import { IRPointWriteService } from '../../services/incremental-reading/IRPointWriteService';
  import { IRTagGroupService } from '../../services/incremental-reading/IRTagGroupService';
  import { IRPdfBookmarkTaskService } from '../../services/incremental-reading/IRPdfBookmarkTaskService';
  import { IREpubBookmarkTaskService } from '../../services/incremental-reading/IREpubBookmarkTaskService';
  import { IRV4SchedulerService } from '../../services/incremental-reading/IRV4SchedulerService';
  import { createEpubReaderEngine } from '../../services/epub';
  import { reportEpubError } from '../../services/epub/epub-error';
  import { EpubStorageService } from '../../services/epub/EpubStorageService';
  import type { TocItem } from '../../services/epub/types';
  import type { SchedulingConfig, SchedulingImpact } from '../../types/ir-import-scheduling';
  import { DEFAULT_SCHEDULING_CONFIG, SCHEDULING_PRESETS } from '../../types/ir-import-scheduling';
  import { IRImportSchedulingService, type IRLoadInfo } from '../../services/incremental-reading/IRImportSchedulingService';
  import { getProjectedDayLoad, getProjectedScheduleSummary } from '../../services/incremental-reading/IRProjectedScheduleSummary';
  import { recomputeAndBroadcastIRData } from '../../services/incremental-reading/IRScheduleRefreshService';
  import {
    normalizeIRReadableMarkdownFolderPath,
    resolveIRReadableMarkdownTargetFolder
  } from '../../services/incremental-reading/IRReadableMarkdownPathResolver';
  import { extractBodyContent } from '../../utils/yaml-utils';
  import { ReadingCategory } from '../../types/incremental-reading-types';
  import { createDefaultChunkFileData, generateChunkId, generateSourceId } from '../../types/ir-types';
  import { getPdfOutlineForFile } from '../../utils/pdf-outline';

  interface Props {
    plugin: WeavePlugin;
    open: boolean;
    useObsidianModal?: boolean;
    onClose: () => void;
    onImportComplete: (result: BatchImportResult) => void;
  }

  async function handlePdfBookmarkTaskImport(): Promise<void> {
    if (!selectedDeckId) return;

    importing = true;
    importProgress = { current: 0, total: contentBlocks.length };

    try {
      await services.init();

      const pointWriteService = new IRPointWriteService(plugin.app);
      const pdfService = new IRPdfBookmarkTaskService(plugin.app);
      await pdfService.initialize();
      const scheduler = new IRV4SchedulerService(plugin.app);
      await scheduler.initialize();
      const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
      const deckIdentifiers = [selectedDeckId, selectedDeck?.path].filter(
        (value): value is string => Boolean(value && value.trim())
      );

      let assignments: Map<ContentBlock, Date> | null = null;
      if (contentBlocks.length > 0) {
        const schedulingResult = await calculateProjectedScheduling(
          contentBlocks,
          (block) => estimateContentBlockMinutes(block, 200)
        );
        schedulingImpact = schedulingResult.impact;
        assignments = schedulingResult.assignments;
      }
      const sequenceMetaByBlock = buildContentBlockSequenceMetaMap(
        contentBlocks,
        (block) => `pdf:${normalizePath(String((block as any)?.sourceFilePath || '').trim())}`,
        assignments
      );

      const existing = await pdfService.getTasksByDeckIdentifiers(deckIdentifiers);
      const existingKeys = new Set<string>();
      for (const t of existing) {
        const link = String((t as any)?.link || '').trim();
        const pdfPath = String((t as any)?.pdfPath || '').trim();
        const m = link.match(/\bpage=(\d+)\b/i);
        const pageNumber = m ? Number(m[1]) : 0;
        if (pdfPath && pageNumber > 0) {
          existingKeys.add(`${pdfPath}#${pageNumber}`);
        }
        if (link) {
          existingKeys.add(link);
        }
      }

      let success = 0;
      let skipped = 0;
      const errors: Array<{ path: string; error: string }> = [];

      for (let i = 0; i < contentBlocks.length; i++) {
        const block = contentBlocks[i];
        importProgress = { current: i + 1, total: contentBlocks.length };

        const pdfPath = String(block.sourceFilePath || '').trim();
        if (!pdfPath) continue;

        // 剥离 wikilink 语法：[[path#subpath|alias]] → path#subpath
        const rawContent = String(block.content || '').trim();
        const linkText = rawContent.replace(/^!?\[\[/, '').replace(/\]\]$/, '').split('|')[0];
        const pageNumber = (block as any).pdfPageNumber ? Number((block as any).pdfPageNumber) : 0;
        const key = pageNumber > 0 ? `${pdfPath}#${pageNumber}` : linkText;
        if (existingKeys.has(key) || existingKeys.has(linkText)) {
          skipped++;
          continue;
        }

        try {
          const sequenceMeta = sequenceMetaByBlock.get(block as any);
          const created = await pointWriteService.createPdfPoint({
            deckId: selectedDeckId,
            pdfPath,
            title: block.title || 'PDF',
            link: linkText,
            priorityUi: 5,
            sourceSequenceGroup: sequenceMeta?.sourceSequenceGroup,
            sourceSequenceOrder: sequenceMeta?.sourceSequenceOrder,
            sourceSequenceLocked: sequenceMeta?.sourceSequenceLocked,
            sourceSequenceAnchorDateKey: sequenceMeta?.sourceSequenceAnchorDateKey
          });

          const assignedDate = assignments?.get(block as any);
          if (assignedDate) {
            await scheduler.manualRescheduleBlockWithPreviewV4(
              pdfService.toBlockV4(created),
              {
                nextRepDate: assignedDate.getTime(),
                intervalDays: 1,
                scheduleStatus: 'queued'
              },
              selectedDeckId
            );
          }

          existingKeys.add(key);
          existingKeys.add(linkText);
          success++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : '未知错误';
          errors.push({ path: pdfPath, error: msg });
        }
      }

      await finalizeImport({ success, skipped, errors });
    } catch (error) {
      logger.error('[MaterialImportModal] PDF 书签任务导入失败:', error);
      new Notice(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      importing = false;
    }
  }

  let {
    plugin,
    open = $bindable(),
    useObsidianModal = false,
    onClose,
    onImportComplete
  }: Props = $props();

  async function finalizeImport(result: BatchImportResult): Promise<void> {
    if (result.success > 0) {
      await recomputeAndBroadcastIRData(plugin.app, 'import_materials');
    }

    onImportComplete(result);
    onClose();
  }

  interface TreeNode {
    name: string;
    path: string;
    type: 'folder' | 'file';
    children: TreeNode[];
    childrenLoaded: boolean;
    hasChildren: boolean;
    expanded: boolean;
    selected: boolean;
    indeterminate: boolean;
    fileCount: number | null;
  }

  type WholeFileImportMode = 'reference' | 'copy';
  type InitialImportOrderingMode = 'preserve-source-order' | 'pure-scheduling';

  const IMPORTABLE_EXTENSIONS = new Set(['md', 'pdf', 'epub']);
  let treeData = $state<TreeNode[]>([]);
  let searchFullTreeReady = $state(false);
  let searchQuery = $state('');
  let showContent = $state(false);
  let importing = $state(false);
  let importProgress = $state({ current: 0, total: 0 });
  
  let currentStep = $state<ImportStep>('select');
  let ruleSplitConfig = $state<RuleSplitConfigType>({ ...DEFAULT_RULE_SPLIT_CONFIG });
  let fileContent = $state('');

  interface ImportContentBlock extends ContentBlock {
    sourceFilePath?: string;
    pdfPageNumber?: number;
    epubTocHref?: string;
    epubTocLevel?: number;
    epubSourceId?: string;
    epubBookTitle?: string;
    outlineLevel?: number;
    outlineLabel?: string;
    outlinePath?: string[];
    fallbackWholeFile?: boolean;
  }

  interface OutlineSelectionItem {
    id: string;
    type: 'pdf' | 'epub';
    label: string;
    path: string[];
    level: number;
    filePath: string;
    bookTitle: string;
    pageNumber?: number;
    href?: string;
    sourceId?: string;
    fallbackWholeFile?: boolean;
  }

  let contentBlocks = $state<ImportContentBlock[]>([]);
  let selectedFilePath = $state<string | null>(null);
  let selectedFilePaths = $state<string[]>([]);
  let markdownImportFolder = $state('');
  let appendSourceDocumentBacklinkOnSplitImport = $state(false);
  let wholeFileImportMode = $state<WholeFileImportMode>('reference');
  let splitSourceBacklinkSettingHost = $state<HTMLDivElement | null>(null);
  
  let previewIndex = $state(0);
  let initialized = $state(false);
  
  // 牌组选择相关状态
  let availableDecks = $state<IRDeck[]>([]);
  let selectedDeckId = $state<string | null>(null);
  let showNewDeckInput = $state(false);
  let newDeckName = $state('');
  let creatingDeck = $state(false);
  const services = untrack(() => getServices(plugin.app, plugin.settings?.incrementalReading?.importFolder));
  
  let irTagGroupService: IRTagGroupService | null = $state(null);
  
  // 时间分散调度相关状态
  let schedulingConfig = $state<SchedulingConfig>({ ...DEFAULT_SCHEDULING_CONFIG });
  let schedulingImpact = $state<SchedulingImpact | null>(null);
  let showSchedulingDetails = $state(false);
  let useCustomDays = $state(false);
  let customDaysValue = $state(21);
  let initialImportOrderingMode = $state<InitialImportOrderingMode>('preserve-source-order');

  let isPdfImportMode = $state(false);
  let isEpubImportMode = $state(false);
  let previewTagGroupName = $state('');

  // 目录选择状态（PDF / EPUB 统一）
  let outlineAllItems = $state<OutlineSelectionItem[]>([]);
  let outlineVisibleItems = $state<OutlineSelectionItem[]>([]);
  let outlineSelectedIds = $state<Set<string>>(new Set());
  let outlineAvailableLevels = $state<number[]>([]);
  let outlineSelectedLevels = $state<number[]>([]);
  let outlineSelectionInitialized = $state(false);
  let loadingOutline = $state(false);

  function getSchedulingDailyBudgetMinutes(): number {
    return plugin.settings.incrementalReading?.dailyTimeBudgetMinutes || 60;
  }

  function estimateContentBlockMinutes(block: ContentBlock, fallbackChars = 500): number {
    const explicitCharCount = Number((block as any)?.charCount || 0);
    const contentLength = typeof block?.content === 'string' ? block.content.length : 0;
    const charCount = contentLength > 0 ? contentLength : explicitCharCount > 0 ? explicitCharCount : fallbackChars;
    return Math.max(1, Math.ceil(charCount / 500));
  }

  function formatLocalDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function shouldPreserveImportedSourceSequence(): boolean {
    return initialImportOrderingMode === 'preserve-source-order';
  }

  function shouldShowInitialImportOrderingSelector(): boolean {
    return contentBlocks.length > 1;
  }

  interface SourceSequenceMeta {
    sourceSequenceGroup: string;
    sourceSequenceOrder: number;
    sourceSequenceLocked: boolean;
    sourceSequenceAnchorDateKey: string;
  }

  function buildSourceSequenceMeta(
    sourceSequenceGroup: string,
    sourceSequenceOrder: number,
    nextRepDate?: number | null
  ): SourceSequenceMeta | undefined {
    if (!shouldPreserveImportedSourceSequence()) {
      return undefined;
    }

    const normalizedGroup = String(sourceSequenceGroup || '').trim();
    if (!normalizedGroup || sourceSequenceOrder <= 0) {
      return undefined;
    }

    const anchorDate = typeof nextRepDate === 'number' && nextRepDate > 0 ? new Date(nextRepDate) : new Date();
    return {
      sourceSequenceGroup: normalizedGroup,
      sourceSequenceOrder,
      sourceSequenceLocked: true,
      sourceSequenceAnchorDateKey: formatLocalDateKey(anchorDate)
    };
  }

  function buildContentBlockSequenceMetaMap(
    blocks: ContentBlock[],
    resolveGroupKey: (block: ContentBlock) => string,
    assignments?: Map<ContentBlock, Date> | null
  ): Map<ContentBlock, SourceSequenceMeta> {
    const result = new Map<ContentBlock, SourceSequenceMeta>();
    if (!shouldPreserveImportedSourceSequence()) {
      return result;
    }

    const orderByGroup = new Map<string, number>();
    for (const block of blocks) {
      const rawGroupKey = String(resolveGroupKey(block) || '').trim();
      if (!rawGroupKey) {
        continue;
      }
      const nextOrder = (orderByGroup.get(rawGroupKey) || 0) + 1;
      orderByGroup.set(rawGroupKey, nextOrder);
      const assignedDate = assignments?.get(block);
      const sequenceMeta = buildSourceSequenceMeta(rawGroupKey, nextOrder, assignedDate?.getTime());
      if (sequenceMeta) {
        result.set(block, sequenceMeta);
      }
    }

    return result;
  }

  function resolveExistingLoadMinutes(
    block: any,
    fallbackEstimator: (block: ContentBlock) => number
  ): number {
    const projectedMinutes = Number(block?.estimatedMinutes);
    if (Number.isFinite(projectedMinutes) && projectedMinutes > 0) {
      return projectedMinutes;
    }
    return fallbackEstimator(block as ContentBlock);
  }

  async function createProjectedImportLoadInfo(
    fallbackEstimator: (block: ContentBlock) => number
  ): Promise<IRLoadInfo> {
    if (!selectedDeckId) {
      throw new Error('[MaterialImportModal] 未选择专题，无法生成导入负载信息');
    }

    const summary = await getProjectedScheduleSummary(plugin.app, {
      deckIds: [selectedDeckId],
      horizonDays: Math.max(1, schedulingConfig.distributionDays || 1)
    });

    return {
      dailyBudgetMinutes: getSchedulingDailyBudgetMinutes(),
      getBlocksForDate: async (date: Date) => getProjectedDayLoad(summary, date).items,
      estimateBlockMinutes: (block: any) => resolveExistingLoadMinutes(block, fallbackEstimator)
    };
  }

  async function calculateProjectedScheduling(
    blocks: ContentBlock[],
    fallbackEstimator: (block: ContentBlock) => number
  ): Promise<{ impact: SchedulingImpact; assignments: Map<ContentBlock, Date> }> {
    const loadInfo = await createProjectedImportLoadInfo(fallbackEstimator);
    const schedulingService = new IRImportSchedulingService(loadInfo);
    const impact = await schedulingService.calculateScheduling(blocks, schedulingConfig);
    const assignments = schedulingService.applyScheduling(blocks, impact);
    return { impact, assignments };
  }

  const selectedCount = $derived.by(() => countSelectedFiles(treeData));
  
  const modalTitle = $derived.by(() => {
    switch (currentStep) {
      case 'select': return '导入阅读材料';
      case 'split-mode': return isPdfImportMode || isEpubImportMode ? '选择目录项' : '选择拆分方式';
      case 'configure': return '配置拆分规则';
      case 'preview': return isPdfImportMode ? '确认导入 PDF 材料' : isEpubImportMode ? '确认导入 EPUB 材料' : '预览拆分结果';
      default: return '导入阅读材料';
    }
  });
  
  const filteredTreeData = $derived.by(() => {
    if (!searchQuery.trim()) return treeData;
    return filterTree(treeData, searchQuery.toLowerCase());
  });

  const isMultiFileMode = $derived(selectedFilePaths.length > 1);
  const visibleOutlineCount = $derived.by(() => outlineVisibleItems.length);
  const selectedOutlineCount = $derived.by(() => outlineSelectedIds.size);
  const allVisibleOutlineSelected = $derived.by(() =>
    outlineVisibleItems.length > 0 && outlineVisibleItems.every((item) => outlineSelectedIds.has(item.id))
  );

  function getOutlineUnitLabel(): string {
    return isPdfImportMode ? '书签' : '章节';
  }

  function getOutlineStepTitle(): string {
    return isPdfImportMode ? 'PDF 目录选择' : 'EPUB 目录选择';
  }

  function buildOutlineDisplayTitle(item: OutlineSelectionItem): string {
    const titlePath = item.path.length > 0 ? item.path.join(' / ') : item.label;
    if (isMultiFileMode && item.bookTitle && titlePath !== item.bookTitle) {
      return `${item.bookTitle} / ${titlePath}`;
    }
    return titlePath || item.bookTitle || item.label;
  }

  function initializeOutlineSelection(items: OutlineSelectionItem[]): void {
    const levels = Array.from(new Set(items.map((item) => item.level).filter((level) => level > 0))).sort((a, b) => a - b);
    outlineAllItems = items;
    outlineAvailableLevels = levels;
    outlineSelectedLevels = [...levels];
    outlineVisibleItems = [];
    outlineSelectedIds = new Set();
    outlineSelectionInitialized = false;
    refreshOutlineVisibleItems();
  }

  function refreshOutlineVisibleItems(): void {
    const activeLevels = new Set(outlineSelectedLevels);
    const nextItems = outlineAllItems.filter((item) => activeLevels.has(item.level));
    const previousSelection = new Set(outlineSelectedIds);
    outlineVisibleItems = nextItems;

    if (!outlineSelectionInitialized) {
      outlineSelectedIds = new Set(nextItems.map((item) => item.id));
      outlineSelectionInitialized = true;
      return;
    }

    outlineSelectedIds = new Set(nextItems.filter((item) => previousSelection.has(item.id)).map((item) => item.id));
  }

  function toggleOutlineLevel(level: number): void {
    outlineSelectedLevels = outlineSelectedLevels.includes(level)
      ? outlineSelectedLevels.filter((itemLevel) => itemLevel !== level)
      : [...outlineSelectedLevels, level].sort((a, b) => a - b);
    refreshOutlineVisibleItems();
  }

  function toggleOutlineItem(id: string): void {
    const next = new Set(outlineSelectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    outlineSelectedIds = next;
    outlineSelectionInitialized = true;
  }

  function selectAllVisibleOutlineItems(): void {
    outlineSelectedIds = new Set(outlineVisibleItems.map((item) => item.id));
    outlineSelectionInitialized = true;
  }

  function clearVisibleOutlineItems(): void {
    outlineSelectedIds = new Set();
    outlineSelectionInitialized = true;
  }
  
  // 计算调度影响
  $effect(() => {
    if (currentStep === 'preview' && contentBlocks.length > 0 && selectedDeckId) {
      calculateSchedulingImpact();
    }
  });
  
  // 当调度配置改变时重新计算
  $effect(() => {
    if (currentStep === 'preview' && contentBlocks.length > 0 && selectedDeckId && schedulingImpact) {
      // 配置变化时重新计算
      const config = schedulingConfig; // 触发响应式
      calculateSchedulingImpact();
    }
  });
  
  async function calculateSchedulingImpact() {
    if (!services.storageService || contentBlocks.length === 0) return;
    
    try {
      await services.init();
      const schedulingResult = await calculateProjectedScheduling(
        contentBlocks,
        (block) => estimateContentBlockMinutes(block, 500)
      );
      schedulingImpact = schedulingResult.impact;
    } catch (error) {
      logger.error('[MaterialImportModal] 计算调度影响失败:', error);
    }
  }

  function getExcludedImportFolderPath(): string {
    return normalizePath(
      resolveIRImportFolder(
        plugin.settings?.incrementalReading?.importFolder,
        plugin.settings?.weaveParentFolder
      )
    );
  }

  function isImportableFile(file: TFile): boolean {
    return IMPORTABLE_EXTENSIONS.has(file.extension) && !file.name.startsWith('.');
  }

  function shouldSkipTreeFolder(folder: TFolder): boolean {
    if (folder.path && folder.name.startsWith('.')) {
      return true;
    }

    const excludedImportFolder = getExcludedImportFolderPath();
    const normalizedFolderPath = normalizePath(folder.path);
    return (
      normalizedFolderPath === excludedImportFolder
      || normalizedFolderPath.startsWith(`${excludedImportFolder}/`)
    );
  }

  const folderFileCountCache = new Map<string, number>();

  function hasDisplayableChildren(folder: TFolder): boolean {
    return folder.children.some((child) => {
      if (child instanceof TFolder) {
        return !shouldSkipTreeFolder(child);
      }
      return child instanceof TFile && isImportableFile(child);
    });
  }

  function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  function getLoadedTreeFileCount(nodes: TreeNode[]): number {
    return nodes.reduce((total, node) => {
      if (node.type === 'file') {
        return total + 1;
      }
      return total + (node.fileCount ?? 0);
    }, 0);
  }

  function createFileNode(file: TFile, selected = false): TreeNode {
    return {
      name: file.name,
      path: file.path,
      type: 'file',
      children: [],
      childrenLoaded: true,
      hasChildren: false,
      expanded: false,
      selected,
      indeterminate: false,
      fileCount: 1
    };
  }

  function createFolderNode(folder: TFolder, selected = false, deep = false): TreeNode {
    const children = deep ? buildTreeChildren(folder, selected, true) : [];
    return {
      name: folder.name || 'Vault',
      path: folder.path,
      type: 'folder',
      children,
      childrenLoaded: deep,
      hasChildren: hasDisplayableChildren(folder),
      expanded: false,
      selected,
      indeterminate: false,
      fileCount: deep ? getLoadedTreeFileCount(children) : null
    };
  }

  function buildTreeChildren(folder: TFolder, selected = false, deep = false): TreeNode[] {
    const children: TreeNode[] = [];

    for (const child of folder.children) {
      if (child instanceof TFolder) {
        if (shouldSkipTreeFolder(child) || !hasDisplayableChildren(child)) {
          continue;
        }
        children.push(createFolderNode(child, selected, deep));
      } else if (child instanceof TFile && isImportableFile(child)) {
        children.push(createFileNode(child, selected));
      }
    }

    return sortTreeNodes(children);
  }

  function buildFullTree(): TreeNode[] {
    return buildTreeChildren(plugin.app.vault.getRoot(), false, true);
  }

  function setNodeSelection(node: TreeNode, selected: boolean): void {
    node.selected = selected;
    node.indeterminate = false;

    if (node.type === 'folder' && node.childrenLoaded) {
      for (const child of node.children) {
        setNodeSelection(child, selected);
      }
    }
  }

  function toggleSelect(node: TreeNode): void {
    setNodeSelection(node, !node.selected || node.indeterminate);
    updateParentStates(treeData);
    treeData = [...treeData];
  }

  function setChildrenSelected(children: TreeNode[], selected: boolean): void {
    for (const child of children) {
      setNodeSelection(child, selected);
    }
  }

  function updateParentStates(nodes: TreeNode[]): void {
    for (const node of nodes) {
      if (node.type !== 'folder' || !node.childrenLoaded || node.children.length === 0) {
        continue;
      }

      updateParentStates(node.children);
      const selCount = node.children.filter((c) => c.selected).length;
      const indeterminateCount = node.children.filter((c) => c.indeterminate).length;
      const totalCount = node.children.length;

      if (selCount === totalCount && indeterminateCount === 0) {
        node.selected = true;
        node.indeterminate = false;
      } else if (selCount === 0 && indeterminateCount === 0) {
        node.selected = false;
        node.indeterminate = false;
      } else {
        node.selected = false;
        node.indeterminate = true;
      }
    }
  }

  function loadNodeChildren(node: TreeNode): void {
    if (node.type !== 'folder' || node.childrenLoaded) {
      return;
    }

    const folder = plugin.app.vault.getAbstractFileByPath(node.path);
    if (!(folder instanceof TFolder)) {
      node.childrenLoaded = true;
      node.hasChildren = false;
      node.children = [];
      return;
    }

    node.children = buildTreeChildren(folder, node.selected && !node.indeterminate, false);
    node.childrenLoaded = true;
    node.hasChildren = node.children.length > 0;
  }

  async function toggleExpand(node: TreeNode): Promise<void> {
    if (node.type !== 'folder') {
      return;
    }

    if (!node.childrenLoaded) {
      loadNodeChildren(node);
    }

    node.expanded = !node.expanded;
    treeData = [...treeData];
  }

  function findNodeByPath(nodes: TreeNode[], path: string): TreeNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.type === 'folder' && node.childrenLoaded && node.children.length > 0) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  function countSelectedFiles(nodes: TreeNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.type === 'file') {
        if (node.selected) {
          count++;
        }
        continue;
      }

      if (node.selected && !node.indeterminate) {
        count += getFolderFileCount(node.path);
        continue;
      }

      if (node.childrenLoaded) {
        count += countSelectedFiles(node.children);
      }
    }
    return count;
  }

  function collectImportableFilePathsFromFolder(folder: TFolder, paths: Set<string>): void {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        if (shouldSkipTreeFolder(child)) {
          continue;
        }
        collectImportableFilePathsFromFolder(child, paths);
      } else if (child instanceof TFile && isImportableFile(child)) {
        paths.add(child.path);
      }
    }
  }

  function getFolderFileCount(folderPath: string): number {
    const normalizedPath = normalizePath(folderPath);
    const cached = folderFileCountCache.get(normalizedPath);
    if (cached != null) {
      return cached;
    }

    const folder = plugin.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(folder instanceof TFolder)) {
      return 0;
    }

    let count = 0;
    const stack: TFolder[] = [folder];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      for (const child of current.children) {
        if (child instanceof TFolder) {
          if (!shouldSkipTreeFolder(child)) {
            stack.push(child);
          }
        } else if (child instanceof TFile && isImportableFile(child)) {
          count++;
        }
      }
    }

    folderFileCountCache.set(normalizedPath, count);
    return count;
  }

  function getSelectedPaths(nodes: TreeNode[]): string[] {
    const paths = new Set<string>();
    function collect(nodeList: TreeNode[]): void {
      for (const node of nodeList) {
        if (node.type === 'file') {
          if (node.selected) {
            paths.add(node.path);
          }
          continue;
        }

        if (node.selected && !node.indeterminate) {
          const folder = plugin.app.vault.getAbstractFileByPath(node.path);
          if (folder instanceof TFolder) {
            collectImportableFilePathsFromFolder(folder, paths);
          }
          continue;
        }

        if (node.childrenLoaded) {
          collect(node.children);
        }
      }
    }
    collect(nodes);
    return Array.from(paths);
  }

  function getExplicitlySelectedFilePaths(nodes: TreeNode[]): string[] {
    const paths: string[] = [];
    const collect = (nodeList: TreeNode[], parentSelected: boolean): void => {
      for (const node of nodeList) {
        const fullySelected = parentSelected || (node.type === 'folder' && node.selected && !node.indeterminate);
        if (node.type === 'file') {
          if (node.selected && !parentSelected) {
            paths.push(node.path);
          }
          continue;
        }

        if (fullySelected) {
          continue;
        }

        if (node.childrenLoaded) {
          collect(node.children, false);
        }
      }
    };

    collect(nodes, false);
    return paths;
  }

  function getSelectedRootFolderPaths(nodes: TreeNode[]): string[] {
    const paths: string[] = [];
    const walk = (nodeList: TreeNode[], parentSelected: boolean): void => {
      for (const node of nodeList) {
        const isFolder = node.type === 'folder';
        const isSelectedRootFolder = isFolder && node.selected && !parentSelected && node.path;
        if (isSelectedRootFolder) {
          paths.push(node.path);
        }
        const nextParentSelected = parentSelected || (isFolder && node.selected);
        if (isFolder && node.childrenLoaded && node.children.length > 0) {
          walk(node.children, nextParentSelected);
        }
      }
    };
    walk(nodes, false);
    return paths;
  }

  function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(query)) {
          result.push({ ...node });
        }
      } else {
        const filteredChildren = node.childrenLoaded ? filterTree(node.children, query) : [];
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(query)) {
          result.push({
            ...node,
            children: filteredChildren,
            childrenLoaded: true,
            expanded: true
          });
        }
      }
    }
    return result;
  }

  function toggleSelectAll(): void {
    const allSelected = selectedCount > 0;
    setChildrenSelected(treeData, !allSelected);
    updateParentStates(treeData);
    treeData = [...treeData];
  }

  function applySelectionSnapshot(
    nodes: TreeNode[],
    selectedFolders: Set<string>,
    selectedFiles: Set<string>
  ): void {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (selectedFolders.has(node.path)) {
          setNodeSelection(node, true);
          continue;
        }
        applySelectionSnapshot(node.children, selectedFolders, selectedFiles);
      } else if (selectedFiles.has(node.path)) {
        node.selected = true;
      }
    }
  }

  async function ensureFullTreeLoadedForSearch(): Promise<void> {
    if (searchFullTreeReady || !searchQuery.trim()) {
      return;
    }

    const selectedFolders = new Set(getSelectedRootFolderPaths(treeData));
    const selectedFiles = new Set(getExplicitlySelectedFilePaths(treeData));
    const fullTree = buildFullTree();
    applySelectionSnapshot(fullTree, selectedFolders, selectedFiles);
    updateParentStates(fullTree);
    treeData = fullTree;
    searchFullTreeReady = true;
  }

  function getMarkdownImportContextPath(paths: string[]): string | null {
    for (const path of paths) {
      const file = plugin.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile && file.extension === 'md') {
        return file.path;
      }
    }
    return null;
  }

  function resolveDefaultMarkdownImportFolder(paths: string[]): string {
    return normalizeIRReadableMarkdownFolderPath(
      resolveIRReadableMarkdownTargetFolder(plugin.app, {
        lastSelectedFolder: plugin.settings?.incrementalReading?.selectionQuickCreateLastFolder,
        contextPath: getMarkdownImportContextPath(paths),
        allowActiveFileFallback: true
      })
    );
  }

  function ensureIncrementalReadingSettings(): Record<string, unknown> {
    const pluginAny = plugin as any;
    if (!pluginAny.settings.incrementalReading) {
      pluginAny.settings.incrementalReading = {
        importFolder: resolveIRImportFolder(undefined, pluginAny.settings?.weaveParentFolder),
        selectionQuickCreateLastFolder: '',
        appendSourceDocumentBacklinkOnSplitImport: false
      };
    }
    if (pluginAny.settings.incrementalReading.appendSourceDocumentBacklinkOnSplitImport === undefined) {
      pluginAny.settings.incrementalReading.appendSourceDocumentBacklinkOnSplitImport = false;
    }
    return pluginAny.settings.incrementalReading as Record<string, unknown>;
  }

  function getSplitSourceBacklinkPreference(): boolean {
    const settings = ensureIncrementalReadingSettings();
    return Boolean(settings.appendSourceDocumentBacklinkOnSplitImport);
  }

  async function saveSplitSourceBacklinkPreference(enabled: boolean): Promise<void> {
    appendSourceDocumentBacklinkOnSplitImport = enabled;
    const settings = ensureIncrementalReadingSettings();
    settings.appendSourceDocumentBacklinkOnSplitImport = enabled;
    await plugin.saveSettings();
  }

  async function showMarkdownImportFolderMenu(): Promise<void> {
    const picker = new VaultFolderSuggestModal(plugin.app, {
      placeholder: '选择 MD 拆分文件导入路径...'
    });
    const folderPath = await picker.openAndSelect();
    if (!folderPath) {
      return;
    }

    const normalizedFolder = normalizeIRReadableMarkdownFolderPath(folderPath);
    markdownImportFolder = normalizedFolder;
    const settings = ensureIncrementalReadingSettings();
    settings.selectionQuickCreateLastFolder = normalizedFolder;
    await plugin.saveSettings();
  }

  function getMarkdownImportFolderLabel(): string {
    if (!markdownImportFolder || markdownImportFolder === '/') {
      return '/（Vault 根目录）';
    }
    return markdownImportFolder;
  }

  function isWholeFileMarkdownImport(): boolean {
    return !isPdfImportMode && !isEpubImportMode && ruleSplitConfig.enableWholeFile;
  }

  function shouldShowWholeFileImportModeSelector(): boolean {
    return isWholeFileMarkdownImport();
  }

  function shouldShowMarkdownImportFolderSelector(): boolean {
    if (isPdfImportMode || isEpubImportMode) {
      return false;
    }
    return !ruleSplitConfig.enableWholeFile || wholeFileImportMode === 'copy';
  }

  function shouldShowSplitSourceBacklinkToggle(): boolean {
    if (currentStep !== 'preview') {
      return false;
    }
    if (isPdfImportMode || isEpubImportMode) {
      return false;
    }
    return !ruleSplitConfig.enableWholeFile;
  }

  function buildSourceTraceBacklink(file: TFile): string {
    return `[[${file.path}|溯源完整源文档]]`;
  }

  function getWholeFileImportModeLabel(): string {
    return wholeFileImportMode === 'reference' ? '直接引用原文件' : '生成副本并导入';
  }

  function getInitialImportOrderingLabel(): string {
    const option = INITIAL_IMPORT_ORDERING_OPTIONS.find(o => o.value === initialImportOrderingMode);
    return option?.label || '正序分散';
  }

  async function goToSplitModeStep(): Promise<void> {
    const paths = getSelectedPaths(treeData);
    if (paths.length === 0) return;
    
    selectedFilePaths = paths;

    const extensions = new Set<string>();
    for (const p of paths) {
      const af = plugin.app.vault.getAbstractFileByPath(p);
      if (af instanceof TFile) {
        extensions.add(af.extension);
      }
    }

    const hasMarkdown = extensions.has('md');
    const hasPdf = extensions.has('pdf');
    const hasEpub = extensions.has('epub');
    const typeCount = (hasMarkdown ? 1 : 0) + (hasPdf ? 1 : 0) + (hasEpub ? 1 : 0);
    if (typeCount > 1) {
      new Notice('暂不支持混合导入（请分别导入 Markdown、PDF 或 EPUB）');
      return;
    }

    if (hasEpub) {
      await prepareEpubSplitStep(paths);
      return;
    }

    const isPdfImport = hasPdf;
    if (isPdfImport) {
      await preparePdfSplitStep(paths);
      return;
    }

    if (paths.length === 1) {
      selectedFilePath = paths[0];
      try {
        const file = plugin.app.vault.getAbstractFileByPath(selectedFilePath);
        if (file instanceof TFile) {
          const rawContent = await plugin.app.vault.read(file);
          fileContent = extractBodyContent(rawContent);
        }
      } catch (error) {
        logger.error('[MaterialImportModal] 读取文件失败:', error);
      }
    } else {
      selectedFilePath = null;
      fileContent = '';
    }

    markdownImportFolder = resolveDefaultMarkdownImportFolder(paths);
    wholeFileImportMode = 'reference';
    currentStep = 'configure';
  }

  async function preparePdfSplitStep(filePaths: string[]): Promise<void> {
    isPdfImportMode = true;
    selectedFilePath = filePaths.length === 1 ? filePaths[0] : null;
    importing = true;
    loadingOutline = true;
    importProgress = { current: 0, total: filePaths.length };

    try {
      const outlineItems: OutlineSelectionItem[] = [];
      for (let i = 0; i < filePaths.length; i++) {
        const p = filePaths[i];
        importProgress = { current: i + 1, total: filePaths.length };

        const file = plugin.app.vault.getAbstractFileByPath(p);
        const tfile = file instanceof TFile ? file : null;
        if (!tfile) continue;

        const items = await getPdfOutlineItemsSafely(tfile);
        logger.debug('[MaterialImportModal] PDF 目录提取结果:', {
          pdf: tfile.path,
          outlineCount: items.length
        });
        if (items.length === 0) {
          outlineItems.push({
            id: `pdf-whole:${tfile.path}`,
            type: 'pdf',
            label: tfile.basename,
            path: [],
            level: 1,
            filePath: tfile.path,
            bookTitle: tfile.basename,
            fallbackWholeFile: true
          });
          continue;
        }

        for (const [index, item] of items.entries()) {
          outlineItems.push({
            id: `pdf:${tfile.path}:${item.pageNumber || 0}:${index}`,
            type: 'pdf',
            label: item.title,
            path: item.path,
            level: Math.max(1, item.path.length || 1),
            filePath: tfile.path,
            bookTitle: tfile.basename,
            pageNumber: typeof item.pageNumber === 'number' && item.pageNumber > 0 ? item.pageNumber : undefined
          });
        }
      }

      initializeOutlineSelection(outlineItems);
      currentStep = 'split-mode';
    } catch (error) {
      logger.error('[MaterialImportModal] 解析 PDF 目录失败:', error);
      new Notice(`解析 PDF 目录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      loadingOutline = false;
      importing = false;
    }
  }

  function buildContentBlocksFromSelectedOutlineItems(items: OutlineSelectionItem[]): ImportContentBlock[] {
    return items.map((item, index) => {
      const title = buildOutlineDisplayTitle(item);
      if (item.type === 'pdf') {
        return {
          id: `pdf-${index}`,
          title,
          content: item.pageNumber
            ? `[[${item.filePath}#page=${item.pageNumber}|${title}]]`
            : `[[${item.filePath}|${title}]]`,
          charCount: title.length,
          startOffset: 0,
          endOffset: 0,
          sourceFilePath: item.filePath,
          pdfPageNumber: item.pageNumber,
          outlineLevel: item.level,
          outlineLabel: item.label,
          outlinePath: item.path,
          fallbackWholeFile: item.fallbackWholeFile
        } as ImportContentBlock;
      }

      return {
        id: `epub-${index}`,
        title,
        content: item.href || '',
        charCount: title.length,
        startOffset: 0,
        endOffset: 0,
        sourceFilePath: item.filePath,
        epubTocHref: item.href,
        epubTocLevel: item.level,
        epubSourceId: item.sourceId,
        epubBookTitle: item.bookTitle,
        outlineLevel: item.level,
        outlineLabel: item.label,
        outlinePath: item.path
      } as ImportContentBlock;
    });
  }

  function handleOutlineSelectionConfirm(): void {
    const selectedItems = outlineVisibleItems.filter((item) => outlineSelectedIds.has(item.id));
    if (selectedItems.length === 0) {
      new Notice(`请至少选择一个${getOutlineUnitLabel()}`);
      return;
    }

    contentBlocks = buildContentBlocksFromSelectedOutlineItems(selectedItems);
    currentStep = 'preview';
  }

  function getMatchedBlocksForFile(
    filePath: string,
    allBlocks: ContentBlock[],
    fallbackStartIndex: number,
    fallbackCount: number
  ): ContentBlock[] {
    const normalizedFilePath = normalizePath(filePath);
    const blocksForFile = allBlocks.filter(block =>
      (block as ImportContentBlock).sourceFilePath
      && normalizePath((block as ImportContentBlock).sourceFilePath!) === normalizedFilePath
    );

    if (blocksForFile.length > 0) {
      return blocksForFile;
    }

    return allBlocks.slice(fallbackStartIndex, fallbackStartIndex + fallbackCount);
  }

  async function ensureMdMaterialServices() {
    const materialManager = plugin.readingMaterialManager;
    const materialStorage = plugin.readingMaterialStorage;

    if (!materialManager || !materialStorage) {
      throw new Error('增量阅读材料服务尚未初始化');
    }

    await materialStorage.initialize();
    return { materialManager };
  }

  async function ensureExternalDocumentChunkScheduled(
    file: TFile,
    deckId: string,
    deckName: string,
    nextRepDate?: number,
    sourceSequenceMeta?: SourceSequenceMeta
  ): Promise<void> {
    await services.init();
    const storage = services.storageService;
    if (!storage) {
      throw new Error('增量阅读存储服务尚未初始化');
    }

    const chunks = await storage.getAllChunkData();
    const existing = Object.values(chunks).find((chunk: any) => (chunk as any)?.filePath === file.path) as IRChunkFileData | undefined;
    const effectiveNextRepDate = nextRepDate ?? Date.now();

    if (existing) {
      existing.deckIds = [deckId];
      existing.deckTag = `#IR_deck_${deckName}`;
      existing.nextRepDate = effectiveNextRepDate;
      existing.intervalDays = existing.intervalDays || 1;
      existing.scheduleStatus = 'queued';
      (existing as any).meta = {
        ...(((existing as any).meta || {}) as Record<string, unknown>),
        ...(sourceSequenceMeta || {})
      };
      existing.updatedAt = Date.now();
      await storage.saveChunkData(existing);
      return;
    }

    const chunk = createDefaultChunkFileData(generateChunkId(), generateSourceId(), file.path) as IRChunkFileData;
    chunk.deckIds = [deckId];
    chunk.deckTag = `#IR_deck_${deckName}`;
    chunk.nextRepDate = effectiveNextRepDate;
    chunk.intervalDays = 1;
    chunk.scheduleStatus = 'queued';
    (chunk as any).meta = {
      ...((((chunk as any).meta || {}) as Record<string, unknown>)),
      ...(sourceSequenceMeta || {})
    };
    chunk.updatedAt = Date.now();
    await storage.saveChunkData(chunk);
  }

  async function importMdFilesAsSourceDocuments(
    filePaths: string[],
    assignments: Map<ContentBlock, Date> | null
  ): Promise<{ successCount: number; errorCount: number; chunkCount: number }> {
    const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
    if (!selectedDeckId || !selectedDeck) {
      throw new Error('未选择专题');
    }

    const { materialManager } = await ensureMdMaterialServices();

    let successCount = 0;
    let errorCount = 0;
    let chunkCount = 0;
    let fallbackCursor = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      importProgress = { current: i + 1, total: filePaths.length };

      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile) || file.extension !== 'md') {
        errorCount++;
        continue;
      }

      try {
        const blocksForFile = getMatchedBlocksForFile(
          file.path,
          contentBlocks,
          fallbackCursor,
          filePaths.length === 1 ? contentBlocks.length : 1
        );
        fallbackCursor += blocksForFile.length;

        if (blocksForFile.length === 0) {
          throw new Error('没有可导入的拆分内容');
        }

        const splitBlocks = blocksForFile.map((block) => {
          const sourcePrefix = `${file.basename} - `;
          const normalizedTitle = block.title.startsWith(sourcePrefix)
            ? block.title.slice(sourcePrefix.length).trim()
            : block.title.trim();
          return {
            title: normalizedTitle || file.basename,
            content: block.content,
            sourceBacklink: appendSourceDocumentBacklinkOnSplitImport ? buildSourceTraceBacklink(file) : undefined,
            nextReviewAt: assignments?.get(block)
          };
        });

        const createdMaterials = await materialManager.createSplitMarkdownMaterials(file, splitBlocks, {
          source: 'manual',
          category: ReadingCategory.Later,
          priority: 50,
          tags: ['weave-incremental-reading'],
          deckId: selectedDeckId,
          readableMarkdownFolder: markdownImportFolder || undefined
        });

        for (const material of createdMaterials) {
          const createdFile = plugin.app.vault.getAbstractFileByPath(material.filePath);
          if (!(createdFile instanceof TFile)) {
            continue;
          }

          const dueAt = getReadingMaterialDueAt(material);
          const nextRepDate = dueAt ? new Date(dueAt).getTime() : undefined;
          const materialOrder = createdMaterials.indexOf(material) + 1;
          const sequenceMeta = buildSourceSequenceMeta(`md:${normalizePath(file.path)}`, materialOrder, nextRepDate);
          await ensureExternalDocumentChunkScheduled(
            createdFile,
            selectedDeckId,
            selectedDeck.name,
            nextRepDate,
            sequenceMeta
          );
        }

        successCount += createdMaterials.length;
        chunkCount += createdMaterials.length;
        logger.info(
          `[MaterialImportModal] Markdown 拆分导入成功: ${file.path} -> ${createdMaterials.length} 个独立 md 文件`
        );
      } catch (error) {
        errorCount++;
        logger.error(`[MaterialImportModal] Markdown 拆分导入失败: ${file.path}`, error);
        new Notice(`导入失败: ${file.basename} - ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    return { successCount, errorCount, chunkCount };
  }

  async function importWholeMdFilesByReference(
    filePaths: string[],
    assignments: Map<ContentBlock, Date> | null
  ): Promise<{ successCount: number; errorCount: number; chunkCount: number }> {
    const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
    if (!selectedDeckId || !selectedDeck) {
      throw new Error('未选择专题');
    }

    const { materialManager } = await ensureMdMaterialServices();
    let successCount = 0;
    let errorCount = 0;
    let fallbackCursor = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      importProgress = { current: i + 1, total: filePaths.length };

      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile) || file.extension !== 'md') {
        errorCount++;
        continue;
      }

      try {
        const blocksForFile = getMatchedBlocksForFile(
          file.path,
          contentBlocks,
          fallbackCursor,
          filePaths.length === 1 ? Math.max(1, contentBlocks.length) : 1
        );
        fallbackCursor += blocksForFile.length;

        const assignedDate = blocksForFile[0] ? assignments?.get(blocksForFile[0]) : null;
        const material = await materialManager.getOrCreateMaterial(file, {
          source: 'manual',
          category: ReadingCategory.Later,
          priority: 50,
          tags: ['weave-incremental-reading'],
          copyToImportFolder: false
        });

        await materialManager.setReadingDeck(material.uuid, selectedDeckId);
        if (assignedDate) {
          await materialManager.setNextReviewDate(material.uuid, assignedDate);
        }

        await ensureExternalDocumentChunkScheduled(
          file,
          selectedDeckId,
          selectedDeck.name,
          assignedDate?.getTime(),
          buildSourceSequenceMeta(`md:${normalizePath(file.path)}`, 1, assignedDate?.getTime())
        );
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`[MaterialImportModal] Markdown 直引导入失败: ${file.path}`, error);
        new Notice(`导入失败: ${file.basename} - ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    return { successCount, errorCount, chunkCount: 0 };
  }

  async function importWholeMdFilesAsCopies(
    filePaths: string[],
    assignments: Map<ContentBlock, Date> | null
  ): Promise<{ successCount: number; errorCount: number; chunkCount: number }> {
    const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
    if (!selectedDeckId || !selectedDeck) {
      throw new Error('未选择专题');
    }

    const { materialManager } = await ensureMdMaterialServices();
    let successCount = 0;
    let errorCount = 0;
    let fallbackCursor = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      importProgress = { current: i + 1, total: filePaths.length };

      const file = plugin.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile) || file.extension !== 'md') {
        errorCount++;
        continue;
      }

      try {
        const blocksForFile = getMatchedBlocksForFile(
          file.path,
          contentBlocks,
          fallbackCursor,
          filePaths.length === 1 ? Math.max(1, contentBlocks.length) : 1
        );
        fallbackCursor += blocksForFile.length;

        const assignedDate = blocksForFile[0] ? assignments?.get(blocksForFile[0]) : null;
        const material = await materialManager.createCopiedMarkdownMaterial(file, {
          source: 'manual',
          category: ReadingCategory.Later,
          priority: 50,
          tags: ['weave-incremental-reading'],
          readableMarkdownFolder: markdownImportFolder || undefined
        });

        await materialManager.setReadingDeck(material.uuid, selectedDeckId);
        if (assignedDate) {
          await materialManager.setNextReviewDate(material.uuid, assignedDate);
        }

        const copiedFile = plugin.app.vault.getAbstractFileByPath(material.filePath);
        if (copiedFile instanceof TFile) {
          await ensureExternalDocumentChunkScheduled(
            copiedFile,
            selectedDeckId,
            selectedDeck.name,
            assignedDate?.getTime(),
            buildSourceSequenceMeta(`md:${normalizePath(file.path)}`, 1, assignedDate?.getTime())
          );
        }

        successCount++;
      } catch (error) {
        errorCount++;
        logger.error(`[MaterialImportModal] Markdown 副本导入失败: ${file.path}`, error);
        new Notice(`导入失败: ${file.basename} - ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    return { successCount, errorCount, chunkCount: 0 };
  }

  async function getPdfOutlineItemsSafely(pdfFile: TFile): Promise<Array<{ title: string; pageNumber: number; path: string[] }>> {
    try {
      return await getPdfOutlineForFile(plugin.app, pdfFile, {
        includeEntriesWithoutPage: true,
        preferOpenView: true,
        maxDirectLoadFileSizeBytes: 0,
        directLoadTimeoutMs: 30000
      });
    } catch (e) {
      logger.debug('[MaterialImportModal] PDF outline extraction failed, falling back to leaf:', e);
      logger.warn('[MaterialImportModal] 未能安全提取 PDF 目录，回退为整本导入:', {
        pdf: pdfFile.path
      });
      return [];
    }
  }

  // --- EPUB functions ---
  async function prepareEpubSplitStep(paths: string[]): Promise<void> {
    isEpubImportMode = true;
    selectedFilePath = paths.length === 1 ? paths[0] : null;
    loadingOutline = true;
    importing = true;
    importProgress = { current: 0, total: paths.length };
    const epubStorageService = new EpubStorageService(plugin.app);

    try {
      const outlineItems: OutlineSelectionItem[] = [];

      for (let i = 0; i < paths.length; i++) {
        const filePath = paths[i];
        importProgress = { current: i + 1, total: paths.length };

        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        const tfile = file instanceof TFile ? file : null;
        if (!tfile) {
          continue;
        }

        const readerService = createEpubReaderEngine(plugin.app);
        try {
          const sourceEntry = await epubStorageService.ensureSourceIdentity(filePath);
          await readerService.loadEpub(filePath);
          const tocItems = await readerService.getTableOfContents();
          const contextualItems: TocItem[] = tocItems.map((item) =>
            attachEpubItemContext(item, filePath, tfile.basename, sourceEntry?.sourceId)
          );
          const flattenedItems = flattenEpubTocToOutlineItems(contextualItems);
          outlineItems.push(...flattenedItems);
        } finally {
          readerService.destroy();
        }
      }

      initializeOutlineSelection(outlineItems);
      currentStep = 'split-mode';
    } catch (e) {
      const classified = reportEpubError(e, 'toc');
      new Notice(classified.userMessage);
      isEpubImportMode = false;
    } finally {
      loadingOutline = false;
      importing = false;
    }
  }

  function attachEpubItemContext(
    item: TocItem,
    filePath: string,
    bookTitle: string,
    sourceId?: string
  ): TocItem {
    return {
      ...item,
      id: `${sourceId || filePath}::${item.id}`,
      filePath,
      bookTitle,
      sourceId,
      subitems: item.subitems?.map((subitem) =>
        attachEpubItemContext(subitem, filePath, bookTitle, sourceId)
      )
    } as TocItem;
  }

  function flattenEpubTocToOutlineItems(items: TocItem[]): OutlineSelectionItem[] {
    const result: OutlineSelectionItem[] = [];
    const walk = (
      list: TocItem[],
      filePath = '',
      bookTitle = '',
      sourceId = '',
      ancestors: string[] = [],
      depth = 1
    ) => {
      for (const item of list) {
        const nextSourceId = sourceId || String((item as any).sourceId || item.id.split('::')[0] || '');
        const nextFilePath = filePath || String((item as any).filePath || '');
        const nextBookTitle = bookTitle || String((item as any).bookTitle || item.label);
        const nextAncestors = item.href ? [...ancestors, item.label] : ancestors;
        const resolvedLevel = Math.max(1, depth, Number.isFinite(item.level) ? item.level : 0);

        if (item.href) {
          result.push({
            id: item.id,
            type: 'epub',
            label: item.label,
            href: item.href,
            level: resolvedLevel,
            path: nextAncestors,
            filePath: nextFilePath,
            sourceId: nextSourceId || undefined,
            bookTitle: nextBookTitle
          });
        }
        if (item.subitems && item.subitems.length > 0) {
          walk(item.subitems, nextFilePath, nextBookTitle, nextSourceId, nextAncestors, resolvedLevel + 1);
        }
      }
    };
    walk(items);
    return result;
  }

  async function handleEpubBookmarkTaskImport(): Promise<void> {
    if (!selectedDeckId) return;

    importing = true;
    importProgress = { current: 0, total: contentBlocks.length };

    try {
      await services.init();

      const pointWriteService = new IRPointWriteService(plugin.app);
      const epubService = new IREpubBookmarkTaskService(plugin.app);
      await epubService.initialize();

      const selected = contentBlocks.filter(
        (block): block is ImportContentBlock & { epubTocHref: string; sourceFilePath: string } =>
          typeof block.epubTocHref === 'string'
          && block.epubTocHref.length > 0
          && typeof block.sourceFilePath === 'string'
          && block.sourceFilePath.length > 0
      );
      const existingHrefMap = new Map<string, Set<string>>();
      const epubStorageService = new EpubStorageService(plugin.app);
      const selectedIdentities = new Map<string, { filePath: string; sourceId?: string }>();
      for (const block of selected) {
        const normalizedPath = String(block.sourceFilePath || '').trim();
        if (!normalizedPath) {
          continue;
        }
        const sourceEntry = block.epubSourceId
          ? await epubStorageService.ensureSourceIdentity(normalizedPath, { preferredSourceId: block.epubSourceId })
          : await epubStorageService.ensureSourceIdentity(normalizedPath);
        if (sourceEntry?.sourceId) {
          block.epubSourceId = sourceEntry.sourceId;
        }
        const identityKey = sourceEntry?.sourceId || block.epubSourceId || normalizedPath;
        if (!selectedIdentities.has(identityKey)) {
          selectedIdentities.set(identityKey, {
            filePath: normalizedPath,
            sourceId: sourceEntry?.sourceId || block.epubSourceId
          });
        }
      }
      const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
      const deckIdentifiers = [selectedDeckId, selectedDeck?.path].filter(
        (value): value is string => Boolean(value && value.trim())
      );
      const existingDeckTasks = await epubService.getTasksByDeckIdentifiers(deckIdentifiers);
      for (const [identityKey, identity] of selectedIdentities.entries()) {
        const existing = existingDeckTasks.filter((task) =>
          (identity.sourceId && task.sourceId === identity.sourceId) ||
          task.epubFilePath === identity.filePath
        );
        existingHrefMap.set(
          identityKey,
          new Set(existing.map(t => t.tocHref))
        );
      }

      const newItems = selected.filter((block) => {
        const identityKey = block.epubSourceId || block.sourceFilePath;
        return !existingHrefMap.get(identityKey)?.has(block.epubTocHref);
      });

      let assignments: Map<ContentBlock, Date> | null = null;
      if (contentBlocks.length > 0) {
        const schedulingResult = await calculateProjectedScheduling(contentBlocks, () => 5);
        schedulingImpact = schedulingResult.impact;
        assignments = schedulingResult.assignments;
      }
      const sequenceMetaByBlock = buildContentBlockSequenceMetaMap(
        selected,
        (block) => `epub:${String((block as any)?.epubSourceId || (block as any)?.sourceFilePath || '').trim()}`,
        assignments
      );

      const inputs = newItems.map((block) => {
        let nextRepDate = 0;
        if (assignments) {
          const assignedDate = assignments.get(block);
          if (assignedDate) {
            nextRepDate = assignedDate.getTime();
          }
        }

        const sequenceMeta = sequenceMetaByBlock.get(block);

        return {
          deckId: selectedDeckId!,
          epubFilePath: block.sourceFilePath,
          sourceId: block.epubSourceId,
          title: block.title || block.epubBookTitle || 'EPUB',
          tocHref: block.epubTocHref,
          tocLevel: block.epubTocLevel || block.outlineLevel || 1,
          priorityUi: 5,
          nextRepDate,
          sourceSequenceGroup: sequenceMeta?.sourceSequenceGroup,
          sourceSequenceOrder: sequenceMeta?.sourceSequenceOrder,
          sourceSequenceLocked: sequenceMeta?.sourceSequenceLocked,
          sourceSequenceAnchorDateKey: sequenceMeta?.sourceSequenceAnchorDateKey
        };
      });

      const created = await pointWriteService.batchCreateEpubPoints(inputs);
      const success = created.length;
      const skipped = selected.length - newItems.length;

      importProgress = { current: contentBlocks.length, total: contentBlocks.length };
      new Notice(`EPUB 导入完成: ${success} 个任务创建, ${skipped} 个已跳过`);

      await finalizeImport({ success, skipped, errors: [] });
    } catch (error) {
      logger.error('[MaterialImportModal] EPUB 书签任务导入失败:', error);
      new Notice(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      importing = false;
    }
  }

  function goBack(): void {
    switch (currentStep) {
      case 'split-mode':
        currentStep = 'select';
        isPdfImportMode = false;
        isEpubImportMode = false;
        selectedFilePath = null;
        outlineAllItems = [];
        outlineVisibleItems = [];
        outlineSelectedIds = new Set();
        outlineAvailableLevels = [];
        outlineSelectedLevels = [];
        outlineSelectionInitialized = false;
        contentBlocks = [];
        selectedFilePaths = [];
        break;
      case 'configure':
        currentStep = 'select';
        break;
      case 'preview':
        if (isPdfImportMode || isEpubImportMode) {
          currentStep = 'split-mode';
        } else {
          currentStep = 'configure';
        }
        break;
    }
  }

  async function handleRuleConfigConfirm(): Promise<void> {
    if (isMultiFileMode) {
      // 批量模式：读取所有文件并生成预览
      await generateBatchPreview();
    } else {
      // 单文件模式：直接拆分当前文件
      let defaultTitle: string | undefined;
      if (selectedFilePath) {
        const file = plugin.app.vault.getAbstractFileByPath(selectedFilePath);
        if (file instanceof TFile) {
          defaultTitle = file.basename;
        }
      }

      contentBlocks = splitByRules(fileContent, ruleSplitConfig, { defaultTitle }).map(block => ({
        ...block,
        sourceFilePath: selectedFilePath || undefined
      }));
      currentStep = 'preview';
    }
  }

  async function generateBatchPreview(): Promise<void> {
    try {
      const allBlocks: ImportContentBlock[] = [];

      for (const filePath of selectedFilePaths) {
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const content = await plugin.app.vault.read(file);
          const blocks = splitByRules(extractBodyContent(content), ruleSplitConfig, { defaultTitle: file.basename });

          // 为每个块添加文件来源信息
          blocks.forEach(block => {
            allBlocks.push({
              ...block,
              title: block.title ? `${file.basename} - ${block.title}` : file.basename,
              sourceFilePath: file.path
            });
          });
        }
      }

      contentBlocks = allBlocks;
      currentStep = 'preview';
    } catch (error) {
      logger.error('[MaterialImportModal] 生成批量预览失败:', error);
    }
  }

  async function handleBatchImport(): Promise<void> {
    if (selectedFilePaths.length === 0 || !selectedDeckId) return;

    if (isPdfImportMode) {
      await handlePdfBookmarkTaskImport();
      return;
    }
    if (isEpubImportMode) {
      await handleEpubBookmarkTaskImport();
      return;
    }
    
    importing = true;
    importProgress = { current: 0, total: selectedFilePaths.length };

    try {
      const result = await addImportedBlocksAsFiles(selectedFilePaths);
      await finalizeImport({
        success: result.successCount,
        skipped: 0,
        errors: result.errorCount > 0 ? [{ path: '', error: `${result.errorCount} 个文件导入失败` }] : []
      });
    } catch (error) {
      logger.error('[MaterialImportModal] 批量导入失败:', error);
      onImportComplete({ success: 0, skipped: 0, errors: [{ path: '', error: String(error) }] });
      onClose();
    } finally {
      importing = false;
    }
  }

  async function handleSingleFileImport(): Promise<void> {
    if (!selectedFilePath || contentBlocks.length === 0 || !selectedDeckId) return;

    if (isPdfImportMode) {
      await handlePdfBookmarkTaskImport();
      return;
    }
    if (isEpubImportMode) {
      await handleEpubBookmarkTaskImport();
      return;
    }
    
    importing = true;
    
    try {
      const result = await addImportedBlocksAsFiles([selectedFilePath]);
      await finalizeImport({
        success: result.successCount,
        skipped: 0,
        errors: result.errorCount > 0 ? [{ path: selectedFilePath || '', error: '导入失败' }] : []
      });
    } catch (error) {
      logger.error('[MaterialImportModal] 导入失败:', error);
      onImportComplete({ success: 0, skipped: 0, errors: [{ path: selectedFilePath || '', error: String(error) }] });
      onClose();
    } finally {
      importing = false;
    }
  }

  // Obsidian Menu API 实现
  const STRATEGY_OPTIONS = [
    { value: 'even', label: '均分' },
    { value: 'balanced', label: '均衡' },
    { value: 'front-loaded', label: '尽快' }
  ] as const;
  const INITIAL_IMPORT_ORDERING_OPTIONS = [
    { value: 'preserve-source-order', label: '正序分散' },
    { value: 'pure-scheduling', label: '按调度排序' }
  ] as const;

  function showSchedulingDaysMenu(evt: MouseEvent) {
    const menu = new Menu();
    
    Object.entries(SCHEDULING_PRESETS).forEach(([key, preset]) => {
      menu.addItem((item) => {
        item
          .setTitle(preset.label)
          .setChecked(!useCustomDays && schedulingConfig.distributionDays === preset.days)
          .onClick(() => {
            useCustomDays = false;
            schedulingConfig.distributionDays = preset.days;
          });
      });
    });
    
    menu.addItem((item) => {
      item
        .setTitle('自定义')
        .setChecked(useCustomDays)
        .onClick(() => {
          useCustomDays = true;
          schedulingConfig.distributionDays = customDaysValue;
        });
    });
    
    menu.showAtMouseEvent(evt);
  }

  function showSchedulingStrategyMenu(evt: MouseEvent) {
    const menu = new Menu();
    
    STRATEGY_OPTIONS.forEach(option => {
      menu.addItem((item) => {
        item
          .setTitle(option.label)
          .setChecked(schedulingConfig.strategy === option.value)
          .onClick(() => {
            schedulingConfig.strategy = option.value;
          });
      });
    });
    
    menu.showAtMouseEvent(evt);
  }

  function showInitialImportOrderingMenu(evt: MouseEvent) {
    const menu = new Menu();

    INITIAL_IMPORT_ORDERING_OPTIONS.forEach(option => {
      menu.addItem((item) => {
        item
          .setTitle(option.label)
          .setChecked(initialImportOrderingMode === option.value)
          .onClick(() => {
            initialImportOrderingMode = option.value;
          });
      });
    });

    menu.showAtMouseEvent(evt);
  }

  function showWholeFileImportModeMenu(evt: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('直接引用原文件')
        .setChecked(wholeFileImportMode === 'reference')
        .onClick(() => {
          wholeFileImportMode = 'reference';
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('生成副本并导入')
        .setChecked(wholeFileImportMode === 'copy')
        .onClick(() => {
          wholeFileImportMode = 'copy';
        });
    });

    menu.showAtMouseEvent(evt);
  }

  function showDeckSelectMenu(evt: MouseEvent) {
    const menu = new Menu();
    
    availableDecks.forEach(deck => {
      menu.addItem((item) => {
        item
          .setTitle(`${deck.icon} ${deck.name}`)
          .setChecked(selectedDeckId === deck.id)
          .onClick(() => {
            selectedDeckId = deck.id;
          });
      });
    });
    
    menu.addSeparator();
    
    menu.addItem((item) => {
      item
        .setTitle('新建专题')
        .setIcon('plus')
        .onClick(() => {
          showNewDeckInput = true;
        });
    });
    
    menu.showAtMouseEvent(evt);
  }

  function getSchedulingDaysLabel(): string {
    if (useCustomDays) return `${customDaysValue}天`;
    const preset = Object.values(SCHEDULING_PRESETS).find(p => p.days === schedulingConfig.distributionDays);
    return preset?.label || `${schedulingConfig.distributionDays}天`;
  }

  function getStrategyLabel(): string {
    const option = STRATEGY_OPTIONS.find(o => o.value === schedulingConfig.strategy);
    return option?.label || '均衡';
  }

  function getSelectedDeckLabel(): string {
    const deck = availableDecks.find(d => d.id === selectedDeckId);
    return deck ? `${deck.icon} ${deck.name}` : '选择专题';
  }
  
  /**
   * v5.0 文件化块导入：生成独立的 MD 文件
   */
  async function addImportedBlocksAsFiles(filePaths: string[]): Promise<{ successCount: number; errorCount: number; chunkCount: number }> {
    try {
      await services.init();
      const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);

      if (!irTagGroupService) {
        const pluginAny = plugin as any;
        const service = pluginAny.irTagGroupService ?? new IRTagGroupService(plugin.app);
        irTagGroupService = service;
        await service.initialize();
        pluginAny.irTagGroupService = service;
      }

      const tagGroupService = irTagGroupService;
      if (!tagGroupService) {
        throw new Error('[MaterialImportModal] IRTagGroupService 初始化失败');
      }
      
      logger.info(`[MaterialImportModal] 开始文件化块导入: ${filePaths.length} 个文件, 牌组: ${selectedDeck?.name || '未分配'}`);
      logger.info(`[MaterialImportModal] ruleSplitConfig: ${JSON.stringify(ruleSplitConfig)}`);
      
      let assignments: Map<ContentBlock, Date> | null = null;
      if (contentBlocks.length > 0) {
        const schedulingResult = await calculateProjectedScheduling(
          contentBlocks,
          (block) => estimateContentBlockMinutes(block, 500)
        );
        schedulingImpact = schedulingResult.impact;
        assignments = schedulingResult.assignments;
      }

      const mdFilePaths: string[] = [];
      const nonMdFilePaths: string[] = [];
      for (const filePath of filePaths) {
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile && file.extension === 'md') {
          mdFilePaths.push(filePath);
        } else {
          nonMdFilePaths.push(filePath);
        }
      }

      let successCount = 0;
      let errorCount = 0;

      if (mdFilePaths.length > 0) {
        const mdResult = ruleSplitConfig.enableWholeFile
          ? wholeFileImportMode === 'reference'
            ? await importWholeMdFilesByReference(mdFilePaths, assignments)
            : await importWholeMdFilesAsCopies(mdFilePaths, assignments)
          : await importMdFilesAsSourceDocuments(mdFilePaths, assignments);
        successCount += mdResult.successCount;
        errorCount += mdResult.errorCount;
      }

      if (nonMdFilePaths.length === 0) {
        logger.info(`[MaterialImportModal] MD 源文档直引导入完成: 成功 ${successCount}, 失败 ${errorCount}`);
        if (successCount > 0) {
          new Notice(`导入完成: ${successCount} 个 Markdown 文档已接入增量阅读`);
        }
        return { successCount, errorCount, chunkCount: 0 };
      }

      errorCount += nonMdFilePaths.length;
      logger.warn('[MaterialImportModal] 旧文件化块导入已停用，本次跳过非 Markdown 文件:', nonMdFilePaths);
      new Notice('旧文件化块导入已停用：PDF/EPUB 等文件不再拆成 raw/index/chunk，请改用正文阅读点或等待新模型重做。', 5000);
      return { successCount, errorCount, chunkCount: 0 };
    } catch (error) {
      logger.error('[MaterialImportModal] 文件化块导入失败:', error);
      new Notice(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { successCount: 0, errorCount: filePaths.length, chunkCount: 0 };
    }
  }

  function resetModalState() {
    currentStep = 'select';
    selectedFilePath = null;
    selectedFilePaths = [];
    contentBlocks = [];
    fileContent = '';
    markdownImportFolder = '';
    appendSourceDocumentBacklinkOnSplitImport = getSplitSourceBacklinkPreference();
    wholeFileImportMode = 'reference';
    previewIndex = 0;
    searchQuery = '';
    searchFullTreeReady = false;
    showContent = false;
    importing = false;
    importProgress = { current: 0, total: 0 };
    isPdfImportMode = false;
    isEpubImportMode = false;
    outlineAllItems = [];
    outlineVisibleItems = [];
    outlineSelectedIds = new Set();
    outlineAvailableLevels = [];
    outlineSelectedLevels = [];
    outlineSelectionInitialized = false;
    loadingOutline = false;
    selectedDeckId = null;
    showNewDeckInput = false;
    newDeckName = '';
    schedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG };
    schedulingImpact = null;
    showSchedulingDetails = false;
    useCustomDays = false;
    customDaysValue = 21;
    initialImportOrderingMode = 'preserve-source-order';
    availableDecks = [];
    folderFileCountCache.clear();
  }

  function initializeTree() {
    const rootFolder = plugin.app.vault.getRoot();
    treeData = buildTreeChildren(rootFolder, false, false);
    initialized = true;
    setTimeout(() => { showContent = true; }, 50);
  }
  
  async function loadAvailableDecks(): Promise<void> {
    try {
      await services.init();
      const decks = await services.deckManager!.getAllDecks();
      availableDecks = decks.filter(d => !d.archivedAt);
      
      // 默认选中第一个牌组（如果有）
      if (availableDecks.length > 0 && !selectedDeckId) {
        selectedDeckId = availableDecks[0].id;
      }
    } catch (error) {
      logger.error('[MaterialImportModal] 加载牌组列表失败:', error);
    }
  }
  
  async function handleCreateNewDeck(): Promise<void> {
    if (!newDeckName.trim() || creatingDeck) return;
    
    creatingDeck = true;
    try {
      await services.init();
      const newDeck = await services.deckManager!.createDeck(newDeckName.trim());
      availableDecks = [...availableDecks, newDeck];
      selectedDeckId = newDeck.id;
      showNewDeckInput = false;
      newDeckName = '';
      logger.info(`[MaterialImportModal] 创建新牌组: ${newDeck.name}`);
    } catch (error) {
      logger.error('[MaterialImportModal] 创建牌组失败:', error);
    } finally {
      creatingDeck = false;
    }
  }
  
  function cancelNewDeck(): void {
    showNewDeckInput = false;
    newDeckName = '';
  }
  
  $effect(() => {
    if (open) {
      resetModalState();
      initializeTree();
    }
  });

  $effect(() => {
    if (!open) {
      return;
    }

    if (searchQuery.trim()) {
      void ensureFullTreeLoadedForSearch();
    }
  });
  
  // 当进入预览步骤时加载牌组列表 + 预匹配标签组
  $effect(() => {
    if (currentStep === 'preview') {
      loadAvailableDecks();
      preMatchTagGroup();
    }
  });

  $effect(() => {
    const host = splitSourceBacklinkSettingHost;
    if (!host) {
      return;
    }

    host.replaceChildren();

    if (!shouldShowSplitSourceBacklinkToggle()) {
      return;
    }

    new Setting(host)
      .setName('添加完整源文档溯源双链')
      .setDesc('启用后，在拆分生成的 Markdown 文件末尾追加指向原始完整源文档的双链。')
      .addToggle((toggle) => {
        toggle
          .setValue(appendSourceDocumentBacklinkOnSplitImport)
          .onChange((value) => {
            void saveSplitSourceBacklinkPreference(value);
          });
      });
  });

  async function preMatchTagGroup() {
    if (isPdfImportMode || isEpubImportMode) {
      previewTagGroupName = '';
      return;
    }
    try {
      const pluginAny = plugin as any;
      const service = pluginAny.irTagGroupService ?? new IRTagGroupService(plugin.app);
      if (!pluginAny.irTagGroupService) {
        await service.initialize();
        pluginAny.irTagGroupService = service;
      }
      irTagGroupService = service;

      // 取第一个选中文件进行预匹配
      const firstPath = selectedFilePaths[0] || selectedFilePath;
      if (firstPath) {
        const groupId = await service.matchGroupForDocument(firstPath, true);
        const allGroups = await service.getAllGroups();
        const matched = allGroups.find((g: any) => g.id === groupId);
        previewTagGroupName = matched?.name || (groupId === 'default' ? '默认' : groupId);
      } else {
        previewTagGroupName = '';
      }
    } catch {
      previewTagGroupName = '';
    }
  }

  onDestroy(() => {
    // 清理
  });
</script>

{#snippet MaterialImportModalContent()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="material-import-modal">
    {#if currentStep !== 'select'}
      <div class="step-indicator">
        <div class="step" class:completed={true} class:active={false}>
          <span class="step-num">1</span>
          <span class="step-label">选择</span>
        </div>
        <div class="step-line"></div>
        <div class="step" class:completed={currentStep === 'preview'} class:active={currentStep === 'split-mode' || currentStep === 'configure'}>
          <span class="step-num">2</span>
          <span class="step-label">{isPdfImportMode || isEpubImportMode ? '目录' : '拆分'}</span>
        </div>
        <div class="step-line"></div>
        <div class="step" class:active={currentStep === 'preview'}>
          <span class="step-num">3</span>
          <span class="step-label">确认</span>
        </div>
      </div>
    {/if}

    {#if currentStep === 'select'}
      <div class="step-content">
        <div class="search-bar">
          <ObsidianIcon name="search" size={16} />
          <input 
            type="text" 
            placeholder="搜索文件..." 
            bind:value={searchQuery}
            class="search-input"
          />
          {#if searchQuery}
            <button class="btn-icon-sm" onclick={() => searchQuery = ''}>
              <ObsidianIcon name="x" size={14} />
            </button>
          {/if}
        </div>

        <div class="toolbar">
          <span class="info-text">
            已选择 <strong>{selectedCount}</strong> 个文件
          </span>
        </div>

        <div class="tree-container">
          {#if filteredTreeData.length === 0}
            <div class="empty-state">
              <ObsidianIcon name={searchQuery ? 'search-x' : 'file-question'} size={32} />
              <p class="empty-text">{searchQuery ? '未找到匹配的文件' : '没有可导入的文件'}</p>
              <p class="empty-hint-text">{searchQuery ? '请尝试其他关键词' : 'Vault 中没有 Markdown / PDF / EPUB 文件'}</p>
            </div>
          {:else}
            {#each filteredTreeData as node (node.path)}
              {@render TreeNodeComponent(node, 0)}
            {/each}
          {/if}
        </div>
      </div>

      <footer class="modal-footer">
        {#if importing}
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: {importProgress.total > 0 ? (importProgress.current / importProgress.total * 100) : 0}%"></div>
            </div>
            <span class="progress-text">
              {#if isPdfImportMode}
                正在解析 PDF 目录...
              {:else if isEpubImportMode}
                正在解析 EPUB 目录...
              {:else}
                正在导入 {importProgress.current}/{importProgress.total}
              {/if}
            </span>
          </div>
        {:else}
          <button class="btn-primary" onclick={goToSplitModeStep} disabled={selectedCount === 0}>
            下一步 ({selectedCount})
            <ObsidianIcon name="arrow-right" size={14} />
          </button>
        {/if}
      </footer>
    {:else if currentStep === 'split-mode'}
      <div class="step-content step-content-framed">
        <div class="section-header">
          <h4 class="section-title">{getOutlineStepTitle()}</h4>
          <span class="badge">{visibleOutlineCount} 个{getOutlineUnitLabel()}</span>
        </div>

        <div class="step-body">
          {#if loadingOutline}
            <div class="empty-state step-fill-state">
              <p class="empty-text">正在解析{isPdfImportMode ? ' PDF' : ' EPUB'}目录...</p>
            </div>
          {:else if outlineAllItems.length === 0}
            <div class="empty-state step-fill-state">
              <ObsidianIcon name="file-question" size={32} />
              <p class="empty-text">未获取到{isPdfImportMode ? ' PDF' : ' EPUB'}目录</p>
              <p class="empty-hint-text">{isPdfImportMode ? '该 PDF 可能没有嵌入目录信息' : '该 EPUB 可能没有嵌入目录信息'}</p>
            </div>
          {:else if outlineSelectedLevels.length === 0}
            <div class="empty-state step-fill-state">
              <ObsidianIcon name="list" size={32} />
              <p class="empty-text">请至少选择一个目录层级</p>
              <p class="empty-hint-text">勾选上方层级按钮后再选择要导入的章节</p>
            </div>
          {:else}
            <div class="outline-stage">
              <div class="outline-selection-toolbar">
                <div class="config-group">
                  <span class="option-label">层级:</span>
                  <div class="checkbox-group">
                    {#each outlineAvailableLevels as level}
                      <button
                        class="level-btn"
                        class:active={outlineSelectedLevels.includes(level)}
                        onclick={() => toggleOutlineLevel(level)}
                      >
                        L{level}
                      </button>
                    {/each}
                  </div>
                  <div class="outline-toolbar-actions">
                    <button class="btn-secondary btn-compact" onclick={selectAllVisibleOutlineItems} disabled={outlineVisibleItems.length === 0 || allVisibleOutlineSelected}>
                      全选
                    </button>
                    <button class="btn-secondary btn-compact" onclick={clearVisibleOutlineItems} disabled={selectedOutlineCount === 0}>
                      全不选
                    </button>
                  </div>
                  <span class="info-text" style="margin-left: auto;">{selectedOutlineCount}/{visibleOutlineCount} 已选</span>
                </div>
              </div>

              <div class="pdf-outline-list">
                {#each outlineVisibleItems as item, i}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="outline-item outline-selectable"
                    class:selected={outlineSelectedIds.has(item.id)}
                    onclick={(event) => {
                      if ((event.target as HTMLElement).closest('.checkbox-wrapper')) return;
                      toggleOutlineItem(item.id);
                    }}
                    style="padding-left: {12 + (item.level - 1) * 16}px"
                  >
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <label class="checkbox-wrapper">
                      <input type="checkbox" checked={outlineSelectedIds.has(item.id)} onchange={() => toggleOutlineItem(item.id)} />
                      <span class="checkbox-box"></span>
                    </label>
                    <span class="outline-index">{i + 1}</span>
                    <span class="outline-title">{buildOutlineDisplayTitle(item)}</span>
                    {#if item.pageNumber}
                      <span class="outline-page">p.{item.pageNumber}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <footer class="modal-footer modal-footer-row">
        <button class="btn-secondary btn-compact" onclick={goBack}>
          <ObsidianIcon name="arrow-left" size={14} />
          上一步
        </button>
        <button class="btn-primary btn-compact" onclick={handleOutlineSelectionConfirm} disabled={selectedOutlineCount === 0}>
          下一步 ({selectedOutlineCount})
          <ObsidianIcon name="arrow-right" size={14} />
        </button>
      </footer>

    {:else if currentStep === 'configure'}
      <div class="step-content">
        <div class="section-header">
          <h4 class="section-title">配置拆分规则</h4>
        </div>

        <div class="config-form">
          <div class="config-group">
            <label class="config-toggle">
              <input type="checkbox" bind:checked={ruleSplitConfig.enableWholeFile} />
              <span class="toggle-label">整个文件作为一个块</span>
            </label>
            {#if ruleSplitConfig.enableWholeFile}
              <div class="config-options">
                <span class="option-hint">每个文件将作为一个完整的内容块，不进行拆分</span>
              </div>
            {/if}
          </div>

          <div class="config-group">
            <label class="config-toggle">
              <input type="checkbox" bind:checked={ruleSplitConfig.enableHeadingSplit} disabled={ruleSplitConfig.enableWholeFile} />
              <span class="toggle-label">按标题拆分</span>
            </label>
            {#if ruleSplitConfig.enableHeadingSplit}
              <div class="config-options">
                <span class="option-label">标题级别:</span>
                <div class="checkbox-group">
                  {#each [1, 2, 3, 4, 5, 6] as level}
                    <label class="checkbox-item">
                      <input 
                        type="checkbox" 
                        checked={ruleSplitConfig.headingLevels.includes(level)}
                        onchange={() => {
                          if (ruleSplitConfig.headingLevels.includes(level)) {
                            ruleSplitConfig.headingLevels = ruleSplitConfig.headingLevels.filter(l => l !== level);
                          } else {
                            ruleSplitConfig.headingLevels = [...ruleSplitConfig.headingLevels, level].sort();
                          }
                        }}
                      />
                      <span>H{level}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <div class="config-group">
            <label class="config-toggle">
              <input type="checkbox" bind:checked={ruleSplitConfig.enableBlankLineSplit} disabled={ruleSplitConfig.enableWholeFile} />
              <span class="toggle-label">按空行拆分</span>
            </label>
            {#if ruleSplitConfig.enableBlankLineSplit}
              <div class="config-options">
                <span class="option-label">连续空行数:</span>
                <input type="number" class="input-number" min="1" max="10" bind:value={ruleSplitConfig.blankLineCount} />
              </div>
            {/if}
          </div>

          <div class="config-group">
            <label class="config-toggle">
              <input type="checkbox" bind:checked={ruleSplitConfig.enableSymbolSplit} disabled={ruleSplitConfig.enableWholeFile} />
              <span class="toggle-label">按符号拆分</span>
            </label>
            {#if ruleSplitConfig.enableSymbolSplit}
              <div class="config-options">
                <span class="option-label">分隔符:</span>
                <input type="text" class="input-text" bind:value={ruleSplitConfig.splitSymbol} placeholder="例如: ---" />
              </div>
            {/if}
          </div>

          <div class="config-group">
            <label class="config-toggle">
              <input type="checkbox" bind:checked={ruleSplitConfig.filterEmptyBlocks} />
              <span class="toggle-label">过滤空内容块</span>
            </label>
          </div>

          <div class="config-group">
            <label class="config-toggle">
              <input type="checkbox" bind:checked={ruleSplitConfig.preserveHeadingAsTitle} />
              <span class="toggle-label">保留标题作为内容块标题</span>
            </label>
          </div>

          <div class="config-group">
            <div class="config-options">
              <span class="option-label">最小字符数:</span>
              <input type="number" class="input-number" min="0" max="1000" bind:value={ruleSplitConfig.minBlockCharCount} />
            </div>
          </div>
        </div>
      </div>

      <footer class="modal-footer modal-footer-row">
        <button class="btn-secondary btn-compact" onclick={goBack}>
          <ObsidianIcon name="arrow-left" size={14} />
          上一步
        </button>
        <button class="btn-primary btn-compact" onclick={handleRuleConfigConfirm}>
          下一步
          <ObsidianIcon name="arrow-right" size={14} />
        </button>
      </footer>

    {:else if currentStep === 'preview'}
      <div class="step-content preview-step">
        {#if isPdfImportMode}
          <div class="section-header">
            <h4 class="section-title">PDF 目录预览</h4>
            <span class="badge">{contentBlocks.length} 个书签</span>
          </div>
          <div class="pdf-outline-list">
            {#if contentBlocks.length === 0}
              <div class="empty-state">
                <ObsidianIcon name="file-question" size={32} />
                <p class="empty-text">未获取到 PDF 目录</p>
                <p class="empty-hint-text">该 PDF 可能没有嵌入目录信息</p>
              </div>
            {:else}
              {#each contentBlocks as block, i}
                <div class="outline-item">
                  <span class="outline-index">{i + 1}</span>
                  <span class="outline-title">{block.title || 'PDF'}</span>
                  {#if (block as any).pdfPageNumber}
                    <span class="outline-page">p.{(block as any).pdfPageNumber}</span>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {:else if isEpubImportMode}
          <div class="section-header">
            <h4 class="section-title">EPUB 章节预览</h4>
            <span class="badge">{contentBlocks.length} 个章节</span>
          </div>
          <div class="pdf-outline-list">
            {#each contentBlocks as block, i}
              <div class="outline-item">
                <span class="outline-index">{i + 1}</span>
                <span class="outline-title">{block.title || 'EPUB'}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="preview-header">
            <button class="btn-icon" onclick={() => previewIndex = Math.max(0, previewIndex - 1)} disabled={previewIndex === 0}>
              <ObsidianIcon name="chevron-left" size={18} />
            </button>
            <span class="nav-info">
              <strong>{previewIndex + 1}</strong> / {contentBlocks.length}
            </span>
            <button class="btn-icon" onclick={() => previewIndex = Math.min(contentBlocks.length - 1, previewIndex + 1)} disabled={previewIndex === contentBlocks.length - 1}>
              <ObsidianIcon name="chevron-right" size={18} />
            </button>
            <span class="preview-count">共 {contentBlocks.length} 个内容块</span>
            {#if previewTagGroupName}
              <span class="preview-tag-group">
                <ObsidianIcon name="tag" size={12} />
                {previewTagGroupName}
              </span>
            {/if}
          </div>

          <div class="preview-container">
            {#if contentBlocks.length > 0}
              <div class="preview-cards-wrapper">
                <div class="preview-card">
                  <div class="card-header">
                    <div class="card-meta-badges">
                      <span class="meta-badge">
                        <ObsidianIcon name="type" size={12} />
                        {contentBlocks[previewIndex]?.charCount || 0} 字
                      </span>
                      <span class="meta-badge">
                        <ObsidianIcon name="hash" size={12} />
                        {previewIndex + 1}
                      </span>
                    </div>
                  </div>

                  <div class="card-content">
                    <div class="content-scroll">
                      <pre class="preview-text">{contentBlocks[previewIndex]?.content || ''}</pre>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <footer class="modal-footer modal-footer-preview">
        <button class="btn-secondary btn-compact" onclick={goBack}>
          <ObsidianIcon name="arrow-left" size={14} />
          上一步
        </button>
        
        <!-- 时间分散选择器 -->
        <div class="scheduling-selector">
            <div class="selector-row">
              <span class="selector-label">分散到:</span>
              <button class="menu-trigger" onclick={showSchedulingDaysMenu}>
                {getSchedulingDaysLabel()}
                <ObsidianIcon name="chevron-down" size={12} />
              </button>
              {#if useCustomDays}
                <input 
                  type="number" 
                  class="custom-days-input" 
                  min="1" 
                  max="90"
                  placeholder="天数"
                  value={customDaysValue}
                  oninput={(e) => {
                    customDaysValue = parseInt(e.currentTarget.value) || 14;
                    schedulingConfig.distributionDays = customDaysValue;
                  }}
                />
              {/if}
              <button class="menu-trigger" onclick={showSchedulingStrategyMenu}>
                {getStrategyLabel()}
                <ObsidianIcon name="chevron-down" size={12} />
              </button>
              {#if shouldShowInitialImportOrderingSelector()}
                <span class="selector-label">首次导入:</span>
                <button class="menu-trigger" onclick={showInitialImportOrderingMenu}>
                  <span class="menu-trigger-text">{getInitialImportOrderingLabel()}</span>
                  <ObsidianIcon name="chevron-down" size={12} />
                </button>
              {/if}
              <button 
                class="btn-icon-sm" 
                onclick={() => {
                  showSchedulingDetails = !showSchedulingDetails;
                  if (!schedulingImpact) {
                    calculateSchedulingImpact();
                  }
                }} 
                title="查看分散详情"
              >
                <ObsidianIcon name="info" size={14} />
              </button>
            </div>
            {#if showSchedulingDetails}
              <div class="scheduling-impact-summary">
                {#if schedulingImpact}
                  <span class="impact-item">
                    <ObsidianIcon name="alert-triangle" size={12} />
                    超载天数: <strong>{schedulingImpact.overloadedDays}</strong>
                  </span>
                  <span class="impact-item">
                    <ObsidianIcon name="trending-up" size={12} />
                    峰值负载: <strong>{Math.round(schedulingImpact.peakLoadRate * 100)}%</strong>
                  </span>
                {:else}
                  <span class="impact-item">正在计算分散影响...</span>
                {/if}
              </div>
            {/if}

          </div>
          
          <!-- 牌组选择器 -->
        <div class="deck-selector">
            <span class="selector-label">专题:</span>
            {#if showNewDeckInput}
              <div class="new-deck-input">
                <input
                  type="text"
                  class="input-text deck-name-input"
                  placeholder="输入专题名称..."
                  bind:value={newDeckName}
                  onkeydown={(e) => e.key === 'Enter' && handleCreateNewDeck()}
                />
                <button class="btn-icon-sm" onclick={handleCreateNewDeck} disabled={creatingDeck || !newDeckName.trim()}>
                  <ObsidianIcon name="check" size={14} />
                </button>
                <button class="btn-icon-sm" onclick={cancelNewDeck}>
                  <ObsidianIcon name="x" size={14} />
                </button>
              </div>
            {:else}
              <button class="menu-trigger deck-trigger" onclick={showDeckSelectMenu}>
                {getSelectedDeckLabel()}
                <ObsidianIcon name="chevron-down" size={12} />
              </button>
            {/if}
        </div>

        {#if shouldShowWholeFileImportModeSelector()}
          <div class="deck-selector markdown-import-mode-selector">
            <span class="selector-label">导入方式:</span>
            <button class="menu-trigger folder-trigger" onclick={showWholeFileImportModeMenu}>
              <span class="menu-trigger-text">{getWholeFileImportModeLabel()}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
          </div>
        {/if}

        {#if shouldShowMarkdownImportFolderSelector()}
          <div class="deck-selector markdown-folder-selector">
            <span class="selector-label">MD 路径:</span>
            <button
              class="menu-trigger folder-trigger"
              onclick={showMarkdownImportFolderMenu}
              title={getMarkdownImportFolderLabel()}
            >
              <span class="menu-trigger-text">{getMarkdownImportFolderLabel()}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
          </div>
        {/if}

        {#if shouldShowSplitSourceBacklinkToggle()}
          <div class="split-source-backlink-toggle" bind:this={splitSourceBacklinkSettingHost}></div>
        {/if}
        
        <div class="footer-actions">
          <button class="btn-secondary btn-compact btn-back-mobile" onclick={goBack}>
            <ObsidianIcon name="arrow-left" size={14} />
            上一步
          </button>
          <button class="btn-primary btn-compact" onclick={isMultiFileMode ? handleBatchImport : handleSingleFileImport} disabled={contentBlocks.length === 0 || importing || !selectedDeckId}>
            {#if importing}
              导入中...
            {:else}
              确认导入
              <ObsidianIcon name="check" size={14} />
            {/if}
          </button>
        </div>
      </footer>
    {/if}
  </div>
{/snippet}

{#if useObsidianModal}
  {@render MaterialImportModalContent()}
{:else}
  <ResizableModal
    bind:open
    {onClose}
    {plugin}
    title={modalTitle}
    accentColor="cyan"
    enableWindowDrag={true}
    initialWidth={currentStep === 'select' ? 520 : 680}
    initialHeight={560}
  >
    {@render MaterialImportModalContent()}
  </ResizableModal>
{/if}

{#snippet TreeNodeComponent(node: TreeNode, depth: number)}
  <div class="tree-node" style="--depth: {depth}">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <svelte:element
      this={node.type === 'folder' ? 'button' : 'div'}
      class="node-row"
      class:selected={node.selected}
      class:indeterminate={node.indeterminate}
      type={node.type === 'folder' ? 'button' : undefined}
      tabindex={node.type === 'folder' ? undefined : -1}
      onclick={(e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.checkbox-wrapper')) return;
        const realNode = findNodeByPath(treeData, node.path) ?? node;
        if (realNode.type === 'folder') {
          void toggleExpand(realNode);
        } else {
          toggleSelect(realNode);
        }
      }}
    >
      {#if node.type === 'folder' && node.hasChildren}
        <span class="expand-icon" class:expanded={node.expanded}>
          <ObsidianIcon name="chevron-right" size={14} />
        </span>
      {:else if node.type === 'folder'}
        <span class="expand-icon placeholder"></span>
      {/if}

      <label class="checkbox-wrapper">
        <input 
          type="checkbox" 
          checked={node.selected}
          indeterminate={node.indeterminate}
          onchange={() => toggleSelect(findNodeByPath(treeData, node.path) ?? node)}
        />
        <span class="checkbox-box"></span>
      </label>

      <span class="node-icon">
        {#if node.type === 'folder'}
          <ObsidianIcon name={node.expanded ? 'folder-open' : 'folder'} size={16} />
        {:else}
          {@const ext = (node.path.split('.').pop() || '').toLowerCase()}
          <ObsidianIcon name={ext === 'epub' ? 'book-open' : ext === 'pdf' ? 'file' : 'file-text'} size={16} />
        {/if}
      </span>
      
      <span class="node-name" title={node.path}>{node.name}</span>

      {#if node.type === 'folder'}
        <span class="node-count">{node.fileCount ?? ''}</span>
      {/if}
    </svelte:element>

    {#if node.type === 'folder' && node.expanded && node.children.length > 0}
      <div class="node-children">
        {#each node.children as child (child.path)}
          {@render TreeNodeComponent(child, depth + 1)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .material-import-modal {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  :global(.weave-material-import-modal) {
    overflow: hidden;
  }

  :global(.weave-material-import-modal-content) {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  :global(.weave-material-import-modal-content > .material-import-modal) {
    flex: 1 1 0%;
    min-height: 0;
    height: 100%;
  }

  .step-indicator {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 0;
    padding: 12px 20px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 50px;
  }

  .step-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .step.active .step-num,
  .step.completed .step-num {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .step-label {
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
    white-space: nowrap;
  }

  .step.active .step-label {
    color: var(--interactive-accent);
    font-weight: 500;
  }

  .step.completed .step-label {
    color: var(--text-normal);
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: var(--background-modifier-border);
    margin-top: 13px;
    flex-shrink: 0;
  }

  .step.completed + .step-line {
    background: var(--interactive-accent);
  }

  .step-content {
    flex: 1 1 0%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .step-content-framed {
    overflow: hidden;
  }

  .step-body {
    flex: 1 1 0%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .step-fill-state {
    flex: 1 1 0%;
    min-height: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .preview-header {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .preview-header .btn-icon {
    flex-shrink: 0;
  }

  .preview-header .nav-info {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .preview-count {
    margin-left: auto;
    font-size: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .preview-tag-group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-accent);
    padding: 2px 8px;
    background: var(--background-secondary);
    border-radius: 4px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .section-title {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .badge {
    padding: 4px 10px;
    font-size: 12px;
    color: var(--interactive-accent);
    background: rgba(var(--interactive-accent-rgb), 0.1);
    border-radius: 12px;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 14px;
    outline: none;
  }

  .toolbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    gap: 12px;
    flex-shrink: 0;
  }

  .info-text {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .info-text strong {
    color: var(--interactive-accent);
  }

  .tree-container {
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 0;
    max-height: none;
    background: var(--background-primary);
    overscroll-behavior: contain;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    color: var(--text-muted);
    text-align: center;
    pointer-events: none;
  }
  
  .empty-text {
    margin: 12px 0 4px;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-normal);
  }
  
  .empty-hint-text {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .tree-node {
    --indent: calc(var(--depth, 0) * 20px);
    border-bottom: none;
    box-shadow: none;
  }

  .node-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: calc(100% - 16px);
    box-sizing: border-box;
    padding: 6px 16px 6px calc(16px + var(--indent));
    cursor: pointer;
    transition: background 0.15s;
    border-radius: 4px;
    margin: 1px 8px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    appearance: none;
    box-shadow: none;
    outline: none;
  }

  .node-row:hover {
    background: var(--background-modifier-hover);
  }

  .node-row.selected {
    background: rgba(var(--interactive-accent-rgb), 0.12);
  }

  .node-row.selected:hover {
    background: rgba(var(--interactive-accent-rgb), 0.18);
  }

  .expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: var(--text-faint);
    transition: transform 0.15s, color 0.15s;
  }

  .node-row:hover .expand-icon {
    color: var(--text-muted);
  }

  .expand-icon.expanded {
    transform: rotate(90deg);
  }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    cursor: pointer;
  }

  .checkbox-wrapper input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .checkbox-box {
    width: 16px;
    height: 16px;
    border: 2px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-secondary);
    transition: all 0.15s;
    position: relative;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .checkbox-wrapper:hover .checkbox-box {
    border-color: var(--interactive-accent);
    background: var(--background-primary);
  }

  .checkbox-wrapper input:checked + .checkbox-box {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .checkbox-wrapper input:checked + .checkbox-box::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border: solid var(--text-on-accent);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .node-row.indeterminate .checkbox-box {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .node-row.indeterminate .checkbox-box::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 5px;
    width: 8px;
    height: 2px;
    background: var(--text-on-accent);
  }

  .node-icon {
    display: flex;
    align-items: center;
    color: var(--text-faint);
  }

  .node-row:hover .node-icon {
    color: var(--text-muted);
  }

  .node-row.selected .node-icon {
    color: var(--interactive-accent);
  }

  .node-name {
    flex: 1;
    font-size: 13px;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-count {
    font-size: 11px;
    color: var(--text-faint);
    padding: 2px 8px;
    background: var(--background-modifier-border);
    border-radius: 10px;
  }

  .node-row.selected .node-count {
    background: rgba(var(--interactive-accent-rgb), 0.15);
    color: var(--interactive-accent);
  }

  .node-children {
    display: contents;
  }

  .config-form {
    padding: 16px 20px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    max-height: none;
    overscroll-behavior: contain;
  }

  .config-group {
    padding: 12px 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .config-group:last-child {
    border-bottom: none;
  }

  .config-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    width: fit-content;
  }

  .config-toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 14px;
    color: var(--text-normal);
  }

  .config-options {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding-left: 26px;
  }

  .option-label {
    font-size: 13px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-normal);
    cursor: pointer;
  }

  .checkbox-item input {
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .input-number {
    width: 70px;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .input-number:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }

  .input-text {
    flex: 1;
    max-width: 200px;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .input-text:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }

  .pdf-outline-list {
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 0;
    max-height: none;
    overscroll-behavior: contain;
  }

  .outline-stage {
    flex: 1 1 0%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .outline-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background 0.1s;
  }

  .outline-item:last-child {
    border-bottom: none;
  }

  .outline-item:hover {
    background: var(--background-modifier-hover);
  }

  .outline-index {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
  }

  .outline-title {
    flex: 1;
    font-size: 13px;
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .outline-page {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-faint);
    padding: 2px 6px;
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .preview-container {
    flex: 1 1 0%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .preview-step {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .preview-cards-wrapper {
    flex: 1;
    padding: 20px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-card {
    width: 100%;
    max-width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    border: 2px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .preview-card:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
    border-color: var(--interactive-accent);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 20px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .card-meta-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .meta-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .content-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    overscroll-behavior: contain;
  }

  .nav-info {
    font-size: 14px;
    color: var(--text-muted);
    min-width: 80px;
    text-align: center;
  }

  .nav-info strong {
    color: var(--interactive-accent);
    font-size: 16px;
  }

  .preview-text {
    margin: 0;
    font-family: var(--font-text);
    font-size: 14px;
    line-height: 1.8;
    color: var(--text-normal);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid var(--background-modifier-border);
    gap: 8px;
    flex-wrap: wrap;
    flex-shrink: 0;
    margin-top: auto;
  }

  .modal-footer-row {
    justify-content: flex-start;
  }

  .modal-footer-preview {
    flex-wrap: wrap;
  }

  .footer-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .split-source-backlink-toggle {
    min-width: 280px;
    flex: 1 1 320px;
  }

  .split-source-backlink-toggle :global(.setting-item) {
    border: none;
    padding: 0;
  }

  .split-source-backlink-toggle :global(.setting-item-info) {
    min-width: 0;
  }

  .btn-compact {
    padding: 6px 12px;
    font-size: 13px;
  }

  .btn-back-mobile {
    display: none;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-icon:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .btn-icon:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-icon-sm {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }

  .btn-icon-sm:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-secondary:hover {
    background: var(--background-secondary);
    border-color: var(--text-muted);
  }

  .btn-primary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .progress-bar-container {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 0.2s;
  }

  .progress-text {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* 时间分散选择器样式 */
  .scheduling-selector {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }

  .selector-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .selector-label {
    font-size: 13px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .custom-days-input {
    width: 60px;
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .custom-days-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .scheduling-impact-summary {
    display: flex;
    gap: 16px;
    padding: 8px 0 4px;
    font-size: 12px;
  }

  .impact-item {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-muted);
  }

  .impact-item strong {
    color: var(--text-normal);
  }

  /* 牌组选择器样式 */
  .deck-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .menu-trigger-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-trigger:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-muted);
  }

  .deck-trigger {
    flex: 1;
    justify-content: space-between;
  }

  .markdown-folder-selector {
    min-width: 0;
  }

  .markdown-import-mode-selector {
    min-width: 0;
  }

  .folder-trigger {
    min-width: 220px;
    max-width: 320px;
    justify-content: space-between;
  }

  .new-deck-input {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .deck-name-input {
    width: 150px;
    padding: 4px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 13px;
  }

  .deck-name-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2);
  }

  @media (max-width: 640px) {
    .modal-footer {
      padding: 10px 12px;
      gap: 8px;
    }

    .modal-footer-row {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 8px;
    }

    .modal-footer-row .btn-compact {
      flex: 1;
      min-width: 0;
      justify-content: center;
      padding: 10px 8px;
      font-size: 13px;
      white-space: nowrap;
    }

    .modal-footer-preview {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }

    .modal-footer-preview > .btn-compact:first-child {
      display: none;
    }

    .scheduling-selector {
      width: 100%;
    }

    .deck-selector {
      width: 100%;
    }

    .markdown-folder-selector {
      width: 100%;
    }

    .markdown-import-mode-selector {
      width: 100%;
    }

    .footer-actions {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      width: 100%;
      gap: 8px;
    }

    .split-source-backlink-toggle {
      width: 100%;
      min-width: 0;
      flex-basis: 100%;
    }

    .footer-actions .btn-compact {
      flex: 1;
      justify-content: center;
      padding: 10px 8px;
      font-size: 13px;
    }

    .btn-back-mobile {
      display: flex;
    }

    .selector-row {
      flex-wrap: wrap;
      gap: 8px;
    }

    .new-deck-input {
      width: 100%;
    }

    .folder-trigger {
      width: 100%;
      max-width: none;
    }

    .deck-name-input {
      width: 100%;
      font-size: 13px;
    }
  }

  .outline-selection-toolbar {
    padding: 12px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .outline-selection-toolbar .config-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .outline-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .level-btn {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .level-btn:hover {
    border-color: var(--interactive-accent);
    color: var(--text-normal);
  }

  .level-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }

  .outline-item.outline-selectable {
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .outline-item.outline-selectable:hover,
  .outline-item.outline-selectable.selected {
    background: var(--background-modifier-hover);
  }

  .outline-item.outline-selectable .checkbox-wrapper {
    margin-right: 4px;
    flex-shrink: 0;
  }
</style>
