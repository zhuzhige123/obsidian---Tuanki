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
	MarkdownPostProcessorContext: class MarkdownPostProcessorContext {},
	setIcon: vi.fn(),
	normalizePath: (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, ''),
}));

import { createEpubLinkPostProcessor } from '../EpubLinkPostProcessor';
import { EpubLinkService } from '../EpubLinkService';

beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, 'addClass', {
		configurable: true,
		value(this: HTMLElement, className: string) {
			this.classList.add(className);
		},
	});
	Object.defineProperty(HTMLElement.prototype, 'removeClass', {
		configurable: true,
		value(this: HTMLElement, className: string) {
			this.classList.remove(className);
		},
	});
	Object.defineProperty(HTMLElement.prototype, 'empty', {
		configurable: true,
		value(this: HTMLElement) {
			this.replaceChildren();
		},
	});
	Object.defineProperty(HTMLElement.prototype, 'createSpan', {
		configurable: true,
		value(this: HTMLElement, options?: { cls?: string; text?: string }) {
			const span = document.createElement('span');
			if (options?.cls) {
				span.className = options.cls;
			}
			if (options?.text) {
				span.textContent = options.text;
			}
			this.appendChild(span);
			return span;
		},
	});
});

describe('EpubLinkPostProcessor', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('does not double-bind EPUB link click handlers when the same element is processed repeatedly', async () => {
		const navigateSpy = vi
			.spyOn(EpubLinkService.prototype, 'navigateToEpubLocation')
			.mockResolvedValue(undefined);

		const container = document.createElement('div');
		container.innerHTML = '<a class="internal-link" href="Books/demo.epub#weave-cfi=readium%3Aabc&text=Hello%20world">Demo</a>';

		const processor = createEpubLinkPostProcessor({} as any);
		processor(container, {} as any);
		processor(container, {} as any);

		const link = container.querySelector('a');
		expect(link).not.toBeNull();

		link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(navigateSpy).toHaveBeenCalledTimes(1);
		expect(navigateSpy).toHaveBeenCalledWith('Books/demo.epub', 'readium:abc', 'Hello world');
	});

	it('supports legacy tuanki-cfi equals links even when the anchor is not marked as an internal link', async () => {
		const navigateSpy = vi
			.spyOn(EpubLinkService.prototype, 'navigateToEpubLocation')
			.mockResolvedValue(undefined);

		const container = document.createElement('div');
		container.innerHTML = '<a href="Books/demo.epub#tuanki-cfi=epubcfi(/6/2[chapter-1]!/4/4)">Legacy</a>';

		const processor = createEpubLinkPostProcessor({} as any);
		processor(container, {} as any);

		const link = container.querySelector('a');
		expect(link).not.toBeNull();

		link!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(navigateSpy).toHaveBeenCalledTimes(1);
		expect(navigateSpy).toHaveBeenCalledWith('Books/demo.epub', 'epubcfi(/6/2[chapter-1]!/4/4)', '');
	});
});
