import {
  resolveIRReadableMarkdownTargetFolder,
  resolveObsidianDefaultNewNoteFolder,
} from '../IRReadableMarkdownPathResolver';

function createApp(config: Record<string, unknown> = {}) {
  return {
    vault: {
      config,
      getConfig: (key: string) => config[key],
      getAbstractFileByPath: () => null,
      adapter: {
        exists: async () => false,
      },
    },
    workspace: {
      getActiveFile: () => null,
    },
  } as any;
}

describe('IRReadableMarkdownPathResolver', () => {
  it('prefers the last manually selected folder over the Obsidian default new note folder', () => {
    const app = createApp({
      newFileLocation: 'folder',
      newFileFolderPath: 'Inbox/Readable',
    });

    const result = resolveIRReadableMarkdownTargetFolder(app, {
      lastSelectedFolder: 'Selections/Today',
    });

    expect(result).toBe('Selections/Today');
  });

  it('falls back to the Obsidian default new note folder when there is no remembered folder', () => {
    const app = createApp({
      newFileLocation: 'folder',
      newFileFolderPath: 'Inbox/Readable',
    });

    const result = resolveIRReadableMarkdownTargetFolder(app);

    expect(result).toBe('Inbox/Readable');
  });

  it('resolves the current note folder when Obsidian is configured to create new notes beside the current file', () => {
    const app = createApp({
      newFileLocation: 'current',
    });

    const result = resolveObsidianDefaultNewNoteFolder(app, {
      contextPath: 'notes/chapter/source.md',
      allowActiveFileFallback: false,
    });

    expect(result).toBe('notes/chapter');
  });

  it('falls back to the vault root when no remembered folder or Obsidian default folder is available', () => {
    const app = createApp({});

    const result = resolveIRReadableMarkdownTargetFolder(app);

    expect(result).toBe('/');
  });
});
