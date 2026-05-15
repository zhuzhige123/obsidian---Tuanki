<script lang="ts">
	import { setIcon, Platform } from 'obsidian';
	import { onMount, tick } from 'svelte';
	import type { HighlightClickInfo } from '../../services/epub';
	import { computeToolbarPosition, createEventBinder, isEventOutsideToolbar } from './toolbar-positioning';

	interface Props {
		info: HighlightClickInfo | null;
		onDelete: (info: HighlightClickInfo) => void;
		onTemporarilyReveal: (info: HighlightClickInfo) => void;
		onChangeColor: (info: HighlightClickInfo, newColor: string) => void;
		onChangeStyle: (info: HighlightClickInfo, newStyle?: HighlightClickInfo['style']) => void;
		onBacklink: (info: HighlightClickInfo) => void;
		onExtractToCard: (info: HighlightClickInfo) => void;
		onCopyText: (info: HighlightClickInfo) => void;
		onDismiss: () => void;
	}

	let { info, onDelete, onTemporarilyReveal, onChangeColor, onChangeStyle, onBacklink, onExtractToCard, onCopyText, onDismiss }: Props = $props();

	let toolbarEl: HTMLDivElement | undefined = $state(undefined);
	let posTop = $state(0);
	let posLeft = $state(0);
	let isBelowTarget = $state(false);
	let toolbarMode = $state<'floating' | 'docked'>('floating');
	let arrowOffset = $state(0);
	let teardownViewportTracking: (() => void) | null = null;

	const colors = ['yellow', 'blue', 'red', 'purple', 'green'] as const;
	const colorLabels: Record<(typeof colors)[number], string> = {
		yellow: '黄色',
		blue: '蓝色',
		red: '红色',
		purple: '紫色',
		green: '绿色'
	};
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

	function stopViewportTracking() {
		teardownViewportTracking?.();
		teardownViewportTracking = null;
	}

	function startViewportTracking() {
		if (!toolbarEl || teardownViewportTracking) return;

		const viewportEl = toolbarEl.closest('.epub-reader-viewport') as HTMLElement | null;
		const scrollHost = toolbarEl.closest('.epub-reader-viewport')?.querySelector('.epub-content-wrapper') as HTMLElement | null;
		const visualViewport = window.visualViewport;
		const dismiss = () => onDismiss();
		const binder = createEventBinder();

		binder.bind(scrollHost, 'scroll', dismiss, { passive: true });
		binder.bind(viewportEl, 'scroll', dismiss, { passive: true });
		binder.bind(window, 'resize', dismiss);
		binder.bind(window, 'orientationchange', dismiss);
		binder.bind(visualViewport, 'resize', dismiss);
		binder.bind(visualViewport, 'scroll', dismiss);

		teardownViewportTracking = () => {
			binder.dispose();
		};
	}

	async function positionToolbar() {
		if (!info) {
			stopViewportTracking();
			toolbarMode = 'floating';
			arrowOffset = 0;
			return;
		}

		await tick();
		if (!toolbarEl) return;

		const viewportEl = toolbarEl.closest('.epub-reader-viewport') as HTMLElement | null;
		if (!viewportEl) return;

		startViewportTracking();
		const position = computeToolbarPosition({
			anchorRect: info.rect,
			containerWidth: viewportEl.clientWidth,
			containerHeight: viewportEl.clientHeight,
			toolbarWidth: toolbarEl.offsetWidth || 296,
			toolbarHeight: toolbarEl.offsetHeight || 78,
			mobile: isMobileToolbar,
		});

		toolbarMode = position.mode;
		posTop = position.top;
		posLeft = position.left;
		isBelowTarget = position.isBelowAnchor;
		arrowOffset = position.arrowOffset;
	}

	function handleClickOutside(e: Event) {
		if (info && isEventOutsideToolbar(toolbarEl, e)) {
			onDismiss();
		}
	}

	function handleStyleToggle(targetInfo: HighlightClickInfo, nextStyle: HighlightClickInfo['style']) {
		onChangeStyle(targetInfo, targetInfo.style === nextStyle ? undefined : nextStyle);
	}

	$effect(() => {
		const _info = info;
		if (info) {
			void positionToolbar();
		} else {
			stopViewportTracking();
			toolbarMode = 'floating';
			arrowOffset = 0;
		}

		return () => {
			if (!info) {
				stopViewportTracking();
			}
		};
	});

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('touchstart', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('touchstart', handleClickOutside);
			stopViewportTracking();
		};
	});
</script>

<div
	class="epub-highlight-toolbar epub-glass-panel"
	class:visible={info !== null}
	class:below-target={isBelowTarget}
	class:mobile-docked={toolbarMode === 'docked'}
	style={`top: ${posTop}px; left: ${posLeft}px; --toolbar-arrow-offset: ${arrowOffset}px;`}
	bind:this={toolbarEl}
>
	{#if info}
		{#if info.presentation === 'conceal'}
			<div class="highlight-main-row">
				<div class="highlight-actions-shell">
					<div class="toolbar-row actions-row highlight-actions-row concealment-actions">
						<button class="action-item" onclick={() => onTemporarilyReveal(info)} title="暂时显示隐藏文本">
							<span class="action-icon" use:icon={'eye'}></span>
							<span class="action-label">暂显</span>
						</button>
						<button class="action-item" onclick={() => onCopyText(info)} title="复制隐藏文本">
							<span class="action-icon" use:icon={'clipboard-copy'}></span>
							<span class="action-label">复制</span>
						</button>
						<button class="action-item accent concealment-reset" onclick={() => onDelete(info)} title="恢复文本显示">
							<span class="action-icon" use:icon={'eye'}></span>
							<span class="action-label">恢复</span>
						</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="highlight-main-row">
				<div class="highlight-top-row">
					<div class="toolbar-row colors-row highlight-color-row highlight-primary-row">
						{#each colors as c}
							<button
								class="color-btn {c}"
								class:active={c === info.color}
								onclick={() => onChangeColor(info, c)}
								title={`切换为${colorLabels[c]}`}
								aria-label={`切换为${colorLabels[c]}颜色`}
							>
								<span class="color-btn-core"></span>
							</button>
						{/each}
					</div>

					<div class="highlight-style-shell">
						<div class="toolbar-row highlight-style-row">
							<button class="action-item icon-only style-action-item" class:accent={info.style === 'underline'} onclick={() => handleStyleToggle(info, 'underline')} title="下划线" aria-label="下划线">
								<span class="action-icon style-icon underline-style-icon" use:icon={'underline'}></span>
							</button>
							<button class="action-item icon-only style-action-item" class:accent={info.style === 'strikethrough'} onclick={() => handleStyleToggle(info, 'strikethrough')} title="删除线" aria-label="删除线">
								<span class="action-icon style-icon strikethrough-style-icon" use:icon={'strikethrough'}></span>
							</button>
							<button class="action-item icon-only style-action-item" class:accent={info.style === 'wavy'} onclick={() => handleStyleToggle(info, 'wavy')} title="波浪线" aria-label="波浪线">
								<span class="action-icon style-icon wavy-style-icon" use:icon={'pen-tool'}></span>
							</button>
						</div>
					</div>
				</div>

				<div class="highlight-actions-shell">
					<div class="toolbar-row actions-row highlight-actions-row">
						<button class="action-item highlight-type-action" class:accent={!info.style} onclick={() => onChangeStyle(info, undefined)} title="切换为高亮" aria-label="切换为高亮">
							<span class="action-icon highlight-style-icon" use:icon={'highlighter'}></span>
							<span class="action-label">高亮</span>
						</button>
						<button class="action-item backlink-action" onclick={() => onBacklink(info)} title="跳转到笔记">
							<span class="action-icon" use:icon={'external-link'}></span>
							<span class="action-label">笔记</span>
						</button>
						<button class="action-item accent extract-action" onclick={() => onExtractToCard(info)} title="摘录为记忆卡片" aria-label="摘录为记忆卡片">
							<span class="action-icon" use:icon={'scissors'}></span>
							<span class="action-label">制卡</span>
						</button>
						<button class="action-item copy-action" onclick={() => onCopyText(info)} title="复制文本">
							<span class="action-icon" use:icon={'clipboard-copy'}></span>
							<span class="action-label">复制</span>
						</button>
						<div class="row-divider"></div>
						<button class="action-item delete delete-action" onclick={() => onDelete(info)} title="删除高亮">
							<span class="action-icon" use:icon={'trash-2'}></span>
							<span class="action-label">删除</span>
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<div class="toolbar-arrow"></div>
</div>
