import { afterEach, describe, expect, it, vi } from 'vitest';

function enhanceDiv<T extends HTMLDivElement>(div: T) {
	const el = div as T & {
		empty: () => void;
		addClass: (...classes: string[]) => void;
		createDiv: (options?: string | { cls?: string | string[]; text?: string | DocumentFragment }) => HTMLDivElement;
	};
	el.empty = () => {
		el.innerHTML = '';
	};
	el.addClass = (...classes: string[]) => {
		el.classList.add(...classes);
	};
	el.createDiv = (options) => {
		const child = enhanceDiv(document.createElement('div'));
		if (typeof options === 'string') {
			child.className = options;
		} else if (options) {
			if (options.cls) {
				child.className = Array.isArray(options.cls) ? options.cls.join(' ') : options.cls;
			}
			if (options.text) {
				if (typeof options.text === 'string') {
					child.textContent = options.text;
				} else {
					child.appendChild(options.text);
				}
			}
		}
		el.appendChild(child);
		return child;
	};
	return el;
}

const mountSpy = vi.fn(() => ({}));
const unmountSpy = vi.fn();

vi.mock('svelte', () => ({
	mount: mountSpy,
	unmount: unmountSpy,
}));

vi.mock('../components/epub/EpubReaderApp.svelte', () => ({
	default: {},
}));

vi.mock('../services/epub/epub-error', () => ({
	reportEpubError: () => ({ userMessage: 'EPUB 打开失败' }),
}));

vi.mock('../utils/epub-leaf-utils', () => ({
	resolveRecentEpubPath: vi.fn(),
}));

vi.mock('../utils/i18n', () => ({
	i18n: {
		t: (key: string) => key,
	},
}));

vi.mock('../utils/logger', () => ({
	logger: {
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock('./EpubSidebarView', () => ({
	VIEW_TYPE_EPUB_SIDEBAR: 'weave-epub-sidebar',
}));

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<typeof import('../tests/mocks/obsidian')>(
		'../tests/mocks/obsidian'
	);

	class ItemView extends actual.ItemView {
		public contentEl = enhanceDiv(document.createElement('div'));

		constructor(leaf: unknown) {
			super(leaf as any);
		}

		async setState(): Promise<void> {}
	}

	return {
		...actual,
		ItemView,
		Platform: { ...actual.Platform, isMobile: true },
		setIcon: vi.fn(),
	};
});

import { EpubView } from './EpubView';

describe('EpubView', () => {
	afterEach(() => {
		mountSpy.mockClear();
		unmountSpy.mockClear();
	});

	it('uses explicit incremental reading capability instead of wrapped resume callback presence', () => {
		const view = new EpubView({} as any, { app: {} } as any);

		(view as any).actionHandlers = {
			markIRResumePoint: vi.fn(),
			canMarkIRResumePoint: () => false,
		};
		expect((view as any).hasWeaveIncrementalReadingHost()).toBe(false);

		(view as any).actionHandlers = {
			markIRResumePoint: vi.fn(),
			canMarkIRResumePoint: () => true,
		};
		expect((view as any).hasWeaveIncrementalReadingHost()).toBe(true);
	});

	it('passes initial pending CFI to EpubReaderApp props without replaying navigateToCfi in onActionsReady', async () => {
		const view = new EpubView({} as any, { app: {} } as any);
		(view as any).isOpen = true;
		(view as any).filePath = 'Books/demo.epub';
		(view as any).pendingCfi = 'epubcfi(/6/2!/4/2,/1:0,/1:9)';
		(view as any).pendingText = 'demo excerpt';

		await (view as any).mountComponent();

		expect(mountSpy).toHaveBeenCalledTimes(1);
		const mountCall = mountSpy.mock.calls[0] as unknown as [unknown, {
			props: {
				pendingCfi?: string;
				pendingText?: string;
				onActionsReady?: (actions: { navigateToCfi?: (cfi: string, text: string) => void }) => void;
			};
		}];
		const mountOptions = mountCall[1];
		expect(mountOptions.props.pendingCfi).toBe('epubcfi(/6/2!/4/2,/1:0,/1:9)');
		expect(mountOptions.props.pendingText).toBe('demo excerpt');
		expect((view as any).pendingCfi).toBe('');
		expect((view as any).pendingText).toBe('');

		const navigateToCfi = vi.fn();
		mountOptions.props.onActionsReady?.({ navigateToCfi });
		expect(navigateToCfi).not.toHaveBeenCalled();
	});
});
