<script lang="ts">
  // 通用设置输入组件，减少重复代码

  interface Option {
    value: string | number;
    label: string;
  }

  interface Props {
    id: string;
    label: string;
    type: 'text' | 'number' | 'checkbox' | 'select';
    value: any;
    placeholder?: string;
    min?: number;
    max?: number;
    options?: Option[];
    disabled?: boolean;
    description?: string;
    onchange: (value: any) => void;
  }

  let {
    id,
    label,
    type,
    value,
    placeholder,
    min,
    max,
    options = [],
    disabled = false,
    description,
    onchange
  }: Props = $props();

  function handleChange(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    let newValue: any;

    if (type === 'checkbox') {
      newValue = (target as HTMLInputElement).checked;
    } else if (type === 'number') {
      newValue = parseInt(target.value) || 0;
    } else {
      newValue = target.value;
    }

    onchange(newValue);
  }
</script>

<div class="settings-input-row">
  <div class="input-label-section">
    <label for={id} class="input-label">{label}</label>
    {#if description}
      <p class="input-description">{description}</p>
    {/if}
  </div>

  <div class="input-control-section">
    {#if type === 'checkbox'}
      <label class="modern-switch">
        <input
          {id}
          type="checkbox"
          checked={value}
          {disabled}
          onchange={handleChange}
        />
        <span class="switch-slider"></span>
      </label>
    {:else if type === 'select'}
      <select
        {id}
        {value}
        {disabled}
        onchange={handleChange}
      >
        {#each options as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {:else}
      <input
        {id}
        {type}
        {value}
        {placeholder}
        {min}
        {max}
        {disabled}
        oninput={handleChange}
      />
    {/if}
  </div>
</div>

<style>
  .settings-input-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .settings-input-row:last-child {
    border-bottom: none;
  }

  .input-label-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .input-label {
    font-weight: 500;
    color: var(--text-normal);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .input-description {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .input-control-section {
    min-width: 200px;
    display: flex;
    align-items: center;
  }

  input,
  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
  }

  input:focus,
  select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  input:disabled,
  select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Switch 样式 */
  .modern-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .modern-switch input {
    opacity: 0;
    width: 0;
    height: 0;
    min-width: 0;
    padding: 0;
  }

  .switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background-modifier-border);
    transition: 0.2s;
    border-radius: 24px;
  }

  .switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.2s;
    border-radius: 50%;
  }

  input:checked + .switch-slider {
    background-color: var(--interactive-accent);
  }

  input:checked + .switch-slider:before {
    transform: translateX(20px);
  }

  input:disabled + .switch-slider {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .settings-input-row {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }

    .input-control-section {
      min-width: auto;
    }
  }
</style>
