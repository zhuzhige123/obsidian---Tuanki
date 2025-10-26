<script lang="ts">
  import type { FilterConfig } from "../../types/filter-types";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { filterManager } from "../../services/filter-manager";

  interface Props {
    visible: boolean;
    filterConfig: FilterConfig;
    onSave: (name: string, description: string, icon: string, color: string, isPinned: boolean) => void;
    onClose: () => void;
  }

  let { visible, filterConfig, onSave, onClose }: Props = $props();

  // 表单状态
  let filterName = $state("");
  let filterDescription = $state("");
  let selectedIcon = $state("filter");
  let selectedColor = $state("var(--interactive-accent)");
  let isPinned = $state(false);
  let nameError = $state("");

  // 图标选项
  const iconOptions = [
    { value: "filter", label: "筛选器" },
    { value: "star", label: "星标" },
    { value: "bookmark", label: "书签" },
    { value: "tag", label: "标签" },
    { value: "heart", label: "喜欢" },
    { value: "flag", label: "旗帜" },
    { value: "circle-dot", label: "圆点" },
    { value: "check-circle", label: "勾选" },
    { value: "clock", label: "时钟" },
    { value: "calendar", label: "日历" },
    { value: "book", label: "书籍" },
    { value: "layers", label: "分层" }
  ];

  // 颜色选项
  const colorOptions = [
    { value: "#3b82f6", label: "蓝色" },
    { value: "var(--interactive-accent)", label: "主题色" },
    { value: "#ec4899", label: "粉色" },
    { value: "#ef4444", label: "红色" },
    { value: "#f59e0b", label: "橙色" },
    { value: "#10b981", label: "绿色" },
    { value: "#06b6d4", label: "青色" },
    { value: "#6b7280", label: "灰色" }
  ];

  // 重置表单
  function resetForm() {
    filterName = "";
    filterDescription = "";
    selectedIcon = "filter";
    selectedColor = "var(--interactive-accent)";
    isPinned = false;
    nameError = "";
  }

  // 当对话框打开时重置表单
  $effect(() => {
    if (visible) {
      resetForm();
    }
  });

  // 验证表单
  function validateForm(): boolean {
    nameError = "";

    if (!filterName.trim()) {
      nameError = "请输入筛选器名称";
      return false;
    }

    if (filterName.trim().length > 50) {
      nameError = "名称不能超过50个字符";
      return false;
    }

    return true;
  }

  // 保存筛选器
  function handleSave() {
    if (!validateForm()) {
      return;
    }

    onSave(
      filterName.trim(),
      filterDescription.trim(),
      selectedIcon,
      selectedColor,
      isPinned
    );

    resetForm();
    onClose();
  }

  // 取消
  function handleCancel() {
    resetForm();
    onClose();
  }

  // 键盘事件处理
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" onclick={handleCancel}>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div 
      class="save-filter-modal" 
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
    >
      <!-- 头部 -->
      <header class="modal-header">
        <div class="header-title">
          <EnhancedIcon name="save" size={20} />
          <h3>保存筛选器</h3>
        </div>
        <button class="close-btn" onclick={handleCancel}>
          <EnhancedIcon name="x" size={20} />
        </button>
      </header>

      <!-- 主体内容 -->
      <div class="modal-content">
        <!-- 名称输入 -->
        <div class="form-group">
          <label for="filter-name" class="form-label required">
            筛选器名称
          </label>
          <input
            id="filter-name"
            type="text"
            class="form-input"
            class:error={nameError}
            bind:value={filterName}
            placeholder="例如：学习中的重点卡片"
            maxlength="50"
          />
          {#if nameError}
            <span class="error-message">{nameError}</span>
          {/if}
        </div>

        <!-- 描述输入 -->
        <div class="form-group">
          <label for="filter-desc" class="form-label">
            描述（可选）
          </label>
          <textarea
            id="filter-desc"
            class="form-textarea"
            bind:value={filterDescription}
            placeholder="简短描述这个筛选器的用途..."
            rows="3"
            maxlength="200"
          ></textarea>
        </div>

        <!-- 图标选择 -->
        <div class="form-group">
          <div class="form-label">图标</div>
          <div class="icon-grid">
            {#each iconOptions as icon}
              <button
                class="icon-option"
                class:selected={selectedIcon === icon.value}
                onclick={() => selectedIcon = icon.value}
                title={icon.label}
              >
                <EnhancedIcon name={icon.value} size={20} />
              </button>
            {/each}
          </div>
        </div>

        <!-- 颜色选择 -->
        <div class="form-group">
          <div class="form-label">颜色</div>
          <div class="color-grid">
            {#each colorOptions as color}
              <button
                class="color-option"
                class:selected={selectedColor === color.value}
                style:background-color={color.value}
                onclick={() => selectedColor = color.value}
                title={color.label}
              >
                {#if selectedColor === color.value}
                  <EnhancedIcon name="check" size={16} />
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- 固定选项 -->
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={isPinned}
            />
            <span>固定到快捷筛选栏</span>
            <span class="hint">（固定后可在筛选栏快速访问）</span>
          </label>
        </div>

        <!-- 预览 -->
        <div class="preview-section">
          <div class="preview-label">预览：</div>
          <div class="filter-preview">
            <button 
              class="preview-badge"
              style:border-color={selectedColor}
            >
              <EnhancedIcon name={selectedIcon} size={14} />
              <span>{filterName || "筛选器名称"}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <footer class="modal-footer">
        <div class="footer-hint">
          <EnhancedIcon name="info-circle" size={14} />
          <span>Ctrl + Enter 保存 / Esc 取消</span>
        </div>
        <div class="footer-actions">
          <button class="btn-secondary" onclick={handleCancel}>
            取消
          </button>
          <button class="btn-primary" onclick={handleSave}>
            <EnhancedIcon name="save" size={16} />
            <span>保存筛选器</span>
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .save-filter-modal {
    width: 100%;
    max-width: 500px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-l);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-title h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: var(--radius-s);
    display: flex;
    align-items: center;
    transition: background-color 0.2s ease, color 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-content {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .form-label.required::after {
    content: " *";
    color: var(--text-error);
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: 0.875rem;
    font-family: inherit;
    transition: border-color 0.2s ease;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .form-input.error {
    border-color: var(--text-error);
  }

  .form-textarea {
    resize: vertical;
    min-height: 60px;
  }

  .error-message {
    font-size: 0.75rem;
    color: var(--text-error);
  }

  .icon-grid,
  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(45px, 1fr));
    gap: 0.5rem;
  }

  .icon-option,
  .color-option {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-secondary);
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .icon-option:hover,
  .color-option:hover {
    border-color: var(--interactive-accent);
    transform: scale(1.05);
  }

  .icon-option.selected,
  .color-option.selected {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .color-option {
    position: relative;
    color: white;
  }

  .color-option.selected {
    box-shadow: 0 0 0 2px var(--background-primary),
                0 0 0 4px var(--interactive-accent);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }

  .preview-section {
    padding: 1rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .preview-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .filter-preview {
    display: flex;
    justify-content: center;
  }

  .preview-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4rem 0.75rem;
    background: var(--background-primary);
    border: 1.5px solid;
    border-radius: var(--radius-s);
    color: var(--text-normal);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .modal-footer {
    border-top: 1px solid var(--background-modifier-border);
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .footer-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-secondary,
  .btn-primary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    border: none;
    border-radius: var(--radius-s);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .modal-overlay {
      padding: 0;
    }

    .save-filter-modal {
      max-width: 100%;
      border-radius: 0;
    }

    .footer-hint {
      display: none;
    }
  }
</style>

