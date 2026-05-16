import { getPluginPaths } from '../../config/paths';
import { vaultStorage } from '../vault-local-storage';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
}

function createMemoryApp(initialFiles: Record<string, string> = {}) {
  const files = new Map<string, string>();
  const folders = new Set<string>(['', '.obsidian', '.obsidian/plugins', '.obsidian/plugins/weave']);

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

  const app = {
    vault: {
      configDir: '.obsidian',
      adapter,
    },
  } as any;

  return {
    app,
    files,
  };
}

afterEach(async () => {
  await vaultStorage.flush();
  vaultStorage.resetForTests();
  window.localStorage.clear();
});

describe('vaultStorage', () => {
  it('loads managed entries from the plugin state file instead of browser localStorage', async () => {
    const { app, files } = createMemoryApp();
    const pluginPaths = getPluginPaths(app);
    files.set(
      normalizeTestPath(pluginPaths.state.localStorage),
      JSON.stringify({
        'weave-deck-view': 'kanban',
        'weave-deck-filter': 'memory',
      })
    );

    await vaultStorage.initialize(app);

    expect(vaultStorage.getItem('weave-deck-view')).toBe('kanban');
    expect(vaultStorage.getItem('weave-deck-filter')).toBe('memory');
    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.localStorage)) || '{}')).toEqual({
      'weave-deck-filter': 'memory',
      'weave-deck-view': 'kanban',
    });
    expect(window.localStorage.getItem('weave-deck-view')).toBeNull();
    expect(window.localStorage.getItem('weave-deck-filter')).toBeNull();
  });

  it('persists only managed plugin keys to the plugin state file', async () => {
    const { app, files } = createMemoryApp();
    const pluginPaths = getPluginPaths(app);

    await vaultStorage.initialize(app);

    vaultStorage.setItem('weave-deck-filter', 'question-bank');
    vaultStorage.setItem('language', 'en');
    await vaultStorage.flush();

    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.localStorage)) || '{}')).toEqual({
      'weave-deck-filter': 'question-bank',
    });
    expect(vaultStorage.getItem('language')).toBeNull();
    expect(window.localStorage.getItem('weave-deck-filter')).toBeNull();

    vaultStorage.removeItem('weave-deck-filter');
    await vaultStorage.flush();

    expect(JSON.parse(files.get(normalizeTestPath(pluginPaths.state.localStorage)) || '{}')).toEqual({});
    expect(vaultStorage.getItem('weave-deck-filter')).toBeNull();
    expect(window.localStorage.getItem('language')).toBeNull();
  });
});
