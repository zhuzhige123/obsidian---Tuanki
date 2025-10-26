<script lang="ts">
  import type { FormatPreviewResult } from '../../types/ai-types';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  
  interface Props {
    show: boolean;
    previewResult: FormatPreviewResult;
    actionName: string;
    onConfirm: () => void;
    onCancel: () => void;
  }
  
  let { show, previewResult, actionName, onConfirm, onCancel }: Props = $props();
</script>

{#if show}
  <div class="modal-overlay" onclick={onCancel} role="presentation">
    <div class="preview-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>AI格式化预览 - {actionName}</h3>
        <button class="close-btn" onclick={onCancel} aria-label="关闭">×</button>
      </div>
      
      <div class="modal-body">
        <div class="comparison-container">
          <!-- 原始内容 -->
          <div class="content-panel original">
            <div class="panel-header">
              <EnhancedIcon name="file" size="14" />
              <span>原始内容</span>
            </div>
            <div class="content-preview">
              {previewResult.originalContent}
            </div>
          </div>
          
          <!-- 箭头指示 -->
          <div class="arrow-indicator">
            <EnhancedIcon name="chevronRight" size="24" />
          </div>
          
          <!-- 格式化后内容 -->
          <div class="content-panel formatted">
            <div class="panel-header">
              <EnhancedIcon name="wand" size="14" />
              <span>格式化后</span>
              {#if previewResult.provider}
                <span class="provider-badge">{previewResult.provider}</span>
              {/if}
            </div>
            <div class="content-preview">
              {previewResult.formattedContent || ''}
            </div>
          </div>
        </div>
        
        {#if !previewResult.success}
          <div class="error-message">
            <EnhancedIcon name="alertCircle" size="16" />
            <span>{previewResult.error}</span>
          </div>
        {/if}
      </div>
      
      <div class="modal-footer">
        <EnhancedButton variant="secondary" onclick={onCancel}>
          取消
        </EnhancedButton>
        <EnhancedButton 
          variant="primary" 
          onclick={onConfirm}
          disabled={!previewResult.success}
        >
          应用更改
        </EnhancedButton>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000000;
    backdrop-filter: blur(4px);
  }
  
  .preview-modal {
    background: var(--background-primary);
    border-radius: 12px;
    width: 90vw;
    max-width: 1000px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--background-modifier-border);
  }
  
  .modal-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--background-secondary);
    border-radius: 12px 12px 0 0;
  }
  
  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  
  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }
  
  .comparison-container {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 1rem;
    align-items: start;
  }
  
  .content-panel {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }
  
  .panel-header {
    padding: 0.75rem 1rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-normal);
  }
  
  .provider-badge {
    margin-left: auto;
    padding: 0.125rem 0.5rem;
    background: var(--text-accent);
    color: var(--text-on-accent);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  
  .content-preview {
    padding: 1rem;
    min-height: 200px;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-text);
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-normal);
  }
  
  .formatted .content-preview {
    background: color-mix(in srgb, var(--text-success) 5%, var(--background-primary));
  }
  
  .arrow-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-accent);
    padding-top: 100px;
  }
  
  .error-message {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--text-error) 10%, transparent);
    border: 1px solid var(--text-error);
    border-radius: 6px;
    color: var(--text-error);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  
  .modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    background: var(--background-secondary);
    border-radius: 0 0 12px 12px;
  }
  
  @media (max-width: 768px) {
    .comparison-container {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
    }
    
    .arrow-indicator {
      transform: rotate(90deg);
      padding: 0;
    }
    
    .preview-modal {
      width: 95vw;
      max-height: 90vh;
    }
  }
</style>

