<script lang="ts">
  /**
   * 快捷键录制对话框组件
   * 用于捕获用户按下的键盘组合键
   */
  
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  
  interface Shortcut {
    key: string;
    modifiers: string[];
  }
  
  interface Props {
    visible: boolean;
    providerName: string;
    currentShortcut?: Shortcut | null;
    onSave: (shortcut: Shortcut) => void;
    onCancel: () => void;
  }
  
  let { 
    visible = $bindable(),
    providerName, 
    currentShortcut = null,
    onSave, 
    onCancel 
  }: Props = $props();
  
  // 录制状态
  let isRecording = $state(false);
  let recordedShortcut = $state<Shortcut | null>(null);
  let conflictWarning = $state<string | null>(null);
  
  // 开始录制
  function startRecording() {
    isRecording = true;
    recordedShortcut = null;
    conflictWarning = null;
  }
  
  // 处理键盘事件
  function handleKeyDown(event: KeyboardEvent) {
    if (!isRecording) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // 忽略单独的修饰键
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      return;
    }
    
    // 收集修饰键
    const modifiers: string[] = [];
    if (event.ctrlKey || event.metaKey) modifiers.push('Mod'); // Mod = Ctrl on Win/Linux, Cmd on Mac
    if (event.shiftKey) modifiers.push('Shift');
    if (event.altKey) modifiers.push('Alt');
    
    // 至少需要一个修饰键
    if (modifiers.length === 0) {
      conflictWarning = '快捷键必须包含至少一个修饰键（Ctrl/Cmd/Shift/Alt）';
      return;
    }
    
    // 记录按键
    const key = event.key.toUpperCase();
    recordedShortcut = { key, modifiers };
    isRecording = false;
    
    // 检查冲突（简化版）
    checkConflict({ key, modifiers });
  }
  
  // 检查快捷键冲突
  function checkConflict(shortcut: Shortcut) {
    // 这里可以添加更复杂的冲突检测逻辑
    // 当前仅做示例提示
    const commonShortcuts = [
      { key: 'C', modifiers: ['Mod'], name: '复制' },
      { key: 'V', modifiers: ['Mod'], name: '粘贴' },
      { key: 'X', modifiers: ['Mod'], name: '剪切' },
      { key: 'Z', modifiers: ['Mod'], name: '撤销' },
      { key: 'S', modifiers: ['Mod'], name: '保存' },
    ];
    
    const conflict = commonShortcuts.find(
      cs => cs.key === shortcut.key && 
            cs.modifiers.length === shortcut.modifiers.length &&
            cs.modifiers.every(m => shortcut.modifiers.includes(m))
    );
    
    if (conflict) {
      conflictWarning = `该快捷键与系统"${conflict.name}"功能冲突，可能无法正常工作`;
    } else {
      conflictWarning = null;
    }
  }
  
  // 清除快捷键
  function clearShortcut() {
    recordedShortcut = null;
    conflictWarning = null;
  }
  
  // 保存快捷键
  function handleSave() {
    if (recordedShortcut) {
      onSave(recordedShortcut);
      visible = false;
    }
  }
  
  // 取消设置
  function handleCancel() {
    recordedShortcut = null;
    conflictWarning = null;
    isRecording = false;
    onCancel();
    visible = false;
  }
  
  // 格式化显示快捷键
  function formatShortcut(shortcut: Shortcut | null): string {
    if (!shortcut) return '未设置';
    return [...shortcut.modifiers, shortcut.key].join(' + ');
  }
  
  // 初始化时加载当前快捷键
  $effect(() => {
    if (visible && currentShortcut) {
      recordedShortcut = currentShortcut;
    }
  });
</script>

{#if visible}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div 
      class="shortcut-recorder-modal"
      onkeydown={handleKeyDown}
      tabindex="-1"
    >
      <div class="modal-header">
        <h3>设置快捷键 - {providerName}</h3>
        <button class="btn-close" onclick={handleCancel} aria-label="关闭">
          <EnhancedIcon name="x" size={16} />
        </button>
      </div>
      
      <div class="modal-body">
        <p class="instruction">
          点击下方按钮开始录制，然后按下您想要的快捷键组合
        </p>
        
        <!-- 录制区域 -->
        <div class="recording-area">
          {#if isRecording}
            <div class="recording-indicator">
              <div class="pulse-dot"></div>
              <span>等待按键...</span>
            </div>
          {:else}
            <button class="btn-record" onclick={startRecording}>
              <EnhancedIcon name="keyboard" size={20} />
              <span>开始录制快捷键</span>
            </button>
          {/if}
        </div>
        
        <!-- 快捷键显示 -->
        {#if recordedShortcut}
          <div class="shortcut-display">
            <div class="shortcut-keys">
              {#each recordedShortcut.modifiers as modifier}
                <kbd class="key-badge">{modifier}</kbd>
                <span class="key-separator">+</span>
              {/each}
              <kbd class="key-badge key-main">{recordedShortcut.key}</kbd>
            </div>
            <button class="btn-clear" onclick={clearShortcut} title="清除">
              <EnhancedIcon name="x" size={14} />
            </button>
          </div>
        {/if}
        
        <!-- 冲突警告 -->
        {#if conflictWarning}
          <div class="warning-message">
            <EnhancedIcon name="alert-triangle" size={16} />
            <span>{conflictWarning}</span>
          </div>
        {/if}
        
        <!-- 提示信息 -->
        <div class="info-box">
          <EnhancedIcon name="info" size={14} />
          <div class="info-content">
            <strong>提示：</strong>
            <ul>
              <li>快捷键必须包含修饰键（Ctrl/Cmd、Shift、Alt）</li>
              <li>建议使用 Ctrl+Shift+数字 或 Ctrl+Alt+字母</li>
              <li>避免与系统和Obsidian内置快捷键冲突</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn-secondary" onclick={handleCancel}>
          取消
        </button>
        <button 
          class="btn-primary" 
          onclick={handleSave}
          disabled={!recordedShortcut}
        >
          保存快捷键
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  
  .shortcut-recorder-modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: var(--shadow-s);
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    animation: modalSlideIn 0.2s ease-out;
  }
  
  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .btn-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }
  
  .btn-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  
  .instruction {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }
  
  .recording-area {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 120px;
    background: var(--background-secondary);
    border: 2px dashed var(--background-modifier-border);
    border-radius: 8px;
  }
  
  .btn-record {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 1.5rem 2rem;
    border: none;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }
  
  .btn-record:hover {
    background: var(--interactive-accent-hover);
    transform: translateY(-2px);
  }
  
  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text-accent);
    font-weight: 500;
  }
  
  .pulse-dot {
    width: 12px;
    height: 12px;
    background: var(--text-accent);
    border-radius: 50%;
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }
  
  .shortcut-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
  }
  
  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .key-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    font-family: var(--font-monospace);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  
  .key-main {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  .key-separator {
    color: var(--text-muted);
    font-weight: 600;
  }
  
  .btn-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }
  
  .btn-clear:hover {
    background: var(--background-modifier-error);
    color: var(--text-error);
  }
  
  .warning-message {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 0.75rem;
    background: rgba(var(--color-yellow-rgb), 0.1);
    border: 1px solid rgba(var(--color-yellow-rgb), 0.3);
    border-radius: 6px;
    color: var(--text-warning);
    font-size: 0.875rem;
  }
  
  .info-box {
    display: flex;
    gap: 8px;
    padding: 0.75rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  
  .info-content {
    flex: 1;
  }
  
  .info-content strong {
    color: var(--text-normal);
  }
  
  .info-content ul {
    margin: 0.5rem 0 0 0;
    padding-left: 1.25rem;
    line-height: 1.6;
  }
  
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .btn-secondary,
  .btn-primary {
    padding: 0.5rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .btn-secondary {
    background: var(--background-modifier-border);
    color: var(--text-normal);
  }
  
  .btn-secondary:hover {
    background: var(--background-modifier-border-hover);
  }
  
  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

