import type { GenerationConfig } from '../../types/ai-types';
import { AICardGenerationService } from './AICardGenerationService';
import { AIServiceFactory } from './AIServiceFactory';

function createConfig(): GenerationConfig {
  return {
    templateId: '',
    promptTemplate: '',
    cardCount: 3,
    difficulty: 'medium',
    typeDistribution: { qa: 40, cloze: 30, choice: 30 },
    provider: 'openai',
    model: 'gpt-test',
    temperature: 0.3,
    maxTokens: 2000
  };
}

function createPluginMock() {
  return {
    settings: {
      aiConfig: {
        apiKeys: {}
      }
    }
  } as any;
}

describe('AICardGenerationService structured preview flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps valid cards when another card in the same batch is invalid', async () => {
    const chat = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        cards: [
          { type: 'qa', front: 'What is photosynthesis?', back: 'It converts light into chemical energy.' },
          {
            type: 'choice',
            question: 'Which item is an organelle?',
            options: ['Membrane', 'Mitochondrion', 'Cell wall', 'Chlorophyll']
          }
        ]
      })
    });
    vi.spyOn(AIServiceFactory, 'createService').mockReturnValue({ chat } as any);

    const service = new AICardGenerationService(createPluginMock());
    const updates: number[] = [];
    const sourceContent = 'Biology notes about cells, organelles, chloroplasts, mitochondria, and how plants convert light energy during photosynthesis for survival.';

    const items = await service.generatePreviewItems(
      sourceContent,
      { ...createConfig(), cardCount: 2 },
      null,
      'Generate study cards.',
      {
        onProgress: vi.fn(),
        onItemsUpdate: (next) => updates.push(next.length)
      }
    );

    expect(items).toHaveLength(2);
    expect(items[0].status).toBe('valid');
    expect(items[0].draft.type).toBe('qa');
    expect(items[1].status).toBe('invalid');
    expect(items[1].issues.some((issue) => issue.code === 'missing-answer')).toBe(true);
    expect(updates).toEqual([2, 2]);
  });

  it('marks recoverable choice issues as warning and truncates options to four', async () => {
    const chat = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify([
        {
          type: 'choice',
          question: 'How long does Earth take to orbit the Sun?',
          options: ['One day', 'One month', 'One year', 'Ten years', 'One hundred years'],
          answers: ['C']
        }
      ])
    });
    vi.spyOn(AIServiceFactory, 'createService').mockReturnValue({ chat } as any);

    const service = new AICardGenerationService(createPluginMock());
    const sourceContent = 'Astronomy basics covering Earth rotation, revolution, seasons, sunlight, and the relation between orbital period and calendar years.';
    const items = await service.generatePreviewItems(
      sourceContent,
      { ...createConfig(), cardCount: 1 },
      null,
      'Generate study cards.',
      {
        onProgress: vi.fn(),
        onItemsUpdate: vi.fn()
      }
    );

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('warning');
    expect(items[0].draft.type).toBe('choice');
    if (items[0].draft.type !== 'choice') {
      throw new Error('expected choice draft');
    }
    expect(items[0].draft.options).toHaveLength(4);
    expect(items[0].issues.some((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('throws only when the outer JSON protocol is unusable', async () => {
    const chat = vi.fn().mockResolvedValue({
      success: true,
      content: 'not json at all'
    });
    vi.spyOn(AIServiceFactory, 'createService').mockReturnValue({ chat } as any);

    const service = new AICardGenerationService(createPluginMock());
    const sourceContent = 'History notes about empires, trade routes, cultural change, and political institutions across several centuries of development.';

    await expect(
      service.generatePreviewItems(
        sourceContent,
        { ...createConfig(), cardCount: 1 },
        null,
        'Generate study cards.',
        {
          onProgress: vi.fn(),
          onItemsUpdate: vi.fn()
        }
      )
    ).rejects.toThrow('无法解析');
  });

  it('parses deepseek-style thinking text and fenced json payloads', async () => {
    const chat = vi.fn().mockResolvedValue({
      success: true,
      content: `<think>I should first analyze the material.</think>\n\n\`\`\`json\n{"cards":[{"type":"qa","front":"What powers photosynthesis?","back":"Sunlight powers photosynthesis."}]}\n\`\`\``
    });
    vi.spyOn(AIServiceFactory, 'createService').mockReturnValue({ chat } as any);

    const service = new AICardGenerationService(createPluginMock());
    const items = await service.generatePreviewItems(
      'Plants convert light energy into chemical energy through photosynthesis.',
      { ...createConfig(), cardCount: 1, provider: 'deepseek', model: 'deepseek-chat' },
      null,
      'Generate study cards.',
      {
        onProgress: vi.fn(),
        onItemsUpdate: vi.fn()
      }
    );

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('valid');
    expect(items[0].generatedContent).toContain('Sunlight powers photosynthesis');
  });

  it('requests json mode for structured batch generation', async () => {
    const chat = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        cards: [{ type: 'qa', front: 'Q', back: 'A' }]
      })
    });
    vi.spyOn(AIServiceFactory, 'createService').mockReturnValue({ chat } as any);

    const service = new AICardGenerationService(createPluginMock());
    await service.generatePreviewItems(
      'Simple source material with enough detail about study goals, concepts, examples, and memory cues to pass the content length validation.',
      { ...createConfig(), cardCount: 1, provider: 'deepseek', model: 'deepseek-chat' },
      null,
      'Generate study cards.',
      {
        onProgress: vi.fn(),
        onItemsUpdate: vi.fn()
      }
    );

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: 'json_object'
      })
    );
  });

  it('avoids native json mode for deepseek reasoner and falls back to deepseek chat when needed', async () => {
    const primaryChat = vi.fn().mockResolvedValue({
      success: false,
      error: 'AI 返回为空，可能是模型在 JSON 模式下没有给出最终内容'
    });
    const fallbackChat = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        cards: [{ type: 'qa', front: 'Fallback Q', back: 'Fallback A' }]
      })
    });
    vi.spyOn(AIServiceFactory, 'createService')
      .mockReturnValueOnce({ chat: primaryChat } as any)
      .mockReturnValueOnce({ chat: fallbackChat } as any);

    const service = new AICardGenerationService(createPluginMock());
    const items = await service.generatePreviewItems(
      'Detailed source content about fallback handling, reasoning models, and why deterministic structured output matters for reliable flashcard generation.',
      { ...createConfig(), cardCount: 1, provider: 'deepseek', model: 'deepseek-reasoner' },
      null,
      'Generate study cards.',
      {
        onProgress: vi.fn(),
        onItemsUpdate: vi.fn()
      }
    );

    expect(items).toHaveLength(1);
    expect(primaryChat).toHaveBeenCalledWith(
      expect.not.objectContaining({
        responseFormat: 'json_object'
      })
    );
    expect(fallbackChat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: 'json_object'
      })
    );
  });

  it('regenerates a single card through the structured draft protocol', async () => {
    const chat = vi.fn().mockResolvedValue({
      success: true,
      content: JSON.stringify({
        cards: [
          {
            type: 'qa',
            front: 'What is Newton first law?',
            back: 'Without a net external force, an object keeps its state of motion.'
          }
        ]
      })
    });
    vi.spyOn(AIServiceFactory, 'createService').mockReturnValue({ chat } as any);

    const service = new AICardGenerationService(createPluginMock());
    const regenerated = await service.regeneratePreviewItem(
      {
        id: 'preview-1',
        status: 'invalid',
        issues: [{ code: 'missing-back', message: 'missing answer', severity: 'error' }],
        draft: { type: 'qa', front: 'What is Newton first law?', back: '', tags: [] },
        generatedContent: 'What is Newton first law?',
        generatedCard: {
          uuid: 'card-1',
          type: 'qa',
          content: 'What is Newton first law?',
          tags: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            provider: 'openai',
            model: 'gpt-test',
            temperature: 0.3,
            difficulty: 'medium'
          }
        }
      },
      'Add the missing answer.',
      { ...createConfig(), cardCount: 1 }
    );

    expect(regenerated.status).toBe('valid');
    expect(regenerated.draft.type).toBe('qa');
    if (regenerated.draft.type !== 'qa') {
      throw new Error('expected qa draft');
    }
    expect(regenerated.draft.back).toContain('state of motion');
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
