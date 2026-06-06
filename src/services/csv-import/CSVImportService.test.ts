import { generateCardContent, type ColumnMapping } from './CSVImportService';

describe('CSVImportService.generateCardContent', () => {
  it('appends mapped hint text as plain markdown for QA cards', () => {
    const mappings: ColumnMapping[] = [
      { csvColumn: 'Question', csvIndex: 0, targetField: 'question' },
      { csvColumn: 'Answer', csvIndex: 1, targetField: 'answer' },
      { csvColumn: 'Hint', csvIndex: 2, targetField: 'hint' },
    ];

    const generated = generateCardContent(
      ['法国的首都是哪里？', '巴黎', '欧洲国家\n埃菲尔铁塔所在城市'],
      mappings,
      'basic-qa'
    );

    expect(generated?.content).toBe(
      '法国的首都是哪里？\n---div---\n巴黎\n\n欧洲国家\n埃菲尔铁塔所在城市'
    );
  });

  it('appends hint text for cloze cards as plain markdown', () => {
    const mappings: ColumnMapping[] = [
      { csvColumn: 'Content', csvIndex: 0, targetField: 'content' },
      { csvColumn: 'Hint', csvIndex: 1, targetField: 'hint' },
    ];

    const generated = generateCardContent(
      ['法国的首都是 {{c1::巴黎}}。', '首都在欧洲'],
      mappings,
      'cloze'
    );

    expect(generated?.content).toBe('法国的首都是 {{c1::巴黎}}。\n\n首都在欧洲');
  });
});
