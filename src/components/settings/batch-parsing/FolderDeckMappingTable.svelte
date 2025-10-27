<script lang="ts">
  import { onMount } from 'svelte';
  import { Menu, Notice } from 'obsidian';
  import type { App } from 'obsidian';
  import type { FolderDeckMapping } from '../../../services/batch-parsing';
  import type { Deck } from '../../../data/types';
  import { FolderSuggest } from '../../../utils/FolderSuggest';

  // Props
  interface Props {
    mappings: FolderDeckMapping[];
    decks: Deck[];
    app: App;
    plugin: any; // TuankiPlugin 实例
    onMappingsChange: (mappings: FolderDeckMapping[]) => void;
  }

  let { mappings = [], decks = [], app, plugin, onMappingsChange }: Props = $props();
  
  // 监听 decks 变化
  $effect(() => {
    console.log('[FolderDeckMappingTable] decks 更新:', {
      count: decks.length,
      decks: decks.map(d => ({ id: d.id, name: d.name }))
    });
  });

  // 为每个映射行创建 FolderSuggest 实例的映射表
  let folderSuggests = $state<Map<string, FolderSuggest>>(new Map());

  /**
   * 生成简单的UUID
   */
  function generateId(): string {
    return `mapping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 添加新映射
   */
  function addMapping() {
    const newMapping: FolderDeckMapping = {
      id: generateId(),
      folderPath: '',
      targetDeckId: '',
      targetDeckName: '',
      includeSubfolders: true,
      enabled: true,
      autoCreateDeck: false
    };
    
    onMappingsChange([...mappings, newMapping]);
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

  /**
   * 删除映射
   */
  function removeMapping(id: string) {
    // 清理 FolderSuggest 实例
    folderSuggests.get(id)?.close();
    folderSuggests.delete(id);
    
    onMappingsChange(mappings.filter(m => m.id !== id));
    new Notice('已删除映射');
  }

  /**
   * 开始扫描单个映射（解析并保存卡片）
   * 🔄 重构：添加确认对话框和保存逻辑
   */
  async function startScanMapping(mapping: FolderDeckMapping) {
    if (!mapping.folderPath) {
      new Notice('⚠️ 请先选择文件夹');
      return;
    }
    
    if (!mapping.targetDeckId) {
      new Notice('⚠️ 请先选择目标牌组');
      return;
    }
    
    // ✅ 确认对话框
    const confirmMessage = `确认要解析文件夹"${mapping.folderPath}"中的卡片到牌组"${mapping.targetDeckName}"吗？\n\n这将执行实际的卡片解析和保存操作。`;
    
    // 使用浏览器原生确认对话框
    if (!confirm(confirmMessage)) {
      new Notice('已取消操作');
      return;
    }
    
    console.log('[FolderDeckMappingTable] 开始扫描映射:', mapping);
    new Notice(`🔍 开始解析文件夹: ${mapping.folderPath}`);
    
    try {
      const batchManager = plugin?.batchParsingManager;
      if (!batchManager) {
        throw new Error('批量解析服务未初始化');
      }
      
      // 调用扫描方法（现在返回 parsedCards）
      const result = await batchManager.scanSingleMapping(
        mapping,
        (current: number, total: number, file: string) => {
          console.log(`[扫描进度] ${current}/${total}: ${file}`);
        }
      );
      
      console.log('[FolderDeckMappingTable] 扫描结果:', {
        totalCards: result.totalCards,
        parsedCardsCount: result.parsedCards?.length || 0,
        success: result.success,
        failed: result.failed
      });
      
      // ✅ 保存卡片到数据库
      if (result.parsedCards && result.parsedCards.length > 0) {
        new Notice(`🔄 开始保存 ${result.parsedCards.length} 张卡片...`);
        
        try {
          // 调用插件的统一保存流程
          await plugin.addCardsToDB(result.parsedCards);
          
          // 更新映射的统计信息
          updateMapping(mapping.id, {
            fileCount: result.totalCards,
            lastScanned: new Date().toISOString()
          });
          
          // ✅ 显示成功结果
          new Notice(`✅ 成功保存 ${result.totalCards} 张卡片到牌组"${mapping.targetDeckName}"！`);
        } catch (saveError: unknown) {
          const saveErrorMessage = saveError instanceof Error ? saveError.message : String(saveError);
          console.error('[FolderDeckMappingTable] 保存卡片失败:', saveError);
          new Notice(`❌ 保存卡片失败: ${saveErrorMessage}`);
        }
      } else {
        // 未找到卡片
        new Notice(`ℹ️ 扫描完成，未找到符合条件的卡片。\n请检查文件中是否包含 ---start--- 和 ---end--- 标记。`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[FolderDeckMappingTable] 扫描失败:', error);
      new Notice(`❌ 扫描失败: ${errorMessage}`);
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
        .setTitle('开始扫描')
        .setIcon('refresh-cw')
        .setDisabled(!mapping.folderPath || !mapping.targetDeckId)
        .onClick(() => startScanMapping(mapping));
    });
    
    menu.addSeparator();
    
    // 删除映射
    menu.addItem((item) => {
      item
        .setTitle('删除映射')
        .setIcon('trash')
        .onClick(() => removeMapping(mapping.id));
    });
    
    menu.showAtMouseEvent(event);
  }

  /**
   * 初始化文件夹输入框的 FolderSuggest
   */
  function initFolderSuggest(inputEl: HTMLInputElement, mappingId: string) {
    if (inputEl && app) {
      const suggest = new FolderSuggest(app, inputEl);
      folderSuggests.set(mappingId, suggest);
    }
  }

  /**
   * 打开牌组下拉菜单
   */
  function openDeckDropdown(mapping: FolderDeckMapping, event: MouseEvent) {
    console.log('[FolderDeckMappingTable] 打开牌组下拉菜单:', {
      deckCount: decks.length,
      hasApp: !!app
    });
    
    if (!decks || decks.length === 0) {
      console.warn('[FolderDeckMappingTable] 没有可用牌组');
      new Notice('⚠️ 暂无可用牌组，请先在"牌组学习"界面创建牌组');
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
            console.log('[FolderDeckMappingTable] 选择了牌组:', {
              id: deck.id,
              name: deck.name
            });
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
    const updated = mappings.map(m => ({
      ...m,
      targetDeckName: deckMap.get(m.targetDeckId) || m.targetDeckName
    }));
    onMappingsChange(updated);
  }
</script>

<div class="tuanki-settings settings-group">
  <!-- 表头 -->
  <div class="mapping-header">
    <div class="header-content">
      <h4 class="group-title with-accent-bar accent-cyan">文件夹与牌组映射</h4>
      <p class="header-desc">配置文件夹扫描范围及对应的目标牌组</p>
    </div>
    <div class="header-actions">
      <button class="add-mapping-btn" onclick={addMapping}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        添加映射
      </button>
    </div>
  </div>

  <!-- 映射表格（始终显示，包括空状态） -->
  {#if mappings.length > 0}
    <div class="mapping-table-container">
      <table class="mapping-table">
        <thead>
          <tr>
            <th>Obsidian文件夹</th>
            <th>目标牌组</th>
            <th>子文件夹</th>
            <th>卡片数量</th>
            <th>启用</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {#each mappings as mapping (mapping.id)}
            <tr class:disabled={!mapping.enabled}>
              <!-- 文件夹选择列 -->
              <td class="folder-cell">
                <div class="folder-input-wrapper">
                  <svg class="folder-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <input
                    type="text"
                    class="folder-input"
                    value={mapping.folderPath}
                    oninput={(e) => updateMapping(mapping.id, { folderPath: e.currentTarget.value })}
                    placeholder="选择或输入文件夹路径..."
                    use:initFolderSuggest={mapping.id}
                  />
                </div>
              </td>
              
              <!-- 牌组选择列 -->
              <td class="deck-cell">
                <button 
                  class="deck-selector-btn"
                  class:empty={!mapping.targetDeckId}
                  onclick={(e) => openDeckDropdown(mapping, e)}
                  title={mapping.targetDeckName || '点击选择牌组'}
                >
                  {#if mapping.targetDeckId && mapping.targetDeckName}
                    <svg class="deck-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <span class="deck-name">{mapping.targetDeckName}</span>
                  {:else}
                    <span class="placeholder">选择牌组...</span>
                  {/if}
                  <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </td>
              
              <!-- 子文件夹开关 -->
              <td class="subfolder-cell">
                <label class="checkbox-label">
                  <input 
                    type="checkbox"
                    checked={mapping.includeSubfolders}
                    onchange={(e) => updateMapping(mapping.id, { 
                      includeSubfolders: e.currentTarget.checked 
                    })}
                  />
                  <span>{mapping.includeSubfolders ? '包含' : '排除'}</span>
                </label>
              </td>
              
              <!-- 卡片数量统计 -->
              <td class="card-count-cell">
                {#if mapping.fileCount !== undefined}
                  <span class="card-count">{mapping.fileCount} 张</span>
                {:else}
                  <span class="card-count-placeholder">未统计</span>
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
                  aria-label="操作菜单"
                  title="更多操作"
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
    background: var(--tuanki-secondary-bg, var(--background-primary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 1rem;
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

  /* ===== 表格容器 ===== */
  .mapping-table-container {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ===== 表格样式 ===== */
  .mapping-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  /* 列宽定义 */
  .mapping-table th:nth-child(1),
  .mapping-table td:nth-child(1) { width: 25%; } /* Obsidian文件夹 */

  .mapping-table th:nth-child(2),
  .mapping-table td:nth-child(2) { width: 25%; } /* 目标牌组 */

  .mapping-table th:nth-child(3),
  .mapping-table td:nth-child(3) { width: 12%; } /* 子文件夹 */

  .mapping-table th:nth-child(4),
  .mapping-table td:nth-child(4) { width: 12%; } /* 卡片数量 */

  .mapping-table th:nth-child(5),
  .mapping-table td:nth-child(5) { width: 10%; } /* 启用 */

  .mapping-table th:nth-child(6),
  .mapping-table td:nth-child(6) { width: 60px; } /* 操作 */

  /* 表头样式 */
  .mapping-table thead th {
    padding: 12px 8px;
    background: var(--tuanki-secondary-bg, var(--background-primary));
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

  /* ===== 文件夹输入框样式 ===== */
  .folder-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .folder-icon {
    flex-shrink: 0;
    color: var(--text-muted);
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
    transition: border-color 0.2s;
  }

  .folder-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
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

