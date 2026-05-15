vi.mock('obsidian', async () => {
  const actual = await vi.importActual<typeof import('../../../tests/mocks/obsidian')>(
    '../../../tests/mocks/obsidian',
  );

  return {
    ...actual,
    Editor: class Editor {},
    EventRef: class EventRef {},
    MarkdownView: class MarkdownView {},
  };
});

import { TFile } from 'obsidian';
import { getPluginPaths } from '../../../config/paths';
import { ModalEditorManager } from '../ModalEditorManager';

function createMockTFile(path: string): TFile {
  const name = path.split('/').pop() || '';

  return {
    path,
    name,
    extension: name.includes('.') ? name.split('.').pop() || '' : '',
  } as unknown as TFile;
}

function createLeaf(path?: string) {
  return {
    detach: vi.fn(),
    view: {
      file: path ? createMockTFile(path) : null,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  ModalEditorManager.destroy();
});

describe('ModalEditorManager.cleanupRestoredLeaves', () => {
  it('stores active modal editor buffers in weave/editor so Obsidian can open them as TFile', () => {
    const app = {
      vault: { configDir: '.obsidian' },
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
      },
    } as any;

    const manager = ModalEditorManager.getInstance(app) as any;

    expect(manager.getEditorTempDirPath()).toBe('weave/editor');
  });

  it('detaches plugin cache editor buffers and legacy weave temp buffers only', () => {
    const app = {
      vault: { configDir: '.obsidian' },
      workspace: {
        getLeavesOfType: vi.fn(),
      },
    } as any;
    const pluginPaths = getPluginPaths(app);

    const cacheLeaf = createLeaf(`${pluginPaths.cache.editorTemp}/modal-editor-permanent-2.md`);
    const currentWeaveLeaf = createLeaf('weave/editor/modal-editor-permanent.md');
    const legacyWeaveLeaf = createLeaf('weave/temp/modal-editor-permanent.md');
    const nestedLegacyWeaveLeaf = createLeaf('projects/weave/temp/modal-editor-permanent-4.md');
    const legacyDotTuankiLeaf = createLeaf('.tuanki/temp/modal-editor-permanent.md');
    const unrelatedEditorTempLeaf = createLeaf(`${pluginPaths.cache.editorTemp}/weave-editor-123.md`);
    const unrelatedTempLeaf = createLeaf('notes/temp/modal-editor-permanent.md');
    const emptyLeaf = createLeaf();

    app.workspace.getLeavesOfType.mockReturnValue([
      cacheLeaf,
      currentWeaveLeaf,
      legacyWeaveLeaf,
      nestedLegacyWeaveLeaf,
      legacyDotTuankiLeaf,
      unrelatedEditorTempLeaf,
      unrelatedTempLeaf,
      emptyLeaf,
    ]);

    ModalEditorManager.cleanupRestoredLeaves(app);

    expect(cacheLeaf.detach).toHaveBeenCalledOnce();
    expect(currentWeaveLeaf.detach).not.toHaveBeenCalled();
    expect(legacyWeaveLeaf.detach).toHaveBeenCalledOnce();
    expect(nestedLegacyWeaveLeaf.detach).toHaveBeenCalledOnce();
    expect(legacyDotTuankiLeaf.detach).toHaveBeenCalledOnce();
    expect(unrelatedEditorTempLeaf.detach).not.toHaveBeenCalled();
    expect(unrelatedTempLeaf.detach).not.toHaveBeenCalled();
    expect(emptyLeaf.detach).not.toHaveBeenCalled();
  });

  it('respects custom configDir when detecting plugin cache editor buffers', () => {
    const app = {
      vault: { configDir: 'custom-config' },
      workspace: {
        getLeavesOfType: vi.fn(),
      },
    } as any;
    const pluginPaths = getPluginPaths(app);
    const cacheLeaf = createLeaf(`${pluginPaths.cache.editorTemp}/modal-editor-permanent.md`);

    app.workspace.getLeavesOfType.mockReturnValue([cacheLeaf]);

    ModalEditorManager.cleanupRestoredLeaves(app);

    expect(pluginPaths.cache.editorTemp).toBe('custom-config/plugins/weave/cache/editor-temp');
    expect(cacheLeaf.detach).toHaveBeenCalledOnce();
  });
});
