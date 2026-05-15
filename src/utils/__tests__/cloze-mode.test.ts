import {
  detectClozeModeFromContent,
  hasClozeSyntax,
  resolveClozeModeForRender,
  shouldRevealClozeAnswersForRender,
  setClozeModeInContent
} from '../cloze-mode';

describe('cloze-mode', () => {
  it('defaults to reveal mode when no mode marker exists', () => {
    expect(detectClozeModeFromContent('France capital is ==Paris==.')).toBe('reveal');
  });

  it('detects input mode from yaml field', () => {
    const content = ['---', 'we_type: cloze', 'we_cloze_mode: input', '---', '', 'France capital is ==Paris==.'].join('\n');
    expect(detectClozeModeFromContent(content)).toBe('input');
  });

  it('detects input mode from yaml tag or content tag aliases', () => {
    const yamlTagContent = ['---', 'tags:', '  - input', '---', '', 'France capital is ==Paris==.'].join('\n');
    const contentTagContent = 'France capital is ==Paris==. #input';
    const legacyContentTagContent = 'France capital is ==Paris==. #we_input';

    expect(detectClozeModeFromContent(yamlTagContent)).toBe('input');
    expect(detectClozeModeFromContent(contentTagContent)).toBe('input');
    expect(detectClozeModeFromContent(legacyContentTagContent)).toBe('input');
  });

  it('keeps compatibility with legacy directive', () => {
    expect(detectClozeModeFromContent('%%weave-cloze-mode: input%%\n\nFrance capital is ==Paris==.')).toBe('input');
  });

  it('detects cloze syntax from highlight and anki markers', () => {
    expect(hasClozeSyntax('France capital is ==Paris==.')).toBe(true);
    expect(hasClozeSyntax('{{c1::Paris}} is the capital of France.')).toBe(true);
    expect(hasClozeSyntax('This is a regular QA card.')).toBe(false);
  });

  it('detects only the configured standard delimiter pair when a custom pair is supplied', () => {
    const customSettings = {
      enabled: true,
      openDelimiter: '[[',
      closeDelimiter: ']]',
      placeholder: '[...]'
    };

    expect(hasClozeSyntax('France capital is [[Paris]].', customSettings)).toBe(true);
    expect(hasClozeSyntax('France capital is ==Paris==.', customSettings)).toBe(false);
  });

  it('writes input mode into yaml instead of body directive', () => {
    const content = ['---', 'we_type: cloze', '---', '', 'France capital is ==Paris==.'].join('\n');
    const output = setClozeModeInContent(content, 'input');

    expect(output).toContain('we_cloze_mode: input');
    expect(output).not.toContain('%%weave-cloze-mode: input%%');
    expect(output).toBe(['---', 'we_type: cloze', 'we_cloze_mode: input', '---', '', 'France capital is ==Paris==.'].join('\n'));
  });

  it('removes yaml field and legacy markers when switching back to reveal mode', () => {
    const content = ['---', 'we_type: cloze', 'we_cloze_mode: input', '---', '', '%%weave-cloze-mode: input%%', '', '#input', '', 'France capital is ==Paris==. #we_input #input'].join('\n');
    const output = setClozeModeInContent(content, 'reveal');

    expect(output).not.toContain('we_cloze_mode');
    expect(output).not.toContain('%%weave-cloze-mode');
    expect(output).not.toContain('#we_input');
    expect(output).not.toContain('#input');
    expect(output).toBe(['---', 'we_type: cloze', '---', '', 'France capital is ==Paris==.'].join('\n'));
  });

  it('prefers original card content when rendered content has no frontmatter', () => {
    const originalContent = ['---', 'we_type: cloze', 'we_cloze_mode: input', '---', '', 'France capital is ==Paris==.'].join('\n');
    const renderedContent = 'France capital is ==Paris==.';

    expect(resolveClozeModeForRender(originalContent, renderedContent)).toBe('input');
  });

  it('does not reveal cloze answers just because card is in input mode', () => {
    expect(shouldRevealClozeAnswersForRender('input', false)).toBe(false);
    expect(shouldRevealClozeAnswersForRender('reveal', false)).toBe(false);
    expect(shouldRevealClozeAnswersForRender('reveal', true)).toBe(true);
  });
});
