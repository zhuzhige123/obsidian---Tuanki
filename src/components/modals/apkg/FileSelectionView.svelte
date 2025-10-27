<!--
  文件选择视图
  APKG 导入流程的第一步
-->
<script lang="ts">
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  
  interface Props {
    onFileSelected: (file: File) => void;
    isProcessing: boolean;
  }
  
  let { onFileSelected, isProcessing }: Props = $props();
  
  let isDragOver = $state(false);
  let fileInput: HTMLInputElement | undefined;
  
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    
    if (file && file.name.toLowerCase().endsWith('.apkg')) {
      onFileSelected(file);
    } else if (file) {
      alert('请选择 .apkg 文件');
    }
  }
  
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
    
    const file = event.dataTransfer?.files[0];
    if (file && file.name.toLowerCase().endsWith('.apkg')) {
      onFileSelected(file);
    } else if (file) {
      alert('请选择 .apkg 文件');
    }
  }
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragOver = true;
  }
  
  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    isDragOver = false;
  }
</script>

<div class="file-selection">
  <div 
    class="dropzone" 
    class:is-dragover={isDragOver}
    class:is-processing={isProcessing}
    onclick={() => !isProcessing && fileInput?.click()}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && !isProcessing && fileInput?.click()}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="button"
    tabindex="0"
  >
    {#if isProcessing}
      <div class="tuanki-spinner" style="width: 48px; height: 48px;"></div>
      <p class="processing-text">正在分析文件...</p>
    {:else}
      <EnhancedIcon name="upload" size={64} />
      <h3 class="dropzone-title">选择或拖拽 APKG 文件</h3>
      <p class="dropzone-hint">支持 Anki 标准导出格式 (.apkg)</p>
      <button class="tuanki-btn tuanki-btn--primary tuanki-btn--md" style="margin-top: 1rem;">
        <EnhancedIcon name="file-plus" size={16} />
        <span>选择文件</span>
      </button>
    {/if}
  </div>
  
  <input
    bind:this={fileInput}
    type="file"
    accept=".apkg"
    onchange={handleFileSelect}
    style="display: none"
  />
</div>

<style>
  .file-selection {
    min-height: 350px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--tuanki-space-xl, 1.5rem);
  }
  
  .dropzone {
    width: 100%;
    max-width: 500px;
    padding: var(--tuanki-space-2xl, 2rem);
    border: 2px dashed var(--tuanki-border, var(--background-modifier-border));
    border-radius: var(--tuanki-radius-lg, 12px);
    text-align: center;
    cursor: pointer;
    transition: all var(--tuanki-transition-normal, 250ms) var(--tuanki-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
    background: var(--tuanki-bg-secondary, var(--background-secondary));
  }
  
  .dropzone:hover:not(.is-processing),
  .dropzone.is-dragover {
    border-color: var(--tuanki-accent, var(--interactive-accent));
    background: var(--tuanki-choice-selected, color-mix(in srgb, var(--interactive-accent) 10%, transparent));
    transform: translateY(-2px);
    box-shadow: var(--tuanki-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
  }
  
  .dropzone.is-processing {
    cursor: wait;
    opacity: 0.8;
    pointer-events: none;
  }
  
  .dropzone-title {
    margin-top: var(--tuanki-space-md, 1rem);
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--tuanki-text-normal, var(--text-normal));
  }
  
  .dropzone-hint {
    margin-top: var(--tuanki-space-sm, 0.5rem);
    color: var(--tuanki-text-muted, var(--text-muted));
    font-size: 0.875rem;
  }
  
  .processing-text {
    margin-top: var(--tuanki-space-md, 1rem);
    font-size: 1rem;
    color: var(--tuanki-text-muted, var(--text-muted));
  }
  
  @media (max-width: 768px) {
    .file-selection {
      min-height: 250px;
      padding: var(--tuanki-space-md, 1rem);
    }
    
    .dropzone {
      padding: var(--tuanki-space-xl, 1.5rem);
    }
  }
</style>

