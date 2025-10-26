<!--
  新建卡片模态窗组件
  职责：提供独立的新建卡片界面，支持透明遮罩、窗口拖拽、外部交互
  ✅ 重构后架构：接受预加载数据，无需异步加载，稳定可靠
  ✅ 全局菜单修复：监听并修复 Obsidian 原生菜单的 z-index
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type AnkiPlugin from '../../main';
  import type { Card } from '../../data/types';
  import type { TempFileManager } from '../../services/temp-file-manager';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import InlineCardEditor from '../editor/InlineCardEditor.svelte';
  import CustomDropdown from '../ui/CustomDropdown.svelte';
  import { Notice } from 'obsidian';

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;

    /** 关闭回调 - 用于销毁组件和清理DOM */
    onModalClose: () => void;

    /** 卡片数据 */
    card: Card;

    /** 插件实例 */
    plugin: AnkiPlugin;

    /** 临时文件管理器 */
    tempFileManager: TempFileManager;

    /** ✅ 预加载的牌组数据 */
    decks: any[];

    /** ✅ 预加载的模板数据 */
    templates: any[];

    /** 保存成功回调 */
    onSave?: (card: Card) => void;

    /** 取消回调 */
    onCancel?: () => void;
  }

  let {
    open = $bindable(),
    onModalClose,
    card,
    plugin,
    tempFileManager,
    decks: preloadedDecks,
    templates: preloadedTemplates,
    onSave,
    onCancel
  }: Props = $props();

  // ✅ 使用预加载的数据（无需异步加载，数据已准备就绪）
  let decks = $state<any[]>(preloadedDecks);
  let templates = $state<any[]>(preloadedTemplates);
  
  // 当前选择的牌组
  let selectedDeckId = $state(card.deckId);
  // ✅ 模板ID固定为official-qa（题型由MD格式自动识别，无需用户选择）
  let selectedTemplateId = $state('official-qa');
  
  // ✅ 全局菜单 z-index 修复器
  let menuObserver: MutationObserver | null = null;
  
  // ✅ 数据已预加载，无需异步等待
  onMount(() => {
    console.log('[CreateCardModal] 组件挂载，数据已预加载:', { 
      decksCount: decks.length,
      templatesCount: templates.length
    });
    
    // ✅ 关键修复：全局监听并修复 Obsidian 原生菜单的 z-index
    menuObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLElement) {
            // 检查是否是 Obsidian 菜单
            const menuSelectors = ['.menu', '.suggestion-container', '.modal', '.popover'];
            menuSelectors.forEach(selector => {
              if (node.matches?.(selector) || node.querySelector?.(selector)) {
                const elements = node.matches?.(selector) ? [node] : Array.from(node.querySelectorAll(selector));
                elements.forEach((el: Element) => {
                  (el as HTMLElement).style.zIndex = '99999999';
                  console.log('[CreateCardModal] 修复菜单 z-index:', selector);
                });
              }
            });
          }
        });
      });
    });
    
    // 监听 document.body（Obsidian 菜单添加的位置）
    menuObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('[CreateCardModal] 全局菜单观察器已启动');
  });
  
  onDestroy(() => {
    // 清理观察器
    if (menuObserver) {
      menuObserver.disconnect();
      menuObserver = null;
      console.log('[CreateCardModal] 全局菜单观察器已清理');
    }
  });

  // 处理关闭
  function handleClose() {
    console.log('[CreateCardModal] 关闭');
    
    // ✅ 显式类型检查，避免 Svelte 5 编译问题
    if (typeof onCancel === 'function') {
      onCancel();
    }
    if (typeof onModalClose === 'function') {
      onModalClose();
    }
  }

  // 处理保存
  async function handleSave(updatedCard: Card) {
    console.log('[CreateCardModal] 保存卡片', updatedCard);
    try {
      // ✅ 不再需要在此处更新 deckId 和 templateId
      // 这些值已经在 InlineCardEditor 的 handleSave() 中更新完毕

      // 验证卡片内容
      const hasContent = updatedCard.fields?.front ||
                         updatedCard.fields?.question ||
                         updatedCard.fields?.notes ||
                         Object.values(updatedCard.fields || {}).some((value: any) => 
                           value && typeof value === 'string' && value.trim()
                         );

      if (!hasContent) {
        console.warn('[CreateCardModal] 卡片内容为空，拒绝保存');
        new Notice('卡片内容不能为空，请添加内容后再保存');
        return;
      }

      // ✅ 注意：卡片已经在 InlineCardEditor → tempFileManager.finishEditing() 中保存
      // 这里只需要触发事件和执行回调，无需重复保存
      plugin.app.workspace.trigger("tuanki:card-created", updatedCard);
      
      // 🗑️ 已移除旧的 CustomEvent 触发
      // 现在通过 DataSyncService 在 saveCard 时自动通知
      
      console.log('[CreateCardModal] 新卡片已创建:', updatedCard);
      
      // 调用用户提供的回调 - ✅ 显式类型检查，避免 Svelte 5 编译问题
      if (typeof onSave === 'function') {
        onSave(updatedCard);
      }
      
      // 关闭模态窗
      if (typeof onModalClose === 'function') {
        onModalClose();
      }
    } catch (error) {
      console.error('[CreateCardModal] 处理卡片保存回调失败:', error);
      new Notice('处理卡片保存时发生错误');
    }
  }

  // 处理牌组变更
  function handleDeckChange(value: string) {
    selectedDeckId = value;
    console.log('[CreateCardModal] 牌组变更:', selectedDeckId);
  }
</script>

<ResizableModal
  bind:open
  {plugin}
  title="新建卡片"
  closable={true}
  maskClosable={false}
  keyboard={true}
  enableTransparentMask={true}
  enableWindowDrag={true}
  onClose={handleClose}
>
  {#snippet headerActions()}
    <!-- ✅ 模板选择已移除：题型由MD格式自动识别 -->
    
    <!-- 牌组选择 -->
    {#if decks.length > 0}
      <CustomDropdown
        label="牌组:"
        bind:value={selectedDeckId}
        options={decks}
        onchange={handleDeckChange}
      />
    {/if}
  {/snippet}

  {#snippet children()}
    <InlineCardEditor
      {card}
      {plugin}
      {tempFileManager}
      mode="create"
      isNew={true}
      displayMode="inline"
      showHeader={false}
      showFooter={true}
      allowEscape={false}
      decks={decks}
      fieldTemplates={templates}
      selectedDeckId={selectedDeckId}
      selectedTemplateId={selectedTemplateId}
      onSave={handleSave}
      onCancel={handleClose}
    />
  {/snippet}
</ResizableModal>

<style>
  /* CustomDropdown 组件已内置样式，无需额外 CSS */
</style>

