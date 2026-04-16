import { TFile } from 'obsidian';
import { ReadingMaterialManager } from '../ReadingMaterialManager';
import { IRStorageService } from '../IRStorageService';
import { ReadingCategory } from '../../../types/incremental-reading-types';

describe('ReadingMaterialManager', () => {
  it('md 文件创建阅读材料时应直接使用源文档，不复制到导入目录', async () => {
    const saveMaterial = vi.fn(async () => {});
    const initializeReadingFields = vi.fn(async () => {});
    const read = vi.fn(async () => '# 标题\n\n正文内容');
    const create = vi.fn();
    const createBinary = vi.fn();

    const app = {
      metadataCache: {
        getFileCache: vi.fn(() => null)
      },
      vault: {
        read,
        create,
        createBinary,
        adapter: {
          exists: vi.fn(async () => false)
        }
      }
    };

    const storage = {
      saveMaterial
    };

    const yamlManager = {
      initializeReadingFields
    };

    const manager = new ReadingMaterialManager(
      app as any,
      storage as any,
      yamlManager as any
    );

    const file = {
      path: 'notes/source.md',
      basename: 'source',
      extension: 'md'
    };

    const material = await manager.createMaterial(file as any, {
      category: ReadingCategory.Later,
      priority: 42,
      copyToImportFolder: true,
      importFolder: 'weave/incremental-reading/IR'
    });

    expect(create).not.toHaveBeenCalled();
    expect(createBinary).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledWith(file);
    expect(saveMaterial).toHaveBeenCalledTimes(1);
    expect(initializeReadingFields).toHaveBeenCalledWith(
      file,
      material.uuid,
      ReadingCategory.Later,
      42
    );
    expect(material.filePath).toBe('notes/source.md');
    expect(material.title).toBe('source');
  });

  it('拆分 Markdown 导入时应生成多个独立 md 文件并写入阅读信息', async () => {
    const createdFiles = new Map<string, string>();
    const existingPaths = new Set<string>();
    const materialStore = new Map<string, any>();

    const read = vi.fn(async (file: { path: string }) => createdFiles.get(file.path) ?? '# 标题\n\n正文内容');
    const create = vi.fn(async (path: string, content: string) => {
      createdFiles.set(path, content);
      existingPaths.add(path);
      const basename = path.split('/').pop()!.replace(/\.md$/, '');
      return {
        path,
        basename,
        extension: 'md'
      };
    });

    const app = {
      metadataCache: {
        getFileCache: vi.fn(() => null)
      },
      vault: {
        read,
        create,
        adapter: {
          exists: vi.fn(async (path: string) => existingPaths.has(path)),
          mkdir: vi.fn(async (path: string) => {
            existingPaths.add(path);
          })
        }
      }
    };

    const storage = {
      saveMaterial: vi.fn(async (material: any) => {
        materialStore.set(material.uuid, { ...material });
      }),
      getMaterialById: vi.fn((uuid: string) => materialStore.get(uuid) ?? null)
    };

    const yamlManager = {
      initializeReadingFields: vi.fn(async () => {}),
      updateReadingFields: vi.fn(async () => {})
    };

    const manager = new ReadingMaterialManager(
      app as any,
      storage as any,
      yamlManager as any
    );

    const sourceFile = {
      path: 'notes/source.md',
      basename: 'source',
      extension: 'md'
    };

    const imported = await manager.createSplitMarkdownMaterials(
      sourceFile as any,
      [
        {
          title: '第一节',
          content: '# 第一节\n\n内容 A',
          nextReviewAt: new Date('2026-04-01T00:00:00.000Z')
        },
        {
          title: '第二节',
          content: '## 第二节\n\n内容 B'
        }
      ],
      {
        source: 'manual',
        category: ReadingCategory.Later,
        priority: 42,
        tags: ['weave-incremental-reading'],
        deckId: 'deck-1',
        importFolder: 'weave/incremental-reading/IR'
      }
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(imported).toHaveLength(2);
    expect(imported[0].filePath).toContain('weave/incremental-reading/IR/source/01_');
    expect(imported[1].filePath).toContain('weave/incremental-reading/IR/source/02_');
    expect(imported[0].filePath).not.toBe(sourceFile.path);
    expect(yamlManager.initializeReadingFields).toHaveBeenCalledTimes(2);
    expect(yamlManager.updateReadingFields).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: imported[0].filePath }),
      { 'weave-reading-topic-id': 'deck-1' }
    );
    expect(materialStore.get(imported[0].uuid)?.readingDeckId).toBe('deck-1');
    expect(storage.saveMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        uuid: imported[0].uuid,
        nextDueAt: '2026-04-01T00:00:00.000Z',
        fsrs: expect.objectContaining({
          due: '2026-04-01T00:00:00.000Z'
        })
      })
    );
  });

  it('从全局侧边栏删除 Markdown 阅读材料时应清理外部文档调度残留', async () => {
    const material: any = {
      uuid: 'mat-1',
      filePath: 'weave/incremental-reading/IR/source/01_第一节.md',
      title: '第一节',
      category: ReadingCategory.Later,
      priority: 50,
      priorityDecay: 0.5,
      lastAccessed: '2026-03-30T00:00:00.000Z',
      progress: {
        anchorHistory: [],
        percentage: 0,
        totalWords: 100,
        readWords: 0,
        estimatedTimeRemaining: 1
      },
      extractedCards: [],
      tags: ['weave-incremental-reading'],
      created: '2026-03-30T00:00:00.000Z',
      modified: '2026-03-30T00:00:00.000Z',
      source: 'manual'
    };

    const file = Object.assign(Object.create(TFile.prototype), {
      path: material.filePath
    }) as TFile;

    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => path === material.filePath ? file : null)
      }
    };

    const storage = {
      getMaterialById: vi.fn((uuid: string) => uuid === material.uuid ? material : null),
      getAllMaterials: vi.fn(() => [material]),
      saveMaterial: vi.fn(async () => {}),
      deleteMaterial: vi.fn(async () => true)
    };

    const yamlManager = {
      removeReadingFields: vi.fn(async () => {})
    };

    const initializeSpy = vi.spyOn(IRStorageService.prototype, 'initialize').mockResolvedValue(undefined);
    const getAllChunkDataSpy = vi.spyOn(IRStorageService.prototype, 'getAllChunkData').mockResolvedValue({
      'chunk-external': {
        chunkId: 'chunk-external',
        filePath: material.filePath,
        meta: {
          externalDocument: true
        }
      },
      'chunk-other': {
        chunkId: 'chunk-other',
        filePath: 'notes/other.md',
        meta: {
          externalDocument: true
        }
      }
    } as any);
    const deleteChunkDataSpy = vi.spyOn(IRStorageService.prototype, 'deleteChunkData').mockResolvedValue(undefined);
    const deleteBlocksByFileSpy = vi.spyOn(IRStorageService.prototype, 'deleteBlocksByFile').mockResolvedValue(undefined);

    try {
      const manager = new ReadingMaterialManager(
        app as any,
        storage as any,
        yamlManager as any
      );

      const success = await manager.removeMaterial(material.uuid);

      expect(success).toBe(true);
      expect(yamlManager.removeReadingFields).toHaveBeenCalledWith(file);
      expect(initializeSpy).toHaveBeenCalled();
      expect(getAllChunkDataSpy).toHaveBeenCalled();
      expect(deleteChunkDataSpy).toHaveBeenCalledTimes(1);
      expect(deleteChunkDataSpy).toHaveBeenCalledWith('chunk-external');
      expect(deleteBlocksByFileSpy).toHaveBeenCalledWith(material.filePath);
    } finally {
      initializeSpy.mockRestore();
      getAllChunkDataSpy.mockRestore();
      deleteChunkDataSpy.mockRestore();
      deleteBlocksByFileSpy.mockRestore();
    }
  });

  it('设置多关联笔记时应同步主笔记与兼容旧字段', async () => {
    const material = {
      uuid: 'mat-linked',
      filePath: 'notes/source.md',
      title: 'source',
      category: ReadingCategory.Later,
      priority: 50,
      priorityDecay: 0.5,
      lastAccessed: '2026-03-30T00:00:00.000Z',
      progress: {
        anchorHistory: [],
        percentage: 0,
        totalWords: 100,
        readWords: 0,
        estimatedTimeRemaining: 1
      },
      extractedCards: [],
      tags: [],
      created: '2026-03-30T00:00:00.000Z',
      modified: '2026-03-30T00:00:00.000Z',
      source: 'manual'
    };

    const storage = {
      getMaterialById: vi.fn(async () => material),
      saveMaterial: vi.fn(async () => {})
    };

    const manager = new ReadingMaterialManager(
      {} as any,
      storage as any,
      {} as any
    );

    const success = await manager.setAssociatedNotePaths('mat-linked', [
      'Folder/Topic',
      'Folder/Topic.md',
      'Folder/Appendix.md'
    ]);

    expect(success).toBe(true);
    expect((material as any).primaryAssociatedNotePath).toBe('Folder/Topic.md');
    expect((material as any).associatedNotePath).toBe('Folder/Topic.md');
    expect((material as any).associatedNotePaths).toEqual(['Folder/Topic.md', 'Folder/Appendix.md']);
    expect(storage.saveMaterial).toHaveBeenCalledWith(expect.objectContaining({
      uuid: 'mat-linked',
      primaryAssociatedNotePath: 'Folder/Topic.md',
      associatedNotePath: 'Folder/Topic.md',
      associatedNotePaths: ['Folder/Topic.md', 'Folder/Appendix.md']
    }));
  });
});
