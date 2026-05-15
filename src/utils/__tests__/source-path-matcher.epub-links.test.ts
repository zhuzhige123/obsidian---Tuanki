import {
	extractAllSourcePaths,
	extractEpubSourcePath,
	extractSourcePath,
	filterCardsBySourceDocument,
	matchesSourceDocument,
} from '../source-path-matcher';

function createCard(content: string) {
	return {
		uuid: 'card-1',
		content,
	} as any;
}

describe('extractEpubSourcePath', () => {
	it('supports current EPUB wikilinks', () => {
		const content = 'we_source: [[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]]';
		expect(extractEpubSourcePath(content)).toBe('Books/demo.epub');
	});

	it('supports legacy tuanki EPUB wikilinks', () => {
		const content = 'we_source: [[Books/demo.epub#tuanki-cfi-epubcfi(/6/2[chapter-1]!/4/4)|Demo]]';
		expect(extractEpubSourcePath(content)).toBe('Books/demo.epub');
	});

	it('supports legacy weave-epub protocol links', () => {
		const content = 'we_source: [EPUB来源](obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/2)&text=Hello)';
		expect(extractEpubSourcePath(content)).toBe('Books/demo.epub');
	});
});

describe('source-path-matcher multi-source behavior', () => {
	it('extracts every valid source path from a multi-source card', () => {
		const card = createCard(`---
we_source:
  - [[notes/source.md]]
  - [[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]]
---
Body`);

		expect(extractAllSourcePaths(card)).toEqual([
			'notes/source.md',
			'Books/demo.epub',
		]);
		expect(extractSourcePath(card)).toBe('notes/source.md');
	});

	it('normalizes legacy card.sourceFile EPUB protocol links into vault paths', () => {
		const card = {
			uuid: 'card-legacy-epub',
			content: 'Body',
			sourceFile:
				'obsidian://weave-epub?vault=Vault&file=Books%2Fdemo.epub&cfi=epubcfi(/6/2)&text=Hello',
		} as any;

		expect(extractSourcePath(card)).toBe('Books/demo.epub');
	});

	it('normalizes legacy card.sourceFile wikilinks into vault paths', () => {
		const card = {
			uuid: 'card-legacy-link',
			content: 'Body',
			sourceFile: '[[notes/source.md#^block-1|来源]]',
		} as any;

		expect(extractSourcePath(card)).toBe('notes/source.md');
	});

	it('matches the EPUB document even when markdown source is listed first', () => {
		const card = createCard(`---
we_source:
  - [[notes/source.md]]
  - [[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]]
---
Body`);

		expect(matchesSourceDocument(card, 'Books/demo.epub')).toBe(true);
		expect(filterCardsBySourceDocument([card], 'Books/demo.epub')).toEqual([card]);
	});

	it('matches the markdown document even when EPUB source is listed first', () => {
		const card = createCard(`---
we_source:
  - [[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]]
  - [[notes/source.md]]
---
Body`);

		expect(matchesSourceDocument(card, 'notes/source.md')).toBe(true);
	});

	it('does not confuse same-basename markdown and EPUB files', () => {
		const card = createCard(`---
we_source: [[Books/demo.epub#weave-cfi=readium%3Aabc|Demo]]
---
Body`);

		expect(matchesSourceDocument(card, 'Books/demo.epub')).toBe(true);
		expect(matchesSourceDocument(card, 'Books/demo.md')).toBe(false);
	});

	it('strips canvas locator query parameters for document-level matching', () => {
		const card = createCard(`---
we_source: '[[boards/topic.canvas?x=10&y=20&width=30&height=40]]'
---
Body`);

		expect(extractSourcePath(card)).toBe('boards/topic.canvas');
		expect(matchesSourceDocument(card, 'boards/topic.canvas')).toBe(true);
	});
});
