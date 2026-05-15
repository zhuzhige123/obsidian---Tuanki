import { App } from 'obsidian';

import { CardExporter } from './CardExporter';
import { getOfficialTemplateById } from '../../constants/official-templates';
import type { Card } from '../../data/types';
import type { AnkiModelInfo, ConversionResult } from '../../types/ankiconnect-types';

function createModelInfo(name: string, fields: string[]): AnkiModelInfo {
  return {
    id: 1,
    name,
    fields,
    templates: [],
    css: ''
  };
}

function createExporter(mediaSyncEnabled = true) {
  const app = new App();
  (app.vault as App['vault'] & { getName: () => string }).getName = vi.fn(() => 'TestVault');

  const plugin = {
    app,
    settings: {
      ankiConnect: {
        mediaSync: {
          enabled: mediaSyncEnabled
        }
      }
    }
  } as any;
  const exporter = new CardExporter(plugin, {} as any, {} as any);
  const convertContent = vi.fn(
    async (content: string, _card: Card, _options: unknown): Promise<ConversionResult> => ({
      convertedContent: content,
      mediaFiles: [],
      backlinks: [],
      warnings: []
    })
  );

  (exporter as any).converter = {
    convertContent
  };

  return { exporter, convertContent };
}

function getOfficialTemplate(templateId: string) {
  const template = getOfficialTemplateById(templateId);
  if (!template) {
    throw new Error(`Missing official template: ${templateId}`);
  }
  return template;
}

function createCard({
  type,
  ...overrides
}: Omit<Partial<Card>, 'type'> & {
  uuid: string;
  content: string;
  type?: string;
}): Card {
  return {
    created: '2026-04-01T00:00:00.000Z',
    modified: '2026-04-01T00:00:00.000Z',
    stats: {
      totalReviews: 0,
      totalTime: 0,
      averageTime: 0
    },
    tags: [],
    ...overrides,
    type: type as Card['type']
  };
}

describe('CardExporter', () => {
  it('rejects hint-only QA cards before upload when the Anki primary field is empty', async () => {
    const { exporter } = createExporter();
    await expect(
      exporter.convertCardToAnkiNote(
        createCard({
          uuid: 'tk-hint-only',
          type: 'basic-qa',
          content: `---
we_type: basic
---
>hint: 只剩提示也应保留
`,
          tags: []
        }),
        getOfficialTemplate('official-qa'),
        createModelInfo('Weave QA', ['front', 'back', 'hint', 'explanation'])
      )
    ).rejects.toThrow('卡片缺少必填主字段 "front"');
  });

  it('maps choice correctAnswers and explanation into native choice model fields', async () => {
    const { exporter } = createExporter();
    const note = await exporter.convertCardToAnkiNote(
      createCard({
        uuid: 'tk-choice',
        type: 'multiple',
        content: `Q: 2 + 2 = ?

A) 3
B) 4 {✓}
C) 5

---div---

因为 2 + 2 = 4`,
        tags: ['math']
      }),
      getOfficialTemplate('official-choice'),
      createModelInfo('Weave Choice', ['front', 'options', 'back', 'explanation', 'tags'])
    );

    expect(note.fields?.front).toBe('2 + 2 = ?');
    expect(note.fields?.back).toBe('B) 4');
    expect(note.fields?.explanation).toBe('因为 2 + 2 = 4');
    expect(note.fields?.tags).toBe('math');
    expect(note.fields?.options).not.toContain('✓');
    expect(note.fields?.options).toContain('choice-option-label');
    expect(note.fields?.options).toContain('B)');
  });

  it('exports dot-style choice cards with stem answers into the native choice model', async () => {
    const { exporter } = createExporter();
    const note = await exporter.convertCardToAnkiNote(
      createCard({
        uuid: 'tk-choice-dot',
        type: 'multiple',
        content: `Q: 在 iOS 上用于 Git 仓库管理的应用是哪个？（B）

A. TestFlight
B. Working Copy
C. Shortcuts
D. Files

---div---

Working Copy 提供 Git 仓库管理能力。`,
        tags: ['ios']
      }),
      getOfficialTemplate('official-choice'),
      createModelInfo('Weave Choice', ['front', 'options', 'back', 'explanation', 'tags'])
    );

    expect(note.fields?.front).toBe('在 iOS 上用于 Git 仓库管理的应用是哪个？');
    expect(note.fields?.back).toBe('B) Working Copy');
    expect(note.fields?.explanation).toBe('Working Copy 提供 Git 仓库管理能力。');
    expect(note.fields?.tags).toBe('ios');
    expect(note.fields?.options).not.toContain('✓');
  });

  it('maps legacy multiple card.type to the official choice template during export', () => {
    const { exporter } = createExporter();

    const templateId = (exporter as any).getTemplateIdForExport(createCard({
      uuid: 'tk-legacy-multiple',
      type: 'multiple',
      content: '题目\n\nA) 选项一\nB) 选项二 {✓}'
    }));

    expect(templateId).toBe('official-choice');
  });

  it('converts cloze content to Anki syntax, moves extra content to explanation, and skips unknown fields', async () => {
    const { exporter } = createExporter();
    const note = await exporter.convertCardToAnkiNote(
      createCard({
        uuid: 'tk-cloze',
        type: 'cloze-deletion',
        content: `---
we_type: cloze
---
地球绕着 ==太阳== 公转。

---div---

这是额外说明。

>hint: 想想太阳系的中心天体
`,
        tags: []
      }),
      getOfficialTemplate('official-cloze'),
      createModelInfo('Weave Cloze', ['text', 'hint', 'explanation'])
    );

    expect(note.fields).toMatchObject({
      text: '地球绕着 {{c1::太阳}} 公转。',
      hint: '想想太阳系的中心天体',
      explanation: '这是额外说明。'
    });
    expect(note.fields).not.toHaveProperty('cloze');
    expect(note.fields).not.toHaveProperty('clozeanki');
  });

  it('passes the media sync toggle into the current export conversion pipeline', async () => {
    const { exporter, convertContent } = createExporter(false);
    await exporter.convertCardToAnkiNote(
      createCard({
        uuid: 'tk-media-toggle',
        type: 'basic-qa',
        content: '问题\n\n---div---\n\n答案',
        tags: []
      }),
      getOfficialTemplate('official-qa'),
      createModelInfo('Weave QA', ['front', 'back'])
    );

    expect(convertContent).toHaveBeenCalled();
    const thirdArg = convertContent.mock.calls[0]?.[2] as { uploadMedia?: boolean } | undefined;
    expect(thirdArg?.uploadMedia).toBe(false);
  });
});
