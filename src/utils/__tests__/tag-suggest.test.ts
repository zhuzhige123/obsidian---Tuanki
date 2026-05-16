
vi.mock('obsidian', async () => {
  return await vi.importActual<typeof import('../../tests/mocks/obsidian')>('../../tests/mocks/obsidian');
});

import { App } from 'obsidian';
import { TagInputSuggest, normalizeTagSuggestionOptions, type TagSuggestionItem } from '../tag-suggest';

describe('TagInputSuggest', () => {
  it('prepends a create suggestion when query does not match an existing tag', () => {
    const input = document.createElement('input');
    const app = new App();
    const items = normalizeTagSuggestionOptions([
      { name: 'alpha', count: 3 },
      { name: 'beta', count: 1 },
    ]);

    const suggest = new TagInputSuggest(app, input, {
      getItems: () => items,
      getQuery: () => 'gamma',
      isActive: () => true,
      onSelectTag: vi.fn(),
      createSuggestion: (query): TagSuggestionItem | null => ({
        key: query,
        tag: query,
        label: `新建 #${query}`,
        count: 0,
        keywords: [query, `#${query}`, '新建'],
        searchText: `${query} #${query} 新建`,
        isCreateSuggestion: true,
      }),
    });

    const suggestions = suggest.getSuggestions('gamma');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      tag: 'gamma',
      isCreateSuggestion: true,
    });
  });

  it('does not prepend a create suggestion when the query already exists', () => {
    const input = document.createElement('input');
    const app = new App();
    const items = normalizeTagSuggestionOptions([
      { name: 'alpha', count: 3 },
      { name: 'beta', count: 1 },
    ]);

    const suggest = new TagInputSuggest(app, input, {
      getItems: () => items,
      getQuery: () => 'alpha',
      isActive: () => true,
      onSelectTag: vi.fn(),
      createSuggestion: () => null,
    });

    const suggestions = suggest.getSuggestions('alpha');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].tag).toBe('alpha');
    expect(suggestions[0].isCreateSuggestion).not.toBe(true);
  });
});
