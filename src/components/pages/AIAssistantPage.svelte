<script lang="ts">
  import { onMount } from 'svelte';
  import type AnkiPlugin from '../../main';
  import type { AnkiDataStorage } from '../../data/storage';
  import type { FSRS } from '../../algorithms/fsrs';
  import type {
    ObsidianFileInfo,
    PromptTemplate,
    GenerationConfig,
    GenerationProgress,
    GeneratedCard
  } from '../../types/ai-types';
  
  import FileSelector from '../ai-assistant/FileSelector.svelte';
  import ContentEditor from '../ai-assistant/ContentEditor.svelte';
  import PromptFooter from '../ai-assistant/PromptFooter.svelte';
  import ProgressIndicator from '../ai-assistant/ProgressIndicator.svelte';
  import AIConfigModal from '../ai-assistant/AIConfigModal.svelte';
  import CardPreviewModal from '../ai-assistant/CardPreviewModal.svelte';
  import SystemPromptModal from '../ai-assistant/SystemPromptModal.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  
  import { AIServiceFactory } from '../../services/ai/AIServiceFactory';
  import { validateContentLength } from '../../utils/file-utils';
  import { replaceTemplateVariables, buildVariablesFromConfig } from '../../utils/prompt-template-utils';
  import { createBatches } from '../../utils/batch-utils';
  import { Notice } from 'obsidian';

  interface Props {
    plugin: AnkiPlugin;
    dataStorage: AnkiDataStorage;
    fsrs: FSRS;
  }

  let { plugin, dataStorage, fsrs }: Props = $props();

  // ===== 状态管理 =====
  let selectedFile = $state<ObsidianFileInfo | null>(null);
  let content = $state('');
  let selectedPrompt = $state<PromptTemplate | null>(null);
  let customPrompt = $state('');
  
  // 生成状态
  let isGenerating = $state(false);
  let generationProgress = $state<GenerationProgress | null>(null);
  let generatedCards = $state<GeneratedCard[]>([]);
  
  // 配置状态
  let showConfigModal = $state(false);
  let showPreviewModal = $state(false);
  let showSystemPromptModal = $state(false);
  let generationConfig = $state<GenerationConfig>({
    templateId: '',
    promptTemplate: '',
    cardCount: 10,
    difficulty: 'medium',
    typeDistribution: { qa: 50, cloze: 30, choice: 20 },
    provider: plugin.settings.aiConfig?.defaultProvider || 'openai',
    model: '',
    temperature: 0.7,
    maxTokens: 2000,
    imageGeneration: {
      enabled: false,
      strategy: 'none',
      imagesPerCard: 0,
      placement: 'question'
    },
    // 使用官方模板作为默认值
    templates: {
      qa: 'official-qa',
      choice: 'official-choice',
      cloze: 'official-cloze'
    },
    autoTags: [],
    enableHints: true
  });
  
  // 空状态 - 已移除，编辑器始终显示
  // let showEmptyState = $derived(!selectedFile && !content);

  // ===== 文件操作 =====
  async function handleFileSelect(file: ObsidianFileInfo) {
    selectedFile = file;
    try {
      const fileContent = await plugin.app.vault.read(file.file);
      content = fileContent;
    } catch (error) {
      new Notice('读取文件失败');
      console.error('Failed to read file:', error);
    }
  }

  function handleClearContent() {
    content = '';
  }

  async function handleReloadFile() {
    if (selectedFile) {
      try {
        const fileContent = await plugin.app.vault.read(selectedFile.file);
        content = fileContent;
        new Notice('文件已重新加载');
      } catch (error) {
        new Notice('重新加载文件失败');
        console.error('Failed to reload file:', error);
      }
    }
  }

  // ===== 提示词操作 =====
  function handlePromptSelect(prompt: PromptTemplate | null) {
    selectedPrompt = prompt;
    if (prompt) {
      customPrompt = '';
    }
  }

  function handleCustomPromptChange(prompt: string) {
    customPrompt = prompt;
  }

  // ===== AI生成（渐进式分批生成）=====
  async function handleGenerate() {
    // 验证内容
    const validation = validateContentLength(content);
    if (!validation.valid) {
      new Notice(validation.message || '内容验证失败');
      return;
    }

    // 验证AI配置
    if (!plugin.settings.aiConfig) {
      new Notice('请先在设置中配置AI服务');
      return;
    }

    // 确定使用的提示词
    const promptText = selectedPrompt 
      ? selectedPrompt.prompt 
      : customPrompt || '请根据以下内容生成学习卡片';

    try {
      isGenerating = true;
      generatedCards = []; // 清空卡片数组
      const totalCount = generationConfig.cardCount;
      
      // 🔥 立即打开预览窗口（显示骨架屏）
      showPreviewModal = true;
      
      generationProgress = {
        status: 'preparing',
        progress: 0,
        message: '准备生成卡片...',
        currentCard: 0,
        totalCards: totalCount
      };

      // 获取AI服务
      const aiService = AIServiceFactory.getDefaultService(plugin);

      // 构建基础生成配置
      const aiConfig = plugin.settings.aiConfig;
      const provider = aiConfig.defaultProvider;
      const providerConfig = aiConfig.apiKeys[provider];
      
      if (!providerConfig || !providerConfig.apiKey) {
        throw new Error(`${provider} API密钥未配置`);
      }
      
      // 替换模板变量
      const variables = buildVariablesFromConfig(generationConfig);
      const finalPrompt = replaceTemplateVariables(promptText, variables);
      
      // 🔥 智能分批：10张 → [2, 2, 2, 2, 2]
      const batches = createBatches(totalCount, 'fast-first');
      console.log(`分批生成策略: ${batches.join(' + ')} = ${totalCount}张卡片`);
      
      // 🔥 循环生成每批
      for (let i = 0; i < batches.length; i++) {
        const batchSize = batches[i];
        const batchNum = i + 1;
        
        console.log(`开始生成第${batchNum}批 (${batchSize}张)`);
        
        // 构建当前批次的配置
        const batchConfig: GenerationConfig = {
          ...generationConfig,
          cardCount: batchSize, // 覆盖为当前批次数量
          templateId: selectedPrompt?.id || 'custom',
          promptTemplate: finalPrompt,
          customPrompt: customPrompt || undefined,
          provider: provider,
          model: providerConfig.model,
          temperature: aiConfig.globalParams.temperature,
          maxTokens: aiConfig.globalParams.maxTokens
        };
        
        // 更新进度
        generationProgress = {
          status: 'generating',
          progress: Math.round((i / batches.length) * 100),
          message: `正在生成第${batchNum}/${batches.length}批 (${batchSize}张)...`,
          currentCard: generatedCards.length,
          totalCards: totalCount
        };
        
        // 生成当前批次
        const response = await aiService.generateCards(
          content,
          batchConfig,
          (progress) => {
            // 批次内的进度更新
            generationProgress = {
              ...progress,
              currentCard: generatedCards.length,
              totalCards: totalCount
            };
          }
        );
        
        if (response.success && response.cards) {
          // 🔥 实时添加到卡片数组（触发预览窗口更新）
          const newCards = response.cards.map(card => ({
            ...card,
            isNew: true // 标记为新卡片，用于动画
          }));
          
          generatedCards = [...generatedCards, ...newCards];
          
          console.log(`第${batchNum}批完成: 新增${newCards.length}张，累计${generatedCards.length}/${totalCount}张`);
          
          // 短暂延迟，让用户看到卡片出现的动画
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 移除"新"标记
          generatedCards = generatedCards.map(card => ({
            ...card,
            isNew: false
          }));
        } else {
          console.error(`第${batchNum}批生成失败:`, response.error);
          // 单批失败不影响已生成的卡片，继续下一批
        }
      }
      
      // 🔥 全部完成
      generationProgress = {
        status: 'completed',
        progress: 100,
        message: `成功生成${generatedCards.length}张卡片`,
        currentCard: generatedCards.length,
        totalCards: totalCount
      };
      
      console.log('所有批次生成完成:', generatedCards);
      
      // 延迟后清除进度
      setTimeout(() => {
        generationProgress = null;
      }, 1000);
      
    } catch (error) {
      console.error('Generation failed:', error);
      new Notice(error instanceof Error ? error.message : 'AI生成失败');
      
      if (generationProgress) {
        generationProgress = {
          status: 'failed',
          progress: 0,
          message: error instanceof Error ? error.message : '生成失败'
        };
      }
    } finally {
      isGenerating = false;
    }
  }

  // ===== 配置模态窗 =====
  function handleOpenConfig() {
    showConfigModal = true;
  }

  function handleCloseConfig() {
    showConfigModal = false;
  }

  // ===== 系统提示词模态窗 =====
  function handleOpenSystemPrompt() {
    showSystemPromptModal = true;
  }

  function handleCloseSystemPrompt() {
    showSystemPromptModal = false;
  }

  function handleSaveConfig(config: GenerationConfig) {
    generationConfig = config;
    showConfigModal = false;
    new Notice('配置已保存');
  }

  // ===== 卡片预览模态窗 =====
  function handleClosePreview() {
    showPreviewModal = false;
  }

  async function handleImportCards(selectedCards: GeneratedCard[], targetDeckId: string) {
    try {
      // 获取目标牌组（现在使用ID）
      const deck = await dataStorage.getDeck(targetDeckId);
      
      if (!deck) {
        throw new Error(`牌组不存在`);
      }

      console.log('Starting import to deck:', deck.name, selectedCards);

      // 动态导入 CardConverter 服务
      const { CardConverter } = await import('../../services/ai/CardConverter');
      
      // 批量转换 GeneratedCard 为 Card 格式
      const { cards, errors } = CardConverter.convertBatch(
        selectedCards,
        targetDeckId,
        selectedFile?.path, // 源文件路径
        generationConfig.templates, // 传递模板配置
        plugin.fsrs // 传递 FSRS 实例，确保数据结构标准化
      );
      
      console.log('Converted cards:', cards.length, 'Errors:', errors.length);
      
      if (errors.length > 0) {
        console.warn('Card conversion errors:', errors);
      }
      
      // 逐个保存卡片
      let successCount = 0;
      let failCount = 0;
      
      for (const card of cards) {
        try {
          await dataStorage.saveCard(card);
          successCount++;
          console.log('Saved card:', card.id);
        } catch (error) {
          failCount++;
          console.error('Failed to save card:', card.id, error);
        }
      }
      
      console.log(`Import completed: ${successCount} success, ${failCount} failed`);
      
      // 显示结果通知
      if (successCount > 0) {
        new Notice(`成功导入 ${successCount} 张卡片到 ${deck.name}`);
        
        // 🗑️ 已移除旧的 CustomEvent 触发
        // 现在通过 DataSyncService 在 saveCard 时自动通知
      }
      
      if (failCount > 0 || errors.length > 0) {
        new Notice(`导入失败 ${failCount + errors.length} 张卡片`, 5000);
      }
      
      if (successCount === 0) {
        throw new Error('没有卡片成功导入');
      }
    } catch (error) {
      console.error('Import cards failed:', error);
      throw error;
    }
  }

  // ===== 生命周期 =====
  onMount(() => {
    console.log('AI Assistant Page mounted');
  });
</script>

<div class="ai-assistant-page">
  <!-- 顶部功能栏 -->
  <header class="ai-header">
    <div class="header-left">
      <ObsidianIcon name="bot" size={28} />
    </div>

    <div class="header-right">
      <FileSelector 
        {plugin}
        bind:selectedFile
        onFileSelect={handleFileSelect}
      />
      
      <button class="config-btn" title="配置" onclick={handleOpenConfig}>
        <ObsidianIcon name="settings" size={16} />
        <span>配置</span>
      </button>
    </div>
  </header>

  <!-- 主内容区 -->
  <main class="ai-main-content">
    <!-- 内容编辑器容器 - 始终显示 -->
    <div class="editor-wrapper">
      <ContentEditor
        bind:content
        {selectedFile}
        onClear={handleClearContent}
        onReload={handleReloadFile}
      />
    </div>

    <!-- 进度指示器 -->
    {#if generationProgress}
      <div class="progress-wrapper">
        <ProgressIndicator progress={generationProgress} />
      </div>
    {/if}
  </main>

  <!-- 底部操作栏 -->
  <PromptFooter
    {plugin}
    bind:selectedPrompt
    bind:customPrompt
    onPromptSelect={handlePromptSelect}
    onCustomPromptChange={handleCustomPromptChange}
    onGenerate={handleGenerate}
    onViewSystemPrompt={handleOpenSystemPrompt}
    {isGenerating}
    disabled={!content.trim() || isGenerating}
  />
</div>

<!-- 配置模态窗 -->
<AIConfigModal
  {plugin}
  config={generationConfig}
  isOpen={showConfigModal}
  onClose={handleCloseConfig}
  onSave={handleSaveConfig}
/>

<!-- 卡片预览模态窗 -->
<CardPreviewModal
  {plugin}
  cards={generatedCards}
  isOpen={showPreviewModal}
  isGenerating={isGenerating}
  totalCards={generationConfig.cardCount}
  onClose={handleClosePreview}
  onImport={handleImportCards}
/>

<!-- 系统提示词模态窗 -->
<SystemPromptModal
  {plugin}
  config={generationConfig}
  isOpen={showSystemPromptModal}
  onClose={handleCloseSystemPrompt}
/>

<style>
  .ai-assistant-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
  }

  .ai-header {
    position: relative;  /* 修复：建立层叠上下文 */
    z-index: 100;  /* 修复：确保 header 在内容之上 */
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-left {
    display: flex;
    align-items: center;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .config-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .config-btn:hover {
    background: var(--interactive-hover);
    border-color: var(--interactive-accent);
  }

  .ai-main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0;  /* 移除所有padding，改用子元素margin */
    overflow: hidden;
    min-height: 0;
  }

  /* 编辑器包装器 - 始终显示 */
  .editor-wrapper {
    flex: 1;  /* 填充可用空间 */
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin: 16px;  /* 添加margin替代父元素的padding */
  }

  /* 进度指示器包装器 */
  .progress-wrapper {
    margin: 12px 16px 16px 16px;  /* 顶、右、下、左 */
    flex-shrink: 0;
  }
</style>

