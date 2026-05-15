<script lang="ts">
	import { setIcon, Platform } from 'obsidian';
	import type { App } from 'obsidian';
	import { onMount, tick } from 'svelte';
	import { logger } from '../../utils/logger';
	import type { EpubBook, EpubHighlightStyle, EpubReaderEngine, ReaderFrame } from '../../services/epub';
	import { computeToolbarPosition, createEventBinder, isEventOutsideToolbar } from './toolbar-positioning';

	interface Props {
		app: App;
		readerService: EpubReaderEngine;
		book: EpubBook | null;
		readerVersion?: number;
		autoInsert?: boolean;
		canvasMode?: boolean;
		onInsertToNote?: (text: string, cfiRange: string, color?: string, style?: EpubHighlightStyle) => void;
		onAutoInsert?: (text: string, cfiRange: string, color?: string, style?: EpubHighlightStyle) => void;
		onExtractToCard?: (text: string, cfiRange: string) => void;
		onCreateReadingPoint?: (text: string, cfiRange: string) => void;
		onOpenAIMenu: (event: MouseEvent, text: string, cfiRange: string) => void;
	}

	let {
		app,
		readerService,
		book,
		readerVersion = 0,
		autoInsert = false,
		canvasMode = false,
		onInsertToNote,
		onAutoInsert,
		onExtractToCard,
		onCreateReadingPoint,
		onOpenAIMenu
	}: Props = $props();

	let toolbarEl: HTMLDivElement | undefined = $state(undefined);
	let isVisible = $state(false);
	let posTop = $state(0);
	let posLeft = $state(0);
	let isBelowSelection = $state(false);
	let toolbarMode = $state<'floating' | 'docked'>('floating');
	let arrowOffset = $state(0);
	let selectedText = $state('');
	let currentCfiRange = $state('');
	let iframeDoc: Document | null = null;
	let teardownReaderTracking: (() => void) | null = null;
	let teardownPositionTracking: (() => void) | null = null;
	let activeFrame: ReaderFrame | null = null;
	let pendingSyncFrame: number | null = null;

	const isMobileToolbar = Platform.isMobile || document.body.classList.contains('is-mobile');

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return {
			update(newName: string) {
				// /skip innerHTML is used to clear the trusted icon container before setIcon rerenders it
				node.replaceChildren();
				setIcon(node, newName);
			}
		};
	}

	function getFrameElement(frame: ReaderFrame | null | undefined): HTMLIFrameElement | null {
		const iframeWindow = frame?.window || frame?.document?.defaultView;
		return (iframeWindow?.frameElement as HTMLIFrameElement | null) || null;
	}

	function closestAcrossShadowHosts(node: Node | null | undefined, selector: string): HTMLElement | null {
		let current: Node | null | undefined = node;
		while (current) {
			if (current instanceof HTMLElement) {
				const matched = current.closest(selector) as HTMLElement | null;
				if (matched) {
					return matched;
				}
			}
			const rootNode = current.getRootNode?.();
			if (!(rootNode instanceof ShadowRoot) || !(rootNode.host instanceof HTMLElement)) {
				break;
			}
			current = rootNode.host;
		}
		return null;
	}

	function getViewportContainer(frame: ReaderFrame | null | undefined): HTMLElement | null {
		const iframe = getFrameElement(frame);
		return closestAcrossShadowHosts(iframe, '.epub-reader-viewport')
			|| (document.querySelector('.epub-reader-viewport') as HTMLElement | null);
	}

	function getScrollTrackingHost(frame: ReaderFrame | null | undefined): HTMLElement | null {
		const iframe = getFrameElement(frame);
		return closestAcrossShadowHosts(iframe, '.epub-content-wrapper')
			|| (document.querySelector('.epub-content-wrapper') as HTMLElement | null);
	}

	function toAbsoluteViewportRect(rect: DOMRect, viewportEl: HTMLElement): DOMRect {
		const viewportRect = viewportEl.getBoundingClientRect();
		return new DOMRect(
			rect.left + viewportRect.left,
			rect.top + viewportRect.top,
			rect.width,
			rect.height
		);
	}

	function clearPendingSync() {
		if (pendingSyncFrame !== null) {
			window.cancelAnimationFrame(pendingSyncFrame);
			pendingSyncFrame = null;
		}
	}

	function stopPositionTracking() {
		clearPendingSync();
		teardownPositionTracking?.();
		teardownPositionTracking = null;
		activeFrame = null;
	}

	function hideToolbar() {
		isVisible = false;
		isBelowSelection = false;
		toolbarMode = 'floating';
		arrowOffset = 0;
		selectedText = '';
		currentCfiRange = '';
		stopPositionTracking();
	}

	function clearAndHide() {
		if (iframeDoc) {
			iframeDoc.getSelection()?.removeAllRanges();
		}
		hideToolbar();
	}

	async function handleHighlight(color: string, style?: EpubHighlightStyle) {
		if (!book || !selectedText || !currentCfiRange) {
			clearAndHide();
			return;
		}

		try {
			const highlight = { cfiRange: currentCfiRange, color, style, text: selectedText };
			if (autoInsert || canvasMode) {
				readerService.addHighlight(highlight);
			} else {
				readerService.addTemporaryHighlight(highlight, 2000);
			}
		} catch (e) {
			logger.warn('[SelectionToolbar] Failed to apply highlight:', e);
		}

		onAutoInsert?.(selectedText, currentCfiRange, color, style);
		clearAndHide();
	}

	function handleInsertToNote() {
		if (selectedText && currentCfiRange) {
			onInsertToNote?.(selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleExtractToCard() {
		if (selectedText && currentCfiRange) {
			onExtractToCard?.(selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleCreateReadingPoint() {
		if (selectedText && currentCfiRange) {
			onCreateReadingPoint?.(selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleOpenAIMenu(event: MouseEvent) {
		if (selectedText && currentCfiRange) {
			onOpenAIMenu(event, selectedText, currentCfiRange);
		}
		clearAndHide();
	}

	function handleSearch() {
		if (!selectedText) return;
		const searchPlugin = (app as any).internalPlugins?.getPluginById?.('global-search');
		if (searchPlugin?.instance) {
			searchPlugin.instance.openGlobalSearch(selectedText);
		}
		clearAndHide();
	}

	function getSelectionRect(selection: Selection): DOMRect | null {
		if (!selection.rangeCount) return null;
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		if (rect.width || rect.height) {
			return rect;
		}

		const rects = range.getClientRects();
		if (!rects.length) return null;

		let left = rects[0].left;
		let top = rects[0].top;
		let right = rects[0].right;
		let bottom = rects[0].bottom;

		for (let i = 1; i < rects.length; i++) {
			const current = rects[i];
			left = Math.min(left, current.left);
			top = Math.min(top, current.top);
			right = Math.max(right, current.right);
			bottom = Math.max(bottom, current.bottom);
		}

		return new DOMRect(left, top, right - left, bottom - top);
	}

	async function positionToolbar(anchorRect: DOMRect, containerEl: HTMLElement) {
		isVisible = true;
		await tick();

		if (!toolbarEl) return;

		const containerRect = containerEl.getBoundingClientRect();
		const position = computeToolbarPosition({
			anchorRect: {
				top: anchorRect.top - containerRect.top,
				left: anchorRect.left - containerRect.left,
				bottom: anchorRect.bottom - containerRect.top,
				right: anchorRect.right - containerRect.left,
				width: anchorRect.width,
				height: anchorRect.height,
			},
			containerWidth: containerEl.clientWidth,
			containerHeight: containerEl.clientHeight,
			toolbarWidth: toolbarEl.offsetWidth || 280,
			toolbarHeight: toolbarEl.offsetHeight || 72,
			mobile: isMobileToolbar,
		});

		toolbarMode = position.mode;
		posTop = position.top;
		posLeft = position.left;
		isBelowSelection = position.isBelowAnchor;
		arrowOffset = position.arrowOffset;
	}

	function scheduleActiveSync() {
		if (!activeFrame) return;
		const frame = activeFrame;
		clearPendingSync();
		pendingSyncFrame = window.requestAnimationFrame(() => {
			pendingSyncFrame = null;
			void syncSelection(frame);
		});
	}

	function startPositionTracking(frame: ReaderFrame) {
		if (activeFrame === frame && teardownPositionTracking) {
			return;
		}

		stopPositionTracking();
		activeFrame = frame;

		const iframeWindow = frame.window || frame.document?.defaultView;
		const iframeDocument = iframeWindow?.document;
		const scrollHost = getScrollTrackingHost(frame);
		const visualViewport = window.visualViewport;
		const binder = createEventBinder();

		binder.bind(scrollHost, 'scroll', scheduleActiveSync, { passive: true });
		binder.bind(iframeWindow, 'scroll', scheduleActiveSync, { passive: true });
		binder.bind(iframeWindow, 'resize', scheduleActiveSync);
		binder.bind(iframeDocument, 'mousedown', handleClickOutside);
		binder.bind(iframeDocument, 'touchstart', handleClickOutside, { passive: true });
		binder.bind(window, 'resize', scheduleActiveSync);
		binder.bind(window, 'orientationchange', scheduleActiveSync);
		binder.bind(visualViewport, 'resize', scheduleActiveSync);
		binder.bind(visualViewport, 'scroll', scheduleActiveSync);

		teardownPositionTracking = () => {
			binder.dispose();
		};
	}

	async function syncSelection(frame: ReaderFrame, cfiRange?: string) {
		try {
			const iframeWindow = frame.window || frame.document?.defaultView;
			if (!iframeWindow) {
				hideToolbar();
				return;
			}

			iframeDoc = iframeWindow.document;
			const selection = iframeWindow.getSelection();
			if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
				hideToolbar();
				return;
			}

			const text = selection.toString().trim();
			if (!text) {
				hideToolbar();
				return;
			}

			const range = selection.getRangeAt(0);
			const resolvedCfiRange = cfiRange || frame.cfiFromRange(range);
			if (!resolvedCfiRange) {
				hideToolbar();
				return;
			}

			const viewportEl = getViewportContainer(frame);
			if (!viewportEl) {
				hideToolbar();
				return;
			}

			selectedText = text;
			currentCfiRange = resolvedCfiRange;

			const rangeRect = getSelectionRect(selection);
			const iframe = getFrameElement(frame);
			let adjustedRect: DOMRect | null = null;
			if (rangeRect && iframe) {
				const iframeRect = iframe.getBoundingClientRect();
				adjustedRect = new DOMRect(
					rangeRect.left + iframeRect.left,
					rangeRect.top + iframeRect.top,
					rangeRect.width,
					rangeRect.height
				);
			} else {
				const navigationRect = readerService.getNavigationTargetRect({ cfi: resolvedCfiRange, text });
				if (navigationRect) {
					adjustedRect = toAbsoluteViewportRect(navigationRect, viewportEl);
				}
			}
			if (!adjustedRect) {
				hideToolbar();
				return;
			}

			startPositionTracking(frame);
			await positionToolbar(adjustedRect, viewportEl);
		} catch (e) {
			logger.warn('[SelectionToolbar] Failed to sync selection:', e);
			hideToolbar();
		}
	}

	function handleClickOutside(e: Event) {
		if (isVisible && isEventOutsideToolbar(toolbarEl, e)) {
			hideToolbar();
		}
	}

	$effect(() => {
		const _readerService = readerService;
		teardownReaderTracking?.();
		teardownReaderTracking = () => {
			stopPositionTracking();
		};

		const offSelection = readerService.onSelectionChange(({ cfiRange, frame }) => {
			void syncSelection(frame, cfiRange);
		});
		const offHighlightClick = readerService.onHighlightClick(() => {
			hideToolbar();
		});

		teardownReaderTracking = () => {
			offSelection();
			offHighlightClick();
			stopPositionTracking();
		};

		return () => {
			teardownReaderTracking?.();
			teardownReaderTracking = null;
		};
	});

	$effect(() => {
		const _readerVersion = readerVersion;
		hideToolbar();
	});

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('touchstart', handleClickOutside);
			teardownReaderTracking?.();
			teardownReaderTracking = null;
			stopPositionTracking();
			clearPendingSync();
		};
	});
</script>

<div
	class="epub-selection-toolbar epub-glass-panel"
	class:visible={isVisible}
	class:below-selection={isBelowSelection}
	class:mobile-docked={toolbarMode === 'docked'}
	style={`top: ${posTop}px; left: ${posLeft}px; --toolbar-arrow-offset: ${arrowOffset}px;`}
	bind:this={toolbarEl}
>
	<div class="selection-main-row">
		<div class="selection-top-row">
			<div class="toolbar-row colors-row selection-color-row selection-primary-row">
				<button class="color-btn yellow" onclick={() => handleHighlight('yellow')} aria-label="黄色高亮" title="黄色高亮"><span class="color-btn-core"></span></button>
				<button class="color-btn blue" onclick={() => handleHighlight('blue')} aria-label="蓝色高亮" title="蓝色高亮"><span class="color-btn-core"></span></button>
				<button class="color-btn red" onclick={() => handleHighlight('red')} aria-label="红色高亮" title="红色高亮"><span class="color-btn-core"></span></button>
				<button class="color-btn purple" onclick={() => handleHighlight('purple')} aria-label="紫色高亮" title="紫色高亮"><span class="color-btn-core"></span></button>
				<button class="color-btn green" onclick={() => handleHighlight('green')} aria-label="绿色高亮" title="绿色高亮"><span class="color-btn-core"></span></button>
			</div>

			<div class="selection-style-shell">
				<div class="toolbar-row selection-style-row">
					<button class="action-item icon-only style-action-item" onclick={() => handleHighlight('yellow', 'underline')} title="下划线" aria-label="下划线">
						<span class="action-icon style-icon underline-style-icon" use:icon={'underline'}></span>
					</button>
					<button class="action-item icon-only style-action-item" onclick={() => handleHighlight('yellow', 'strikethrough')} title="删除线" aria-label="删除线">
						<span class="action-icon style-icon strikethrough-style-icon" use:icon={'strikethrough'}></span>
					</button>
					<button class="action-item icon-only style-action-item" onclick={() => handleHighlight('yellow', 'wavy')} title="波浪线" aria-label="波浪线">
						<span class="action-icon style-icon wavy-style-icon" use:icon={'pen-tool'}></span>
					</button>
				</div>
			</div>
		</div>

		<div class="selection-actions-shell">
			<div class="toolbar-row actions-row selection-actions-row">
				<button class="action-item" onclick={handleInsertToNote} title={autoInsert ? '插入' : '复制'} aria-label={autoInsert ? '插入' : '复制'}>
					<span class="action-icon" use:icon={autoInsert ? 'clipboard-paste' : 'clipboard-copy'}></span>
					<span class="action-label">{autoInsert ? '插入' : '复制'}</span>
				</button>
				<button class="action-item" onclick={handleSearch} title="搜索" aria-label="搜索">
					<span class="action-icon" use:icon={'search'}></span>
					<span class="action-label">搜索</span>
				</button>

				<div class="row-divider"></div>

				<button class="action-item accent" onclick={handleExtractToCard} title="摘录为记忆卡片" aria-label="摘录为记忆卡片">
					<span class="action-icon" use:icon={'scissors'}></span>
					<span class="action-label">制卡</span>
				</button>

				<button class="action-item accent" onclick={handleCreateReadingPoint} title="创建增量阅读点" aria-label="创建增量阅读点">
					<span class="action-icon" use:icon={'book-plus'}></span>
					<span class="action-label">阅读点</span>
				</button>
				<button class="action-item ai" onclick={handleOpenAIMenu} title="AI" aria-label="AI">
					<span class="action-icon" use:icon={'sparkles'}></span>
					<span class="action-label">AI</span>
				</button>
			</div>
		</div>
	</div>

	<div class="toolbar-arrow"></div>
</div>
