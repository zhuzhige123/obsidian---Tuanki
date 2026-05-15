import { TFile } from 'obsidian';
import { IRPointWriteService } from '../IRPointWriteService';
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
    vi.spyOn(service as any, 'deleteChunkPointFromNewStorage').mockResolvedValue(undefined);

    await service.deleteChunkData('chunk-1');

    expect(writeFile).not.toHaveBeenCalled();
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
    vi.spyOn(service as any, 'deleteChunkPointFromNewStorage').mockResolvedValue(undefined);

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

describe('IRStorageService.deleteDeck', () => {
  it('删除专题时应保留 Markdown 源文档，仅清理增量阅读 frontmatter 并追加已删除标签', async () => {
    const frontmatter: Record<string, unknown> = {
      'weave-reading-id': 'rm-deck-1',
      'weave-reading-category': 'later',
      'weave-reading-priority': 40,
      'weave-reading-ir-deck-id': 'deck-1',
      status: 'active',
      topic_tag: '#IR_deck_测试专题',
      chunk_id: 'chunk-1',
      source_id: 'source-1',
      weave_type: 'ir-chunk',
      tags: ['原标签']
    };

    const sourceFile = Object.assign(Object.create(TFile.prototype), {
      path: 'notes/topic-source.md'
    }) as TFile;

    const trashFile = vi.fn(async () => {});
    const remove = vi.fn(async () => {});
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((filePath: string) => filePath === 'notes/topic-source.md' ? sourceFile : null),
        adapter: {
          remove,
          exists: vi.fn(async () => false)
        }
      },
      fileManager: {
        trashFile,
        processFrontMatter: vi.fn(async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
          updater(frontmatter);
        })
      }
    };

    const service = new IRStorageService(app as any);
    vi.spyOn(service as any, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getAllDecks').mockResolvedValue({
      'deck-1': {
        id: 'deck-1',
        path: 'topics/deck-1',
        name: '测试专题',
        sourceFiles: ['notes/topic-source.md']
      }
    });
    vi.spyOn(service as any, 'getAllBlocks').mockResolvedValue({});
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({});
    vi.spyOn(service as any, 'getAllSources').mockResolvedValue({});
    vi.spyOn(service as any, 'getStudySessions').mockResolvedValue([]);
    vi.spyOn(service as any, 'getAllSyncStates').mockResolvedValue({});
    vi.spyOn(service as any, 'saveSyncStates').mockResolvedValue(undefined);

    const deletePointDeck = vi.fn(async () => ({ removed: true, topicName: '测试专题', pointIds: [], sourceFiles: [] }));
    vi.spyOn(service as any, 'getPointStorageService').mockReturnValue({
      deletePointDeck,
      deletePointByLegacyId: vi.fn(async () => undefined)
    });

    vi.spyOn(IRPointWriteService.prototype, 'deletePointsByDeckIdentifiers').mockResolvedValue(0);
    vi.spyOn(IRPointWriteService.prototype, 'deletePdfPointsByPaths').mockResolvedValue(0);
    vi.spyOn(IRPointWriteService.prototype, 'deleteEpubPointsByPaths').mockResolvedValue(0);

    await service.deleteDeck('deck-1');

    expect(deletePointDeck).toHaveBeenCalledWith('deck-1');
    expect(trashFile).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(frontmatter['weave-reading-id']).toBeUndefined();
    expect(frontmatter['weave-reading-category']).toBeUndefined();
    expect(frontmatter['weave-reading-priority']).toBeUndefined();
    expect(frontmatter['weave-reading-ir-deck-id']).toBeUndefined();
    expect(frontmatter.status).toBeUndefined();
    expect(frontmatter.topic_tag).toBeUndefined();
    expect(frontmatter.chunk_id).toBeUndefined();
    expect(frontmatter.source_id).toBeUndefined();
    expect(frontmatter.weave_type).toBeUndefined();
    expect(frontmatter.tags).toEqual(['原标签', 'we_已删除']);
  });

  it('删除专题时即使只剩外部文档字段也应清理并追加已删除标签', async () => {
    const frontmatter: Record<string, unknown> = {
      status: 'removed',
      priority_ui: 5,
      topic_tag: '#IR_deck_测试专题',
      deck_names: ['测试专题'],
      chunk_id: 'chunk-2',
      source_id: 'source-2',
      weave_type: 'ir-chunk',
      tags: ['旧标签']
    };

    const sourceFile = Object.assign(Object.create(TFile.prototype), {
      path: 'notes/topic-external.md'
    }) as TFile;

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((filePath: string) => filePath === 'notes/topic-external.md' ? sourceFile : null),
        adapter: {
          remove: vi.fn(async () => {}),
          exists: vi.fn(async () => false)
        }
      },
      fileManager: {
        trashFile: vi.fn(async () => {}),
        processFrontMatter: vi.fn(async (_file: TFile, updater: (fm: Record<string, unknown>) => void) => {
          updater(frontmatter);
        })
      }
    };

    const service = new IRStorageService(app as any);
    vi.spyOn(service as any, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getAllDecks').mockResolvedValue({
      'deck-1': {
        id: 'deck-1',
        path: 'topics/deck-1',
        name: '测试专题',
        sourceFiles: ['notes/topic-external.md']
      }
    });
    vi.spyOn(service as any, 'getAllBlocks').mockResolvedValue({});
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({});
    vi.spyOn(service as any, 'getAllSources').mockResolvedValue({});
    vi.spyOn(service as any, 'getStudySessions').mockResolvedValue([]);
    vi.spyOn(service as any, 'getAllSyncStates').mockResolvedValue({});
    vi.spyOn(service as any, 'saveSyncStates').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getPointStorageService').mockReturnValue({
      deletePointDeck: vi.fn(async () => ({ removed: true, topicName: '测试专题', pointIds: [], sourceFiles: [] })),
      deletePointByLegacyId: vi.fn(async () => undefined)
    });

    vi.spyOn(IRPointWriteService.prototype, 'deletePointsByDeckIdentifiers').mockResolvedValue(0);
    vi.spyOn(IRPointWriteService.prototype, 'deletePdfPointsByPaths').mockResolvedValue(0);
    vi.spyOn(IRPointWriteService.prototype, 'deleteEpubPointsByPaths').mockResolvedValue(0);

    await service.deleteDeck('deck-1');

    expect(frontmatter.status).toBeUndefined();
    expect(frontmatter.priority_ui).toBeUndefined();
    expect(frontmatter.topic_tag).toBeUndefined();
    expect(frontmatter.deck_names).toBeUndefined();
    expect(frontmatter.chunk_id).toBeUndefined();
    expect(frontmatter.source_id).toBeUndefined();
    expect(frontmatter.weave_type).toBeUndefined();
    expect(frontmatter.tags).toEqual(['旧标签', 'we_已删除']);
  });
});

describe('IRStorageService deprecated chunk/source write guards', () => {
  it('cleanupDeckChunksAndSources 不会再写回弃用的 chunks/sources 文件', async () => {
    const service = new IRStorageService({} as any);

    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({
      'chunk-1': {
        chunkId: 'chunk-1',
        sourceId: 'source-1',
        filePath: 'notes/source.md',
        deckIds: ['deck-1'],
        deckTag: '#TopicOne',
        priorityEff: 5,
        intervalDays: 1,
        nextRepDate: 0,
        scheduleStatus: 'queued'
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
    const writeFile = vi.spyOn(service as any, 'writeFile').mockResolvedValue(undefined);
    const deleteChunkPoint = vi
      .spyOn(service as any, 'deleteChunkPointFromNewStorage')
      .mockResolvedValue(undefined);

    await (service as any).cleanupDeckChunksAndSources('deck-1', '#TopicOne');

    expect(writeFile).not.toHaveBeenCalled();
    expect(deleteChunkPoint).toHaveBeenCalledWith('chunk-1');
  });

  it('cleanupInvalidChunks 不会再写回弃用的 chunks.json', async () => {
    const app = {
      vault: {
        adapter: {
          exists: vi.fn(async () => false)
        }
      }
    };
    const service = new IRStorageService(app as any);

    vi.spyOn(service as any, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({
      'chunk-1': {
        chunkId: 'chunk-1',
        sourceId: 'source-1',
        filePath: 'notes/missing.md',
        priorityEff: 5,
        intervalDays: 1,
        nextRepDate: 0,
        scheduleStatus: 'new'
      }
    });
    const writeFile = vi.spyOn(service as any, 'writeFile').mockResolvedValue(undefined);
    const deleteChunkPoint = vi
      .spyOn(service as any, 'deleteChunkPointFromNewStorage')
      .mockResolvedValue(undefined);

    const result = await service.cleanupInvalidChunks();

    expect(result.removed).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(deleteChunkPoint).toHaveBeenCalledWith('chunk-1');
  });

  it('cleanupInvalidSources 不会再写回弃用的 sources.json', async () => {
    const app = {
      vault: {
        adapter: {
          exists: vi.fn(async () => false)
        }
      }
    };
    const service = new IRStorageService(app as any);

    vi.spyOn(service as any, 'initialize').mockResolvedValue(undefined);
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
    vi.spyOn(service as any, 'getAllChunkData').mockResolvedValue({});
    const writeFile = vi.spyOn(service as any, 'writeFile').mockResolvedValue(undefined);

    const result = await service.cleanupInvalidSources();

    expect(result.removed).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
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
