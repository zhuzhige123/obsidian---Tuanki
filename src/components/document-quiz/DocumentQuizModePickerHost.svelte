<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type WeavePlugin from '../../main';
  import type { QuestionBankModeConfig, TestMode } from '../../types/question-bank-types';
  import TestModeSelectionModal from '../modals/TestModeSelectionModal.svelte';

  interface Props {
    plugin: WeavePlugin;
    bankName: string;
    totalQuestions: number;
    onSelect: (mode: TestMode, config?: QuestionBankModeConfig | undefined) => void;
    onCancel: () => void;
  }

  let { plugin, bankName, totalQuestions, onSelect, onCancel }: Props = $props();

  let open = $state(true);

  function handleSelect(mode: TestMode, config: QuestionBankModeConfig | undefined = undefined) {
    open = false;
    onSelect(mode, config);
  }

  function handleCancel() {
    open = false;
    onCancel();
  }

  onMount(() => {
    void plugin;
  });

  onDestroy(() => {
    open = false;
  });
</script>

{#if open}
  <TestModeSelectionModal
    {open}
    {bankName}
    {totalQuestions}
    onSelect={handleSelect}
    onCancel={handleCancel}
  />
{/if}
