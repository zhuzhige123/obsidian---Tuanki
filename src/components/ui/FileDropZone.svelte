<script lang="ts">
// 文件拖拽上传组件

interface Props {
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // 50MB
  isLoading?: boolean;
  onfilesselected?: (files: File[]) => void;
  onerror?: (error: string) => void;
}

let {
  accept = '*',
  multiple = false,
  maxSize = 50 * 1024 * 1024,
  isLoading = false,
  onfilesselected,
  onerror
}: Props = $props();

let dragOver = $state(false);
let fileInput: HTMLInputElement;

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  dragOver = true;
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  dragOver = false;
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  dragOver = false;
  
  if (isLoading) return;
  
  const files = Array.from(event.dataTransfer?.files || []);
  processFiles(files);
}

function handleFileInput(event: Event) {
  if (isLoading) return;
  
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  processFiles(files);
}

function processFiles(files: File[]) {
  if (files.length === 0) return;
  
  const file = files[0]; // 只处理第一个文件
  
  // 检查文件大小
  if (file.size > maxSize) {
    onerror?.(`文件大小不能超过 ${formatFileSize(maxSize)}`);
    return;
  }

  // 检查文件类型
  if (accept !== '*' && !isFileTypeAccepted(file.name, accept)) {
    onerror?.(`不支持的文件类型。支持的格式: ${accept}`);
    return;
  }

  onfilesselected?.([file]);
}

function isFileTypeAccepted(fileName: string, acceptPattern: string): boolean {
  const extensions = acceptPattern.split(',').map(ext => ext.trim().toLowerCase());
  const fileExt = '.' + fileName.split('.').pop()?.toLowerCase();
  
  return extensions.some(ext => {
    if (ext.startsWith('.')) {
      return fileExt === ext;
    }
    return fileName.toLowerCase().includes(ext);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function triggerFileInput() {
  if (!isLoading) {
    fileInput.click();
  }
}
</script>

<div 
  class="file-drop-zone"
  class:drag-over={dragOver}
  class:loading={isLoading}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={triggerFileInput}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      triggerFileInput();
    }
  }}
  role="button"
  tabindex="0"
>
  <input 
    bind:this={fileInput}
    type="file" 
    {accept}
    {multiple}
    onchange={handleFileInput}
    style="display: none;"
  />
  
  <div class="drop-zone-content">
    {#if isLoading}
      <div class="loading-indicator">
        <div class="spinner"></div>
        <p>正在处理文件...</p>
      </div>
    {:else}
      <div class="upload-icon">📁</div>
      <div class="upload-text">
        <p class="primary-text">拖拽文件到此处，或点击选择文件</p>
        <p class="secondary-text">
          支持格式: {accept} 
          {#if maxSize < Infinity}
            | 最大大小: {formatFileSize(maxSize)}
          {/if}
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
.file-drop-zone {
  border: 2px dashed var(--background-modifier-border);
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--background-secondary);
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-drop-zone:hover:not(.loading) {
  border-color: var(--text-accent);
  background: var(--background-modifier-hover);
}

.file-drop-zone.drag-over {
  border-color: var(--text-accent);
  background: var(--background-modifier-hover);
  transform: scale(1.02);
}

.file-drop-zone.loading {
  cursor: not-allowed;
  opacity: 0.7;
}

.drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.upload-icon {
  font-size: 3rem;
  opacity: 0.7;
}

.upload-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary-text {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--text-normal);
  margin: 0;
}

.secondary-text {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
}

.loading-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--background-modifier-border);
  border-top: 3px solid var(--text-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-indicator p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .file-drop-zone {
    padding: 24px 16px;
    min-height: 150px;
  }
  
  .upload-icon {
    font-size: 2rem;
  }
  
  .primary-text {
    font-size: 1rem;
  }
  
  .secondary-text {
    font-size: 0.8rem;
  }
}
</style>
