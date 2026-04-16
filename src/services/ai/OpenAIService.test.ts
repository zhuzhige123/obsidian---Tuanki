import type { ChatRequest } from './AIService';
import { OpenAIService } from './OpenAIService';

class TestOpenAIService extends OpenAIService {
  private readonly payload: any;

  constructor(payload: any) {
    super('test-key', 'deepseek-chat');
    this.payload = payload;
  }

  protected request = vi.fn(async () => ({
    status: 200,
    json: this.payload
  })) as any;

  getRequestMock() {
    return this.request;
  }
}

function createChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    messages: [{ role: 'user', content: 'Return JSON.' }],
    temperature: 0.2,
    maxTokens: 800,
    ...overrides
  };
}

describe('OpenAIService chat compatibility', () => {
  it('normalizes segmented message content arrays', async () => {
    const service = new TestOpenAIService({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: [
              { type: 'text', text: '```json\n{"cards":' },
              { type: 'text', text: '[{"type":"qa","front":"Q","back":"A"}]}\n```' }
            ]
          }
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    });

    const response = await service.chat(createChatRequest({ responseFormat: 'json_object' }));

    expect(response.success).toBe(true);
    expect(response.content).toContain('"cards"');
    expect(service.getRequestMock()).toHaveBeenCalled();
  });

  it('surfaces truncation as a clear error instead of format failure', async () => {
    const service = new TestOpenAIService({
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: '{"cards":['
          }
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    });

    const response = await service.chat(createChatRequest({ responseFormat: 'json_object' }));

    expect(response.success).toBe(false);
    expect(response.error).toContain('截断');
  });
});
