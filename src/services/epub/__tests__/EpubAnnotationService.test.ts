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

import { EpubAnnotationService } from '../EpubAnnotationService';

describe('EpubAnnotationService', () => {
	it('clears legacy stored highlights at most once per book and keeps backlink highlights as the live source', async () => {
		let concealedTexts: any[] = [];

		const storageService = {
			removeLegacyHighlights: vi.fn(async () => {}),
			loadConcealedTexts: vi.fn(async () => concealedTexts),
			saveConcealedTexts: vi.fn(async (_bookId: string, nextConcealedTexts: typeof concealedTexts) => {
				concealedTexts = nextConcealedTexts;
			}),
			getCanvasBinding: vi.fn(async () => null),
		} as any;

		const backlinkHighlights = [
			{
				cfiRange: 'epubcfi(/6/2[chapter-1]!/4/2)',
				color: 'green',
				text: 'Live highlight',
				sourceFile: 'Notes/demo.md',
				sourceRef: 'block-ref',
				createdTime: 2,
				presentation: 'highlight',
			},
		];
		const backlinkService = {
			collectHighlights: vi.fn(async () => backlinkHighlights),
		} as any;

		const service = new EpubAnnotationService(storageService);

		await expect(service.collectAllHighlights('book-1', 'Books/demo.epub', backlinkService)).resolves.toEqual([
			{
				...backlinkHighlights[0],
				sourceLocators: [
					{
						sourceFile: 'Notes/demo.md',
						sourceRef: 'block-ref',
					},
				],
			},
		]);
		expect(storageService.removeLegacyHighlights).toHaveBeenCalledTimes(1);

		await expect(service.collectAllHighlights('book-1', 'Books/demo.epub', backlinkService)).resolves.toEqual([
			{
				...backlinkHighlights[0],
				sourceLocators: [
					{
						sourceFile: 'Notes/demo.md',
						sourceRef: 'block-ref',
					},
				],
			},
		]);
		expect(backlinkService.collectHighlights).toHaveBeenCalledTimes(1);

		service.invalidateCollectedHighlightsCache('book-1', 'Books/demo.epub');

		await expect(service.collectAllHighlights('book-1', 'Books/demo.epub', backlinkService)).resolves.toEqual([
			{
				...backlinkHighlights[0],
				sourceLocators: [
					{
						sourceFile: 'Notes/demo.md',
						sourceRef: 'block-ref',
					},
				],
			},
		]);
		expect(backlinkService.collectHighlights).toHaveBeenCalledTimes(2);
	});

	it('merges all source locators for the same cfi and preserves the preferred primary source', async () => {
		const storageService = {
			removeLegacyHighlights: vi.fn(async () => {}),
			loadConcealedTexts: vi.fn(async () => []),
			getCanvasBinding: vi.fn(async () => null),
		} as any;

		const backlinkService = {
			collectHighlights: vi.fn(async () => [
				{
					cfiRange: 'readium:shared',
					color: 'green',
					text: 'Shared highlight',
					sourceFile: 'Notes/demo.md',
					createdTime: 2,
				},
				{
					cfiRange: 'readium:shared',
					color: 'green',
					style: 'wavy',
					text: 'Shared highlight',
					sourceFile: 'weave/memory/deck-files/demo_01.wdeck',
					sourceRef: 'card:card-a',
					createdTime: 2,
				},
			]),
		} as any;

		const service = new EpubAnnotationService(storageService);

		await expect(service.collectAllHighlights('book-1', 'Books/demo.epub', backlinkService)).resolves.toEqual([
			{
				cfiRange: 'readium:shared',
				color: 'green',
				style: 'wavy',
				text: 'Shared highlight',
				sourceFile: 'weave/memory/deck-files/demo_01.wdeck',
				sourceRef: 'card:card-a',
				sourceLocators: [
					{
						sourceFile: 'Notes/demo.md',
						sourceRef: undefined,
					},
					{
						sourceFile: 'weave/memory/deck-files/demo_01.wdeck',
						sourceRef: 'card:card-a',
					},
				],
				createdTime: 2,
				presentation: 'highlight',
			},
		]);
	});

	it('prefers canvas file-node locators as the primary backlink target when present alongside a markdown excerpt source', async () => {
		const storageService = {
			removeLegacyHighlights: vi.fn(async () => {}),
			loadConcealedTexts: vi.fn(async () => []),
			getCanvasBinding: vi.fn(async () => null),
		} as any;

		const backlinkService = {
			collectHighlights: vi.fn(async () => [
				{
					cfiRange: 'readium:canvas-shared',
					color: 'purple',
					text: 'Canvas shared highlight',
					sourceFile: 'Notes/demo.md',
					excerptId: 'excerpt-fixed',
					sourceLocators: [
						{
							sourceFile: 'Canvas/demo.canvas',
							sourceRef: 'canvas-file-node:file-node-1',
							excerptId: 'excerpt-fixed',
						},
					],
					createdTime: 3,
				},
			]),
		} as any;

		const service = new EpubAnnotationService(storageService);

		await expect(service.collectAllHighlights('book-1', 'Books/demo.epub', backlinkService)).resolves.toEqual([
			{
				cfiRange: 'readium:canvas-shared',
				color: 'purple',
				text: 'Canvas shared highlight',
				sourceFile: 'Canvas/demo.canvas',
				sourceRef: 'canvas-file-node:file-node-1',
				excerptId: 'excerpt-fixed',
				sourceLocators: [
					{
						sourceFile: 'Notes/demo.md',
						sourceRef: undefined,
						excerptId: 'excerpt-fixed',
					},
					{
						sourceFile: 'Canvas/demo.canvas',
						sourceRef: 'canvas-file-node:file-node-1',
						excerptId: 'excerpt-fixed',
					},
				],
				createdTime: 3,
				presentation: 'highlight',
			},
		]);
	});

	it('exports book highlights to markdown as complete epub quote blocks with metadata', async () => {
		const storageService = {
			getApp: vi.fn(() => ({
				vault: {
					getAbstractFileByPath: vi.fn(() => null),
				},
				fileManager: {
					generateMarkdownLink: vi.fn(),
				},
			})),
			getBook: vi.fn(async () => ({
				id: 'book-1',
				filePath: 'Books/demo.epub',
				sourceId: 'epubsrc-demo',
				metadata: {
					title: '示例 EPUB',
					author: '张三',
					publisher: '测试出版社',
				},
				currentPosition: {
					percent: 42,
				},
			})),
			removeLegacyHighlights: vi.fn(async () => {}),
			loadConcealedTexts: vi.fn(async () => []),
			getCanvasBinding: vi.fn(async () => null),
		} as any;

		const backlinkService = {
			collectHighlights: vi.fn(async () => [
				{
					cfiRange: 'epubcfi(/6/4)',
					color: 'yellow',
					text: '第一条高亮',
					chapterIndex: 2,
					chapterTitle: '雪夜的故事',
					sourceFile: 'Notes/demo.md',
					excerptId: 'excerpt-a',
					createdTime: new Date('2026-04-27T13:32:00').getTime(),
					presentation: 'highlight',
				},
				{
					cfiRange: 'epubcfi(/6/6)',
					color: 'blue',
					text: '第二条高亮',
					chapterIndex: 3,
					chapterTitle: '晨光',
					sourceFile: 'Notes/demo.md',
					excerptId: 'excerpt-b',
					createdTime: new Date('2026-04-28T09:15:00').getTime(),
					presentation: 'highlight',
				},
			]),
		} as any;

		const service = new EpubAnnotationService(storageService);

		const markdown = await service.exportToMarkdown('book-1', {
			filePath: 'Books/demo.epub',
			backlinkService,
		});

		expect(markdown).toContain('# 示例 EPUB - 阅读笔记');
		expect(markdown).toContain('- **作者**: 张三');
		expect(markdown).toContain('- **出版社**: 测试出版社');
		expect(markdown).toContain('- **阅读进度**: 42%');
		expect(markdown).toContain('## 高亮');
		expect(markdown).toMatch(/> \[!EPUB\|yellow\] \[\[Books\/demo\.epub#weave-cfi=epubcfi\(\/6\/4\)&sid=epubsrc-demo&eid=excerpt-a\|demo\]\] \[雪夜的故事\] 2026-04-27 13:32\n> 第一条高亮\n/);
		expect(markdown).toMatch(/> \[!EPUB\|blue\] \[\[Books\/demo\.epub#weave-cfi=epubcfi\(\/6\/6\)&sid=epubsrc-demo&eid=excerpt-b\|demo\]\] \[晨光\] 2026-04-28 09:15\n> 第二条高亮\n/);
		expect(markdown).toContain('> 第一条高亮');
		expect(markdown).toContain('> 第二条高亮');
	});
});
