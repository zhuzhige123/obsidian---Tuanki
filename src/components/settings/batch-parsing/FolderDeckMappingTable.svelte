<script lang="ts">
  import { logger } from '../../../utils/logger';

  import { onMount } from 'svelte';
  import { Menu, Notice } from 'obsidian';
  import type { App } from 'obsidian';
  import type { BatchParseResult } from '../../../services/batch-parsing';
  import type { FolderDeckMapping, RegexParsingConfig } from '../../../types/newCardParsingTypes';
  import {
    createEmptyFolderDeckMapping,
    DEFAULT_MULTI_CARDS_CONFIG,
    DEFAULT_SINGLE_CARD_CONFIG,
    getFolderDeckMappingCardCount,
    normalizeFolderDeckMappings,
  } from '../../../types/newCardParsingTypes';
  import type { Deck } from '../../../data/types';
  import { FolderSuggest } from '../../../utils/FolderSuggest';
  import { FileSuggest } from '../../../utils/FileSuggest';
  import { tr as trStore } from '../../../utils/i18n';
import { showObsidianConfirm } from '../../../utils/obsidian-confirm';
  import BatchScanStats from './BatchScanStats.svelte';
  import RegexPresetManager from './RegexPresetManager.svelte';
  import { normalizeRegexParsingPresets } from '../../../services/batch-parsing/RegexPresets';
  import ObsidianDropdown from '../../ui/ObsidianDropdown.svelte';

  // Props
  interface Props {
    mappings: FolderDeckMapping[];
    decks: Deck[];
    app: App;
    plugin: any; // WeavePlugin 实例
    onMappingsChange: (mappings: FolderDeckMapping[]) => void;
  }

  let { mappings = [], decks = [], app, plugin, onMappingsChange }: Props = $props();
  let t = $derived($trStore);

  // 为每个映射行创建 Suggest 实例的映射表
  let folderSuggests = $state<Map<string, FolderSuggest>>(new Map());
  let fileSuggests = $state<Map<string, FileSuggest>>(new Map());
  
  /** 扫描结果状态 */
  let scanResults = $state<BatchParseResult | null>(null);
  
  /** 正则预设管理 */
  let regexPresets = $state<RegexParsingConfig[]>([]);

  function generatePresetId(): string {
    return `custom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  function normalizePresetIds(presets: RegexParsingConfig[]): { presets: RegexParsingConfig[]; changed: boolean } {
    let changed = false;
    const normalized = presets.map(p => {
      if (p.id) return p;
      changed = true;
      return { ...p, id: generatePresetId() };
    });
    return { presets: normalized, changed };
  }

  function migrateMappingPresetRefs(presets: RegexParsingConfig[]) {
    let changed = false;
    const updated = mappings.map(m => {
      const multiCardsConfig = (m as any).multiCardsConfig;
      if (!multiCardsConfig) return m;

      const currentId = multiCardsConfig.selectedPresetId;
      const currentName = multiCardsConfig.selectedPresetName;
      const parsingConfig = multiCardsConfig.parsingConfig as RegexParsingConfig | undefined;

      let nextId = currentId;
      let nextName = currentName;

      const presetById = (id: string) => presets.find(p => (p.id || p.name) === id);
      const presetByName = (name: string) => presets.find(p => p.name === name);

      if (!nextId && !nextName && parsingConfig) {
        if (parsingConfig.id) {
          nextId = parsingConfig.id;
        } else if (parsingConfig.name) {
          nextName = parsingConfig.name;
        }
      }

      if (!nextId && currentName) {
        const preset = presetByName(currentName);
        if (preset?.id) nextId = preset.id;
      }

      if (nextId) {
        const preset = presetById(nextId);
        if (preset) nextName = preset.name;
      }

      const matchedPreset = nextId
        ? presetById(nextId)
        : (nextName ? presetByName(nextName) : undefined);

      if ((currentId || currentName || nextId || nextName) && matchedPreset) {
        const nextParsingConfig = { ...matchedPreset };
        if (JSON.stringify(parsingConfig || null) !== JSON.stringify(nextParsingConfig)) {
          changed = true;
          return {
            ...m,
            multiCardsConfig: {
              ...multiCardsConfig,
              selectedPresetId: matchedPreset.id || nextId,
              selectedPresetName: matchedPreset.name,
              parsingConfig: nextParsingConfig
            }
          };
        }
      }

      if ((currentId || currentName || nextId || nextName) && !matchedPreset) {
        if (currentId || currentName) {
          changed = true;
          return {
            ...m,
            multiCardsConfig: {
              ...multiCardsConfig,
              selectedPresetId: '',
              selectedPresetName: ''
            }
          };
        }
      }

      if (nextId !== currentId || nextName !== currentName) {
        changed = true;
        return {
          ...m,
          multiCardsConfig: {
            ...multiCardsConfig,
            selectedPresetId: nextId,
            selectedPresetName: nextName
          }
        };
      }

      return m;
    });

    if (changed) {
      onMappingsChange(updated);
    }
  }
  
  /**
   * 从 plugin settings 加载正则预设
   */
  onMount(() => {
    const loaded = plugin?.settings?.simplifiedParsing?.regexPresets ?? [];
    const normalizedPresets = normalizeRegexParsingPresets(loaded);
    const normalized = normalizePresetIds(normalizedPresets.presets);
    regexPresets = normalized.presets;

    const shouldPersist =
      normalizedPresets.changed || normalized.changed || loaded.length !== normalized.presets.length;

    if (shouldPersist && plugin?.settings?.simplifiedParsing) {
      plugin.settings.simplifiedParsing.regexPresets = normalized.presets;
      plugin.saveSettings().catch(() => {});
    }
    migrateMappingPresetRefs(normalized.presets);

    const mappingNormalization = normalizeFolderDeckMappings(mappings);
    if (mappingNormalization.changed) {
      onMappingsChange(mappingNormalization.mappings);
    }
  });
  
  /**
   * 保存正则预设到 plugin settings
   */
  async function saveRegexPresets(presets: RegexParsingConfig[]) {
    const normalized = normalizePresetIds(presets);
    regexPresets = normalized.presets;
    
    if (plugin?.settings?.simplifiedParsing) {
      plugin.settings.simplifiedParsing.regexPresets = normalized.presets;
      await plugin.saveSettings();
      new Notice(t('dataManagement.batchScan.regexPresetSaved'));
    }

    migrateMappingPresetRefs(normalized.presets);
  }

  /**
   * 添加新映射
   */
  function addMapping() {
    onMappingsChange([...mappings, createEmptyFolderDeckMapping()]);
  }

  /**
   * 更新映射
   */
  function updateMapping(id: string, updates: Partial<FolderDeckMapping>) {
    const updated = mappings.map(m => 
      m.id === id ? { ...m, ...updates } : m
    );
    onMappingsChange(updated);
  }

  function updateMappingScanStats(id: string, totalCards: number) {
    const updated = mappings.map((mapping) => {
      if (mapping.id !== id) return mapping;
      const { fileCount: _legacy, ...rest } = mapping;
      return {
        ...rest,
        cardCount: totalCards,
        lastScanned: new Date().toISOString(),
      };
    });
    onMappingsChange(updated);
  }

  /**
   * 删除映射
   * 
   * 清理文件和文件夹 Suggest 实例
   */
  function removeMapping(id: string) {
    // 清理 Suggest 实例
    folderSuggests.get(id)?.close();
    folderSuggests.delete(id);
    fileSuggests.get(id)?.close();
    fileSuggests.delete(id);
    
    onMappingsChange(mappings.filter(m => m.id !== id));
    new Notice(t('dataManagement.batchScan.deletedMapping'));
  }

  /**
   * 开始扫描单个映射（解析并保存卡片）
   * 
   * 包含用户确认对话框和卡片保存逻辑
   * 支持文件和文件夹类型
   */
  async function startScanMapping(mapping: FolderDeckMapping) {
    // 获取路径（兼容新旧字段）
    const mappingPath = mapping.path || mapping.folderPath;
    const mappingType = mapping.type || 'folder';
    
    if (!mappingPath) {
      new Notice(t('dataManagement.batchScan.selectFileFirst', { type: mappingType === 'file' ? t('dataManagement.batchScan.typeFile') : t('dataManagement.batchScan.typeFolder') }));
      return;
    }
    
    if (!mapping.targetDeckId) {
      new Notice(t('dataManagement.batchScan.selectDeckFirst'));
      return;
    }
    
    //  确认对话框
    const typeLabel = mappingType === 'file' ? t('dataManagement.batchScan.typeFile') : t('dataManagement.batchScan.typeFolder');
    const confirmMessage = t('dataManagement.batchScan.confirmScanMessage', { type: typeLabel, path: mappingPath, deck: mapping.targetDeckName });
    
    const confirmed = await showObsidianConfirm(app, confirmMessage, { title: t('dataManagement.batchScan.confirmScanTitle') });
    if (!confirmed) {
      new Notice(t('dataManagement.batchScan.cancelled'));
      return;
    }
    
    new Notice(t('dataManagement.batchScan.startParsing', { type: typeLabel, path: mappingPath }));
    
    try {
      const batchManager = plugin?.batchParsingManager;
      if (!batchManager) {
        throw new Error(t('dataManagement.batchScan.batchServiceNotInit'));
      }
      
      // 调用扫描方法（现在返回 parsedCards）
      const result = await batchManager.scanSingleMapping(mapping);
      
      // 存储扫描结果用于显示
      scanResults = result;
      
      // 保存卡片到数据库
      if (result.parsedCards && result.parsedCards.length > 0) {
        new Notice(t('dataManagement.batchScan.savingCards', { count: result.parsedCards.length }));
        
        try {
          // 调用插件的统一保存流程
          await plugin.addCardsToDB(result.parsedCards);
          
          updateMappingScanStats(mapping.id, result.totalCards);
          
          // 显示成功结果
          new Notice(t('dataManagement.batchScan.saveSuccess', { count: result.totalCards, deck: mapping.targetDeckName }));
        } catch (saveError: unknown) {
          const saveErrorMessage = saveError instanceof Error ? saveError.message : String(saveError);
          logger.error('[FolderDeckMappingTable] 保存卡片失败:', saveError);
          new Notice(t('dataManagement.batchScan.saveFailed', { error: saveErrorMessage }));
        }
      } else {
        // 未找到卡片
        new Notice(t('dataManagement.batchScan.noCardsFound'));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[FolderDeckMappingTable] 扫描失败:', error);
      new Notice(t('dataManagement.batchScan.scanFailed', { error: errorMessage }));
    }
  }

  /**
   * 显示操作菜单
   */
  function showActionsMenu(mapping: FolderDeckMapping, event: MouseEvent) {
    const menu = new Menu();
    
    // 开始扫描
    menu.addItem((item) => {
      item
        .setTitle(t('dataManagement.batchScan.startScan'))
        .setIcon('refresh-cw')
        .setDisabled(!(mapping.path || mapping.folderPath) || !mapping.targetDeckId)
        .onClick(() => startScanMapping(mapping));
    });
    
    menu.addSeparator();
    
    // 删除映射
    menu.addItem((item) => {
      item
        .setTitle(t('dataManagement.batchScan.deleteMapping'))
        .setIcon('trash')
        .onClick(() => removeMapping(mapping.id));
    });
    
    menu.showAtMouseEvent(event);
  }

  /**
   * 初始化文件夹输入框的 FolderSuggest
   */
  function initFolderSuggest(inputEl: HTMLInputElement, mappingId: string) {
    if (!inputEl || !app) return;

    folderSuggests.get(mappingId)?.close();
    const suggest = new FolderSuggest(app, inputEl);
    folderSuggests.set(mappingId, suggest);

    return {
      destroy() {
        suggest.close();
        folderSuggests.delete(mappingId);
      },
    };
  }
  
  /**
   * 初始化文件输入框的 FileSuggest
   */
  function initFileSuggest(inputEl: HTMLInputElement, mappingId: string) {
    if (!inputEl || !app) return;

    fileSuggests.get(mappingId)?.close();
    const suggest = new FileSuggest(app, inputEl);
    fileSuggests.set(mappingId, suggest);

    return {
      destroy() {
        suggest.close();
        fileSuggests.delete(mappingId);
      },
    };
  }
  
  /**
   * 切换映射类型
   */
  function toggleMappingType(mapping: FolderDeckMapping) {
    const newType = mapping.type === 'file' ? 'folder' : 'file';
    updateMapping(mapping.id, { 
      type: newType,
      path: '',  // 清空路径，让用户重新选择
      folderPath: ''  // 清空旧字段
    });
  }

  /**
   * 打开牌组下拉菜单
   */
  function openDeckDropdown(mapping: FolderDeckMapping, event: MouseEvent) {
    if (!decks || decks.length === 0) {
      new Notice(t('dataManagement.batchScan.noDecksAvailable'));
      return;
    }
    
    const menu = new Menu();
    
    // 添加所有牌组选项
    decks.forEach(deck => {
      menu.addItem((item) => {
        item
          .setTitle(deck.name)
          .setChecked(mapping.targetDeckId === deck.id)
          .onClick(() => {
            updateMapping(mapping.id, {
              targetDeckId: deck.id,
              targetDeckName: deck.name
            });
          });
      });
    });
    
    menu.showAtMouseEvent(event);
  }

  /**
   * 刷新牌组名称（用于牌组被重命名的情况）
   */
  function refreshDeckNames() {
    const deckMap = new Map(decks.map(d => [d.id, d.name]));
    let changed = false;
    const updated = mappings.map(m => {
      const nextName = deckMap.get(m.targetDeckId) || m.targetDeckName;
      if (nextName !== m.targetDeckName) {
        changed = true;
        return { ...m, targetDeckName: nextName };
      }
      return m;
    });
    if (changed) {
      onMappingsChange(updated);
    }
  }

  // 牌组重命名后同步显示名称
  $effect(() => {
    if (decks.length === 0 || mappings.length === 0) return;
    refreshDeckNames();
  });
</script>

<!-- 正则预设管理区域 -->
<div class="weave-settings settings-group">
  <RegexPresetManager 
    presets={regexPresets}
    onPresetsChange={saveRegexPresets}
    app={plugin?.app}
  />
</div>

<!-- 文件夹牌组映射区域 -->
<div class="weave-settings settings-group">
  <!-- 表头 -->
  <div class="mapping-header">
    <div class="header-content">
      <h4 class="group-title with-accent-bar accent-cyan">{t('settings.cardParsing.fileMappings.title')}</h4>
      <p class="header-desc">{t('settings.cardParsing.fileMappings.desc')}</p>
    </div>
    <div class="header-actions">
      <!-- 内联统计信息 -->
      <BatchScanStats results={scanResults} />
      
      <button class="add-mapping-btn" onclick={addMapping}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        {t('settings.cardParsing.fileMappings.addMapping')}
      </button>
    </div>
  </div>

  <!-- 映射表格 -->
  {#if mappings.length > 0}
    <div class="mapping-table-container">
      <table class="mapping-table">
        <thead>
          <tr>
            <th>{t('dataManagement.batchScan.tableHeaders.type')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.path')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.fileMode')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.regexConfig')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.targetDeck')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.subfolders')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.cardCount')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.enabled')}</th>
            <th>{t('dataManagement.batchScan.tableHeaders.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each mappings as mapping (mapping.id)}
            {@const mappingType = mapping.type || 'folder'}
            {@const mappingPath = mapping.path || mapping.folderPath || ''}
            {@const mappingCardCount = getFolderDeckMappingCardCount(mapping)}
            <tr class:disabled={!mapping.enabled}>
              <!-- 类型选择列（只显示图标，悬停显示名称） -->
              <td class="type-cell">
                <button 
                  class="type-toggle-btn"
                  class:is-file={mappingType === 'file'}
                  onclick={() => toggleMappingType(mapping)}
                  title={mappingType === 'file' ? t('dataManagement.batchScan.fileTooltip') : t('dataManagement.batchScan.folderTooltip')}
                >
                  {#if mappingType === 'file'}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                  {/if}
                </button>
              </td>
              
              <!--  路径选择列（根据类型显示不同输入框） -->
              <td class="folder-cell">
                <div class="folder-input-wrapper">
                  {#if mappingType === 'file'}
                    <!-- 文件输入框 -->
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <input
                      type="text"
                      class="folder-input"
                      value={mappingPath}
                      title={mappingPath || t('dataManagement.batchScan.selectFilePath')}
                      oninput={(e) => {
                        const newPath = e.currentTarget.value;
                        updateMapping(mapping.id, { 
                          path: newPath,
                          folderPath: newPath
                        });
                        e.currentTarget.title = newPath || t('dataManagement.batchScan.selectFilePath');
                      }}
                      placeholder={t('dataManagement.batchScan.selectFilePath')}
                      use:initFileSuggest={mapping.id}
                    />
                  {:else}
                    <!-- 文件夹输入框 -->
                    <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <input
                      type="text"
                      class="folder-input"
                      value={mappingPath}
                      title={mappingPath || t('dataManagement.batchScan.selectFolderPath')}
                      oninput={(e) => {
                        const newPath = e.currentTarget.value;
                        updateMapping(mapping.id, { 
                          path: newPath,
                          folderPath: newPath
                        });
                        e.currentTarget.title = newPath || t('dataManagement.batchScan.selectFolderPath');
                      }}
                      placeholder={t('dataManagement.batchScan.selectFolderPath')}
                      use:initFolderSuggest={mapping.id}
                    />
                  {/if}
                </div>
              </td>
              
              <!-- 文件模式选择列 -->
              <td class="file-mode-cell">
                <ObsidianDropdown
                  options={[
                    { id: 'single-card', label: t('dataManagement.batchScan.singleFileCard') },
                    { id: 'multi-cards', label: t('dataManagement.batchScan.multiFileCards') }
                  ]}
                  value={(mapping as any).fileMode || 'single-card'}
                  onchange={(value) => {
                    const newMode = value as 'single-card' | 'multi-cards';
                    
                    if (newMode === 'single-card') {
                      updateMapping(mapping.id, { 
                        fileMode: newMode,
                        singleCardConfig: { ...DEFAULT_SINGLE_CARD_CONFIG },
                        multiCardsConfig: undefined
                      });
                    } else {
                      updateMapping(mapping.id, { 
                        fileMode: newMode,
                        multiCardsConfig: {
                          ...DEFAULT_MULTI_CARDS_CONFIG,
                          parsingConfig: DEFAULT_MULTI_CARDS_CONFIG.parsingConfig
                            ? { ...DEFAULT_MULTI_CARDS_CONFIG.parsingConfig }
                            : undefined,
                        },
                        singleCardConfig: undefined
                      });
                    }
                  }}
                />
              </td>
              
              <!-- 正则配置选择列（仅多卡片模式显示） -->
              <td class="regex-config-cell">
                {#if (mapping as any).fileMode === 'multi-cards'}
                  {@const selectedPresetId = (() => {
                    const multiCardsConfig = (mapping as any).multiCardsConfig;
                    if (!multiCardsConfig) return '';
                    if (multiCardsConfig.selectedPresetId) {
                      const exists = regexPresets.some(p => (p.id || p.name) === multiCardsConfig.selectedPresetId);
                      return exists ? multiCardsConfig.selectedPresetId : '';
                    }
                    if (multiCardsConfig.selectedPresetName) {
                      const preset = regexPresets.find(p => p.name === multiCardsConfig.selectedPresetName);
                      return preset?.id || '';
                    }
                    return '';
                  })()}
                  <ObsidianDropdown
                    options={[
                      { id: '', label: regexPresets.length === 0 ? t('dataManagement.batchScan.noPresets') : t('dataManagement.batchScan.selectPreset') },
                      ...regexPresets.map(preset => ({ id: preset.id || preset.name, label: preset.name }))
                    ]}
                    value={selectedPresetId}
                    onchange={(presetId) => {
                      const selectedPreset = regexPresets.find(p => (p.id || p.name) === presetId);
                      
                      if (selectedPreset) {
                        updateMapping(mapping.id, {
                          multiCardsConfig: {
                            ...(mapping as any).multiCardsConfig || {},
                            selectedPresetId: selectedPreset.id || presetId,
                            selectedPresetName: selectedPreset.name,
                            parsingConfig: { ...selectedPreset }
                          }
                        });
                      } else if (presetId === '') {
                        updateMapping(mapping.id, {
                          multiCardsConfig: {
                            ...(mapping as any).multiCardsConfig || {},
                            selectedPresetId: '',
                            selectedPresetName: '',
                            parsingConfig: undefined
                          }
                        });
                      }
                    }}
                  />
                {:else}
                  <span class="na-text">—</span>
                {/if}
              </td>
              
              <!-- 牌组选择列 -->
              <td class="deck-cell">
                <button 
                  class="deck-selector-btn"
                  class:empty={!mapping.targetDeckId}
                  onclick={(e) => openDeckDropdown(mapping, e)}
                  title={mapping.targetDeckName || t('dataManagement.batchScan.selectDeck')}
                >
                  {#if mapping.targetDeckId && mapping.targetDeckName}
                    <svg class="deck-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <span class="deck-name">{mapping.targetDeckName}</span>
                  {:else}
                    <span class="placeholder">{t('dataManagement.batchScan.selectDeck')}</span>
                  {/if}
                  <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </td>
              
              <!--  子文件夹开关（仅文件夹类型显示） -->
              <td class="subfolder-cell">
                {#if mappingType === 'folder'}
                  <label class="checkbox-label">
                    <input 
                      type="checkbox"
                      checked={mapping.includeSubfolders}
                      onchange={(e) => updateMapping(mapping.id, { 
                        includeSubfolders: e.currentTarget.checked 
                      })}
                    />
                    <span>{mapping.includeSubfolders ? t('dataManagement.batchScan.include') : t('dataManagement.batchScan.exclude')}</span>
                  </label>
                {:else}
                  <span class="na-text">—</span>
                {/if}
              </td>
              
              <!-- 卡片数量统计 -->
              <td class="card-count-cell">
                {#if mappingCardCount !== undefined}
                  <span class="card-count">{mappingCardCount} {t('dataManagement.batchScan.cardUnit')}</span>
                {:else}
                  <span class="card-count-placeholder">{t('dataManagement.batchScan.notCounted')}</span>
                {/if}
              </td>
              
              <!-- 启用开关 -->
              <td class="enable-cell">
                <label class="modern-switch">
                  <input 
                    type="checkbox"
                    checked={mapping.enabled}
                    onchange={(e) => updateMapping(mapping.id, { 
                      enabled: e.currentTarget.checked 
                    })}
                  />
                  <span class="switch-slider"></span>
                </label>
              </td>
              
              <!-- 操作菜单 -->
              <td class="actions-cell">
                <button 
                  class="menu-btn"
                  onclick={(e) => showActionsMenu(mapping, e)}
                  aria-label={t('dataManagement.batchScan.actionsMenu')}
                  title={t('dataManagement.batchScan.moreActions')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="19" cy="12" r="1"></circle>
                    <circle cx="5" cy="12" r="1"></circle>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="mapping-empty-state">
      <p class="empty-title">{t('dataManagement.batchScan.emptyMappings.title')}</p>
      <p class="empty-desc">{t('dataManagement.batchScan.emptyMappings.desc')}</p>
      <button class="add-mapping-btn empty-action" type="button" onclick={addMapping}>
        {t('dataManagement.batchScan.emptyMappings.action')}
      </button>
    </div>
  {/if}
</div>

<style>
  /* ===== 侧边颜色条样式 ===== */
  .group-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .group-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: 2px;
  }

  .group-title.accent-cyan::before {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.8), rgba(14, 165, 233, 0.6));
  }

  /* ===== 区块容器 ===== */
  .settings-group {
    background: var(--weave-secondary-bg, var(--background-primary));
    border: none; /* 使用box-shadow代替传统边框 */
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    /* 默认边框（兜底方案） */
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.2) !important;
  }

  /*  深色模式边框 - 与全局设置保持一致 */
  :global(body.theme-dark) .settings-group {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25) !important;
  }

  /*  浅色模式边框 - 与全局设置保持一致 */
  :global(body.theme-light) .settings-group {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15) !important;
  }
  
  /* 容器间距优化 */
  .settings-group:not(:last-child) {
    margin-bottom: 1.25rem;
  }
  
  .settings-group:last-child {
    margin-bottom: 0;
  }

  /* ===== 表头样式 ===== */
  .mapping-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .header-content {
    flex: 1;
  }

  .group-title {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .header-desc {
    margin: 0;
    font-size: 0.875em;
    color: var(--text-muted);
  }

  .header-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .add-mapping-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--interactive-accent);
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .add-mapping-btn:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .add-mapping-btn:active {
    transform: translateY(0);
  }

  .mapping-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    border: 1px dashed var(--background-modifier-border);
    border-radius: var(--radius-m);
    background: var(--background-secondary);
    text-align: center;
  }

  .empty-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .empty-desc {
    margin: 0;
    max-width: 36rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .add-mapping-btn.empty-action {
    margin-top: 0.25rem;
  }

  /* ===== 表格容器 ===== */
  .mapping-table-container {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ===== 表格样式 ===== */
  .mapping-table {
    width: 100%;
    table-layout: auto; /* 自适应列宽 */
    border-collapse: collapse;
  }

  /*  列宽定义（优化为更紧凑的布局） */
  .mapping-table th:nth-child(1),
  .mapping-table td:nth-child(1) { 
    width: 50px; 
    min-width: 50px;
    max-width: 50px;
  } /* 类型 - 只显示图标 */

  .mapping-table th:nth-child(2),
  .mapping-table td:nth-child(2) { 
    min-width: 120px;
    max-width: 250px;
    width: auto;
  } /* 路径 - 自适应，支持省略 */

  .mapping-table th:nth-child(3),
  .mapping-table td:nth-child(3) { 
    min-width: 120px;
    max-width: 160px;
    width: auto;
  } /* 文件模式 - 自适应 */

  .mapping-table th:nth-child(4),
  .mapping-table td:nth-child(4) { 
    min-width: 120px;
    max-width: 180px;
    width: auto;
  } /* 正则配置 - 自适应 */

  .mapping-table th:nth-child(5),
  .mapping-table td:nth-child(5) { 
    min-width: 100px;
    max-width: 150px;
    width: auto;
  } /* 目标牌组 - 自适应 */

  .mapping-table th:nth-child(6),
  .mapping-table td:nth-child(6) { 
    width: 80px; 
    min-width: 80px;
    max-width: 80px;
  } /* 子文件夹 */

  .mapping-table th:nth-child(7),
  .mapping-table td:nth-child(7) { 
    width: 90px; 
    min-width: 90px;
    max-width: 90px;
  } /* 卡片数量 */

  .mapping-table th:nth-child(8),
  .mapping-table td:nth-child(8) { 
    width: 70px; 
    min-width: 70px;
    max-width: 70px;
  } /* 启用 */

  .mapping-table th:nth-child(9),
  .mapping-table td:nth-child(9) { 
    width: 50px; 
    min-width: 50px;
    max-width: 50px;
  } /* 操作 */

  /* 表头样式 */
  .mapping-table thead th {
    padding: 12px 8px;
    background: var(--weave-secondary-bg, var(--background-primary));
    border-bottom: 2px solid var(--background-modifier-border);
    font-weight: 600;
    font-size: 13px;
    color: var(--text-normal);
    text-align: left;
  }

  /* 表格行样式 */
  .mapping-table tbody tr {
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background 0.2s;
  }

  .mapping-table tbody tr:hover {
    background: var(--background-modifier-hover);
  }

  .mapping-table tbody tr.disabled {
    opacity: 0.5;
  }

  /* 单元格基础样式 */
  .mapping-table td {
    padding: 10px 8px;
    vertical-align: middle;
  }

  /* ===== 类型选择器样式（只显示图标） ===== */
  .type-cell {
    padding: 8px !important;
    text-align: center;
  }

  .type-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    background: var(--background-modifier-hover);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    min-width: 32px;
    height: 32px;
  }

  .type-toggle-btn:hover {
    background: var(--background-modifier-active-hover);
    color: var(--text-normal);
    border-color: var(--interactive-accent);
  }

  .type-toggle-btn.is-file {
    background: rgba(139, 92, 246, 0.1);
    border-color: rgba(139, 92, 246, 0.3);
    color: rgb(139, 92, 246);
  }

  .type-toggle-btn.is-file:hover {
    background: rgba(139, 92, 246, 0.2);
    border-color: rgba(139, 92, 246, 0.5);
  }

  .type-toggle-btn svg {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
  }

  /* ===== N/A 文本样式 ===== */
  .na-text {
    display: block;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }

  /* ===== 文件模式选择样式 ===== */
  .file-mode-cell {
    padding: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0; /* 允许单元格收缩 */
  }

  /* 正则配置列样式 */
  .regex-config-cell {
    padding: 8px;
    min-width: 150px;
  }

  /* ===== 文件夹输入框样式 ===== */
  .folder-cell {
    overflow: hidden;
    max-width: 250px;
  }

  .folder-input-wrapper {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0; /* 允许 flex 容器收缩 */
    overflow: hidden;
  }

  .folder-icon {
    flex-shrink: 0;
    color: var(--text-muted);
    width: 16px;
    height: 16px;
  }

  .folder-input {
    flex: 1;
    padding: 6px 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    font-size: 13px;
    font-family: var(--font-monospace);
    transition: border-color 0.2s ease;
  }

  :global(body.theme-dark) .folder-input {
    border-color: rgba(255, 255, 255, 0.3);
  }

  :global(body.theme-light) .folder-input {
    border-color: rgba(0, 0, 0, 0.25);
  }

  .folder-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    overflow: visible; /* 聚焦时显示完整内容 */
    white-space: normal;
    position: relative;
    z-index: 1;
  }

  /* ===== 牌组选择按钮样式 ===== */
  .deck-selector-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  /*  深色模式 - 增强牌组选择按钮边框可见性 */
  :global(body.theme-dark) .deck-selector-btn {
    border-color: rgba(255, 255, 255, 0.3);
  }

  /*  浅色模式 - 增强牌组选择按钮边框可见性 */
  :global(body.theme-light) .deck-selector-btn {
    border-color: rgba(0, 0, 0, 0.25);
  }

  .deck-selector-btn:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .deck-selector-btn.empty {
    color: var(--text-muted);
  }

  .deck-icon {
    flex-shrink: 0;
  }

  .deck-name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    flex: 1;
    text-align: left;
  }

  .chevron-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  /* ===== 复选框样式 ===== */
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  /* ===== 卡片数量单元格样式 ===== */
  .card-count-cell {
    text-align: center;
  }

  .card-count {
    display: inline-block;
    padding: 2px 8px;
    background: var(--interactive-accent);
    color: white;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .card-count-placeholder {
    color: var(--text-muted);
    font-size: 12px;
    font-style: italic;
  }

  /* ===== 开关按钮样式 ===== */
  .modern-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 24px;
  }

  .modern-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background-modifier-border);
    transition: 0.3s;
    border-radius: 24px;
  }

  .switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  input:checked + .switch-slider {
    background-color: var(--interactive-accent);
  }

  input:checked + .switch-slider:before {
    transform: translateX(18px);
  }

  /* ===== 操作菜单按钮 ===== */
  .menu-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    opacity: 0.6;
  }

  .menu-btn:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .menu-btn:active {
    transform: scale(0.95);
  }

  /* ===== 响应式设计 ===== */
  @media (max-width: 1024px) {
    .mapping-table th:nth-child(1),
    .mapping-table td:nth-child(1) { width: 22%; }
    
    .mapping-table th:nth-child(2),
    .mapping-table td:nth-child(2) { width: 22%; }
    
    .mapping-table th:nth-child(4),
    .mapping-table td:nth-child(4) { width: 10%; }
  }

  @media (max-width: 768px) {
    .mapping-header {
      flex-direction: column;
      align-items: stretch;
    }

    .header-actions {
      align-self: stretch;
      flex-direction: column;
      align-items: stretch;
    }

    .add-mapping-btn {
      width: 100%;
      justify-content: center;
    }

    .mapping-table th,
    .mapping-table td {
      padding: 8px 4px;
      font-size: 12px;
    }
  }
</style>

