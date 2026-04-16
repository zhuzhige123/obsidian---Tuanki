import { Platform, TFile } from 'obsidian';
import { EpubStorageService } from '../EpubStorageService';
import type { EpubBook } from '../types';

const SYNC_EPUB_ROOT = 'weave/incremental-reading/epub-reading';
const LOCAL_EPUB_STATE_ROOT = '.obsidian/plugins/weave/state/incremental-reading/reader-state/epub';
const LOCAL_EPUB_ARTIFACTS_ROOT = '.obsidian/plugins/weave/cache/incremental-reading/reader-artifacts/epub';

function createMemoryApp(
  initialFiles: Record<string, string> = {},
  vaultFiles: string[] = [],
  binaryFiles: Record<string, string | Uint8Array> = {}
) {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const writes: string[] = [];
  const normalizedVaultFiles = new Set(vaultFiles.map((path) => path.replace(/\\/g, '/')));
  const normalizedBinaryFiles = new Map(
    Object.entries(binaryFiles).map(([path, value]) => [path.replace(/\\/g, '/'), value] as const)
  );

  const ensureParentDirs = (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
    }
  };

  const list = (dir: string) => {
    const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
    const prefix = normalizedDir ? `${normalizedDir}/` : '';
    const folders = new Set<string>();
    const directFiles: string[] = [];
    const allPaths = new Set<string>([
      ...Array.from(files.keys()),
      ...Array.from(normalizedVaultFiles),
    ]);

    for (const path of allPaths) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest) continue;
      if (!rest.includes('/')) {
        directFiles.push(path);
        continue;
      }
      const folder = rest.split('/')[0];
      folders.add(prefix ? `${prefix}${folder}` : folder);
    }

    return { files: directFiles, folders: Array.from(folders) };
  };

  const createVaultFile = (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const extension = normalized.split('.').pop() || '';
    const basename = normalized.split('/').pop()?.replace(/\.[^.]+$/, '') || normalized;
    const folder = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
    return Object.assign(Object.create(TFile.prototype), {
      path: normalized,
      extension,
      basename,
      name: normalized.split('/').pop() || normalized,
      stat: { size: 1024 },
      parent: folder ? { path: folder } : null,
    });
  };

  const adapter = {
    exists: vi.fn(async (path: string) => {
      const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
      if (files.has(normalized) || normalizedVaultFiles.has(normalized)) return true;
      const prefix = normalized ? `${normalized}/` : '';
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          return true;
        }
      }
      for (const vaultFilePath of normalizedVaultFiles) {
        if (vaultFilePath.startsWith(prefix)) {
          return true;
        }
      }
      return false;
    }),
    read: vi.fn(async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`Missing file: ${path}`);
      return value;
    }),
    write: vi.fn(async (path: string, content: string) => {
      ensureParentDirs(path);
      files.set(path, content);
      writes.push(path);
    }),
    remove: vi.fn(async (path: string) => {
      files.delete(path.replace(/\\/g, '/'));
    }),
    mkdir: vi.fn(async () => {}),
    list: vi.fn(async (dir: string) => list(dir)),
    stat: vi.fn(async (path: string) => {
      const normalized = path.replace(/\\/g, '/');
      if (!normalizedVaultFiles.has(normalized)) {
        throw new Error(`Missing file: ${normalized}`);
      }
      return { size: 1024, mtime: 1710000000000 };
    }),
    readBinary: vi.fn(async (path: string) => {
      const normalized = path.replace(/\\/g, '/');
      const value = normalizedBinaryFiles.get(normalized) ?? normalized;
      return value instanceof Uint8Array ? value : new TextEncoder().encode(value);
    }),
    rmdir: vi.fn(async (dir: string) => {
      const prefix = `${dir.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
      for (const key of Array.from(files.keys())) {
        if (key.startsWith(prefix)) files.delete(key);
      }
    }),
  };

  const app: any = {
    vault: {
      adapter,
      configDir: '.obsidian',
      getAbstractFileByPath: vi.fn((path: string) => {
        const normalized = path.replace(/\\/g, '/');
        return normalizedVaultFiles.has(normalized) ? createVaultFile(normalized) : null;
      }),
      getFiles: vi.fn(() => Array.from(normalizedVaultFiles).map((path) => createVaultFile(path))),
    },
    plugins: {
      getPlugin: vi.fn(() => ({
        settings: { weaveParentFolder: '' },
      })),
    },
  };

  return { app, files, writes, vaultFiles: normalizedVaultFiles };
}

function createBook(overrides: Partial<EpubBook> = {}): EpubBook {
  return {
    id: 'book-1',
    filePath: 'Books/demo.epub',
    metadata: {
      title: 'Demo',
      author: 'Author',
      chapterCount: 3,
      coverImage: 'data:image/jpeg;base64,AAAA',
    },
    currentPosition: {
      chapterIndex: 0,
      cfi: '/6/2',
      percent: 10,
    },
    readingStats: {
      totalReadTime: 0,
      lastReadTime: 100,
      createdTime: 50,
    },
    ...overrides,
  };
}

async function withPlatformIsMobile<T>(value: boolean, run: () => Promise<T>): Promise<T> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(Platform, 'isMobile');
  Object.defineProperty(Platform, 'isMobile', {
    configurable: true,
    value,
  });
  try {
    return await run();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(Platform, 'isMobile', originalDescriptor);
    } else {
      delete (Platform as { isMobile?: boolean }).isMobile;
    }
  }
}

describe('EpubStorageService', () => {
  it('returns the updated comfortable reading defaults when no reader settings were saved', async () => {
    const { app } = createMemoryApp();

    const service = new EpubStorageService(app);
    const settings = await service.loadReaderSettings();

    expect(settings.lineHeight).toBe(1.72);
    expect(settings.widthMode).toBe('standard');
    expect(settings.layoutMode).toBe('paginated');
    expect(settings.flowMode).toBe('paginated');
  });

  it('returns scrolled reader defaults on mobile when no reader settings were saved', async () => {
    const { app } = createMemoryApp();

    await withPlatformIsMobile(true, async () => {
      const service = new EpubStorageService(app);
      const settings = await service.loadReaderSettings();

      expect(settings.lineHeight).toBe(1.66);
      expect(settings.widthMode).toBe('full');
      expect(settings.layoutMode).toBe('paginated');
      expect(settings.flowMode).toBe('scrolled');
    });
  });

  it('stores reader settings in a device-specific file on mobile', async () => {
    const { app, files } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.json`]: JSON.stringify({
        flowMode: 'paginated',
        layoutMode: 'paginated',
      }),
    });

    await withPlatformIsMobile(true, async () => {
      const service = new EpubStorageService(app);
      await service.saveReaderSettings({
        lineHeight: 1.9,
        theme: 'default',
        widthMode: 'full',
        layoutMode: 'paginated',
        flowMode: 'scrolled',
        showScrolledSideNav: true,
      });
    });

    expect(files.has(`${LOCAL_EPUB_STATE_ROOT}/reader-settings.mobile.json`)).toBe(true);
    expect(files.has(`${SYNC_EPUB_ROOT}/reader-settings.json`)).toBe(true);
    expect(files.has(`${SYNC_EPUB_ROOT}/reader-settings.mobile.json`)).toBe(false);
    expect(JSON.parse(files.get(`${LOCAL_EPUB_STATE_ROOT}/reader-settings.mobile.json`) || '{}').flowMode).toBe('scrolled');
    expect(JSON.parse(files.get(`${SYNC_EPUB_ROOT}/reader-settings.json`) || '{}').flowMode).toBe('paginated');
  });

  it('migrates the legacy mobile paginated default back to scrolled on mobile', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.mobile.json`]: JSON.stringify({
        lineHeight: 1.66,
        theme: 'default',
        widthMode: 'full',
        layoutMode: 'paginated',
        flowMode: 'paginated',
        showScrolledSideNav: true,
      }),
    });

    await withPlatformIsMobile(true, async () => {
      const service = new EpubStorageService(app);
      const settings = await service.loadReaderSettings();

      expect(settings.layoutMode).toBe('paginated');
      expect(settings.flowMode).toBe('scrolled');
    });
  });

  it('forces saved mobile paginated settings back to scrolled to avoid blank mobile rendering', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.mobile.json`]: JSON.stringify({
        lineHeight: 1.82,
        theme: 'sepia',
        widthMode: 'full',
        layoutMode: 'paginated',
        flowMode: 'paginated',
        showScrolledSideNav: false,
      }),
    });

    await withPlatformIsMobile(true, async () => {
      const service = new EpubStorageService(app);
      const settings = await service.loadReaderSettings();

      expect(settings.lineHeight).toBe(1.82);
      expect(settings.theme).toBe('sepia');
      expect(settings.layoutMode).toBe('paginated');
      expect(settings.flowMode).toBe('scrolled');
      expect(settings.showScrolledSideNav).toBe(false);
    });
  });

  it('upgrades untouched legacy desktop reader settings to the new comfortable defaults', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.desktop.json`]: JSON.stringify({
        lineHeight: 1.9,
        theme: 'default',
        widthMode: 'full',
        layoutMode: 'paginated',
        flowMode: 'paginated',
        showScrolledSideNav: true,
      }),
    });

    const service = new EpubStorageService(app);
    const settings = await service.loadReaderSettings();

    expect(settings.lineHeight).toBe(1.72);
    expect(settings.widthMode).toBe('standard');
    expect(settings.layoutMode).toBe('paginated');
    expect(settings.flowMode).toBe('paginated');
  });

  it('migrates legacy epub-reading data into incremental-reading on first access', async () => {
    const { app, files } = createMemoryApp({
      'weave/epub-reading/books.json': JSON.stringify({
        'book-1': createBook(),
      }),
      'weave/epub-reading/book-1/state.json': JSON.stringify({
        currentPosition: {
          chapterIndex: 1,
          cfi: '/6/6',
          percent: 42,
        },
        readingStats: {
          totalReadTime: 10,
          lastReadTime: 999,
          createdTime: 50,
        },
      }),
    });

    const service = new EpubStorageService(app);
    const book = await service.getBook('book-1');

    expect(book?.currentPosition.percent).toBe(42);
    expect(files.has(`${SYNC_EPUB_ROOT}/books.json`)).toBe(true);
    expect(files.has(`${SYNC_EPUB_ROOT}/book-1/state.json`)).toBe(true);
  });

  it('stores reading progress in per-book state without rewriting books.json', async () => {
    const booksPath = `${SYNC_EPUB_ROOT}/books.json`;
    const { app, files, writes } = createMemoryApp({
      [booksPath]: JSON.stringify({
        'book-1': createBook(),
      }),
    });

    const service = new EpubStorageService(app);

    await service.saveProgress('book-1', {
      chapterIndex: 2,
      cfi: '/6/8',
      percent: 66,
    });
    await service.flushPendingProgress();

    expect(writes).not.toContain(booksPath);
    expect(writes).toContain(`${LOCAL_EPUB_STATE_ROOT}/book-1/state.json`);

    const persistedBooks = JSON.parse(files.get(booksPath) || '{}');
    expect(persistedBooks['book-1'].currentPosition.percent).toBe(10);

    const state = JSON.parse(files.get(`${LOCAL_EPUB_STATE_ROOT}/book-1/state.json`) || '{}');
    expect(state.currentPosition.percent).toBe(66);
  });

  it('hydrates persisted per-book state on reload', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/books.json`]: JSON.stringify({
        'book-1': createBook(),
      }),
      [`${LOCAL_EPUB_STATE_ROOT}/book-1/state.json`]: JSON.stringify({
        currentPosition: {
          chapterIndex: 1,
          cfi: '/6/6',
          percent: 42,
        },
        readingStats: {
          totalReadTime: 10,
          lastReadTime: 999,
          createdTime: 50,
        },
      }),
    });

    const service = new EpubStorageService(app);
    const book = await service.getBook('book-1');

    expect(book?.currentPosition.percent).toBe(42);
    expect(book?.readingStats.lastReadTime).toBe(999);
  });

  it('stores and loads the manual last-open bookmark in a dedicated per-book file', async () => {
    const { app, files } = createMemoryApp();
    const service = new EpubStorageService(app);

    await service.saveLastOpenBookmark('book-1', {
      chapterIndex: 2,
      cfi: 'epubcfi(/6/10!/4/2/6)',
      percent: 61.5,
      title: '第三章',
      preview: '第三章',
      savedAt: 1710000000000,
    });

    expect(JSON.parse(files.get(`${LOCAL_EPUB_STATE_ROOT}/book-1/last-open-bookmark.json`) || 'null')).toEqual({
      chapterIndex: 2,
      cfi: 'epubcfi(/6/10!/4/2/6)',
      percent: 61.5,
      title: '第三章',
      preview: '第三章',
      savedAt: 1710000000000,
    });

    const restored = await service.loadLastOpenBookmark('book-1');
    expect(restored).toEqual({
      chapterIndex: 2,
      cfi: 'epubcfi(/6/10!/4/2/6)',
      percent: 61.5,
      title: '第三章',
      preview: '第三章',
      savedAt: 1710000000000,
    });
  });

  it('loads the manual last-open bookmark from the legacy sync path when local state is absent', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/book-1/last-open-bookmark.json`]: JSON.stringify({
        chapterIndex: 1,
        cfi: 'epubcfi(/6/8!/4/2/4)',
        percent: 33.3,
        title: 'legacy',
        preview: 'legacy',
        savedAt: 1710000000001,
      }),
    });
    const service = new EpubStorageService(app);

    await expect(service.loadLastOpenBookmark('book-1')).resolves.toEqual({
      chapterIndex: 1,
      cfi: 'epubcfi(/6/8!/4/2/4)',
      percent: 33.3,
      title: 'legacy',
      preview: 'legacy',
      savedAt: 1710000000001,
    });
  });

  it('stores concealed text fragments in a dedicated per-book file', async () => {
    const { app, files } = createMemoryApp();
    const service = new EpubStorageService(app);

    await service.saveConcealedTexts('book-1', [
      {
        id: 'conceal-1',
        text: '低价值片段',
        mode: 'mask',
        chapterIndex: 1,
        cfiRange: '/6/4',
        createdTime: 123,
      },
    ]);

    expect(JSON.parse(files.get(`${LOCAL_EPUB_ARTIFACTS_ROOT}/book-1/concealed-texts.json`) || '[]')).toEqual([
      {
        id: 'conceal-1',
        text: '低价值片段',
        mode: 'mask',
        chapterIndex: 1,
        cfiRange: '/6/4',
        createdTime: 123,
      },
    ]);
  });

  it('loads concealed text fragments from the legacy sync path when local artifacts are absent', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/book-1/concealed-texts.json`]: JSON.stringify([
        {
          id: 'conceal-legacy',
          text: 'legacy text',
          mode: 'mask',
          chapterIndex: 2,
          cfiRange: '/6/8',
          createdTime: 456,
        },
      ]),
    });
    const service = new EpubStorageService(app);

    await expect(service.loadConcealedTexts('book-1')).resolves.toEqual([
      {
        id: 'conceal-legacy',
        text: 'legacy text',
        mode: 'mask',
        chapterIndex: 2,
        cfiRange: '/6/8',
        createdTime: 456,
      },
    ]);
  });

  it('deduplicates concealed text fragments by cfi range when adding repeatedly', async () => {
    const { app } = createMemoryApp();
    const service = new EpubStorageService(app);

    await service.addConcealedText('book-1', {
      id: 'conceal-1',
      text: '第一次',
      mode: 'mask',
      chapterIndex: 1,
      cfiRange: '/6/4',
      createdTime: 123,
    });
    await service.addConcealedText('book-1', {
      id: 'conceal-2',
      text: '第二次',
      mode: 'mask',
      chapterIndex: 1,
      cfiRange: '/6/4',
      createdTime: 456,
    });

    expect(await service.loadConcealedTexts('book-1')).toEqual([
      {
        id: 'conceal-2',
        text: '第二次',
        mode: 'mask',
        chapterIndex: 1,
        cfiRange: '/6/4',
        createdTime: 456,
      },
    ]);
  });

  it('refreshes folder bookshelf entries when cached folder data misses new epub files', async () => {
    const indexPath = 'weave/incremental-reading/epub-reading/epub-scan-index.json';
    const { app, files } = createMemoryApp({
      [indexPath]: JSON.stringify([
        {
          path: 'Books/old.epub',
          name: 'old',
          folder: 'Books',
          size: 1024,
          mtime: 0,
        },
        {
          path: 'Other/outside.epub',
          name: 'outside',
          folder: 'Other',
          size: 1024,
          mtime: 0,
        },
      ]),
    }, ['Books/old.epub', 'Books/new.epub', 'Other/outside.epub']);

    const service = new EpubStorageService(app);
    const entries = await service.loadBookshelfEntriesForFolder('Books');

    expect(entries.map((entry) => entry.path)).toEqual([
      'Books/new.epub',
      'Books/old.epub',
    ]);

    expect(JSON.parse(files.get(indexPath) || '[]')).toEqual([
      {
        path: 'Books/new.epub',
        name: 'new',
        folder: 'Books',
        size: 1024,
        mtime: 0,
      },
      {
        path: 'Books/old.epub',
        name: 'old',
        folder: 'Books',
        size: 1024,
        mtime: 0,
      },
      {
        path: 'Other/outside.epub',
        name: 'outside',
        folder: 'Other',
        size: 1024,
        mtime: 0,
      },
    ]);
  });

  it('does not resurrect bookshelf entries from books cache when stored index is explicitly empty', async () => {
    const booksPath = `${SYNC_EPUB_ROOT}/books.json`;
    const indexPath = 'weave/incremental-reading/epub-reading/bookshelf-index.json';
    const { app } = createMemoryApp({
      [booksPath]: JSON.stringify({
        'book-1': createBook(),
      }),
      [indexPath]: JSON.stringify([]),
    }, ['Books/demo.epub']);

    const service = new EpubStorageService(app);
    const entries = await service.loadBookshelfIndex();

    expect(entries).toEqual([]);
  });

  it('keeps scanned EPUB files out of the bookshelf until the user adds membership', async () => {
    const { app, files } = createMemoryApp({}, ['Books/demo.epub', 'Books/other.epub']);

    const service = new EpubStorageService(app);
    const scanEntries = await service.scanVaultEpubs();
    const bookshelfEntries = await service.listBookshelfEntries();

    expect(scanEntries.map((entry) => entry.path)).toEqual(['Books/demo.epub', 'Books/other.epub']);
    expect(bookshelfEntries).toEqual([]);
    expect(JSON.parse(files.get('weave/incremental-reading/epub-reading/bookshelf-membership.json') || '[]')).toEqual([]);
  });

  it('adds selected scanned EPUB files into bookshelf membership only once', async () => {
    const { app, files } = createMemoryApp({}, ['Books/demo.epub', 'Books/other.epub']);

    const service = new EpubStorageService(app);
    await service.scanVaultEpubs();
    await service.addBooksToBookshelf(['Books/demo.epub', 'Books/demo.epub']);
    const bookshelfEntries = await service.listBookshelfEntries();

    expect(bookshelfEntries.map((entry) => entry.path)).toEqual(['Books/demo.epub']);
    expect(JSON.parse(files.get('weave/incremental-reading/epub-reading/bookshelf-membership.json') || '[]')).toEqual([
      {
        path: 'Books/demo.epub',
        addedAt: expect.any(Number),
      },
    ]);
  });

  it('updates scan index and membership paths when an EPUB file is renamed', async () => {
    const scanIndexPath = `${SYNC_EPUB_ROOT}/epub-scan-index.json`;
    const membershipPath = `${SYNC_EPUB_ROOT}/bookshelf-membership.json`;
    const booksPath = `${SYNC_EPUB_ROOT}/books.json`;
    const { app, files } = createMemoryApp({
      [scanIndexPath]: JSON.stringify([
        {
          path: 'Books/old.epub',
          name: 'old',
          folder: 'Books',
          size: 1024,
          mtime: 0,
        },
      ]),
      [membershipPath]: JSON.stringify([
        {
          path: 'Books/old.epub',
          addedAt: 10,
        },
      ]),
      [booksPath]: JSON.stringify({
        'book-1': createBook({ filePath: 'Books/old.epub' }),
      }),
    }, ['Books/new.epub']);

    const service = new EpubStorageService(app);
    const updated = await service.updateBookFileReferences('Books/old.epub', 'Books/new.epub');

    expect(updated).toBe(1);
    expect(JSON.parse(files.get(scanIndexPath) || '[]')).toEqual([
      {
        path: 'Books/new.epub',
        name: 'new',
        folder: 'Books',
        size: 1024,
        mtime: 0,
      },
    ]);
    expect(JSON.parse(files.get(membershipPath) || '[]')).toEqual([
      {
        path: 'Books/new.epub',
        addedAt: 10,
      },
    ]);
  });

  it('removes book cache and bookshelf index by file path for reimport', async () => {
    const booksPath = `${SYNC_EPUB_ROOT}/books.json`;
    const scanIndexPath = `${SYNC_EPUB_ROOT}/epub-scan-index.json`;
    const membershipPath = `${SYNC_EPUB_ROOT}/bookshelf-membership.json`;
    const { app, files } = createMemoryApp({
      [booksPath]: JSON.stringify({
        'book-1': createBook(),
      }),
      [scanIndexPath]: JSON.stringify([
        {
          path: 'Books/demo.epub',
          name: 'demo',
          folder: 'Books',
          size: 1024,
          mtime: 0,
        },
      ]),
      [membershipPath]: JSON.stringify([
        {
          path: 'Books/demo.epub',
          addedAt: 100,
        },
      ]),
      [`${LOCAL_EPUB_STATE_ROOT}/book-1/state.json`]: JSON.stringify({
        currentPosition: {
          chapterIndex: 2,
          cfi: '/6/8',
          percent: 66,
        },
        readingStats: {
          totalReadTime: 10,
          lastReadTime: 999,
          createdTime: 50,
        },
      }),
    }, ['Books/demo.epub']);

    const service = new EpubStorageService(app);
    const result = await service.removeBookByFilePath('Books/demo.epub');

    expect(result.removedBookId).toBe('book-1');
    expect(JSON.parse(files.get(booksPath) || '{}')).toEqual({});
    expect(JSON.parse(files.get(scanIndexPath) || '[]')).toEqual([
      {
        path: 'Books/demo.epub',
        name: 'demo',
        folder: 'Books',
        size: 1024,
        mtime: 0,
      },
    ]);
    expect(JSON.parse(files.get(membershipPath) || '[]')).toEqual([]);
    expect(files.has(`${LOCAL_EPUB_STATE_ROOT}/book-1/state.json`)).toBe(false);
  });

  it('reuses the same source identity after the same epub is re-added under a new path', async () => {
    const booksPath = `${SYNC_EPUB_ROOT}/books.json`;
    const { app, files, vaultFiles } = createMemoryApp({}, ['Books/demo.epub'], {
      'Books/demo.epub': 'same-binary-epub',
      'Library/demo-renamed.epub': 'same-binary-epub',
    });

    const service = new EpubStorageService(app);
    const firstBook = createBook({ filePath: 'Books/demo.epub' });
    await service.saveBook(firstBook);

    const firstSourceId = (await service.findBookByFilePath('Books/demo.epub'))?.sourceId;
    expect(firstSourceId).toBeTruthy();

    vaultFiles.delete('Books/demo.epub');
    vaultFiles.add('Library/demo-renamed.epub');

    await service.pruneMissingBooks();

    const reimportedBook = createBook({
      id: 'book-2',
      filePath: 'Library/demo-renamed.epub',
      readingStats: {
        totalReadTime: 0,
        lastReadTime: 200,
        createdTime: 200,
      },
    });
    await service.saveBook(reimportedBook);

    const savedBooks = JSON.parse(files.get(booksPath) || '{}');
    expect(savedBooks['book-2']?.sourceId).toBe(firstSourceId);
    await expect(service.resolveSourceFilePath(firstSourceId || '')).resolves.toBe(
      'Library/demo-renamed.epub'
    );
  });
});
