<script lang="ts">
  interface Props { value: string; language?: string; }
  let { value = $bindable(), language = 'javascript' }: Props = $props();
</script>

<div class="code-editor">
  <textarea bind:value placeholder="Enter code here..." class="code-textarea"></textarea>
</div>

<style>
  .code-editor { border: 1px solid var(--tuanki-border); border-radius: var(--tuanki-radius-md); }
  .code-textarea {
    width: 100%;
    min-height: 200px;
    padding: var(--tuanki-spacing-md);
    border: none;
    background: var(--tuanki-surface);
    color: var(--tuanki-text-primary);
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 14px;
    resize: vertical;
    outline: none;
  }
</style>
