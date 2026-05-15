<!--
  内联卡片编辑器组件（v3 - 嵌入式编辑器）
  使用 EmbeddableEditorManager 和 Obsidian 原生编辑器
  零闪烁、高性能的编辑体验
  用于卡片创建和编辑模态窗
-->
<script lang="ts">
  import type { Card, Deck } from '../../data/types';
  import { CardType } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import type { EmbeddableEditorManager } from '../../services/editor/EmbeddableEditorManager';
  import type { ErrorDetails } from '../../types/editor-types';
  import { logger } from '../../utils/logger';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import CustomDropdown from '../ui/CustomDropdown.svelte';
  import { Notice } from 'obsidian';
  import { detectClozeModeFromContent, hasClozeSyntax, setClozeModeInContent, type ClozeMode } from '../../utils/cloze-mode';
  import { getCardDeckIds, parseYAMLFromContent, setCardProperties } from '../../utils/yaml-utils';
  import { detectCardQuestionType } from '../../utils/card-type-utils';
  import { getCardTypeName } from '../../types/unified-card-types';

  // Props接口定义
  interface Props {
    card: Card;
    plugin: WeavePlugin;
    editorPoolManager: EmbeddableEditorManager;
    mode?: 'create' | 'edit';
    isNew?: boolean;
    displayMode?: 'inline' | 'fullscreen';
    selectedDeck?: Deck | null;
    selectedDeckId?: string;
    selectedDeckNames?: string[];
    showHeader?: boolean;
    showFooter?: boolean;
    isPinned?: boolean; // 钉住模式（保持编辑器实例）
    onSave?: (card: Card) => void;
    onCancel?: () => void;
    onClose?: () => void; // 支持关闭按钮
    onContentChange?: (content: string) => void;
    decks?: Deck[]; // 支持牌组列表
    propsDecks?: Deck[];
    propsFieldTemplates?: any[];
    sourcePath?: string; // 源文件路径，用于解决资源解析问题
  }

  let {
    card = $bindable(),
    plugin,
    editorPoolManager,
    mode,
    isNew = false,
    displayMode = 'inline',
    selectedDeck = null,
    selectedDeckId = $bindable(card.deckId || selectedDeck?.id || ''),  //  支持双向绑定
    selectedDeckNames = [],
    showHeader = true,
    showFooter = true,
    isPinned = false, // 钉住模式
    onSave,
    onCancel,
    onClose,
    onContentChange,
    decks = [],
    propsDecks = [],
    propsFieldTemplates = [],
    sourcePath // 接收 sourcePath
  }: Props = $props();

  // 编辑器状态管理
  let editorContainer: HTMLDivElement | null = $state(null);
  let editorInitialized = $state(false);
  let editCleanupFn: (() => void) | null = $state(null);
  let currentEditSessionId: string | null = $state(null);
  const editorInstanceId = `inline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let isLoading = $state(false);
  let errorDetails = $state<ErrorDetails | null>(null);
  
  // 防止保存或取消逻辑被重复触发。
  let isProcessing = $state(false);
  let deckSelectionTouched = $state(false);
  let currentContent = $state(card.content || '');

  const supportsClozeModeToggle = $derived.by(() => {
    const content = currentContent || card.content || '';
    const isProgressiveCard = card.type === CardType.ProgressiveParent || card.type === CardType.ProgressiveChild;
    return !isProgressiveCard && (hasClozeSyntax(content) || card.type === CardType.Cloze);
  });

  const currentClozeMode = $derived.by(() => {
    return detectClozeModeFromContent(currentContent || card.content || '');
  });

  const secondaryActionLabel = $derived(mode === 'create' ? '取消' : '关闭');

  function extractClozeOrdinals(content: string): number[] {
    const ordinals = new Set<number>();
    const clozePattern = /\{\{c(\d+)::/g;
    let match: RegExpExecArray | null;

    while ((match = clozePattern.exec(content)) !== null) {
      const ord = Number.parseInt(match[1], 10);
      if (Number.isFinite(ord) && ord >= 1) {
        ordinals.add(ord);
      }
    }

    return Array.from(ordinals).sort((a, b) => a - b);
  }

  function getCardTypeDisplayName(targetCard: Card | null | undefined): string {
    if (!targetCard) return '未知题型';

    switch (targetCard.type) {
      case CardType.ProgressiveParent:
      case CardType.ProgressiveChild:
        return '渐进式挖空';
      case CardType.Basic:
        return '问答题';
      case CardType.Cloze:
        return '普通挖空';
      case CardType.Multiple:
        return '选择题';
      default:
        return getCardTypeName(detectCardQuestionType(targetCard));
    }
  }

  function buildProgressiveClozeSaveNotice(previousCard: Card, persistedCard: Card): string | null {
    const previousOrdinals = extractClozeOrdinals(previousCard.content || '');
    const nextOrdinals = extractClozeOrdinals(persistedCard.content || '');

    const previousOrdinalSet = new Set(previousOrdinals);
    const nextOrdinalSet = new Set(nextOrdinals);

    const removedOrdinals = previousOrdinals.filter(ord => !nextOrdinalSet.has(ord));
    const addedOrdinals = nextOrdinals.filter(ord => !previousOrdinalSet.has(ord));
    const retainedOrdinals = nextOrdinals.filter(ord => previousOrdinalSet.has(ord));

    const parts: string[] = [];

    if (addedOrdinals.length > 0) {
      const labels = addedOrdinals.map(ord => `c${ord}`).join('、');
      parts.push(`已新增子卡片 ${labels}，并通过 UUID 加入当前牌组引用`);
      parts.push('新增子卡片不会进入当前学习会话，下次学习时再由兄弟分散规则自动处理');
    }

    if (removedOrdinals.length > 0) {
      const labels = removedOrdinals.map(ord => `c${ord}`).join('、');
      parts.push(`已删除子卡片 ${labels}，对应子卡片及其复习历史已删除`);
    }

    if (addedOrdinals.length === 0 && removedOrdinals.length === 0 && retainedOrdinals.length > 0) {
      parts.push(`已同步 ${retainedOrdinals.length} 张现有渐进式子卡片的内容`);
    }

    return parts.length > 0 ? parts.join('；') : null;
  }

  function notifySaveChanges(previousCard: Card, persistedCard: Card) {
    if (previousCard.type !== persistedCard.type) {
      const previousTypeLabel = getCardTypeDisplayName(previousCard);
      const nextTypeLabel = getCardTypeDisplayName(persistedCard);
      new Notice(`卡片题型已从「${previousTypeLabel}」变更为「${nextTypeLabel}」`, 7000);
    }

    const progressiveNotice = buildProgressiveClozeSaveNotice(previousCard, persistedCard);
    if (progressiveNotice) {
      new Notice(progressiveNotice, 7000);
    }
  }

  function handleEditorContentChange(content: string): void {
    currentContent = content;
    card.content = content;
    onContentChange?.(content);
  }

  async function handleClozeModeToggle(mode: ClozeMode): Promise<void> {
    const content = currentContent || card.content || '';
    const nextContent = setClozeModeInContent(content, mode);

    if (nextContent === content) {
      return;
    }

    await updateEditorContent(nextContent);
    new Notice(mode === 'input' ? '已切换为输入模式' : '已切换为显示模式');
  }

  // 初始化编辑器（使用文件池方案）
  async function initializeEditor() {
    if (!card || !editorPoolManager || !editorContainer) {
      logger.error('[InlineCardEditor] 编辑器初始化失败：缺少必要参数');
      return;
    }

    if (editorInitialized) {
      logger.debug('[InlineCardEditor] 编辑器已初始化，跳过');
      return;
    }

    try {
      isLoading = true;
      logger.debug('[InlineCardEditor] 🚀 开始初始化编辑器...');

      // 清空容器
      editorContainer.replaceChildren();

      // InlineCardEditor 用于普通编辑（CreateCardModal/EditCardModal），
      // 直接使用card.uuid作为会话ID，不使用学习会话ID
      const editSessionId = (card.uuid && card.uuid.trim().length > 0)
        ? `${card.uuid}-${editorInstanceId}`
        : `modal-${editorInstanceId}`;
      
      // 创建文件池文件（普通编辑，不传递isStudySession参数）
      const tempFileResult = await editorPoolManager.createEditorSession(card, {
        sessionId: editSessionId,
        sourcePath: sourcePath // 传递 sourcePath
      });

      if (!tempFileResult.success) {
        throw new Error(tempFileResult.error || '文件池文件创建失败');
      }

      logger.debug('[InlineCardEditor] 文件池文件创建成功:', tempFileResult.filePath);

      const resolvedSessionId = tempFileResult.sessionId || editSessionId;

      // 创建嵌入式编辑器（Obsidian原生）
      const editorResult = await editorPoolManager.createEmbeddedEditor(
        editorContainer,
        resolvedSessionId,
        handleEditorSave,
        handleEditorCancel,
        handleEditorContentChange
      );

      if (!editorResult.success) {
        throw new Error(editorResult.error || '编辑器创建失败');
      }

      // 保存清理函数和会话ID
      editCleanupFn = editorResult.cleanup || null;
      currentEditSessionId = resolvedSessionId;
      editorInitialized = true;

      logger.debug('[InlineCardEditor] ✅ 编辑器初始化成功，editorInitialized =', editorInitialized);

      // 初始内容加载不触发 editor-change，手动通知一次以便提取 PDF+ 来源等元数据
      if (card.content) {
        queueMicrotask(() => handleEditorContentChange(card.content));
      }
      
    } catch (error) {
      logger.error('[InlineCardEditor] 编辑器初始化失败:', error);
      errorDetails = {
        message: error instanceof Error ? error.message : '编辑器初始化失败',
        timestamp: Date.now()
      };
      new Notice('编辑器初始化失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      isLoading = false;
      logger.debug('[InlineCardEditor] 初始化完成，isLoading =', isLoading, ', editorInitialized =', editorInitialized);
    }
  }

  // 编辑器保存回调
  function handleEditorSave(_content: string) {
    logger.debug('[InlineCardEditor] 编辑器保存回调触发');
    handleSave();
  }

  // 编辑器取消回调
  function handleEditorCancel() {
    logger.debug('[InlineCardEditor] 编辑器取消回调触发');
    handleCancel();
  }

  // 保存卡片
  async function handleSave() {
    //  防重复触发保护
    if (isProcessing) {
      logger.debug('[InlineCardEditor] ⚠️ handleSave 被阻止：正在处理中');
      return;
    }
    
    logger.debug('[InlineCardEditor] 🖱️ handleSave 被调用', {
      isLoading,
      editorInitialized,
      hasEditorPoolManager: !!editorPoolManager,
      hasCurrentEditSessionId: !!currentEditSessionId
    });
    
    if (isLoading || !editorPoolManager || !currentEditSessionId) {
      logger.warn('[InlineCardEditor] ⚠️ handleSave 被阻止', {
        isLoading,
        hasEditorPoolManager: !!editorPoolManager,
        hasCurrentEditSessionId: !!currentEditSessionId
      });
      return;
    }
    
    try {
      isProcessing = true; //  设置处理中标志
      isLoading = true;

      logger.debug('[InlineCardEditor] 🔄 开始保存卡片, sessionId:', currentEditSessionId);
      
      // 步骤1：先调用finishEditing获取真实的编辑器内容
      const result = await editorPoolManager.finishEditing(currentEditSessionId, false, {
        isStudySession: isPinned,
        targetCardId: card.uuid
      });
      
      if (!result.success || !result.updatedCard) {
        throw new Error(result.error || '获取编辑器内容失败');
      }
      
      //  现在有真实的content了
      // 合并外部 card 的 sourceFile 和 sourceBlock（钉住模式下通过 updateContent 设置）
      const updatedCard = {
        ...result.updatedCard,
        deckId: selectedDeckId,
        modified: new Date().toISOString(),
        //  保留溯源信息（来自外部card对象）
        sourceFile: card.sourceFile,
        sourceBlock: card.sourceBlock
      };

      // 只有新建卡片或用户显式修改牌组时，才回填 we_decks，
      // 避免用户手动删掉 YAML 里的牌组后又被旧状态悄悄补回。
      const shouldBackfillDecks =
        isNew ||
        deckSelectionTouched ||
        (Array.isArray(selectedDeckNames) && selectedDeckNames.length > 0);

      let nextDeckNames: string[] = [];
      if (shouldBackfillDecks) {
        if (Array.isArray(selectedDeckNames) && selectedDeckNames.length > 0) {
          nextDeckNames = [selectedDeckNames[0]];
        } else {
          const deckName = decks?.find(d => d.id === selectedDeckId)?.name;
          if (deckName) nextDeckNames = [deckName];
        }
      }

      const currentDeckIds = getCardDeckIds(card, decks).deckIds;
      const preservedTestDeckIds = currentDeckIds.filter((deckId) => {
        const matchedDeck = decks?.find(d => d.id === deckId);
        return matchedDeck?.purpose === 'test';
      });
      const runtimeDeckIds = selectedDeckId
        ? [selectedDeckId, ...preservedTestDeckIds.filter((deckId) => deckId !== selectedDeckId)]
        : preservedTestDeckIds;

      updatedCard.referencedByDecks = runtimeDeckIds;
      if (runtimeDeckIds.length > 0) {
        updatedCard.deckId = runtimeDeckIds[0];
      } else {
        (updatedCard as Partial<Card>).deckId = undefined;
      }

      if (updatedCard.content) {
        const yaml = parseYAMLFromContent(updatedCard.content);
        const hasPriorityKey = Object.prototype.hasOwnProperty.call(yaml, 'we_priority');
        const yamlPriority = typeof yaml.we_priority === 'number' && Number.isFinite(yaml.we_priority)
          ? yaml.we_priority
          : undefined;

        // YAML 中的 we_priority 优先级更高：允许用户直接编辑 frontmatter 控制卡片优先级。
        if (yamlPriority !== undefined) {
          updatedCard.priority = yamlPriority;
        }

        const shouldBackfillPriority =
          !hasPriorityKey &&
          typeof updatedCard.priority === 'number' &&
          Number.isFinite(updatedCard.priority);

        if (shouldBackfillDecks || shouldBackfillPriority) {
          updatedCard.content = setCardProperties(updatedCard.content, {
            ...(shouldBackfillDecks ? { we_decks: nextDeckNames.length > 0 ? nextDeckNames : undefined } : {}),
            ...(shouldBackfillPriority ? { we_priority: updatedCard.priority } : {})
          });
        }
      }
      
      logger.debug('[InlineCardEditor] 获取到编辑器内容, 长度:', updatedCard.content?.length || 0);
      
      // 步骤2： 修复 - 先保存到数据库，确保持久化成功
      let persistedCard: Card = updatedCard;
      if (plugin.dataStorage) {
        logger.debug('[InlineCardEditor] 💾 开始保存到数据库...');
        const saveResult = await plugin.dataStorage.saveCard(updatedCard);
        persistedCard = saveResult.data || updatedCard;
        
        if (!saveResult.success) {
          throw new Error(saveResult.error || '数据库保存失败');
        }
        
        logger.debug('[InlineCardEditor] 数据库保存成功, UUID:', saveResult.data?.uuid);
      } else {
        logger.warn('[InlineCardEditor] dataStorage未初始化，跳过数据库保存');
      }
      
      // 在触发 onSave 前先恢复按钮状态，避免界面残留禁用态。
      isLoading = false;
      if (!isNew) {
        notifySaveChanges(card, persistedCard);
      }

      logger.debug('[InlineCardEditor] isLoading 已重置，准备调用 onSave 回调');
      
      // 数据库保存成功后，再通知上层继续后续 UI 流程。
      if (onSave) {
        logger.debug('[InlineCardEditor] 调用 onSave 回调...');
        onSave(persistedCard);
        logger.debug('[InlineCardEditor] onSave 回调已执行');
      }
      
    } catch (error) {
      isLoading = false;
      logger.error('[InlineCardEditor] 保存失败:', error);
      new Notice('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      //  延迟重置处理标志，防止快速连续点击
      setTimeout(() => {
        isProcessing = false;
      }, 300);
    }
  }

  // 取消编辑
  function handleCancel() {
    //  防重复触发保护
    if (isProcessing) {
      logger.debug('[InlineCardEditor] ⚠️ handleCancel 被阻止：正在处理中');
      return;
    }
    
    logger.debug('[InlineCardEditor] 🚫 取消编辑');
    isProcessing = true; //  设置处理中标志
    
    // 清理编辑器资源
    if (editCleanupFn) {
      editCleanupFn();
      editCleanupFn = null;
      editorInitialized = false;
    }
    onCancel?.();
    
    //  延迟重置处理标志
    setTimeout(() => {
      isProcessing = false;
    }, 300);
  }

  //  更新编辑器内容（供外部调用，用于快捷键填充）
  export async function updateEditorContent(content: string): Promise<void> {
    try {
      logger.debug('[InlineCardEditor] 📝 快捷键填充内容:', {
        contentLength: content?.length || 0,
        contentPreview: content?.substring(0, 50)
      });
      
      if (!editorPoolManager || !currentEditSessionId) {
        logger.error('[InlineCardEditor] ❌ 编辑器未初始化，无法更新内容');
        return;
      }
      
      // 使用 updateSessionContent 真正更新编辑器内容
      const result = await editorPoolManager.updateSessionContent(currentEditSessionId, content);
      
      if (result.success) {
        logger.debug('[InlineCardEditor] ✅ 编辑器内容已更新（快捷键填充）');
        
        // 同步本地内容状态，确保预览和模式切换即时刷新
        handleEditorContentChange(content);
      } else {
        logger.error('[InlineCardEditor] ❌ 更新编辑器内容失败:', result.error);
      }
    } catch (error) {
      logger.error('[InlineCardEditor] ❌ updateEditorContent执行失败:', error);
    }
  }

  // 重置编辑器，为下一张卡片做准备（钉住模式专用）
  export async function resetForNewCard(newCard?: Card) {
    logger.debug('[InlineCardEditor] 🔄 钉住模式：准备下一张卡片', {
      hasNewCard: !!newCard,
      newCardUuid: newCard?.uuid
    });
    
    if (!editorPoolManager || !editorInitialized || !currentEditSessionId) {
      logger.warn('[InlineCardEditor] ⚠️ 编辑器未初始化，需要重新初始化');
      return;
    }

    // 更新会话的 card 对象并清空编辑器内容
    try {
      if (newCard) {
        // 如果提供了新卡片，更新整个card对象（包含uuid等信息）
        const result = await editorPoolManager.updateSessionCard(currentEditSessionId, newCard);
        if (result.success) {
          handleEditorContentChange(newCard.content || '');
          logger.debug('[InlineCardEditor] ✅ 会话卡片对象已更新，编辑器已清空');
        } else {
          logger.error('[InlineCardEditor] ❌ 更新会话卡片对象失败:', result.error);
        }
      } else {
        // 没有提供新卡片，只清空内容
        const result = await editorPoolManager.updateSessionContent(currentEditSessionId, '');
        if (result.success) {
          handleEditorContentChange('');
          logger.debug('[InlineCardEditor] ✅ 编辑器内容已清空');
        } else {
          logger.error('[InlineCardEditor] ❌ 清空编辑器内容失败:', result.error);
        }
      }
    } catch (error) {
      logger.error('[InlineCardEditor] ❌ 重置编辑器失败:', error);
    }
  }

  // 当编辑器容器准备好时，初始化编辑器
  $effect(() => {
    if (editorContainer && !editorInitialized) {
      initializeEditor();
    }
  });

  //  双向绑定后不再需要手动同步 props

  // 清理函数
  $effect(() => {
    return () => {
      if (editCleanupFn) {
        editCleanupFn();
      }
    };
  });
</script>

<div class="inline-card-editor">
  {#if showHeader}
    <div class="editor-header">
      <div class="header-left">
        <h3>{mode === 'create' ? '创建卡片' : '编辑卡片'}</h3>
        {#if isLoading}
          <div class="loading-indicator">
            <EnhancedIcon name="loader" size={16} />
            {editorInitialized ? '保存中...' : '初始化编辑器...'}
          </div>
        {/if}
      </div>
      
      <div class="header-right">
        {#if supportsClozeModeToggle}
          <div class="cloze-mode-switch" role="group" aria-label="挖空模式切换">
            <span class="cloze-mode-label">挖空模式</span>
            <button
              type="button"
              class:active={currentClozeMode === 'reveal'}
              onclick={() => void handleClozeModeToggle('reveal')}
              disabled={isLoading || !editorInitialized}
            >
              显示
            </button>
            <button
              type="button"
              class:active={currentClozeMode === 'input'}
              onclick={() => void handleClozeModeToggle('input')}
              disabled={isLoading || !editorInitialized}
            >
              输入
            </button>
          </div>
        {/if}

        <!-- 牌组选择器 -->
        {#if decks && decks.length > 0}
          <CustomDropdown
            label="牌组:"
            bind:value={selectedDeckId}
            options={decks}
            onchange={(value) => {
              selectedDeckId = value;
              const nextDeckName = decks?.find(d => d.id === value)?.name;
              selectedDeckNames = nextDeckName ? [nextDeckName] : [];
              deckSelectionTouched = true;
              logger.debug('[InlineCardEditor] 牌组选择变更:', selectedDeckId);
            }}
          />
        {/if}
        
        <!-- 关闭按钮 -->
        {#if onClose}
          <button
            class="close-btn"
            onclick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <EnhancedIcon name="x" size={16} />
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="editor-content">

    <!-- Obsidian原生编辑器容器 -->
    <div class="editor-container-wrapper">
      <div 
        class="obsidian-editor-container" 
        bind:this={editorContainer}
      >
        {#if !editorInitialized && !isLoading}
          <div class="editor-placeholder">
            <EnhancedIcon name="edit" size={24} />
            <p>点击这里开始编辑卡片内容</p>
            <small>支持Markdown语法，会自动解析为不同题型</small>
          </div>
        {/if}
        
        {#if isLoading && !editorInitialized}
          <div class="editor-loading">
            <EnhancedIcon name="loader" size={24} />
            <p>正在初始化编辑器...</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- 错误信息 -->
    {#if errorDetails}
      <div class="error-message">
        <EnhancedIcon name="alert-circle" size={16} />
        <span>{errorDetails.message}</span>
      </div>
    {/if}
  </div>

  {#if showFooter}
    <div class="editor-footer">
      <!-- 移动端使用 onclick 替代 pointerup，配合 touch-action: manipulation 消除延迟 -->
      <!-- onclick 在焦点变化后触发，避免与编辑器焦点管理冲突 -->
      <button
        type="button"
        class="mobile-action-btn secondary"
        onclick={(e) => {
          //  使用 onclick 统一处理，配合 CSS touch-action: manipulation 消除300ms延迟
          e.preventDefault();
          if (!isLoading) {
            logger.debug(`[InlineCardEditor] 📱 ${secondaryActionLabel}按钮 click 触发`);
            handleCancel();
          }
        }}
        disabled={isLoading}
      >
        <EnhancedIcon name="x" size={16} />
        {secondaryActionLabel}
      </button>
      
      <button
        type="button"
        class="mobile-action-btn primary"
        onclick={(e) => {
          //  使用 onclick 统一处理，配合 CSS touch-action: manipulation 消除300ms延迟
          e.preventDefault();
          if (!isLoading && editorInitialized) {
            logger.debug('[InlineCardEditor] 📱 创建/保存按钮 click 触发');
            handleSave();
          }
        }}
        disabled={isLoading || !editorInitialized}
      >
        {#if isLoading}
          <EnhancedIcon name="loader" size={16} />
        {:else}
          <EnhancedIcon name={mode === 'create' ? 'plus' : 'save'} size={16} />
        {/if}
        {mode === 'create' ? '创建' : '保存'}
      </button>
    </div>
  {/if}
</div>

<style>
  .inline-card-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
    gap: 16px;
    background: var(--background-primary);
    /* 确保编辑器容器接收触摸事件。 */
    pointer-events: auto;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 12px;
    gap: 16px;
    background: var(--background-primary); /* 🎨 与编辑区保持一致的黑色背景 */
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .header-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 12px;
  }

  .cloze-mode-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background: var(--background-secondary);
  }

  .cloze-mode-label {
    padding: 0 6px;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .cloze-mode-switch button {
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .cloze-mode-switch button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .cloze-mode-switch button.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .cloze-mode-switch button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 关闭按钮样式 */
  .close-btn {
    background: none;
    border: none;
    font-size: 16px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .close-btn:active {
    background: var(--background-modifier-active);
  }

  .editor-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-muted);
  }

  .editor-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    /* 确保内容区域不溢出，让编辑器正确滚动。 */
    overflow: hidden;
  }


  /* 编辑器容器包装器 */
  .editor-container-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    /* 设置最大高度并启用滚动，确保长内容时光标可见。 */
    max-height: 100%;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--background-primary);
  }

  /* Obsidian编辑器容器 */
  .obsidian-editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* 确保容器可以滚动。 */
    max-height: 100%;
    overflow: hidden;
    position: relative;
  }

  /* 确保CodeMirror编辑器填满容器 */
  .obsidian-editor-container :global(.cm-editor) {
    flex: 1;
    min-height: 200px;
    /* 限制最大高度，启用内部滚动。 */
    max-height: 100%;
    border: none;
    border-radius: 0;
    overflow: hidden;
  }

  .obsidian-editor-container :global(.cm-scroller) {
    /* 确保滚动器可滚动，光标始终可见。 */
    overflow-y: auto !important;
    overflow-x: hidden !important;
    /* CodeMirror 会自动滚动到光标位置 */
  }

  /*  隐藏装订线gutter */
  .obsidian-editor-container :global(.cm-gutters) {
    display: none !important;
  }

  :global(body.weave-line-numbers-on) .obsidian-editor-container :global(.cm-gutters) {
    display: flex !important;
  }

  .obsidian-editor-container :global(.cm-content) {
    /*  UX最佳实践：上下20px，左右24px */
    padding: var(--weave-editor-padding-y, 20px) var(--weave-editor-padding-right, var(--weave-editor-padding-x, 24px)) var(--weave-editor-padding-y, 20px) var(--weave-editor-padding-left, var(--weave-editor-padding-x, 24px));
  }

  :global(body.is-phone) .obsidian-editor-container :global(.cm-content),
  :global(body.is-mobile) .obsidian-editor-container :global(.cm-content) {
    padding: var(--weave-editor-padding-y, 12px) var(--weave-editor-padding-right, var(--weave-editor-padding-x, 10px)) var(--weave-editor-padding-y, 12px) var(--weave-editor-padding-left, var(--weave-editor-padding-x, 10px));
  }

  /* 编辑器占位符 */
  .editor-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    min-height: 200px;
    text-align: center;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .editor-placeholder:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .editor-placeholder p {
    margin: 8px 0 4px 0;
    font-size: 16px;
    font-weight: 500;
  }

  .editor-placeholder small {
    font-size: 13px;
    opacity: 0.8;
  }

  /* 编辑器加载状态 */
  .editor-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    min-height: 200px;
    text-align: center;
    color: var(--text-muted);
  }

  .editor-loading p {
    margin: 8px 0 0 0;
    font-size: 14px;
  }

  /* 错误信息 */
  .error-message {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--background-modifier-error);
    border: 1px solid var(--background-modifier-error-border);
    border-radius: 6px;
    color: var(--text-error);
    font-size: 14px;
  }

  /* 编辑器底部操作栏 */
  .editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    /*  移除分割线：border-top: 1px solid var(--background-modifier-border); */
    background: var(--background-primary); /* 🎨 与内容区保持一致的黑色背景 */
    /*  确保按钮容器接收触摸事件 */
    pointer-events: auto;
    /*  确保按钮在最上层 */
    position: relative;
    z-index: 10;
  }
  
  /*  移动端操作按钮样式 */
  .mobile-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
    min-height: 2.25rem;
    /*  确保按钮接收触摸事件 */
    pointer-events: auto;
    touch-action: manipulation; /* 📱 优化触摸响应 */
    -webkit-tap-highlight-color: transparent; /* 📱 移除iOS点击高亮 */
  }
  
  .mobile-action-btn.secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border-color: var(--background-modifier-border);
  }
  
  .mobile-action-btn.secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }
  
  .mobile-action-btn.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: transparent;
  }
  
  .mobile-action-btn.primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }
  
  .mobile-action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .mobile-action-btn:active:not(:disabled) {
    transform: scale(0.98);
  }
  
  /*  移动端：确保按钮在同一行显示 */
  @media (max-width: 768px) {
    .editor-footer {
      flex-direction: row; /* 强制横向排列 */
      justify-content: space-between; /* 两端对齐 */
      gap: 8px;
      padding-top: 12px;
      /*  移动端：确保按钮容器接收触摸事件 */
      pointer-events: auto !important;
    }
    
    .mobile-action-btn {
      flex: 1; /* 按钮等宽 */
      min-width: 0; /* 允许按钮收缩 */
      /*  移动端：确保按钮接收触摸事件 */
      pointer-events: auto !important;
    }
  }

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .inline-card-editor {
      padding: 12px;
      gap: 12px;
    }

    .editor-container-wrapper {
      min-height: 300px;
    }

    .editor-placeholder,
    .editor-loading {
      height: 300px;
    }

    .obsidian-editor-container :global(.cm-editor) {
      min-height: 300px;
    }
  }

  @media (max-width: 768px) {
    .inline-card-editor {
      padding: 12px;
      gap: 12px;
      /*  确保编辑器不超出可用空间 */
      max-height: 100%;
      overflow: hidden;
      /* 关键：参与 flex 布局。 */
      display: flex;
      flex-direction: column;
      /* 填满父容器高度。 */
      height: 100%;
      flex: 1;
    }

    .editor-header h3 {
      font-size: 16px;
    }

    .editor-content {
      /* 移动端：确保内容区域可以收缩。 */
      flex: 1;
      min-height: 0;
      overflow: hidden;
      /* 确保 flex 布局正确传递。 */
      display: flex;
      flex-direction: column;
    }

    .editor-container-wrapper {
      /* 移动端：减小最小高度，避免内容过高。 */
      min-height: 150px;
      /* 确保编辑器可以滚动。 */
      flex: 1;
      overflow: hidden;
      /* 确保 flex 布局正确传递。 */
      display: flex;
      flex-direction: column;
    }

    .editor-placeholder,
    .editor-loading {
      /* 移动端：减小占位符高度。 */
      height: 150px;
    }

    .obsidian-editor-container {
      /* 确保容器填满并传递 flex 布局。 */
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .obsidian-editor-container :global(.cm-editor) {
      /* 移动端：减小最小高度。 */
      min-height: 150px;
      /* 使用 flex 布局而非固定高度。 */
      flex: 1;
      min-height: 0 !important;
      display: flex;
      flex-direction: column;
    }

    .obsidian-editor-container :global(.cm-scroller) {
      /* 移动端：确保滚动正常工作。 */
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
      /* 确保光标位置始终可见。 */
      scroll-padding-bottom: 100px;
      /* flex 布局 + min-height: 0 允许收缩并正确滚动。 */
      flex: 1;
      min-height: 0;
    }
    
    /* 移动端：确保编辑器内容区域可以滚动到光标位置。 */
    .obsidian-editor-container :global(.cm-content) {
      /* 添加底部内边距，确保光标在底部时仍可见。 */
      padding-bottom: 120px !important;
    }

    .obsidian-editor-container :global(.cm-content) {
      /* 移动端：保持与桌面端相同的视觉比例 */
      padding: var(--weave-editor-padding-y, 16px) var(--weave-editor-padding-x, 20px);
    }

    .editor-footer {
      gap: 8px;
      /*  确保底部按钮不被截断 */
      flex-shrink: 0;
    }
  }
</style>
