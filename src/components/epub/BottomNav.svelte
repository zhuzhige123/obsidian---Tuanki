<script lang="ts">
	import { setIcon } from 'obsidian';

	interface Props {
		onPrev: () => void;
		onNext: () => void;
		currentPage?: number;
		totalPages?: number;
		vertical?: boolean;
		statusText?: string;
	}

	let {
		onPrev,
		onNext,
		currentPage = 0,
		totalPages = 0,
		vertical = false,
		statusText = '',
	}: Props = $props();

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

	function hasPageInfo() {
		return currentPage > 0 && totalPages > 0;
	}

	function hasStatusText() {
		return statusText.trim().length > 0;
	}

	function getPrevLabel() {
		return vertical ? '上一屏' : '上一页';
	}

	function getNextLabel() {
		return vertical ? '下一屏' : '下一页';
	}
</script>

<div class="epub-bottom-nav" class:vertical>
	<button
		class="epub-nav-btn"
		class:vertical
		type="button"
		title={getPrevLabel()}
		aria-label={getPrevLabel()}
		onclick={onPrev}
	>
		<span class="epub-nav-btn-icon" use:icon={vertical ? 'arrow-up' : 'arrow-left'}></span>
		{#if !vertical}
			<span class="epub-nav-btn-label">{getPrevLabel()}</span>
		{/if}
	</button>

	<div class="epub-nav-status" class:vertical aria-live="polite">
		{#if hasStatusText()}
			<span class="epub-nav-status-label epub-nav-status-custom">{statusText}</span>
		{:else if hasPageInfo()}
			{#if vertical}
				<span class="epub-nav-status-current">{currentPage}</span>
				<span class="epub-nav-status-divider"></span>
				<span class="epub-nav-status-total">{totalPages}</span>
			{:else}
				<span class="epub-nav-status-label">第 {currentPage} / {totalPages} 页</span>
			{/if}
		{:else}
			<span class="epub-nav-status-label">定位中...</span>
		{/if}
	</div>

	<button
		class="epub-nav-btn"
		class:vertical
		type="button"
		title={getNextLabel()}
		aria-label={getNextLabel()}
		onclick={onNext}
	>
		<span class="epub-nav-btn-icon" use:icon={vertical ? 'arrow-down' : 'arrow-right'}></span>
		{#if !vertical}
			<span class="epub-nav-btn-label">{getNextLabel()}</span>
		{/if}
	</button>
</div>

<style>
	.epub-bottom-nav.vertical {
		top: 50%;
		right: var(
			--epub-scrolled-side-nav-inline-offset,
			var(--epub-scrolled-side-nav-gap, 16px)
		);
		left: auto;
		bottom: auto;
		transform: translateY(-50%);
		width: var(--epub-scrolled-side-nav-width, 58px);
		max-width: none;
		padding: 8px 7px 9px;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 7px;
		border-radius: 22px;
		background: var(--epub-bg-glass);
		border: 1px solid var(--epub-border);
		box-shadow:
			0 10px 24px rgba(0, 0, 0, 0.12),
			0 1px 0 rgba(255, 255, 255, 0.04) inset;
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}

	.epub-nav-btn.vertical {
		width: 40px;
		min-width: 40px;
		height: 40px;
		padding: 0;
		justify-content: center;
		gap: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--epub-text-muted);
		box-shadow: none;
		transition:
			background-color var(--epub-transition-fast),
			color var(--epub-transition-fast),
			transform var(--epub-transition-fast);
	}

	.epub-nav-btn.vertical:hover {
		background: rgba(255, 255, 255, 0.05);
		color: var(--epub-text);
	}

	.epub-nav-btn.vertical:active {
		transform: scale(0.97);
	}

	.epub-nav-btn.vertical:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.epub-nav-btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.epub-nav-btn.vertical .epub-nav-btn-icon :global(.svg-icon) {
		width: 15px;
		height: 15px;
	}

	.epub-nav-status {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 112px;
		padding: 4px 14px;
		border-radius: 16px;
		background: var(--epub-bg-paper);
		color: var(--epub-text-muted);
		font-size: 12px;
		line-height: 1.2;
		white-space: nowrap;
	}

	.epub-nav-status.vertical {
		width: 40px;
		min-width: 40px;
		padding: 6px 0 5px;
		flex-direction: column;
		gap: 4px;
		border-radius: 12px;
		border: 1px solid var(--epub-border);
		background: var(--epub-bg-paper);
		color: var(--epub-text-faint);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.04),
			0 1px 2px rgba(0, 0, 0, 0.08);
	}

	.epub-nav-status-label,
	.epub-nav-status-current,
	.epub-nav-status-total {
		font-variant-numeric: tabular-nums;
	}

	.epub-nav-status-label {
		line-height: 1.2;
	}

	.epub-nav-status-custom {
		font-size: 12px;
		line-height: 1.1;
		font-weight: 600;
		color: var(--epub-text);
	}

	.epub-nav-status.vertical .epub-nav-status-label {
		font-size: 9px;
		line-height: 1.15;
	}

	.epub-nav-status.vertical .epub-nav-status-custom {
		font-size: 10px;
		line-height: 1.1;
	}

	.epub-nav-status-current {
		color: var(--epub-text);
		font-size: 14px;
		line-height: 1;
		font-weight: 700;
	}

	.epub-nav-status-total {
		font-size: 9px;
		line-height: 1;
		letter-spacing: 0.02em;
	}

	.epub-nav-status-divider {
		width: 14px;
		height: 1px;
		background: var(--epub-border);
		opacity: 0.7;
	}
</style>
