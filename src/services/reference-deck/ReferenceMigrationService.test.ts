import { getV2Paths } from '../../config/paths';
import { ReferenceMigrationService } from './ReferenceMigrationService';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createReferenceMigrationPlugin(initialFiles: Record<string, string>) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', 'weave', 'weave/decks', 'weave/decks/deck-1']);

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
    list: async (dir: string) => {
      const normalized = normalizeTestPath(dir);
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
      const value = files.get(normalized);
      if (value === undefined) throw new Error(`File not found: ${normalized}`);
      return value;
    },
    write: async (path: string, content: string) => {
      writeText(path, content);
    },
  };

  const plugin = {
    app: {
      vault: {
        adapter,
      },
    },
    wdeckService: {},
    dataStorage: {
      getDecks: vi.fn().mockResolvedValue([
        {
          id: 'deck-1',
          name: 'Deck One',
          cardUUIDs: [],
        },
      ]),
      saveCardsBatch: vi.fn().mockResolvedValue(undefined),
      saveDeck: vi.fn().mockResolvedValue(undefined),
    },
  } as any;

  return { plugin, files, folders };
}

describe('ReferenceMigrationService', () => {
  it('migrates legacy deck card files without recreating the deprecated memory/cards directory', async () => {
    const v2Paths = getV2Paths('');
    const { plugin, folders, files } = createReferenceMigrationPlugin({
      'weave/decks/deck-1/cards.json': JSON.stringify({
        cards: [
          {
            uuid: '550e8400-e29b-41d4-a716-446655440000',
            content: 'Question',
            answer: 'Answer',
            type: 'basic',
          },
        ],
      }),
    });
    const service = new ReferenceMigrationService(plugin);

    const result = await service.migrate({ createBackup: false, validate: false });

    expect(result).toMatchObject({
      success: true,
      migratedCards: 1,
      migratedDecks: 1,
    });
    expect(plugin.dataStorage.saveCardsBatch).toHaveBeenCalledTimes(1);
    expect(plugin.cardFileService).toBeUndefined();
    expect(folders.has(v2Paths.memory.cards)).toBe(false);

    const migratedLegacyFile = JSON.parse(files.get('weave/decks/deck-1/cards.json') || '{}');
    expect(migratedLegacyFile).toMatchObject({
      _migrated: true,
      cards: [],
    });
  });
});
