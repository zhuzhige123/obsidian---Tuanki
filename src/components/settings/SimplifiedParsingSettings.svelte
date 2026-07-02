<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount } from 'svelte';
  import type {
    SimplifiedParsingSettings,
  } from '../../types/newCardParsingTypes';
  import {
    DEFAULT_SIMPLIFIED_PARSING_SETTINGS
  } from '../../types/newCardParsingTypes';
  import type WeavePlugin from '../../main';
  import type { SimpleBatchParsingConfig } from '../../services/batch-parsing';
  import { createDefaultBatchConfig } from '../../services/batch-parsing/SimpleBatchConfig';
  import { normalizeFolderDeckMappings } from '../../types/newCardParsingTypes';

  import SymbolConfigPanel from './card-parsing/SymbolConfigPanel.svelte';
  import SimpleBatchParsingPanel from './batch-parsing/SimpleBatchParsingPanel.svelte';

  interface Props {
    settings?: SimplifiedParsingSettings;
    onSettingsChange?: (settings: SimplifiedParsingSettings) => void;
    plugin?: WeavePlugin;
  }

  let {
    settings = { ...DEFAULT_SIMPLIFIED_PARSING_SETTINGS },
    onSettingsChange = () => {},
    plugin
  }: Props = $props();

  let batchConfig = $state<SimpleBatchParsingConfig | undefined>(undefined);

  function resolveBatchConfig(): SimpleBatchParsingConfig | undefined {
    if (!plugin?.settings?.simplifiedParsing) {
      return undefined;
    }

    if (plugin.batchParsingManager) {
      return plugin.batchParsingManager.getConfig();
    }

    const parsingSettings = plugin.settings.simplifiedParsing;
    const fallback = createDefaultBatchConfig(parsingSettings);
    const mappings = parsingSettings.batchParsing?.folderDeckMappings;
    if (Array.isArray(mappings)) {
      fallback.folderDeckMappings = normalizeFolderDeckMappings(
        mappings as SimpleBatchParsingConfig['folderDeckMappings']
      ).mappings;
    }
    return fallback;
  }

  onMount(() => {
    batchConfig = resolveBatchConfig();
    if (!batchConfig) {
      logger.warn('[SimplifiedParsingSettings] 批量解析配置不可用');
    } else if (!plugin?.batchParsingManager) {
      logger.warn('[SimplifiedParsingSettings] batchParsingManager 未初始化，使用 settings 回退配置');
    }
  });

  async function persistBatchConfig(newConfig: SimpleBatchParsingConfig) {
    batchConfig = newConfig;

    if (plugin?.batchParsingManager) {
      try {
        await plugin.batchParsingManager.updateConfig(newConfig);
      } catch (error) {
        logger.error('[SimplifiedParsingSettings] 配置保存失败:', error);
      }
      return;
    }

    if (plugin?.settings?.simplifiedParsing?.batchParsing) {
      plugin.settings.simplifiedParsing.batchParsing.folderDeckMappings =
        newConfig.folderDeckMappings;
      try {
        await plugin.saveSettings();
      } catch (error) {
        logger.error('[SimplifiedParsingSettings] 回退保存映射失败:', error);
      }
    }
  }
</script>

<div class="simplified-parsing-settings">
  <div class="weave-settings">
    <div class="settings-group">
      <SymbolConfigPanel
        {settings}
        onSettingsChange={onSettingsChange}
      />
    </div>
  </div>

  {#if batchConfig}
    <SimpleBatchParsingPanel
      config={batchConfig}
      onConfigChange={persistBatchConfig}
      app={plugin?.app}
      plugin={plugin}
    />
  {/if}
</div>

<style>
  .simplified-parsing-settings {
    width: 100%;
    max-width: none;
    margin: 0;
    padding: 0;
  }
</style>
