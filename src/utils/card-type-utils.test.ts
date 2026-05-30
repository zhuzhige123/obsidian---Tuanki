import {
  resolveAnkiExportCardType,
  resolveOfficialTemplateId,
  resolveParserCardType,
  resolveStoredCardType
} from './card-type-utils';

describe('card-type-utils', () => {
  it('maps legacy multiple cards to choice parsing and Anki export types', () => {
    const card = {
      type: 'multiple',
      content: 'Q: 2 + 2 = ?（B）\n\nA. 3\nB. 4\nC. 5'
    } as any;

    expect(resolveStoredCardType(card)).toBe('multiple');
    expect(resolveParserCardType(card)).toBe('multiple-choice');
    expect(resolveAnkiExportCardType(card)).toBe('multiple');
    expect(resolveOfficialTemplateId(card)).toBe('official-choice');
  });

  it('falls back to YAML we_type when card.type is missing', () => {
    const card = {
      content: '---\nwe_type: cloze\n---\n地球绕着 ==太阳== 公转。'
    } as any;

    expect(resolveStoredCardType(card)).toBe('cloze');
    expect(resolveParserCardType(card)).toBe('cloze-deletion');
    expect(resolveOfficialTemplateId(card)).toBe('official-cloze');
  });

  it('falls back to content detection when both type and YAML are missing', () => {
    const card = {
      content: '题目（B）\n\nA. 选项一\nB. 选项二\nC. 选项三'
    } as any;

    expect(resolveStoredCardType(card)).toBe('multiple');
    expect(resolveParserCardType(card)).toBe('multiple-choice');
  });

  it('treats dot-style and full-width option markers as multiple choice during fallback detection', () => {
    const card = {
      content: 'Q: 在 iOS 上用于 Git 仓库管理的应用是哪个？（B）\n\nA．TestFlight\nB．Working Copy\nC．Shortcuts\nD．Files'
    } as any;

    expect(resolveStoredCardType(card)).toBe('multiple');
    expect(resolveParserCardType(card)).toBe('multiple-choice');
    expect(resolveOfficialTemplateId(card)).toBe('official-choice');
  });
});
