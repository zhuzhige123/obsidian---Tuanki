<script lang="ts">
 	import { onMount } from 'svelte';
 	import { Platform } from 'obsidian';
 	import type { App } from 'obsidian';
 	import { reportEpubError } from '../../services/epub/epub-error';
 	import type { EpubBook, EpubExcerptSettings, EpubFlowMode, EpubLayoutMode, EpubReaderEngine, EpubReaderSettings, EpubStorageService, PaginationInfo, ReaderHighlight } from '../../services/epub';
 	import type { EpubAnnotationService } from '../../services/epub';
 	import type { EpubBacklinkHighlightService } from '../../services/epub/EpubBacklinkHighlightService';
 	import { logger } from '../../utils/logger';

	interface Props {
		app: App;
		filePath: string;
		book: EpubBook | null;
		readerService: EpubReaderEngine;
		storageService: EpubStorageService;
		annotationService: EpubAnnotationService;
		backlinkService: EpubBacklinkHighlightService;
		settings: EpubReaderSettings;
		excerptSettings: EpubExcerptSettings;
		hasPendingNavigation?: boolean;
		onProgressChange?: (percent: number) => void;
		onPaginationChange?: (info: PaginationInfo) => void;
		onChapterChange?: (title: string) => void;
		onReaderReady?: () => void;
		onRenderError?: (message: string) => void;
	}

	let {
		app,
		filePath,
		book,
		readerService,
		storageService,
		annotationService,
		backlinkService,
		settings,
		excerptSettings,
		hasPendingNavigation = false,
		onProgressChange: onProgressChangeProp,
		onPaginationChange: onPaginationChangeProp,
		onChapterChange,
		onReaderReady: onReaderReadyProp,
		onRenderError: onRenderErrorProp,
	}: Props = $props();

	let viewerContainer: HTMLDivElement;
	let rendered = false;
	let resizeObserver: ResizeObserver | null = null;
	let currentLayoutMode: EpubLayoutMode = 'paginated';
	let currentFlowMode: EpubFlowMode = 'paginated';
	let currentWidthMode: EpubReaderSettings['widthMode'] = 'full';
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let highlightReapplyTimer: ReturnType<typeof setTimeout> | null = null;
	let mobileStabilizationTimer: ReturnType<typeof setTimeout> | null = null;
	let highlightsReady = false;
	let detachRelocatedHandler: (() => void) | null = null;
	let skipNextAppearanceSync = false;
	let renderSessionToken = 0;
	let mobileStabilizationToken = 0;
	let viewDisposed = false;

	function notifyProgressChange(percent: number): void {
		if (typeof onProgressChangeProp === 'function') {
			onProgressChangeProp(percent);
		}
	}

	function notifyPaginationChange(info: PaginationInfo): void {
		if (typeof onPaginationChangeProp === 'function') {
			onPaginationChangeProp(info);
		}
	}

	function notifyChapterChange(title: string): void {
		if (typeof onChapterChange === 'function') {
			onChapterChange(title);
		}
	}

	function notifyReaderReady(): void {
		if (typeof onReaderReadyProp === 'function') {
			onReaderReadyProp();
		}
	}

	function notifyRenderError(message: string): void {
		if (typeof onRenderErrorProp === 'function') {
			onRenderErrorProp(message);
		}
	}

	function isStaleRender(renderToken: number): boolean {
		return viewDisposed || renderToken !== renderSessionToken;
	}

	async function resolveRestorableProgress() {
		const currentBook = book;
		if (!currentBook) {
			return null;
		}

		const savedProgress = await storageService.loadProgress(currentBook.id);
		if (!savedProgress?.cfi) {
			return savedProgress;
		}

		if (typeof readerService.canonicalizeLocation !== 'function') {
			return savedProgress;
		}

		try {
			const canonicalCfi = await readerService.canonicalizeLocation(savedProgress.cfi);
			if (!canonicalCfi) {
				logger.warn('[EpubReaderView] Skipping saved EPUB progress because it could not be canonicalized for the current engine.', {
					bookId: currentBook.id,
					cfi: savedProgress.cfi,
				});
				return null;
			}

			if (canonicalCfi === savedProgress.cfi) {
				return savedProgress;
			}

			const canonicalProgress = {
				...savedProgress,
				cfi: canonicalCfi,
			};
			currentBook.currentPosition = canonicalProgress;
			await storageService.saveProgress(currentBook.id, canonicalProgress);
			logger.info('[EpubReaderView] Canonicalized saved EPUB progress before restoring it into the current reader runtime.', {
				bookId: currentBook.id,
				from: savedProgress.cfi,
				to: canonicalCfi,
			});
			return canonicalProgress;
		} catch (error) {
			logger.warn('[EpubReaderView] Failed to canonicalize saved EPUB progress before restore:', {
				bookId: currentBook.id,
				cfi: savedProgress.cfi,
				error,
			});
			return null;
		}
	}

	async function resolveLastOpenBookmark() {
		const currentBook = book;
		if (!currentBook) {
			return null;
		}

		const savedBookmark = await storageService.loadLastOpenBookmark(currentBook.id);
		if (!savedBookmark?.cfi) {
			return savedBookmark;
		}

		if (typeof readerService.canonicalizeLocation !== 'function') {
			return savedBookmark;
		}

		try {
			const canonicalCfi = await readerService.canonicalizeLocation(savedBookmark.cfi);
			if (!canonicalCfi) {
				logger.warn('[EpubReaderView] Skipping saved last-open EPUB bookmark because it could not be canonicalized for the current engine.', {
					bookId: currentBook.id,
					cfi: savedBookmark.cfi,
				});
				return null;
			}

			if (canonicalCfi === savedBookmark.cfi) {
				return savedBookmark;
			}

			const canonicalBookmark = {
				...savedBookmark,
				cfi: canonicalCfi,
			};
			await storageService.saveLastOpenBookmark(currentBook.id, canonicalBookmark);
			logger.info('[EpubReaderView] Canonicalized saved last-open EPUB bookmark before restoring it into the current reader runtime.', {
				bookId: currentBook.id,
				from: savedBookmark.cfi,
				to: canonicalCfi,
			});
			return canonicalBookmark;
		} catch (error) {
			logger.warn('[EpubReaderView] Failed to canonicalize saved last-open EPUB bookmark before restore:', {
				bookId: currentBook.id,
				cfi: savedBookmark.cfi,
				error,
			});
			return null;
		}
	}

	async function refreshReaderHighlights() {
		if (typeof readerService.refreshHighlights === 'function') {
			await readerService.refreshHighlights();
			return;
		}
		await loadSavedHighlights();
	}

	interface ContainerRect {
		width: number;
		height: number;
	}

	function readContainerRect(): ContainerRect {
		const rect = viewerContainer?.getBoundingClientRect();
		return {
			width: Math.round(rect?.width || 0),
			height: Math.round(rect?.height || 0)
		};
	}

	function waitForNextFrame(): Promise<void> {
		return new Promise((resolve) => requestAnimationFrame(() => resolve()));
	}

	function waitForDelay(delayMs: number): Promise<void> {
		return new Promise((resolve) => {
			if (delayMs <= 0) {
				resolve();
				return;
			}
			mobileStabilizationTimer = setTimeout(() => {
				mobileStabilizationTimer = null;
				resolve();
			}, delayMs);
		});
	}

	function normalizeLocationKey(value: string | null | undefined): string {
		let normalized = String(value || "")
			.replace(/%5B/gi, "[")
			.replace(/%5D/gi, "]")
			.replace(/%7C/gi, "|")
			.trim();
		if (normalized.includes("%")) {
			try {
				normalized = decodeURIComponent(normalized);
			} catch (_error) {
				// Keep the original string when decoding fails.
			}
		}
		return normalized.toLowerCase();
	}

	function isMeaningfullyRestored(savedProgress: NonNullable<Awaited<ReturnType<typeof resolveRestorableProgress>>>): boolean {
		const currentPosition = readerService.getCurrentPosition();
		const savedKey = normalizeLocationKey(savedProgress.cfi);
		const currentKey = normalizeLocationKey(currentPosition.cfi);
		if (savedKey && currentKey && savedKey === currentKey) {
			return true;
		}

		const currentPercent = Number.isFinite(currentPosition.percent) ? currentPosition.percent : 0;
		const savedPercent = Number.isFinite(savedProgress.percent) ? savedProgress.percent : 0;
		if (Math.abs(currentPercent - savedPercent) <= 0.35) {
			return true;
		}

		return currentPosition.chapterIndex === savedProgress.chapterIndex
			&& savedPercent > 0
			&& currentPercent > 0;
	}

	async function restoreSavedProgress(
		savedProgress: NonNullable<Awaited<ReturnType<typeof resolveRestorableProgress>>>,
		renderToken: number
	): Promise<void> {
		const retryDelays = [0, 80, 180];

		for (const delayMs of retryDelays) {
			if (isStaleRender(renderToken)) {
				return;
			}

			await readerService.goToLocation(savedProgress.cfi);
			if (isStaleRender(renderToken)) {
				return;
			}

			await waitForNextFrame();
			if (delayMs > 0) {
				await waitForDelay(delayMs);
			}
			if (isStaleRender(renderToken)) {
				return;
			}

			if (isMeaningfullyRestored(savedProgress)) {
				return;
			}
		}

		logger.warn('[EpubReaderView] EPUB saved progress restore did not land on the expected position after retries.', {
			bookId: book?.id,
			filePath,
			savedProgress,
			currentPosition: readerService.getCurrentPosition(),
		});
	}

	function getRenderMode(readerSettings: EpubReaderSettings): {
		flow: 'paginated' | 'scrolled';
		spread: 'always' | 'none';
		manager: 'default' | 'continuous';
		minSpreadWidth: number;
	} {
		if (readerSettings.flowMode === 'scrolled') {
			return {
				flow: 'scrolled',
				spread: 'none',
				manager: 'continuous',
				minSpreadWidth: 800
			};
		}

		const isDoubleLayout = readerSettings.layoutMode === 'double';
		return {
			flow: 'paginated',
			spread: isDoubleLayout ? 'always' : 'none',
			manager: 'default',
			minSpreadWidth: isDoubleLayout ? 0 : 800
		};
	}

	async function waitForStableContainer(maxFrames = 24): Promise<ContainerRect> {
		let previous = readContainerRect();
		let stableFrames = previous.width > 0 && previous.height > 0 ? 1 : 0;

		for (let i = 0; i < maxFrames; i++) {
			await waitForNextFrame();
			const current = readContainerRect();
			const isSameSize = current.width === previous.width && current.height === previous.height;
			const isRenderable = current.width > 0 && current.height > 0;

			if (isRenderable && isSameSize) {
				stableFrames += 1;
				if (stableFrames >= 2) {
					return current;
				}
			} else {
				stableFrames = isRenderable ? 1 : 0;
			}

			previous = current;
		}

		return previous.width > 0 && previous.height > 0
			? previous
			: { width: 800, height: 600 };
	}

	async function renderBook() {
		if (!book || !viewerContainer || rendered) return;
		const renderToken = ++renderSessionToken;
		rendered = true;

		try {
			// Start collecting highlights in parallel with rendering
			const highlightPromise = collectAllHighlights();
			const stableRect = await waitForStableContainer();
			if (isStaleRender(renderToken)) {
				return;
			}
			const renderMode = getRenderMode(settings);
			await readerService.renderTo(viewerContainer, {
				flow: renderMode.flow,
				spread: renderMode.spread,
				manager: renderMode.manager,
				minSpreadWidth: renderMode.minSpreadWidth,
				width: stableRect.width,
				height: stableRect.height,
				lineHeight: settings.lineHeight,
				widthMode: settings.widthMode,
				strikethroughPresentation: excerptSettings.strikethroughDisplayMode
			});
			if (isStaleRender(renderToken)) {
				return;
			}
			currentLayoutMode = settings.layoutMode;
			currentFlowMode = settings.flowMode;
			currentWidthMode = settings.widthMode;
			skipNextAppearanceSync = true;

			setupResizeObserver();

			registerRelocatedHandler();

			// Let the reader layout settle after settings/resize before navigating
			await new Promise(r => setTimeout(r, 50));
			if (isStaleRender(renderToken)) {
				return;
			}

			// Keep source-note / explicit navigation highest priority.
			if (!hasPendingNavigation) {
				const savedLastOpenBookmark = await resolveLastOpenBookmark();
				if (isStaleRender(renderToken)) {
					return;
				}
				if (savedLastOpenBookmark?.cfi) {
					await restoreSavedProgress(savedLastOpenBookmark, renderToken);
					if (isStaleRender(renderToken)) {
						return;
					}
				} else {
					const savedProgress = await resolveRestorableProgress();
					if (isStaleRender(renderToken)) {
						return;
					}
					if (savedProgress?.cfi) {
						await restoreSavedProgress(savedProgress, renderToken);
						if (isStaleRender(renderToken)) {
							return;
						}
					}
				}
			}

			notifyProgressChange(readerService.getReadingProgress());
			notifyPaginationChange(await readerService.getPaginationInfo());
			notifyChapterChange(readerService.getCurrentChapterTitle());
			if (isStaleRender(renderToken)) {
				return;
			}

			// Apply pre-collected highlights (already resolved or nearly so)
			const allHighlights = await highlightPromise;
			if (isStaleRender(renderToken)) {
				return;
			}
			if (allHighlights.length > 0) {
				await readerService.applyHighlights(allHighlights);
			} else {
				// Retry after delay - metadata cache may still be building
				scheduleHighlightRetry();
			}
			highlightsReady = true;

			notifyReaderReady();
			void stabilizeMobileRenderer(renderToken);
		} catch (error) {
			if (isStaleRender(renderToken)) {
				return;
			}
			const classified = reportEpubError(error, 'render');
			rendered = false;
			notifyRenderError(classified.userMessage);
		}
	}

	function setupResizeObserver() {
		if (resizeObserver) resizeObserver.disconnect();
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (width > 0 && height > 0 && !readerService.isLayoutChanging()) {
					readerService.resize(width, height);
					scheduleHighlightReapply();
				}
			}
		});
		resizeObserver.observe(viewerContainer);
	}

	async function applySettings() {
		if (!rendered) return;
		await readerService.applyReaderAppearance({
			lineHeight: settings.lineHeight,
			letterSpacing: settings.letterSpacing,
			pageMargin: settings.pageMargin,
			widthMode: settings.widthMode,
			strikethroughPresentation: excerptSettings.strikethroughDisplayMode,
		});
	}

	async function collectAllHighlights(): Promise<ReaderHighlight[]> {
		if (!book) return [];
		try {
			const allHighlights = await annotationService.collectAllHighlights(book.id, filePath, backlinkService);
			logger.debug('[EpubReaderView] total highlights to apply:', allHighlights.length);
			return allHighlights;
		} catch (e) {
			logger.warn('[EpubReaderView] Failed to collect highlights:', e);
			return [];
		}
	}

	function scheduleHighlightReapply(delayMs = 300) {
		if (!highlightsReady) return;
		if (highlightReapplyTimer) clearTimeout(highlightReapplyTimer);
		highlightReapplyTimer = setTimeout(async () => {
			highlightReapplyTimer = null;
			await refreshReaderHighlights();
		}, delayMs);
	}

	function scheduleHighlightRetry() {
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = setTimeout(async () => {
			retryTimer = null;
			const retried = await collectAllHighlights();
			if (retried.length > 0) {
				await readerService.applyHighlights(retried);
			}
		}, 3000);
	}

	async function stabilizeMobileRenderer(renderToken: number) {
		if (!Platform.isMobile || settings.flowMode !== 'scrolled' || !rendered || !book) {
			return;
		}

		const stabilizationToken = ++mobileStabilizationToken;
		const runPass = async (delayMs: number) => {
			await waitForDelay(delayMs);
			if (isStaleRender(renderToken) || stabilizationToken !== mobileStabilizationToken || !rendered) {
				return;
			}

			const rect = await waitForStableContainer(8);
			if (isStaleRender(renderToken) || stabilizationToken !== mobileStabilizationToken || !rendered) {
				return;
			}

			readerService.resize(rect.width, rect.height);
			const currentCfi = readerService.getCurrentCFI();
			if (currentCfi) {
				await readerService.goToLocation(currentCfi);
			}
			if (isStaleRender(renderToken) || stabilizationToken !== mobileStabilizationToken || !rendered) {
				return;
			}
			await refreshReaderHighlights();
		};

		await runPass(0);
		await runPass(140);
	}

	async function loadSavedHighlights() {
		const allHighlights = await collectAllHighlights();
		if (allHighlights.length > 0) {
			await readerService.applyHighlights(allHighlights);
		}
	}

	function registerRelocatedHandler() {
		if (detachRelocatedHandler) return;
		detachRelocatedHandler = readerService.onRelocated(async (position) => {
			if (book) {
				await storageService.saveProgress(book.id, position);
			}
			notifyProgressChange(position.percent);
			notifyPaginationChange(await readerService.getPaginationInfo());
			notifyChapterChange(readerService.getCurrentChapterTitle());
		});
	}

	async function handleReaderModeChange() {
		if (!rendered) return;
		if (
			settings.layoutMode === currentLayoutMode
			&& settings.flowMode === currentFlowMode
			&& settings.widthMode === currentWidthMode
		) return;
		const previousLayoutMode = currentLayoutMode;
		const previousFlowMode = currentFlowMode;
		const previousWidthMode = currentWidthMode;
		const nextLayoutMode = settings.layoutMode;
		const nextFlowMode = settings.flowMode;
		const nextWidthMode = settings.widthMode;
		try {
			currentLayoutMode = nextLayoutMode;
			currentFlowMode = nextFlowMode;
			currentWidthMode = nextWidthMode;
			await readerService.setLayoutMode(nextLayoutMode, nextFlowMode, {
				lineHeight: settings.lineHeight,
				letterSpacing: settings.letterSpacing,
				pageMargin: settings.pageMargin,
				widthMode: nextWidthMode,
				strikethroughPresentation: excerptSettings.strikethroughDisplayMode,
			});
			skipNextAppearanceSync = true;

			await new Promise(r => setTimeout(r, 150));

			await refreshReaderHighlights();
			notifyReaderReady();
			void stabilizeMobileRenderer(renderSessionToken);
		} catch (error) {
			const classified = reportEpubError(error, 'render');
			currentLayoutMode = previousLayoutMode;
			currentFlowMode = previousFlowMode;
			currentWidthMode = previousWidthMode;
			notifyRenderError(classified.userMessage);
		}
	}

	$effect(() => {
		if (book && viewerContainer && !rendered) {
			renderBook();
		}
	});

	$effect(() => {
		const _lh = settings.lineHeight;
		const _ls = settings.letterSpacing;
		const _pm = settings.pageMargin;
		const _sp = excerptSettings.strikethroughDisplayMode;
		if (rendered) {
			if (skipNextAppearanceSync) {
				skipNextAppearanceSync = false;
				return;
			}
			applySettings().then(() => {
				scheduleHighlightReapply(150);
			});
		}
	});

	$effect(() => {
		const _layout = settings.layoutMode;
		const _flow = settings.flowMode;
		const _width = settings.widthMode;
		if (rendered && (_layout !== currentLayoutMode || _flow !== currentFlowMode || _width !== currentWidthMode)) {
			void handleReaderModeChange();
		}
	});

	onMount(() => {
		return () => {
			viewDisposed = true;
			renderSessionToken += 1;
			mobileStabilizationToken += 1;
			if (detachRelocatedHandler) {
				detachRelocatedHandler();
				detachRelocatedHandler = null;
			}
			if (retryTimer) clearTimeout(retryTimer);
			if (highlightReapplyTimer) clearTimeout(highlightReapplyTimer);
			if (mobileStabilizationTimer) clearTimeout(mobileStabilizationTimer);
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
		};
	});
</script>

<div class="epub-reader-view" class:epub-width-full={settings.widthMode === 'full'}>
	<div class="epub-viewer-container" bind:this={viewerContainer}></div>
</div>
