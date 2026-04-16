<script lang="ts" module>
        const coverCache = new Map<string, string | null>();
</script>

<script lang="ts">
        import { onDestroy, onMount, untrack } from 'svelte';
        import { setIcon, TFile, TAbstractFile, Menu, Notice, normalizePath } from 'obsidian';
        import type { App } from 'obsidian';
        import { VIEW_TYPE_EPUB } from '../../views/EpubView';
        import { logger } from '../../utils/logger';
        import {
                EpubStorageService
        } from '../../services/epub';
        import { FoliateVaultPublicationParser } from '../../services/epub/FoliateVaultPublicationParser';
        import type { EpubBook } from '../../services/epub';
        import { epubActiveDocumentStore } from '../../stores/epub-active-document-store';
        import { showObsidianConfirm } from '../../utils/obsidian-confirm';

        interface EpubFileInfo {
                path: string;
                name: string;
                folder: string;
                size: number;
        }

        interface BookshelfBookMeta {
                title: string;
                author: string;
                coverImage?: string;
                progress: number;
                lastReadTime: number;
        }

        interface DisplayBookItem extends EpubFileInfo {
                displayTitle: string;
                metaText: string;
                progress: number;
                lastReadTime: number;
        }

        interface Props {
                app: App;
                onSwitchBook?: (filePath: string) => void;
                onClose: () => void;
                refreshToken?: number;
                onSettingsClick?: (event: MouseEvent) => void;
        }

        let { app, onSwitchBook, onClose, refreshToken = 0, onSettingsClick }: Props = $props();

        let epubFiles = $state<EpubFileInfo[]>([]);
        let covers = $state<Map<string, string>>(new Map());
        let bookMetaByPath = $state<Map<string, BookshelfBookMeta>>(new Map());
        let searchQuery = $state('');
        let searching = $state(false);
        let loadingBooks = $state(false);
        let openingBookPath = $state<string | null>(null);
        let refreshRunId = 0;
        let pendingBookshelfReload = false;
        let pendingBookshelfRefresh = false;
        let pendingBookshelfRefreshNotice = false;
        let coverLoadTimer: ReturnType<typeof setTimeout> | null = null;
        const storageService = untrack(() => new EpubStorageService(app));
        const MAX_VISIBLE_COVER_LOADS = 18;
        const BOOKSHELF_DATA_CHANGED_EVENT = 'Weave:epub-bookshelf-data-changed';
        const BOOKSHELF_REFRESH_REQUEST_EVENT = 'Weave:epub-bookshelf-refresh-request';

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

        function getWeavePlugin(): any {
                return (app as any)?.plugins?.getPlugin?.('weave');
        }

        function setBookshelfFiles(files: EpubFileInfo[]) {
                epubFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        }

        function buildBookMeta(book: EpubBook): BookshelfBookMeta {
                return {
                        title: book.metadata.title?.trim() || '',
                        author: book.metadata.author?.trim() || '',
                        coverImage: book.metadata.coverImage?.trim() || undefined,
                        progress: Number.isFinite(book.currentPosition?.percent) ? Math.max(0, Math.round(book.currentPosition.percent)) : 0,
                        lastReadTime: Number.isFinite(book.readingStats?.lastReadTime) ? book.readingStats.lastReadTime : 0
                };
        }

        function cacheResolvedCover(filePath: string, coverUrl: string | null | undefined) {
                const normalizedCover = typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl : null;
                coverCache.set(filePath, normalizedCover);

                if (normalizedCover) {
                        if (covers.get(filePath) !== normalizedCover) {
                                covers.set(filePath, normalizedCover);
                                covers = new Map(covers);
                        }
                        return;
                }

                if (covers.delete(filePath)) {
                        covers = new Map(covers);
                }
        }

        function remapVaultPath(filePath: string, oldPath: string, newPath: string): string | null {
                const normalizedFilePath = normalizePath(filePath || '');
                const normalizedOldPath = normalizePath(oldPath || '');
                const normalizedNewPath = normalizePath(newPath || '');

                if (!normalizedFilePath || !normalizedOldPath || !normalizedNewPath) {
                        return null;
                }

                if (normalizedFilePath === normalizedOldPath) {
                        return normalizedNewPath;
                }

                if (normalizedFilePath.startsWith(`${normalizedOldPath}/`)) {
                        return `${normalizedNewPath}${normalizedFilePath.slice(normalizedOldPath.length)}`;
                }

                return null;
        }

        function remapMapKeys<T>(source: Map<string, T>, oldPath: string, newPath: string): Map<string, T> {
                const next = new Map<string, T>();

                for (const [path, value] of source.entries()) {
                        const remapped = remapVaultPath(path, oldPath, newPath) || path;
                        next.set(remapped, value);
                }

                return next;
        }

        function handleVaultRename(file: TAbstractFile, oldPath: string) {
                const newPath = normalizePath(file.path || '');
                const normalizedOldPath = normalizePath(oldPath || '');
                if (!normalizedOldPath || !newPath || normalizedOldPath === newPath) {
                        return;
                }

                const nextFiles = epubFiles
                        .map((entry) => {
                                const remappedPath = remapVaultPath(entry.path, normalizedOldPath, newPath);
                                if (!remappedPath) {
                                        return entry;
                                }

                                const newName = remappedPath.split('/').pop()?.replace(/\.epub$/i, '') || entry.name;
                                const slashIndex = remappedPath.lastIndexOf('/');
                                return {
                                        ...entry,
                                        path: remappedPath,
                                        name: newName,
                                        folder: slashIndex >= 0 ? remappedPath.slice(0, slashIndex) || '/' : '/',
                                        size: file instanceof TFile && remappedPath === newPath ? file.stat.size : entry.size,
                                };
                        })
                        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

                const changed = nextFiles.length !== epubFiles.length
                        || nextFiles.some((entry, index) =>
                                entry.path !== epubFiles[index]?.path
                                || entry.name !== epubFiles[index]?.name
                                || entry.folder !== epubFiles[index]?.folder
                                || entry.size !== epubFiles[index]?.size
                        );

                if (!changed) {
                        return;
                }

                epubFiles = nextFiles;
                covers = remapMapKeys(covers, normalizedOldPath, newPath);
                bookMetaByPath = remapMapKeys(bookMetaByPath, normalizedOldPath, newPath);

                const remappedCoverCache = new Map<string, string | null>();
                for (const [path, url] of coverCache.entries()) {
                        const remapped = remapVaultPath(path, normalizedOldPath, newPath) || path;
                        remappedCoverCache.set(remapped, url);
                }
                coverCache.clear();
                for (const [path, url] of remappedCoverCache.entries()) {
                        coverCache.set(path, url);
                }
        }

        async function loadBookMetadata(files: EpubFileInfo[], runId: number): Promise<void> {
                try {
                        const books = await storageService.loadBooks();
                        if (runId !== refreshRunId) return;

                        const validPaths = new Set(files.map((file) => file.path));
                        const nextMeta = new Map<string, BookshelfBookMeta>();

                        for (const book of Object.values(books)) {
                                if (!validPaths.has(book.filePath)) continue;
                                const meta = buildBookMeta(book);
                                nextMeta.set(book.filePath, meta);
                                if (meta.coverImage) {
                                        cacheResolvedCover(book.filePath, meta.coverImage);
                                }
                        }

                        bookMetaByPath = nextMeta;
                } catch {
                        if (runId === refreshRunId) {
                                bookMetaByPath = new Map();
                        }
                }
        }

        function syncCoverCacheWithFiles() {
                const validPaths = new Set(epubFiles.map((file) => file.path));
                const nextCovers = new Map<string, string>();

                for (const [path, url] of covers.entries()) {
                        if (validPaths.has(path)) {
                                nextCovers.set(path, url);
                        }
                }

                covers = nextCovers;

                for (const path of Array.from(coverCache.keys())) {
                        if (!validPaths.has(path)) {
                                coverCache.delete(path);
                        }
                }
        }

        function cancelScheduledCoverLoading() {
                if (coverLoadTimer) {
                        clearTimeout(coverLoadTimer);
                        coverLoadTimer = null;
                }
        }

        async function loadCoverForFile(file: EpubFileInfo, runId: number): Promise<void> {
                if (runId !== refreshRunId) return;
                if (coverCache.has(file.path)) {
                        const cachedCover = coverCache.get(file.path);
                        if (cachedCover && !covers.has(file.path)) {
                                covers.set(file.path, cachedCover);
                                covers = new Map(covers);
                        }
                        return;
                }

                const publicationParser = new FoliateVaultPublicationParser(app);
                try {
                        const loaded = await publicationParser.load(file.path);
                        const coverUrl = loaded.coverImage || null;
                        if (runId !== refreshRunId) return;
                        cacheResolvedCover(file.path, coverUrl);
                } catch {
                        if (runId === refreshRunId) {
                                cacheResolvedCover(file.path, null);
                        }
                } finally {
                        publicationParser.dispose();
                }
        }

        function scheduleVisibleCoverLoading(files: EpubFileInfo[], runId: number) {
                cancelScheduledCoverLoading();
                const queue = files.slice(0, MAX_VISIBLE_COVER_LOADS);
                let index = 0;

                const step = () => {
                        if (runId !== refreshRunId || index >= queue.length) {
                                coverLoadTimer = null;
                                return;
                        }

                        const file = queue[index++];
                        void loadCoverForFile(file, runId).finally(() => {
                                if (runId !== refreshRunId) {
                                        coverLoadTimer = null;
                                        return;
                                }
                                coverLoadTimer = setTimeout(step, 0);
                        });
                };

                coverLoadTimer = setTimeout(step, 16);
        }

        function formatSize(bytes: number): string {
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        function clampProgress(progress: number): number {
                if (!Number.isFinite(progress)) return 0;
                return Math.max(0, Math.min(100, Math.round(progress)));
        }

        function handleBookKeydown(event: KeyboardEvent, path: string) {
                if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        switchBook(path);
                }
        }

        function flushPendingBookshelfWork() {
                if (loadingBooks) return;

                if (pendingBookshelfRefresh) {
                        const showNotice = pendingBookshelfRefreshNotice;
                        pendingBookshelfRefresh = false;
                        pendingBookshelfRefreshNotice = false;
                        pendingBookshelfReload = false;
                        void refreshBookshelf(showNotice);
                        return;
                }

                if (pendingBookshelfReload) {
                        pendingBookshelfReload = false;
                        void loadBookshelfFromCache();
                }
        }

async function loadBookshelfFromCache() {
                if (loadingBooks) {
                        pendingBookshelfReload = true;
                        return;
                }
                loadingBooks = true;
                try {
                        const currentRunId = ++refreshRunId;
                        const cached = await storageService.listBookshelfEntries();
                        setBookshelfFiles(cached);
                        syncCoverCacheWithFiles();
                        await loadBookMetadata(cached, currentRunId);
                        scheduleVisibleCoverLoading(cached, currentRunId);
                } catch (error) {
                        logger.error('Failed to load EPUB bookshelf cache:', error);
                } finally {
                        loadingBooks = false;
                        flushPendingBookshelfWork();
                }
        }

        async function refreshBookshelf(showNotice = false) {
                if (loadingBooks) {
                        pendingBookshelfRefresh = true;
                        pendingBookshelfRefreshNotice = pendingBookshelfRefreshNotice || showNotice;
                        return;
                }
                loadingBooks = true;

                try {
                        const result = await storageService.pruneMissingBooks();
                        const currentRunId = ++refreshRunId;
                        cancelScheduledCoverLoading();
                        const rebuilt = await storageService.listBookshelfEntries();
                        setBookshelfFiles(rebuilt);
                        syncCoverCacheWithFiles();
                        await loadBookMetadata(rebuilt, currentRunId);
                        scheduleVisibleCoverLoading(rebuilt, currentRunId);

                        if (showNotice) {
                                const message = result.removedPaths.length > 0
                                        ? `weave：书架已刷新，并清理 ${result.removedPaths.length} 条失效书籍记录`
                                        : 'weave：书架已刷新';
                                new Notice(message);
                        }
                } catch (error) {
                        logger.error('Failed to refresh EPUB bookshelf:', error);
                        if (showNotice) {
                                new Notice('weave：刷新书架失败');
                        }
                } finally {
                        loadingBooks = false;
                        flushPendingBookshelfWork();
                }
        }

        function removeInvalidFile(filePath: string) {
                        epubFiles = epubFiles.filter((file) => file.path !== filePath);
                        covers.delete(filePath);
                        covers = new Map(covers);
                        coverCache.delete(filePath);
                        bookMetaByPath.delete(filePath);
                        bookMetaByPath = new Map(bookMetaByPath);
        }

        function resetBookStateInList(filePath: string) {
                        bookMetaByPath.delete(filePath);
                        bookMetaByPath = new Map(bookMetaByPath);
        }

        function getBookDisplayName(filePath: string): string {
                        const file = app.vault.getAbstractFileByPath(filePath);
                        if (file instanceof TFile) {
                                return file.basename || '当前书籍';
                        }
                        return filePath.split('/').pop()?.replace(/\.epub$/i, '') || '当前书籍';
        }

        function closeOpenEpubLeaves(filePath: string) {
                        const leaves = app.workspace.getLeavesOfType(VIEW_TYPE_EPUB);
                        for (const leaf of leaves) {
                                const state = leaf.getViewState();
                                const leafFilePath = state?.state?.filePath || state?.state?.file || '';
                                if (leafFilePath === filePath) {
                                        leaf.detach();
                                }
                        }
        }

        async function removeBookFromShelf(filePath: string) {
                        const displayName = getBookDisplayName(filePath);
                        const confirmed = await showObsidianConfirm(
                                app,
                                `确认从 EPUB 书架移除《${displayName}》吗？\n\n这不会删除库里的原始 EPUB 文件，但会清空这本书的阅读进度、书签、高亮和笔记缓存。之后重新打开该 EPUB 时，会按新导入处理。`,
                                {
                                        title: '确认移除书籍',
                                        confirmText: '移除',
                                        cancelText: '取消',
                                        confirmClass: 'mod-warning'
                                }
                        );
                        if (!confirmed) {
                                return;
                        }

                        try {
                                await storageService.removeBookFromBookshelf(filePath, { purgeCache: true });

                                if (epubActiveDocumentStore.getActiveDocument() === filePath) {
                                        epubActiveDocumentStore.clearActiveDocument(filePath);
                                }
                                closeOpenEpubLeaves(filePath);

                                removeInvalidFile(filePath);
                                new Notice(`已从书架移除《${displayName}》，之后可重新导入`);
                        } catch (error) {
                                logger.error('Failed to remove EPUB book from shelf:', error);
                                new Notice(`移除《${displayName}》失败`);
                        }
        }

        async function switchBook(filePath: string) {
                if (openingBookPath) return;
                openingBookPath = filePath;
                refreshRunId++;
                cancelScheduledCoverLoading();
                const file = app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile) || file.extension !== 'epub') {
                        removeInvalidFile(filePath);
                        await storageService.pruneMissingBooks();
                        new Notice('weave：这本书的源文件已不存在，已从书架移除');
                        openingBookPath = null;
                        return;
                }

                if (onSwitchBook) {
                        onClose();
                        window.setTimeout(() => {
                                void Promise.resolve(onSwitchBook(filePath)).finally(() => {
                                        openingBookPath = null;
                                });
                        }, 0);
                        return;
                }

                onClose();
                window.setTimeout(() => {
                        void openBookInNewTab(filePath).finally(() => {
                                openingBookPath = null;
                        });
                }, 0);
        }

        async function openBookInNewTab(filePath: string) {
                try {
                        const plugin = getWeavePlugin();
                        if (plugin && typeof plugin.openEpubReader === 'function') {
                                await plugin.openEpubReader(filePath);
                                return;
                        }

                        const leaf = app.workspace.getLeaf('tab');
                        if (!leaf) return;
                        await leaf.setViewState({
                                type: VIEW_TYPE_EPUB,
                                active: true,
                                state: { filePath }
                        });
                        app.workspace.revealLeaf(leaf);
                } catch (error) {
                        logger.error('Failed to open EPUB:', error);
                }
        }

        function handleContextMenu(e: MouseEvent, filePath: string) {
                e.preventDefault();
                const menu = new Menu();
                menu.addItem((item) => {
                        item.setTitle('在新标签页打开')
                                .setIcon('external-link')
                                .onClick(() => openBookInNewTab(filePath));
                });
                menu.addSeparator();
                menu.addItem((item) => {
                        item.setTitle('移除当前书籍')
                                .setIcon('trash')
                                .onClick(() => {
                                        void removeBookFromShelf(filePath);
                                });
                });
                menu.showAtMouseEvent(e);
        }

        function buildMetaText(file: EpubFileInfo, meta?: BookshelfBookMeta): string {
                const author = meta?.author || '';

                return author ? `${author} · ${formatSize(file.size)}` : formatSize(file.size);
        }

        let displayBooks = $derived.by(() => {
                return epubFiles
                        .map((file) => {
                                const meta = bookMetaByPath.get(file.path);
                                return {
                                        ...file,
                                        displayTitle: meta?.title || file.name || 'EPUB',
                                        metaText: buildMetaText(file, meta),
                                        progress: meta?.progress || 0,
                                        lastReadTime: meta?.lastReadTime || 0
                                } satisfies DisplayBookItem;
                        })
                        .sort((a, b) => {
                                const aRecent = a.lastReadTime > 0 ? 1 : 0;
                                const bRecent = b.lastReadTime > 0 ? 1 : 0;
                                if (aRecent !== bRecent) return bRecent - aRecent;
                                if (a.lastReadTime !== b.lastReadTime) return b.lastReadTime - a.lastReadTime;
                                return a.displayTitle.localeCompare(b.displayTitle, 'zh-CN');
                        });
        });

        let filteredFiles = $derived(
                searchQuery.trim()
                        ? displayBooks.filter((f) => {
                                const query = searchQuery.toLowerCase();
                                return f.displayTitle.toLowerCase().includes(query)
                                        || f.metaText.toLowerCase().includes(query)
                                        || f.name.toLowerCase().includes(query)
                                        || f.folder.toLowerCase().includes(query);
                        })
                        : displayBooks
        );

let lastHandledRefreshToken = untrack(() => refreshToken);
        let emptyStateMessage = $derived.by(() => {
                if (epubFiles.length > 0) {
                        return `未找到“${searchQuery}”的结果`;
                }
                return '当前书架中还没有 EPUB，先去扫描仓库并加入书架吧。';
        });

        function handleBookshelfSettingsChanged() {
                void loadBookshelfFromCache();
        }

        function handleBookshelfRefreshRequest() {
                void refreshBookshelf(true);
        }

        onMount(() => {
                void loadBookshelfFromCache();
                window.addEventListener(BOOKSHELF_DATA_CHANGED_EVENT, handleBookshelfSettingsChanged);
                window.addEventListener(BOOKSHELF_REFRESH_REQUEST_EVENT, handleBookshelfRefreshRequest);
                const renameRef = app.vault.on('rename', (file, oldPath) => {
                        handleVaultRename(file, oldPath);
                });
                const deleteRef = app.vault.on('delete', (file) => {
                        const deletedPath = normalizePath(file.path || '');
                        if (!deletedPath) return;
                        removeInvalidFile(deletedPath);
                });
                return () => {
                        app.vault.offref(renameRef);
                        app.vault.offref(deleteRef);
                };
        });

        onDestroy(() => {
                window.removeEventListener(BOOKSHELF_DATA_CHANGED_EVENT, handleBookshelfSettingsChanged);
                window.removeEventListener(BOOKSHELF_REFRESH_REQUEST_EVENT, handleBookshelfRefreshRequest);
        });

        $effect(() => {
                if (refreshToken === lastHandledRefreshToken) return;
                lastHandledRefreshToken = refreshToken;
                void refreshBookshelf();
        });

        $effect(() => {
                const runId = refreshRunId;
                const visibleFiles = filteredFiles;
                if (!loadingBooks && visibleFiles.length > 0) {
                        scheduleVisibleCoverLoading(visibleFiles, runId);
                }
        });
</script>

<div class="epub-bookshelf-header">
        <div class="epub-bookshelf-heading">
                <h3>书架</h3>
                <div class="epub-bookshelf-subtitle">{filteredFiles.length} 本书</div>
        </div>
        <div class="epub-bookshelf-actions">
                <button
                        type="button"
                        class="epub-toolbar-btn clickable-icon view-action"
                        title={searching ? '关闭搜索' : '搜索'}
                        aria-label={searching ? '关闭搜索' : '搜索'}
                        onclick={() => { searching = !searching; if (!searching) searchQuery = ''; }}
                >
                        <span use:icon={searching ? 'x' : 'search'}></span>
                </button>
                <button
                        type="button"
                        class="epub-toolbar-btn clickable-icon view-action"
                        title="返回"
                        aria-label="返回"
                        onclick={() => onClose()}
                >
                        <span use:icon={'arrow-left'}></span>
                </button>
                {#if onSettingsClick}
                        <button
                                type="button"
                                class="epub-toolbar-btn clickable-icon view-action"
                                title="设置"
                                aria-label="设置"
                                onclick={(event: MouseEvent) => onSettingsClick?.(event)}
                        >
                                <span use:icon={'settings'}></span>
                        </button>
                {/if}
        </div>
</div>

<style>
        .epub-bookshelf-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
                padding: 20px 18px 8px;
        }

        .epub-bookshelf-heading h3 {
                margin: 0;
                font-size: 24px;
                font-weight: 700;
                letter-spacing: -0.02em;
                color: var(--text-normal);
                line-height: 1.15;
        }

        .epub-bookshelf-subtitle {
                margin-top: 6px;
                font-size: 12px;
                color: var(--text-muted);
                line-height: 1.4;
        }

        .epub-bookshelf-actions {
                display: flex;
                align-items: center;
                gap: 8px;
        }

        .epub-toolbar-btn {
                width: var(--clickable-icon-size, 32px);
                height: var(--clickable-icon-size, 32px);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: none;
                border-radius: var(--clickable-icon-radius, 4px);
                background: transparent;
                color: var(--text-muted);
                box-shadow: none;
                transition: background-color 0.14s ease, color 0.14s ease;
        }

        .epub-toolbar-btn:hover {
                color: var(--text-normal);
        }

        .epub-toolbar-btn :global(.svg-icon) {
                width: 16px;
                height: 16px;
        }

        .epub-bookshelf-search {
                padding: 8px 18px 4px;
        }

        .epub-bookshelf-search input {
                width: 100%;
                height: 40px;
                padding: 0 14px;
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 76%, transparent);
                border-radius: 14px;
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 96%, transparent);
                color: var(--text-normal);
                font-size: 13px;
                box-sizing: border-box;
                outline: none;
                transition: border-color 0.14s ease, box-shadow 0.14s ease;
        }

        .epub-bookshelf-search input:focus {
                border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
                box-shadow: 0 0 0 3px rgba(var(--interactive-accent-rgb), 0.08);
        }

        .epub-bookshelf-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
                padding: 10px 14px 22px;
        }

        .epub-placeholder {
                padding: 28px 18px;
                border-radius: 18px;
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-secondary)) 88%, transparent);
                color: var(--text-muted);
                font-size: 13px;
                line-height: 1.7;
                text-align: center;
        }

        .epub-book-item {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 12px;
                border-radius: 18px;
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 68%, transparent);
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 97%, transparent);
                box-shadow: 0 8px 18px rgba(0, 0, 0, 0.035);
                transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease, background 0.14s ease;
        }

        .epub-book-item.is-opening {
                opacity: 0.68;
                pointer-events: none;
        }

        .epub-book-item:hover,
        .epub-book-item:focus-visible {
                transform: translateY(-1px);
                border-color: color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 100%, transparent);
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.05);
                outline: none;
        }

        .book-thumb,
        .book-thumb-placeholder {
                width: 56px;
                height: 78px;
                border-radius: 12px;
                flex: 0 0 56px;
                overflow: hidden;
                background: color-mix(in srgb, var(--weave-surface-background, var(--background-secondary)) 92%, transparent);
                border: 1px solid color-mix(in srgb, var(--background-modifier-border) 56%, transparent);
        }

        .book-thumb {
                object-fit: cover;
                display: block;
        }

        .book-thumb-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-faint);
        }

        .book-thumb-placeholder :global(.svg-icon) {
                width: 20px;
                height: 20px;
        }

        .book-info {
                min-width: 0;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 6px;
        }

        .book-name {
                font-size: 15px;
                font-weight: 600;
                line-height: 1.42;
                color: var(--text-normal);
                display: -webkit-box;
                -webkit-line-clamp: 2;
                line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                word-break: break-word;
        }

        .book-meta-text {
                font-size: 12px;
                line-height: 1.45;
                color: var(--text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
        }

        .book-progress-badge {
                --book-progress: 0%;
                width: 52px;
                height: 52px;
                flex: 0 0 52px;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                position: relative;
                color: var(--text-normal);
                font-size: 11px;
                font-weight: 700;
                letter-spacing: -0.02em;
                background:
                        radial-gradient(circle at center, color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 96%, transparent) 60%, transparent 61%),
                        conic-gradient(
                                from -90deg,
                                color-mix(in srgb, var(--interactive-accent) 82%, white 8%) 0 var(--book-progress),
                                color-mix(in srgb, var(--background-modifier-border) 78%, transparent) var(--book-progress) 100%
                        );
                box-shadow:
                        inset 0 0 0 1px color-mix(in srgb, var(--background-modifier-border) 72%, transparent),
                        0 10px 18px rgba(0, 0, 0, 0.06);
        }

        .book-progress-badge::after {
                content: '';
                position: absolute;
                inset: 6px;
                border-radius: 50%;
                background: color-mix(in srgb, var(--weave-elevated-background, var(--background-primary)) 98%, transparent);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--background-modifier-border) 56%, transparent);
        }

        .book-progress-badge span {
                position: relative;
                z-index: 1;
                line-height: 1;
        }

        @container (max-width: 360px) {
                .epub-book-item {
                        gap: 12px;
                        padding: 11px;
                }

                .book-progress-badge {
                        width: 46px;
                        height: 46px;
                        flex-basis: 46px;
                        font-size: 10px;
                }

                .book-progress-badge::after {
                        inset: 5px;
                }
        }
</style>

{#if searching}
        <div class="epub-bookshelf-search">
                <input
                        type="text"
                        placeholder="搜索书籍..."
                        bind:value={searchQuery}
                />
        </div>
{/if}

<div class="epub-bookshelf-list">
        {#if loadingBooks && epubFiles.length === 0}
                <div class="epub-placeholder">正在刷新书架...</div>
        {:else if filteredFiles.length === 0}
                <div class="epub-placeholder">
                        {emptyStateMessage}
                </div>
        {:else}
                {#each filteredFiles as file (file.path)}
                        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                        <div
                                class="epub-book-item"
                                class:is-opening={openingBookPath === file.path}
                                onclick={() => switchBook(file.path)}
                                oncontextmenu={(e) => handleContextMenu(e, file.path)}
                                onkeydown={(event) => handleBookKeydown(event, file.path)}
                                role="button"
                                tabindex="0"
                        >
                                {#if covers.get(file.path)}
                                        <img src={covers.get(file.path)} alt="" class="book-thumb" />
                                {:else}
                                        <div class="book-thumb-placeholder">
                                                <span use:icon={'book-text'}></span>
                                        </div>
                                {/if}
                                <div class="book-info">
                                        <div class="book-name">{file.displayTitle}</div>
                                        <div class="book-meta-text">{file.metaText}</div>
                                </div>
                                <div
                                        class="book-progress-badge"
                                        style={`--book-progress:${clampProgress(file.progress)}%;`}
                                        role="img"
                                        aria-label={`阅读进度 ${clampProgress(file.progress)}%`}
                                        title={`阅读进度 ${clampProgress(file.progress)}%`}
                                >
                                        <span>{clampProgress(file.progress)}%</span>
                                </div>
                        </div>
                {/each}
        {/if}
</div>
