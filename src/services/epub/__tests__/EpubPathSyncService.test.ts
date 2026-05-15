import { rewriteEpubReferences } from '../EpubPathSyncService';

vi.mock('../../config/paths', () => ({
  getV2PathsFromApp: () => ({
    memory: {
      cards: 'weave/memory/cards',
    },
  }),
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

vi.mock('../../services/incremental-reading/IREpubBookmarkTaskService', () => ({
  IREpubBookmarkTaskService: class {
    updateEpubFileReferences = vi.fn(async () => 0);
  },
}));

vi.mock('../EpubStorageService', () => ({
  EpubStorageService: class {
    updateCanvasBindingReferences = vi.fn(async () => 0);
    updateBookFileReferences = vi.fn(async () => 0);
  },
}));

vi.mock('../EpubLinkService', () => ({
  EpubLinkService: class {
    static extractShortBookName(filePath: string): string {
      const name = String(filePath || '').split('/').pop() || '';
      return name.replace(/\.[^.]+$/, '');
    }
  },
}));

vi.mock('../epub-runtime', () => ({
  EPUB_RUNTIME: {
    protocol: {
      allNames: ['weave-epub'],
    },
  },
}));

describe('rewriteEpubReferences', () => {
  it('rewrites legacy weave-epub protocol links without truncating CFI parentheses', () => {
    const content =
      '[EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fold.epub&cfi=epubcfi(/6/2)&text=Hello)';

    const result = rewriteEpubReferences(content, 'Books/old.epub', 'Books/new.epub');

    expect(result.changed).toBe(true);
    expect(result.updatedLinks).toBe(1);
    expect(result.content).toBe(
      '[EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fnew.epub&cfi=epubcfi(/6/2)&text=Hello)',
    );
  });
});
