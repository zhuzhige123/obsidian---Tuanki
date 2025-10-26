<!--
  基础设置组件
  职责：处理基础配置项（默认牌组、通知、主题等）
-->
<script lang="ts">
  import { dispatchUI } from '../../../architecture/unified-state-management';
  import type AnkiPlugin from '../../../main';

  interface Props {
    plugin: AnkiPlugin;
  }

  let { plugin }: Props = $props();
  let settings = $state(plugin.settings);

  // 保存设置的统一方法
  async function saveSettings() {
    try {
      plugin.settings = settings;
      await plugin.saveSettings();
      
      // 更新全局状态
      dispatchUI('ADD_NOTIFICATION', {
        id: `settings-saved-${Date.now()}`,
        type: 'success',
        message: '设置已保存',
        duration: 2000,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('保存设置失败:', error);
      dispatchUI('ADD_NOTIFICATION', {
        id: `settings-error-${Date.now()}`,
        type: 'error',
        message: '保存设置失败',
        duration: 5000,
        timestamp: Date.now()
      });
    }
  }

  // 处理默认牌组变更
  function handleDefaultDeckChange(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    if (value.length > 0) {
      settings.defaultDeck = value;
      saveSettings();
    }
  }

  // 处理通知设置变更
  function handleNotificationChange(event: Event) {
    settings.enableNotifications = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理悬浮按钮设置变更
  function handleFloatingButtonChange(event: Event) {
    const enabled = (event.target as HTMLInputElement).checked;
    settings.showFloatingCreateButton = enabled;
    saveSettings();
    
    // 动态控制悬浮按钮显示
    plugin.toggleFloatingButton(enabled);
  }



  // 处理快捷键设置变更
  function handleShortcutsChange(event: Event) {
    settings.enableShortcuts = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理拖拽调整设置变更
  function handleResizeEnabledChange(event: Event) {
    if (!settings.editorModalSize) {
      settings.editorModalSize = {
        preset: 'large',
        customWidth: 800,
        customHeight: 600,
        rememberLastSize: true,
        enableResize: true
      };
    }
    settings.editorModalSize.enableResize = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理导航可见性变更
  function handleNavigationVisibilityChange(key: string) {
    return (event: Event) => {
      if (!settings.navigationVisibility) {
        settings.navigationVisibility = {};
      }
      (settings.navigationVisibility as any)[key] = (event.target as HTMLInputElement).checked;
      saveSettings();
    };
  }

  // 处理显示设置按钮变更
  function handleShowSettingsButtonChange(event: Event) {
    settings.showSettingsButton = (event.target as HTMLInputElement).checked;
    saveSettings();
  }

  // 处理调试模式变更
  function handleDebugModeChange(event: Event) {
    settings.enableDebugMode = (event.target as HTMLInputElement).checked;
    saveSettings();
    
    // 显示提示
    if (settings.enableDebugMode) {
      dispatchUI('ADD_NOTIFICATION', {
        id: `debug-mode-enabled-${Date.now()}`,
        type: 'info',
        message: '调试模式已启用，控制台将输出详细日志',
        duration: 3000,
        timestamp: Date.now()
      });
    } else {
      dispatchUI('ADD_NOTIFICATION', {
        id: `debug-mode-disabled-${Date.now()}`,
        type: 'info',
        message: '调试模式已关闭',
        duration: 2000,
        timestamp: Date.now()
      });
    }
  }

  // ===== 学习设置相关处理函数 =====
  
  // 处理每日复习数量变更
  function handleReviewsPerDayChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const MAX_REVIEWS_PER_DAY = 200; // 从 LEARNING_CONSTANTS
    if (!isNaN(value) && value >= 1 && value <= MAX_REVIEWS_PER_DAY) {
      settings.reviewsPerDay = value;
      saveSettings();
    }
  }

  // 🆕 处理每日新卡片数量变更
  function handleNewCardsPerDayChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    const MAX_NEW_CARDS_PER_DAY = 100; // 参考Anki
    if (!isNaN(value) && value >= 0 && value <= MAX_NEW_CARDS_PER_DAY) {
      settings.newCardsPerDay = value;
      saveSettings();
    }
  }

  // 处理自动显示答案时间变更
  function handleAutoShowAnswerChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 0 && value <= 10) {
      settings.autoShowAnswerSeconds = value;
      saveSettings();
    }
  }

  // 处理学习步骤变更
  function handleLearningStepsChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const DEFAULT_LEARNING_STEPS = [1, 10]; // 从 LEARNING_CONSTANTS
    const steps = value.split(/\s+/)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n >= 0);
    
    settings.learningSteps = steps.length ? steps : DEFAULT_LEARNING_STEPS;
    saveSettings();
  }

  // 处理毕业间隔变更
  function handleGraduatingIntervalChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 30) {
      settings.graduatingInterval = value;
      saveSettings();
    }
  }

  // 处理数据备份间隔变更
  function handleBackupIntervalChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 168) {
      settings.dataBackupIntervalHours = value;
      saveSettings();
    }
  }

  // 格式化学习步骤显示
  function formatLearningSteps(steps: number[]): string {
    return steps.join(' ');
  }

  // 格式化自动显示答案时间显示
  function formatAutoShowAnswer(seconds: number): string {
    return seconds === 0 ? '手动' : `${seconds}秒`;
  }

</script>

<div class="tuanki-settings settings-section basic-settings">
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-blue">基础设置</h4>
  
    <div class="group-content">
    <!-- 默认牌组 -->
    <div class="row">
      <label for="defaultDeck">默认牌组</label>
      <input
        id="defaultDeck"
        type="text"
        value={settings.defaultDeck}
        placeholder="输入默认牌组名称"
        class="modern-input"
        oninput={handleDefaultDeckChange}
      />
    </div>

    <!-- 启用通知 -->
    <div class="row">
      <label for="enableNotifications">启用通知</label>
      <label class="modern-switch">
        <input
          id="enableNotifications"
          type="checkbox"
          checked={settings.enableNotifications}
          onchange={handleNotificationChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 显示悬浮新建按钮 -->
    <div class="row">
      <label for="showFloatingCreateButton">显示悬浮新建按钮</label>
      <label class="modern-switch">
        <input
          id="showFloatingCreateButton"
          type="checkbox"
          checked={settings.showFloatingCreateButton}
          onchange={handleFloatingButtonChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>



    <!-- 启用键盘快捷键 -->
    <div class="row">
      <div class="row-label-section">
        <label for="enableShortcuts">启用键盘快捷键</label>
        <span class="help-text">学习模式的键盘快捷键（1-4评分，空格显示答案）</span>
      </div>
      <label class="modern-switch">
        <input
          id="enableShortcuts"
          type="checkbox"
          checked={settings.enableShortcuts}
          onchange={handleShortcutsChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <!-- 调试模式 -->
    <div class="row">
      <div class="row-label-section">
        <label for="enableDebugMode">调试模式</label>
        <span class="help-text">启用后将在浏览器控制台输出详细的调试日志信息</span>
      </div>
      <label class="modern-switch">
        <input
          id="enableDebugMode"
          type="checkbox"
          checked={settings.enableDebugMode ?? false}
          onchange={handleDebugModeChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
  </div>

  <!-- 编辑器窗口设置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-cyan">编辑器窗口设置</h4>

    <div class="group-content">
    <!-- 启用拖拽调整 -->
    <div class="row">
      <div class="row-label-section">
        <label for="enable-resize-switch">启用拖拽调整</label>
        <span class="help-text">允许通过拖拽边框调整编辑窗口尺寸</span>
      </div>
      <label class="modern-switch">
        <input
          id="enable-resize-switch"
          type="checkbox"
          checked={settings.editorModalSize?.enableResize ?? true}
          onchange={handleResizeEnabledChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
  </div>

  <!-- 导航项显示 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-purple">导航项显示</h4>
  
    <div class="group-content">
    <div class="row">
      <label for="navDeckStudy">牌组学习</label>
      <label class="modern-switch">
        <input
          id="navDeckStudy"
          type="checkbox"
          checked={settings.navigationVisibility?.deckStudy !== false}
          onchange={handleNavigationVisibilityChange('deckStudy')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navCardManagement">卡片管理</label>
      <label class="modern-switch">
        <input
          id="navCardManagement"
          type="checkbox"
          checked={settings.navigationVisibility?.cardManagement !== false}
          onchange={handleNavigationVisibilityChange('cardManagement')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navAiAssistant">AI助手</label>
      <label class="modern-switch">
        <input
          id="navAiAssistant"
          type="checkbox"
          checked={settings.navigationVisibility?.aiAssistant !== false}
          onchange={handleNavigationVisibilityChange('aiAssistant')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="navStatistics">统计分析</label>
      <label class="modern-switch">
        <input
          id="navStatistics"
          type="checkbox"
          checked={settings.navigationVisibility?.statistics !== false}
          onchange={handleNavigationVisibilityChange('statistics')}
        />
        <span class="switch-slider"></span>
      </label>
    </div>

    <div class="row">
      <label for="showSettingsButton">显示设置按钮</label>
      <label class="modern-switch">
        <input
          id="showSettingsButton"
          type="checkbox"
          checked={settings.showSettingsButton !== false}
          onchange={handleShowSettingsButtonChange}
        />
        <span class="switch-slider"></span>
      </label>
    </div>
  </div>
  </div>

  <!-- 学习设置 -->
  <div class="settings-group">
    <h4 class="group-title with-accent-bar accent-orange">学习设置</h4>
  
    <div class="group-content">
    <!-- 每日复习数量 -->
    <div class="row">
      <label for="reviewsPerDay">每日复习数量</label>
      <div class="slider-container">
        <input
          id="reviewsPerDay"
          type="range"
          min="1"
          max="200"
          step="5"
          value={settings.reviewsPerDay}
          class="modern-slider"
          oninput={handleReviewsPerDayChange}
        />
        <span class="slider-value">{settings.reviewsPerDay}</span>
      </div>
    </div>

    <!-- 🆕 每日新卡片数量 -->
    <div class="row">
      <div class="row-label-section">
        <label for="newCardsPerDay">每日新卡片数量</label>
        <span class="help-text">每天学习的新卡片限额（0表示无限制）</span>
      </div>
      <div class="slider-container">
        <input
          id="newCardsPerDay"
          type="range"
          min="0"
          max="100"
          step="5"
          value={settings.newCardsPerDay || 20}
          class="modern-slider"
          oninput={handleNewCardsPerDayChange}
        />
        <span class="slider-value">{settings.newCardsPerDay || 20}</span>
      </div>
    </div>

    <!-- 自动显示答案 -->
    <div class="row">
      <label for="autoShowAnswer">自动显示答案</label>
      <div class="slider-container">
        <input
          id="autoShowAnswer"
          type="range"
          min="0"
          max="10"
          step="1"
          value={settings.autoShowAnswerSeconds}
          class="modern-slider"
          oninput={handleAutoShowAnswerChange}
        />
        <span class="slider-value">{formatAutoShowAnswer(settings.autoShowAnswerSeconds)}</span>
      </div>
    </div>

    <!-- 学习步骤 -->
    <div class="row">
      <label for="learningSteps">学习步骤（分钟）</label>
      <input
        id="learningSteps"
        type="text"
        placeholder="1 10"
        value={formatLearningSteps(settings.learningSteps)}
        class="modern-input"
        oninput={handleLearningStepsChange}
      />
      <span class="learning-help-text">用空格分隔多个时间间隔</span>
    </div>

    <!-- 毕业间隔 -->
    <div class="row">
      <label for="graduatingInterval">毕业间隔（天）</label>
      <div class="slider-container">
        <input
          id="graduatingInterval"
          type="range"
          min="1"
          max="30"
          step="1"
          value={settings.graduatingInterval}
          class="modern-slider"
          oninput={handleGraduatingIntervalChange}
        />
        <span class="slider-value">{settings.graduatingInterval}天</span>
      </div>
    </div>

    <!-- 数据备份间隔 -->
    <div class="row">
      <label for="backupInterval">数据备份间隔</label>
      <div class="slider-container">
        <input
          id="backupInterval"
          type="range"
          min="1"
          max="168"
          step="1"
          value={settings.dataBackupIntervalHours}
          class="modern-slider"
          oninput={handleBackupIntervalChange}
        />
        <span class="slider-value">{settings.dataBackupIntervalHours}小时</span>
      </div>
    </div>
  </div>
  </div>
</div>

<style>
  /* 支持带帮助文本的行布局 */
  .row-label-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .row-label-section > label {
    color: var(--text-normal);
    font-weight: 500;
    margin: 0;
  }

  .help-text {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.3;
  }

  /* 学习步骤帮助文本 */
  .learning-help-text {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-left: auto;
    max-width: 200px;
    text-align: right;
  }

  @media (max-width: 768px) {
    .learning-help-text {
      margin-left: 0;
      text-align: left;
      max-width: none;
    }
  }
</style>
