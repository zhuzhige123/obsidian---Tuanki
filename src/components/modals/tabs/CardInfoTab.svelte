<script lang="ts">
  import { logger } from '../../../utils/logger';
  // 静态导入 parseSourceInfo，确保响应式追踪正常
  import { parseEpubSourceInfo, parseSourceInfo, getCardProperty } from '../../../utils/yaml-utils';
  import { detectCardTypeFromContent } from '../../../utils/card-markdown-serializer';

  import { onMount } from 'svelte';
  import { Platform } from 'obsidian';
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import ResolvedDeckRefs from '../../ui/ResolvedDeckRefs.svelte';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';
  import { extractSourcePath } from '../../../utils/source-path-matcher';
  import { truncateText } from '../../../utils/ui-helpers';
  import { Notice, MarkdownView } from 'obsidian';
  import type { WeavePlugin } from '../../../main';
  import type { Card } from '../../../data/types';
  import type { ResolvedDeckRef } from '../../../types/emergent-deck-types';
  import { DerivationMethod } from '../../../services/relation/types';
  //  导入国际化
  import { tr } from '../../../utils/i18n';
  // 导入卡片关系工具函数
  import {
    buildVirtualTimeline,
    getTimelineDisplayMode,
    getCardPreview,
    getDerivationMethodName,
    formatTimelineTimestamp,
    type CardHistoryEvent,
    type TimelineDisplayMode
  } from '../../../utils/card-relation-helpers';
  import { writeSystemClipboardText } from '../../../utils/system-clipboard';
  //  卡片详情模态窗改用全局方法 plugin.openViewCardModal()

  //  移动端检测
  const isMobile = Platform.isMobile;

  interface Props {
    card: Card;
    plugin: WeavePlugin;
    deckName: string;
    templateName: string;
    resolvedDeckRefs?: ResolvedDeckRef[];
  }

  let { card, plugin, deckName, templateName, resolvedDeckRefs = [] }: Props = $props();

  //  响应式翻译函数
  let t = $derived($tr);

  // 父子卡片关系状态
  let parentCard = $state<Card | null>(null);
  let siblingCards = $state<Card[]>([]);
  let loadingRelations = $state(false);

  // 时间线状态
  let timelineEvents = $state<CardHistoryEvent[]>([]);
  let timelineMode = $state<TimelineDisplayMode>('simple');
  let expandedTimeline = $state(false);
  let expandedSiblings = $state(false);

  // 浮窗由全局方法处理，这里不维护本地状态

  // 源记忆卡片预览状态
  let sourceMemoryCard = $state<Card | null>(null);
  let loadingSourceCard = $state(false);

  // 检测是否为测试卡片（题库考试）
  const isTestCard = $derived(
    card.cardPurpose === 'test' && card.metadata?.sourceCardId
  );

  // 获取源记忆卡片 ID
  const sourceCardId = $derived(
    card.metadata?.sourceCardId as string
  );

  // 响应式来源信息，使用统一的 parseSourceInfo 工具函数
  // 静态导入可确保响应式追踪正常工作
  let sourceInfo = $derived.by(() => {
    // 显式访问 card.content 建立响应式依赖
    const content = card?.content;
    if (!content) return { sourceFile: card?.sourceFile, sourceBlock: card?.sourceBlock };
    
    const parsed = parseSourceInfo(content);
    const epubSource = parseEpubSourceInfo(content);
    return {
      sourceFile: epubSource.sourceFile || parsed.sourceFile || card?.sourceFile,
      sourceBlock: parsed.sourceBlock || card?.sourceBlock,
      refs: parsed.refs,
      epubCfi: epubSource.cfi,
      epubText: epubSource.text,
      epubChapter: epubSource.chapter,
    };
  });

  let sourceDocumentStatus = $derived.by(() => {
    const sourcePath = sourceInfo.sourceFile || card?.sourceFile || '';
    if (!sourcePath) {
      return { known: false, exists: false };
    }

    const abstractFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
    return {
      known: true,
      exists: !!abstractFile,
    };
  });

  function formatEpubLocationSummary(text: string | undefined, chapter: number | undefined): string | null {
    const trimmedText = String(text || '').trim().replace(/\s+/g, ' ');
    if (trimmedText) {
      return trimmedText.length > 72 ? `${trimmedText.slice(0, 72)}…` : trimmedText;
    }
    if (chapter !== undefined) {
      return `${t('modals.cardInfoTab.labels.locationInfo')} ${chapter}`;
    }
    return null;
  }

  // 复制UUID
  async function copyUUID() {
    const copied = await writeSystemClipboardText(card.uuid);
    new Notice(copied ? t('modals.cardInfoTab.copyUUID') : '复制 UUID 失败');
  }

  // 跳转到来源文档，并定位高亮目标内容
  // 使用 Obsidian 原生 openLinkText API，支持仅文件名格式
  async function navigateToSource() {
    try {
      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      const filePath =
        sourceInfo.sourceFile ||
        card.sourceFile ||
        (card.customFields?.obsidianFilePath as string | undefined) ||
        extractSourcePath(card) ||
        undefined;
      const blockId =
        sourceInfo.sourceBlock?.replace(/^\^/, '') ||
        card.sourceBlock?.replace(/^\^/, '') ||
        (card.customFields?.blockId as string | undefined);
      
      if (!filePath) {
        new Notice(t('modals.cardInfoTab.noSource'));
        return;
      }

      if (filePath.toLowerCase().endsWith('.epub')) {
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
          new Notice(t('modals.cardInfoTab.sourceDeleted'));
          return;
        }

        const { EpubLinkService } = await import('../../../services/epub-integration/EpubLinkService');
        const linkService = new EpubLinkService(plugin.app);
        await linkService.navigateToEpubLocation(filePath, sourceInfo.epubCfi || '', sourceInfo.epubText || '');
        new Notice(t('modals.cardInfoTab.openedSource'));
        return;
      }
      
      // 使用 openLinkText 处理 wikilink 格式，支持仅文件名
      const docName = filePath.replace(/\.md$/, '');
      
      // 验证文件是否存在，防止创建新文档
      const file = plugin.app.metadataCache.getFirstLinkpathDest(docName, contextPath);
      if (!file) {
        new Notice(t('modals.cardInfoTab.sourceDeleted'));
        return;
      }
      
      const linkText = blockId ? `${docName}#^${blockId}` : docName;
      
      // 使用 Obsidian 原生 API 跳转，自动处理文件查找和块定位
      await plugin.app.workspace.openLinkText(linkText, contextPath, true);
      new Notice(t('modals.cardInfoTab.jumpedToSource'));
    } catch (error) {
      logger.error('[CardInfoTab] 跳转到源文档失败:', error);
      new Notice(t('modals.cardInfoTab.navigateFailed'));
    }
  }

  // 获取卡片状态字符串
  function getCardStatusString(state: number): string {
    switch (state) {
      case 0: return t('modals.cardInfoTab.status.new');
      case 1: return t('modals.cardInfoTab.status.learning');
      case 2: return t('modals.cardInfoTab.status.review');
      case 3: return t('modals.cardInfoTab.status.relearning');
      default: return t('modals.cardInfoTab.status.unknown');
    }
  }

  // 获取卡片类型显示名
  //  优先 card.type → YAML we_type → 内容自动检测
  function getCardTypeName(card: Card): string {
    let resolvedType: string = card.type || '';
    if (!resolvedType) {
      resolvedType = getCardProperty<string>(card.content, 'we_type') || '';
    }
    if (!resolvedType && card.content) {
      resolvedType = detectCardTypeFromContent(card.content) as string;
    }
    switch (resolvedType) {
      case 'basic': 
        return t('modals.cardInfoTab.cardTypes.basic');
      case 'cloze': 
        return t('modals.cardInfoTab.cardTypes.cloze');
      case 'progressive-parent':
        return t('modals.cardInfoTab.cardTypes.progressiveParent');
      case 'progressive-child':
        return t('modals.cardInfoTab.cardTypes.progressiveChild');
      case 'multiple':
        return t('modals.cardInfoTab.cardTypes.choice');
      case 'code':
        return t('modals.cardInfoTab.cardTypes.code');
      default: 
        return resolvedType || t('modals.cardInfoTab.status.unknown');
    }
  }

  function getDerivationMethodLabel(method: string | undefined): string {
    if (!method) return t('modals.cardInfoTab.createAction');
    if (method === 'ai-split') return t('modals.cardInfoTab.methodAiSplit');
    if (method === 'cloze-progressive') return t('modals.cardInfoTab.methodProgressive');
    if (method === 'manual') return t('modals.cardInfoTab.methodManual');
    return getDerivationMethodName(method, (key) => t(key));
  }

  // 通过 UUID 查找卡片
  async function findCardByUUID(uuid: string): Promise<Card | null> {
    try {
      //  使用DirectFileCardReader，O(1)索引查询
      return await plugin.directFileReader.getCardByUUID(uuid);
    } catch (error) {
      logger.error('[CardInfoTab] 查找卡片失败:', error);
      return null;
    }
  }

  // 加载卡片关系数据
  async function loadCardRelations() {
    if (loadingRelations) return;
    
    try {
      loadingRelations = true;

      // 构建虚拟时间线
      timelineEvents = buildVirtualTimeline(card);

      // 加载父卡片
      if (card.parentCardId) {
        parentCard = await findCardByUUID(card.parentCardId);
      }

      // 加载兄弟卡片
      if (parentCard?.relationMetadata?.childCardIds) {
        const siblingIds = parentCard.relationMetadata.childCardIds.filter(
          (id: string) => id !== card.uuid
        );
        const loadedSiblings = await Promise.all(
          siblingIds.map((id: string) => findCardByUUID(id))
        );
        siblingCards = loadedSiblings.filter((c): c is Card => c !== null);
      }

      // 决定时间线显示模式
      timelineMode = getTimelineDisplayMode(card, timelineEvents.length, siblingCards.length);

      logger.debug('[CardInfoTab] 关系数据加载完成:', {
        parentCard: !!parentCard,
        siblingCount: siblingCards.length,
        timelineMode,
        eventsCount: timelineEvents.length
      });
    } catch (error) {
      logger.error('[CardInfoTab] 加载关系数据失败:', error);
    } finally {
      loadingRelations = false;
    }
  }

  // 打开查看卡片浮窗，使用全局方法
  function viewCard(cardToView: Card) {
    //  使用全局模态窗，支持在其他标签页上方显示
    plugin.openViewCardModal(cardToView);
  }

  // 切换时间线展开状态
  function toggleTimeline() {
    expandedTimeline = !expandedTimeline;
  }

  // 切换兄弟卡片展开状态
  function toggleSiblings() {
    expandedSiblings = !expandedSiblings;
  }
  // 查看全部兄弟卡片，并导航到卡片管理页面筛选
  async function viewAllSiblingCards() {
    // 收集所有兄弟卡片ID（包括当前卡片和其他兄弟）
    const allSiblingIds: string[] = [];
    
    // 添加当前卡片
    if (card.uuid) {
      allSiblingIds.push(card.uuid);
    } else {
      // 向后兼容：如果没有uuid，跳过
    }
    
    // 添加其他兄弟卡片
    siblingCards.forEach(sibling => {
      if (sibling.uuid) {
        allSiblingIds.push(sibling.uuid);
      }
    });

    if (allSiblingIds.length === 0) {
      new Notice(t('modals.cardInfoTab.noSiblingCards'));
      return;
    }

    logger.debug('[CardInfoTab] 查看全部兄弟卡片:', allSiblingIds);

    try {
      // 1. 先激活 Weave 插件视图（切换到插件标签页）
      if (plugin && typeof (plugin as any).activateView === 'function') {
        // 使用常量而非硬编码字符串
        const { VIEW_TYPE_WEAVE } = await import('../../../views/WeaveView');
        await (plugin as any).activateView(VIEW_TYPE_WEAVE);
        logger.debug('[CardInfoTab] 已激活 Weave 插件视图');
      }

      // 2. 导航到卡片管理页面
      window.dispatchEvent(new CustomEvent('Weave:navigate', {
        detail: 'weave-card-management'
      }));

      // 3. 延迟一小段时间，确保页面已加载，然后应用筛选
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('Weave:filter-by-cards', {
          detail: {
            cardIds: allSiblingIds,
            filterName: t('modals.cardInfoTab.viewSiblingCards', { count: allSiblingIds.length }),
            parentCardPreview: parentCard ? getCardPreview(parentCard, 50) : undefined
          }
        }));
      }, 150);

      // 4. 提示用户
      new Notice(t('modals.cardInfoTab.filteringSiblingCards', { count: allSiblingIds.length }));
    } catch (error) {
      logger.error('[CardInfoTab] 激活视图失败:', error);
      new Notice(t('modals.cardInfoTab.switchViewFailed'));
    }
  }

  // 加载源记忆卡片
  async function loadSourceMemoryCard() {
    const cardId = sourceCardId;
    if (!cardId || loadingSourceCard) return;

    loadingSourceCard = true;
    try {
      const allCards = await plugin.dataStorage.getCards();
      const sourceCard = allCards.find(c => c.uuid === cardId);
      
      if (sourceCard) {
        sourceMemoryCard = sourceCard;
      }
    } catch (error) {
      logger.error('[CardInfoTab] 获取源记忆卡片失败:', error);
    } finally {
      loadingSourceCard = false;
    }
  }

  // 查看源记忆卡片，使用全局方法
  function viewSourceMemoryCard() {
    if (sourceMemoryCard) {
      plugin.openViewCardModal(sourceMemoryCard);
    }
  }

  // 初始化时加载关系数据
  onMount(() => {
    loadCardRelations();
    // 如果是测试卡片，自动加载源记忆卡片
    if (card.cardPurpose === 'test' && card.metadata?.sourceCardId) {
      loadSourceMemoryCard();
    }
  });
</script>

<div class="card-info-tab" class:mobile={isMobile} role="tabpanel" id="info-panel">
  <!-- 基本信息区 -->
  <section class="info-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-red" class:mobile={isMobile}>
      {t('modals.cardInfoTab.basicInfo')}
    </h3>
    
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.uuid')}</span>
        <span class="info-value">
          <button class="uuid-button" onclick={copyUUID} title={t('modals.cardInfoTab.labels.clickToCopy')}>
            <EnhancedIcon name="hash" size={12} />
            <span>{truncateText(card.uuid, isMobile ? 20 : 32)}</span>
          </button>
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.labels.cardType')}</span>
        <span class="info-value">{getCardTypeName(card)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.labels.cardStatus')}</span>
        <span class="info-value">
          <span class="status-badge">{getCardStatusString(card.fsrs?.state || 0)}</span>
        </span>
      </div>

      <!-- 卡片关系类型（多标签显示） -->
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.labels.cardRelation')}</span>
        <span class="info-value">
          <div class="relation-badges-group">
            {#if card.parentCardId}
              <!-- 子卡片主标签 -->
              <span class="relation-badge child-card">
                <EnhancedIcon name="file-text" size={12} />
                {t('modals.cardInfoTab.childCard')}
              </span>
              
              <!-- 拆分方式标签 -->
              {#if card.relationMetadata?.derivationMetadata?.method}
                {#if card.relationMetadata.derivationMetadata.method === 'ai-split'}
                  <span class="relation-badge method-badge ai-method">
                    <EnhancedIcon name="git-branch" size={12} /> {t('modals.cardInfoTab.methodAiSplit')}
                  </span>
                {:else if card.relationMetadata.derivationMetadata.method === 'cloze-progressive'}
                  <span class="relation-badge method-badge cloze-method">
                    <EnhancedIcon name="git-branch" size={12} /> {t('modals.cardInfoTab.methodProgressive')}
                  </span>
                {:else if card.relationMetadata.derivationMetadata.method === 'manual'}
                  <span class="relation-badge method-badge manual-method">
                    <EnhancedIcon name="scissors" size={12} /> {t('modals.cardInfoTab.methodManual')}
                  </span>
                {:else}
                  <span class="relation-badge method-badge">
                    {getDerivationMethodLabel(card.relationMetadata.derivationMetadata.method)}
                  </span>
                {/if}
              {/if}
              
            {:else if card.relationMetadata?.isParent || (card.relationMetadata?.childCardIds && card.relationMetadata.childCardIds.length > 0)}
              <!-- 父卡片主标签 -->
              <span class="relation-badge parent-card">
                <EnhancedIcon name="folder" size={12} />
                {t('modals.cardInfoTab.parentCard')}
              </span>
              
              <!-- 子卡片数量标签 -->
              {#if card.relationMetadata?.childCardIds}
                <span class="relation-badge count-badge">
                  <EnhancedIcon name="users" size={12} /> {t('modals.cardInfoTab.childCount', { count: card.relationMetadata.childCardIds.length })}
                </span>
              {/if}
              
            {:else}
              <!-- 独立卡片标签 -->
              <span class="relation-badge normal-card">
                {t('modals.cardInfoTab.independentCard')}
              </span>
            {/if}
          </div>
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.deckLabel')}</span>
        <span class="info-value">{deckName}</span>
      </div>

      {#if resolvedDeckRefs.length > 0}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('modals.cardInfoTab.labels.referencedByDecks')}</span>
          <span class="info-value">
            <ResolvedDeckRefs refs={resolvedDeckRefs} showLabel={false} emptyText="" />
          </span>
        </div>
      {/if}

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.createdAt')}</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.created)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.updatedAt')}</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.modified)}</span>
      </div>

      {#if card.priority}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('modals.cardInfoTab.priority')}</span>
          <span class="info-value">
            <span class="priority-badge priority-{card.priority}">P{card.priority}</span>
          </span>
        </div>
      {/if}
    </div>
  </section>

  <!-- 标签区 -->
  {#if card.tags && card.tags.length > 0}
    <section class="info-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-purple" class:mobile={isMobile}>
        {t('modals.cardInfoTab.tags')}
      </h3>
      <div class="tags-container">
        {#each card.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    </section>
  {/if}

  <!-- 溯源信息区 -->
  <section class="info-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-orange" class:mobile={isMobile}>
      {t('modals.cardInfoTab.sourceInfo')}
    </h3>
    
    <!-- 使用响应式 sourceInfo 从 content YAML 实时解析 -->
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.sourceFile')}</span>
        <span class="info-value">
          {#if sourceInfo.sourceFile}
            <button class="link-button" onclick={navigateToSource} title={t('modals.cardInfoTab.labels.navigateToSource')}>
              <EnhancedIcon name="external-link" size={12} />
              <span>{sourceInfo.sourceFile}</span>
            </button>
          {:else}
            <span class="text-muted">{t('modals.cardInfoTab.notLinked')}</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
	        <span class="info-label">{t('modals.cardInfoTab.labels.locationInfo')}</span>
	        <span class="info-value">
	          {#if sourceInfo.epubCfi}
	            <span class="mono" title={sourceInfo.epubCfi}>
	              {formatEpubLocationSummary(sourceInfo.epubText, sourceInfo.epubChapter) || sourceInfo.epubCfi}
	            </span>
	          {:else if sourceInfo.sourceBlock}
	            <span class="mono">{truncateText(sourceInfo.sourceBlock || '', 30)}</span>
	          {:else}
	            <span class="text-muted">{t('modals.cardInfoTab.labels.noLocation')}</span>
	          {/if}
	        </span>
	      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.sourceBlock')}</span>
        <span class="info-value">
          {#if sourceInfo.sourceBlock}
            <span class="mono">{truncateText(sourceInfo.sourceBlock || '', 30)}</span>
          {:else}
            <span class="text-muted">{t('modals.cardInfoTab.labels.noBlockReference')}</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">{t('modals.cardInfoTab.labels.documentStatus')}</span>
        <span class="info-value">
          {#if sourceDocumentStatus.known}
            {#if sourceDocumentStatus.exists}
              <span class="status-indicator status-exists">✓ {t('modals.cardInfoTab.documentExists')}</span>
            {:else}
              <span class="status-indicator status-missing">✗ {t('modals.cardInfoTab.documentDeleted')}</span>
            {/if}
          {:else}
            <span class="text-muted">{t('modals.cardInfoTab.status.unknown')}</span>
          {/if}
        </span>
      </div>

      <!-- 关联文档列表 -->
      {#if sourceInfo.refs && sourceInfo.refs.length > 0}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">{t('modals.cardInfoTab.relatedDocuments')}</span>
          <span class="info-value refs-list">
            {#each sourceInfo.refs as ref}
              <span class="ref-tag" title={ref}>{ref.replace(/\.md$/, '')}</span>
            {/each}
          </span>
        </div>
      {/if}

      <!-- 测试卡片的源记忆卡片信息 -->
      {#if isTestCard}
        <div class="info-row source-memory-card-row" class:mobile={isMobile}>
          <span class="info-label">{t('modals.cardInfoTab.sourceMemoryCard')}</span>
          <span class="info-value">
            {#if loadingSourceCard}
              <span class="text-muted">{t('modals.cardInfoTab.loading')}</span>
            {:else if sourceMemoryCard}
              <div class="source-card-compact">
                <span class="source-card-id" title={t('modals.cardInfoTab.sourceMemoryCardId')}>{sourceMemoryCard.uuid}</span>
                <button 
                  class="view-source-btn-small" 
                  onclick={viewSourceMemoryCard}
                  title={t('modals.cardInfoTab.viewSourceMemoryCard')}
                >
                  <EnhancedIcon name="eye" size={12} />
                  {t('modals.cardInfoTab.view')}
                </button>
              </div>
            {:else if sourceCardId}
              <span class="text-muted">{t('modals.cardInfoTab.missingOrDeleted')}</span>
            {:else}
              <span class="text-muted">{t('modals.cardInfoTab.none')}</span>
            {/if}
          </span>
        </div>
      {/if}
    </div>
  </section>

  <!-- 卡片演化历史区 -->
  {#if timelineEvents.length > 0 || parentCard || siblingCards.length > 0}
    <section class="info-section timeline-section" class:mobile={isMobile}>
      <div class="weave-section-header-row">
        <h3 class="section-title with-accent-bar accent-cyan" class:mobile={isMobile}>
          {t('modals.cardInfoTab.evolutionHistory')}
        </h3>
        {#if timelineMode === 'full' || (timelineMode === 'compact' && siblingCards.length > 0)}
          <button 
            class="expand-toggle" 
            onclick={toggleTimeline}
            title={expandedTimeline ? t('modals.cardInfoTab.collapse') : t('modals.cardInfoTab.expand')}
          >
            {expandedTimeline ? '▲' : '▼'}
          </button>
        {/if}
      </div>

      {#if timelineMode === 'simple'}
        <!-- 简单模式：一行摘要 -->
        <div class="timeline-simple">
          {#if parentCard}
            <span class="timeline-item">
              {t('modals.cardInfoTab.parentCard')}
            </span>
            <span class="timeline-arrow">→</span>
          {/if}
          <span class="timeline-item">
            {card.relationMetadata?.derivationMetadata ? getDerivationMethodLabel(card.relationMetadata.derivationMetadata.method) : t('modals.cardInfoTab.createAction')}
            {#if siblingCards.length > 0}
              ({t('modals.cardInfoTab.itemCount', { count: siblingCards.length + 1 })})
            {/if}
          </span>
          <span class="timeline-arrow">→</span>
          <span class="timeline-item current">{t('modals.cardInfoTab.currentCard')}</span>
          
          <div class="timeline-actions">
            {#if parentCard}
              <button class="link-button" onclick={() => parentCard && viewCard(parentCard)}>
                [{t('modals.cardInfoTab.viewParentCard')}]
              </button>
            {/if}
            {#if siblingCards.length > 0}
              <button class="link-button" onclick={() => siblingCards[0] && viewCard(siblingCards[0])}>
                [{t('modals.cardInfoTab.viewSiblingCards', { count: siblingCards.length })}]
              </button>
            {/if}
          </div>
        </div>

      {:else if timelineMode === 'compact' && (!expandedTimeline || siblingCards.length === 0)}
        <!-- 紧凑模式：折叠状态 -->
        <div class="timeline-compact">
          {#each timelineEvents as event, index}
            <div class="timeline-event-compact">
              <div class="event-time">{formatTimelineTimestamp(event.timestamp)}</div>
              <div class="event-node {event.type === 'split' ? 'important' : ''}">
                {event.type === 'split' ? '●' : '○'}
              </div>
              <div class="event-content">
                <span class="event-description">{event.description}</span>
                {#if event.type === 'split' && parentCard}
                  <button class="link-button-small" onclick={() => parentCard && viewCard(parentCard)}>
                    [{t('modals.cardInfoTab.view')}]
                  </button>
                {/if}
              </div>
            </div>
          {/each}
          
          {#if siblingCards.length > 0}
            <div class="siblings-preview">
              <span class="siblings-label">{t('modals.cardInfoTab.siblingCardsLabel')}:</span>
              {#each siblingCards.slice(0, 3) as sibling, index}
                <span class="sibling-tag">#{index + 1} {getCardPreview(sibling, 20)}</span>
              {/each}
              {#if siblingCards.length > 3}
                <span class="sibling-more">+{siblingCards.length - 3}</span>
              {/if}
              <button class="link-button-small" onclick={viewAllSiblingCards}>
                [{t('modals.cardInfoTab.viewAll')}]
              </button>
            </div>
          {/if}
        </div>

      {:else}
        <!-- 完整模式：展开状态 -->
        <div class="timeline-full">
          <div class="timeline-axis">
            {#each timelineEvents as event, index}
              <div class="timeline-event">
                <div class="timeline-node {event.type === 'split' ? 'important' : ''}"></div>
                <div class="event-header">
                  <span class="event-time">{formatTimelineTimestamp(event.timestamp)}</span>
                </div>
                <div class="event-body">
                  <div class="event-title">
                    <span>{event.description}</span>
                  </div>
                  
                  {#if event.type === 'created' && parentCard}
                    <div class="event-detail">
                      <div class="parent-card-preview">
                        {getCardPreview(parentCard, 100)}
                      </div>
                      <button class="link-button-small" onclick={() => parentCard && viewCard(parentCard)}>
                        [{t('modals.cardInfoTab.viewDetails')}]
                      </button>
                    </div>
                  {:else if event.type === 'split'}
                    <!-- 显示兄弟卡片列表 -->
                    <div class="timeline-branch">
                      <div class="branch-header">
                        {t('modals.cardInfoTab.generatedChildCards', { count: siblingCards.length + 1 })}
                      </div>
                      {#each siblingCards.slice(0, expandedSiblings ? undefined : 3) as sibling, idx}
                        <button 
                          class="child-card-item" 
                          onclick={() => viewCard(sibling)}
                        >
                          <span class="child-index">#{idx + 1}</span>
                          <span class="child-preview">
                            {getCardPreview(sibling, 60)}
                          </span>
                          <EnhancedIcon name="eye" size={14} />
                        </button>
                      {/each}
                      
                      <!-- 当前卡片 -->
                      <div class="child-card-item current-card-highlight">
                        <span class="child-index">#{siblingCards.length + 1}</span>
                        <span class="child-preview">
                          {getCardPreview(card, 60)} {t('modals.cardInfoTab.currentSuffix')}
                        </span>
                      </div>
                      
                      {#if siblingCards.length > 3 && !expandedSiblings}
                        <div class="sibling-actions">
                          <button class="expand-siblings-btn" onclick={toggleSiblings}>
                            {t('modals.cardInfoTab.remainingCards', { count: siblingCards.length - 3 })}
                          </button>
                          <button class="view-in-grid-btn" onclick={viewAllSiblingCards} title={t('modals.cardInfoTab.viewInGridTitle')}>
                            <EnhancedIcon name="grid" size={12} />
                            {t('modals.cardInfoTab.viewInGrid')}
                          </button>
                        </div>
                      {:else if expandedSiblings && siblingCards.length > 3}
                        <div class="sibling-actions">
                          <button class="expand-siblings-btn" onclick={toggleSiblings}>
                            [{t('modals.cardInfoTab.collapse')}]
                          </button>
                          <button class="view-in-grid-btn" onclick={viewAllSiblingCards} title={t('modals.cardInfoTab.viewInGridTitle')}>
                            <EnhancedIcon name="grid" size={12} />
                            {t('modals.cardInfoTab.viewInGrid')}
                          </button>
                        </div>
                      {:else if siblingCards.length > 0}
                        <button class="view-in-grid-btn" onclick={viewAllSiblingCards} title={t('modals.cardInfoTab.viewInGridTitle')}>
                          <EnhancedIcon name="grid" size={12} />
                          {t('modals.cardInfoTab.viewInGrid')}
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>

<!-- 卡片详情模态窗由 plugin.openViewCardModal() 全局处理 -->

<style>
  .card-info-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
    overflow-y: auto;
    height: 100%;
  }

  .info-section {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-4);
  }

  .section-title {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 var(--size-4-4) 0;
    line-height: 1.4;
  }

  .weave-section-header-row .section-title {
    margin-bottom: 0;
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
    align-items: center;
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
  }

  .mono {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
  }

  .text-muted {
    color: var(--text-muted);
    font-style: italic;
  }

  .uuid-button,
  .link-button {
    display: inline-flex;
    align-items: center;
    gap: var(--size-4-1);
    background: transparent;
    border: none;
    color: var(--interactive-accent);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-s);
    transition: all 0.2s ease;
  }

  .uuid-button:hover,
  .link-button:hover {
    background: var(--background-modifier-hover);
    text-decoration: underline;
  }

  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 500;
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .priority-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 600;
  }

  .priority-1 {
    background: #fee2e2;
    color: #991b1b;
  }

  .priority-2 {
    background: #fef3c7;
    color: #92400e;
  }

  .priority-3 {
    background: #dbeafe;
    color: #1e40af;
  }

  /* 卡片关系徽章组 */
  .relation-badges-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  /* 卡片关系徽章 */
  .relation-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    border: 1px solid;
    white-space: nowrap;
  }

  /* 主关系类型标签 */
  .relation-badge.child-card {
    background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
    color: #0369a1;
    border-color: #7dd3fc;
  }

  .relation-badge.parent-card {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    border-color: #fcd34d;
  }

  .relation-badge.normal-card {
    background: var(--background-modifier-form-field);
    color: var(--text-muted);
    border-color: var(--background-modifier-border);
  }

  /* 拆分方式标签 */
  .relation-badge.method-badge {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    color: #0284c7;
    border-color: #7dd3fc;
  }

  .relation-badge.method-badge.ai-method {
    background: linear-gradient(135deg, #f0f9ff 0%, #ddd6fe 100%);
    color: #6d28d9;
    border-color: #c4b5fd;
  }

  .relation-badge.method-badge.cloze-method {
    background: linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%);
    color: #a21caf;
    border-color: #f0abfc;
  }

  .relation-badge.method-badge.manual-method {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    color: #065f46;
    border-color: #6ee7b7;
  }

  /* 数量标签 */
  .relation-badge.count-badge {
    background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
    color: #9a3412;
    border-color: #fdba74;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--size-4-2);
  }

  .tag {
    display: inline-block;
    padding: 4px 12px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    font-weight: 500;
  }

  .status-indicator {
    font-weight: 600;
  }

  .status-exists {
    color: var(--text-success);
  }

  .status-missing {
    color: var(--text-error);
  }

  /* 滚动条样式 */
  .card-info-tab::-webkit-scrollbar {
    width: 8px;
  }

  .card-info-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .card-info-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .card-info-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }

  /* 响应式适配 */
  @media (max-width: 600px) {
    .info-row {
      grid-template-columns: 1fr;
      gap: var(--size-4-1);
    }

    .info-label {
      font-size: var(--font-ui-smaller);
    }
  }

  /* ============================================ */
  /* 时间线样式 */
  /* ============================================ */

  .timeline-section {
    position: relative;
  }

  .expand-toggle {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 6px;
    font-size: var(--font-ui-small);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .expand-toggle:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    border-radius: var(--radius-s);
  }

  /* 简单模式 */
  .timeline-simple {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    flex-wrap: wrap;
    padding: var(--size-4-2) 0;
  }

  .timeline-item {
    font-size: var(--font-ui-medium);
    color: var(--text-normal);
  }

  .timeline-item.current {
    font-weight: 600;
    color: var(--interactive-accent);
  }

  .timeline-arrow {
    color: var(--text-muted);
  }

  .timeline-actions {
    display: flex;
    gap: var(--size-4-2);
    margin-top: var(--size-4-2);
  }

  /* 紧凑模式 */
  .timeline-compact {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-3);
  }

  .timeline-event-compact {
    display: grid;
    grid-template-columns: 120px 20px 1fr;
    gap: var(--size-4-2);
    align-items: center;
  }

  .event-time {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }

  .event-node {
    font-size: 14px;
    text-align: center;
    color: var(--interactive-accent);
  }

  .event-node.important {
    font-size: 16px;
    animation: pulse-node 2s ease-in-out infinite;
  }

  @keyframes pulse-node {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.2);
    }
  }

  .event-content {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
  }

  .event-icon {
    font-size: 16px;
  }

  .event-description {
    font-size: var(--font-ui-medium);
    color: var(--text-normal);
  }

  .link-button-small {
    display: inline-flex;
    align-items: center;
    background: transparent;
    border: none;
    color: var(--interactive-accent);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-small);
    transition: all 0.2s ease;
  }

  .link-button-small:hover {
    background: var(--background-modifier-hover);
    text-decoration: underline;
  }

  .siblings-preview {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    flex-wrap: wrap;
    padding: var(--size-4-2);
    background: var(--background-modifier-form-field);
    border-radius: var(--radius-s);
    margin-left: 140px;
  }

  .siblings-label {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
  }

  .sibling-tag {
    display: inline-block;
    padding: 2px 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    color: var(--text-normal);
  }

  .sibling-more {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }

  /* 完整模式 */
  .timeline-full {
    padding: var(--size-4-2) 0;
  }

  .timeline-axis {
    position: relative;
    padding-left: 2rem;
  }

  .timeline-axis::before {
    content: '';
    position: absolute;
    left: 0.5rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(
      to bottom,
      var(--interactive-accent),
      var(--interactive-accent-hover)
    );
  }

  .timeline-event {
    position: relative;
    margin-bottom: 1.5rem;
  }

  .timeline-node {
    position: absolute;
    left: -1.75rem;
    top: 0.25rem;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--background-primary);
    border: 2px solid var(--interactive-accent);
    z-index: 1;
  }

  .timeline-node.important {
    width: 16px;
    height: 16px;
    left: -1.9rem;
    background: var(--interactive-accent);
    box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.2);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.2);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(76, 175, 80, 0.1);
    }
  }

  .event-header {
    margin-bottom: var(--size-4-1);
  }

  .event-body {
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    padding: var(--size-4-3);
  }

  .event-title {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-3);
  }

  .event-detail {
    margin-top: var(--size-4-2);
    padding-top: var(--size-4-2);
    border-top: 1px solid var(--background-modifier-border);
  }

  .parent-card-preview {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    margin-bottom: var(--size-4-2);
    line-height: 1.6;
  }

  /* 子卡片分支 */
  .timeline-branch {
    margin-top: var(--size-4-2);
    padding-top: var(--size-4-2);
    border-top: 1px solid var(--background-modifier-border);
  }

  .branch-header {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    margin-bottom: var(--size-4-2);
  }

  .child-card-item {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    padding: var(--size-4-2);
    margin-bottom: var(--size-4-1);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    text-align: left;
  }

  .child-card-item:hover {
    background: var(--background-modifier-hover);
    transform: translateX(4px);
    border-color: var(--interactive-accent);
  }

  .child-index {
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    font-weight: 600;
    min-width: 30px;
  }

  .child-preview {
    flex: 1;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current-card-highlight {
    background: linear-gradient(
      90deg,
      rgba(76, 175, 80, 0.1),
      transparent
    );
    border-left: 3px solid var(--interactive-accent);
    font-weight: 600;
    cursor: default;
  }

  .current-card-highlight:hover {
    transform: none;
    background: linear-gradient(
      90deg,
      rgba(76, 175, 80, 0.1),
      transparent
    );
  }

  .expand-siblings-btn {
    display: block;
    width: 100%;
    padding: var(--size-4-2);
    margin-top: var(--size-4-2);
    background: transparent;
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--interactive-accent);
    cursor: pointer;
    font-size: var(--font-ui-small);
    transition: all 0.2s ease;
  }

  .expand-siblings-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  /* 兄弟卡片操作按钮容器 */
  .sibling-actions {
    display: flex;
    gap: var(--size-4-2);
    margin-top: var(--size-4-2);
  }

  .sibling-actions .expand-siblings-btn {
    flex: 1;
    margin-top: 0;
  }

  /* 在网格中查看按钮 */
  .view-in-grid-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    margin-top: var(--size-4-2);
    background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
    color: white;
    border: none;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .view-in-grid-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .view-in-grid-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .sibling-actions .view-in-grid-btn {
    flex: 0 0 auto;
    margin-top: 0;
  }

  /* 源记忆卡片预览样式 */
  .source-memory-card-preview {
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    padding: var(--size-4-3);
    border: 1px solid var(--background-modifier-border);
  }

  .loading-state, .error-state {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    justify-content: center;
    padding: var(--size-4-4);
    color: var(--text-muted);
    font-size: var(--font-ui-small);
  }

  .error-state {
    color: var(--text-error);
  }

  .retry-btn {
    margin-left: auto;
    padding: var(--size-4-1) var(--size-4-2);
    font-size: var(--font-ui-smaller);
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    cursor: pointer;
  }

  .source-card-info {
    border-radius: var(--radius-s);
    overflow: hidden;
  }

  .source-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--size-4-3);
  }

  .source-card-meta {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
  }

  .source-card-id {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    background: var(--background-primary);
    padding: 2px 6px;
    border-radius: var(--radius-s);
  }

  .source-card-type {
    font-size: var(--font-ui-smaller);
    color: var(--interactive-accent);
    font-weight: 500;
  }

  .view-source-btn {
    display: flex;
    align-items: center;
    gap: var(--size-4-1);
    padding: var(--size-4-1) var(--size-4-2);
    font-size: var(--font-ui-small);
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .view-source-btn:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
  }

  .source-card-preview {
    background: var(--background-primary);
    border-radius: var(--radius-s);
    padding: var(--size-4-3);
    margin-bottom: var(--size-4-2);
    border: 1px solid var(--background-modifier-border);
  }

  .source-card-front, .source-card-back {
    margin-bottom: var(--size-4-2);
  }

  .source-card-back {
    padding-top: var(--size-4-2);
    border-top: 1px dashed var(--background-modifier-border);
  }

  .preview-label {
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    color: var(--interactive-accent);
    display: block;
    margin-bottom: var(--size-4-1);
  }

  .preview-content {
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    line-height: 1.4;
    word-break: break-word;
  }

  .source-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--size-4-1);
  }

  .mini-tag {
    font-size: var(--font-ui-smaller);
    padding: 1px 4px;
    background: var(--tag-background);
    color: var(--tag-color);
    border-radius: var(--radius-s);
    border: 1px solid var(--tag-border-color);
  }

  .tag-more {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    font-style: italic;
  }

  /* 溯源信息中的源记忆卡片紧凑样式 */
  .source-memory-card-row {
    border-top: 1px solid var(--background-modifier-border);
    padding-top: var(--size-4-2);
    margin-top: var(--size-4-2);
  }

  .source-card-compact {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
  }

  .source-card-compact .source-card-id {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-small);
    color: var(--text-accent);
    background: var(--background-modifier-border);
    padding: 2px 8px;
    border-radius: var(--radius-s);
    flex: 1;
  }

  .view-source-btn-small {
    display: flex;
    align-items: center;
    gap: var(--size-4-1);
    padding: 2px 8px;
    font-size: var(--font-ui-smaller);
    background: var(--interactive-normal);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .view-source-btn-small:hover {
    background: var(--interactive-hover);
    border-color: var(--interactive-accent);
    color: var(--text-accent);
  }

  /* ====================  移动端适配样式 ==================== */
  
  /* 移动端主容器 */
  .card-info-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  /* 移动端信息区块 */
  .info-section.mobile {
    padding: 12px;
  }

  /* 移动端标题 */
  .section-title.mobile {
    font-size: 14px;
    margin-bottom: 12px;
    line-height: 1.4;
  }

  .weave-section-header-row .section-title.mobile {
    margin-bottom: 0;
  }

  /* 移动端信息网格 */
  .info-grid.mobile {
    gap: 10px;
  }

  /*  移动端信息行 - 水平布局（标签左，值右） */
  .info-row.mobile {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--background-modifier-border-hover);
  }

  .info-row.mobile:last-child {
    border-bottom: none;
  }

  .info-row.mobile .info-label {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .info-row.mobile .info-value {
    flex: 1;
    text-align: right;
    font-size: 13px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 移动端UUID按钮 */
  .info-row.mobile .uuid-button {
    justify-content: flex-end;
    min-height: 36px;
    padding: 6px 8px;
  }

  /* 移动端链接按钮 */
  .info-row.mobile .link-button {
    justify-content: flex-end;
    min-height: 36px;
    padding: 6px 8px;
  }

  /* 移动端关系徽章组 - 右对齐 */
  .info-row.mobile .relation-badges-group {
    justify-content: flex-end;
  }

  /* 移动端关系徽章 - 更紧凑 */
  .info-row.mobile .relation-badge {
    padding: 2px 6px;
    font-size: 11px;
  }

  /* 移动端状态徽章 */
  .info-row.mobile .status-badge {
    padding: 2px 6px;
    font-size: 12px;
  }

  /* 移动端优先级徽章 */
  .info-row.mobile .priority-badge {
    padding: 2px 6px;
    font-size: 12px;
  }

  /* 关联文档列表样式 */
  .refs-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .ref-tag {
    display: inline-block;
    padding: 2px 6px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-muted);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ref-tag:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
</style>
