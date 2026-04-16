vi.mock('obsidian', () => ({
	TFile: class MockTFile {},
	normalizePath: (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''),
}));

import { TFile } from 'obsidian';
import { EpubBacklinkHighlightService } from '../EpubBacklinkHighlightService';

type MockFile = {
	path: string;
	name: string;
	extension: string;
};

type OpenMarkdownViewMock = {
	file: MockFile;
	editor: {
		getValue: () => string;
		setValue: (value: string) => void;
	};
	save: () => Promise<void>;
};

function createFile(path: string): MockFile {
	const normalized = path.replace(/\\/g, '/');
	return Object.assign(new TFile(), {
		path: normalized,
		name: normalized.split('/').pop() || normalized,
		extension: normalized.split('.').pop() || '',
		basename: (normalized.split('/').pop() || normalized).replace(/\.[^.]+$/, ''),
		parent: {
			path: normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '/',
		},
		stat: {
			size: 0,
			mtime: 1710000000000,
		},
	});
}

function createMockApp(initialFiles: Record<string, string>, options?: { openMarkdownPaths?: string[] }) {
	const files = new Map<string, string>(Object.entries(initialFiles));
	const openMarkdownViews: OpenMarkdownViewMock[] = (options?.openMarkdownPaths || []).map((path) => {
		const normalizedPath = path.replace(/\\/g, '/');
		let value = files.get(normalizedPath) || '';
		return {
			file: createFile(normalizedPath),
			editor: {
				getValue: () => value,
				setValue: (nextValue: string) => {
					value = nextValue;
					files.set(normalizedPath, nextValue);
				},
			},
			save: vi.fn(async () => undefined),
		};
	});

	const app: any = {
		vault: {
			adapter: {
				exists: vi.fn(async (path: string) => files.has(path.replace(/\\/g, '/'))),
				mkdir: vi.fn(async (_path: string) => undefined),
				read: vi.fn(async (path: string) => {
					const normalizedPath = path.replace(/\\/g, '/');
					const value = files.get(normalizedPath);
					if (value === undefined) {
						throw new Error(`Missing file: ${normalizedPath}`);
					}
					return value;
				}),
				write: vi.fn(async (path: string, value: string) => {
					files.set(path.replace(/\\/g, '/'), value);
				}),
				stat: vi.fn(async (path: string) => {
					const normalizedPath = path.replace(/\\/g, '/');
					if (!files.has(normalizedPath)) {
						throw new Error(`Missing file: ${normalizedPath}`);
					}
					return {
						size: (files.get(normalizedPath) || '').length,
						mtime: 1710000000000,
					};
				}),
				readBinary: vi.fn(async (path: string) => {
					const normalizedPath = path.replace(/\\/g, '/');
					const value = files.get(normalizedPath);
					if (value === undefined) {
						throw new Error(`Missing file: ${normalizedPath}`);
					}
					return new TextEncoder().encode(value);
				}),
			},
			cachedRead: vi.fn(async (file: MockFile) => files.get(file.path) || ''),
			modify: vi.fn(async (file: MockFile, updated: string) => {
				files.set(file.path, updated);
			}),
			getMarkdownFiles: vi.fn(() =>
				Array.from(files.keys())
					.filter((path) => path.endsWith('.md'))
					.map((path) => createFile(path))
			),
			getFiles: vi.fn(() =>
				Array.from(files.keys()).map((path) => createFile(path))
			),
			getAbstractFileByPath: vi.fn((path: string) => {
				const normalized = path.replace(/\\/g, '/');
				return files.has(normalized) ? createFile(normalized) : null;
			}),
			process: vi.fn(async (file: MockFile, mutator: (content: string) => string) => {
				const current = files.get(file.path);
				if (current === undefined) {
					throw new Error(`Missing file: ${file.path}`);
				}
				files.set(file.path, mutator(current));
			}),
		},
		workspace: {
			getLeavesOfType: vi.fn((type: string) => {
				if (type !== 'markdown') {
					return [];
				}
				return openMarkdownViews.map((view) => ({ view }));
			}),
		},
		metadataCache: {
			resolvedLinks: {
				'Notes/demo.md': {
					'Books/demo.epub': 1,
				},
			},
			getFileCache: vi.fn(() => null),
			getBacklinksForFile: vi.fn(() => null),
			on: vi.fn(),
			off: vi.fn(),
		},
		plugins: {
			getPlugin: vi.fn(() => ({
				settings: { weaveParentFolder: '' },
			})),
		},
	};

	return { app, files, openMarkdownViews };
}

describe('EpubBacklinkHighlightService', () => {
	it('collects current and legacy epub callouts while ignoring same-name books in other folders', async () => {
		const noteContent = [
			'> [!EPUB|green] [[Books/demo.epub#weave-cfi=readium%3Aalpha|Demo]] 2026-03-28 12:00',
			'> Current quote',
			'',
			'> [!EPUB|red] [[Archive/demo.epub#weave-cfi=readium%3Aother|Other]]',
			'> Wrong book',
			'',
			'> [!EPUB|blue] [Legacy](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/8)&text=Legacy)',
			'> Legacy quote',
			'',
		].join('\n');
		const { app } = createMockApp({
			'Notes/demo.md': noteContent,
		});
		const service = new EpubBacklinkHighlightService(app);

		const highlights = await service.collectHighlights('Books/demo.epub');

		expect(highlights).toEqual([
			{
				cfiRange: 'readium:alpha',
				color: 'green',
				text: 'Current quote',
				sourceFile: 'Notes/demo.md',
				sourceRef: undefined,
				createdTime: new Date('2026-03-28T12:00').getTime(),
			},
			{
				cfiRange: 'epubcfi(/6/8)',
				color: 'blue',
				text: 'Legacy quote',
				sourceFile: 'Notes/demo.md',
				sourceRef: undefined,
				createdTime: undefined,
			},
		]);
	});

	it('removes a legacy protocol epub callout from markdown sources', async () => {
		const notePath = 'Notes/demo.md';
		const noteContent = [
			'> [!EPUB|blue] [Legacy](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/8)&text=Legacy)',
			'> Legacy quote',
			'',
			'Plain tail',
		].join('\n');
		const { app, files } = createMockApp({
			[notePath]: noteContent,
		});
		const service = new EpubBacklinkHighlightService(app);

		const deleted = await service.deleteHighlight(notePath, 'epubcfi(/6/8)', 'Books/demo.epub');

		expect(deleted).toBe(true);
		expect(files.get(notePath)).toBe('Plain tail');
	});

	it('collects sid-bound highlights after the epub file is renamed to a new path', async () => {
		const notePath = 'Notes/renamed.md';
		const noteContent = [
			'> [!EPUB|green] [[Archive/old-demo.epub#weave-cfi=readium%3Aalpha&sid=epubsrc-stable|Demo]] 2026-03-28 12:00',
			'> Renamed quote',
			'',
		].join('\n');
		const { app } = createMockApp({
			[notePath]: noteContent,
			'Books/new-demo.epub': 'same-binary',
			'weave/incremental-reading/epub-reading/epub-source-registry.json': JSON.stringify([
				{
					sourceId: 'epubsrc-stable',
					filePath: 'Books/new-demo.epub',
					lastSeenAt: 1710000000000,
					lastKnownPath: 'Books/new-demo.epub',
				},
			]),
		});
		app.metadataCache.resolvedLinks = {};
		const service = new EpubBacklinkHighlightService(app);

		const highlights = await service.collectHighlights('Books/new-demo.epub');

		expect(highlights).toEqual([
			{
				cfiRange: 'readium:alpha',
				color: 'green',
				text: 'Renamed quote',
				sourceFile: notePath,
				sourceRef: undefined,
				createdTime: new Date('2026-03-28T12:00').getTime(),
			},
		]);
	});

	it('deletes sid-bound highlights even when the stored callout still points at the old epub path', async () => {
		const notePath = 'Notes/renamed-delete.md';
		const noteContent = [
			'> [!EPUB|blue] [[Archive/old-demo.epub#weave-cfi=epubcfi(/6/8)&sid=epubsrc-stable|Demo]]',
			'> Legacy quote',
			'',
			'Plain tail',
		].join('\n');
		const { app, files } = createMockApp({
			[notePath]: noteContent,
			'Books/new-demo.epub': 'same-binary',
			'weave/incremental-reading/epub-reading/epub-source-registry.json': JSON.stringify([
				{
					sourceId: 'epubsrc-stable',
					filePath: 'Books/new-demo.epub',
					lastSeenAt: 1710000000000,
					lastKnownPath: 'Books/new-demo.epub',
				},
			]),
		});
		const service = new EpubBacklinkHighlightService(app);

		const deleted = await service.deleteHighlight(notePath, 'epubcfi(/6/8)', 'Books/new-demo.epub');

		expect(deleted).toBe(true);
		expect(files.get(notePath)).toBe('Plain tail');
	});

	it('resolves json card source with card reference when locating by cfi', async () => {
		const jsonPath = 'weave/memory/cards/cards-0.json';
		const jsonContent = JSON.stringify({
			cards: [
				{
					uuid: 'card-a',
					content: '> [!EPUB|green] [[Books/demo.epub#weave-cfi=readium%3Aalpha|Demo]]\n> Quote A\n',
				},
				{
					uuid: 'card-b',
					content: '> [!EPUB|blue] [[Books/demo.epub#weave-cfi=readium%3Abeta|Demo]]\n> Quote B\n',
				},
			],
		});
		const { app } = createMockApp({
			[jsonPath]: jsonContent,
		});
		const service = new EpubBacklinkHighlightService(app);

		const match = await service.findSourceForCfi('readium:beta', 'Books/demo.epub');

		expect(match).toEqual({
			sourceFile: jsonPath,
			sourceRef: 'card:card-b',
		});
	});

	it('falls back to highlight text when a temporary canonical cfi no longer matches the stored card locator', async () => {
		const jsonPath = 'weave/memory/cards/cards-0.json';
		const jsonContent = JSON.stringify({
			cards: [
				{
					uuid: 'card-a',
					content: '> [!EPUB|green] [[Books/demo.epub#weave-cfi=readium%3Alegacy-alpha|Demo]]\n> Quote A\n',
				},
				{
					uuid: 'card-b',
					content: '> [!EPUB|blue] [[Books/demo.epub#weave-cfi=readium%3Alegacy-beta|Demo]] 2026-03-28 12:00\n> Quote B\n',
				},
			],
		});
		const { app } = createMockApp({
			[jsonPath]: jsonContent,
		});
		const service = new EpubBacklinkHighlightService(app);

		const match = await service.findSourceForCfi('epubcfi(/6/8!/4/2)', 'Books/demo.epub', undefined, {
			text: 'Quote B',
			createdTime: new Date('2026-03-28T12:00').getTime(),
		});

		expect(match).toEqual({
			sourceFile: jsonPath,
			sourceRef: 'card:card-b',
		});
	});

	it('updates markdown highlight colors through an already-open note editor', async () => {
		const notePath = 'Notes/demo.md';
		const noteContent = [
			'> [!EPUB|green] [[Books/demo.epub#weave-cfi=readium%3Aalpha|Demo]]',
			'> Current quote',
			'',
		].join('\n');
		const { app, files, openMarkdownViews } = createMockApp(
			{ [notePath]: noteContent },
			{ openMarkdownPaths: [notePath] },
		);
		const service = new EpubBacklinkHighlightService(app);

		const changed = await service.changeHighlightColor(notePath, 'readium:alpha', 'Books/demo.epub', 'purple');

		expect(changed).toBe(true);
		expect(files.get(notePath)).toContain('> [!EPUB|purple] [[Books/demo.epub#weave-cfi=readium%3Aalpha|Demo]]');
		expect(openMarkdownViews[0]?.save).toHaveBeenCalledTimes(1);
		expect(app.vault.modify).not.toHaveBeenCalled();
		expect(app.vault.process).not.toHaveBeenCalled();
	});

	it('updates only the targeted canvas node highlight color when sourceRef is provided', async () => {
		const canvasPath = 'Canvas/demo.canvas';
		const canvasContent = JSON.stringify({
			nodes: [
				{
					id: 'node-1',
					type: 'text',
					text: '> [!EPUB|green] [[Books/demo.epub#weave-cfi=readium%3Aalpha|Demo]]\n> Quote A\n',
				},
				{
					id: 'node-2',
					type: 'text',
					text: '> [!EPUB|blue] [[Books/demo.epub#weave-cfi=readium%3Abeta|Demo]]\n> Quote B\n',
				},
			],
		});
		const { app, files } = createMockApp({
			[canvasPath]: canvasContent,
		});
		const service = new EpubBacklinkHighlightService(app);

		const changed = await service.changeHighlightColor(canvasPath, 'readium:beta', 'Books/demo.epub', 'red', 'canvas:node-2');

		expect(changed).toBe(true);
		const parsed = JSON.parse(files.get(canvasPath) || '{}');
		expect(parsed.nodes[0].text).toContain('> [!EPUB|green]');
		expect(parsed.nodes[1].text).toContain('> [!EPUB|red]');
	});

	it('updates only the targeted card shard entry highlight color when sourceRef is provided', async () => {
		const jsonPath = 'weave/memory/cards/cards-0.json';
		const jsonContent = JSON.stringify({
			cards: [
				{
					uuid: 'card-a',
					content: '> [!EPUB|green] [[Books/demo.epub#weave-cfi=readium%3Aalpha|Demo]]\n> Quote A\n',
				},
				{
					uuid: 'card-b',
					content: '> [!EPUB|blue] [[Books/demo.epub#weave-cfi=readium%3Abeta|Demo]]\n> Quote B\n',
				},
			],
		});
		const { app, files } = createMockApp({
			[jsonPath]: jsonContent,
		});
		const service = new EpubBacklinkHighlightService(app);

		const changed = await service.changeHighlightColor(jsonPath, 'readium:beta', 'Books/demo.epub', 'red', 'card:card-b');

		expect(changed).toBe(true);
		const parsed = JSON.parse(files.get(jsonPath) || '{}');
		expect(parsed.cards[0].content).toContain('> [!EPUB|green]');
		expect(parsed.cards[1].content).toContain('> [!EPUB|red]');
		expect(typeof parsed.cards[1].modified).toBe('string');
	});
});
