import { irActiveBlockContextStore } from '../../../stores/ir-active-block-context-store';
import { irActiveDocumentStore } from '../../../stores/ir-active-document-store';
import {
  buildWeSourceLinkFromPath,
  resolveEditorSourcePathFromIR,
  sanitizeCardTraceMetadata,
} from '../editor-source-path-resolver';

afterEach(() => {
  irActiveBlockContextStore.clearActiveContext();
  irActiveDocumentStore.clearActiveDocument();
});

describe('editor-source-path-resolver', () => {
  it('keeps canonical source paths unchanged', async () => {
    irActiveBlockContextStore.setActiveContext({
      sourcePath: 'ir/block-source.md',
      startLine: 12,
      endLine: 14,
    });
    irActiveDocumentStore.setActiveDocument('ir/active-document.md');

    const result = await resolveEditorSourcePathFromIR({
      sourcePath: 'notes/current.md',
    });

    expect(result.sourcePath).toBe('notes/current.md');
    expect(result.blockContext).toBeNull();
    expect(result.resolvedFrom).toBe('original');
  });

  it('prefers IR block context for plugin-editor selections', async () => {
    irActiveBlockContextStore.setActiveContext({
      sourcePath: 'ir/block-source.md',
      startLine: 20,
      endLine: 22,
    });

    const result = await resolveEditorSourcePathFromIR({
      sourcePath: 'notes/current.md',
      preferBlockContext: true,
    });

    expect(result.sourcePath).toBe('ir/block-source.md');
    expect(result.blockContext).toEqual({
      sourcePath: 'ir/block-source.md',
      startLine: 20,
      endLine: 22,
    });
    expect(result.resolvedFrom).toBe('block-context');
  });

  it('resolves detached temp files from IR block context before document fallback', async () => {
    irActiveBlockContextStore.setActiveContext({
      sourcePath: 'ir/true-source.md',
      startLine: 3,
    });
    irActiveDocumentStore.setActiveDocument('ir/active-document.md');

    const result = await resolveEditorSourcePathFromIR({
      sourcePath: '.obsidian/plugins/weave/cache/editor-temp/weave-editor-123.md',
    });

    expect(result.sourcePath).toBe('ir/true-source.md');
    expect(result.blockContext?.startLine).toBe(3);
    expect(result.resolvedFrom).toBe('block-context');
  });

  it('falls back to the active IR document when no block context is available', async () => {
    irActiveDocumentStore.setActiveDocument('ir/active-document.md');

    const result = await resolveEditorSourcePathFromIR({
      sourcePath: '.obsidian/plugins/weave/cache/editor-temp/weave-editor-123.md',
    });

    expect(result.sourcePath).toBe('ir/active-document.md');
    expect(result.blockContext).toBeNull();
    expect(result.resolvedFrom).toBe('active-document');
  });

  it('drops unresolved editor bridge temp files instead of keeping them as trace sources', async () => {
    const result = await resolveEditorSourcePathFromIR({
      sourcePath: 'weave/editor/weave-editor-session-1.md',
    });

    expect(result.sourcePath).toBeUndefined();
    expect(result.resolvedFrom).toBe('unresolved');
  });

  it('buildWeSourceLinkFromPath skips editor bridge temp files', () => {
    expect(
      buildWeSourceLinkFromPath('weave/editor/weave-editor-session-1.md', '^abc123')
    ).toBeUndefined();
    expect(buildWeSourceLinkFromPath('notes/source.md', '^abc123')).toBe('![[notes/source#^abc123]]');
  });

  it('sanitizeCardTraceMetadata removes temp-file trace metadata', () => {
    expect(
      sanitizeCardTraceMetadata({
        sourceFile: 'weave/editor/weave-editor-session-1.md',
        sourceBlock: '^abc123',
      })
    ).toEqual({});
  });

  it('can skip sourceless IR lookup when the caller wants strict behavior', async () => {
    irActiveBlockContextStore.setActiveContext({
      sourcePath: 'ir/block-source.md',
      startLine: 1,
    });
    irActiveDocumentStore.setActiveDocument('ir/active-document.md');

    const result = await resolveEditorSourcePathFromIR({
      resolveMissingSourcePath: false,
    });

    expect(result.sourcePath).toBeUndefined();
    expect(result.blockContext).toBeNull();
    expect(result.resolvedFrom).toBe('unresolved');
  });
});
