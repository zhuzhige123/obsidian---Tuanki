<script lang="ts">
  import type { FieldTemplate } from '../../data/template-types';
  import type AnkiPlugin from '../../main';
  import SimpleFieldsEditor from './SimpleFieldsEditor.svelte';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    appliedFieldTemplate: FieldTemplate | null;
    fields: Record<string, string>;
    plugin: AnkiPlugin;
  }

  let { appliedFieldTemplate, fields, plugin }: Props = $props();

  const dispatch = createEventDispatcher<{
    change: { fieldKey: string; value: string };
  }>();

  // 处理字段变更
  function handleFieldChange(event: CustomEvent<{ fieldKey: string; value: string }>) {
    dispatch('change', event.detail);
  }
</script>

<div class="字段编辑器容器">
  <SimpleFieldsEditor
    {appliedFieldTemplate}
    {fields}
    {plugin}
    on:change={handleFieldChange}
  />
</div>

<style>
  .字段编辑器容器 {
    width: 100%;
    height: 100%;
    background: var(--background-primary);
    border-radius: 8px;
    overflow: hidden;
  }
</style>
