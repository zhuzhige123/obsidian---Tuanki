<!--
  编辑卡片模态窗组件
  职责：提供独立的编辑卡片界面，支持透明遮罩（外部操作）但不支持拖拽
-->
<script lang="ts">
  import { onMount } from 'svelte';
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

    /** 关闭回调 */
    onClose: () => void;

    /** 卡片数据 */
    card: Card;

    /** 插件实例 */
    plugin: AnkiPlugin;

    /** 临时文件管理器 */
    tempFileManager: TempFileManager;

    /** 保存成功回调 */
    onSave?: (card: Card) => void;

    /** 取消回调 */
    onCancel?: () => void;
  }

  let {
    open = $bindable(),
    onClose,
    card,
    plugin,
    tempFileManager,
    onSave,
    onCancel
  }: Props = $props();

  // 牌组列表
  let decks = $state<any[]>([]);
  // 当前选择的牌组
  let selectedDeckId = $state(card.deckId);
  // ✅ 模板ID固定为基础模板（题型由MD格式自动识别，无需用户选择）
  let selectedTemplateId = $state('official-qa');

  // 加载牌组数据
  onMount(async () => {
    try {
      decks = await plugin.dataStorage.getAllDecks();
      console.log('[EditCardModal] 加载牌组数据:', { decks: decks.length });
    } catch (error) {
      console.error('[EditCardModal] 加载数据失败:', error);
    }
  });

  // 处理关闭
  function handleClose() {
    console.log('[EditCardModal] 关闭');
    
    // ✅ 显式类型检查，避免 Svelte 5 编译问题
    if (typeof onCancel === 'function') {
      onCancel();
    }
    onClose();
  }

  // 处理保存
  async function handleSave(updatedCard: Card) {
    console.log('[EditCardModal] 保存卡片', updatedCard);
    try {
      // 更新卡片的牌组和模板
      updatedCard.deckId = selectedDeckId;
      updatedCard.templateId = selectedTemplateId;

      // 验证卡片内容（添加类型检查）
      const hasContent = updatedCard.fields?.front ||
                         updatedCard.fields?.question ||
                         updatedCard.fields?.notes ||
                         Object.values(updatedCard.fields || {}).some((value: any) => 
                           value && typeof value === 'string' && value.trim()
                         );

      // InlineCardEditor 内部已经处理了保存逻辑
      console.log('[EditCardModal] 卡片已更新:', updatedCard);
      
      // 调用用户提供的回调 - ✅ 显式类型检查，避免 Svelte 5 编译问题
      if (typeof onSave === 'function') {
        onSave(updatedCard);
      }
      
      // 关闭模态窗
      onClose();
    } catch (error) {
      console.error('[EditCardModal] 保存卡片失败:', error);
      new Notice('保存卡片失败');
    }
  }

  // 处理牌组变更
  function handleDeckChange(value: string) {
    selectedDeckId = value;
    console.log('[EditCardModal] 牌组变更:', selectedDeckId);
  }
</script>

<ResizableModal
  bind:open
  {plugin}
  title="编辑卡片"
  closable={true}
  maskClosable={false}
  keyboard={true}
  enableTransparentMask={true}
  enableWindowDrag={false}
  onClose={handleClose}
>
  {#snippet headerActions()}
    <!-- ✅ 模板选择已移除：题型由MD格式自动识别，无需用户选择 -->
    
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
      mode="edit"
      isNew={false}
      displayMode="inline"
      showHeader={false}
      showFooter={true}
      allowEscape={false}
      onSave={handleSave}
      onCancel={handleClose}
    />
  {/snippet}
</ResizableModal>

<style>
  /* CustomDropdown 组件已内置样式，无需额外 CSS */
</style>

