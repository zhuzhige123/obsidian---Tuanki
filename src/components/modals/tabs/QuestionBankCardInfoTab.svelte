<script lang="ts">
  import { logger } from '../../../utils/logger';
  // 静态导入 parseSourceInfo，确保响应式追踪正常
  import { parseSourceInfo, getCardProperty } from '../../../utils/yaml-utils';
  import { detectCardTypeFromContent } from '../../../utils/card-markdown-serializer';

  import { onMount } from 'svelte';
  import { formatRelativeTimeDetailed } from '../../../utils/helpers';
  import { truncateText } from '../../../utils/ui-helpers';
  import { getQuestionTypeLabel } from '../../../utils/question-type-utils';
  import { Notice, MarkdownView } from 'obsidian';
  import type WeavePlugin from '../../../main';
  import type { Card } from '../../../data/types';
  import { writeSystemClipboardText } from '../../../utils/system-clipboard';
  // 🌍 导入国际化
  import { tr } from '../../../utils/i18n';
  // ✅ 卡片详情模态窗改用全局方法 plugin.openViewCardModal()

  interface Props {
    card: Card;
    plugin: WeavePlugin;
    deckName: string;
    isMobile?: boolean;
  }

  let { card, plugin, deckName, isMobile = false }: Props = $props();

  // 🌍 响应式翻译函数
  let t = $derived($tr);

  // 源记忆卡片预览状态
  let sourceMemoryCard = $state<Card | null>(null);
  let loadingSourceCard = $state(false);

  // 浮窗状态 - 改用全局方法，不再需要本地状态

  // 检测是否为测试卡片（题库考试）
  const isTestCard = $derived(
    card.cardPurpose === 'test' && card.metadata?.sourceCardId
  );

  // 获取源记忆卡片ID
  const sourceCardId = $derived(
    card.metadata?.sourceCardId as string
  );

  // 响应式来源信息，使用统一的 parseSourceInfo 工具函数
  // 静态导入可确保响应式追踪正常工作
  let sourceInfo = $derived.by(() => {
    const content = card?.content;
    if (!content) return { sourceFile: card?.sourceFile, sourceBlock: card?.sourceBlock };
    
    const parsed = parseSourceInfo(content);
    return {
      sourceFile: parsed.sourceFile || card?.sourceFile,
      sourceBlock: parsed.sourceBlock || card?.sourceBlock,
      refs: parsed.refs
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

  // 复制UUID
  async function copyUUID() {
    const copied = await writeSystemClipboardText(card.uuid);
    new Notice(copied ? '已复制UUID' : '复制 UUID 失败');
  }

  // 跳转到来源文档
  // 使用 Obsidian 原生 openLinkText API，支持仅文件名格式
  async function navigateToSource() {
    try {
      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      let filePath: string | undefined;
      let blockId: string | undefined;
      
      // 使用响应式 sourceInfo 从 content YAML 获取来源
      if (sourceInfo.sourceFile) {
        filePath = sourceInfo.sourceFile;
        blockId = sourceInfo.sourceBlock?.replace(/^\^/, ''); // 移除^前缀
      }
      
      if (!filePath) {
        new Notice('该卡片没有关联的源文档');
        return;
      }
      
      // 使用 openLinkText 处理 wikilink 格式，支持仅文件名
      const docName = filePath.replace(/\.md$/, '');
      
      // 验证文件是否存在，防止创建新文档
      const file = plugin.app.metadataCache.getFirstLinkpathDest(docName, contextPath);
      if (!file) {
        new Notice('源文档不存在或已删除');
        return;
      }
      
      const linkText = blockId ? `${docName}#^${blockId}` : docName;
      
      // 使用 Obsidian 原生 API 跳转，自动处理文件查找和块定位
      await plugin.app.workspace.openLinkText(linkText, contextPath, true);
      new Notice('已跳转到源文档');
    } catch (error) {
      logger.error('[QuestionBankCardInfoTab] 跳转到源文档失败:', error);
      new Notice('跳转失败');
    }
  }

  // 获取卡片类型显示名
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
        return '基础问答';
      case 'cloze': 
        return '填空题';
      case 'multiple':
        return '选择题';
      default: 
        return resolvedType || '未知';
    }
  }

  // 加载测试卡片关联的源记忆卡片
  async function loadSourceMemoryCard() {
    const cardId = sourceCardId;
    if (!cardId || loadingSourceCard) return;

    loadingSourceCard = true;
    try {
      sourceMemoryCard = await plugin.dataStorage.getCardByUUID(cardId);
    } catch (error) {
      logger.error('[QuestionBankCardInfoTab] 获取源记忆卡片失败:', error);
    } finally {
      loadingSourceCard = false;
    }
  }

  // 查看源记忆卡片 - 使用全局方法
  function viewSourceMemoryCard() {
    if (sourceMemoryCard) {
      // ✅ 使用全局模态窗，支持在其他标签页上方显示
      plugin.openViewCardModal(sourceMemoryCard);
    }
  }

  // 初始化时加载源记忆卡片
  onMount(() => {
    if (isTestCard) {
      loadSourceMemoryCard();
    }
  });
</script>

<div class="question-bank-info-tab" class:mobile={isMobile} role="tabpanel" id="info-panel">
  <!-- 基本信息区 -->
  <section class="info-section" class:mobile={isMobile}>
    <h3 class="section-title with-accent-bar accent-blue" class:mobile={isMobile}>
      基础信息
    </h3>
    
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">UUID</span>
        <span class="info-value">
          <button class="uuid-button" onclick={copyUUID} title="点击复制">
            <span class="button-text">{truncateText(card.uuid, 32)}</span>
          </button>
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">卡片类型</span>
        <span class="info-value">{getCardTypeName(card)}</span>
      </div>

      {#if card.metadata?.questionType}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">题目类型</span>
          <span class="info-value">
            <span class="type-badge">{getQuestionTypeLabel(card.metadata.questionType as string, 'long')}</span>
          </span>
        </div>
      {/if}

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">所属牌组</span>
        <span class="info-value">{deckName}</span>
      </div>

      {#if card.difficulty}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">难度等级</span>
          <span class="info-value">
            <span class="difficulty-badge difficulty-{card.difficulty}">
              {card.difficulty === 'easy' ? '简单' : 
               card.difficulty === 'medium' ? '中等' : 
               card.difficulty === 'hard' ? '困难' : card.difficulty}
            </span>
          </span>
        </div>
      {/if}

      {#if card.priority}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">优先级</span>
          <span class="info-value">
            <span class="priority-badge priority-{card.priority}">P{card.priority}</span>
          </span>
        </div>
      {/if}

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">创建时间</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.created)}</span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">最后编辑</span>
        <span class="info-value">{formatRelativeTimeDetailed(card.modified)}</span>
      </div>
    </div>
  </section>

  <!-- 标签区 -->
  {#if card.tags && card.tags.length > 0}
    <section class="info-section" class:mobile={isMobile}>
      <h3 class="section-title with-accent-bar accent-purple" class:mobile={isMobile}>
        标签
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
      来源信息
    </h3>
    
    <!-- 使用响应式 sourceInfo 从 content YAML 实时解析 -->
    <div class="info-grid" class:mobile={isMobile}>
      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">源文档</span>
        <span class="info-value">
          {#if sourceInfo.sourceFile}
            <button class="link-button" onclick={navigateToSource} title="点击跳转">
              <span class="button-text">{sourceInfo.sourceFile}</span>
            </button>
          {:else}
            <span class="text-muted">无源文档</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">块引用</span>
        <span class="info-value">
          {#if sourceInfo.sourceBlock}
            <span class="mono">{truncateText(sourceInfo.sourceBlock || '', 30)}</span>
          {:else}
            <span class="text-muted">无块引用</span>
          {/if}
        </span>
      </div>

      <div class="info-row" class:mobile={isMobile}>
        <span class="info-label">文档状态</span>
        <span class="info-value">
          {#if sourceDocumentStatus.known}
            {#if sourceDocumentStatus.exists}
              <span class="status-indicator status-exists">存在</span>
            {:else}
              <span class="status-indicator status-missing">已删除</span>
            {/if}
          {:else}
            <span class="text-muted">未知</span>
          {/if}
        </span>
      </div>

      <!-- 关联文档列表 -->
      {#if sourceInfo.refs && sourceInfo.refs.length > 0}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">关联文档</span>
          <span class="info-value refs-list">
            {#each sourceInfo.refs as ref}
              <span class="ref-tag" title={ref}>{ref.replace(/\.md$/, '')}</span>
            {/each}
          </span>
        </div>
      {/if}

      <!-- 测试卡片的源记忆卡片信息 -->
      {#if isTestCard}
        <div class="info-row source-memory-row">
          <span class="info-label">源记忆卡片</span>
          <span class="info-value">
            {#if loadingSourceCard}
              <span class="text-muted">加载中...</span>
            {:else if sourceMemoryCard}
              <div class="source-card-compact">
                <span class="source-card-id" title={sourceMemoryCard.uuid}>
                  {truncateText(sourceMemoryCard.uuid, 24)}
                </span>
                <button 
                  class="view-source-btn" 
                  onclick={viewSourceMemoryCard}
                  title="查看源记忆卡片详情"
                >
                  查看详情
                </button>
              </div>
            {/if}
          </span>
        </div>
      {/if}

      <!-- AI生成信息 -->
      {#if card.metadata?.generatedBy}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">生成方式</span>
          <span class="info-value">
            <span class="generation-badge">AI自动生成</span>
          </span>
        </div>
      {/if}

      {#if card.metadata?.generatedAt}
        <div class="info-row" class:mobile={isMobile}>
          <span class="info-label">生成时间</span>
          <span class="info-value">
            {formatRelativeTimeDetailed(card.metadata.generatedAt as string)}
          </span>
        </div>
      {/if}
    </div>
  </section>

</div>

<!-- 卡片详情模态窗 - 改用全局方法 plugin.openViewCardModal() -->

<style>
  .question-bank-info-tab {
    padding: var(--size-4-4);
    display: flex;
    flex-direction: column;
    gap: var(--size-4-4);
    overflow-y: auto;
    height: 100%;
    min-height: 0;
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
    gap: var(--size-4-2);
    position: relative;
    padding-left: 16px;
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--size-4-4);
    /* 🔧 移除 padding-bottom，避免彩色侧边条偏移 */
    line-height: 1.4;
  }

  /* 彩色条样式 - 复用设置界面的设计 */
  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 2px;
  }

  /* 颜色定义 */
  .section-title.accent-blue::before {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
  }

  .section-title.accent-purple::before {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.8), rgba(147, 51, 234, 0.6));
  }

  .section-title.accent-orange::before {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.8), rgba(234, 88, 12, 0.6));
  }

  .section-title.accent-green::before {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.6));
  }

  .section-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  .section-title.accent-pink::before {
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(219, 39, 119, 0.6));
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

  .button-text {
    font-size: var(--font-ui-small);
  }

  .type-badge,
  .difficulty-badge,
  .priority-badge,
  .generation-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 500;
    border: 1px solid;
  }

  .type-badge {
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    border-color: var(--background-modifier-border);
  }

  .difficulty-badge.difficulty-easy {
    background: #d1fae5;
    color: #065f46;
    border-color: #6ee7b7;
  }

  .difficulty-badge.difficulty-medium {
    background: #fef3c7;
    color: #92400e;
    border-color: #fcd34d;
  }

  .difficulty-badge.difficulty-hard {
    background: #fee2e2;
    color: #991b1b;
    border-color: #fca5a5;
  }

  .priority-badge {
    font-weight: 600;
  }

  .priority-badge.priority-1 {
    background: #fee2e2;
    color: #991b1b;
    border-color: #fca5a5;
  }

  .priority-badge.priority-2 {
    background: #fef3c7;
    color: #92400e;
    border-color: #fcd34d;
  }

  .priority-badge.priority-3 {
    background: #dbeafe;
    color: #1e40af;
    border-color: #93c5fd;
  }

  .generation-badge {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    color: #0284c7;
    border-color: #7dd3fc;
  }

  .stat-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
    font-weight: 500;
    border: 1px solid;
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    border-color: var(--background-modifier-border);
  }

  .stat-badge.success {
    background: #d1fae5;
    color: #065f46;
    border-color: #6ee7b7;
  }

  .stat-badge.error {
    background: #fee2e2;
    color: #991b1b;
    border-color: #fca5a5;
  }

  .stat-badge.accent {
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    color: #1e40af;
    border-color: #93c5fd;
    font-weight: 600;
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
    padding: 2px 8px;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-smaller);
  }

  .status-exists {
    background: #d1fae5;
    color: #065f46;
  }

  .status-missing {
    background: #fee2e2;
    color: #991b1b;
  }

  /* 源记忆卡片信息 */
  .source-memory-row {
    border-top: 1px solid var(--background-modifier-border);
    padding-top: var(--size-4-3);
    margin-top: var(--size-4-2);
  }

  .source-card-compact {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    flex-wrap: wrap;
  }

  .source-card-id {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    padding: 2px 6px;
    background: var(--background-modifier-form-field);
    border-radius: var(--radius-s);
  }

  .view-source-btn {
    padding: 4px 12px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: var(--radius-s);
    font-size: var(--font-ui-small);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .view-source-btn:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  /* 滚动条样式 */
  .question-bank-info-tab::-webkit-scrollbar {
    width: 8px;
  }

  .question-bank-info-tab::-webkit-scrollbar-track {
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .question-bank-info-tab::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .question-bank-info-tab::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
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

  /* ==================== 📱 移动端适配样式 ==================== */
  
  /* 移动端容器 */
  .question-bank-info-tab.mobile {
    padding: 12px;
    gap: 12px;
  }

  /* 移动端区块 */
  .info-section.mobile {
    padding: 12px;
  }

  /* 移动端标题 */
  .section-title.mobile {
    font-size: 14px;
    margin-bottom: 12px;
    padding-left: 12px;
    line-height: 1.2;
  }

  .section-title.mobile.with-accent-bar::before {
    height: 14px;
    top: 50%;
    transform: translateY(-50%);
  }

  /* 移动端列表样式 */
  .info-grid.mobile {
    gap: 0;
  }

  .info-row.mobile {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
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
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
