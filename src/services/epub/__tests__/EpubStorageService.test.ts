import { Platform, TFile } from 'obsidian';
import { EpubStorageService } from '../EpubStorageService';
import type { EpubBook } from '../types';

const SYNC_EPUB_ROOT = 'weave/incremental-reading/epub-reading';
const LOCAL_EPUB_DATA_PATH = '.obsidian/plugins/weave/state/incremental-reading/epub-reader-data.json';
const LOCAL_EPUB_STATE_ROOT = '.obsidian/plugins/weave/state/incremental-reading/reader-state/epub';
const LOCAL_EPUB_ARTIFACTS_ROOT = '.obsidian/plugins/weave/cache/incremental-reading/reader-artifacts/epub';

function readLocalEpubData(files: Map<string, string>) {
  return JSON.parse(files.get(LOCAL_EPUB_DATA_PATH) || '{}');
}

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
    expect(settings.viewportSidePadding).toBe(24);
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
      expect(settings.viewportSidePadding).toBe(18);
      expect(settings.widthMode).toBe('full');
      expect(settings.layoutMode).toBe('paginated');
      expect(settings.flowMode).toBe('scrolled');
    });
  });

  it('stores reader settings in the unified local epub data file on mobile', async () => {
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
        letterSpacing: 0.02,
        pageMargin: 40,
        viewportSidePadding: 22,
        widthMode: 'full',
        layoutMode: 'paginated',
        flowMode: 'scrolled',
        showScrolledSideNav: true,
      });
    });

    expect(files.has(LOCAL_EPUB_DATA_PATH)).toBe(true);
    expect(files.has(`${SYNC_EPUB_ROOT}/reader-settings.json`)).toBe(true);
    expect(files.has(`${SYNC_EPUB_ROOT}/reader-settings.mobile.json`)).toBe(false);
    expect(readLocalEpubData(files).readerSettings.mobile.flowMode).toBe('scrolled');
    expect(readLocalEpubData(files).readerSettings.mobile.viewportSidePadding).toBe(22);
    expect(JSON.parse(files.get(`${SYNC_EPUB_ROOT}/reader-settings.json`) || '{}').flowMode).toBe('paginated');
  });

  it('migrates the legacy mobile paginated default back to scrolled on mobile', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.mobile.json`]: JSON.stringify({
        lineHeight: 1.66,
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

  it('preserves explicit mobile paginated settings', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.mobile.json`]: JSON.stringify({
        lineHeight: 1.82,
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
      expect(settings.layoutMode).toBe('paginated');
      expect(settings.flowMode).toBe('paginated');
      expect(settings.showScrolledSideNav).toBe(false);
    });
  });

  it('upgrades untouched legacy desktop reader settings to the new comfortable defaults', async () => {
    const { app } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/reader-settings.desktop.json`]: JSON.stringify({
        lineHeight: 1.9,
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
    expect(files.has(LOCAL_EPUB_DATA_PATH)).toBe(false);
  });

  it('stores reading progress in unified local epub data without rewriting books.json', async () => {
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
    expect(writes).toContain(LOCAL_EPUB_DATA_PATH);

    const persistedBooks = JSON.parse(files.get(booksPath) || '{}');
    expect(persistedBooks['book-1'].currentPosition.percent).toBe(10);

    expect(readLocalEpubData(files).books['book-1'].state.currentPosition.percent).toBe(66);
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

  it('stores and loads the manual last-open bookmark in the unified local epub data file', async () => {
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

    expect(readLocalEpubData(files).books['book-1'].lastOpenBookmark).toEqual({
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

  it('stores, loads, and clears the reading reference point in the unified local epub data file', async () => {
    const { app, files } = createMemoryApp();
    const service = new EpubStorageService(app);

    await service.saveReadingReferencePoint('book-1', {
      chapterIndex: 3,
      cfi: 'epubcfi(/6/14!/4/2/8)',
      percent: 48.2,
      title: '第四章',
      savedAt: 1710000001000,
    });

    expect(readLocalEpubData(files).books['book-1'].readingReferencePoint).toEqual({
      chapterIndex: 3,
      cfi: 'epubcfi(/6/14!/4/2/8)',
      percent: 48.2,
      title: '第四章',
      savedAt: 1710000001000,
    });

    await expect(service.loadReadingReferencePoint('book-1')).resolves.toEqual({
      chapterIndex: 3,
      cfi: 'epubcfi(/6/14!/4/2/8)',
      percent: 48.2,
      title: '第四章',
      savedAt: 1710000001000,
    });

    await service.deleteReadingReferencePoint('book-1');

    expect(readLocalEpubData(files).books['book-1'].readingReferencePoint).toBeNull();
    await expect(service.loadReadingReferencePoint('book-1')).resolves.toBeNull();
  });

  it('stores concealed text fragments in the unified local epub data file', async () => {
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

    expect(readLocalEpubData(files).books['book-1'].concealedTexts).toEqual([
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

  it('can consolidate legacy epub local data into one plugin-local file and remove the legacy files', async () => {
    const { app, files } = createMemoryApp({
      [`${SYNC_EPUB_ROOT}/books.json`]: JSON.stringify({
        'book-1': createBook(),
      }),
      [`${SYNC_EPUB_ROOT}/book-1/bookmarks.json`]: JSON.stringify([
        {
          id: 'bookmark-1',
          title: 'Legacy bookmark',
          chapterIndex: 1,
          cfi: 'epubcfi(/6/4!/4/2/2)',
          preview: 'Legacy bookmark',
          createdTime: 1710000000000,
        },
      ]),
      [`${SYNC_EPUB_ROOT}/book-1/state.json`]: JSON.stringify({
        currentPosition: {
          chapterIndex: 2,
          cfi: '/6/8',
          percent: 66,
        },
        readingStats: {
          totalReadTime: 12,
          lastReadTime: 222,
          createdTime: 111,
        },
      }),
      [`${SYNC_EPUB_ROOT}/reader-settings.desktop.json`]: JSON.stringify({
        lineHeight: 1.8,
        widthMode: 'standard',
        layoutMode: 'paginated',
        flowMode: 'paginated',
        showScrolledSideNav: true,
      }),
      [`${SYNC_EPUB_ROOT}/canvas-bindings.json`]: JSON.stringify({
        'book-1': 'Canvas/demo.canvas',
      }),
      [`${SYNC_EPUB_ROOT}/epub-source-registry.json`]: JSON.stringify([
        {
          sourceId: 'epubsrc-1',
          filePath: 'Books/demo.epub',
          lastSeenAt: 1710000000000,
        },
      ]),
      [`${LOCAL_EPUB_ARTIFACTS_ROOT}/book-1/concealed-texts.json`]: JSON.stringify([
        {
          id: 'conceal-1',
          text: 'legacy conceal',
          mode: 'mask',
          chapterIndex: 1,
          cfiRange: '/6/4',
          createdTime: 333,
        },
      ]),
      [`${SYNC_EPUB_ROOT}/book-1/highlights.json`]: JSON.stringify([
        {
          id: 'highlight-legacy',
          text: 'legacy highlight',
          color: 'yellow',
          chapterIndex: 1,
          cfiRange: 'epubcfi(/6/4!/4/2/2)',
          createdTime: 444,
        },
      ]),
      [`${SYNC_EPUB_ROOT}/book-1/notes.json`]: JSON.stringify([
        {
          id: 'note-legacy',
          content: 'legacy note',
          quotedText: 'legacy quote',
          chapterIndex: 1,
          cfi: 'epubcfi(/6/4!/4/2/2)',
          createdTime: 555,
          modifiedTime: 555,
        },
      ]),
    });
    const service = new EpubStorageService(app);

    const report = await service.migrateLegacyLocalData({ cleanupLegacyFiles: true });
    const localData = readLocalEpubData(files);

    expect(report.failures).toEqual([]);
    expect(report.remainingLegacyFiles).toEqual([]);
    expect(localData).toMatchObject({
      bookCatalogStoredLocally: true,
      books: {
        'book-1': {
          descriptor: {
            id: 'book-1',
            filePath: 'Books/demo.epub',
            metadata: {
              title: 'Demo',
              author: 'Author',
            },
          },
          state: {
            currentPosition: {
              chapterIndex: 2,
              cfi: '/6/8',
              percent: 66,
            },
          },
          concealedTexts: [
            {
              id: 'conceal-1',
              cfiRange: '/6/4',
            },
          ],
        },
      },
      readerSettings: {
        desktop: {
          lineHeight: 1.8,
        },
      },
      canvasBindings: {
        'book-1': 'Canvas/demo.canvas',
      },
      sourceRegistry: [
        {
          sourceId: 'epubsrc-1',
          filePath: 'Books/demo.epub',
        },
      ],
    });
    expect(files.has(`${SYNC_EPUB_ROOT}/books.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/book-1/bookmarks.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/book-1/state.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/book-1/highlights.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/book-1/notes.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/reader-settings.desktop.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/canvas-bindings.json`)).toBe(false);
    expect(files.has(`${SYNC_EPUB_ROOT}/epub-source-registry.json`)).toBe(false);
    expect(files.has(`${LOCAL_EPUB_ARTIFACTS_ROOT}/book-1/concealed-texts.json`)).toBe(false);
  });

  it('persists canvas bindings into unified local data without recreating legacy sync files', async () => {
    const { app, files } = createMemoryApp();
    const service = new EpubStorageService(app);

    await service.setCanvasBinding('book-1', 'Canvas/demo.canvas');

    expect(await service.getCanvasBinding('book-1')).toBe('Canvas/demo.canvas');
    expect(readLocalEpubData(files).canvasBindings).toEqual({
      'book-1': 'Canvas/demo.canvas',
    });
    expect(files.has(`${SYNC_EPUB_ROOT}/canvas-bindings.json`)).toBe(false);
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
    const localData = readLocalEpubData(files);

    expect(entries.map((entry) => entry.path)).toEqual([
      'Books/new.epub',
      'Books/old.epub',
    ]);

    expect(localData.scanIndex).toEqual([
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
    expect(readLocalEpubData(files).bookshelfMembership).toBeUndefined();
  });

  it('adds selected scanned EPUB files into bookshelf membership only once', async () => {
    const { app, files } = createMemoryApp({}, ['Books/demo.epub', 'Books/other.epub']);

    const service = new EpubStorageService(app);
    await service.scanVaultEpubs();
    await service.addBooksToBookshelf(['Books/demo.epub', 'Books/demo.epub']);
    const bookshelfEntries = await service.listBookshelfEntries();

    expect(bookshelfEntries.map((entry) => entry.path)).toEqual(['Books/demo.epub']);
    expect(readLocalEpubData(files).bookshelfMembership).toEqual([
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
    const localData = readLocalEpubData(files);

    expect(updated).toBe(1);
    expect(localData.scanIndex).toEqual([
      {
        path: 'Books/new.epub',
        name: 'new',
        folder: 'Books',
        size: 1024,
        mtime: 0,
      },
    ]);
    expect(localData.bookshelfMembership).toEqual([
      {
        path: 'Books/new.epub',
        addedAt: 10,
      },
    ]);
    expect(localData.books['book-1'].descriptor.filePath).toBe('Books/new.epub');
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
    const localData = readLocalEpubData(files);
    const reloadedService = new EpubStorageService(app);

    expect(result.removedBookId).toBe('book-1');
    expect(JSON.parse(files.get(booksPath) || '{}')).toEqual({
      'book-1': createBook(),
    });
    expect(JSON.parse(files.get(scanIndexPath) || '[]')).toEqual([
      {
        path: 'Books/demo.epub',
        name: 'demo',
        folder: 'Books',
        size: 1024,
        mtime: 0,
      },
    ]);
    expect(localData.bookCatalogStoredLocally).toBe(true);
    expect(localData.books || {}).toEqual({});
    expect(localData.bookshelfMembership).toEqual([]);
    expect(files.has(`${LOCAL_EPUB_STATE_ROOT}/book-1/state.json`)).toBe(false);
    await expect(reloadedService.getBook('book-1')).resolves.toBeNull();
  });

  it('reuses the same source identity after the same epub is re-added under a new path', async () => {
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

    const localData = readLocalEpubData(files);
    expect(localData.books['book-2']?.descriptor?.sourceId).toBe(firstSourceId);
    await expect(service.resolveSourceFilePath(firstSourceId || '')).resolves.toBe(
      'Library/demo-renamed.epub'
    );
  });
});
