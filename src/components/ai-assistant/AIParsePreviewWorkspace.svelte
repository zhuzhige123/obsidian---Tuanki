<script lang="ts">
  import type { WeavePlugin } from '../../main';
  import type {
    AICardPreviewItem,
    AIPreviewImportOptions,
    AIPreviewImportResult,
    AIParsePreviewItem,
    GeneratedCard,
    GenerationConfig
  } from '../../types/ai-types';
  import { detectCardTypeFromContent } from '../../utils/card-markdown-serializer';
  import AICardPreviewWorkspace from './AICardPreviewWorkspace.svelte';

  const PARSE_PREVIEW_TIME = '1970-01-01T00:00:00.000Z';

  interface Props {
    plugin: WeavePlugin;
    items: AIParsePreviewItem[];
    config: GenerationConfig;
    isParsing?: boolean;
    sourceFileName?: string;
    templateName?: string;
    onImport: (selectedItems: AIParsePreviewItem[], options: AIPreviewImportOptions) => Promise<AIPreviewImportResult>;
  }

  let {
    plugin,
    items,
    config,
    isParsing = false,
    sourceFileName = '',
    templateName = '',
    onImport
  }: Props = $props();

  function toGeneratedType(content: string): GeneratedCard['type'] {
    const detectedType = detectCardTypeFromContent(content);
    if (detectedType === 'cloze') return 'cloze';
    if (detectedType === 'multiple') return 'choice';
    return 'qa';
  }

  function buildGeneratedCard(item: AIParsePreviewItem): GeneratedCard {
    const content = item.parsedCard.content || (item.back.trim()
      ? `${item.front}\n\n---div---\n\n${item.back}`
      : item.front);
    const type = toGeneratedType(content);

    return {
      uuid: `parse-preview-${item.id}`,
      type,
      content,
      tags: [...item.tags],
      metadata: {
        generatedAt: PARSE_PREVIEW_TIME,
        provider: 'regex-parser',
        model: templateName || '解析模板',
        sourceFile: item.parsedCard.metadata?.sourceFile || sourceFileName,
        temperature: 0
      }
    };
  }

  function buildDraft(item: AIParsePreviewItem, generatedCard: GeneratedCard): AICardPreviewItem['draft'] {
    if (generatedCard.type === 'choice') {
      return {
        type: 'choice',
        question: item.front,
        options: [],
        answers: [],
        back: item.back || undefined,
        tags: [...item.tags]
      };
    }

    if (generatedCard.type === 'cloze') {
      return {
        type: 'cloze',
        text: item.front,
        back: item.back || undefined,
        tags: [...item.tags]
      };
    }

    return {
      type: 'qa',
      front: item.front,
      back: item.back,
      tags: [...item.tags]
    };
  }

  let previewItems = $derived(items.map((item) => {
    const generatedCard = buildGeneratedCard(item);
    return {
      id: item.id,
      draft: buildDraft(item, generatedCard),
      status: 'valid',
      issues: [],
      generatedContent: generatedCard.content,
      generatedCard
    } satisfies AICardPreviewItem;
  }));

  let previewSubtitle = $derived(
    `${sourceFileName || '未选择源文件'}${templateName ? ` · ${templateName}` : ''}`
  );

  async function handleImport(
    selectedItems: AICardPreviewItem[],
    options: AIPreviewImportOptions
  ): Promise<AIPreviewImportResult> {
    const selectedIds = new Set(selectedItems.map((item) => item.id));
    return await onImport(
      items.filter((item) => selectedIds.has(item.id)),
      options
    );
  }
</script>

<AICardPreviewWorkspace
  {plugin}
  items={previewItems}
  {config}
  isGenerating={isParsing}
  variant="parse"
  previewTitle="解析预览"
  previewSubtitle={previewSubtitle}
  showCurrentIndexLabel={previewItems.length > 0}
  showImportControls={true}
  enableSelection={true}
  onImport={handleImport}
/>
