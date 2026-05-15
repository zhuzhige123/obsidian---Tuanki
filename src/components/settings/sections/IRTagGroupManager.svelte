<!--
  增量阅读标签组管理器
  职责：管理增量阅读的材料类型标签组（IRTagGroup）
  
  功能：
  - 显示已创建的标签组列表
  - 创建/编辑/删除标签组
  - 显示标签组统计信息（文档数、样本量等）
  
  @version 3.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Notice, Menu } from 'obsidian';
  import { tr as trStore } from '../../../utils/i18n';
  import type { IRTagGroup, IRTagGroupProfile } from '../../../types/ir-types';
  import type { IncrementalReadingSettingsHost } from '../types/incremental-reading-settings-host';
  import { DEFAULT_TAG_GROUP_PROFILE } from '../../../types/ir-types';
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import IRTagGroupEditor from './IRTagGroupEditor.svelte';
  import IRTagGroupStatsModal from './IRTagGroupStatsModal.svelte';
  import { showObsidianConfirm } from '../../../utils/obsidian-confirm';
  import { IRTagGroupService } from '../../../services/incremental-reading/IRTagGroupService';
  import { IRStorageService } from '../../../services/incremental-reading/IRStorageService';

  let t = $derived($trStore);

  interface Props {
    plugin: IncrementalReadingSettingsHost;
  }

  let { plugin }: Props = $props();

  // 状态管理
  let tagGroups = $state<IRTagGroup[]>([]);
  let profiles = $state<Record<string, IRTagGroupProfile>>({});
  let documentCounts = $state<Record<string, number>>({});
  let isLoading = $state(true);
  let showEditor = $state(false);
  let editingGroup = $state<IRTagGroup | null>(null);
  let editingProfile = $state<IRTagGroupProfile | null>(null);
  let deckScopes = $state<Array<{ topicId: string; topicName: string }>>([]);
  let editingScopeTopicIds = $state<string[]>([]);
  let loadError = $state<string | null>(null);
  let hasInitialized = $state(false);
  let showStatsModal = $state(false);
  let statsGroup = $state<IRTagGroup | null>(null);
  let statsProfile = $state<IRTagGroupProfile | null>(null);

  type EditorSavePayload = {
    group: IRTagGroup;
    profile: IRTagGroupProfile;
    targetTopicIds: string[];
  };

  // 获取或创建服务
  async function getOrCreateService(): Promise<IRTagGroupService> {
    if (plugin.irTagGroupService) {
      return plugin.irTagGroupService;
    }
    
    const service = new IRTagGroupService(plugin.app);
    await service.initialize();
    plugin.irTagGroupService = service;
    return service;
  }

  // 加载数据
  async function loadData() {
    if (hasInitialized) {
      return;
    }
    hasInitialized = true;
    
    isLoading = true;
    loadError = null;
    
    try {
      const service = await getOrCreateService();
      
      // 获取所有标签组
      const allGroups = await service.getAllGroups();
      deckScopes = await service.getDeckScopes();
      tagGroups = allGroups.filter(g => g.id !== 'default');
      
      // 获取统计信息
      const stats = await service.getGroupStats();
      
      const newProfiles: Record<string, IRTagGroupProfile> = {};
      const newCounts: Record<string, number> = {};
      
      for (const stat of stats) {
        newProfiles[stat.group.id] = stat.profile;
        newCounts[stat.group.id] = stat.documentCount;
      }
      
      profiles = newProfiles;
      documentCounts = newCounts;
    } catch (error) {
      loadError = (error as Error).message;
    } finally {
      isLoading = false;
    }
  }

  // 使用 onMount 进行异步初始化（Svelte 5 正确模式）
  onMount(async () => {
    await loadData();
  });

  // 新建标签组
  function handleCreate() {
    editingGroup = null;
    editingProfile = null;
    editingScopeTopicIds = deckScopes.map((scope) => scope.topicId);
    showEditor = true;
  }

  // 编辑标签组
  async function handleEdit(group: IRTagGroup) {
    const service = await getOrCreateService();
    editingGroup = { ...group };
    editingProfile = profiles[group.id]
      ? { ...profiles[group.id] }
      : { ...DEFAULT_TAG_GROUP_PROFILE, groupId: group.id };
    const scopedTopicIds = await service.getGroupScopeTopicIds(group.id);
    editingScopeTopicIds = scopedTopicIds.length > 0
      ? scopedTopicIds
      : deckScopes.map((scope) => scope.topicId);
    showEditor = true;
  }

  // 查看统计
  function handleShowStats(group: IRTagGroup) {
    statsGroup = group;
    statsProfile = profiles[group.id] || DEFAULT_TAG_GROUP_PROFILE;
    showStatsModal = true;
  }

  // 关闭统计模态窗
  function handleCloseStats() {
    showStatsModal = false;
    statsGroup = null;
    statsProfile = null;
  }

  // 删除标签组
  async function handleDelete(group: IRTagGroup) {
    if (group.id === 'default') {
      new Notice(t('irTagGroup.cannotDeleteDefault'));
      return;
    }

    const confirmed = await showObsidianConfirm(
      plugin.app,
      t('irTagGroup.deleteConfirm', { name: group.name }),
      { title: t('common.confirmDelete') }
    );
    
    if (!confirmed) return;

    try {
      const service = await getOrCreateService();
      
      const storage = new IRStorageService(plugin.app);
      await storage.initialize();
      await service.deleteGroup(group.id, {
        getAllChunkData: () => storage.getAllChunkData() as Promise<any>,
        saveChunkData: (d: any) => storage.saveChunkData(d),
        getAllSources: () => storage.getAllSources() as Promise<any>,
        saveSource: (d: any) => storage.saveSource(d)
      });
      hasInitialized = false;
      await loadData();
      new Notice(t('irTagGroup.deleted', { name: group.name }));
    } catch (error) {
      new Notice(t('irTagGroup.deleteFailed'));
    }
  }

  // 保存标签组
  async function handleSave(payload: EditorSavePayload) {
    try {
      const service = await getOrCreateService();

      const groupResult = await service.saveGroup(payload.group, {
        targetTopicIds: payload.targetTopicIds
      });
      const profileResult = await service.saveProfile(payload.profile, {
        targetTopicIds: payload.targetTopicIds
      });
      const affectedTopicIds = Array.from(new Set([
        ...groupResult.affectedTopicIds,
        ...profileResult.affectedTopicIds
      ]));
      const actionNotice = editingGroup
        ? t('irTagGroup.updated', { name: payload.group.name })
        : t('irTagGroup.created', { name: payload.group.name });
      new Notice(`${actionNotice}，已同步到 ${affectedTopicIds.length} 个专题文件`);

      showEditor = false;
      editingGroup = null;
      editingProfile = null;
      editingScopeTopicIds = [];
      
      // 重新加载数据
      hasInitialized = false;
      await loadData();
    } catch (error) {
      new Notice(t('irTagGroup.saveFailed') + (error as Error).message);
    }
  }

  // 关闭编辑器
  function handleCloseEditor() {
    showEditor = false;
    editingGroup = null;
    editingProfile = null;
    editingScopeTopicIds = [];
  }

  // 格式化参数显示
  function formatFactor(value: number): string {
    return value.toFixed(2) + 'x';
  }

  // 显示操作菜单
  function showActionsMenu(group: IRTagGroup, event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem((item) => {
      item.setTitle('参数统计')
        .setIcon('bar-chart-2')
        .onClick(() => handleShowStats(group));
    });
    
    menu.addItem((item) => {
      item.setTitle('编辑')
        .setIcon('edit-2')
        .onClick(() => {
          void handleEdit(group);
        });
    });
    
    menu.addSeparator();
    
    menu.addItem((item) => {
      item.setTitle('删除')
        .setIcon('trash-2')
        .onClick(() => handleDelete(group));
    });
    
    menu.showAtMouseEvent(event);
  }
</script>

<div class="ir-tag-group-manager">
  <!-- 头部 -->
  <div class="manager-header">
    <div class="header-info">
      <div class="header-title">{t('irTagGroup.managerTitle')}</div>
      <p class="header-desc">
        {t('irTagGroup.managerDesc')}
      </p>
    </div>
    <button class="create-btn" onclick={handleCreate}>
      <EnhancedIcon name="plus" size={16} />
      <span>{t('irTagGroup.createBtn')}</span>
    </button>
  </div>

  <!-- 内容区 -->
  {#if isLoading}
    <div class="loading-state">
      <EnhancedIcon name="loader" size={24} />
      <span>{t('irTagGroup.loading')}</span>
    </div>
  {:else if loadError}
    <div class="error-state">
      <EnhancedIcon name="alert-circle" size={24} />
      <span>{t('irTagGroup.loadFailed')}{loadError}</span>
      <button class="retry-btn" onclick={() => { hasInitialized = false; loadData(); }}>
        {t('irTagGroup.retryBtn')}
      </button>
    </div>
  {:else if tagGroups.length === 0}
    <!-- empty: no custom tag groups -->
  {:else}
    <div class="tag-group-table-container">
      <table class="tag-group-table">
        <thead>
          <tr>
            <th class="col-name">{t('irTagGroup.colName')}</th>
            <th class="col-tags">{t('irTagGroup.colTags')}</th>
            <th class="col-docs">{t('irTagGroup.colDocs')}</th>
            <th class="col-factor">{t('irTagGroup.colFactor')}</th>
            <th class="col-samples">{t('irTagGroup.colSamples')}</th>
            <th class="col-priority">{t('irTagGroup.colPriority')}</th>
            <th class="col-actions">{t('irTagGroup.colActions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each tagGroups as group (group.id)}
            {@const profile = profiles[group.id] || DEFAULT_TAG_GROUP_PROFILE}
            {@const docCount = documentCounts[group.id] || 0}
            <tr>
              <td class="col-name">
                <span class="group-name">{group.name}</span>
              </td>
              <td class="col-tags">
                <div class="tags-cell">
                  {#each group.matchAnyTags.slice(0, 3) as tag}
                    <span class="tag-badge">{tag}</span>
                  {/each}
                  {#if group.matchAnyTags.length > 3}
                    <span class="tag-more">+{group.matchAnyTags.length - 3}</span>
                  {/if}
                </div>
              </td>
              <td class="col-docs">{docCount}</td>
              <td class="col-factor">{formatFactor(profile.intervalFactorBase)}</td>
              <td class="col-samples">{profile.sampleCount}</td>
              <td class="col-priority">{group.matchPriority}</td>
              <td class="col-actions">
                <button 
                  class="menu-btn"
                  onclick={(e) => showActionsMenu(group, e)}
                  title="更多操作"
                >
                  <EnhancedIcon name="more-horizontal" size={18} />
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- 默认组提示 -->
    <div class="default-group-hint">{t('irTagGroup.defaultGroupHint')}</div>
  {/if}
</div>

<!-- 编辑器弹窗 -->
{#if showEditor}
  <IRTagGroupEditor
    {plugin}
    group={editingGroup}
    profile={editingProfile}
    availableScopes={deckScopes}
    selectedScopeTopicIds={editingScopeTopicIds}
    onSave={handleSave}
    onCancel={handleCloseEditor}
  />
{/if}

<!-- 统计模态窗 -->
{#if showStatsModal && statsGroup && statsProfile}
  <IRTagGroupStatsModal
    group={statsGroup}
    profile={statsProfile}
    onClose={handleCloseStats}
  />
{/if}

<style>
  .ir-tag-group-manager {
    margin: 12px 0;
    padding: 16px;
    background: var(--background-secondary);
    border-radius: 10px;
  }

  /* 头部 */
  .manager-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .header-info {
    flex: 1;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .header-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
  }

  .create-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease;
    white-space: nowrap;
  }

  .create-btn:hover {
    background: var(--interactive-accent-hover);
  }

  /* 加载状态 */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 40px;
    color: var(--text-muted);
  }

  /* 错误状态 */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 40px;
    color: var(--text-error);
    text-align: center;
  }

  .retry-btn {
    margin-top: 8px;
    padding: 6px 14px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-normal);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .retry-btn:hover {
    background: var(--background-secondary);
    border-color: var(--interactive-accent);
  }

  /* 表格容器 */
  .tag-group-table-container {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tag-group-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .tag-group-table th,
  .tag-group-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .tag-group-table th {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--background-secondary-alt);
    white-space: nowrap;
  }

  .tag-group-table tbody tr:hover {
    background: var(--background-secondary-alt);
  }

  .tag-group-table tbody tr:last-child td {
    border-bottom: none;
  }

  /* 列宽度 */
  .col-name { min-width: 100px; }
  .col-tags { min-width: 140px; }
  .col-docs,
  .col-factor,
  .col-samples,
  .col-priority { 
    width: 80px; 
    text-align: center;
  }
  .col-actions { 
    width: 50px; 
    text-align: center;
  }

  .tag-group-table td.col-docs,
  .tag-group-table td.col-factor,
  .tag-group-table td.col-samples,
  .tag-group-table td.col-priority,
  .tag-group-table td.col-actions {
    text-align: center;
  }

  .group-name {
    font-weight: 600;
    color: var(--text-normal);
  }

  .tags-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-badge {
    display: inline-block;
    padding: 2px 6px;
    font-size: 0.7rem;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    border-radius: 4px;
  }

  .tag-more {
    display: inline-block;
    padding: 2px 6px;
    font-size: 0.7rem;
    color: var(--text-faint);
  }

  /* 操作菜单按钮 */
  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .menu-btn:hover {
    background: var(--background-secondary);
    color: var(--text-normal);
  }

  /* 默认组提示 */
  .default-group-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 12px;
    background: var(--background-primary);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
