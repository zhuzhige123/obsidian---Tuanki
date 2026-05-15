vi.mock('obsidian', () => {
  class TFile {
    path: string;
    name: string;
    extension: string;

    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop() || '';
      this.extension = this.name.includes('.') ? this.name.split('.').pop() || '' : '';
    }
  }

  class Component {}
  class MarkdownView {}
  class WorkspaceLeaf {}
  class Scope {
    parent: unknown;

    constructor(parent?: unknown) {
      this.parent = parent;
    }

    register = vi.fn();
  }

  return {
    App: class App {},
    Component,
    MarkdownView,
    TFile,
    WorkspaceLeaf,
    Platform: {
      isMobile: false,
    },
    Scope,
    normalizePath: (path: string) => path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''),
  };
});

import { TFile } from 'obsidian';
import { DetachedLeafEditor } from '../DetachedLeafEditor';

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

function parentPath(path: string): string {
  const normalized = normalizeTestPath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function createMockTFile(path: string): TFile {
  const name = path.split('/').pop() || '';

  return {
    path,
    name,
    extension: name.includes('.') ? name.split('.').pop() || '' : ''
  } as unknown as TFile;
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

  const writeFile = (path: string, content: string) => {
    const normalized = normalizeTestPath(path);
    ensureDir(parentPath(normalized));
    files.set(normalized, content);
  };

  for (const [path, content] of Object.entries(initialFiles)) {
    writeFile(path, content);
  }

  const adapter = {
    exists: async (path: string) => {
      const normalized = normalizeTestPath(path);
      return files.has(normalized) || folders.has(normalized);
    },
    mkdir: async (path: string) => {
      ensureDir(path);
    },
  };

  const vault = {
    configDir: '.obsidian',
    adapter,
    getAbstractFileByPath: (path: string) => {
      const normalized = normalizeTestPath(path);
      if (!files.has(normalized)) return null;
      return createMockTFile(normalized);
    },
    create: async (path: string, content: string) => {
      const normalized = normalizeTestPath(path);
      writeFile(normalized, content);
      return createMockTFile(normalized);
    },
    modify: async (file: { path: string }, content: string) => {
      writeFile(file.path, content);
    },
  };

  return {
    app: {
      scope: {},
      vault,
    } as any,
    files,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DetachedLeafEditor temp file placement', () => {
  it('uses weave/editor when no sourcePath is provided', async () => {
    const { app, files } = createMemoryApp();
    const editor = new DetachedLeafEditor(app, document.createElement('div'), {
      sessionId: 'session-1',
      value: 'cache',
    });

    await (editor as any).prepareTempFile();

    const expectedPath = 'weave/editor/weave-editor-session-1.md';
    expect(files.get(normalizeTestPath(expectedPath))).toBe('cache');
    expect((editor as any).tempFile?.path).toBe(normalizeTestPath(expectedPath));
  });

  it('uses the source file directory when sourcePath points to a nested file', async () => {
    const { app, files } = createMemoryApp({
      'notes/ch1/source.md': '# source',
    });
    const editor = new DetachedLeafEditor(app, document.createElement('div'), {
      sessionId: 'session-2',
      sourcePath: 'notes/ch1/source.md',
      value: 'nested',
    });

    await (editor as any).prepareTempFile();

    const expectedPath = 'notes/ch1/weave-editor-session-2.md';
    expect(files.get(expectedPath)).toBe('nested');
    expect((editor as any).tempFile?.path).toBe(expectedPath);
  });

  it('uses vault root when sourcePath points to a root-level file', async () => {
    const { app, files } = createMemoryApp({
      'source.md': '# root source',
    });
    const editor = new DetachedLeafEditor(app, document.createElement('div'), {
      sessionId: 'session-3',
      sourcePath: 'source.md',
      value: 'root',
    });

    await (editor as any).prepareTempFile();

    expect(files.get('weave-editor-session-3.md')).toBe('root');
    expect((editor as any).tempFile?.path).toBe('weave-editor-session-3.md');
  });

  it('uses the parent directory when sourcePath points to a pdf source file', async () => {
    const { app, files } = createMemoryApp({
      'library/book.pdf': 'pdf-placeholder',
    });
    const editor = new DetachedLeafEditor(app, document.createElement('div'), {
      sessionId: 'session-4',
      sourcePath: 'library/book.pdf',
      value: 'pdf-note',
    });

    await (editor as any).prepareTempFile();

    const expectedPath = 'library/weave-editor-session-4.md';
    expect(files.get(expectedPath)).toBe('pdf-note');
    expect((editor as any).tempFile?.path).toBe(expectedPath);
  });
});
