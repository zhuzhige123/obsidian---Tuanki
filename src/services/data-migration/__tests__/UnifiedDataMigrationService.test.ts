import {
  discoverLegacyDataRoots,
  resolveCurrentDataLayout,
  UnifiedDataMigrationService,
  verifyDataMigration,
} from '../UnifiedDataMigrationService';
import { getV2Paths } from '../../../config/paths';

function createMockApp(existingPaths: string[] = []) {
  const existing = new Set(existingPaths);
  return {
    vault: {
      configDir: '.obsidian',
      adapter: {
        exists: async (path: string) => existing.has(path),
      },
    },
  } as any;
}

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createMemoryApp(
  initialFiles: Record<string, string> = {},
  options: {
    failListsForPaths?: string[];
    failReadsForPaths?: string[];
    failWritesForPaths?: string[];
  } = {},
) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', '.obsidian']);
  const failListsForPaths = new Set(
    (options.failListsForPaths || []).map((path) => normalizeTestPath(path)),
  );
  const failReadsForPaths = new Set(
    (options.failReadsForPaths || []).map((path) => normalizeTestPath(path)),
  );
  const failWritesForPaths = new Set(
    (options.failWritesForPaths || []).map((path) => normalizeTestPath(path)),
  );

  const ensureDir = (dir: string) => {
    const normalized = normalizeTestPath(dir);
    if (!normalized) return;
    const parts = normalized.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  };

  const writeText = (path: string, content: string) => {
    const normalized = normalizeTestPath(path);
    ensureDir(parentPath(normalized));
    files.set(normalized, content);
  };

  for (const [path, content] of Object.entries(initialFiles)) {
    writeText(path, content);
  }

  const adapter = {
    exists: async (path: string) => {
      const normalized = normalizeTestPath(path);
      return files.has(normalized) || folders.has(normalized);
    },
    mkdir: async (path: string) => {
      ensureDir(path);
    },
    list: async (dir: string) => {
      const normalized = normalizeTestPath(dir);
      if (failListsForPaths.has(normalized)) {
        failListsForPaths.delete(normalized);
        throw new Error(`Injected list failure: ${normalized}`);
      }
      const prefix = normalized ? `${normalized}/` : '';
      const childFolders = new Set<string>();
      const childFiles: string[] = [];

      for (const folder of folders) {
        if (!folder || folder === normalized || !folder.startsWith(prefix)) continue;
        const rest = folder.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        childFolders.add(folder);
      }

      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        if (!rest || rest.includes('/')) continue;
        childFiles.push(file);
      }

      return {
        files: childFiles.sort(),
        folders: Array.from(childFolders).sort(),
      };
    },
    read: async (path: string) => {
      const normalized = normalizeTestPath(path);
      if (failReadsForPaths.has(normalized)) {
        failReadsForPaths.delete(normalized);
        throw new Error(`Injected read failure: ${normalized}`);
      }
      const value = files.get(normalized);
      if (value === undefined) throw new Error(`File not found: ${normalized}`);
      return value;
    },
    write: async (path: string, content: string) => {
      const normalized = normalizeTestPath(path);
      if (failWritesForPaths.has(normalized)) {
        failWritesForPaths.delete(normalized);
        throw new Error(`Injected write failure: ${normalized}`);
      }
      writeText(normalized, content);
    },
    readBinary: async (path: string) => Buffer.from(await adapter.read(path)),
    writeBinary: async (path: string, content: Uint8Array) => {
      const normalized = normalizeTestPath(path);
      if (failWritesForPaths.has(normalized)) {
        failWritesForPaths.delete(normalized);
        throw new Error(`Injected write failure: ${normalized}`);
      }
      writeText(normalized, Buffer.from(content).toString('utf8'));
    },
    remove: async (path: string) => {
      const normalized = normalizeTestPath(path);
      if (files.has(normalized)) {
        files.delete(normalized);
        return;
      }
      folders.delete(normalized);
    },
    rmdir: async (dir: string, recursive = false) => {
      const normalized = normalizeTestPath(dir);
      if (recursive) {
        for (const file of Array.from(files.keys())) {
          if (file === normalized || file.startsWith(`${normalized}/`)) {
            files.delete(file);
          }
        }
        for (const folder of Array.from(folders)) {
          if (folder === normalized || folder.startsWith(`${normalized}/`)) {
            folders.delete(folder);
          }
        }
        return;
      }
      const listing = await adapter.list(normalized);
      if (listing.files.length === 0 && listing.folders.length === 0) {
        folders.delete(normalized);
      }
    },
  };

  return {
    app: {
      vault: {
        configDir: '.obsidian',
        adapter,
      },
    } as any,
    files,
    folders,
  };
}

describe('UnifiedDataMigrationService', () => {
  it('resolves weave root from parent folder', () => {
    const app = createMockApp();
    const layout = resolveCurrentDataLayout(
      {
        weaveParentFolder: 'Learning/Data',
        incrementalReading: {
          importFolder: '',
        },
      },
      app,
    );

    expect(layout.parentFolder).toBe('Learning/Data');
    expect(layout.root).toBe('Learning/Data/weave');
    expect(layout.irImportFolder).toBe('Learning/Data/weave/incremental-reading/IR');
  });

  it('normalizes root folder selection to bare weave root', () => {
    const app = createMockApp();
    const layout = resolveCurrentDataLayout(
      {
        weaveParentFolder: 'weave',
      },
      app,
    );

    expect(layout.parentFolder).toBe('');
    expect(layout.root).toBe('weave');
  });

  it('discovers existing legacy roots without duplicates', async () => {
    const app = createMockApp([
      'Custom/weave',
      'weave',
      'tuanki',
      '.tuanki',
      '.obsidian/plugins/weave/question-bank',
      'Custom/weave/_data',
      'Custom/weave/IR',
    ]);

    const roots = await discoverLegacyDataRoots(
      {
        weaveParentFolder: 'Custom',
      },
      app,
      'Archive',
    );

    const existing = roots.filter((root) => root.exists).map((root) => root.path);

    expect(existing).toContain('Custom/weave');
    expect(existing).toContain('weave');
    expect(existing).toContain('tuanki');
    expect(existing).toContain('.tuanki');
    expect(existing).toContain('.obsidian/plugins/weave/question-bank');
    expect(existing).toContain('Custom/weave/_data');
    expect(existing).toContain('Custom/weave/IR');
    expect(new Set(existing).size).toBe(existing.length);
  });

  it('migrates legacy plugin question-bank data into the unified vault data root', async () => {
    const { app, files, folders } = createMemoryApp({
      '.obsidian/plugins/weave/question-bank/banks.json': '[{"id":"legacy-bank"}]',
      '.obsidian/plugins/weave/question-bank/banks/bank-1/questions.json': '[{"id":"q-1"}]',
      '.obsidian/plugins/weave/question-bank/test-history.json': '[{"bankId":"legacy-bank"}]',
    });
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({ reason: 'startup-auto' });
    const report = await service.executeDataMigration(plan);

    expect(report.movedFiles).toBe(3);
    expect(files.get('weave/question-bank/banks.json')).toBe('[{"id":"legacy-bank"}]');
    expect(files.get('weave/question-bank/banks/bank-1/questions.json')).toBe('[{"id":"q-1"}]');
    expect(files.get('weave/question-bank/test-history.json')).toBe('[{"bankId":"legacy-bank"}]');
    expect(files.has('.obsidian/plugins/weave/question-bank/banks.json')).toBe(false);
    expect(folders.has('.obsidian/plugins/weave/question-bank')).toBe(false);
  });

  it('migrates current root to a new parent folder and rewrites persisted references', async () => {
    const { app, files } = createMemoryApp({
      'weave/memory/decks.json': '{"decks":[]}',
      'weave/memory/cards/card-files-index.json': '{"files":[]}',
      'weave/memory/learning/sessions/2026-03.json': '{"sessions":[]}',
      'weave/incremental-reading/chunks.json': JSON.stringify({
        chunks: [{ filePath: 'weave/incremental-reading/IR/article/chunk-1.md' }],
      }),
      'weave/incremental-reading/sources.json': JSON.stringify({
        sources: [{ indexFilePath: 'weave/incremental-reading/IR/article/index.md', rawFilePath: 'weave/incremental-reading/IR/raw/source.pdf' }],
      }),
      'weave/incremental-reading/materials/index.json': '{"materials":{}}',
      'weave/question-bank/banks.json': '[]',
    });
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({
      requestedParentFolder: 'Archive',
      reason: 'change-parent-folder',
    });
    const report = await service.executeDataMigration(plan);

    expect(report.movedFiles).toBeGreaterThan(0);
    expect(report.rewrittenReferences).toBeGreaterThan(0);
    expect(settings.weaveParentFolder).toBe('Archive');
    expect(settings.incrementalReading.importFolder).toBe('Archive/weave/incremental-reading/IR');
    expect(files.has('Archive/weave/memory/decks.json')).toBe(true);

    const chunks = JSON.parse(files.get('Archive/weave/incremental-reading/chunks.json') || '{}');
    expect(chunks.chunks[0].filePath).toBe('Archive/weave/incremental-reading/IR/article/chunk-1.md');
  });

  it('archives conflicting legacy files into _migration_conflicts while keeping target data', async () => {
    const { app, files } = createMemoryApp({
      'weave/memory/decks.json': '{"decks":[{"id":"old"}]}',
      'Archive/weave/memory/decks.json': '{"decks":[{"id":"new"}]}',
    });
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({
      requestedParentFolder: 'Archive',
      reason: 'change-parent-folder',
    });
    const report = await service.executeDataMigration(plan);

    expect(report.conflicts).toBe(1);
    expect(files.get('Archive/weave/memory/decks.json')).toBe('{"decks":[{"id":"new"}]}');
    expect(report.conflictFiles.some((path) => path.startsWith('Archive/weave/_migration_conflicts/'))).toBe(true);
  });

  it('rewrites known persisted path references and backs them up before migration', async () => {
    const { app, files } = createMemoryApp({
      'weave/memory/decks.json': '{"decks":[]}',
      'weave/memory/cards/card-files-index.json': '{"files":[]}',
      'weave/incremental-reading/blocks.json': JSON.stringify({
        blocks: [
          {
            id: 'block-1',
            sourcePath: 'weave/incremental-reading/IR/article/index.md',
            chunkFilePaths: ['weave/incremental-reading/IR/article/chunk-1.md'],
            storagePath: 'weave/incremental-reading/materials/article.json',
          },
        ],
      }),
      'weave/incremental-reading/decks.json': JSON.stringify({
        decks: [
          {
            id: 'deck-1',
            sourceFiles: ['weave/incremental-reading/IR/article/index.md'],
          },
        ],
      }),
      'weave/incremental-reading/document-group-map.json': JSON.stringify({
        groups: [
          {
            filePath: 'weave/incremental-reading/IR/article/index.md',
            originalPath: 'weave/incremental-reading/IR/article/index.md',
          },
        ],
      }),
      '.obsidian/plugins/weave/state/user-profile.json': JSON.stringify({
        recentSource: {
          filePath: 'weave/incremental-reading/IR/article/index.md',
        },
      }),
      'weave/question-bank/banks.json': '[]',
    });
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({
      requestedParentFolder: 'Archive',
      reason: 'change-parent-folder',
    });
    const report = await service.executeDataMigration(plan);

    const migratedBlocks = JSON.parse(
      files.get('Archive/weave/incremental-reading/blocks.json') || '{}',
    );
    expect(migratedBlocks.blocks[0].sourcePath).toBe(
      'Archive/weave/incremental-reading/IR/article/index.md',
    );
    expect(migratedBlocks.blocks[0].chunkFilePaths).toEqual([
      'Archive/weave/incremental-reading/IR/article/chunk-1.md',
    ]);
    expect(migratedBlocks.blocks[0].storagePath).toBe(
      'Archive/weave/incremental-reading/materials/article.json',
    );

    const migratedDecks = JSON.parse(
      files.get('Archive/weave/incremental-reading/decks.json') || '{}',
    );
    expect(migratedDecks.decks[0].sourceFiles).toEqual([
      'Archive/weave/incremental-reading/IR/article/index.md',
    ]);

    const migratedDocumentGroupMap = JSON.parse(
      files.get('Archive/weave/incremental-reading/document-group-map.json') || '{}',
    );
    expect(migratedDocumentGroupMap.groups[0].filePath).toBe(
      'Archive/weave/incremental-reading/IR/article/index.md',
    );
    expect(migratedDocumentGroupMap.groups[0].originalPath).toBe(
      'Archive/weave/incremental-reading/IR/article/index.md',
    );

    const profile = JSON.parse(
      files.get('.obsidian/plugins/weave/state/user-profile.json') || '{}',
    );
    expect(profile.recentSource.filePath).toBe(
      'Archive/weave/incremental-reading/IR/article/index.md',
    );

    const backupFiles = Array.from(files.keys()).filter((path) =>
      path.startsWith(`${report.plan.backupPath}/`),
    );
    expect(
      backupFiles.some((path) => path.endsWith('/weave__incremental-reading__blocks.json')),
    ).toBe(true);
    expect(
      backupFiles.some((path) => path.endsWith('/weave__incremental-reading__decks.json')),
    ).toBe(true);
    expect(
      backupFiles.some((path) =>
        path.endsWith('/weave__incremental-reading__document-group-map.json'),
      ),
    ).toBe(true);
    expect(
      backupFiles.some((path) => path.endsWith('/.obsidian__plugins__weave__state__user-profile.json')),
    ).toBe(true);
  });

  it('is idempotent when executing the same migration plan twice', async () => {
    const { app, files } = createMemoryApp({
      'weave/memory/decks.json': '{"decks":[]}',
      'weave/memory/cards/card-files-index.json': '{"files":[]}',
      'weave/memory/learning/sessions/2026-03.json': '{"sessions":[]}',
      'weave/incremental-reading/materials/index.json': '{"materials":{}}',
      'weave/question-bank/banks.json': '[]',
    });
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({
      requestedParentFolder: 'Archive',
      reason: 'change-parent-folder',
    });

    const first = await service.executeDataMigration(plan);
    const conflictCountAfterFirst = Array.from(files.keys()).filter((path) =>
      path.startsWith('Archive/weave/_migration_conflicts/'),
    ).length;

    const second = await service.executeDataMigration(plan);
    const conflictCountAfterSecond = Array.from(files.keys()).filter((path) =>
      path.startsWith('Archive/weave/_migration_conflicts/'),
    ).length;

    expect(first.movedFiles).toBeGreaterThan(0);
    expect(second.movedFiles).toBe(0);
    expect(second.conflicts).toBe(0);
    expect(conflictCountAfterSecond).toBe(conflictCountAfterFirst);
    expect(files.has('Archive/weave/memory/decks.json')).toBe(true);
  });

  it('writes a failed migration report when execution is interrupted', async () => {
    const { app, files } = createMemoryApp(
      {
        'weave/memory/decks.json': '{"decks":[]}',
      },
      {
        failListsForPaths: ['weave'],
      },
    );
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({
      requestedParentFolder: 'Archive',
      reason: 'change-parent-folder',
    });

    await expect(service.executeDataMigration(plan)).rejects.toThrow(
      'Injected list failure: weave',
    );

    const latestReport = await service.getLatestReport();

    expect(latestReport?.status).toBe('failed');
    expect(latestReport?.errors).toContain('Injected list failure: weave');
    expect(latestReport?.verification?.ok).toBe(false);
    expect(settings.weaveParentFolder).toBe('');
    expect(files.has('Archive/weave/memory/decks.json')).toBe(false);
  });

  it('does not require the deprecated memory/cards directory during migration verification', async () => {
    const v2Paths = getV2Paths('');
    const { app } = createMemoryApp();

    await app.vault.adapter.mkdir(v2Paths.memory.root);
    await app.vault.adapter.mkdir(v2Paths.memory.learning.root);
    await app.vault.adapter.mkdir(v2Paths.ir.root);
    await app.vault.adapter.mkdir(v2Paths.questionBank.root);

    const verification = await verifyDataMigration(
      {
        plan: {
          layout: { v2Paths },
          activeSourceRoots: [],
          conflictsRoot: `${v2Paths.root}/_migration_conflicts`,
        },
        conflictFiles: [],
      } as any,
      app,
    );

    expect(verification).toMatchObject({
      ok: true,
      missingDirectories: [],
    });
  });

  it('archives multiple conflicting files without overwriting earlier conflict snapshots', async () => {
    const { app, files } = createMemoryApp({
      'weave/memory/decks.json': '{"decks":[{"id":"legacy-deck"}]}',
      'weave/question-bank/banks.json': '[{"id":"legacy-bank"}]',
      'Archive/weave/memory/decks.json': '{"decks":[{"id":"current-deck"}]}',
      'Archive/weave/question-bank/banks.json': '[{"id":"current-bank"}]',
    });
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const timeSpy = vi.spyOn(Date, 'now');
    timeSpy.mockReturnValueOnce(1700000000001).mockReturnValueOnce(1700000000002);

    try {
      const service = new UnifiedDataMigrationService(app, settings);
      const plan = await service.planDataMigration({
        requestedParentFolder: 'Archive',
        reason: 'change-parent-folder',
      });
      const report = await service.executeDataMigration(plan);

      expect(report.conflicts).toBe(2);
      expect(report.conflictFiles).toHaveLength(2);
      expect(new Set(report.conflictFiles).size).toBe(2);
      expect(report.conflictFiles[0]).toContain('1700000000001');
      expect(report.conflictFiles[1]).toContain('1700000000002');

      for (const conflictPath of report.conflictFiles) {
        expect(files.has(conflictPath)).toBe(true);
      }

      expect(files.get('Archive/weave/memory/decks.json')).toBe('{"decks":[{"id":"current-deck"}]}');
      expect(files.get('Archive/weave/question-bank/banks.json')).toBe('[{"id":"current-bank"}]');
    } finally {
      timeSpy.mockRestore();
    }
  });

  it('can recover by re-running the same migration plan after a transient write failure', async () => {
    const { app, files } = createMemoryApp(
      {
        'weave/memory/decks.json': '{"decks":[{"id":"retry"}]}',
        'weave/question-bank/banks.json': '[{"id":"bank-retry"}]',
      },
      {
        failWritesForPaths: ['Archive/weave/memory/decks.json'],
      },
    );
    const settings: any = {
      weaveParentFolder: '',
      incrementalReading: { importFolder: 'weave/incremental-reading/IR' },
    };

    const service = new UnifiedDataMigrationService(app, settings);
    const plan = await service.planDataMigration({
      requestedParentFolder: 'Archive',
      reason: 'change-parent-folder',
    });

    await expect(service.executeDataMigration(plan)).rejects.toThrow(
      'Injected write failure: Archive/weave/memory/decks.json',
    );

    const failedReport = await service.getLatestReport();
    expect(failedReport?.status).toBe('failed');
    expect(settings.weaveParentFolder).toBe('');
    expect(files.has('Archive/weave/memory/decks.json')).toBe(false);
    expect(files.has('weave/memory/decks.json')).toBe(true);

    const recovered = await service.executeDataMigration(plan);

    expect(recovered.status).toBe('completed');
    expect(recovered.movedFiles).toBeGreaterThan(0);
    expect(settings.weaveParentFolder).toBe('Archive');
    expect(files.get('Archive/weave/memory/decks.json')).toBe('{"decks":[{"id":"retry"}]}');
    expect(files.get('Archive/weave/question-bank/banks.json')).toBe('[{"id":"bank-retry"}]');
    expect(files.has('weave/memory/decks.json')).toBe(false);
  });
});
