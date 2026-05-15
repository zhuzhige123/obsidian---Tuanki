import {
  getVaultEditorTempDir,
  getPluginEditorTempDir,
  isDetachedEditorTempFilePath,
  isLegacyModalEditorPermanentFilePath,
  isPluginCacheModalEditorPermanentFilePath,
  resolveDetachedEditorTempFolder,
} from '../editor-temp-file-policy';

describe('editor-temp-file-policy', () => {
  it('detects detached editor temp files by path', () => {
    expect(isDetachedEditorTempFilePath('weave-editor-123.md')).toBe(true);
    expect(isDetachedEditorTempFilePath('notes/weave-editor-session.md')).toBe(true);
    expect(isDetachedEditorTempFilePath('notes/weave-editor-session.txt')).toBe(false);
    expect(isDetachedEditorTempFilePath('notes/real-note.md')).toBe(false);
  });

  it('resolves detached editor temp folders from sourcePath and plugin configDir', () => {
    const defaultApp = {
      vault: { configDir: '.obsidian' },
    } as any;
    const customApp = {
      vault: { configDir: 'custom-config' },
    } as any;

    expect(getPluginEditorTempDir(defaultApp)).toBe('.obsidian/plugins/weave/cache/editor-temp');
    expect(getPluginEditorTempDir(customApp)).toBe('custom-config/plugins/weave/cache/editor-temp');
    expect(getVaultEditorTempDir(defaultApp)).toBe('weave/editor');
    expect(resolveDetachedEditorTempFolder(defaultApp)).toBe('weave/editor');
    expect(resolveDetachedEditorTempFolder(defaultApp, 'notes/ch1/source.md')).toBe('notes/ch1');
    expect(resolveDetachedEditorTempFolder(defaultApp, 'library/book.pdf')).toBe('library');
    expect(resolveDetachedEditorTempFolder(defaultApp, 'library/book.epub')).toBe('library');
    expect(resolveDetachedEditorTempFolder(defaultApp, 'notes/ch1')).toBe('notes/ch1');
    expect(resolveDetachedEditorTempFolder(defaultApp, 'notes/archive.v1')).toBe('notes/archive.v1');
    expect(resolveDetachedEditorTempFolder(defaultApp, 'source.md')).toBe('');
  });

	it('falls back to the safe vault editor directory for invalid source paths', () => {
		const app = {
			vault: { configDir: '.obsidian' },
		} as any;

		expect(resolveDetachedEditorTempFolder(app, 'obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub')).toBe(
			'weave/editor'
		);
		expect(resolveDetachedEditorTempFolder(app, 'C:/Users/lihua/Desktop/book.md')).toBe(
			'weave/editor'
		);
		expect(resolveDetachedEditorTempFolder(app, '../outside/note.md')).toBe('weave/editor');
		expect(resolveDetachedEditorTempFolder(app, '.')).toBe('weave/editor');
	});

  it('distinguishes plugin cache modal buffers from legacy modal buffers', () => {
    const app = {
      vault: { configDir: '.obsidian' },
    } as any;

    expect(
      isPluginCacheModalEditorPermanentFilePath(
        app,
        '.obsidian/plugins/weave/cache/editor-temp/modal-editor-permanent-2.md',
      ),
    ).toBe(true);
    expect(isLegacyModalEditorPermanentFilePath('weave/editor/modal-editor-permanent.md')).toBe(
      false,
    );
    expect(isLegacyModalEditorPermanentFilePath('weave/temp/modal-editor-permanent.md')).toBe(true);
    expect(isLegacyModalEditorPermanentFilePath('projects/weave/temp/modal-editor-permanent-4.md')).toBe(true);
    expect(isLegacyModalEditorPermanentFilePath('.tuanki/temp/modal-editor-permanent.md')).toBe(true);
    expect(isLegacyModalEditorPermanentFilePath('notes/temp/modal-editor-permanent.md')).toBe(false);
  });
});
