import { TFile } from 'obsidian';
import { createYAMLFrontmatterManager } from '../yaml-frontmatter-utils';

describe('yaml-frontmatter-utils', () => {
  function createApp(frontmatter: Record<string, unknown>) {
    return {
      fileManager: {
        processFrontMatter: vi.fn(async (_file: TFile, handler: (frontmatter: Record<string, unknown>) => void) => {
          handler(frontmatter);
        })
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({ frontmatter }))
      },
      vault: {
        read: vi.fn(async () => ''),
        modify: vi.fn(async () => {})
      }
    };
  }

  function createFile(path = 'notes/source.md'): TFile {
    return Object.assign(Object.create(TFile.prototype), {
      path,
      basename: 'source',
      extension: 'md'
    }) as TFile;
  }

  it('初始化阅读字段时应只保留阅读材料 id，并清理旧的分类优先级与专题字段', async () => {
    const frontmatter: Record<string, unknown> = {
      'weave-reading-id': 'old-id',
      'weave-reading-category': 'later',
      'weave-reading-priority': 50,
      'weave-reading-topic-id': 'deck-1',
      'weave-reading-ir-deck-id': 'legacy-deck-1'
    };
    const app = createApp(frontmatter);
    const manager = createYAMLFrontmatterManager(app as any);

    await manager.initializeReadingFields(createFile(), 'new-id', 'later' as any, 80);

    expect(frontmatter['weave-reading-id']).toBe('new-id');
    expect(frontmatter['weave-reading-category']).toBeUndefined();
    expect(frontmatter['weave-reading-priority']).toBeUndefined();
    expect(frontmatter['weave-reading-topic-id']).toBeUndefined();
    expect(frontmatter['weave-reading-ir-deck-id']).toBeUndefined();
  });

  it('更新专题关联时应清理旧的专题 frontmatter，而不是继续写入用户文档', async () => {
    const frontmatter: Record<string, unknown> = {
      'weave-reading-id': 'rm-1',
      'weave-reading-topic-id': 'deck-1',
      'weave-reading-ir-deck-id': 'legacy-deck-1'
    };
    const app = createApp(frontmatter);
    const manager = createYAMLFrontmatterManager(app as any);

    await manager.updateReadingFields(createFile(), {
      'weave-reading-topic-id': 'deck-2'
    });

    expect(frontmatter['weave-reading-id']).toBe('rm-1');
    expect(frontmatter['weave-reading-topic-id']).toBeUndefined();
    expect(frontmatter['weave-reading-ir-deck-id']).toBeUndefined();
  });
});
