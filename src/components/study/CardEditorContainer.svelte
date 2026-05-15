<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { Card } from "../../data/types";
  import { CardType } from "../../data/types";
  import type { EmbeddableEditorManager } from "../../services/editor/EmbeddableEditorManager";
  import { cardToMarkdown, markdownToCard } from "../../utils/card-markdown-serializer";
  import { detectClozeModeFromContent, hasClozeSyntax, setClozeModeInContent, type ClozeMode } from "../../utils/cloze-mode";
  import type { WeaveDataStorage } from "../../data/storage";
  import { logger } from "../../utils/logger";
  import { Notice, Platform } from "obsidian";
  import { tr } from '../../utils/i18n';

  interface Props {
    card: Card | null;
    realCardId?: string;  //  真实卡片ID，用于学习会话保存
    editorSessionId?: string;
    showEditModal: boolean;
    tempFileUnavailable: boolean;
    isClozeMode: boolean;
    editorPoolManager: EmbeddableEditorManager | null;
    dataStorage: WeaveDataStorage;
    modalRef: HTMLDivElement | null;
    statsCollapsed: boolean;
    onEditComplete: (updatedCard: Card) => void | Promise<void>;
    onEditCancel: () => void;
    onToggleCloze?: () => void;
  }

  let {
    card,
    realCardId,
    editorSessionId,
    showEditModal,
    tempFileUnavailable,
    isClozeMode,
    editorPoolManager,
    dataStorage,
    modalRef,
    statsCollapsed,
    onEditComplete,
    onEditCancel,
    onToggleCloze
  }: Props = $props();

  function getEditableSourceContent(targetCard: Card | null | undefined): string {
    if (!targetCard) return '';
    return tempFileUnavailable ? cardToMarkdown(targetCard) : (targetCard.content || '');
  }

  let t = $derived($tr);

  let inlineEditorContainer: HTMLDivElement | null = $state(null);
  let editorHostEl: HTMLDivElement | null = $state(null);
  let editorInitialized = $state(false);
  let editCleanupFn: (() => void) | null = $state(null);
  let plainTextEditorEl: HTMLTextAreaElement | null = $state(null);
  let currentContent = $state(untrack(() => getEditableSourceContent(card)));
  let isClozeModeUpdating = $state(false);

  const localEditorSessionId = `weave-study-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const supportsClozeModeToggle = $derived.by(() => {
    const content = currentContent || card?.content || '';
    const isProgressiveCard = card?.type === CardType.ProgressiveParent || card?.type === CardType.ProgressiveChild;
    return !!card && !isProgressiveCard && (hasClozeSyntax(content) || card?.type === CardType.Cloze);
  });

  const currentClozeMode = $derived.by(() => {
    return detectClozeModeFromContent(currentContent || card?.content || '');
  });

  const isClozeModeToggleDisabled = $derived.by(() => {
    return !card || isClozeModeUpdating || (!tempFileUnavailable && !editorInitialized);
  });
  
  // 移动端键盘管理
  let isKeyboardVisible = $state(false);
  let keyboardCleanup: (() => void) | null = null;

  // 键盘状态变化处理（通知父组件）
  //  高度计算已移到 StudyInterface，这里只负责通知状态变化
  function handleKeyboardStateChange(visible: boolean, viewportHeight?: number, viewportOffsetTop?: number): void {
    isKeyboardVisible = visible;
    
    logger.debug('[CardEditorContainer] 📱 键盘状态变化:', {
      visible,
      viewportHeight,
      viewportOffsetTop
    });
  }

  function handleEditorContentChange(content: string): void {
    currentContent = content;
  }

  async function updateEditorContent(nextContent: string): Promise<void> {
    currentContent = nextContent;

    if (tempFileUnavailable) {
      if (plainTextEditorEl) {
        plainTextEditorEl.value = nextContent;
      }
      return;
    }

    if (!editorPoolManager || !editorInitialized) {
      throw new Error('编辑器尚未初始化');
    }

    const sessionCardId = editorSessionId || localEditorSessionId;
    const editorContainer = editorHostEl as HTMLElement | null;
    if (!editorContainer) {
      throw new Error('编辑器容器未找到');
    }

    const updateResult = await editorPoolManager.updateSessionContent(
      sessionCardId,
      nextContent,
      editorContainer
    );

    if (!updateResult.success) {
      throw new Error(updateResult.error || '更新编辑器内容失败');
    }
  }

  async function handleClozeModeToggle(mode: ClozeMode): Promise<void> {
    if (!card) return;

    const content = currentContent || card.content || '';
    const nextContent = setClozeModeInContent(content, mode);

    if (nextContent === content) {
      return;
    }

    try {
      isClozeModeUpdating = true;
      await updateEditorContent(nextContent);
      new Notice(mode === 'input' ? '已切换为输入模式' : '已切换为显示模式');
    } catch (error) {
      logger.error('[CardEditorContainer] 切换挖空模式失败:', error);
      new Notice(error instanceof Error ? error.message : '切换挖空模式失败');
    } finally {
      isClozeModeUpdating = false;
    }
  }

  //  监听 Visual Viewport 变化（核心修复）
  function setupKeyboardDetection(): (() => void) | undefined {
    if (!Platform.isMobile) return undefined;
    
    const viewport = window.visualViewport;
    if (!viewport) {
      logger.warn('[CardEditorContainer] visualViewport API 不可用');
      return undefined;
    }
    
    // 记录基准高度（用于检测键盘是否弹出）；在键盘收起时会动态更新
    let baselineHeight = viewport.height;
    const threshold = 150; // 键盘检测阈值（键盘高度通常 > 200px）
    
    logger.debug('[CardEditorContainer] 📱 初始化键盘检测, 初始高度:', baselineHeight);
    
    // 立即设置初始高度和位置
    handleKeyboardStateChange(false, baselineHeight, viewport.offsetTop);
    
    const handleResize = () => {
      const currentHeight = viewport.height;
      const currentOffsetTop = viewport.offsetTop;
      const heightDiff = baselineHeight - currentHeight;
      const keyboardVisible = heightDiff > threshold;

      // 键盘收起时，更新基准高度（处理地址栏/顶部栏动态变化）
      if (!keyboardVisible) {
        baselineHeight = currentHeight;
      }
      
      //  每次 resize 都更新高度和位置
      handleKeyboardStateChange(keyboardVisible, currentHeight, currentOffsetTop);
    };
    
    // 监听 resize 事件
    viewport.addEventListener('resize', handleResize);
    
    //  额外监听 scroll 事件（某些设备键盘弹出时会触发 scroll）
    viewport.addEventListener('scroll', handleResize);
    
    // 返回清理函数
    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }

  // 进入编辑模式
  async function enterEditMode() {
    if (!card || !editorPoolManager) {
      logger.error('Cannot enter edit mode: missing card or editorPoolManager');
      return;
    }

    try {
      const sessionCardId = editorSessionId || localEditorSessionId;

      // 重置降级标志并先切换到编辑态以渲染容器
      await tick();

      //  获取编辑器挂载点（避免清空容器导致保存按钮丢失）
      const editorContainer = editorHostEl as HTMLElement | null;
      if (!editorContainer) {
        logger.error('[CardEditorContainer] 编辑器容器未找到');
        onEditCancel();
        return;
      }

      // 编辑器复用逻辑
      if (editorInitialized) {
        // 后续进入编辑：复用编辑器，只更新内容
        logger.debug('[CardEditorContainer]',' 复用编辑器实例，更新卡片内容:', card.uuid);
        
        // 设置当前编辑的卡片ID
        editorPoolManager.setCurrentEditingCard(card.uuid);

        // 更新编辑器内容（复用实例）
        const updateResult = await editorPoolManager.updateSessionContent(
          sessionCardId,
          card.content,
          editorContainer
        );

        if (!updateResult.success) {
          logger.error('[CardEditorContainer] 更新编辑器内容失败:', updateResult.error);
          new Notice(t('study.editor.updateFailed'));
          return;
        }

        currentContent = getEditableSourceContent(card);
        logger.debug('[CardEditorContainer]',' ✅ 编辑器内容已更新');

      } else {
        //  首次进入编辑：创建编辑器实例
        logger.debug('[CardEditorContainer]',' 首次创建编辑器实例');
        
        // 清空挂载点
        editorContainer.replaceChildren();

        // 创建编辑会话（使用固定的会话 cardId）
        const sessionResult = await editorPoolManager.createEditorSession(card, {
          isStudySession: true,
          sessionId: sessionCardId
        });

        if (!sessionResult.success) {
          logger.error('Failed to create editor session:', sessionResult.error);
          onEditCancel();
          new Notice(t('study.editor.sessionCreateFailed'));
          return;
        }

        // 创建嵌入式编辑器
        const editorResult = await editorPoolManager.createEmbeddedEditor(
          editorContainer,
          sessionCardId,
          handleEditorSave,
          handleEditorCancel,
          handleEditorContentChange
        );

        if (!editorResult.success) {
          logger.error('Failed to create embedded editor:', editorResult.error);
          onEditCancel();
          new Notice(t('study.editor.editorCreateFailed'));
          return;
        }

        // 保存清理函数
        editCleanupFn = editorResult.cleanup || null;
        
        // 设置当前编辑的卡片ID
        editorPoolManager.setCurrentEditingCard(card.uuid);
        
        // 标记编辑器已初始化
        editorInitialized = true;
        currentContent = getEditableSourceContent(card);

        logger.debug('[CardEditorContainer]',' ✅ 编辑器创建成功');
      }

      logger.debug('[CardEditorContainer]',' 编辑模式启动成功，当前卡片:', card.uuid);
      
      // 移动端不调用 applyAdaptiveHeight，由 visualViewport 监听处理高度
      // 桌面端仍然需要调用以适应窗口大小
      if (!Platform.isMobile) {
        setTimeout(() => {
          applyAdaptiveHeight();
        }, 50);
      }

    } catch (error) {
      logger.error('[CardEditorContainer] 进入编辑模式失败:', error);
      onEditCancel();
      new Notice(t('study.editor.enterEditFailed'));
    }
  }

  /**
   * 计算可用的内容区域高度
   */
  function calculateAvailableHeight(): number {
    if (!modalRef) return 400;

    const modalRect = modalRef.getBoundingClientRect();
    const headerEl = modalRef.querySelector('.study-header') as HTMLElement;
    const footerEl = modalRef.querySelector('.study-footer') as HTMLElement;
    const statsEl = modalRef.querySelector('.stats-cards') as HTMLElement;

    let usedHeight = 0;

    // 计算已使用的高度
    if (headerEl) usedHeight += headerEl.offsetHeight;
    if (footerEl && !showEditModal) usedHeight += footerEl.offsetHeight;
    if (statsEl && !statsCollapsed) usedHeight += statsEl.offsetHeight;

    // 预留间距
    const reservedSpacing = showEditModal ? 48 : 80;

    return Math.max(400, modalRect.height - usedHeight - reservedSpacing);
  }

  /**
   * 应用高度自适应
   */
  function applyAdaptiveHeight(): void {
    const availableHeight = calculateAvailableHeight();

    // 为编辑器容器设置高度
    const editorContainer = inlineEditorContainer;
    if (editorContainer && showEditModal) {
      const cmEditor = editorContainer.querySelector('.cm-editor');
      if (!cmEditor) {
        return; // 编辑器未就绪，跳过本次计算
      }
      
      const finalHeight = Math.max(400, availableHeight);
      editorContainer.style.height = `${finalHeight}px`;
      editorContainer.style.maxHeight = 'none';
    }
  }

  // 退出编辑模式（保存并切回预览）
  async function exitEditMode() {
    if (!card || !editorPoolManager) {
      logger.error('Cannot exit edit mode: missing card or editorPoolManager');
      return;
    }

    try {
      const sessionCardId = editorSessionId || localEditorSessionId;

      // 使用学习会话模式保存
      const result = await editorPoolManager.finishEditing(sessionCardId, true, {
        isStudySession: true,
        targetCardId: realCardId || card.uuid //  优先使用真实卡片UUID
      });

      if (result.success && result.updatedCard) {
        logger.debug('[CardEditorContainer]',' ✅ 卡片保存成功:', result.updatedCard.uuid);
        new Notice(t('study.editor.cardSaved'));

        //  学习会话模式：不清理编辑器（复用）
        // editCleanupFn 保留，编辑器实例保持活跃

        //  通知父组件更新卡片（支持async回调）
        await Promise.resolve(onEditComplete(result.updatedCard));
      } else {
        //  保存失败：停留在编辑模式，不清理资源
        logger.error('[CardEditorContainer] 卡片保存失败:', result.error);
        new Notice(t('study.editor.saveFailed', { error: result.error || t('study.editor.unknownError') }));
        // 不执行任何清理和状态切换，用户可以继续编辑或重试
      }

    } catch (error) {
      //  异常情况：停留在编辑模式
      logger.error('[CardEditorContainer] 保存过程异常:', error);
      new Notice(t('study.editor.saveFailed', { error: error instanceof Error ? error.message : t('study.editor.unknownError') }));
      // 不执行任何清理和状态切换
    }
  }

  // 编辑器保存回调
  function handleEditorSave(_content: string) {
    logger.debug('[CardEditorContainer]','Editor save callback triggered');
    // ℹ EmbeddableEditorManager说明：
    // 编辑器通过onChange实时更新内容到内存
    // 实际保存由父组件的handleToggleEdit调用finishEditing完成
    // 用户点击"保存并预览"按钮 → handleToggleEdit → finishEditing → handleEditorComplete
  }

  // 编辑器取消回调
  async function handleEditorCancel() {
    logger.debug('[CardEditorContainer]','Editor cancel callback triggered');
    
    if (!editorPoolManager) {
      onEditCancel();
      return;
    }

    // 学习会话模式：只清空编辑器内容，不销毁实例
    if (editorInitialized) {
      const sessionCardId = editorSessionId || localEditorSessionId;
      const editorContainer = inlineEditorContainer as HTMLElement | null;
      
      //  使用 updateSessionContent 清空编辑器内容
      if (editorContainer) {
        const clearResult = await editorPoolManager.updateSessionContent(
          sessionCardId,
          '',  // 清空内容
          editorContainer
        );
        if (clearResult.success) {
          logger.debug('[CardEditorContainer]',' ✅ 编辑器内容已清空（取消编辑）');
        }
      }

      // editCleanupFn 保留，不清理编辑器实例
    }

    // 通知父组件取消编辑
    onEditCancel();
  }

  // 普通文本编辑器保存回调
  async function handlePlainEditorSave(content: string) {
    if (!card) return;

    try {
      // 使用序列化工具解析内容
      const updatedCard = markdownToCard(content, card);

      // 保存到数据存储
      await dataStorage.saveCard(updatedCard);

      logger.debug('[CardEditorContainer]','Plain editor: Card saved successfully:', updatedCard.uuid);
      new Notice(t('study.editor.cardSaved'));

      //  通知父组件更新卡片（支持async回调）
      await Promise.resolve(onEditComplete(updatedCard));

    } catch (error) {
      logger.error('Failed to save card from plain editor:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new Notice(t('study.editor.saveFailed', { error: errorMessage }));
    }
  }

  // 切换挖空预览模式
  function handleToggleCloze() {
    if (onToggleCloze) {
      onToggleCloze();
    } else {
      // 切换编辑器容器的CSS类
      const editorContainer = inlineEditorContainer;
      if (editorContainer) {
        if (!isClozeMode) {
          editorContainer.classList.add('cloze-deletion-mode');
        } else {
          editorContainer.classList.remove('cloze-deletion-mode');
        }
      }
    }
  }

  // 当 showEditModal 变为 true 且卡片存在时，自动进入编辑模式
  $effect(() => {
    if (showEditModal && card && editorPoolManager && !tempFileUnavailable) {
      enterEditMode();
    }
  });

  //  移动端：仅在编辑模式期间监听键盘变化（退出编辑立即清理，避免监听泄漏与状态污染）
  $effect(() => {
    if (!Platform.isMobile) {
      return;
    }

    if (showEditModal) {
      if (!keyboardCleanup) {
        keyboardCleanup = setupKeyboardDetection() || null;
      }

      // effect 销毁时移除监听，避免残留
      return () => {
        if (keyboardCleanup) {
          keyboardCleanup();
          keyboardCleanup = null;
        }

        if (isKeyboardVisible) {
          handleKeyboardStateChange(false);
        }
      };
    } else {
      if (keyboardCleanup) {
        keyboardCleanup();
        keyboardCleanup = null;
      }

      if (isKeyboardVisible) {
        handleKeyboardStateChange(false);
      }
    }
  });

  // 当卡片变化时，如果编辑器已初始化，更新编辑器内容
  $effect(() => {
    if (showEditModal && card && editorPoolManager && editorInitialized && !tempFileUnavailable) {
      const sessionCardId = editorSessionId || localEditorSessionId;
      const editorContainer = editorHostEl as HTMLElement | null;
      if (editorContainer) {
        editorPoolManager.setCurrentEditingCard(card.uuid);
        editorPoolManager.updateSessionContent(sessionCardId, card.content, editorContainer);
        currentContent = getEditableSourceContent(card);
      }
    }
  });

  // 清理函数
  $effect(() => {
    return () => {
      // 组件销毁时清理编辑器资源
      if (editCleanupFn) {
        editCleanupFn();
        editCleanupFn = null;
      }
    };
  });
</script>

{#if showEditModal}
  <!-- 编辑器容器 - 仅编辑态显示 -->
  <!-- Mobile height is controlled by StudyInterface visualViewport handling -->
  <div 
    class="inline-editor-container" 
    class:mobile-keyboard-active={Platform.isMobile && isKeyboardVisible}
    bind:this={inlineEditorContainer} 
    class:cloze-deletion-mode={isClozeMode}
  >
    {#if false && supportsClozeModeToggle}
      <div class="study-editor-toolbar">
        <div class="cloze-mode-switch" role="group" aria-label="挖空模式切换">
          <span class="cloze-mode-label">挖空模式</span>
          <button
            type="button"
            class:active={currentClozeMode === 'reveal'}
            onclick={() => handleClozeModeToggle('reveal')}
            disabled={isClozeModeToggleDisabled}
          >
            显示
          </button>
          <button
            type="button"
            class:active={currentClozeMode === 'input'}
            onclick={() => handleClozeModeToggle('input')}
            disabled={isClozeModeToggleDisabled}
          >
            输入
          </button>
        </div>
      </div>
    {/if}

    <div class="embedded-editor-host" bind:this={editorHostEl}></div>

    <!-- 编辑器将在这里被EmbeddableEditorManager创建 -->
    {#if tempFileUnavailable}
      <!-- 降级普通文本编辑器 -->
      <div class="plain-editor-container">
        <textarea
          class="plain-text-editor"
          value={currentContent}
          bind:this={plainTextEditorEl}
          oninput={(event) => {
            currentContent = (event.currentTarget as HTMLTextAreaElement).value;
          }}
          placeholder={t('study.editor.placeholder')}
        ></textarea>
        <div class="plain-editor-actions">
          <button
            class="btn-secondary"
            onclick={handleEditorCancel}
          >
            {t('study.editor.cancel')}
          </button>
          <button
            class="btn-primary"
            onclick={() => {
              if (plainTextEditorEl) {
                handlePlainEditorSave(plainTextEditorEl.value);
              }
            }}
          >
            {t('study.editor.save')}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* 行内编辑器样式 - 高度自适应优化 */
  .inline-editor-container {
    flex: 1; /* 填满可用空间 */
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden; /* 由内部编辑器处理滚动 */
    margin: var(--weave-space-md); /* 四周留出合适间距 */
    min-height: 400px; /* 确保最小显示高度，防止过度收缩 */
  }

  .embedded-editor-host {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  .study-editor-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 0.75rem 0.75rem 0;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    background: var(--background-primary);
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
  
  /*  CodeMirror编辑器填满容器 */
  .inline-editor-container :global(.cm-editor) {
    flex: 1;
    min-height: 300px; /* 确保最小显示高度 */
    position: relative;
    z-index: 1;
  }
  
  /*  默认隐藏装订线 gutter（需要行号时再开启） */
  .inline-editor-container :global(.cm-gutters) {
    display: none !important;
  }

  :global(body.weave-line-numbers-on) .inline-editor-container :global(.cm-gutters) {
    display: flex !important;
  }
  
  /*  编辑器内容区padding - UX最佳实践 */
  .inline-editor-container :global(.cm-content) {
    padding: var(--weave-editor-padding-y, 20px) var(--weave-editor-padding-right, var(--weave-editor-padding-x, 24px)) var(--weave-editor-padding-y, 20px) var(--weave-editor-padding-left, var(--weave-editor-padding-x, 24px)) !important;
  }

  :global(body.is-phone) .inline-editor-container :global(.cm-content),
  :global(body.is-mobile) .inline-editor-container :global(.cm-content) {
    padding: var(--weave-editor-padding-y, 12px) var(--weave-editor-padding-right, var(--weave-editor-padding-x, 10px)) var(--weave-editor-padding-y, 12px) var(--weave-editor-padding-left, var(--weave-editor-padding-x, 10px)) !important;
  }
  
  /*  确保CodeMirror内部滚动区域正确 */
  .inline-editor-container :global(.cm-scroller) {
    overflow-y: auto !important;
  }

  :global(body.is-phone) .inline-editor-container :global(.cm-scroller),
  :global(body.is-mobile) .inline-editor-container :global(.cm-scroller) {
    padding: 0 !important;
  }

  /* 挖空预览模式 */
  .inline-editor-container.cloze-deletion-mode :global(.cm-editor) {
    /* 隐藏==高亮==内容的样式 */
    position: relative;
  }

  .inline-editor-container.cloze-deletion-mode :global(.cm-editor .cm-highlight) {
    background: var(--background-modifier-border);
    color: transparent;
    cursor: pointer;
    border-radius: 3px;
  }

  .inline-editor-container.cloze-deletion-mode :global(.cm-editor .cm-highlight:hover) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 普通文本编辑器样式 */
  .plain-editor-container {
    flex: 1; /* 填满可用空间 */
    display: flex;
    flex-direction: column;
    min-height: 0; /* 允许收缩 */
  }

  .plain-text-editor {
    flex: 1;
    width: 100%;
    min-height: 350px;
    padding: 1rem;
    border: none;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-text);
    font-size: 0.875rem;
    line-height: 1.6;
    resize: none;
    outline: none;
  }

  .plain-text-editor:focus {
    background: var(--background-primary);
  }

  .plain-editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
  }

  .plain-editor-actions button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }

  /* 桌面端不进行布局重排，移动端布局由 :global(body.is-phone) 控制 */

  /*  移动端编辑器样式 - 使用 position: fixed + visualViewport 动态定位 */
  /* 键盘弹出时，编辑器固定在可视区域内 */
  :global(body.is-mobile) .inline-editor-container,
  :global(body.is-phone) .inline-editor-container {
    /* 默认使用 flex 布局填满父容器 */
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    min-height: 0;
    margin: 0 !important;
    border: none !important;
    border-radius: 0 !important;
    overflow: hidden;
    background: var(--background-primary);
  }

  :global(body.is-mobile) .study-editor-toolbar,
  :global(body.is-phone) .study-editor-toolbar {
    padding: 0.5rem 0.5rem 0;
  }

  /*  键盘激活时：使用 flex 布局填满父容器（父容器高度已由 StudyInterface 设置为 visualViewport.height） */
  /* 不再使用 position: fixed，让编辑器自然填满父容器 */
  :global(body.is-mobile) .inline-editor-container.mobile-keyboard-active,
  :global(body.is-phone) .inline-editor-container.mobile-keyboard-active {
    /* 使用 flex 布局填满父容器 */
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
    margin: 0 !important;
    border-radius: 0 !important;
    overflow: hidden !important;
    background: var(--background-primary);
  }

  :global(body.is-mobile) .inline-editor-container :global(.cm-editor),
  :global(body.is-phone) .inline-editor-container :global(.cm-editor) {
    /* 编辑器填满容器 - 使用 flex 而非固定高度 */
    flex: 1;
    min-height: 0 !important;
    /* 移除 height: 100% !important，让容器高度由 JavaScript 控制 */
  }

  :global(body.is-mobile) .inline-editor-container :global(.cm-scroller),
  :global(body.is-phone) .inline-editor-container :global(.cm-scroller) {
    /* 确保滚动区域正确 */
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    /* 使用 flex 布局而非固定高度 */
    flex: 1;
    min-height: 0;
  }

</style>
