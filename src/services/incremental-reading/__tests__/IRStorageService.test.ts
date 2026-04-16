import { TFile } from 'obsidian';
import { IREpubBookmarkTaskService } from '../IREpubBookmarkTaskService';
import { IRPdfBookmarkTaskService } from '../IRPdfBookmarkTaskService';
import { IRStorageService } from '../IRStorageService';

describe('IRStorageService.deleteChunkData', () => {
  it('删除最后一个同源阅读块时应清理源 Markdown 的增量阅读 frontmatter 并追加已删除标签', async () => {
    const frontmatter: Record<string, unknown> = {
      'weave-reading-id': 'rm-1',
      'weave-reading-category': 'later',
      'weave-reading-priority': 50,
      'weave-reading-ir-deck-id': 'deck-1',
      tags: ['已有标签']
    };

    const sourceFile = Object.assign(Object.create(TFile.prototype), {
      path: 'notes/source.md'
    }) as TFile;

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((filePath: string) => filePath === 'notes/source.md' ? sourceFile : null)
      },
      fileManager: {
        processFrontMatter: vi.fn(async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
          updater(frontmatter);
        })
      }
    };

    const service = new IRStorageService(app as any);

    vi.spyOn(service as any, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({
      'chunk-1': {
        chunkId: 'chunk-1',
        sourceId: 'source-1',
        filePath: 'weave/incremental-reading/chunks/chunk-1.md',
        priorityEff: 5,
        intervalDays: 1,
        nextRepDate: 0,
        scheduleStatus: 'new'
      }
    });
    vi.spyOn(service as any, 'getAllSources').mockResolvedValue({
      'source-1': {
        sourceId: 'source-1',
        originalPath: 'notes/source.md',
        rawFilePath: '',
        indexFilePath: 'weave/incremental-reading/index/source-1.md',
        chunkIds: ['chunk-1'],
        title: 'source',
        tagGroup: 'default',
        createdAt: 0,
        updatedAt: 0
      }
    });
    vi.spyOn(service as any, 'getAllDecks').mockResolvedValue({
      'deck-1': {
        id: 'deck-1',
        name: '测试牌组',
        description: '',
        icon: 'book',
        color: '#fff',
        blockIds: ['chunk-1'],
        sourceFiles: ['notes/source.md'],
        settings: {} as any,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null
      }
    });

    const writeFile = vi.spyOn(service as any, 'writeFile').mockResolvedValue(undefined);
    const saveDeck = vi.spyOn(service as any, 'saveDeck').mockResolvedValue(undefined);
    const deleteFileSyncState = vi.spyOn(service as any, 'deleteFileSyncState').mockResolvedValue(undefined);

    await service.deleteChunkData('chunk-1');

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(saveDeck).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: [],
      sourceFiles: []
    }));
    expect(deleteFileSyncState).toHaveBeenCalledWith('notes/source.md');
    expect(frontmatter['weave-reading-id']).toBeUndefined();
    expect(frontmatter['weave-reading-category']).toBeUndefined();
    expect(frontmatter['weave-reading-priority']).toBeUndefined();
    expect(frontmatter['weave-reading-ir-deck-id']).toBeUndefined();
    expect(frontmatter.tags).toEqual(['已有标签', 'we_已删除']);
  });

  it('删除外部文档型阅读点时应直接清理当前 md 文件中的 IR frontmatter', async () => {
    const frontmatter: Record<string, unknown> = {
      'weave-reading-id': 'tk-ir-1774527568327',
      'weave-reading-category': 'later',
      'weave-reading-priority': 50,
      'weave-reading-ir-deck-id': 'deck-idzpvkcn',
      status: 'active',
      tags: ['旧标签']
    };

    const externalFile = Object.assign(Object.create(TFile.prototype), {
      path: 'notes/external-ir.md'
    }) as TFile;

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((filePath: string) => filePath === 'notes/external-ir.md' ? externalFile : null)
      },
      fileManager: {
        processFrontMatter: vi.fn(async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
          updater(frontmatter);
        })
      }
    };

    const service = new IRStorageService(app as any);

    vi.spyOn(service as any, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({
      'chunk-external': {
        chunkId: 'chunk-external',
        sourceId: 'source-external',
        filePath: 'notes/external-ir.md',
        priorityEff: 5,
        intervalDays: 1,
        nextRepDate: 0,
        scheduleStatus: 'queued',
        meta: {
          externalDocument: true
        }
      }
    });
    vi.spyOn(service as any, 'getAllSources').mockResolvedValue({});
    vi.spyOn(service as any, 'getAllDecks').mockResolvedValue({
      'deck-1': {
        id: 'deck-1',
        name: '测试牌组',
        description: '',
        icon: 'book',
        color: '#fff',
        blockIds: ['chunk-external'],
        sourceFiles: ['notes/external-ir.md'],
        settings: {} as any,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null
      }
    });

    const saveDeck = vi.spyOn(service as any, 'saveDeck').mockResolvedValue(undefined);
    const deleteFileSyncState = vi.spyOn(service as any, 'deleteFileSyncState').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'writeFile').mockResolvedValue(undefined);

    await service.deleteChunkData('chunk-external');

    expect(saveDeck).toHaveBeenCalledWith(expect.objectContaining({
      blockIds: [],
      sourceFiles: []
    }));
    expect(deleteFileSyncState).toHaveBeenCalledWith('notes/external-ir.md');
    expect(frontmatter['weave-reading-id']).toBeUndefined();
    expect(frontmatter['weave-reading-category']).toBeUndefined();
    expect(frontmatter['weave-reading-priority']).toBeUndefined();
    expect(frontmatter['weave-reading-ir-deck-id']).toBeUndefined();
    expect(frontmatter.status).toBeUndefined();
    expect(frontmatter.tags).toEqual(['旧标签', 'we_已删除']);
  });
});

describe('IRStorageService.getDeckStats', () => {
  it('会将 EPUB 书签任务计入专题统计与文件数', async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null)
      },
      metadataCache: {
        getFileCache: vi.fn(() => null)
      }
    };

    const service = new IRStorageService(app as any);

    vi.spyOn(service as any, 'getBlocksByDeck').mockResolvedValue([]);
    vi.spyOn(service as any, 'getDeckById').mockResolvedValue({
      id: 'deck-1',
      name: '测试专题'
    });
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({});
    vi.spyOn(service as any, 'countQuestionsInFiles').mockResolvedValue({
      total: 0,
      completed: 0
    });

    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'getTasksByDeck').mockResolvedValue([]);
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([]);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'getTasksByDeck').mockResolvedValue([
      {
        id: 'epubbm-new',
        deckId: 'deck-1',
        epubFilePath: 'books/demo.epub',
        status: 'new',
        nextRepDate: 0
      },
      {
        id: 'epubbm-scheduled',
        deckId: 'deck-1',
        epubFilePath: 'books/demo.epub',
        status: 'scheduled',
        nextRepDate: Date.now() + 2 * 24 * 60 * 60 * 1000
      }
    ] as any);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([
      {
        id: 'epubbm-new',
        deckId: 'deck-1',
        epubFilePath: 'books/demo.epub',
        status: 'new',
        nextRepDate: 0
      },
      {
        id: 'epubbm-scheduled',
        deckId: 'deck-1',
        epubFilePath: 'books/demo.epub',
        status: 'scheduled',
        nextRepDate: Date.now() + 2 * 24 * 60 * 60 * 1000
      }
    ] as any);

    const stats = await service.getDeckStats('deck-1', 20, 50, 3);

    expect(stats.totalCount).toBe(2);
    expect(stats.newCount).toBe(1);
    expect(stats.reviewCount).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.dueWithinDays).toBe(2);
    expect(stats.fileCount).toBe(1);
  });

  it('传入 deckId 时也会兼容统计挂在旧 deckPath 上的书签任务', async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null)
      },
      metadataCache: {
        getFileCache: vi.fn(() => null)
      }
    };

    const service = new IRStorageService(app as any);

    vi.spyOn(service as any, 'getBlocksByDeck').mockResolvedValue([]);
    vi.spyOn(service as any, 'getDeckById').mockResolvedValue({
      id: 'deck-1',
      path: 'topics/demo',
      name: '测试专题'
    });
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({});
    vi.spyOn(service as any, 'countQuestionsInFiles').mockResolvedValue({
      total: 0,
      completed: 0
    });

    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'getTasksByDeck').mockImplementation(async (deckId: string) => {
      if (deckId !== 'topics/demo') return [];
      return [
        {
          id: 'pdfbm-1',
          deckId: 'topics/demo',
          pdfPath: 'pdfs/demo.pdf',
          status: 'new',
          nextRepDate: 0
        }
      ] as any;
    });
    vi.spyOn(IRPdfBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([
      {
        id: 'pdfbm-1',
        deckId: 'topics/demo',
        pdfPath: 'pdfs/demo.pdf',
        status: 'new',
        nextRepDate: 0
      }
    ] as any);

    vi.spyOn(IREpubBookmarkTaskService.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'getTasksByDeck').mockImplementation(async (deckId: string) => {
      if (deckId !== 'topics/demo') return [];
      return [
        {
          id: 'epubbm-legacy-path',
          deckId: 'topics/demo',
          epubFilePath: 'books/demo.epub',
          status: 'scheduled',
          nextRepDate: Date.now() + 24 * 60 * 60 * 1000
        }
      ] as any;
    });
    vi.spyOn(IREpubBookmarkTaskService.prototype, 'getAllTasks').mockResolvedValue([
      {
        id: 'epubbm-legacy-path',
        deckId: 'topics/demo',
        epubFilePath: 'books/demo.epub',
        status: 'scheduled',
        nextRepDate: Date.now() + 24 * 60 * 60 * 1000
      }
    ] as any);

    const stats = await service.getDeckStats('deck-1', 20, 50, 3);

    expect(stats.totalCount).toBe(2);
    expect(stats.newCount).toBe(1);
    expect(stats.reviewCount).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.dueWithinDays).toBe(2);
    expect(stats.fileCount).toBe(2);
  });
});

describe('IRStorageService study session deck compatibility', () => {
  it('getStudySessionsByDeck 会兼容读取挂在旧 deckPath 上的会话', async () => {
    const service = new IRStorageService({} as any);

    vi.spyOn(service as any, 'getStudySessions').mockResolvedValue([
      {
        id: 'session-legacy',
        deckId: 'topics/demo',
        topicId: 'topics/demo'
      },
      {
        id: 'session-canonical',
        deckId: 'deck-1',
        topicId: 'deck-1'
      },
      {
        id: 'session-other',
        deckId: 'deck-2',
        topicId: 'deck-2'
      }
    ] as any);
    vi.spyOn(service as any, 'getDeckById').mockResolvedValue({
      id: 'deck-1',
      path: 'topics/demo'
    });

    const sessions = await service.getStudySessionsByDeck('deck-1');

    expect(sessions.map((session: any) => session.id)).toEqual([
      'session-legacy',
      'session-canonical'
    ]);
  });

  it('cleanupDeckStudySessions 会清理挂在旧 deckPath 上的会话', async () => {
    const service = new IRStorageService({} as any);

    vi.spyOn(service as any, 'getStudySessions').mockResolvedValue([
      {
        id: 'session-legacy',
        deckId: 'topics/demo',
        topicId: 'topics/demo'
      },
      {
        id: 'session-canonical',
        deckId: 'deck-1',
        topicId: 'deck-1'
      },
      {
        id: 'session-other',
        deckId: 'deck-2',
        topicId: 'deck-2'
      }
    ] as any);
    const writeFile = vi.spyOn(service as any, 'writeFile').mockResolvedValue(undefined);

    await (service as any).cleanupDeckStudySessions('deck-1', 'topics/demo');

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('study-sessions.json'),
      expect.stringContaining('session-other')
    );
    expect(writeFile).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('session-legacy')
    );
    expect(writeFile).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('session-canonical')
    );
  });
});
