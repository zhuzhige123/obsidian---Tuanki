vi.mock('obsidian', async () => {
	const actual = await vi.importActual<typeof import('../../../tests/mocks/obsidian')>(
		'../../../tests/mocks/obsidian'
	);
	return {
		...actual,
		Notice: class Notice {
			constructor(_message?: string) {}
		},
	};
});

import { EpubScreenshotService } from '../EpubScreenshotService';

type RectInitLike = {
	left: number;
	top: number;
	width: number;
	height: number;
};

function makeDomRect(init: RectInitLike): DOMRect {
	return {
		x: init.left,
		y: init.top,
		left: init.left,
		top: init.top,
		width: init.width,
		height: init.height,
		right: init.left + init.width,
		bottom: init.top + init.height,
		toJSON() {
			return this;
		},
	} as DOMRect;
}

function mockElementRect(element: Element, init: RectInitLike) {
	Object.defineProperty(element, 'getBoundingClientRect', {
		configurable: true,
		value: () => makeDomRect(init),
	});
}

function installRangeRectMap(doc: Document, rectMap: Record<string, RectInitLike>) {
	Object.defineProperty(doc, 'createRange', {
		configurable: true,
		value: () => {
			let selectedText = '';
			return {
				selectNodeContents(node: Node) {
					selectedText = node.textContent?.trim() || '';
				},
				getClientRects() {
					const rect = rectMap[selectedText];
					return rect ? [makeDomRect(rect)] : [];
				},
				detach() {},
			};
		},
	});
}

describe('EpubScreenshotService', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('extracts text from the iframe that actually overlaps the screenshot rect', () => {
		const service = new EpubScreenshotService({ vault: { adapter: {} } } as any);
		const sourceEl = document.createElement('div');
		document.body.appendChild(sourceEl);
		mockElementRect(sourceEl, { left: 0, top: 0, width: 200, height: 100 });

		const leftFrame = document.createElement('iframe');
		const rightFrame = document.createElement('iframe');
		sourceEl.append(leftFrame, rightFrame);
		mockElementRect(leftFrame, { left: 0, top: 0, width: 100, height: 100 });
		mockElementRect(rightFrame, { left: 100, top: 0, width: 100, height: 100 });

		leftFrame.contentDocument!.body.innerHTML = '<p>Left text</p>';
		rightFrame.contentDocument!.body.innerHTML = '<p>Right text</p>';
		installRangeRectMap(leftFrame.contentDocument!, {
			'Left text': { left: 10, top: 10, width: 40, height: 10 },
		});
		installRangeRectMap(rightFrame.contentDocument!, {
			'Right text': { left: 10, top: 10, width: 40, height: 10 },
		});

		const extracted = service.extractTextFromRect(sourceEl, {
			x: 110,
			y: 0,
			width: 50,
			height: 50,
		});

		expect(extracted).toBe('Right text');
	});

	it('creates nested attachment folders recursively before saving jpeg', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-28T10:20:30.000Z'));

		const mkdirCalls: string[] = [];
		const writeBinary = vi.fn(async () => {});
		const adapter = {
			exists: vi.fn(async () => false),
			mkdir: vi.fn(async (path: string) => {
				mkdirCalls.push(path);
			}),
			writeBinary,
		};
		const app = {
			vault: {
				adapter,
				getConfig: vi.fn((key: string) => key === 'attachmentFolderPath' ? 'Attachments/screens' : ''),
			},
		};
		const service = new EpubScreenshotService(app as any);

		const fakeBlob = {
			type: 'image/jpeg',
			arrayBuffer: vi.fn(async () => new TextEncoder().encode('jpeg-data').buffer),
		};
		const savedPath = await service.saveAsJpeg(fakeBlob as any, 'Demo/Book');

		expect(mkdirCalls).toEqual(['Attachments', 'Attachments/screens']);
		expect(writeBinary).toHaveBeenCalledTimes(1);
		expect(savedPath).toBe('Attachments/screens/epub-Demo_Book-2026-03-28T10-20-30.jpg');
	});
});
