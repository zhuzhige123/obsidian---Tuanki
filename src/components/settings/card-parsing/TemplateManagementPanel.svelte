<!--
  模板管理面板组件
  职责：模板列表展示、筛选、操作管理
-->
<script lang="ts">
  import { Notice } from 'obsidian';
  import type { ParseTemplate } from '../../../types/newCardParsingTypes';
  import { OFFICIAL_TEMPLATES } from '../../../constants/official-templates';
  import type AnkiPlugin from '../../../main';
  
  import TemplateTypeFilter from './components/TemplateTypeFilter.svelte';
  import TemplateCard from './components/TemplateCard.svelte';
  import TemplateEditorModal from './components/TemplateEditorModal.svelte';
  import HelpTooltip from './components/HelpTooltip.svelte';

  interface Props {
    templates: ParseTemplate[];
    onTemplatesChange: (templates: ParseTemplate[]) => void;
    plugin?: AnkiPlugin;
  }

  let { templates, onTemplatesChange, plugin }: Props = $props();

  // 状态管理
  let templateSourceFilter: 'all' | 'tuanki' | 'anki' = $state('all');
  let showTemplateModal = $state(false);
  let editingTemplate: ParseTemplate | null = $state(null);

  // 获取所有模板（官方模板 + 用户模板） - 使用 $derived 优化性能
  const allTemplates = $derived([...OFFICIAL_TEMPLATES, ...templates]);

  // 获取过滤后的模板 - 使用 $derived 优化性能，仅按来源筛选
  const filteredTemplates = $derived(
    allTemplates.filter(template => {
      // 来源筛选
      if (templateSourceFilter === 'all') {
        return true;
      }
      
      if (templateSourceFilter === 'tuanki') {
        return template.tuankiMetadata?.source !== 'anki_imported';
      }
      
      if (templateSourceFilter === 'anki') {
        return template.tuankiMetadata?.source === 'anki_imported';
      }
      
      return true;
    })
  );

  // 打开模板编辑器
  function openTemplateModal(template?: ParseTemplate) {
    editingTemplate = template || null;
    showTemplateModal = true;
  }

  // 关闭模板编辑器
  function closeTemplateModal() {
    showTemplateModal = false;
    editingTemplate = null;
  }

  // 保存模板
  function saveTemplate(template: ParseTemplate) {
    if (editingTemplate) {
      const index = templates.findIndex(t => t.id === editingTemplate!.id);
      const newTemplates = [...templates];
      newTemplates[index] = template;
      onTemplatesChange(newTemplates);
    } else {
      onTemplatesChange([...templates, template]);
    }
  }

  // 复制模板
  function duplicateTemplate(templateId: string) {
    const template = allTemplates.find(t => t.id === templateId);
    if (template) {
      const newTemplate = {
        ...template,
        id: `template_${Date.now()}`,
        name: template.name + ' (副本)',
        isDefault: false,
        isOfficial: false
      };
      onTemplatesChange([...templates, newTemplate]);
    }
  }

  // 查找使用模板的卡片
  async function findCardsUsingTemplate(templateId: string) {
    if (!plugin) {
      return [];
    }

    try {
      const allCards = await plugin.dataStorage.getAllCards();
      return allCards.filter(card => card.templateId === templateId);
    } catch (error) {
      console.error('[TemplateManagementPanel] 查找关联卡片失败:', error);
      return [];
    }
  }

  // 删除模板（带保护机制）
  async function deleteTemplate(templateId: string) {
    // 检查是否有关联卡片
    const linkedCards = await findCardsUsingTemplate(templateId);
    
    if (linkedCards.length > 0) {
      const confirmed = confirm(
        `⚠️ 警告：该模板关联了 ${linkedCards.length} 张卡片。\n\n` +
        `删除模板后，这些卡片也将被删除，且无法恢复！\n\n` +
        `确定要继续吗？`
      );
      
      if (!confirmed) return;
      
      // 删除关联卡片
      try {
        if (!plugin) {
          throw new Error('Plugin not available');
        }
        for (const card of linkedCards) {
          await plugin.dataStorage.deleteCard(card.id);
        }
        console.log(`[TemplateManagementPanel] 已删除 ${linkedCards.length} 张关联卡片`);
      } catch (error) {
        console.error('[TemplateManagementPanel] 删除关联卡片失败:', error);
        alert('删除关联卡片失败，操作已取消');
        return;
      }
    } else {
      // 没有关联卡片，简单确认
      if (!confirm('确定要删除这个模板吗？')) {
        return;
      }
    }
    
    // 删除模板
    const newTemplates = templates.filter(t => t.id !== templateId);
    onTemplatesChange(newTemplates);
    
    // 显示通知
    if (linkedCards.length > 0) {
      new Notice(`已删除模板及其关联的 ${linkedCards.length} 张卡片`);
    } else {
      new Notice('已删除模板');
    }
  }
</script>

<div class="settings-panel">
  <div class="template-header">
    <div class="title-with-help">
      <h3 class="section-title with-accent-bar accent-green">模板管理</h3>
      <HelpTooltip 
        content="💡 仅保留三个官方模板用于AI生成和基础解析。外部导入的模板（如APKG）会自动保存到此处。"
        position="right"
      />
    </div>
  </div>

  <!-- 模板来源筛选器 -->
  <TemplateTypeFilter
    sourceFilter={templateSourceFilter}
    onSourceFilterChange={(filter) => templateSourceFilter = filter}
  />

  <!-- 模板列表 -->
  <div class="template-grid">
    {#each filteredTemplates as template (template.id)}
      <TemplateCard
        {template}
        onEdit={(t) => openTemplateModal(t)}
        onDuplicate={duplicateTemplate}
        onDelete={deleteTemplate}
      />
    {/each}
  </div>
</div>

<!-- 模板编辑器模态窗 -->
<TemplateEditorModal
  isOpen={showTemplateModal}
  {editingTemplate}
  onClose={closeTemplateModal}
  onSave={saveTemplate}
/>

<style>
  /* 侧边颜色条样式 */
  .section-title.with-accent-bar {
    position: relative;
    padding-left: 16px;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 80%;
    border-radius: 2px;
  }

  .section-title.accent-green::before {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.6));
  }

  .settings-panel {
    background: var(--background-primary);
    border-radius: var(--tuanki-radius-lg);
    padding: var(--tuanki-space-lg);
    border: 1px solid var(--background-modifier-border);
    width: 100%;
    box-sizing: border-box;
  }

  .template-header {
    margin-bottom: 20px;
  }

  .title-with-help {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-sm);
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--tuanki-space-lg);
    margin-top: var(--tuanki-space-lg);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .template-grid {
      grid-template-columns: 1fr;
      gap: var(--tuanki-space-md);
    }
  }
</style>


