<!--
  内嵌卡片编辑器
  用于新建和编辑卡片，直接内嵌在页面中，无独立遮罩层
  
  特性:
  - 无遮罩层问题
  - 支持全屏/内嵌双模式
  - 完整的Obsidian快捷键支持
  - 右键菜单正常工作
-->

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { Notice } from 'obsidian';
  import type { Card, Deck } from '../../data/types';
  import type { FieldTemplate } from '../../data/template-types';
  import type AnkiPlugin from '../../main';
  import type { TempFileManager, CardSyncResult } from '../../services/temp-file-manager';
  import type { LoadingState, SaveState, ErrorDetails } from '../../types/editor-types';
  import { templateStore, type TemplateState } from '../../stores/TemplateStore';
  import { getModalStackManager } from '../../services/ModalStackManager';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import Dropdown from '../ui/Dropdown.svelte';

  // Props接口定义
  interface Props {
    /** 卡片数据 */
    card: Card;
    
    /** 插件实例 */
    plugin: AnkiPlugin;
    
    /** 临时文件管理器 */
    tempFileManager: TempFileManager;
    
    /** 编辑模式 */
    mode: 'create' | 'edit';
    
    /** 是否新建卡片 */
    isNew?: boolean;
    
    /** 显示模式 */
    displayMode?: 'inline' | 'fullscreen';
    
    /** 保存回调 */
    onSave: (updatedCard: Card) => void;
    
    /** 取消回调 */
    onCancel: () => void;
    
    /** 可选配置 */
    showHeader?: boolean;
    showFooter?: boolean;
    allowEscape?: boolean;
    
    /** ✅ 性能优化：父组件传递的牌组列表（避免重复加载） */
    decks?: Deck[];
    
    /** ✅ 性能优化：父组件传递的模板列表（避免重复加载） */
    fieldTemplates?: FieldTemplate[];
    
    /** ✅ 新增：父组件选择的牌组ID（用于新建卡片） */
    selectedDeckId?: string;
    
    /** ✅ 新增：父组件选择的模板ID（用于新建卡片） */
    selectedTemplateId?: string;
  }

  let {
    card,
    plugin,
    tempFileManager,
    mode,
    isNew = false,
    displayMode = 'fullscreen',
    onSave,
    onCancel,
    showHeader = true,
    showFooter = true,
    allowEscape = true,
    decks: propsDecks,
    fieldTemplates: propsFieldTemplates,
    selectedDeckId,      // ✅ 新增
    selectedTemplateId   // ✅ 新增
  }: Props = $props();

  // 组件状态
  let loadingState = $state<LoadingState>('idle');
  let saveState = $state<SaveState>('idle');
  let errorDetails = $state<ErrorDetails | null>(null);
  let tempFilePath = $state<string | null>(null);
  let editorContainer = $state<HTMLDivElement>();
  let editorCleanup: (() => void) | undefined;
  
  // 🔥 模态窗管理
  let modalId = $state(`inline-editor-${card.id}-${Date.now()}`);
  let dynamicZIndex = $state(100); // 默认 z-index（遵循 Obsidian 规范）

  // ✅ 性能优化：优先使用父组件传递的数据
  let decks = $state<Deck[]>(propsDecks || []);
  let currentDeckId = $state(card.deckId || '');
  let currentTemplateId = $state(card.templateId || 'basic');

  // 模板状态 - 使用Svelte 5订阅语法
  let templateState = $state<TemplateState>({
    loadState: 'IDLE' as any,
    lastLoaded: null,
    error: null,
    fieldTemplates: propsFieldTemplates || [],
    appliedFieldTemplate: null,
    templateCache: new Map(),
    loadingPromises: new Map(),
    stats: { totalFieldTemplates: 0, cacheHits: 0, cacheMisses: 0 }
  });
  
  let isTemplateLoading = $state(false);
  
  // ✅ 性能优化：仅在父组件未传递数据时才订阅 store
  let templateUnsubscribe: (() => void) | null = null;
  let loadingUnsubscribe: (() => void) | null = null;
  
  if (!propsFieldTemplates || propsFieldTemplates.length === 0) {
    // 没有传递数据，需要订阅 store
    $effect(() => {
      templateUnsubscribe = templateStore.state.subscribe(state => {
        templateState = state;
      });
      
      loadingUnsubscribe = templateStore.isLoading.subscribe(loading => {
        isTemplateLoading = loading;
      });
      
      return () => {
        templateUnsubscribe?.();
        loadingUnsubscribe?.();
      };
    });
  }
  
  // 从templateState获取fieldTemplates列表
  let fieldTemplates = $derived(templateState.fieldTemplates || []);

  // 监听模板切换
  $effect(() => {
    if (currentTemplateId !== card.templateId) {
      handleTemplateChange();
    }
  });

  // 生命周期管理
  onMount(async () => {
    // ✅ 在创建临时文件前，如果提供了 selectedDeckId/selectedTemplateId，先更新 card
    if (selectedDeckId && selectedDeckId !== card.deckId) {
      console.log(`[InlineCardEditor] onMount 时更新牌组: ${card.deckId} -> ${selectedDeckId}`);
      card.deckId = selectedDeckId;
    }
    
    if (selectedTemplateId && selectedTemplateId !== card.templateId) {
      console.log(`[InlineCardEditor] onMount 时更新模板: ${card.templateId} -> ${selectedTemplateId}`);
      card.templateId = selectedTemplateId;
    }
    
    // 🔥 注册模态窗实例，获取动态 z-index
    if (displayMode === 'fullscreen') {
      const modalManager = getModalStackManager();
      dynamicZIndex = modalManager.register(modalId);
      console.log(`[InlineCardEditor] 注册模态窗: ${modalId}, z-index: ${dynamicZIndex}`);
    }

    await initializeTempFile();
    
    // ✅ 性能优化：仅在没有传递数据时才加载
    if (!propsDecks || propsDecks.length === 0) {
      await loadDecks();
    } else {
      console.log('[InlineCardEditor] 使用父组件传递的牌组数据，跳过加载');
    }
    
    // ✅ 性能优化：仅在没有传递数据时才重新加载模板
    if (!propsFieldTemplates || propsFieldTemplates.length === 0) {
      console.log('[InlineCardEditor] 重新加载模板数据');
      await templateStore.loadTemplates(plugin, true);
    } else {
      console.log('[InlineCardEditor] 使用父组件传递的模板数据，跳过加载');
    }
  });

  onDestroy(() => {
    // 🔥 注销模态窗实例
    if (displayMode === 'fullscreen') {
      const modalManager = getModalStackManager();
      modalManager.unregister(modalId);
      console.log(`[InlineCardEditor] 注销模态窗: ${modalId}`);
    }

    cleanup();
  });

  /**
   * 初始化临时文件
   */
  async function initializeTempFile(): Promise<void> {
    try {
      loadingState = 'creating-file';
      errorDetails = null;

      console.log('[InlineCardEditor] 初始化临时文件编辑:', card.id);

      // 创建临时文件
      const result = await tempFileManager.createTempFile(card);
      if (!result.success) {
        throw new Error(result.error || '创建临时文件失败');
      }

      tempFilePath = result.filePath!;
      console.log('[InlineCardEditor] 临时文件创建成功:', tempFilePath);

      loadingState = 'creating-editor';

      // ✅ 性能优化：仅等待 Svelte DOM 更新（移除不必要的 requestAnimationFrame）
      await tick();

      if (!editorContainer) {
        throw new Error('编辑器容器绑定失败，DOM未正确渲染');
      }

      console.log('[InlineCardEditor] ✓ 编辑器容器已成功绑定');

      await createEmbeddedEditor();
      loadingState = 'ready';

    } catch (err) {
      console.error('[InlineCardEditor] 初始化失败:', err);
      
      const errorMessage = err instanceof Error ? err.message : '初始化失败';
      errorDetails = {
        message: errorMessage,
        recoverable: true,
        originalError: err instanceof Error ? err : undefined
      };
      loadingState = 'error';
      
      new Notice(`初始化失败: ${errorMessage}`, 5000);
    }
  }

  /**
   * 创建嵌入式编辑器
   */
  async function createEmbeddedEditor(): Promise<void> {
    try {
      console.log('[InlineCardEditor] 开始创建嵌入式编辑器');

      if (!editorContainer) {
        throw new Error('编辑器容器引用未找到');
      }

      const editorResult = await tempFileManager.createEmbeddedEditor(
        editorContainer,
        card.id,
        handleEditorSave,
        handleEditorCancel
      );

      if (!editorResult.success) {
        throw new Error(editorResult.error || '创建嵌入式编辑器失败');
      }

      editorCleanup = editorResult.cleanup;

      console.log('[InlineCardEditor] 嵌入式编辑器创建成功');
      new Notice('编辑器已准备就绪');

    } catch (err) {
      console.error('[InlineCardEditor] 创建编辑器失败:', err);
      
      const errorMessage = err instanceof Error ? err.message : '创建编辑器失败';
      errorDetails = {
        message: errorMessage,
        recoverable: true,
        originalError: err instanceof Error ? err : undefined
      };
      loadingState = 'error';
      
      new Notice(`创建编辑器失败: ${errorMessage}`, 5000);
    }
  }

  /**
   * 编辑器保存回调
   */
  function handleEditorSave(content: string): void {
    console.log('[InlineCardEditor] 编辑器保存回调触发');
    handleSave();
  }

  /**
   * 编辑器取消回调
   */
  function handleEditorCancel(): void {
    console.log('[InlineCardEditor] 编辑器取消回调触发');
    handleCancel();
  }

  /**
   * 保存卡片
   */
  async function handleSave(): Promise<void> {
    if (saveState === 'saving') {
      console.log('[InlineCardEditor] 正在保存中，跳过重复保存');
      return;
    }

    try {
      saveState = 'saving';
      console.log('[InlineCardEditor] 开始保存卡片');

      // ✅ 在保存前更新卡片的牌组和模板（来自父组件的选择）
      if (selectedDeckId && selectedDeckId !== card.deckId) {
        console.log(`[InlineCardEditor] 更新牌组: ${card.deckId} -> ${selectedDeckId}`);
        card.deckId = selectedDeckId;
      }
      
      if (selectedTemplateId && selectedTemplateId !== card.templateId) {
        console.log(`[InlineCardEditor] 更新模板: ${card.templateId} -> ${selectedTemplateId}`);
        card.templateId = selectedTemplateId;
      }

      // 同步临时文件到卡片
      const result: CardSyncResult = await tempFileManager.finishEditing(card.id, true);

      if (!result.success) {
        throw new Error(result.error || '保存失败');
      }

      if (result.updatedCard) {
        card = result.updatedCard;
      }

      saveState = 'saved';
      console.log('[InlineCardEditor] 卡片保存成功');
      new Notice('卡片已保存');

      // 延迟触发回调，让保存反馈显示一会
      setTimeout(() => {
        onSave(card);
      }, 500);

    } catch (err) {
      console.error('[InlineCardEditor] 保存失败:', err);
      saveState = 'error';
      
      const errorMessage = err instanceof Error ? err.message : '保存失败';
      new Notice(`保存失败: ${errorMessage}`, 5000);
    }
  }

  /**
   * 取消编辑
   */
  function handleCancel(): void {
    console.log('[InlineCardEditor] 取消编辑');
    
    if (tempFileManager && card) {
      tempFileManager.cancelEditing(card.id);
    }
    
    onCancel();
  }

  /**
   * 处理模板切换
   */
  function handleTemplateChange(): void {
    console.log('[InlineCardEditor] 模板切换:', currentTemplateId);
    
    // 更新卡片的templateId
    card.templateId = currentTemplateId;
    
    // 注意：模板切换时，字段映射逻辑由TempFileManager在保存时处理
  }
  
  /**
   * 处理键盘事件
   */
  function handleKeydown(event: KeyboardEvent): void {
    // Ctrl+Enter: 保存
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
      return;
    }

    // Escape: 取消（如果允许）
    if (event.key === 'Escape' && allowEscape) {
      // 检查焦点是否在编辑器内
      const target = event.target as HTMLElement;
      const isInEditor = editorContainer?.contains(target);
      
      // 如果在编辑器内，让编辑器先处理
      if (isInEditor) {
        // 延迟处理，让编辑器的事件处理器先执行
        setTimeout(() => {
          // 如果编辑器没有阻止默认行为，则关闭编辑器
          if (!event.defaultPrevented) {
            handleCancel();
          }
        }, 10);
      } else {
        // 如果不在编辑器内，直接取消
        event.preventDefault();
        handleCancel();
      }
    }
  }

  /**
   * 加载牌组列表
   */
  async function loadDecks(): Promise<void> {
    try {
      decks = await plugin.dataStorage.getAllDecks();
    } catch (err) {
      console.error('[InlineCardEditor] 加载牌组失败:', err);
    }
  }

  /**
   * 清理资源
   */
  function cleanup(): void {
    console.log('[InlineCardEditor] 清理资源');
    
    if (editorCleanup) {
      editorCleanup();
      editorCleanup = undefined;
    }
    
    if (tempFileManager && card && tempFileManager.isCardEditing(card.id)) {
      tempFileManager.cancelEditing(card.id);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
  class="inline-card-editor" 
  data-mode={displayMode} 
  data-state={loadingState}
  style:z-index={displayMode === 'fullscreen' ? dynamicZIndex : undefined}
>
  <!-- 头部 -->
  {#if showHeader}
    <div class="editor-header">
      <div class="header-left">
        <h2 class="editor-title">
          {mode === 'create' ? '新建卡片' : '编辑卡片'}
        </h2>
        {#if isNew}
          <span class="editor-badge">新卡片</span>
        {/if}
      </div>
      
      <div class="header-right">
        <!-- 模板选择 -->
        {#if fieldTemplates.length > 0}
          <div class="header-control template-control">
            <label for="template-selector">模板:</label>
            <select id="template-selector" bind:value={currentTemplateId} class="deck-selector">
              {#each fieldTemplates as template}
                <option value={template.id}>{template.name}</option>
              {/each}
            </select>
          </div>
        {/if}
        
        <!-- 牌组选择 -->
        {#if decks.length > 0}
          <div class="header-control">
            <label for="deck-selector">牌组:</label>
            <select id="deck-selector" bind:value={currentDeckId} class="deck-selector">
              {#each decks as deck}
                <option value={deck.id}>{deck.name}</option>
              {/each}
            </select>
          </div>
        {/if}
        
        <!-- 关闭按钮 -->
        <button
          class="close-button"
          onclick={handleCancel}
          aria-label="关闭"
          title="关闭 (Esc)"
        >
          <EnhancedIcon name="x" size="16" />
        </button>
      </div>
    </div>
  {/if}

  <!-- 🔥 来源信息横幅已移除 - 元数据现在存储在YAML中 -->

  <!-- 主编辑区 -->
  <div class="editor-body">
    <div class="editor-panel">
      <!-- 加载状态覆盖层 -->
      {#if loadingState === 'creating-file' || loadingState === 'creating-editor'}
        <div class="loading-overlay">
          <div class="loading-spinner"></div>
          <p class="loading-text">
            {loadingState === 'creating-file' ? '正在准备编辑器...' : '正在加载编辑器...'}
          </p>
          <div class="loading-progress">
            <div class="loading-progress-bar"></div>
          </div>
        </div>
      {/if}

      <!-- 编辑器容器 -->
      <div class="embedded-editor-container" style:display={loadingState === 'error' ? 'none' : 'flex'}>
        <div bind:this={editorContainer} class="editor-container" data-ready={loadingState === 'ready'}>
          <!-- 编辑器将在这里动态创建 -->
        </div>
      </div>

      <!-- 保存状态反馈 -->
      {#if saveState === 'saved'}
        <div class="save-feedback">
          <EnhancedIcon name="check" size="16" />
          <span>已保存</span>
        </div>
      {/if}

      <!-- 错误显示 -->
      {#if loadingState === 'error' && errorDetails}
        <div class="error-container">
          <EnhancedIcon name="alert-triangle" size="24" />
          <h3>初始化失败</h3>
          <p>{errorDetails.message}</p>
          {#if errorDetails.recoverable}
            <button onclick={() => initializeTempFile()} class="retry-button">
              重试
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- 底部操作栏 -->
  {#if showFooter && loadingState === 'ready'}
    <div class="editor-footer">
      <div class="footer-left">
        <span class="footer-hint">Ctrl+Enter 保存</span>
        {#if allowEscape}
          <span class="footer-hint">Escape 取消</span>
        {/if}
      </div>
      <div class="footer-right">
        <EnhancedButton
          variant="secondary"
          onclick={handleCancel}
        >
          取消
        </EnhancedButton>
        <EnhancedButton
          variant="primary"
          onclick={handleSave}
          disabled={saveState === 'saving'}
        >
          {saveState === 'saving' ? '保存中...' : '保存'}
        </EnhancedButton>
      </div>
    </div>
  {/if}
</div>

<style>
  /* 基础样式在inline-card-editor.css中定义 */
  /* 这里只定义组件特定的样式 */
</style>

