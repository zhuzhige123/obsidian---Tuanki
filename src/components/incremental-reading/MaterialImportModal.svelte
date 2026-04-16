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
  import { onMount, onDestroy, untrack } from 'svelte';
  import { TFolder, TFile, Notice, normalizePath, Menu } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import { logger } from '../../utils/logger';
  import { getReadingMaterialDueAt } from '../../utils/ir-topic-compat';
  import { resolveIRImportFolder } from '../../config/paths';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import type { BatchImportResult } from '../../services/incremental-reading/ReadingMaterialManager';
  import { getServices } from './IRDeckView.svelte';
  import type { IRDeck, IRChunkFileData } from '../../types/ir-types';
  
  import type { ImportStep, SplitMode, RuleSplitConfig as RuleSplitConfigType, ContentBlock } from '../../types/content-split-types';
  import { DEFAULT_RULE_SPLIT_CONFIG, SPLIT_MARKER_REGEX, generateSplitMarker } from '../../types/content-split-types';
  import { splitByRules, parseManualSplitMarkers } from '../../utils/content-split-utils';
  import { IRChunkFileService } from '../../services/incremental-reading/IRChunkFileService';
  import { IRPointWriteService } from '../../services/incremental-reading/IRPointWriteService';
  import { IRTagGroupService } from '../../services/incremental-reading/IRTagGroupService';
  import { IRPdfBookmarkTaskService } from '../../services/incremental-reading/IRPdfBookmarkTaskService';
  import { IREpubBookmarkTaskService } from '../../services/incremental-reading/IREpubBookmarkTaskService';
  import { IRV4SchedulerService } from '../../services/incremental-reading/IRV4SchedulerService';
  import { createEpubReaderEngine } from '../../services/epub';
  import { EpubStorageService } from '../../services/epub/EpubStorageService';
  import type { TocItem } from '../../services/epub/types';
  import type { SchedulingConfig, SchedulingImpact } from '../../types/ir-import-scheduling';
  import { DEFAULT_SCHEDULING_CONFIG, SCHEDULING_PRESETS } from '../../types/ir-import-scheduling';
  import { IRImportSchedulingService, type IRLoadInfo } from '../../services/incremental-reading/IRImportSchedulingService';
  import { getProjectedDayLoad, getProjectedScheduleSummary } from '../../services/incremental-reading/IRProjectedScheduleSummary';
  import { recomputeAndBroadcastIRData } from '../../services/incremental-reading/IRScheduleRefreshService';
  import { extractBodyContent } from '../../utils/yaml-utils';
  import { ReadingCategory } from '../../types/incremental-reading-types';
  import { createDefaultChunkFileData, generateChunkId, generateSourceId } from '../../types/ir-types';

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
          const created = await pointWriteService.createPdfPoint({
            deckId: selectedDeckId,
            pdfPath,
            title: block.title || 'PDF',
            link: linkText,
            priorityUi: 5
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

      await recomputeAndBroadcastIRData(plugin.app, 'import_materials');
      onImportComplete({ success, skipped, errors });
      onClose();
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

  const IMPORTABLE_EXTENSIONS = new Set(['md', 'pdf', 'epub']);
  const PDF_OUTLINE_SIZE_LIMIT_BYTES = 32 * 1024 * 1024;

  let treeData = $state<TreeNode[]>([]);
  let searchFullTreeReady = $state(false);
  let searchQuery = $state('');
  let showContent = $state(false);
  let importing = $state(false);
  let importProgress = $state({ current: 0, total: 0 });
  
  let currentStep = $state<ImportStep>('select');
  let splitMode = $state<SplitMode | null>(null);
  let ruleSplitConfig = $state<RuleSplitConfigType>({ ...DEFAULT_RULE_SPLIT_CONFIG });
  let fileContent = $state('');
  let editedContent = $state('');

  interface ImportContentBlock extends ContentBlock {
    sourceFilePath?: string;
    pdfPageNumber?: number;
  }

  interface EpubFlatItem {
    id: string;
    label: string;
    href: string;
    level: number;
    filePath: string;
    sourceId?: string;
    bookTitle: string;
  }

  let contentBlocks = $state<ImportContentBlock[]>([]);
  let selectedFilePath = $state<string | null>(null);
  let selectedFilePaths = $state<string[]>([]);
  let selectedRootFolderPaths = $state<string[]>([]);
  
  let textareaEl: HTMLTextAreaElement | null = $state(null);
  let previewIndex = $state(0);
  let initialized = $state(false);
  
  // 牌组选择相关状态
  let availableDecks = $state<IRDeck[]>([]);
  let selectedDeckId = $state<string | null>(null);
  let showNewDeckInput = $state(false);
  let newDeckName = $state('');
  let creatingDeck = $state(false);
  const services = untrack(() => getServices(plugin.app, plugin.settings?.incrementalReading?.importFolder));
  
  // v5.0 文件化块服务
  let chunkFileService: IRChunkFileService | null = $state(null);

  let irTagGroupService: IRTagGroupService | null = $state(null);
  
  // 时间分散调度相关状态
  let schedulingConfig = $state<SchedulingConfig>({ ...DEFAULT_SCHEDULING_CONFIG });
  let schedulingImpact = $state<SchedulingImpact | null>(null);
  let showSchedulingDetails = $state(false);
  let useCustomDays = $state(false);
  let customDaysValue = $state(21);

  let isPdfImportMode = $state(false);
  let isEpubImportMode = $state(false);
  let previewTagGroupName = $state('');

  // EPUB-specific state
  let epubTocTree = $state<TocItem[]>([]);
  let epubMaxTocLevel = $state(0);
  let epubSplitLevel = $state(1);
  let epubFlatItems = $state<EpubFlatItem[]>([]);
  let epubSelectedItems = $state<Set<string>>(new Set());
  let loadingToc = $state(false);
  let epubFilePath = $state('');

  function getSchedulingDailyBudgetMinutes(): number {
    return plugin.settings.incrementalReading?.dailyTimeBudgetMinutes || 60;
  }

  function estimateContentBlockMinutes(block: ContentBlock, fallbackChars = 500): number {
    const explicitCharCount = Number((block as any)?.charCount || 0);
    const contentLength = typeof block?.content === 'string' ? block.content.length : 0;
    const charCount = contentLength > 0 ? contentLength : explicitCharCount > 0 ? explicitCharCount : fallbackChars;
    return Math.max(1, Math.ceil(charCount / 500));
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
      case 'split-mode': return '选择拆分方式';
      case 'configure': return splitMode === 'manual' ? '手动拆分' : '配置拆分规则';
      case 'preview': return isPdfImportMode ? '确认导入 PDF 材料' : isEpubImportMode ? '确认导入 EPUB 材料' : '预览拆分结果';
      default: return '导入阅读材料';
    }
  });
  
  const filteredTreeData = $derived.by(() => {
    if (!searchQuery.trim()) return treeData;
    return filterTree(treeData, searchQuery.toLowerCase());
  });

  const isMultiFileMode = $derived(selectedFilePaths.length > 1);
  
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

  function getBookNameForFilePath(filePath: string): string | null {
    if (!filePath) return null;
    const normalizedFilePath = normalizePath(filePath);
    const normalizedRoots = (selectedRootFolderPaths || []).map(p => normalizePath(p)).filter(Boolean);
    let bestRoot: string | null = null;
    for (const root of normalizedRoots) {
      if (root && normalizedFilePath.startsWith(root + '/')) {
        if (!bestRoot || root.length > bestRoot.length) {
          bestRoot = root;
        }
      }
    }
    if (!bestRoot) return null;
    const parts = bestRoot.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
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

  function getMarkerCount(content: string): number {
    const matches = content.match(SPLIT_MARKER_REGEX);
    return matches ? matches.length : 0;
  }

  function insertManualMarker(): void {
    if (!textareaEl) return;
    
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const scrollTop = textareaEl.scrollTop;
    const marker = generateSplitMarker();
    
    const before = editedContent.substring(0, start);
    const after = editedContent.substring(end);
    
    editedContent = before + '\n' + marker + '\n' + after;

    requestAnimationFrame(() => {
      if (textareaEl) {
        const newPos = start + marker.length + 2;
        textareaEl.focus();
        textareaEl.setSelectionRange(newPos, newPos);
        textareaEl.scrollTop = scrollTop;
      }
    });
  }

  async function goToSplitModeStep(): Promise<void> {
    const paths = getSelectedPaths(treeData);
    if (paths.length === 0) return;
    
    selectedFilePaths = paths;
    selectedRootFolderPaths = getSelectedRootFolderPaths(treeData);

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
      await preparePdfImportPreview(paths);
      return;
    }

    if (paths.length === 1) {
      selectedFilePath = paths[0];
      try {
        const file = plugin.app.vault.getAbstractFileByPath(selectedFilePath);
        if (file instanceof TFile) {
          const rawContent = await plugin.app.vault.read(file);
          fileContent = extractBodyContent(rawContent);
          editedContent = fileContent;
        }
      } catch (error) {
        logger.error('[MaterialImportModal] 读取文件失败:', error);
      }
    } else {
      selectedFilePath = null;
      fileContent = '';
      editedContent = '';
    }
    
    currentStep = 'split-mode';
  }

  async function preparePdfImportPreview(filePaths: string[]): Promise<void> {
    isPdfImportMode = true;
    selectedFilePath = filePaths.length === 1 ? filePaths[0] : null;
    importing = true;
    importProgress = { current: 0, total: filePaths.length };

    try {
      const blocks: ImportContentBlock[] = [];
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
          const id = `pdf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          blocks.push({
            id,
            title: tfile.basename,
            content: `[[${tfile.path}|${tfile.basename}]]`,
            charCount: tfile.basename.length,
            startOffset: 0,
            endOffset: 0,
            sourceFilePath: tfile.path
          });
          continue;
        }

        for (const it of items) {
          const id = `pdf-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const title = it.path.length > 0 ? it.path.join(' / ') : it.title;
          const pageNumber = typeof it.pageNumber === 'number' ? it.pageNumber : 0;
          blocks.push({
            id,
            title,
            content: pageNumber > 0 ? `[[${tfile.path}#page=${pageNumber}|${title}]]` : `[[${tfile.path}|${title}]]`,
            charCount: title.length,
            startOffset: 0,
            endOffset: 0,
            sourceFilePath: tfile.path,
            pdfPageNumber: pageNumber > 0 ? pageNumber : undefined
          });
        }
      }

      contentBlocks = blocks;
      currentStep = 'preview';
    } catch (error) {
      logger.error('[MaterialImportModal] 解析 PDF 目录失败:', error);
      new Notice(`解析 PDF 目录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      importing = false;
    }
  }

  function getMatchedBlocksForFile(
    filePath: string,
    allBlocks: ContentBlock[],
    fallbackStartIndex: number,
    fallbackCount: number,
    isManualSingleFile: boolean
  ): ContentBlock[] {
    if (isManualSingleFile) {
      return allBlocks;
    }

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
    nextRepDate?: number
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
      existing.updatedAt = Date.now();
      (existing.meta as any) = { ...(existing.meta || {}), externalDocument: true };
      await storage.saveChunkData(existing);
      return;
    }

    const chunk = createDefaultChunkFileData(generateChunkId(), generateSourceId(), file.path) as IRChunkFileData;
    chunk.deckIds = [deckId];
    chunk.deckTag = `#IR_deck_${deckName}`;
    chunk.nextRepDate = effectiveNextRepDate;
    chunk.intervalDays = 1;
    chunk.scheduleStatus = 'queued';
    chunk.updatedAt = Date.now();
    (chunk.meta as any) = { ...(chunk.meta || {}), externalDocument: true };
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
    const isManualSingleFile = splitMode === 'manual' && filePaths.length === 1;

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
          isManualSingleFile ? contentBlocks.length : 1,
          isManualSingleFile
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
            nextReviewAt: assignments?.get(block)
          };
        });

        const createdMaterials = await materialManager.createSplitMarkdownMaterials(file, splitBlocks, {
          source: 'manual',
          category: ReadingCategory.Later,
          priority: 50,
          tags: ['weave-incremental-reading'],
          deckId: selectedDeckId
        });

        for (const material of createdMaterials) {
          const createdFile = plugin.app.vault.getAbstractFileByPath(material.filePath);
          if (!(createdFile instanceof TFile)) {
            continue;
          }

          const dueAt = getReadingMaterialDueAt(material);
          const nextRepDate = dueAt ? new Date(dueAt).getTime() : undefined;
          await ensureExternalDocumentChunkScheduled(createdFile, selectedDeckId, selectedDeck.name, nextRepDate);
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

  /**
   * 安全提取 PDF 目录。
   *
   * 优先走稳定的 pdf.js 直读路径；如果当前平台或运行环境不可用，
   * 则直接回退为整本 PDF 导入，不再访问 Obsidian 私有 PDF 视图对象，
   * 以避免跨平台 renderer 崩溃。
   */
  async function getPdfOutlineDirect(pdfFile: TFile): Promise<Array<{ title: string; pageNumber: number; path: string[] }> | null> {
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib?.getDocument) return null;

    let loadingTask: any = null;
    try {
      const fileSize = Number(pdfFile.stat?.size ?? 0);
      if (fileSize > PDF_OUTLINE_SIZE_LIMIT_BYTES) {
        logger.warn('[MaterialImportModal] PDF 过大，跳过目录提取并回退为整本导入:', {
          pdf: pdfFile.path,
          size: fileSize
        });
        return [];
      }

      const arrayBuffer = await plugin.app.vault.readBinary(pdfFile);
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdfDocument = await Promise.race([
        loadingTask.promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF load timeout')), 10000))
      ]);

      try {
        const outline = await pdfDocument.getOutline();
        if (!Array.isArray(outline) || outline.length === 0) return [];

        const results: Array<{ title: string; pageNumber: number; path: string[] }> = [];
        const resolvePageNumber = async (item: any): Promise<number> => {
          const dest = item?.dest;
          if (!dest) return 0;
          try {
            const destArray = typeof dest === 'string' ? await pdfDocument.getDestination(dest) : dest;
            if (!Array.isArray(destArray) || destArray.length === 0) return 0;
            const idx = await pdfDocument.getPageIndex(destArray[0]);
            return typeof idx === 'number' && !Number.isNaN(idx) ? idx + 1 : 0;
          } catch { return 0; }
        };

        const walk = async (items: any[], ancestors: string[]) => {
          for (const it of items) {
            const title = String(it?.title || '').trim() || '目录';
            const nextPath = [...ancestors, title];
            const pageNumber = await resolvePageNumber(it);
            results.push({ title, pageNumber, path: nextPath });
            const children = it?.items ?? it?.children;
            if (Array.isArray(children) && children.length > 0) {
              await walk(children, nextPath);
            }
          }
        };

        await walk(outline, []);
        logger.debug('[MaterialImportModal] PDF outline via pdfjsLib:', { pdf: pdfFile.path, count: results.length });
        return results;
      } finally {
        try { pdfDocument.destroy(); } catch {}
      }
    } catch (e) {
      try { loadingTask?.destroy(); } catch {}
      logger.debug('[MaterialImportModal] pdfjsLib outline failed, falling back to leaf:', e);
      return null;
    }
  }

  async function getPdfOutlineItemsSafely(pdfFile: TFile): Promise<Array<{ title: string; pageNumber: number; path: string[] }>> {
    const directResult = await getPdfOutlineDirect(pdfFile);
    if (directResult !== null) return directResult;

    logger.warn('[MaterialImportModal] 未能安全提取 PDF 目录，回退为整本导入以避免访问不稳定的 PDF 内部视图:', {
      pdf: pdfFile.path
    });
    return [];
  }

  function handleSplitModeSelect(mode: SplitMode): void {
    splitMode = mode;
    currentStep = 'configure';
  }

  // --- EPUB functions ---
  async function prepareEpubSplitStep(paths: string[]): Promise<void> {
    isEpubImportMode = true;
    epubFilePath = paths.length === 1 ? paths[0] : '';
    selectedFilePath = paths.length === 1 ? paths[0] : null;
    loadingToc = true;
    importProgress = { current: 0, total: paths.length };
    const epubStorageService = new EpubStorageService(plugin.app);

    try {
      const mergedTocTree: TocItem[] = [];
      let maxDepth = 0;

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
          maxDepth = Math.max(maxDepth, getEpubMaxDepth(tocItems));
          mergedTocTree.push({
            id: filePath,
            label: tfile.basename,
            href: '',
            level: 0,
            subitems: tocItems.map((item) =>
              attachEpubItemContext(item, filePath, tfile.basename, sourceEntry?.sourceId)
            )
          });
        } finally {
          readerService.destroy();
        }
      }

      epubTocTree = mergedTocTree;
      epubMaxTocLevel = maxDepth;
      epubSplitLevel = Math.max(1, Math.min(epubSplitLevel || 1, maxDepth || 1));
      refreshEpubFlatItems();
      currentStep = 'split-mode';
    } catch (e) {
      logger.error('[MaterialImportModal] EPUB TOC loading failed:', e);
      new Notice(`EPUB 目录加载失败: ${e instanceof Error ? e.message : '未知错误'}`);
      isEpubImportMode = false;
    } finally {
      loadingToc = false;
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

  function getEpubMaxDepth(items: TocItem[]): number {
    let max = 0;
    for (const item of items) {
      max = Math.max(max, item.level);
      if (item.subitems && item.subitems.length > 0) {
        max = Math.max(max, getEpubMaxDepth(item.subitems));
      }
    }
    return max;
  }

  function flattenEpubToc(items: TocItem[], maxLevel: number): EpubFlatItem[] {
    const result: EpubFlatItem[] = [];
    const walk = (list: TocItem[], filePath = '', bookTitle = '', sourceId = '') => {
      for (const item of list) {
        const nextSourceId = sourceId || String((item as any).sourceId || item.id.split('::')[0] || '');
        const nextFilePath = filePath || String((item as any).filePath || '');
        const nextBookTitle = bookTitle || String((item as any).bookTitle || item.label);
        if (item.href && item.level <= maxLevel) {
          result.push({
            id: item.id,
            label: item.label,
            href: item.href,
            level: item.level,
            filePath: nextFilePath,
            sourceId: nextSourceId || undefined,
            bookTitle: nextBookTitle
          });
        }
        if (item.subitems && item.subitems.length > 0) {
          walk(item.subitems, nextFilePath, nextBookTitle, nextSourceId);
        }
      }
    };
    walk(items);
    return result;
  }

  function refreshEpubFlatItems(): void {
    const nextItems = flattenEpubToc(epubTocTree, epubSplitLevel);
    const previousSelection = new Set(epubSelectedItems);
    epubFlatItems = nextItems;
    epubSelectedItems = previousSelection.size > 0
      ? new Set(nextItems.filter(item => previousSelection.has(item.id)).map(item => item.id))
      : new Set(nextItems.map(item => item.id));
  }

  function toggleEpubItem(id: string) {
    const next = new Set(epubSelectedItems);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    epubSelectedItems = next;
  }

  function handleEpubSplitConfirm() {
    const selected = epubFlatItems.filter(i => epubSelectedItems.has(i.id));
    if (selected.length === 0) {
      new Notice('请至少选择一个章节');
      return;
    }
    contentBlocks = selected.map((item, idx) => ({
      id: `epub-${idx}`,
      title: isMultiFileMode ? `${item.bookTitle} - ${item.label}` : item.label,
      content: item.href,
      charCount: item.label.length,
      startOffset: 0,
      endOffset: 0,
      sourceFilePath: item.filePath
    }));
    currentStep = 'preview';
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

      const selected = epubFlatItems.filter(i => epubSelectedItems.has(i.id));
      const existingHrefMap = new Map<string, Set<string>>();
      const epubStorageService = new EpubStorageService(plugin.app);
      const selectedIdentities = new Map<string, { filePath: string; sourceId?: string }>();
      for (const item of selected) {
        const normalizedPath = String(item.filePath || '').trim();
        if (!normalizedPath) {
          continue;
        }
        const sourceEntry = item.sourceId
          ? await epubStorageService.ensureSourceIdentity(normalizedPath, { preferredSourceId: item.sourceId })
          : await epubStorageService.ensureSourceIdentity(normalizedPath);
        if (sourceEntry?.sourceId) {
          item.sourceId = sourceEntry.sourceId;
        }
        const identityKey = sourceEntry?.sourceId || item.sourceId || normalizedPath;
        if (!selectedIdentities.has(identityKey)) {
          selectedIdentities.set(identityKey, {
            filePath: normalizedPath,
            sourceId: sourceEntry?.sourceId || item.sourceId
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

      const newItems = selected.filter((item) => {
        const identityKey = item.sourceId || item.filePath;
        return !existingHrefMap.get(identityKey)?.has(item.href);
      });

      let assignments: Map<ContentBlock, Date> | null = null;
      if (contentBlocks.length > 0) {
        const schedulingResult = await calculateProjectedScheduling(contentBlocks, () => 5);
        schedulingImpact = schedulingResult.impact;
        assignments = schedulingResult.assignments;
      }

      const inputs = newItems.map((item, idx) => {
        let nextRepDate = 0;
        if (assignments) {
          const block = contentBlocks.find(b => b.content === item.href && b.sourceFilePath === item.filePath);
          const assignedDate = block ? assignments.get(block) : null;
          if (assignedDate) {
            nextRepDate = assignedDate.getTime();
          }
        }

        return {
          deckId: selectedDeckId!,
          epubFilePath: item.filePath,
          sourceId: item.sourceId,
          title: item.label,
          tocHref: item.href,
          tocLevel: item.level,
          priorityUi: 5,
          nextRepDate
        };
      });

      const created = await pointWriteService.batchCreateEpubPoints(inputs);
      const success = created.length;
      const skipped = selected.length - newItems.length;

      importProgress = { current: contentBlocks.length, total: contentBlocks.length };
      new Notice(`EPUB 导入完成: ${success} 个任务创建, ${skipped} 个已跳过`);

      await recomputeAndBroadcastIRData(plugin.app, 'import_materials');
      onImportComplete({ success, skipped, errors: [] });
      onClose();
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
        if (isEpubImportMode) {
          currentStep = 'select';
          isEpubImportMode = false;
          epubTocTree = [];
          epubFlatItems = [];
          epubSelectedItems = new Set();
          epubFilePath = '';
          selectedFilePaths = [];
        } else {
          currentStep = 'select';
          splitMode = null;
          selectedFilePaths = [];
        }
        break;
      case 'configure':
        currentStep = 'split-mode';
        break;
      case 'preview':
        if (isPdfImportMode) {
          currentStep = 'select';
          splitMode = null;
          selectedFilePath = null;
          selectedFilePaths = [];
          contentBlocks = [];
          isPdfImportMode = false;
        } else if (isEpubImportMode) {
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

  function handleManualEditConfirm(): void {
    contentBlocks = parseManualSplitMarkers(editedContent).map(block => ({
      ...block,
      sourceFilePath: selectedFilePath || undefined
    }));
    currentStep = 'preview';
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
      onImportComplete({ success: result.successCount, skipped: 0, errors: result.errorCount > 0 ? [{ path: '', error: `${result.errorCount} 个文件导入失败` }] : [] });
      onClose();
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
      onImportComplete({ success: result.successCount, skipped: 0, errors: result.errorCount > 0 ? [{ path: selectedFilePath || '', error: '导入失败' }] : [] });
      onClose();
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
      
      // 初始化文件化块服务
      if (!chunkFileService) {
        const outputRoot = plugin.settings?.incrementalReading?.importFolder;
        chunkFileService = new IRChunkFileService(plugin.app, outputRoot);
      }
      
      // v5.5: 获取选中牌组的信息，构建 deckTag
      const selectedDeck = availableDecks.find(d => d.id === selectedDeckId);
      const deckTag = selectedDeck ? `#IR_deck_${selectedDeck.name}` : '#IR_deck_未分配';
      const deckNames = selectedDeck ? [selectedDeck.name] : ['未分配'];

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
        const mdResult = await importMdFilesAsSourceDocuments(mdFilePaths, assignments);
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
      
      const books = new Map<string, {
        bookTitle: string;
        bookIndexPath: string;
        chapterEntries: Array<{
          title: string;
          indexPath: string;
          chunkEntries: Array<{ title: string; filePath: string }>;
        }>;
      }>();

      const filesByBook = new Map<string, TFile[]>();
      const chunkIds: string[] = [];
      
      for (const filePath of nonMdFilePaths) {
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const derivedBookName = getBookNameForFilePath(file.path);
          const bookName = derivedBookName || file.parent?.name || 'Unsorted';
          if (!filesByBook.has(bookName)) {
            filesByBook.set(bookName, []);
          }
          filesByBook.get(bookName)!.push(file);
        }
      }
      
      let processedCount = mdFilePaths.length;
      for (const [bookName, bookFiles] of filesByBook) {
        for (let i = 0; i < bookFiles.length; i++) {
          const originalFile = bookFiles[i];
          processedCount++;
          importProgress = { current: processedCount, total: filePaths.length };
          
          try {
            logger.info(`[MaterialImportModal] 正在导入: ${originalFile.basename} (书籍: ${bookName})`);

            let matchedTagGroup = 'default';
            try {
              matchedTagGroup = await tagGroupService!.matchGroupForDocument(originalFile.path, true);
            } catch (error) {
              logger.warn('[MaterialImportModal] 标签组匹配失败，回退 default:', error);
              matchedTagGroup = 'default';
            }
            
            const useManualBlocks = splitMode === 'manual' && filePaths.length === 1;
            const result = useManualBlocks
              ? await chunkFileService.importFileAsChunksFromBlocks(originalFile, contentBlocks, {
                  splitConfig: ruleSplitConfig,
                  tagGroup: matchedTagGroup,
                  initialPriority: 5,
                  deckTag: deckTag,
                  deckNames: deckNames,
                  bookFolderName: bookName !== 'Unsorted' ? bookName : undefined
                })
              : await chunkFileService.importFileAsChunks(originalFile, {
                  splitConfig: ruleSplitConfig,
                  tagGroup: matchedTagGroup,
                  initialPriority: 5,
                  deckTag: deckTag,
                  deckNames: deckNames,
                  bookFolderName: bookName !== 'Unsorted' ? bookName : undefined
                });
          
          // v5.5: 设置块的 deckIds（使用正式牌组ID）
          if (selectedDeckId) {
            for (const chunkData of result.chunkDataList) {
              chunkData.deckIds = [selectedDeckId];
            }
          }
          
          if (assignments) {
            const normalizedFilePath = normalizePath(originalFile.path);
            const blocksForFile = contentBlocks.filter(b =>
              b.sourceFilePath && normalizePath(b.sourceFilePath) === normalizedFilePath
            );

            const isManualSingleFile = splitMode === 'manual' && filePaths.length === 1;
            const fallbackStartIndex = chunkIds.length;
            const fallbackEndIndex = fallbackStartIndex + result.chunkDataList.length;
            const fallbackBlocks = contentBlocks.slice(fallbackStartIndex, fallbackEndIndex);

            const blocksToUse = isManualSingleFile
              ? contentBlocks
              : (blocksForFile.length > 0 ? blocksForFile : fallbackBlocks);
            const minLen = Math.min(blocksToUse.length, result.chunkDataList.length);

            if (!isManualSingleFile && blocksForFile.length > 0 && blocksForFile.length !== result.chunkDataList.length) {
              logger.warn('[MaterialImportModal] 导入块数量与预览不一致:', {
                file: originalFile.path,
                previewBlocks: blocksForFile.length,
                importedChunks: result.chunkDataList.length
              });
            }

            for (let idx = 0; idx < minLen; idx++) {
              const block = blocksToUse[idx];
              const assignedDate = assignments.get(block);
              if (assignedDate) {
                result.chunkDataList[idx].nextRepDate = assignedDate.getTime();
                result.chunkDataList[idx].intervalDays = 1;
                result.chunkDataList[idx].scheduleStatus = 'queued' as any;
              }
            }
          }
          
          // 保存源材料元数据和块调度数据到存储
          await services.storageService!.saveSource(result.sourceMeta);
          await services.storageService!.saveChunkDataBatch(result.chunkDataList);
          
          // 收集块ID用于添加到牌组
          chunkIds.push(...result.chunkDataList.map(c => c.chunkId));
          successCount++;
          
          const bookKey = bookName || 'Unsorted';
          if (!books.has(bookKey)) {
            books.set(bookKey, {
              bookTitle: bookKey,
              bookIndexPath: result.indexFilePath,
              chapterEntries: []
            });
          }

          const bookAgg = books.get(bookKey)!;
          if (!bookAgg.bookIndexPath) {
            bookAgg.bookIndexPath = result.indexFilePath;
          }
          bookAgg.chapterEntries.push({
            title: originalFile.basename,
            indexPath: result.indexFilePath,
            chunkEntries: result.chunkDataList.map((c, idx) => ({
              title: result.chunkFilePaths[idx]?.replace(/^.*\//, '').replace(/\.md$/, '').replace(/^\d+_/, '') || `块 ${idx + 1}`,
              filePath: result.chunkFilePaths[idx] || ''
            }))
          });
          
          logger.info(`[MaterialImportModal] 文件化块导入成功: ${originalFile.basename}, ${result.chunkDataList.length} 个块文件`);
        } catch (importError) {
          errorCount++;
          logger.error(`[MaterialImportModal] 文件化块导入失败: ${originalFile.path}`, importError);
          // 显示错误通知
          new Notice(`导入失败: ${originalFile.basename} - ${importError instanceof Error ? importError.message : '未知错误'}`);
        }
      }
    }
      
      for (const [bookKey, bookAgg] of books) {
        if (bookAgg.chapterEntries.length === 0 || !bookAgg.bookTitle) continue;
        try {
          // v6.2: 按牌组入口索引卡片组织，不再混写书籍到单一总索引
          await chunkFileService.ensureDeckIndexCard(selectedDeck?.name || '未分配');
          logger.info(`[MaterialImportModal] 牌组入口索引更新成功: ${selectedDeck?.name || '未分配'}`);
        } catch (indexError) {
          logger.warn(`[MaterialImportModal] 牌组入口索引更新失败:`, indexError);
        }
      }
      
      logger.info(`[MaterialImportModal] 文件化块导入完成: 成功 ${successCount}, 失败 ${errorCount}, 共生成 ${chunkIds.length} 个块`);
      
      if (chunkIds.length > 0) {
        new Notice(`导入完成: ${successCount} 个文件, ${chunkIds.length} 个内容块`);
      }
      
      return { successCount, errorCount, chunkCount: chunkIds.length };
    } catch (error) {
      logger.error('[MaterialImportModal] 文件化块导入失败:', error);
      new Notice(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { successCount: 0, errorCount: filePaths.length, chunkCount: 0 };
    }
  }

  function handleKeydown(_e: KeyboardEvent): void {
  }

  function handleEditorKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      insertManualMarker();
    }
  }

  function resetModalState() {
    currentStep = 'select';
    splitMode = null;
    selectedFilePath = null;
    selectedFilePaths = [];
    selectedRootFolderPaths = [];
    contentBlocks = [];
    fileContent = '';
    editedContent = '';
    previewIndex = 0;
    searchQuery = '';
    searchFullTreeReady = false;
    showContent = false;
    importing = false;
    importProgress = { current: 0, total: 0 };
    isPdfImportMode = false;
    isEpubImportMode = false;
    epubTocTree = [];
    epubMaxTocLevel = 0;
    epubSplitLevel = 1;
    epubFlatItems = [];
    epubSelectedItems = new Set();
    loadingToc = false;
    epubFilePath = '';
    selectedDeckId = null;
    showNewDeckInput = false;
    newDeckName = '';
    schedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG };
    schedulingImpact = null;
    showSchedulingDetails = false;
    useCustomDays = false;
    customDaysValue = 21;
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

  $effect(() => {
    if (currentStep === 'configure' && splitMode === 'manual') {
      document.addEventListener('keydown', handleEditorKeydown);
      return () => {
        document.removeEventListener('keydown', handleEditorKeydown);
      };
    }
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
        <div class="step" class:completed={currentStep === 'configure' || currentStep === 'preview'} class:active={currentStep === 'split-mode'}>
          <span class="step-num">2</span>
          <span class="step-label">{isPdfImportMode ? '目录' : '拆分'}</span>
        </div>
        <div class="step-line"></div>
        <div class="step" class:active={currentStep === 'configure' || currentStep === 'preview'}>
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
            <span class="progress-text">{isPdfImportMode ? '正在解析 PDF 目录...' : `正在导入 ${importProgress.current}/${importProgress.total}`}</span>
          </div>
        {:else}
          <button class="btn-primary" onclick={goToSplitModeStep} disabled={selectedCount === 0}>
            下一步 ({selectedCount})
            <ObsidianIcon name="arrow-right" size={14} />
          </button>
        {/if}
      </footer>

    {:else if currentStep === 'split-mode'}
      {#if isEpubImportMode}
        <div class="step-content">
          <div class="section-header">
            <h4 class="section-title">EPUB 目录拆分</h4>
            <span class="badge">{epubFlatItems.length} 个章节</span>
          </div>

          {#if loadingToc}
            <div class="empty-state">
              <p class="empty-text">正在解析 EPUB 目录...</p>
            </div>
          {:else if epubFlatItems.length === 0}
            <div class="empty-state">
              <ObsidianIcon name="file-question" size={32} />
              <p class="empty-text">未获取到 EPUB 目录</p>
              <p class="empty-hint-text">该 EPUB 可能没有嵌入目录信息</p>
            </div>
          {:else}
            <div class="epub-split-config">
              <div class="config-group">
                <span class="option-label">拆分深度:</span>
                <div class="checkbox-group">
                  {#each Array.from({ length: epubMaxTocLevel }, (_, i) => i + 1) as level}
                    <button
                      class="level-btn"
                      class:active={epubSplitLevel === level}
                      onclick={() => { epubSplitLevel = level; refreshEpubFlatItems(); }}
                    >
                      L{level}
                    </button>
                  {/each}
                </div>
                <span class="info-text" style="margin-left: auto;">{epubSelectedItems.size}/{epubFlatItems.length} 已选</span>
              </div>
            </div>

            <div class="pdf-outline-list">
              {#each epubFlatItems as item, i}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="outline-item epub-selectable"
                  class:selected={epubSelectedItems.has(item.id)}
                  onclick={(event) => {
                    if ((event.target as HTMLElement).closest('.checkbox-wrapper')) return;
                    toggleEpubItem(item.id);
                  }}
                  style="padding-left: {12 + (item.level - 1) * 16}px"
                >
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <label class="checkbox-wrapper">
                    <input type="checkbox" checked={epubSelectedItems.has(item.id)} onchange={() => toggleEpubItem(item.id)} />
                    <span class="checkbox-box"></span>
                  </label>
                  <span class="outline-index">{i + 1}</span>
                  <span class="outline-title">{item.label}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <footer class="modal-footer modal-footer-row">
          <button class="btn-secondary btn-compact" onclick={goBack}>
            <ObsidianIcon name="arrow-left" size={14} />
            上一步
          </button>
          <button class="btn-primary btn-compact" onclick={handleEpubSplitConfirm} disabled={epubSelectedItems.size === 0}>
            下一步 ({epubSelectedItems.size})
            <ObsidianIcon name="arrow-right" size={14} />
          </button>
        </footer>
      {:else}
        <div class="step-content">
          <div class="section-header">
            <h4 class="section-title">选择拆分方式</h4>
            {#if isMultiFileMode}
              <span class="badge">批量处理 {selectedFilePaths.length} 个文件</span>
            {/if}
          </div>

          <div class="mode-list">
            <button class="mode-card" onclick={() => handleSplitModeSelect('rule')}>
              <div class="mode-icon">
                <ObsidianIcon name="list-tree" size={24} />
              </div>
              <div class="mode-info">
                <div class="mode-name">规则拆分</div>
              </div>
              <ObsidianIcon name="chevron-right" size={18} />
            </button>

            {#if !isMultiFileMode}
              <button class="mode-card" onclick={() => handleSplitModeSelect('manual')}>
                <div class="mode-icon">
                  <ObsidianIcon name="scissors" size={24} />
                </div>
                <div class="mode-info">
                  <div class="mode-name">手动拆分</div>
                </div>
                <ObsidianIcon name="chevron-right" size={18} />
              </button>
            {/if}
          </div>
        </div>

        <footer class="modal-footer modal-footer-row">
          <button class="btn-secondary btn-compact" onclick={goBack}>
            <ObsidianIcon name="arrow-left" size={14} />
            上一步
          </button>
        </footer>
      {/if}

    {:else if currentStep === 'configure' && splitMode === 'rule'}
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

    {:else if currentStep === 'configure' && splitMode === 'manual'}
      <div class="step-content editor-step">
        <div class="section-header">
          <h4 class="section-title">手动拆分</h4>
          <button class="btn-outline" onclick={insertManualMarker}>
            <ObsidianIcon name="plus" size={14} />
            插入拆分标记
          </button>
        </div>

        <div class="editor-hint">
          <ObsidianIcon name="info" size={14} />
          <span>将光标放在需要拆分的位置，按 <kbd>Ctrl+Shift+D</kbd> 或点击按钮插入拆分标记</span>
        </div>

        <div class="editor-container">
          <textarea
            bind:this={textareaEl}
            bind:value={editedContent}
            class="content-editor"
            placeholder="文件内容为空..."
            spellcheck="false"
          ></textarea>
        </div>

        <div class="editor-stats">
          <span class="stat-item">
            <ObsidianIcon name="scissors" size={14} />
            已标记 <strong>{getMarkerCount(editedContent)}</strong> 个拆分位置
          </span>
          <span class="stat-divider"></span>
          <span class="stat-item">
            将生成 <strong>{getMarkerCount(editedContent) + 1}</strong> 个内容块
          </span>
        </div>
      </div>

      <footer class="modal-footer modal-footer-row">
        <button class="btn-secondary btn-compact" onclick={goBack}>
          <ObsidianIcon name="arrow-left" size={14} />
          上一步
        </button>
        <button class="btn-primary btn-compact" onclick={handleManualEditConfirm}>
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
    height: auto;
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
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .step-content.editor-step {
    max-height: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
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
    flex: 1;
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

  .mode-list {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mode-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    border: 2px solid var(--background-modifier-border);
    border-radius: 10px;
    background: var(--background-primary);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    overflow: hidden;
  }

  .mode-card:hover {
    border-color: var(--interactive-accent);
    background: rgba(var(--interactive-accent-rgb), 0.05);
  }

  .mode-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    min-width: 48px;
    min-height: 48px;
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .mode-card:hover .mode-icon {
    color: var(--interactive-accent);
    background: rgba(var(--interactive-accent-rgb), 0.1);
    border-color: var(--interactive-accent);
  }

  .mode-info {
    flex: 1;
  }

  .mode-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 4px;
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

  .editor-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--background-primary-alt);
    font-size: 12px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .editor-hint kbd {
    padding: 2px 6px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-secondary);
    font-family: var(--font-monospace);
    font-size: 11px;
    color: var(--text-normal);
  }

  .editor-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .content-editor {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 12px 20px;
    border: none;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-monospace);
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    outline: none;
  }

  .editor-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
    font-size: 12px;
    color: var(--text-muted);
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-item strong {
    color: var(--interactive-accent);
  }

  .stat-divider {
    width: 1px;
    height: 12px;
    background: var(--background-modifier-border);
  }

  .pdf-outline-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 0;
    max-height: none;
    overscroll-behavior: contain;
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
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .preview-step {
    display: flex;
    flex-direction: column;
    height: 100%;
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

  .btn-outline {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-normal);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-outline:hover {
    background: var(--background-secondary);
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
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

  .menu-trigger:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-muted);
  }

  .deck-trigger {
    flex: 1;
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

    .footer-actions {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      width: 100%;
      gap: 8px;
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

    .deck-name-input {
      width: 100%;
      font-size: 13px;
    }
  }

  .epub-split-config {
    padding: 12px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .epub-split-config .config-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
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

  .outline-item.epub-selectable {
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .outline-item.epub-selectable:hover {
    background: var(--background-modifier-hover);
  }

  .outline-item.epub-selectable .checkbox-wrapper {
    margin-right: 4px;
    flex-shrink: 0;
  }
</style>
