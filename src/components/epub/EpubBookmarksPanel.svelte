<script lang="ts">
	import { setIcon, type App } from 'obsidian';
	import { onMount } from 'svelte';
	import { logger } from '../../utils/logger';
	import { EpubBookmarkService, type EpubBookmarkRecord } from '../../services/epub/EpubBookmarkService';
	import type { EpubBook } from '../../services/epub';

	interface Props {
		app: App;
		book: EpubBook | null;
		bookmarkRevision?: number;
		onNavigate?: (cfi: string, text?: string) => void;
	}

	let { app, book, bookmarkRevision = 0, onNavigate }: Props = $props();

	let bookmarks = $state<EpubBookmarkRecord[]>([]);
	let loading = $state(false);
	let loadToken = 0;
	let panelDisposed = false;
	let lastContextKey = '';

	function getBookmarkService(): EpubBookmarkService {
		return new EpubBookmarkService(app);
	}

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return {
			update(newName: string) {
				node.replaceChildren();
				setIcon(node, newName);
			}
		};
	}

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

	function getChapterLabel(bookmark: EpubBookmarkRecord): string {
		return String(bookmark.chapterTitle || '').trim() || `第 ${bookmark.chapterIndex + 1} 章`;
	}

	function getPageLabel(bookmark: EpubBookmarkRecord): string {
		if (typeof bookmark.pageNumber === 'number' && bookmark.pageNumber > 0) {
			return `p.${bookmark.pageNumber}`;
		}
		return '';
	}

	function navigateToBookmark(bookmark: EpubBookmarkRecord) {
		if (!bookmark.cfi) {
			return;
		}
		onNavigate?.(bookmark.cfi, bookmark.chapterTitle || getPageLabel(bookmark));
	}

	function isStaleLoad(currentToken: number, expectedBookId: string): boolean {
		return panelDisposed || currentToken !== loadToken || (book?.id ?? '') !== expectedBookId;
	}

	async function loadBookmarks() {
		const currentBook = book;
		if (!currentBook) {
			bookmarks = [];
			loading = false;
			return;
		}
		const currentToken = ++loadToken;
		loading = true;
		try {
			const loaded = await getBookmarkService().loadBookmarksForBook(currentBook);
			if (isStaleLoad(currentToken, currentBook.id)) {
				return;
			}
			bookmarks = loaded;
		} catch (error) {
			if (isStaleLoad(currentToken, currentBook.id)) {
				return;
			}
			logger.error('[EpubBookmarksPanel] Failed to load bookmarks:', error);
			bookmarks = [];
		} finally {
			if (!isStaleLoad(currentToken, currentBook.id)) {
				loading = false;
			}
		}
	}

	$effect(() => {
		const contextKey = [book?.id ?? '', String(bookmarkRevision)].join('::');
		if (book) {
			if (contextKey === lastContextKey) {
				return;
			}
			lastContextKey = contextKey;
			void loadBookmarks();
		} else {
			loadToken += 1;
			bookmarks = [];
			loading = false;
			lastContextKey = '';
		}
	});

	onMount(() => {
		return () => {
			panelDisposed = true;
			loadToken += 1;
		};
	});
</script>

<div class="epub-bookmarks-panel">
	{#if loading}
		<div class="bm-empty">加载中...</div>
	{:else if bookmarks.length === 0}
		<div class="bm-empty">
			<div class="bm-empty-label">暂无书签</div>
			<div class="bm-empty-hint">点击阅读器顶部书签按钮即可保存当前位置</div>
		</div>
	{:else}
		<div class="bm-list">
			{#each bookmarks as bookmark (bookmark.id)}
				{@const pageLabel = getPageLabel(bookmark)}
				{@const createdTime = formatTime(bookmark.createdAt)}
				<button class="bm-item" type="button" onclick={() => navigateToBookmark(bookmark)} aria-label={`跳转到 ${getChapterLabel(bookmark)}`}>
					<span class="bm-item-title-row">
						<span class="bm-item-icon" use:icon={'bookmark'}></span>
						<span class="bm-item-title">{getChapterLabel(bookmark)}</span>
					</span>
					<span class="bm-item-meta-row">
						{#if pageLabel}
							<span class="bm-item-page">{pageLabel}</span>
						{/if}
						<span class="bm-item-time" title={createdTime}>{createdTime}</span>
					</span>
				</button>
			{/each}
		</div>
	 {/if}
 </div>

 <style>
	.epub-bookmarks-panel {
 		display: flex;
 		flex-direction: column;
 		padding: 0;
 		height: 100%;
		font-family: var(--font-interface, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);
 	}

 	.bm-empty {
 		display: flex;
 		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 40px 20px;
		text-align: center;
 	}

 	.bm-empty-label {
 		font-size: 13px;
 		font-weight: 500;
 		color: var(--text-muted);
 	}

 	.bm-empty-hint {
 		font-size: 12px;
 		color: var(--text-faint);
 		line-height: 1.5;
 		max-width: 220px;
 	}

 	.bm-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px 12px 12px;
	}

	.bm-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		width: 100%;
		min-height: 76px;
		padding: 12px 16px;
		border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--background-primary) 88%, var(--background-secondary) 12%);
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: inherit;
		transition: background 0.12s ease, border-color 0.12s ease;
	}

	.bm-item:hover,
	.bm-item:focus-visible {
		background: color-mix(in srgb, var(--background-modifier-hover) 50%, var(--background-primary) 50%);
		border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border) 76%);
		outline: none;
	}

	.bm-item-title-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		min-width: 0;
	}

	.bm-item-icon {
		flex: 0 0 auto;
		width: 16px;
		height: 16px;
		color: var(--interactive-accent);
		margin-top: 1px;
	}

	.bm-item-icon :global(.svg-icon) {
		width: 16px;
		height: 16px;
	}

	.bm-item-title {
		min-width: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-normal);
		line-height: 1.5;
		white-space: normal;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.bm-item-meta-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		min-width: 0;
		font-size: 11px;
		line-height: 1.4;
		font-variant-numeric: tabular-nums;
	}

	.bm-item-page {
		font-size: 11px;
		color: var(--text-muted);
		line-height: 1.4;
		min-width: 0;
	}

	.bm-item-time {
		font-size: 11px;
		color: var(--text-faint);
		line-height: 1.4;
		margin-left: auto;
		text-align: right;
		white-space: nowrap;
	}
 </style>
