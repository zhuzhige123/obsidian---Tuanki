<script lang="ts">
  /**
   * 标注快同步设置组件
   * 包含Tuanki标注功能的所有设置选项
   */
  
  import type { PluginExtended } from "../types/settings-types";
  import { showNotification } from "../utils/settings-utils";
  import { TuankiAnnotationSystem } from "../../../services/TuankiAnnotationSystem";
  import AnnotationStatusPanel from "../../annotation/AnnotationStatusPanel.svelte";
  
  // 🔒 高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES, FEATURE_METADATA } from "../../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../../premium/ActivationPrompt.svelte";
  import PremiumBadge from "../../premium/PremiumBadge.svelte";

  interface Props {
    plugin: PluginExtended;
  }

  let { plugin }: Props = $props();

  // 🔒 高级功能守卫
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(false);
  let showActivationPrompt = $state(false);

  // 订阅高级版状态
  $effect(() => {
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    return unsubscribe;
  });

  // 防抖动保存函数
  let saveTimeout: NodeJS.Timeout | null = null;

  async function save() {
    // 清除之前的定时器
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // 设置新的防抖动定时器
    saveTimeout = setTimeout(async () => {
      try {
        await plugin.saveSettings();
        showNotification({
          message: '设置已保存',
          type: 'success'
        });
      } catch (error) {
        console.error('保存设置失败:', error);
        showNotification({
          message: '设置保存失败，请重试',
          type: 'error'
        });
      }
    }, 300);
  }

  // 标注功能配置处理函数
  function handleAnnotationAutoDetectionToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!plugin.settings.annotation) {
      plugin.settings.annotation = {
        autoDetectionEnabled: true,
        detectionInterval: 1000,
        autoCreateDecks: true,
        defaultDeckId: '',
        defaultTemplateId: '',
        showNotifications: true,
        maxConcurrentTasks: 3,
        debounceDelay: 1000,
        debugMode: false
      };
    }
    plugin.settings.annotation.autoDetectionEnabled = target.checked;
    save();
  }

  function handleAnnotationAutoCreateDecksToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!plugin.settings.annotation) return;
    plugin.settings.annotation.autoCreateDecks = target.checked;
    save();
  }

  function handleAnnotationDebounceDelayChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value);
    if (!isNaN(value) && value >= 100 && plugin.settings.annotation) {
      plugin.settings.annotation.debounceDelay = value;
      save();
    }
  }

  function handleAnnotationMaxConcurrentTasksChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value);
    if (!isNaN(value) && value > 0 && value <= 10 && plugin.settings.annotation) {
      plugin.settings.annotation.maxConcurrentTasks = value;
      save();
    }
  }

  // 处理双向同步开关
  function handleAnnotationBidirectionalSyncToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (plugin.settings.annotation) {
      plugin.settings.annotation.bidirectionalSyncEnabled = checked;
      save();
      showNotification({ message: `双向同步已${checked ? '开启' : '关闭'}` });
    }
  }

  // 处理仅同步活动文件开关
  function handleAnnotationOnlyActiveFileToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (plugin.settings.annotation) {
      // @ts-ignore - onlyActiveFileAutoSync will be added to AnnotationSettings type definition
      (plugin.settings.annotation as any).onlyActiveFileAutoSync = checked;
      save();
      showNotification({ message: `仅同步活动文件已${checked ? '开启' : '关闭'}` });
    }
  }
  
  // 获取仅同步活动文件的值
  function getOnlyActiveFileAutoSync(): boolean {
    // @ts-ignore - onlyActiveFileAutoSync will be added to AnnotationSettings type definition
    return (plugin.settings.annotation as any)?.onlyActiveFileAutoSync ?? true;
  }

</script>

{#if !isPremium}
  <!-- 🔒 未激活提示 -->
  <section class="settings-group">
    <div class="premium-locked-section">
      <div class="premium-locked-header">
        <span class="feature-icon">✍️</span>
        <h2>Tuanki 标注系统</h2>
        <PremiumBadge variant="lock" size="medium" />
      </div>
      <p class="premium-desc">基于文档标注快速创建卡片，提高制卡效率</p>
      <p class="premium-hint">此功能需要激活许可证后使用</p>
      <div class="premium-features-list">
        <h3>激活后您将获得：</h3>
        <ul>
          <li>📝 文档内标注制卡</li>
          <li>🎯 智能批量生成卡片</li>
          <li>⚡ 自动检测标注内容</li>
          <li>🔄 自动同步到牌组</li>
          <li>⚙️ 灵活的配置选项</li>
        </ul>
      </div>
      <button 
        class="activate-button-large" 
        onclick={() => showActivationPrompt = true}
      >
        前往激活
      </button>
    </div>
  </section>
  
  <!-- 激活提示弹窗 -->
  <ActivationPrompt
    featureId={PREMIUM_FEATURES.ANNOTATION_SYSTEM}
    visible={showActivationPrompt}
    onClose={() => showActivationPrompt = false}
  />
{:else}
  <!-- 标注同步块 -->
  <div class="tuanki-settings settings-section annotation-settings">
    <div class="settings-group">
      <h4 class="group-title with-accent-bar accent-purple">
        Tuanki标注功能
      </h4>

      <!-- 标注状态面板 - 始终显示 -->
      <AnnotationStatusPanel {plugin} isVisible={true} />

      <!-- 自动检测设置 -->
      <div class="setting-item">
        <div class="setting-info">
          <label class="setting-label" for="annotationAutoDetection">启用自动检测</label>
          <div class="setting-description">实时监听文档变更，自动检测新的标注</div>
        </div>
        <div class="setting-control">
          <label class="toggle-switch">
            <input
              id="annotationAutoDetection"
              type="checkbox"
              checked={plugin.settings.annotation?.autoDetectionEnabled ?? true}
              onchange={handleAnnotationAutoDetectionToggle}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 自动创建牌组 -->
      <div class="setting-item">
        <div class="setting-info">
          <label class="setting-label" for="annotationAutoCreateDecks">自动创建牌组</label>
          <div class="setting-description">当指定的牌组不存在时，自动创建新牌组</div>
        </div>
        <div class="setting-control">
          <label class="toggle-switch">
            <input
              id="annotationAutoCreateDecks"
              type="checkbox"
              checked={plugin.settings.annotation?.autoCreateDecks ?? true}
              onchange={handleAnnotationAutoCreateDecksToggle}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 防抖延迟 -->
      <div class="setting-item">
        <div class="setting-info">
          <label class="setting-label" for="annotationDebounceDelay">检测延迟 (毫秒)</label>
          <div class="setting-description">文档变更后等待多长时间开始检测，避免频繁触发</div>
        </div>
        <div class="setting-control">
          <input
            id="annotationDebounceDelay"
            type="number"
            class="number-input"
            value={plugin.settings.annotation?.debounceDelay ?? 1000}
            oninput={handleAnnotationDebounceDelayChange}
            min="100"
            max="5000"
            step="100"
          />
        </div>
      </div>

      <!-- 最大并发任务数 -->
      <div class="setting-item">
        <div class="setting-info">
          <label class="setting-label" for="annotationMaxConcurrentTasks">最大并发处理数</label>
          <div class="setting-description">同时处理的标注任务数量，影响处理速度和系统负载</div>
        </div>
        <div class="setting-control">
          <input
            id="annotationMaxConcurrentTasks"
            type="number"
            class="number-input"
            value={plugin.settings.annotation?.maxConcurrentTasks ?? 3}
            oninput={handleAnnotationMaxConcurrentTasksChange}
            min="1"
            max="10"
          />
        </div>
      </div>

      <!-- 🆕 双向同步设置 -->
      <div class="setting-item">
        <div class="setting-info">
          <label class="setting-label" for="annotationBidirectionalSync">启用双向同步</label>
          <div class="setting-description">标注块与卡片内容自动双向同步（建议开启）</div>
        </div>
        <div class="setting-control">
          <label class="toggle-switch">
            <input
              id="annotationBidirectionalSync"
              type="checkbox"
              checked={plugin.settings.annotation?.bidirectionalSyncEnabled ?? true}
              onchange={handleAnnotationBidirectionalSyncToggle}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 🆕 仅同步活动文件设置 -->
      <div class="setting-item">
        <div class="setting-info">
          <label class="setting-label" for="annotationOnlyActiveFile">仅同步当前活动文件</label>
          <div class="setting-description">只对当前正在编辑的文档执行自动同步，避免后台文件干扰（建议开启）</div>
        </div>
        <div class="setting-control">
          <label class="toggle-switch">
            <input
              id="annotationOnlyActiveFile"
              type="checkbox"
              checked={getOnlyActiveFileAutoSync()}
              onchange={handleAnnotationOnlyActiveFileToggle}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* 设置项样式 - 参考性能优化界面 */
  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .setting-item:last-child {
    border-bottom: none;
  }

  .setting-info {
    flex: 1;
  }

  .setting-label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .setting-description {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .setting-control {
    flex-shrink: 0;
  }

  /* Number Input */
  .number-input {
    width: 80px;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    text-align: center;
    transition: all 0.2s;
  }

  .number-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .number-input:hover {
    border-color: var(--text-muted);
  }

  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    cursor: pointer;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--background-modifier-border);
    border-radius: 24px;
    transition: all 0.2s;
  }

  .toggle-slider::before {
    content: '';
    position: absolute;
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .toggle-switch input:checked + .toggle-slider {
    background: var(--interactive-accent);
  }

  .toggle-switch input:checked + .toggle-slider::before {
    transform: translateX(20px);
  }

  .toggle-switch input:disabled + .toggle-slider {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .setting-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .setting-control {
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
  }

  /* 🔒 高级功能锁定样式 */
  .premium-locked-section {
    padding: 40px 30px;
    text-align: center;
  }

  .premium-locked-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .premium-locked-header .feature-icon {
    font-size: 32px;
  }

  .premium-locked-header h2 {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    color: var(--text-normal);
  }

  .premium-desc {
    font-size: 15px;
    color: var(--text-muted);
    margin: 0 0 8px 0;
  }

  .premium-hint {
    font-size: 13px;
    color: var(--text-warning);
    margin: 0 0 24px 0;
    font-weight: 500;
  }

  .premium-features-list {
    text-align: left;
    margin: 0 auto 24px auto;
    max-width: 400px;
    padding: 20px;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
  }

  .premium-features-list h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: var(--text-normal);
  }

  .premium-features-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .premium-features-list li {
    padding: 6px 0;
    font-size: 13px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .activate-button-large {
    padding: 12px 32px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: var(--shadow-s);
  }

  .activate-button-large:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-l);
  }

  .activate-button-large:active {
    transform: translateY(0);
  }
</style>
