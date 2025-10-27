<script lang="ts">
  /**
   * 表格复选框组件
   * 统一的复选框样式和逻辑，支持 checked 和 indeterminate 状态
   */
  
  interface Props {
    checked: boolean;
    indeterminate?: boolean;
    onchange: (checked: boolean) => void;
    ariaLabel?: string;
  }
  
  let { 
    checked, 
    indeterminate = false, 
    onchange, 
    ariaLabel = "选择" 
  }: Props = $props();
  
  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    onchange(target.checked);
  }
</script>

<label class="tuanki-checkbox-label">
  <input
    type="checkbox"
    {checked}
    {indeterminate}
    onchange={handleChange}
    aria-label={ariaLabel}
  />
  <span class="tuanki-checkbox-custom"></span>
</label>

<style>
  .tuanki-checkbox-label {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    position: relative;
  }

  .tuanki-checkbox-label input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  .tuanki-checkbox-custom {
    width: 18px;
    height: 18px;
    border: 2px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .tuanki-checkbox-label input[type="checkbox"]:checked + .tuanki-checkbox-custom {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .tuanki-checkbox-label input[type="checkbox"]:checked + .tuanki-checkbox-custom::after {
    content: "✓";
    color: white;
    font-size: 12px;
    font-weight: bold;
  }

  .tuanki-checkbox-label input[type="checkbox"]:indeterminate + .tuanki-checkbox-custom {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .tuanki-checkbox-label input[type="checkbox"]:indeterminate + .tuanki-checkbox-custom::after {
    content: "−";
    color: white;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
  }

  .tuanki-checkbox-label:hover .tuanki-checkbox-custom {
    border-color: var(--color-accent);
  }

  .tuanki-checkbox-label input[type="checkbox"]:focus + .tuanki-checkbox-custom {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>

