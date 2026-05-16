vi.mock('obsidian', () => ({
	App: class MockApp {},
	TFile: class MockTFile {},
	ItemView: class MockItemView {},
	WorkspaceLeaf: class MockWorkspaceLeaf {},
	MarkdownView: class MockMarkdownView {},
	Notice: class MockNotice {
		constructor(_message?: string) {}
	},
	Menu: class MockMenu {},
	Modal: class MockModal {},
	Plugin: class MockPlugin {},
	PluginSettingTab: class MockPluginSettingTab {},
	Platform: { isMobile: false },
	setIcon: vi.fn(),
	normalizePath: (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''),
}));

import { EpubLinkService } from '../EpubLinkService';

const encodeCompactField = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const buildCompactReadiumLocator = (href: string, progression: string, highlight?: string): string => {
	const fields = ['loc', encodeCompactField(href), progression, '', '', highlight ? encodeCompactField(highlight) : ''];
	while (fields.length > 1 && fields[fields.length - 1] === '') {
		fields.pop();
	}
	return `readium:${fields.join('~')}`;
};

describe('EpubLinkService legacy link compatibility', () => {
	it('extracts the first EPUB wikilink for both current and legacy hash formats', () => {
		const current = '前文 [[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]] 后文';
		const legacyDash = '前文 [[Books/demo.epub#tuanki-cfi-epubcfi(/6/2[chapter-1]!/4/4)|Demo]] 后文';
		const legacyEquals = '前文 [[Books/demo.epub#tuanki-cfi=epubcfi(/6/2[chapter-1]!/4/4)|Demo]] 后文';

		expect(EpubLinkService.extractFirstEpubLinkMarkup(current)).toBe('[[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]]');
		expect(EpubLinkService.extractFirstEpubLinkMarkup(legacyDash)).toBe('[[Books/demo.epub#tuanki-cfi-epubcfi(/6/2[chapter-1]!/4/4)|Demo]]');
		expect(EpubLinkService.extractFirstEpubLinkMarkup(legacyEquals)).toBe('[[Books/demo.epub#tuanki-cfi=epubcfi(/6/2[chapter-1]!/4/4)|Demo]]');
	});

	it('extracts legacy protocol EPUB links and resolves their file paths', () => {
		const protocolLink = '[EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/2)&text=Hello)';

		expect(EpubLinkService.extractFirstEpubLinkMarkup(protocolLink)).toBe(protocolLink);
		expect(EpubLinkService.extractFilePathFromEpubLinkMarkup(protocolLink)).toBe('Books/demo.epub');
	});

	it('parses both legacy tuanki subpaths and readium subpaths', () => {
		expect(EpubLinkService.parseEpubLink('#tuanki-cfi-epubcfi(/6/2[chapter-1]!/4/4)')).toEqual({
			filePath: '',
			cfi: 'epubcfi(/6/2[chapter-1]!/4/4)',
			text: '',
			chapter: undefined,
		});

		expect(EpubLinkService.parseEpubLink('#tuanki-cfi=epubcfi(/6/2[chapter-1]!/4/4)')).toEqual({
			filePath: '',
			cfi: 'epubcfi(/6/2[chapter-1]!/4/4)',
			text: '',
			chapter: undefined,
		});

		expect(EpubLinkService.parseEpubLink('#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world')).toEqual({
			filePath: '',
			cfi: 'readium:abc',
			text: 'Hello world',
			chapter: 3,
		});
	});

	it('parses complete EPUB link markup for both current wikilinks and legacy protocol links', () => {
		expect(EpubLinkService.parseLinkMarkup('[[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|Demo]]')).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'readium:abc',
			text: 'Hello world',
			chapter: 3,
		});

		expect(EpubLinkService.parseLinkMarkup('[EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/2)&text=Hello)')).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'epubcfi(/6/2)',
			text: 'Hello',
			chapter: undefined,
		});
	});

	it('builds compact cfi-only wikilinks for new excerpts', () => {
		const service = new EpubLinkService({} as any);

		const built = service.buildEpubLink(
			'Books/demo.epub',
			'readium:abc',
			'Hello world',
			3,
			'Part 1 | Intro ]]'
		);

		expect(built).toMatch(/^\[\[Books\/demo\.epub#weave-cfi=/);
		expect(EpubLinkService.parseLinkMarkup(built)).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'readium:abc',
			text: '',
			chapter: undefined,
			sourceId: undefined,
			excerptId: undefined,
		});
	});

	it('preserves source identity inside epub source links', () => {
		const service = new EpubLinkService({} as any);
		const built = service.buildEpubLink(
			'Books/demo.epub',
			'epubcfi(/6/2)',
			'Hello',
			undefined,
			undefined,
			undefined,
			'epubsrc-fixed'
		);

		expect(built).toMatch(/^\[\[Books\/demo\.epub#weave-cfi=.*&sid=epubsrc-fixed\|demo\]\]$/);
		expect(EpubLinkService.parseLinkMarkup(built)).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'epubcfi(/6/2)',
			text: '',
			chapter: undefined,
			sourceId: 'epubsrc-fixed',
		});
	});

	it('preserves excerpt identity inside epub source links', () => {
		const service = new EpubLinkService({} as any);
		const built = service.buildEpubLink(
			'Books/demo.epub',
			'epubcfi(/6/4)',
			'Hello excerpt',
			undefined,
			undefined,
			undefined,
			'epubsrc-fixed',
			'excerpt-fixed'
		);

		expect(built).toMatch(/&sid=epubsrc-fixed&eid=excerpt-fixed\|demo\]\]$/);
		expect(EpubLinkService.parseLinkMarkup(built)).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'epubcfi(/6/4)',
			text: '',
			chapter: undefined,
			sourceId: 'epubsrc-fixed',
			excerptId: 'excerpt-fixed',
		});
	});

	it('keeps compact readium locators short without duplicating text payloads', () => {
		const service = new EpubLinkService({} as any);
		const compactLocator = buildCompactReadiumLocator('OPS/text/chapter1.xhtml', '0.125', 'Hello world');

		expect(EpubLinkService.extractEmbeddedTextFromReadiumLocator(compactLocator)).toBe('Hello world');
		expect(EpubLinkService.parseEpubLink(`#weave-cfi=${compactLocator}&chapter=3`)).toEqual({
			filePath: '',
			cfi: compactLocator,
			text: 'Hello world',
			chapter: 3,
		});
		expect(service.buildEpubLink(
			'Books/demo.epub',
			compactLocator,
			'Hello world',
			3,
			'Part 1',
		)).toMatch(/^\[\[Books\/demo\.epub#weave-cfi=/);
	});

	it('renders quote blocks with chapter and timestamp outside the link body', () => {
		const service = new EpubLinkService({} as any);

		expect(service.buildQuoteBlock(
			'Books/demo.epub',
			'readium:abc',
			'Hello world',
			14,
			'red',
			'根据意图评判我们的行动',
			'2026-03-26 19:08'
		)).toMatch(/^> \[!EPUB\|red\] \[\[Books\/demo\.epub#weave-cfi=readium:abc\|demo\]\] \[根据意图评判我们的行动\] 2026-03-26 19:08\n> Hello world\n$/);
	});

	it('builds and parses combined highlight color and style metadata', () => {
		expect(EpubLinkService.buildHighlightCalloutMeta('blue', 'underline')).toBe('blue+underline');
		expect(EpubLinkService.buildHighlightCalloutMeta('pink', 'wavy')).toBe('red+wavy');
		expect(EpubLinkService.parseHighlightCalloutMeta('purple+wavy')).toEqual({
			color: 'purple',
			style: 'wavy',
		});
		expect(EpubLinkService.parseHighlightCalloutMeta('underline red')).toEqual({
			color: 'red',
			style: 'underline',
		});
	});

	it('renders styled quote blocks with color and style metadata', () => {
		const service = new EpubLinkService({} as any);

		expect(service.buildQuoteBlock(
			'Books/demo.epub',
			'readium:styled',
			'Underline me',
			2,
			'green',
			'第二章',
			undefined,
			undefined,
			undefined,
			undefined,
			'underline'
		)).toMatch(/^> \[!EPUB\|green\+underline\] \[\[Books\/demo\.epub#weave-cfi=readium:styled\|demo\]\] \[第二章\]\n> Underline me\n$/);
	});

	it('renders strikethrough quote blocks with markdown deletion source text', () => {
		const service = new EpubLinkService({} as any);

		expect(service.buildQuoteBlock(
			'Books/demo.epub',
			'readium:hidden',
			'Hide me',
			5,
			'purple',
			'第五章',
			undefined,
			undefined,
			undefined,
			undefined,
			'strikethrough'
		)).toMatch(/^> \[!EPUB\|purple\+strikethrough\] \[\[Books\/demo\.epub#weave-cfi=readium:hidden\|demo\]\] \[第五章\]\n> ~~Hide me~~\n$/);
	});

	it('detects and migrates legacy epub links inside content', () => {
		const service = new EpubLinkService({} as any);
		const content = [
			'前文 [[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|摘录]]',
			'[EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/2)&text=Hello)',
			'后文 [[Books/demo.epub#weave-cfi=readium:xyz|demo]]',
		].join('\n');

		expect(
			EpubLinkService.isLegacyEpubLinkMarkup(
				'[[Books/demo.epub#weave-cfi=readium%3Aabc&chapter=3&text=Hello%20world|摘录]]'
			)
		).toBe(true);
		expect(
			EpubLinkService.isLegacyEpubLinkMarkup('[[Books/demo.epub#weave-cfi=readium:xyz|demo]]')
		).toBe(false);

		const migrated = service.migrateLegacyEpubLinksInContent(content);
		expect(migrated.changed).toBe(true);
		expect(migrated.updatedLinks).toBe(2);
		const lines = migrated.content.split('\n');
		expect(lines[0]).toMatch(/^前文 \[\[Books\/demo\.epub#weave-cfi=readium:abc\|demo\]\]$/);
		expect(lines[1]).toMatch(/^\[\[Books\/demo\.epub#weave-cfi=epubcfi\(\/6\/2\)\|demo\]\]$/);
		expect(lines[2]).toBe('后文 [[Books/demo.epub#weave-cfi=readium:xyz|demo]]');
		expect(EpubLinkService.parseLinkMarkup(lines[0].replace(/^前文 /, ''))).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'readium:abc',
			text: '',
			chapter: undefined,
			sourceId: undefined,
			excerptId: undefined,
		});
		expect(EpubLinkService.parseLinkMarkup(lines[1])).toEqual({
			filePath: 'Books/demo.epub',
			cfi: 'epubcfi(/6/2)',
			text: '',
			chapter: undefined,
			sourceId: undefined,
			excerptId: undefined,
		});
	});

	it('enriches existing epub links with source ids without changing the locator', async () => {
		const writtenFiles = new Map<string, string>();
		const service = new EpubLinkService({
			vault: {
				getAbstractFileByPath: () => null,
				adapter: {
					exists: async (path: string) =>
						path === 'Books/demo.epub' ||
						path === 'weave' ||
						path === 'weave/incremental-reading' ||
						path === 'weave/incremental-reading/epub-reading' ||
						path === 'weave/incremental-reading/epub-reading/epub-source-registry.json',
					readBinary: async () => new TextEncoder().encode('demo-binary'),
					read: async () => writtenFiles.get('weave/incremental-reading/epub-reading/epub-source-registry.json') || '[]',
					write: async (path: string, content: string) => {
						writtenFiles.set(path, content);
					},
					mkdir: async () => {},
				},
			},
			plugins: {
				getPlugin: () => ({ settings: { weaveParentFolder: '' } }),
			},
		} as any);

		const result = await service.enrichEpubLinksWithSourceIdsInContent(
			'前文 [[Books/demo.epub#weave-cfi=readium:abc|demo]] 后文'
		);

		expect(result.changed).toBe(true);
		expect(result.updatedLinks).toBe(1);
		expect(result.content).toMatch(/\[\[Books\/demo\.epub#weave-cfi=readium:abc&sid=epubsrc-/);
	});

	it('migrates legacy protocol epub links to new wikilinks before backfilling source ids', async () => {
		const writtenFiles = new Map<string, string>();
		const service = new EpubLinkService({
			vault: {
				getAbstractFileByPath: () => null,
				adapter: {
					exists: async (path: string) =>
						path === 'Books/demo.epub' ||
						path === 'weave' ||
						path === 'weave/incremental-reading' ||
						path === 'weave/incremental-reading/epub-reading' ||
						path === 'weave/incremental-reading/epub-reading/epub-source-registry.json',
					readBinary: async () => new TextEncoder().encode('demo-binary'),
					read: async () => writtenFiles.get('weave/incremental-reading/epub-reading/epub-source-registry.json') || '[]',
					write: async (path: string, content: string) => {
						writtenFiles.set(path, content);
					},
					mkdir: async () => {},
				},
			},
			plugins: {
				getPlugin: () => ({ settings: { weaveParentFolder: '' } }),
			},
		} as any);

		const result = await service.enrichEpubLinksWithSourceIdsInContent(
			'[EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/2)&text=Hello)',
			'Notes/demo.md'
		);

		expect(result.changed).toBe(true);
		expect(result.updatedLinks).toBe(2);
		expect(result.content).toMatch(/^\[\[Books\/demo\.epub#weave-cfi=epubcfi\(\/6\/2\)&sid=epubsrc-[^|]+\|demo\]\]$/);
	});
});
