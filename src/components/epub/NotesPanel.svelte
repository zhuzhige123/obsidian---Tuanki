<script lang="ts">
	import { onMount } from 'svelte';
	import { logger } from '../../utils/logger';
	import type { EpubBook, EpubReaderEngine, ReaderHighlight } from '../../services/epub';
	import type { EpubAnnotationService } from '../../services/epub';
	import type { EpubBacklinkHighlightService } from '../../services/epub/EpubBacklinkHighlightService';
	import EpubAnnotationCard from './EpubAnnotationCard.svelte';

	interface Props {
		book: EpubBook | null;
		readerService?: EpubReaderEngine | null;
		annotationService: EpubAnnotationService;
		backlinkService?: EpubBacklinkHighlightService;
		filePath?: string;
		highlightRevision?: number;
		showStrikethroughHighlights?: boolean;
		onNavigate?: (
			cfi: string,
			text?: string,
			color?: string,
			metadata?: {
				sourceFile?: string;
				sourceRef?: string;
				createdTime?: number;
			}
		) => void;
	}

	let {
		book,
		readerService = null,
		annotationService,
		backlinkService,
		filePath,
		highlightRevision = 0,
		showStrikethroughHighlights = false,
		onNavigate,
	}: Props = $props();

	type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple';

	interface DisplayHighlight {
		cfiRange: string;
		text: string;
		color: HighlightColor;
		createdTime: number;
		pageLabel?: string;
		sourceFile?: string;
		sourceRef?: string;
	}

	let highlights = $state<DisplayHighlight[]>([]);
	let loading = $state(false);
	let annotationLoadToken = 0;
	let panelDisposed = false;
	let lastLoadContextKey = '';

	function formatTime(timestamp: number): string {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		const h = String(date.getHours()).padStart(2, '0');
		const min = String(date.getMinutes()).padStart(2, '0');
		return `${y}-${m}-${d} ${h}:${min}`;
	}

	function getSourceLabel(sourceFile?: string): string {
		if (!sourceFile) {
			return '';
		}
		const normalized = sourceFile.replace(/\\/g, '/');
		const basename = normalized.split('/').pop() || normalized;
		const displayName = basename.replace(/\.[^.]+$/, '');
		return displayName ? `- 《${displayName}》` : '';
	}

	function getEmptyExcerptHint(text?: string): string {
		return String(text || '').trim() ? '' : '摘录内容为空';
	}

	async function resolveHighlightPageLabel(cfiRange: string, text?: string): Promise<string> {
		if (!readerService || !cfiRange) {
			return '';
		}
		try {
			const canonical = typeof readerService.canonicalizeLocation === 'function'
				? (await readerService.canonicalizeLocation(cfiRange, text)) || cfiRange
				: cfiRange;
			const pageNumber = await readerService.getPageNumberFromCfi(canonical);
			return typeof pageNumber === 'number' && Number.isFinite(pageNumber) && pageNumber > 0
				? `p.${pageNumber}`
				: '';
		} catch (_error) {
			return '';
		}
	}

	function navigateToHighlight(hl: DisplayHighlight) {
		if (hl.cfiRange) {
			onNavigate?.(hl.cfiRange, hl.text, hl.color, {
				sourceFile: hl.sourceFile,
				sourceRef: hl.sourceRef,
				createdTime: hl.createdTime,
			});
		}
	}

	function shouldDisplayHighlight(highlight: Pick<ReaderHighlight, 'style' | 'presentation'>): boolean {
		if (highlight.presentation === 'conceal') {
			return showStrikethroughHighlights;
		}
		return highlight.style !== 'strikethrough' || showStrikethroughHighlights;
	}

	function normalizeColor(color?: string): HighlightColor {
		switch (color) {
			case 'green':
			case 'blue':
			case 'red':
			case 'purple':
				return color;
			case 'pink':
				return 'red';
			default:
				return 'yellow';
		}
	}

	function isStaleAnnotationsLoad(loadToken: number, expectedBookId: string, expectedFilePath?: string): boolean {
		return panelDisposed
			|| loadToken !== annotationLoadToken
			|| book?.id !== expectedBookId
			|| (filePath ?? '') !== (expectedFilePath ?? '');
	}

	async function loadAnnotations() {
		const currentBook = book;
		if (!currentBook) {
			highlights = [];
			loading = false;
			return;
		}
		const expectedFilePath = filePath;
		const loadToken = ++annotationLoadToken;
		loading = true;
		try {
			const allHighlights = backlinkService && expectedFilePath
				? await annotationService.collectAllHighlights(currentBook.id, expectedFilePath, backlinkService)
				: [];
			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}

			const visibleHighlights = allHighlights.filter((highlight) => shouldDisplayHighlight(highlight));
			const mappedHighlights = (await Promise.all(visibleHighlights.map(async (highlight) => ({
					cfiRange: highlight.cfiRange,
					text: highlight.text || '',
					color: normalizeColor(highlight.color),
					createdTime: highlight.createdTime || 0,
					pageLabel: await resolveHighlightPageLabel(highlight.cfiRange, highlight.text),
					sourceFile: 'sourceFile' in highlight ? highlight.sourceFile : undefined,
					sourceRef: 'sourceRef' in highlight ? highlight.sourceRef : undefined,
				}))))
				.sort((a, b) => (b.createdTime || 0) - (a.createdTime || 0));

			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}

			highlights = mappedHighlights;
		} catch (error) {
			if (isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				return;
			}
			logger.error('[NotesPanel] Failed to load annotations:', error);
			highlights = [];
		} finally {
			if (!isStaleAnnotationsLoad(loadToken, currentBook.id, expectedFilePath)) {
				loading = false;
			}
		}
	}

	$effect(() => {
		const contextKey = [book?.id ?? '', filePath ?? '', String(highlightRevision), showStrikethroughHighlights ? '1' : '0'].join('::');
		if (book && annotationService) {
			if (contextKey === lastLoadContextKey) {
				return;
			}
			lastLoadContextKey = contextKey;
			void loadAnnotations();
		} else {
			annotationLoadToken += 1;
			highlights = [];
			loading = false;
			lastLoadContextKey = '';
		}
	});

	onMount(() => {
		return () => {
			panelDisposed = true;
			annotationLoadToken += 1;
		};
	});
</script>

<div class="epub-notes-panel">
	{#if loading}
		<div class="epub-placeholder">正在加载摘录...</div>
	{:else if highlights.length === 0}
		<div class="epub-placeholder">暂时还没有摘录，阅读时选中文本后就可以在这里回看。</div>
	{:else}
		{#if highlights.length > 0}
			<section class="notes-section">
				<div class="notes-section-list">
					{#each highlights as hl}
						<EpubAnnotationCard
							clickable={true}
							onActivate={() => navigateToHighlight(hl)}
							color={hl.color}
							quoteText={hl.text}
							commentText={getEmptyExcerptHint(hl.text)}
							commentMuted={true}
							metaLeft={getSourceLabel(hl.sourceFile)}
							metaRightPrefix={formatTime(hl.createdTime)}
							metaRight={hl.pageLabel}
						/>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.epub-notes-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 14px 12px 22px;
	}

	.epub-placeholder {
		padding: 22px 14px;
		border-radius: 16px;
		background: color-mix(in srgb, var(--weave-elevated-background, var(--background-secondary)) 88%, transparent);
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.7;
	}

	.notes-section {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.notes-section-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
