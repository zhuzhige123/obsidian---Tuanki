import { ChoiceCardParser } from './ChoiceCardParser';

describe('ChoiceCardParser', () => {
  it('parses dot-style options and stem answers into native choice fields', () => {
    const parser = new ChoiceCardParser();

    const result = parser.parseMarkdownToFields(
      `Q: 在 iOS 上用于 Git 仓库管理的应用是哪个？（B）

A. TestFlight
B. Working Copy
C. Shortcuts
D. Files

---div---

Working Copy 提供 Git 仓库管理能力。`,
      'multiple-choice'
    );

    expect(result.success).toBe(true);
    expect(result.fields).toEqual({
      front: '在 iOS 上用于 Git 仓库管理的应用是哪个？',
      back: 'Working Copy 提供 Git 仓库管理能力。',
      options: 'A. TestFlight\nB. Working Copy\nC. Shortcuts\nD. Files',
      correctAnswers: 'B'
    });
  });

  it('keeps parsing successful when the answer is declared with Answer line', () => {
    const parser = new ChoiceCardParser();

    const result = parser.parseMarkdownToFields(
      `问题如下

A、选项一
B、选项二
C、选项三

---div---

Answer: A,C
因为一和三都满足条件。`,
      'multiple-choice'
    );

    expect(result.success).toBe(true);
    expect(result.fields.correctAnswers).toBe('A,C');
    expect(result.fields.options).toContain('A. 选项一');
    expect(result.fields.options).toContain('C. 选项三');
    expect(result.fields.back).toBe('因为一和三都满足条件。');
  });
});
