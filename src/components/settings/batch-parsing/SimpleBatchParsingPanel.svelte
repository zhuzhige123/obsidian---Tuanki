<!--
  简化批量解析配置面板
  使用统一的文件夹牌组映射表格
-->
<script lang="ts">
  import { logger } from '../../../utils/logger';

  import type { SimpleBatchParsingConfig, FolderDeckMapping } from '../../../services/batch-parsing';
  import type WeavePlugin from '../../../main';
  import type { App } from 'obsidian';
  import { onMount } from 'svelte';
  import type { Deck } from '../../../data/types';
  import FolderDeckMappingTable from './FolderDeckMappingTable.svelte';

  interface Props {
    config: SimpleBatchParsingConfig;
    onConfigChange: (config: SimpleBatchParsingConfig) => void;
    app?: App;
    plugin?: WeavePlugin;
  }

  let { config, onConfigChange, app, plugin }: Props = $props();

  let decks = $state<Deck[]>([]);

  onMount(async () => {
    await refreshDecks();
  });

  async function refreshDecks() {
    if (!plugin?.dataStorage) {
      decks = [];
      return;
    }

    try {
      const allDecks = await plugin.dataStorage.getAllDecks();
      decks = allDecks || [];
    } catch (error) {
      logger.error('[SimpleBatchParsingPanel] 获取牌组列表失败:', error);
      decks = [];
    }
  }

  function updateConfig(updates: Partial<SimpleBatchParsingConfig>) {
    onConfigChange({ ...config, ...updates });
  }

  function handleMappingsChange(mappings: FolderDeckMapping[]) {
    updateConfig({ folderDeckMappings: mappings });
  }
</script>

<div class="simple-batch-parsing-panel">
  <section class="config-section">
    {#if app && plugin}
      <FolderDeckMappingTable
        mappings={config.folderDeckMappings || []}
        {decks}
        {app}
        {plugin}
        onMappingsChange={handleMappingsChange}
      />
    {/if}
  </section>
</div>

<style>
  .simple-batch-parsing-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: 1rem 0;
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

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
