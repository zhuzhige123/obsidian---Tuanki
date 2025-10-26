<!--
  内容恢复面板组件
  提供从原始内容恢复的用户界面
-->

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DataProtectionService, DataSnapshot, RecoveryOption } from '../services/data-protection-service';
  import type { GracefulDegradationManager, GracefulDegradationReport } from '../utils/graceful-degradation-manager';

  // Props
  export let cardId: string;
  export let currentFields: Record<string, string>;
  export let protectionService: DataProtectionService;
  export let degradationManager: GracefulDegradationManager;
  export let visible: boolean = false;

  // State
  let recoveryOptions: RecoveryOption[] = $state([]);
  let selectedOption: RecoveryOption | null = $state(null);
  let isRecovering: boolean = $state(false);
  let recoveryResult: any = $state(null);
  let showAdvancedOptions: boolean = $state(false);
  let snapshots: DataSnapshot[] = $state([]);

  // Event dispatcher
  const dispatch = createEventDispatcher<{
    recover: { fields: Record<string, string>; method: string };
    close: void;
    error: { message: string };
  }>();

  // Reactive updates
  $effect(() => {
    if (visible && cardId) {
      loadRecoveryOptions();
      loadSnapshots();
    }
  });

  /**
   * 加载恢复选项
   */
  async function loadRecoveryOptions() {
    try {
      console.log(`🔄 [ContentRecovery] 加载恢复选项: ${cardId}`);
      
      // 验证数据完整性
      const integrityReport = protectionService.validateDataIntegrity(cardId, currentFields);
      recoveryOptions = integrityReport.recoveryOptions;

      console.log(`✅ [ContentRecovery] 找到${recoveryOptions.length}个恢复选项`);
    } catch (error) {
      console.error('❌ [ContentRecovery] 加载恢复选项失败:', error);
      dispatch('error', { message: `加载恢复选项失败: ${error}` });
    }
  }

  /**
   * 加载快照列表
   */
  function loadSnapshots() {
    try {
      snapshots = protectionService.getSnapshots(cardId);
      console.log(`📸 [ContentRecovery] 加载了${snapshots.length}个快照`);
    } catch (error) {
      console.error('❌ [ContentRecovery] 加载快照失败:', error);
    }
  }

  /**
   * 执行恢复操作
   */
  async function executeRecovery(option: RecoveryOption) {
    if (isRecovering) return;

    isRecovering = true;
    recoveryResult = null;

    try {
      console.log(`🔄 [ContentRecovery] 执行恢复: ${option.type}`);

      let result;
      
      switch (option.type) {
        case 'restore_from_notes':
          result = protectionService.recoverFromNotes(cardId, currentFields);
          break;
          
        case 'restore_from_backup':
          const snapshotId = option.id.replace('recover_from_backup_', '');
          result = protectionService.recoverFromBackup(cardId, snapshotId);
          break;
          
        case 'merge_content':
          result = await performMergeRecovery(option);
          break;
          
        case 'manual_recovery':
          result = await performManualRecovery(option);
          break;
          
        default:
          throw new Error(`不支持的恢复类型: ${option.type}`);
      }

      if (result.success) {
        recoveryResult = result;
        console.log(`✅ [ContentRecovery] 恢复成功: ${option.type}`);
        
        // 触发恢复事件
        dispatch('recover', {
          fields: result.recoveredFields || result.fields,
          method: option.type
        });
      } else {
        throw new Error(result.warnings?.join(', ') || '恢复失败');
      }
    } catch (error) {
      console.error('❌ [ContentRecovery] 恢复失败:', error);
      dispatch('error', { message: `恢复失败: ${error}` });
    } finally {
      isRecovering = false;
    }
  }

  /**
   * 执行合并恢复
   */
  async function performMergeRecovery(option: RecoveryOption) {
    // 合并当前字段和原始内容
    const mergedFields = { ...currentFields };
    
    if (currentFields.notes && currentFields.notes.trim()) {
      const lines = currentFields.notes.split('\n').filter(line => line.trim());
      if (lines.length > 0 && !mergedFields.question) {
        mergedFields.question = lines[0];
      }
      if (lines.length > 1 && !mergedFields.answer) {
        mergedFields.answer = lines.slice(1).join('\n');
      }
    }

    return {
      success: true,
      recoveredFields: mergedFields,
      method: 'merge_recovery',
      warnings: ['使用了合并恢复策略']
    };
  }

  /**
   * 执行手动恢复
   */
  async function performManualRecovery(option: RecoveryOption) {
    // 提供手动恢复的预设值
    return {
      success: true,
      recoveredFields: {
        ...currentFields,
        question: option.previewData.question,
        answer: option.previewData.answer,
        notes: option.previewData.notes
      },
      method: 'manual_recovery',
      warnings: ['请手动验证恢复的内容']
    };
  }

  /**
   * 快速恢复（从notes字段）
   */
  async function quickRecoverFromNotes() {
    const notesOption = recoveryOptions.find(opt => opt.type === 'restore_from_notes');
    if (notesOption) {
      await executeRecovery(notesOption);
    } else {
      // 直接从notes字段恢复
      const result = protectionService.recoverFromNotes(cardId, currentFields);
      if (result.success) {
        dispatch('recover', {
          fields: result.recoveredFields,
          method: 'quick_notes_recovery'
        });
      } else {
        dispatch('error', { message: '从notes字段恢复失败' });
      }
    }
  }

  /**
   * 关闭面板
   */
  function closePanel() {
    visible = false;
    selectedOption = null;
    recoveryResult = null;
    dispatch('close');
  }

  /**
   * 格式化时间戳
   */
  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN');
  }

  /**
   * 获取置信度颜色
   */
  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  }

  /**
   * 获取恢复类型显示名称
   */
  function getRecoveryTypeName(type: string): string {
    const typeNames = {
      'restore_from_notes': '从原始内容恢复',
      'restore_from_backup': '从备份恢复',
      'merge_content': '合并内容',
      'manual_recovery': '手动恢复'
    };
    return typeNames[type] || type;
  }
</script>

{#if visible}
  <div class="content-recovery-panel">
    <div class="panel-overlay" on:click={closePanel}></div>
    
    <div class="panel-content">
      <!-- 标题栏 -->
      <div class="panel-header">
        <h3>内容恢复</h3>
        <button class="close-button" on:click={closePanel}>
          <span class="close-icon">×</span>
        </button>
      </div>

      <!-- 恢复选项 -->
      <div class="recovery-options">
        {#if recoveryOptions.length > 0}
          <div class="options-header">
            <h4>可用的恢复选项</h4>
            <p class="options-description">选择一个恢复选项来恢复您的内容</p>
          </div>

          <div class="options-list">
            {#each recoveryOptions as option (option.id)}
              <div class="option-item" class:selected={selectedOption?.id === option.id}>
                <div class="option-header">
                  <div class="option-title">
                    <span class="option-name">{getRecoveryTypeName(option.type)}</span>
                    <span class="confidence-badge {getConfidenceColor(option.confidence)}">
                      {Math.round(option.confidence * 100)}%
                    </span>
                  </div>
                  <div class="option-time">
                    {formatTimestamp(option.timestamp)}
                  </div>
                </div>

                <div class="option-description">
                  {option.description}
                </div>

                <!-- 预览内容 -->
                <div class="option-preview">
                  <div class="preview-field">
                    <label>问题:</label>
                    <div class="preview-content">{option.previewData.question || '(空)'}</div>
                  </div>
                  <div class="preview-field">
                    <label>答案:</label>
                    <div class="preview-content">{option.previewData.answer || '(空)'}</div>
                  </div>
                </div>

                <div class="option-actions">
                  <button 
                    class="select-button"
                    class:selected={selectedOption?.id === option.id}
                    on:click={() => selectedOption = option}
                  >
                    {selectedOption?.id === option.id ? '已选择' : '选择'}
                  </button>
                  
                  <button 
                    class="recover-button"
                    disabled={isRecovering}
                    on:click={() => executeRecovery(option)}
                  >
                    {isRecovering ? '恢复中...' : '立即恢复'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="no-options">
            <div class="no-options-icon">📋</div>
            <h4>没有找到恢复选项</h4>
            <p>系统未检测到可用的恢复选项，但您仍可以尝试快速恢复。</p>
            
            <button class="quick-recover-button" on:click={quickRecoverFromNotes}>
              从原始内容快速恢复
            </button>
          </div>
        {/if}
      </div>

      <!-- 高级选项 -->
      <div class="advanced-section">
        <button 
          class="advanced-toggle"
          on:click={() => showAdvancedOptions = !showAdvancedOptions}
        >
          高级选项 {showAdvancedOptions ? '▼' : '▶'}
        </button>

        {#if showAdvancedOptions}
          <div class="advanced-content">
            <!-- 快照列表 -->
            {#if snapshots.length > 0}
              <div class="snapshots-section">
                <h5>历史快照</h5>
                <div class="snapshots-list">
                  {#each snapshots as snapshot (snapshot.id)}
                    <div class="snapshot-item">
                      <div class="snapshot-info">
                        <div class="snapshot-time">{formatTimestamp(snapshot.timestamp)}</div>
                        <div class="snapshot-meta">
                          方法: {snapshot.metadata.parseMethod} | 
                          置信度: {Math.round(snapshot.metadata.confidence * 100)}% |
                          长度: {snapshot.metadata.contentLength} 字符
                        </div>
                      </div>
                      <button 
                        class="restore-snapshot-button"
                        on:click={() => executeRecovery({
                          id: `recover_from_backup_${snapshot.id}`,
                          type: 'restore_from_backup',
                          description: `从快照恢复 (${formatTimestamp(snapshot.timestamp)})`,
                          confidence: snapshot.metadata.confidence,
                          previewData: {
                            question: snapshot.parsedFields.question || '',
                            answer: snapshot.parsedFields.answer || '',
                            notes: snapshot.originalContent
                          },
                          timestamp: snapshot.timestamp
                        })}
                      >
                        恢复此快照
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- 手动恢复 -->
            <div class="manual-recovery-section">
              <h5>手动恢复</h5>
              <p>如果自动恢复选项都不满意，您可以手动编辑内容。</p>
              <button class="manual-edit-button" on:click={closePanel}>
                手动编辑内容
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- 恢复结果 -->
      {#if recoveryResult}
        <div class="recovery-result">
          <div class="result-header">
            <span class="result-icon">✅</span>
            <h4>恢复成功</h4>
          </div>
          <div class="result-content">
            <p>内容已成功恢复，您可以继续编辑或保存。</p>
            {#if recoveryResult.warnings && recoveryResult.warnings.length > 0}
              <div class="result-warnings">
                <h5>注意事项:</h5>
                <ul>
                  {#each recoveryResult.warnings as warning}
                    <li>{warning}</li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .content-recovery-panel {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panel-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .panel-content {
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    max-width: 800px;
    max-height: 80vh;
    width: 90vw;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .panel-header h3 {
    margin: 0;
    color: var(--text-normal);
    font-size: 18px;
    font-weight: 600;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-muted);
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .recovery-options {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .options-header {
    margin-bottom: 16px;
  }

  .options-header h4 {
    margin: 0 0 4px 0;
    color: var(--text-normal);
    font-size: 16px;
  }

  .options-description {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  .options-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .option-item {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 16px;
    transition: all 0.2s;
  }

  .option-item:hover {
    border-color: var(--interactive-accent);
    background: var(--background-secondary);
  }

  .option-item.selected {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .option-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  .option-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .option-name {
    font-weight: 500;
    color: var(--text-normal);
  }

  .confidence-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--background-modifier-border);
  }

  .option-time {
    font-size: 12px;
    color: var(--text-muted);
  }

  .option-description {
    color: var(--text-muted);
    font-size: 14px;
    margin-bottom: 12px;
  }

  .option-preview {
    background: var(--background-secondary);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .preview-field {
    margin-bottom: 8px;
  }

  .preview-field:last-child {
    margin-bottom: 0;
  }

  .preview-field label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .preview-content {
    font-size: 14px;
    color: var(--text-normal);
    max-height: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .option-actions {
    display: flex;
    gap: 8px;
  }

  .select-button, .recover-button {
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .select-button:hover, .recover-button:hover {
    background: var(--background-modifier-hover);
  }

  .select-button.selected {
    background: var(--interactive-accent);
    color: white;
    border-color: var(--interactive-accent);
  }

  .recover-button {
    background: var(--interactive-accent);
    color: white;
    border-color: var(--interactive-accent);
  }

  .recover-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .no-options {
    text-align: center;
    padding: 40px 20px;
  }

  .no-options-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .no-options h4 {
    margin: 0 0 8px 0;
    color: var(--text-normal);
  }

  .no-options p {
    margin: 0 0 20px 0;
    color: var(--text-muted);
  }

  .quick-recover-button {
    padding: 10px 20px;
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .quick-recover-button:hover {
    background: var(--interactive-accent-hover);
  }

  .advanced-section {
    border-top: 1px solid var(--background-modifier-border);
    padding: 16px 20px;
  }

  .advanced-toggle {
    background: none;
    border: none;
    color: var(--text-normal);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    padding: 4px 0;
  }

  .advanced-content {
    margin-top: 16px;
  }

  .snapshots-section, .manual-recovery-section {
    margin-bottom: 20px;
  }

  .snapshots-section h5, .manual-recovery-section h5 {
    margin: 0 0 8px 0;
    color: var(--text-normal);
    font-size: 14px;
    font-weight: 500;
  }

  .snapshots-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .snapshot-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 12px;
  }

  .snapshot-info {
    flex: 1;
  }

  .snapshot-time {
    font-weight: 500;
    color: var(--text-normal);
  }

  .snapshot-meta {
    color: var(--text-muted);
    margin-top: 2px;
  }

  .restore-snapshot-button {
    padding: 4px 8px;
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .restore-snapshot-button:hover {
    background: var(--interactive-accent-hover);
  }

  .manual-recovery-section p {
    margin: 0 0 12px 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  .manual-edit-button {
    padding: 8px 16px;
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .manual-edit-button:hover {
    background: var(--background-modifier-hover);
  }

  .recovery-result {
    border-top: 1px solid var(--background-modifier-border);
    padding: 16px 20px;
    background: var(--background-secondary);
  }

  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .result-icon {
    font-size: 18px;
  }

  .result-header h4 {
    margin: 0;
    color: var(--text-normal);
    font-size: 16px;
  }

  .result-content p {
    margin: 0 0 12px 0;
    color: var(--text-normal);
  }

  .result-warnings h5 {
    margin: 0 0 4px 0;
    color: var(--text-normal);
    font-size: 14px;
  }

  .result-warnings ul {
    margin: 0;
    padding-left: 20px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .result-warnings li {
    margin-bottom: 2px;
  }

  /* 响应式设计 */
  @media (max-width: 600px) {
    .panel-content {
      width: 95vw;
      max-height: 90vh;
    }

    .option-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .option-actions {
      flex-direction: column;
    }

    .snapshot-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }

  /* 深色模式适配 */
  .theme-dark .confidence-badge.text-green-600 {
    color: #10b981;
  }

  .theme-dark .confidence-badge.text-yellow-600 {
    color: #f59e0b;
  }

  .theme-dark .confidence-badge.text-red-600 {
    color: #ef4444;
  }
</style>
