<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { Card } from '../../data/types';
  import type { FieldTemplate } from '../../data/template-types';
  import { ContentPreviewEngine, type PreviewData, type PreviewOptions, CardType } from './ContentPreviewEngine';
  import { AnimationController, type AnimationOptions } from './AnimationController';
  import { UnifiedCardType } from '../../types/unified-card-types';
  import type AnkiPlugin from '../../main';
  
  // 导入题型卡片组件
  import BasicQACard from './cards/BasicQACard.svelte';
  import ClozeCard from './cards/ClozeCard.svelte';
  import MultipleChoiceCard from './cards/MultipleChoiceCard.svelte';
  import ChoiceQuestionPreview from './ChoiceQuestionPreview.svelte';
  
  // 导入选择题解析器
  import { parseChoiceQuestion, type ChoiceQuestion } from '../../parsing/choice-question-parser';
  
  // 🖼️ 导入图片遮罩集成服务
  import { ImageMaskIntegration } from '../../services/image-mask/ImageMaskIntegration';

  // Props
  interface Props {
    card: Card | null;
    template?: FieldTemplate;
    showAnswer: boolean;
    enableAnimations?: boolean;
    themeMode?: 'auto' | 'light' | 'dark';
    renderingMode?: 'performance' | 'quality';
    enableAnswerControls?: boolean;
    plugin: AnkiPlugin;
    onCardTypeDetected?: (cardType: UnifiedCardType) => void;
    onPreviewReady?: (previewData: PreviewData) => void;
    onAddToErrorBook?: () => void;
    onRemoveFromErrorBook?: () => void;
    currentResponseTime?: number;
  }

  let {
    card = $bindable(),
    template,
    showAnswer = $bindable(),
    enableAnimations = true,
    enableAnswerControls = true,
    themeMode = 'auto',
    renderingMode = 'performance',
    plugin,
    onCardTypeDetected,
    onPreviewReady,
    onAddToErrorBook,
    onRemoveFromErrorBook,
    currentResponseTime
  }: Props = $props();

  // 状态管理
  let previewEngine: ContentPreviewEngine;
  let animationController = $state<AnimationController | undefined>(undefined);
  let containerElement: HTMLElement;
  let currentPreviewData: PreviewData | null = $state(null);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // 响应式状态
  let lastCardId = $state<string | null>(null);
  let lastShowAnswer = $state(false);
  let lastAnswerControls = $state(enableAnswerControls);

  // 选择题状态
  let choiceQuestionData = $state<ChoiceQuestion | null>(null);
  let selectedOptions = $state<string[]>([]);
  
  // 🖼️ 图片遮罩集成
  let maskIntegration: ImageMaskIntegration;
  
  // 导出方法供外部访问选择题数据
  export function getChoiceQuestionData() {
    return {
      questionData: choiceQuestionData,
      selectedOptions,
      isChoiceQuestion: choiceQuestionData !== null
    };
  }

  onMount(() => {
    // 初始化预览引擎
    previewEngine = new ContentPreviewEngine(plugin);
    
    // 🖼️ 初始化图片遮罩集成
    maskIntegration = new ImageMaskIntegration(plugin.app);

    // 初始化动画控制器
    const animationOptions: AnimationOptions = {
      enableAnimations,
      reducedMotion: false,
      performanceMode: renderingMode === 'performance' ? 'performance' : 'quality'
    };
    animationController = new AnimationController(animationOptions);

    console.log('[PreviewContainer] 预览容器已初始化');
  });

  onDestroy(() => {
    // 清理资源
    if (previewEngine) {
      previewEngine.clearCache();
    }
    if (animationController) {
      animationController.cleanup();
    }

    console.log('[PreviewContainer] 预览容器已清理');
  });

  // 监听卡片变化并重新渲染
  $effect(() => {
    // ✅ 修复BUG: 只在卡片ID或答案控制变化时重新渲染
    // showAnswer变化不应清空selectedOptions，因此移除该条件
    if (card && (card.id !== lastCardId || enableAnswerControls !== lastAnswerControls)) {
      lastCardId = card.id;
      lastShowAnswer = showAnswer;
      lastAnswerControls = enableAnswerControls;
      renderPreview();
    } else if (card && showAnswer !== lastShowAnswer) {
      // ✅ 仅更新状态跟踪，不重新渲染
      lastShowAnswer = showAnswer;
    }
  });
  
  // 🖼️ 监听卡片渲染完成，应用图片遮罩
  $effect(() => {
    if (card && currentPreviewData && containerElement && maskIntegration) {
      // 等待 DOM 更新
      tick().then(async () => {
        try {
          // 🔍 调试：打印 card.content
          console.log('[PreviewContainer] 🖼️ 准备应用图片遮罩');
          console.log('[PreviewContainer] card.content 前200字符:', card.content?.substring(0, 200));
          console.log('[PreviewContainer] containerElement:', containerElement);
          
          // ⏳ 等待图片加载完成（ObsidianRenderer 使用异步渲染）
          // 尝试多次查找图片，最多等待 2 秒
          let attempts = 0;
          const maxAttempts = 20;
          const waitInterval = 100; // 100ms
          
          while (attempts < maxAttempts) {
            const images = containerElement.querySelectorAll('img');
            console.log(`[PreviewContainer] 尝试 ${attempts + 1}/${maxAttempts}：找到 ${images.length} 个图片`);
            
            if (images.length > 0) {
              // 找到图片了，等待所有图片加载完成
              const imageLoadPromises = Array.from(images).map((img: HTMLImageElement) => {
                if (img.complete) {
                  return Promise.resolve();
                }
                return new Promise((resolve) => {
                  img.addEventListener('load', () => resolve(null), { once: true });
                  img.addEventListener('error', () => resolve(null), { once: true });
                  // 超时保护
                  setTimeout(() => resolve(null), 1000);
                });
              });
              
              await Promise.all(imageLoadPromises);
              console.log('[PreviewContainer] ✅ 所有图片已加载');
              
              // 应用遮罩
              const content = card.content || '';
              maskIntegration.applyMasksInContainer(containerElement, content);
              return; // 成功应用，退出
            }
            
            // 等待一段时间后再试
            await new Promise(resolve => setTimeout(resolve, waitInterval));
            attempts++;
          }
          
          console.warn('[PreviewContainer] ⚠️ 等待超时，未找到图片元素');
          
        } catch (error) {
          console.error('[PreviewContainer] 应用图片遮罩失败:', error);
        }
      });
    }
  });
  
  // 🖼️ 监听显示答案状态，揭示遮罩
  $effect(() => {
    if (showAnswer && containerElement && maskIntegration) {
      // 延迟一帧，确保状态更新后再揭示遮罩
      tick().then(() => {
        try {
          maskIntegration.revealAllMasks(containerElement, 300);
        } catch (error) {
          console.error('[PreviewContainer] 揭示遮罩失败:', error);
        }
      });
    } else if (!showAnswer && containerElement && maskIntegration) {
      // 隐藏答案时，重新显示遮罩
      tick().then(() => {
        try {
          maskIntegration.showAllMasks(containerElement, false);
        } catch (error) {
          console.error('[PreviewContainer] 显示遮罩失败:', error);
        }
      });
    }
  });

  /**
   * 解析卡片内容生成预览数据
   */
  async function renderPreview(): Promise<void> {
    if (!card || !previewEngine) {
      return;
    }

    isLoading = true;
    error = null;

    try {
      console.log(`[PreviewContainer] 开始解析卡片: ${card.id}`);

      // 1. 解析卡片内容生成预览数据
      const previewData = await previewEngine.parseCardContent(card, template);
      currentPreviewData = previewData;

      // 2. 如果是选择题，解析选择题数据
      if (previewData.cardType === UnifiedCardType.SINGLE_CHOICE || 
          previewData.cardType === UnifiedCardType.MULTIPLE_CHOICE) {
        const cardContent = getCardContentForChoice(card);
        const parsedChoice = parseChoiceQuestion(cardContent);
        
        if (parsedChoice) {
          choiceQuestionData = parsedChoice;
          // 重置用户选择
          selectedOptions = [];
          console.log('[PreviewContainer] 选择题数据已解析:', parsedChoice);
        } else {
          console.warn('[PreviewContainer] 选择题解析失败，将降级为基础问答');
          choiceQuestionData = null;
        }
      } else {
        choiceQuestionData = null;
        selectedOptions = [];
      }

      // 3. 通知题型检测结果
      if (onCardTypeDetected) {
        onCardTypeDetected(previewData.cardType);
      }

      // 4. 通知预览就绪
      if (onPreviewReady) {
        onPreviewReady(previewData);
      }

      console.log(`[PreviewContainer] 卡片解析完成: ${card.id}, 题型: ${previewData.cardType}`);

    } catch (err) {
      console.error('[PreviewContainer] 卡片解析失败:', err);
      error = err instanceof Error ? err.message : '未知错误';
    } finally {
      isLoading = false;
    }
  }

  /**
   * 获取卡片内容用于选择题解析
   * ✅ 遵循卡片数据结构规范 v1.0：优先使用 card.content（权威数据源）
   */
  function getCardContentForChoice(card: Card): string {
    // ✅ 步骤1：优先使用 card.content（权威数据源）
    if (card.content && card.content.trim()) {
      return card.content.trim();
    }
    
    // ✅ 步骤2：降级策略 - 从 fields 重建选择题格式
    if (!card.fields) return '';
    
    const options = card.fields.options || card.fields.Options;
    const correctAnswers = card.fields.correctAnswers || card.fields.CorrectAnswers;
    
    if (options && correctAnswers) {
      // 从 fields 重建选择题完整格式
      const front = card.fields.front || card.fields.Front || card.fields.question || '';
      const back = card.fields.back || card.fields.Back || card.fields.answer || '';
      
      let markdown = '';
      
      // 添加问题（确保有 Q: 前缀）
      if (front && !front.trim().startsWith('Q:')) {
        markdown += `Q: ${front}\n\n`;
      } else {
        markdown += `${front}\n\n`;
      }
      
      // 添加选项（已包含正确答案标记）
      markdown += `${options}\n\n`;
      
      // 添加解析（如果有）
      if (back) {
        markdown += `---div---\n\n${back}`;
      }
      
      return markdown.trim();
    }
    
    // ✅ 步骤3：基础降级 - 拼接 front 和 back
    const front = card.fields.front || card.fields.Front || card.fields.question || '';
    const back = card.fields.back || card.fields.Back || card.fields.answer || '';
    
    if (front && back) {
      return `${front}\n\n---div---\n\n${back}`;
    }
    
    return front || back;
  }

  /**
   * 处理选项选择
   */
  function handleOptionSelect(label: string) {
    console.log('[PreviewContainer] 用户选择了选项:', label);
    // 选项状态已通过bind:绑定自动更新
  }

  /**
   * 处理显示答案请求（从选择题组件触发）
   */
  function handleShowAnswer() {
    showAnswer = true;
    console.log('[PreviewContainer] 自动显示答案');
  }

  /**
   * 应用容器样式 - 支持统一题型
   */
  function applyContainerStyles(cardType: UnifiedCardType): void {
    if (!containerElement) return;

    // 移除旧的题型类
    containerElement.classList.remove(
      'tuanki-preview--basic-qa',
      'tuanki-preview--cloze-deletion',
      'tuanki-preview--single-choice',
      'tuanki-preview--multiple-choice',
      'tuanki-preview--fill-in-blank',
      'tuanki-preview--sequence',
      'tuanki-preview--extensible',
      'tuanki-card--basic-qa',
      'tuanki-card--cloze-deletion',
      'tuanki-card--single-choice',
      'tuanki-card--multiple-choice',
      'tuanki-card--fill-in-blank',
      'tuanki-card--sequence',
      'tuanki-card--extensible'
    );

    // 转换为统一题型并添加新的题型类
    let unifiedType: UnifiedCardType;
    switch (cardType) {
      case 'basic-qa':
        unifiedType = UnifiedCardType.BASIC_QA;
        break;
      case 'multiple-choice':
        unifiedType = UnifiedCardType.MULTIPLE_CHOICE;
        break;
      case 'cloze-deletion':
        unifiedType = UnifiedCardType.CLOZE_DELETION;
        break;
      case 'extensible':
        unifiedType = UnifiedCardType.EXTENSIBLE;
        break;
      default:
        unifiedType = UnifiedCardType.BASIC_QA;
    }

    // 添加新的题型类（使用统一命名）
    containerElement.classList.add(`tuanki-preview--${cardType}`);
    containerElement.classList.add(`tuanki-card--${unifiedType}`);

    // 添加动效类
    if (enableAnimations) {
      containerElement.classList.add('tuanki-preview--animated');
    }

    console.log(`[PreviewContainer] 应用样式: ${cardType} -> ${unifiedType}`);
  }

  /**
   * 切换答案显示状态
   */
  function toggleAnswer(): void {
    showAnswer = !showAnswer;
  }

  /**
   * 刷新预览
   */
  function refreshPreview(): void {
    if (previewEngine) {
      previewEngine.clearCache();
    }
    renderPreview();
  }

  /**
   * 获取预览统计信息
   */
  function getPreviewStats(): {
    cacheStats: any;
    cardType: UnifiedCardType | null;
    confidence: number;
    animationStats: any;
  } {
    return {
      cacheStats: previewEngine?.getCacheStats() || null,
      cardType: currentPreviewData?.cardType || null,
      confidence: currentPreviewData?.metadata.confidence || 0,
      animationStats: animationController?.getAnimationStats() || null
    };
  }

  // 导出方法供父组件使用
  export { toggleAnswer, refreshPreview, getPreviewStats };
</script>

<!-- 预览容器 -->
<div 
  class="tuanki-preview-container"
  class:loading={isLoading}
  class:has-error={!!error}
  bind:this={containerElement}
>
  <!-- 🆕 优先级便签纸 - 显示在右上角 -->
  {#if card && card.priority}
    <div class="priority-sticky-note priority-{card.priority}">
      <div class="sticky-number">{card.priority}</div>
      <div class="sticky-label">
        {card.priority === 1 ? '低' : card.priority === 2 ? '中' : card.priority === 3 ? '高' : '紧急'}
      </div>
    </div>
  {/if}

  {#if isLoading}
    <div class="tuanki-preview-loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在生成预览...</div>
    </div>
  {:else if error}
    <div class="tuanki-preview-error">
      <div class="error-icon">⚠️</div>
      <div class="error-title">预览渲染失败</div>
      <div class="error-message">{error}</div>
    </div>
  {:else if !card}
    <div class="tuanki-preview-empty">
      <div class="empty-icon">📝</div>
      <div class="empty-title">没有可显示的卡片</div>
      <div class="empty-description">请选择一张卡片开始学习</div>
    </div>
  {:else if currentPreviewData}
    <!-- 根据题型渲染对应组件 -->
    {@const cardType = currentPreviewData.cardType}
    {#if cardType === UnifiedCardType.SINGLE_CHOICE || cardType === UnifiedCardType.MULTIPLE_CHOICE}
      <!-- 新的选择题渲染系统 -->
      {#if choiceQuestionData}
        <ChoiceQuestionPreview 
          question={choiceQuestionData}
          {showAnswer}
          onOptionSelect={handleOptionSelect}
          onShowAnswer={handleShowAnswer}
          bind:selectedOptions
          {plugin}
          {enableAnimations}
          {card}
          {onAddToErrorBook}
          {onRemoveFromErrorBook}
          {currentResponseTime}
        />
      {:else}
        <!-- 选择题解析失败，降级为基础问答 -->
        <BasicQACard 
          sections={currentPreviewData.sections}
          {showAnswer}
          {plugin}
          sourcePath={(currentPreviewData.metadata as any).sourcePath || ''}
          {animationController}
          {enableAnimations}
        />
      {/if}
    {:else if cardType === UnifiedCardType.BASIC_QA || (cardType as string) === 'basic-qa'}
      <BasicQACard 
        sections={currentPreviewData.sections}
        {showAnswer}
        {plugin}
        sourcePath={(currentPreviewData.metadata as any).sourcePath || ''}
        {animationController}
        {enableAnimations}
      />
    {:else if cardType === UnifiedCardType.CLOZE_DELETION || (cardType as string) === 'cloze-deletion'}
      <ClozeCard 
        sections={currentPreviewData.sections}
        {showAnswer}
        {plugin}
        sourcePath={(currentPreviewData.metadata as any).sourcePath || ''}
        {animationController}
        {enableAnimations}
      />
    {:else if (cardType as string) === 'multiple-choice'}
      <!-- 保留旧的MultipleChoiceCard组件以兼容性 -->
      <MultipleChoiceCard 
        previewData={currentPreviewData}
        {plugin}
      />
    {:else}
      <!-- 默认渲染：显示原始内容 -->
      <div class="tuanki-card-base">
        <div class="preview-fallback">
          <div class="fallback-header">
            <span class="tuanki-card-type-badge">未知题型: {currentPreviewData.cardType}</span>
          </div>
          {#each currentPreviewData.sections as section}
            <div class="fallback-section">
              {@html section.content}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tuanki-preview-container {
    width: 100%;
    /* ✅ 移除边框和背景，避免嵌套 */
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    overflow: visible;

    /* ✅ 高度自适应内容 */
    display: flex;
    flex-direction: column;
    flex: 1; /* 填满父容器 */
    min-height: 0; /* 允许收缩 */
    transition: all var(--tuanki-duration-normal, 300ms) ease;
    position: relative; /* 🆕 确保便签纸可以绝对定位 */
  }

  /* 🆕 优先级便签纸样式 */
  .priority-sticky-note {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 75px;
    height: 75px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15);
    transform: rotate(-3deg);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1000; /* 🆕 确保在所有内容之上 */
    cursor: pointer;
    user-select: none;
  }

  .priority-sticky-note:hover {
    transform: rotate(0deg) scale(1.08);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  /* 🆕 胶带效果 */
  .priority-sticky-note::before {
    content: '';
    position: absolute;
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 48px;
    height: 16px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
    backdrop-filter: blur(4px);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .sticky-number {
    font-size: 2rem;
    font-weight: 900;
    line-height: 1;
    margin-bottom: 0.2rem;
  }

  .sticky-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.9;
  }

  /* 🆕 优先级1 - 黄色便签（低优先级）*/
  .priority-1 { 
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e; 
  }
  
  /* 🆕 优先级2 - 蓝色便签（中优先级）*/
  .priority-2 { 
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    color: #1e3a8a; 
  }
  
  /* 🆕 优先级3 - 橙色便签（高优先级）*/
  .priority-3 { 
    background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
    color: #7c2d12; 
  }
  
  /* 🆕 优先级4 - 红色便签（紧急）+ 摇摆动画 */
  .priority-4 { 
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    color: #991b1b;
  }

  /* 🆕 优先级4的摇摆动画 */
  .priority-4 {
    animation: wiggle-sticky 0.8s ease-in-out infinite;
  }

  @keyframes wiggle-sticky {
    0%, 100% { 
      transform: rotate(-3deg); 
    }
    25% { 
      transform: rotate(-5deg); 
    }
    75% { 
      transform: rotate(-1deg); 
    }
  }

  /* 🆕 优先级4悬停时停止动画 */
  .priority-4:hover {
    animation: none;
    transform: rotate(0deg) scale(1.08);
  }

  /* 预览内容区域 - 现代UI设计间距 */
  .tuanki-preview-container :global(.preview-content) {
    padding: var(--tuanki-space-lg, 1.5rem); /* ✅ 恢复内容呼吸空间 */
    margin: 0;
    flex: 1; /* 填满容器 */
    overflow-y: auto; /* ✅ 内容区域自己滚动 */
    overflow-x: hidden;
  }

  /* 确保所有渲染的内容都能正确滚动 */
  .tuanki-preview-container :global(*) {
    /* 确保内容不会溢出 */
    max-width: 100%;
    word-wrap: break-word;
  }
  
  /* 支持文本选择 */
  .tuanki-preview-container {
    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
  }
  
  .tuanki-preview-container :global(.tuanki-card-base) {
    user-select: text;
    -webkit-user-select: text;
  }

  /* 特殊处理markdown渲染内容 */
  .tuanki-preview-container :global(.markdown-preview-view),
  .tuanki-preview-container :global(.markdown-rendered),
  .tuanki-preview-container :global(.cm-editor) {
    height: auto !important;
    overflow: visible; /* ✅ 移除!important，避免溢出 */
  }

  .tuanki-preview-container.loading {
    pointer-events: none;
  }

  /* 加载状态 */
  .tuanki-preview-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    gap: 1rem;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--tuanki-border, var(--background-modifier-border));
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    color: var(--tuanki-text-secondary, var(--text-muted));
    font-size: 0.875rem;
  }

  /* 空状态 */
  .tuanki-preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    gap: 0.75rem;
  }

  .empty-icon {
    font-size: 2.5rem;
    opacity: 0.6;
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--tuanki-text-primary, var(--text-normal));
  }

  .empty-description {
    font-size: 0.875rem;
    color: var(--tuanki-text-secondary, var(--text-muted));
  }

  /* 错误状态样式 */
  :global(.tuanki-preview-error) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    gap: 1rem;
  }

  :global(.tuanki-preview-error .error-icon) {
    font-size: 2rem;
    color: var(--tuanki-error, #ef4444);
  }

  :global(.tuanki-preview-error .error-title) {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--tuanki-error, #ef4444);
  }

  :global(.tuanki-preview-error .error-message) {
    font-size: 0.875rem;
    color: var(--tuanki-text-secondary, var(--text-muted));
    max-width: 300px;
  }

  :global(.tuanki-preview-error .error-retry) {
    padding: 0.5rem 1rem;
    background: var(--tuanki-error, #ef4444);
    color: white;
    border: none;
    border-radius: var(--tuanki-radius-md, 0.5rem);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  :global(.tuanki-preview-error .error-retry:hover) {
    background: color-mix(in srgb, var(--tuanki-error, #ef4444) 90%, black);
  }

  /* 动画 */
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes tuanki-fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-preview-container {
      border-radius: var(--tuanki-radius-md, 0.5rem);
    }

    .tuanki-preview-empty,
    .tuanki-preview-loading {
      padding: 2rem 1rem;
    }

    .empty-icon {
      font-size: 2rem;
    }

    .empty-title {
      font-size: 1rem;
    }

    .empty-description {
      font-size: 0.8rem;
    }

    /* 🆕 移动端便签纸缩小 */
    .priority-sticky-note {
      width: 60px;
      height: 60px;
      top: 12px;
      right: 12px;
    }

    .sticky-number {
      font-size: 1.5rem;
    }

    .sticky-label {
      font-size: 0.6rem;
    }

    .priority-sticky-note::before {
      width: 40px;
      height: 14px;
      top: -6px;
    }
  }

  /* 🆕 超小屏幕进一步缩小 */
  @media (max-width: 480px) {
    .priority-sticky-note {
      width: 50px;
      height: 50px;
      top: 8px;
      right: 8px;
    }

    .sticky-number {
      font-size: 1.2rem;
    }

    .sticky-label {
      font-size: 0.55rem;
    }

    .priority-sticky-note::before {
      width: 32px;
      height: 12px;
      top: -5px;
    }
  }
</style>
