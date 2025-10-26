<!--
  简化批量解析配置面板（🔄 重构后）
  使用统一的文件夹牌组映射表格
-->
<script lang="ts">
  import type { SimpleBatchParsingConfig, FolderDeckMapping } from '../../../services/batch-parsing';
  import type AnkiPlugin from '../../../main';
  import { onMount } from 'svelte';
  import type { Deck } from '../../../data/types';
  import FolderDeckMappingTable from './FolderDeckMappingTable.svelte';

  interface Props {
    config: SimpleBatchParsingConfig;
    onConfigChange: (config: SimpleBatchParsingConfig) => void;
    app: any;
    plugin?: AnkiPlugin;
  }

  let { config, onConfigChange, app, plugin }: Props = $props();

  // 牌组列表（从插件获取）
  let decks = $state<Deck[]>([]);

  // 初始化
  onMount(async () => {
    await refreshDecks();
  });

  /**
   * 刷新牌组列表
   */
  async function refreshDecks() {
    console.log('[SimpleBatchParsingPanel] 开始刷新牌组列表');
    console.log('[SimpleBatchParsingPanel] plugin:', !!plugin);
    console.log('[SimpleBatchParsingPanel] plugin.dataStorage:', !!plugin?.dataStorage);
    
    if (plugin?.dataStorage) {
      try {
        const allDecks = await plugin.dataStorage.getAllDecks();
        decks = allDecks || [];
        console.log('[SimpleBatchParsingPanel] 成功获取牌组:', {
          count: decks.length,
          decks: decks.map(d => ({ id: d.id, name: d.name }))
        });
      } catch (error) {
        console.error('[SimpleBatchParsingPanel] 获取牌组列表失败:', error);
        decks = [];
      }
    } else {
      console.warn('[SimpleBatchParsingPanel] plugin 或 dataStorage 不可用');
      decks = [];
    }
  }

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<SimpleBatchParsingConfig>) {
    const newConfig = { ...config, ...updates };
    onConfigChange(newConfig);
  }

  /**
   * 更新映射列表
   */
  function handleMappingsChange(mappings: FolderDeckMapping[]) {
    updateConfig({
      folderDeckMappings: mappings
    });
  }
</script>

<div class="simple-batch-parsing-panel">
  <!-- 文件夹牌组映射表格 -->
  <section class="config-section">
    <FolderDeckMappingTable
      mappings={config.folderDeckMappings || []}
      {decks}
      {app}
      {plugin}
      onMappingsChange={handleMappingsChange}
    />
  </section>
</div>

<style>
  .simple-batch-parsing-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 1rem 0;
  }

  /* 区块标题样式 */
  .config-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .simple-batch-parsing-panel {
      padding: 0.5rem 0;
      gap: 1.5rem;
    }

    .config-section {
      gap: 1rem;
    }
  }
</style>
